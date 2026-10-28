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
    const empty = (text, o) => A().empty(text, o);
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
        app: ['🔗', 'Venant du logiciel', 'Une fiche, un bloc d’une fiche, la fiche d’un village, une liste, un recueil, une enquête…'],
    };
    const TYPE_PLURALS = {reference: 'Références', note: 'Notes', quote: 'Citations', media: 'Images et documents', person: 'Personnes', place: 'Lieux', event: 'Dates, événements', link: 'Liens internet', task: 'Tâches', draft: 'Brouillons', app: 'Venant du logiciel'};
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

    /* ─────────── Réglages (Réglages → Atelier de recherche) : menu, sortes d'éléments, dossiers, plans ─────────── */
    const CFG_KEY = 'genealogie-atelier-config'; // copié tout seul dans la base (lib/settings.php)
    const NAV_BUILTIN = [['overview', '📊', 'Vue d’ensemble'], ['all', '🗂️', 'Tout le projet'], ['starred', '⭐', 'Favoris'], ['unfiled', '📥', 'Non classés'], ['tasks', '✅', 'Tâches'], ['timeline', '🕰️', 'Chronologie'], ['people', '👥', 'Personnes'], ['map', '🗺️', 'Carte'], ['biblio', '📚', 'Bibliographie'], ['widgets', '🧩', 'Widgets'], ['trash', '🗑️', 'Corbeille']];
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
    // les autres écrans (tableau, calendrier, recueil…) ouvrent l'Atelier avec seulement {project, sel} : on complète avec les valeurs de départ
    const ATELIER_DEF = () => ({project: 0, node: 'overview', sel: [], tags: [], q: '', type: '', sort: {col: 'title', dir: 1}, closed: {}});
    const st = () => {
        const s = S(), a = s.atelier && typeof s.atelier === 'object' ? s.atelier : (s.atelier = {}), d = ATELIER_DEF();
        for (const k of Object.keys(d)) {
            const want = d[k], have = a[k];
            if (have === undefined || have === null || (Array.isArray(want) ? !Array.isArray(have) : typeof want === 'object' ? typeof have !== 'object' || Array.isArray(have) : false)) a[k] = want;
        }
        return a;
    };
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
                mergeImportedTypes(file.text);
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
        // filtre de la colonne de gauche : tous, en cours, en pause, terminés (« archivé » d'avant = terminé)
        const stOf = p => p.status === 'archived' ? 'done' : (p.status || 'active');
        const projects = (data.projects || []).filter(p => !S().atelierStatus || S().atelierStatus === 'all' || stOf(p) === S().atelierStatus);
        const ws = A().$('#workspace');
        const card = p => { const words = Number(p.words), target = Number(p.target_words);
            const days = p.deadline ? Math.ceil((new Date(p.deadline + 'T12:00:00') - new Date()) / 864e5) : null;
            return `<article class="h-at-project ${['archived', 'done'].includes(p.status) ? 'is-archived' : p.status === 'paused' ? 'is-paused' : ''}" style="--at-color:${esc(p.color)}" data-at-open="${p.id}" tabindex="0">
                <div class="h-at-project-icon">${esc(p.icon || KIND_ICONS[p.kind] || '📚')}</div><div class="h-at-project-body"><span class="eyebrow">${esc(data.kinds[p.kind] || '')}${['archived', 'done'].includes(p.status) ? ' · terminé' : p.status === 'paused' ? ' · en pause' : ''}</span><h3>${esc(p.title)}</h3>${p.subtitle ? `<p class="muted">${esc(p.subtitle)}</p>` : ''}
                <p class="h-at-project-stats">${plural(Number(p.item_count), 'élément', 'éléments')} · ${plural(Number(p.folder_count), 'dossier', 'dossiers')}${Number(p.open_tasks) ? ` · ${plural(Number(p.open_tasks), 'tâche', 'tâches')} à faire` : ''}</p>
                ${target ? `<div class="h-at-words"><div class="h-progress"><span style="width:${Math.min(100, Math.round(100 * words / target))}%"></span></div><small>${fmt(words)} mots sur ${fmt(target)}</small></div>` : words ? `<small>${fmt(words)} mots écrits</small>` : ''}
                ${days !== null ? `<small class="${days < 0 ? 'h-at-late' : ''}">${days < 0 ? `échéance dépassée de ${plural(-days, 'jour', 'jours')}` : `rendu dans ${plural(days, 'jour', 'jours')}`}</small>` : ''}</div></article>`; };
        ws.innerHTML = `<section class="page collection-page h-at">${`<header class="page-header"><div><span class="eyebrow">ENQUÊTES</span><h2>📚 Atelier de recherche</h2><p>Pour écrire une thèse, un livre, un article ou préparer une exposition : un projet, ses dossiers et sous-dossiers sans limite (parties, chapitres, sources…), et tout ce que tu y ranges — références, archives, gravures, citations, notes, personnes de ta base, lieux, dates, tâches, brouillons. Bibliographie toute prête, chronologie, carte.</p></div><div class="page-actions"><button type="button" class="button" data-at-new>＋ Projet</button><button type="button" class="button secondary" data-at-importproject>⤒ Importer un projet (Zotero…)</button><button type="button" class="button secondary" data-at-settings title="Réglages → Atelier de recherche">⚙️ Réglages</button></div></header>`}
            ${projects.length ? `<div class="h-at-projects">${projects.map(card).join('')}</div>` : A().emptyState({icon: '🔬', text: 'Aucun projet pour l’instant', hint: 'Par exemple « Les montreurs de vues d’optique, XVIIIe-XIXe siècles ».', action: {label: '＋ Projet', attrs: 'data-at-new'}})}</section>`;
        ws.querySelectorAll('[data-at-new]').forEach(b => b.addEventListener('click', () => projectDialog(null, data.kinds)));
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
<label>État<select name="status">${[['active', 'En cours'], ['paused', 'En pause'], ['done', 'Terminé']].map(([k, l]) => `<option value="${k}" ${(p.status === 'archived' ? 'done' : p.status || 'active') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="span-2">Problématique, présentation<textarea name="description" rows="4" placeholder="Qui étaient les montreurs d’optique ? D’où venaient-ils, quelles images montraient-ils, à quels publics ?">${esc(p.description || '')}</textarea></label></div>
                ${isNew ? `<h4>Plan de départ</h4><p class="muted">Des dossiers déjà prêts, que tu pourras renommer, déplacer, compléter ou supprimer.</p><div class="h-at-plans">${CFG.plans.filter(x => !x.hidden).map((x, i, arr) => `<label class="h-at-plan"><input type="radio" name="plan" value="${esc(x.key)}" ${i === 0 ? 'checked' : ''}><strong>${esc(x.label)}</strong>${x.tree?.length ? planTree(x.tree) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🗂️</span><span class="empty-line-text">Aucun dossier</span></p>'}</label>`).join('')}</div><p class="muted"><button type="button" class="link-button" data-at-settings-plans>⚙️ Créer mes plans, les ranger, en masquer…</button></p>` : ''}`,
            onOpen: dl => { dl.querySelector('[name=kind]').addEventListener('change', e => { const r = dl.querySelector(`[name=plan][value="${e.target.value}"]`); if (r) r.checked = true; });
                dl.querySelector('[data-at-settings-plans]')?.addEventListener('click', () => { dl.close(); openSettings(); }); },
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form));
                const body = {id: p.id || 0, title: f.title, subtitle: f.subtitle, kind: f.kind, icon: f.icon, color: f.color, description: f.description, target_words: Number(f.target_words) || 0, deadline: f.deadline, status: f.status || 'active'};
                if (isNew) body.folders = CFG.plans.find(x => x.key === f.plan)?.tree || [];
                const r = await post('save_atelier_project', body);
                if (isNew) Object.assign(st(), {project: r.result.id, node: firstNode(), sel: [], tags: [], q: '', type: ''});
                toast(isNew ? 'Projet créé.' : 'Projet enregistré.');
                ext.atelier(++S().workspaceToken);
            },
            onDelete: isNew ? null : async () => {
                if (!await A().confirmBox(`Supprimer « ${p.title} » avec tous ses dossiers et ses ${plural(P?.items.length || 0, 'élément', 'éléments')} ? C’est définitif.`, {title: 'Supprimer le projet', okLabel: 'Supprimer le projet'})) return false;
                await post('delete_atelier_project', {id: p.id}); st().project = 0; toast('Projet supprimé.'); ext.atelier(++S().workspaceToken);
            },
        });
    }

    /* ═══════════ Un projet ouvert : dossiers | éléments | détail ═══════════ */
    const SPECIAL_VIEWS = ['overview', 'timeline', 'people', 'map', 'biblio', 'tasks', 'widgets'];
    /** Les widgets d'un projet : dans leur page « 🧩 Widgets », et (au choix) aussi dans la vue d'ensemble. */
    const OV_KEY = 'genealogie-atelier-widgets-ov';
    const widgetsInOverview = pid => { try { return (JSON.parse(localStorage.getItem(OV_KEY) || '{}') || {})[pid] !== false; } catch (_) { return true; } };
    const setWidgetsInOverview = (pid, on) => { try { const o = JSON.parse(localStorage.getItem(OV_KEY) || '{}') || {}; o[pid] = !!on; localStorage.setItem(OV_KEY, JSON.stringify(o)); } catch (_) {} };
    const widgetsBox = p => `<div class="h-atw-box" data-atw-project="${p.id}"></div>${(setTimeout(() => ext.atelierWidgets?.(document.querySelector(`[data-atw-project="${p.id}"]`), {project: P.project, items: live(), openItem: id => { st().sel = [id]; renderProject(S().workspaceToken); }}), 0), '')}`;
    const reload = async (keepScroll = true) => { const v = st(), pid = v.project; await load(pid); if (S().module !== 'enquetes' || S().enquetesTab !== 'atelier' || st().project !== pid) return; renderProject(S().workspaceToken, keepScroll); };
    /* Vue à soi (Réglages → Atelier) : des critères ajoutés un par un, dans l'ordre voulu, chacun inversable (« pas »), ET / OU */
    const VIEW_RULES = {
        type: ['🧩', 'Sorte d’élément'], kind: ['📚', 'Sorte de référence'], tags: ['🏷️', 'Étiquettes'], starred: ['⭐', 'En favori'], read: ['📖', 'Lecture'],
        todo: ['✅', 'Tâche pas encore faite'], late: ['⏰', 'Tâche en retard'], priority: ['🔴', 'Priorité de tâche'], stage: ['✍️', 'Avancement du brouillon'],
        text: ['🔤', 'Texte contenu'], author: ['✒️', 'Auteur, créateur'], years: ['📅', 'Années'], folder: ['📁', 'Dans un dossier'], unfiled: ['📥', 'Rangé nulle part'],
        files: ['📎', 'Avec fichiers joints'], notes: ['📝', 'Avec des notes'], related: ['🔗', 'Relié à d’autres éléments'], recent: ['🕘', 'Ajouté ces derniers jours'],
    };
    const legacyRules = f => [ // vues faites avant le constructeur de critères
        f.types?.length && {kind: 'type', values: f.types}, f.tags?.length && {kind: 'tags', values: f.tags, mode: f.tagMode}, f.starred && {kind: 'starred'}, f.read && {kind: 'read', value: f.read},
        f.todo && {kind: 'todo'}, f.text && {kind: 'text', value: f.text}, (f.from || f.to) && {kind: 'years', from: f.from, to: f.to}, f.folder && {kind: 'folder', value: f.folder}].filter(Boolean);
    const viewRules = f => Array.isArray(f?.rules) ? f.rules : legacyRules(f || {});
    function ruleMatch(r, i) {
        const lower = x => String(x || '').toLowerCase(), d = i.data || {};
        switch (r.kind) {
            case 'type': return !(r.values || []).length || r.values.includes(tkey(i));
            case 'kind': return i.type === 'reference' && (!r.value || d.kind === r.value);
            case 'tags': { const want = r.values || []; if (!want.length) return (i.tags || []).length > 0; return r.mode === 'any' ? want.some(t => (i.tags || []).includes(t)) : want.every(t => (i.tags || []).includes(t)); }
            case 'starred': return !!Number(i.starred);
            case 'read': return i.type === 'reference' && (d.read || '') === (r.value || '');
            case 'todo': return i.type === 'task' && !Number(d.done);
            case 'late': return i.type === 'task' && !Number(d.done) && !!d.due && d.due < todayIso();
            case 'priority': return i.type === 'task' && (d.priority || 'normale') === (r.value || 'haute');
            case 'stage': return i.type === 'draft' && (d.stage || 'idee') === (r.value || 'idee');
            case 'text': return !r.value || lower([i.title, JSON.stringify(d), (i.tags || []).join(' ')].join(' ')).includes(lower(r.value));
            case 'author': return !r.value || lower([...(d.creators || []).map(c => `${c.first} ${c.last}`), d.creator, d.name].join(' ')).includes(lower(r.value));
            case 'years': { const y = Number(dateKey(i).slice(0, 4)); return !!y && (!r.from || y >= Number(r.from)) && (!r.to || y <= Number(r.to)); }
            case 'folder': { const want = lower(r.value); if (!want) return i.folders.length > 0; const ok = new Set(P.folders.filter(x => lower(x.name).includes(want)).flatMap(x => descendants(Number(x.id)))); return i.folders.some(x => ok.has(x)); }
            case 'unfiled': return !i.folders.length;
            case 'files': return (i.media || []).length > 0;
            case 'notes': return !!String(d.notes || '').trim();
            case 'related': return (d.related || []).length > 0;
            case 'recent': { const days = Number(r.value) || 7; const t = Date.parse(String(i.created_at).replace(' ', 'T') + 'Z'); return !isNaN(t) && Date.now() - t <= days * 864e5; }
            default: return true;
        }
    }
    function viewFilter(f, items) {
        const rules = viewRules(f).filter(r => VIEW_RULES[r.kind]);
        if (!rules.length) return items;
        return items.filter(i => { const res = rules.map(r => ruleMatch(r, i) !== !!r.not); return f.match === 'any' ? res.some(Boolean) : res.every(Boolean); });
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
                <span class="h-at-head-actions"><button type="button" class="button small secondary" data-at-export>Exporter…</button><button type="button" class="button small secondary" data-at-pedit>Projet…</button><button type="button" class="button small secondary" data-at-settings title="Réglages de l’Atelier (Réglages)">⚙</button></span></header>
            <div class="h-at-grid ${v.node === 'widgets' && !v.sel.length ? 'is-wide' : ''}">
                <aside class="h-at-tree" data-at-scroll>
                    <ul class="h-at-special">${CFG.nav.filter(x => !x.hidden || x.key === v.node).map(({key: k, icon, label}) => { const c = k === 'all' ? live().length : k === 'trash' ? P.items.length - live().length : k === 'starred' ? live().filter(i => Number(i.starred)).length : k === 'unfiled' ? live().filter(i => !i.folders.length).length : k === 'tasks' ? live().filter(i => i.type === 'task' && !Number(i.data.done)).length : k.startsWith('v_') ? nodeItemsCount(k) : 0;
                        return `<li><div class="h-at-row ${v.node === k ? 'is-on' : ''}" data-at-go="${esc(k)}" ${k === 'trash' || k === 'all' || k === 'starred' || k === 'unfiled' ? `data-at-drop="${k}"` : ''}><span class="h-at-ficon">${esc(icon)}</span><span class="h-at-fname">${esc(label)}</span>${c ? `<small class="h-at-count">${fmt(c)}</small>` : ''}</div></li>`; }).join('')}</ul>
                    <div class="h-at-tree-head" data-at-drop="root"><span>Dossiers</span><button type="button" class="icon-button" data-at-fadd="0" title="Nouveau dossier">＋</button></div>
                    <ul class="h-at-folders">${kids(0).map(folderNode).join('') || '<li class="empty-line h-at-none"><span class="empty-line-ico" aria-hidden="true">🗂️</span><span class="empty-line-text">Aucun dossier</span><button type="button" class="button small secondary" data-empty-click="[data-at-fadd=&quot;0&quot;]">＋ Nouveau dossier</button></li>'}</ul>
                    ${tags.length ? `<div class="h-at-tags"><input type="search" data-at-tagq placeholder="Filtrer les étiquettes"><div class="h-at-tagcloud">${tags.map(([t, c]) => `<button type="button" class="h-at-tag ${v.tags.includes(t) ? 'is-on' : ''}" data-at-tag="${esc(t)}" title="${fmt(c)}">${esc(t)}</button>`).join('')}</div>${v.tags.length ? '<button type="button" class="link-button" data-at-tagclear>Toutes les étiquettes</button>' : ''}</div>` : ''}
                </aside>
                <main class="h-at-main" data-at-scroll>${special ? specialView(v.node) : listView()}</main>
                <aside class="h-at-detail" data-at-scroll>${detailView()}</aside>
            </div></section>`;
        if (keepScroll) ws.querySelectorAll('[data-at-scroll]').forEach((el, i) => { el.scrollTop = scroll[i] || 0; });
        A().bindTableLinks?.();
        // C6 : « N éléments · Trier : [menu] » (même tri que les titres de colonnes)
        const sb = ws.querySelector('[data-at-sortbar]'), UI = window.LCNDA_UI;
        if (sb && UI?.sortBar) {
            const cur = `${v.sort?.col || 'title'}:${v.sort?.dir < 0 ? -1 : 1}`;
            const opts = [['added:-1', 'Les plus récemment ajoutés'], ['added:1', 'Les plus anciennement ajoutés'], ['title:1', 'Titre : A → Z'], ['title:-1', 'Titre : Z → A'], ['creator:1', 'Auteur : A → Z'], ['year:1', 'Date : les plus anciens'], ['year:-1', 'Date : les plus récents'], ['type:1', 'Sorte']];
            sb.replaceWith(UI.sortBar({count: Number(sb.dataset.count) || 0, label: 'élément', value: cur, options: opts.some(o => o[0] === cur) ? opts : [...opts, [cur, 'Comme les colonnes']],
                onChange: val => { const [c, d] = val.split(':'); v.sort = {col: c || 'title', dir: Number(d) || 1}; renderProject(S().workspaceToken, true); }}));
        }
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
            <div class="h-at-toolbar">${trash ? (items.length ? '<button type="button" class="button small danger" data-at-emptytrash>Vider la corbeille</button>' : '') : `<div class="h-at-addmenu"><button type="button" class="button small" data-at-addmenu>＋ Ajouter ▾</button><div class="h-at-menu" hidden>${CFG.types.filter(t => !t.hidden).map(t => `<button type="button" data-at-add="${esc(t.key)}" title="${esc(t.help || '')}">${esc(t.icon)} ${esc(t.label)}</button>`).join('')}<button type="button" data-at-library title="Des numéros de revue, des articles, des livres, des chapitres, des documentaires et leurs moments">📚 Revues, livres, documentaires…</button><button type="button" class="h-at-menu-cfg" data-at-settings>⚙️ Réglages des sortes…</button></div></div>
                <button type="button" class="button small secondary" data-at-import title="Zotero (.rdf), CSL JSON, EndNote (.xml), BibTeX (.bib), RIS (.ris)">⤒ Importer…</button>`}
                ${folder && kids(node).length ? `<label class="ui-toggle h-at-deep"><input type="checkbox" data-at-deep ${v.deep ? 'checked' : ''}><i></i>avec les sous-dossiers</label>` : ''}
                <select data-at-type><option value="">Toutes les sortes</option>${CFG.types.filter(t => !t.hidden || t.key === v.type).map(t => `<option value="${esc(t.key)}" ${v.type === t.key ? 'selected' : ''}>${esc(t.icon)} ${esc(t.label)}</option>`).join('')}</select>
                <input type="search" data-at-q value="${esc(v.q)}" placeholder="Chercher (titre, auteur, texte, étiquette…)"></div>
            ${v.sel.length > 1 ? `<div class="h-at-bulk"><strong>${plural(v.sel.length, 'élément choisi', 'éléments choisis')}</strong>
                ${trash ? '<button type="button" class="button small" data-at-bulk="restore">Restaurer</button><button type="button" class="button small danger" data-at-bulk="delete">Supprimer définitivement</button>'
                    : `<select data-at-bulkfolder><option value="">Ranger dans…</option>${folderOptions()}</select><button type="button" class="button small secondary" data-at-bulk="tag">🏷 Étiquette…</button><button type="button" class="button small secondary" data-at-bulk="star">⭐ Favoris</button>${folder ? '<button type="button" class="button small secondary" data-at-bulk="remove">Retirer de ce dossier</button>' : ''}<button type="button" class="button small secondary danger" data-at-bulk="trash">🗑 Corbeille</button>`}
                <button type="button" class="link-button" data-at-unsel>Aucun</button></div>` : ''}
            ${items.length ? `<div data-at-sortbar data-count="${items.length}"></div><table class="data-table h-at-table"><thead><tr><th class="h-at-c-star"></th>${sortTh('type', '')}${sortTh('title', 'Titre')}${sortTh('creator', 'Auteur, créateur')}${sortTh('year', 'Date')}<th class="h-at-c-att" title="Fichiers joints">📎</th></tr></thead>
                <tbody>${items.map(i => `<tr data-at-item="${i.id}" class="${v.sel.includes(Number(i.id)) ? 'is-sel' : ''} ${i.type === 'task' && Number(i.data.done) ? 'is-done' : ''}" draggable="true">
                    <td class="h-at-c-star"><button type="button" class="h-at-star ${Number(i.starred) ? 'is-on' : ''}" data-at-star="${i.id}" title="Favori">${Number(i.starred) ? '★' : '☆'}</button></td>
                    <td class="h-at-c-type" title="${esc(tl(i))}${i.type === 'reference' ? ' — ' + esc(REF_KINDS[i.data.kind] || '') : ''}">${ti(i)}</td>
                    <td class="h-at-c-title">${esc(i.title)}${(i.tags || []).length ? ` <span class="h-at-rowtags">${i.tags.slice(0, 3).map(t => `<span>${esc(t)}</span>`).join('')}</span>` : ''}${i.type === 'reference' && i.data.read ? ` <small class="muted">${esc(READ[i.data.read])}</small>` : ''}</td>
                    <td>${esc(i.type === 'reference' ? creatorsOf(i).map(c => c.last || c.first).slice(0, 3).join(', ') : i.type === 'media' ? i.data.creator : i.type === 'quote' && i.data.source_id ? firstAuthor(P.byId.get(Number(i.data.source_id)) || {data: {}}) : '')}</td>
                    <td class="h-at-c-year">${esc(i.type === 'task' ? (i.data.due ? new Date(i.data.due + 'T12:00:00').toLocaleDateString('fr-FR') : '') : year(i) || (i.type === 'event' ? i.data.date : ''))}</td>
                    <td class="h-at-c-att">${i.media?.length ? fmt(i.media.length) : ''}</td></tr>`).join('')}</tbody></table>
                <p class="muted h-at-hint">Clic : voir · double-clic : modifier · ⌘/Ctrl-clic ou Maj-clic : en choisir plusieurs · glisser sur un dossier pour l’y ranger${typeof node === 'number' ? ' (⌥/Alt en glissant : le garder aussi ici)' : ''}.</p>`
                : empty(trash ? 'La corbeille est vide.' : v.q || v.tags.length || v.type ? 'Rien ne correspond à ta recherche.' : folder ? 'Ce dossier est vide : « ＋ Ajouter », ou glisse ici des éléments d’un autre dossier.' : 'Rien ici pour l’instant.')}`;
    }
    const folderOptions = (selected = []) => { const out = []; const walk = (parent, depth) => kids(parent).forEach(f => { out.push(`<option value="${f.id}" ${selected.includes(Number(f.id)) ? 'selected' : ''}>${'  '.repeat(depth)}${esc(f.icon || '📁')} ${esc(f.name)}</option>`); walk(Number(f.id), depth + 1); }); walk(0, 0); return out.join(''); };

    /* ─────────── Vues spéciales ─────────── */
    function specialView(node) {
        if (node === 'widgets') {
            const p = P.project;
            return `<h3 class="h-at-ftitle">🧩 Widgets</h3><p class="muted">Chronomètre, minuteur, objectif de mots, tâches, rappels, agenda du projet, bloc-notes… « ＋ Widget » pour en ajouter.</p>
                <label class="ui-toggle"><input type="checkbox" data-at-wov ${widgetsInOverview(p.id) ? 'checked' : ''}><i></i>Les montrer aussi dans la vue d’ensemble</label>${widgetsBox(p)}`;
        }
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
                <div class="h-at-stats">${byType.map(([k, c]) => `<button type="button" class="h-at-stat" data-at-typejump="${k}"><span>${ti(k)}</span><b>${fmt(c)}</b><small>${esc(c > 1 ? plabel(k) : tl(k))}</small></button>`).join('') || '<p class="muted">Le projet est vide : choisis un dossier à gauche, puis « ＋ Ajouter ».</p>'}</div>
                ${days !== null ? `<p class="${days < 0 ? 'h-at-late' : ''}">📆 ${days < 0 ? `Date de rendu dépassée de ${plural(-days, 'jour', 'jours')}` : `Rendu le ${new Date(p.deadline + 'T12:00:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'})} : encore ${plural(days, 'jour', 'jours')}`}${Number(p.target_words) && days > 0 ? ` · ${fmt(Math.max(0, Math.ceil((Number(p.target_words) - Number(p.words)) / days)))} mots par jour pour tenir l’objectif` : ''}</p>` : ''}
                <div class="h-at-cols">
                ${refs.length ? `<section><h4>📖 Lectures</h4>${reads.map(([k, c]) => `<div class="h-at-bar"><span>${esc(READ[k])}</span><b style="width:${refs.length ? Math.round(100 * c / refs.length) : 0}%"></b><em>${fmt(c)}</em></div>`).join('')}<small class="muted">${plural(refs.length, 'référence', 'références')}</small></section>` : ''}
                ${drafts.length ? `<section><h4>✍️ Brouillons</h4>${drafts.map(d => { const w = wc(d.data.text), t = Number(d.data.target); return `<button type="button" class="h-at-line" data-at-pick="${d.id}">${esc(d.title)} <small class="muted">${fmt(w)}${t ? ' / ' + fmt(t) : ''} mots · ${esc(STAGES[d.data.stage] || '')}</small></button>`; }).join('')}</section>` : ''}
                ${tasks.length ? `<section><h4>✅ À faire</h4>${tasks.slice(0, 8).map(t => `<label class="checkbox-line h-at-task ${t.data.due && t.data.due < todayIso() ? 'h-at-late' : ''}"><input type="checkbox" data-at-taskdone="${t.id}"> ${esc(t.title)}${t.data.due ? ` <small>${new Date(t.data.due + 'T12:00:00').toLocaleDateString('fr-FR')}</small>` : ''}</label>`).join('')}${tasks.length > 8 ? `<button type="button" class="link-button" data-at-go="tasks">Toutes les tâches (${fmt(tasks.length)})</button>` : ''}</section>` : ''}
                ${recent.length ? `<section><h4>🕘 Derniers changements</h4>${recent.map(i => `<button type="button" class="h-at-line" data-at-pick="${i.id}">${ti(i)} ${esc(i.title)}</button>`).join('')}</section>` : ''}</div>
                <div data-rc-host data-rc-type="atelier_project" data-rc-key="${p.id}" data-rc-hide-empty></div>
                ${widgetsInOverview(p.id) ? widgetsBox(p) : ''}`;
        }
        if (node === 'tasks') {
            const tasks = items.filter(i => i.type === 'task').sort((a, b) => Number(a.data.done) - Number(b.data.done) || String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
            const today = todayIso();
            return `<h3 class="h-at-ftitle">✅ Tâches</h3><div class="h-at-toolbar"><button type="button" class="button small" data-at-add="task">＋ Tâche</button></div>
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
            return `<h3 class="h-at-ftitle">👥 Personnes</h3><div class="h-at-toolbar"><button type="button" class="button small" data-at-add="person">＋ Personne</button></div>
                ${rows.length || inEvents.size ? `<table class="data-table"><thead><tr><th>Personne</th><th>Rôle</th><th>Dates</th><th>Lieux</th></tr></thead><tbody>${rows.map(i => { const b = i.data.person_id ? people[i.data.person_id] : null;
                    return `<tr><td>${b ? `<button type="button" class="table-link" data-h-person="${b.id}">${esc(pname(b))}</button> <small class="muted">dans ta base</small>` : `<button type="button" class="link-button" data-at-pick="${i.id}">${esc(i.title)}</button>`}</td><td>${esc(i.data.role)}</td><td>${esc(i.data.dates || (b ? [b.birth_year, b.death_year].filter(Boolean).join('–') : ''))}</td><td>${esc(i.data.places)}</td></tr>`; }).join('')}
                    ${[...inEvents.entries()].filter(([pid]) => !rows.some(r => Number(r.data.person_id) === Number(pid))).map(([pid, evs]) => `<tr><td><button type="button" class="table-link" data-h-person="${pid}">${esc(pname(people[pid]))}</button></td><td class="muted">dans ${plural(evs.length, 'événement', 'événements')}</td><td></td><td></td></tr>`).join('')}</tbody></table>` : empty('Aucune personne : « ＋ Personne » (de ta base, ou quelqu’un d’autre : un montreur, un graveur, un éditeur…).')}`;
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
            case 'app': body = `<div class="h-at-app"><p><b>${esc((APP_KINDS[d.kind] || ['🔗'])[0])} ${esc((APP_KINDS[d.kind] || [, 'Élément'])[1])}</b> — ${esc(d.label)}${d.extra ? ` <small class="muted">${esc(d.extra)}</small>` : ''}</p>
                <button type="button" class="button small" data-at-appopen="${i.id}">↗ Ouvrir dans le logiciel</button><div class="h-at-apppreview" data-at-apppreview="${i.id}"><p class="muted">Chargement de l’aperçu…</p></div></div>`;
                setTimeout(() => fillAppPreview(i), 0); break;
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
                <select data-at-file><option value="">＋ ranger aussi dans…</option>${folderOptions()}</select></div>
            <h4>🔗 Voir aussi</h4><div class="h-at-drel">${[...related.map(x => [x, true]), ...backlinks.map(x => [x, false])].map(([x, own]) => `<span class="h-at-chip"><button type="button" class="link-button" data-at-pick="${x.id}">${ti(x)} ${esc(x.title.slice(0, 60))}</button>${own ? ` <button type="button" data-at-unrel="${x.id}" aria-label="Retirer">×</button>` : ''}</span>`).join('') || '<span class="muted">Rien</span>'}
                <input data-at-relq placeholder="+ relier à… (tape un titre)" list="h-at-rellist"><datalist id="h-at-rellist">${live().filter(x => x.id !== i.id).slice(0, 2000).map(x => `<option value="${esc(ti(x) + ' ' + x.title + ' #' + x.id)}">`).join('')}</datalist></div>
            <p class="muted h-at-dates">${window.LCNDA_UI?.when?.(i.created_at, {label: 'Ajouté'}) || ''}${i.updated_at !== i.created_at ? ` · ${window.LCNDA_UI?.when?.(i.updated_at, {label: 'modifié'}) || ''}` : ''}</p>`;
    }

    /* ─────────── Formulaires ─────────── */
    const CUSTOM_FIELD_TYPES = [['text', '📝 Texte court'], ['longtext', '📄 Texte long'], ['date', '📅 Date'], ['number', '🔢 Nombre'], ['select', '📋 Liste de choix'], ['checkbox', '☑️ Case à cocher'], ['url', '🔗 Lien internet'], ['person', '👤 Personne de la base'], ['place', '📍 Lieu']];
    /** Élément d'une sorte créée dans Réglages → Atelier : titre + ses champs, puis notes, étiquettes, dossiers et fichiers comme les autres. */
    function customDialog(key, item = null) {
        const v = st(), def = CFG.types.find(t => t.key === key) || {key, icon: '🧩', label: 'Élément', fields: []}, d = item?.data || {}, vals = d.values || {}, isNew = !item, people = P.people || {};
        const fieldHtml = f => { const n = 'cv_' + f.key, val = vals[f.key] ?? '', cls = f.width === 'half' ? '' : ' class="span-2"', help = f.help ? `<small class="muted">${esc(f.help)}</small>` : '', ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '', req = f.required ? ' required' : '';
            switch (f.type) {
                case 'longtext': return `<label class="span-2">${esc(f.label)}<textarea name="${n}" rows="4"${ph}${req}>${esc(val)}</textarea>${help}</label>`;
                case 'select': return `<label${cls}>${esc(f.label)}<select name="${n}"${req}><option value=""></option>${(f.options || []).map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${help}</label>`;
                case 'checkbox': return `<label class="checkbox-line${f.width === 'half' ? '' : ' span-2'}"><input type="checkbox" name="${n}" ${Number(val) ? 'checked' : ''}> ${esc(f.label)}</label>`;
                case 'person': return `<div${cls}><span class="pk-lab">${esc(f.label)}</span>${window.LCNDA_PICKER.pickerField({name: n, kind: 'person', value: Number(val) || null})}${help}</div>`; // menu de choix unique
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
    /* ─── 🔗 Venant du logiciel : une fiche, un bloc, un village, une liste, un recueil… ─── */
    const APP_KINDS = {person: ['👤', 'Une fiche (personne)'], person_block: ['🧩', 'Un bloc d’une fiche'], village: ['🏘️', 'La fiche d’un village'], list: ['📋', 'Une liste'],
        recueil: ['📚', 'Un recueil (ou quelques pages)'], investigation: ['🔍', 'Une enquête'], battue: ['🧭', 'Une battue'], media: ['🖼️', 'Une image, un son, une vidéo'], atelier_project: ['🗂️', 'Un autre projet de l’Atelier'], workbook: ['🧾', 'Un classeur (budget, planning, tableau des sources…)']};
    // ces sortes se choisissent avec le menu de choix unique (docs/PICKER.md) ; villages, listes, recueils et projets gardent leur recherche
    const APP_PK = {person: 'person', person_block: 'person', investigation: 'investigation', battue: 'battue', media: 'media', workbook: 'workbook'};
    async function appSearch(kind, q) {
        if (['person', 'person_block', 'village', 'investigation', 'battue', 'atelier_project'].includes(kind)) return ((await api('recueil_search', {type: kind === 'person_block' ? 'person' : kind, q})).results || []).filter(r => kind !== 'atelier_project' || Number(r.key) !== Number(P.project.id));
        if (kind === 'media') return ((await api('list', {type: 'media', q, limit: 40})).rows || []).map(r => ({key: String(r.id), label: r.title || r.filename, extra: r.date_text || r.media_type || '', thumb: r.media_type === 'image' || !r.media_type ? (r.thumbnail || r.filename) : ''}));
        if (kind === 'recueil') return ((await api('recueils', {q})).recueils || []).map(r => ({key: String(r.id), label: r.title, extra: `${r.pages} p.${r.reference ? ' · ' + r.reference : ''}`, thumb: r.cover?.thumbnail || ''}));
        if (kind === 'list') { const my = await api('my_lists').catch(() => ({lists: []})); const all = [...(A().defaultListTypes || []).map(([k, , l]) => ({key: k, label: l, extra: 'liste de l’app'})), ...(my.lists || []).map(l => ({key: 'mylist:' + l.id, label: l.name, extra: 'éditeur de listes'}))];
            const lq = q.toLowerCase(); return all.filter(x => !lq || x.label.toLowerCase().includes(lq)).slice(0, 60); }
        return [];
    }
    function appDialog(item = null) {
        const v = st(), d = item?.data || {};
        let chosen = item ? {key: d.key, label: d.label, extra: d.extra} : null, pages = [];
        const blocks = (A().defaultPersonBlocks || []).filter(([k]) => !['person_exports'].includes(k));
        dialog({eyebrow: 'VENANT DU LOGICIEL', title: item ? 'Modifier' : 'Ajouter un élément du logiciel', wide: true, submitLabel: item ? 'Enregistrer' : 'Ajouter',
            body: `<p class="muted">L’élément reste <b>vivant</b> : il montre toujours ce qu’il y a dans le logiciel, et « ↗ Ouvrir » y mène.</p>
                <div class="form-grid"><label>Quoi ?<select name="kind">${Object.entries(APP_KINDS).map(([k, [ic, l]]) => `<option value="${k}" ${(d.kind || 'person') === k ? 'selected' : ''}>${ic} ${esc(l)}</option>`).join('')}</select></label>
                <label data-app-qbox>Chercher<input type="search" data-app-q value="${esc(item ? d.label : '')}" placeholder="Nom, titre, commune…"></label></div>
                <div data-app-pk hidden></div>
                <div class="h-rc-results h-at-appres" data-app-res></div>
                <div data-app-more></div>
                <div class="form-grid"><label class="span-2">Titre dans le projet <small class="muted">(facultatif)</small><input name="title" value="${esc(item?.title || '')}" placeholder="(le nom choisi)"></label>
                <label class="span-2">Pourquoi ici ? <small class="muted">(note)</small><textarea name="notes" rows="2">${esc(d.notes || '')}</textarea></label></div>`,
            onOpen: dl => {
                const kindSel = dl.querySelector('[name=kind]'), q = dl.querySelector('[data-app-q]'), res = dl.querySelector('[data-app-res]'), more = dl.querySelector('[data-app-more]');
                const drawMore = async () => { const k = kindSel.value;
                    if (k === 'person_block') more.innerHTML = `<label>Quel bloc ?<select name="sub">${blocks.map(([bk, bl]) => `<option value="${esc(bk)}" ${d.sub === bk ? 'selected' : ''}>${esc(bl)}</option>`).join('')}</select></label>`;
                    else if (k === 'recueil' && chosen) { const rd = await api('recueil', {id: chosen.key}).catch(() => ({pages: []})); pages = rd.pages || [];
                        more.innerHTML = pages.length ? `<fieldset class="h-rc-modes"><legend>Quelles pages ?</legend><label class="checkbox-line"><input type="radio" name="scope" value="all" ${d.page_from ? '' : 'checked'}> Tout le recueil</label>
                            <label class="checkbox-line"><input type="radio" name="scope" value="some" ${d.page_from ? 'checked' : ''}> De la page <select name="page_from">${pages.map(p => `<option value="${p.id}" ${Number(d.page_from) === p.id ? 'selected' : ''}>${p.num}${p.label ? ' — ' + esc(p.label) : ''}</option>`).join('')}</select> à <select name="page_to">${pages.map(p => `<option value="${p.id}" ${Number(d.page_to || d.page_from) === p.id ? 'selected' : ''}>${p.num}${p.label ? ' — ' + esc(p.label) : ''}</option>`).join('')}</select></label></fieldset>` : ''; }
                    else if (k === 'workbook') more.innerHTML = `<div class="form-grid"><label>Ou un nouveau classeur d’après un modèle<select name="wb_tpl"><option value="">— aucun —</option>${(ext.sheetTemplates || []).map(t => `<option value="${esc(t.key)}">${esc(t.icon)} ${esc(t.name)}</option>`).join('')}</select></label></div>`;
                    else more.innerHTML = ''; };
                let timer = 0;
                const pk = dl.querySelector('[data-app-pk]');
                pk.addEventListener('picker-create', e => { // 🧾 « ＋ Créer le classeur « … » » : un classeur vide, rangé dans le Tableur
                    if (e.detail?.kind !== 'workbook') return; e.preventDefault();
                    post('save_workbook', {name: e.detail.text || 'Mon classeur', kind: 'book', data: window.LCNDA_SHEET.compact(window.LCNDA_SHEET.newWorkbook())}).then(r => e.detail.pick({id: Number(r.result.id), title: e.detail.text || 'Mon classeur'})).catch(err => toast(err.message, 'error'));
                });
                pk.addEventListener('picker-change', e => { const it = e.detail.item; chosen = it?.id ? {key: String(it.id), label: it.title, extra: it.short || ''} : null; drawMore(); });
                const search = async () => {
                    const pkKind = APP_PK[kindSel.value]; pk.hidden = !pkKind; dl.querySelector('[data-app-qbox]').hidden = !!pkKind;
                    res.hidden = !!pkKind;
                    if (pkKind) { res.innerHTML = ''; const val = chosen && APP_PK[d.kind] === pkKind ? {id: Number(chosen.key), title: chosen.label, short: chosen.extra || ''} : null;
                        // une image, un son, une vidéo : la fenêtre unique des médias ; le reste : le menu de choix unique
                        if (!pk.querySelector('.pk, [data-media-field]')) pk.innerHTML = pkKind === 'media' && window.LCNDA_PICKER.mediaField ? window.LCNDA_PICKER.mediaField({name: '', types: ['image', 'audio', 'video', 'document'], value: val, title: 'Une image, un son, une vidéo'}) : window.LCNDA_PICKER.pickerField({name: 'app_pick', kind: pkKind, value: val, ...(pkKind === 'workbook' ? {allowCreate: true} : {})}); return; }
                    pk.innerHTML = '';
                    const list = await appSearch(kindSel.value, q.value.trim()).catch(() => []);
                    res.innerHTML = list.map(x => `<label class="checkbox-line"><input type="radio" name="pick" value="${esc(x.key)}" data-label="${esc(x.label)}" data-extra="${esc(x.extra || '')}" ${chosen?.key === x.key ? 'checked' : ''}>${x.thumb ? `<img src="media/${encodeURIComponent(x.thumb)}" alt="" class="h-at-appthumb">` : ''} ${esc(x.label)} ${x.extra ? `<small class="muted">${esc(x.extra)}</small>` : ''}</label>`).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien trouvé.</span></p>';
                    res.querySelectorAll('[name=pick]').forEach(r => r.addEventListener('change', () => { chosen = {key: r.value, label: r.dataset.label, extra: r.dataset.extra}; drawMore(); })); };
                q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
                kindSel.addEventListener('change', () => { chosen = null; q.value = ''; pk.innerHTML = ''; search(); drawMore(); });
                search(); drawMore();
            },
            onSubmit: async form => {
                const tplKey = form.wb_tpl?.value || '';
                if (!chosen && !(form.kind.value === 'workbook' && tplKey)) return window.LCNDA_UI.fail(form.querySelector('.pk') || form.querySelector('[data-app-q]'), 'Choisis dans la liste.');
                const f = Object.fromEntries(new FormData(form)), kind = f.kind;
                if (kind === 'workbook' && tplKey) { // 🧾 un nouveau classeur d'après un modèle : rangé dans le Tableur, puis ajouté au projet
                    const t = (ext.sheetTemplates || []).find(x => x.key === tplKey), name = (f.title || '').trim() || t.name;
                    const r = await post('save_workbook', {name, kind: 'book', data: window.LCNDA_SHEET.compact(t.make())}); chosen = {key: String(r.result.id), label: name, extra: '🧾 classeur'};
                }
                const blockLabel = kind === 'person_block' ? (blocks.find(b => b[0] === f.sub) || [, f.sub])[1] : '';
                const some = kind === 'recueil' && f.scope === 'some', pf = pages.find(p => p.id === Number(f.page_from)), pt = pages.find(p => p.id === Number(f.page_to));
                const label = kind === 'person_block' ? `${blockLabel} — ${chosen.label}` : chosen.label;
                const data = {kind, key: chosen.key, sub: kind === 'person_block' ? f.sub : '', label, extra: some && pf ? `pages ${Math.min(pf.num, pt?.num || pf.num)} à ${Math.max(pf.num, pt?.num || pf.num)}` : chosen.extra,
                    page_from: some ? Number(f.page_from) : 0, page_to: some ? Number(f.page_to) : 0, notes: f.notes, related: d.related || []};
                const saved = await post('save_atelier_item', {id: item?.id || 0, project_id: P.project.id, type: 'app', title: (f.title || '').trim() || label, data, tags: item?.tags || [],
                    folder_ids: item ? item.folders : (typeof v.node === 'number' ? [v.node] : []), starred: item ? Number(item.starred) : 0});
                v.sel = [Number(saved.result.id)]; toast(item ? 'Enregistré.' : 'Ajouté.'); await reload();
            },
        });
    }
    /** Ouvre dans le logiciel ce que montre un élément « Venant du logiciel ». */
    function openApp(i) {
        const d = i.data || {}, s = S();
        if (d.kind === 'person' || d.kind === 'person_block') { s.currentPersonId = Number(d.key); A().setModule('personnes');
            if (d.kind === 'person_block' && d.sub) { let n = 0; const t = setInterval(() => { const el = document.querySelector(`[data-pblock="${CSS.escape(d.sub)}"]`); if (el || ++n > 40) { clearInterval(t); if (el) { el.scrollIntoView({behavior: 'smooth', block: 'start'}); el.classList.add('h-flash'); setTimeout(() => el.classList.remove('h-flash'), 2500); } } }, 100); } return; }
        if (d.kind === 'village') { s.listType = 'villages'; s.hVillage = d.key; return A().setModule('listes'); }
        if (d.kind === 'list') { s.listType = d.key; return A().setModule('listes'); }
        if (d.kind === 'recueil') return ext.openRecueil?.(d.key, d.page_from || 0);
        if (d.kind === 'investigation') { s.enquetesTab = 'enquetes'; s.currentBattueId = 0; s.currentInvestigationId = Number(d.key); return A().setModule('enquetes'); }
        if (d.kind === 'battue') { s.enquetesTab = 'battue'; s.currentInvestigationId = 0; s.currentBattueId = Number(d.key); return A().setModule('enquetes'); }
        if (d.kind === 'atelier_project') { Object.assign(st(), {project: Number(d.key), node: firstNode(), sel: [], tags: [], q: '', type: ''}); return ext.atelier(++S().workspaceToken); }
        if (d.kind === 'workbook') return ext.openWorkbook?.({id: Number(d.key)});
        if (d.kind === 'media') { A().api('list', {type: 'media', q: d.label, limit: 40}).then(r => { const m = (r.rows || []).find(x => String(x.id) === String(d.key)); if (m) A().openLightbox([m], 0, false); else toast('Média introuvable.', 'error'); }); }
    }
    /** Aperçu vivant dans le panneau de droite. */
    async function fillAppPreview(i) {
        const box = document.querySelector(`[data-at-apppreview="${i.id}"]`); if (!box) return;
        const d = i.data || {}; let html = '';
        try {
            if (d.kind === 'person' || d.kind === 'person_block') { const r = await api('person', {id: d.key}); const p = r.person || {};
                const ev = (r.events || []).slice(0, 8);
                html = `<p><b>${esc(A().personName(p))}</b> ${esc(A().years ? A().years(p) : '')}</p>${d.kind === 'person_block' ? `<p class="muted">Bloc montré : <b>${esc((A().defaultPersonBlocks.find(b => b[0] === d.sub) || [, d.sub])[1])}</b> (↗ Ouvrir mène à ce bloc)</p>` : ''}
                    ${ev.length ? `<ul class="h-at-applist">${ev.map(e => `<li>${esc(e.type_label || 'Événement')} — ${esc(e.date_text || e.year || '')}${e.place_name ? ' · ' + esc(e.place_name) : ''}</li>`).join('')}</ul>` : ''}`; }
            else if (d.kind === 'village') { const v = await api('village', {key: d.key}); html = `<p><b>${esc(v.name)}</b> ${esc([v.county, v.country].filter(Boolean).join(', '))}</p><p class="muted">${[v.people_count && `${plural(v.people_count, 'personne', 'personnes')} de la famille`, (v.baptemes || v.mariages || v.deces) && `${plural((v.baptemes || 0) + (v.mariages || 0) + (v.deces || 0), 'acte', 'actes')} (baptêmes, mariages, décès)`, (v.families || []).length && `familles : ${(v.families || []).slice(0, 6).map(f => f.name || f.surname || f).join(', ')}`].filter(Boolean).join(' · ')}</p>`; }
            else if (d.kind === 'recueil') { const r = await api('recueil', {id: d.key}); const imgs = new Map(r.images.map(x => [x.id, x]));
                let pg = r.pages; if (d.page_from) { const a = r.pages.find(p => p.id === Number(d.page_from)), b = r.pages.find(p => p.id === Number(d.page_to)) || a; if (a) pg = r.pages.filter(p => p.num >= Math.min(a.num, b.num) && p.num <= Math.max(a.num, b.num)); }
                html = `<p><b>${esc(r.recueil.title)}</b> · ${plural(pg.length, 'page', 'pages')}</p><div class="h-rc-for-strip">${pg.slice(0, 12).map(p => { const im = imgs.get(p.shown_image_id); return `<button type="button" class="h-rc-thumb" data-open-recueil="${d.key}" data-recueil-page="${p.id}" title="Page ${p.num}">${im ? `<img src="media/${encodeURIComponent(im.thumbnail)}" alt="">` : ''}<small>${p.num}</small></button>`; }).join('')}</div>`; }
            else if (d.kind === 'media') { const r = await api('list', {type: 'media', q: d.label, limit: 40}); const m = (r.rows || []).find(x => String(x.id) === String(d.key));
                html = m ? ((m.media_type || 'image') === 'image' ? `<img class="h-at-appimg" src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="">` : `<p>${esc(m.media_type)} · ${esc(m.filename)}</p>`) + (m.transcription ? `<p class="h-at-notetext">${esc(m.transcription.slice(0, 400))}</p>` : '') : '<p class="muted">Média introuvable (supprimé ?).</p>'; }
            else if (d.kind === 'workbook') { const r = await api('workbook', {id: d.key}); const sh0 = r.data?.sheets?.[0], S = window.LCNDA_SHEET, wb = S ? S.normalize(r.data) : null, m = wb ? S.matrix(wb, new S.Calc(wb), 0, null, {display: true}).slice(0, 8).map(row => row.slice(0, 6)) : [];
                html = `<p><b>🧾 ${esc(r.name)}</b> · ${plural((r.data?.sheets || []).length, 'feuille', 'feuilles')}${sh0 ? ` (${esc((r.data.sheets || []).map(x => x.name).slice(0, 5).join(', '))})` : ''}</p>${m.length ? `<div class="xl-prev"><table><tbody>${m.map((row, i) => `<tr>${row.map(v => `<${i ? 'td' : 'th'}>${esc(v)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}`; }
            else html = `<p class="muted">${esc(d.extra || '')}</p>`;
        } catch (e) { html = `<p class="muted">Aperçu impossible : ${esc(e.message)}</p>`; }
        if (box.isConnected) box.innerHTML = html;
    }
    function itemDialog(type, item = null, preset = {}) {
        if (type === 'app') return appDialog(item);
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
                    <div class="span-2"><span class="section-label">Auteurs, directeurs, graveurs…</span><div data-at-creators>${(d.creators?.length ? d.creators : [{}]).map(creatorRow).join('')}</div><button type="button" class="button small secondary" data-at-cadd>＋ Personne</button></div>
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
            case 'person': fields = `<div class="span-2"><span class="pk-lab">Personne de ta base <small>(facultatif)</small></span>${window.LCNDA_PICKER.pickerField({name: 'person_id', kind: 'person', value: Number(d.person_id) || null})}</div>
                    <label class="span-2">Nom <small>(si ce n’est pas quelqu’un de ta base)</small><input name="title" value="${esc(title)}" placeholder="Pierre Martin, montreur d’optique"></label>
                    ${inp('role', 'Rôle, métier', d.role, 'placeholder="montreur de vues d’optique, colporteur"')}${inp('dates', 'Dates', d.dates, 'placeholder="vers 1740 – après 1789"')}${inp('places', 'Lieux', d.places, 'placeholder="Briançonnais, Paris, foires de Beaucaire"', 'span-2')}`; break;
            case 'place': fields = `<label class="span-2">Lieu${ext.placeField('place', d.place?.text || '', d.place?.lat ?? '', d.place?.lon ?? '', 'Commune, adresse, monument…')}</label>
                    ${inp('kind', 'Sorte de lieu', d.kind, 'placeholder="foire, atelier, dépôt d’archives"')}<label>Titre <small>(facultatif)</small><input name="title" value="${esc(title)}"></label>`; break;
            case 'event': fields = `<label class="span-2">Titre<input name="title" required value="${esc(title)}" placeholder="Foire Saint-Germain : un montreur d’optique condamné"></label>
                    ${inp('date', 'Date', d.date, 'placeholder="1775-02-03, ou mars 1775"')}${inp('end', 'Jusqu’au', d.end)}<label class="span-2">Lieu${ext.placeField('place', d.place?.text || '', d.place?.lat ?? '', d.place?.lon ?? '', 'Commune, adresse…')}</label>
                    <div class="span-2"><span class="section-label">Personnes de ta base</span><div data-at-people>${window.LCNDA_PICKER.pickerField({name: 'ev_person', kind: 'person', multiple: true, value: (d.people || []).map(Number).filter(Boolean)})}</div></div>`; break;
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
                    event: () => Object.assign(data, {date: val('date'), end: val('end'), place: place('place'), people: val('ev_person').split(',').map(Number).filter(Boolean)}),
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
                if (!await A().confirmBox(`Supprimer le dossier « ${folder.name} »${sub ? ` et ses ${plural(sub, 'sous-dossier', 'sous-dossiers')}` : ''} ? Les éléments ne sont pas supprimés : ils restent dans le projet (dans « Non classés » s’ils ne sont rangés nulle part ailleurs).`, {title: 'Supprimer le dossier', okLabel: 'Supprimer le dossier'})) return false;
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
            <button type="button" class="button secondary" data-x="docx">📝 Plan et textes pour Word (.docx)<small>Avec de vrais titres de chapitres : s’ouvre dans Word, Pages, LibreOffice ; prêt à mettre en page</small></button>
            <button type="button" class="button secondary" data-x="print">🖨 Imprimer ou enregistrer en PDF<small>Le plan et les textes, mis en page, avec la bibliographie à la fin</small></button>
            <button type="button" class="button secondary" data-x="csl">📚 Références (CSL JSON)<small>Pour Zotero, Zettlr, Pandoc : garde les auteurs, dates et pages au mieux</small></button>
            <button type="button" class="button secondary" data-x="csv">📊 Tableau de tous les éléments (.csv)<small>Pour un tableur</small></button>
            ${ext.openWorkbook ? '<button type="button" class="button secondary" data-x="sheet">🧾 Tableau de tous les éléments, dans le tableur<small>Ouvert tout de suite dans le 🧾 Tableur de l’app (trier, filtrer, compter, enregistrer)</small></button>' : ''}
            <button type="button" class="button secondary" data-x="full">💾 Projet complet (.json)<small>Sauvegarde ou partage : dossiers, éléments, liens, étiquettes ; se réimporte tel quel avec « Importer… » (sans les fichiers joints)</small></button>
            <button type="button" class="button secondary" data-x="plan">🗂️ Enregistrer ce plan comme plan de départ<small>Les dossiers de ce projet seront proposés à la création d’un nouveau projet</small></button></div>`,
            onOpen: dl => dl.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
                const x = b.dataset.x;
                if (x === 'plan') { ext.atelierSavePlanFromProject(); return; }
                if (x === 'bib') ext.downloadText(slug + '.bib', toBibtex(refs), 'text/plain');
                if (x === 'ris') ext.downloadText(slug + '.ris', toRis(refs), 'application/x-research-info-systems');
                if (x === 'md') ext.downloadText(slug + '.md', toMarkdown(), 'text/markdown');
                if (x === 'csl') ext.downloadText(slug + '.json', JSON.stringify(toCsl(refs), null, 1), 'application/json');
                if (x === 'full') ext.downloadText(slug + '.lcnda-projet.json', JSON.stringify(fullProject(), null, 1), 'application/json');
                if (x === 'docx') { const a = document.createElement('a'); a.href = URL.createObjectURL(toDocx()); a.download = slug + '.docx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
                if (x === 'print') { printProject(); return; }
                const allRows = () => [['Sorte', 'Titre', 'Auteurs', 'Date', 'Dossiers', 'Étiquettes', 'Référence'], ...live().map(i => [tl(i), i.title, i.type === 'reference' ? creatorsOf(i).map(c => [c.last, c.first].filter(Boolean).join(' ')).join(' ; ') : '', year(i) || i.data.date || '', i.folders.map(f => pathOf(f).map(y => y.name).join(' › ')).join(' ; '), (i.tags || []).join(', '), i.type === 'reference' ? cite(i, false) : ''])];
                if (x === 'csv') { const q = s => '"' + (A().csvSafe || (x => String(x ?? '')))(s).replace(/"/g, '""') + '"'; /* pas de formule glissée dans un tableur */ ext.downloadText(slug + '.csv', '﻿' + allRows().map(r => r.map(q).join(';')).join('\n'), 'text/csv'); }
                if (x === 'sheet') { dl.close(); const rows = allRows().map(r => r.map(v => (typeof v === 'string' && /^[='+]/.test(v) ? "'" + v : v))); /* une formule glissée reste du texte */ if (ext.openRowsInSheet) ext.openRowsInSheet({name: `${P.project.title} — éléments`, rows}); else { const S = window.LCNDA_SHEET, wb = S.newWorkbook(); wb.sheets[0].cells = S.rowsToCells(rows); wb.sheets[0].name = 'Éléments'; ext.openWorkbook({data: wb, name: `${P.project.title} — éléments`}); } return; }
                toast('Fichier prêt.');
            })),
        });
    }
    /* ─── Autres exports : CSL JSON, projet complet, Word (.docx), impression ─── */
    const CSL_TYPES = {livre: 'book', article: 'article-journal', chapitre: 'chapter', these: 'thesis', archive: 'manuscript', image: 'graphic', presse: 'article-newspaper', web: 'webpage', objet: 'document', autre: 'document'};
    function toCsl(refs) {
        return refs.map(i => { const d = i.data || {}, names = roles => creatorsOf(i, roles).map(c => ({family: c.last || '', given: c.first || ''})).filter(n => n.family || n.given);
            const dm = String(d.date || d.year || '').match(/(\d{3,4})(?:-(\d{2})(?:-(\d{2}))?)?/);
            const out = {id: 'lcnda-' + i.id, type: CSL_TYPES[d.kind] || 'document', title: i.title, author: names(['auteur', 'graveur', 'photographe', 'illustrateur', 'autre']), editor: names(['dir']), translator: names(['trad']),
                'container-title': d.container, publisher: d.publisher, 'publisher-place': d.place, volume: d.volume, issue: d.issue, page: d.pages, ISBN: d.isbn, DOI: d.doi, URL: d.url, language: d.language, abstract: d.abstract,
                archive: d.archive, 'call-number': d.call_number, keyword: (i.tags || []).join(', '), edition: d.edition, issued: dm ? {'date-parts': [[dm[1], dm[2], dm[3]].filter(Boolean).map(Number)]} : undefined};
            Object.keys(out).forEach(k => { if (out[k] === undefined || out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) delete out[k]; });
            return out; });
    }
    function fullProject() {
        const items = live(), used = new Set(items.filter(i => i.type === 'custom').map(i => i.data?.ctype));
        return {type: 'lcnda-atelier-projet', version: 1, exported: new Date().toISOString(),
            project: (({title, subtitle, kind, icon, color, description, target_words, deadline}) => ({title, subtitle, kind, icon, color, description, target_words, deadline}))(P.project),
            folders: P.folders.map(f => ({id: Number(f.id), parent_id: f.parent_id ? Number(f.parent_id) : 0, name: f.name, icon: f.icon || '', notes: f.notes || '', position: f.position})),
            items: items.map(i => ({id: Number(i.id), type: i.type, title: i.title, data: i.data || {}, tags: i.tags || [], starred: !!Number(i.starred), folders: i.folders})),
            custom_types: CFG.types.filter(t => t.custom && used.has(t.key))};
    }
    /** Un projet complet reçu apporte ses sortes d'éléments à soi : on les ajoute aux réglages si elles manquent. */
    function mergeImportedTypes(text) {
        if (!String(text).slice(0, 200).includes('lcnda-atelier-projet')) return;
        try { const doc = JSON.parse(text); let n = 0; (doc.custom_types || []).forEach(t => { if (t?.key && !CFG.types.some(x => x.key === t.key)) { CFG.types.push({...t, custom: true}); n++; } }); if (n) { saveCfg(); toast(`${n > 1 ? `${fmt(n)} sortes d’élément ajoutées` : '1 sorte d’élément ajoutée'} aux réglages de l’Atelier.`); } } catch (_) {}
    }
    /** Les blocs du document (titres, paragraphes, citations, références) dans l'ordre du plan. */
    function projectBlocks() {
        const B = [{k: 'title', t: P.project.title}];
        if (P.project.subtitle) B.push({k: 'subtitle', t: P.project.subtitle});
        if (P.project.description) B.push({k: 'p', t: P.project.description});
        const refsUsed = new Map();
        const item = i => { const d = i.data || {};
            if (i.type === 'draft') String(d.text || '').split(/\n{2,}/).forEach(t => t.trim() && B.push({k: 'p', t}));
            else if (i.type === 'note') B.push({k: 'note', t: d.text || i.title});
            else if (i.type === 'quote') { const s = d.source_id ? P.byId.get(Number(d.source_id)) : null; if (s) refsUsed.set(s.id, s); B.push({k: 'quote', t: `« ${d.text || ''} »`, src: s ? `— ${shortCite(s)}${d.page ? ', ' + d.page : ''}` : ''}); }
            else if (i.type === 'reference') { refsUsed.set(i.id, i); B.push({k: 'li', t: cite(i, false)}); }
            else B.push({k: 'li', t: `${i.title}${d.notes ? ' — ' + String(d.notes).replace(/\n/g, ' ') : ''}`});
        };
        const walk = (parent, depth) => kids(parent).forEach(f => {
            B.push({k: 'h', lvl: Math.min(6, depth + 1), t: f.name}); if (f.notes) B.push({k: 'p', t: f.notes});
            live().filter(i => i.folders.includes(Number(f.id))).sort((a, b) => (a.type === 'draft' ? 0 : 1) - (b.type === 'draft' ? 0 : 1) || a.title.localeCompare(b.title, 'fr')).forEach(item);
            walk(Number(f.id), depth + 1);
        });
        walk(0, 0);
        const unfiled = live().filter(i => !i.folders.length); if (unfiled.length) { B.push({k: 'h', lvl: 1, t: 'Non classés'}); unfiled.forEach(item); }
        const refs = live().filter(i => i.type === 'reference').sort((a, b) => cite(a, false).localeCompare(cite(b, false), 'fr'));
        if (refs.length) { B.push({k: 'h', lvl: 1, t: 'Bibliographie'}); refs.forEach(r => B.push({k: 'bib', t: cite(r, false)})); }
        return B;
    }
    /** Petit fichier zip sans compression (suffit pour un .docx). */
    /** Petit fichier zip sans compression (suffit pour un .docx) : le fabricant commun (LCNDA_SHEET.zipStore) */
    const zip = files => window.LCNDA_SHEET.zipStore(files.map(([name, data]) => ({name, data})), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    function toDocx() {
        const x = t => String(t ?? '').replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
        const run = (t, rpr = '') => String(t).split('\n').map((line, k) => `${k ? '<w:r><w:br/></w:r>' : ''}<w:r>${rpr}<w:t xml:space="preserve">${x(line)}</w:t></w:r>`).join('');
        const para = (style, t, rpr = '') => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${run(t, rpr)}</w:p>`;
        const body = projectBlocks().map(b => b.k === 'title' ? para('Title', b.t) : b.k === 'subtitle' ? para('Subtitle', b.t) : b.k === 'h' ? para('Heading' + b.lvl, b.t)
            : b.k === 'quote' ? para('Quote', b.t) + (b.src ? para('QuoteSource', b.src) : '') : b.k === 'note' ? para('Note', '📝 ' + b.t) : b.k === 'li' ? para('ListBullet', '• ' + b.t) : b.k === 'bib' ? para('Bibliography', b.t) : para('Normal', b.t)).join('');
        const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
        const st = (id, name, rpr, ppr = '', basedOn = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${basedOn}"/><w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}<w:rPr>${rpr}</w:rPr></w:style>`;
        const heads = [1, 2, 3, 4, 5, 6].map(l => st('Heading' + l, 'heading ' + l, `<w:b/><w:sz w:val="${[36, 30, 26, 24, 22, 22][l - 1]}"/>${l > 3 ? '<w:i/>' : ''}`, `<w:keepNext/><w:spacing w:before="${[480, 360, 280, 240, 200, 200][l - 1]}" w:after="120"/><w:outlineLvl w:val="${l - 1}"/>`)).join('');
        const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="24"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
            <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${st('Title', 'Title', '<w:b/><w:sz w:val="56"/>', '<w:jc w:val="center"/><w:spacing w:after="240"/>')}${st('Subtitle', 'Subtitle', '<w:i/><w:sz w:val="30"/>', '<w:jc w:val="center"/><w:spacing w:after="480"/>')}${heads}
            ${st('Quote', 'Quote', '<w:i/>', '<w:ind w:left="720" w:right="720"/>')}${st('QuoteSource', 'Quote Source', '<w:sz w:val="20"/>', '<w:ind w:left="720"/><w:jc w:val="right"/>')}${st('Note', 'Note', '<w:color w:val="555555"/><w:sz w:val="20"/>', '<w:ind w:left="360"/>')}${st('ListBullet', 'List Bullet', '', '<w:ind w:left="360" w:hanging="240"/><w:jc w:val="left"/>')}${st('Bibliography', 'Bibliography', '', '<w:ind w:left="720" w:hanging="720"/><w:jc w:val="left"/>')}</w:styles>`;
        const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
        return zip([
            ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
            ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
            ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
            ['word/document.xml', doc], ['word/styles.xml', styles],
        ]);
    }
    function printProject() {
        const html = projectBlocks().map(b => b.k === 'title' ? `<h1 class="t">${esc(b.t)}</h1>` : b.k === 'subtitle' ? `<p class="st">${esc(b.t)}</p>` : b.k === 'h' ? `<h${Math.min(6, b.lvl + 1)}>${esc(b.t)}</h${Math.min(6, b.lvl + 1)}>`
            : b.k === 'quote' ? `<blockquote>${nl(b.t)}${b.src ? `<cite>${esc(b.src)}</cite>` : ''}</blockquote>` : b.k === 'note' ? `<p class="note">📝 ${nl(b.t)}</p>` : b.k === 'li' ? `<p class="li">• ${esc(b.t)}</p>` : b.k === 'bib' ? `<p class="bib">${esc(b.t)}</p>` : `<p>${nl(b.t)}</p>`).join('');
        const doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(P.project.title)}</title><style>@page{size:A4;margin:2.2cm}body{font:12pt/1.55 Georgia,serif;color:#111}h1.t{text-align:center;font-size:26pt;margin:2cm 0 .3cm}.st{text-align:center;font-style:italic;font-size:14pt;margin-bottom:1.5cm}h2{font-size:18pt;margin-top:1.2cm;page-break-after:avoid}h3{font-size:15pt;page-break-after:avoid}h4,h5,h6{font-size:13pt;font-style:italic;page-break-after:avoid}p{text-align:justify;margin:0 0 .35cm}blockquote{font-style:italic;margin:.3cm 1.2cm}cite{display:block;text-align:right;font-style:normal;font-size:10pt}.note{color:#555;font-size:10pt;margin-left:.6cm}.li{text-align:left;margin-left:.6cm}.bib{text-align:left;padding-left:1.2cm;text-indent:-1.2cm}</style></head><body>${html}</body></html>`;
        if (window.LCNDA_UI?.openPrintDialog) return window.LCNDA_UI.openPrintDialog({title: P.project.title || 'Le projet', html: doc, photos: false}); // K13 : la fenêtre « Imprimer » commune
        const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(fr); fr.srcdoc = doc;
        fr.onload = () => { setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Impression impossible : ' + e.message, 'error'); } setTimeout(() => fr.remove(), 60000); }, 200); }; // secours (sans la fenêtre commune)
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
            if (q('[data-at-go]')) { const g = q('[data-at-go]').dataset.atGo; const sv = navEntry(g)?.filter?.sort; if (sv?.col) v.sort = {col: sv.col, dir: sv.dir === -1 ? -1 : 1}; return go(/^\d+$/.test(g) ? Number(g) : g); }
            if (q('[data-at-typejump]')) { v.type = q('[data-at-typejump]').dataset.atTypejump; return go('all'); }
            if (q('[data-at-tag]')) { const tg = q('[data-at-tag]').dataset.atTag; v.tags = v.tags.includes(tg) ? v.tags.filter(x => x !== tg) : [...v.tags, tg]; if ([...SPECIAL_VIEWS, 'trash'].includes(v.node)) v.node = 'all'; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-tagclear]')) { v.tags = []; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-settings]')) return openSettings();
            if (q('[data-at-addmenu]')) { const m = q('.h-at-addmenu').querySelector('.h-at-menu'); m.hidden = !m.hidden; return; }
            if (q('[data-at-library]')) { ws.querySelector('.h-at-menu')?.setAttribute('hidden', ''); return ext.pickLibraryForAtelier?.(P.project.id, typeof v.node === 'number' ? v.node : 0, () => reload()); }
            if (q('[data-at-add]')) { ws.querySelector('.h-at-menu')?.setAttribute('hidden', ''); return itemDialog(q('[data-at-add]').dataset.atAdd); }
            if (q('[data-at-import]')) {
                const file = await pickNamedFile(IMPORT_ACCEPT); if (!file) return;
                try { mergeImportedTypes(file.text); const r = await post('atelier_import', {project_id: P.project.id, folder_id: typeof v.node === 'number' ? v.node : 0, text: file.text}); toast('Importé : ' + importSummary(r.result) + '.'); await reload(); } catch (error) { toast(error.message, 'error'); }
                return;
            }
            if (q('[data-at-sort]')) { const c = q('[data-at-sort]').dataset.atSort; v.sort = v.sort.col === c ? {col: c, dir: -v.sort.dir} : {col: c, dir: 1}; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-star]')) { e.stopPropagation(); const i = P.byId.get(Number(q('[data-at-star]').dataset.atStar)); return act(Number(i.starred) ? 'unstar' : 'star', [Number(i.id)]); }
            if (q('[data-at-pick]')) { const id = Number(q('[data-at-pick]').dataset.atPick), i = P.byId.get(id); if (!i) return; v.sel = [id]; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-wov]')) { setWidgetsInOverview(P.project.id, q('[data-at-wov]').checked); return; }
            if (q('[data-at-appopen]')) return openApp(P.byId.get(Number(q('[data-at-appopen]').dataset.atAppopen)));
            if (q('[data-at-edit]')) { const i = P.byId.get(Number(q('[data-at-edit]').dataset.atEdit)); return itemDialog(i.type, i); }
            if (q('[data-at-write]')) { const i = P.byId.get(Number(q('[data-at-write]').dataset.atWrite)); return itemDialog(i.type, i); }
            if (q('[data-at-dup]')) { const i = P.byId.get(Number(q('[data-at-dup]').dataset.atDup)); try { const r = await post('save_atelier_item', {project_id: P.project.id, type: i.type, title: i.title + ' (copie)', data: i.data, tags: i.tags, folder_ids: i.folders}); v.sel = [Number(r.result.id)]; toast('Dupliqué (sans les fichiers joints).'); await reload(); } catch (error) { toast(error.message, 'error'); } return; }
            if (q('[data-at-copy]')) { const i = P.byId.get(Number(q('[data-at-copy]').dataset.atCopy)); try { await navigator.clipboard.writeText(cite(i, false)); toast('Référence copiée.'); } catch (_) { toast(cite(i, false)); } return; }
            if (q('[data-at-trash]')) { const id = Number(q('[data-at-trash]').dataset.atTrash); await act('trash', [id]); toast('Mis à la corbeille (on peut l’en sortir).'); return; }
            if (q('[data-at-restore]')) return act('restore', [Number(q('[data-at-restore]').dataset.atRestore)]);
            if (q('[data-at-untag]')) return act('untag', v.sel, {tag: q('[data-at-untag]').dataset.atUntag});
            if (q('[data-at-unfile]')) return act('remove', v.sel, {folder_id: Number(q('[data-at-unfile]').dataset.atUnfile)});
            if (q('[data-at-unrel]')) { const i = P.byId.get(v.sel[0]); const rel = (i.data.related || []).filter(x => Number(x) !== Number(q('[data-at-unrel]').dataset.atUnrel)); return saveData(i, {related: rel}); }
            if (q('[data-at-emptytrash]')) { const ids = P.items.filter(i => Number(i.trashed)).map(i => Number(i.id)); if (await A().confirmBox(`Supprimer définitivement ${plural(ids.length, 'élément', 'éléments')} ?`, {title: 'Vider la corbeille', okLabel: 'Supprimer définitivement'})) { await act('delete', ids); v.sel = []; } return; }
            if (q('[data-at-unsel]')) { v.sel = []; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-bulk]')) {
                const a = q('[data-at-bulk]').dataset.atBulk;
                if (a === 'tag') { const tg = await A().askText({title: 'Étiquette', message: 'Étiquette à ajouter aux éléments choisis :', okLabel: 'Ajouter'}); if (tg?.trim()) await act('tag', v.sel, {tag: tg.trim()}); return; }
                if (a === 'delete' && !await A().confirmBox(`Supprimer définitivement ${plural(v.sel.length, 'élément', 'éléments')} ?`, {title: 'Supprimer définitivement', okLabel: 'Supprimer définitivement'})) return;
                await act(a, v.sel, {folder_id: typeof v.node === 'number' ? v.node : 0}); if (['trash', 'delete', 'restore', 'remove'].includes(a)) { v.sel = []; renderProject(S().workspaceToken, true); }
                return;
            }
            if (q('[data-at-copybib]')) { const txt = ws.querySelector('[data-at-biblio]').innerText; try { await navigator.clipboard.writeText(txt); toast('Bibliographie copiée.'); } catch (_) { toast('Copie impossible : sélectionne le texte à la main.', 'error'); } return; }
            if (q('[data-at-printbib]')) { const bib = `<!doctype html><meta charset="utf-8"><title>Bibliographie</title><style>body{font:12pt/1.5 Georgia,serif;max-width:46rem;margin:2rem auto}li{margin:.3rem 0;list-style:none;text-indent:-1.5rem;padding-left:1.5rem}button{all:unset}</style><h1>${esc(P.project.title)}</h1>${ws.querySelector('[data-at-biblio]').innerHTML}`; if (window.LCNDA_UI?.openPrintDialog) { window.LCNDA_UI.openPrintDialog({title: 'Bibliographie', html: bib, photos: false}); return; } const w = window.open('', '_blank'); if (!w) return; w.document.write(bib); w.document.close(); w.print(); return; } // K13
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

    /* ═══════════ ⚙️ Réglages → Atelier de recherche : tout se règle ici ═══════════ */
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
    // Réglages enregistrés sous un nom (comme les mises en page de l'Apparence), à appliquer, exporter, importer
    const PROFILES_KEY = 'genealogie-atelier-profiles';
    const profiles = () => { try { const p = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); return Array.isArray(p) ? p : []; } catch (_) { return []; } };
    const saveProfiles = list => { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch (_) { toast('Enregistrement impossible (place du navigateur ?).', 'error'); } };
    const str = (v, max = 200) => typeof v === 'string' ? v.slice(0, max) : '';
    const okKey = k => typeof k === 'string' && /^[a-z0-9_]{1,40}$/i.test(k);
    const cleanTree = (t, depth = 0) => Array.isArray(t) && depth < 30 ? t.slice(0, 500).filter(n => n && typeof n.name === 'string' && n.name.trim()).map(n => ({name: str(n.name), icon: str(n.icon, 16), children: cleanTree(n.children, depth + 1)})) : [];
    const FIELD_KINDS = ['text', 'longtext', 'date', 'number', 'select', 'checkbox', 'url', 'person', 'place'];
    /** Réglages reçus d'un fichier : seulement ce que cet écran sait produire, avec des valeurs du bon genre. */
    function cleanCfg(raw) {
        const r = raw && typeof raw === 'object' ? raw : {};
        const base = x => ({key: x.key, icon: str(x.icon, 16), label: str(x.label), hidden: !!x.hidden});
        const nav = (Array.isArray(r.nav) ? r.nav : []).filter(x => x && okKey(x.key)).slice(0, 200).map(x => x.custom ? {...base(x), custom: true, filter: (f => ({types: (Array.isArray(f.types) ? f.types : []).filter(okKey).slice(0, 50), tags: (Array.isArray(f.tags) ? f.tags : []).map(t => str(t, 60)).filter(Boolean).slice(0, 50), tagMode: f.tagMode === 'any' ? 'any' : 'all',
            read: Object.keys(READ).includes(f.read) ? f.read : '', text: str(f.text), from: str(String(f.from ?? ''), 6), to: str(String(f.to ?? ''), 6), folder: str(f.folder), starred: !!f.starred, todo: !!f.todo,
            ...(Array.isArray(f.rules) ? {rules: f.rules.filter(r => r && VIEW_RULES[r.kind]).slice(0, 40).map(r => ({kind: r.kind, not: !!r.not, value: str(String(r.value ?? ''), 200), from: str(String(r.from ?? ''), 6), to: str(String(r.to ?? ''), 6), mode: r.mode === 'any' ? 'any' : 'all', values: (Array.isArray(r.values) ? r.values : []).map(v => str(String(v), 60)).filter(Boolean).slice(0, 60)}))} : {}),
            match: f.match === 'any' ? 'any' : 'all', sort: f.sort && ['title', 'creator', 'year', 'type', 'added'].includes(f.sort.col) ? {col: f.sort.col, dir: f.sort.dir === -1 ? -1 : 1} : null}))(x.filter && typeof x.filter === 'object' ? x.filter : {})} : base(x));
        const types = (Array.isArray(r.types) ? r.types : []).filter(x => x && okKey(x.key)).slice(0, 200).map(x => x.custom ? {...base(x), custom: true, titleLabel: str(x.titleLabel) || 'Titre', help: str(x.help),
            fields: (Array.isArray(x.fields) ? x.fields : []).filter(f => f && okKey(f.key) && FIELD_KINDS.includes(f.type)).slice(0, 80).map(f => ({key: f.key, type: f.type, label: str(f.label) || 'Champ', width: f.width === 'half' ? 'half' : 'full', options: (Array.isArray(f.options) ? f.options : []).map(o => str(o, 80)).filter(Boolean).slice(0, 60), placeholder: str(f.placeholder), help: str(f.help), required: !!f.required}))} : base(x));
        const plans = (Array.isArray(r.plans) ? r.plans : []).filter(x => x && okKey(x.key)).slice(0, 200).map(x => x.custom ? {key: x.key, label: str(x.label) || 'Plan', hidden: !!x.hidden, custom: true, tree: cleanTree(x.tree)} : {key: x.key, label: str(x.label), hidden: !!x.hidden});
        const folders = {closed: str(r.folders?.closed, 16) || '📁', open: str(r.folders?.open, 16) || '📂'};
        return {nav, types, plans, folders};
    }
    const cfgSummary = c => { const n = c || {}; const mine = list => (list || []).filter(x => x.custom).length; const hidden = list => (list || []).filter(x => x.hidden).length;
        return [`menu : ${mine(n.nav) ? plural(mine(n.nav), 'vue à moi', 'vues à moi') : 'pas de vue à moi'}${hidden(n.nav) ? `, ${plural(hidden(n.nav), 'masqué', 'masqués')}` : ''}`, `${plural(mine(n.types), 'sorte à moi', 'sortes à moi')}${hidden(n.types) ? `, ${plural(hidden(n.types), 'masquée', 'masquées')}` : ''}`, `dossiers ${n.folders?.closed || '📁'}${n.folders?.open || '📂'}`, `${plural(mine(n.plans), 'plan à moi', 'plans à moi')}`].join(' · '); };
    const applyCfg = settings => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cleanCfg(settings))); } catch (_) {} CFG = loadCfg(); };
    // ⤓ un fichier « lcnda-reglage-atelier-<nom>.json » (le format commun des réglages enregistrés)
    const downloadCfg = (name, settings) => A().exportSettingFile ? A().exportSettingFile('atelier', name, {settings: cleanCfg(settings)}) : ext.downloadText(`reglages-atelier-${String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 50) || 'lcnda'}.lcnda-atelier.json`,
        JSON.stringify({type: 'lcnda-atelier-reglages', version: 1, name, exported: new Date().toISOString(), settings: cleanCfg(settings)}, null, 1));
    ext.atelierSavePlanFromProject = () => {
        if (!P) return;
        const walk = parent => kids(parent).map(f => ({name: f.name, icon: f.icon || '', children: walk(Number(f.id))}));
        const tree = walk(0);
        if (!tree.length) return toast('Ce projet n’a pas de dossiers.', 'error');
        CFG.plans.push({key: uid('p_'), label: 'Plan de « ' + P.project.title.slice(0, 50) + ' »', tree, custom: true}); saveCfg();
        toast('Plan enregistré : il est proposé à la création d’un projet (Réglages → Atelier pour le renommer).');
    };
    /** « Copier pour le modifier » une entrée de l'app : la vue équivalente en critères… */
    const NAV_AS_FILTER = {
        overview: {rules: []}, all: {rules: []}, starred: {rules: [{kind: 'starred'}]}, unfiled: {rules: [{kind: 'unfiled'}]},
        tasks: {rules: [{kind: 'type', values: ['task']}], sort: {col: 'year', dir: 1}}, timeline: {rules: [{kind: 'years', from: '', to: ''}], sort: {col: 'year', dir: 1}},
        people: {rules: [{kind: 'type', values: ['person']}]}, map: {rules: [{kind: 'type', values: ['place']}]}, biblio: {rules: [{kind: 'type', values: ['reference']}], sort: {col: 'creator', dir: 1}},
    };
    /** … et la sorte d'élément équivalente, avec des champs simples qui reprennent ceux du formulaire de l'app. */
    function builtinTypeAsCustom(t) {
        const f = (label, type = 'text', more = {}) => ({key: uid('f'), type, label, width: 'full', ...more});
        const half = (label, type = 'text', more = {}) => f(label, type, {width: 'half', ...more});
        const FIELDS = {
            reference: [half('Sorte de référence', 'select', {options: Object.values(REF_KINDS)}), half('Auteur(s)'), half('Date'), half('Éditeur, revue'), half('Lieu d’édition'), half('Pages'), f('Lien internet', 'url'), half('Lecture', 'select', {options: Object.values(READ).filter(x => x !== '—')}), f('Notes', 'longtext')],
            note: [f('Texte', 'longtext')],
            quote: [f('Citation', 'longtext', {required: true}), half('Source'), half('Page')],
            media: [f('Description', 'longtext'), half('Date', 'date'), half('Cote, référence')],
            person: [f('Personne de la base', 'person'), half('Rôle'), half('Dates'), f('Notes', 'longtext')],
            place: [f('Lieu', 'place'), f('Notes', 'longtext')],
            event: [half('Date', 'date'), half('Lieu', 'place'), f('Description', 'longtext')],
            link: [f('Adresse', 'url', {required: true}), f('Notes', 'longtext')],
            task: [half('Échéance', 'date'), half('Priorité', 'select', {options: ['haute', 'normale', 'basse']}), half('Fait', 'checkbox'), f('Notes', 'longtext')],
            draft: [f('Texte', 'longtext'), half('Avancement', 'select', {options: Object.values(STAGES)})],
        };
        return {key: t.key, icon: t.icon, label: t.label, titleLabel: 'Titre', help: TYPES[t.key]?.[2] || '', fields: FIELDS[t.key] || [f('Texte', 'longtext')]};
    }
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
        const copyBtn = (attr, what) => `<button type="button" class="button small secondary h-cfg-copy" ${attr} title="Faire ${what} à moi à partir de celle-ci, pour la modifier (l’originale ne change pas)"><span aria-hidden="true">⧉</span><span class="h-cfg-copy-text"> Copier pour le modifier</span></button>`;
        const navExtra = x => `<span class="h-cfg-actions">${x.key === 'trash' ? '' : copyBtn('data-cfg-view-copy', 'une vue')}${x.custom ? `<button type="button" class="button small secondary" data-cfg-view-edit>Filtre…</button><button type="button" class="icon-button danger" data-cfg-del title="Supprimer">🗑</button>` : ''}</span>`;
        const typeExtra = x => `<span class="h-cfg-actions">${copyBtn('data-cfg-type-copy', 'une sorte d’élément')}${x.custom ? `<button type="button" class="button small secondary" data-cfg-type-edit>Champs (${(x.fields || []).length})…</button><button type="button" class="icon-button danger" data-cfg-del title="Supprimer">🗑</button>` : ''}</span>`;
        const planExtra = x => `<small class="muted">${plural(countTree(x.tree), 'dossier', 'dossiers')}</small><span class="h-cfg-actions">${x.custom ? `<button type="button" class="button small secondary" data-cfg-plan-edit>Modifier…</button><button type="button" class="icon-button danger" data-cfg-del title="Supprimer">🗑</button>` : copyBtn('data-cfg-plan-copy', 'un plan')}</span>`;
        ws.innerHTML = `<section class="page collection-page h-cfg">${`<header class="page-header"><div><span class="eyebrow">RÉGLAGES</span><h2>📚 Atelier de recherche</h2><p>Les réglages de l’Atelier (Enquêtes → Atelier) : l’ordre et les émojis du menu d’un projet, tes propres vues, les sortes d’éléments (et les tiennes, avec leurs champs), les émojis des dossiers et tes plans de départ. Tout est enregistré tout de suite.</p></div><div class="page-actions"><button type="button" class="button secondary" data-cfg-open>Ouvrir l’Atelier</button></div></header>`}
            <section class="maintenance-panel"><div class="h-cfg-head"><h3>1. Le menu de gauche d’un projet <small class="muted">et mes vues (filtres)</small></h3><button type="button" class="button small secondary" data-cfg-reset-sec="nav" title="Remettre cette partie comme au départ">↺ Remettre comme au départ</button></div><p class="muted">Monte, descends, change l’émoji ou le nom, masque ce dont tu ne te sers pas (la Corbeille reste toujours). Une <b>vue à toi</b> regroupe les éléments selon tes critères (ex. « 📕 À lire » : les références à lire ; « 🖼 Gravures » : les images et références « gravure »).</p>
                <div class="h-cfg-list">${CFG.nav.map((x, i, l) => row('nav', x, i, l, navExtra(x))).join('')}</div><button type="button" class="button small" data-cfg-view-add>＋ Ma propre vue (un filtre)</button></section>
            <section class="maintenance-panel"><div class="h-cfg-head"><h3>2. Les sortes d’éléments <small class="muted">ce qu’on ajoute avec « ＋ Ajouter », avec ses champs</small></h3><button type="button" class="button small secondary" data-cfg-reset-sec="types" title="Remettre cette partie comme au départ">↺ Remettre comme au départ</button></div><p class="muted">L’ordre du menu « ＋ Ajouter » et de « Toutes les sortes ». Une sorte masquée ne se propose plus, mais ce qui existe déjà reste visible. <b>Ta propre sorte</b> a les champs que tu veux (ex. « 🎞 Plaque de lanterne » : sujet, fabricant, dimensions, état, lieu de conservation…).</p>
                <div class="h-cfg-list">${CFG.types.map((x, i, l) => row('types', x, i, l, typeExtra(x))).join('')}</div><button type="button" class="button small" data-cfg-type-add>＋ Ma propre sorte d’élément (avec mes champs : texte, lien, date…)</button></section>
            <section class="maintenance-panel"><div class="h-cfg-head"><h3>3. Les dossiers</h3><button type="button" class="button small secondary" data-cfg-reset-sec="folders" title="Remettre cette partie comme au départ">↺ Remettre comme au départ</button></div><p class="muted">L’émoji des dossiers qui n’en ont pas. Chaque dossier peut aussi avoir le sien : dans un projet, survole le dossier puis ✎.</p>
                <div class="form-grid"><label>Dossier fermé ${iconInput('data-cfg-folder="closed"', CFG.folders.closed)}</label><label>Dossier ouvert ${iconInput('data-cfg-folder="open"', CFG.folders.open)}</label></div></section>
            <section class="maintenance-panel"><div class="h-cfg-head"><h3>4. Les plans de départ</h3><button type="button" class="button small secondary" data-cfg-reset-sec="plans" title="Remettre cette partie comme au départ">↺ Remettre comme au départ</button></div><p class="muted">Proposés quand on crée un projet. Range-les, masque ceux qui ne te servent pas, crée les tiens (ou copie un plan de l’app pour le changer). Astuce : dans un projet, « Exporter… → Enregistrer ce plan » garde ses dossiers comme plan.</p>
                <div class="h-cfg-list">${CFG.plans.map((x, i, l) => row('plans', x, i, l, planExtra(x))).join('')}</div><button type="button" class="button small" data-cfg-plan-add>＋ Mon plan</button></section>
            <section class="maintenance-panel"><div class="h-cfg-head"><h3>5. Garder ces réglages sous un nom</h3><button type="button" class="button small secondary" data-cfg-pexport-now title="Un fichier .json avec les réglages tels qu’ils sont maintenant">⤓ Exporter les réglages actuels</button></div><p class="muted">Garde tous ces réglages (menu, sortes d’éléments, dossiers, plans) sous un nom, pour y revenir plus tard, ou les envoyer à quelqu’un : il les importe ici. Les projets et leurs éléments ne sont pas dedans.</p>
                <div data-presets-slot="atelier"></div></section>
            <div class="page-actions"><button type="button" class="button secondary danger" data-cfg-reset>↺ Remettre comme au départ</button></div></section>`;
        const again = () => ext.maintenance.atelier(S().workspaceToken);
        const putProfile = (name, settings, at = -1) => { const l = profiles(), i = l.findIndex(x => x.name === name), it = {name, saved: new Date().toISOString(), settings}; if (i >= 0) l[i] = it; else if (at >= 0) l.splice(at, 0, it); else l.push(it); saveProfiles(l); };
        const frame = window.LCNDA_UI.presetsFrame({id: 'atelier', what: 'tous ces réglages (menu, sortes d’éléments, dossiers, plans)', quietApply: true,
            list: () => profiles().map(x => ({name: String(x?.name || 'Sans nom'), date: [x?.saved ? new Date(x.saved).toISOString() : '', x?.from ? `reçus de ${x.from}` : ''].filter(Boolean).join(' · ')})),
            apply: async i => { const x = profiles()[i]; if (!await A().confirmBox(`Appliquer les réglages « ${x.name} » ?\n\nLes réglages actuels de l’Atelier seront remplacés (enregistre-les avant si tu veux les garder). Tes projets ne changent pas.`, {title: 'Appliquer des réglages', okLabel: 'Appliquer les réglages'})) return false; applyCfg(x.settings); toast(`Réglages « ${x.name} » appliqués.`); again(); return false; },
            save: name => putProfile(name, cleanCfg(readCfg())),
            replace: i => { const l = profiles(); l[i] = {...l[i], saved: new Date().toISOString(), settings: cleanCfg(readCfg())}; saveProfiles(l); },
            rename: (i, name) => { const l = profiles(); l[i].name = name; saveProfiles(l); },
            duplicate: i => { const l = profiles(), x = l[i], nm = window.LCNDA_UI.freeName(x.name, l.map(y => y.name)); putProfile(nm, JSON.parse(JSON.stringify(x.settings || {})), i + 1); toast(`Copie « ${nm} » créée.`); },
            exportOne: i => { const x = profiles()[i]; downloadCfg(x.name, x.settings); return false; },
            remove: i => { const l = profiles(), x = l[i]; A().undoLocalChange(`Réglages « ${x.name} » supprimés`, [PROFILES_KEY], () => { l.splice(i, 1); saveProfiles(l); }, () => { if (A().state?.module === 'maintenance') again(); }); },
            importOne: async () => {
                // le format commun, et aussi les fichiers d'avant (« lcnda-atelier-reglages »)
                const got = await A().importSettingFile('atelier', {names: profiles().map(x => x.name), check: d => d.settings && typeof d.settings === 'object',
                    legacy: j => j?.type === 'lcnda-atelier-reglages' && j.settings && typeof j.settings === 'object' ? {nom: str(j.name, 60) || 'Réglages reçus', donnees: {settings: j.settings, author: j.author}} : null});
                if (!got) return false;
                const l = profiles(); l.push({name: got.nom, saved: new Date().toISOString(), from: str(got.donnees.author, 60), settings: cleanCfg(got.donnees.settings)}); saveProfiles(l);
                toast(`Réglages « ${got.nom} » importés : clique sur « Appliquer » pour les utiliser.`); }});
        ws.querySelector('[data-presets-slot]').replaceWith(frame);
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
        ws.addEventListener('click', async e => {
            const t = e.target, [sec, i] = at(t);
            if (t.closest('[data-cfg-emoji]')) { const input = t.closest('.h-at-iconfield').querySelector('input'); return ext.pickEmoji?.(input); }
            if (t.closest('[data-cfg-move]')) { const l = listOf(sec), j = i + Number(t.closest('[data-cfg-move]').dataset.cfgMove); if (j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; saveCfg(); again(); } return; }
            if (t.closest('[data-cfg-del]')) { const x = listOf(sec)[i]; A().undoLocalChange(`« ${x.label} » supprimé${sec === 'types' ? ' (les éléments déjà faits gardent leurs valeurs)' : ''}`, [CFG_KEY], () => { listOf(sec).splice(i, 1); saveCfg(); }, () => { CFG = loadCfg(); if (A().state?.module === 'maintenance') again(); }); again(); return; }
            if (t.closest('[data-cfg-view-add]')) return viewDialog(null);
            if (t.closest('[data-cfg-view-edit]')) return viewDialog(CFG.nav[i]);
            if (t.closest('[data-cfg-type-add]')) return typeDialog(null);
            if (t.closest('[data-cfg-type-edit]')) return typeDialog(CFG.types[i]);
            if (t.closest('[data-cfg-view-copy]')) { const x = CFG.nav[i]; return viewDialog({key: '', icon: x.icon, label: x.label + ' (ma version)', filter: x.custom ? JSON.parse(JSON.stringify(x.filter || {})) : (NAV_AS_FILTER[x.key] || {rules: []})}, true); }
            if (t.closest('[data-cfg-type-copy]')) { const x = CFG.types[i]; return typeDialog({...JSON.parse(JSON.stringify(x.custom ? x : builtinTypeAsCustom(x))), key: uid('x_'), label: x.label + ' (ma version)', custom: true, hidden: false, builtin: false}, {}, true); }
            if (t.closest('[data-cfg-plan-add]')) return planDialog(null);
            if (t.closest('[data-cfg-plan-edit]')) return planDialog(CFG.plans[i]);
            if (t.closest('[data-cfg-plan-copy]')) { const x = CFG.plans[i]; return planDialog({key: '', label: x.label + ' (ma version)', tree: JSON.parse(JSON.stringify(x.tree || [])), custom: true}, true); }
            const rs = t.closest('[data-cfg-reset-sec]');
            if (rs) return resetSections([rs.dataset.cfgResetSec]);
            if (t.closest('[data-cfg-pexport-now]')) { downloadCfg('reglages actuels', readCfg()); return; }
            if (t.closest('[data-cfg-reset]')) return resetSections(['nav', 'types', 'folders', 'plans']);
        }, {signal: ws._cfgCtl.signal});

        /**
         * Remet une ou plusieurs parties comme au départ (ordre, noms, émojis, masqués de l'app). S'il y a des éléments créés à la main
         * (vues, sortes, plans), on demande : les garder (mis à la fin, juste avant la Corbeille pour le menu) ou les supprimer.
         */
        async function resetSections(secs) {
            const NAMES = {nav: 'le menu de gauche', types: 'les sortes d’éléments', folders: 'les émojis des dossiers', plans: 'les plans de départ'};
            const KIND = {nav: 'vue', types: 'sorte d’élément', plans: 'plan'};
            const builtinKeys = {nav: NAV_BUILTIN.map(x => x[0]), types: Object.keys(TYPES), plans: Object.keys(PLANS)};
            const mine = secs.filter(sec => sec !== 'folders').flatMap(sec => CFG[sec].filter(x => x.custom).map(x => ({sec, x})));
            const what = secs.length > 1 ? 'tous les réglages de l’Atelier' : NAMES[secs[0]];
            const doIt = keep => {
                const raw = readCfg();
                secs.forEach(sec => {
                    if (sec === 'folders') { delete raw.folders; return; }
                    const own = keep ? CFG[sec].filter(x => x.custom) : [];
                    const base = builtinKeys[sec].map(key => ({key}));
                    if (sec === 'nav') { const tr = base.findIndex(x => x.key === 'trash'); base.splice(tr, 0, ...own); raw.nav = base; }
                    else raw[sec] = [...base, ...own];
                });
                try { localStorage.setItem(CFG_KEY, JSON.stringify(raw)); } catch (_) {}
                CFG = loadCfg();
                toast(keep && mine.length ? `Remis comme au départ ; ${plural(mine.length, 'élément à toi gardé', 'éléments à toi gardés')} à la fin.` : 'Remis comme au départ.');
                again();
            };
            if (!mine.length) { if (await A().confirmBox(`Remettre ${what} comme au départ ?`, {title: 'Comme au départ', okLabel: 'Remettre comme au départ', danger: true})) doIt(false); return; }
            dialog({eyebrow: 'RÉINITIALISER', title: `Remettre ${what} comme au départ`, submitLabel: 'Garder mes éléments (mis à la fin)',
                body: `<p>Les réglages de l’app reviennent comme au départ : ordre, noms, émojis, éléments masqués.</p>
                    <p>Tu as aussi créé toi-même :</p><ul class="h-cfg-mine">${mine.map(({sec, x}) => `<li>${esc(x.icon || '')} <b>${esc(x.label)}</b> <small class="muted">(${KIND[sec]})</small></li>`).join('')}</ul>
                    <p><b>Garder mes éléments</b> : ils restent, placés à la fin${secs.includes('nav') ? ' (dans le menu, juste avant la Corbeille)' : ''}.<br><b>Supprimer</b> : ils sont supprimés aussi${secs.includes('types') ? ' (les éléments déjà faits dans tes projets gardent leurs valeurs)' : ''}.</p>`,
                onSubmit: () => doIt(true),
                onDelete: () => doIt(false),
            });
        }
        function viewDialog(view, copy = false) {
            const f = view?.filter || {}, isNew = !view || copy;
            let rules = JSON.parse(JSON.stringify(viewRules(f)));
            const SORTS = [['', 'comme dans la liste (titre)'], ['title', 'titre'], ['creator', 'auteur, créateur'], ['year', 'date'], ['added', 'date d’ajout'], ['type', 'sorte d’élément']];
            const inputs = (r, i) => { const v = esc(r.value || '');
                switch (r.kind) {
                    case 'type': return `<span class="h-vr-chips">${CFG.types.map(t => `<label class="checkbox-line"><input type="checkbox" data-vr="values" value="${esc(t.key)}" ${(r.values || []).includes(t.key) ? 'checked' : ''}> ${esc(t.icon)} ${esc(t.label)}</label>`).join('')}</span>`;
                    case 'kind': return `<select data-vr="value">${Object.entries(REF_KINDS).map(([k, l]) => `<option value="${k}" ${r.value === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
                    case 'tags': return `<input data-vr="tags" value="${esc((r.values || []).join(', '))}" placeholder="optique, gravure (vide : au moins une étiquette)"><select data-vr="mode"><option value="all" ${r.mode !== 'any' ? 'selected' : ''}>toutes</option><option value="any" ${r.mode === 'any' ? 'selected' : ''}>au moins une</option></select>`;
                    case 'read': return `<select data-vr="value">${Object.entries(READ).filter(([k]) => k).map(([k, l]) => `<option value="${k}" ${r.value === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
                    case 'priority': return `<select data-vr="value">${['haute', 'normale', 'basse'].map(o => `<option ${(r.value || 'haute') === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
                    case 'stage': return `<select data-vr="value">${Object.entries(STAGES).map(([k, l]) => `<option value="${k}" ${r.value === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
                    case 'text': return `<input data-vr="value" value="${v}" placeholder="un mot, un nom…">`;
                    case 'author': return `<input data-vr="value" value="${v}" placeholder="Le Goff, Basset…">`;
                    case 'folder': return `<input data-vr="value" value="${v}" placeholder="nom du dossier (avec ses sous-dossiers)">`;
                    case 'years': return `de <input type="number" data-vr="from" value="${esc(r.from || '')}" placeholder="1700" class="h-lr-year"> à <input type="number" data-vr="to" value="${esc(r.to || '')}" placeholder="1850" class="h-lr-year">`;
                    case 'recent': return `<input type="number" min="1" data-vr="value" value="${esc(r.value || '7')}" class="h-lr-year"> jours`;
                    default: return '<small class="muted">rien à régler</small>';
                } };
            const rowHtml = (r, i) => `<div class="h-vr-row" data-vr-i="${i}"><span class="h-vr-name">${VIEW_RULES[r.kind][0]} ${esc(VIEW_RULES[r.kind][1])}</span><span class="h-vr-inputs">${inputs(r, i)}</span>
                <label class="checkbox-line h-vr-not" title="Inverser : tout sauf ça"><input type="checkbox" data-vr="not" ${r.not ? 'checked' : ''}> pas</label>
                <span class="h-rb-tools"><button type="button" class="icon-button" data-vr-move="-1" title="Monter" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-button" data-vr-move="1" title="Descendre" ${i === rules.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="icon-button danger" data-vr-del title="Retirer">🗑</button></span></div>`;
            dialog({eyebrow: 'MA PROPRE VUE', title: copy ? 'Copie à modifier' : isNew ? 'Nouvelle vue' : view.label, wide: true, submitLabel: 'Enregistrer',
                body: `<div class="h-cfg-explain"><b>Une vue est un filtre</b> : une entrée du menu de gauche qui montre les éléments du projet répondant à tes critères (ex. « 📕 À lire »). Elle n’a pas de champs à remplir.
                    ${isNew && !copy ? '<br>Tu veux plutôt <b>une nouvelle sorte d’élément</b>, avec tes champs à remplir (texte libre, lien internet, date, personne, lieu…) ? <button type="button" class="link-button" data-vr-totype>Créer une sorte d’élément à la place →</button>' : ''}</div>
                    <div class="form-grid"><label>Nom<input name="label" required value="${esc(view?.label || '')}" placeholder="À lire"></label><label>Émoji${iconInput('name="icon"', view?.icon || '🔎')}</label></div>
                    <h4>Les critères</h4><p class="muted">Clique sur un critère pour l’ajouter, puis règle-le. Range-les avec ↑ ↓ ; « pas » garde tout <i>sauf</i> ce critère. Sans critère : tout le projet.</p>
                    <div class="h-be-palette">${Object.entries(VIEW_RULES).map(([k, [icon, label]]) => `<button type="button" class="button small secondary" data-vr-add="${k}">${icon} ${esc(label)}</button>`).join('')}</div>
                    <div class="h-tabs h-vr-match"><label class="checkbox-line"><input type="radio" name="match" value="all" ${f.match !== 'any' ? 'checked' : ''}> tous les critères (ET)</label><label class="checkbox-line"><input type="radio" name="match" value="any" ${f.match === 'any' ? 'checked' : ''}> au moins un (OU)</label></div>
                    <div class="h-vr-list" data-vr-list></div>
                    <h4>L’ordre d’affichage</h4><div class="form-grid"><label>Trier par<select name="sortcol">${SORTS.map(([k, l]) => `<option value="${k}" ${(f.sort?.col || '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                        <label>Sens<select name="sortdir"><option value="1" ${f.sort?.dir !== -1 ? 'selected' : ''}>croissant (A → Z, ancien → récent)</option><option value="-1" ${f.sort?.dir === -1 ? 'selected' : ''}>décroissant (Z → A, récent → ancien)</option></select></label></div>`,
                onOpen: dl => {
                    dl.querySelector('[data-cfg-emoji]').addEventListener('click', () => ext.pickEmoji?.(dl.querySelector('[name=icon]')));
                    dl.querySelector('[data-vr-totype]')?.addEventListener('click', () => { const name = dl.querySelector('[name=label]').value.trim(), icon = dl.querySelector('[name=icon]').value.trim(); dl.close(); typeDialog(null, {label: name, icon: icon && icon !== '🔎' ? icon : '🧩'}); });
                    const box = dl.querySelector('[data-vr-list]');
                    const read = () => { box.querySelectorAll('[data-vr-i]').forEach(row => { const r = rules[Number(row.dataset.vrI)]; if (!r) return;
                        row.querySelectorAll('[data-vr]').forEach(el => { const k = el.dataset.vr;
                            if (k === 'values') r.values = [...row.querySelectorAll('[data-vr=values]:checked')].map(x => x.value);
                            else if (k === 'tags') r.values = el.value.split(',').map(x => x.trim()).filter(Boolean);
                            else if (k === 'not') r.not = el.checked; else r[k] = el.value; }); }); };
                    const paint = () => { box.innerHTML = rules.map(rowHtml).join('') || '<p class="muted">Aucun critère : la vue montre tout le projet.</p>'; };
                    paint();
                    dl.querySelectorAll('[data-vr-add]').forEach(b => b.addEventListener('click', () => { read(); const k = b.dataset.vrAdd; rules.push({kind: k, value: k === 'recent' ? '7' : k === 'read' ? 'a_lire' : k === 'kind' ? 'livre' : k === 'priority' ? 'haute' : k === 'stage' ? 'premier_jet' : '', values: []}); paint(); box.lastElementChild?.querySelector('input:not([type=checkbox]),select')?.focus(); }));
                    box.addEventListener('click', e => { const row = e.target.closest('[data-vr-i]'); if (!row) return; const i = Number(row.dataset.vrI);
                        if (e.target.closest('[data-vr-del]')) { read(); rules.splice(i, 1); paint(); }
                        const mv = e.target.closest('[data-vr-move]'); if (mv) { read(); const j = i + Number(mv.dataset.vrMove); if (j >= 0 && j < rules.length) { [rules[i], rules[j]] = [rules[j], rules[i]]; paint(); } } });
                    dl._readRules = () => { read(); return rules; };
                },
                onSubmit: form => {
                    const fd = new FormData(form), rl = form.closest('dialog')._readRules();
                    const filter = {rules: rl.map(r => ({kind: r.kind, not: !!r.not, value: r.value || '', from: r.from || '', to: r.to || '', mode: r.mode === 'any' ? 'any' : 'all', values: r.values || []})), match: fd.get('match') === 'any' ? 'any' : 'all',
                        sort: fd.get('sortcol') ? {col: fd.get('sortcol'), dir: Number(fd.get('sortdir')) === -1 ? -1 : 1} : null};
                    const entry = {key: (!copy && view?.key) || uid('v_'), icon: String(fd.get('icon') || '🔎').trim() || '🔎', label: String(fd.get('label')).trim(), custom: true, filter, hidden: !copy && !!view?.hidden};
                    if (isNew) CFG.nav.splice(Math.max(0, CFG.nav.findIndex(x => x.key === 'trash')), 0, entry); else Object.assign(CFG.nav.find(x => x.key === view.key), entry);
                    saveCfg(); toast('Vue enregistrée.'); again();
                },
            });
        }
        function typeDialog(type, preset = {}, copy = false) {
            const isNew = !type || copy, def = type ? JSON.parse(JSON.stringify(type)) : {key: uid('x_'), icon: preset.icon || '🧩', label: preset.label || '', titleLabel: 'Titre', help: '', fields: [{key: uid('f'), type: 'text', label: '', width: 'full'}], custom: true};
            const fieldRow = (f, i) => `<div class="h-cfg-field" data-cf-i="${i}"><input data-cf="label" value="${esc(f.label)}" placeholder="Nom du champ" required><select data-cf="type">${CUSTOM_FIELD_TYPES.map(([k, l]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
                <select data-cf="width"><option value="full" ${f.width !== 'half' ? 'selected' : ''}>pleine largeur</option><option value="half" ${f.width === 'half' ? 'selected' : ''}>demi-largeur</option></select>
                <input data-cf="options" value="${esc((f.options || []).join(', '))}" placeholder="choix séparés par des virgules" ${f.type === 'select' ? '' : 'hidden'}>
                <input data-cf="placeholder" value="${esc(f.placeholder || '')}" placeholder="exemple grisé (facultatif)"><label class="checkbox-line"><input type="checkbox" data-cf="required" ${f.required ? 'checked' : ''}> obligatoire</label>
                <span class="h-rb-tools"><button type="button" class="icon-button" data-cf-move="-1">↑</button><button type="button" class="icon-button" data-cf-move="1">↓</button><button type="button" class="icon-button danger" data-cf-del>🗑</button></span></div>`;
            dialog({eyebrow: 'MA PROPRE SORTE D’ÉLÉMENT', title: copy ? 'Copie à modifier' : isNew ? 'Nouvelle sorte' : type.label, wide: true, submitLabel: 'Enregistrer',
                body: `<div class="h-cfg-explain"><b>Une sorte d’élément</b> s’ajoute dans un projet avec « ＋ Ajouter », comme une référence ou une note, avec <b>tes champs</b> : texte court ou long, lien internet, date, nombre, liste de choix, case à cocher, personne de ta base, lieu sur la carte. Elle apparaît aussi dans « Toutes les sortes ».</div>
                    <div class="form-grid"><label>Nom<input name="label" required value="${esc(def.label)}" placeholder="Plaque de lanterne magique"></label><label>Émoji${iconInput('name="icon"', def.icon)}</label>
                    <label>Nom du champ titre<input name="titleLabel" value="${esc(def.titleLabel || 'Titre')}" placeholder="Titre, Sujet, Nom…"></label><label>Aide dans le menu <small>(facultatif)</small><input name="help" value="${esc(def.help || '')}" placeholder="Une plaque vue ou achetée"></label></div>
                    <h4>Les champs</h4><div data-cf-list>${def.fields.map(fieldRow).join('')}</div><button type="button" class="button small secondary" data-cf-add>＋ Champ</button>`,
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
                    saveCfg(); toast('Sorte d’élément enregistrée : elle est dans « ＋ Ajouter ».'); again();
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
