/**
 * 📚 Atelier de recherche (onglet Listes) — pour écrire une thèse, un livre, un article, préparer une exposition :
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
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes';
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

    /* ─────────── Citer à la française ─────────── */
    const year = i => String(i.data?.year || i.data?.date || '').match(/\d{3,4}/)?.[0] || '';
    const creatorsOf = (i, roles) => (i.data?.creators || []).filter(c => !roles || roles.includes(c.role));
    const nameUp = c => [c.last ? c.last.toLocaleUpperCase('fr-FR') : '', c.first].filter(Boolean).join(' ');
    const authorsTxt = list => list.length > 3 ? nameUp(list[0]) + ' et al.' : list.map(nameUp).join(', ').replace(/, ([^,]*)$/, ' et $1');
    const firstAuthor = i => { const c = creatorsOf(i)[0]; return c ? [c.last, c.first].filter(Boolean).join(' ') : ''; };
    /** Référence complète (texte, avec *italique* pour les titres d'ouvrages) */
    function cite(i, html = true) {
        const d = i.data || {}, it = t => t ? (html ? `<i>${esc(t)}</i>` : t) : '', tx = t => html ? esc(t) : t;
        const auth = authorsTxt(creatorsOf(i, ['auteur', 'graveur', 'photographe', 'illustrateur', 'autre']));
        const dir = creatorsOf(i, ['dir']);
        const pub = [d.place, d.publisher, d.year || d.date].filter(Boolean).map(tx).join(', ');
        const parts = [];
        const title = i.title;
        switch (d.kind) {
            case 'article': case 'presse': parts.push(auth && tx(auth), `« ${tx(title)} »`, it(d.container), d.volume && tx('vol. ' + d.volume), d.issue && tx('n° ' + d.issue), tx(d.date || d.year), d.pages && tx('p. ' + d.pages)); break;
            case 'chapitre': parts.push(auth && tx(auth), `« ${tx(title)} »`, 'dans ' + [dir.length ? tx(authorsTxt(dir) + ' (dir.)') : '', it(d.container)].filter(Boolean).join(', '), pub, d.pages && tx('p. ' + d.pages)); break;
            case 'these': parts.push(auth && tx(auth), it(title), tx('thèse'), pub); break;
            case 'archive': parts.push(tx(d.archive), d.call_number && tx(d.call_number), `« ${tx(title)} »`, tx(d.date || d.year)); break;
            case 'image': case 'objet': parts.push(auth && tx(auth), it(title), tx(d.technique), tx(d.date || d.year), tx(d.dimensions), tx(d.archive), d.call_number && tx(d.call_number)); break;
            case 'web': parts.push(auth && tx(auth), `« ${tx(title)} »`, it(d.container), tx(d.date || d.year), d.url && (html ? `<span class="h-at-url">${esc(d.url)}</span>` : d.url), d.accessed && tx(`consulté le ${d.accessed}`)); break;
            default: parts.push(auth || (dir.length ? tx(authorsTxt(dir) + ' (dir.)') : ''), it(title), d.edition && tx(d.edition), pub, d.pages && tx(d.pages + (/\d$/.test(d.pages) && !/[-–]/.test(d.pages) ? ' p.' : ''))); break;
        }
        let out = parts.filter(Boolean).join(', ');
        if (d.doi) out += html ? `, doi : ${esc(d.doi)}` : `, doi : ${d.doi}`;
        return /[.!?…]$/.test(out) ? out : out + '.';
    }
    const shortCite = i => `${firstAuthor(i).split(' ')[0] || i.title.slice(0, 30)}${year(i) ? ', ' + year(i) : ''}`;

    /* ─────────── BibTeX / RIS ─────────── */
    const BIB_TYPES = {livre: 'book', article: 'article', chapitre: 'incollection', these: 'phdthesis', archive: 'unpublished', image: 'misc', presse: 'article', web: 'online', objet: 'misc', autre: 'misc'};
    const RIS_TYPES = {livre: 'BOOK', article: 'JOUR', chapitre: 'CHAP', these: 'THES', archive: 'MANSCPT', image: 'ART', presse: 'NEWS', web: 'ELEC', objet: 'GEN', autre: 'GEN'};
    function toBibtex(refs) {
        const used = new Set();
        return refs.map(i => {
            const d = i.data || {};
            let key = ((creatorsOf(i)[0]?.last || 'ref') + (year(i) || '')).normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'ref';
            for (let k = 0, base = key; used.has(key); k++) key = base + String.fromCharCode(97 + k);
            used.add(key);
            const names = roles => creatorsOf(i, roles).map(c => [c.last, c.first].filter(Boolean).join(', ')).join(' and ');
            const f = {author: names(['auteur', 'graveur', 'photographe', 'illustrateur', 'autre']), editor: names(['dir']), translator: names(['trad']), title: i.title,
                [d.kind === 'article' || d.kind === 'presse' ? 'journal' : 'booktitle']: d.container, publisher: d.publisher, address: d.place, year: year(i), volume: d.volume, number: d.issue,
                pages: (d.pages || '').replace(/[–-]/, '--'), edition: d.edition, isbn: d.isbn, doi: d.doi, url: d.url, language: d.language, abstract: d.abstract, keywords: (i.tags || []).join(', '),
                note: [d.archive, d.call_number].filter(Boolean).join(', ')};
            return `@${BIB_TYPES[d.kind] || 'misc'}{${key},\n${Object.entries(f).filter(([, v]) => v).map(([k, v]) => `  ${k} = {${String(v).replace(/[{}]/g, '')}}`).join(',\n')}\n}`;
        }).join('\n\n') + '\n';
    }
    function toRis(refs) {
        return refs.map(i => {
            const d = i.data || {}, L = [['TY', RIS_TYPES[d.kind] || 'GEN'], ['TI', i.title]];
            creatorsOf(i).forEach(c => L.push([c.role === 'dir' ? 'ED' : 'AU', [c.last, c.first].filter(Boolean).join(', ')]));
            const [sp, ep] = String(d.pages || '').split(/[–-]/);
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
    const dateKey = i => { const d = i.data || {}; const v = i.type === 'task' ? d.due : i.type === 'reference' ? (d.date || d.year) : d.date; const m = String(v || '').match(/(\d{3,4})(?:-(\d{2})(?:-(\d{2}))?)?/); return m ? m[1].padStart(4, '0') + (m[2] || '00') + (m[3] || '00') : ''; };

    /* ═══════════ Les projets ═══════════ */
    ext.lists.research = async token => {
        const v = st();
        if (v.project) {
            try { await load(v.project); } catch (error) { v.project = 0; toast(error.message, 'error'); return ext.lists.research(token); }
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
        ws.innerHTML = `<section class="page collection-page h-at">${`<header class="page-header"><div><span class="eyebrow">LISTES</span><h2>📚 Atelier de recherche</h2><p>Pour écrire une thèse, un livre, un article ou préparer une exposition : un projet, ses dossiers et sous-dossiers sans limite (parties, chapitres, sources…), et tout ce que tu y ranges — références, archives, gravures, citations, notes, personnes de ta base, lieux, dates, tâches, brouillons. Bibliographie toute prête, chronologie, carte.</p></div><div class="page-actions"><button type="button" class="button" data-at-new>+ Projet</button></div></header>`}
            ${projects.length ? `<div class="h-at-projects">${projects.map(card).join('')}</div>` : empty('Aucun projet pour l’instant. Clique sur « + Projet » : par exemple « Les montreurs de vues d’optique, XVIIIe-XIXe siècles ».')}</section>`;
        ws.querySelector('[data-at-new]').addEventListener('click', () => projectDialog(null, data.kinds));
        ws.querySelectorAll('[data-at-open]').forEach(c => {
            const open = () => { Object.assign(st(), {project: Number(c.dataset.atOpen), node: 'overview', sel: [], tags: [], q: '', type: ''}); ext.lists.research(++S().workspaceToken); };
            c.addEventListener('click', open); c.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
        });
    };
    function projectDialog(p, kinds) {
        const isNew = !p; p = p || {kind: 'these', icon: '', color: '#0066cc', target_words: 0};
        const planTree = list => `<ul>${list.map(x => `<li>📁 ${esc(x.name)}${x.children.length ? planTree(x.children) : ''}</li>`).join('')}</ul>`;
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
                ${isNew ? `<h4>Plan de départ</h4><p class="muted">Des dossiers déjà prêts, que tu pourras renommer, déplacer, compléter ou supprimer.</p><div class="h-at-plans">${Object.entries(PLANS).map(([k, [label, tree]]) => `<label class="h-at-plan"><input type="radio" name="plan" value="${k}" ${k === (p.kind in PLANS ? p.kind : 'livre') ? 'checked' : ''}><strong>${esc(label)}</strong>${tree.length ? planTree(tree) : '<p class="muted">Aucun dossier</p>'}</label>`).join('')}</div>` : ''}`,
            onOpen: dl => { dl.querySelector('[name=kind]').addEventListener('change', e => { const r = dl.querySelector(`[name=plan][value="${e.target.value}"]`); if (r) r.checked = true; }); },
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form));
                const body = {id: p.id || 0, title: f.title, subtitle: f.subtitle, kind: f.kind, icon: f.icon, color: f.color, description: f.description, target_words: Number(f.target_words) || 0, deadline: f.deadline, status: form.archived?.checked ? 'archived' : 'active'};
                if (isNew) body.folders = PLANS[f.plan || 'vide'][1];
                const r = await post('save_atelier_project', body);
                Object.assign(st(), {project: r.result.id, node: 'overview', sel: [], tags: [], q: '', type: ''});
                toast(isNew ? 'Projet créé.' : 'Projet enregistré.');
                ext.lists.research(++S().workspaceToken);
            },
            onDelete: isNew ? null : async () => {
                if (!confirm(`Supprimer « ${p.title} » avec tous ses dossiers et ses ${plural(P?.items.length || 0, 'élément', 'éléments')} ? C’est définitif.`)) return false;
                await post('delete_atelier_project', {id: p.id}); st().project = 0; toast('Projet supprimé.'); ext.lists.research(++S().workspaceToken);
            },
        });
    }

    /* ═══════════ Un projet ouvert : dossiers | éléments | détail ═══════════ */
    const SPECIAL = [['overview', '📊', 'Vue d’ensemble'], ['all', '🗂️', 'Tout le projet'], ['starred', '⭐', 'Favoris'], ['unfiled', '📥', 'Non classés'], ['tasks', '✅', 'Tâches'], ['timeline', '🕰️', 'Chronologie'], ['people', '👥', 'Personnes'], ['map', '🗺️', 'Carte'], ['biblio', '📚', 'Bibliographie'], ['trash', '🗑️', 'Corbeille']];
    const reload = async (keepScroll = true) => { const v = st(); await load(v.project); renderProject(S().workspaceToken, keepScroll); };
    function nodeItems(node) {
        const v = st();
        let items = node === 'trash' ? P.items.filter(i => Number(i.trashed)) : live();
        if (typeof node === 'number') { const set = new Set(v.deep ? descendants(node) : [node]); items = items.filter(i => i.folders.some(f => set.has(f))); }
        if (node === 'starred') items = items.filter(i => Number(i.starred));
        if (node === 'unfiled') items = items.filter(i => !i.folders.length);
        if (v.type) items = items.filter(i => i.type === v.type);
        if (v.tags.length) items = items.filter(i => v.tags.every(t => (i.tags || []).includes(t)));
        if (v.q) { const q = v.q.toLowerCase(); items = items.filter(i => [i.title, JSON.stringify(i.data), (i.tags || []).join(' ')].join(' ').toLowerCase().includes(q)); }
        const s = v.sort, key = i => s.col === 'creator' ? firstAuthor(i) || i.data?.creator || '' : s.col === 'year' ? dateKey(i) : s.col === 'type' ? TYPES[i.type][1] : s.col === 'added' ? i.created_at : i.title;
        return items.sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'fr', {numeric: true, sensitivity: 'base'}) * s.dir);
    }
    function renderProject(token, keepScroll = false) {
        const v = st(), p = P.project, ws = A().$('#workspace');
        const scroll = keepScroll ? [...ws.querySelectorAll('[data-at-scroll]')].map(el => el.scrollTop) : [];
        if (typeof v.node === 'number' && !P.fById.has(v.node)) v.node = 'all';
        v.sel = v.sel.filter(id => P.byId.has(id));
        const target = Number(p.target_words), words = Number(p.words);
        // compte des éléments par dossier (directs)
        const counts = new Map(); live().forEach(i => i.folders.forEach(f => counts.set(f, (counts.get(f) || 0) + 1)));
        const folderNode = f => { const id = Number(f.id), ch = kids(id), open = !v.closed[id];
            return `<li class="h-at-node" data-at-folder="${id}"><div class="h-at-row ${v.node === id ? 'is-on' : ''}" draggable="true" data-at-go="${id}" style="${f.color ? `--at-fc:${esc(f.color)}` : ''}">
                ${ch.length ? `<button type="button" class="h-at-toggle" data-at-toggle="${id}" aria-label="${open ? 'Replier' : 'Déplier'}">${open ? '▾' : '▸'}</button>` : '<span class="h-at-toggle"></span>'}
                <span class="h-at-ficon">${esc(f.icon || (open && ch.length ? '📂' : '📁'))}</span><span class="h-at-fname">${esc(f.name)}</span>${counts.get(id) ? `<small class="h-at-count">${fmt(counts.get(id))}</small>` : ''}
                <span class="h-at-factions"><button type="button" data-at-fadd="${id}" title="Sous-dossier">＋</button><button type="button" data-at-fedit="${id}" title="Renommer, icône, couleur">✎</button></span></div>
                ${ch.length && open ? `<ul>${ch.map(folderNode).join('')}</ul>` : ''}</li>`; };
        const tagCounts = new Map(); live().forEach(i => (i.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
        const tags = [...tagCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
        const special = v.node === 'overview' || v.node === 'timeline' || v.node === 'people' || v.node === 'map' || v.node === 'biblio' || v.node === 'tasks';
        ws.innerHTML = `<section class="page collection-page h-at h-at-open" style="--at-color:${esc(p.color)}">
            <header class="h-at-head"><button type="button" class="button secondary small" data-at-home>← Projets</button><span class="h-at-head-icon">${esc(p.icon || KIND_ICONS[p.kind] || '📚')}</span>
                <div class="h-at-head-title"><h2>${esc(p.title)}</h2>${p.subtitle ? `<p class="muted">${esc(p.subtitle)}</p>` : ''}</div>
                ${target ? `<div class="h-at-words" title="Mots des brouillons"><div class="h-progress"><span style="width:${Math.min(100, Math.round(100 * words / target))}%"></span></div><small>${fmt(words)} / ${fmt(target)} mots</small></div>` : ''}
                <span class="h-at-head-actions"><button type="button" class="button small secondary" data-at-export>Exporter…</button><button type="button" class="button small secondary" data-at-pedit>Projet…</button></span></header>
            <div class="h-at-grid">
                <aside class="h-at-tree" data-at-scroll>
                    <ul class="h-at-special">${SPECIAL.map(([k, icon, label]) => { const c = k === 'all' ? live().length : k === 'trash' ? P.items.length - live().length : k === 'starred' ? live().filter(i => Number(i.starred)).length : k === 'unfiled' ? live().filter(i => !i.folders.length).length : k === 'tasks' ? live().filter(i => i.type === 'task' && !Number(i.data.done)).length : 0;
                        return `<li><div class="h-at-row ${v.node === k ? 'is-on' : ''}" data-at-go="${k}" ${k === 'trash' || k === 'all' || k === 'starred' || k === 'unfiled' ? `data-at-drop="${k}"` : ''}><span class="h-at-ficon">${icon}</span><span class="h-at-fname">${label}</span>${c ? `<small class="h-at-count">${fmt(c)}</small>` : ''}</div></li>`; }).join('')}</ul>
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
        const head = folder ? `<nav class="h-at-crumbs">${pathOf(node).map((f, i, arr) => i < arr.length - 1 ? `<button type="button" class="link-button" data-at-go="${f.id}">${esc(f.name)}</button> ›` : '').join(' ')}</nav><h3 class="h-at-ftitle">${esc(folder.icon || '📂')} ${esc(folder.name)}</h3>`
            : `<h3 class="h-at-ftitle">${SPECIAL.find(s => s[0] === node)?.slice(1).join(' ') || ''}</h3>`;
        const sortTh = (col, label) => `<th><button type="button" class="h-lv-sort" data-at-sort="${col}">${label}${v.sort.col === col ? (v.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
        const trash = node === 'trash';
        return `${head}
            ${folder ? `<details class="h-at-fnotes" ${folder.notes ? 'open' : ''}><summary>📝 Notes du dossier${folder.notes ? '' : ' <small class="muted">(vides)</small>'}</summary><textarea data-at-fnotes rows="4" placeholder="Ce que ce dossier doit contenir, le plan de la section, les idées…">${esc(folder.notes || '')}</textarea></details>` : ''}
            ${sub.length ? `<div class="h-at-subs">${sub.map(f => `<button type="button" class="h-at-sub" data-at-go="${f.id}" data-at-folder-drop="${f.id}">${esc(f.icon || '📁')} ${esc(f.name)}</button>`).join('')}</div>` : ''}
            <div class="h-at-toolbar">${trash ? (items.length ? '<button type="button" class="button small danger" data-at-emptytrash>Vider la corbeille</button>' : '') : `<div class="h-at-addmenu"><button type="button" class="button small" data-at-addmenu>+ Ajouter ▾</button><div class="h-at-menu" hidden>${Object.entries(TYPES).map(([k, [icon, label, help]]) => `<button type="button" data-at-add="${k}" title="${esc(help)}">${icon} ${esc(label)}</button>`).join('')}</div></div>
                <button type="button" class="button small secondary" data-at-import title="Fichier .bib ou .ris exporté d’un gestionnaire de bibliographie">⬇ Importer .bib / .ris</button>`}
                ${folder && kids(node).length ? `<label class="checkbox-line h-at-deep"><input type="checkbox" data-at-deep ${v.deep ? 'checked' : ''}> avec les sous-dossiers</label>` : ''}
                <select data-at-type><option value="">Toutes les sortes</option>${Object.entries(TYPES).map(([k, [icon, label]]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${icon} ${esc(label)}</option>`).join('')}</select>
                <input type="search" data-at-q value="${esc(v.q)}" placeholder="Chercher (titre, auteur, texte, étiquette…)"></div>
            ${v.sel.length > 1 ? `<div class="h-at-bulk"><strong>${plural(v.sel.length, 'élément choisi', 'éléments choisis')}</strong>
                ${trash ? '<button type="button" class="button small" data-at-bulk="restore">Restaurer</button><button type="button" class="button small danger" data-at-bulk="delete">Supprimer définitivement</button>'
                    : `<select data-at-bulkfolder><option value="">Ranger dans…</option>${folderOptions()}</select><button type="button" class="button small secondary" data-at-bulk="tag">🏷 Étiquette…</button><button type="button" class="button small secondary" data-at-bulk="star">⭐ Favoris</button>${folder ? '<button type="button" class="button small secondary" data-at-bulk="remove">Retirer de ce dossier</button>' : ''}<button type="button" class="button small secondary danger" data-at-bulk="trash">🗑 Corbeille</button>`}
                <button type="button" class="link-button" data-at-unsel>Aucun</button></div>` : ''}
            ${items.length ? `<table class="data-table h-at-table"><thead><tr><th class="h-at-c-star"></th>${sortTh('type', '')}${sortTh('title', 'Titre')}${sortTh('creator', 'Auteur, créateur')}${sortTh('year', 'Date')}<th class="h-at-c-att" title="Fichiers joints">📎</th></tr></thead>
                <tbody>${items.map(i => `<tr data-at-item="${i.id}" class="${v.sel.includes(Number(i.id)) ? 'is-sel' : ''} ${i.type === 'task' && Number(i.data.done) ? 'is-done' : ''}" draggable="true">
                    <td class="h-at-c-star"><button type="button" class="h-at-star ${Number(i.starred) ? 'is-on' : ''}" data-at-star="${i.id}" title="Favori">${Number(i.starred) ? '★' : '☆'}</button></td>
                    <td class="h-at-c-type" title="${esc(TYPES[i.type][1])}${i.type === 'reference' ? ' — ' + esc(REF_KINDS[i.data.kind] || '') : ''}">${TYPES[i.type][0]}</td>
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
            const p = P.project, byType = Object.keys(TYPES).map(k => [k, items.filter(i => i.type === k).length]).filter(([, c]) => c);
            const refs = items.filter(i => i.type === 'reference'), reads = Object.keys(READ).filter(Boolean).map(k => [k, refs.filter(i => i.data.read === k).length]);
            const tasks = items.filter(i => i.type === 'task' && !Number(i.data.done)).sort((a, b) => String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
            const drafts = items.filter(i => i.type === 'draft');
            const recent = [...items].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 8);
            const days = p.deadline ? Math.ceil((new Date(p.deadline + 'T12:00:00') - new Date()) / 864e5) : null;
            const wc = t => (String(t || '').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
            return `<h3 class="h-at-ftitle">📊 Vue d’ensemble</h3>
                ${p.description ? `<div class="h-at-problem"><span class="section-label">Problématique</span><p>${nl(p.description)}</p></div>` : ''}
                <div class="h-at-stats">${byType.map(([k, c]) => `<button type="button" class="h-at-stat" data-at-typejump="${k}"><span>${TYPES[k][0]}</span><b>${fmt(c)}</b><small>${esc(TYPES[k][1])}${c > 1 && !/s$/.test(TYPES[k][1]) ? 's' : ''}</small></button>`).join('') || '<p class="muted">Le projet est vide : choisis un dossier à gauche, puis « + Ajouter ».</p>'}</div>
                ${days !== null ? `<p class="${days < 0 ? 'h-at-late' : ''}">📆 ${days < 0 ? `Date de rendu dépassée de ${plural(-days, 'jour', 'jours')}` : `Rendu le ${new Date(p.deadline + 'T12:00:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'})} : encore ${plural(days, 'jour', 'jours')}`}${Number(p.target_words) && days > 0 ? ` · ${fmt(Math.max(0, Math.ceil((Number(p.target_words) - Number(p.words)) / days)))} mots par jour pour tenir l’objectif` : ''}</p>` : ''}
                <div class="h-at-cols">
                ${refs.length ? `<section><h4>📖 Lectures</h4>${reads.map(([k, c]) => `<div class="h-at-bar"><span>${esc(READ[k])}</span><b style="width:${refs.length ? Math.round(100 * c / refs.length) : 0}%"></b><em>${fmt(c)}</em></div>`).join('')}<small class="muted">${plural(refs.length, 'référence', 'références')}</small></section>` : ''}
                ${drafts.length ? `<section><h4>✍️ Brouillons</h4>${drafts.map(d => { const w = wc(d.data.text), t = Number(d.data.target); return `<button type="button" class="h-at-line" data-at-pick="${d.id}">${esc(d.title)} <small class="muted">${fmt(w)}${t ? ' / ' + fmt(t) : ''} mots · ${esc(STAGES[d.data.stage] || '')}</small></button>`; }).join('')}</section>` : ''}
                ${tasks.length ? `<section><h4>✅ À faire</h4>${tasks.slice(0, 8).map(t => `<label class="checkbox-line h-at-task ${t.data.due && t.data.due < new Date().toISOString().slice(0, 10) ? 'h-at-late' : ''}"><input type="checkbox" data-at-taskdone="${t.id}"> ${esc(t.title)}${t.data.due ? ` <small>${new Date(t.data.due + 'T12:00:00').toLocaleDateString('fr-FR')}</small>` : ''}</label>`).join('')}${tasks.length > 8 ? `<button type="button" class="link-button" data-at-go="tasks">Toutes les tâches (${fmt(tasks.length)})</button>` : ''}</section>` : ''}
                ${recent.length ? `<section><h4>🕘 Derniers changements</h4>${recent.map(i => `<button type="button" class="h-at-line" data-at-pick="${i.id}">${TYPES[i.type][0]} ${esc(i.title)}</button>`).join('')}</section>` : ''}</div>`;
        }
        if (node === 'tasks') {
            const tasks = items.filter(i => i.type === 'task').sort((a, b) => Number(a.data.done) - Number(b.data.done) || String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
            const today = new Date().toISOString().slice(0, 10);
            return `<h3 class="h-at-ftitle">✅ Tâches</h3><div class="h-at-toolbar"><button type="button" class="button small" data-at-add="task">+ Tâche</button></div>
                ${tasks.map(t => `<div class="h-at-taskrow ${Number(t.data.done) ? 'is-done' : ''} ${!Number(t.data.done) && t.data.due && t.data.due < today ? 'h-at-late' : ''}"><input type="checkbox" data-at-taskdone="${t.id}" ${Number(t.data.done) ? 'checked' : ''}><button type="button" class="link-button" data-at-pick="${t.id}">${esc(t.title)}</button>
                    <small class="muted">${[t.data.priority === 'haute' ? '🔴 haute' : t.data.priority === 'basse' ? 'basse' : '', t.data.due ? 'pour le ' + new Date(t.data.due + 'T12:00:00').toLocaleDateString('fr-FR') : '', t.folders.map(f => P.fById.get(f)?.name).filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</small></div>`).join('') || empty('Aucune tâche.')}`;
        }
        if (node === 'timeline') {
            const dated = items.filter(i => dateKey(i) && ['event', 'reference', 'media', 'task', 'person'].includes(i.type)).sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
            const groups = new Map(); dated.forEach(i => { const y = Number(dateKey(i).slice(0, 4)); const k = y; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
            return `<h3 class="h-at-ftitle">🕰️ Chronologie</h3><p class="muted">Les dates, événements, documents, images et tâches du projet, dans l’ordre du temps.</p>
                ${dated.length ? `<ol class="h-lv-timeline h-at-timeline">${[...groups.entries()].map(([y, list]) => `<li><span class="h-lv-year">${y}</span>${list.map(i => `<button type="button" class="h-at-line" data-at-pick="${i.id}">${TYPES[i.type][0]} ${esc(i.title)} <small class="muted">${esc(i.type === 'event' ? [i.data.date, i.data.end && '→ ' + i.data.end, i.data.place?.text].filter(Boolean).join(' ') : i.type === 'reference' ? REF_KINDS[i.data.kind] : '')}</small></button>`).join('')}</li>`).join('')}</ol>` : empty('Aucun élément daté : ajoute des « Date, événement », ou des dates aux références et aux images.')}`;
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
            items.forEach(i => { const pl = i.data?.place; if (pl && typeof pl === 'object' && pl.lat !== null && pl.lat !== undefined) pts.push({lat: +pl.lat, lon: +pl.lon, label: `${TYPES[i.type][0]} ${i.title}${pl.text ? ' — ' + pl.text : ''}`}); });
            return `<h3 class="h-at-ftitle">🗺️ Carte</h3><p class="muted">Les lieux et les événements situés du projet.</p>${ext.miniMap ? ext.miniMap(pts, [], {height: 480, emptyText: 'Aucun lieu placé : ajoute un « Lieu » ou un lieu à une date.'}) : ''}
                ${pts.length ? `<ul class="h-at-maplist">${items.filter(i => i.data?.place?.text).map(i => `<li><button type="button" class="link-button" data-at-pick="${i.id}">${TYPES[i.type][0]} ${esc(i.title)}</button> <small class="muted">${esc(i.data.place.text)}</small></li>`).join('')}</ul>` : ''}`;
        }
        if (node === 'biblio') {
            const v = st(), scope = v.biblioScope || 0;
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
                return `<div class="h-at-dempty"><p class="h-at-big">${esc(f.icon || '📂')}</p><h3>${esc(f.name)}</h3><p class="muted">${plural(n, 'élément', 'éléments')} avec les sous-dossiers</p><button type="button" class="button small secondary" data-at-fedit="${f.id}">Renommer, icône, couleur…</button></div>`; }
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
            default: body = d.text ? `<div class="h-at-notetext">${nl(d.text)}</div>` : '';
        }
        const related = (d.related || []).map(id => P.byId.get(Number(id))).filter(Boolean);
        const backlinks = live().filter(x => (x.data?.related || []).map(Number).includes(Number(i.id)) && !related.includes(x));
        return `<div class="h-at-dhead"><span class="eyebrow">${TYPES[i.type][0]} ${esc(TYPES[i.type][1])}${Number(i.trashed) ? ' · dans la corbeille' : ''}</span><h3>${esc(i.title)}</h3>
            <div class="h-at-dactions">${Number(i.trashed) ? `<button type="button" class="button small" data-at-restore="${i.id}">Restaurer</button>` : `<button type="button" class="button small" data-at-edit="${i.id}">✎ Modifier</button>${i.type === 'reference' ? `<button type="button" class="button small secondary" data-at-copy="${i.id}" title="Copier la référence">📋 Citer</button>` : ''}<button type="button" class="button small secondary" data-at-dup="${i.id}" title="Dupliquer">⧉</button><button type="button" class="button small secondary danger" data-at-trash="${i.id}" title="Mettre à la corbeille">🗑</button>`}</div></div>
            ${body}
            ${i.media?.length && ext.thumbs ? `<h4>📎 Fichiers</h4>${ext.thumbs('at-' + i.id, i.media)}` : ''}
            ${d.notes ? `<h4>Notes</h4><div class="h-at-notetext">${nl(d.notes)}</div>` : ''}
            <h4>🏷 Étiquettes</h4><div class="h-at-dtags">${(i.tags || []).map(t => `<span class="h-at-tag is-on">${esc(t)} <button type="button" data-at-untag="${esc(t)}" aria-label="Retirer">×</button></span>`).join('')}<input data-at-addtag placeholder="+ étiquette" list="h-at-taglist"><datalist id="h-at-taglist">${[...new Set(live().flatMap(x => x.tags || []))].map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
            <h4>📁 Rangé dans</h4><div class="h-at-dfolders">${i.folders.map(f => P.fById.get(f)).filter(Boolean).map(f => `<span class="h-at-chip"><button type="button" class="link-button" data-at-go="${f.id}">${esc(pathOf(Number(f.id)).map(x => x.name).join(' › '))}</button> <button type="button" data-at-unfile="${f.id}" aria-label="Retirer de ce dossier">×</button></span>`).join('') || '<span class="muted">Non classé</span>'}
                <select data-at-file><option value="">+ ranger aussi dans…</option>${folderOptions()}</select></div>
            <h4>🔗 Voir aussi</h4><div class="h-at-drel">${[...related.map(x => [x, true]), ...backlinks.map(x => [x, false])].map(([x, own]) => `<span class="h-at-chip"><button type="button" class="link-button" data-at-pick="${x.id}">${TYPES[x.type][0]} ${esc(x.title.slice(0, 60))}</button>${own ? ` <button type="button" data-at-unrel="${x.id}" aria-label="Retirer">×</button>` : ''}</span>`).join('') || '<span class="muted">Rien</span>'}
                <input data-at-relq placeholder="+ relier à… (tape un titre)" list="h-at-rellist"><datalist id="h-at-rellist">${live().filter(x => x.id !== i.id).slice(0, 2000).map(x => `<option value="${esc(TYPES[x.type][0] + ' ' + x.title + ' #' + x.id)}">`).join('')}</datalist></div>
            <p class="muted h-at-dates">Ajouté le ${esc(new Date(String(i.created_at).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR'))}${i.updated_at !== i.created_at ? ` · modifié le ${esc(new Date(String(i.updated_at).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR'))}` : ''}</p>`;
    }

    /* ─────────── Formulaires ─────────── */
    function itemDialog(type, item = null, preset = {}) {
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
                    <label class="span-2">Tirée de<select name="source_id"><option value="">— aucune référence —</option>${live().filter(x => x.type === 'reference').sort((a, b) => (firstAuthor(a) || a.title).localeCompare(firstAuthor(b) || b.title, 'fr')).map(x => `<option value="${x.id}" ${Number(d.source_id) === Number(x.id) ? 'selected' : ''}>${esc(shortCite(x) + ' — ' + x.title.slice(0, 80))}</option>`).join('')}</select></label>
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
        dialog({eyebrow: (isNew ? 'AJOUTER · ' : 'MODIFIER · ') + TYPES[type][1].toUpperCase(), title: isNew ? `${TYPES[type][0]} ${TYPES[type][1]}` : item.title, wide: true, submitLabel: 'Enregistrer',
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
                const saved = await post('save_atelier_item', {id: item?.id || 0, project_id: P.project.id, type, title: val('title'), data, tags: val('tags').split(',').map(t => t.trim()).filter(Boolean),
                    folder_ids: [...(f('folders')?.selectedOptions || [])].map(o => Number(o.value)), starred: item ? Number(item.starred) : 0});
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'atelier_item', saved.result.id);
                v.sel = [Number(saved.result.id)];
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
            <button type="button" class="button secondary" data-x="csv">📊 Tableau de tous les éléments (.csv)<small>Pour un tableur</small></button></div>`,
            onOpen: dl => dl.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
                const x = b.dataset.x;
                if (x === 'bib') ext.downloadText(slug + '.bib', toBibtex(refs), 'text/plain');
                if (x === 'ris') ext.downloadText(slug + '.ris', toRis(refs), 'application/x-research-info-systems');
                if (x === 'md') ext.downloadText(slug + '.md', toMarkdown(), 'text/markdown');
                if (x === 'csv') { const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"'; ext.downloadText(slug + '.csv', '﻿' + [['Sorte', 'Titre', 'Auteurs', 'Date', 'Dossiers', 'Étiquettes', 'Référence'].map(q).join(';'), ...live().map(i => [TYPES[i.type][1], i.title, i.type === 'reference' ? creatorsOf(i).map(c => [c.last, c.first].filter(Boolean).join(' ')).join(' ; ') : '', year(i) || i.data.date || '', i.folders.map(f => pathOf(f).map(y => y.name).join(' › ')).join(' ; '), (i.tags || []).join(', '), i.type === 'reference' ? cite(i, false) : ''].map(q).join(';'))].join('\n'), 'text/csv'); }
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
            if (i.type === 'reference') return `- ${cite(i, false).replace(/<\/?i>/g, '*')}`;
            return `- ${TYPES[i.type][0]} ${i.title}${d.notes ? ' — ' + d.notes.replace(/\n/g, ' ') : ''}`;
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
        ws.querySelector('[data-at-home]').addEventListener('click', () => { v.project = 0; P = null; ext.lists.research(++S().workspaceToken); });
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
            if (q('[data-at-tag]')) { const tg = q('[data-at-tag]').dataset.atTag; v.tags = v.tags.includes(tg) ? v.tags.filter(x => x !== tg) : [...v.tags, tg]; if (['overview', 'timeline', 'people', 'map', 'biblio', 'tasks', 'trash'].includes(v.node)) v.node = 'all'; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-tagclear]')) { v.tags = []; return renderProject(S().workspaceToken, true); }
            if (q('[data-at-addmenu]')) { const m = q('.h-at-addmenu').querySelector('.h-at-menu'); m.hidden = !m.hidden; return; }
            if (q('[data-at-add]')) { ws.querySelector('.h-at-menu')?.setAttribute('hidden', ''); return itemDialog(q('[data-at-add]').dataset.atAdd); }
            if (q('[data-at-import]')) {
                const text = await ext.pickFile('.bib,.ris,.txt,text/plain'); if (text === null) return;
                try { const r = await post('atelier_import', {project_id: P.project.id, folder_id: typeof v.node === 'number' ? v.node : 0, text}); toast(`${plural(r.result.count, 'référence importée', 'références importées')}.`); await reload(); } catch (error) { toast(error.message, 'error'); }
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
            if (t.matches('[data-at-q]')) { v.q = t.value.trim(); if (['overview', 'timeline', 'people', 'map', 'biblio', 'tasks'].includes(v.node)) v.node = 'all'; return renderProject(S().workspaceToken, true); }
            if (t.matches('[data-at-biblioscope]')) { v.biblioScope = Number(t.value) || 0; return renderProject(S().workspaceToken, true); }
            if (t.matches('[data-at-taskdone]')) { const i = P.byId.get(Number(t.dataset.atTaskdone)); return saveData(i, {done: t.checked ? 1 : 0}); }
            if (t.matches('[data-at-bulkfolder]') && t.value) { await act('add', v.sel, {folder_id: Number(t.value)}); toast('Rangé.'); return; }
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
            if (tg.dataset.atDrop === 'trash') { await act('trash', d.items); v.sel = []; return renderProject(S().workspaceToken, true); }
            if (tg.dataset.atDrop === 'starred') return act('star', d.items);
            if (tg.dataset.atDrop === 'unfiled') return;
            const folder = Number(id), moving = typeof v.node === 'number' && v.node !== folder && !e.altKey;
            await act(moving ? 'move' : 'add', d.items, {folder_id: folder, from: moving ? v.node : 0});
            toast(`${moving ? 'Déplacé' : 'Rangé'} dans « ${P.fById.get(folder)?.name} ».`);
        });
    }
    async function saveData(i, patch) {
        try { await post('save_atelier_item', {id: i.id, project_id: P.project.id, title: i.title, data: {...i.data, ...patch}, tags: i.tags}); await reload(); }
        catch (error) { toast(error.message, 'error'); }
    }
})();
