/* LCNDA — 🌐 Wikidata sur une fiche (bloc « Références externes ») : identifiant « Q… » avec lien ↗, ✎ pour le changer,
 * « 🌐 Compléter depuis Wikidata » À LA DEMANDE : le navigateur lit la fiche Wikidata (internet), montre ce qui serait ajouté
 * (seulement ce qui manque sur la fiche ; rien n'est remplacé), puis lib/wikidata.php (wikidata_apply) ajoute ce qui est
 * coché ; message H7 « ↶ Annuler » (wikidata_undo). Jamais automatique : rien ne part sur internet sans ce bouton. */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const QRX = /^Q\d{1,12}$/;
    const WD_API = 'https://www.wikidata.org/w/api.php';
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    /** La ligne « Wikidata » du bloc Références externes (app.js). */
    ext.wikidataRow = (person, locked) => {
        const q = QRX.test(String(person?.wikidata_id || '')) ? person.wikidata_id : '';
        const btns = locked ? '' : `<button type="button" class="icon-button small" data-wd-edit="${Number(person.id)}" data-wd-q="${esc(q)}" title="Modifier l’identifiant Wikidata" aria-label="Modifier l’identifiant Wikidata">✎</button>${q ? ` <button type="button" class="button small secondary" data-wd-fill="${Number(person.id)}" data-wd-q="${esc(q)}" title="Lit la fiche Wikidata sur internet et montre ce qui manque sur ta fiche, avant d’ajouter quoi que ce soit">🌐 Compléter depuis Wikidata</button>` : ''}`;
        return `<div class="data-row h-wd-row"><dt>Wikidata</dt><dd>${q ? `<a href="https://www.wikidata.org/wiki/${q}" target="_blank" rel="noopener noreferrer">${q} ↗</a>` : '—'} ${btns}</dd></div>`;
    };

    async function wdGet(ids, props) {
        const url = `${WD_API}?action=wbgetentities&format=json&origin=*&languages=fr|en&props=${encodeURIComponent(props)}&ids=${encodeURIComponent(ids.slice(0, 50).join('|'))}`;
        let resp;
        try { resp = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer'}); }
        catch (_) { throw new Error('Wikidata ne répond pas : vérifie la connexion à internet.'); }
        if (!resp.ok) throw new Error(`Wikidata ne répond pas (erreur ${resp.status}). Réessaie plus tard.`);
        const d = await resp.json().catch(() => null);
        if (!d || d.error) throw new Error(d?.error?.info ? `Wikidata : ${d.error.info}` : 'Réponse de Wikidata illisible.');
        return d.entities || {};
    }
    const label = e => e?.labels?.fr?.value || e?.labels?.en?.value || '';
    const claimVals = (e, p) => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated').sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred')).map(c => c.mainsnak?.datavalue?.value).filter(v => v != null);
    /** « +1867-11-07T00:00:00Z » (précision 11 jour, 10 mois, 9 année, 8 décennie) → « 7 novembre 1867 » ; '' si trop vague. */
    function wdDate(v) {
        const m = /^([+-])(\d{1,16})-(\d{2})-(\d{2})/.exec(String(v?.time || ''));
        if (!m || m[1] === '-') return '';
        const y = Number(m[2]), mo = Number(m[3]), d = Number(m[4]), pr = Number(v.precision);
        if (pr >= 11 && d && mo) return `${d === 1 ? '1er' : d} ${MONTHS[mo - 1]} ${y}`;
        if (pr === 10 && mo) return `${MONTHS[mo - 1]} ${y}`;
        if (pr === 9) return String(y);
        if (pr === 8) return `vers ${Math.floor(y / 10) * 10}`;
        return '';
    }

    /** Ce que Wikidata dit de la personne, en français. */
    async function readWikidata(q) {
        const main = (await wdGet([q], 'labels|descriptions|claims|sitelinks'))[q];
        if (!main || main.missing !== undefined) throw new Error(`« ${q} » n’existe pas sur Wikidata.`);
        if (main.redirects?.to) return readWikidata(main.redirects.to);
        const ref = p => claimVals(main, p).map(v => v.id).filter(x => QRX.test(x || ''));
        const placeIds = [...ref('P19').slice(0, 1), ...ref('P20').slice(0, 1)], occIds = ref('P106').slice(0, 4);
        const more = placeIds.length || occIds.length ? await wdGet([...new Set([...placeIds, ...occIds])], 'labels|claims') : {};
        const countryIds = [...new Set(placeIds.map(id => claimVals(more[id], 'P17')[0]?.id).filter(Boolean))];
        const countries = countryIds.length ? await wdGet(countryIds, 'labels') : {};
        const place = id => {
            if (!id || !more[id]) return null;
            const c = claimVals(more[id], 'P625')[0], ctry = claimVals(more[id], 'P17')[0]?.id;
            return {name: label(more[id]), lat: c?.latitude ?? null, lon: c?.longitude ?? null, country: ctry ? label(countries[ctry]) : ''};
        };
        const sex = (claimVals(main, 'P21')[0] || {}).id;
        const fr = main.sitelinks?.frwiki?.title, en = main.sitelinks?.enwiki?.title, img = claimVals(main, 'P18')[0];
        return {
            q, name: label(main), description: main.descriptions?.fr?.value || main.descriptions?.en?.value || '',
            birth: {date: wdDate(claimVals(main, 'P569')[0]), place: place(ref('P19')[0])},
            death: {date: wdDate(claimVals(main, 'P570')[0]), place: place(ref('P20')[0])},
            gender: sex === 'Q6581097' ? 'male' : sex === 'Q6581072' ? 'female' : '',
            occupations: occIds.map(id => label(more[id])).filter(Boolean),
            links: [fr ? `Wikipédia : https://fr.wikipedia.org/wiki/${encodeURIComponent(fr.replace(/ /g, '_'))}` : en ? `Wikipedia : https://en.wikipedia.org/wiki/${encodeURIComponent(en.replace(/ /g, '_'))}` : '',
                typeof img === 'string' ? `Portrait (Wikimedia Commons) : https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.replace(/ /g, '_'))}` : ''].filter(Boolean),
        };
    }

    /** Ce qui serait ajouté : seulement là où la fiche est vide. */
    function proposals(wd, detail) {
        const p = detail.person || {}, evs = detail.events || [];
        const has = tag => evs.some(e => e.gedcom_tag === tag && (String(e.date_text || '').trim() || e.place_name));
        const shown = tag => { const e = evs.find(x => x.gedcom_tag === tag); return e ? [e.date_text, e.place_name].filter(Boolean).join(', ') : ''; };
        const out = [];
        for (const [kind, tag, word] of [['birth', 'BIRT', 'Naissance'], ['death', 'DEAT', 'Décès']]) {
            const w = wd[kind]; if (!w.date && !w.place) continue;
            const txt = [w.date, w.place?.name].filter(Boolean).join(', ');
            out.push(has(tag) ? {kind, text: `${word} : ${txt}`, skip: `déjà sur ta fiche (${shown(tag)}) : rien n’est changé`}
                : {kind, text: `${word} : ${txt}`, payload: {kind, date: w.date, place: w.place?.name || '', lat: w.place?.lat, lon: w.place?.lon, country: w.place?.country || ''}});
        }
        if (wd.gender) { const g = wd.gender === 'male' ? 'Homme' : 'Femme'; out.push(['male', 'female'].includes(p.gender) ? {kind: 'gender', text: `Sexe : ${g}`, skip: 'déjà sur ta fiche'} : {kind: 'gender', text: `Sexe : ${g}`, payload: {kind: 'gender', value: wd.gender}}); }
        if (wd.occupations.length) { const v = wd.occupations.join(', '); out.push(String(p.occupation || '').trim() ? {kind: 'occupation', text: `Métier : ${v}`, skip: `déjà sur ta fiche (${p.occupation})`} : {kind: 'occupation', text: `Métier : ${v}`, payload: {kind: 'occupation', value: v}}); }
        const note = [wd.description ? `${wd.name ? wd.name + ' : ' : ''}${wd.description}` : '', ...wd.links, `Fiche Wikidata : https://www.wikidata.org/wiki/${wd.q}`].filter(Boolean).join('\n');
        out.push({kind: 'note', text: `Une note « Wikidata ${wd.q} » : ${[wd.description, wd.links.length ? plural(wd.links.length, 'lien') : ''].filter(Boolean).join(' · ') || 'le lien vers la fiche'}`, payload: {kind: 'note', value: note}});
        return out;
    }
    const plural = (n, a, b) => A().plural ? A().plural(n, a, b) : `${n} ${n > 1 ? (b || a + 's') : a}`;

    async function openFill(personId, q) {
        const api = A().api;
        if (!api || !ext.openDialog) return;
        let items = [];
        ext.openDialog({eyebrow: 'WIKIDATA · ' + q, title: '🌐 Compléter depuis Wikidata', submitLabel: 'Ajouter à la fiche',
            body: `<p class="muted">Lu sur internet, sur la fiche <a href="https://www.wikidata.org/wiki/${esc(q)}" target="_blank" rel="noopener noreferrer">${esc(q)} ↗</a>. Rien n’est remplacé : seulement ajouté là où ta fiche est vide. Coche ce que tu veux garder.</p><div data-wd-list>${UI().spinner ? UI().spinner('Lecture de Wikidata…') : 'Lecture de Wikidata…'}</div>`,
            onOpen: async dl => {
                const box = dl.querySelector('[data-wd-list]');
                try {
                    const [wd, detail] = await Promise.all([readWikidata(q), api('person', {id: personId})]);
                    items = proposals(wd, detail);
                    box.innerHTML = `${wd.name ? `<p><b>${esc(wd.name)}</b>${wd.description ? ` — ${esc(wd.description)}` : ''}</p>` : ''}<div class="h-wd-items">${items.map((it, i) => it.payload
                        ? `<label class="checkbox-line"><input type="checkbox" name="wd_${i}" checked> ${esc(it.text)}</label>`
                        : `<div class="empty-line"><span class="empty-line-ico" aria-hidden="true">✓</span><span class="empty-line-text">${esc(it.text)} — ${esc(it.skip)}</span></div>`).join('')}</div>`;
                } catch (e) { box.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); items = []; }
            },
            onSubmit: async form => {
                const chosen = items.map((it, i) => it.payload && form.elements['wd_' + i]?.checked ? it.payload : null).filter(Boolean);
                if (!chosen.length) { const first = form.querySelector('[name^=wd_]'); if (first) return UI().fail(first, 'Coche au moins une chose à ajouter.'); return false; }
                let res;
                try { const r = await api('wikidata_apply', {}, {method: 'POST', body: {id: personId, qid: q, items: chosen}}); res = r.result || r; }
                catch (e) { A().toast?.(e.message, 'error'); return false; }
                A().openPersonById?.(personId);
                if (!res.added?.length) { A().toast?.('Rien à ajouter : ta fiche avait déjà tout.'); return; }
                const msg = `🌐 Ajouté depuis Wikidata : ${res.added.join(', ')}.`;
                const undo = async () => { await api('wikidata_undo', {}, {method: 'POST', body: {token: res.undo}}); A().openPersonById?.(personId); };
                if (A().undoToast) A().undoToast(msg, {undo, undoneText: 'Ajouts de Wikidata retirés'}); else A().toast?.(msg);
            }});
    }

    async function editQ(personId, current) {
        const a = A();
        if (!a.askText || !a.api) return;
        const v = await a.askText({title: 'Identifiant Wikidata', message: 'Le numéro « Q… » est écrit en haut de la page de la personne sur wikidata.org (ex. Q7186 pour Marie Curie). Laisse vide pour le retirer.', value: current || '', placeholder: 'Q7186', okLabel: 'Enregistrer'});
        if (v === null || v === undefined) return;
        let res;
        try { const r = await a.api('person_wikidata_set', {}, {method: 'POST', body: {id: personId, qid: String(v).trim()}}); res = r.result || r; }
        catch (e) { a.toast?.(e.message, 'error'); return; }
        a.openPersonById?.(personId);
        const undo = async () => { await a.api('person_wikidata_set', {}, {method: 'POST', body: {id: personId, qid: res.before || ''}}); a.openPersonById?.(personId); };
        const msg = res.wikidata_id ? `Identifiant Wikidata : ${res.wikidata_id}.` : 'Identifiant Wikidata retiré.';
        if (a.undoToast) a.undoToast(msg, {undo}); else a.toast?.(msg, 'success');
    }

    document.addEventListener('click', e => {
        const ed = e.target.closest?.('[data-wd-edit]');
        if (ed) { e.preventDefault(); editQ(Number(ed.dataset.wdEdit), ed.dataset.wdQ || ''); return; }
        const fill = e.target.closest?.('[data-wd-fill]');
        if (fill && QRX.test(fill.dataset.wdQ || '')) { e.preventDefault(); openFill(Number(fill.dataset.wdFill), fill.dataset.wdQ); }
    });
    ext.wikidata = {read: readWikidata, proposals, date: wdDate, openFill};
})();
