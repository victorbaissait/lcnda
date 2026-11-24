/**
 * 🌍 « Où chercher ? » — en plus, sur la page (Recherche → 🌍 Où chercher ?), au-dessus des sites proposés :
 *  - 🧭 « Ton plan de recherche » : ce qui manque sur la fiche → le registre le plus probable, pourquoi, sa période, en ligne
 *    ou sur place (app-ou-chercher-monde.js, tips) ; « ↗ Ouvrir » ouvre le site proposé correspondant ;
 *  - 📖 « Les registres de ses pays » : pour chaque pays de sa vie, les registres qui existent, leur période, où ils sont
 *    (guide) — ceux qui croisent sa vie en premier ;
 *  - 🇳🇱🇧🇪 « Open Archives » : chercher la personne dans les actes indexés (Pays-Bas, Belgique…) SANS quitter la page, à la
 *    demande seulement (lib/ou_chercher_openarch.php : réponses gardées 30 jours, pas plus de 3 requêtes par seconde) ; chaque
 *    acte : type, date, lieu, archive, personnes de l'acte, « ↗ Voir l'acte », « ＋ Ajouter comme source » ou « …et un
 *    événement à vérifier » (↶ Annuler), « ✗ Pas lui » (↶). Jamais de fusion automatique.
 * Branché par ext.ouChercher.afterRedraw (heritage-ou-chercher.js) : rien à changer ailleurs.
 */
