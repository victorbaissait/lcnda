/**
 * 📰 Revues et magazines (Listes ; serveur : lib/periodicals.php).
 * Une revue → ses numéros → leurs articles. Vues : Numéros, Articles, Revues, 🛒 À acheter. Filtres (texte, revue,
 * sorte de revue, où on en est, étiquette, personne, enquête, années) et tri sur trois critères à la suite.
 * Chaque numéro et chaque article : couverture, captures d'écran, personnes, enquêtes, étiquettes, et un maximum d'infos.
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
    const yearOf = r => Number(String(r.sort_date || '').slice(0, 4)) || null;
    const stars = n => Number(n) ? '★'.repeat(Number(n)) + '☆'.repeat(5 - Number(n)) : '';
    let D = null; // tout ce que le serveur a renvoyé

    /* ─── Tri sur plusieurs critères ─── */
    const SORTS = {
        periodical: ['Revue', r => (pOf(r)?.title || '').toLowerCase()],
        kind: ['Sorte de revue', r => D.kinds[pOf(r)?.kind] || ''],
        date: ['Date', r => r.sort_date || '0000'],
        date_desc: ['Date (récent d’abord)', r => r.sort_date || '0000', true],
        number: ['Numéro', r => { const n = parseFloat(String(r.number || '').replace(',', '.')); return Number.isFinite(n) ? n : 1e9; }],
        status: ['Où j’en suis', r => Object.keys(D.statuses).indexOf(r.status || '')],
        priority: ['Priorité d’achat', r => -(Number(r.data?.priority) || 0)],
        price: ['Prix', r => money(r.data?.price_paid ?? r.data?.cover_price) ?? 1e9],
        rating: ['Note', r => -(Number(r.data?.rating) || 0)],
        title: ['Titre / thème', r => (r.title || '').toLowerCase()],
        added: ['Ajout récent', r => r.created_at || '', true],
    };
    const pOf = r => D.periodicals.find(p => p.id === (r.periodical_id ?? issueOf(r)?.periodical_id));
    const issueOf = a => D.issues.find(i => i.id === a.issue_id);
    const cmp = keys => (a, b) => { for (const k of keys) { const s = SORTS[k]; if (!s) continue; const x = s[1](a), y = s[1](b); if (x < y) return s[2] ? 1 : -1; if (x > y) return s[2] ? -1 : 1; } return 0; };

    /* ─── Filtres ─── */
    const prefs = () => ({view: 'issues', q: '', periodical: '', kind: '', status: '', label: '', who: '', inv: '', y0: '', y1: '', sort: ['periodical', 'date', 'number'], ...ls(PREFS, {})});
    const textOfIssue = i => [i.number, i.title, i.date_text, pOf(i)?.title, ...Object.values(i.data || {}), ...(i.links || []).map(l => l.name), ...(i.labels || []).map(l => l.name),
        ...D.articles.filter(a => a.issue_id === i.id).flatMap(a => [a.title, a.authors, a.rubric, ...Object.values(a.data || {})])].join(' ').toLowerCase();
    const textOfArticle = a => [a.title, a.authors, a.pages, a.rubric, ...Object.values(a.data || {}), ...(a.links || []).map(l => l.name), ...(a.labels || []).map(l => l.name), pOf(a)?.title, issueOf(a)?.number].join(' ').toLowerCase();
    function keep(r, f, isArticle) {
        const iss = isArticle ? issueOf(r) : r, per = pOf(r);
        if (f.q && !f.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => (isArticle ? textOfArticle(r) : textOfIssue(r)).includes(w))) return false;
        if (f.periodical && String(per?.id) !== f.periodical) return false;
        if (f.kind && per?.kind !== f.kind) return false;
        if (f.status && (iss?.status || '') !== (f.status === '__none' ? '' : f.status)) return false; // « __none » : pas précisé
        const lab = [...(r.labels || []), ...(isArticle ? [] : D.articles.filter(a => a.issue_id === r.id).flatMap(a => a.labels || []))];
        if (f.label && !lab.some(l => String(l.id) === f.label)) return false;
        const links = [...(r.links || []), ...(isArticle ? [] : D.articles.filter(a => a.issue_id === r.id).flatMap(a => a.links || []))];
        if (f.who && !links.some(l => l.type === 'person' && l.name.toLowerCase().includes(f.who.toLowerCase()))) return false;
        if (f.inv && !links.some(l => l.type === 'investigation' && String(l.id) === f.inv)) return false;
        const y = yearOf(iss || {});
        if (f.y0 && (!y || y < Number(f.y0))) return false;
        if (f.y1 && (!y || y > Number(f.y1))) return false;
        return true;
    }

    /* ─── Petits morceaux d'affichage ─── */
    const chip = (t, cls = '') => `<span class="h-pr-chip ${cls}">${esc(t)}</span>`;
    const statusChip = s => chip(D.statuses[s || ''] || 'Pas précisé', STATUS_CLS[s] || '');
    const labelChips = ls0 => (ls0 || []).map(l => `<span class="label-chip" style="--label-bg:${esc(l.color || '#0066cc')};--label-fg:#fff">${esc(l.name)}</span>`).join('');
    const linkChips = ls0 => (ls0 || []).map(l => l.type === 'person' ? `<button type="button" class="link-button" data-pr-person="${l.id}">👤 ${esc(l.name)}</button>` : `<button type="button" class="link-button" data-pr-inv="${l.id}">🔎 ${esc(l.name)}</button>`).join(' ');
    const cover = i => { const m = (i.media || []).find(x => x.role === 'cover') || (i.media || []).find(x => x.media_type === 'image'); return m ? `<img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy">` : '<span>📰</span>'; };
    const issueName = i => `${pOf(i)?.title || 'Revue'}${i.number ? ' n° ' + i.number : ''}${i.data?.special ? ' (hors-série)' : ''}`;

    ext.lists.periodicals = async token => {
        try { D = await api('periodicals'); } catch (error) { if (token === S().workspaceToken) A().$('#workspace').innerHTML = `<section class="page">${A().empty(error.message)}</section>`; return; }
        if (token !== S().workspaceToken) return;
        draw();
    };
    function draw() {
        const f = prefs(), ws = A().$('#workspace');
        const issues = D.issues.filter(i => keep(i, f, false)).sort(cmp(f.sort));
        const articles = D.articles.filter(a => keep(a, f, true)).sort(cmp(f.sort));
        const wanted = D.issues.filter(i => ['wanted', 'ordered'].includes(i.status) && keep({...i}, {...f, status: ''}, false)).sort(cmp(['priority', ...f.sort]));
        const labels = [...new Map([...D.periodicals, ...D.issues, ...D.articles].flatMap(r => r.labels || []).map(l => [l.id, l])).values()].sort((a, b) => a.name.localeCompare(b.name));
        const invs = [...new Map([...D.issues, ...D.articles].flatMap(r => (r.links || []).filter(l => l.type === 'investigation')).map(l => [l.id, l])).values()];
        const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
        const sortSel = k => `<select data-pr-sort="${k}">${opt('', '—', f.sort[k] || '')}${Object.entries(SORTS).map(([v, [l]]) => opt(v, l, f.sort[k] || '')).join('')}</select>`;
        const views = [['issues', `📰 Numéros (${issues.length})`], ['articles', `📄 Articles (${articles.length})`], ['periodicals', `📚 Revues (${D.periodicals.length})`], ['wanted', `🛒 À acheter (${wanted.length})`]];
        const total = wanted.reduce((s, i) => s + (money(i.data?.cover_price) || 0), 0);
        ws.innerHTML = `<section class="page h-pr">
            <header class="page-header"><div><span class="eyebrow">LISTES</span><h2>📰 Revues et magazines</h2><p>Tes revues, leurs numéros et leurs articles : ce que tu as, ce que tu veux acheter, qui et quoi y est cité.</p></div>
                <div class="page-actions"><button type="button" class="button" data-pr-new="issue">＋ Numéro</button><button type="button" class="button secondary" data-pr-new="periodical">＋ Revue</button><button type="button" class="button secondary" data-pr-csv>⬇️ CSV</button></div></header>
            <div class="h-pr-views">${views.map(([k, l]) => `<button type="button" class="${f.view === k ? 'is-on' : ''}" data-pr-view="${k}">${l}</button>`).join('')}</div>
            <div class="h-pr-filters">
                <input type="search" data-pr-f="q" value="${esc(f.q)}" placeholder="Chercher (titre, auteur, lieu, nom cité, notes…)">
                <select data-pr-f="periodical">${opt('', 'Toutes les revues', f.periodical)}${D.periodicals.map(p => opt(p.id, p.title, f.periodical)).join('')}</select>
                <select data-pr-f="kind">${opt('', 'Toutes les sortes', f.kind)}${Object.entries(D.kinds).map(([v, l]) => opt(v, l, f.kind)).join('')}</select>
                <select data-pr-f="status">${opt('', 'Où j’en suis : tout', f.status)}${Object.entries(D.statuses).map(([v, l]) => opt(v || '__none', l, f.status)).join('')}</select>
                <select data-pr-f="label">${opt('', 'Toutes les étiquettes', f.label)}${labels.map(l => opt(l.id, l.name, f.label)).join('')}</select>
                <select data-pr-f="inv">${opt('', 'Toutes les enquêtes', f.inv)}${invs.map(l => opt(l.id, l.name, f.inv)).join('')}</select>
                <input type="search" data-pr-f="who" value="${esc(f.who)}" placeholder="Personne citée…">
                <label class="h-pr-years">Années <input type="number" data-pr-f="y0" value="${esc(f.y0)}" placeholder="de"> – <input type="number" data-pr-f="y1" value="${esc(f.y1)}" placeholder="à"></label>
                <span class="h-pr-sorts">Trier par ${sortSel(0)} puis ${sortSel(1)} puis ${sortSel(2)}</span>
                <button type="button" class="link-button" data-pr-reset>Tout effacer</button>
            </div>
            <div data-pr-body>${f.view === 'articles' ? articlesTable(articles) : f.view === 'periodicals' ? periodicalCards() : f.view === 'wanted' ? `<p class="h-pr-total">${wanted.length} numéro${wanted.length > 1 ? 's' : ''} à acheter ou commandé${wanted.length > 1 ? 's' : ''}${total ? ` · environ <strong>${esc(euro(total))}</strong> au prix de couverture` : ''}</p>${issuesTable(wanted, true)}` : issuesTable(issues)}</div>
        </section>`;
        bind(ws, {issues, articles, wanted});
    }
    function issuesTable(rows, buy = false) {
        if (!rows.length) return A().empty(D.periodicals.length ? 'Aucun numéro ne correspond.' : 'Commence par « ＋ Revue », puis ajoute ses numéros.');
        return `<div class="data-table-wrap"><table class="data-table h-pr-table"><thead><tr><th></th><th>Revue</th><th>N°</th><th>Date</th><th>Thème / titre</th><th>Où j’en suis</th>${buy ? '<th>Priorité</th><th>Prix</th><th>Où l’acheter</th>' : '<th>Articles</th><th>Personnes, enquêtes</th><th>Étiquettes</th>'}</tr></thead><tbody>
            ${rows.map(i => { const p = pOf(i), n = D.articles.filter(a => a.issue_id === i.id).length; return `<tr data-pr-issue="${i.id}"><td class="h-pr-cover">${cover(i)}</td><td><strong>${esc(p?.title || '')}</strong><small>${esc(D.kinds[p?.kind] || '')}</small></td><td>${esc(i.number)}${i.data?.special ? ' <small>HS</small>' : ''}</td><td>${esc(i.date_text)}</td><td>${esc(i.title)}${i.data?.rating ? `<small class="h-pr-stars">${stars(i.data.rating)}</small>` : ''}${i.data?.read ? ' <small>✓ lu</small>' : ''}</td><td>${statusChip(i.status)}</td>
                ${buy ? `<td>${'🔥'.repeat(Number(i.data?.priority) || 0) || '—'}</td><td>${esc(i.data?.cover_price || '')}</td><td>${i.data?.buy_url ? `<a href="${esc(/^https?:\/\//i.test(i.data.buy_url) ? i.data.buy_url : '#')}" target="_blank" rel="noopener">acheter ↗</a>` : esc(p?.data?.where_buy || '')}</td>` : `<td>${n || ''}</td><td>${linkChips(i.links)}</td><td>${labelChips(i.labels)}</td>`}</tr>`; }).join('')}
        </tbody></table></div>`;
    }
    function articlesTable(rows) {
        if (!rows.length) return A().empty('Aucun article ne correspond. Les articles s’ajoutent dans la fiche d’un numéro.');
        return `<div class="data-table-wrap"><table class="data-table h-pr-table"><thead><tr><th>Article</th><th>Auteurs</th><th>Revue, n°</th><th>Date</th><th>Pages</th><th>Rubrique / sorte</th><th>Personnes, enquêtes</th><th>Étiquettes</th></tr></thead><tbody>
            ${rows.map(a => { const i = issueOf(a); return `<tr data-pr-article="${a.id}"><td><strong>${esc(a.title)}</strong>${a.data?.summary ? `<small>${esc(String(a.data.summary).slice(0, 140))}${String(a.data.summary).length > 140 ? '…' : ''}</small>` : ''}${a.data?.rating ? `<small class="h-pr-stars">${stars(a.data.rating)}</small>` : ''}</td><td>${esc(a.authors)}</td><td>${esc(i ? issueName(i) : '')}</td><td>${esc(i?.date_text || '')}</td><td>${esc(a.pages)}</td><td>${esc([a.rubric, D.article_kinds[a.kind]].filter(Boolean).join(' · '))}</td><td>${linkChips(a.links)}</td><td>${labelChips(a.labels)}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    function periodicalCards() {
        if (!D.periodicals.length) return A().empty('Aucune revue : « ＋ Revue ».');
        return `<div class="h-pr-cards">${D.periodicals.map(p => { const is = D.issues.filter(i => i.periodical_id === p.id), own = is.filter(i => ['owned', 'subscribed', 'digital'].includes(i.status)).length, want = is.filter(i => ['wanted', 'ordered'].includes(i.status)).length, last = [...is].sort(cmp(['date_desc']))[0];
            return `<article class="h-pr-card" data-pr-periodical="${p.id}"><header><strong>${esc(p.title)}</strong><small>${esc(D.kinds[p.kind] || '')}${p.publisher ? ' · ' + esc(p.publisher) : ''}</small></header>
                <p>${is.length} numéro${is.length > 1 ? 's' : ''} · ${own} à moi · ${want} à acheter${p.data?.subscribed ? ` · 📬 abonné${p.data.subscription_end ? ' jusqu’au ' + esc(p.data.subscription_end) : ''}` : ''}</p>
                ${last ? `<small class="muted">Dernier : ${esc(issueName(last))} ${esc(last.date_text || '')}</small>` : ''}${labelChips(p.labels)}
                <div class="page-actions compact"><button type="button" class="button small secondary" data-pr-only="${p.id}">Ses numéros</button><button type="button" class="button small secondary" data-pr-addissue="${p.id}">＋ Numéro</button></div></article>`; }).join('')}</div>`;
    }
    function bind(ws, rows) {
        const save = patch => { lsSet(PREFS, {...prefs(), ...patch}); draw(); };
        ws.querySelectorAll('[data-pr-view]').forEach(b => b.addEventListener('click', () => save({view: b.dataset.prView})));
        let t = 0;
        ws.querySelectorAll('[data-pr-f]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { clearTimeout(t); t = setTimeout(() => { const pos = el.selectionStart; save({[el.dataset.prF]: el.value}); const again = A().$(`[data-pr-f="${el.dataset.prF}"]`); if (again && el.tagName !== 'SELECT') { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} } }, el.tagName === 'SELECT' ? 0 : 300); }));
        ws.querySelectorAll('[data-pr-sort]').forEach(el => el.addEventListener('change', () => { const s = [...prefs().sort]; s[Number(el.dataset.prSort)] = el.value; save({sort: s.filter((v, k) => v || k < 3)}); }));
        ws.querySelector('[data-pr-reset]').addEventListener('click', () => save({q: '', periodical: '', kind: '', status: '', label: '', who: '', inv: '', y0: '', y1: ''}));
        ws.querySelectorAll('[data-pr-new]').forEach(b => b.addEventListener('click', () => b.dataset.prNew === 'periodical' ? periodicalDialog(null) : issueDialog(null, Number(prefs().periodical) || D.periodicals[0]?.id)));
        ws.querySelectorAll('[data-pr-only]').forEach(b => b.addEventListener('click', () => save({view: 'issues', periodical: b.dataset.prOnly})));
        ws.querySelectorAll('[data-pr-addissue]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); issueDialog(null, Number(b.dataset.prAddissue)); }));
        ws.querySelector('.h-pr').addEventListener('click', e => { // sur la page (redessinée à chaque fois), pas sur #workspace qui reste
            const per = e.target.closest('[data-pr-person]'); if (per) { e.stopPropagation(); S().currentPersonId = Number(per.dataset.prPerson); A().setModule('personnes'); return; }
            const inv = e.target.closest('[data-pr-inv]'); if (inv) { e.stopPropagation(); S().currentInvestigationId = Number(inv.dataset.prInv); S().investigationFolderId = 0; A().setModule('enquetes'); return; }
            if (e.target.closest('a,button,input,select')) return;
            const ir = e.target.closest('[data-pr-issue]'); if (ir) return issueDialog(D.issues.find(i => i.id === Number(ir.dataset.prIssue)));
            const ar = e.target.closest('[data-pr-article]'); if (ar) { const a = D.articles.find(x => x.id === Number(ar.dataset.prArticle)); return articleDialog(a, issueOf(a)); }
            const pr = e.target.closest('[data-pr-periodical]'); if (pr) return periodicalDialog(D.periodicals.find(p => p.id === Number(pr.dataset.prPeriodical)));
        });
        ws.querySelector('[data-pr-csv]').addEventListener('click', () => csv(prefs().view, rows));
    }
    function csv(view, rows) {
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        let head, body;
        if (view === 'articles') { head = ['Article', 'Auteurs', 'Revue', 'N°', 'Date', 'Pages', 'Rubrique', 'Sorte', 'Résumé', 'Lieux', 'Période', 'Noms cités', 'Personnes, enquêtes', 'Étiquettes'];
            body = rows.articles.map(a => { const i = issueOf(a); return [a.title, a.authors, pOf(a)?.title, i?.number, i?.date_text, a.pages, a.rubric, D.article_kinds[a.kind], a.data?.summary, a.data?.places, a.data?.period, a.data?.surnames, (a.links || []).map(l => l.name).join(', '), (a.labels || []).map(l => l.name).join(', ')]; }); }
        else { const list = view === 'wanted' ? rows.wanted : rows.issues; head = ['Revue', 'N°', 'Hors-série', 'Date', 'Thème', 'Où j’en suis', 'Priorité', 'Prix', 'Prix payé', 'Rangé où', 'Articles', 'Personnes, enquêtes', 'Étiquettes', 'Notes'];
            body = list.map(i => [pOf(i)?.title, i.number, i.data?.special ? 'oui' : '', i.date_text, i.title, D.statuses[i.status || ''], i.data?.priority, i.data?.cover_price, i.data?.price_paid, i.data?.storage, D.articles.filter(a => a.issue_id === i.id).map(a => a.title).join(' | '), (i.links || []).map(l => l.name).join(', '), (i.labels || []).map(l => l.name).join(', '), i.data?.notes]); }
        const text = '﻿' + [head, ...body].map(r => r.map(q).join(';')).join('\r\n');
        if (ext.downloadText) ext.downloadText(`revues-${view}.csv`, text, 'text/csv;charset=utf-8'); else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv'})); a.download = `revues-${view}.csv`; a.click(); }
    }

    /* ─── Personnes et enquêtes rattachées (plusieurs) ─── */
    function linksField(links = []) {
        return `<div class="h-pr-links" data-pr-links><span class="section-label">Rattaché à</span><span class="h-pr-linkchips">${links.map(l => `<span class="h-pr-lchip" data-type="${l.type}" data-id="${l.id}">${l.type === 'person' ? '👤' : '🔎'} ${esc(l.name)} <button type="button" data-pr-unlink aria-label="Retirer">×</button></span>`).join('')}</span>
            <span class="h-pr-addlink"><input type="search" data-pr-lq placeholder="Ajouter une personne ou une enquête…" autocomplete="off"><span class="h-pr-lsugg" hidden></span></span></div>`;
    }
    let invCache = null;
    function bindLinks(root) {
        const box = root.querySelector('[data-pr-links]'); if (!box) return;
        const input = box.querySelector('[data-pr-lq]'), sugg = box.querySelector('.h-pr-lsugg'); let t = 0;
        box.addEventListener('click', e => {
            if (e.target.closest('[data-pr-unlink]')) { e.target.closest('.h-pr-lchip').remove(); return; }
            const s = e.target.closest('[data-add-type]'); if (!s) return;
            if (!box.querySelector(`.h-pr-lchip[data-type="${s.dataset.addType}"][data-id="${s.dataset.addId}"]`)) box.querySelector('.h-pr-linkchips').insertAdjacentHTML('beforeend', `<span class="h-pr-lchip" data-type="${s.dataset.addType}" data-id="${s.dataset.addId}">${s.dataset.addType === 'person' ? '👤' : '🔎'} ${esc(s.dataset.addName)} <button type="button" data-pr-unlink aria-label="Retirer">×</button></span>`);
            input.value = ''; sugg.hidden = true; input.focus();
        });
        input.addEventListener('input', () => { clearTimeout(t); const q = input.value.trim(); if (q.length < 2) { sugg.hidden = true; return; } t = setTimeout(async () => {
            let people = [], invs = [];
            try { people = (await api('search', {type: 'persons', q, limit: 8})).data || []; } catch (_) {}
            try { if (!invCache) invCache = (await api('investigations', {status: 'all'})).investigations || []; invs = invCache.filter(i => String(i.title || '').toLowerCase().includes(q.toLowerCase())).slice(0, 6); } catch (_) {}
            sugg.innerHTML = [...people.map(p => `<button type="button" data-add-type="person" data-add-id="${p.id}" data-add-name="${esc(A().personName(p))}">👤 ${esc(A().personName(p))}</button>`), ...invs.map(i => `<button type="button" data-add-type="investigation" data-add-id="${i.id}" data-add-name="${esc(i.title)}">🔎 ${esc(i.title)}</button>`)].join('') || '<small class="muted">Rien trouvé.</small>';
            sugg.hidden = false; }, 220); });
    }
    const readLinks = form => { const out = {persons: [], investigations: []}; form.querySelectorAll('.h-pr-lchip').forEach(c => out[c.dataset.type === 'person' ? 'persons' : 'investigations'].push(Number(c.dataset.id))); return out; };
    const readLabels = form => { const b = form.querySelector('[data-pending-labels]'); return b ? (b.dataset.ids || '').split(',').map(Number).filter(Boolean) : undefined; };
    const field = (name, label, value = '', {type = 'text', span = false, ph = '', list = null, rows = 3} = {}) => type === 'textarea'
        ? `<label class="${span ? 'span-2' : ''}">${esc(label)}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(value)}</textarea></label>`
        : type === 'select' ? `<label class="${span ? 'span-2' : ''}">${esc(label)}<select name="${name}">${list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
        : type === 'check' ? `<label class="checkbox-line ${span ? 'span-2' : ''}"><input type="checkbox" name="${name}" value="1" ${value ? 'checked' : ''}> ${esc(label)}</label>`
        : `<label class="${span ? 'span-2' : ''}">${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(ph)}"></label>`;
    const RATING = [['', '—'], ['1', '★'], ['2', '★★'], ['3', '★★★'], ['4', '★★★★'], ['5', '★★★★★']];
    const dataOf = (form, keys) => Object.fromEntries(keys.map(k => [k, form.elements[k]?.type === 'checkbox' ? (form.elements[k].checked ? '1' : '') : (form.elements[k]?.value ?? '')]));
    const reload = async () => { D = await api('periodicals'); if (S().module === 'listes' && S().listType === 'periodicals') draw(); };

    /* ─── Une revue ─── */
    function periodicalDialog(p) {
        const d = p?.data || {};
        ext.openDialog({eyebrow: 'REVUE', title: p ? p.title : 'Nouvelle revue', wide: true, labels: ['periodical_periodical', p?.labels || []],
            body: `<div class="form-grid">${field('title', 'Nom de la revue', p?.title || '', {span: true, ph: 'Revue française de généalogie, Gé-Magazine, bulletin du cercle…'})}${field('kind', 'Sorte', p?.kind || 'genealogie', {type: 'select', list: Object.entries(D.kinds)})}${field('publisher', 'Éditeur', p?.publisher || '')}
                ${field('association', 'Association, cercle', d.association)}${field('issn', 'ISSN', d.issn)}${field('frequency', 'Parution', d.frequency, {ph: 'mensuelle, trimestrielle…'})}${field('website', 'Site internet', d.website, {ph: 'https://'})}
                ${field('country', 'Pays, région', d.country)}${field('language', 'Langue', d.language)}${field('start_year', 'Depuis (année)', d.start_year)}${field('end_year', 'Jusqu’à (année, si arrêtée)', d.end_year)}
                ${field('subscribed', '📬 Je suis abonné', d.subscribed, {type: 'check'})}${field('subscription_end', 'Abonnement jusqu’au', d.subscription_end)}${field('subscription_price', 'Prix de l’abonnement', d.subscription_price)}${field('where_buy', 'Où l’acheter', d.where_buy, {ph: 'kiosque, site, boutique du cercle…'})}
                ${field('contact', 'Contact (rédaction, courriel)', d.contact, {span: true})}${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>`,
            onSubmit: async form => { const v = A().formObject(form); await post('save_periodical', {id: p?.id || 0, title: v.title, kind: v.kind, publisher: v.publisher, data: dataOf(form, ['association', 'issn', 'frequency', 'website', 'country', 'language', 'start_year', 'end_year', 'subscribed', 'subscription_end', 'subscription_price', 'where_buy', 'contact', 'notes']), label_ids: readLabels(form)}); toast('Revue enregistrée.'); await reload(); },
            onDelete: p ? async () => { if (!confirm(`Supprimer « ${p.title} », tous ses numéros et leurs articles ? (les images restent dans les Médias)`)) return false; await post('delete_periodical_item', {what: 'periodical', id: p.id}); await reload(); } : null});
    }

    /* ─── Un numéro (et ses articles) ─── */
    function issueDialog(i, periodicalId = 0) {
        if (!D.periodicals.length) { toast('Ajoute d’abord une revue.'); return periodicalDialog(null); }
        const d = i?.data || {}, arts = i ? D.articles.filter(a => a.issue_id === i.id) : [];
        ext.openDialog({eyebrow: 'NUMÉRO', title: i ? issueName(i) : 'Nouveau numéro', wide: true, labels: ['periodical_issue', i?.labels || []],
            body: `<div class="form-grid">${field('periodical_id', 'Revue', i?.periodical_id || periodicalId, {type: 'select', list: D.periodicals.map(p => [p.id, p.title])})}${field('number', 'Numéro', i?.number || '', {ph: '254'})}
                ${field('date_text', 'Date', i?.date_text || '', {ph: 'mars 2024, été 1998, 12/03/1925…'})}${field('special', 'Hors-série / numéro spécial', d.special, {type: 'check'})}
                ${field('title', 'Thème, titre de couverture', i?.title || '', {span: true})}
                ${field('status', 'Où j’en suis', i?.status || '', {type: 'select', list: Object.entries(D.statuses)})}${field('priority', 'Envie de l’acheter', d.priority, {type: 'select', list: [['', '—'], ['1', '🔥 un peu'], ['2', '🔥🔥 beaucoup'], ['3', '🔥🔥🔥 indispensable']]})}
                ${field('cover_price', 'Prix de couverture', d.cover_price, {ph: '6,90 €'})}${field('price_paid', 'Prix payé', d.price_paid)}${field('bought_date', 'Acheté le', d.bought_date)}${field('bought_where', 'Acheté où', d.bought_where)}
                ${field('buy_url', 'Où le trouver (lien)', d.buy_url, {ph: 'https://'})}${field('digital_url', 'Version numérique (lien)', d.digital_url, {ph: 'https://'})}${field('storage', 'Rangé où', d.storage, {ph: 'bibliothèque du bureau, boîte 3…'})}${field('condition', 'État', d.condition)}
                ${field('pages_count', 'Nombre de pages', d.pages_count)}${field('rating', 'Ma note', d.rating, {type: 'select', list: RATING})}${field('read', 'Lu', d.read, {type: 'check'})}
                ${field('summary', 'Sommaire (texte libre)', d.summary, {type: 'textarea', span: true, rows: 4})}${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>
                ${linksField(i?.links || [])}
                ${ext.mediaEditorHtml ? ext.mediaEditorHtml('periodical_issue', i?.id || 0, i?.media || [], [['cover', '🖼️ Couverture', 'image/*'], ['', '📸 Captures d’écran, pages, PDF', 'image/*,application/pdf']]) : ''}
                <section class="h-pr-arts"><h3>📄 Articles${arts.length ? ` (${arts.length})` : ''}</h3>${i ? `${arts.length ? `<ol>${arts.map((a, k) => `<li data-art="${a.id}"><button type="button" class="link-button" data-art-edit>${esc(a.title)}</button> <small>${esc([a.authors, a.pages && 'p. ' + a.pages, D.article_kinds[a.kind]].filter(Boolean).join(' · '))}</small><span><button type="button" class="icon-button" data-art-move="-1" ${k ? '' : 'disabled'} title="Monter">↑</button><button type="button" class="icon-button" data-art-move="1" ${k < arts.length - 1 ? '' : 'disabled'} title="Descendre">↓</button></span></li>`).join('')}</ol>` : '<p class="muted">Aucun article pour l’instant.</p>'}<button type="button" class="button small" data-art-add>＋ Article</button>` : '<p class="muted">Enregistre le numéro, puis ajoute ses articles.</p>'}</section>`,
            onOpen: dl => {
                bindLinks(dl);
                dl.querySelector('[data-art-add]')?.addEventListener('click', () => articleDialog(null, i));
                dl.querySelectorAll('[data-art-edit]').forEach(b => b.addEventListener('click', () => articleDialog(D.articles.find(a => a.id === Number(b.closest('[data-art]').dataset.art)), i)));
                dl.querySelectorAll('[data-art-move]').forEach(b => b.addEventListener('click', async () => { const ids = arts.map(a => a.id), k = ids.indexOf(Number(b.closest('[data-art]').dataset.art)), j = k + Number(b.dataset.artMove); [ids[k], ids[j]] = [ids[j], ids[k]]; await post('reorder_periodical_articles', {issue_id: i.id, ids}); await reload(); dl.close(); issueDialog(D.issues.find(x => x.id === i.id)); }));
            },
            onSubmit: async form => {
                const v = A().formObject(form);
                const r = await post('save_periodical_issue', {id: i?.id || 0, periodical_id: v.periodical_id, number: v.number, title: v.title, date_text: v.date_text, status: v.status,
                    data: dataOf(form, ['special', 'priority', 'cover_price', 'price_paid', 'bought_date', 'bought_where', 'buy_url', 'digital_url', 'storage', 'condition', 'pages_count', 'rating', 'read', 'summary', 'notes']), ...readLinks(form), label_ids: readLabels(form)});
                const id = Number((r.result || r).id);
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'periodical_issue', id);
                toast('Numéro enregistré.'); await reload();
                if (!i) setTimeout(() => issueDialog(D.issues.find(x => x.id === id)), 50); // un nouveau numéro : on reste dessus pour ajouter ses articles
            },
            onDelete: i ? async () => { if (!confirm(`Supprimer ${issueName(i)} et ses articles ? (les images restent dans les Médias)`)) return false; await post('delete_periodical_item', {what: 'issue', id: i.id}); await reload(); } : null});
    }

    /* ─── Un article ─── */
    function articleDialog(a, issue) {
        if (!issue) return toast('Numéro introuvable.', 'error');
        const d = a?.data || {};
        ext.openDialog({eyebrow: `ARTICLE · ${issueName(issue)}`, title: a ? a.title : 'Nouvel article', wide: true, labels: ['periodical_article', a?.labels || []],
            body: `<div class="form-grid">${field('title', 'Titre', a?.title || '', {span: true})}${field('authors', 'Auteurs', a?.authors || '')}${field('pages', 'Pages', a?.pages || '', {ph: '12-15'})}
                ${field('rubric', 'Rubrique', a?.rubric || '', {ph: 'Dossier, Histoire locale, Entraide…'})}${field('kind', 'Sorte', a?.kind || 'article', {type: 'select', list: Object.entries(D.article_kinds)})}
                ${field('summary', 'Résumé', d.summary, {type: 'textarea', span: true, rows: 4})}${field('quote', 'Passage à retenir (citation)', d.quote, {type: 'textarea', span: true, rows: 2})}
                ${field('keywords', 'Mots-clés', d.keywords, {span: true, ph: 'meunier, émigration, registres protestants…'})}${field('places', 'Lieux', d.places)}${field('period', 'Période', d.period, {ph: '1750-1820'})}
                ${field('surnames', 'Noms de famille cités', d.surnames, {span: true})}${field('sources', 'Sources citées', d.sources, {type: 'textarea', span: true, rows: 2})}
                ${field('url', 'Lien (version en ligne)', d.url, {ph: 'https://'})}${field('rating', 'Ma note', d.rating, {type: 'select', list: RATING})}${field('read', 'Lu', d.read, {type: 'check'})}
                ${field('notes', 'Notes', d.notes, {type: 'textarea', span: true})}</div>
                ${linksField(a?.links || [])}
                ${ext.mediaEditorHtml ? ext.mediaEditorHtml('periodical_article', a?.id || 0, a?.media || [], [['', '📸 Captures d’écran de l’article, PDF', 'image/*,application/pdf']]) : ''}`,
            onOpen: dl => bindLinks(dl),
            onSubmit: async form => {
                const v = A().formObject(form);
                const r = await post('save_periodical_article', {id: a?.id || 0, issue_id: issue.id, title: v.title, authors: v.authors, pages: v.pages, rubric: v.rubric, kind: v.kind,
                    data: dataOf(form, ['summary', 'quote', 'keywords', 'places', 'period', 'surnames', 'sources', 'url', 'rating', 'read', 'notes']), ...readLinks(form), label_ids: readLabels(form)});
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'periodical_article', Number((r.result || r).id));
                toast('Article enregistré.'); await reload();
                const open = document.querySelector('dialog[open] .h-pr-arts'); if (open) { open.closest('dialog').close(); setTimeout(() => issueDialog(D.issues.find(x => x.id === issue.id)), 50); }
            },
            onDelete: a ? async () => { if (!confirm(`Supprimer l’article « ${a.title} » ?`)) return false; await post('delete_periodical_item', {what: 'article', id: a.id}); await reload(); } : null});
    }
    ext.openPeriodicalIssue = id => api('periodicals').then(r => { D = r; issueDialog(D.issues.find(i => i.id === Number(id))); });
})();
