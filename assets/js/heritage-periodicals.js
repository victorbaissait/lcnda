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
    const money = v => { const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
    const euro = n => n === null ? '' : n.toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'});
    const stars = n => Number(n) ? '★'.repeat(Number(n)) + '☆'.repeat(5 - Number(n)) : '';
    let D = null; // tout ce que le serveur a renvoyé

    /* ─── Les mots de chaque famille ─── */
    const W = {
        revue: {ic: '📰', item: 'Numéro', items: 'Numéros', cont: 'Revue', conts: 'Revues', part: 'Article', parts: 'Articles', pages: 'Pages', none: 'Aucun article pour l’instant.'},
        livre: {ic: '📖', item: 'Livre', items: 'Livres', cont: 'Collection, série', conts: 'Collections, séries', part: 'Chapitre, passage', parts: 'Chapitres, passages', pages: 'Pages', none: 'Aucun chapitre ni passage noté.'},
        doc: {ic: '🎬', item: 'Documentaire', items: 'Documentaires, films', cont: 'Série, émission', conts: 'Séries, émissions', part: 'Moment', parts: 'Moments', pages: 'Minutage', none: 'Aucun moment noté.'},
        '': {ic: '📚', item: 'Élément', items: 'Numéros, livres, films', cont: 'Revue, collection, série', conts: 'Revues, collections, séries', part: 'Contenu', parts: 'Articles, chapitres, moments', pages: 'Pages, minutage'},
    };
    const famOf = r => !r ? 'revue' : r.issue_id !== undefined ? famOf(issueOf(r)) : (r.family || 'revue');

    /* ─── Minutage : « 52:34 », « 1:02:10 », « 52'34 », « 52 min 34 » ─── */
    function tcSec(t) {
        const m = String(t || '').match(/(\d{1,2})\s*(?:[:h]|min)\s*(\d{1,2})(?:\s*[:'m]\s*(\d{1,2}))?|(\d{1,3})\s*['’]\s*(\d{1,2})/);
        if (!m) return null;
        if (m[4]) return Number(m[4]) * 60 + Number(m[5]);
        return m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
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
        family: ['Revue / livre / documentaire', r => ['revue', 'livre', 'doc'].indexOf(famOf(r))],
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
    const partsOf = i => { const list = D.articles.filter(a => a.issue_id === i.id); return famOf(i) === 'doc' ? list.sort((a, b) => (tcSec(a.pages) ?? 1e9) - (tcSec(b.pages) ?? 1e9) || a.position - b.position) : list; };
    const cmp = keys => (a, b) => { for (const k of keys) { const s = SORTS[k]; if (!s) continue; const x = s[1](a), y = s[1](b); if (x < y) return s[2] ? 1 : -1; if (x > y) return s[2] ? -1 : 1; } return 0; };

    /* ─── Filtres ─── */
    const prefs = () => ({fam: '', view: 'issues', q: '', periodical: '', kind: '', status: '', label: '', who: '', inv: '', y0: '', y1: '', sort: ['family', 'periodical', 'date'], ...ls(PREFS, {})});
    const textOfIssue = i => [i.number, i.title, i.date_text, pOf(i)?.title, ...Object.values(i.data || {}), ...(i.links || []).map(l => l.name), ...(i.labels || []).map(l => l.name),
        ...D.articles.filter(a => a.issue_id === i.id).flatMap(a => [a.title, a.authors, a.rubric, ...Object.values(a.data || {})])].join(' ').toLowerCase();
    const textOfArticle = a => [a.title, a.authors, a.pages, a.rubric, ...Object.values(a.data || {}), ...(a.links || []).map(l => l.name), ...(a.labels || []).map(l => l.name), pOf(a)?.title, issueOf(a)?.number, issueOf(a)?.title].join(' ').toLowerCase();
    function keep(r, f, isArticle) {
        const iss = isArticle ? issueOf(r) : r, per = pOf(r);
        if (f.fam && famOf(iss) !== f.fam) return false;
        if (f.q && !f.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => (isArticle ? textOfArticle(r) : textOfIssue(r)).includes(w))) return false;
        if (f.periodical && String(per?.id) !== f.periodical) return false;
        if (f.kind && per?.kind !== f.kind) return false;
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
    const cover = i => { const m = thumbOf(i); return m ? `<img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy">` : `<span>${W[famOf(i)].ic}</span>`; };
    const videoOf = i => (i.media || []).find(m => m.role === 'video') || (i.media || []).find(m => m.media_type === 'video');
    const issueName = i => { const p = pOf(i), f = famOf(i);
        if (f === 'revue') return `${p?.title || 'Revue'}${i.number ? ' n° ' + i.number : ''}${i.data?.special ? ' (hors-série)' : ''}`;
        return `${i.title || 'Sans titre'}${p ? ` (${p.title}${i.number ? (f === 'doc' ? ', ép. ' : ', n° ') + i.number : ''})` : i.number ? ` (${f === 'doc' ? 'ép. ' : 'tome '}${i.number})` : ''}`; };

    ext.lists.periodicals = async token => {
        try { D = await api('periodicals'); } catch (error) { if (token === S().workspaceToken) A().$('#workspace').innerHTML = `<section class="page">${A().empty(error.message)}</section>`; return; }
        if (token !== S().workspaceToken) return;
        draw();
    };
    function draw() {
        const f = prefs(), ws = A().$('#workspace'), w = W[f.fam] || W[''];
        const issues = D.issues.filter(i => keep(i, f, false)).sort(cmp(f.sort));
        const articles = D.articles.filter(a => keep(a, f, true)).sort(cmp(f.sort));
        const wanted = D.issues.filter(i => ['wanted', 'ordered'].includes(i.status) && keep({...i}, {...f, status: ''}, false)).sort(cmp(['priority', ...f.sort]));
        const conts = D.periodicals.filter(p => !f.fam || (p.family || 'revue') === f.fam);
        const labels = [...new Map([...D.periodicals, ...D.issues, ...D.articles].flatMap(r => r.labels || []).map(l => [l.id, l])).values()].sort((a, b) => a.name.localeCompare(b.name));
        const invs = [...new Map([...D.issues, ...D.articles].flatMap(r => (r.links || []).filter(l => l.type !== 'person')).map(l => l.type === 'investigation' ? [l.id, l] : [l.inv, {id: l.inv, name: l.name.split(' — ').slice(1).join(' — ') || l.name}])).values()];
        const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
        const sortSel = k => `<select data-pr-sort="${k}">${opt('', '—', f.sort[k] || '')}${Object.entries(SORTS).map(([v, [l]]) => opt(v, l, f.sort[k] || '')).join('')}</select>`;
        const views = [['issues', `${w.ic} ${w.items} (${issues.length})`], ['articles', `📄 ${w.parts} (${articles.length})`], ['periodicals', `🗂️ ${w.conts} (${conts.length})`], ['wanted', `🛒 À acheter (${wanted.length})`]];
        const fams = [['', '📚 Tout'], ['revue', '📰 Revues'], ['livre', '📖 Livres'], ['doc', '🎬 Documentaires']];
        const kinds = Object.entries(D.kinds).filter(([k]) => !f.fam || (D.family_kinds?.[f.fam] || []).includes(k));
        const total = wanted.reduce((s, i) => s + (money(i.data?.cover_price) || 0), 0);
        const newBtns = (f.fam ? [f.fam] : ['revue', 'livre', 'doc']).map((k, n) => `<button type="button" class="button ${n ? 'secondary' : ''}" data-pr-new="issue" data-fam="${k}">＋ ${W[k].item}</button>`).join('');
        ws.innerHTML = `<section class="page h-pr">
            <header class="page-header"><div><span class="eyebrow">LISTES</span><h2>📚 Revues, livres et documentaires</h2><p>Ce que tu as lu, vu, ce que tu veux acheter ; chaque article, chapitre ou moment, et qui ou quoi y est cité.</p></div>
                <div class="page-actions">${newBtns}<button type="button" class="button secondary" data-pr-new="periodical">＋ ${esc(f.fam ? W[f.fam].cont : 'Revue, collection, série')}</button><button type="button" class="button secondary" data-pr-atelier title="Mettre ce qui est affiché dans un projet de l’Atelier">📚 Vers l’Atelier</button><button type="button" class="button secondary" data-pr-csv>⬇️ CSV</button></div></header>
            <div class="h-pr-views h-pr-fams">${fams.map(([k, l]) => `<button type="button" class="${f.fam === k ? 'is-on' : ''}" data-pr-fam="${k}">${l}</button>`).join('')}</div>
            <div class="h-pr-views">${views.map(([k, l]) => `<button type="button" class="${f.view === k ? 'is-on' : ''}" data-pr-view="${k}">${esc(l)}</button>`).join('')}</div>
            <div class="h-pr-filters">
                <input type="search" data-pr-f="q" value="${esc(f.q)}" placeholder="Chercher (titre, auteur, lieu, nom cité, ce qu’on voit, notes…)">
                <select data-pr-f="periodical">${opt('', 'Toutes (revues, collections, séries)', f.periodical)}${conts.map(p => opt(p.id, p.title, f.periodical)).join('')}</select>
                <select data-pr-f="kind">${opt('', 'Toutes les sortes', f.kind)}${kinds.map(([v, l]) => opt(v, l, f.kind)).join('')}</select>
                <select data-pr-f="status">${opt('', 'Où j’en suis : tout', f.status)}${Object.entries(D.statuses).map(([v, l]) => opt(v || '__none', l, f.status)).join('')}</select>
                <select data-pr-f="label">${opt('', 'Toutes les étiquettes', f.label)}${labels.map(l => opt(l.id, l.name, f.label)).join('')}</select>
                <select data-pr-f="inv">${opt('', 'Toutes les enquêtes', f.inv)}${invs.map(l => opt(l.id, l.name, f.inv)).join('')}</select>
                <input type="search" data-pr-f="who" value="${esc(f.who)}" placeholder="Personne citée…">
                <label class="h-pr-years">Années <input type="number" data-pr-f="y0" value="${esc(f.y0)}" placeholder="de"> – <input type="number" data-pr-f="y1" value="${esc(f.y1)}" placeholder="à"></label>
                <span class="h-pr-sorts">Trier par ${sortSel(0)} puis ${sortSel(1)} puis ${sortSel(2)}</span>
                <button type="button" class="link-button" data-pr-reset>Tout effacer</button>
            </div>
            <div data-pr-body>${f.view === 'articles' ? articlesTable(articles) : f.view === 'periodicals' ? periodicalCards(conts) : f.view === 'wanted' ? `<p class="h-pr-total">${wanted.length} à acheter ou commandé${wanted.length > 1 ? 's' : ''}${total ? ` · environ <strong>${esc(euro(total))}</strong> au prix affiché` : ''}</p>${issuesTable(wanted, true)}` : issuesTable(issues)}</div>
        </section>`;
        bind(ws, {issues, articles, wanted});
    }
    function issuesTable(rows, buy = false) {
        if (!rows.length) return A().empty(D.issues.length ? 'Rien ne correspond.' : 'Commence par « ＋ Numéro », « ＋ Livre » ou « ＋ Documentaire ».');
        return `<div class="data-table-wrap"><table class="data-table h-pr-table"><thead><tr><th></th><th>Titre</th><th>Auteur, réalisation</th><th>N°, tome, épisode</th><th>Date</th><th>Où j’en suis</th>${buy ? '<th>Priorité</th><th>Prix</th><th>Où l’acheter</th>' : '<th>Contenu</th><th>Rattaché à</th><th>Étiquettes</th>'}</tr></thead><tbody>
            ${rows.map(i => { const p = pOf(i), fm = famOf(i), n = D.articles.filter(a => a.issue_id === i.id).length, sub = fm === 'revue' ? i.title : [i.data?.subtitle, p?.title].filter(Boolean).join(' · ');
                return `<tr data-pr-issue="${i.id}"><td class="h-pr-cover">${cover(i)}</td><td><strong>${W[fm].ic} ${esc(fm === 'revue' ? (p?.title || '') : i.title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}${i.data?.rating ? `<small class="h-pr-stars">${stars(i.data.rating)}</small>` : ''}${i.data?.read ? ` <small>✓ ${fm === 'doc' ? 'vu' : 'lu'}</small>` : ''}${videoOf(i) ? ' <small title="Le film est dans l’application">🎞️</small>' : ''}</td>
                <td>${esc(i.data?.creators || '')}${fm === 'doc' && i.data?.channel ? `<small>${esc(i.data.channel)}</small>` : ''}</td><td>${esc(i.number)}${i.data?.special ? ' <small>HS</small>' : ''}</td><td>${esc(i.date_text)}${i.data?.duration ? `<small>${esc(i.data.duration)}</small>` : ''}</td><td>${statusChip(i.status)}</td>
                ${buy ? `<td>${'🔥'.repeat(Number(i.data?.priority) || 0) || '—'}</td><td>${esc(i.data?.cover_price || '')}</td><td>${i.data?.buy_url ? `<a href="${esc(/^https?:\/\//i.test(i.data.buy_url) ? i.data.buy_url : '#')}" target="_blank" rel="noopener">acheter ↗</a>` : esc(p?.data?.where_buy || '')}</td>` : `<td>${n ? `${n} ${esc(W[fm].parts.toLowerCase())}` : ''}</td><td>${linkChips(i.links)}</td><td>${labelChips(i.labels)}</td>`}</tr>`; }).join('')}
        </tbody></table></div>`;
    }
    function articlesTable(rows) {
        if (!rows.length) return A().empty('Rien ne correspond. Les articles, chapitres et moments s’ajoutent dans la fiche d’un numéro, d’un livre ou d’un documentaire.');
        return `<div class="data-table-wrap"><table class="data-table h-pr-table"><thead><tr><th></th><th>Titre</th><th>Auteurs, qui parle</th><th>Dans</th><th>Date</th><th>Pages, minutage</th><th>Sorte</th><th>Rattaché à</th><th>Étiquettes</th></tr></thead><tbody>
            ${rows.map(a => { const i = issueOf(a), fm = famOf(a), th = thumbOf(a, ['']), txt = a.data?.what_seen || a.data?.summary || '';
                return `<tr data-pr-article="${a.id}"><td class="h-pr-cover">${th ? `<img src="media/${encodeURIComponent(th.thumbnail || th.filename)}" alt="" loading="lazy">` : `<span>${W[fm].ic}</span>`}</td><td><strong>${esc(a.title)}</strong>${txt ? `<small>${esc(String(txt).slice(0, 140))}${String(txt).length > 140 ? '…' : ''}</small>` : ''}${a.data?.rating ? `<small class="h-pr-stars">${stars(a.data.rating)}</small>` : ''}</td>
                <td>${esc(a.authors)}</td><td>${esc(i ? issueName(i) : '')}</td><td>${esc(i?.date_text || '')}</td><td>${fm === 'doc' && a.pages ? `⏱ ${esc(a.pages)}` : esc(a.pages)}</td><td>${esc([a.rubric, D.article_kinds[a.kind]].filter(Boolean).join(' · '))}</td><td>${linkChips(a.links)}</td><td>${labelChips(a.labels)}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    function periodicalCards(conts) {
        if (!conts.length) return A().empty('Rien ici : « ＋ Revue, collection, série ». (Un livre ou un documentaire n’a pas besoin d’être dans une collection ou une série.)');
        return `<div class="h-pr-cards">${conts.map(p => { const fm = p.family || 'revue', is = D.issues.filter(i => i.periodical_id === p.id), own = is.filter(i => ['owned', 'subscribed', 'digital'].includes(i.status)).length, want = is.filter(i => ['wanted', 'ordered'].includes(i.status)).length, last = [...is].sort(cmp(['date_desc']))[0];
            return `<article class="h-pr-card" data-pr-periodical="${p.id}"><header><strong>${W[fm].ic} ${esc(p.title)}</strong><small>${esc(D.kinds[p.kind] || '')}${p.publisher ? ' · ' + esc(p.publisher) : ''}</small></header>
                <p>${is.length} ${esc(W[fm].items.toLowerCase())} · ${own} à moi · ${want} à acheter${p.data?.subscribed ? ` · 📬 abonné${p.data.subscription_end ? ' jusqu’au ' + esc(p.data.subscription_end) : ''}` : ''}</p>
                ${last ? `<small class="muted">Dernier : ${esc(issueName(last))} ${esc(last.date_text || '')}</small>` : ''}${labelChips(p.labels)}
                <div class="page-actions compact"><button type="button" class="button small secondary" data-pr-only="${p.id}">Voir tout</button><button type="button" class="button small secondary" data-pr-addissue="${p.id}">＋ ${esc(W[fm].item)}</button></div></article>`; }).join('')}</div>`;
    }
    function bind(ws, rows) {
        const save = patch => { lsSet(PREFS, {...prefs(), ...patch}); draw(); };
        ws.querySelectorAll('[data-pr-fam]').forEach(b => b.addEventListener('click', () => save({fam: b.dataset.prFam, periodical: '', kind: ''})));
        ws.querySelectorAll('[data-pr-view]').forEach(b => b.addEventListener('click', () => save({view: b.dataset.prView})));
        let t = 0;
        ws.querySelectorAll('[data-pr-f]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { clearTimeout(t); t = setTimeout(() => { const pos = el.selectionStart; save({[el.dataset.prF]: el.value}); const again = A().$(`[data-pr-f="${el.dataset.prF}"]`); if (again && el.tagName !== 'SELECT') { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} } }, el.tagName === 'SELECT' ? 0 : 300); }));
        ws.querySelectorAll('[data-pr-sort]').forEach(el => el.addEventListener('change', () => { const s = [...prefs().sort]; s[Number(el.dataset.prSort)] = el.value; save({sort: s.filter((v, k) => v || k < 3)}); }));
        ws.querySelector('[data-pr-reset]').addEventListener('click', () => save({q: '', periodical: '', kind: '', status: '', label: '', who: '', inv: '', y0: '', y1: ''}));
        ws.querySelectorAll('[data-pr-new]').forEach(b => b.addEventListener('click', () => b.dataset.prNew === 'periodical' ? periodicalDialog(null, prefs().fam || 'revue') : issueDialog(null, Number(prefs().periodical) || 0, b.dataset.fam)));
        ws.querySelectorAll('[data-pr-only]').forEach(b => b.addEventListener('click', () => save({view: 'issues', periodical: b.dataset.prOnly})));
        ws.querySelectorAll('[data-pr-addissue]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); issueDialog(null, Number(b.dataset.prAddissue)); }));
        ws.querySelector('.h-pr').addEventListener('click', e => { // sur la page (redessinée à chaque fois), pas sur #workspace qui reste
            const per = e.target.closest('[data-pr-person]'); if (per) { e.stopPropagation(); S().currentPersonId = Number(per.dataset.prPerson); A().setModule('personnes'); return; }
            const inv = e.target.closest('[data-pr-inv]'); if (inv) { e.stopPropagation(); openInvestigation(inv.dataset.prInv); return; }
            if (e.target.closest('a,button,input,select')) return;
            const ir = e.target.closest('[data-pr-issue]'); if (ir) return issueDialog(D.issues.find(i => i.id === Number(ir.dataset.prIssue)));
            const ar = e.target.closest('[data-pr-article]'); if (ar) { const a = D.articles.find(x => x.id === Number(ar.dataset.prArticle)); return articleDialog(a, issueOf(a)); }
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
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        let head, body;
        if (view === 'articles') { head = ['Famille', 'Titre', 'Auteurs, qui parle', 'Dans', 'N°', 'Date', 'Pages, minutage', 'Rubrique', 'Sorte', 'Ce qu’on voit', 'Résumé', 'Ce qui est dit, citation', 'Lieux', 'Période', 'Noms cités', 'Rattaché à', 'Étiquettes'];
            body = rows.articles.map(a => { const i = issueOf(a); return [D.families?.[famOf(a)], a.title, a.authors, i ? issueName(i) : '', i?.number, i?.date_text, a.pages, a.rubric, D.article_kinds[a.kind], a.data?.what_seen, a.data?.summary, a.data?.transcript || a.data?.quote, a.data?.places, a.data?.period, a.data?.surnames, (a.links || []).map(l => l.name).join(', '), (a.labels || []).map(l => l.name).join(', ')]; }); }
        else { const list = view === 'wanted' ? rows.wanted : rows.issues; head = ['Famille', 'Revue, collection, série', 'Titre', 'Auteur, réalisation', 'Éditeur, chaîne', 'N°', 'Hors-série', 'Date', 'Durée', 'ISBN', 'Où j’en suis', 'Priorité', 'Prix', 'Prix payé', 'Rangé où', 'Contenu', 'Rattaché à', 'Étiquettes', 'Notes'];
            body = list.map(i => [D.families?.[famOf(i)], pOf(i)?.title, i.title, i.data?.creators, i.data?.publisher || i.data?.channel, i.number, i.data?.special ? 'oui' : '', i.date_text, i.data?.duration, i.data?.isbn, D.statuses[i.status || ''], i.data?.priority, i.data?.cover_price, i.data?.price_paid, i.data?.storage, partsOf(i).map(a => (famOf(i) === 'doc' && a.pages ? a.pages + ' ' : '') + a.title).join(' | '), (i.links || []).map(l => l.name).join(', '), (i.labels || []).map(l => l.name).join(', '), i.data?.notes]); }
        const text = '﻿' + [head, ...body].map(r => r.map(q).join(';')).join('\r\n');
        if (ext.downloadText) ext.downloadText(`bibliotheque-${view}.csv`, text, 'text/csv;charset=utf-8'); else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv'})); a.download = `bibliotheque-${view}.csv`; a.click(); }
    }

    /* ─── Personnes, enquêtes et parties d'enquête rattachées (plusieurs) ─── */
    const lchip = l => `<span class="h-pr-lchip" data-type="${l.type}" data-id="${l.id}">${LINK_IC[l.type] || '🔗'} ${esc(l.name)} <button type="button" data-pr-unlink aria-label="Retirer">×</button></span>`;
    function linksField(links = []) {
        return `<div class="h-pr-links" data-pr-links><span class="section-label">Rattaché à</span><span class="h-pr-linkchips">${links.map(lchip).join('')}</span>
            <span class="h-pr-addlink"><input type="search" data-pr-lq placeholder="Ajouter une personne, une enquête, une partie d’enquête…" autocomplete="off"><span class="h-pr-lsugg" hidden></span></span></div>`;
    }
    let invCache = null;
    function bindLinks(root) {
        const box = root.querySelector('[data-pr-links]'); if (!box) return;
        const input = box.querySelector('[data-pr-lq]'), sugg = box.querySelector('.h-pr-lsugg'); let t = 0;
        box.addEventListener('click', e => {
            if (e.target.closest('[data-pr-unlink]')) { e.target.closest('.h-pr-lchip').remove(); return; }
            const s = e.target.closest('[data-add-type]'); if (!s) return;
            if (!box.querySelector(`.h-pr-lchip[data-type="${s.dataset.addType}"][data-id="${s.dataset.addId}"]`)) box.querySelector('.h-pr-linkchips').insertAdjacentHTML('beforeend', lchip({type: s.dataset.addType, id: s.dataset.addId, name: s.dataset.addName}));
            input.value = ''; sugg.hidden = true; input.focus();
        });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sugg.querySelector('[data-add-type]')?.click(); } });
        input.addEventListener('input', () => { clearTimeout(t); const q = input.value.trim(); if (q.length < 2) { sugg.hidden = true; return; } t = setTimeout(async () => {
            let people = [], invs = [], parts = [];
            await Promise.all([
                api('search', {type: 'persons', q, limit: 8}).then(r => { people = r.data || []; }).catch(() => {}),
                (invCache ? Promise.resolve() : api('investigations', {status: 'all'}).then(r => { invCache = r.investigations || []; })).then(() => { invs = invCache.filter(i => String(i.title || '').toLowerCase().includes(q.toLowerCase())).slice(0, 6); }).catch(() => {}),
                api('periodical_link_search', {q}).then(r => { parts = r.items || []; }).catch(() => {}),
            ]);
            const b = (type, id, name) => `<button type="button" data-add-type="${type}" data-add-id="${id}" data-add-name="${esc(name)}">${LINK_IC[type]} ${esc(name)}</button>`;
            sugg.innerHTML = [...people.map(p => b('person', p.id, A().personName(p))), ...invs.map(i => b('investigation', i.id, i.title)), ...parts.map(x => b('investigation_item', x.id, x.name))].join('') || '<small class="muted">Rien trouvé.</small>';
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
        const d = p?.data || {}, fam = p?.family || fam0, w = W[fam];
        const kinds = Object.entries(D.kinds).filter(([k]) => (D.family_kinds?.[fam] || Object.keys(D.kinds)).includes(k));
        ext.openDialog({eyebrow: w.cont.toUpperCase(), title: p ? p.title : `Nouvelle ${fam === 'revue' ? 'revue' : fam === 'livre' ? 'collection ou série' : 'série ou émission'}`, wide: true, labels: ['periodical_periodical', p?.labels || []],
            body: `<div class="form-grid">${field('family', 'Famille', fam, {type: 'select', list: Object.entries(D.families || {revue: 'Revues'})})}${field('kind', 'Sorte', p?.kind || kinds[0]?.[0], {type: 'select', list: kinds})}
                ${field('title', 'Nom', p?.title || '', {span: true, ph: fam === 'revue' ? 'Revue française de généalogie, bulletin du cercle…' : fam === 'livre' ? 'Que sais-je ?, Les Rougon-Macquart…' : 'Secrets d’histoire, Apocalypse, Retour aux sources…'})}
                ${field('publisher', fam === 'doc' ? 'Chaîne, producteur' : 'Éditeur', p?.publisher || '')}${field('website', 'Site internet', d.website, {ph: 'https://'})}
                ${fam === 'revue' ? `${field('association', 'Association, cercle', d.association)}${field('issn', 'ISSN', d.issn)}${field('frequency', 'Parution', d.frequency, {ph: 'mensuelle, trimestrielle…'})}
                ${field('subscribed', '📬 Je suis abonné', d.subscribed, {type: 'check'})}${field('subscription_end', 'Abonnement jusqu’au', d.subscription_end)}${field('subscription_price', 'Prix de l’abonnement', d.subscription_price)}` : ''}
                ${field('country', 'Pays, région', d.country)}${field('language', 'Langue', d.language)}${field('start_year', 'Depuis (année)', d.start_year)}${field('end_year', 'Jusqu’à (année)', d.end_year)}
                ${field('where_buy', 'Où l’acheter, le voir', d.where_buy, {ph: 'kiosque, librairie, replay…'})}${field('contact', 'Contact', d.contact)}${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>`,
            onSubmit: async form => { const v = A().formObject(form); await post('save_periodical', {id: p?.id || 0, family: v.family, title: v.title, kind: v.kind, publisher: v.publisher, data: dataOf(form, ['association', 'issn', 'frequency', 'website', 'country', 'language', 'start_year', 'end_year', 'subscribed', 'subscription_end', 'subscription_price', 'where_buy', 'contact', 'notes']), label_ids: readLabels(form)}); toast('Enregistré.'); await reload(); },
            onDelete: p ? async () => { if (!confirm(`Supprimer « ${p.title} » et tout ce qu’il contient ? (les images restent dans les Médias)`)) return false; await post('delete_periodical_item', {what: 'periodical', id: p.id}); await reload(); } : null});
    }

    /* ─── Un numéro, un livre, un documentaire (et son contenu) ─── */
    function issueDialog(i, periodicalId = 0, fam0 = '') {
        const per0 = D.periodicals.find(p => p.id === Number(periodicalId));
        const fam = i ? famOf(i) : (per0?.family || fam0 || prefs().fam || 'revue'), w = W[fam];
        const conts = D.periodicals.filter(p => (p.family || 'revue') === fam);
        if (fam === 'revue' && !conts.length) { toast('Ajoute d’abord une revue.'); return periodicalDialog(null, 'revue'); }
        const d = i?.data || {}, arts = i ? partsOf(i) : [], vid = i && fam === 'doc' ? videoOf(i) : null;
        const pid = i?.periodical_id ?? (per0 && (per0.family || 'revue') === fam ? per0.id : (fam === 'revue' ? conts[0].id : 0));
        const contSel = field('periodical_id', fam === 'revue' ? 'Revue' : w.cont + ' (facultatif)', pid, {type: 'select', list: [...(fam === 'revue' ? [] : [[0, '— aucune —']]), ...conts.map(p => [p.id, p.title])]});
        const buy = `${field('status', 'Où j’en suis', i?.status || '', {type: 'select', list: Object.entries(D.statuses)})}${field('priority', 'Envie de l’acheter', d.priority, {type: 'select', list: [['', '—'], ['1', '🔥 un peu'], ['2', '🔥🔥 beaucoup'], ['3', '🔥🔥🔥 indispensable']]})}
            ${field('cover_price', fam === 'doc' ? 'Prix (DVD, location…)' : 'Prix', d.cover_price, {ph: '6,90 €'})}${field('price_paid', 'Prix payé', d.price_paid)}${field('bought_date', 'Acheté le', d.bought_date)}${field('bought_where', 'Acheté où', d.bought_where)}
            ${field('buy_url', 'Où le trouver (lien)', d.buy_url, {ph: 'https://'})}${fam === 'doc' ? '' : field('digital_url', 'Version numérique (lien)', d.digital_url, {ph: 'https://'})}${field('storage', 'Rangé où', d.storage, {ph: fam === 'doc' ? 'DVD de l’étagère, disque dur, dossier…' : 'bibliothèque du bureau, boîte 3…'})}${field('condition', 'État', d.condition)}`;
        const fields = fam === 'revue' ? `${contSel}${field('number', 'Numéro', i?.number || '', {ph: '254'})}${field('date_text', 'Date', i?.date_text || '', {ph: 'mars 2024, été 1998, 12/03/1925…'})}${field('special', 'Hors-série / numéro spécial', d.special, {type: 'check'})}
                ${field('title', 'Thème, titre de couverture', i?.title || '', {span: true})}${buy}${field('pages_count', 'Nombre de pages', d.pages_count)}${field('rating', 'Ma note', d.rating, {type: 'select', list: RATING})}${field('read', 'Lu', d.read, {type: 'check'})}
                ${field('summary', 'Sommaire (texte libre)', d.summary, {type: 'textarea', span: true, rows: 4})}`
            : fam === 'livre' ? `${field('title', 'Titre', i?.title || '', {span: true})}${field('subtitle', 'Sous-titre', d.subtitle, {span: true})}${field('creators', 'Auteurs', d.creators, {ph: 'Prénom Nom, Prénom Nom'})}${field('publisher', 'Éditeur', d.publisher)}
                ${field('place', 'Lieu d’édition', d.place)}${field('date_text', 'Année, date', i?.date_text || '', {ph: '1987'})}${field('edition', 'Édition', d.edition, {ph: '2e édition, poche…'})}${field('isbn', 'ISBN', d.isbn)}
                ${contSel}${field('number', 'N° dans la collection, tome', i?.number || '')}${field('pages_count', 'Nombre de pages', d.pages_count)}${field('language', 'Langue', d.language)}${buy}
                ${field('rating', 'Ma note', d.rating, {type: 'select', list: RATING})}${field('read', 'Lu', d.read, {type: 'check'})}${field('summary', 'Résumé, table des matières', d.summary, {type: 'textarea', span: true, rows: 4})}`
            : `${field('title', 'Titre', i?.title || '', {span: true})}${field('creators', 'Réalisation', d.creators)}${field('channel', 'Chaîne, diffuseur, plateforme', d.channel)}${field('publisher', 'Production', d.publisher)}
                ${field('date_text', 'Diffusé, sorti le', i?.date_text || '')}${field('duration', 'Durée', d.duration, {ph: '1 h 32'})}${contSel}${field('number', 'Épisode, saison', i?.number || '', {ph: 'S2 E4'})}${field('language', 'Langue', d.language)}
                ${field('video_url', 'Où le voir (lien : replay, YouTube, INA…)', d.video_url, {span: true, ph: 'https://'})}${buy}${field('rating', 'Ma note', d.rating, {type: 'select', list: RATING})}${field('read', 'Vu', d.read, {type: 'check'})}
                ${field('summary', 'Résumé', d.summary, {type: 'textarea', span: true, rows: 4})}`;
        const roles = fam === 'doc' ? [['cover', '🖼️ Affiche, vignette', 'image/*'], ['video', '🎞️ Le film lui-même (fichier vidéo, si tu l’as)', 'video/*'], ['', '📸 Captures d’écran, documents', 'image/*,application/pdf']]
            : [['cover', '🖼️ Couverture', 'image/*'], ['', fam === 'livre' ? '📸 Pages photographiées, captures, PDF' : '📸 Captures d’écran, pages, PDF', 'image/*,application/pdf']];
        const partLine = (a, k) => { const th = fam === 'doc' ? thumbOf(a, ['']) : null, sec = tcSec(a.pages);
            return `<li data-art="${a.id}">${th ? `<img class="h-pr-mthumb" src="media/${encodeURIComponent(th.thumbnail || th.filename)}" alt="">` : ''}${fam === 'doc' && a.pages ? `<button type="button" class="h-pr-tc" data-seek="${sec ?? ''}" title="${vid ? 'Aller à ce moment' : d.video_url ? 'Ouvrir la vidéo à ce moment' : ''}">⏱ ${esc(a.pages)}</button> ` : ''}<button type="button" class="link-button" data-art-edit>${esc(a.title)}</button> <small>${esc([a.authors, fam !== 'doc' && a.pages && 'p. ' + a.pages, D.article_kinds[a.kind]].filter(Boolean).join(' · '))}</small>
                ${fam === 'doc' ? '' : `<span><button type="button" class="icon-button" data-art-move="-1" ${k ? '' : 'disabled'} title="Monter">↑</button><button type="button" class="icon-button" data-art-move="1" ${k < arts.length - 1 ? '' : 'disabled'} title="Descendre">↓</button></span>`}</li>`; };
        const player = fam !== 'doc' || !i ? '' : vid ? `<div class="h-pr-player"><video controls preload="metadata" src="media/${encodeURIComponent(vid.filename)}" data-pr-video></video>
                <div class="h-pr-playbar"><b data-pr-now>0:00</b><button type="button" class="button small" data-pr-grab>📸 Capturer cette image</button><button type="button" class="button small secondary" data-pr-mark>📌 Noter ce moment</button><small class="muted">La capture s’ouvre dans un nouveau moment, à annoter.</small></div></div>`
            : `<p class="muted h-pr-hint">🎞️ Pour regarder le film ici et capturer ses images d’un clic, ajoute le fichier vidéo plus bas. Sinon : regarde-le ${d.video_url ? `<a href="${esc(urlAt(d.video_url, null))}" target="_blank" rel="noopener">en ligne ↗</a>` : 'où tu veux'}, fais une capture d’écran (⌘⇧4 sur Mac, Win+Maj+S sur PC), puis « ＋ Moment » et colle-la (⌘V / Ctrl+V).</p>`;
        ext.openDialog({eyebrow: w.item.toUpperCase(), title: i ? issueName(i) : `Nouveau${fam === 'revue' ? ' numéro' : fam === 'livre' ? ' livre' : ' documentaire'}`, wide: true, labels: ['periodical_issue', i?.labels || []],
            body: `<div class="form-grid">${fields}${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>
                ${linksField(i?.links || [])}
                ${ext.mediaEditorHtml ? ext.mediaEditorHtml('periodical_issue', i?.id || 0, i?.media || [], roles) : ''}
                <section class="h-pr-arts"><h3>${fam === 'doc' ? '🎬' : '📄'} ${esc(w.parts)}${arts.length ? ` (${arts.length})` : ''}</h3>${player}
                    ${i ? `${arts.length ? `<ol class="${fam === 'doc' ? 'is-moments' : ''}">${arts.map(partLine).join('')}</ol>` : `<p class="muted">${esc(w.none)}</p>`}<div class="page-actions compact"><button type="button" class="button small" data-art-add>＋ ${esc(w.part)}</button><button type="button" class="button small secondary" data-to-atelier>📚 Vers l’Atelier</button></div>` : `<p class="muted">Enregistre d’abord, puis ajoute ${fam === 'doc' ? 'ses moments' : fam === 'livre' ? 'ses chapitres et passages' : 'ses articles'}.</p>`}</section>`,
            onOpen: dl => {
                bindLinks(dl);
                const video = dl.querySelector('[data-pr-video]');
                if (video) {
                    const now = dl.querySelector('[data-pr-now]');
                    video.addEventListener('timeupdate', () => { now.textContent = fmtTc(video.currentTime); });
                    dl.querySelector('[data-pr-grab]').addEventListener('click', async () => {
                        try { const at = video.currentTime; video.pause(); const file = await grabFrame(video, at); articleDialog(null, i, {pages: fmtTc(at), file}); } catch (err) { toast(err.message, 'error'); }
                    });
                    dl.querySelector('[data-pr-mark]').addEventListener('click', () => { video.pause(); articleDialog(null, i, {pages: fmtTc(video.currentTime)}); });
                }
                dl.querySelectorAll('[data-seek]').forEach(b => b.addEventListener('click', () => { const s = Number(b.dataset.seek); if (b.dataset.seek === '') return;
                    if (video) { video.currentTime = s; video.play().catch(() => {}); video.scrollIntoView({block: 'nearest', behavior: 'smooth'}); } else if (d.video_url) window.open(urlAt(d.video_url, s), '_blank', 'noopener'); }));
                dl.querySelector('[data-art-add]')?.addEventListener('click', () => articleDialog(null, i, video ? {pages: video.currentTime ? fmtTc(video.currentTime) : ''} : {}));
                dl.querySelector('[data-to-atelier]')?.addEventListener('click', () => atelierDialog([{type: 'issue', id: i.id}], true));
                dl.querySelectorAll('[data-art-edit]').forEach(b => b.addEventListener('click', () => articleDialog(D.articles.find(a => a.id === Number(b.closest('[data-art]').dataset.art)), i)));
                dl.querySelectorAll('[data-art-move]').forEach(b => b.addEventListener('click', async () => { const ids = arts.map(a => a.id), k = ids.indexOf(Number(b.closest('[data-art]').dataset.art)), j = k + Number(b.dataset.artMove); [ids[k], ids[j]] = [ids[j], ids[k]]; await post('reorder_periodical_articles', {issue_id: i.id, ids}); await reload(); dl.close(); issueDialog(D.issues.find(x => x.id === i.id)); }));
            },
            onSubmit: async form => {
                const v = A().formObject(form);
                const r = await post('save_periodical_issue', {id: i?.id || 0, family: fam, periodical_id: v.periodical_id || 0, number: v.number || '', title: v.title || '', date_text: v.date_text || '', status: v.status,
                    data: dataOf(form, ['creators', 'subtitle', 'publisher', 'place', 'edition', 'isbn', 'channel', 'duration', 'language', 'video_url', 'special', 'priority', 'cover_price', 'price_paid', 'bought_date', 'bought_where', 'buy_url', 'digital_url', 'storage', 'condition', 'pages_count', 'rating', 'read', 'summary', 'notes']),
                    ...readLinks(form), label_ids: readLabels(form)});
                const id = Number((r.result || r).id);
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'periodical_issue', id);
                toast('Enregistré.'); await reload();
                const hadVideo = !!vid, nowVideo = fam === 'doc' && [...form.querySelectorAll('[data-h-upload-role="video"]')].some(x => x.files?.length);
                if (!i || (nowVideo && !hadVideo)) setTimeout(() => issueDialog(D.issues.find(x => x.id === id)), 50); // on reste dessus pour ajouter le contenu, ou regarder le film
            },
            onDelete: i ? async () => { if (!confirm(`Supprimer ${issueName(i)} et tout son contenu ? (les images restent dans les Médias)`)) return false; await post('delete_periodical_item', {what: 'issue', id: i.id}); await reload(); } : null});
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
        const url = URL.createObjectURL(file);
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
        const changed = () => { paint(); if (!shapes.length) return onChange(file); cv.toBlob(b => onChange(new File([b], file.name.replace(/\.\w+$/, '') + '-annotee.jpg', {type: 'image/jpeg'})), 'image/jpeg', 0.92); };
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
        const d = a?.data || {}, fam = famOf(issue), w = W[fam];
        const kinds = Object.entries(D.article_kinds).filter(([k]) => (D.family_article_kinds?.[fam] || Object.keys(D.article_kinds)).includes(k));
        const fields = fam === 'doc'
            ? `${field('pages', 'Moment (minutage)', a?.pages || preset.pages || '', {ph: '52:34 ou 1:02:10 – 1:03:00'})}${field('kind', 'Sorte', a?.kind || 'moment', {type: 'select', list: kinds})}
               ${field('title', 'En quelques mots', a?.title || '', {span: true, ph: 'La maison de l’arrière-grand-père, l’acte de mariage montré…'})}${field('authors', 'Qui parle, qui on voit', a?.authors || '')}${field('places', 'Lieux', d.places)}
               ${field('what_seen', 'Ce qu’on voit, ce qu’on apprend', d.what_seen, {type: 'textarea', span: true, rows: 3})}${field('transcript', 'Ce qui est dit (mot à mot)', d.transcript, {type: 'textarea', span: true, rows: 2})}
               ${field('period', 'Période', d.period)}${field('surnames', 'Noms cités', d.surnames)}${field('sources', 'Documents montrés, sources', d.sources, {type: 'textarea', span: true, rows: 2})}${field('keywords', 'Mots-clés', d.keywords, {span: true})}
               ${field('rating', 'Importance', d.rating, {type: 'select', list: RATING})}`
            : `${field('title', fam === 'livre' ? 'Titre du chapitre, du passage' : 'Titre', a?.title || '', {span: true})}${field('authors', fam === 'livre' ? 'Auteur (si différent du livre)' : 'Auteurs', a?.authors || '')}${field('pages', 'Pages', a?.pages || '', {ph: '12-15'})}
               ${fam === 'revue' ? field('rubric', 'Rubrique', a?.rubric || '', {ph: 'Dossier, Histoire locale, Entraide…'}) : ''}${field('kind', 'Sorte', a?.kind || kinds[0]?.[0], {type: 'select', list: kinds})}
               ${field('summary', 'Résumé', d.summary, {type: 'textarea', span: true, rows: 4})}${field('quote', 'Passage à retenir (citation)', d.quote, {type: 'textarea', span: true, rows: 2})}
               ${field('keywords', 'Mots-clés', d.keywords, {span: true, ph: 'meunier, émigration, registres protestants…'})}${field('places', 'Lieux', d.places)}${field('period', 'Période', d.period, {ph: '1750-1820'})}
               ${field('surnames', 'Noms de famille cités', d.surnames, {span: true})}${field('sources', 'Sources citées', d.sources, {type: 'textarea', span: true, rows: 2})}
               ${field('url', 'Lien (version en ligne)', d.url, {ph: 'https://'})}${field('rating', 'Ma note', d.rating, {type: 'select', list: RATING})}${field('read', 'Lu', d.read, {type: 'check'})}`;
        const sec = tcSec(a?.pages || preset.pages), vurl = fam === 'doc' && sec !== null ? urlAt(issue.data?.video_url, sec) : '';
        ext.openDialog({eyebrow: `${w.part.toUpperCase()} · ${issueName(issue)}`, title: a ? a.title : `Nouveau${fam === 'doc' ? ' moment' : fam === 'livre' ? ' chapitre ou passage' : ' article'}`, wide: true, labels: ['periodical_article', a?.labels || []],
            body: `<div class="form-grid">${fields}${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>
                ${vurl ? `<p><a href="${esc(vurl)}" target="_blank" rel="noopener">▶ Revoir ce moment en ligne ↗</a></p>` : ''}
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
                const id = Number((r.result || r).id), cap = form.closest('dialog')._pendingCapture?.();
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'periodical_article', id);
                if (cap && ext.uploadFiles) await ext.uploadFiles('periodical_article', id, [cap], '');
                toast('Enregistré.'); await reload();
                const open = [...document.querySelectorAll('dialog[open] .h-pr-arts')].pop(); if (open) { open.closest('dialog').close(); setTimeout(() => issueDialog(D.issues.find(x => x.id === issue.id)), 50); }
            },
            onDelete: a ? async () => { if (!confirm(`Supprimer « ${a.title} » ?`)) return false; await post('delete_periodical_item', {what: 'article', id: a.id}); await reload(); } : null});
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
                toast(`${(r.result || r).created} élément(s) ajouté(s) au projet de l’Atelier.`);
            }});
    }
    /** Depuis l'Atelier : « + Ajouter ▾ → 📚 Revues, livres, documentaires… » */
    ext.pickLibraryForAtelier = async (projectId, folderId, done) => {
        try { D = await api('periodicals'); } catch (e) { return toast(e.message, 'error'); }
        if (!D.issues.length) return toast('Rien encore dans Listes → Revues, livres et documentaires.');
        const rows = [...D.issues.map(i => ({key: 'issue:' + i.id, fam: famOf(i), label: issueName(i), sub: [i.data?.creators, i.date_text].filter(Boolean).join(' · ')})),
            ...D.articles.map(a => { const i = issueOf(a); return {key: 'article:' + a.id, fam: famOf(a), label: (famOf(a) === 'doc' && a.pages ? `⏱ ${a.pages} — ` : '') + a.title, sub: `dans ${i ? issueName(i) : '?'}${a.authors ? ' · ' + a.authors : ''}`, child: true}; })];
        ext.openDialog({eyebrow: 'ATELIER', title: '📚 Ajouter des revues, livres, documentaires', wide: true, submitLabel: 'Ajouter au projet',
            body: `<div class="h-pr-pickbar"><input type="search" data-pk-q placeholder="Chercher…"><select data-pk-fam><option value="">Tout</option><option value="revue">📰 Revues</option><option value="livre">📖 Livres</option><option value="doc">🎬 Documentaires</option></select><button type="button" class="link-button" data-pk-all>tout cocher (affichés)</button></div>
                <div class="h-pr-pick">${rows.map(r => `<label class="checkbox-line ${r.child ? 'is-child' : ''}" data-fam="${r.fam}"><input type="checkbox" value="${r.key}"> ${W[r.fam].ic} <span><b>${esc(r.label)}</b> <small class="muted">${esc(r.sub)}</small></span></label>`).join('')}</div>`,
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
                toast(`${(r.result || r).created} élément(s) ajouté(s).`); done?.();
            }});
    };
    ext.openPeriodicalIssue = id => api('periodicals').then(r => { D = r; issueDialog(D.issues.find(i => i.id === Number(id))); });
    ext.periodicalsInternals = {tcSec, fmtTc, urlAt};
})();
