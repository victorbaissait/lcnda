/* LCNDA — 🧭 Je veux… : les écrans (maquette validée docs/design/je-veux.html). Chargé à la demande par app-je-veux.js.
 *  - Recherche → « 🧭 Je veux faire… » : la grande case, des exemples, ⭐ Mes buts et 🕘 récents, « ✓ Ce que j'ai compris » (les
 *    pastilles de Données → question, qu'on touche pour corriger : les réponses se reclassent), « C'est bien ça ? » seulement quand
 *    l'app n'est pas sûre, 1 à 3 réponses (▶ M'y emmener · 👣 Montre-moi · ☆), « Autres idées », ✎ Reformuler, 📖 FAQ,
 *    🤖 Reformuler avec l'IA de l'ordinateur (si installée et allumée, seulement quand rien ne va) ; « 🗂 Tout parcourir » : toutes
 *    les intentions, par famille, avec une case pour filtrer.
 *  - ⌘K : les buts en tête (▶ et 👣 sur la ligne), la ligne « Ce que j'ai compris » au-dessus.
 *  - ▶ M'y emmener ouvre le bon écran avec les choix déjà mis, mais ne clique jamais le dernier bouton (imprimer, fusionner,
 *    envoyer, supprimer) ; 👣 Montre-moi : la bulle et le halo de la visite guidée (app-visite.js), sur les vrais boutons,
 *    tout seul la première fois pour chaque but (réglage), avec « ▶ Fais-le pour moi » (même règle).
 *  - Mode consultation : ce qui modifie est grisé, avec la raison ; 👣 reste possible.
 *  - Listes → « 🧭 Tout ce que l'app sait faire » (barre de liste H10, tableau) ; Réglages → « 🧭 Je veux… ». */