(() => {
    'use strict';
    if (window.LCNDA_EXT?.ouChercher?.plus) return; // déjà chargé
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const M = () => window.LCNDA_OUC_MONDE;
    const O = () => window.LCNDA_OUC_OA;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (text, vars) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(text, vars) : String(text ?? '').replace(/\{([a-z_]+)\}/gi, (m, k) => (vars && k in vars ? String(vars[k]) : m)));
    const api = (...a) => A().api(...a);
    const post = async (action, body) => { const r = await api(action, {}, {method: 'POST', body}); return r?.result || r; };
    const badge = (t, k) => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const PLAN_N = 4;
    const STATE = new Map(); // personne → état d'Open Archives (formulaire, résultats, actes ouverts)
    const BODY = new WeakMap(); // corps de la page → affichage (view de heritage-ou-chercher.js)

    /* ═════════════════════ 🧭 le plan, 📖 les registres ═════════════════════ */
    const accessBadge = a => (a ? `<span class="ouc-acc is-${esc(a === 'onsite' ? 'onsite' : a === 'both' ? 'both' : 'online')}">${esc((M()?.ACCESS?.[a] || ['', ''])[0])} ${esc(i18n((M()?.ACCESS?.[a] || ['', ''])[1]))}</span>` : '');
    function siteHref(view, key) {
        const rows = [...(view.res?.list || []), ...(view.res?.searched || []), ...(view.res?.out || [])];
        const x = rows.find(r => r.site?.key === key);
        return x?.site?.href || '';
    }
    function planHtml(view) {
        if (!M()) return '';
        const tips = M().tips(view.res.ctx);
        if (!tips.length) return '';
        const all = lsGet('genealogie-ouc-plan-tout', '0') === '1';
        const shown = all ? tips : tips.slice(0, PLAN_N);
        const li = t => {
            const href = t.site ? siteHref(view, t.site) : '';
            const act = t.oa ? `<button type="button" class="button small secondary" data-oa-jump>${esc(i18n('↓ Chercher ici'))}</button>`
                : href ? `<a class="button small secondary" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(i18n('↗ Ouvrir'))}</a>` : '';
            return `<li class="ouc-tip"><span class="ouc-ico" aria-hidden="true">${esc(t.icon)}</span><div class="ouc-main"><div class="ouc-name"><b>${esc(t.title)}</b>${t.period ? ` <span class="ouc-period">🗓 ${esc(t.period)}</span>` : ''} ${accessBadge(t.access)}</div><div class="ouc-why">${esc(t.why)}</div></div><div class="ouc-acts">${act}</div></li>`;
        };
        return `<section class="ouc-plan" aria-label="${esc(i18n('Ton plan de recherche'))}"><h3>🧭 ${esc(i18n('Ton plan de recherche'))} <small class="muted">${esc(i18n('ce qui manque, et où ça a le plus de chances d’être'))}</small></h3>
            <ul class="ouc-list">${shown.map(li).join('')}</ul>${tips.length > PLAN_N ? `<button type="button" class="link-button" data-ouc-plan-all>${esc(all ? i18n('Moins de conseils') : i18n('Tous les conseils ({n})', {n: tips.length}))}</button>` : ''}</section>`;
    }
    function guidesHtml(view) {
        if (!M()) return '';
        const gs = M().guide(view.res.ctx);
        if (!gs.length) return '';
        const open = lsGet('genealogie-ouc-registres', '0') === '1';
        return `<details class="ouc-guides" data-ouc-guides ${open ? 'open' : ''}><summary>📖 ${esc(i18n('Les registres de ses pays'))} <small class="muted">${esc(gs.map(g => `${g.flag} ${i18n(g.name)}`).join(' · '))}</small></summary>
            ${gs.map(g => `<section class="ouc-guide"><h4>${esc(g.flag)} ${esc(i18n(g.name))} <a class="link-button" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${esc(i18n('↗ Le site'))}</a> <a class="link-button" href="${esc(g.wiki)}" target="_blank" rel="noopener noreferrer">${esc(i18n('↗ Mode d’emploi du pays (FamilySearch Wiki)'))}</a></h4>
                <table class="ouc-reg"><thead><tr><th>${esc(i18n('Registre'))}</th><th>${esc(i18n('Période'))}</th><th>${esc(i18n('Où'))}</th></tr></thead><tbody>${g.items.map(it => `<tr class="${it.inLife ? 'is-life' : ''}"><td>${esc(i18n(it.name))}${it.inLife ? ` ${badge(i18n('pendant sa vie'), 'blue')}` : ''}</td><td class="ouc-nowrap">${esc(it.period)}</td><td>${accessBadge(it.access)} <span class="muted">${esc(i18n(it.where))}</span></td></tr>`).join('')}</tbody></table></section>`).join('')}
            <p class="ui-hint">${esc(i18n('Dates générales : elles changent d’une région à l’autre. Le mode d’emploi du pays donne le détail.'))}</p></details>`;
    }

    /* ═════════════════════ 🇳🇱🇧🇪 Open Archives ═════════════════════ */
    const TYPES = [['', 'Tous les actes'], ['birth', 'Naissances'], ['baptism', 'Baptêmes'], ['marriage', 'Mariages'], ['death', 'Décès'], ['burial', 'Inhumations']];
    const HOW = [['exact', 'Nom exact'], ['sound', 'Sons voisins (Jansen, Janssen…)'], ['wide', 'Large']];
    function stateOf(view) {
        const pid = view.pid;
        if (!STATE.has(pid)) {
            const ctx = view.res.ctx, by = ctx.by || 0, dy = ctx.deathKnown ? ctx.dy : (by ? by + 90 : 0);
            const abroad = ['nl', 'be', 'de', 'lu'].some(c => ctx.countries.has(c));
            STATE.set(pid, {open: abroad, f: {first: (ctx.first || '').split(/[\s,]+/)[0] || '', last: ctx.last || '', y1: by ? by - 5 : '', y2: dy ? dy + 5 : '', type: '', place: '', how: 'exact', with: ''},
                res: null, loading: false, err: '', rec: {}, openRec: new Set(), showNo: false, kin: null});
        }
        return STATE.get(pid);
    }
    function oaFormHtml(view, st) {
        const f = st.f, ctx = view.res.ctx;
        const places = [...new Set(ctx.places || [])].slice(0, 12);
        const kin = st.kin || {};
        const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
        return `<form class="ouc-oa-form" data-oa-form>
            <label><span>${esc(i18n('Prénom'))}</span><input name="first" value="${esc(f.first)}" autocomplete="off"></label>
            <label><span>${esc(i18n('Nom'))}</span><input name="last" value="${esc(f.last)}" autocomplete="off" required></label>
            <label class="ouc-oa-y"><span>${esc(i18n('Années des actes'))}</span><span class="ouc-oa-yy"><input name="y1" type="number" min="1400" max="2030" value="${esc(f.y1)}" aria-label="${esc(i18n('De'))}"> – <input name="y2" type="number" min="1400" max="2030" value="${esc(f.y2)}" aria-label="${esc(i18n('À'))}"></span></label>
            <label><span>${esc(i18n('Sorte d’acte'))}</span><select name="type">${TYPES.map(([v, l]) => opt(v, i18n(l), f.type)).join('')}</select></label>
            <label><span>${esc(i18n('Lieu'))}</span><select name="place">${opt('', i18n('Partout'), f.place)}${places.map(p => opt(p, p, f.place)).join('')}</select></label>
            <label><span>${esc(i18n('Le nom'))}</span><select name="how">${HOW.map(([v, l]) => opt(v, i18n(l), f.how)).join('')}</select></label>
            <label><span>${esc(i18n('Dans le même acte'))}</span><select name="with">${opt('', i18n('Personne d’autre'), f.with)}${kin.spouse ? opt('spouse', i18n('Son conjoint : {name}', {name: kin.spouse}), f.with) : ''}${kin.father ? opt('father', i18n('Son père : {name}', {name: kin.father}), f.with) : ''}${kin.mother ? opt('mother', i18n('Sa mère : {name}', {name: kin.mother}), f.with) : ''}</select></label>
            <div class="ouc-oa-go"><button type="submit" class="button" data-oa-go ${st.loading ? 'disabled' : ''}>${esc(st.loading ? i18n('Je cherche…') : i18n('🔎 Chercher dans Open Archives'))}</button></div></form>`;
    }
    function recHtml(st, x) {
        const rec = st.rec[x.key];
        if (!rec) return `<div class="ouc-oa-rec">${UI().spinner ? UI().spinner(i18n('Je lis l’acte…')) : '…'}</div>`;
        if (rec.error) return `<div class="ouc-oa-rec">${UI().notice ? UI().notice('error', rec.error) : esc(rec.error)}</div>`;
        return `<div class="ouc-oa-rec"><table class="ouc-reg"><thead><tr><th>${esc(i18n('Personne de l’acte'))}</th><th>${esc(i18n('Rôle'))}</th><th>${esc(i18n('Naissance, âge, métier'))}</th></tr></thead><tbody>${rec.persons.map(p => `<tr class="${String(p.pid).replace(/\D/g, '') === String(x.pid).replace(/\D/g, '') ? 'is-life' : ''}"><td>${esc(p.name)}</td><td>${esc(i18n(p.role))}</td><td class="muted">${esc([p.birth ? i18n('né(e) {d}', {d: p.birth}) + (p.birth_place ? ` (${p.birth_place})` : '') : '', p.age ? i18n('{n} ans', {n: p.age}) : '', p.profession, p.residence ? i18n('domicile : {place}', {place: p.residence}) : ''].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table>
            ${rec.source?.reference ? `<p class="muted ouc-oa-ref">📚 ${esc(rec.source.reference)}</p>` : ''}${rec.source?.scan ? `<p><a class="link-button" href="${esc(rec.source.scan)}" target="_blank" rel="noopener noreferrer">${esc(i18n('🖼 Voir l’image de l’acte'))}</a></p>` : ''}</div>`;
    }
    function oaRowHtml(st, x) {
        const L = O().LEVEL[x.level] || ['', 'grey'];
        const added = x.mark?.verdict === 'added', no = x.mark?.verdict === 'no';
        const date = O().dateText(x);
        const open = st.openRec.has(x.key);
        return `<li class="ouc-row ouc-oa-row${added ? ' is-done' : ''}" data-oa-key="${esc(x.key)}">
            <span class="ouc-ico" aria-hidden="true">${added ? '✓' : no ? '✗' : '📜'}</span>
            <div class="ouc-main"><div class="ouc-name"><b>${esc(x.type || i18n('Acte'))}${date ? ` · ${esc(date)}` : ''}${x.place ? ` · ${esc(x.place)}` : ''}</b> ${badge(i18n(L[0]), L[1])}${added ? ' ' + badge(i18n('✓ Ajouté à sa fiche'), 'green') : ''}</div>
                <div class="ouc-why">${esc(x.name)}${x.role ? ` <span class="muted">(${esc(x.role)})</span>` : ''}${x.reasons.length ? ` — ${esc(x.reasons.join(' · '))}` : ''}</div>
                <div class="ouc-why2">${esc([x.source, x.archive].filter(Boolean).join(' · '))}</div>${open ? recHtml(st, x) : ''}</div>
            <div class="ouc-acts"><a class="button small" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(i18n('↗ Voir l’acte'))}</a><button type="button" class="button small secondary" data-oa-persons aria-expanded="${open}">${esc(open ? i18n('▴ Personnes') : i18n('👥 Personnes'))}</button>${added ? `<button type="button" class="button small secondary" data-oa-unadd>${esc(i18n('↶ Retirer'))}</button>` : no ? `<button type="button" class="button small secondary" data-oa-unno>${esc(i18n('↶ C’est peut-être lui'))}</button>` : `<button type="button" class="button small secondary" data-oa-add>${esc(i18n('＋ Ajouter ▾'))}</button><button type="button" class="icon-button small" data-oa-no title="${esc(i18n('Ce n’est pas cette personne : ne plus le proposer'))}" aria-label="${esc(i18n('Pas lui'))}">✗</button>`}</div></li>`;
    }
    function oaResultsHtml(view, st) {
        if (st.err) return UI().notice ? UI().notice('error', st.err) : `<p>${esc(st.err)}</p>`;
        const r = st.res; if (!r) return '';
        const person = {...r.person, places: [...new Set([...(r.person.places || []), ...(view.res.ctx.places || [])])]};
        const k = O().rank(r.rows, person, r.marks);
        const head = `<p class="ouc-oa-count"><b>${esc(i18n('{n} actes trouvés', {n: Number(r.found).toLocaleString('fr-FR')}))}</b>${r.rows.length < r.found ? ` <span class="muted">${esc(i18n('— les {n} premiers, rangés du plus probable au moins probable', {n: r.rows.length}))}</span>` : ''}${r.cached ? ` <span class="muted">· ${esc(i18n('réponse gardée du {date}', {date: r.fetched_at}))}</span> <button type="button" class="link-button" data-oa-fresh>${esc(i18n('↻ Redemander'))}</button>` : ''}</p>
            ${r.found > r.rows.length && !st.f.type && !st.f.place ? `<p class="ui-hint">${esc(i18n('Beaucoup d’actes : choisis une sorte d’acte, un lieu ou un conjoint pour viser juste.'))}</p>` : ''}`;
        const more = r.found > (r.query.start || 0) + r.rows.length && (r.query.start || 0) < 900 ? `<button type="button" class="ui-more" data-oa-next>${esc(i18n('Les {n} suivants ↓', {n: Math.min(100, r.found - (r.query.start || 0) - r.rows.length)}))}</button>` : '';
        const noHtml = k.no.length ? `<details class="ouc-oa-no" ${st.showNo ? 'open' : ''} data-oa-nolist><summary>${esc(i18n('✗ Écartés « pas lui » ({n})', {n: k.no.length}))}</summary><ul class="ouc-list">${k.no.map(x => oaRowHtml(st, x)).join('')}</ul></details>` : '';
        return head + (k.list.length ? `<ul class="ouc-list">${k.list.map(x => oaRowHtml(st, x)).join('')}</ul>` : A().empty ? A().empty('Aucun acte avec ces critères.', {icon: '📜', hint: 'Essaie « Sons voisins », élargis les années ou enlève le lieu.'}) : '') + more + noHtml;
    }
    function oaHtml(view) {
        if (!O()) return '';
        const st = stateOf(view);
        const hist = st.res?.history || [];
        return `<details class="ouc-oa" data-ouc-oa ${st.open ? 'open' : ''}><summary>🇳🇱🇧🇪 <b>${esc(i18n('Open Archives'))}</b> <small class="muted">${esc(i18n('chercher ici dans les actes indexés : Pays-Bas, Belgique, une partie de l’Allemagne, Suriname…'))}</small></summary>
            <p class="ouc-intro">${esc(i18n('Une recherche seulement quand tu cliques ; la réponse est gardée 30 jours. Rien n’est ajouté à la fiche sans ton clic, et tout ajout est marqué « à vérifier ».'))}</p>
            ${oaFormHtml(view, st)}
            ${hist.length ? `<p class="ouc-oa-hist muted">✓ ${esc(i18n('Déjà cherché :'))} ${hist.slice(0, 4).map(h => `${esc(h.query)} <small>(${esc(i18n('{n} actes', {n: h.found}))}, ${esc(String(h.date).slice(0, 10))})</small>`).join(' · ')}</p>` : ''}
            <div data-oa-results>${oaResultsHtml(view, st)}</div>
            <p class="ui-hint ouc-oa-credit">${esc(st.res?.attribution || i18n('Données : les archives citées sur chaque acte, via Open Archives (openarchieven.nl).'))} ${st.res?.search_url ? `<a class="link-button" href="${esc(st.res.search_url)}" target="_blank" rel="noopener noreferrer">${esc(i18n('↗ La même recherche sur leur site'))}</a>` : ''}</p></details>`;
    }
    const sectionOf = el => el.closest?.('[data-ouc-oa]');
    function repaint(body) {
        const view = BODY.get(body); const sec = body.querySelector('[data-ouc-oa]');
        if (!view || !sec) return;
        const wasOpen = sec.open;
        const tmp = document.createElement('div'); tmp.innerHTML = oaHtml(view);
        const neu = tmp.firstElementChild; if (wasOpen) neu.open = true;
        sec.replaceWith(neu);
    }
    function readForm(form, st) {
        const d = Object.fromEntries(new FormData(form).entries());
        st.f = {first: String(d.first || '').trim(), last: String(d.last || '').trim(), y1: Number(d.y1) || '', y2: Number(d.y2) || '', type: String(d.type || ''), place: String(d.place || ''), how: String(d.how || 'exact'), with: String(d.with || '')};
    }
    async function search(body, {fresh = false, start = 0} = {}) {
        const view = BODY.get(body); if (!view) return;
        const st = stateOf(view);
        st.loading = true; st.err = ''; repaint(body);
        try {
            const r = await api('ou_chercher_openarch', {id: view.pid, ...st.f, start, fresh: fresh ? 1 : 0});
            if (r?.error) throw new Error(r.error);
            st.res = r; st.kin = r.person?.kin || st.kin;
        } catch (e) { st.err = e.message || String(e); }
        st.loading = false; repaint(body);
    }
    /** les proches pour « dans le même acte » : donnés par la fiche (GET ou_chercher_person, oa_kin), rien n'est envoyé au site */
    function loadKin(body) {
        const view = BODY.get(body); if (!view) return; const st = stateOf(view);
        if (!st.kin) { const k = view.data?.raw?.oa_kin; st.kin = k && typeof k === 'object' && !Array.isArray(k) ? k : {}; }
    }
    async function toggleRec(body, key) {
        const view = BODY.get(body); const st = stateOf(view);
        if (st.openRec.has(key)) { st.openRec.delete(key); repaint(body); return; }
        st.openRec.add(key); repaint(body);
        if (!st.rec[key]) {
            const [archive, identifier] = key.split(':');
            try { const r = await api('ou_chercher_openarch_record', {archive, identifier}); if (r?.error) throw new Error(r.error); st.rec[key] = r; } catch (e) { st.rec[key] = {error: e.message || String(e)}; }
            repaint(body);
        }
    }
    const rowOf = (st, key) => (st.res?.rows || []).find(r => r.key === key);
    async function add(body, key, mode) {
        const view = BODY.get(body); const st = stateOf(view); const x = rowOf(st, key); if (!x) return;
        const [archive, identifier] = key.split(':');
        let r;
        try { r = await post('ou_chercher_openarch_add', {person_id: view.pid, archive, identifier, pid: x.pid, mode}); if (r?.error) throw new Error(r.error); }
        catch (e) { A().toast(e.message, 'error'); return; }
        st.res.marks = {...st.res.marks, [key]: {verdict: 'added', batch: r.batch}};
        repaint(body);
        const extra = (r.notes || []).length ? ` (${r.notes.join(' ; ')})` : '';
        A().undoToast(i18n(r.event_ids?.length ? '＋ Source et événement « à vérifier » ajoutés à sa fiche{extra}' : '＋ Source « à vérifier » ajoutée à sa fiche{extra}', {extra}), {undo: async () => {
            await post('ou_chercher_openarch_undo', {batch: r.batch});
            const m = {...st.res.marks}; delete m[key]; st.res.marks = m; repaint(body);
        }});
    }
    async function unadd(body, key) {
        const view = BODY.get(body); const st = stateOf(view); const m = st.res?.marks?.[key]; if (!m?.batch) return;
        try { await post('ou_chercher_openarch_undo', {batch: m.batch}); } catch (e) { A().toast(e.message, 'error'); return; }
        const mm = {...st.res.marks}; delete mm[key]; st.res.marks = mm; repaint(body);
        A().toast(i18n('Ajout retiré de sa fiche.'), 'success');
    }
    async function mark(body, key, verdict) {
        const view = BODY.get(body); const st = stateOf(view);
        try { const r = await post('ou_chercher_openarch_mark', {person_id: view.pid, key, verdict}); if (r?.error) throw new Error(r.error); } catch (e) { A().toast(e.message, 'error'); return; }
        const set = v => { const mm = {...(st.res.marks || {})}; if (v) mm[key] = {verdict: v}; else delete mm[key]; st.res.marks = mm; repaint(body); };
        set(verdict);
        if (verdict === 'no') A().undoToast(i18n('✗ Écarté : ce n’est pas cette personne.'), {undo: async () => { await post('ou_chercher_openarch_mark', {person_id: view.pid, key, verdict: ''}); set(''); }});
    }

    /* ═════════════════════ branchement sur la page ═════════════════════ */
    function afterRedraw(view, body) {
        if (!view?.res || !body) return;
        BODY.set(body, view);
        loadKin(body);
        const facts = body.querySelector('.ouc-facts');
        const html = `<div class="ouc-plus" data-ouc-plus>${planHtml(view)}${guidesHtml(view)}${oaHtml(view)}</div>`;
        if (facts) facts.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
        if (!body.dataset.oucPlusWired) { body.dataset.oucPlusWired = '1'; wire(body); }
    }
    function wire(body) {
        body.addEventListener('submit', e => { const f = e.target.closest?.('[data-oa-form]'); if (!f) return; e.preventDefault(); const st = stateOf(BODY.get(body)); readForm(f, st); search(body); });
        body.addEventListener('toggle', e => {
            const t = e.target;
            if (t.matches?.('[data-ouc-oa]')) { const v = BODY.get(body); if (v) stateOf(v).open = t.open; }
            if (t.matches?.('[data-ouc-guides]')) lsSet('genealogie-ouc-registres', t.open ? '1' : '0');
            if (t.matches?.('[data-oa-nolist]')) { const v = BODY.get(body); if (v) stateOf(v).showNo = t.open; }
        }, true);
        body.addEventListener('click', e => {
            const t = e.target;
            if (t.closest('[data-ouc-plan-all]')) { lsSet('genealogie-ouc-plan-tout', lsGet('genealogie-ouc-plan-tout', '0') === '1' ? '0' : '1'); BODY.get(body)?.redraw?.(); return; }
            if (t.closest('[data-oa-jump]')) { const sec = body.querySelector('[data-ouc-oa]'); if (sec) { sec.open = true; stateOf(BODY.get(body)).open = true; sec.scrollIntoView({block: 'start', behavior: 'smooth'}); sec.querySelector('[data-oa-go]')?.focus(); } return; }
            if (!sectionOf(t)) return;
            const st = stateOf(BODY.get(body));
            if (t.closest('[data-oa-fresh]')) { search(body, {fresh: true, start: st.res?.query?.start || 0}); return; }
            if (t.closest('[data-oa-next]')) { search(body, {start: (st.res?.query?.start || 0) + 100}); return; }
            const row = t.closest('[data-oa-key]'); if (!row) return;
            const key = row.dataset.oaKey;
            if (t.closest('[data-oa-persons]')) { toggleRec(body, key); return; }
            if (t.closest('[data-oa-no]')) { mark(body, key, 'no'); return; }
            if (t.closest('[data-oa-unno]')) { mark(body, key, ''); return; }
            if (t.closest('[data-oa-unadd]')) { unadd(body, key); return; }
            const b = t.closest('[data-oa-add]');
            if (b) {
                e.preventDefault();
                const items = [{icon: '📚', label: i18n('Ajouter comme source (à vérifier)'), run: () => add(body, key, 'source')},
                    {icon: '🗓', label: i18n('Ajouter comme source et événement à vérifier'), run: () => add(body, key, 'event')}];
                if (UI().menuAt) UI().menuAt(b, items, {title: i18n('Ajouter à sa fiche')}); else add(body, key, 'source');
            }
        });
    }
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push(afterRedraw);
    oc.plus = {planHtml, guidesHtml, oaHtml, search, stateOf};
})();
