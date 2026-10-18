/**
 * 📚 Revues, livres et documentaires (Listes ; serveur : lib/periodicals.php).
 * Trois familles, rangées de la même façon :
 *  - 📰 une revue → ses numéros → leurs articles ;
 *  - 📖 une collection ou série (facultative) → ses livres → leurs chapitres et passages ;
 *  - 🎬 une série ou émission (facultative) → ses documentaires, films, épisodes → leurs moments (« à 52:34, on voit… »),
 *    avec le film lui-même si on l'a : on le regarde, on capture l'image du moment, on l'annote (flèches, cercles, texte).
 * Vues : les numéros / livres / films, leur contenu, les revues et séries, 🛒 à acheter. Filtres et tri sur trois critères.
 * Tout se rattache à des personnes, des enquêtes, des parties d'enquête (pistes) et des étiquettes, et part vers l'Atelier.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const S = () => A().state;
    const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const PREFS = 'genealogie-periodicals-view';
    const STATUS_CLS = {owned: 'is-owned', wanted: 'is-wanted', ordered: 'is-ordered', subscribed: 'is-owned', digital: 'is-digital', borrowed: 'is-borrowed', lent: 'is-borrowed', given: 'is-given'};
    /** le premier nombre d'un prix écrit à la main : « 6,90 € (n°254) » → 6.9, « 1 234,56 € » → 1234.56, « env. 7 € » → 7 */
    const money = v => { const m = String(v ?? '').match(/(\d{1,3}(?:[  .]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/); if (!m) return null; const n = Number(m[1].replace(/[  .]/g, '') + (m[2] ? '.' + m[2] : '')); return Number.isFinite(n) ? n : null; };
    const euro = n => n === null ? '' : n.toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'});
    const stars = n => { const k = Math.max(0, Math.min(5, Math.round(Number(n)) || 0)); return k ? '★'.repeat(k) + '☆'.repeat(5 - k) : ''; };
    let D = null; // tout ce que le serveur a renvoyé

    /* ─── Les mots de chaque famille ─── */
    const W = {
        revue: {ic: '📰', item: 'Numéro', items: 'Numéros', cont: 'Revue', conts: 'Revues', part: 'Article', parts: 'Articles', pages: 'Pages', none: 'Aucun article pour l’instant.'},
        livre: {ic: '📖', item: 'Livre', items: 'Livres', cont: 'Collection, série', conts: 'Collections, séries', part: 'Chapitre, passage', parts: 'Chapitres, passages', pages: 'Pages', none: 'Aucun chapitre ni passage noté.'},
        doc: {ic: '🎬', item: 'Documentaire', items: 'Documentaires, films', cont: 'Série, émission', conts: 'Séries, émissions', part: 'Moment', parts: 'Moments', pages: 'Minutage', none: 'Aucun moment noté.'},
        podcast: {ic: '🎙️', item: 'Épisode', items: 'Podcasts (épisodes)', cont: 'Podcast, émission de radio', conts: 'Podcasts, émissions', part: 'Moment', parts: 'Moments', pages: 'Minutage', none: 'Aucun moment noté.'},
        '': {ic: '📚', item: 'Élément', items: 'Numéros, livres, films', cont: 'Revue, collection, série', conts: 'Revues, collections, séries', part: 'Contenu', parts: 'Articles, chapitres, moments', pages: 'Pages, minutage'},
    };
    const famOf = r => !r ? 'revue' : r.issue_id !== undefined ? famOf(issueOf(r)) : (r.family || 'revue');
    /* ─── Les types : les quatre de départ (revue, livre, documentaire, podcast) et ceux qu'on crée, qui se comportent comme l'un d'eux ─── */
    const BASES = ['revue', 'livre', 'doc', 'podcast'];
    const typeCfg = k => (D?.types || []).find(t => t.key === k) || {};
    /** le comportement d'un type : un type à soi fait comme sa « base » */
    const baseOf = k => BASES.includes(k) ? k : (BASES.includes(typeCfg(k).base) ? typeCfg(k).base : 'livre');
    const timed = k => ['doc', 'podcast'].includes(baseOf(k)); // contenu minuté (moments)
    /** les mots d'un type */
    const Wf = k => { if (W[k]) return W[k]; const t = typeCfg(k), b = W[baseOf(k)]; return {...b, ic: t.icon || '📁', item: t.item || 'Élément', items: t.name || 'Mon type'}; };
    const allFams = () => [...BASES, ...(D?.types || []).filter(t => !BASES.includes(t.key)).map(t => t.key)];

    /* ─── Minutage : « 52:34 », « 1:02:10 », « 52'34 », « 52 min 34 » ─── */
    function tcSec(t) {
        const s = String(t || ''), ok = (...v) => v.every(x => x === undefined || Number(x) < 60);
        let m = s.match(/(?<!\d)(\d{1,2})\s*h\s*(\d{1,2})(?:\s*(?:min|m|['’:])\s*(\d{1,2}))?(?!\d)/i); // 1 h 32, 1h02, 1h02m30
        if (m) return ok(m[2], m[3]) ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : null;
        m = s.match(/(?<!\d)(\d{1,3})\s*(?::|min|['’])\s*(\d{1,2})(?:\s*[:'’]\s*(\d{1,2}))?(?!\d)/); // 52:34, 1:02:10, 52'34, 120:00
        if (!m) return null;
        if (m[3] !== undefined) return ok(m[2], m[3]) ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
        return ok(m[2]) ? Number(m[1]) * 60 + Number(m[2]) : null;
    }
    const fmtTc = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
    /** un lien qui ouvre la vidéo en ligne au bon moment (YouTube, Vimeo, Dailymotion, INA…) */
    function urlAt(url, sec) {
        if (!/^https?:\/\//i.test(url || '') || sec === null) return /^https?:\/\//i.test(url || '') ? url : '';
        try { const u = new URL(url);
            if (/youtu\.?be/.test(u.hostname)) { u.searchParams.set('t', sec + 's'); return u.href; }
            if (/vimeo\.com/.test(u.hostname)) { u.hash = `t=${sec}s`; return u.href; }
            if (/dailymotion\.com/.test(u.hostname)) { u.searchParams.set('start', sec); return u.href; }
            u.hash = `t=${sec}`; return u.href; } catch (_) { return url; }
    }

    /* ─── Tri sur plusieurs critères (pour un article, ce qui vient du numéro est pris dans le numéro) ─── */
    const I = r => r.issue_id !== undefined ? (issueOf(r) || {}) : r;
    const SORTS = {
        periodical: ['Revue, collection, série', r => (pOf(r)?.title || '').toLowerCase()],
        family: ['Revue / livre / documentaire / podcast', r => allFams().indexOf(famOf(r))],
        kind: ['Sorte', r => D.kinds[pOf(r)?.kind] || ''],
        date: ['Date', r => I(r).sort_date || '0000'],
        date_desc: ['Date (récent d’abord)', r => I(r).sort_date || '0000', true],
        number: ['Numéro, tome, épisode', r => { const n = parseFloat(String(I(r).number || '').replace(',', '.')); return Number.isFinite(n) ? n : 1e9; }],
        pages: ['Pages / minutage', r => r.issue_id === undefined ? 0 : (tcSec(r.pages) ?? (parseFloat(r.pages) || 1e9))],
        status: ['Où j’en suis', r => Object.keys(D.statuses).indexOf(I(r).status || '')],
        priority: ['Priorité d’achat', r => -(Number(I(r).data?.priority) || 0)],
        price: ['Prix', r => money(I(r).data?.price_paid ?? I(r).data?.cover_price) ?? 1e9],
        rating: ['Note', r => -(Number(r.data?.rating) || 0)],
        title: ['Titre', r => (r.title || '').toLowerCase()],
        creators: ['Auteur, réalisation', r => String(r.issue_id !== undefined ? r.authors || '' : r.data?.creators || '').toLowerCase()],
        added: ['Ajout récent', r => r.created_at || '', true],
    };
    const pOf = r => D.periodicals.find(p => p.id === (r.periodical_id ?? issueOf(r)?.periodical_id));
    const issueOf = a => D.issues.find(i => i.id === a.issue_id);
    const partsOf = i => { const list = D.articles.filter(a => a.issue_id === i.id); return timed(famOf(i)) ? list.sort((a, b) => (tcSec(a.pages) ?? 1e9) - (tcSec(b.pages) ?? 1e9) || a.position - b.position) : list; };
    const cmp = keys => (a, b) => { for (const k of keys) { const s = SORTS[k]; if (!s) continue; const x = s[1](a), y = s[1](b); if (x < y) return s[2] ? 1 : -1; if (x > y) return s[2] ? -1 : 1; } return 0; };

    /* ─── Filtres ─── */
    const prefs = () => { const p = {fam: '', view: 'issues', q: '', periodical: '', kind: '', status: '', label: '', who: '', inv: '', y0: '', y1: '', cat: '', dispBy: {}, groupBy: {}, sort: ['family', 'periodical', 'date'], ...ls(PREFS, {})}; if (!p.dispBy || typeof p.dispBy !== 'object') p.dispBy = {}; if (!p.groupBy || typeof p.groupBy !== 'object') p.groupBy = {}; if (!Array.isArray(p.sort)) p.sort = ['family', 'periodical', 'date']; if (!/^[\w-]{0,40}$/.test(String(p.fam ?? ''))) p.fam = ''; if (!/^[\w-]{1,40}$/.test(String(p.view ?? ''))) p.view = 'issues'; return p; }; // réglage relu (base reçue, autre poste) : jamais de code glissé
    const textOfIssue = i => [i.number, i.title, i.date_text, pOf(i)?.title, ...Object.values(i.data || {}), ...(i.links || []).map(l => l.name), ...(i.labels || []).map(l => l.name),
        ...D.articles.filter(a => a.issue_id === i.id).flatMap(a => [a.title, a.authors, a.rubric, ...Object.values(a.data || {})])].join(' ').toLowerCase();
    const textOfArticle = a => [a.title, a.authors, a.pages, a.rubric, ...Object.values(a.data || {}), ...(a.links || []).map(l => l.name), ...(a.labels || []).map(l => l.name), pOf(a)?.title, issueOf(a)?.number, issueOf(a)?.title].join(' ').toLowerCase();
    function keep(r, f, isArticle) {
        const iss = isArticle ? issueOf(r) : r, per = pOf(r);
        if (f.fam && famOf(iss) !== f.fam) return false;
        if (f.q && !f.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => (isArticle ? textOfArticle(r) : textOfIssue(r)).includes(w))) return false;
        if (f.periodical && String(per?.id) !== f.periodical) return false;
        if (f.kind && per?.kind !== f.kind) return false;
        if (f.cat && (iss?.data?.category || '') !== (f.cat === '__none' ? '' : f.cat)) return false;
        if (f.status && (iss?.status || '') !== (f.status === '__none' ? '' : f.status)) return false; // « __none » : pas précisé
        const lab = [...(r.labels || []), ...(isArticle ? [] : D.articles.filter(a => a.issue_id === r.id).flatMap(a => a.labels || []))];
        if (f.label && !lab.some(l => String(l.id) === f.label)) return false;
        const links = [...(r.links || []), ...(isArticle ? [] : D.articles.filter(a => a.issue_id === r.id).flatMap(a => a.links || []))];
        if (f.who && !links.some(l => l.type === 'person' && l.name.toLowerCase().includes(f.who.toLowerCase()))) return false;
        if (f.inv && !links.some(l => (l.type === 'investigation' && String(l.id) === f.inv) || (l.type === 'investigation_item' && String(l.inv) === f.inv))) return false;
        const y = Number(String(iss?.sort_date || '').slice(0, 4)) || null;
        if (f.y0 && (!y || y < Number(f.y0))) return false;
        if (f.y1 && (!y || y > Number(f.y1))) return false;
        return true;
    }

    /* ─── Petits morceaux d'affichage ─── */
    const chip = (t, cls = '') => `<span class="h-pr-chip ${cls}">${esc(t)}</span>`;
    const statusChip = s => chip(D.statuses[s || ''] || 'Pas précisé', STATUS_CLS[s] || '');
    const labelChips = ls0 => (ls0 || []).map(l => `<span class="label-chip" style="--label-bg:${esc(l.color || '#0066cc')};--label-fg:#fff">${esc(l.name)}</span>`).join('');
    const LINK_IC = {person: '👤', investigation: '🔎', investigation_item: '🧩'};
    const linkChips = ls0 => (ls0 || []).map(l => l.type === 'person' ? `<button type="button" class="link-button" data-pr-person="${l.id}">👤 ${esc(l.name)}</button>`
        : `<button type="button" class="link-button" data-pr-inv="${l.type === 'investigation' ? l.id : l.inv}">${LINK_IC[l.type]} ${esc(l.name)}</button>`).join(' ');
    const thumbOf = (r, roles = ['cover']) => (r.media || []).find(x => roles.includes(x.role) && x.media_type === 'image') || (r.media || []).find(x => x.media_type === 'image' || !x.media_type);
    const cover = i => { const m = thumbOf(i); return m ? `<img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy">` : `<span>${Wf(famOf(i)).ic}</span>`; };
    const videoOf = i => (i.media || []).find(m => m.role === 'video') || (i.media || []).find(m => m.media_type === 'video');
    const audioOf = i => (i.media || []).find(m => m.role === 'audio') || (i.media || []).find(m => m.media_type === 'audio');
    const issueName = i => { const p = pOf(i), f = timed(famOf(i)) ? 'doc' : baseOf(famOf(i));
        if (f === 'revue') return `${p?.title || 'Revue'}${i.number ? ' n° ' + i.number : ''}${i.data?.special ? ' (hors-série)' : ''}`;
        return `${i.title || 'Sans titre'}${p ? ` (${p.title}${i.number ? (f === 'doc' ? ', ép. ' : ', n° ') + i.number : ''})` : i.number ? ` (${f === 'doc' ? 'ép. ' : 'tome '}${i.number})` : ''}`; };

    const dispOf = f => f.dispBy[f.fam || 'all'] || (f.fam ? typeCfg(f.fam).view : '') || 'list';
    const groupOf = f => f.groupBy[f.fam || 'all'] ?? (f.fam ? typeCfg(f.fam).group : '') ?? '';
    ext.lists.periodicals = async token => {
        try { D = await api('periodicals'); } catch (error) { if (token === S().workspaceToken) A().$('#workspace').innerHTML = `<section class="page">${A().empty(error.message)}</section>`; return; }
        if (token !== S().workspaceToken) return;
        draw();
    };
    function draw() {
        const f = prefs(), ws = A().$('#workspace'), w = f.fam ? Wf(f.fam) : W[''];
        const issues = D.issues.filter(i => keep(i, f, false)).sort(cmp(f.sort));
        const articles = D.articles.filter(a => keep(a, f, true)).sort(cmp(f.sort));
        const wanted = D.issues.filter(i => ['wanted', 'ordered'].includes(i.status) && keep({...i}, {...f, status: ''}, false)).sort(cmp(['priority', ...f.sort]));
        const conts = D.periodicals.filter(p => !f.fam || (p.family || 'revue') === f.fam);
        const famName = k => k === 'revue' ? '📰 Revues' : k === 'livre' ? '📖 Livres' : k === 'doc' ? '🎬 Documentaires' : k === 'podcast' ? '🎙️ Podcasts' : `${Wf(k).ic} ${Wf(k).items}`;
        const labels = [...new Map([...D.periodicals, ...D.issues, ...D.articles].flatMap(r => r.labels || []).map(l => [l.id, l])).values()].sort((a, b) => a.name.localeCompare(b.name));
        const invs = [...new Map([...D.issues, ...D.articles].flatMap(r => (r.links || []).filter(l => l.type !== 'person')).map(l => l.type === 'investigation' ? [l.id, l] : [l.inv, {id: l.inv, name: l.name.split(' — ').slice(1).join(' — ') || l.name}])).values()];
        const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
        const sortSel = k => `<select data-pr-sort="${k}">${opt('', '—', f.sort[k] || '')}${Object.entries(SORTS).map(([v, [l]]) => opt(v, l, f.sort[k] || '')).join('')}</select>`;
        const views = [['issues', `${w.ic} ${w.items} (${issues.length})`], ['articles', `📄 ${w.parts} (${articles.length})`], ['periodicals', `🗂️ ${w.conts} (${conts.length})`], ['wanted', `🛒 À acheter (${wanted.length})`]];
        const fams = [['', '📚 Tout'], ...allFams().map(k => [k, famName(k)])];
        const kinds = Object.entries(D.kinds).filter(([k]) => !f.fam || (D.family_kinds?.[baseOf(f.fam)] || []).includes(k));
        const total = wanted.reduce((s, i) => s + (money(i.data?.cover_price) || 0), 0);
        const newBtns = (f.fam ? [f.fam] : allFams()).map((k, n) => `<button type="button" class="button ${n ? 'secondary' : ''}" data-pr-new="issue" data-fam="${esc(k)}">＋ ${esc(Wf(k).item)}</button>`).join('');
        ws.innerHTML = `<section class="page h-pr">
            <header class="page-header"><div><span class="eyebrow">LISTES</span><h2>📚 Revues, livres et documentaires</h2><p>Ce que tu as lu, vu, ce que tu veux acheter ; chaque article, chapitre ou moment, et qui ou quoi y est cité.</p></div>
                <div class="page-actions">${newBtns}<button type="button" class="button secondary" data-pr-new="periodical">＋ ${esc(f.fam ? Wf(f.fam).cont : 'Revue, collection, série')}</button><button type="button" class="button secondary" data-pr-atelier title="Mettre ce qui est affiché dans un projet de l’Atelier">📚 Vers l’Atelier</button><button type="button" class="button secondary" data-pr-csv>⬇️ CSV</button><button type="button" class="button secondary" data-pr-types title="Les types (revue, livre, documentaire, podcast, les tiens), leurs champs, leur affichage">⚙️ Réglages</button></div></header>
            <div class="h-pr-views h-pr-fams">${fams.map(([k, l]) => `<button type="button" class="${f.fam === k ? 'is-on' : ''}" data-pr-fam="${esc(k)}">${esc(l)}</button>`).join('')}</div>
            <div class="h-pr-views">${views.map(([k, l]) => `<button type="button" class="${f.view === k ? 'is-on' : ''}" data-pr-view="${esc(k)}">${esc(l)}</button>`).join('')}</div>
            ${['issues', 'wanted'].includes(f.view) ? `<div class="h-pr-views h-pr-disp"><label class="checkbox-line"><input type="checkbox" data-pr-group ${groupOf(f) === 'category' ? 'checked' : ''}> Grouper par catégorie</label></div>` : ''}
            <div data-pr-sortbar data-count="${f.view === 'articles' ? articles.length : f.view === 'periodicals' ? conts.length : f.view === 'wanted' ? wanted.length : issues.length}"></div>
            <div class="h-pr-filters h-pr-then"><span class="h-pr-sorts">Ensuite par ${sortSel(1)} puis ${sortSel(2)}</span></div>
            <div data-pr-body>${f.view === 'articles' ? articlesTable(articles) : f.view === 'periodicals' ? periodicalCards(conts) : f.view === 'wanted' ? `<p class="h-pr-total">${wanted.length} à acheter ou commandé${wanted.length > 1 ? 's' : ''}${total ? ` · environ <strong>${esc(euro(total))}</strong> au prix affiché` : ''}</p>${issuesShown(wanted, f, true)}` : issuesShown(issues, f)}</div>
        </section>`;
        bind(ws, {issues, articles, wanted}, {w, conts, kinds, labels, invs});
    }
    /** les éléments en liste ou en fiches, groupés par catégorie si on veut */
    function issuesShown(rows, f, buy = false) {
        const one = list => dispOf(f) === 'cards' ? issueCards(list) : issuesTable(list, buy);
        if (groupOf(f) !== 'category' || !rows.length) return one(rows);
        const cats = [...new Set(rows.map(i => i.data?.category || ''))].sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b, 'fr'));
        return cats.map(c => `<section class="h-pr-group"><h3>🏷 ${esc(c || 'Sans catégorie')} <small>(${rows.filter(i => (i.data?.category || '') === c).length})</small></h3>${one(rows.filter(i => (i.data?.category || '') === c))}</section>`).join('');
    }
    /** une fiche par élément, comme dans « Mes fiches » : couverture, titre, puis les champs montrés pour ce type */
    function issueCards(rows) {
        if (!rows.length) return (D.issues.length ? A().empty('Rien ne correspond.', {icon: '🔍'}) : A().emptyState({icon: '📰', text: 'Rien pour l’instant', hint: 'Commence par « ＋ Numéro », « ＋ Livre », « ＋ Documentaire » ou « ＋ Épisode », en haut de la page.'}));
        const val = (i, f, bf) => { if (['title', 'periodical_id', 'summary', 'notes'].includes(f.k)) return ''; const c = FIELD_CAT[f.k] || {}, v = c.data || f.k.startsWith('cf_') ? i.data?.[f.k] : i[f.k];
            if (f.k === 'status') return ''; // déjà en pastille if (f.k === 'rating') return stars(v); if (f.k === 'priority') return '🔥'.repeat(Number(v) || 0); if (c.type === 'check' || f.type === 'check') return v ? fieldLabel(f, bf) : '';
            return v ? (['number', 'date_text', 'creators', 'host', 'channel', 'publisher', 'category', 'duration'].includes(f.k) ? String(v) : `${fieldLabel(f, bf)} : ${v}`) : ''; };
        return `<div class="h-fi-cards h-pr-fcards">${rows.map(i => { const fm = famOf(i), bf = baseOf(fm), p = pOf(i), m = thumbOf(i), title = bf === 'revue' ? `${p?.title || ''}${i.number ? ' n° ' + i.number : ''}` : i.title;
            const lines = fieldsFor(fm).filter(f => f.show).map(f => val(i, f, bf)).filter(Boolean).slice(0, 6);
            return `<article class="h-fi-card h-pr-fcard" data-pr-issue="${i.id}" style="--fi-c:${esc(typeCfg(fm).color || ({revue: '#0066cc', livre: '#7b3f8c', doc: '#c0392b', podcast: '#16a085'}[bf]))}">
                <div class="h-fi-cover ${m ? '' : 'is-icon'}">${m ? `<img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy">` : Wf(fm).ic}</div>
                <strong>${esc(title || 'Sans titre')}</strong>${bf === 'revue' && i.title ? `<small>${esc(i.title)}</small>` : p && bf !== 'revue' ? `<small>${esc(p.title)}</small>` : ''}
                ${lines.map(l => `<small>${esc(l)}</small>`).join('')}<small class="h-pr-fchips">${statusChip(i.status)}${labelChips(i.labels)}</small></article>`; }).join('')}</div>`;
    }
    function issuesTable(rows, buy = false) {
        if (!rows.length) return (D.issues.length ? A().empty('Rien ne correspond.', {icon: '🔍'}) : A().emptyState({icon: '📰', text: 'Rien pour l’instant', hint: 'Commence par « ＋ Numéro », « ＋ Livre » ou « ＋ Documentaire », en haut de la page.'}));
        return `<div class="data-table-wrap"><table class="data-table h-pr-table"><thead><tr><th></th><th>Titre</th><th>Auteur, réalisation</th><th>N°, tome, épisode</th><th>Date</th><th>Où j’en suis</th>${buy ? '<th>Priorité</th><th>Prix</th><th>Où l’acheter</th>' : '<th>Contenu</th><th>Rattaché à</th><th>Étiquettes</th>'}</tr></thead><tbody>
            ${rows.map(i => { const p = pOf(i), fm = famOf(i), bf = baseOf(fm), n = D.articles.filter(a => a.issue_id === i.id).length, sub = bf === 'revue' ? i.title : [i.data?.subtitle, p?.title].filter(Boolean).join(' · ');
                return `<tr data-pr-issue="${i.id}"><td class="h-pr-cover">${cover(i)}</td><td><strong>${Wf(fm).ic} ${esc(bf === 'revue' ? (p?.title || '') : i.title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}${i.data?.rating ? `<small class="h-pr-stars">${stars(i.data.rating)}</small>` : ''}${i.data?.read ? ` <small>✓ ${bf === 'doc' ? 'vu' : bf === 'podcast' ? 'écouté' : 'lu'}</small>` : ''}${videoOf(i) ? ' <small title="Le film est dans l’application">🎞️</small>' : ''}${audioOf(i) ? ' <small title="L’épisode est dans l’application">🎧</small>' : ''}${i.data?.category ? `<small class="h-pr-cat">🏷 ${esc(i.data.category)}</small>` : ''}</td>
                <td>${esc(i.data?.creators || i.data?.host || '')}${timed(fm) && i.data?.channel ? `<small>${esc(i.data.channel)}</small>` : ''}</td><td>${esc(i.number)}${i.data?.special ? ' <small>HS</small>' : ''}</td><td>${esc(i.date_text)}${i.data?.duration ? `<small>${esc(i.data.duration)}</small>` : ''}</td><td>${statusChip(i.status)}</td>
                ${buy ? `<td>${'🔥'.repeat(Number(i.data?.priority) || 0) || '—'}</td><td>${esc(i.data?.cover_price || '')}</td><td>${i.data?.buy_url ? `<a href="${esc(/^https?:\/\//i.test(i.data.buy_url) ? i.data.buy_url : '#')}" target="_blank" rel="noopener">acheter ↗</a>` : esc(p?.data?.where_buy || '')}</td>` : `<td>${n ? `${n} ${esc(Wf(fm).parts.toLowerCase())}` : ''}</td><td>${linkChips(i.links)}</td><td>${labelChips(i.labels)}</td>`}</tr>`; }).join('')}
        </tbody></table></div>`;
    }
    function articlesTable(rows) {
        if (!rows.length) return A().empty('Rien ne correspond. Les articles, chapitres et moments s’ajoutent dans la fiche d’un numéro, d’un livre ou d’un documentaire.');
        return `<div class="data-table-wrap"><table class="data-table h-pr-table"><thead><tr><th></th><th>Titre</th><th>Auteurs, qui parle</th><th>Dans</th><th>Date</th><th>Pages, minutage</th><th>Sorte</th><th>Rattaché à</th><th>Étiquettes</th></tr></thead><tbody>
            ${rows.map(a => { const i = issueOf(a), fm = famOf(a), th = thumbOf(a, ['']), txt = a.data?.what_seen || a.data?.summary || '';
                return `<tr data-pr-article="${a.id}"><td class="h-pr-cover">${th ? `<img src="media/${encodeURIComponent(th.thumbnail || th.filename)}" alt="" loading="lazy">` : `<span>${Wf(fm).ic}</span>`}</td><td><strong>${esc(a.title)}</strong>${txt ? `<small>${esc(String(txt).slice(0, 140))}${String(txt).length > 140 ? '…' : ''}</small>` : ''}${a.data?.rating ? `<small class="h-pr-stars">${stars(a.data.rating)}</small>` : ''}</td>
                <td>${esc(a.authors)}</td><td>${esc(i ? issueName(i) : '')}</td><td>${esc(i?.date_text || '')}</td><td>${timed(fm) && a.pages ? `⏱ ${esc(a.pages)}` : esc(a.pages)}</td><td>${esc([a.rubric, D.article_kinds[a.kind]].filter(Boolean).join(' · '))}</td><td>${linkChips(a.links)}</td><td>${labelChips(a.labels)}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    function periodicalCards(conts) {
        if (!conts.length) return A().emptyState({icon: '📚', text: 'Aucune revue, collection ou série pour l’instant', hint: 'Un livre ou un documentaire n’a pas besoin d’être dans une collection ou une série.', action: {label: '＋ Revue, collection, série', attrs: 'data-pr-new="periodical"'}});
        return `<div class="h-pr-cards">${conts.map(p => { const fm = p.family || 'revue', is = D.issues.filter(i => i.periodical_id === p.id), own = is.filter(i => ['owned', 'subscribed', 'digital'].includes(i.status)).length, want = is.filter(i => ['wanted', 'ordered'].includes(i.status)).length, last = [...is].sort(cmp(['date_desc']))[0];
            return `<article class="h-pr-card" data-pr-periodical="${p.id}"><header><strong>${Wf(fm).ic} ${esc(p.title)}</strong><small>${esc(D.kinds[p.kind] || '')}${p.publisher ? ' · ' + esc(p.publisher) : ''}</small></header>
                <p>${is.length} ${esc(Wf(fm).items.toLowerCase())} · ${own} à moi · ${want} à acheter${p.data?.subscribed ? ` · 📬 abonné${p.data.subscription_end ? ' jusqu’au ' + esc(p.data.subscription_end) : ''}` : ''}</p>
                ${last ? `<small class="muted">Dernier : ${esc(issueName(last))} ${esc(last.date_text || '')}</small>` : ''}${labelChips(p.labels)}
                <div class="page-actions compact"><button type="button" class="button small secondary" data-pr-only="${p.id}">Voir tout</button><button type="button" class="button small secondary" data-pr-addissue="${p.id}">＋ ${esc(Wf(fm).item)}</button></div></article>`; }).join('')}</div>`;
    }
    function bind(ws, rows, {w = W[''], conts = [], kinds = [], labels = [], invs = []} = {}) {
        const save = patch => { lsSet(PREFS, {...prefs(), ...patch}); draw(); };
        ws.querySelectorAll('[data-pr-fam]').forEach(b => b.addEventListener('click', () => save({fam: b.dataset.prFam, periodical: '', kind: ''})));
        ws.querySelectorAll('[data-pr-view]').forEach(b => b.addEventListener('click', () => save({view: b.dataset.prView})));
        ws.querySelector('[data-pr-group]')?.addEventListener('change', e => { const p = prefs(); save({groupBy: {...p.groupBy, [p.fam || 'all']: e.target.checked ? 'category' : ''}}); });
        ws.querySelector('[data-pr-types]')?.addEventListener('click', () => typesDialog());
        // H10 : la barre commune (🔍 Chercher · Filtrer ▾ · Liste | Fiches · Trier) ; les choix restent rangés dans les réglages de la liste (PREFS), « Ensuite par… » affine le tri
        const sb = ws.querySelector('[data-pr-sortbar]'), UI = window.LCNDA_UI;
        const pf = prefs(), view = ['issues', 'wanted'].includes(pf.view) ? {key: '', value: dispOf(pf), what: 'éléments', onChange: v => { const p = prefs(); save({dispBy: {...p.dispBy, [p.fam || 'all']: v}}); }} : null;
        if (sb && UI?.listBar) {
            const sel = (id, label, first, opts, v) => ({id, label, type: 'select', options: [['', first], ...opts.map(([k, l]) => [String(k), l, `${label} : ${l}`])], value: String(v || '')});
            const bar = UI.listBar({key: `listes:periodicals:${pf.fam || 'all'}`, remember: 'given', search: {placeholder: 'Chercher… (titre, auteur, lieu, nom cité, ce qu’on voit, notes)', value: pf.q || ''},
                filters: [sel('periodical', w.cont || 'Revue, collection, série', 'Toutes', conts.map(p => [p.id, p.title]), pf.periodical), sel('kind', 'Sorte', 'Toutes les sortes', kinds, pf.kind),
                    sel('cat', 'Catégorie', 'Toutes les catégories', [...categories().map(c => [c, c]), ['__none', 'Sans catégorie']], pf.cat), sel('status', 'Où j’en suis', 'Tout', Object.entries(D.statuses).map(([v, l]) => [v || '__none', l]), pf.status),
                    sel('label', 'Étiquette', 'Toutes les étiquettes', labels.map(l => [l.id, l.name]), pf.label), sel('inv', 'Enquête', 'Toutes les enquêtes', invs.map(l => [l.id, l.name]), pf.inv),
                    {id: 'who', label: 'Personne citée', type: 'text', placeholder: 'Nom de la personne…', value: pf.who || ''},
                    {id: 'y0', group: 'Années', label: 'De', type: 'text', placeholder: '1900', chipPrefix: 'Depuis', value: pf.y0 || ''}, {id: 'y1', group: 'Années', label: 'À', type: 'text', placeholder: '1950', chipPrefix: 'Jusqu’à', value: pf.y1 || ''}],
                view, sort: {options: [['', 'Dans l’ordre de départ'], ...Object.entries(SORTS).map(([v, [l]]) => [v, l])], value: pf.sort?.[0] || ''},
                onChange: (b, {what}) => { if (what === 'view') return; const s0 = [...prefs().sort]; s0[0] = b.sort; save({q: b.q, ...b.filters, sort: s0.filter((x, k) => x || k < 3)}); }});
            bar.setCount(Number(sb.dataset.count) || 0, 'élément');
            sb.replaceWith(bar);
        }
        ws.querySelectorAll('[data-pr-sort]').forEach(el => el.addEventListener('change', () => { const s = [...prefs().sort]; s[Number(el.dataset.prSort)] = el.value; save({sort: s.filter((v, k) => v || k < 3)}); }));
        ws.querySelectorAll('[data-pr-new]').forEach(b => b.addEventListener('click', () => b.dataset.prNew === 'periodical' ? periodicalDialog(null, prefs().fam || 'revue') : issueDialog(null, Number(prefs().periodical) || 0, b.dataset.fam)));
        ws.querySelectorAll('[data-pr-only]').forEach(b => b.addEventListener('click', () => save({view: 'issues', periodical: b.dataset.prOnly})));
        ws.querySelectorAll('[data-pr-addissue]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); issueDialog(null, Number(b.dataset.prAddissue)); }));
        ws.querySelector('.h-pr').addEventListener('click', e => { // sur la page (redessinée à chaque fois), pas sur #workspace qui reste
            const per = e.target.closest('[data-pr-person]'); if (per) { e.stopPropagation(); S().currentPersonId = Number(per.dataset.prPerson); A().setModule('personnes'); return; }
            const inv = e.target.closest('[data-pr-inv]'); if (inv) { e.stopPropagation(); openInvestigation(inv.dataset.prInv); return; }
            if (e.target.closest('a,button,input,select')) return;
            const ir = e.target.closest('[data-pr-issue]'); if (ir) return issueDialog(D.issues.find(i => i.id === Number(ir.dataset.prIssue)));
            const ar = e.target.closest('[data-pr-article]'); if (ar) { const a = D.articles.find(x => x.id === Number(ar.dataset.prArticle)); if (!a) return toast('Introuvable : la liste a changé, elle se recharge.', 'error'), reload(); return articleDialog(a, issueOf(a)); }
            const pr = e.target.closest('[data-pr-periodical]'); if (pr) return periodicalDialog(D.periodicals.find(p => p.id === Number(pr.dataset.prPeriodical)));
        });
        ws.querySelector('[data-pr-csv]').addEventListener('click', () => csv(prefs().view, rows));
        ws.querySelector('[data-pr-atelier]').addEventListener('click', () => {
            const v = prefs().view, list = v === 'articles' ? rows.articles.map(a => ({type: 'article', id: a.id})) : (v === 'wanted' ? rows.wanted : rows.issues).map(i => ({type: 'issue', id: i.id}));
            if (v === 'periodicals') return toast('Choisis la vue des numéros, livres et films, ou celle de leur contenu.');
            atelierDialog(list, v !== 'articles');
        });
    }
    const openInvestigation = id => { S().enquetesTab = 'enquetes'; S().currentBattueId = 0; S().currentInvestigationId = Number(id); S().investigationFolderId = 0; A().setModule('enquetes'); };
    function csv(view, rows) {
        const q = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; }; // pas de formule dans un tableur
        let head, body;
        if (view === 'articles') { head = ['Famille', 'Titre', 'Auteurs, qui parle', 'Dans', 'N°', 'Date', 'Pages, minutage', 'Rubrique', 'Sorte', 'Ce qu’on voit', 'Résumé', 'Ce qui est dit, citation', 'Lieux', 'Période', 'Noms cités', 'Rattaché à', 'Étiquettes'];
            body = rows.articles.map(a => { const i = issueOf(a); return [D.families?.[famOf(a)] || Wf(famOf(a)).items, a.title, a.authors, i ? issueName(i) : '', i?.number, i?.date_text, a.pages, a.rubric, D.article_kinds[a.kind], a.data?.what_seen, a.data?.summary, a.data?.transcript || a.data?.quote, a.data?.places, a.data?.period, a.data?.surnames, (a.links || []).map(l => l.name).join(', '), (a.labels || []).map(l => l.name).join(', ')]; }); }
        else { const list = view === 'wanted' ? rows.wanted : rows.issues; head = ['Famille', 'Revue, collection, série', 'Titre', 'Auteur, réalisation', 'Éditeur, chaîne', 'N°', 'Hors-série', 'Date', 'Durée', 'ISBN', 'Où j’en suis', 'Priorité', 'Prix', 'Prix payé', 'Rangé où', 'Contenu', 'Rattaché à', 'Étiquettes', 'Notes'];
            body = list.map(i => [D.families?.[famOf(i)] || Wf(famOf(i)).items, pOf(i)?.title, i.title, i.data?.creators, i.data?.publisher || i.data?.channel, i.number, i.data?.special ? 'oui' : '', i.date_text, i.data?.duration, i.data?.isbn, D.statuses[i.status || ''], i.data?.priority, i.data?.cover_price, i.data?.price_paid, i.data?.storage, partsOf(i).map(a => (timed(famOf(i)) && a.pages ? a.pages + ' ' : '') + a.title).join(' | '), (i.links || []).map(l => l.name).join(', '), (i.labels || []).map(l => l.name).join(', '), i.data?.notes]); }
        const text = '﻿' + [head, ...body].map(r => r.map(q).join(';')).join('\r\n');
        if (ext.downloadText) ext.downloadText(`bibliotheque-${view}.csv`, text, 'text/csv;charset=utf-8'); else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv'})); a.download = `bibliotheque-${view}.csv`; a.click(); }
    }

    /* ─── Personnes, enquêtes et parties d'enquête rattachées (plusieurs) ─── */
    const lchip = l => `<span class="h-pr-lchip" data-type="${l.type}" data-id="${l.id}">${LINK_IC[l.type] || '🔗'} ${esc(l.name)} <button type="button" data-pr-unlink aria-label="Retirer">×</button></span>`;
    function linksField(links = []) {
        return `<div class="h-pr-links" data-pr-links><span class="section-label">Rattaché à</span><span class="h-pr-linkchips">${links.map(lchip).join('')}</span>
            <div class="h-pr-addlink" data-pr-lpk style="flex:1 1 320px;min-width:min(100%,320px)">${window.LCNDA_PICKER.pickerField({name: 'pr_link', kind: 'person,investigation', placeholder: 'Ajouter une personne, une enquête…'})}</div>
            <span class="h-pr-addlink"><input type="search" data-pr-lq placeholder="ou une partie d’enquête…" autocomplete="off"><span class="h-pr-lsugg" hidden></span></span></div>`;
    }
    function bindLinks(root) {
        const box = root.querySelector('[data-pr-links]'); if (!box) return;
        const input = box.querySelector('[data-pr-lq]'), sugg = box.querySelector('.h-pr-lsugg'); let t = 0;
        box.addEventListener('click', e => {
            if (e.target.closest('[data-pr-unlink]')) { e.target.closest('.h-pr-lchip').remove(); return; }
            const s = e.target.closest('[data-add-type]'); if (!s) return;
            if (!box.querySelector(`.h-pr-lchip[data-type="${s.dataset.addType}"][data-id="${s.dataset.addId}"]`)) box.querySelector('.h-pr-linkchips').insertAdjacentHTML('beforeend', lchip({type: s.dataset.addType, id: s.dataset.addId, name: s.dataset.addName}));
            input.value = ''; sugg.hidden = true; input.focus();
        });
        // personnes et enquêtes : le menu de choix unique (recherche mélangée) ; il ne part pas avec le formulaire
        const pk = box.querySelector('[data-pr-lpk]');
        pk?.querySelector('.pk > input[type=hidden]')?.removeAttribute('name');
        pk?.addEventListener('picker-change', e => { const it = e.detail.item; if (!it?.id) return; const type = it.kind === 'investigation' ? 'investigation' : 'person';
            if (!box.querySelector(`.h-pr-lchip[data-type="${type}"][data-id="${Number(it.id)}"]`)) box.querySelector('.h-pr-linkchips').insertAdjacentHTML('beforeend', lchip({type, id: Number(it.id), name: it.title}));
            window.LCNDA_PICKER.pickerSet(pk.querySelector('.pk'), null); });
        // parties d'enquête : pas encore une sorte du menu de choix unique, l'ancienne recherche reste pour elles
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sugg.querySelector('[data-add-type]')?.click(); } });
        input.addEventListener('input', () => { clearTimeout(t); const q = input.value.trim(); if (q.length < 2) { sugg.hidden = true; return; } t = setTimeout(async () => {
            let parts = [];
            await api('periodical_link_search', {q}).then(r => { parts = r.items || []; }).catch(() => {});
            const b = (type, id, name) => `<button type="button" data-add-type="${type}" data-add-id="${id}" data-add-name="${esc(name)}">${LINK_IC[type]} ${esc(name)}</button>`;
            sugg.innerHTML = parts.map(x => b('investigation_item', x.id, x.name)).join('') || '<small class="muted">Rien trouvé.</small>';
            sugg.hidden = false; }, 220); });
    }
    const readLinks = form => { const out = {persons: [], investigations: [], investigation_items: []}; form.querySelectorAll('.h-pr-lchip').forEach(c => out[{person: 'persons', investigation: 'investigations', investigation_item: 'investigation_items'}[c.dataset.type]]?.push(Number(c.dataset.id))); return out; };
    const readLabels = form => { const b = form.querySelector('[data-pending-labels]'); return b ? (b.dataset.ids || '').split(',').map(Number).filter(Boolean) : undefined; };
    const field = (name, label, value = '', {type = 'text', span = false, ph = '', list = null, rows = 3} = {}) => type === 'textarea'
        ? `<label class="${span ? 'span-2' : ''}">${esc(label)}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(value)}</textarea></label>`
        : type === 'select' ? `<label class="${span ? 'span-2' : ''}">${esc(label)}<select name="${name}">${list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
        : type === 'check' ? `<label class="checkbox-line ${span ? 'span-2' : ''}"><input type="checkbox" name="${name}" value="1" ${value ? 'checked' : ''}> ${esc(label)}</label>`
        : `<label class="${span ? 'span-2' : ''}">${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(ph)}"></label>`;
    const RATING = [['', '—'], ['1', '★'], ['2', '★★'], ['3', '★★★'], ['4', '★★★★'], ['5', '★★★★★']];
    const dataOf = (form, keys) => Object.fromEntries(keys.filter(k => form.elements[k]).map(k => [k, form.elements[k].type === 'checkbox' ? (form.elements[k].checked ? '1' : '') : form.elements[k].value]));
    const reload = async () => { D = await api('periodicals'); if (S().module === 'listes' && S().listType === 'periodicals') draw(); };

    /* ─── Une revue, une collection, une série ─── */
    function periodicalDialog(p, fam0 = 'revue') {
        const d = p?.data || {}, fam = p?.family || fam0, w = Wf(fam), bf = baseOf(fam);
        const kinds = Object.entries(D.kinds).filter(([k]) => (D.family_kinds?.[bf] || Object.keys(D.kinds)).includes(k));
        ext.openDialog({eyebrow: w.cont.toUpperCase(), title: p ? p.title : `Nouvelle ${bf === 'revue' ? 'revue' : bf === 'livre' ? 'collection ou série' : bf === 'podcast' ? 'émission (podcast, radio)' : 'série ou émission'}`, wide: true, labels: ['periodical_periodical', p?.labels || []],
            body: `<div class="form-grid">${field('family', 'Type', fam, {type: 'select', list: allFams().map(k => [k, D.families?.[k] || Wf(k).items])})}${field('kind', 'Sorte', p?.kind || kinds[0]?.[0], {type: 'select', list: kinds})}
                ${field('title', 'Nom', p?.title || '', {span: true, ph: bf === 'revue' ? 'Revue française de généalogie, bulletin du cercle…' : bf === 'livre' ? 'Que sais-je ?, Les Rougon-Macquart…' : bf === 'podcast' ? 'La Fabrique de l’histoire, Affaires sensibles, Généalogie pour tous…' : 'Secrets d’histoire, Apocalypse, Retour aux sources…'})}
                ${field('publisher', bf === 'doc' ? 'Chaîne, producteur' : bf === 'podcast' ? 'Producteur, radio, plateforme' : 'Éditeur', p?.publisher || '')}${field('website', 'Site internet', d.website, {ph: 'https://'})}
                ${bf === 'revue' ? `${field('association', 'Association, cercle', d.association)}${field('issn', 'ISSN', d.issn)}${field('frequency', 'Parution', d.frequency, {ph: 'mensuelle, trimestrielle…'})}
                ${field('subscribed', '📬 Je suis abonné', d.subscribed, {type: 'check'})}${field('subscription_end', 'Abonnement jusqu’au', d.subscription_end)}${field('subscription_price', 'Prix de l’abonnement', d.subscription_price)}` : ''}
                ${field('country', 'Pays, région', d.country)}${field('language', 'Langue', d.language)}${field('start_year', 'Depuis (année)', d.start_year)}${field('end_year', 'Jusqu’à (année)', d.end_year)}
                ${field('where_buy', 'Où l’acheter, le voir', d.where_buy, {ph: 'kiosque, librairie, replay…'})}${field('contact', 'Contact', d.contact)}${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>`,
            onSubmit: async form => { const v = A().formObject(form); await post('save_periodical', {id: p?.id || 0, family: v.family, title: v.title, kind: v.kind, publisher: v.publisher, data: dataOf(form, ['association', 'issn', 'frequency', 'website', 'country', 'language', 'start_year', 'end_year', 'subscribed', 'subscription_end', 'subscription_price', 'where_buy', 'contact', 'notes']), label_ids: readLabels(form)}); toast('Enregistré.'); await reload(); },
            onDelete: p ? async () => { if (!await A().confirmBox(`Supprimer « ${p.title} » et tout ce qu’il contient ? (les images restent dans les Médias)`, {title: 'Supprimer le périodique', okLabel: 'Supprimer'})) return false; await post('delete_periodical_item', {what: 'periodical', id: p.id}); await reload(); } : null});
    }

    /* ─── Les champs d'un élément : un catalogue, un ordre de départ par type, et les réglages de chacun (montrés, ordre, champs à soi) ─── */
    const L = (bf, m, d) => m[bf] ?? d; // un libellé selon le comportement
    const FIELD_CAT = {
        periodical_id: {label: 'Revue, collection, série, podcast'},
        number: {label: bf => L(bf, {revue: 'Numéro', livre: 'N° dans la collection, tome', doc: 'Épisode, saison', podcast: 'Épisode, saison'}, 'Numéro'), ph: bf => L(bf, {revue: '254', doc: 'S2 E4', podcast: 'S3 E12'}, '')},
        date_text: {label: bf => L(bf, {revue: 'Date', livre: 'Année, date', doc: 'Diffusé, sorti le', podcast: 'Publié le'}, 'Date'), ph: bf => L(bf, {revue: 'mars 2024, été 1998, 12/03/1925…', livre: '1987'}, ''), col: true},
        special: {label: 'Hors-série / numéro spécial', type: 'check'},
        title: {label: bf => L(bf, {revue: 'Thème, titre de couverture', podcast: 'Titre de l’épisode'}, 'Titre'), span: true, col: true},
        subtitle: {label: 'Sous-titre', span: true, data: true},
        creators: {label: bf => L(bf, {livre: 'Auteurs', doc: 'Réalisation', podcast: 'Auteurs, journalistes'}, 'Auteurs'), ph: 'Prénom Nom, Prénom Nom', data: true},
        host: {label: 'Animateur, animatrice', data: true},
        guests: {label: 'Invités, qui parle', data: true},
        publisher: {label: bf => L(bf, {doc: 'Production', podcast: 'Producteur'}, 'Éditeur'), data: true},
        place: {label: 'Lieu d’édition', data: true},
        edition: {label: 'Édition', ph: '2e édition, poche…', data: true},
        isbn: {label: 'ISBN', data: true},
        channel: {label: bf => L(bf, {podcast: 'Radio, plateforme (Spotify, Apple, Deezer…)'}, 'Chaîne, diffuseur, plateforme'), data: true},
        duration: {label: 'Durée', ph: '1 h 32', data: true},
        language: {label: 'Langue', data: true},
        video_url: {label: 'Où le voir (lien : replay, YouTube, INA…)', span: true, ph: 'https://', data: true},
        audio_url: {label: 'Où l’écouter (lien de l’épisode)', span: true, ph: 'https://', data: true},
        category: {label: 'Catégorie', type: 'cat', data: true},
        status: {label: 'Où j’en suis', type: 'status', col: true},
        priority: {label: 'Envie de l’acheter', type: 'select', list: [['', '—'], ['1', '🔥 un peu'], ['2', '🔥🔥 beaucoup'], ['3', '🔥🔥🔥 indispensable']], data: true},
        cover_price: {label: bf => bf === 'doc' ? 'Prix (DVD, location…)' : 'Prix', ph: '6,90 €', data: true},
        price_paid: {label: 'Prix payé', data: true}, bought_date: {label: 'Acheté le', data: true}, bought_where: {label: 'Acheté où', data: true},
        buy_url: {label: 'Où le trouver (lien)', ph: 'https://', data: true}, digital_url: {label: 'Version numérique (lien)', ph: 'https://', data: true},
        storage: {label: 'Rangé où', ph: bf => timed(bf) ? 'DVD de l’étagère, disque dur, dossier…' : 'bibliothèque du bureau, boîte 3…', data: true},
        condition: {label: 'État', data: true}, pages_count: {label: 'Nombre de pages', data: true},
        rating: {label: 'Ma note', type: 'select', list: RATING, data: true},
        read: {label: bf => L(bf, {doc: 'Vu', podcast: 'Écouté'}, 'Lu'), type: 'check', data: true},
        summary: {label: bf => L(bf, {livre: 'Résumé, table des matières', revue: 'Sommaire (texte libre)'}, 'Résumé'), type: 'textarea', span: true, rows: 4, data: true},
    };
    const BUY = ['status', 'priority', 'cover_price', 'price_paid', 'bought_date', 'bought_where', 'buy_url', 'digital_url', 'storage', 'condition'];
    const FIELD_ORDER = {
        revue: ['periodical_id', 'number', 'date_text', 'special', 'title', 'category', ...BUY, 'pages_count', 'rating', 'read', 'summary'],
        livre: ['title', 'subtitle', 'creators', 'publisher', 'place', 'date_text', 'edition', 'isbn', 'periodical_id', 'number', 'pages_count', 'language', 'category', ...BUY, 'rating', 'read', 'summary'],
        doc: ['title', 'creators', 'channel', 'publisher', 'date_text', 'duration', 'periodical_id', 'number', 'language', 'video_url', 'category', ...BUY.filter(k => k !== 'digital_url'), 'rating', 'read', 'summary'],
        podcast: ['title', 'periodical_id', 'number', 'date_text', 'duration', 'host', 'guests', 'channel', 'publisher', 'language', 'audio_url', 'category', 'status', 'rating', 'read', 'summary'],
    };
    /** obligatoire : la revue d'un numéro, le titre de tout le reste */
    const requiredField = (k, bf) => bf === 'revue' ? k === 'periodical_id' : k === 'title';
    /** les champs d'un type, dans l'ordre : [{k, show, label?, type?}] (les réglages d'abord, puis ce qui manque) */
    function fieldsFor(fam) {
        const bf = baseOf(fam), def = FIELD_ORDER[bf], all = [...def, ...Object.keys(FIELD_CAT).filter(k => !def.includes(k))];
        const cfg = Array.isArray(typeCfg(fam).fields) ? typeCfg(fam).fields.filter(f => f && (FIELD_CAT[f.k] || /^cf_[a-z0-9_]{1,30}$/.test(f.k))) : [];
        const out = cfg.map(f => ({...f, show: !!f.show || requiredField(f.k, bf)}));
        all.forEach(k => { if (!out.some(f => f.k === k)) out.push({k, show: def.includes(k)}); });
        return out;
    }
    const fieldLabel = (f, bf) => f.label && f.k.startsWith('cf_') ? f.label : (typeof FIELD_CAT[f.k]?.label === 'function' ? FIELD_CAT[f.k].label(bf) : FIELD_CAT[f.k]?.label || f.k);
    const categories = () => [...new Set(D.issues.map(i => i.data?.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

    /* ─── Un numéro, un livre, un documentaire, un épisode (et son contenu) ─── */
    function issueDialog(i, periodicalId = 0, fam0 = '') {
        const per0 = D.periodicals.find(p => p.id === Number(periodicalId));
        const fam = i ? famOf(i) : (per0?.family || fam0 || prefs().fam || 'revue'), w = Wf(fam), bf = baseOf(fam), isT = timed(fam);
        const conts = D.periodicals.filter(p => (p.family || 'revue') === fam);
        if (bf === 'revue' && !conts.length) { toast(`Ajoute d’abord ${fam === 'revue' ? 'une revue' : `une « ${w.cont} »`}.`); return periodicalDialog(null, fam); }
        const d = i?.data || {}, arts = i ? partsOf(i) : [], vid = i && bf === 'doc' ? videoOf(i) : null, aud = i && bf === 'podcast' ? audioOf(i) : null;
        const pid = i?.periodical_id ?? (per0 && (per0.family || 'revue') === fam ? per0.id : (bf === 'revue' ? conts[0].id : 0));
        const one = f => { const c = FIELD_CAT[f.k] || {}, lab = fieldLabel(f, bf), v = c.data || f.k.startsWith('cf_') ? d[f.k] : i?.[f.k], ph = typeof c.ph === 'function' ? c.ph(bf) : c.ph || '';
            if (f.k === 'periodical_id') return field('periodical_id', bf === 'revue' ? w.cont : w.cont + ' (facultatif)', pid, {type: 'select', list: [...(bf === 'revue' ? [] : [[0, '— aucune —']]), ...conts.map(p => [p.id, p.title])]});
            if (c.type === 'status') return field('status', lab, i?.status || '', {type: 'select', list: Object.entries(D.statuses)});
            if (c.type === 'cat') return `<label>${esc(lab)}<input name="category" list="h-pr-cats" value="${esc(v || '')}" placeholder="Généalogie, histoire locale, guerre…" autocomplete="off"></label>`;
            const t = f.k.startsWith('cf_') ? ({textarea: 'textarea', check: 'check', number: 'number', date: 'date', url: 'url'}[f.type] || 'text') : c.type || 'text';
            const html = field(f.k, lab, v ?? '', {type: t, span: c.span || t === 'textarea', ph, list: c.list, rows: c.rows || 3});
            return f.k === 'date_text' ? html.replace('<input ', '<input data-ui-date="nocal" ') : html; }; // C4 : « ✓ Compris : mars 2024 »
        const fields = fieldsFor(fam).filter(f => f.show).map(one).join('') + `<datalist id="h-pr-cats">${categories().map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
        const roles = bf === 'doc' ? [['cover', '🖼️ Affiche, vignette', 'image/*'], ['video', '🎞️ Le film lui-même (fichier vidéo, si tu l’as)', 'video/*'], ['', '📸 Captures d’écran, documents', 'image/*,application/pdf']]
            : bf === 'podcast' ? [['cover', '🖼️ Image de l’émission', 'image/*'], ['audio', '🎧 L’épisode lui-même (fichier audio, si tu l’as)', 'audio/*'], ['', '📸 Captures, documents', 'image/*,application/pdf']]
            : [['cover', '🖼️ Couverture', 'image/*'], ['', bf === 'livre' ? '📸 Pages photographiées, captures, PDF' : '📸 Captures d’écran, pages, PDF', 'image/*,application/pdf']];
        const onlineUrl = bf === 'podcast' ? d.audio_url : d.video_url, player0 = vid || aud;
        const partLine = (a, k) => { const th = isT ? thumbOf(a, ['']) : null, sec = tcSec(a.pages);
            return `<li data-art="${a.id}">${th ? `<img class="h-pr-mthumb" src="media/${encodeURIComponent(th.thumbnail || th.filename)}" alt="">` : ''}${isT && a.pages ? `<button type="button" class="h-pr-tc" data-seek="${sec ?? ''}" title="${player0 ? 'Aller à ce moment' : onlineUrl ? 'Ouvrir à ce moment' : ''}">⏱ ${esc(a.pages)}</button> ` : ''}<button type="button" class="link-button" data-art-edit>${esc(a.title)}</button> <small>${esc([a.authors, !isT && a.pages && 'p. ' + a.pages, D.article_kinds[a.kind]].filter(Boolean).join(' · '))}</small>
                ${isT ? '' : `<span><button type="button" class="icon-button" data-art-move="-1" ${k ? '' : 'disabled'} title="Monter">↑</button><button type="button" class="icon-button" data-art-move="1" ${k < arts.length - 1 ? '' : 'disabled'} title="Descendre">↓</button></span>`}</li>`; };
        const player = !isT || !i ? '' : vid ? `<div class="h-pr-player"><video controls preload="metadata" src="media/${encodeURIComponent(vid.filename)}" data-pr-video></video>
                <div class="h-pr-playbar"><b data-pr-now>0:00</b><button type="button" class="button small" data-pr-grab>📸 Capturer cette image</button><button type="button" class="button small secondary" data-pr-mark>📌 Noter ce moment</button><small class="muted">La capture s’ouvre dans un nouveau moment, à annoter.</small></div></div>`
            : aud ? `<div class="h-pr-player is-audio"><audio controls preload="metadata" src="media/${encodeURIComponent(aud.filename)}" data-pr-video></audio>
                <div class="h-pr-playbar"><b data-pr-now>0:00</b><button type="button" class="button small" data-pr-mark>📌 Noter ce moment</button><small class="muted">Le minutage du moment se remplit tout seul.</small></div></div>`
            : bf === 'podcast' ? `<p class="muted h-pr-hint">🎧 Pour écouter l’épisode ici et noter ses moments d’un clic, ajoute le fichier audio plus bas. Sinon : écoute-le ${urlAt(d.audio_url, null) ? `<a href="${esc(urlAt(d.audio_url, null))}" target="_blank" rel="noopener">en ligne ↗</a>` : 'où tu veux'}, puis « ＋ Moment » avec son minutage.</p>`
            : `<p class="muted h-pr-hint">🎞️ Pour regarder le film ici et capturer ses images d’un clic, ajoute le fichier vidéo plus bas. Sinon : regarde-le ${urlAt(d.video_url, null) ? `<a href="${esc(urlAt(d.video_url, null))}" target="_blank" rel="noopener">en ligne ↗</a>` : 'où tu veux'}, fais une capture d’écran (⌘⇧4 sur Mac, Win+Maj+S sur PC), puis « ＋ Moment » et colle-la (⌘V / Ctrl+V).</p>`;
        const newTitle = {revue: 'Nouveau numéro', livre: 'Nouveau livre', doc: 'Nouveau documentaire', podcast: 'Nouvel épisode'}[fam] || `Nouveau : ${w.item}`;
        ext.openDialog({eyebrow: w.item.toUpperCase(), title: i ? issueName(i) : newTitle, wide: true, labels: ['periodical_issue', i?.labels || []],
            body: `<div class="form-grid">${fields}${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>
                <p class="muted h-pr-setnote">Les champs montrés et leur ordre se règlent dans « ⚙️ Réglages » (en haut de la liste).</p>
                ${linksField(i?.links || [])}
                ${ext.mediaEditorHtml ? ext.mediaEditorHtml('periodical_issue', i?.id || 0, i?.media || [], roles) : ''}
                <section class="h-pr-arts"><h3>${isT ? (bf === 'podcast' ? '🎙️' : '🎬') : '📄'} ${esc(w.parts)}${arts.length ? ` (${arts.length})` : ''}</h3>${player}
                    ${i ? `${arts.length ? `<ol class="${isT ? 'is-moments' : ''}">${arts.map(partLine).join('')}</ol>` : `<p class="muted">${esc(w.none)}</p>`}<div class="page-actions compact"><button type="button" class="button small" data-art-add>＋ ${esc(w.part)}</button><button type="button" class="button small secondary" data-to-atelier>📚 Vers l’Atelier</button></div>` : `<p class="muted">Enregistre d’abord, puis ajoute ${isT ? 'ses moments' : bf === 'livre' ? 'ses chapitres et passages' : 'ses articles'}.</p>`}</section>`,
            onOpen: dl => {
                bindLinks(dl);
                const video = dl.querySelector('[data-pr-video]');
                if (video) {
                    const now = dl.querySelector('[data-pr-now]');
                    video.addEventListener('timeupdate', () => { now.textContent = fmtTc(video.currentTime); });
                    dl.querySelector('[data-pr-grab]')?.addEventListener('click', async () => {
                        try { const at = video.currentTime; video.pause(); const file = await grabFrame(video, at); articleDialog(null, i, {pages: fmtTc(at), file}); } catch (err) { toast(err.message, 'error'); }
                    });
                    dl.querySelector('[data-pr-mark]').addEventListener('click', () => { video.pause(); articleDialog(null, i, {pages: fmtTc(video.currentTime)}); });
                }
                dl.querySelectorAll('[data-seek]').forEach(b => b.addEventListener('click', () => { const s = Number(b.dataset.seek); if (b.dataset.seek === '') return;
                    if (video) { video.currentTime = s; video.play().catch(() => {}); video.scrollIntoView({block: 'nearest', behavior: 'smooth'}); } else if (urlAt(onlineUrl, s)) window.open(urlAt(onlineUrl, s), '_blank', 'noopener'); }));
                dl.querySelector('[data-art-add]')?.addEventListener('click', () => articleDialog(null, i, video ? {pages: video.currentTime ? fmtTc(video.currentTime) : ''} : {}));
                dl.querySelector('[data-to-atelier]')?.addEventListener('click', () => atelierDialog([{type: 'issue', id: i.id}], true));
                dl.querySelectorAll('[data-art-edit]').forEach(b => b.addEventListener('click', () => articleDialog(D.articles.find(a => a.id === Number(b.closest('[data-art]').dataset.art)), i)));
                dl.querySelectorAll('[data-art-move]').forEach(b => b.addEventListener('click', async () => { const ids = arts.map(a => a.id), k = ids.indexOf(Number(b.closest('[data-art]').dataset.art)), j = k + Number(b.dataset.artMove); [ids[k], ids[j]] = [ids[j], ids[k]]; await post('reorder_periodical_articles', {issue_id: i.id, ids}); await reload(); dl.close(); issueDialog(D.issues.find(x => x.id === i.id)); }));
            },
            onSubmit: async form => {
                const v = A().formObject(form);
                // les champs cachés gardent leur valeur : on ne renvoie que ceux du formulaire, le reste de « data » est repris tel quel
                const keys = [...Object.keys(FIELD_CAT).filter(k => FIELD_CAT[k].data), ...fieldsFor(fam).filter(f => f.k.startsWith('cf_')).map(f => f.k), 'notes'];
                const data = {...(i?.data || {}), ...dataOf(form, keys)};
                const r = await post('save_periodical_issue', {id: i?.id || 0, family: fam, periodical_id: form.elements.periodical_id ? v.periodical_id || 0 : pid || 0, number: form.elements.number ? v.number || '' : i?.number || '', title: form.elements.title ? v.title || '' : i?.title || '',
                    date_text: form.elements.date_text ? v.date_text || '' : i?.date_text || '', status: form.elements.status ? v.status : i?.status || '', data, ...readLinks(form), label_ids: readLabels(form)});
                const id = Number((r.result || r).id);
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'periodical_issue', id);
                toast('Enregistré.'); await reload();
                const hadPlayer = !!player0, nowPlayer = isT && [...form.querySelectorAll('[data-h-upload-role="video"],[data-h-upload-role="audio"]')].some(x => x.files?.length);
                if (!i || (nowPlayer && !hadPlayer)) setTimeout(() => issueDialog(D.issues.find(x => x.id === id)), 50); // on reste dessus pour ajouter le contenu, ou regarder / écouter
            },
            onDelete: i ? async () => { if (!await A().confirmBox(`Supprimer ${issueName(i)} et tout son contenu ? (les images restent dans les Médias)`, {title: 'Supprimer le numéro', okLabel: 'Supprimer le numéro'})) return false; await post('delete_periodical_item', {what: 'issue', id: i.id}); await reload(); } : null});
    }

    /* ─── ⚙️ Réglages des types : ceux de départ et les tiens ; pour chacun, les champs (montrés, ordre, champs à soi) et l'affichage ─── */
    function typesDialog() {
        const BASE_NAMES = {revue: '📰 Revue (numéros, articles)', livre: '📖 Livre (chapitres, passages)', doc: '🎬 Documentaire (moments minutés, film)', podcast: '🎙️ Podcast (épisodes, moments minutés, son)'};
        let T = allFams().map(k => { const c = typeCfg(k); return {key: k, base: baseOf(k), name: c.name || '', item: c.item || '', icon: c.icon || '', view: c.view || 'list', group: c.group || '', fields: fieldsFor(k).map(f => ({...f}))}; });
        let cur = prefs().fam && T.some(t => t.key === prefs().fam) ? prefs().fam : 'revue';
        const tOf = () => T.find(t => t.key === cur) || T[0];
        const nameOf = t => BASES.includes(t.key) ? ({revue: '📰 Revues', livre: '📖 Livres', doc: '🎬 Documentaires', podcast: '🎙️ Podcasts'}[t.key]) : `${t.icon || '📁'} ${t.name || 'Mon type'}`;
        const paint = dl => {
            const t = tOf(), mine = !BASES.includes(t.key), bf = t.base;
            dl.querySelector('[data-ty-body]').innerHTML = `<div class="h-pr-tylist">${T.map(x => `<button type="button" class="${x.key === cur ? 'is-on' : ''}" data-ty-pick="${esc(x.key)}">${esc(nameOf(x))}</button>`).join('')}<button type="button" class="button small" data-ty-new>＋ Nouveau type</button></div>
                <div class="h-pr-tyedit">
                ${mine ? `<div class="form-grid"><label>Nom (au pluriel)<input data-ty="name" value="${esc(t.name)}" placeholder="Cartes postales, Thèses, Expositions…" maxlength="60"></label><label>Un élément s’appelle<input data-ty="item" value="${esc(t.item)}" placeholder="Carte, Thèse, Exposition…" maxlength="40"></label>
                    <label>Icône<input data-ty="icon" value="${esc(t.icon)}" placeholder="📮" maxlength="8"></label><label>Il fonctionne comme<select data-ty="base">${BASES.map(b => `<option value="${b}" ${b === bf ? 'selected' : ''}>${esc(BASE_NAMES[b])}</option>`).join('')}</select></label></div>` : `<p class="muted">${esc(BASE_NAMES[t.key])}</p>`}
                <div class="form-grid"><label>Affichage par défaut<select data-ty="view"><option value="list" ${t.view === 'list' ? 'selected' : ''}>📋 Liste</option><option value="cards" ${t.view === 'cards' ? 'selected' : ''}>🗂️ Fiches</option></select></label><label class="checkbox-line"><input type="checkbox" data-ty="group" ${t.group === 'category' ? 'checked' : ''}> Grouper par catégorie par défaut</label></div>
                <h4>Champs de la fiche (montrés, dans cet ordre)</h4><p class="muted">Coche ce qui s’affiche (dans la fiche de l’élément et sur ses cartes) ; ↑ ↓ pour l’ordre. Un champ caché garde ce qu’on y avait écrit.</p>
                <ol class="h-pet-layout h-pr-tyfields">${t.fields.map((f, n) => { const req = requiredField(f.k, bf), own = f.k.startsWith('cf_');
                    return `<li class="h-pet-lrow" data-n="${n}"><input type="checkbox" data-ty-show ${f.show || req ? 'checked' : ''} ${req ? 'disabled title="Obligatoire"' : ''}>${own ? `<input class="h-pr-tyown" data-ty-flabel value="${esc(f.label || '')}" placeholder="Nom du champ" maxlength="60"><select data-ty-ftype>${[['text', 'texte'], ['textarea', 'long texte'], ['number', 'nombre'], ['date', 'date'], ['url', 'lien'], ['check', 'case à cocher']].map(([v, l]) => `<option value="${v}" ${(f.type || 'text') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<span>${esc(fieldLabel(f, bf))}</span>`}
                        <button type="button" class="h-bt" data-ty-up title="Monter">↑</button><button type="button" class="h-bt" data-ty-down title="Descendre">↓</button>${own ? '<button type="button" class="h-bt" data-ty-fdel title="Retirer ce champ">🗑</button>' : ''}</li>`; }).join('')}</ol>
                <div class="page-actions compact"><button type="button" class="button small secondary" data-ty-addfield>＋ Champ à moi</button><button type="button" class="button small secondary" data-ty-reset>Champs comme au départ</button>${mine ? '<button type="button" class="button small danger" data-ty-del>Supprimer ce type</button>' : ''}</div></div>`;
        };
        ext.openDialog({eyebrow: '📚 REVUES, LIVRES, DOCUMENTAIRES, PODCASTS', title: '⚙️ Réglages des types', wide: true, submitLabel: 'Enregistrer',
            body: `<div class="h-pr-types" data-ty-body></div>`,
            onOpen: dl => {
                paint(dl);
                const body = dl.querySelector('[data-ty-body]');
                body.addEventListener('input', e => { const t = tOf(), k = e.target.dataset.ty; if (k && ['name', 'item', 'icon'].includes(k)) t[k] = e.target.value; const li = e.target.closest('[data-n]'); if (li && e.target.matches('[data-ty-flabel]')) t.fields[Number(li.dataset.n)].label = e.target.value; });
                body.addEventListener('change', e => { const t = tOf(), k = e.target.dataset.ty, li = e.target.closest('[data-n]');
                    if (k === 'base') { t.base = e.target.value; paint(dl); } // les champs restent ; les libellés suivent le nouveau comportement
                    if (k === 'view') t.view = e.target.value; if (k === 'group') t.group = e.target.checked ? 'category' : '';
                    if (li && e.target.matches('[data-ty-show]')) t.fields[Number(li.dataset.n)].show = e.target.checked;
                    if (li && e.target.matches('[data-ty-ftype]')) t.fields[Number(li.dataset.n)].type = e.target.value; });
                body.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return; const t = tOf(), li = b.closest('[data-n]'), n = li ? Number(li.dataset.n) : -1;
                    if (b.dataset.tyPick) { cur = b.dataset.tyPick; return paint(dl); }
                    if (b.matches('[data-ty-new]')) { const key = 'c_' + Date.now().toString(36).slice(-8); T.push({key, base: 'livre', name: 'Mon type', item: 'Élément', icon: '📁', view: 'cards', group: '', fields: FIELD_ORDER.livre.map(k => ({k, show: true}))}); cur = key; paint(dl); dl.querySelector('[data-ty="name"]')?.select(); return; }
                    if (b.matches('[data-ty-up]') && n > 0) { [t.fields[n - 1], t.fields[n]] = [t.fields[n], t.fields[n - 1]]; return paint(dl); }
                    if (b.matches('[data-ty-down]') && n < t.fields.length - 1) { [t.fields[n + 1], t.fields[n]] = [t.fields[n], t.fields[n + 1]]; return paint(dl); }
                    if (b.matches('[data-ty-fdel]')) { t.fields.splice(n, 1); return paint(dl); }
                    if (b.matches('[data-ty-addfield]')) { let k; do { k = 'cf_' + Math.random().toString(36).slice(2, 8); } while (t.fields.some(f => f.k === k)); t.fields.push({k, show: true, label: '', type: 'text'}); paint(dl); [...dl.querySelectorAll('[data-ty-flabel]')].pop()?.focus(); return; }
                    if (b.matches('[data-ty-reset]')) { const own = t.fields.filter(f => f.k.startsWith('cf_')), def = FIELD_ORDER[t.base]; t.fields = [...def.map(k => ({k, show: true})), ...Object.keys(FIELD_CAT).filter(k => !def.includes(k)).map(k => ({k, show: false})), ...own]; return paint(dl); }
                    if (b.matches('[data-ty-del]')) { const n2 = D.issues.filter(i => i.family === t.key).length + D.periodicals.filter(x => x.family === t.key).length;
                        if (!await A().confirmBox(`Supprimer le type « ${t.name} » ?${n2 ? ` ${n2 > 1 ? `Ses ${n2} éléments passeront` : `Son élément passera`} dans « ${BASE_NAMES[t.base]} » (rien n’est effacé).` : ''}`, {title: 'Supprimer le type', okLabel: 'Supprimer le type'})) return; T = T.filter(x => x !== t); cur = 'revue'; return paint(dl); }
                });
            },
            onSubmit: async () => {
                const bad = T.find(t => !BASES.includes(t.key) && !String(t.name).trim()); if (bad) { toast('Donne un nom à chaque type.', 'error'); return false; }
                const types = T.map(t => ({key: t.key, base: t.base, name: t.name, item: t.item, icon: t.icon, view: t.view, group: t.group, fields: t.fields.filter(f => !f.k.startsWith('cf_') || String(f.label || '').trim()).map(f => ({k: f.k, show: !!f.show, ...(f.k.startsWith('cf_') ? {label: f.label, type: f.type || 'text'} : {})}))}));
                await post('save_periodical_types', {types}); toast('Réglages des types enregistrés.'); await reload();
            }});
    }

    /** L'image du film à cet instant, en JPEG */
    function grabFrame(video, at) {
        return new Promise((ok, ko) => {
            if (!video.videoWidth) return ko(new Error('La vidéo n’est pas encore prête : lance-la un instant puis recommence.'));
            const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
            try { c.getContext('2d').drawImage(video, 0, 0); } catch (_) { return ko(new Error('Impossible de capturer cette vidéo.')); }
            c.toBlob(b => b ? ok(new File([b], `capture-${fmtTc(at).replace(/:/g, '-')}.jpg`, {type: 'image/jpeg'})) : ko(new Error('Capture impossible.')), 'image/jpeg', 0.92);
        });
    }

    /* ─── ✏️ Annoter une capture : flèche, cercle, cadre, trait, texte ─── */
    function annotator(host, file, onChange) {
        host.innerHTML = `<div class="h-pr-anbar"><span class="section-label">✏️ Annoter</span>${[['arrow', '➜ Flèche'], ['ellipse', '◯ Cercle'], ['rect', '▭ Cadre'], ['pen', '✎ Trait'], ['text', 'T Texte']].map(([k, l], n) => `<button type="button" class="button small ${n ? 'secondary' : ''}" data-an-tool="${k}">${l}</button>`).join('')}
            <input type="color" value="#ff2d2d" data-an-color title="Couleur"><label class="h-pr-anw">Épaisseur <input type="range" min="2" max="24" value="6" data-an-w></label><button type="button" class="button small secondary" data-an-undo>↶ Annuler</button><button type="button" class="button small secondary" data-an-clear>Tout effacer</button></div>
            <canvas class="h-pr-ancv"></canvas>`;
        const cv = host.querySelector('canvas'), cx = cv.getContext('2d'), img = new Image(), shapes = [];
        let tool = 'arrow', cur = null;
        const url = URL.createObjectURL(file); img.addEventListener('load', () => URL.revokeObjectURL(url), {once: true});
        const color = () => host.querySelector('[data-an-color]').value, width = () => Number(host.querySelector('[data-an-w]').value) * Math.max(1, cv.width / 1200);
        const paint = () => {
            cx.drawImage(img, 0, 0);
            for (const s of [...shapes, cur].filter(Boolean)) {
                cx.strokeStyle = cx.fillStyle = s.c; cx.lineWidth = s.w; cx.lineCap = cx.lineJoin = 'round';
                if (s.t === 'rect') cx.strokeRect(s.x, s.y, s.x2 - s.x, s.y2 - s.y);
                else if (s.t === 'ellipse') { cx.beginPath(); cx.ellipse((s.x + s.x2) / 2, (s.y + s.y2) / 2, Math.abs(s.x2 - s.x) / 2 || 1, Math.abs(s.y2 - s.y) / 2 || 1, 0, 0, Math.PI * 2); cx.stroke(); }
                else if (s.t === 'pen') { cx.beginPath(); s.pts.forEach(([x, y], k) => k ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke(); }
                else if (s.t === 'arrow') { const a = Math.atan2(s.y2 - s.y, s.x2 - s.x), h = s.w * 4; cx.beginPath(); cx.moveTo(s.x, s.y); cx.lineTo(s.x2, s.y2); cx.stroke();
                    cx.beginPath(); cx.moveTo(s.x2, s.y2); cx.lineTo(s.x2 - h * Math.cos(a - 0.45), s.y2 - h * Math.sin(a - 0.45)); cx.lineTo(s.x2 - h * Math.cos(a + 0.45), s.y2 - h * Math.sin(a + 0.45)); cx.closePath(); cx.fill(); }
                else if (s.t === 'text') { cx.font = `bold ${s.w * 5}px system-ui, sans-serif`; cx.lineWidth = s.w / 2; cx.strokeStyle = '#fff'; cx.strokeText(s.txt, s.x, s.y); cx.fillText(s.txt, s.x, s.y); }
            }
        };
        // la capture à envoyer : une promesse (l'image annotée se fabrique en arrière-plan ; l'envoi l'attend)
        const changed = () => { paint(); if (!shapes.length) return onChange(Promise.resolve(file)); onChange(new Promise(r => cv.toBlob(b => r(b ? new File([b], file.name.replace(/\.\w+$/, '') + '-annotee.jpg', {type: 'image/jpeg'}) : file), 'image/jpeg', 0.92))); };
        img.onload = () => { cv.width = img.naturalWidth; cv.height = img.naturalHeight; paint(); };
        img.src = url;
        const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
        host.querySelectorAll('[data-an-tool]').forEach(b => b.addEventListener('click', () => { tool = b.dataset.anTool; host.querySelectorAll('[data-an-tool]').forEach(x => x.classList.toggle('secondary', x !== b)); }));
        host.querySelector('[data-an-undo]').addEventListener('click', () => { shapes.pop(); changed(); });
        host.querySelector('[data-an-clear]').addEventListener('click', () => { shapes.length = 0; changed(); });
        cv.addEventListener('pointerdown', async e => {
            const [x, y] = pos(e);
            if (tool === 'text') { const txt = A().askText ? await A().askText({title: 'Texte sur l’image', message: 'Quoi écrire ?', okLabel: 'Placer'}) : prompt('Texte :'); if (txt) { shapes.push({t: 'text', x, y, txt, c: color(), w: width()}); changed(); } return; }
            cur = {t: tool, x, y, x2: x, y2: y, pts: [[x, y]], c: color(), w: width()}; cv.setPointerCapture(e.pointerId);
        });
        cv.addEventListener('pointermove', e => { if (!cur) return; const [x, y] = pos(e); cur.x2 = x; cur.y2 = y; cur.pts.push([x, y]); paint(); });
        cv.addEventListener('pointerup', () => { if (!cur) return; if (Math.hypot(cur.x2 - cur.x, cur.y2 - cur.y) > 3 || cur.t === 'pen') shapes.push(cur); cur = null; changed(); });
    }

    /* ─── Un article, un chapitre, un moment ─── */
    function articleDialog(a, issue, preset = {}) {
        if (!issue) return toast('Introuvable.', 'error');
        const d = a?.data || {}, fam0 = famOf(issue), w = Wf(fam0), bf = baseOf(fam0), isT = timed(fam0), fam = isT ? 'doc' : bf, pod = bf === 'podcast';
        const kinds = Object.entries(D.article_kinds).filter(([k]) => (D.family_article_kinds?.[bf] || Object.keys(D.article_kinds)).includes(k));
        const fields = fam === 'doc'
            ? `${field('pages', 'Moment (minutage)', a?.pages || preset.pages || '', {ph: '52:34 ou 1:02:10 – 1:03:00'})}${field('kind', 'Sorte', a?.kind || 'moment', {type: 'select', list: kinds})}
               ${field('title', 'En quelques mots', a?.title || '', {span: true, ph: 'La maison de l’arrière-grand-père, l’acte de mariage montré…'})}${field('authors', pod ? 'Qui parle' : 'Qui parle, qui on voit', a?.authors || '')}${field('places', 'Lieux', d.places)}
               ${field('what_seen', pod ? 'Ce qu’on entend, ce qu’on apprend' : 'Ce qu’on voit, ce qu’on apprend', d.what_seen, {type: 'textarea', span: true, rows: 3})}${field('transcript', 'Ce qui est dit (mot à mot)', d.transcript, {type: 'textarea', span: true, rows: 2})}
               ${field('period', 'Période', d.period)}${field('surnames', 'Noms cités', d.surnames)}${field('sources', 'Documents montrés, sources', d.sources, {type: 'textarea', span: true, rows: 2})}${field('keywords', 'Mots-clés', d.keywords, {span: true})}
               ${field('rating', 'Importance', d.rating, {type: 'select', list: RATING})}`
            : `${field('title', fam === 'livre' ? 'Titre du chapitre, du passage' : 'Titre', a?.title || '', {span: true})}${field('authors', fam === 'livre' ? 'Auteur (si différent du livre)' : 'Auteurs', a?.authors || '')}${field('pages', 'Pages', a?.pages || '', {ph: '12-15'})}
               ${fam === 'revue' ? field('rubric', 'Rubrique', a?.rubric || '', {ph: 'Dossier, Histoire locale, Entraide…'}) : ''}${field('kind', 'Sorte', a?.kind || kinds[0]?.[0], {type: 'select', list: kinds})}
               ${field('summary', 'Résumé', d.summary, {type: 'textarea', span: true, rows: 4})}${field('quote', 'Passage à retenir (citation)', d.quote, {type: 'textarea', span: true, rows: 2})}
               ${field('keywords', 'Mots-clés', d.keywords, {span: true, ph: 'meunier, émigration, registres protestants…'})}${field('places', 'Lieux', d.places)}${field('period', 'Période', d.period, {ph: '1750-1820'})}
               ${field('surnames', 'Noms de famille cités', d.surnames, {span: true})}${field('sources', 'Sources citées', d.sources, {type: 'textarea', span: true, rows: 2})}
               ${field('url', 'Lien (version en ligne)', d.url, {ph: 'https://'})}${field('rating', 'Ma note', d.rating, {type: 'select', list: RATING})}${field('read', 'Lu', d.read, {type: 'check'})}`;
        const sec = tcSec(a?.pages || preset.pages), vurl = isT && sec !== null ? urlAt(pod ? issue.data?.audio_url : issue.data?.video_url, sec) : '';
        ext.openDialog({eyebrow: `${w.part.toUpperCase()} · ${issueName(issue)}`, title: a ? a.title : `Nouveau${fam === 'doc' ? ' moment' : fam === 'livre' ? ' chapitre ou passage' : ' article'}`, wide: true, labels: ['periodical_article', a?.labels || []],
            body: `<div class="form-grid">${fields}${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>
                ${vurl ? `<p><a href="${esc(vurl)}" target="_blank" rel="noopener">${pod ? '▶ Réécouter ce moment en ligne ↗' : '▶ Revoir ce moment en ligne ↗'}</a></p>` : ''}
                <section class="h-pr-capture"><h4>📸 ${fam === 'doc' ? 'Capture de ce moment' : 'Capture'}</h4><p class="muted" data-cap-hint>${fam === 'doc' ? 'Colle une capture d’écran (⌘V / Ctrl+V) ou choisis-la ci-dessous : tu peux ensuite l’annoter (flèches, cercles, texte).' : 'Colle une capture (⌘V / Ctrl+V) pour l’annoter avant de l’ajouter.'}</p><div data-cap-annot></div></section>
                ${linksField(a?.links || [])}
                ${ext.mediaEditorHtml ? ext.mediaEditorHtml('periodical_article', a?.id || 0, a?.media || [], [['', fam === 'doc' ? '📸 Captures de ce moment' : '📸 Captures d’écran, PDF', 'image/*,application/pdf']]) : ''}`,
            onOpen: dl => {
                bindLinks(dl);
                const host = dl.querySelector('[data-cap-annot]'), input = dl.querySelector('[data-h-upload-role=""]');
                let pending = null; // la capture annotée remplace, dans l'envoi, la capture d'origine
                const setPending = f => { pending = f; };
                const startAnnot = f => { pending = f; dl.querySelector('[data-cap-hint]').textContent = 'Dessine sur l’image : elle sera ajoutée telle quelle, annotations comprises.'; annotator(host, f, setPending); };
                if (preset.file) startAnnot(preset.file);
                dl.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (!f || e.target.closest('input[type=text],textarea')) return; e.preventDefault(); startAnnot(new File([f], `capture-${Date.now()}.png`, {type: f.type})); });
                input?.addEventListener('change', () => { const f = [...(input.files || [])].find(x => /^image\//.test(x.type)); if (f && !pending && input.files.length === 1) { startAnnot(f); input.value = ''; } });
                dl._pendingCapture = () => pending;
            },
            onSubmit: async form => {
                const v = A().formObject(form);
                const r = await post('save_periodical_article', {id: a?.id || 0, issue_id: issue.id, title: v.title || (v.pages ? `Moment ${v.pages}` : ''), authors: v.authors || '', pages: v.pages || '', rubric: v.rubric || '', kind: v.kind,
                    data: dataOf(form, ['what_seen', 'transcript', 'summary', 'quote', 'keywords', 'places', 'period', 'surnames', 'sources', 'url', 'rating', 'read', 'notes']), ...readLinks(form), label_ids: readLabels(form)});
                const id = Number((r.result || r).id), cap = await form.closest('dialog')._pendingCapture?.();
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'periodical_article', id);
                if (cap && ext.uploadFiles) await ext.uploadFiles('periodical_article', id, [cap], '');
                toast('Enregistré.'); await reload();
                const open = [...document.querySelectorAll('dialog[open] .h-pr-arts')].pop(); if (open) { open.closest('dialog').close(); setTimeout(() => issueDialog(D.issues.find(x => x.id === issue.id)), 50); }
            },
            onDelete: a ? async () => { if (!await A().confirmBox(`Supprimer « ${a.title} » ?`, {title: 'Supprimer l’article', okLabel: 'Supprimer l’article'})) return false; await post('delete_periodical_item', {what: 'article', id: a.id}); await reload(); } : null});
    }

    /* ─── 📚 Vers un projet de l'Atelier ─── */
    async function atelierDialog(items, withParts = false) {
        if (!items.length) return toast('Rien à envoyer : la liste affichée est vide.');
        let projects = [];
        try { projects = (await api('atelier_projects')).projects || []; } catch (e) { return toast(e.message, 'error'); }
        if (!projects.length) return toast('Crée d’abord un projet dans Enquêtes → Atelier.');
        const hasParts = withParts && items.some(x => D.articles.some(a => a.issue_id === x.id));
        ext.openDialog({eyebrow: 'VERS L’ATELIER', title: `${items.length} élément${items.length > 1 ? 's' : ''} à mettre dans un projet`, submitLabel: 'Mettre dans le projet',
            body: `<p class="muted">Chaque élément devient une <b>référence</b> du projet (auteurs, revue, numéro, pages ou minutage, résumé, étiquettes, captures) ; un passage à retenir ou ce qui est dit devient en plus une <b>citation</b>.</p>
                <div class="form-grid"><label>Projet<select name="project">${projects.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></label><label>Dossier<select name="folder"><option value="0">— à la racine —</option></select></label>
                ${hasParts ? '<label class="checkbox-line span-2"><input type="checkbox" name="parts" value="1" checked> avec leur contenu (articles, chapitres, moments)</label>' : ''}</div>`,
            onOpen: dl => {
                const ps = dl.querySelector('[name=project]'), fs = dl.querySelector('[name=folder]');
                const load = async () => { const r = await api('atelier_project', {id: ps.value}).catch(() => ({folders: []}));
                    const kids = pid => (r.folders || []).filter(f => (Number(f.parent_id) || 0) === pid);
                    const walk = (pid, depth) => kids(pid).flatMap(f => [`<option value="${f.id}">${'  '.repeat(depth)}${depth ? '└ ' : ''}${esc(f.name)}</option>`, ...walk(Number(f.id), depth + 1)]);
                    fs.innerHTML = '<option value="0">— à la racine —</option>' + walk(0, 0).join(''); };
                ps.addEventListener('change', load); load();
            },
            onSubmit: async form => {
                let list = items;
                if (form.elements.parts?.checked) list = items.flatMap(x => x.type === 'issue' ? [x, ...partsOf(D.issues.find(i => i.id === x.id) || {id: 0}).map(a => ({type: 'article', id: a.id}))] : [x]);
                const r = await post('periodicals_to_atelier', {project_id: form.elements.project.value, folder_id: form.elements.folder.value, items: list});
                toast(`${A().plural((r.result || r).created, 'élément ajouté', 'éléments ajoutés')} au projet de l’Atelier.`);
            }});
    }
    /** Depuis l'Atelier : « + Ajouter ▾ → 📚 Revues, livres, documentaires… » */
    ext.pickLibraryForAtelier = async (projectId, folderId, done) => {
        try { D = await api('periodicals'); } catch (e) { return toast(e.message, 'error'); }
        if (!D.issues.length) return toast('Rien encore dans Listes → Revues, livres et documentaires.');
        const rows = [...D.issues.map(i => ({key: 'issue:' + i.id, fam: famOf(i), label: issueName(i), sub: [i.data?.creators, i.date_text].filter(Boolean).join(' · ')})),
            ...D.articles.map(a => { const i = issueOf(a); return {key: 'article:' + a.id, fam: famOf(a), label: (timed(famOf(a)) && a.pages ? `⏱ ${a.pages} — ` : '') + a.title, sub: `dans ${i ? issueName(i) : '?'}${a.authors ? ' · ' + a.authors : ''}`, child: true}; })];
        ext.openDialog({eyebrow: 'ATELIER', title: '📚 Ajouter des revues, livres, documentaires', wide: true, submitLabel: 'Ajouter au projet',
            body: `<div class="h-pr-pickbar"><input type="search" data-pk-q placeholder="Chercher…"><select data-pk-fam><option value="">Tout</option>${allFams().map(k => `<option value="${esc(k)}">${Wf(k).ic} ${esc(Wf(k).items)}</option>`).join('')}</select><button type="button" class="link-button" data-pk-all>tout cocher (affichés)</button></div>
                <div class="h-pr-pick">${rows.map(r => `<label class="checkbox-line ${r.child ? 'is-child' : ''}" data-fam="${r.fam}"><input type="checkbox" value="${r.key}"> ${Wf(r.fam).ic} <span><b>${esc(r.label)}</b> <small class="muted">${esc(r.sub)}</small></span></label>`).join('')}</div>`,
            onOpen: dl => {
                const q = dl.querySelector('[data-pk-q]'), fam = dl.querySelector('[data-pk-fam]');
                const filt = () => dl.querySelectorAll('.h-pr-pick label').forEach(l => { l.hidden = (fam.value && l.dataset.fam !== fam.value) || !l.textContent.toLowerCase().includes(q.value.trim().toLowerCase()); });
                q.addEventListener('input', filt); fam.addEventListener('change', filt);
                dl.querySelector('[data-pk-all]').addEventListener('click', () => dl.querySelectorAll('.h-pr-pick label:not([hidden]) input').forEach(c => { c.checked = true; }));
            },
            onSubmit: async form => {
                const items = [...form.querySelectorAll('.h-pr-pick input:checked')].map(c => { const [type, id] = c.value.split(':'); return {type, id: Number(id)}; });
                if (!items.length) { toast('Coche au moins un élément.', 'error'); return false; }
                const r = await post('periodicals_to_atelier', {project_id: projectId, folder_id: folderId, items});
                toast(`${A().plural((r.result || r).created, 'élément ajouté', 'éléments ajoutés')}.`); done?.();
            }});
    };
    ext.openPeriodicalIssue = id => api('periodicals').then(r => { D = r; issueDialog(D.issues.find(i => i.id === Number(id))); });
    ext.periodicalsInternals = {tcSec, fmtTc, urlAt};
})();