(function () {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const JV = () => ext.jeVeux;
    const E = () => ext.jeVeuxEngine;
    const S = () => A().state || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let REG = [], REG_AT = 0;
    const reg = () => { if (!REG.length || Date.now() - REG_AT > 4000) { REG = E().build({t: T}); REG_AT = Date.now(); } return REG; };
    const byId = id => reg().find(i => i.id === id);
    const famOrder = Object.keys(E().FAM);
    const coll = new Intl.Collator(document.documentElement.lang || 'fr', {sensitivity: 'base'});
    const sorted = list => [...list].sort((a, b) => famOrder.indexOf(a.fam) - famOrder.indexOf(b.fam) || coll.compare(a.nameT, b.nameT));
    const EX = ['imprimer un arbre pour mamie', 'trouver qui était témoin au mariage de Jean', 'fusionner deux lieux', 'faire un diagramme des métiers', 'mettre les séismes près de chez nous dans une fiche', 'envoyer une liste à mon cousin', 'savoir si un ancêtre a fait la guerre'];

    /* ═════ lire la phrase, avec les personnes et les lieux de la base ═════ */
    const memo = new Map();
    async function understand(q) {
        const key = E().fold(q).trim();
        if (memo.has(key)) return structuredClone(memo.get(key));
        const u = E().analyse(q, reg());
        if (u.nameWords.length) {
            const find = async (kind, text, limit) => { try { const r = await A().api('picker_search', {kind, q: text, limit}); return (r.groups || []).flatMap(g => g.items || []).filter(x => x && Number(x.id)).map(x => ({id: Number(x.id), title: String(x.title || ''), short: String(x.short || x.meta || '')})); } catch (_) { return []; } };
            let people = await find('person', u.nameWords.join(' '), 6);
            if (!people.length && u.nameWords.length > 1) for (const w of u.nameWords) { if (w.length < 3) continue; people = await find('person', w, 6); if (people.length) break; }
            if (people.length) E().applyPeople(u, people);
            const left = u.nameWords.filter(w => w.length >= 3);
            if (left.length) { const pl = (await find('place', left.join(' '), 1))[0]; if (pl) E().applyPlace(u, {id: pl.id, title: pl.title.replace(/\s*\(.*\)$/, '')}); }
        }
        memo.set(key, structuredClone(u)); if (memo.size > 60) memo.delete(memo.keys().next().value);
        return u;
    }

    /* ═════ historique, ⭐, souvent fait ici ═════ */
    function record(it, u) {
        const s = JV().settings(), h = JV().hist();
        if (s.hist && u?.q) h.recent = [{q: u.q, id: it.id, name: it.nameT, icon: it.icon, at: Date.now()}, ...h.recent.filter(r => E().fold(r.q) !== E().fold(u.q))].slice(0, 20);
        h.count[it.id] = (Number(h.count[it.id]) || 0) + 1;
        JV().saveHist(h);
    }
    const isFav = id => JV().hist().fav.some(f => f.id === id);
    function toggleFav(it, u) {
        const h = JV().hist();
        if (h.fav.some(f => f.id === it.id)) h.fav = h.fav.filter(f => f.id !== it.id);
        else h.fav.unshift({id: it.id, name: it.nameT, icon: it.icon, q: u?.q || it.nameT});
        JV().saveHist(h);
        return isFav(it.id);
    }

    /* ═════ ▶ M'y emmener : le bon écran, les choix mis ; le dernier bouton reste à toi ═════ */
    const ctxOf = u => ({u, q: u?.q || '', question: u?.q || '', person: u?.whoP || null, place: u?.where?.title ? u.where : null, when: u?.when || ''});
    async function go(it, u, {fromGuide = false} = {}) {
        if (!it) return;
        if (kiosk() && !it.ro) { toast(T('En consultation : on regarde, on ne change rien.')); return; }
        record(it, u);
        document.getElementById('quick-search')?.remove();
        try { await it.go?.(ctxOf(u)); } catch (e) { console.error(e); toast(T('Je n’ai pas pu ouvrir cet écran.'), 'error'); return; }
        const s = JV().settings(), h = JV().hist();
        const auto = !fromGuide && (s.show === 'always' || (s.show === 'first' && !h.seen[it.id]));
        if (auto) { await sleep(500); return show(it, u, {auto: true}); }
        if (it.last) toast(T('✓ C’est ici. Vérifie les choix, puis clique toi-même « {x} ».', {x: it.last}));
    }

    /* ═════ 👣 Montre-moi : la bulle de la visite guidée, sur les vrais boutons ═════ */
    const fold = s => E().fold(E().strip(s)).trim();
    const visible = el => { if (!el || !el.isConnected || el.closest('[hidden]')) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
    function findText(label, scopes) {
        const want = fold(label); if (!want) return null;
        const pool = scopes.flatMap(sc => [...document.querySelectorAll(`${sc} button, ${sc} a, ${sc} summary, ${sc} [role="tab"], ${sc} [data-side-value]`)]).filter(visible);
        return pool.find(el => fold(el.textContent) === want) || pool.find(el => fold(el.textContent).startsWith(want)) || pool.find(el => want.length > 3 && fold(el.textContent).includes(want)) || null;
    }
    function guideSteps(it, u) {
        const st = E().steps(it, T), n = st.length, ctx = ctxOf(u);
        const topBtn = label => { const sym = String(label).trim().split(/\s/)[0]; return [...document.querySelectorAll('.topbar-meta > button, .topbar-meta > a')].filter(visible).find(b => (b.textContent || '').includes(sym)) || null; };
        return st.map((s, i) => {
            const label = it.path[i] || '';
            let go = null, find;
            if (i === 0) find = () => (it.module ? document.querySelector(`.main-nav .nav-item[data-module="${CSS.escape(it.module)}"]`) : null) || findText(label, ['.main-nav', '.topbar']) || (/^barre du haut$/i.test(fold(label)) ? document.querySelector('.topbar-meta') : null);
            else {
                if (i === 1 && it.module) go = async () => { if (S().module !== it.module) { const keep = {maintenanceTab: S().maintenanceTab, listType: S().listType}; await A().setModule?.(it.module); void keep; } };
                if (i === Math.min(2, n - 1) || (i === n - 1 && !it.module)) go = async () => { try { await it.go?.(ctx); } catch (_) {} };
                find = () => (/^barre du haut$/i.test(fold(it.path[0])) ? topBtn(label) : null) || findText(label, ['#sidebar-content', '#workspace', 'dialog[open]', '.topbar']);
            }
            return {id: `jv-${it.id}-${i}`, icon: '👣', title: s.title, text: s.text, go, targets: [find]};
        });
    }
    function show(it, u, {auto = false} = {}) {
        if (!it) return;
        document.getElementById('quick-search')?.remove();
        const h = JV().hist(); h.seen[it.id] = 1; JV().saveHist(h);
        const ok = ext.tour?.guide?.({steps: guideSteps(it, u), hint: `${T('Pour :')} ${it.icon} ${it.nameT}`, doIt: kiosk() && !it.ro ? null : () => go(it, u, {fromGuide: true}), doLabel: T('▶ Fais-le pour moi'), auto});
        if (!ok) toast(T('👣 Je ne peux pas montrer le chemin ici. Le chemin : {p}', {p: it.pathT.join(' › ')}));
    }

    /* ═════ « ✓ Ce que j'ai compris » : les pastilles (comme Données → question) ═════ */
    const ACT = k => E().ACTS[k], OBJ = k => E().OBJS[k], POUR = k => E().POUR[k];
    const whoTxt = u => u.whoP ? `👤 ${u.whoP.title}` : u.who === 'anc' ? `👤 ${T('tes ancêtres (Sosa)')}` : u.whoCands.length ? `👤 ${T('{x} ? ({n} fiches)', {x: u.whoCands[0].title.split(' ')[0], n: u.whoCands.length})}` : `👤 ${T('la personne de départ')}`;
    function sayHtml(u, top) {
        const p = [u.act ? `<b>${esc(T(ACT(u.act)[1]))}</b>` : `<b>?</b> ${esc(T('(que faire)'))}`];
        u.objs.slice(0, 3).forEach(o => p.push(esc(T(OBJ(o)[1]))));
        if (u.into) p.push(esc(T('dans {x}', {x: T(OBJ(u.into)[1])})));
        if (u.whoP) p.push(esc(T('de {x}', {x: u.whoP.title}))); else if (u.who === 'anc') p.push(esc(T('pour tes ancêtres'))); else if (u.whoCands.length) p.push(esc(T('de {x} (lequel ?)', {x: u.whoCands[0].title.split(' ')[0]})));
        else if (top?.needs?.person) p.push(`${esc(T('de la personne de départ'))}`);
        if (u.where?.title) p.push(esc(T('près de {x}', {x: u.where.title}))); else if (u.whereAuto) p.push(`${esc(T('près de chez toi'))} <span class="muted">(${esc(T('les lieux de la famille'))})</span>`);
        if (u.when) p.push(esc(u.when));
        if (u.pour) p.push(`${esc(T('pour {x}', {x: T(POUR(u.pour)[1])}))} <span class="muted">(${esc(T(POUR(u.pour)[2]))})</span>`);
        return p.join(' · ');
    }
    function pillsHtml(u, top, open) {
        const pill = (k, lab, val, isAuto = false) => `<button type="button" class="dr-pill${isAuto ? ' is-auto' : ''}${u.chg[k] ? ' is-chg' : ''}${open === k ? ' is-open' : ''}" data-jv-pill="${k}" aria-expanded="${open === k}"><em>${esc(T(lab))}</em> <span>${esc(val)}</span></button>`;
        const out = [pill('act', 'Action', u.act ? `${ACT(u.act)[0]} ${T(ACT(u.act)[1])}` : T('— à choisir')), pill('obj', 'Quoi', u.objs[0] ? `${OBJ(u.objs[0])[0]} ${T(OBJ(u.objs[0])[1])}` : T('— à choisir'))];
        if (u.into) out.push(pill('into', 'Dans', `${OBJ(u.into)[0]} ${T(OBJ(u.into)[1])}`));
        if (u.who || top?.needs?.person) out.push(pill('who', 'Qui', whoTxt(u), !u.who));
        if (u.where) out.push(pill('where', 'Où', `📍 ${u.where.title || T('les lieux de la famille')}`, u.whereAuto));
        if (u.when) out.push(pill('when', 'Quand', `📅 ${u.when}`));
        if (u.pour) out.push(pill('pour', 'Pour', `${POUR(u.pour)[0]} ${T(POUR(u.pour)[1])}`));
        return out.join('');
    }
    function popHtml(u, k) {
        if (!k) return '';
        const opts = (list, cur, key) => `<div class="jv-opts">${list.map(([v, l]) => `<button type="button" class="jv-k" data-jv-set="${key}" data-v="${esc(v)}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('')}</div>`;
        const x = `<div class="dr-pop-act"><button type="button" class="button small secondary" data-jv-popx>${esc(T('Fermer'))}</button></div>`;
        const P = (title, body) => `<div class="dr-pop jv-pop" data-jv-pop><b>${esc(T(title))}</b>${body}${x}</div>`;
        if (k === 'act') return P('Action', opts(Object.entries(E().ACTS).map(([v, a]) => [v, `${a[0]} ${T(a[1])}`]), u.act, 'act'));
        if (k === 'obj') return P('Quoi', opts([...Object.entries(E().OBJS).map(([v, a]) => [v, `${a[0]} ${T(a[1])}`]), ['', T('— rien de précis')]], u.objs[0] || '', 'obj'));
        if (k === 'into') return P('Dans', opts([['fiche', `📒 ${T('une fiche')}`], ['panier', `🧺 ${T('un panier')}`], ['', T('— nulle part')]], u.into, 'into'));
        if (k === 'who') return P('Qui', `<div class="jv-pk" data-jv-pk="who">${window.LCNDA_PICKER?.pickerField?.({name: '', kind: 'person', allowCreate: false, placeholder: T('Prénom NOM')}) || ''}</div>${opts([...u.whoCands.map(p => [String(p.id), `👤 ${p.title}${p.short ? ` · ${p.short}` : ''}`]), ['anc', `🌳 ${T('tes ancêtres (Sosa)')}`], ['', T('la personne de départ')]], u.whoP ? String(u.whoP.id) : u.who === 'anc' ? 'anc' : '', 'who')}`);
        if (k === 'where') return P('Où', `<div class="jv-pk" data-jv-pk="where">${window.LCNDA_PICKER?.pickerField?.({name: '', kind: 'place', allowCreate: false}) || ''}</div>${opts([['', T('partout')]], '', 'where')}`);
        if (k === 'when') { const [a, b] = String(u.when || '').split(' → '); return P('Quand', `<label>${esc(T('de'))} <input type="number" data-jv-y1 value="${esc(a || '')}" aria-label="${esc(T('De'))}"> ${esc(T('à'))} <input type="number" data-jv-y2 value="${esc(b || a || '')}" aria-label="${esc(T('À'))}"> <button type="button" class="button small" data-jv-when>OK</button></label><small class="muted">${esc(T('Vide : toutes les années.'))}</small>`); }
        if (k === 'pour') return P('Pour', opts([...Object.entries(E().POUR).map(([v, a]) => [v, `${a[0]} ${T(a[1])} — ${T(a[2])}`]), ['', T('personne en particulier')]], u.pour, 'pour'));
        return '';
    }
    function altsHtml(u, r) {
        if (u.whoCands.length > 1 && !u.chg.who) return `<div class="jv-alt" data-jv-homo><span>${esc(T('{n} fiches portent ce nom : lequel ?', {n: u.whoCands.length}))}</span>${u.whoCands.map(p => `<button type="button" class="jv-k" data-jv-set="who" data-v="${p.id}">👤 ${esc(p.title)}${p.short ? ` <small>${esc(p.short)}</small>` : ''}</button>`).join('')}</div>`;
        const seen = new Set([`${u.act}|${u.objs[0] || ''}`]), alts = [], floor = (r[0]?.s || 0) * 0.6;
        r.slice(1, 10).filter(x => x.s >= floor).forEach(({it}) => { const a = it.act[0], o = it.obj[0] || ''; const key = `${a}|${o}`; if (!a || !o || seen.has(key) || alts.length >= 3) return; seen.add(key); alts.push([a, o]); });
        if (!alts.length) return '';
        return `<div class="jv-alt"><span>${esc(T('Ce n’est pas ça ? Reformule, ou choisis :'))}</span>${alts.map(([a, o]) => `<button type="button" class="jv-k" data-jv-alt="${a}|${o}">${esc(ACT(a)[0])} ${esc(T(ACT(a)[1]))} · ${esc(T(OBJ(o)[1]))}</button>`).join('')}</div>`;
    }
    function undHtml(u, r, open, confirmed, compact = false) {
        const conf = E().confidence(u, r), low = conf === 'low' && !confirmed, top = r[0]?.it;
        return `<div class="dr-und jv-und${low ? ' is-low' : ''}" data-jv-und><h4>${low ? esc(T('? Ce que j’ai compris')) : esc(T('✓ Ce que j’ai compris'))} <small>${esc(T('touche une pastille pour la changer'))}</small></h4>
            <p class="jv-say"><span class="jv-ok">${low ? '' : '✓'}</span>${esc(T('Tu veux :'))} ${sayHtml(u, top)}</p>
            <div class="dr-pills">${pillsHtml(u, top, open)}</div>${compact ? '' : popHtml(u, open)}
            ${u.fixed.length ? `<p class="dr-why" data-jv-fixed>${esc(T('J’ai corrigé : {x}', {x: u.fixed.join(', ')}))}</p>` : ''}${u.unread.length || u.nameWords.length ? `<p class="dr-why" data-jv-unread>${esc(T('Je n’ai pas tenu compte de : {x}', {x: [...u.nameWords, ...u.unread].join(', ')}))}</p>` : ''}
            ${low ? `<div class="jv-confirm" data-jv-confirm><b>${esc(T('C’est bien ça ?'))}</b><button type="button" class="button small" data-jv-yes>${esc(T('Oui, montre les réponses'))}</button><button type="button" class="button small secondary" data-jv-fix>${esc(T('Corriger'))}</button></div>` : ''}
            ${compact ? '' : altsHtml(u, r)}</div>`;
    }

    /* ═════ une réponse ═════ */
    const pathHtml = it => `<div class="jv-path" aria-label="${esc(T('Où c’est'))}">${it.pathT.map((s, i) => `${i ? '<i aria-hidden="true">›</i>' : ''}<span${i === it.pathT.length - 1 ? ' class="on"' : ''}>${esc(s)}</span>`).join('')}</div>`;
    const actsHtml = (it, small = true) => { const ro = kiosk() && !it.ro, fav = isFav(it.id);
        return `<button type="button" class="button${small ? ' small' : ''}" data-jv-go="${esc(it.id)}"${ro ? ` disabled title="${esc(T('En consultation : on regarde, on ne change rien.'))}"` : ''}>▶ ${esc(T('M’y emmener'))}</button><button type="button" class="button${small ? ' small' : ''} secondary" data-jv-show="${esc(it.id)}">👣 ${esc(T('Montre-moi'))}</button><span class="jv-sp"></span><button type="button" class="jv-star${fav ? ' on' : ''}" data-jv-fav="${esc(it.id)}" aria-pressed="${fav}" title="${esc(T('⭐ Mes buts'))}" aria-label="${esc(fav ? T('Retirer de mes buts') : T('Ajouter à mes buts'))}">${fav ? '★' : '☆'}</button>`; };
    function cardHtml(it, u, best) {
        const pre = E().pre(it, u, T), ro = kiosk() && !it.ro;
        return `<article class="jv-ma${best ? ' best' : ''}${ro ? ' is-ro' : ''}" data-jv-card="${esc(it.id)}"><div class="jv-ma-ic" aria-hidden="true">${esc(it.icon)}</div><div class="jv-ma-b">
            <h3>${esc(it.nameT)}${best ? `<span class="ui-badge is-blue">${esc(T('le plus proche'))}</span>` : ''}${it.ro ? '' : `<span class="ui-badge is-grey">${esc(T('modifie'))}</span>`}</h3>
            <p class="jv-what">${esc(it.doesT)}</p>${pathHtml(it)}
            ${pre.length ? `<div class="jv-pre"><span class="lbl">${esc(T('✓ Prêt pour toi :'))}</span>${pre.map(x => `<span class="jv-k is-static">${esc(x)}</span>`).join('')}</div>` : ''}</div>
            <div class="jv-ma-acts">${actsHtml(it)}</div>${ro ? `<p class="jv-ma-ro">🔒 ${esc(T('En consultation : on regarde, on ne change rien. 👣 Montre-moi reste possible.'))}</p>` : ''}</article>`;
    }

    /* ═════ Recherche → 🧭 Je veux faire… ═════ */
    const P = {q: '', u: null, r: [], open: '', confirmed: false, browse: false, fam: '', filter: '', token: 0, seq: 0};
    const live = token => token === S().workspaceToken && S().module === 'recherche' && S().researchKind === 'je_veux';
    async function page(token) {
        if (!live(token)) return;
        const ws = document.getElementById('workspace'); if (!ws) return;
        P.token = token;
        if (S().jeVeuxQ != null && S().jeVeuxQ !== '') { P.q = S().jeVeuxQ; P.browse = false; P.u = null; P.open = ''; P.confirmed = false; }
        S().jeVeuxQ = '';
        if (S().jeVeuxBrowse) { P.browse = true; P.fam = S().jeVeuxBrowse === true ? '' : String(S().jeVeuxBrowse); S().jeVeuxBrowse = null; }
        const h = JV().hist();
        ws.innerHTML = `<section class="page jv-page" data-jv-page>${UI().pageHeader({where: T('Recherche'), icon: '🧭', title: T('Que veux-tu faire ?'), help: esc(T('Écris ton but avec tes mots. L’app cherche parmi tout ce qu’elle sait faire, et t’y emmène.')),
            actions: [`<button type="button" class="button secondary" data-jv-browse aria-pressed="${P.browse}">🗂 ${esc(T('Tout parcourir'))}</button>`]})}
            ${kiosk() ? `<div class="jv-kiosk" role="status">🔒 ${esc(T('Mode consultation : le guide montre et emmène vers ce qui se regarde ; ce qui modifie est grisé.'))}</div>` : ''}
            <div data-jv-ask-zone${P.browse ? ' hidden' : ''}>
              <form class="jv-ask jv-ask-big" data-jv-ask role="search"><input type="search" name="q" value="${esc(P.q)}" placeholder="${esc(T('Par exemple : imprimer un arbre pour mamie'))}" aria-label="${esc(T('Que veux-tu faire ?'))}" autocomplete="off" spellcheck="false"><button type="submit" class="button">🧭 ${esc(T('Trouver'))}</button></form>
              <div class="jv-chips jv-ex"><span class="lbl">${esc(T('Par exemple'))}</span>${EX.map(x => `<button type="button" class="jv-k" data-jv-q="${esc(x)}">${esc(T(x))}</button>`).join('')}</div>
              <div class="jv-chips jv-rec" data-jv-rec>${recHtml(h)}</div>
              <div data-jv-und-zone></div><div class="jv-ms" data-jv-res aria-live="polite"></div><div class="jv-chips jv-others" data-jv-others></div><div class="jv-nomatch" data-jv-nomatch></div>
            </div>
            <div data-jv-cat-zone${P.browse ? '' : ' hidden'}></div></section>`;
        const root = ws.querySelector('[data-jv-page]');
        bindPage(root);
        if (P.browse) paintCatalog(root); else if (P.q) await run(P.q, root, {keep: !!P.u}); else root.querySelector('[data-jv-ask] input')?.focus();
    }
    function recHtml(h) {
        const s = JV().settings();
        const favs = h.fav.slice(0, 6).map(f => `<button type="button" class="jv-k" data-jv-goid="${esc(f.id)}" data-jv-gq="${esc(f.q || '')}">${esc(f.icon || '')} ${esc(f.name)}</button>`).join('');
        const rec = s.hist ? h.recent.slice(0, 4).map(r => `<button type="button" class="jv-k" data-jv-q="${esc(r.q)}">${esc(r.q)}</button>`).join('') : '';
        const oft = s.often ? Object.entries(h.count).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => byId(id)).filter(Boolean).map(it => `<button type="button" class="jv-k" data-jv-pick="${esc(it.id)}">${esc(it.icon)} ${esc(it.nameT)}</button>`).join('') : '';
        return `${favs ? `<span class="lbl">⭐ ${esc(T('Mes buts'))}</span>${favs}` : ''}${rec ? `<span class="lbl">🕘 ${esc(T('Récents'))}</span>${rec}` : ''}${oft ? `<span class="lbl">📈 ${esc(T('Souvent fait ici'))}</span>${oft}` : ''}`;
    }
    async function run(q, root, {keep = false} = {}) {
        const seq = ++P.seq;
        P.q = String(q || '').trim();
        if (!keep) { P.open = ''; P.confirmed = false; P.u = null; const u = P.q ? await understand(P.q) : null; if (seq !== P.seq) return; P.u = u; }
        if (seq !== P.seq || !root.isConnected) return;
        paint(root);
    }
    function paint(root) {
        const s = JV().settings(), u = P.u, zoneU = root.querySelector('[data-jv-und-zone]'), res = root.querySelector('[data-jv-res]'), oth = root.querySelector('[data-jv-others]'), nm = root.querySelector('[data-jv-nomatch]');
        if (!P.q || !u) { zoneU.innerHTML = res.innerHTML = oth.innerHTML = nm.innerHTML = ''; return; }
        const r = E().rank(u, reg()); P.r = r;
        const conf = E().confidence(u, r), low = conf === 'low' && !P.confirmed;
        zoneU.innerHTML = conf !== 'none' ? undHtml(u, r, P.open, P.confirmed) : '';
        res.innerHTML = conf === 'none' ? `<div class="jv-empty"><b>${esc(T('Je n’ai pas trouvé ce que tu veux faire.'))}</b>${esc(T('Essaie avec d’autres mots, un verbe (« imprimer », « trouver », « envoyer »…), ou regarde la FAQ.'))}</div>` : low ? '' : r.slice(0, s.n).map((x, i) => cardHtml(x.it, u, i === 0)).join('');
        const others = low || conf === 'none' ? [] : r.slice(s.n, s.n + 5);
        oth.innerHTML = others.length ? `<span class="lbl">${esc(T('Autres idées'))}</span>${others.map(({it}) => `<button type="button" class="jv-k" data-jv-pick="${esc(it.id)}">${esc(it.icon)} ${esc(it.nameT)}</button>`).join('')}` : '';
        const aiOk = s.ia && aiInstalled() && conf === 'none';
        nm.innerHTML = `<span class="lbl">${esc(T('Ça ne correspond pas ?'))}</span><button type="button" class="button small secondary" data-jv-refocus>✎ ${esc(T('Reformuler'))}</button><button type="button" class="button small secondary" data-jv-faq>📖 ${esc(T('Voir la FAQ'))}</button>${aiOk ? `<button type="button" class="button small secondary" data-jv-ai>🤖 ${esc(T('Reformuler avec l’IA de l’ordinateur'))}</button><span class="muted small">${esc(T('rien ne part sur Internet'))}</span>` : ''}`;
    }
    const aiInstalled = () => !!(ext.assistantIA && (ext.assistantIA.settings?.().mode === 'local'));
    function correct(e, u, rerender) {
        let t;
        if ((t = e.target.closest('[data-jv-pill]'))) { P.open = P.open === t.dataset.jvPill ? '' : t.dataset.jvPill; rerender(); return true; }
        if (e.target.closest('[data-jv-popx]')) { P.open = ''; rerender(); return true; }
        if ((t = e.target.closest('[data-jv-set]'))) {
            const k = t.dataset.jvSet, v = t.dataset.v;
            if (k === 'who') E().set(u, 'who', v === 'anc' ? 'anc' : v ? (u.whoCands.find(p => String(p.id) === v) || {id: Number(v), title: t.textContent.replace(/^👤\s*/, '').split(' · ')[0].trim()}) : null);
            else if (k === 'where') E().set(u, 'where', null);
            else E().set(u, k, v);
            if (k === 'act' || k === 'obj' || k === 'who') P.confirmed = true;
            P.open = ''; rerender(); return true;
        }
        if ((t = e.target.closest('[data-jv-alt]'))) { const [a, o] = t.dataset.jvAlt.split('|'); E().set(u, 'act', a); E().set(u, 'obj', o); P.confirmed = true; rerender(); return true; }
        if (e.target.closest('[data-jv-when]')) { const pop = e.target.closest('[data-jv-pop]'); const a = pop.querySelector('[data-jv-y1]').value.trim(), b = pop.querySelector('[data-jv-y2]').value.trim(); E().set(u, 'when', a && b && a !== b ? `${a} → ${b}` : a || b); P.open = ''; rerender(); return true; }
        if (e.target.closest('[data-jv-yes]')) { P.confirmed = true; rerender(); return true; }
        if (e.target.closest('[data-jv-fix]')) { P.open = !u.act ? 'act' : !u.objs.length ? 'obj' : u.whoCands.length ? 'who' : 'act'; rerender(); return true; }
        return false;
    }
    function bindPage(root) {
        const input = () => root.querySelector('[data-jv-ask] input');
        let typeT = 0;
        root.querySelector('[data-jv-ask]').addEventListener('submit', e => { e.preventDefault(); clearTimeout(typeT); run(input().value, root); });
        input().addEventListener('input', () => { clearTimeout(typeT); typeT = setTimeout(() => run(input().value, root), 220); });
        root.addEventListener('picker-change', e => {
            const host = e.target.closest('[data-jv-pk]'); const it = e.detail?.item; if (!host || !it || it.free || !P.u) return;
            if (host.dataset.jvPk === 'who') { E().set(P.u, 'who', {id: Number(it.id), title: String(it.title || it.name || ''), short: String(it.short || '')}); P.confirmed = true; }
            else E().set(P.u, 'where', {id: Number(it.id), title: String(it.name || it.title || '')});
            P.open = ''; paint(root);
        });
        root.addEventListener('click', e => {
            if (P.u && correct(e, P.u, () => paint(root))) return;
            let t;
            if ((t = e.target.closest('[data-jv-q]'))) { input().value = t.dataset.jvQ; run(t.dataset.jvQ, root); return; }
            if ((t = e.target.closest('[data-jv-pick]'))) { const it = byId(t.dataset.jvPick); if (it) { if (!P.u) P.u = E().analyse('', reg()); P.r = [{it, s: 99}, ...P.r.filter(x => x.it !== it)]; root.querySelector('[data-jv-res]').innerHTML = cardHtml(it, P.u, true); root.querySelector('[data-jv-res]').scrollIntoView({block: 'nearest'}); } return; }
            if ((t = e.target.closest('[data-jv-go]'))) { go(byId(t.dataset.jvGo), P.u); return; }
            if ((t = e.target.closest('[data-jv-goid]'))) { const it = byId(t.dataset.jvGoid); if (it) { input().value = t.dataset.jvGq || ''; run(t.dataset.jvGq || it.nameT, root).then(() => { root.querySelector('[data-jv-res]').innerHTML = cardHtml(it, P.u || E().analyse('', reg()), true); }); } return; }
            if ((t = e.target.closest('[data-jv-show]'))) { show(byId(t.dataset.jvShow), P.u); return; }
            if ((t = e.target.closest('[data-jv-fav]'))) { const it = byId(t.dataset.jvFav); if (!it) return; const on = toggleFav(it, P.u); t.classList.toggle('on', on); t.setAttribute('aria-pressed', String(on)); t.textContent = on ? '★' : '☆'; root.querySelector('[data-jv-rec]').innerHTML = recHtml(JV().hist()); toast(on ? T('⭐ Ajouté à mes buts') : T('Retiré de mes buts')); return; }
            if (e.target.closest('[data-jv-refocus]')) { input().focus(); input().select(); return; }
            if (e.target.closest('[data-jv-faq]')) { UI().openFaq?.(P.q); return; }
            if (e.target.closest('[data-jv-ai]')) { aiRephrase(root); return; }
            if (e.target.closest('[data-jv-browse]')) { P.browse = !P.browse; root.querySelector('[data-jv-browse]').setAttribute('aria-pressed', String(P.browse)); root.querySelector('[data-jv-ask-zone]').hidden = P.browse; root.querySelector('[data-jv-cat-zone]').hidden = !P.browse; if (P.browse) paintCatalog(root); return; }
            if ((t = e.target.closest('[data-jv-fam]'))) { P.fam = t.dataset.jvFam; paintCatalog(root); }
        });
    }
    async function aiRephrase(root) {
        const b = root.querySelector('[data-jv-ai]'); if (b) { b.disabled = true; b.textContent = `🤖 ${T('L’IA réfléchit…')}`; }
        try {
            const names = reg().filter(i => i.src === 'main').map(i => i.nameT).slice(0, 80);
            const r = await A().api('aia_rephrase', {}, {method: 'POST', body: {q: P.q, names: JSON.stringify(names)}});
            const text = String((r?.result || r)?.text || '').trim();
            if (!text) throw new Error(T('L’IA n’a rien proposé.'));
            toast(T('🤖 L’IA de l’ordinateur propose : « {x} »', {x: text}));
            root.querySelector('[data-jv-ask] input').value = text; await run(text, root);
        } catch (e) { toast(e.message || String(e), 'error'); if (b) { b.disabled = false; b.textContent = `🤖 ${T('Reformuler avec l’IA de l’ordinateur')}`; } }
    }

    /* ═════ 🗂 Tout parcourir : toutes les intentions, par famille ═════ */
    function paintCatalog(root) {
        const zone = root.querySelector('[data-jv-cat-zone]'); if (!zone) return;
        const all = sorted(reg()), FAM = E().FAM;
        const count = k => all.filter(i => i.fam === k).length;
        if (!zone.querySelector('[data-jv-catq]')) {
            zone.innerHTML = `<div class="jv-cat-top"><div class="jv-chips jv-fams" data-jv-fams role="group" aria-label="${esc(T('Familles'))}"></div><input type="search" class="jv-catq" data-jv-catq placeholder="${esc(T('Filtrer : un mot, un écran, un outil…'))}" aria-label="${esc(T('Filtrer les intentions'))}" value="${esc(P.filter)}"></div><p class="muted small" data-jv-catn></p><div class="jv-cat" data-jv-cat></div>`;
            zone.querySelector('[data-jv-catq]').addEventListener('input', e => { P.filter = e.target.value; paintCatalog(root); });
        }
        zone.querySelector('[data-jv-fams]').innerHTML = `<button type="button" class="jv-k" data-jv-fam="" aria-pressed="${!P.fam}">${esc(T('Toutes'))} <small>${all.length}</small></button>` + Object.entries(FAM).map(([k, [ic, l]]) => `<button type="button" class="jv-k" data-jv-fam="${k}" aria-pressed="${P.fam === k}">${ic} ${esc(T(l))} <small>${count(k)}</small></button>`).join('');
        const words = E().fold(P.filter).split(/\s+/).filter(Boolean);
        const shown = all.filter(i => (!P.fam || i.fam === P.fam) && (!words.length || words.every(w => E().fold(`${i.nameT} ${i.doesT} ${i.pathT.join(' ')} ${i.name} ${i.words}`).includes(w))));
        zone.querySelector('[data-jv-catn]').textContent = T('{n} sur {t} choses que l’app sait faire', {n: shown.length, t: all.length});
        zone.querySelector('[data-jv-cat]').innerHTML = shown.length ? Object.entries(FAM).filter(([k]) => shown.some(i => i.fam === k)).map(([k, [ic, l]]) => `<h3 class="jv-fh">${ic} ${esc(T(l))} <small>· ${shown.filter(i => i.fam === k).length}</small></h3><div class="jv-cgrid">${shown.filter(i => i.fam === k).map(catCard).join('')}</div>`).join('') : `<div class="jv-empty">${esc(T('Rien avec ce filtre.'))}</div>`;
    }
    const catCard = it => `<article class="jv-cc${kiosk() && !it.ro ? ' is-ro' : ''}" data-jv-card="${esc(it.id)}"><span class="jv-cc-ic" aria-hidden="true">${esc(it.icon)}</span><div class="jv-cc-b"><b>${esc(it.nameT)}</b><small>${esc(it.doesT)}</small>${pathHtml(it)}</div><div class="jv-cc-acts">${actsHtml(it)}</div></article>`;

    /* ═════ ⌘K ═════ */
    const QK = {rows: new Map(), u: null, q: '', confirmed: ''};
    async function cmdkRows(q, dlg) {
        const und = dlg.querySelector('.jv-qk-und');
        const text = String(q || '').trim();
        QK.rows = new Map();
        if (text.length < 4) { if (und) und.hidden = true; return []; }
        const pre = E().analyse(text, reg()), f = E().fold(text).trim();
        // pas de verbe, ou une question (« qui est… », « les enfants de… ») : c'est la recherche de noms et « Poser une question », comme avant
        if (!pre.act || /^(qui|quand|combien|ou|quel|quels|quelle|quelles|les|des|mes|ma|mon)\b/.test(f)) { if (und) und.hidden = true; return []; }
        const u = await Promise.race([understand(text), sleep(1500).then(() => pre)]);
        if (!document.body.contains(dlg) || dlg.querySelector('input')?.value.trim() !== text) return [];
        if (!u.act) { if (und) und.hidden = true; return []; } // pas de verbe : c'est une recherche de noms, comme avant
        const r = E().rank(u, reg()), conf = E().confidence(u, r), confirmed = QK.confirmed === E().fold(text);
        QK.u = u; QK.q = text;
        if (conf === 'none') { if (und) und.hidden = true; return []; }
        if (und) { und.innerHTML = `<p class="jv-qk-sep">🧭 ${esc(T('Ce que tu veux faire'))}</p>${undHtml(u, r, '', confirmed, true)}`; und.hidden = false; }
        if (conf === 'low' && !confirmed) return [];
        const rows = r.slice(0, JV().settings().n).map(({it}) => { const label = `${it.icon} ${it.nameT}`; QK.rows.set(label, it); return {label, hint: it.pathT.join(' › '), go: () => go(it, u)}; });
        const more = `→ ${T('Voir tout dans Recherche → 🧭 Je veux faire…')}`; QK.rows.set(more, null);
        return [...rows, {label: more, hint: T('La page complète'), go: () => JV().open(text)}];
    }
    function cmdkDecorate(dlg) {
        dlg.querySelectorAll('ul > li[data-qs-index]').forEach(li => {
            if (li.dataset.jvDone) return;
            const lab = li.querySelector('span')?.textContent || '';
            if (!QK.rows.has(lab)) return;
            li.dataset.jvDone = '1'; const it = QK.rows.get(lab); if (!it) { li.classList.add('jv-qk-more'); return; }
            li.dataset.jvId = it.id; li.classList.add('jv-qk-row');
            const ro = kiosk() && !it.ro;
            li.insertAdjacentHTML('beforeend', `<span class="jv-qk-go"><button type="button" class="button small" data-jv-qgo title="${esc(T('M’y emmener'))}" aria-label="${esc(T('M’y emmener'))}"${ro ? ' disabled' : ''}>▶</button><button type="button" class="button small secondary" data-jv-show="${esc(it.id)}" title="${esc(T('Montre-moi'))}" aria-label="${esc(T('Montre-moi'))}">👣</button></span>`);
        });
    }
    function cmdkClick(e, dlg, input) {
        const und = e.target.closest('.jv-qk-und'); if (!und || !QK.u) return false;
        if (e.target.closest('[data-jv-yes]')) { QK.confirmed = E().fold(QK.q); input.dispatchEvent(new Event('input', {bubbles: true})); return true; }
        if (e.target.closest('[data-jv-pill], [data-jv-fix]')) { const pill = e.target.closest('[data-jv-pill]')?.dataset.jvPill || 'act'; const q = QK.q; dlg.remove(); JV().open(q).then(() => { P.open = pill; const root = document.querySelector('[data-jv-page]'); if (root) paint(root); }); return true; }
        return false;
    }

    /* ═════ Listes → 🧭 Tout ce que l'app sait faire ═════ */
    async function listPage(token) {
        const isHere = () => token === S().workspaceToken && S().module === 'listes' && S().listType === 'je_veux';
        const ws = document.getElementById('workspace'); if (!ws || !isHere()) return;
        const FAM = E().FAM;
        ws.innerHTML = `<section class="page jv-list" data-jv-list>${UI().pageHeader({title: T('🧭 Tout ce que l’app sait faire'), help: esc(T('Chaque chose que l’app sait faire, avec son chemin. ▶ y emmène ; Recherche → 🧭 Je veux faire… la trouve avec tes mots.')),
            actions: [`<button type="button" class="button secondary" data-jv-tojv>🧭 ${esc(T('Je veux faire…'))}</button>`]})}<div data-jv-lbar></div><div data-jv-ltable></div></section>`;
        const root = ws.querySelector('[data-jv-list]');
        const bar = UI().listBar({key: 'listes:je_veux', search: {placeholder: T('Chercher… (un mot, un écran, un outil)')},
            filters: [{id: 'fam', label: T('Famille'), type: 'radio', options: [['', T('Toutes')], ...Object.entries(FAM).map(([k, [ic, l]]) => [k, `${ic} ${T(l)}`])], dflt: ''}],
            sort: {options: [['fam', T('Par famille')], ['name', T('Par nom (A → Z)')]], value: 'fam'}, count: {label: 'chose', many: 'choses'}, onChange: () => paintList()});
        root.querySelector('[data-jv-lbar]').appendChild(bar);
        root.querySelector('[data-jv-tojv]').addEventListener('click', () => JV().open(''));
        function paintList() {
            const st = bar.state, words = E().fold(st.q).split(/\s+/).filter(Boolean);
            let rows = reg().filter(i => (!st.filters.fam || i.fam === st.filters.fam) && (!words.length || words.every(w => E().fold(`${i.nameT} ${i.doesT} ${i.pathT.join(' ')} ${i.words}`).includes(w))));
            rows = st.sort === 'name' ? [...rows].sort((a, b) => coll.compare(a.nameT, b.nameT)) : sorted(rows);
            bar.setCount(rows.length, T('chose'), T('choses'));
            root.querySelector('[data-jv-ltable]').innerHTML = rows.length ? `<div class="data-table-wrap"><table class="data-table jv-ltable"><thead><tr><th>${esc(T('Famille'))}</th><th>${esc(T('Nom'))}</th><th>${esc(T('Ce que ça fait'))}</th><th>${esc(T('Chemin'))}</th><th><span class="sr-only">▶</span></th></tr></thead><tbody>${rows.map(i => { const ro = kiosk() && !i.ro;
                return `<tr data-jv-row="${esc(i.id)}"><td>${FAM[i.fam][0]} ${esc(T(FAM[i.fam][1]))}</td><td><b>${esc(i.icon)} ${esc(i.nameT)}</b>${i.ro ? '' : ` <small class="cell-muted">${esc(T('modifie'))}</small>`}</td><td>${esc(i.doesT)}</td><td>${esc(i.pathT.join(' › '))}</td><td class="jv-lact"><button type="button" class="button small" data-jv-go="${esc(i.id)}"${ro ? ` disabled title="${esc(T('En consultation : on regarde, on ne change rien.'))}"` : ''} aria-label="${esc(T('M’y emmener : {x}', {x: i.nameT}))}">▶</button><button type="button" class="button small secondary" data-jv-show="${esc(i.id)}" aria-label="${esc(T('Montre-moi : {x}', {x: i.nameT}))}">👣</button></td></tr>`; }).join('')}</tbody></table></div>` : UI().notice?.('info', T('Rien avec ce filtre.')) || '';
        }
        root.addEventListener('click', e => { let t; if ((t = e.target.closest('[data-jv-go]'))) go(byId(t.dataset.jvGo), null); else if ((t = e.target.closest('[data-jv-show]'))) show(byId(t.dataset.jvShow), null); });
        paintList();
    }

    /* ═════ Réglages → Navigation → 🧭 Je veux… ═════ */
    async function settingsPage(token) {
        const isHere = () => token === S().workspaceToken && S().module === 'maintenance' && S().maintenanceTab === 'je_veux';
        const ws = document.getElementById('workspace'); if (!ws || !isHere()) return;
        const draw = () => {
            const s = JV().settings(), ro = kiosk(), K = UI().toggleHtml || ((l, o) => `<label class="ui-toggle"><input type="checkbox" ${o.attrs} ${o.checked ? 'checked' : ''}><i></i>${esc(l)}</label>`);
            const row = (key, label, sub, extra = '', dis = false) => `<div class="jv-setrow">${K(T(label), {checked: !!s[key], sub: T(sub), attrs: `data-jv-opt="${key}"`, disabled: ro || dis || (key !== 'on' && !s.on)})}${extra ? `<div class="jv-setx">${extra}</div>` : ''}</div>`;
            const seg = (key, list) => `${window.LCNDA_UI.segmented({cls: 'sm', items: list.map(([v, l]) => ({on: String(s[key]) === String(v), attrs: `data-jv-seg="${key}" data-v="${v}"`, disabled: ro || !s.on, html: esc(T(l))}))})}`;
            const all = reg(), things = coverage();
            const aiReady = aiInstalled();
            ws.innerHTML = `<section class="page jv-settings" data-jv-settings>${UI().pageHeader({where: T('Réglages · Navigation'), icon: '🧭', title: T('Je veux…'), help: esc(T('Dire ce qu’on veut faire, et y aller. Rien ne part sur Internet.')), saved: true,
                actions: [`<button type="button" class="button secondary" data-jv-reset${ro ? ' disabled' : ''}>${esc(T('↺ Remettre comme au départ'))}</button>`]})}
                ${ro ? UI().notice?.('info', T('Mode consultation : les réglages se regardent, ils ne se changent pas.')) || '' : ''}
                <div class="jv-set-grid">
                <section class="maintenance-panel"><h3>${esc(T('Allumer et où le montrer'))}</h3>
                  ${row('on', '🧭 Je veux…', 'Éteint, il disparaît de partout.')}
                  ${row('cmdk', 'Dans ⌘K, en premier', 'Sinon, ⌘K cherche les personnes, les lieux et les écrans, comme avant.')}
                  ${row('recherche', 'Dans 🔍 Recherche', '« 🧭 Je veux faire… » en haut de la colonne.')}
                  ${row('top', 'Bouton dans la barre du haut', 'À ranger avec les autres boutons en haut à droite.')}
                  ${row('widget', 'Widget « Que veux-tu faire ? »', 'Posé en haut du tableau de bord.')}
                  ${row('bubbles', 'Dans les bulles « ? » des titres', '« Ce qu’on fait souvent ici ».')}</section>
                <section class="maintenance-panel"><h3>${esc(T('Les réponses'))}</h3>
                  <div class="jv-setrow"><div><b>${esc(T('👣 Montre-moi tout seul'))}</b><small>${esc(T('Après ▶ M’y emmener, montrer aussi les boutons.'))}</small></div><div>${seg('show', [['never', 'Jamais'], ['first', 'La 1re fois'], ['always', 'Toujours']])}</div></div>
                  <div class="jv-setrow"><div><b>${esc(T('Nombre de réponses'))}</b><small>${esc(T('Les autres vont dans « Autres idées ».'))}</small></div><div>${seg('n', [['1', '1'], ['2', '2'], ['3', '3']])}</div></div>
                  ${row('ia', '🤖 Reformuler avec l’IA de l’ordinateur', aiReady ? 'Seulement quand rien ne correspond. L’IA ne choisit pas : elle propose une autre phrase, que tu vois.' : 'Seulement si l’assistant IA est installé (Réglages → 🤖 IA). Ici : pas installé.', '', !aiReady)}
                  ${row('hist', 'Garder « Récemment demandé »', 'Sur cet ordinateur.', ` <button type="button" class="button small secondary" data-jv-clear${ro ? ' disabled' : ''}>${esc(T('Vider maintenant'))}</button>`)}
                  ${row('often', 'Montrer « Souvent fait ici »', 'Compté sur cet ordinateur seulement.')}</section>
                <section class="maintenance-panel"><h3>${esc(T('Couverture'))}</h3><p data-jv-cover>${esc(T('{n} choses de l’app, {m} avec une intention.', {n: things.total, m: things.total - things.missing.length}))} ${things.missing.length ? '' : `<span class="ui-badge is-green">${esc(T('complet'))}</span>`}</p>
                  <p class="muted small">${esc(T('{n} intentions en tout, dont {m} écrites à la main.', {n: all.length, m: all.filter(i => i.src === 'main').length}))}</p>
                  <div class="jv-chips"><button type="button" class="button small secondary" data-jv-tolist>📑 ${esc(T('Voir la liste'))}</button><button type="button" class="button small secondary" data-jv-tobrowse>🗂 ${esc(T('Tout parcourir'))}</button></div></section></div></section>`;
        };
        draw();
        ws.onclick = e => {
            const root = ws.querySelector('[data-jv-settings]'); if (!root || !root.contains(e.target)) return;
            let t;
            if ((t = e.target.closest('[data-jv-seg]')) && !t.disabled) { const k = t.dataset.jvSeg; JV().save({[k]: k === 'n' ? Number(t.dataset.v) : t.dataset.v}); saved(); draw(); return; }
            if (e.target.closest('[data-jv-reset]')) { const before = localStorage.getItem(JV().KEY); JV().reset(); draw(); A().undoToast?.(T('Réglages de « Je veux… » remis comme au départ'), {undo: () => { if (before) localStorage.setItem(JV().KEY, before); JV().apply(); draw(); }}); return; }
            if (e.target.closest('[data-jv-clear]')) { const h = JV().hist(), before = JSON.stringify(h); h.recent = []; JV().saveHist(h); A().undoToast?.(T('« Récemment demandé » effacé'), {undo: () => { localStorage.setItem(JV().HKEY, before); }}); return; }
            if (e.target.closest('[data-jv-tolist]')) { S().listType = 'je_veux'; A().setModule?.('listes'); return; }
            if (e.target.closest('[data-jv-tobrowse]')) { S().jeVeuxBrowse = true; JV().open(''); }
        };
        ws.onchange = e => { const t = e.target.closest?.('[data-jv-opt]'); if (!t || !ws.querySelector('[data-jv-settings]')) return; JV().save({[t.dataset.jvOpt]: t.checked}); saved(); draw(); if (S().module === 'maintenance') A().renderSidebar?.(); };
        const saved = () => UI().pageSaved?.('saved');
    }
    /** ce que l'app a (onglets, pages des Réglages, outils) et ce qui n'a pas d'intention */
    function coverage() {
        const app = A(), have = new Set(reg().flatMap(i => i.targets));
        const things = [...Object.keys(app.appModules || {}).filter(k => k !== 'jeu').map(k => 'module:' + k), ...(app.defaultMaintenanceTabs || []).map(t => 'maint:' + t[0]),
            ...(ext.shortcuts?.catalog?.() || []).filter(r => /^tool:/.test(r.target)).map(r => r.target)];
        const uniq = [...new Set(things)];
        return {total: uniq.length, missing: uniq.filter(t => !have.has(t))};
    }

    /* ═════ « ? » : 🧭 Ce qu'on fait souvent ici ═════ */
    function bubbleMore(bub) {
        if (!bub.isConnected || bub.querySelector('.jv-bub')) return;
        const mod = S().module, h = JV().hist(), s = JV().settings();
        const here = reg().filter(i => i.module === mod || (mod === 'maintenance' && i.targets.includes('maint:' + S().maintenanceTab)));
        const list = (s.often ? [...here].sort((a, b) => (Number(h.count[b.id]) || 0) - (Number(h.count[a.id]) || 0) || (a.src === 'main' ? -1 : 1)) : here.filter(i => i.src === 'main')).slice(0, 3);
        const box = document.createElement('div'); box.className = 'jv-bub';
        box.innerHTML = `<h6>🧭 ${esc(T('Ce qu’on fait souvent ici'))}</h6><div class="jv-bl">${list.map(i => `<button type="button" data-jv-bshow="${esc(i.id)}">${esc(i.icon)} ${esc(i.nameT)} <small>👣</small></button>`).join('')}<button type="button" data-jv-bmore>🧭 ${esc(T('Autre chose…'))} <small>${esc(T('Je veux…'))}</small></button></div>`;
        bub.appendChild(box);
        box.addEventListener('click', e => { const b = e.target.closest('[data-jv-bshow]'); if (b) { bub.remove(); show(byId(b.dataset.jvBshow), null); } else if (e.target.closest('[data-jv-bmore]')) { bub.remove(); JV().open(''); } });
    }

    function showById(id) { const it = byId(id); if (it) show(it, QK.u); }
    function refresh() { REG_AT = 0; memo.clear(); }
    ext.jeVeuxUI = {init: () => { reg(); return ext.jeVeuxUI; }, page, listPage, settingsPage, cmdkRows, cmdkDecorate, cmdkClick, bubbleMore, go, show, showById, refresh, understand, coverage, reg, state: () => P, guideSteps};
})();
