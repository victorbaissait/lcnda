/**
 * ⏳ « Une journée dans la vie de… » — un mode du générateur de 📖 biographie (serveur : lib/biographie_journee.php,
 * GET biography_day et biography_day_events). Ouvert depuis la fiche (⋯ → « ⏳ Une journée dans sa vie… ») et le bloc
 * « 📖 Biographie » (bouton « ⏳ Une journée… »).
 *  - la date : un événement de sa vie (menu de choix unique, kind 'event' filtré sur la personne, + raccourcis) ou une date libre (C4) ;
 *  - un petit récit fait de règles et de modèles de phrases ; chaque phrase a sa marque : ✓ de la fiche (lien vers l'événement,
 *    le village…), 📚 référence (source citée), 💭 imaginé (italique, signalé ; interrupteur « Sans phrases imaginées ») ;
 *  - 🌦 la météo vient de LCNDA_EXT.meteo (jamais un autre calcul) : pas de données, réglage « Jamais », personne ou événement
 *    masqués → pas de phrase météo ;
 *  - 📋 Copier, 📝 Dans le traitement de texte, 🔊 Lire à voix haute, « Poser dans ▾ » (📐 mise en page, 📁 médias, 📖 biographie) ;
 *    une fiche confidentielle ne sort pas (copie, documents, médias) ; une personne vivante : on le dit.
 * Réglages de cet appareil : localStorage['genealogie-journee'] = {noImag, mode}.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const P = () => window.LCNDA_PICKER || A();
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = async (action, body) => { const r = await A().api(action, {}, {method: 'POST', body}); return r?.result ?? r ?? {}; };
    const toast = (...a) => A().toast(...a);
    const KEY = 'genealogie-journee';
    const prefs = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const setPref = (k, v) => { try { localStorage.setItem(KEY, JSON.stringify({...prefs(), [k]: v})); } catch (_) {} };
    const RO = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly') || document.body.classList.contains('ms-on');
    const MARK = {fiche: {icon: '✓', label: 'De la fiche', cls: 'is-fiche'}, ref: {icon: '📚', label: 'Référence', cls: 'is-ref'}, imagine: {icon: '💭', label: 'Imaginé', cls: 'is-imagine'}};
    const PARAS = [['qui', 'famille'], ['ou'], ['metier'], ['calendrier', 'meteo'], ['contexte', 'prix'], ['ambiance']];

    /* ═════ 🌦 la météo : seulement par LCNDA_EXT.meteo ═════ */
    async function meteoSentence(d) {
        const M = ext.meteo, q = d.meteo;
        if (!M || !q || typeof M.look !== 'function') return null;
        const s = M.settings ? M.settings() : {};
        if (s.show === 'never') return null;
        if ((s.hidePersons || []).some(x => Number(x.id) === Number(d.person.id))) return null;
        if (q.event_id && (s.hideEvents || []).some(x => Number(x.id) === Number(q.event_id))) return null;
        let res;
        try { res = q.event_id ? await api('meteo_event', {id: q.event_id}) : await api('meteo_point', {lat: q.lat, lon: q.lon, date: q.date, country: q.country || '', place: q.place || '', detail: '0'}); } catch (_) { return null; }
        const r = res?.result;
        if (!res?.installed || !r || !r.ok || !r.day) return null;
        if (r.reliability === 'coarse' && !s.coarse) return null;
        const lk = M.look(r, s);
        const rel = {measured: 'Mesuré (station à moins de 15 km)', station: `Station à ${Math.round(r.station?.km || 0)} km`, estimated: 'Estimé (carreau ≈ 30 km)', coarse: 'Reconstitution grossière (≈ 100 km)'}[r.reliability] || '';
        const srcs = (r.sources || []).map(x => x.mention || x.nom || '').filter(Boolean).join(' · ');
        const where = q.place ? ` à ${q.place}` : '';
        return {id: 'meteo', part: 'meteo', mark: 'ref', text: `Ce jour-là${where}, ${lk.verb}${lk.desc ? ` (${lk.desc.replace(/\.$/, '').replace(/^./, c => c.toLowerCase())})` : ''}.`,
            src: {label: `🌦 Météo d’autrefois — ${rel}${srcs ? ' · ' + srcs : ''}`, meteo: q.event_id || 'point'}};
    }

    /* ═════ le récit : HTML de l'écran et texte des exports ═════ */
    const shown = (d, noImag) => d.sentences.filter(s => !(noImag && s.mark === 'imagine'));
    function storyHtml(d, noImag) {
        const list = shown(d, noImag);
        if (!list.length) return A().empty('Rien à raconter pour cette date.', {icon: '⏳'});
        const num = new Map(list.map((s, i) => [s.id, i + 1]));
        const paras = PARAS.map(parts => list.filter(s => parts.includes(s.part))).filter(x => x.length);
        const sent = s => {
            const m = MARK[s.mark] || MARK.ref, n = num.get(s.id);
            const body = s.mark === 'imagine' ? `<em class="jr-imag">💭 ${esc(s.text)} <small>(imaginé)</small></em>` : esc(s.text);
            return `<span class="jr-s ${m.cls}" data-jr-s="${esc(s.id)}">${body}<a class="jr-ref" href="#jr-n-${n}" data-jr-goto="${n}" title="${esc(m.label)} : ${esc(s.src?.label || '')}" aria-label="${esc(m.label)}, repère ${n}">${m.icon}<sup>${n}</sup></a></span>`;
        };
        const notes = list.map((s, i) => {
            const m = MARK[s.mark] || MARK.ref, src = s.src || {}, links = [];
            if (src.event_id) links.push(`<button type="button" class="link-button" data-jr-event="${Number(src.event_id)}">↗ Voir l’événement</button>`);
            if (src.village) links.push(`<button type="button" class="link-button" data-jr-village="${esc(src.village)}">↗ Fiche du village</button>`);
            if (src.place_id && !src.village) links.push(`<button type="button" class="link-button" data-jr-place="${Number(src.place_id)}" data-jr-pname="${esc(src.place_name || '')}" data-jr-pcounty="${esc(src.place_county || '')}">↗ Lieu</button>`);
            if (src.trade) links.push(`<button type="button" class="link-button" data-jr-trade="${esc(src.trade)}">↗ Fiche du métier</button>`);
            if (src.world) links.push(`<button type="button" class="link-button" data-jr-world>↗ Le monde autour</button>`);
            const url = src.url && /^https?:\/\//i.test(src.url) ? (A().safeUrl?.(src.url) || src.url) : '';
            if (url) links.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">↗ Source</a>`);
            const sub = (src.sources || []).map(x => x.label).filter(Boolean);
            return `<li id="jr-n-${i + 1}" class="${m.cls}"><span class="jr-mk">${m.icon} ${esc(m.label)}</span> ${esc(src.label || '')}${sub.length ? ` <small>— source : ${esc(sub.join(' ; '))}</small>` : ''}${links.length ? ` <span class="jr-links">${links.join(' ')}</span>` : ''}</li>`;
        }).join('');
        return `${paras.map(p => `<p>${p.map(sent).join(' ')}</p>`).join('')}<h4 class="jr-notes-h">Repères</h4><ol class="jr-notes">${notes}</ol>`;
    }
    function storyText(d, noImag) {
        const list = shown(d, noImag), num = new Map(list.map((s, i) => [s.id, i + 1]));
        const paras = PARAS.map(parts => list.filter(s => parts.includes(s.part))).filter(x => x.length)
            .map(p => p.map(s => `${s.mark === 'imagine' ? '(imaginé) ' : ''}${s.text} [${num.get(s.id)}]`).join(' '));
        const notes = list.map((s, i) => `[${i + 1}] ${MARK[s.mark]?.icon || ''} ${MARK[s.mark]?.label || ''} — ${s.src?.label || ''}${(s.src?.sources || []).length ? ' (source : ' + s.src.sources.map(x => x.label).join(' ; ') + ')' : ''}${s.src?.url ? ' ' + s.src.url : ''}`);
        return `${d.title}\n${d.subtitle}\n\n${paras.join('\n\n')}\n\nRepères :\n${notes.join('\n')}\n\n✓ de la fiche · 📚 référence (source citée) · 💭 phrase imaginée`;
    }
    /** le récit en document neutre du traitement de texte (LCNDA_TEXT) : titre, paragraphes, imaginé en italique, repères en notes */
    function storyDoc(d, noImag) {
        const T = window.LCNDA_TEXT; if (!T?.newDoc) return null;
        const list = shown(d, noImag);
        const doc = T.newDoc({title: d.title});
        const blocks = [T.para([T.run(d.title)], {st: 'title'}), T.para([T.run(d.subtitle)], {st: 'subtitle'})];
        PARAS.map(parts => list.filter(s => parts.includes(s.part))).filter(x => x.length).forEach(p => {
            const runs = [];
            p.forEach((s, i) => {
                if (i) runs.push(T.run(' '));
                runs.push(T.run(s.mark === 'imagine' ? `💭 ${s.text} (imaginé)` : s.text, s.mark === 'imagine' ? {i: 1} : {}));
                runs.push({x: '', note: {k: 'foot', text: `${MARK[s.mark]?.icon || ''} ${MARK[s.mark]?.label || ''} — ${s.src?.label || ''}${(s.src?.sources || []).length ? ' (source : ' + s.src.sources.map(x => x.label).join(' ; ') + ')' : ''}${s.src?.url ? ' ' + s.src.url : ''}`}});
            });
            blocks.push(T.para(runs));
        });
        blocks.push(T.para([T.run('✓ de la fiche · 📚 référence (source citée) · 💭 phrase imaginée', {i: 1})], {st: 'caption'}));
        doc.sections[0].blocks = blocks;
        return doc;
    }

    /* ═════ la fenêtre ═════ */
    async function open(pid, {eventId = 0, date = ''} = {}) {
        pid = Number(pid); if (!pid) return;
        const pr = prefs();
        let mode = eventId ? 'event' : date ? 'date' : (pr.mode === 'date' ? 'date' : 'event');
        let noImag = !!pr.noImag, data = null, seq = 0, evList = [];
        const dlg = document.createElement('dialog');
        dlg.className = 'modal h-modal h-modal-wide jr-dialog';
        dlg.innerHTML = `<form method="dialog" class="h-dialog-form"><div class="modal-head"><div><span class="eyebrow">⏳ UNE JOURNÉE DANS LA VIE DE…</span><h2 data-jr-title>…</h2></div><button type="button" class="icon-button" data-jr-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body jr-body">
                <div class="jr-side">
                    <div class="segmented jr-mode" role="tablist" aria-label="Quel jour ?"><button type="button" role="tab" data-jr-mode="event">📅 Un jour de sa vie</button><button type="button" role="tab" data-jr-mode="date">✎ Une autre date</button></div>
                    <div data-jr-pane="event"><label class="jr-lab">Un événement de sa vie</label><div data-jr-evfield></div><div class="jr-quick" data-jr-quick></div></div>
                    <div data-jr-pane="date" hidden><label class="jr-lab" for="jr-date-${pid}">La date</label><input id="jr-date-${pid}" type="text" data-ui-date name="jr_date" autocomplete="off" placeholder="7 mai 1925, 12 thermidor an II…" value="${esc(date)}">
                        <button type="button" class="button small" data-jr-go>⏳ Raconter ce jour</button></div>
                    ${UI().toggleHtml ? UI().toggleHtml('Sans phrases imaginées', {checked: noImag, attrs: 'data-jr-noimag'}) : `<label class="ui-toggle"><input type="checkbox" data-jr-noimag ${noImag ? 'checked' : ''}><i></i>Sans phrases imaginées</label>`}
                    <p class="ui-hint">Les phrases 💭 sont des ambiances générales, en italique. Sans elles, il ne reste que la fiche (✓) et les références (📚).</p>
                    <div class="jr-legend"><span class="jr-chip is-fiche">✓ De la fiche</span><span class="jr-chip is-ref">📚 Référence</span><span class="jr-chip is-imagine">💭 Imaginé</span></div>
                </div>
                <div class="jr-main" aria-live="polite">
                    <div class="jr-head"><div><strong data-jr-sub></strong></div><div class="jr-actions" data-jr-actions hidden>
                        <button type="button" class="button small secondary" data-jr-copy>📋 Copier</button>
                        <button type="button" class="button small secondary" data-jr-wp>📝 Dans le traitement de texte</button>
                        ${ext.access?.speak ? '<button type="button" class="button small secondary" data-jr-say>🔊 Lire à voix haute</button>' : ''}
                        <button type="button" class="button small secondary" data-jr-put>Poser dans ▾</button></div></div>
                    <div data-jr-notice></div>
                    <div class="jr-story" data-jr-story>${A().empty('Choisis un jour de sa vie, ou écris une date.', {icon: '⏳'})}</div>
                </div>
            </div>
            <div class="modal-actions"><span class="spacer"></span><button type="submit" class="button secondary">Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s);
        dlg.addEventListener('close', () => { try { ext.access?.stop?.(); } catch (_) {} dlg.remove(); });
        $('[data-jr-x]').addEventListener('click', () => dlg.close());
        // le menu de choix unique : les événements de cette personne
        const fieldHost = $('[data-jr-evfield]');
        fieldHost.innerHTML = P().pickerField ? P().pickerField({name: '', hiddenName: false, kind: 'event', inline: true, filter: {person_id: pid}}) : '';
        const evField = fieldHost.firstElementChild;
        fieldHost.addEventListener('picker-change', e => { const it = e.detail?.item; if (it?.id) run({eventId: Number(it.id)}); });
        fieldHost.addEventListener('picker-open', e => { e.preventDefault(); goEvent(Number(e.detail?.id)); });
        const setMode = m => {
            mode = m; setPref('mode', m);
            dlg.querySelectorAll('[data-jr-mode]').forEach(b => { const on = b.dataset.jrMode === m; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
            dlg.querySelectorAll('[data-jr-pane]').forEach(x => { x.hidden = x.dataset.jrPane !== m; });
        };
        setMode(mode);
        UI().scan?.(dlg);
        dlg.showModal();

        async function run(q) {
            const my = ++seq, story = $('[data-jr-story]');
            story.innerHTML = UI().spinner ? UI().spinner('Le récit s’écrit…') : '…';
            let d;
            try { d = await api('biography_day', {id: pid, ...(q.eventId ? {event_id: q.eventId} : {date: q.date})}); }
            catch (e) {
                if (my !== seq) return;
                if (!q.eventId) { const inp = $('[name="jr_date"]'); story.innerHTML = A().empty('Écris une date que la fiche permet de raconter.', {icon: '⏳'}); if (UI().fail) { UI().fail(inp, e.message); return; } }
                story.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return;
            }
            if (my !== seq) return;
            const w = await meteoSentence(d).catch(() => null);
            if (my !== seq) return;
            if (w) d.sentences.splice(Math.max(0, d.sentences.findIndex(s => s.part === 'contexte' || s.part === 'prix' || s.part === 'ambiance') < 0 ? d.sentences.length : d.sentences.findIndex(s => s.part === 'contexte' || s.part === 'prix' || s.part === 'ambiance')), 0, w);
            data = d; paint();
            if (window.matchMedia?.('(max-width: 760px)').matches) $('.jr-main')?.scrollIntoView({block: 'start', behavior: 'smooth'}); // au téléphone : le récit sous les réglages
        }
        function paint() {
            const d = data; if (!d) return;
            $('[data-jr-title]').textContent = d.person.name;
            $('[data-jr-sub]').textContent = d.subtitle;
            const notes = [];
            if (d.private) notes.push(UI().notice ? UI().notice('warn', 'Fiche confidentielle : ce récit reste ici. Il ne sort pas de l’app (ni copie, ni document, ni média).') : '');
            if (d.living) notes.push(UI().notice ? UI().notice('warn', `${d.person.first} est peut-être encore en vie : ce récit parle d’une personne vivante. Demande-lui son accord avant de le partager.`) : '');
            $('[data-jr-notice]').innerHTML = notes.join('');
            $('[data-jr-story]').innerHTML = storyHtml(d, noImag);
            const acts = $('[data-jr-actions]'); acts.hidden = false;
            acts.querySelectorAll('[data-jr-copy], [data-jr-wp]').forEach(b => { b.disabled = !!d.private; b.title = d.private ? 'Fiche confidentielle : le récit ne sort pas' : ''; });
        }
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button, a'); if (!b) return;
            if (b.dataset.jrMode) { setMode(b.dataset.jrMode); if (b.dataset.jrMode === 'date') $('[name="jr_date"]')?.focus(); return; }
            if (b.matches('[data-jr-go]')) { const inp = $('[name="jr_date"]'); const v = inp.value.trim(); if (!v) { UI().fail?.(inp, 'Écris une date (exemples : 7 mai 1925, vers 1784, 12 thermidor an II).'); return; } run({date: v}); return; }
            if (b.dataset.jrQuick) { const it = evList.find(x => x.id === Number(b.dataset.jrQuick)); if (it && evField && P().pickerSet) P().pickerSet(evField, {kind: 'event', id: it.id, title: it.label, meta: [it.date, it.place].filter(Boolean).join(' · '), icon: '📅', short: it.date}); run({eventId: Number(b.dataset.jrQuick)}); return; }
            if (b.dataset.jrGoto) { e.preventDefault(); dlg.querySelector(`#jr-n-${Number(b.dataset.jrGoto)}`)?.scrollIntoView({block: 'nearest', behavior: 'smooth'}); return; }
            if (b.dataset.jrEvent) { goEvent(Number(b.dataset.jrEvent)); return; }
            if (b.dataset.jrVillage) { dlg.close(); const st = A().state; st.listType = 'villages'; st.hVillage = b.dataset.jrVillage; A().setModule('listes'); return; }
            if (b.dataset.jrPlace) { dlg.close(); const st = A().state; st.graphPlaceMonograph = {...(st.graphPlaceMonograph || {}), id: Number(b.dataset.jrPlace), name: b.dataset.jrPname || '', county: b.dataset.jrPcounty || ''}; st.graphMode = 'place_monograph'; A().setModule('graphiques'); return; }
            if (b.dataset.jrTrade) { ext.oldTrade?.open ? ext.oldTrade.open('', {key: b.dataset.jrTrade}) : toast('La fiche des métiers n’est pas chargée.', 'error'); return; }
            if (b.hasAttribute('data-jr-world')) { if (ext.worldTimeline) { dlg.close(); ext.worldTimeline(pid); } return; }
            if (!data) return;
            if (b.matches('[data-jr-copy]')) { if (data.private) return; try { await navigator.clipboard.writeText(storyText(data, noImag)); toast('Récit copié : colle-le où tu veux.'); } catch (_) { toast('Copie impossible dans ce navigateur.', 'error'); } return; }
            if (b.matches('[data-jr-wp]')) { if (!data.private) toTextDoc(data); return; }
            if (b.matches('[data-jr-say]')) { const list = shown(data, noImag).map(s => s.text).join(' '); ext.access?.speak?.(`${data.title}. ${data.subtitle}. ${list}`); return; }
            if (b.matches('[data-jr-put]')) { putMenu(b); }
        });
        dlg.addEventListener('change', e => { if (e.target.matches('[data-jr-noimag]')) { noImag = e.target.checked; setPref('noImag', noImag); paint(); } });
        dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[name="jr_date"]')) { e.preventDefault(); $('[data-jr-go]').click(); } });
        function goEvent(id) {
            if (!id) return;
            dlg.close();
            const show = () => { const row = document.querySelector(`#workspace .event-row[data-event-id="${id}"]`); if (!row) return false; row.scrollIntoView({block: 'center', behavior: 'smooth'}); row.classList.add('jr-flash'); setTimeout(() => row.classList.remove('jr-flash'), 2400); return true; };
            if (!show()) { A().openPersonById?.(pid); setTimeout(show, 700); }
        }
        function putMenu(btn) {
            const d = data, ro = RO();
            const items = [
                d.private ? null : {icon: '📐', label: 'Dans la mise en page (un nouveau livre)', run: () => toLayout(d)},
                ro || d.private ? null : {icon: '📁', label: 'Ranger une copie dans les médias', run: () => toMedia(d)},
                ro ? null : {icon: '📖', label: 'Ajouter à la fin de sa biographie', run: () => toBio(d)},
            ].filter(Boolean);
            if (!items.length) { toast('Fiche confidentielle : le récit reste ici.'); return; }
            UI().menuAt?.(btn, items, {title: '« Une journée »'});
        }
        // les raccourcis (naissance, baptême, mariage, décès…)
        try {
            evList = (await api('biography_day_events', {id: pid})).events || [];
            const main = evList.filter(x => ['BIRT', 'CHR', 'BAPM', 'MARR', 'DEAT', 'BURI'].includes(x.tag)).slice(0, 8);
            $('[data-jr-quick]').innerHTML = main.length ? `<span class="jr-lab2">Raccourcis :</span>${main.map(x => `<button type="button" class="jr-q" data-jr-quick="${x.id}">${esc(x.label)} <small>${esc(x.date)}</small></button>`).join('')}` : '';
        } catch (_) {}
        if (eventId) { const it = evList.find(x => x.id === Number(eventId)); if (it && evField && P().pickerSet) P().pickerSet(evField, {kind: 'event', id: it.id, title: it.label, meta: [it.date, it.place].filter(Boolean).join(' · '), icon: '📅', short: it.date}); run({eventId}); }
        else if (date) run({date});
        return dlg;
    }

    /* ═════ les sorties ═════ */
    function toTextDoc(d) {
        const tools = ext.textDocTools, doc = storyDoc(d, prefs().noImag);
        if (!ext.openTextDoc || !doc) return toast('Le traitement de texte n’est pas encore prêt.', 'error');
        try { ext.openTextDoc({data: tools?.dataOf && window.LCNDA_TEXT?.blocksHtml ? tools.dataOf(window.LCNDA_TEXT.blocksHtml(doc.sections[0].blocks)) : doc, name: d.title.slice(0, 200)}); }
        catch (e) { toast(e.message, 'error'); }
    }
    function toLayout(d) {
        const Kit = ext.layoutKit; if (!Kit?.openEditor) return toast('La mise en page n’est pas encore prête.', 'error');
        const list = shown(d, prefs().noImag), th = (Kit.THEMES || [])[0];
        const doc = Kit.themeDoc(th, ''); doc.title = d.title; doc.pages = [];
        Kit.baseStyles({titleFont: th?.titleFont, bodyFont: th?.bodyFont, bodySize: 11}).forEach(s => { if (!doc.paraStyles.some(x => x.id === s.id)) doc.paraStyles.push(s); });
        const pg = {id: Kit.nid('p'), master: 'A', items: []}; doc.pages.push(pg);
        const paras = [{ps: 'ps-chapter', text: d.title, html: esc(d.title)}, {ps: 'ps-subtitle', text: d.subtitle, html: esc(d.subtitle)}];
        const num = new Map(list.map((s, i) => [s.id, i + 1]));
        PARAS.map(parts => list.filter(s => parts.includes(s.part))).filter(x => x.length).forEach(p => paras.push({ps: 'ps-body', text: p.map(s => s.text).join(' '),
            html: p.map(s => (s.mark === 'imagine' ? `<i>💭 ${esc(s.text)} (imaginé)</i>` : esc(s.text)) + `<sup>${num.get(s.id)}</sup>`).join(' ')}));
        paras.push({ps: 'ps-head', text: 'Repères', html: 'Repères'});
        list.forEach((s, i) => paras.push({ps: 'ps-list', lead: `${i + 1}.`, text: `${MARK[s.mark]?.icon || ''} ${MARK[s.mark]?.label || ''} — ${s.src?.label || ''}`}));
        Kit.flow(doc, paras, {first: pg});
        Kit.openEditor({id: 0, name: d.title, doc});
        toast('Le récit est posé dans un nouveau livre : vérifie, puis enregistre-le.');
    }
    async function toMedia(d) {
        const T = window.LCNDA_TEXT, doc = storyDoc(d, prefs().noImag);
        if (!T?.toDocx || !doc) return toast('Le traitement de texte n’est pas encore prêt.', 'error');
        try {
            const blob = await T.toDocx(doc); const u8 = new Uint8Array(await blob.arrayBuffer());
            const res = await post('textdoc_to_media', {file: T.toB64(u8), format: 'docx', title: d.title.slice(0, 300)});
            toast('Copie rangée dans les médias (DOCX).', '', {action: {label: '↗ Ouvrir', run: () => A().openMedia?.(res.media_id) || window.LCNDA_PICKER?.openMedia?.(res.media_id)}});
        } catch (e) { toast(`Copie impossible : ${e.message}`, 'error', {retry: () => toMedia(d)}); }
    }
    async function toBio(d) {
        const pid = d.person.id;
        try {
            const before = await api('biography', {id: pid});
            const add = `${d.title} — ${d.subtitle}\n\n${shown(d, prefs().noImag).map(s => (s.mark === 'imagine' ? '(imaginé) ' : '') + s.text).join(' ')}`;
            await post('save_biography', {person_id: pid, text: `${String(before.text || '').trim()}\n\n${add}`.trim(), options: before.options});
            const undo = async () => { await post('save_biography', {person_id: pid, text: before.own || '', options: before.options}); refreshBio(pid); };
            refreshBio(pid);
            if (A().undoToast) A().undoToast('Le récit est ajouté à la fin de sa biographie', {undo, redo: () => toBio(d)}); else toast('Enregistré', 'success');
        } catch (e) { toast(e.message, 'error', {retry: () => toBio(d)}); }
    }
    const refreshBio = pid => document.querySelectorAll(`[data-bio-host="${Number(pid)}"]`).forEach(h => { h.removeAttribute('data-bio-done'); h.innerHTML = ''; }); // le bloc se recharge tout seul (heritage-biographie.js)

    /* ═════ les entrées : ⋯ de la fiche, bloc Biographie ═════ */
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person || {}; return p.id && p.kind !== 'animal' ? {icon: '⏳', label: 'Une journée dans sa vie…', run: () => open(p.id)} : null; });
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-jr-open]'); if (!b) return; e.preventDefault(); open(Number(b.dataset.jrOpen), {eventId: Number(b.dataset.jrEvent) || 0}); });
    ext.journee = {open, storyText, storyHtml, storyDoc, meteoSentence};
})();
