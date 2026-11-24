/* LCNDA — 🗂 État d'un recueil (maquette docs/design/registres-etat-fonds.html, parties 1 à 3 ; serveur : lib/recueil_etat.php).
 * Les mots de l'Atelier pour chaque page : ⚪ À faire · 🟡 En cours · 🔵 Relue · 🟢 Finie (calculés, ou choisis à la main) ;
 * la fiabilité de la lecture, déduite (✓ Sûre · 👁 À relire · ❓ Doute · ⛔ Illisible) ; une page absente a une raison et peut
 * rejoindre les Lacunes d'archives ; la numérotation (paginé, folioté, sans ordre, des archives) et les trous repérés tout seuls.
 *   ext.recueilEtat.paint(body, ctx)       → l'onglet « 🗂 État » (cases, liste, reste à faire, trous, choisir plusieurs pages)
 *   ext.recueilEtat.pageBox(el, page, ctx) → l'état sur la page ouverte
 *   ext.recueilEtat.block(type, b, ctx)    → les blocs « 🗂 État des pages » et « 📋 Reste à faire » du Résumé
 *   ext.recueilEtat.pageWord(D, p)         → « Page 3 », « Pièce 3 » (liasse)
 *   ext.recueilEtat.fields(r)              → numérotation et pages attendues (fenêtre du recueil)
 * ctx = {D(), reload(), openPage(id), post(action, body)}. Chaque changement se défait (↶ Annuler). Essai : tests/test-recueil-etat.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A()?.toast?.(m, k);
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many : one}`);
    const STATES = {todo: ['⚪', 'À faire'], doing: ['🟡', 'En cours'], checked: ['🔵', 'Relue'], done: ['🟢', 'Finie']};
    const REL = {sure: ['✓', 'Sûre', 'ok'], review: ['👁', 'À relire', 'q'], doubt: ['❓', 'Doute', 'q'], illegible: ['⛔', 'Illisible', 'red']};
    const ABSENT = [['manquante', '❔', 'Manquante', 'on ne sait pas encore'], ['perdue', '🔥', 'Perdue ou détruite', 'n’existe plus'], ['photo', '📷', 'Pas encore photographiée', 'par moi'],
        ['numerisee', '🗄', 'Pas numérisée', 'par le service d’archives'], ['en_ligne', '🌐', 'Numérisée, pas en ligne', ''], ['communicable', '🔒', 'Non communicable', 'jusqu’à une date'],
        ['restauration', '🛠', 'En restauration', 'pas consultable'], ['ailleurs', '↪', 'Ailleurs', 'dans un autre registre, un autre fonds'], ['blanche', '▫', 'Page blanche', 'pas absente : vide'], ['autre', '✎', 'Autre', '']];
    const absentOf = k => ABSENT.find(a => a[0] === k);
    const LEGI = [['', 'Pas dit'], ['bonne', 'Bonne'], ['difficile', 'Difficile'], ['partielle', 'Illisible en partie'], ['illisible', 'Illisible']];
    const NUMBERING = [['page', '📄', 'Paginé', 'p. 1, 2, 3…'], ['folio', '📖', 'Folioté', 'f° 1 r°, f° 1 v°… — conseillé pour les registres anciens'], ['liasse', '🗃', 'Sans ordre (liasse, carton)', 'des pièces, rangées par toi'], ['archives', '🔢', 'Numérotation des archives', 'pièce 1, 2… donnée par le service']];
    // une page absente → une demande dans « Suivi des registres › Demandes » (qui existe) : la sorte de demande
    const ASK = {manquante: 'other', perdue: 'other', photo: 'reading_room', numerisee: 'photograph', en_ligne: 'reading_room', restauration: 'reading_room', ailleurs: 'other', autre: 'other'};

    const isLiasse = D => ['liasse', 'archives'].includes(D?.recueil?.numbering);
    const pageWord = (D, p) => (p?.label ? p.label : isLiasse(D) ? T('Pièce {n}', {n: String(p.num)}) : T('Page {n}', {n: String(p.num)}));
    const cls = p => (p.absent === 'blanche' ? 's-blank' : p.absent === 'en_ligne' ? 's-pasligne' : p.absent ? 's-abs' : {done: 's-fin', checked: 's-relue', doing: 's-cours'}[p.state] || 's-todo');
    function tip(D, p) {
        const bits = [pageWord(D, p)];
        if (p.absent) { const a = absentOf(p.absent); bits.push(`${a[1]} ${T(a[2])}${p.absent_until ? ' ' + T('jusqu’en {y}', {y: p.absent_until}) : ''}`); if (p.absent_note) bits.push(p.absent_note); }
        else {
            bits.push(`${STATES[p.state][0]} ${T(STATES[p.state][1])}`);
            if (p.act) bits.push(T('{n} lignes, {r} relues', {n: String(p.act.lines), r: String(p.act.reviewed)}));
            if (p.doubt) bits.push(plural(p.doubt, 'mot peu sûr', 'mots peu sûrs'));
            if (p.redo) bits.push('📷 ' + T('Photo à refaire'));
            if (!p.has_photo) bits.push(T('pas de photo'));
        }
        return bits.join(' · ');
    }
    const counts = D => D.etat || {todo: 0, doing: 0, checked: 0, done: 0, absent: 0, blank: 0, redo: 0, review: 0, doubt: 0, photos: 0};
    /** « 3, 7, 9-11 » : des numéros de page, groupés */
    function ranges(nums) {
        const n = [...nums].sort((a, b) => a - b), out = []; let a = null, b = null;
        n.forEach(x => { if (a === null) { a = b = x; } else if (x === b + 1) { b = x; } else { out.push(a === b ? `${a}` : `${a}-${b}`); a = b = x; } });
        if (a !== null) out.push(a === b ? `${a}` : `${a}-${b}`);
        return out.join(', ');
    }

    /* ─── les chiffres et la barre ─── */
    function kpiHtml(D) {
        const c = counts(D), n = D.pages.length, exp = D.recueil.expected_pages || 0, live = n - c.absent - c.blank;
        const box = (big, small, k = '') => `<div class="re-kpi${k ? ' is-' + k : ''}"><b>${big}</b><small>${small}</small></div>`;
        const seg = (k, v) => (v ? `<b class="re-s-${k}" style="width:${(v / Math.max(1, n)) * 100}%" title="${v}"></b>` : '');
        return `<div class="re-kpis">${box(`${c.photos}${exp ? ` / ${exp}` : ''}`, esc(isLiasse(D) ? (exp ? T('pièces photographiées sur les {n} attendues', {n: String(exp)}) : T('pièces photographiées')) : (exp ? T('pages photographiées sur les {n} attendues', {n: String(exp)}) : T('pages photographiées'))))}
            ${box(c.done + c.checked, esc(T('🟢 finies ou 🔵 relues')), 'ok')}${box(c.doing, esc(T('🟡 en cours')), 'cours')}${box(c.todo, esc(T('⚪ pas encore transcrites')))}${box(c.absent, esc(T('⛔ absentes')) + (c.blank ? ` · ${esc(plural(c.blank, 'blanche', 'blanches'))}` : ''), c.absent ? 'abs' : '')}</div>
            <div class="re-stack" role="img" aria-label="${esc(T('{a} finies, {b} relues, {c} en cours, {d} à faire, {e} absentes', {a: c.done, b: c.checked, c: c.doing, d: c.todo, e: c.absent}))}">${seg('done', c.done)}${seg('checked', c.checked)}${seg('doing', c.doing)}${seg('todo', c.todo)}${seg('abs', c.absent + c.blank)}</div>
            ${live && c.review + c.doubt && ext.recueilSens?.opt('fiabilite') !== false ? `<p class="re-rel muted">${esc(T('Fiabilité :'))} ${c.review ? `<span class="re-pill q">👁 ${esc(plural(c.review, 'page à relire', 'pages à relire'))}</span>` : ''} ${c.doubt ? `<span class="re-pill q">❓ ${esc(plural(c.doubt, 'page avec des mots peu sûrs', 'pages avec des mots peu sûrs'))}</span>` : ''}</p>` : ''}`;
    }
    const legendHtml = () => `<div class="re-leg">${[['s-fin', '🟢 ' + T('Finie')], ['s-relue', '🔵 ' + T('Relue')], ['s-cours', '🟡 ' + T('En cours')], ['s-todo', '⚪ ' + T('À faire')], ['s-abs', '⛔ ' + T('Absente')], ['s-pasligne', '🌐 ' + T('Pas en ligne')], ['s-blank', '▫ ' + T('Blanche')]].map(([c, l]) => `<span><i class="${c}"></i>${esc(l)}</span>`).join('')}</div>`;

    /* ─── 📋 ce qui reste à faire, dans l'ordre conseillé ─── */
    function todoItems(D) {
        const P = D.pages, live = P.filter(p => !p.absent), out = [];
        const ask = P.filter(p => p.absent && p.absent !== 'blanche' && p.absent !== 'communicable');
        if (ask.length) {
            const by = {}; ask.forEach(p => { (by[p.absent] ||= []).push(p); });
            Object.entries(by).forEach(([k, ps]) => { const a = absentOf(k); out.push({k: 'ask', n: ps.length, pages: ps, absent: k, text: `${a[1]} ${T(a[2])} : ${T('p. {x}', {x: ranges(ps.map(p => p.num))})}`, btn: '📮 ' + T('Ajouter aux demandes')}); });
        }
        const lock = P.filter(p => p.absent === 'communicable');
        if (lock.length) out.push({k: 'lock', n: lock.length, pages: lock, text: `🔒 ${T('Non communicables')} : ${T('p. {x}', {x: ranges(lock.map(p => p.num))})}${lock[0].absent_until ? ' · ' + T('jusqu’en {y}', {y: lock[0].absent_until}) : ''}`});
        const nophoto = live.filter(p => !p.has_photo);
        if (nophoto.length) out.push({k: 'photo', n: nophoto.length, pages: nophoto, text: `📷 ${T('Sans photo')} : ${T('p. {x}', {x: ranges(nophoto.map(p => p.num))})}`, btn: '＋ ' + T('Ajouter des photos')});
        const redo = live.filter(p => p.redo);
        if (redo.length) out.push({k: 'redo', n: redo.length, pages: redo, text: `📷 ${T('Photo à refaire')} : ${T('p. {x}', {x: ranges(redo.map(p => p.num))})}`, btn: '↗ ' + T('Ouvrir la première')});
        const rel = live.filter(p => p.reliability === 'review' || p.reliability === 'doubt');
        if (rel.length) out.push({k: 'review', n: rel.length, pages: rel, text: `👁 ${T('À relire')} : ${T('p. {x}', {x: ranges(rel.map(p => p.num))})}`, btn: '👁 ' + T('Relire la première')});
        const todo = live.filter(p => p.state === 'todo' && p.has_photo);
        if (todo.length) out.push({k: 'todo', n: todo.length, pages: todo, text: `⚪ ${T('À transcrire')} : ${T('p. {x}', {x: ranges(todo.map(p => p.num))})}`, btn: '✍ ' + T('Commencer p. {n}', {n: String(todo[0].num)})});
        return out;
    }
    function todoHtml(D, max = 50) {
        const items = todoItems(D);
        if (!items.length) return `<p class="re-alldone">✓ ${esc(T('Rien ne reste à faire sur ce recueil.'))}</p>`;
        return `<ul class="re-todo">${items.slice(0, max).map((it, i) => `<li><b>${it.n}</b><span>${esc(it.text)}</span>${it.btn ? `<button type="button" class="button small secondary" data-re-todo="${i}">${esc(it.btn)}</button>` : ''}</li>`).join('')}</ul>`;
    }
    async function runTodo(it, ctx) {
        const D = ctx.D();
        if (it.k === 'ask') {
            const types = {other: 'Autre demande', reading_room: 'À consulter en salle', photograph: 'À photographier / numériser'};
            const type = ASK[it.absent] || 'other', a = absentOf(it.absent);
            const body = {request_type: type, status: 'todo', title: `${D.recueil.title} : ${T('p. {x}', {x: ranges(it.pages.map(p => p.num))})} (${T(a[2])})`, archive_service: D.recueil.place_text || '', archive_reference: D.recueil.reference || '', notes: it.pages.map(p => p.absent_note).filter(Boolean).join('\n')};
            try { const r = await ctx.post('save_archive_digest_request', body); const id = (r.result || r).id;
                A().undoToast?.(T('Demande ajoutée ({t}) : Recherche › Suivi des registres › Demandes.', {t: T(types[type])}), {icon: '📮', undo: async () => { await ctx.post('delete_archive_digest_request', {id}); }});
            } catch (e) { toast(e.message, 'error'); }
            return;
        }
        if (it.k === 'photo') return ctx.addPhotos?.(it.pages[0].id);
        ctx.openPage(it.pages[0].id);
    }

    /* ─── les trous de numérotation, repérés sur le nom des pages ─── */
    const OK_KEY = 'genealogie-recueil-trous-ok';
    const okRead = rid => { try { return (JSON.parse(localStorage.getItem(OK_KEY) || '{}')[rid]) || []; } catch (_) { return []; } };
    const okAdd = (rid, k) => { try { const all = JSON.parse(localStorage.getItem(OK_KEY) || '{}'); all[rid] = [...new Set([...(all[rid] || []), k])].slice(-300); localStorage.setItem(OK_KEY, JSON.stringify(all)); } catch (_) {} };
    /** « f° 12 r° » → {kind: 'folio', n: 12, side: 0|1, idx}, « p. 3 » / « page 3 » / « 3 » → {kind: 'page', n: 3, idx} ; « bis » à part */
    function parseLabel(l) {
        const s = String(l || '').trim().toLowerCase();
        let m = s.match(/^(?:f(?:°|o|ol\.?|olio)?\.?\s*)(\d{1,5})\s*(bis|ter)?\s*(r|v|ro|vo|r°|v°|recto|verso)?\b/);
        if (m && /^f/.test(s)) { const side = m[3] ? (m[3][0] === 'v' ? 1 : 0) : null; return {kind: 'folio', n: Number(m[1]), side, bis: !!m[2], idx: Number(m[1]) * 2 + (side || 0)}; }
        m = s.match(/^(?:p\.?|page|pièce|piece)?\s*(\d{1,5})\s*(bis|ter)?$/);
        if (m) return {kind: 'page', n: Number(m[1]), bis: !!m[2], idx: Number(m[1])};
        return null;
    }
    function holes(D) {
        if (isLiasse(D) || ext.recueilSens?.opt('trous') === false) return []; // réglage « Me signaler les trous de numérotation »
        const out = [], ok = okRead(D.recueil.id), P = D.pages;
        let prev = null;
        P.forEach(p => {
            const x = parseLabel(p.label); if (!x) return;
            if (prev && prev.x.kind === x.kind && !x.bis) {
                const step = x.kind === 'folio' && (prev.x.side === null || x.side === null) ? 2 : 1;
                const gap = x.idx - prev.x.idx;
                if (gap === 0) { const k = `dup:${prev.p.id}:${p.id}`; if (!ok.includes(k)) out.push({k, type: 'dup', a: prev.p, b: p}); }
                else if (gap > step && gap < 400) {
                    const miss = [];
                    if (x.kind === 'folio' && step === 1) { for (let i = prev.x.idx + 1; i < x.idx; i++) miss.push(`f° ${Math.floor(i / 2)} ${i % 2 ? 'v°' : 'r°'}`); }
                    else if (x.kind === 'folio') { for (let i = prev.x.n + 1; i < x.n; i++) miss.push(`f° ${i}`); }
                    else { for (let i = prev.x.n + 1; i < x.n; i++) miss.push(T('p. {x}', {x: String(i)})); }
                    const k = `gap:${prev.p.id}:${p.id}`; if (!ok.includes(k)) out.push({k, type: 'gap', a: prev.p, b: p, miss});
                }
            }
            prev = {p, x};
        });
        const exp = D.recueil.expected_pages || 0, n = P.length;
        if (exp && n !== exp) { const k = `count:${exp}:${n}`; if (!ok.includes(k)) out.push({k, type: 'count', exp, n}); }
        return out;
    }
    function holesHtml(D) {
        return holes(D).map((h, i) => {
            if (h.type === 'gap') return `<div class="re-msg is-warn">⚠️ ${esc(T('Après « {a} » vient « {b} » : il manque peut-être {x}.', {a: h.a.label, b: h.b.label, x: h.miss.length > 6 ? `${h.miss.slice(0, 3).join(', ')} … ${h.miss.at(-1)} (${h.miss.length})` : h.miss.join(', ')}))}
                <div class="re-row"><button type="button" class="button small" data-re-hole="${i}" data-re-do="insert">${esc(T('Poser ces pages comme absentes…'))}</button><button type="button" class="button small secondary" data-re-hole="${i}" data-re-do="ok">${esc(T('C’est normal'))}</button></div></div>`;
            if (h.type === 'dup') return `<div class="re-msg is-warn">⚠️ ${esc(T('« {a} » deux fois (pages {x} et {y}) : une photo en double, ou « bis » ?', {a: h.b.label, x: String(h.a.num), y: String(h.b.num)}))}
                <div class="re-row"><button type="button" class="button small" data-re-hole="${i}" data-re-do="bis">${esc(T('Renommer en « {a} bis »', {a: h.b.label}))}</button><button type="button" class="button small secondary" data-re-hole="${i}" data-re-do="ok">${esc(T('Laisser'))}</button></div></div>`;
            return `<div class="re-msg">ℹ️ ${esc(T('Le recueil devrait avoir {e} pages, il en a {n} ici (absentes comprises) : {x}', {e: String(h.exp), n: String(h.n), x: h.n < h.exp ? T('il en manque {d}.', {d: String(h.exp - h.n)}) : T('{d} de trop (une photo en double ?).', {d: String(h.n - h.exp)})}))}
                <div class="re-row"><button type="button" class="button small secondary" data-re-hole="${i}" data-re-do="ok">${esc(T('C’est normal'))}</button></div></div>`;
        }).join('');
    }

    /* ─── « Marquer absentes… » : la raison (une seule), une note, la lacune d'archives ─── */
    function absentDialog(ctx, pages, {insert = null} = {}) {
        const D = ctx.D(), cur = pages.length === 1 ? pages[0] : null;
        const title = insert ? T('Poser {n} pages absentes', {n: String(insert.labels.length)}) : pages.length > 1 ? T('Marquer {n} pages absentes', {n: String(pages.length)}) : T('Marquer « {p} » absente', {p: pageWord(D, cur)});
        ext.openDialog({eyebrow: T('🗂 ÉTAT DU RECUEIL'), title, submitLabel: insert ? T('Poser les pages') : T('Marquer absentes'),
            body: `${insert ? `<p class="muted">${esc(insert.labels.join(', '))}</p>` : ''}<p class="re-why">${esc(T('Pourquoi ces pages ne sont pas là ?'))}</p>
                <div class="re-reasons" role="radiogroup">${ABSENT.map(([k, ic, l, h]) => `<label class="checkbox-line"><input type="radio" name="absent" value="${k}" ${(cur?.absent || 'manquante') === k ? 'checked' : ''}> ${ic} <b>${esc(T(l))}</b>${h ? ` <small class="muted">— ${esc(T(h))}</small>` : ''}</label>`).join('')}</div>
                <label class="re-field" data-re-until hidden>${esc(T('Jusqu’en (année)'))}<input name="absent_until" inputmode="numeric" maxlength="4" placeholder="2045" value="${esc(cur?.absent_until || '')}"></label>
                <label class="re-field">${esc(T('Note'))}<input name="absent_note" maxlength="500" value="${esc(cur?.absent_note || '')}" placeholder="${esc(T('ex. arrachées, mentionné en marge du f° 16'))}"></label>
                <label class="re-check"><input type="checkbox" name="gap" checked> ${esc(T('Ajouter aussi aux Lacunes d’archives (conseillé)'))}</label>`,
            onOpen: d => { const sync = () => { d.querySelector('[data-re-until]').hidden = d.querySelector('[name=absent]:checked')?.value !== 'communicable'; }; d.addEventListener('change', sync); sync(); },
            onSubmit: async form => {
                const f = new FormData(form), absent = String(f.get('absent') || 'manquante'), gap = absent !== 'blanche' && !!f.get('gap');
                const fields = {absent, absent_note: String(f.get('absent_note') || ''), absent_until: absent === 'communicable' ? String(f.get('absent_until') || '') : ''};
                if (insert) {
                    const r = await ctx.post('recueil_insert_absent', {recueil_id: D.recueil.id, after: insert.after, labels: insert.labels, ...fields, gap}); const x = r.result || r;
                    A().undoToast?.(plural(x.page_ids.length, 'page absente posée', 'pages absentes posées'), {icon: '🗂', undo: async () => { await ctx.post('recueil_remove_inserted', {recueil_id: D.recueil.id, page_ids: x.page_ids, gap_id: x.gap_id}); await ctx.reload(); }});
                } else await setPages(ctx, pages, fields, {gap, msg: plural(pages.length, 'page marquée absente', 'pages marquées absentes')});
                await ctx.reload(); return true;
            }});
    }
    /** change des pages (recueil_pages_set) avec ↶ Annuler */
    async function setPages(ctx, pages, fields, {gap = false, msg = ''} = {}) {
        const D = ctx.D();
        try {
            const r = await ctx.post('recueil_pages_set', {recueil_id: D.recueil.id, page_ids: pages.map(p => p.id), fields, gap}); const x = r.result || r;
            A().undoToast?.(msg || plural(pages.length, 'page changée', 'pages changées'), {icon: '🗂', undo: async () => { await ctx.post('recueil_pages_restore', {recueil_id: D.recueil.id, before: x.before, gap_id: x.gap_id}); await ctx.reload(); }});
            return x;
        } catch (e) { toast(e.message, 'error'); return null; }
    }

    /* ─── l'onglet « 🗂 État » ─── */
    const sel = new Map(); // recueil → pages choisies
    let view = 'cases', last = 0;
    function paint(body, ctx) {
        const D = ctx.D(), rid = D.recueil.id, picked = sel.get(rid) || new Set(); sel.set(rid, picked);
        [...picked].forEach(id => { if (!D.pages.some(p => p.id === id)) picked.delete(id); });
        const P = D.pages, pickOn = body.dataset.rePick === '1';
        const numbering = NUMBERING.find(n => n[0] === D.recueil.numbering);
        const grid = `<div class="re-map${pickOn ? ' is-picking' : ''}" role="list" aria-label="${esc(T('Les pages'))}">${P.map(p => `<button type="button" role="listitem" class="re-cell ${cls(p)}${picked.has(p.id) ? ' is-picked' : ''}" data-re-page="${p.id}" title="${esc(tip(D, p))}" aria-label="${esc(tip(D, p))}" ${pickOn ? `aria-pressed="${picked.has(p.id)}"` : ''}>${p.num}${p.redo ? '<em aria-hidden="true">📷</em>' : ''}</button>`).join('')}</div>`;
        const list = `<div class="data-table-wrap"><table class="data-table re-table" data-cols-off><thead><tr>${pickOn ? '<th></th>' : ''}<th>N°</th><th>${esc(T('Nom'))}</th><th>${esc(T('État'))}</th><th>${esc(T('Fiabilité'))}</th><th>${esc(T('Lisibilité'))}</th><th>${esc(T('Absente'))}</th></tr></thead><tbody>${P.map(p => {
            const a = absentOf(p.absent), r = REL[p.reliability];
            return `<tr class="${picked.has(p.id) ? 'is-picked' : ''}">${pickOn ? `<td><input type="checkbox" data-re-check="${p.id}" ${picked.has(p.id) ? 'checked' : ''} aria-label="${esc(pageWord(D, p))}"></td>` : ''}<td>${p.num}</td><td><button type="button" class="table-link" data-re-page="${p.id}">${esc(pageWord(D, p))}</button></td>
                <td>${p.absent ? '—' : `${STATES[p.state][0]} ${esc(T(STATES[p.state][1]))}${p.state_set ? ' <small class="muted">' + esc(T('(choisi)')) + '</small>' : ''}`}</td><td>${r ? `<span class="re-pill ${r[2]}">${r[0]} ${esc(T(r[1]))}</span>` : '—'}</td>
                <td>${esc(T(LEGI.find(l => l[0] === p.legibility)?.[1] || '')) || '—'}${p.redo ? ' · 📷' : ''}</td><td>${a ? `${a[1]} ${esc(T(a[2]))}${p.absent_until ? ' ' + esc(T('jusqu’en {y}', {y: p.absent_until})) : ''}${p.absent_note ? `<br><small class="muted">${esc(p.absent_note)}</small>` : ''}` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
        body.innerHTML = `<div class="re-tab">
            <div class="re-head"><div><h3>🗂 ${esc(T('État du recueil'))}</h3><p class="muted">${esc([numbering ? `${numbering[1]} ${T(numbering[2])}` : T('Numérotation pas dite'), D.recueil.expected_pages ? T('{n} pages attendues', {n: String(D.recueil.expected_pages)}) : ''].filter(Boolean).join(' · '))} <button type="button" class="link-button" data-re-meta>✎ ${esc(T('Numérotation, pages attendues'))}</button></p></div>
                <div class="re-row"><span class="segmented re-seg">${[['cases', '▦ ' + T('Cases')], ['list', '☰ ' + T('Liste')]].map(([k, l]) => `<button type="button" class="${view === k ? 'is-active' : ''}" data-re-view="${k}" aria-pressed="${view === k}">${esc(l)}</button>`).join('')}</span>
                <button type="button" class="button small secondary${pickOn ? ' is-active' : ''}" data-re-pick aria-pressed="${pickOn}">☑ ${esc(T('Choisir des pages'))}</button><button type="button" class="button small secondary" data-re-csv>⤓ ${esc(T('Exporter l’état (tableur)'))}</button></div></div>
            ${kpiHtml(D)}
            ${pickOn ? `<div class="re-pickbar"><span>${esc(picked.size ? plural(picked.size, 'page choisie', 'pages choisies') : T('Clique sur les pages (Maj + clic : de… à…)'))}</span><span class="spacer"></span>
                <button type="button" class="button small" data-re-act="state" ${picked.size ? '' : 'disabled'}>${esc(T('Changer l’état…'))}</button><button type="button" class="button small secondary" data-re-act="absent" ${picked.size ? '' : 'disabled'}>⛔ ${esc(T('Marquer absentes…'))}</button>
                <button type="button" class="button small secondary" data-re-act="more" ${picked.size ? '' : 'disabled'}>⋯ ${esc(T('Plus'))}</button><button type="button" class="button small secondary" data-re-act="all">${esc(T('Tout choisir'))}</button>${picked.size ? `<button type="button" class="button small secondary" data-re-act="none">${esc(T('Tout enlever'))}</button>` : ''}</div>` : ''}
            ${P.length ? (view === 'list' ? list : grid + legendHtml()) : A().emptyState({icon: '🗂', text: T('Pas encore de page'), hint: T('Ajoute des photos : chaque photo devient une page.')})}
            ${holesHtml(D)}
            <section class="re-todo-box"><h3>📋 ${esc(T('Ce qui reste, dans l’ordre conseillé'))}</h3>${todoHtml(D)}<p class="muted re-note">${esc(T('Les demandes vont dans Recherche › Suivi des registres › Demandes, les lacunes dans les Lacunes d’archives : les listes qui existent.'))}</p></section></div>`;
        const again = () => paint(body, ctx);
        body.querySelectorAll('[data-re-view]').forEach(b => b.addEventListener('click', () => { view = b.dataset.reView; again(); }));
        body.querySelector('[data-re-pick]').addEventListener('click', () => { body.dataset.rePick = pickOn ? '0' : '1'; if (pickOn) picked.clear(); again(); });
        body.querySelector('[data-re-meta]').addEventListener('click', () => metaDialog(ctx));
        body.querySelector('[data-re-csv]').addEventListener('click', () => csv(D));
        body.querySelectorAll('[data-re-page]').forEach(b => b.addEventListener('click', e => {
            const id = Number(b.dataset.rePage);
            if (!pickOn || b.matches('.table-link')) return ctx.openPage(id);
            if (e.shiftKey && last) { const a = P.findIndex(p => p.id === last), z = P.findIndex(p => p.id === id); P.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(p => picked.add(p.id)); }
            else if (picked.has(id)) picked.delete(id); else picked.add(id);
            last = id; again(); body.querySelector(`[data-re-page="${id}"]`)?.focus();
        }));
        body.querySelectorAll('[data-re-check]').forEach(c => c.addEventListener('change', () => { const id = Number(c.dataset.reCheck); if (c.checked) picked.add(id); else picked.delete(id); last = id; again(); }));
        const chosen = () => P.filter(p => picked.has(p.id));
        const done = async () => { picked.clear(); await ctx.reload(); };
        body.querySelectorAll('[data-re-act]').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.reAct;
            if (k === 'all') { P.forEach(p => picked.add(p.id)); return again(); }
            if (k === 'none') { picked.clear(); return again(); }
            if (k === 'absent') return absentDialog({...ctx, reload: done}, chosen());
            if (k === 'state') return window.LCNDA_UI?.menuAt?.(b, [...Object.entries(STATES).map(([s, [ic, l]]) => ({icon: ic, label: T(l), run: async () => { await setPages(ctx, chosen(), {state: s, absent: ''}); await done(); }})), '-',
                {icon: '↺', label: T('Revenir à l’état calculé'), run: async () => { await setPages(ctx, chosen(), {state: ''}); await done(); }}], {title: T('État du texte')});
            if (k === 'more') return window.LCNDA_UI?.menuAt?.(b, [{icon: '📷', label: T('Photo à refaire'), run: async () => { await setPages(ctx, chosen(), {redo: 1}); await done(); }},
                {icon: '📷', label: T('Photo bonne (plus à refaire)'), run: async () => { await setPages(ctx, chosen(), {redo: 0}); await done(); }}, '-',
                ...LEGI.filter(l => l[0]).map(([v, l]) => ({icon: '👓', label: T('Lisibilité : {x}', {x: T(l)}), run: async () => { await setPages(ctx, chosen(), {legibility: v}); await done(); }})), '-',
                {icon: '✓', label: T('Plus absentes'), run: async () => { await setPages(ctx, chosen(), {absent: '', absent_note: '', absent_until: ''}); await done(); }}], {title: T('Plus')});
        }));
        const H = holes(D);
        body.querySelectorAll('[data-re-hole]').forEach(b => b.addEventListener('click', async () => {
            const h = H[Number(b.dataset.reHole)], k = b.dataset.reDo; if (!h) return;
            if (k === 'ok') { okAdd(D.recueil.id, h.k); return again(); }
            if (k === 'insert') return absentDialog(ctx, [], {insert: {after: h.a.id, labels: h.miss}});
            if (k === 'bis') { const old = h.b.label; try { await ctx.post('save_recueil_page', {id: h.b.id, label: `${old} bis`}); A().undoToast?.(T('Renommée en « {a} »', {a: `${old} bis`}), {undo: async () => { await ctx.post('save_recueil_page', {id: h.b.id, label: old}); await ctx.reload(); }}); await ctx.reload(); } catch (e) { toast(e.message, 'error'); } }
        }));
        const items = todoItems(D);
        body.querySelectorAll('[data-re-todo]').forEach(b => b.addEventListener('click', () => runTodo(items[Number(b.dataset.reTodo)], ctx)));
    }

    /** ⤓ l'état page par page, pour un tableur (CSV, séparateur « ; », comme Excel en français) */
    function csv(D) {
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const head = [T('N°'), T('Nom'), T('État'), T('État choisi'), T('Fiabilité'), T('Lignes'), T('Lignes relues'), T('Mots peu sûrs'), T('Lisibilité'), T('Photo'), T('Photo à refaire'), T('Absente'), T('Jusqu’en'), T('Note')];
        const rows = D.pages.map(p => [p.num, pageWord(D, p), p.absent ? '' : T(STATES[p.state][1]), p.state_set ? T('oui') : '', REL[p.reliability] ? T(REL[p.reliability][1]) : '', p.act?.lines ?? '', p.act?.reviewed ?? '', p.doubt || '',
            T(LEGI.find(l => l[0] === p.legibility)?.[1] || ''), p.has_photo ? T('oui') : T('non'), p.redo ? T('oui') : '', p.absent ? T(absentOf(p.absent)[2]) : '', p.absent_until, p.absent_note]);
        const blob = new Blob(['﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'});
        const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: (A().safeExportFilename ? A().safeExportFilename(`${T('État')} — ${D.recueil.title}`) : 'etat') + '.csv'});
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }

    /** ✎ numérotation et pages attendues */
    function metaDialog(ctx) {
        const D = ctx.D(), r = D.recueil;
        ext.openDialog({eyebrow: T('🗂 ÉTAT DU RECUEIL'), title: T('Numérotation, pages attendues'), submitLabel: T('Enregistrer'), body: fields(r),
            onSubmit: async form => {
                const f = new FormData(form);
                const before = {numbering: r.numbering || '', expected_pages: r.expected_pages || 0};
                await ctx.post('save_recueil', {...r, numbering: String(f.get('numbering') || ''), expected_pages: Number(f.get('expected_pages') || 0)});
                A().undoToast?.(T('Numérotation enregistrée'), {undo: async () => { await ctx.post('save_recueil', {...r, ...before}); await ctx.reload(); }});
                await ctx.reload(); return true;
            }});
    }
    /** les champs de la numérotation (aussi dans « Modifier le recueil ») */
    function fields(r) {
        const cur = r?.numbering || '';
        return `<fieldset class="re-numbering"><legend>${esc(T('Comment ce recueil est numéroté ?'))}</legend>${NUMBERING.map(([k, ic, l, h]) => `<label class="checkbox-line"><input type="radio" name="numbering" value="${k}" ${cur === k ? 'checked' : ''}> ${ic} <b>${esc(T(l))}</b> <small class="muted">— ${esc(T(h))}</small></label>`).join('')}
            <label class="checkbox-line"><input type="radio" name="numbering" value="" ${cur ? '' : 'checked'}> ${esc(T('Pas dit'))}</label></fieldset>
            <label class="re-field">${esc(T('Pages attendues (pour repérer ce qui manque)'))}<input name="expected_pages" type="number" min="0" max="100000" value="${esc(r?.expected_pages || '')}" placeholder="${esc(T('ex. 40'))}"></label>`;
    }

    /* ─── sur la page ouverte ─── */
    function pageBox(el, p, ctx) {
        if (!el || !p) return;
        const D = ctx.D(), r = REL[p.reliability], a = absentOf(p.absent), ro = document.body.classList.contains('is-kiosk');
        el.innerHTML = `<div class="re-page">
            ${a ? `<p class="re-msg ${p.absent === 'blanche' ? '' : 'is-warn'}">${a[1]} <b>${esc(T(a[2]))}</b>${p.absent_until ? ' ' + esc(T('jusqu’en {y}', {y: p.absent_until})) : ''}${p.absent_note ? ` — ${esc(p.absent_note)}` : ''}${p.gap_id ? ` <small class="muted">· ${esc(T('dans les Lacunes d’archives'))}</small>` : ''}
                ${ro ? '' : `<span class="re-row"><button type="button" class="button small secondary" data-re-pabs>✎ ${esc(T('Changer'))}</button><button type="button" class="button small secondary" data-re-pback>✓ ${esc(T('Plus absente'))}</button></span>`}</p>` : `
            <div class="re-prow"><span class="re-k">${esc(T('État du texte'))}</span><span class="segmented re-seg" role="radiogroup" aria-label="${esc(T('État du texte'))}">${Object.entries(STATES).map(([k, [ic, l]]) => `<button type="button" role="radio" aria-checked="${p.state === k}" class="${p.state === k ? 'is-active' : ''}" data-re-pstate="${k}" ${ro ? 'disabled' : ''}>${ic} ${esc(T(l))}</button>`).join('')}</span></div>
            <p class="re-sub muted">${p.state_set ? `${esc(T('Choisi à la main'))} · <button type="button" class="link-button" data-re-pauto>↺ ${esc(T('Revenir à l’état calculé ({s})', {s: T(STATES[p.state_auto][1])}))}</button>` : p.act ? esc(T('Calculé par l’Atelier (acte n° {n})', {n: String(p.act.id)})) : esc(T('Calculé : texte écrit = en cours'))}</p>
            <div class="re-prow" ${ext.recueilSens?.opt('fiabilite') === false ? 'hidden' : ''}><span class="re-k">${esc(T('Fiabilité de la lecture'))}</span><span>${r ? `<span class="re-pill ${r[2]}">${r[0]} ${esc(T(r[1]))}</span>` : `<span class="muted">${esc(T('rien d’écrit'))}</span>`} ${p.act ? `<small class="muted">${esc(T('{r} lignes relues sur {n}', {r: String(p.act.reviewed), n: String(p.act.lines)}))}</small>` : ''}${p.doubt ? ` <small class="muted">· ${esc(plural(p.doubt, 'mot peu sûr', 'mots peu sûrs'))}</small>` : ''}</span></div>
            <div class="re-prow"><label class="re-k" for="re-legi-${p.id}">${esc(T('Lisibilité'))}</label><select id="re-legi-${p.id}" data-re-plegi ${ro ? 'disabled' : ''}>${LEGI.map(([k, l]) => `<option value="${k}" ${p.legibility === k ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select>
</div>
            <div class="re-prow"><span class="re-k"></span><label class="re-check"><input type="checkbox" data-re-predo ${p.redo ? 'checked' : ''} ${ro ? 'disabled' : ''}> 📷 ${esc(T('Photo à refaire'))}</label></div>
            ${ro ? '' : `<p><button type="button" class="link-button" data-re-pabs>⛔ ${esc(T('Cette page est absente…'))}</button></p>`}`}</div>`;
        const one = [p];
        const after = async () => { await ctx.reload(); };
        el.querySelectorAll('[data-re-pstate]').forEach(b => b.addEventListener('click', async () => { if (b.dataset.rePstate === p.state && p.state_set) return; await setPages(ctx, one, {state: b.dataset.rePstate}, {msg: T('État : {s}', {s: T(STATES[b.dataset.rePstate][1])})}); await after(); }));
        el.querySelector('[data-re-pauto]')?.addEventListener('click', async () => { await setPages(ctx, one, {state: ''}, {msg: T('État calculé')}); await after(); });
        el.querySelector('[data-re-plegi]')?.addEventListener('change', async e => { await setPages(ctx, one, {legibility: e.target.value}, {msg: T('Lisibilité notée')}); await after(); });
        el.querySelector('[data-re-predo]')?.addEventListener('change', async e => { await setPages(ctx, one, {redo: e.target.checked ? 1 : 0}, {msg: e.target.checked ? T('Photo à refaire') : T('Photo bonne')}); await after(); });
        el.querySelectorAll('[data-re-pabs]').forEach(b => b.addEventListener('click', () => absentDialog(ctx, one)));
        el.querySelector('[data-re-pback]')?.addEventListener('click', async () => { await setPages(ctx, one, {absent: '', absent_note: '', absent_until: ''}, {msg: T('Plus absente')}); await after(); });
    }

    /* ─── les blocs du Résumé ─── */
    function block(type, b, ctx) {
        const D = ctx.D();
        if (type === 'etat') return `${kpiHtml(D)}<div class="re-map is-mini">${D.pages.slice(0, b?.n || 400).map(p => `<button type="button" class="re-cell ${cls(p)}" data-rc-open="${p.id}" title="${esc(tip(D, p))}" aria-label="${esc(tip(D, p))}">${p.num}</button>`).join('')}</div>${legendHtml()}`;
        if (type === 'todo') return todoHtml(D, b?.n || 12);
        return '';
    }
    function bindBlocks(root, ctx) {
        const items = todoItems(ctx.D());
        root.querySelectorAll('[data-re-todo]').forEach(b => b.addEventListener('click', () => runTodo(items[Number(b.dataset.reTodo)], ctx)));
    }

    ext.recueilEtat = {paint, pageBox, block, bindBlocks, pageWord, fields, parseLabel, holes, todoItems, STATES, REL, ABSENT};
})();
