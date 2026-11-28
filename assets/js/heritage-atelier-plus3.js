/* LCNDA — 📜 Atelier de transcription, outils en plus (3). Rangés dans les menus et le panneau 🧰 qui existent déjà ;
 * les réglages dans ⚙️ Personnaliser (la barre de l'image). En consultation (body.is-kiosk) : on regarde seulement.
 *  🗂 7  Plan de l'acte (🧰, et Édition) : les parties d'un long acte (comparution, apports, clauses, pièces d'un inventaire,
 *        signatures…), proposées d'après des mots connus, titres à changer, un clic va à la partie ; gardé avec l'acte (data.outline).
 *  👥 8  Personnes et liens (Outils), onglet « Tableau » : chaque personne de l'acte avec son rôle, son âge, son métier, son domicile ;
 *        « 🔗 Relier à une fiche… » (le choix de fiche commun) ou « ＋ Créer une fiche » (l'acte en source), ↶ Annuler.
 *        Une fiche vivante ou confidentielle est marquée 🔒 (et pas nommée en consultation) ; pas de création pour un acte de moins de 100 ans.
 *  🕸 9  Personnes et liens, onglet « Croquis » : le dessin des liens dits par l'acte (parents, enfant, époux, parrain, marraine,
 *        témoins), avant de toucher à l'arbre (« ✓ Ajouter à la généalogie… » ensuite, comme d'habitude).
 *  ✏️ 10 Mot rayé 〚…〛, ajout entre les lignes \…/, note en marge [en marge : …] (Édition) : soulignés à leur façon dans le texte
 *        (Affichage : montrer / cacher), gardés tels quels dans l'export texte et en TEI : <del>, <add place="above">, <note place="margin">.
 *  ❓ 11 Mots douteux de tous les actes (Outils) : « Ma?aud », « mot[?] », « Ma…d », « [illisible] », avec le morceau d'image du mot
 *        quand la ligne a sa zone ; corrigés d'un coup, chacun gardé dans 🕘 Versions, ↶ Annuler.
 *  🎤 12 Dicter (Outils, éteint au départ : ⚙️ Personnaliser) : la reconnaissance vocale du navigateur ; on dit avant de commencer si la
 *        voix part vers un service en ligne ; jamais en ligne pour un acte confidentiel ou lié à une personne vivante, en consultation,
 *        sur un appareil invité. Le 🎤 général (Accessibilité) n'est pas proposé dans le texte de l'acte : celui-ci vérifie tout cela.
 *  🆚 13 Comparer avec un relevé (Fichier) : une ligne collée (CSV, point-virgule, tabulation), ses cases reconnues, les différences
 *        avec ma lecture et mon relevé. Rien n'est cherché sur Internet.
 *  🔗 14 Actes jumeaux (Outils) : bans ↔ mariage, naissance ↔ baptême, décès ↔ inhumation, contrat ↔ mariage, d'après les personnes
 *        et les dates ; côte à côte ; le lien confirmé est gardé dans les deux actes (data.twins), ↶ Annuler.
 * Données et calculs : heritage-atelier-plus3-data.js. Serveur : lib/atelier_plus3.php. Essai : tests/test-atelier-plus3.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = window.LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const D = () => ext.txPlus3Data;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = q => A().api('atelier_plus3', q);
    const post = b => A().api('atelier_plus3_write', {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const apiPost = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const ls = (k, d = '') => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (_) { return null; } return v; };
    const emptyLine = (text, icon) => (A()?.empty ? A().empty(text, {icon}) : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${icon}</span><span class="empty-line-text">${esc(text)}</span></p>`);
    const notice = (kind, html, ico) => `<div class="ui-notice ui-notice-${kind}" role="${kind === 'error' ? 'alert' : 'status'}"><span class="ui-notice-ico" aria-hidden="true">${ico || {info: 'ℹ️', warn: '⚠️', error: '⛔', ok: '✓'}[kind] || 'ℹ️'}</span><span>${html}</span></div>`;
    const ro = () => !!document.body?.classList.contains('is-kiosk');
    const toast = (m, k) => A()?.toast?.(m, k);
    const undo = (msg, icon, fn) => (A().undoToast ? A().undoToast(msg, {icon, undo: fn}) : toast(msg));
    const pl = (n, w, many) => (A()?.plural ? A().plural(n, w, many) : `${n} ${w}`);
    const seg = (label, items, cur, attr) => (UI().segmented ? UI().segmented({label, items: items.map(([k, l]) => ({on: k === cur, attrs: `${attr}="${k}"`, html: esc(l)}))}) : '');

    /* ═════════ ⚙️ Personnaliser ═════════ */
    const P = {ratures: 'genealogie-tx-ratures', dictee: 'genealogie-tx-dictee'};
    const marksOn = () => ls(P.ratures) !== '0'; // allumé au départ
    const dictOn = () => ls(P.dictee) === '1'; // éteinte au départ
    ext.txPrefsMore = ext.txPrefsMore || [];
    ext.txPrefsMore.push(() => `<div class="ap3-prefs" data-ap3-prefs>
        <label class="ui-toggle"><input type="checkbox" data-ap3-pref="ratures" ${marksOn() ? 'checked' : ''}><i></i>${esc(i18n('Montrer les mots rayés, les ajouts entre les lignes et les notes en marge (conseillé)'))}</label>
        <label class="ui-toggle"><input type="checkbox" data-ap3-pref="dictee" ${dictOn() ? 'checked' : ''}><i></i>🎤 ${esc(i18n('Dicter le texte de l’acte (Outils → Dicter)'))}</label>
        <p class="ui-hint">${esc(i18n('La dictée du navigateur envoie souvent la voix à un service en ligne : l’app le dit avant de commencer, et ne la propose pas pour un acte confidentiel ou lié à une personne vivante.'))}</p></div>`);
    if (typeof document !== 'undefined') document.addEventListener('change', e => {
        const k = e.target?.dataset?.ap3Pref; if (!k || !P[k]) return;
        lsSet(P[k], e.target.checked ? '1' : '0');
        if (k === 'dictee' && !e.target.checked) plugs.forEach(p => dictStop(p));
        window.dispatchEvent(new CustomEvent('lcnda-txbar-change'));
    });
    const plugs = new Set();

    /* ═════════ ✏️ 10. Mots rayés, ajouts, notes en marge ═════════ */
    const MARK_TIP = {del: ['Mot rayé dans l’acte', '〚 〛'], add: ['Ajouté entre les lignes', '\\ /'], margin: ['Note en marge', '[en marge : …]']};
    function hoverMarks(text) {
        if (!marksOn() || !D()) return [];
        return D().scanMarks(text).map(m => ({s: m.s, e: m.e, word: m.inner, prio: true, cls: `is-${m.type}`,
            tip: `<b><span aria-hidden="true">✏️</span> ${esc(i18n(MARK_TIP[m.type][0]))}</b> : <span data-i18n-off>${esc(m.inner)}</span><small>${esc(i18n('Écrit {sign} ; gardé dans l’export (TEI : {tag})', {sign: MARK_TIP[m.type][1], tag: {del: '<del>', add: '<add>', margin: '<note>'}[m.type]}))}</small>`}));
    }
    ext.txHoverMore = ext.txHoverMore || []; ext.txHoverMore.push(hoverMarks);
    ext.txTeiLine = (line, x) => (D() ? D().teiInline(line, x) : x(line));
    function putMark(plug, type) {
        const a = plug.area, s = a.selectionStart, e = a.selectionEnd, sel = a.value.slice(s, e);
        if (/\n/.test(sel)) return toast(i18n('Choisis un ou quelques mots sur une seule ligne.'), 'error');
        const w = D().wrapMark(type, sel);
        a.focus(); a.setRangeText(w.text, s, e, 'end'); a.setSelectionRange(s + w.caret, s + w.caret);
        a.dispatchEvent(new Event('input', {bubbles: true})); // l'Atelier suit : zones décalées, ↶ Annuler (⌘Z)
        plug.status(i18n('{what} : ⌘Z pour annuler', {what: i18n(MARK_TIP[type][0])}));
    }
    function marksMenu(plug) {
        const anchor = plug.$('[data-ui-menu="Édition"]') || plug.area;
        const items = [['del', '〚 〛'], ['add', '\\ /'], ['margin', '[ ]']].map(([k, sym]) => ({icon: sym, label: i18n(MARK_TIP[k][0]), run: () => putMark(plug, k)}));
        if (UI().menuAt) UI().menuAt(anchor, items, {title: `✏️ ${i18n('Rayé, ajout, marge')}`}); else putMark(plug, 'del');
    }

    /* ═════════ 🗂 7. Le plan de l'acte ═════════ */
    const lineEnd = (t, s) => { const k = t.indexOf('\n', s); return k < 0 ? t.length : k; };
    const lineNo = (t, s) => t.slice(0, s).split('\n').length;
    function setOutline(plug, next, msg, before) {
        const was = before ?? (plug.t.data.outline ? [...plug.t.data.outline] : null), X = D();
        const clean = X.cleanOutline(next, plug.area.value);
        if (clean.length) plug.t.data.outline = clean; else delete plug.t.data.outline;
        plug.touch(); repaintPlan(plug);
        if (msg) undo(msg, '🗂', () => { if (was && was.length) plug.t.data.outline = was; else delete plug.t.data.outline; plug.touch(); repaintPlan(plug); });
    }
    function paintPlan(box, plug) {
        const X = D(), T = plug.area.value, list = X.resolveOutline(plug.t.data.outline || [], T), sugg = X.suggestOutline(T).filter(x => !list.some(o => o.s === x.s));
        const long = X.isLong(T), w = !ro();
        box.innerHTML = `${list.length ? `<ol class="ap3-plan" data-ap3-plan>${list.map((o, i) => `<li class="${o.lost ? 'is-lost' : ''}${o.auto ? ' is-auto' : ''}">
                <button type="button" class="ap3-plan-go" data-ap3-go="${i}" title="${esc(i18n('Aller à cette partie'))}">${esc(i18n('l. {n}', {n: lineNo(T, o.s)}))}</button>
                ${w ? `<input class="ap3-plan-h" data-ap3-h="${i}" value="${esc(o.h)}" maxlength="120" aria-label="${esc(i18n('Titre de la partie'))}" data-i18n-off>
                <button type="button" class="ap3-x" data-ap3-del="${i}" title="${esc(i18n('Retirer ce titre'))}" aria-label="${esc(i18n('Retirer ce titre'))}">×</button>` : `<button type="button" class="link-button" data-ap3-go="${i}" data-i18n-off>${esc(o.h)}</button>`}</li>`).join('')}</ol>`
            : emptyLine(long ? i18n('Pas encore de plan : propose-le d’après les mots connus, ou mets un titre à la ligne du curseur.') : i18n('Un plan sert surtout aux longs actes (contrat de mariage, inventaire, partage).'), '🗂')}
            ${w ? `<div class="ap2-acts"><button type="button" class="button small secondary" data-ap3-sugg ${sugg.length ? '' : 'disabled'}>✨ ${esc(sugg.length ? i18n('Proposer le plan ({n})', {n: sugg.length}) : i18n('Rien de plus à proposer'))}</button>
                <button type="button" class="button small secondary" data-ap3-add>＋ ${esc(i18n('Titre à la ligne du curseur'))}</button></div>` : ''}
            <p class="ui-hint">${esc(i18n('Repéré d’après : comparution, apports et dot, clauses, pièces d’un inventaire, argent comptant, titres et papiers, lots, signatures… Les titres se changent ; ils restent avec l’acte.'))}</p>`;
        box.onclick = e => {
            const g = e.target.closest('[data-ap3-go]'); if (g) { const o = list[Number(g.dataset.ap3Go)]; if (o) plug.gotoRange(o.s, lineEnd(T, o.s)); return; }
            const d = e.target.closest('[data-ap3-del]'); if (d) { const o = list[Number(d.dataset.ap3Del)]; return setOutline(plug, list.filter(x => x !== o), i18n('Titre « {h} » retiré', {h: o.h})); }
            if (e.target.closest('[data-ap3-sugg]')) return setOutline(plug, X.mergeOutline(list, sugg), i18n('Ajoutés au plan : {what}', {what: pl(sugg.length, 'titre')}));
            if (e.target.closest('[data-ap3-add]')) { const c = plug.area.selectionStart, s = T.lastIndexOf('\n', Math.max(0, c - 1)) + 1, line = T.slice(s, lineEnd(T, s)).trim();
                if (list.some(o => o.s === s)) return toast(i18n('Cette ligne a déjà un titre.'), 'error');
                return setOutline(plug, [...list, {s, h: line.slice(0, 40) || i18n('Partie'), at: X.anchorOf(T, s)}], i18n('Titre ajouté à la ligne {n}', {n: lineNo(T, s)})); }
        };
        box.onchange = e => { const h = e.target.closest('[data-ap3-h]'); if (!h) return; const i = Number(h.dataset.ap3H), v = h.value.trim(); if (!v) { h.value = list[i].h; return; }
            const before = plug.t.data.outline ? [...plug.t.data.outline] : null; setOutline(plug, list.map((o, k) => (k === i ? {...o, h: v, auto: false} : o)), i18n('Titre changé : « {h} »', {h: v}), before); };
    }
    const repaintPlan = plug => { const d = plug.aides?.panel?.querySelector('[data-txh-sec="plan"]'); if (d?.open) paintPlan(d.querySelector('.txh-body'), plug); };

    /* ═════════ 👥 8 · 🕸 9. Les personnes et leurs liens ═════════ */
    function extractNow(plug) {
        const C = window.LCNDA_TXACTE; if (!C?.extractAct) return null;
        const $ = plug.$, helpers = {detect: ext.actDetect, findDates: ext.actFindDates || plug.findDates, wordsToNumber: ext.actWordsToNumber};
        try { return C.extractAct(plug.area.value, {kind: plug.kindNow?.() || $('[data-tx="kind"]')?.value || '', place: $('[data-tx="place"]')?.value || '', date: $('[data-tx="date_text"]')?.value || '', helpers}); } catch (_) { return null; }
    }
    const actYear = plug => Number(String(plug.$('[data-tx="date_text"]')?.value || '').match(/\b(1[2-9]\d{2}|20\d{2})\b/)?.[1]) || 0;
    async function openPeople(plug, tab = 'table') {
        const ex = extractNow(plug); if (!ex) return toast(i18n('Le repérage des personnes n’est pas chargé.'), 'error');
        let rows = D().peopleRows(ex, plug.t.data.people), info = new Map(), cur = tab;
        const loadInfo = async () => { const ids = [...new Set(rows.map(r => r.person_id).filter(Boolean))]; if (!ids.length) return; try { (await get({op: 'people_info', ids: ids.join(',')})).people.forEach(p => info.set(Number(p.id), p)); } catch (_) {} };
        await loadInfo();
        const recent = actYear(plug) > new Date().getFullYear() - 100;
        const fiche = r => {
            if (r.person_id) { const p = info.get(r.person_id); return `<span class="ap3-chip${p?.private ? ' is-priv' : ''}">${p?.private ? '🔒 ' : '👤 '}<span data-i18n-off>${esc(p?.name || i18n('fiche n° {n}', {n: r.person_id}))}</span></span>${ro() ? '' : ` <button type="button" class="ap3-x" data-ap3-unlink="${esc(r.key)}" title="${esc(i18n('Délier'))}" aria-label="${esc(i18n('Délier'))}">×</button>`}`; }
            if (ro()) return '<span class="muted">—</span>';
            return `<span class="ap3-pbtns"><button type="button" class="button small secondary" data-ap3-link="${esc(r.key)}">🔗 ${esc(i18n('Relier à une fiche…'))}</button>
                <button type="button" class="button small secondary" data-ap3-create="${esc(r.key)}" ${recent ? `disabled title="${esc(i18n('Acte de moins de 100 ans : la personne vit peut-être encore. Passe par « Ajouter à la généalogie » et vérifie.'))}"` : ''}>＋ ${esc(i18n('Créer une fiche'))}</button></span>`;
        };
        const tableHtml = () => (rows.length ? `<div class="ap3-ptab-w"><table class="ap3-ptab"><thead><tr><th>${esc(i18n('Rôle'))}</th><th>${esc(i18n('Nom'))}</th><th>${esc(i18n('Âge'))}</th><th>${esc(i18n('Métier'))}</th><th>${esc(i18n('Domicile'))}</th><th>${esc(i18n('Fiche'))}</th></tr></thead><tbody>
            ${rows.map(r => `<tr data-ap3-row="${esc(r.key)}"><td data-label="${esc(i18n('Rôle'))}">${esc(r.label)}</td><td data-label="${esc(i18n('Nom'))}"><button type="button" class="link-button" data-ap3-goname="${esc(r.key)}" data-i18n-off>${esc(r.name)}${r.deceased ? ' †' : ''}</button></td>
                <td data-label="${esc(i18n('Âge'))}">${r.age != null ? esc(i18n('{n} ans', {n: r.age})) : '—'}</td><td data-label="${esc(i18n('Métier'))}" data-i18n-off>${esc(r.job || '—')}</td><td data-label="${esc(i18n('Domicile'))}" data-i18n-off>${esc(r.residence || '—')}</td><td data-label="${esc(i18n('Fiche'))}">${fiche(r)}</td></tr>`).join('')}</tbody></table></div>`
            : emptyLine(i18n('Aucune personne trouvée dans le texte : relis-le, puis « 🧭 Repérer ».'), '👥'));
        const sketchHtml = () => { const svg = D().sketchSvg(D().sketchLayout(ex), {title: i18n('Croquis des liens dits par l’acte')});
            return svg ? `<div class="ap3-sk-w" data-ap3-skw>${svg}</div><p class="ui-hint">${esc(i18n('Seulement ce que dit l’acte : rien n’est encore changé dans l’arbre. Un clic sur une personne la montre dans le texte.'))}</p>
                ${ro() ? '' : `<button type="button" class="button small" data-ap3-found>✓ ${esc(i18n('Ajouter à la généalogie…'))}</button>`}` : emptyLine(i18n('Aucun lien repéré dans le texte.'), '🕸'); };
        const dg = ext.openDialog({eyebrow: i18n('L’ACTE'), title: `👥 ${i18n('Personnes et liens de l’acte')}`, wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: `<div data-ap3-pseg>${seg(i18n('Vue'), [['table', `📋 ${i18n('Tableau')}`], ['sketch', `🕸 ${i18n('Croquis')}`]], cur, 'data-ap3-ptab')}</div><div data-ap3-pbody></div>`,
            onOpen: d => d.classList.add('ap3-pdlg')});
        const body = dg.querySelector('[data-ap3-pbody]');
        const paint = () => { body.innerHTML = cur === 'sketch' ? sketchHtml() : tableHtml(); };
        paint();
        const byKey = k => rows.find(r => r.key === k);
        const setPid = (r, pid) => {
            const before = (plug.t.data.people || []).map(p => ({...p}));
            const people = plug.t.data.people = (plug.t.data.people || []).map(p => ({...p}));
            if (r.idx >= 0 && people[r.idx]) people[r.idx].person_id = pid;
            else { people.push({name: r.name, role: r.role, s: r.s, e: r.e, person_id: pid}); r.idx = people.length - 1; }
            r.person_id = pid; plug.touch();
            return before;
        };
        const refresh = async () => { rows = D().peopleRows(ex, plug.t.data.people); await loadInfo(); if (dg.isConnected) paint(); };
        dg.addEventListener('click', async e => {
            const t = e.target.closest('[data-ap3-ptab]'); if (t) { cur = t.dataset.ap3Ptab; UI().segPick?.(t); paint(); return; }
            const g = e.target.closest('[data-ap3-goname]'); if (g) { const r = byKey(g.dataset.ap3Goname); if (r && r.e > r.s) plug.gotoRange(r.s, r.e); return; }
            const n = e.target.closest('[data-ap3-sk]'); if (n) { const r = ex.people.find(p => p.key === n.dataset.ap3Sk); if (r && r.e > r.s) plug.gotoRange(r.s, r.e); return; }
            if (e.target.closest('[data-ap3-found]')) { dg.close(); const b = document.createElement('button'); b.type = 'button'; b.hidden = true; b.dataset.txCmd = 'found'; plug.dlg.appendChild(b); b.click(); b.remove(); return; }
            const ul = e.target.closest('[data-ap3-unlink]'); if (ul) { const r = byKey(ul.dataset.ap3Unlink); if (!r) return; const before = setPid(r, 0); await refresh();
                undo(i18n('« {name} » délié de sa fiche', {name: r.name}), '👥', async () => { plug.t.data.people = before; plug.touch(); await refresh(); }); return; }
            const lk = e.target.closest('[data-ap3-link]'); if (lk) { const r = byKey(lk.dataset.ap3Link), PK = window.LCNDA_PICKER || A(); if (!r || !PK.openPicker) return;
                const it = await PK.openPicker({kind: 'person', title: i18n('Relier « {name} » à une fiche', {name: r.name}), q: r.name}); if (!it) return;
                const before = setPid(r, Number(it.id)); await refresh();
                undo(i18n('« {name} » relié à sa fiche', {name: r.name}), '🔗', async () => { plug.t.data.people = before; plug.touch(); await refresh(); }); return; }
            const cr = e.target.closest('[data-ap3-create]'); if (cr) {
                const r = byKey(cr.dataset.ap3Create); if (!r) return; cr.disabled = true;
                try { await createPerson(plug, r, ex); await refresh(); } catch (err) { toast(err.message || String(err), 'error'); if (cr.isConnected) cr.disabled = false; }
            }
        });
        return dg;
    }
    /** ＋ Créer une fiche : une seule personne, l'acte en source (le même ajout que « Ajouter à la généalogie », ↶ Annuler défait tout) */
    async function createPerson(plug, r, ex) {
        if (!plug.t.id || plug.isDirty()) { await plug.save(); }
        const C = window.LCNDA_TXACTE, $ = plug.$, nm = r.given || r.surname ? {given: r.given, surname: r.surname} : D().splitName(r.name);
        const src = C?.sourceGuess ? C.sourceGuess({source: $('[data-tx="source"]')?.value || '', filename: plug.t.filename || '', title: $('[data-tx="title"]')?.value || '', frameText: '', place: ex.place || $('[data-tx="place"]')?.value || '', kind: ex.kind, date: ex.date?.label || '', year: ex.year, names: [nm.surname || nm.given]}) : {title: $('[data-tx="source"]')?.value || $('[data-tx="title"]')?.value || ''};
        const res = await apiPost('act_import_apply', {transcription_id: plug.t.id || 0, media_id: plug.t.media_id || 0, text: plug.area.value, event: {kind: 'autre', date: ex.date?.label || '', place: '', place_id: 0}, relations: [], source: {...src, id: 0},
            people: [{key: 'p1', action: 'create', person_id: 0, first: nm.given, last: nm.surname, name: r.name, sex: r.sex, role: r.role, job: r.job, age: r.age || 0, birth_year: r.birthYear || null, residence: r.residence, deceased: r.deceased, add: {job: !!r.job, birth: !!r.birthYear, death: !!r.deceased, residence: false}}]});
        const pid = Number(res?.map?.p1 || 0); if (!pid) throw new Error(i18n('La fiche n’a pas pu être créée.'));
        const before = (plug.t.data.people || []).map(p => ({...p}));
        const people = plug.t.data.people = before.map(p => ({...p}));
        if (r.idx >= 0 && people[r.idx]) people[r.idx].person_id = pid; else people.push({name: r.name, role: r.role, s: r.s, e: r.e, person_id: pid});
        plug.touch();
        let undone = false;
        undo(i18n('Fiche créée : {name} (avec l’acte en source)', {name: r.name}), '＋', async () => { if (undone) return; undone = true; await apiPost('act_import_undo', {token: res.undo}); plug.t.data.people = before; plug.touch(); });
        return pid;
    }

    /* ═════════ ❓ 11. Les mots douteux de tous les actes ═════════ */
    const thumbUrl = h => `api.php?action=atelier_plus3&op=word_thumb&act=${encodeURIComponent(h.act_id)}&zone=${encodeURIComponent(h.zone)}&s=${h.s}&e=${h.e}`;
    async function openDoubts(plug) {
        if (plug.isDirty() && !ro()) { await plug.save(); }
        let R; try { R = await get({op: 'doubts'}); } catch (e) { return toast(e.message, 'error'); }
        const items = R.items.map((h, i) => ({...h, i, state: ''}));
        let q = '';
        const lineHtml = h => { const t = h.text, k = t.indexOf(h.word); return k < 0 ? esc(t) : `${esc(t.slice(Math.max(0, k - 60), k))}<mark>${esc(h.word)}</mark>${esc(t.slice(k + h.word.length, k + h.word.length + 60))}`; };
        const draw = () => {
            const f = D().fold(q.trim()), list = items.filter(h => !f || D().fold(`${h.word} ${h.text} ${h.title}`).includes(f)), acts = new Map();
            list.forEach(h => { if (!acts.has(h.act_id)) acts.set(h.act_id, []); acts.get(h.act_id).push(h); });
            return list.length ? [...acts].map(([id, hs]) => `<section class="ap3-d-act"><h4><span data-i18n-off>${esc(hs[0].title)}</span> <small>${esc([hs[0].date_text, hs[0].place].filter(Boolean).join(' · '))}</small>
                ${Number(id) !== Number(plug.t.id) ? `<button type="button" class="link-button" data-ap3-dopen="${id}">↗ ${esc(i18n('Ouvrir l’acte'))}</button>` : `<span class="ap3-here">${esc(i18n('acte ouvert'))}</span>`}</h4>
                ${hs.map(h => `<div class="ap3-d-row${h.state ? ' is-' + h.state : ''}" data-ap3-d="${h.i}">${h.zone ? `<img class="ap3-d-img" src="${esc(thumbUrl(h))}" alt="${esc(i18n('Le mot sur l’image'))}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ap3-d-noimg',textContent:'—'}))">` : `<span class="ap3-d-noimg" title="${esc(i18n('Pas de zone pour cette ligne'))}">—</span>`}
                    <span class="ap3-d-ctx"><small>${esc(i18n('l. {n}', {n: h.line}))}</small> <span data-i18n-off>${lineHtml(h)}</span></span>
                    ${ro() ? '' : `<input class="ap3-d-in" data-ap3-din="${h.i}" value="${esc(h.word)}" spellcheck="false" aria-label="${esc(i18n('Bonne lecture'))}" data-i18n-off ${h.state === 'ok' ? 'disabled' : ''}>
                    ${h.state === 'ok' ? `<span class="ap3-d-ok">✓ ${esc(i18n('corrigé'))}</span>` : `<button type="button" class="button small" data-ap3-dfix="${h.i}">✓ ${esc(i18n('Corriger'))}</button>`}`}</div>`).join('')}</section>`).join('')
                : emptyLine(q ? i18n('Aucun mot pour « {q} ».', {q}) : i18n('Aucun mot douteux : pas de « ? », de « … » ni de [illisible] dans tes actes.'), '❓');
        };
        const dg = ext.openDialog({eyebrow: i18n('TOUS LES ACTES'), title: `❓ ${i18n('Mots douteux à revoir')}`, wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: `<p class="ap3-d-sum" role="status">${esc(i18n('{words} dans {acts}', {words: pl(R.total, 'mot douteux', 'mots douteux'), acts: pl(R.acts, 'acte')}))}${R.more ? ` · ${esc(i18n('les {n} premiers', {n: items.length}))}` : ''}</p>
                <input type="search" class="ap2-q" data-ap3-dq placeholder="${esc(i18n('Filtrer (un mot, un acte)'))}" aria-label="${esc(i18n('Filtrer (un mot, un acte)'))}">
                <div class="ap3-d-list" data-ap3-dlist>${draw()}</div>
                <p class="ui-hint">${esc(i18n('Chaque correction garde le texte d’avant dans 🕘 Versions de l’acte.'))}</p>`,
            onOpen: d => d.classList.add('ap3-ddlg')});
        const listEl = dg.querySelector('[data-ap3-dlist]'), redraw = () => { listEl.innerHTML = draw(); };
        dg.querySelector('[data-ap3-dq]').addEventListener('input', e => { q = e.target.value; redraw(); });
        const shift = (h, delta) => items.forEach(x => { if (x !== h && x.act_id === h.act_id && x.s >= h.e) { x.s += delta; x.e += delta; } });
        async function fix(h, word) {
            const old = h.word;
            if (Number(h.act_id) === Number(plug.t.id)) { // l'acte ouvert : dans l'Atelier (zones et personnes décalées comme quand on écrit)
                const a = plug.area; if (a.value.slice(h.s, h.e) !== old) throw new Error(i18n('Ce mot a changé dans l’acte entre-temps : rien n’a été changé.'));
                try { await A().api('save_act_transcription_version', {}, {method: 'POST', body: {act_id: plug.t.id, label: `Avant : « ${old} » → « ${word} »`, body: a.value, data: {zones: plug.t.data.zones, people: plug.t.data.people}}}); plug.versionsSoon?.(); } catch (_) {}
                a.setRangeText(word, h.s, h.e, 'end'); a.dispatchEvent(new Event('input', {bubbles: true}));
                return {s: h.s, e: h.s + word.length, word, old, local: true};
            }
            return post({op: 'doubt_fix', act_id: h.act_id, s: h.s, e: h.e, old, new: word});
        }
        dg.addEventListener('click', async e => {
            const o = e.target.closest('[data-ap3-dopen]'); if (o) { dg.close(); return plug.switchTo({id: Number(o.dataset.ap3Dopen)}); }
            const b = e.target.closest('[data-ap3-dfix]'); if (!b) return;
            const h = items[Number(b.dataset.ap3Dfix)], inp = listEl.querySelector(`[data-ap3-din="${h.i}"]`), word = inp.value.trim();
            if (!word) return UI().fail ? UI().fail(inp, i18n('Écris la bonne lecture du mot.')) : null;
            if (word === h.word) return toast(i18n('Le mot est le même : écris la bonne lecture.'), 'error');
            b.disabled = true;
            try {
                const r = await fix(h, word), old = h.word, delta = (r.e - r.s) - (h.e - h.s);
                shift(h, delta); Object.assign(h, {e: r.e, word: r.word, state: 'ok', text: h.text.replace(old, r.word)}); redraw();
                undo(i18n('« {a} » → « {b} »', {a: old, b: r.word}), '❓', async () => {
                    const back = r.local ? (plug.area.setRangeText(old, r.s, r.e, 'end'), plug.area.dispatchEvent(new Event('input', {bubbles: true})), {s: r.s, e: r.s + old.length})
                        : await post({op: 'doubt_fix', act_id: h.act_id, s: r.s, e: r.e, old: r.word, new: old});
                    shift(h, (back.e - back.s) - (r.e - r.s)); Object.assign(h, {e: back.e, word: old, state: '', text: h.text.replace(r.word, old)}); if (dg.isConnected) redraw();
                });
            } catch (err) { toast(err.message || String(err), 'error'); if (b.isConnected) b.disabled = false; }
        });
        dg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-ap3-din]')) { e.preventDefault(); listEl.querySelector(`[data-ap3-dfix="${e.target.dataset.ap3Din}"]`)?.click(); } });
        return dg;
    }

    /* ═════════ 🎤 12. La dictée ═════════ */
    const SRec = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const isDesktop = () => { try { return ext.access?.dictationWhy?.() === 'desktop' || /\bElectron\//.test(navigator.userAgent); } catch (_) { return false; } };
    async function dictProbe(plug) {
        const st = plug._ap3, S = SRec(); let local = '';
        if (S && typeof S.available === 'function') { try { local = String(await S.available({langs: ['fr-FR'], processLocally: true})); } catch (_) { local = ''; } }
        let priv = {living: false, confidential: false}; if (plug.t.id) { try { priv = await get({op: 'privacy', act_id: plug.t.id}); } catch (_) {} }
        st.dict = {local, priv};
    }
    const dictPlan = plug => D().dictationPlan({pref: dictOn(), hasSR: !!SRec(), desktop: isDesktop(), local: plug._ap3.dict?.local || '', kiosk: ro(), guest: !!window.LCNDA_GUEST, living: !!plug._ap3.dict?.priv?.living, confidential: !!plug._ap3.dict?.priv?.confidential});
    const WHY = {none: 'La dictée n’est pas possible dans ce navigateur.', desktop: 'La dictée n’est pas possible dans l’app de bureau (pas de reconnaissance vocale ici). Sur Mac : la dictée du système (touche 🎤) ; sur Windows : touche Windows + H.',
        kiosk: 'Pas en mode consultation.', guest: 'Sur un appareil invité, la dictée en ligne n’est pas proposée.', living: 'Cet acte est lié à une personne vivante : la dictée en ligne n’est pas proposée.', confidential: 'Cet acte est confidentiel (fiche confidentielle ou acte récent) : la dictée en ligne n’est pas proposée.'};
    function dictMenuItem(plug) {
        if (!dictOn() || ro()) return null;
        const st = plug._ap3; if (st.rec) return {icon: '■', label: i18n('Arrêter la dictée'), run: () => dictStop(plug)};
        const p = dictPlan(plug);
        return p.ok ? {icon: '🎤', label: `${i18n(p.mode === 'local' ? 'Dicter (sur cet ordinateur)' : 'Dicter (service en ligne)')}…`, run: () => dictAsk(plug)} : {icon: '🎤', label: i18n('Dicter : pas pour cet acte'), disabled: true, help: i18n(WHY[p.why] || WHY.none), run: () => toast(i18n(WHY[p.why] || WHY.none), 'error')};
    }
    async function dictAsk(plug) {
        await dictProbe(plug); const p = dictPlan(plug);
        if (!p.ok) return toast(i18n(WHY[p.why] || WHY.none), 'error');
        if (p.mode === 'local' || ss('genealogie-tx-dictee-ok') === '1') return dictStart(plug, p.mode);
        ext.openDialog({eyebrow: i18n('DICTÉE'), title: `🎤 ${i18n('Ta voix part sur Internet')}`, submitLabel: i18n('Dicter quand même'),
            body: notice('warn', esc(i18n('La reconnaissance vocale de ce navigateur envoie ce que tu dis à un service en ligne (souvent celui de Google ou de Microsoft) pour le transformer en texte. Rien d’autre de l’acte n’est envoyé.')))
                + `<p class="ui-hint">${esc(i18n('Pour un acte confidentiel ou lié à une personne vivante, l’app ne la propose pas. Dis « virgule », « point », « à la ligne » pour la ponctuation.'))}</p>
                <label class="ui-toggle"><input type="checkbox" data-ap3-dok><i></i>${esc(i18n('Ne plus me le redire pendant cette séance'))}</label>`,
            onSubmit: f => { if (f.querySelector('[data-ap3-dok]').checked) ss('genealogie-tx-dictee-ok', '1'); setTimeout(() => dictStart(plug, 'online'), 30); return true; }});
    }
    function insertText(area, txt) {
        if (ext.access?.insertDictated) return ext.access.insertDictated(area, txt);
        const s = area.selectionStart, e = area.selectionEnd, before = area.value.slice(0, s), t = (before && !/\s$/.test(before) ? ' ' : '') + String(txt).trim();
        area.setRangeText(t, s, e, 'end'); area.dispatchEvent(new Event('input', {bubbles: true})); return t;
    }
    function dictStart(plug, mode) {
        const S = SRec(); if (!S) return toast(i18n(WHY.none), 'error');
        dictStop(plug); const st = plug._ap3; let r;
        try { r = new S(); } catch (_) { return toast(i18n(WHY.none), 'error'); }
        r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
        if (mode === 'local') { try { r.processLocally = true; } catch (_) {} }
        st.rec = r; st.recMode = mode; st.recWant = true; paintDict(plug, '');
        r.onresult = ev => { if (st.rec !== r) return; let interim = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) { const x = ev.results[i], txt = x[0]?.transcript || ''; if (x.isFinal) insertText(plug.area, txt); else interim += txt; }
            paintDict(plug, interim.trim()); };
        r.onerror = ev => { if (st.rec !== r) return; const m = {'not-allowed': 'Le micro est refusé : autorise-le, puis réessaie.', 'audio-capture': 'Aucun micro trouvé.', network: 'La dictée en ligne ne répond pas (pas de connexion ?).', 'service-not-allowed': WHY.none, 'language-not-supported': 'Le français n’est pas disponible pour la dictée ici.'}[ev.error];
            if (m) toast(i18n(m), 'error'); if (ev.error !== 'no-speech' && ev.error !== 'aborted') st.recWant = false; };
        r.onend = () => { if (st.rec !== r) return; if (st.recWant && plug.dlg.isConnected) { try { r.start(); return; } catch (_) {} } dictStop(plug); };
        try { r.start(); plug.area.focus(); } catch (_) { dictStop(plug); toast(i18n(WHY.none), 'error'); }
    }
    function dictStop(plug) {
        const st = plug._ap3; if (!st) return; const r = st.rec; st.rec = null; st.recWant = false;
        if (r) { try { r.onend = null; r.stop(); } catch (_) {} }
        paintDict(plug, null);
    }
    function paintDict(plug, interim) {
        const el = plug._ap3.dictBar; if (!el) return; const on = !!plug._ap3.rec; el.hidden = !on; plug.dlg.dataset.ap3Dict = on ? plug._ap3.recMode : '';
        el.innerHTML = on ? `<span class="ap3-dict-dot" aria-hidden="true"></span><b>🎤 ${esc(i18n('J’écoute…'))}</b> <small>${esc(plug._ap3.recMode === 'local' ? i18n('sur cet ordinateur') : i18n('service en ligne'))}</small>
            <span class="ap3-dict-t" data-i18n-off>${interim ? `« ${esc(interim)} »` : ''}</span><button type="button" class="button small secondary" data-ap3-dstop>■ ${esc(i18n('Arrêter'))}</button>` : '';
    }

    /* ═════════ 🆚 13. Comparer avec un relevé ═════════ */
    async function openReleveCmp(plug) {
        if (!ro() && (plug.isDirty() || !plug.t.id)) { await plug.save(); }
        let mine = {}; if (plug.t.id) { try { mine = (await A().api('atelier_plus2', {op: 'releve', scope: 'act', act_id: plug.t.id, private: 1})).rows?.[0] || {}; } catch (_) {} }
        mine = D().rowFromEx(extractNow(plug), {date: plug.$('[data-tx="date_text"]')?.value || '', lieu: plug.$('[data-tx="place"]')?.value || '', ...Object.fromEntries(Object.entries(mine).filter(([, v]) => String(v ?? '').trim()))});
        let P = {header: null, cells: [], sep: ';'}, map = [];
        const X = D(), sym = {same: '✓', diff: '≠', theirs: '＋', mine: '−'}, word = {same: 'pareil', diff: 'différent', theirs: 'seulement dans le relevé', mine: 'seulement chez moi'};
        const mapHtml = () => (P.cells.length ? `<div class="ap3-r-map">${P.cells.map((c, i) => `<label class="ap3-r-cell"><span data-i18n-off>${esc(c || '—')}</span><select data-ap3-rmap="${i}" aria-label="${esc(i18n('Case du relevé'))}"><option value="">${esc(i18n('(ignorer)'))}</option>${X.FIELDS.map(([k]) => `<option value="${k}" ${map[i] === k ? 'selected' : ''}>${esc(X.fieldLabel(k))}</option>`).join('')}</select></label>`).join('')}</div>` : '');
        const cmpHtml = () => { if (!P.cells.length) return ''; const rows = X.compareReleve(map, P.cells, mine, plug.area.value), n = rows.filter(r => r.state !== 'same').length;
            return `<p class="ap3-r-sum" role="status">${esc(n ? pl(n, 'différence') : i18n('Tout est pareil'))}</p><div class="ap3-ptab-w"><table class="ap3-ptab ap3-rtab"><thead><tr><th></th><th>${esc(i18n('Case'))}</th><th>${esc(i18n('Le relevé'))}</th><th>${esc(i18n('Ma lecture'))}</th></tr></thead><tbody>
                ${rows.map(r => `<tr class="is-${r.state}"><td title="${esc(i18n(word[r.state]))}"><span aria-hidden="true">${sym[r.state]}</span><span class="sr-only">${esc(i18n(word[r.state]))}</span></td><td>${esc(r.label)}</td>
                    <td data-label="${esc(i18n('Le relevé'))}" data-i18n-off>${esc(r.theirs || '—')}${r.state !== 'same' && r.theirs && r.inText ? ` <small class="ap3-intext">${esc(i18n('se lit dans ton texte'))}</small>` : ''}</td><td data-label="${esc(i18n('Ma lecture'))}" data-i18n-off>${esc(r.mine || '—')}</td></tr>`).join('')}</tbody></table></div>`; };
        const dg = ext.openDialog({eyebrow: i18n('ENTRAIDE'), title: `🆚 ${i18n('Comparer avec un relevé')}`, wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: `<p class="ui-hint">${esc(i18n('Colle la ligne d’un relevé trouvé ailleurs (cercle généalogique, site d’entraide), avec sa ligne d’en-tête si tu l’as. Rien n’est cherché sur Internet.'))}</p>
                <textarea class="ap3-r-in" data-ap3-rin rows="3" spellcheck="false" placeholder="Date;Type;Nom;Prénom;Père;Mère&#10;12/11/1787;Baptême;MAZAUD;Jean;Pierre MAZAUD;Marie LACOMBE" aria-label="${esc(i18n('La ligne du relevé'))}" data-no-dictation></textarea>
                <div data-ap3-rmapbox></div><div data-ap3-rcmp></div>`,
            onOpen: d => d.classList.add('ap3-rdlg')});
        const mapBox = dg.querySelector('[data-ap3-rmapbox]'), cmp = dg.querySelector('[data-ap3-rcmp]');
        dg.querySelector('[data-ap3-rin]').addEventListener('input', e => { P = X.parseReleve(e.target.value); map = X.guessMapping(P.header, P.cells); mapBox.innerHTML = mapHtml(); cmp.innerHTML = cmpHtml(); });
        dg.addEventListener('change', e => { const s = e.target.closest('[data-ap3-rmap]'); if (!s) return; map[Number(s.dataset.ap3Rmap)] = s.value; cmp.innerHTML = cmpHtml(); });
        return dg;
    }

    /* ═════════ 🔗 14. Les actes jumeaux ═════════ */
    const KIND = {naissance: 'Naissance', bapteme: 'Baptême', mariage: 'Mariage', deces: 'Décès', sepulture: 'Sépulture', notarial: 'Acte notarié', autre: 'Autre', apreciser: 'À préciser'};
    function paintTwins(plug) {
        const el = plug._ap3.twinBar; if (!el) return; const tw = plug.t.data.twins || [];
        el.hidden = !tw.length;
        el.innerHTML = tw.length ? `<span>🔗 ${esc(i18n('Actes liés'))} :</span>${tw.map(t => `<button type="button" class="ap3-chip is-twin" data-ap3-twopen="${t.id}" title="${esc(i18n('Ouvrir l’acte lié'))}">${esc(D().twinLabel(t.rel))} · ${esc(plug._ap3.twinTitles?.[t.id] || i18n('acte n° {n}', {n: t.id}))} ↗</button>`).join('')}` : '';
    }
    async function twinTitles(plug) { const tw = plug.t.data.twins || []; if (!tw.length) return; plug._ap3.twinTitles = plug._ap3.twinTitles || {};
        await Promise.all(tw.filter(t => !plug._ap3.twinTitles[t.id]).map(async t => { try { plug._ap3.twinTitles[t.id] = (await A().api('act_transcription', {id: t.id})).title; } catch (_) {} })); paintTwins(plug); }
    async function setTwin(plug, it, on) {
        const before = [...(plug.t.data.twins || [])];
        const next = on ? D().cleanTwins([...before.filter(t => t.id !== it.id), {id: it.id, rel: it.rel}]) : before.filter(t => t.id !== it.id);
        await post({op: 'twin_link', act_id: plug.t.id, other_id: it.id, rel: it.rel, on: on ? 1 : 0});
        if (next.length) plug.t.data.twins = next; else delete plug.t.data.twins;
        plug._ap3.twinTitles = {...(plug._ap3.twinTitles || {}), [it.id]: it.title}; plug.touch(); paintTwins(plug);
        return async () => { await post({op: 'twin_link', act_id: plug.t.id, other_id: it.id, rel: it.rel, on: on ? 0 : 1}); if (before.length) plug.t.data.twins = before; else delete plug.t.data.twins; plug.touch(); paintTwins(plug); };
    }
    async function openTwins(plug) {
        if (!ro() && (plug.isDirty() || !plug.t.id)) { await plug.save(); }
        if (!plug.t.id) return;
        let R; try { R = await get({op: 'twins', act_id: plug.t.id}); } catch (e) { return toast(e.message, 'error'); }
        const items = R.items;
        const card = (it, i) => `<div class="ap3-tw${it.linked ? ' is-linked' : ''}" data-ap3-tw="${i}"><div class="ap3-tw-h"><b>${esc(D().twinLabel(it.rel))}</b>${it.linked ? ` <span class="ap3-chip is-twin">✓ ${esc(i18n('lié'))}</span>` : ''}</div>
            <div><span data-i18n-off>${esc(it.title)}</span> <small>${esc([i18n(KIND[it.kind] || 'Autre'), it.date_text, it.place].filter(Boolean).join(' · '))}</small></div>
            <div class="ap3-tw-why"><small>${esc([it.shared?.length ? i18n('mêmes personnes : {names}', {names: it.shared.join(', ')}) : '', it.days != null ? i18n('{what} d’écart', {what: pl(it.days, 'jour')}) : ''].filter(Boolean).join(' · '))}</small></div>
            <div class="ap2-acts"><button type="button" class="button small secondary" data-ap3-twside="${i}">◫ ${esc(i18n('Côte à côte'))}</button>
                ${ro() ? '' : it.linked ? `<button type="button" class="button small secondary" data-ap3-twoff="${i}">${esc(i18n('Délier'))}</button>` : `<button type="button" class="button small" data-ap3-twon="${i}">🔗 ${esc(i18n('Lier ces deux actes'))}</button>`}</div></div>`;
        const dg = ext.openDialog({eyebrow: i18n('ACTES LIÉS'), title: `🔗 ${i18n('Actes jumeaux')}`, wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: `<p class="ui-hint">${esc(i18n('Publication des bans et mariage, naissance et baptême, décès et inhumation, contrat et mariage : parmi tes actes, ceux qui ont les mêmes personnes à des dates proches. Rien n’est lié sans ton accord.'))}</p>
                <div class="ap3-tws" data-ap3-tws>${items.length ? items.map(card).join('') : emptyLine(i18n('Aucun acte jumeau trouvé parmi tes actes.'), '🔗')}</div><div class="ap3-side" data-ap3-side hidden></div>`,
            onOpen: d => d.classList.add('ap3-twdlg')});
        const box = dg.querySelector('[data-ap3-tws]'), side = dg.querySelector('[data-ap3-side]'), redraw = () => { box.innerHTML = items.map(card).join(''); };
        const highlight = (text, names) => { let h = esc(text); (names || []).forEach(n => { n.split(' ').filter(w => w.length > 2).forEach(w => { h = h.replace(new RegExp(`(^|[^\\p{L}])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=[^\\p{L}]|$)`, 'giu'), '$1<mark>$2</mark>'); }); }); return h; };
        const folded = s => D().fold(s);
        dg.addEventListener('click', async e => {
            const sb = e.target.closest('[data-ap3-twside]');
            if (sb) { const it = items[Number(sb.dataset.ap3Twside)]; let o; try { o = await A().api('act_transcription', {id: it.id}); } catch (err) { return toast(err.message, 'error'); }
                const names = (it.shared || []).map(folded), mk = t => highlight(t, names);
                side.hidden = false; side.innerHTML = `<div class="ap3-side-g"><section><h4>${esc(i18n('Cet acte'))}</h4>${plug.t.filename ? `<img src="media/${esc(encodeURIComponent(plug.t.filename))}" alt="" loading="lazy">` : ''}<pre data-i18n-off>${mk(plug.area.value)}</pre></section>
                    <section><h4><span data-i18n-off>${esc(o.title)}</span> <button type="button" class="link-button" data-ap3-twopen="${it.id}">↗ ${esc(i18n('Ouvrir'))}</button></h4>${o.filename ? `<img src="media/${esc(encodeURIComponent(o.filename))}" alt="" loading="lazy">` : ''}<pre data-i18n-off>${mk(String(o.body || ''))}</pre></section></div>`;
                side.scrollIntoView?.({block: 'nearest'}); return; }
            const op = e.target.closest('[data-ap3-twopen]'); if (op) { dg.close(); return plug.switchTo({id: Number(op.dataset.ap3Twopen)}); }
            const on = e.target.closest('[data-ap3-twon]'), off = e.target.closest('[data-ap3-twoff]'); if (!on && !off) return;
            const it = items[Number((on || off).dataset[on ? 'ap3Twon' : 'ap3Twoff'])];
            try { const back = await setTwin(plug, it, !!on); it.linked = !!on; redraw();
                undo(on ? i18n('Actes liés : {rel}', {rel: D().twinLabel(it.rel)}) : i18n('Lien retiré : {rel}', {rel: D().twinLabel(it.rel)}), '🔗', async () => { await back(); it.linked = !on; if (dg.isConnected) redraw(); });
            } catch (err) { toast(err.message || String(err), 'error'); }
        });
        return dg;
    }

    /* ═════════ l'Atelier ═════════ */
    function init(plug) {
        const {dlg, area, $} = plug, editor = $('[data-tx-editor]'); if (!editor || !area) return;
        plugs.add(plug);
        const st = plug._ap3 = {rec: null, dict: null};
        area.setAttribute('data-no-dictation', ''); // le 🎤 général (Accessibilité) n'est pas proposé ici : la dictée de l'Atelier vérifie l'acte (en ligne ? confidentiel ?)
        const row = document.createElement('div'); row.className = 'ap3-row'; row.dataset.ap3Row = '';
        row.innerHTML = '<div class="ap3-twins" data-ap3-twins hidden></div><div class="ap3-dict" data-ap3-dictbar hidden role="status" aria-live="polite"></div>';
        editor.before(row);
        st.twinBar = row.querySelector('[data-ap3-twins]'); st.dictBar = row.querySelector('[data-ap3-dictbar]');
        row.addEventListener('click', e => {
            if (e.target.closest('[data-ap3-dstop]')) return dictStop(plug);
            const o = e.target.closest('[data-ap3-twopen]'); if (o) return plug.switchTo({id: Number(o.dataset.ap3Twopen)});
        });
        paintTwins(plug); twinTitles(plug);
        if (dictOn()) dictProbe(plug);
        const sw = plug.switchTo; plug.switchTo = next => { dictStop(plug); return sw(next); };
        plug.plus3 = {people: () => openPeople(plug, 'table'), sketch: () => openPeople(plug, 'sketch'), doubts: () => openDoubts(plug), releve: () => openReleveCmp(plug), twins: () => openTwins(plug),
            marks: () => marksMenu(plug), mark: k => putMark(plug, k), plan: () => plug.aides?.openSec?.('plan'), dict: () => dictMenuItem(plug), dictStart: m => dictStart(plug, m), dictStop: () => dictStop(plug), plan3: () => D().resolveOutline(plug.t.data.outline || [], area.value)};
        new MutationObserver((_, o) => { if (!dlg.isConnected) { dictStop(plug); plugs.delete(plug); o.disconnect(); } }).observe(document.body, {childList: true});
    }
    ext.txAidesMore = ext.txAidesMore || [];
    ext.txAidesMore.push({id: 'plan', icon: '🗂', title: () => i18n('Plan de l’acte'), paint: paintPlan});
    ext.txPlugins = ext.txPlugins || []; ext.txPlugins.push(init);
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => {
        const X = plug.plus3; if (!X) return [];
        if (menu === 'Fichier') return [{icon: '🆚', label: `${i18n('Comparer avec un relevé')}…`, run: X.releve}];
        if (menu === 'Édition') return [ro() ? null : {icon: '✏️', label: `${i18n('Rayé, ajout entre les lignes, note en marge')}…`, run: X.marks}, {icon: '🗂', label: `${i18n('Plan de l’acte')}…`, run: X.plan}].filter(Boolean);
        if (menu === 'Outils') return [{icon: '👥', label: `${i18n('Personnes et liens de l’acte')}…`, run: X.people}, {icon: '❓', label: `${i18n('Mots douteux de tous les actes')}…`, run: X.doubts}, {icon: '🔗', label: `${i18n('Actes jumeaux')}…`, run: X.twins}, X.dict()].filter(Boolean);
        if (menu === 'Affichage') return [{icon: '✏️', label: marksOn() ? i18n('Cacher les mots rayés et les ajouts') : i18n('Montrer les mots rayés et les ajouts'), run: () => { lsSet(P.ratures, marksOn() ? '0' : '1'); window.dispatchEvent(new CustomEvent('lcnda-txbar-change')); }}];
        return [];
    });
})();
