/* LCNDA — 🧭 « Ce que l'app a trouvé dans l'acte », plus riche (Atelier de transcription, panneau de droite) :
 *  - une carte par personne, avec ce que le texte dit d'elle (âge → naissance estimée, métier, origine, lieu de naissance,
 *    domicile, lien, rôle, état), chaque champ à cocher ; les variantes du même nom regroupées ; les faux noms écartés
 *    (montrés à part) ; les fiches de la base qui ressemblent (« Gaspard Baisser » ↔ « Gaspard BAISSAIT ») ;
 *  - des rubriques : 📍 Lieux, 📅 Dates, 🎂 Âges, ⚔️ Événements et contexte (relié au « 🌍 Monde autour »), 📜 Sorte d'acte
 *    (proposée), 🔢 Nombres — chacune avec son compte et « tout garder » ;
 *  - ＋ Ajouter à une fiche… sur chaque élément (aussi « ⋯ » et clic droit) : la fiche au choix, comme événement, note,
 *    profession, résidence ou info, avec la source (ce document, la ligne) et la phrase en citation ; « ↶ Annuler » ;
 *  - 🔍 Repérer avec l'IA, facultatif : le texte seul au modèle local (Ollama, 127.0.0.1), réponse JSON vérifiée par le serveur.
 * Le calcul : heritage-transcribe-acte-core.js (richFind, mergeAi, mergeRich). Serveur : lib/transcription_actes.php.
 * Rien n'est écrit sans un clic ; rien ne part sur Internet.
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = window.LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const C = () => window.LCNDA_TXACTE;
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const notice = (kind, html) => `<div class="ui-notice ui-notice-${kind} h-txa-msg" role="status"><span class="ui-notice-ico" aria-hidden="true">${{info: 'ℹ️', warn: '⚠️', ok: '✓', error: '⛔'}[kind] || 'ℹ️'}</span><span>${html}</span></div>`;
    const raw = v => `<span data-i18n-off>${esc(v)}</span>`; // ce qui vient du texte de l'acte : jamais traduit

    /* ─── réglages (le conseillé par défaut) ─── */
    const PREF_KEY = 'genealogie-trouve-prefs';
    const SECTIONS = [['people', '👤', 'Les personnes'], ['places', '📍', 'Lieux'], ['dates', '📅', 'Dates'], ['ages', '🎂', 'Âges'], ['events', '⚔️', 'Événements et contexte'], ['kind', '📜', 'Sorte d’acte'], ['numbers', '🔢', 'Nombres']];
    const DEFAULT = {show: Object.fromEntries(SECTIONS.map(([k]) => [k, true])), ai: 'propose'};
    const prefs = () => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return {show: {...DEFAULT.show, ...(p.show || {})}, ai: ['propose', 'auto', 'never'].includes(p.ai) ? p.ai : DEFAULT.ai}; } catch (_) { return JSON.parse(JSON.stringify(DEFAULT)); } };
    const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) {} };

    const FIELD = {age: 'Âge', birth: 'Naissance estimée', job: 'Métier', origin: 'Origine', birthplace: 'Lieu de naissance', residence: 'Domicile', link: 'Lien', role: 'Rôle', status: 'État'};
    const ROLE = {epoux: 'Époux', epouse: 'Épouse', pere: 'Père', mere: 'Mère', sujet: 'Enfant', defunt: 'Défunt', conjoint: 'Conjoint', temoin: 'Témoin', parrain: 'Parrain', marraine: 'Marraine', declarant: 'Déclarant', parent: 'Parent', autre: 'Autre personne'};
    const KIND_LABEL = {mariage: 'Mariage', bapteme: 'Baptême', naissance: 'Naissance', deces: 'Décès', sepulture: 'Sépulture', notarial: 'Acte notarié', militaire: 'Registre militaire', recensement: 'Recensement', lettre: 'Lettre', autre: 'Autre'};
    const PLACE_KIND = {pays: 'pays', region: 'région', ville: 'ville', lieu: 'lieu'};
    const EVENT_ICON = {bataille: '⚔️', prisonniers: '⛓', delivrance: '🕊', service: '🎖', unite: '🎖', conscrit: '🎖', malheur: '⚠️', retour: '🏠'};

    /* ─── l'état, par texte : ce qui est écarté, les cases décochées, l'IA, les ressemblances ─── */
    const STATES = new Map();
    const stateFor = text => { let s = STATES.get(text); if (!s) { s = {off: new Set(), unchecked: new Set(), ai: null, aiFound: null, match: null, matching: false, autoTried: false, open: new Set()}; STATES.set(text, s); if (STATES.size > 20) STATES.delete(STATES.keys().next().value); } return s; };
    let deep = null, deepAt = 0; // l'état d'Ollama, demandé une fois de temps en temps
    async function deepStatus(force = false) { if (!force && deep && Date.now() - deepAt < 60000) return deep; try { deep = await api('tx_deep_status'); } catch (_) { deep = {running: false, models: []}; } deepAt = Date.now(); return deep; }
    const aiReady = st => !!(st && st.local_only !== false && st.running && (st.models || []).some(m => m.present));

    const fieldText = (p, k, f) => {
        if (k === 'age') return i18n('{n} ans', {n: f.value});
        if (k === 'birth') return i18n('vers {year}', {year: f.value});
        if (k === 'role') return i18n(ROLE[f.value] || 'Autre personne');
        if (k === 'link') return f.ofName ? `${raw(f.value)} ${esc(i18n('de {name}', {name: f.ofName}))}` : f.of ? `${raw(f.value)} ${esc(i18n('(de la personne d’avant)'))}` : raw(f.value);
        if (k === 'residence' && f.said) return `${raw(f.value)} <small class="muted">(${raw(f.said)})</small>`;
        if (k === 'origin' && f.shared) return `${raw(f.value)} <small class="muted">(${raw(f.shared)})</small>`;
        return raw(f.value);
    };
    const personTitle = p => p.name || i18n('Nom non lu');
    const gotoAttr = (s, e) => (s >= 0 ? ` data-tx-goto="${s}:${e}"` : '');

    /** les rubriques, filtrées de ce qui est écarté pour « ✓ Ajouter à la généalogie » */
    function selection(text) {
        const st = STATES.get(text); if (!st || !st.rf) return null;
        return {rf: st.rf, keep: (pk, fk) => !st.off.has(pk) && (!fk || !st.unchecked.has(`${pk}:${fk}`)), off: st.off};
    }

    /**
     * Monte le bloc dans el. ctx : {text, rf (richFind), date, kind, place, source, filename, title, mediaId, transcriptionId,
     * people (personnes de l'acte gardées), keep(item, personId), setDate(label), setPlace(name), setKind(k), kinds}.
     */
    function mount(el, ctx) {
        if (!el || !ctx || !ctx.rf) return;
        const st = stateFor(ctx.text);
        if (!st.rf || st.base !== ctx.rf) { st.base = ctx.rf; st.rf = st.aiFound ? C().mergeAi(JSON.parse(JSON.stringify(ctx.rf)), st.aiFound) : ctx.rf; st.match = null; }
        const rf = st.rf, P = prefs();
        const byKey = k => rf.people.find(p => p.key === k) || rf.places.find(p => p.key === k) || rf.dates.find(p => p.key === k) || rf.ages.find(p => p.key === k) || rf.events.find(p => p.key === k) || rf.numbers.find(p => p.key === k);
        const linkedId = p => (ctx.people || []).find(q => q.person_id && p.name && C().norm(q.name) === C().norm(p.name))?.person_id || 0;
        const cands = p => (st.match?.people?.[p.key] || []);
        const aiBadge = x => (x?.ai ? ` <span class="h-txa-badge is-ai" title="${esc(i18n('Proposé par l’IA locale : vérifie dans le texte'))}">🔍 ${esc(i18n('IA'))}</span>` : '');
        const more = k => `<button type="button" class="icon-button h-tf-more" data-tf-more="${k}" aria-label="${esc(i18n('Actions'))}" title="${esc(i18n('Actions'))}">⋯</button>`;
        const addBtn = (k, small) => `<button type="button" class="${small ? 'icon-button' : 'button small secondary'} h-tf-add" data-tf-add="${k}" title="${esc(i18n('Ajouter à une fiche…'))}">＋${small ? '' : ` ${esc(i18n('Ajouter à une fiche…'))}`}</button>`;
        const head = (key, n, extra = '') => { const s = SECTIONS.find(x => x[0] === key); return `<h4 class="h-tf-h">${s[1]} ${esc(i18n(s[2]))} <small class="muted">${n}</small>${n ? ` <button type="button" class="link-button" data-tf-all="${key}">${esc(i18n('tout garder'))}</button>` : ''}${extra}</h4>`; };
        const offCls = k => (st.off.has(k) ? ' is-off' : '');
        function card(p) {
            const F = p.fields, keys = Object.keys(FIELD).filter(k => F[k]), lid = linkedId(p), cs = cands(p);
            const fields = keys.map(k => { const f = F[k], id = `${p.key}:${k}`;
                return `<li><label class="checkbox-line"><input type="checkbox" data-tf-f="${id}" ${st.unchecked.has(id) ? '' : 'checked'}> <span class="k">${esc(i18n(FIELD[k]))}</span> <span class="v">${fieldText(p, k, f)}</span>${f.ai ? aiBadge(f) : ''}</label>${f.s >= 0 ? `<button type="button" class="icon-button" data-tx-goto="${f.s}:${f.e}" title="${esc(i18n('Montrer dans le texte'))}">↗</button>` : ''}${addBtn(id, true)}</li>`; }).join('');
            const match = lid ? `<span class="h-tx-linked">👤 ${esc(i18n('fiche n° {person_id}', {person_id: lid}))}</span>`
                : cs.length ? `${esc(cs.length > 1 ? i18n('Fiches proches :') : i18n('Fiche existante :'))} ${cs.map(c => `<button type="button" class="h-txa-chip" data-tf-link="${p.key}:${c.id}" title="${esc(i18n('Garder et relier à cette fiche'))}"><b>${esc(c.title)}</b> <small>${esc(c.years || '')}</small></button>`).join(' ')} ${cs[0].same ? `<span class="h-txa-badge is-ok">${esc(i18n('même personne probable'))}</span>` : `<span class="h-txa-badge is-warn">${esc(i18n('à vérifier'))}</span>`}` : '';
            const sex = p.sex === 'f' ? 'f' : p.sex === 'm' ? 'm' : 'u';
            return `<div class="h-tf-card${offCls(p.key)}" data-tf-card="${p.key}" data-ctx-menu><div class="h-tf-card-h"><span class="h-txa-av is-${sex}">${esc(p.name ? (p.given || p.name).charAt(0) + (p.surname || '').charAt(0) : '?')}</span>
                <div class="h-tf-name"><button type="button" class="link-button"${gotoAttr(p.s, p.e)}><b>${p.name ? raw(personTitle(p)) : esc(personTitle(p))}</b></button>${p.variants?.length ? ` <small class="muted">${esc(i18n('aussi écrit :'))} ${raw(p.variants.join(', '))}</small>` : ''}${aiBadge(p)}${st.off.has(p.key) ? ` <span class="h-txa-badge">${esc(i18n('Écarté'))}</span>` : ''}</div>${more(p.key)}</div>
                ${fields ? `<ul class="h-tf-fields">${fields}</ul>` : `<p class="muted h-tf-none">${esc(i18n('Le texte ne dit rien d’autre sur cette personne.'))}</p>`}
                ${match ? `<div class="h-tf-match">${match}</div>` : ''}
                <div class="h-tf-acts">${p.name && !lid ? `<button type="button" class="button small secondary" data-tf-keep="${p.key}">＋ ${esc(i18n('Garder dans l’acte'))}</button>` : ''}${addBtn(p.key)}</div></div>`;
        }
        const item = (k, main, sub = '', extra = '', x = null) => `<div class="h-tf-item${offCls(k)}" data-tf-item="${k}" data-ctx-menu><button type="button" class="h-tf-main"${x && x.s >= 0 ? gotoAttr(x.s, x.e) : ''} title="${esc(i18n('Montrer dans le texte'))}">${main}</button>${sub ? ` <small class="muted">${sub}</small>` : ''}${aiBadge(x)}${extra}${addBtn(k, true)}${more(k)}</div>`;
        function sections() {
            const out = [];
            if (P.show.people) {
                const ppl = rf.people;
                out.push(`<section class="h-tf-sec" data-tf-sec="people">${head('people', ppl.length)}${ppl.map(card).join('') || `<p class="muted">${esc(i18n('Aucune personne repérée.'))}</p>`}
                    ${rf.rejected.length ? `<details class="h-tf-rej"${st.open.has('rej') ? ' open' : ''} data-tf-rej><summary>${esc(i18n('Écartés : pas des noms ({n})', {n: rf.rejected.length}))}</summary><ul>${rf.rejected.map(r => `<li><button type="button" class="link-button"${gotoAttr(r.s, r.e)}>${raw(r.label)}</button> <small class="muted">${esc(i18n({particle: 'finit par une particule seule', letters: 'lettres mal lues', common: 'mot courant', job: 'c’est un métier', place: 'c’est un lieu'}[r.why] || 'pas un nom'))}</small></li>`).join('')}</ul></details>` : ''}</section>`);
            }
            if (P.show.places) out.push(`<section class="h-tf-sec" data-tf-sec="places">${head('places', rf.places.length)}<div class="h-tf-list">${rf.places.map(p => { const m = st.match?.places?.[p.name] || [];
                return item(p.key, raw(p.name), esc(i18n(PLACE_KIND[p.kind] || 'lieu')), `${m.length ? ` <span class="h-tf-base" title="${esc(i18n('Lieu de ta base'))}">↔ ${m.map(x => raw(x.name)).join(', ')}${m[0].same ? '' : ` <span class="h-txa-badge is-warn">${esc(i18n('à vérifier'))}</span>`}</span>` : ''}<button type="button" class="icon-button" data-tf-setplace="${p.key}" title="${esc(i18n('Lieu de l’acte'))}">⇢</button>`, p); }).join('')}</div></section>`);
            if (P.show.dates) out.push(`<section class="h-tf-sec" data-tf-sec="dates">${head('dates', rf.dates.length)}<div class="h-tf-list">${rf.dates.map(d => item(d.key, raw(d.label), [d.act ? esc(i18n('date de l’acte')) : '', d.repub ? esc(i18n('calendrier républicain')) : '', d.fromField ? esc(i18n('d’après le champ Date')) : ''].filter(Boolean).join(' · '), d.fromField ? '' : `<button type="button" class="icon-button" data-tf-setdate="${d.key}" title="${esc(i18n('Date de l’acte'))}">⇢</button>`, d)).join('')}</div></section>`);
            if (P.show.ages) out.push(`<section class="h-tf-sec" data-tf-sec="ages">${head('ages', rf.ages.length)}<div class="h-tf-list">${rf.ages.map(a => { const o = rf.people.find(p => p.key === a.owner);
                return item(a.key, esc(i18n('{n} ans', {n: a.n})), `${raw(a.text)}${o ? ` · ${o.name ? raw(o.name) : esc(i18n('Nom non lu'))}` : ''}${o && rf.year ? ` · ${esc(i18n('vers {year}', {year: rf.year - a.n}))}` : ''}`, '', a); }).join('')}</div></section>`);
            if (P.show.events) out.push(`<section class="h-tf-sec" data-tf-sec="events">${head('events', rf.events.length)}<div class="h-tf-list">${rf.events.map(e => { const w = st.match?.events?.[e.key] || [];
                const wl = w.length ? ` <span class="h-tf-base">🌍 ${w.map(x => `${raw(x.title)} (${x.from === x.to ? x.from : `${x.from}–${x.to}`})`).join(', ')}</span>` : st.match ? ` <button type="button" class="link-button" data-tf-world="${e.key}">＋ ${esc(i18n('Créer dans « Le monde autour »…'))}</button>` : '';
                return item(e.key, `${EVENT_ICON[e.kind] || '⚔️'} ${raw(e.label)}`, e.place ? raw(e.place) : '', wl, e); }).join('')}</div></section>`);
            if (P.show.kind) { const k = rf.kind;
                out.push(`<section class="h-tf-sec" data-tf-sec="kind"><h4 class="h-tf-h">📜 ${esc(i18n('Sorte d’acte'))} <small class="muted">${k ? 1 : 0}</small></h4>${k ? `<div class="h-tf-item" data-tf-item="kind"><span class="h-tf-main">${esc(k.value ? i18n(KIND_LABEL[k.value] || k.value) : '')}${k.label ? raw(k.label) : ''} ?</span>${k.why ? ` <small class="muted">${esc(i18n('mots : {x}', {x: k.why}))}</small>` : ''}${k.aiLabel ? ` <small class="muted">🔍 ${raw(k.aiLabel)}</small>` : ''}${aiBadge(k)}${k.value && ctx.kind !== k.value ? ` <button type="button" class="button small secondary" data-tf-setkind="${esc(k.value)}">⇢ ${esc(i18n('Choisir cette sorte'))}</button>` : k.value ? ` <span class="h-txa-badge is-ok">✓ ${esc(i18n('choisie'))}</span>` : ''}</div><p class="ui-hint">${esc(i18n('Proposée seulement : la sorte d’acte ne change que si tu la choisis.'))}</p>` : `<p class="muted">${esc(i18n('Pas d’indice dans le texte.'))}</p>`}</section>`); }
            if (P.show.numbers) out.push(`<section class="h-tf-sec" data-tf-sec="numbers">${head('numbers', rf.numbers.length)}<div class="h-tf-list">${rf.numbers.map(n => item(n.key, esc(String(n.n)), /^\d+$/.test(n.text) ? '' : `« ${raw(n.text)} »`, '', n)).join('')}</div></section>`);
            return out.join('');
        }
        function aiLine() {
            const m = P.ai; if (m === 'never') return '';
            const a = st.ai;
            if (a?.state === 'running') return `<div class="h-tf-ai" data-tf-ai>${UI().spinner ? UI().spinner(i18n('L’IA lit le texte… {n} s', {n: a.elapsed || 0})) : esc(i18n('L’IA lit le texte… {n} s', {n: a.elapsed || 0}))} <button type="button" class="button small secondary" data-tf-aistop>✕ ${esc(i18n('Arrêter'))}</button></div>`;
            if (a?.state === 'error') return `<div class="h-tf-ai" data-tf-ai>${notice('error', `${esc(a.error)}${a.detail ? `<br><small>${esc(a.detail)}</small>` : ''}`)}<button type="button" class="button small secondary" data-tf-aigo>↻ ${esc(i18n('Réessayer'))}</button></div>`;
            if (a?.state === 'done') return `<div class="h-tf-ai" data-tf-ai><span class="h-txa-badge is-ai">🔍 ${esc(i18n('IA'))}</span> ${esc(i18n('Propositions de l’IA ajoutées ({n}), marquées 🔍 IA : vérifie-les dans le texte.', {n: a.count || 0}))}</div>`;
            if (!aiReady(deep)) return '';
            return `<div class="h-tf-ai" data-tf-ai><button type="button" class="button small" data-tf-aigo>🔍 ${esc(i18n('Repérer avec l’IA'))}</button> <small class="muted">${esc(i18n('Seul le texte part au modèle, sur cet ordinateur.'))}</small></div>`;
        }
        const counts = () => [rf.people.length && `👤 ${rf.people.length}`, rf.places.length && `📍 ${rf.places.length}`, rf.dates.length && `📅 ${rf.dates.length}`, rf.events.length && `⚔️ ${rf.events.length}`].filter(Boolean).join(' · ');
        function paint() {
            el.innerHTML = `<div class="h-tf" data-tf><div class="h-tf-top"><span><b>🧭 ${esc(i18n('Ce que l’app a trouvé dans l’acte'))}</b> <small class="muted">${esc(counts())}</small></span>
                <button type="button" class="icon-button" data-tf-prefs title="${esc(i18n('Réglages du repérage'))}" aria-label="${esc(i18n('Réglages du repérage'))}">⚙️</button></div>${aiLine()}${sections()}
                <p class="ui-hint">${esc(i18n('Tout est proposé : garde, écarte ou ajoute à une fiche. Rien n’est écrit sans ton clic.'))}</p></div>`;
        }
        paint();
        /* — les ressemblances avec la base (une fois par texte) — */
        async function match() {
            if (st.match || st.matching) return; st.matching = true;
            try {
                const r = await post('act_trouve_match', {people: rf.people.filter(p => p.name).map(p => ({key: p.key, first: p.given || '', last: p.surname || p.name})), places: rf.places.map(p => p.name), events: rf.events.map(e => ({key: e.key, label: e.label, kind: e.kind}))});
                st.match = r.result || {people: {}, places: {}, events: {}};
            } catch (_) { st.match = {people: {}, places: {}, events: {}}; }
            st.matching = false; if (el.isConnected) paint();
        }
        match();
        deepStatus().then(s => { if (!el.isConnected) return; if (aiReady(s) && P.ai === 'auto' && !st.autoTried && !st.ai) { st.autoTried = true; runAi(); } else paint(); });
        /* — 🔍 Repérer avec l'IA — */
        let timer = 0;
        async function runAi() {
            st.ai = {state: 'running', elapsed: 0}; paint();
            let r; try { r = await post('tx_find_start', {text: ctx.text, model: (() => { try { return localStorage.getItem('genealogie-tx-deep-model') || ''; } catch (_) { return ''; } })()}); }
            catch (e) { st.ai = {state: 'error', error: e.message || i18n('La lecture approfondie n’a pas abouti.')}; if (el.isConnected) paint(); return; }
            st.ai.id = r.result?.id;
            const poll = async () => {
                let j; try { j = await api('tx_deep_job', {id: st.ai.id}); } catch (e) { st.ai = {state: 'error', error: e.message || '?'}; if (el.isConnected) paint(); return; }
                if (j.state === 'running') { st.ai.elapsed = j.elapsed; const n = el.querySelector('[data-tf-ai]'); if (n) n.outerHTML = aiLine(); timer = setTimeout(poll, 900); return; }
                if (j.state === 'done' && j.found) {
                    st.aiFound = j.found; const before = rf.people.length + rf.places.length + rf.dates.length + rf.people.reduce((n, p) => n + Object.keys(p.fields).length, 0);
                    C().mergeAi(rf, j.found); const after = rf.people.length + rf.places.length + rf.dates.length + rf.people.reduce((n, p) => n + Object.keys(p.fields).length, 0);
                    st.ai = {state: 'done', count: Math.max(0, after - before)}; st.match = null; if (el.isConnected) { paint(); match(); } return;
                }
                st.ai = {state: 'error', error: j.state === 'cancelled' ? i18n('La lecture a été arrêtée.') : (j.error ? i18n(j.error) : i18n('La lecture approfondie n’a pas abouti.')), detail: j.detail || ''};
                if (el.isConnected) paint();
            };
            poll();
        }
        /* — les actions d'un élément : ⋯ et clic droit, le même menu — */
        const isPerson = k => /^r\d+$/.test(k);
        function itemsFor(k) {
            const x = byKey(k); if (!x && k !== 'kind') return [];
            const on = !st.off.has(k), list = [];
            if (x && x.s >= 0) list.push({icon: '↗', label: i18n('Montrer dans le texte'), run: () => el.querySelector(`[data-tf-card="${k}"] [data-tx-goto], [data-tf-item="${k}"] [data-tx-goto]`)?.click()});
            list.push({icon: '＋', label: i18n('Ajouter à une fiche…'), run: () => addToFiche(k)});
            if (isPerson(k) && x.name && !linkedId(x)) list.push({icon: '＋', label: i18n('Garder dans l’acte'), run: () => keepPerson(x)});
            if (/^l\d+$/.test(k)) list.push({icon: '⇢', label: i18n('Lieu de l’acte'), run: () => ctx.setPlace?.(x.name)});
            if (/^d\d+$/.test(k) && !x.fromField) list.push({icon: '⇢', label: i18n('Date de l’acte'), run: () => ctx.setDate?.(x.label)});
            list.push('-');
            list.push(on ? {icon: '✕', label: i18n('Écarter'), run: () => setOff(k, true)} : {icon: '✓', label: i18n('Garder'), run: () => setOff(k, false)});
            return list;
        }
        function setOff(k, off) {
            if (off) st.off.add(k); else st.off.delete(k); paint();
            if (off) (A().undoToast || toast)(i18n('Élément écarté.'), {undo: () => { st.off.delete(k); if (el.isConnected) paint(); }});
        }
        function keepPerson(p, pid = 0) { if (!p?.name) return; ctx.keep?.({label: p.name, role: ({temoin: 'témoin', parrain: 'parrain', marraine: 'marraine', defunt: 'défunt', declarant: 'déclarant', conjoint: 'conjoint', sujet: 'sujet'})[p.fields.role?.value] || '', s: Math.max(0, p.s), e: Math.max(0, p.e)}, pid); }
        el.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b || !el.contains(b)) return; const d = b.dataset;
            if (d.tfMore) { UI().menuAt?.(b, itemsFor(d.tfMore), {title: (() => { const x = byKey(d.tfMore); return x ? (x.name || x.label || x.text || '') : ''; })()}); return; }
            if (d.tfAdd) return void addToFiche(d.tfAdd);
            if (d.tfKeep) return void keepPerson(byKey(d.tfKeep));
            if (d.tfLink) { const [k, id] = d.tfLink.split(':'); keepPerson(byKey(k), Number(id)); toast(i18n('Personne gardée et reliée à sa fiche.')); return; }
            if (d.tfAll) { const sec = d.tfAll, list = {people: rf.people, places: rf.places, dates: rf.dates, ages: rf.ages, events: rf.events, numbers: rf.numbers}[sec] || [];
                list.forEach(x => st.off.delete(x.key)); if (sec === 'people') rf.people.filter(p => p.name && !linkedId(p)).forEach(p => keepPerson(p)); paint(); return; }
            if (d.tfSetplace) { ctx.setPlace?.(byKey(d.tfSetplace)?.name); return; }
            if (d.tfSetdate) { ctx.setDate?.(byKey(d.tfSetdate)?.label); return; }
            if (d.tfSetkind) { ctx.setKind?.(d.tfSetkind); ctx.kind = d.tfSetkind; paint(); return; }
            if (d.tfWorld !== undefined) return void createWorld(byKey(d.tfWorld));
            if (b.matches('[data-tf-aigo]')) return void runAi();
            if (b.matches('[data-tf-aistop]')) { clearTimeout(timer); if (st.ai?.id) post('tx_deep_cancel', {id: st.ai.id}).catch(() => {}); st.ai = {state: 'error', error: i18n('La lecture a été arrêtée.')}; paint(); return; }
            if (b.matches('[data-tf-prefs]')) return void openPrefs(() => { if (el.isConnected) paint(); });
        });
        el.addEventListener('contextmenu', e => {
            if (e.shiftKey) return; const c = e.target.closest('[data-tf-card], [data-tf-item]'); if (!c) return;
            const k = c.dataset.tfCard || c.dataset.tfItem; UI().contextMenu?.(e, itemsFor(k));
        });
        el.addEventListener('change', e => { const f = e.target.closest('[data-tf-f]'); if (f) { const id = f.dataset.tfF; if (f.checked) st.unchecked.delete(id); else st.unchecked.add(id); } });
        el.addEventListener('toggle', e => { if (e.target.matches?.('[data-tf-rej]')) { if (e.target.open) st.open.add('rej'); else st.open.delete('rej'); } }, true);

        /* ═════ ＋ Ajouter à une fiche… : la fiche, puis « comme quoi ? », avec un aperçu ═════ */
        function addToFiche(k) {
            const [key, fk] = k.split(':'), x = byKey(key); if (!x && key !== 'kind') return;
            const person = isPerson(key) ? x : null, f = person && fk ? person.fields[fk] : null;
            // ce qui sera écrit, d'après l'élément
            let as = 'info', title = '', date = '', place = '', quote = '', line = 0, world = null;
            if (f) { quote = f.quote || person.quote || ''; line = f.s >= 0 ? ctx.text.slice(0, f.s).split('\n').length : person.line;
                if (fk === 'job') { as = 'job'; title = f.value; } else if (fk === 'residence') { as = 'residence'; place = f.value; title = f.value; } else if (fk === 'origin' || fk === 'birthplace') { as = 'info'; title = `${i18n(FIELD[fk])} : ${f.value}`; place = f.value; }
                else if (fk === 'birth') { as = 'info'; title = i18n('Naissance estimée vers {year} (âge dans l’acte)', {year: f.value}); } else if (fk === 'age') { as = 'info'; title = i18n('{n} ans dans l’acte', {n: f.value}); }
                else if (fk === 'link') { as = 'note'; title = `${f.value}${f.ofName ? ' ' + i18n('de {name}', {name: f.ofName}) : ''}`; } else { as = 'info'; title = `${i18n(FIELD[fk])} : ${fk === 'role' ? i18n(ROLE[f.value] || 'Autre personne') : f.value}`; } }
            else if (person) { as = 'note'; title = person.name ? i18n('Nommé dans l’acte : {name}', {name: person.name}) : i18n('Nommé dans l’acte'); quote = person.quote || ''; line = person.line; }
            else if (/^e\d+$/.test(key)) { as = 'event'; title = x.label; place = x.place || ''; quote = x.quote; line = x.line; world = (st.match?.events?.[key] || [])[0] || null; }
            else if (/^l\d+$/.test(key)) { as = 'residence'; place = x.name; title = x.name; quote = x.quote; line = x.line; }
            else if (/^d\d+$/.test(key)) { as = 'info'; title = x.label; date = x.label; quote = x.quote; line = x.line; }
            else if (/^a\d+$/.test(key)) { as = 'info'; title = i18n('{n} ans dans l’acte', {n: x.n}); quote = x.quote; line = x.line; }
            else if (/^n\d+$/.test(key)) { as = 'info'; title = String(x.n); quote = x.quote; line = x.line; }
            // la personne : celle de l'acte d'abord (sa fiche reliée, ou la fiche proche)
            const owner = person || (/^a\d+$/.test(key) ? rf.people.find(p => p.key === x.owner) : null);
            const first = owner ? (linkedId(owner) || (cands(owner)[0]?.same ? cands(owner)[0].id : 0)) : 0;
            const actPeople = [...new Map((ctx.people || []).filter(q => q.person_id).map(q => [q.person_id, q])).values()].slice(0, 8);
            const sugg = [...(owner ? cands(owner).map(c => ({id: c.id, name: c.title})) : []), ...actPeople.map(q => ({id: q.person_id, name: q.name}))].filter((v, i, a) => a.findIndex(w => w.id === v.id) === i).slice(0, 8);
            const src = C().sourceGuess({source: ctx.source, filename: ctx.filename, title: ctx.title, place: ctx.place || rf.act?.place || '', kind: ctx.kind, date: rf.actDate?.label || ctx.date || '', year: rf.year});
            const AS = [['event', '📅', 'Événement'], ['note', '📝', 'Note'], ['job', '🔨', 'Profession'], ['residence', '🏠', 'Résidence'], ['info', 'ℹ️', 'Info']];
            const P0 = window.LCNDA_PICKER || A();
            const d = ext.openDialog({eyebrow: i18n('TRANSCRIPTION'), title: `＋ ${i18n('Ajouter à une fiche')}`, wide: true, submitLabel: `＋ ${i18n('Ajouter')}`,
                body: `<div class="h-tf-addf">
                    <div class="h-pk-solo"><span class="pk-lab">${esc(i18n('La fiche'))}</span>${P0.pickerField({name: 'tf_person', kind: 'person', value: first || null})}</div>
                    ${sugg.length ? `<p class="h-tf-sugg"><span class="muted">${esc(i18n('Dans l’acte :'))}</span> ${sugg.map(s => `<button type="button" class="h-txa-chip" data-tf-pick="${s.id}"><b>${esc(s.name)}</b></button>`).join(' ')}</p>` : ''}
                    <fieldset class="h-tf-as"><legend>${esc(i18n('Comme quoi ?'))}</legend>${AS.map(([v, ic, l]) => `<label><input type="radio" name="tf_as" value="${v}" ${v === as ? 'checked' : ''}> ${ic} ${esc(i18n(l))}</label>`).join('')}</fieldset>
                    <div class="h-txa-grid">
                        <span class="k">${esc(i18n('Texte'))}</span><span><input class="h-txa-in" name="tf_title" value="${esc(title)}"></span>
                        <span class="k" data-tf-r="date">${esc(i18n('Date'))}</span><span data-tf-r="date"><input class="h-txa-in" name="tf_date" value="${esc(date)}" placeholder="${esc(i18n('vide si le texte ne la donne pas'))}"></span>
                        <span class="k" data-tf-r="place">${esc(i18n('Lieu'))}</span><span data-tf-r="place"><input class="h-txa-in" name="tf_place" value="${esc(place)}"></span>
                        <span class="k">${esc(i18n('Citation'))}</span><span><textarea class="h-txa-in" name="tf_quote" rows="3" data-i18n-off>${esc(quote)}</textarea></span>
                    </div>
                    ${world ? `<label class="checkbox-line"><input type="checkbox" name="tf_world" value="${esc(world.id)}" checked> 🌍 ${esc(i18n('Relier à « {title} » du monde autour (sa date et son lieu)', {title: world.title}))}</label>` : ''}
                    <h4>${esc(i18n('Voilà ce qui sera écrit'))}</h4><div class="h-tf-prev" data-tf-prev></div>
                    <p class="ui-hint">${esc(i18n('Toujours avec sa source (ce document, la ligne) et la phrase en citation. « ↶ Annuler » défait l’ajout.'))}</p></div>`,
                onOpen: dg => {
                    const frm = dg.querySelector('form') || dg;
                    const prev = () => {
                        const v = n => frm.querySelector(`[name="${n}"]`)?.value || '', a = frm.querySelector('[name="tf_as"]:checked')?.value || 'info', w = frm.querySelector('[name="tf_world"]')?.checked ? world : null;
                        const dt = v('tf_date') || (w ? (w.date || (w.from === w.to ? String(w.from) : `${w.from}-${w.to}`)) : ''), pl = v('tf_place') || (w?.place || '');
                        dg.querySelectorAll('[data-tf-r="date"]').forEach(n => { n.hidden = a === 'note'; }); dg.querySelectorAll('[data-tf-r="place"]').forEach(n => { n.hidden = a === 'note'; });
                        const what = {event: `📅 ${i18n('Autre événement')}`, note: `📝 ${i18n('Note')}`, job: `🔨 ${i18n('Profession')}`, residence: `🏠 ${i18n('Lieu de résidence')}`, info: `ℹ️ ${i18n('Info')}`}[a];
                        dg.querySelector('[data-tf-prev]').innerHTML = `<p><b>${esc(what)}</b> · <span data-i18n-off>${esc(a === 'residence' ? (pl || v('tf_title')) : v('tf_title'))}</span>${a !== 'note' && dt ? ` · ${esc(dt)}` : ''}${a !== 'note' && a !== 'residence' && pl ? ` · ${esc(pl)}` : ''}</p>
                            <p class="muted">📚 ${esc(src.title || i18n('(sans titre)'))}${line ? ` · ${esc(i18n('ligne {n}', {n: line}))}` : ''}${v('tf_quote') ? ` · « <span data-i18n-off>${esc(v('tf_quote').slice(0, 160))}</span> »` : ''}</p>`;
                    };
                    dg.addEventListener('input', prev); dg.addEventListener('change', prev); prev();
                    dg.addEventListener('click', ev => { const c = ev.target.closest('[data-tf-pick]'); if (!c) return; ev.preventDefault(); const fld = dg.querySelector('.pk[data-picker]'); (P0.pickerSet || A().pickerSet)?.(fld, Number(c.dataset.tfPick)); });
                },
                onSubmit: async frm => {
                    const pv = (P0.pickerValue || A().pickerValue)?.(frm.querySelector('.pk[data-picker]')) ?? frm.elements.tf_person?.value;
                    const pid = Number(pv) || 0; if (!pid) { UI().fail?.(frm.querySelector('.pk-input') || frm.elements.tf_title, i18n('Choisis une fiche.')); return false; }
                    const v = n => frm.elements[n]?.value || '';
                    const body = {person_id: pid, as: frm.querySelector('[name="tf_as"]:checked')?.value || 'info', title: v('tf_title'), date: v('tf_date'), place: v('tf_place'), quote: v('tf_quote'), line,
                        world_id: frm.elements.tf_world?.checked ? world.id : '', media_id: ctx.mediaId || 0, transcription_id: ctx.transcriptionId || 0, source: src};
                    let r; try { r = await post('act_item_add', body); } catch (err) { toast(err.message, 'error'); return false; }
                    const res = r.result || {}; let undone = false;
                    (A().undoToast || toast)(i18n('✓ Ajouté à la fiche.'), {undo: async () => { if (undone) return {already: true}; await post('act_import_undo', {token: res.undo}); undone = true; }});
                    return true;
                }});
            return d;
        }
        /* ═════ ＋ Créer dans « Le monde autour » : le titre repris, l'année à donner soi-même (jamais inventée) ═════ */
        function createWorld(ev) {
            if (!ev) return;
            ext.openDialog({eyebrow: i18n('LE MONDE AUTOUR'), title: `🌍 ${i18n('Créer dans « Le monde autour »')}`, submitLabel: i18n('Créer l’événement'),
                body: `<div class="h-txa-grid"><span class="k">${esc(i18n('Titre'))}</span><span><input class="h-txa-in" name="tw_title" value="${esc(ev.label)}" required></span>
                    <span class="k">${esc(i18n('Année'))}</span><span><input class="h-txa-in" name="tw_year" inputmode="numeric" pattern="[0-9]{4}" value="" required></span></div>
                    <p class="ui-hint">${esc(i18n('Le texte ne donne pas l’année : écris-la toi-même si tu la connais (l’app ne l’invente pas).'))}</p>`,
                onSubmit: async frm => {
                    const y = Number(frm.elements.tw_year.value); if (!(y >= 1000 && y <= 2100)) { UI().fail?.(frm.elements.tw_year, i18n('Donne l’année de l’événement (entre 1000 et 2100).')); return false; }
                    try { await post('save_history_event', {title: frm.elements.tw_title.value, from_year: y, to_year: y, category: ev.kind === 'malheur' ? 'crise' : 'guerre', reach: 'monde', description: ev.quote}); } catch (err) { toast(err.message, 'error'); return false; }
                    st.match = null; toast(i18n('✓ Ajouté au monde autour.')); match(); return true;
                }});
        }
    }

    /** ⚙️ Réglages du repérage : les rubriques montrées, et l'IA (proposer, automatique, jamais) */
    function openPrefs(done) {
        const p = prefs();
        deepStatus(true).then(s => { const n = document.querySelector('[data-tf-aist]'); if (n) n.textContent = aiReady(s) ? i18n('Prête : la lecture approfondie est installée sur cet ordinateur.') : i18n('Pas prête : installe la lecture approfondie (Ollama) pour t’en servir.'); });
        ext.openDialog({eyebrow: i18n('RÉGLAGES'), title: `⚙️ ${i18n('Réglages du repérage')}`, submitLabel: i18n('Enregistrer'),
            body: `<fieldset class="h-tf-as"><legend>${esc(i18n('Rubriques montrées'))}</legend>${SECTIONS.map(([k, ic, l]) => `<label class="checkbox-line"><input type="checkbox" name="tfp_${k}" ${p.show[k] ? 'checked' : ''}> ${ic} ${esc(i18n(l))}</label>`).join('')}</fieldset>
                <fieldset class="h-tf-as"><legend>${esc(i18n('Repérer avec l’IA quand elle est prête'))}</legend>${[['propose', 'proposer (conseillé)'], ['auto', 'automatique'], ['never', 'jamais']].map(([v, l]) => `<label><input type="radio" name="tfp_ai" value="${v}" ${p.ai === v ? 'checked' : ''}> ${esc(i18n(l))}</label>`).join('')}
                <p class="ui-hint" data-tf-aist>…</p></fieldset>
                <button type="button" class="button small secondary" data-tfp-reset>↺ ${esc(i18n('Remettre comme au départ'))}</button>`,
            onOpen: d => { d.querySelector('[data-tfp-reset]')?.addEventListener('click', () => { SECTIONS.forEach(([k]) => { d.querySelector(`[name="tfp_${k}"]`).checked = true; }); d.querySelector('[name="tfp_ai"][value="propose"]').checked = true; }); },
            onSubmit: frm => { savePrefs({show: Object.fromEntries(SECTIONS.map(([k]) => [k, !!frm.querySelector(`[name="tfp_${k}"]`)?.checked])), ai: frm.querySelector('[name="tfp_ai"]:checked')?.value || 'propose'}); done?.(); }});
    }

    ext.txTrouve = {mount, selection, prefs, openPrefs, PREF_KEY};
})();
