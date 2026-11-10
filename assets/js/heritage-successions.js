/**
 * 🏠 Héritages et successions — Listes → Médias et documents → « 🏠 Héritages et successions » (serveur : lib/successions.php,
 * styles : assets/css/successions.css). Qui a hérité de quoi d'après les actes (testament, partage, inventaire après décès,
 * donation, vente entre héritiers, contrat de mariage / dot, déclaration de succession). Construit sur l'existant :
 *  - personnes par le menu de choix à rôles (⭐ le défunt ou le donateur, ★ héritiers et bénéficiaires, ☆ autres personnes),
 *    lieu, source, notaire, inventaire après décès relié (liste « Inventaires après décès »), médias par la fenêtre unique ;
 *  - biens : une maison (outil Maison), une parcelle (Cadastre), un objet de famille (Objets de famille, dont la transmission
 *    entre dans la chaîne), ou une terre, une somme, un meuble en texte libre ; la valeur avec l'ordre de grandeur en euros
 *    du convertisseur des Trésors (ext.tresorMoney.worth) ;
 *  - vues : la liste (H10, K5, K9), la fiche d'un acte, le bloc « Ce qu'il a reçu / transmis » de la fiche d'une personne,
 *    la CHAÎNE DES PROPRIÉTAIRES (frise) dans la maison (ext.housePaneExtras) et dans l'objet de famille ([data-succ-host]),
 *    le schéma de partage dessiné par le moteur de diagrammes commun (ext.diagramRender, Sankey ; « 📊 Modifier dans Mes diagrammes »).
 * Aucun conseil juridique : on note ce que disent les actes.
 * API : ext.successions = {open(id, {dialog}), edit(act, prefill), chainHtml(chain), shareSpec(act), reload()}.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    ext.personBlocks = ext.personBlocks || {};
    ext.housePaneExtras = ext.housePaneExtras || [];
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const get = (action, params = {}) => A().api(action, params);
    const post = (action, body) => A().api(action, {}, {method: 'POST', body});
    const toast = (m, k, o) => A().toast(m, k, o);
    const plural = (n, w, many) => (A().plural ? A().plural(n, w, many) : `${n} ${w}`);
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const res = r => (r && r.result !== undefined ? r.result : r);
    const KEY = 'listes:successions';
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes' && S().listType === 'successions';
    const ro = () => document.body.classList.contains('is-kiosk');

    /** sortes d'actes : [icône, nom, qui donne] */
    const KINDS = {testament: ['📜', 'Testament', 'le testateur'], partage: ['⚖️', 'Partage', 'le défunt'], inventaire: ['📋', 'Inventaire après décès', 'le défunt'],
        donation: ['🎁', 'Donation', 'le donateur'], vente: ['🤝', 'Vente entre héritiers', 'le vendeur'], contrat: ['💍', 'Contrat de mariage (dot)', 'qui donne la dot'],
        declaration: ['🏛', 'Déclaration de succession', 'le défunt'], autre: ['📄', 'Autre acte', 'la personne principale']};
    const GOODS = {house: ['🏠', 'Maison'], parcel: ['▦', 'Parcelle du cadastre'], object: ['🏺', 'Objet de famille'], land: ['🌾', 'Terre, pré, vigne, bois'],
        money: ['💰', 'Somme d’argent'], furniture: ['🪑', 'Meubles, linge, outils'], other: ['📦', 'Autre bien']};
    const REF_KIND = {house: 'house', parcel: 'parcel', object: 'fobject'};
    const UNITS = [['', '—'], ['livre', 'livres'], ['sou', 'sous (sols)'], ['denier', 'deniers'], ['ecu', 'écus'], ['franc', 'francs'], ['ancien', 'anciens francs'], ['centime', 'centimes'], ['euro', 'euros']];
    const UNIT_SHORT = Object.fromEntries(UNITS.filter(u => u[0]).map(([k, l]) => [k, l.replace(/\s*\(.*\)$/, '')]));
    const ROLES = ['héritier', 'héritière', 'légataire', 'légataire universel', 'donataire', 'usufruitier', 'usufruitière', 'nu-propriétaire', 'acheteur', 'future épouse', 'futur époux',
        'tuteur', 'curateur', 'exécuteur testamentaire', 'témoin', 'notaire', 'expert', 'créancier', 'autre'];
    const ZONES = {primary: ['Héritiers et bénéficiaires', 'qui reçoit : héritiers, légataires, donataires…', '＋ Ajouter un héritier…'],
        secondary: ['Autres personnes', 'témoins, tuteur, notaire, experts…', '＋ Ajouter une autre personne…']};
    const NOT_LEGAL = 'Ce que tu notes ici reprend les actes : ce n’est pas un conseil juridique.';
    const kindOf = k => KINDS[k] || KINDS.autre;

    const pKey = p => (p.id ? String(p.id) : 'txt:' + (p.txt || p.title || ''));
    const mainsOf = a => (a.people || []).filter(p => p.zone === 'main');
    const benOf = a => (a.people || []).filter(p => p.zone === 'primary');
    /** qui reçoit un bien : les personnes cochées, sinon tous les bénéficiaires */
    function recipients(a, g) {
        const ben = benOf(a); if (!g.to?.length) return ben;
        const by = new Map((a.people || []).map(p => [pKey(p), p]));
        return g.to.map(k => by.get(k)).filter(Boolean);
    }
    function titleOf(a) {
        if (String(a.title || '').trim()) return a.title;
        const m = mainsOf(a)[0];
        return `${kindOf(a.kind)[1]}${m ? ' de ' + m.title : ''}${a.year ? ` (${a.year})` : ''}`;
    }
    const goodName = g => (g.ref_id ? (g.ref_title || GOODS[g.kind]?.[1]) + (g.label ? ` — ${g.label}` : '') : g.label || GOODS[g.kind]?.[1] || 'Bien');
    function valueText(g) {
        const n = g.value_amount != null && g.value_amount !== '' ? `${Number(g.value_amount).toLocaleString('fr-FR')}${g.value_unit ? ' ' + (UNIT_SHORT[g.value_unit] || g.value_unit) : ''}` : '';
        return [n, g.value_text].filter(Boolean).join(' · ');
    }
    /** la somme écrite pour le convertisseur d'autrefois : « 1200 livres », « 300 francs », « 45 € » */
    const UNIT_WORD = {livre: 'livres', sou: 'sous', denier: 'deniers', ecu: 'écus', franc: 'francs', ancien: 'anciens francs', euro: '€'};
    function sumText(amount, unit, text = '') {
        const n = Number(amount);
        if (n > 0 && unit === 'centime') return `${n / 100} francs`;
        if (n > 0 && UNIT_WORD[unit]) return `${n} ${UNIT_WORD[unit]}`;
        return String(text || '').trim();
    }
    /** l'ordre de grandeur en euros d'aujourd'hui : le convertisseur d'autrefois (LCNDA_AUTREFOIS), sinon celui des Trésors ; ou '' */
    function worthText(amount, unit, year, text = '') {
        const y = Number(year); if (!(y >= 1600 && y <= 2030)) return '';
        const AU = window.LCNDA_AUTREFOIS;
        try {
            if (AU?.readSum && AU.worth) {
                const sum = AU.readSum(sumText(amount, unit, text)); if (!sum?.ok) return '';
                const w = AU.worth(sum, y); return w && Number.isFinite(w.euros) && w.euros > 0 ? i18n('{amount} d’aujourd’hui (ordre de grandeur)', {amount: AU.euroText(w.euros)}) : '';
            }
            const W = ext.tresorMoney?.worth, n = Number(amount);
            if (!W || !(n > 0) || !unit) return '';
            const w = W(unit === 'ecu' ? n * 3 : n, unit === 'ecu' || unit === 'franc' ? 'livre' : unit, y);
            if (!w || !Number.isFinite(w.euros) || w.euros <= 0) return '';
            const e = w.euros >= 100 ? Math.round(w.euros / (w.euros >= 10000 ? 100 : 1)) * (w.euros >= 10000 ? 100 : 1) : Math.round(w.euros * 100) / 100;
            return i18n('≈ {amount} € d’aujourd’hui (ordre de grandeur)', {amount: Number(e)});
        } catch (_) { return ''; }
    }
    function chip(p, {cls = ''} = {}) {
        if (!p) return '';
        const free = !p.id;
        const av = free ? '<span class="sc-free" aria-hidden="true">?</span>'
            : (UI().avatarOr ? UI().avatarOr({id: p.id, name: p.title, gender: p.gender, first_name: String(p.title || '').split(' ')[0], last_name: String(p.title || '').split(' ').slice(1).join(' ')}, 22, `<span class="sc-ini sc-g-${esc(p.gender || 'u')}" aria-hidden="true">${esc(String(p.title || '?').split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase())}</span>`) : '');
        return `<button type="button" class="sc-chip ${cls}${free ? ' is-free' : ''}"${free || p.gone ? ' disabled' : ` data-sc-person="${Number(p.id)}"`} title="${esc(free ? 'Personne sans fiche' : 'Ouvrir la fiche')}">${av}<span>${esc(p.title || 'Sans nom')}</span>${p.role ? `<small>${esc(p.role)}</small>` : ''}</button>`;
    }
    const chips = list => (list || []).map(p => chip(p)).join('');

    /* ═════════ Les données ═════════ */
    let cache = null;
    async function loadAll(force = false) { if (!cache || force) cache = (await get('successions')).items || []; return cache; }
    const changed = () => { cache = null; document.dispatchEvent(new CustomEvent('lcnda:successions-changed')); };

    /* ═════════ 🔀 Schéma de partage (moteur de diagrammes commun : Sankey) ═════════ */
    function shareSpec(a) {
        const goods = a.goods || [];
        const unit = goods[0]?.value_unit || '';
        const byValue = goods.length > 0 && goods.every(g => Number(g.value_amount) > 0 && (g.value_unit || '') === unit);
        const from = mainsOf(a).map(p => p.title).join(' et ') || kindOf(a.kind)[1];
        const rows = [], used = new Set();
        const uniq = n => { let x = n, i = 2; while (used.has(x)) x = `${n} (${i++})`; used.add(x); return x; };
        used.add(from);
        goods.forEach(g => {
            const v = byValue ? Number(g.value_amount) : 1;
            const name = uniq(`${GOODS[g.kind]?.[0] || '📦'} ${goodName(g)}`.slice(0, 80));
            rows.push({from, to: name, value: v});
            const to = recipients(a, g);
            if (to.length) to.forEach(p => rows.push({from: name, to: p.title || 'Sans nom', value: Math.round(v / to.length * 1000) / 1000}));
            else rows.push({from: name, to: 'À qui ? (pas noté)', value: v});
        });
        return {kind: 'sankey', o: {title: `Partage — ${titleOf(a)}`, values: byValue, height: Math.max(220, Math.min(900, goods.length * 70 + 120))}, rows};
    }
    function shareSvg(a, width = 900) {
        const R = ext.diagramRender; if (!R?.svg || !(a.goods || []).length) return '';
        try { return R.svg(shareSpec(a), width); } catch (_) { return ''; }
    }

    /* ═════════ 🏠 La chaîne des propriétaires (frise) ═════════ */
    function chainHtml(chain, {compact = false} = {}) {
        const steps = chain?.steps || [];
        if (!steps.length) return '';
        return `<ol class="sc-frise${compact ? ' is-compact' : ''}" aria-label="Chaîne des propriétaires">${steps.map(s => `<li class="sc-step">
            <span class="sc-step-year">${esc(s.year || '?')}</span>
            <div class="sc-step-card">
                <div class="sc-step-head">${s.source === 'act' ? `<button type="button" class="link-button" data-sc-open="${Number(s.act_id)}">${esc(kindOf(s.act_kind)[0])} ${esc(s.act_title || kindOf(s.act_kind)[1])}</button>` : `<span>🏺 ${esc(s.act_title || 'Transmission')}</span>`}${s.date_text ? ` <small class="muted">${esc(s.date_text)}</small>` : ''}</div>
                ${s.from?.length ? `<div class="sc-step-row"><span class="sc-lbl">De</span>${chips(s.from)}</div>` : ''}
                <div class="sc-step-row"><span class="sc-lbl">À</span>${s.to?.length ? chips(s.to) : '<small class="muted">pas noté</small>'}</div>
                ${s.share || s.value || s.notary || s.note ? `<small class="muted">${esc([s.share, s.value, s.notary ? 'notaire : ' + s.notary : '', s.note].filter(Boolean).join(' · '))}</small>` : ''}
            </div></li>`).join('')}</ol>`;
    }

    /* ═════════ ＋ Nouvel acte / ✎ Modifier ═════════ */
    /** La fenêtre de l'acte. a = l'acte relu (succession) ou null ; prefill = {person: {id, title}, good: {kind, ref_id, ref_title}} */
    function edit(a = null, prefill = {}) {
        const isNew = !a;
        const d = a || {kind: prefill.kind || 'partage', people: [], goods: [], media_ids: []};
        const names = new Map((d.people || []).map(p => [pKey(p), p.title || p.txt || '']));
        const mainP = mainsOf(d)[0];
        const peopleVal = {main: mainP?.id ? {id: mainP.id, title: mainP.title} : (prefill.person ? {id: Number(prefill.person.id), title: prefill.person.title || ''} : null),
            people: (d.people || []).filter(p => p !== mainP).map(p => (p.id ? {id: p.id, title: p.title, role: p.role, primary: p.zone === 'primary'} : {txt: p.txt || p.title, role: p.role, primary: p.zone === 'primary'}))};
        if (prefill.person) names.set(String(prefill.person.id), prefill.person.title || '');
        let goods = (d.goods || []).map(g => ({...g, to: [...(g.to || [])]}));
        if (prefill.good) goods.push({kind: prefill.good.kind, ref_id: prefill.good.ref_id, ref_title: prefill.good.ref_title || '', label: '', to: []});
        if (!goods.length) goods.push({kind: 'land', label: '', to: []});
        const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
        return new Promise(resolve => {
            let saved = null;
            const dlg = ext.openDialog({eyebrow: 'HÉRITAGES ET SUCCESSIONS', title: isNew ? 'Nouvel acte' : i18n('Modifier « {title} »', {title: titleOf(d)}), wide: true, submitLabel: isNew ? 'Créer l’acte' : 'Enregistrer',
                body: `<div class="sc-edit">
                    <div class="form-grid">
                        <label>Sorte d’acte<select name="kind">${opt(Object.entries(KINDS).map(([k, v]) => [k, `${v[0]} ${v[1]}`]), d.kind)}</select></label>
                        <label>Date de l’acte<input name="date_text" data-ui-date maxlength="120" value="${esc(d.date_text || '')}" placeholder="12 mars 1852, vers 1790, an XII…"></label>
                        <label class="span-2">Titre<input name="title" maxlength="200" value="${esc(d.title || '')}" placeholder="Facultatif : sinon « Partage de Jean MARTIN (1852) »"></label>
                        <div><span class="pk-lab">Notaire</span><div data-sc-f="notary">${P().pickerField({name: 'sc_notary', hiddenName: false, kind: 'person', allowFree: true, value: d.notary_person_id ? {id: d.notary_person_id, title: d.notary} : d.notary_text ? 'txt:' + d.notary_text : null})}</div></div>
                        <label>Étude<input name="office_text" maxlength="300" value="${esc(d.office_text || '')}" placeholder="Étude de Me Lafon, Tulle"></label>
                        <div><span class="pk-lab">Lieu de l’acte</span><div data-sc-f="place">${P().pickerField({name: 'sc_place', hiddenName: false, kind: 'place', value: d.place_id ? {id: d.place_id, title: d.place} : null})}</div></div>
                        <label>Cote aux archives<input name="cote" maxlength="200" value="${esc(d.cote || '')}" placeholder="3 E 12/345, MC/ET/XLV/123"></label>
                        <div><span class="pk-lab">Source</span><div data-sc-f="source">${P().pickerField({name: 'sc_source', hiddenName: false, kind: 'source', value: d.source_id ? {id: d.source_id, title: d.source_title} : null})}</div></div>
                        <div><span class="pk-lab">Inventaire après décès relié <small class="muted">(facultatif)</small></span><div data-sc-f="probate">${P().pickerField({name: 'sc_probate', hiddenName: false, kind: 'probate', value: d.probate_id ? {id: d.probate_id, title: d.probate_title} : null})}</div></div>
                    </div>
                    <h4 class="sc-h">👥 Les personnes</h4>
                    <p class="ui-hint">${i18n('⭐ La personne principale :')} <b data-sc-giver>${esc(i18n(kindOf(d.kind)[2]))}</b>. ${i18n('★ ceux qui reçoivent ; ☆ les autres (témoins, tuteur…).')}</p>
                    <div data-sc-f="people">${P().pickerField({name: 'sc_people', hiddenName: false, kind: 'person', allowFree: true, roles: {main: true, roleList: ROLES, zones: ZONES}, value: peopleVal})}</div>
                    <h4 class="sc-h">📦 Les biens et à qui ils vont</h4>
                    <div class="sc-goods" data-sc-goods></div>
                    <button type="button" class="button small secondary" data-sc-addgood>＋ Ajouter un bien</button>
                    <h4 class="sc-h">🖼 L’acte (images)</h4>
                    <div data-sc-f="media">${P().mediaField ? P().mediaField({name: '', multiple: true, types: ['image', 'document'], value: d.media_ids || [], title: 'Images de l’acte', okLabel: 'Relier ces images'}) : ''}</div>
                    <div class="form-grid"><label class="span-2">Notes<textarea name="notes" rows="3" maxlength="20000" placeholder="Clauses, conditions, rentes, ce que dit l’acte…">${esc(d.notes || '')}</textarea></label></div>
                    <p class="ui-hint">${esc(NOT_LEGAL)}</p>
                </div>`,
                onOpen: dg => {
                    const f = dg.querySelector('form'), box = dg.querySelector('[data-sc-goods]');
                    const peopleEl = dg.querySelector('[data-sc-f="people"] .pk');
                    const benList = () => {
                        const v = P().pickerValue(peopleEl) || {people: []};
                        return (v.people || []).filter(x => x.primary).map(x => { const k = x.id ? String(x.id) : 'txt:' + (x.txt || ''); return {key: k, title: names.get(k) || x.txt || `#${x.id}`}; });
                    };
                    const year = () => { const m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(f.elements.date_text.value || ''); return m ? Number(m[1]) : 0; };
                    const rowHtml = (g, i) => {
                        const ben = benList(), rk = REF_KIND[g.kind];
                        return `<div class="sc-good" data-i="${i}">
                            <div class="sc-good-top"><label class="sc-good-kind">Bien<select data-g="kind">${opt(Object.entries(GOODS).map(([k, v]) => [k, `${v[0]} ${v[1]}`]), g.kind)}</select></label>
                                ${rk ? `<div class="sc-good-ref"><span class="pk-lab">${esc(GOODS[g.kind][1])}</span><div data-g="ref">${P().pickerField({name: `sc_ref_${i}`, hiddenName: false, kind: rk, value: g.ref_id ? {id: g.ref_id, title: g.ref_title || `#${g.ref_id}`} : null})}</div></div>` : ''}
                                <label class="sc-good-label">${rk ? 'Précision <small class="muted">(facultatif)</small>' : 'Ce que c’est'}<input data-g="label" maxlength="300" value="${esc(g.label || '')}" placeholder="${rk ? 'la moitié, le rez-de-chaussée…' : g.kind === 'money' ? 'la dot, une rente…' : 'le pré des Combes, l’armoire de noyer…'}"></label>
                                <button type="button" class="icon-button small sc-good-x" data-g="remove" aria-label="Retirer ce bien" title="Retirer ce bien">✕</button></div>
                            <div class="sc-good-mid">
                                <label>Valeur<input data-g="value_amount" type="number" min="0" step="any" value="${esc(g.value_amount ?? '')}" placeholder="1200"></label>
                                <label>Monnaie<select data-g="value_unit">${opt(UNITS, g.value_unit || '')}</select></label>
                                <label>Valeur écrite <small class="muted">(comme dans l’acte)</small><input data-g="value_text" maxlength="200" value="${esc(g.value_text || '')}" placeholder="1 200 livres 5 sols"></label>
                                <label>Part<input data-g="share_text" maxlength="200" value="${esc(g.share_text || '')}" placeholder="un tiers, en usufruit, la moitié…"></label>
                            </div>
                            <small class="ui-hint" data-g="worth">${esc(worthText(g.value_amount, g.value_unit, year(), g.value_text))}</small>
                            <div class="sc-good-to"><span class="sc-lbl">À qui</span>${ben.length ? ben.map(b => `<label class="checkbox-line sc-to"><input type="checkbox" data-g="to" value="${esc(b.key)}"${(g.to || []).includes(b.key) ? ' checked' : ''}>${esc(b.title)}</label>`).join('') + `<small class="muted">${(g.to || []).some(k => ben.some(b => b.key === k)) ? '' : 'rien de coché : à tous les héritiers'}</small>` : '<small class="muted">Ajoute d’abord les héritiers (★) plus haut.</small>'}</div>
                        </div>`;
                    };
                    const readRows = () => [...box.querySelectorAll('.sc-good')].map(r => {
                        const i = Number(r.dataset.i), g = goods[i] || {}, q = k => r.querySelector(`[data-g="${k}"]`);
                        const refEl = r.querySelector('[data-g="ref"] .pk'), refV = refEl ? P().pickerValue(refEl) : null;
                        return {...g, kind: q('kind').value, ref_id: Number(refV) || null, label: q('label').value, value_amount: q('value_amount').value === '' ? null : Number(q('value_amount').value),
                            value_unit: q('value_unit').value, value_text: q('value_text').value, share_text: q('share_text').value,
                            to: r.querySelector('[data-g="to"]') ? [...r.querySelectorAll('[data-g="to"]:checked')].map(c => c.value) : [...(g.to || [])]};
                    });
                    const paintWorth = r => { const q = k => r.querySelector(`[data-g="${k}"]`); q('worth').textContent = worthText(q('value_amount').value, q('value_unit').value, year(), q('value_text').value); };
                    const paint = () => { box.innerHTML = goods.length ? goods.map(rowHtml).join('') : A().empty('Aucun bien noté', {icon: '📦'}); };
                    paint();
                    dg.addEventListener('picker-change', e => {
                        if (e.target.closest('[data-g="ref"]')) { const r = e.target.closest('.sc-good'), it = e.detail.item; if (r && goods[Number(r.dataset.i)]) goods[Number(r.dataset.i)].ref_title = it?.title || ''; return; }
                        if (!e.target.closest('[data-sc-f="people"]')) return;
                        const its = e.detail.items; if (its) [its.main, ...(its.people || [])].filter(Boolean).forEach(x => names.set(x.free ? 'txt:' + x.title : String(x.id), x.title || ''));
                        goods = readRows(); paint();
                    });
                    box.addEventListener('change', e => {
                        const r = e.target.closest('.sc-good'); if (!r) return;
                        if (e.target.matches('[data-g="kind"]')) { goods = readRows(); const g = goods[Number(r.dataset.i)]; if (g) { g.ref_id = null; g.ref_title = ''; } paint(); return; }
                        if (e.target.matches('[data-g="to"]')) { goods = readRows(); paint(); return; }
                        if (e.target.matches('[data-g="value_amount"],[data-g="value_unit"],[data-g="value_text"]')) paintWorth(r);
                    });
                    box.addEventListener('click', e => {
                        const b = e.target.closest('[data-g="remove"]'); if (!b) return;
                        goods = readRows(); goods.splice(Number(b.closest('.sc-good').dataset.i), 1); paint();
                    });
                    dg.querySelector('[data-sc-addgood]').addEventListener('click', () => { goods = readRows(); goods.push({kind: 'land', label: '', to: []}); paint(); box.querySelector('.sc-good:last-child [data-g="kind"]')?.focus(); });
                    f.elements.kind.addEventListener('change', () => { dg.querySelector('[data-sc-giver]').textContent = i18n(kindOf(f.elements.kind.value)[2]); });
                    f.elements.date_text.addEventListener('change', () => box.querySelectorAll('.sc-good').forEach(paintWorth));
                    dg.addEventListener('close', () => resolve(saved), {once: true});
                    setTimeout(() => (isNew ? f.elements.date_text : f.elements.title).focus(), 40);
                    dg._scRead = readRows;
                },
                onDelete: a ? async () => { await remove(a); return true; } : null,
                onSubmit: async f => {
                    const dg = f.closest('dialog');
                    const val = name => P().pickerValue(dg.querySelector(`[data-sc-f="${name}"] .pk`));
                    const rows = dg._scRead ? dg._scRead() : [];
                    const pv = val('people') || {main: null, people: []};
                    const notary = val('notary');
                    const v = A().formObject(f);
                    if (!pv.main && !(pv.people || []).length && !rows.some(g => g.ref_id || String(g.label || '').trim()) && !String(v.title || '').trim()) return UI().fail(dg.querySelector('[data-sc-f="people"] .pk-input') || f.elements.title, 'Choisis au moins le défunt (ou le donateur), un héritier ou un bien.');
                    const body = {id: a?.id || 0, kind: v.kind, title: v.title, date_text: v.date_text, office_text: v.office_text, cote: v.cote, notes: v.notes,
                        notary_person_id: typeof notary === 'number' ? notary : 0, notary_text: typeof notary === 'string' && notary.startsWith('txt:') ? notary.slice(4) : '',
                        place_id: Number(val('place')) || 0, source_id: Number(val('source')) || 0, probate_id: Number(val('probate')) || 0,
                        media_ids: [].concat(P().mediaValue?.(dg.querySelector('[data-sc-f="media"] [data-media-field]')) || []).map(Number).filter(Boolean),
                        people: {main: pv.main ? {id: pv.main} : null, people: (pv.people || []).map(x => ({...x, zone: x.primary ? 'primary' : 'secondary'}))},
                        goods: rows.map(g => ({kind: g.kind, ref_id: g.ref_id || 0, label: g.label, value_amount: g.value_amount, value_unit: g.value_unit, value_text: g.value_text, share_text: g.share_text, to: g.to || []}))};
                    const r = res(await post('save_succession', body));
                    saved = r; changed();
                    if (isNew) A().undoToast(i18n('Acte « {title} » créé', {title: r.title}), {icon: '', undo: async () => { await post('delete_succession', {id: r.id}); changed(); await refresh(); }, redo: async () => { await post('restore_succession', {id: r.id}); changed(); await refresh(); }});
                    else if (r.before) { const before = r.before; A().undoToast(i18n('Acte « {title} » enregistré', {title: r.title}), {icon: '', undo: async () => { await post('save_succession', before); changed(); await refresh(); }, redo: async () => { await post('save_succession', body); changed(); await refresh(); }}); }
                    else toast('Enregistré', 'success');
                }});
            if (!dlg) resolve(null);
        });
    }

    async function remove(a, after = null) {
        await post('delete_succession', {id: a.id});
        changed();
        const again = after || refresh;
        A().undoToast(i18n('Acte « {title} » supprimé', {title: titleOf(a)}), {
            undo: async () => { await post('restore_succession', {id: a.id}); changed(); await again(); },
            redo: async () => { await post('delete_succession', {id: a.id}); changed(); await again(); }});
        if (Number(S().succId) === Number(a.id)) S().succId = 0;
        await again();
    }
    const refresh = async () => { if (S().module === 'listes' && S().listType === 'successions') await A().renderList?.(); };

    /* ═════════ La liste ═════════ */
    function itemOf(a, view) {
        const k = kindOf(a.kind), mains = mainsOf(a), ben = benOf(a);
        const refs = (a.goods || []).filter(g => g.ref_id);
        return {thumb: `<span class="ui-card-ico" aria-hidden="true">${k[0]}</span>`, name: titleOf(a), open: `data-sc-open="${a.id}"`,
            lines: [[k[1], a.date_text, a.notary ? 'Me ' + a.notary.replace(/^(Me|Maître)\s+/i, '') : '', a.place].filter(Boolean).join(' · '),
                [mains.map(p => p.title).join(', '), ben.length ? `→ ${ben.slice(0, 4).map(p => p.title).join(', ')}${ben.length > 4 ? '…' : ''}` : ''].filter(Boolean).join(' ')],
            badges: [(a.goods || []).length ? {text: plural(a.goods.length, 'bien'), kind: 'blue'} : null, refs.some(g => g.kind === 'house') ? {text: 'maison', kind: 'green'} : null, a.probate_id ? {text: 'inventaire', kind: 'grey'} : null].filter(Boolean),
            when: a.updated_at, whenLabel: 'Modifié',
            menu: ro() ? [] : [`<button type="button" data-sc-edit="${a.id}">✎ Modifier</button>`, (a.goods || []).length ? `<button type="button" data-sc-share="${a.id}">🔀 Schéma de partage</button>` : '', `<button type="button" class="danger" data-sc-del="${a.id}">🗑 Supprimer</button>`].filter(Boolean),
            actions: view === 'list' ? `<button type="button" class="button small secondary" data-sc-open="${a.id}">↗ Ouvrir</button>` : '', attrs: `data-sc-row="${a.id}"`};
    }

    async function renderList(token) {
        if (Number(S().succId)) return renderSheet(token, Number(S().succId));
        const ws = A().$('#workspace'); if (!ws || !isCurrent(token)) return;
        ws.innerHTML = `<section class="page sc-page">${UI().pageHeader({title: 'Héritages et successions', icon: '🏠',
            help: 'Qui a hérité de quoi, d’après les actes : testaments, partages, inventaires après décès, donations, ventes entre héritiers, contrats de mariage. Relie le défunt, les héritiers et les biens (maisons, parcelles, objets de famille).',
            primary: ro() ? '' : '<button type="button" class="button" data-sc-new>＋ Nouvel acte</button>',
            more: ['<button type="button" data-sc-sheet>🧮 Ouvrir dans le tableur</button>', '<button type="button" data-sc-faq>❓ Comment noter un héritage ?</button>']})}
            <div data-sc-bar></div><div data-sc-list>${UI().spinner('Chargement des actes…')}</div><p class="ui-hint sc-legal">${esc(NOT_LEGAL)}</p></section>`;
        let all;
        try { all = await loadAll(true); } catch (e) { if (isCurrent(token)) ws.querySelector('[data-sc-list]').innerHTML = UI().notice('error', e.message || 'Chargement impossible.'); return; }
        if (!isCurrent(token)) return;
        const count = fn => all.filter(fn).length;
        let shown = 60, bar = null;
        bar = UI().listBar({key: KEY, search: {placeholder: 'Chercher… (personne, bien, notaire, lieu, cote)'},
            filters: [{id: 'kind', label: 'Sorte d’acte', type: 'check', options: Object.entries(KINDS).filter(([k]) => count(x => x.kind === k)).map(([k, v]) => [k, `${v[0]} ${v[1]} (${count(x => x.kind === k)})`, v[1]])},
                {id: 'goods', label: 'Biens', type: 'check', options: [['house', i18n('Avec une maison ({n})', {n: count(x => x.goods.some(g => g.kind === 'house' && g.ref_id))}), 'Avec une maison'], ['parcel', i18n('Avec une parcelle ({n})', {n: count(x => x.goods.some(g => g.kind === 'parcel' && g.ref_id))}), 'Avec une parcelle'], ['object', i18n('Avec un objet de famille ({n})', {n: count(x => x.goods.some(g => g.kind === 'object' && g.ref_id))}), 'Avec un objet']]}],
            view: {dflt: 'list', what: 'actes'}, sort: {options: [['old', 'Les plus anciens'], ['new', 'Les plus récents'], ['az', 'A → Z'], ['za', 'Z → A'], ['recent', 'Modifiés récemment']], value: 'old'},
            onChange: () => { shown = 60; if (bar) paint(); }});
        ws.querySelector('[data-sc-bar]').replaceWith(bar);
        const box = ws.querySelector('[data-sc-list]');
        function paint() {
            const st = bar.state, q = fold(st.q).trim(), f = st.filters;
            let rows = all.filter(x => (!q || q.split(/\s+/).every(w => fold([titleOf(x), kindOf(x.kind)[1], x.date_text, x.notary, x.office_text, x.place, x.cote, x.notes, ...x.people.map(p => p.title + ' ' + p.role), ...x.goods.map(g => goodName(g) + ' ' + g.value_text)].join(' ')).includes(w)))
                && (!(f.kind || []).length || f.kind.includes(x.kind))
                && (!(f.goods || []).length || f.goods.every(k => x.goods.some(g => g.kind === k && g.ref_id))));
            const yr = x => x.year || 99999;
            rows = st.sort === 'new' ? [...rows].sort((a, b) => (b.year || 0) - (a.year || 0))
                : st.sort === 'az' || st.sort === 'za' ? [...rows].sort((a, b) => titleOf(a).localeCompare(titleOf(b), 'fr') * (st.sort === 'za' ? -1 : 1))
                : st.sort === 'recent' ? UI().sortItems(rows, 'recent', {name: titleOf, date: x => x.updated_at})
                : [...rows].sort((a, b) => yr(a) - yr(b));
            bar.setCount(rows.length === all.length ? plural(all.length, 'acte') : `${plural(rows.length, 'acte')} sur ${all.length}`);
            if (!all.length) { box.innerHTML = A().emptyState({icon: '🏠', text: 'Aucun acte pour l’instant', hint: 'Un testament, un partage, un inventaire après décès, une donation, une dot : note le défunt (ou le donateur), les héritiers, et ce que chacun a reçu.', action: ro() ? null : {label: '＋ Nouvel acte', attrs: 'data-empty-click="[data-sc-new]"'}}); return; }
            if (!rows.length) { box.innerHTML = A().emptyState({icon: '🔍', text: 'Rien ne correspond', hint: 'Enlève un filtre, ou cherche autrement (un nom, un notaire, un bien).'}); return; }
            const view = st.view === 'cards' ? 'cards' : 'list';
            box.innerHTML = UI().itemsHtml(view, rows.slice(0, shown).map(x => itemOf(x, view)));
            if (rows.length > shown) box.appendChild(UI().moreButton({remaining: rows.length - shown, step: 60, onClick: () => { shown += 60; paint(); }}));
        }
        paint();
        ws.addEventListener('click', async e => {
            const t = e.target.closest?.('[data-sc-open],[data-sc-new],[data-sc-edit],[data-sc-del],[data-sc-share],[data-sc-sheet],[data-sc-faq]'); if (!t || t.closest('.sc-sheet')) return;
            const row = id => all.find(x => Number(x.id) === Number(id));
            try {
                if (t.matches('[data-sc-open]')) { e.preventDefault(); S().succId = Number(t.dataset.scOpen); return refresh(); }
                if (t.matches('[data-sc-new]')) { const r = await edit(null); if (r) { S().succId = r.id; await refresh(); } return; }
                if (t.matches('[data-sc-edit]')) { if (await edit(await get('succession', {id: Number(t.dataset.scEdit)}))) await refresh(); return; }
                if (t.matches('[data-sc-del]')) { const r = row(t.dataset.scDel); if (r) await remove(r); return; }
                if (t.matches('[data-sc-share]')) { const r = row(t.dataset.scShare); if (r) openShare(r); return; }
                if (t.matches('[data-sc-sheet]')) {
                    const head = ['Acte', 'Sorte', 'Date', 'Notaire', 'Lieu', 'Cote', 'De', 'Bien', 'Valeur', 'Part', 'À qui'];
                    const lines = all.flatMap(a => (a.goods.length ? a.goods : [null]).map(g => [titleOf(a), kindOf(a.kind)[1], a.date_text, a.notary, a.place, a.cote, mainsOf(a).map(p => p.title).join(', '),
                        g ? goodName(g) : '', g ? valueText(g) : '', g ? g.share_text : '', g ? recipients(a, g).map(p => p.title).join(', ') : benOf(a).map(p => p.title).join(', ')]));
                    if (ext.openRowsInSheet) ext.openRowsInSheet({name: 'Héritages et successions', rows: [head, ...lines]}); else toast('Le tableur n’est pas chargé.', 'error');
                    return;
                }
                if (t.matches('[data-sc-faq]')) UI().openFaq?.('Comment noter qui a hérité de quoi (testament, partage, inventaire après décès) ?');
            } catch (err) { toast(err.message, 'error'); }
        }, {signal: A().listControllerSignal?.()});
    }

    /* ═════════ La fiche d'un acte ═════════ */
    function cardSec(title, body, actions = '', cls = '') { return `<section class="card sc-card ${cls}"><header class="card-head"><div class="card-title"><h3>${title}</h3></div>${actions ? `<div class="card-head-actions">${actions}</div>` : ''}</header><div class="card-body">${body}</div></section>`; }
    function sheetHtml(a, {dialog = false} = {}) {
        const k = kindOf(a.kind);
        const row = (lab, val) => (val ? `<div class="sc-dl-row"><dt>${esc(lab)}</dt><dd>${val}</dd></div>` : '');
        const mains = mainsOf(a);
        const view = P().pickerView ? P().pickerView({main: mains[0] ? (mains[0].id ? {id: mains[0].id, title: mains[0].title, gender: mains[0].gender} : null) : null,
            people: [...mains.slice(1), ...(a.people || []).filter(p => p.zone !== 'main')].map(p => (p.id ? {id: p.id, title: p.title, role: p.role, primary: p.zone === 'primary'} : {txt: p.title, title: p.title, free: true, role: p.role, primary: p.zone === 'primary'})),
            labels: {primary: '★ Héritiers et bénéficiaires', secondary: '☆ Autres personnes'}}) : chips(a.people);
        const goods = a.goods || [];
        const gRows = goods.map(g => {
            const to = recipients(a, g), w = worthText(g.value_amount, g.value_unit, a.year, g.value_text), st = sumText(g.value_amount, g.value_unit, g.value_text);
            return `<tr><td><span class="sc-gico" aria-hidden="true">${esc(GOODS[g.kind]?.[0] || '📦')}</span> ${g.ref_id && !g.gone ? `<button type="button" class="link-button" data-sc-ref="${esc(g.kind)}:${Number(g.ref_id)}">${esc(goodName(g))} ↗</button>` : esc(goodName(g))}${g.gone ? ' <small class="muted">(fiche supprimée)</small>' : ''}${g.ref_meta ? `<br><small class="muted">${esc(g.ref_meta)}</small>` : ''}</td>
                <td>${esc(valueText(g))}${w ? `<br><small class="muted">${esc(w)}</small>` : ''}${st && ext.autrefois?.open ? ` <button type="button" class="icon-button small" data-sc-convert="${esc(st)}" title="Convertisseur d’autrefois" aria-label="Convertisseur d’autrefois">🪙</button>` : ''}</td><td>${esc(g.share_text || '')}</td><td class="sc-to-cell">${to.length ? chips(to) : '<small class="muted">pas noté</small>'}${!g.to?.length && to.length ? '<br><small class="muted">tous les héritiers</small>' : ''}</td></tr>`;
        }).join('');
        const svg = shareSvg(a, dialog ? 860 : 1000);
        const media = a.media || [];
        return `<div class="sc-sheet${dialog ? ' is-dialog' : ''}">
            <div class="sc-grid">
                ${cardSec(`${esc(k[0])} L’acte`, `<dl class="sc-dl">${row('Sorte', esc(k[1]))}${row('Date', esc(a.date_text))}${row('Notaire', esc(a.notary))}${row('Étude', esc(a.office_text))}${row('Lieu', esc(a.place))}${row('Cote', esc(a.cote))}
                    ${row('Source', esc(a.source_title))}${a.probate_id ? row('Inventaire après décès', `<button type="button" class="link-button" data-sc-probate="${Number(a.probate_id)}">${esc(a.probate_title || 'Ouvrir l’inventaire')} ↗</button>`) : ''}</dl>
                    ${!a.date_text && !a.notary && !a.place ? A().empty('Ni date, ni notaire, ni lieu notés', {icon: '📜'}) : ''}`)}
                ${cardSec(`👥 Les personnes <small>(${(a.people || []).length})</small>`, (a.people || []).length ? view : A().empty('Aucune personne reliée', {icon: '👥', action: ro() ? null : {label: '✎ Modifier', attrs: 'data-empty-click="[data-sc-editme]"'}}))}
            </div>
            ${cardSec(`📦 Les biens et à qui ils vont <small>(${goods.length})</small>`, goods.length ? `<div class="data-table-wrap"><table class="data-table sc-goods-table"><thead><tr><th>Bien</th><th>Valeur</th><th>Part</th><th>À qui</th></tr></thead><tbody>${gRows}</tbody></table></div>`
                : A().empty('Aucun bien noté', {icon: '📦', action: ro() ? null : {label: '＋ Ajouter un bien', attrs: 'data-empty-click="[data-sc-editme]"'}}))}
            ${goods.length ? cardSec('🔀 Schéma de partage', svg ? `<div class="sc-share">${svg}</div><p class="ui-hint">De qui, quels biens, à qui${shareSpec(a).o.values ? ' (en valeur)' : ' (un bien = une part ; partagé à parts égales quand plusieurs personnes le reçoivent)'}.</p>` : A().empty('Le dessin n’est pas encore chargé', {icon: '🔀'}),
                ro() ? '' : '<button type="button" class="button small secondary" data-sc-todiagram>📊 Modifier dans Mes diagrammes</button>') : ''}
            ${media.length ? cardSec(`🖼 Images de l’acte <small>(${media.length})</small>`, `<div class="sc-media">${media.map((m, i) => `<button type="button" class="sc-mthumb" data-sc-media="${i}" title="${esc(m.title)}">${m.filename && /image/.test(m.media_type || 'image') ? `<img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy">` : '<span>📄</span>'}<small>${esc(m.title)}</small></button>`).join('')}</div>`) : ''}
            ${a.notes ? cardSec('📝 Notes', `<p class="sc-notes">${esc(a.notes).replace(/\n/g, '<br>')}</p>`) : ''}
            <p class="ui-hint sc-legal">${esc(NOT_LEGAL)}</p>
        </div>`;
    }
    function bindSheet(root, a, {reload, dialogEl = null} = {}) {
        root.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
            try {
                if (b.dataset.scRef) { const [k, id] = b.dataset.scRef.split(':'); openRef(k, Number(id), dialogEl); return; }
                if (b.dataset.scProbate) { dialogEl?.close(); S().listType = 'probate'; S().succId = 0; await A().setModule('listes'); return; }
                if (b.dataset.scConvert) { ext.autrefois?.open?.({tab: 'argent', value: b.dataset.scConvert, year: a.year || ''}); return; }
                if (b.dataset.scMedia !== undefined) { A().openLightbox?.((a.media || []).map(m => ({...m, media_type: m.media_type || 'image'})), Number(b.dataset.scMedia)); return; }
                if (b.matches('[data-sc-todiagram]')) { ext.openDiagramEditor ? ext.openDiagramEditor(null, {spec: shareSpec(a), name: `Partage — ${titleOf(a)}`}) : toast('Les diagrammes ne sont pas chargés.', 'error'); return; }
                if (b.matches('[data-sc-editme]')) { if (await edit(await get('succession', {id: a.id}))) reload?.(); }
            } catch (err) { toast(err.message, 'error'); }
        });
    }
    function openRef(kind, id, dialogEl) {
        if (kind === 'house') { ext.openHouse?.({id}); return; }
        if (kind === 'parcel') { ext.cadastre?.open ? ext.cadastre.open(id, {dialog: true}) : toast('Le cadastre n’est pas chargé.', 'error'); return; }
        if (kind === 'object') { dialogEl?.close(); S().listType = 'family_objects'; S().succId = 0; A().setModule('listes').then(() => A().renderFamilyObjectsList?.(++S().workspaceToken, id)); }
    }
    function openShare(a) {
        ext.openDialog({eyebrow: 'SCHÉMA DE PARTAGE', title: titleOf(a), wide: true, submitLabel: 'Fermer',
            body: `<div class="sc-share">${shareSvg(a, 900) || A().empty('Aucun bien noté', {icon: '📦'})}</div>`, onSubmit: async () => true});
    }

    async function renderSheet(token, id) {
        const ws = A().$('#workspace'); if (!ws || !isCurrent(token)) return;
        ws.innerHTML = `<section class="page sc-page">${UI().spinner('Chargement de l’acte…')}</section>`;
        let a;
        try { a = await get('succession', {id}); }
        catch (e) { if (!isCurrent(token)) return; S().succId = 0; ws.innerHTML = `<section class="page sc-page">${UI().notice('error', e.message || 'Acte introuvable.')}<p><button type="button" class="button secondary" data-sc-back>← Tous les actes</button></p></section>`; ws.querySelector('[data-sc-back]').addEventListener('click', refresh); return; }
        if (!isCurrent(token)) return;
        if (a.deleted) { S().succId = 0; return refresh(); }
        const k = kindOf(a.kind);
        ws.innerHTML = `<section class="page sc-page">${UI().pageHeader({title: titleOf(a), detail: true, icon: k[0],
            help: esc([k[1], a.date_text, a.notary ? 'notaire : ' + a.notary : '', a.place].filter(Boolean).join(' · ')),
            primary: ro() ? '' : '<button type="button" class="button" data-sc-editme>✎ Modifier</button>',
            actions: ['<button type="button" class="button secondary" data-sc-back>← Tous les actes</button>'],
            more: ro() ? [] : ['<button type="button" class="danger" data-sc-delme>🗑 Supprimer</button>']})}${sheetHtml(a)}</section>`;
        const page = ws.querySelector('.sc-page');
        const again = () => renderSheet(++S().workspaceToken, id);
        bindSheet(page, a, {reload: again});
        page.querySelector('[data-sc-back]').addEventListener('click', () => { S().succId = 0; refresh(); });
        page.querySelector('[data-sc-delme]')?.addEventListener('click', () => remove(a).catch(err => toast(err.message, 'error')));
    }

    /** ↗ Ouvrir : la page dans Listes, ou une fenêtre par-dessus (fiche d'une personne, maison, objet) */
    async function open(id, {dialog = false} = {}) {
        if (!dialog) { document.querySelectorAll('dialog[open]').forEach(x => { try { x.close(); } catch (_) {} }); S().succId = Number(id); S().listType = 'successions'; return A().setModule('listes'); }
        let a; try { a = await get('succession', {id}); } catch (e) { toast(e.message, 'error'); return; }
        let dlgRef = null;
        const reload = async () => { if (!dlgRef?.open) return; try { a = await get('succession', {id}); dlgRef.querySelector('.h-dialog-body').innerHTML = sheetHtml(a, {dialog: true}); } catch (_) {} };
        ext.openDialog({eyebrow: 'HÉRITAGES ET SUCCESSIONS', title: titleOf(a), wide: true, body: sheetHtml(a, {dialog: true}),
            onOpen: dg => { dlgRef = dg; bindSheet(dg.querySelector('.h-dialog-body'), a, {reload, dialogEl: dg});
                dg.querySelector('.modal-actions .spacer')?.insertAdjacentHTML('beforebegin', `<button type="button" class="button secondary" data-sc-full>↗ Ouvrir la fiche</button>${ro() ? '' : '<button type="button" class="button secondary" data-sc-editd>✎ Modifier</button>'}`);
                dg.querySelector('[data-sc-full]').addEventListener('click', () => open(id));
                dg.querySelector('[data-sc-editd]')?.addEventListener('click', async () => { if (await edit(await get('succession', {id}))) reload(); }); }});
    }

    ext.lists.successions = renderList;

    /* ═════════ Les blocs : maison, objet de famille (chaîne des propriétaires), personne ═════════ */
    async function fillHost(host) {
        if (host.dataset.scDone === '1') return; host.dataset.scDone = '1';
        const kind = host.dataset.succHost, id = Number(host.dataset.succId) || 0, name = host.dataset.succName || '';
        if (!id || !['house', 'parcel', 'object'].includes(kind)) return;
        host.innerHTML = UI().spinner('…');
        let chain;
        try { chain = await get('succession_chain', {kind, id}); } catch (e) { host.innerHTML = UI().notice('error', e.message); return; }
        const steps = chain.steps || [];
        const btn = ro() ? '' : `<button type="button" class="button small secondary" data-sc-hadd>${kind === 'house' ? i18n('＋ Nouvel acte pour cette maison') : kind === 'parcel' ? i18n('＋ Nouvel acte pour cette parcelle') : i18n('＋ Nouvel acte pour cet objet')}</button>`;
        host.innerHTML = `<div class="sc-host">${kind === 'object' ? '<h4>🏠 Chaîne des propriétaires</h4>' : ''}${steps.length ? chainHtml(chain, {compact: kind !== 'house'}) : A().empty(kind === 'house' ? 'Aucun acte de succession pour cette maison' : 'Aucun acte de succession pour l’instant', {icon: '🏠'})}<div class="sc-host-btns">${btn}</div></div>`;
        host.querySelector('[data-sc-hadd]')?.addEventListener('click', async () => {
            const r = await edit(null, {good: {kind, ref_id: id, ref_title: chain.title || name}});
            if (r) { host.dataset.scDone = ''; fillHost(host); }
        });
    }
    // un clic sur un acte ou une personne de la frise, d'un bloc, d'une fiche
    document.addEventListener('click', e => {
        const o = e.target.closest?.('[data-sc-open]');
        if (o && o.closest('.sc-frise, .sc-pblock, .sc-host')) { e.preventDefault(); open(Number(o.dataset.scOpen), {dialog: true}); return; }
        const p = e.target.closest?.('[data-sc-person]');
        if (p) { e.preventDefault(); document.querySelectorAll('dialog[open]').forEach(x => { try { x.close(); } catch (_) {} }); A().openPersonById(Number(p.dataset.scPerson)); }
    });
    // ↗ Ouvrir depuis le menu de choix : objets de famille, inventaires après décès
    document.addEventListener('picker-open', e => {
        const it = e.detail?.item; if (!it || !['fobject', 'probate'].includes(it.kind)) return;
        e.preventDefault();
        document.querySelectorAll('dialog[open]').forEach(x => { try { x.close(); } catch (_) {} });
        if (it.kind === 'fobject') { S().listType = 'family_objects'; A().setModule('listes').then(() => A().renderFamilyObjectsList?.(++S().workspaceToken, Number(it.id))); }
        else { S().listType = 'probate'; A().setModule('listes'); }
    });
    const scan = root => root.querySelectorAll?.('[data-succ-host]:not([data-sc-done="1"])').forEach(fillHost);
    new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('[data-succ-host]')) fillHost(n); else scan(n); } }).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('lcnda:successions-changed', () => document.querySelectorAll('[data-succ-host][data-sc-done="1"]').forEach(h => { h.dataset.scDone = ''; fillHost(h); }));

    // 🏠 Maison → onglet Maison : « 🏠 Chaîne des propriétaires »
    ext.housePaneExtras.push(ctx => {
        if (!ctx?.houseId) return '';
        const sec = ctx.sec || ((t, k, b) => `<details class="ui-section" open><summary>${esc(t)}</summary><div class="ui-section-body">${b}</div></details>`);
        return sec('🏠 Chaîne des propriétaires (héritages)', 'h-succ', `<div data-succ-host="house" data-succ-id="${Number(ctx.houseId)}" data-succ-name="${esc(ctx.name || '')}"></div>`, false);
    });

    // 👤 la fiche d'une personne : « Ce qu'il a reçu / transmis »
    ext.personBlocks.successions = (index, detail) => {
        const list = detail.heritage?.successions || [], person = detail.person || {}, pid = Number(person.id) || 0;
        if (!list.length || !pid) return '';
        const f = person.gender === 'female', il = f ? 'elle' : 'il';
        const got = list.filter(x => x.side === 'got'), gave = list.filter(x => x.side === 'gave'), other = list.filter(x => x.side === 'other');
        const k = x => kindOf(x.kind);
        const when = x => [x.date_text, x.place].filter(Boolean).join(' · ');
        const gotRows = got.map(x => ({thumb: `<span class="ui-card-ico" aria-hidden="true">${k(x)[0]}</span>`, name: x.received.length ? x.received.map(goodName).join(', ') : f ? i18n('{kind} (sans bien noté pour elle)', {kind: k(x)[1]}) : i18n('{kind} (sans bien noté pour lui)', {kind: k(x)[1]}), open: `data-sc-open="${x.id}"`,
            lines: [[k(x)[1], when(x)].filter(Boolean).join(' · '), x.main.length ? `de ${x.main.map(p => p.title).join(', ')}` : '', [x.role, ...x.received.map(g => [valueText(g), g.share_text].filter(Boolean).join(', '))].filter(Boolean).join(' · ')].filter(Boolean)}));
        const gaveRows = gave.map(x => ({thumb: `<span class="ui-card-ico" aria-hidden="true">${k(x)[0]}</span>`, name: titleOf({...x, people: x.main.map(p => ({...p, zone: 'main'}))}), open: `data-sc-open="${x.id}"`,
            lines: [when(x), x.goods.length ? x.goods.map(g => goodName(g)).slice(0, 4).join(', ') + (x.goods.length > 4 ? '…' : '') : '', x.beneficiaries.length ? `→ ${x.beneficiaries.map(p => p.title).join(', ')}` : ''].filter(Boolean)}));
        const otherRows = other.map(x => ({thumb: `<span class="ui-card-ico" aria-hidden="true">${k(x)[0]}</span>`, name: titleOf({...x, people: x.main.map(p => ({...p, zone: 'main'}))}), open: `data-sc-open="${x.id}"`, lines: [[x.role, when(x)].filter(Boolean).join(' · ')]}));
        const body = `<div class="sc-pblock">${got.length ? `<h4>${f ? i18n('🎁 Ce qu’elle a reçu') : i18n('🎁 Ce qu’il a reçu')}</h4>${UI().rowsHtml(gotRows)}` : ''}${gave.length ? `<h4>${f ? i18n('📤 Ce qu’elle a transmis') : i18n('📤 Ce qu’il a transmis')}</h4>${UI().rowsHtml(gaveRows)}` : ''}${other.length ? `<h4>${f ? i18n('👥 Présente dans d’autres actes') : i18n('👥 Présent dans d’autres actes')}</h4>${UI().rowsHtml(otherRows)}` : ''}</div>`;
        return A().card(index, f ? i18n('🏠 Ce qu’elle a reçu / transmis') : i18n('🏠 Ce qu’il a reçu / transmis'), list.length, body, 'span-12');
    };
    const addBlock = () => {
        const Lb = A()?.defaultPersonBlocks; if (!Array.isArray(Lb) || Lb.some(b => b[0] === 'successions')) return;
        const i = Lb.findIndex(b => b[0] === 'probate'); Lb.splice(i < 0 ? Lb.length : i + 1, 0, ['successions', '🏠 Héritages : reçu et transmis']);
        const sp = A()?.defaultPersonBlockSpans; if (sp && typeof sp === 'object' && !sp.successions) sp.successions = '12';
    };
    const addList = () => { const app = A(); if (app?.defaultListTypes && !app.defaultListTypes.some(x => x[0] === 'successions')) app.defaultListTypes.push(['successions', '26b', '🏠 Héritages et successions']); };
    addBlock(); addList(); document.addEventListener('DOMContentLoaded', () => { addBlock(); addList(); }, {once: true});
    document.addEventListener('lcnda:successions-changed', () => { if (S()?.module === 'personnes' && S().currentPersonId) A().refreshScreen?.(); });

    ext.successions = {open, edit, chainHtml, shareSpec, reload: () => loadAll(true), titleOf, recipients};
})();
