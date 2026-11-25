/* LCNDA — 🕰️ Chronologie (sorti d'app.js : app.js garde de petits relais qui l'appellent).
 * Frise de vie, frise historique réglable, frises parallèles (autre personne, couple, fratrie, plusieurs personnes).
 * Audit des onglets (§10) : personne de départ choisie sur place (ou 🏘 un lieu), sortes d'événements à cacher (barre H10 de la colonne),
 * 🎂 âge à chaque événement, 🚨 anomalies du Contrôle en rouge, 📏 barres de vie horizontales (zoom ⌘/Ctrl + molette), ⤓ Exporter
 * (PDF, PNG, CSV) et 🖨 Imprimer, 💾 vues enregistrées, ⋯ et clic droit sur chaque événement, réglages appliqués tout de suite.
 * Essai : tests/test-audit-chrono.js
 */
(() => {
    'use strict';
    const {$, $$, api, bindTableLinks, emptyState, escapeHtml, persistUiState, personName, plural, renderSidebar, setModule, state, summaryFromState, toast} = window.LCNDA_APP;
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const T = (s, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const kiosk = () => document.body.classList.contains('is-kiosk'); // R6 : mode consultation
    const defaultHistoricalTimelineEvents=[
        {start_year:1347,end_year:1352,label:'Grande peste en Europe',category:'épidémie',parent_label:'',hidden:false},
        {start_year:1429,end_year:1429,label:'Jeanne d’Arc à Orléans',category:'guerre',parent_label:'Guerre de Cent Ans',hidden:false},
        {start_year:1562,end_year:1598,label:'Guerres de Religion',category:'guerre / religion',parent_label:'',hidden:false},
        {start_year:1572,end_year:1572,label:'Massacre de la Saint-Barthélemy',category:'religion',parent_label:'Guerres de Religion',hidden:false},
        {start_year:1598,end_year:1598,label:'Édit de Nantes',category:'politique',parent_label:'Guerres de Religion',hidden:false},
        {start_year:1685,end_year:1685,label:'Révocation de l’édit de Nantes',category:'religion',parent_label:'',hidden:false},
        {start_year:1709,end_year:1709,label:'Grand hiver',category:'climat / famine',parent_label:'',hidden:false},
        {start_year:1789,end_year:1799,label:'Révolution française',category:'politique',parent_label:'',hidden:false},
        {start_year:1792,end_year:1792,label:'Début de l’état civil en France',category:'administration',parent_label:'Révolution française',hidden:false},
        {start_year:1793,end_year:1805,label:'Calendrier républicain',category:'administration',parent_label:'Révolution française',hidden:false},
        {start_year:1799,end_year:1815,label:'Consulat et Premier Empire',category:'politique / guerre',parent_label:'',hidden:false},
        {start_year:1815,end_year:1815,label:'Fin du Premier Empire',category:'guerre',parent_label:'Consulat et Premier Empire',hidden:false},
        {start_year:1848,end_year:1852,label:'Deuxième République',category:'politique',parent_label:'',hidden:false},
        {start_year:1870,end_year:1871,label:'Guerre franco-prussienne',category:'guerre',parent_label:'',hidden:false},
        {start_year:1914,end_year:1918,label:'Première Guerre mondiale',category:'guerre',parent_label:'',hidden:false},
        {start_year:1916,end_year:1916,label:'Bataille de Verdun',category:'bataille',parent_label:'Première Guerre mondiale',hidden:false},
        {start_year:1939,end_year:1945,label:'Seconde Guerre mondiale',category:'guerre',parent_label:'',hidden:false},
        {start_year:1940,end_year:1944,label:'Occupation allemande en France',category:'guerre',parent_label:'Seconde Guerre mondiale',hidden:false},
        {start_year:1954,end_year:1962,label:'Guerre d’Algérie',category:'guerre',parent_label:'',hidden:false}
    ];
    function normalizeHistoricalTimelineEvent(item){
        const start=Number(item.start_year||item.year)||0;
        const end=Number(item.end_year)||start;
        return {start_year:start,end_year:Math.max(start,end||start),label:String(item.label||'Événement'),category:String(item.category||''),parent_label:String(item.parent_label||item.parent||''),hidden:!!item.hidden};
    }
    function historicalTimelineEvents(){
        // 🌍 « Le monde autour » (heritage-monde.js, lib/monde_autour.php) : les grands événements de l'époque et l'histoire locale, avec l'âge de la personne ;
        // une frise modifiée à la main (« Modifier la frise historique ») s'y ajoute, sans les doublons
        const world=window.LCNDA_EXT?.worldTimeline?.(state.currentPersonId)||null;
        let saved=null;try{saved=JSON.parse(localStorage.getItem('genealogie-historical-timeline')||'null');}catch(_){}
        const fold=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
        const mine=(Array.isArray(saved)?saved:(world?[]:defaultHistoricalTimelineEvents)).map(normalizeHistoricalTimelineEvent).filter(item=>item.start_year&&item.label);
        const seen=new Set((world||[]).map(e=>fold(e.title)));
        return [...mine.filter(item=>!seen.has(fold(item.label))),...(world||[]).map(normalizeHistoricalTimelineEvent)].filter(item=>item.start_year&&item.label);
    }
    function saveHistoricalTimelineEvents(items){localStorage.setItem('genealogie-historical-timeline',JSON.stringify(items.map(normalizeHistoricalTimelineEvent).filter(item=>item.start_year&&item.label)));}
    function relaxedTimelinePositions(years,minYear,maxYear,minGap=116){
        const min=Number(minYear)||0,max=Math.max(min+1,Number(maxYear)||min+1);
        const unique=[...new Set(years.map(Number).filter(Boolean))].sort((a,b)=>a-b);
        const baseHeight=Math.max(420,Math.min(1800,(max-min+1)*14));
        const map={};
        let previous=-minGap;
        unique.forEach(year=>{
            const raw=((year-min)/(max-min))*baseHeight;
            const y=Math.max(raw,previous+minGap);
            map[year]=y;
            previous=y;
        });
        return {map,height:Math.max(620,previous+150)};
    }
    function historicalTimelineHtml(events,minYear,maxYear,positions){
        const rows=historicalTimelineEvents().filter(event=>!event.hidden&&event.end_year>=minYear&&event.start_year<=maxYear).sort((a,b)=>a.start_year-b.start_year);
        return rows.map(event=>{
            const start=Math.max(event.start_year,minYear),end=Math.min(event.end_year,maxYear);
            const top=positions.map[start]??0,bottom=positions.map[end]??top;
            const height=Math.max(18,bottom-top);
            const years=event.end_year>event.start_year?`${event.start_year}-${event.end_year}`:String(event.start_year);
            return `<article class="historical-aligned-row" style="--timeline-top:${top}px;--timeline-height:${height}px"><div class="historical-span"></div><div class="timeline-card"><strong>${escapeHtml(event.label)}</strong><p>${escapeHtml([years,event.category,event.parent_label?`dans ${event.parent_label}`:''].filter(Boolean).join(' · '))}</p></div></article>`;
        }).join('')||emptyState({text: 'Aucun événement historique dans cette période.', icon:'🕰️',hint:'Élargis la période ou affiche d’autres catégories.'});
    }
    function timelineAlignedHtml(events,minYear,maxYear,sharedPositions=null,includeHistorical=true){
        const historical=historicalTimelineEvents().filter(event=>!event.hidden&&event.end_year>=minYear&&event.start_year<=maxYear);
        const years=[...events.map(event=>Number(event.year)),...historical.flatMap(event=>[Math.max(event.start_year,minYear),Math.min(event.end_year,maxYear)])];
        const positions=sharedPositions||relaxedTimelinePositions(years,minYear,maxYear);
        const groups=Object.values(events.reduce((acc,event)=>{const year=Number(event.year)||0;(acc[year]??={year,events:[]}).events.push(event);return acc;},{})).sort((a,b)=>a.year-b.year);
        const personRows=groups.map(group=>{
            const top=positions.map[group.year]??0;
            const lines=group.events.map(event=>`<div class="timeline-card-line${event._anomaly?' is-anomaly':''}" ${eventAttrs(event)}>${eventInnerHtml(event)}</div>`).join('');
            const first=group.events[0];
            return `<article class="timeline-aligned-row${group.events.some(e=>e._anomaly)?' is-anomaly':''}" style="--timeline-top:${top}px;--event-color:${escapeHtml(first.color)}"><div class="timeline-year">${group.year}</div><span class="timeline-node"></span><div class="timeline-card">${lines}</div></article>`;
        }).join('');
        const personLane=`<section class="timeline-aligned-lane"><header><span class="eyebrow">${escapeHtml(T('FRISE PERSONNELLE'))}</span><h3>${escapeHtml(T('Événements'))}</h3></header><div class="timeline-aligned-stage" style="--timeline-stage-height:${positions.height}px">${personRows}</div></section>`;
        if(!includeHistorical)return personLane;
        return `<div class="timeline-aligned-layout" style="--timeline-stage-height:${positions.height}px">${personLane}<aside class="historical-timeline is-aligned"><header><span class="eyebrow">FRISE HISTORIQUE</span><h3>Contexte</h3></header><div class="historical-aligned-stage">${historicalTimelineHtml(events,minYear,maxYear,positions)}</div></aside></div>`;
    }
    function historicalTimelineEditorRows(){
        const events=historicalTimelineEvents();
        const parentOptions=['',...events.map(event=>event.label)].filter((value,index,array)=>array.indexOf(value)===index);
        return events.map((event,index)=>`<div class="historical-editor-row" data-historical-row><span class="order-number">${String(index+1).padStart(2,'0')}</span><label>Début<input type="number" data-historical-start value="${escapeHtml(event.start_year)}"></label><label>Fin<input type="number" data-historical-end value="${escapeHtml(event.end_year)}"></label><label class="historical-editor-label">Événement<input data-historical-label value="${escapeHtml(event.label)}"></label><label>Catégorie<input data-historical-category value="${escapeHtml(event.category)}"></label><label>Inclus dans<select data-historical-parent>${parentOptions.map(option=>`<option value="${escapeHtml(option)}" ${option===event.parent_label?'selected':''}>${escapeHtml(option||'Aucun')}</option>`).join('')}</select></label><label class="checkbox-line"><input type="checkbox" data-historical-hidden ${event.hidden?'checked':''}> Masqué</label><button class="icon-button" type="button" data-historical-delete title="Supprimer">×</button></div>`).join('');
    }
    function openHistoricalTimelineDialog(){
        $('#historical-timeline-dialog')?.remove();
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal historical-timeline-dialog" id="historical-timeline-dialog"><div class="modal-head"><div><span class="eyebrow">FRISE HISTORIQUE</span><h2>Modifier les événements</h2><p>Un événement peut avoir une date de début, une date de fin et être rattaché à un événement plus large.</p></div><button class="icon-button" type="button" data-historical-close>×</button></div><div class="historical-editor-list" id="historical-editor-list">${historicalTimelineEditorRows()}</div><div class="modal-actions"><button class="button secondary" type="button" data-historical-add>Ajouter un événement</button><button class="button secondary" type="button" data-historical-reset>↺ Remettre comme au départ</button><span class="spacer"></span><button class="button secondary" type="button" data-historical-close>Annuler</button><button class="button" type="button" data-historical-save>Enregistrer</button></div></dialog>`);
        const dialog=$('#historical-timeline-dialog'),list=$('#historical-editor-list',dialog);
        const close=()=>{dialog.close();dialog.remove();};
        $$('[data-historical-close]',dialog).forEach(button=>button.addEventListener('click',close));
        const collect=()=>$$('[data-historical-row]',list).map(row=>normalizeHistoricalTimelineEvent({start_year:$('[data-historical-start]',row)?.value,end_year:$('[data-historical-end]',row)?.value,label:$('[data-historical-label]',row)?.value,category:$('[data-historical-category]',row)?.value,parent_label:$('[data-historical-parent]',row)?.value,hidden:$('[data-historical-hidden]',row)?.checked})).filter(item=>item.start_year&&item.label);
        const rerender=items=>{saveHistoricalTimelineEvents(items);list.innerHTML=historicalTimelineEditorRows();bindRows();};
        const bindRows=()=>{$$('[data-historical-delete]',list).forEach(button=>button.addEventListener('click',()=>{const row=button.closest('[data-historical-row]');row?.remove();$$('[data-historical-row]',list).forEach((item,index)=>{$('.order-number',item).textContent=String(index+1).padStart(2,'0');});}));};
        bindRows();
        $('[data-historical-add]',dialog).addEventListener('click',()=>rerender([...collect(),{start_year:new Date().getFullYear(),end_year:new Date().getFullYear(),label:'Nouvel événement',category:'',parent_label:'',hidden:false}]));
        $('[data-historical-reset]',dialog).addEventListener('click',()=>{localStorage.removeItem('genealogie-historical-timeline');list.innerHTML=historicalTimelineEditorRows();bindRows();toast('Frise historique réinitialisée.');});
        $('[data-historical-save]',dialog).addEventListener('click',()=>{saveHistoricalTimelineEvents(collect());toast('Frise historique enregistrée.');close();renderTimeline();});
        dialog.showModal();
    }
    /* ═════ Sortes d'événements (🧩 filtre), âge (🎂), anomalies (🚨) ═════ */
    const KINDS = [
        ['birth', '👶 Naissances et baptêmes', /^(BIRT|CHR|BAPM|ADOP)$/, /naiss|bapt|adopt/],
        ['union', '💍 Mariages et unions', /^(MARR|MARB|MARC|MARL|MARS|ENGA|DIV|DIVF|ANUL)$/, /mari|fian|divor|union|pacs|contrat de/],
        ['death', '✝️ Décès et sépultures', /^(DEAT|BURI|CREM)$/, /d[ée]c[èe]s|inhum|s[ée]pult|obs[èe]q|cr[ée]mat|mort/],
        ['occupation', '🔨 Métiers', /^(OCCU|EDUC|GRAD|RETI)$/, /m[ée]tier|profess|emploi|travail|apprenti|retraite|[ée]tudes|dipl[ôo]me/],
        ['home', '🏠 Domiciles et départs', /^(RESI|EMIG|IMMI|NATU)$/, /r[ée]sid|domicil|d[ée]m[ée]nag|[ée]migr|immigr|naturalis|adresse/],
        ['military', '🎖 Militaire', /^(_MIL|_MILT|_MILI|MILI|_MDCL)/, /milit|conscri|r[ée]giment|matricul|mobilis|guerre|bless|d[ée]cor/],
        ['census', '📋 Recensements', /^CENS$/, /recens/],
        ['other', '📌 Autres', null, null],
    ];
    const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let tagByLabel = null;
    function kindOf(event) {
        if (event._kind) return event._kind;
        if (!tagByLabel) { tagByLabel = new Map(); (state.bootstrap?.eventTypes || []).forEach(t => tagByLabel.set(fold(t.label), String(t.gedcom_tag || '').toUpperCase())); }
        const tag = String(event.gedcom_tag || tagByLabel.get(fold(event.type)) || '').toUpperCase(), label = fold(event.type);
        const k = KINDS.find(([, , re]) => re && tag && re.test(tag)) || KINDS.find(([, , , re]) => re && re.test(label));
        return (event._kind = k ? k[0] : 'other');
    }
    const kindLabel = id => T((KINDS.find(k => k[0] === id) || KINDS[KINDS.length - 1])[1]);
    const isCouple = event => !event.last_name && / & /.test(event.first_name || '');
    function parseDate(text) { const P = A().parsedGenealogyDate; const d = P ? P(String(text || '')) : null; if (d) return d; const m = String(text || '').match(/(1\d{3}|20\d\d)/); return m ? {exact: false, year: +m[1]} : null; }
    /** « 34 ans » : l'âge de la personne à cet événement (d'après sa naissance) */
    function ageText(event, births) {
        if (isCouple(event) || kindOf(event) === 'birth') return '';
        const b = births.get(Number(event.person_id)); if (!b) return '';
        const from = parseDate(b.date_text || b.year), to = parseDate(event.date_text || event.year); if (!from || !to) return '';
        let years;
        if (from.exact && to.exact) { if (to.date < from.date) return ''; years = to.date.getUTCFullYear() - from.date.getUTCFullYear(); if (to.date.getUTCMonth() < from.date.getUTCMonth() || (to.date.getUTCMonth() === from.date.getUTCMonth() && to.date.getUTCDate() < from.date.getUTCDate())) years--; }
        else { years = (to.year || 0) - (from.year || 0); if (years < 0) return ''; }
        return years === 0 ? T('moins d’un an') : years === 1 ? T('1 an') : T('{n} ans', {n: years});
    }
    function birthsOf(events) {
        const map = new Map();
        events.forEach(e => { if (kindOf(e) === 'birth' && !isCouple(e) && Number(e.person_id) && (!map.has(Number(e.person_id)) || /naiss/.test(fold(e.type)))) map.set(Number(e.person_id), e); });
        (state.people || []).forEach(p => { const id = Number(p.id); if (!map.has(id) && (p.birth_date || p.birth_year)) map.set(id, {date_text: p.birth_date || '', year: p.birth_year}); });
        return map;
    }
    let anomalyCache = null;
    async function anomalies() {
        if (anomalyCache && Date.now() - anomalyCache.at < 60000) return anomalyCache.map;
        const map = new Map();
        try {
            const st = await api('controle');
            (st.alerts || []).forEach(a => {
                const ids = a.fix?.event_id ? [a.fix.event_id] : (a.dates || []).filter(Boolean).map(d => d.event_id);
                ids.filter(Boolean).forEach(id => { const k = Number(id); (map.get(k) || map.set(k, []).get(k)).push(String(a.title || a.view || '')); });
            });
        } catch (_) { /* le Contrôle n'est pas là : pas de rouge */ }
        anomalyCache = {at: Date.now(), map};
        return map;
    }
    const eventName = event => [event.first_name, event.last_name].filter(Boolean).join(' ');
    function eventAttrs(event) {
        const text = [event.type, eventName(event), event.date_text, event.place, event._age].filter(Boolean).join(' ');
        return `data-event-id="${Number(event.id) || ''}" data-person-id="${Number(event.person_id) || ''}" data-kind="${kindOf(event)}" data-text="${escapeHtml(fold(text))}" data-ctx-menu`;
    }
    function eventInnerHtml(event) {
        const age = state.timeline.ages !== false && event._age ? ` <span class="chrono-age" title="${escapeHtml(T('Âge à cet événement'))}">🎂 ${escapeHtml(event._age)}</span>` : '';
        const warn = event._anomaly ? `<p class="chrono-anomaly" role="note">🚨 ${escapeHtml(event._anomaly.join(' · '))}</p>` : '';
        const lock = A().privateEventBadge?.(event) || ''; // 🔒 événement confidentiel : la pastille, pour le propriétaire
        return `<strong>${escapeHtml(event.type)} · <button class="table-link" data-open-person="${Number(event.person_id) || ''}">${escapeHtml(eventName(event))}</button>${age}</strong>${lock}<p>${escapeHtml([event.date_text, event.place].filter(Boolean).join(' — '))}</p>${warn}<button type="button" class="chrono-more icon-button" data-chrono-more title="${escapeHtml(T('Plus d’actions'))}" aria-label="${escapeHtml(T('Plus d’actions'))}">⋯</button>`;
    }
    function timelineRowsHtml(events) {
        return events.length ? `<div class="timeline">${events.map(event => `<article class="timeline-row${event._anomaly ? ' is-anomaly' : ''}" ${eventAttrs(event)}><div class="timeline-year">${event.year}</div><span class="timeline-node" style="--event-color:${escapeHtml(event.color)}"></span><div class="timeline-card">${eventInnerHtml(event)}</div></article>`).join('')}</div>` : emptyState({text: T('Aucun événement daté dans cette sélection.'), icon: '🕰️', hint: T('Ajoute des dates aux événements des fiches, ou montre d’autres sortes d’événements.')});
    }

    /* ═════ 📏 Barres de vie : une ligne par personne, sur une échelle horizontale qu'on agrandit ═════ */
    function barsHtml(sets, minYear, maxYear) {
        const ppy = Math.max(2, Math.min(80, Number(state.timeline.zoom) || 8));
        const from = Math.floor(minYear / 10) * 10 - 5, to = Math.ceil(maxYear / 10) * 10 + 5, width = (to - from) * ppy;
        const x = y => Math.round((y - from) * ppy);
        const people = new Map();
        sets.forEach((events, lane) => events.forEach(e => {
            const id = isCouple(e) ? `c${e.id}` : `p${Number(e.person_id) || 0}`;
            const row = people.get(id) || people.set(id, {name: eventName(e), pid: Number(e.person_id) || 0, lane, events: []}).get(id);
            row.events.push(e);
        }));
        const step = ppy >= 30 ? 1 : ppy >= 12 ? 5 : ppy >= 5 ? 10 : 25;
        const ticks = []; for (let y = Math.ceil(from / step) * step; y <= to; y += step) ticks.push(`<span class="chrono-tick" style="left:${x(y)}px">${y}</span>`);
        const hist = state.timeline.history ? historicalTimelineEvents().filter(h => !h.hidden && h.end_year >= from && h.start_year <= to).map(h => `<span class="chrono-band" style="left:${x(h.start_year)}px;width:${Math.max(3, x(h.end_year + 1) - x(h.start_year))}px" title="${escapeHtml(`${h.label} (${h.start_year}${h.end_year > h.start_year ? '-' + h.end_year : ''})`)}"></span>`).join('') : '';
        const rows = [...people.values()].sort((a, b) => Math.min(...a.events.map(e => +e.year)) - Math.min(...b.events.map(e => +e.year))).map(row => {
            const ys = row.events.map(e => Number(e.year)).filter(Boolean), y0 = Math.min(...ys), y1 = Math.max(...ys);
            const dots = row.events.map(e => `<span class="chrono-dot${e._anomaly ? ' is-anomaly' : ''}" style="left:${x(+e.year) - x(y0)}px;--event-color:${escapeHtml(e.color || '#888')}" ${eventAttrs(e)} title="${escapeHtml([Number(e.is_private) ? '🔒' : '', e.type, e.date_text, e.place, e._age ? '🎂 ' + e._age : '', e._anomaly ? '🚨 ' + e._anomaly.join(' · ') : ''].filter(Boolean).join(' · '))}"></span>`).join('');
            return `<div class="chrono-bar-row" data-lane="${row.lane}"><button type="button" class="table-link chrono-bar-name" ${row.pid ? `data-open-person="${row.pid}"` : ''}>${escapeHtml(row.name)}</button><div class="chrono-bar-track" style="width:${width}px"><span class="chrono-bar" style="left:${x(y0)}px;width:${Math.max(6, x(y1) - x(y0))}px">${dots}</span></div></div>`;
        }).join('');
        return `<div class="chrono-bars" data-chrono-bars style="--chrono-width:${width}px"><div class="chrono-bars-tools no-export"><button type="button" class="button small secondary" data-chrono-zoom="-1" title="${escapeHtml(T('Voir plus d’années'))}">－</button><button type="button" class="button small secondary" data-chrono-zoom="1" title="${escapeHtml(T('Agrandir une période'))}">＋</button><small>${escapeHtml(T('⌘ ou Ctrl + molette : agrandir là où est la souris.'))}</small></div><div class="chrono-bars-scroll"><div class="chrono-bars-inner"><div class="chrono-ruler" style="width:${width}px">${ticks.join('')}</div><div class="chrono-bands" style="width:${width}px">${hist}</div>${rows || emptyState({text: T('Aucun événement daté dans cette sélection.'), icon: '📏'})}</div></div></div>`;
    }
    function bindBars(root) {
        const box = $('[data-chrono-bars]', root); if (!box) return;
        const scroller = $('.chrono-bars-scroll', box);
        const zoomTo = (ppy, atX = scroller.clientWidth / 2) => {
            const old = Math.max(2, Math.min(80, Number(state.timeline.zoom) || 8)), next = Math.max(2, Math.min(80, ppy)); if (next === old) return;
            const yearAt = (scroller.scrollLeft + atX) / old;
            state.timeline.zoom = next; persistUiState(); draw();
            const s2 = $('[data-chrono-bars] .chrono-bars-scroll'); if (s2) s2.scrollLeft = Math.max(0, yearAt * next - atX);
        };
        $$('[data-chrono-zoom]', box).forEach(b => b.addEventListener('click', () => { const z = Number(state.timeline.zoom) || 8; zoomTo(Number(b.dataset.chronoZoom) > 0 ? z * 1.5 : z / 1.5); }));
        scroller.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey) && !e.target.closest('.chrono-ruler')) return; e.preventDefault(); const r = scroller.getBoundingClientRect(), z = Number(state.timeline.zoom) || 8; zoomTo(e.deltaY < 0 ? z * 1.25 : z / 1.25, e.clientX - r.left); }, {passive: false});
    }

    /* ═════ La colonne de gauche : tout s'applique dès qu'on le change (plus de bouton « Actualiser ») ═════ */
    const BAR_KEY = 'chronologie';
    let bar = null;
    function rootName() {
        const id = Number(state.currentPersonId);
        if (Number(state.currentPerson?.person?.id) === id) return personName(state.currentPerson.person);
        const p = (state.people || []).find(x => Number(x.id) === id); if (p) return personName(p);
        return state.timeline.rootName || personName(summaryFromState());
    }
    const savedViews = () => (state.bootstrap?.savedViews || []).filter(v => v.module === 'timeline');
    function renderTimelineSidebar(content, footer) {
        const tl = state.timeline, P = window.LCNDA_PICKER;
        const isPlace = tl.source === 'place';
        const gen = (id, v) => `<select id="${id}"><option value="0">${escapeHtml(T('Aucun'))}</option>${Array.from({length: 10}, (_, i) => i + 1).map(n => `<option value="${n}" ${n === Number(v) ? 'selected' : ''}>${escapeHtml(n > 1 ? T('{n} générations', {n}) : T('1 génération'))}</option>`).join('')}</select>`;
        const rootField = isPlace
            ? `<div class="chrono-root" id="timeline-place-pk">${P?.pickerField ? P.pickerField({name: 'timeline_place', kind: 'place', allowCreate: false, allowFree: false, value: Number(tl.placeId) ? {id: Number(tl.placeId), title: tl.placeName || '', kind: 'place'} : null}).replace(' name="timeline_place"', '') : ''}</div>`
            : `<div class="chrono-root" id="timeline-root-pk">${P?.pickerField ? P.pickerField({name: 'timeline_root', kind: 'person', allowCreate: false, value: Number(state.currentPersonId) ? {id: Number(state.currentPersonId), title: rootName(), kind: 'person'} : null}).replace(' name="timeline_root"', '') : `<button class="person-list-item" id="timeline-person"><strong>${escapeHtml(rootName())}</strong></button>`}</div>`;
        const views = savedViews();
        content.innerHTML = `<div class="chrono-listbar" id="timeline-listbar"></div>
            <div class="section-label" style="margin-top:6px">${escapeHtml(T('Partir de'))}</div>
            <div class="segmented chrono-source" role="radiogroup"><button type="button" class="${!isPlace ? 'is-active' : ''}" data-chrono-source="person">👤 ${escapeHtml(T('Une personne'))}</button><button type="button" class="${isPlace ? 'is-active' : ''}" data-chrono-source="place">🏘 ${escapeHtml(T('Un lieu'))}</button></div>
            ${rootField}
            <div class="section-label">${escapeHtml(T('Affichage'))}</div>
            <div class="segmented chrono-view" role="radiogroup"><button type="button" class="${tl.view !== 'bars' ? 'is-active' : ''}" data-chrono-view="vertical">🕰 ${escapeHtml(T('Frise'))}</button><button type="button" class="${tl.view === 'bars' ? 'is-active' : ''}" data-chrono-view="bars">📏 ${escapeHtml(T('Barres de vie'))}</button></div>
            <div class="form-grid one-column chrono-options" style="padding:0;gap:10px">
                ${isPlace ? '' : `<label>${escapeHtml(T('Ascendants'))}${gen('timeline-up', tl.up)}</label><label>${escapeHtml(T('Descendants'))}${gen('timeline-down', tl.down)}</label><label class="ui-toggle"><input id="timeline-partners" type="checkbox" ${tl.partners ? 'checked' : ''}><i></i>${escapeHtml(T('Conjoints'))}</label>`}
                <label class="ui-toggle"><input id="timeline-ages" type="checkbox" ${tl.ages !== false ? 'checked' : ''}><i></i>🎂 ${escapeHtml(T('Âge à chaque événement'))}</label>
                <label class="ui-toggle"><input id="timeline-anomalies" type="checkbox" ${tl.anomalies !== false ? 'checked' : ''}><i></i>🚨 ${escapeHtml(T('Anomalies en rouge'))}</label>
                <label class="ui-toggle"><input id="timeline-history" type="checkbox" ${tl.history ? 'checked' : ''}><i></i>${escapeHtml(T('Frise historique'))}</label>
                <label class="ui-toggle"><input id="timeline-meteo" type="checkbox" ${tl.meteo ? 'checked' : ''}><i></i>🌦 ${escapeHtml(T('Météo'))}</label>
            </div>
            ${isPlace ? '' : `<div class="section-label">${escapeHtml(T('Comparer'))}</div><div class="timeline-compare-control"></div>`}
            <div class="section-label">💾 ${escapeHtml(T('Vues enregistrées'))}</div>
            <div class="chrono-saved" id="timeline-saved">${views.length ? views.map(v => `<div class="saved-item chrono-saved-item" data-chrono-view-id="${Number(v.id)}" data-ctx-menu><button type="button" class="chrono-saved-open" data-chrono-open-view="${Number(v.id)}">${escapeHtml(v.name)}</button><button type="button" class="icon-button" data-chrono-view-more="${Number(v.id)}" title="${escapeHtml(T('Plus d’actions'))}" aria-label="${escapeHtml(T('Plus d’actions'))}">⋯</button></div>`).join('') : `<small class="muted">${escapeHtml(T('Aucune vue pour l’instant : règle la frise, puis « 💾 Enregistrer la vue ».'))}</small>`}</div>`;
        footer.innerHTML = `${escapeHtml(T('Les événements sans année restent sur les fiches.'))}<button class="button small secondary" type="button" data-world-list style="margin-top:8px;width:100%" title="${escapeHtml(T('Les grands événements livrés avec l’app, et les tiens (histoire locale)'))}">🌍 ${escapeHtml(T('Le monde autour…'))}</button>${kiosk() ? '' : `<button class="button small secondary" type="button" id="edit-historical-timeline" style="margin-top:8px;width:100%">${escapeHtml(T('Modifier la frise historique'))}</button>`}`;
        // la barre commune (H10) : 🔍 chercher dans la frise · Filtrer ▾ les sortes d'événements
        const slot = $('#timeline-listbar', content);
        if (slot && UI().listBar) {
            // les sortes choisies sont gardées avec les autres réglages de la frise (state.timeline → clé genealogie-…, synchronisée)
            bar = UI().listBar({key: BAR_KEY, remember: false, search: {placeholder: T('Chercher dans la frise… (nom, lieu, année)'), value: tl.q || ''}, filters: [{id: 'kinds', type: 'check', label: T('Sortes d’événements'), value: Array.isArray(tl.kinds) ? tl.kinds : [], options: KINDS.map(k => [k[0], T(k[1])])}], onChange: st => { tl.kinds = st.filters.kinds || []; tl.q = st.q || ''; persistUiState(); draw(); }});
            slot.appendChild(bar);
        } else bar = null;
        const parallelMode = tl.parallelMode || (tl.compare ? 'person' : 'single');
        const compareControl = $('.timeline-compare-control', content);
        if (compareControl) compareControl.innerHTML = `<label>${escapeHtml(T('Mode de chronologie parallèle'))}<select id="timeline-parallel-mode"><option value="single" ${parallelMode === 'single' ? 'selected' : ''}>${escapeHtml(T('Une personne'))}</option><option value="person" ${parallelMode === 'person' ? 'selected' : ''}>${escapeHtml(T('Une autre personne'))}</option><option value="couple" ${parallelMode === 'couple' ? 'selected' : ''}>${escapeHtml(T('Le couple'))}</option><option value="siblings" ${parallelMode === 'siblings' ? 'selected' : ''}>${escapeHtml(T('La fratrie'))}</option><option value="multiple" ${parallelMode === 'multiple' ? 'selected' : ''}>${escapeHtml(T('Plusieurs personnes choisies'))}</option></select></label><input id="timeline-compare" type="checkbox" hidden ${parallelMode !== 'single' ? 'checked' : ''}><div id="timeline-compare-picker" class="timeline-compare-picker" ${['person', 'multiple'].includes(parallelMode) ? '' : 'hidden'}><span class="pk-lab">${escapeHtml(parallelMode === 'multiple' ? T('Personnes à comparer') : T('Personne à comparer'))}</span><div class="timeline-compare-input-wrap" id="timeline-compare-pk">${(P?.pickerField(parallelMode === 'multiple' ? {name: 'timeline_parallel', kind: 'person', multiple: true, allowCreate: false, value: (tl.parallelPeople || []).filter(person => Number(person.id)).map(person => ({id: Number(person.id), title: person.name || '', kind: 'person'}))} : {name: 'timeline_compare', kind: 'person', allowCreate: false, value: Number(tl.comparePersonId) ? {id: Number(tl.comparePersonId), title: tl.comparePersonName || '', kind: 'person'} : null}) || '').replace(/ name="timeline_(parallel|compare)"/, '')}<input id="timeline-compare-search" type="hidden" value="${escapeHtml(parallelMode === 'person' ? (tl.comparePersonName || '') : '')}"><input id="timeline-compare-id" type="hidden" value="${escapeHtml(String(tl.comparePersonId || 0))}"></div>${parallelMode === 'multiple' && !(tl.parallelPeople || []).length ? `<small>${escapeHtml(T('Ajoute au moins une personne.'))}</small>` : ''}</div>`;
        const sig = A().sidebarSignal?.();
        const on = (sel, ev, fn) => { const el = $(sel, content); if (el) el.addEventListener(ev, fn, sig ? {signal: sig} : undefined); };
        $('#timeline-person', content)?.addEventListener('click', () => setModule('personnes'));
        $('#edit-historical-timeline')?.addEventListener('click', openHistoricalTimelineDialog);
        const apply = async (again = false) => { persistUiState(); if (again) renderSidebar(); await renderTimeline(); };
        on('#timeline-up', 'change', e => { tl.up = Number(e.target.value); apply(); });
        on('#timeline-down', 'change', e => { tl.down = Number(e.target.value); apply(); });
        on('#timeline-partners', 'change', e => { tl.partners = e.target.checked; apply(); });
        on('#timeline-history', 'change', e => { tl.history = e.target.checked; apply(); });
        on('#timeline-meteo', 'change', e => { tl.meteo = e.target.checked; apply(); }); // 🌦 la météo de chaque événement (heritage-meteo.js)
        on('#timeline-ages', 'change', e => { tl.ages = e.target.checked; persistUiState(); draw(); });
        on('#timeline-anomalies', 'change', e => { tl.anomalies = e.target.checked; apply(); });
        on('#timeline-parallel-mode', 'change', e => { tl.parallelMode = e.target.value; tl.compare = tl.parallelMode !== 'single'; apply(true); });
        content.addEventListener('click', e => {
            const src = e.target.closest('[data-chrono-source]'); if (src) { tl.source = src.dataset.chronoSource; apply(true); return; }
            const vw = e.target.closest('[data-chrono-view]'); if (vw) { tl.view = vw.dataset.chronoView; persistUiState(); $$('[data-chrono-view]', content).forEach(b => b.classList.toggle('is-active', b === vw)); draw(); return; }
            const open = e.target.closest('[data-chrono-open-view]'); if (open) { applyView(Number(open.dataset.chronoOpenView)); return; }
            const more = e.target.closest('[data-chrono-view-more]'); if (more) { viewMenu(Number(more.dataset.chronoViewMore), more); }
        }, sig ? {signal: sig} : undefined);
        content.addEventListener('contextmenu', e => { const row = e.target.closest('[data-chrono-view-id]'); if (!row || e.shiftKey) return; e.preventDefault(); e.stopPropagation(); viewMenu(Number(row.dataset.chronoViewId), null, e); }, sig ? {signal: sig} : undefined);
        // 👤 la personne de départ, choisie ici (elle devient aussi la fiche ouverte dans Personnes)
        $('#timeline-root-pk', content)?.addEventListener('picker-change', e => { const it = e.detail.item; if (!it || it.free || !Number(it.id)) return; state.currentPersonId = Number(it.id); tl.rootName = it.title || ''; apply(); });
        $('#timeline-place-pk', content)?.addEventListener('picker-change', e => { const it = e.detail.item; tl.placeId = it && !it.free ? Number(it.id) : 0; tl.placeName = it ? (it.name || it.title || '') : ''; apply(); });
        setupTimelineComparisonPicker();
    }

    // personne(s) à comparer : menu de choix unique (une personne, ou plusieurs en mode « Plusieurs personnes choisies ») ; appliqué tout de suite
    function setupTimelineComparisonPicker() {
        const wrap = $('#timeline-compare-pk'), hidden = $('#timeline-compare-id'), name = $('#timeline-compare-search');
        if (!wrap || !hidden || !name) return;
        wrap.addEventListener('picker-change', event => {
            if ((state.timeline.parallelMode || 'person') === 'multiple') { state.timeline.parallelPeople = (event.detail.items || []).filter(it => !it.free && it.id).map(it => ({id: Number(it.id), name: it.title})); persistUiState(); renderTimeline(); return; }
            const it = event.detail.item; hidden.value = String(it && !it.free ? Number(it.id) : 0); name.value = it ? it.title : '';
            state.timeline.comparePersonId = Number(hidden.value) || 0; state.timeline.comparePersonName = name.value; persistUiState(); renderTimeline();
        });
    }

    /* ═════ 💾 Vues enregistrées (module « timeline » des vues de l'app) ═════ */
    const VIEW_KEYS = ['kinds', 'source', 'placeId', 'placeName', 'up', 'down', 'partners', 'history', 'meteo', 'ages', 'anomalies', 'view', 'zoom', 'parallelMode', 'compare', 'comparePersonId', 'comparePersonName', 'parallelPeople'];
    function viewConfig() { const c = {personId: Number(state.currentPersonId) || 0, personName: rootName()}; VIEW_KEYS.forEach(k => { if (state.timeline[k] !== undefined) c[k] = state.timeline[k]; }); return c; }
    function saveView() {
        if (kiosk()) return;
        const c = viewConfig(), name = c.source === 'place' ? T('Chronologie de {x}', {x: c.placeName || T('ce lieu')}) : T('Chronologie de {x}', {x: c.personName});
        A().openViewDialog?.('timeline', c, 0, name);
    }
    async function applyView(id) {
        const v = savedViews().find(x => Number(x.id) === id); if (!v) return;
        let c = v.config || {}; if (typeof c === 'string') { try { c = JSON.parse(c); } catch (_) { c = {}; } }
        if (!Object.keys(c).length && v.config_json) { try { c = JSON.parse(v.config_json); } catch (_) {} }
        VIEW_KEYS.forEach(k => { if (k in c) state.timeline[k] = c[k]; });
        if (Number(c.personId)) { state.currentPersonId = Number(c.personId); state.timeline.rootName = c.personName || ''; }
        persistUiState(); renderSidebar();
        await renderTimeline(); toast(T('Vue « {name} » affichée.', {name: v.name}));
    }
    function viewMenu(id, anchor, ev = null) {
        const v = savedViews().find(x => Number(x.id) === id); if (!v) return;
        const items = [{icon: '↗', label: T('Afficher'), run: () => applyView(id)}];
        if (!kiosk()) items.push({icon: '✎', label: T('Renommer'), run: () => A().openViewDialog?.('timeline', viewConfig(), id, v.name)}, '-', {icon: '🗑', label: T('Supprimer'), danger: true, run: () => A().deleteWithUndo?.({action: 'delete_view', body: {id}, type: 'view', id, message: T('Vue « {name} » supprimée', {name: v.name}), after: async () => { await A().reloadBootstrap?.(); renderSidebar(); }})});
        if (ev) UI().contextMenu?.(ev, items, {title: `« ${v.name} »`}); else UI().menuAt?.(anchor, items, {title: `« ${v.name} »`});
    }

    /* ═════ ⋯ et clic droit sur un événement (R11 : Ouvrir · … · — · Supprimer) ═════ */
    function eventMenu(el, at) {
        const id = Number(el.dataset.eventId), pid = Number(el.dataset.personId);
        const items = [];
        if (pid) items.push({icon: '↗', label: T('Ouvrir la fiche'), run: () => { state.currentPersonId = pid; setModule('personnes'); }});
        if (pid && pid !== Number(state.currentPersonId)) items.push({icon: '🕰', label: T('Partir de cette personne'), run: () => { state.currentPersonId = pid; state.timeline.source = 'person'; state.timeline.rootName = ''; persistUiState(); renderSidebar(); renderTimeline(); }});
        if (pid && pid !== Number(state.currentPersonId)) items.push({icon: '⚖️', label: T('Comparer avec la personne de départ'), run: () => { state.comparison = {...(state.comparison || {}), left: Number(state.currentPersonId), leftName: rootName(), right: pid, rightName: ''}; state.comparisonMode = 'personnes'; persistUiState(); setModule('comparaison'); }});
        items.push({icon: '⧉', label: T('Copier la ligne'), run: () => { const txt = (el.title || el.innerText || '').replace(/⋯/g, '').replace(/\s+/g, ' ').trim(); navigator.clipboard?.writeText(txt).then(() => toast(T('Copié.'))).catch(() => {}); }});
        if (id && !kiosk()) items.push('-', {icon: '🗑', label: T('Supprimer l’événement'), danger: true, run: () => A().deleteWithUndo?.({action: 'delete_event', body: {id}, type: 'event', id, message: T('Événement supprimé'), after: () => renderTimeline()})});
        if (at) UI().contextMenu?.(at, items, {title: T('Événement')}); else UI().menuAt?.(el.querySelector('[data-chrono-more]') || el, items, {title: T('Événement')});
    }
    function bindEvents(root) {
        root.addEventListener('click', e => { const b = e.target.closest('[data-chrono-more]'); if (b) { e.stopPropagation(); eventMenu(b.closest('[data-event-id]'), null); return; } const d = e.target.closest('.chrono-dot[data-event-id]'); if (d) eventMenu(d, null); });
        root.addEventListener('contextmenu', e => { const el = e.target.closest('[data-event-id]'); if (!el || e.shiftKey || !el.dataset.eventId) return; e.preventDefault(); e.stopPropagation(); eventMenu(el, e); });
    }

    /* ═════ Données ═════ */
    const colorByLabel = label => { const t = (state.bootstrap?.eventTypes || []).find(x => fold(x.label) === fold(label)); return t?.color || '#8a7f73'; };
    async function placeEvents(placeId) {
        const seen = new Set(), out = []; let from = 0;
        for (let i = 0; i < 12; i++) {
            const d = await api('place_monograph', {place_id: placeId, year_from: from || '', show_digests: 0, show_battues: 0, show_cemetery: 0});
            const evs = (d.events || []).filter(e => e.year != null && e.year !== '');
            evs.forEach(e => { if (seen.has(e.id)) return; seen.add(e.id); const couple = !e.person_id && (e.partner1_id || e.partner2_id);
                out.push({id: e.id, is_private: Number(e.is_private) || 0, year: Number(e.year), date_text: e.date_text || String(e.year), type: e.type_label, color: colorByLabel(e.type_label), person_id: Number(e.person_id || e.partner1_id || e.partner2_id) || 0,
                    first_name: couple ? [e.partner1_name, e.partner2_name].filter(Boolean).join(' & ') : (e.person_name || ''), last_name: '', place: d.place?.name || ''}); });
            if ((d.events || []).length < 100) break;
            const last = Math.max(...evs.map(e => Number(e.year)));
            if (!Number.isFinite(last) || last === from) break; from = last;
        }
        return {events: out.sort((a, b) => a.year - b.year || a.id - b.id), peopleCount: new Set(out.map(e => e.person_id).filter(Boolean)).size};
    }
    let cache = null;
    async function renderTimeline(token = ++state.workspaceToken) {
        const tl = state.timeline;
        if (!$('#workspace .chrono-page')) $('#workspace').innerHTML = `<section class="page chrono-page">${UI().spinner ? UI().spinner(T('Chargement de la frise…')) : escapeHtml(T('Chargement de la frise…'))}</section>`; // R10
        let results = [], parallel = [];
        try {
            if (tl.source === 'place') {
                if (!Number(tl.placeId)) { results = [{events: [], peopleCount: 0}]; }
                else results = [await placeEvents(Number(tl.placeId))];
            } else {
                const mode = tl.parallelMode || (tl.compare ? 'person' : 'single');
                if (mode === 'person' && Number(tl.comparePersonId)) parallel = [{id: Number(tl.comparePersonId), name: tl.comparePersonName || T('Personne comparée')}];
                else if (mode === 'multiple') parallel = (tl.parallelPeople || []).filter(person => Number(person.id));
                else if (['couple', 'siblings'].includes(mode)) {
                    const relatives = await api('timeline_people', {id: state.currentPersonId});
                    parallel = (mode === 'couple' ? relatives.partners : relatives.siblings).map(person => ({id: Number(person.id), name: personName(person)}));
                }
                parallel = parallel.filter((person, index, items) => Number(person.id) && Number(person.id) !== Number(state.currentPersonId) && items.findIndex(c => Number(c.id) === Number(person.id)) === index).slice(0, 8);
                results = await Promise.all([state.currentPersonId, ...parallel.map(person => person.id)].map(id => api('timeline', {id, up: tl.up, down: tl.down, partners: tl.partners ? 1 : 0})));
            }
        } catch (error) { if (token === state.workspaceToken) $('#workspace').innerHTML = emptyState({text: error.message || T('La frise n’a pas pu se charger.'), icon: '⚠️'}); return; }
        const anom = tl.anomalies !== false ? await anomalies() : new Map();
        if (token !== state.workspaceToken || state.module !== 'chronologie') return;
        const all = results.flatMap(r => r.events || []), births = birthsOf(all);
        all.forEach(e => { e._age = ageText(e, births); e._anomaly = anom.get(Number(e.id)) || null; });
        cache = {results, parallel};
        draw();
    }
    function filtered(events) {
        const st = bar?.state || {q: state.timeline.q || '', filters: {kinds: state.timeline.kinds || []}}, kinds = st.filters?.kinds || [], q = fold(st.q || '').trim();
        return (events || []).filter(e => !(kiosk() && Number(e.is_private)) && (!kinds.length || kinds.includes(kindOf(e))) // 🔒 un événement confidentiel n'est pas montré en consultation
             && (!q || fold([e.type, eventName(e), e.date_text, e.place, e.year, e._age].join(' ')).includes(q)));
    }
    function draw() {
        if (!cache || state.module !== 'chronologie') return;
        const tl = state.timeline, {results, parallel} = cache, isPlace = tl.source === 'place';
        const sets = results.map(r => filtered(r.events)), data = {...results[0], events: sets[0]};
        const allYears = sets.flatMap(evs => evs.map(e => Number(e.year)).filter(Boolean));
        const minYear = allYears.length ? Math.min(...allYears) : 1200, maxYear = allYears.length ? Math.max(...allYears) : new Date().getFullYear();
        const title = isPlace ? (tl.placeName || T('Un lieu')) : rootName();
        let body;
        if (isPlace && !Number(tl.placeId)) body = emptyState({text: T('Choisis un lieu dans la colonne de gauche.'), icon: '🏘', hint: T('Tout ce qui s’y est passé : naissances, mariages, décès, domiciles… familles comprises.')});
        else if (tl.view === 'bars') body = barsHtml(sets, minYear, maxYear);
        else {
            const showAligned = results.length > 1 || tl.history;
            const historicalYears = tl.history ? historicalTimelineEvents().filter(event => !event.hidden && event.end_year >= minYear && event.start_year <= maxYear).flatMap(event => [Math.max(event.start_year, minYear), Math.min(event.end_year, maxYear)]) : [];
            const sharedPositions = showAligned ? relaxedTimelinePositions([...allYears, ...historicalYears], minYear, maxYear) : null;
            const primaryHtml = showAligned ? timelineAlignedHtml(data.events, minYear, maxYear, sharedPositions, tl.history) : timelineRowsHtml(data.events);
            const lane = (label, name, rows) => `<section><header class="timeline-compare-heading"><span class="eyebrow">${escapeHtml(label)}</span><h3>${escapeHtml(name)}</h3></header>${timelineAlignedHtml(rows, minYear, maxYear, sharedPositions, false)}</section>`;
            const lanes = [lane(T('PERSONNE A'), title, data.events), ...sets.slice(1).map((rows, index) => lane(T('PERSONNE {l}', {l: String.fromCharCode(66 + index)}), parallel[index]?.name || T('Personne comparée'), rows))];
            const timelineHtml = results.length > 1 ? `<div class="timeline-comparison-layout is-multiple">${lanes.join('')}</div>` : primaryHtml;
            const historyHtml = tl.history && results.length > 1 ? `<aside class="historical-timeline is-aligned"><header><span class="eyebrow">${escapeHtml(T('FRISE HISTORIQUE'))}</span><h3>${escapeHtml(T('Contexte commun'))}</h3></header><div class="historical-aligned-stage" style="--timeline-stage-height:${sharedPositions.height}px">${historicalTimelineHtml([], minYear, maxYear, sharedPositions)}</div></aside>` : '';
            body = `<div class="timeline-layout ${tl.history ? 'has-history' : ''}">${timelineHtml}${historyHtml}</div>`;
        }
        const total = results.reduce((n, r) => n + (r.events || []).length, 0), shown = sets.reduce((n, s) => n + s.length, 0), nAnom = sets.flat().filter(e => e._anomaly).length;
        const count = [plural(data.peopleCount || 0, 'personne'), results.length > 1 ? T('{n} frises parallèles', {n: results.length}) : '', shown < total ? T('{a} événements sur {b}', {a: shown, b: total}) : plural(total, 'événement'), nAnom ? `🚨 ${T('{n} à vérifier', {n: nAnom})}` : ''].filter(Boolean).join(' · ');
        const help = isPlace ? T('Tout ce qui s’est passé à {x}, familles comprises.', {x: escapeHtml(title)}) : T('Événements connus autour de {x}, classés sans modifier la formulation originale des dates.', {x: escapeHtml(title)});
        const actions = [`<button type="button" class="button secondary" data-chrono-export data-shortcut="Mod+E" title="${escapeHtml(T('Exporter la frise (⌘E)'))}">⤓ ${escapeHtml(T('Exporter'))} ▾</button>`, `<button type="button" class="button secondary" data-chrono-print data-shortcut="Mod+P" title="${escapeHtml(T('Imprimer la frise (⌘P)'))}">🖨 ${escapeHtml(T('Imprimer'))}</button>`];
        const more = kiosk() ? [] : [`<button type="button" data-chrono-save-view data-shortcut="Mod+S">💾 ${escapeHtml(T('Enregistrer la vue'))}</button>`];
        const ws = $('#workspace');
        ws.innerHTML = `<section class="page chrono-page${tl.view === 'bars' ? ' is-bars' : ''}">${UI().pageHeader({title: T('Chronologie'), help: `<b class="ui-ph-count">${escapeHtml(count)}</b> · ${help}`, actions, more})}<div class="chrono-body" id="chrono-body">${body}</div></section>`;
        bindTableLinks();
        bindEvents($('#chrono-body'));
        bindBars(ws);
        $('[data-chrono-export]', ws)?.addEventListener('click', openExport);
        $('[data-chrono-print]', ws)?.addEventListener('click', printTimeline);
        $('[data-chrono-save-view]', ws)?.addEventListener('click', saveView);
        if (tl.meteo) window.LCNDA_EXT?.meteo?.decorateTimeline?.(ws);
    }

    /* ═════ ⤓ Exporter (PDF, PNG, CSV) · 🖨 Imprimer (R4) ═════ */
    const exportTitle = () => (state.timeline.source === 'place' ? T('Chronologie de {x}', {x: state.timeline.placeName || T('ce lieu')}) : T('Chronologie de {x}', {x: rootName()}));
    function csvText() {
        const cell = v => (A().csvCell ? A().csvCell(v) : `"${String(v ?? '').replace(/"/g, '""')}"`);
        const head = [T('Année'), T('Date'), T('Événement'), T('Sorte'), T('Personne'), T('Lieu'), T('Âge'), T('À vérifier'), T('Frise')];
        const rows = [];
        (cache?.results || []).forEach((r, i) => filtered(r.events).forEach(e => rows.push([e.year, e.date_text || '', e.type, kindLabel(kindOf(e)).replace(/^\S+\s/, ''), eventName(e), e.place || '', e._age || '', (e._anomaly || []).join(' · '), i ? cache.parallel[i - 1]?.name || '' : (state.timeline.source === 'place' ? state.timeline.placeName : rootName())])));
        return '﻿' + [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
    }
    function download(name, blob) { const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(blob); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    const fileName = ext => `${A().safeExportFilename ? A().safeExportFilename(exportTitle(), 'chronologie') : 'chronologie'}.${ext}`;
    function printDoc() {
        const body = $('#chrono-body'); if (!body) return '';
        const clone = body.cloneNode(true); clone.querySelectorAll('.no-export, [data-chrono-more]').forEach(n => n.remove());
        const css = A().graphExportCss ? A().graphExportCss() : '';
        return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(exportTitle())}</title><style>${css}@page{margin:12mm}body{background:#fff;color:#000}.chrono-bars-scroll{overflow:visible!important}</style></head><body class="chrono-print"><h1 style="font:600 20px/1.3 sans-serif;margin:0 0 12px">${escapeHtml(exportTitle())}</h1>${clone.outerHTML}</body></html>`;
    }
    function printTimeline() {
        if (!cache) return;
        if (UI().openPrintDialog) return UI().openPrintDialog({title: exportTitle(), key: 'chronologie', html: printDoc(), photos: false});
        window.print(); // secours (sans LCNDA_UI)
    }
    async function pngBlob(scale = 1, mime = 'image/png') {
        const body = $('#chrono-body'); if (!body) throw new Error(T('Rien à exporter.'));
        const target = body.querySelector('.chrono-bars-inner') || body;
        const w = Math.min(14000, Math.max(640, Math.ceil(target.scrollWidth))), h = Math.min(14000, Math.max(360, Math.ceil(target.scrollHeight)));
        const clone = target.cloneNode(true); clone.querySelectorAll('.no-export, [data-chrono-more]').forEach(n => n.remove()); clone.style.width = `${w}px`;
        const css = (A().graphExportCss ? A().graphExportCss() : '').replace(/\]\]>/g, ']] >');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff"><style><![CDATA[${css}]]></style>${new XMLSerializer().serializeToString(clone)}</div></foreignObject></svg>`;
        const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml;charset=utf-8'}));
        try {
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(T('Ce navigateur ne sait pas faire une image de la frise : choisis PDF.'))); i.src = url; });
            const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(scale, scale); g.drawImage(img, 0, 0);
            return await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error(T('Image impossible : la frise est trop grande.')))), mime, 0.92));
        } finally { URL.revokeObjectURL(url); }
    }
    function openExport() {
        if (!cache) return;
        const csv = {id: 'csv', label: '📊 CSV', hint: T('tableur'), ext: 'csv', quality: false, run: async o => download(o?.filename || fileName('csv'), new Blob([csvText()], {type: 'text/csv;charset=utf-8'}))};
        if (!UI().openExportDialog) return csv.run();
        UI().openExportDialog({title: exportTitle(), defaultName: exportTitle(), quality: 150, formats: [
            {id: 'pdf', hint: T('par l’impression : « Enregistrer en PDF »'), quality: false, ext: '', run: async () => printTimeline()},
            {id: 'png', run: async o => download(o?.filename || fileName('png'), await pngBlob(Math.max(0.5, Math.min(4, (Number(o?.quality) || 96) / 96))))},
            {id: 'jpg', run: async o => download(o?.filename || fileName('jpg'), await pngBlob(Math.max(0.5, Math.min(4, (Number(o?.quality) || 96) / 96)), 'image/jpeg'))},
            csv,
            {id: 'print', quality: false, run: async () => printTimeline()},
        ]});
    }
    // ⌘P imprime la frise, ⌘E l'exporte, ⌘S enregistre la vue (R5) — seulement dans la Chronologie, sans fenêtre ouverte
    window.addEventListener('keydown', e => {
        if (state.module !== 'chronologie' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.repeat || document.querySelector('dialog[open]')) return;
        const k = e.key?.toLowerCase(); const run = k === 'p' ? printTimeline : k === 'e' ? openExport : k === 's' && !kiosk() ? saveView : null;
        if (!run || !cache) return; e.preventDefault(); e.stopPropagation(); run();
    }, true);

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderTimeline, renderTimelineSidebar});
    window.LCNDA_EXT = window.LCNDA_EXT || {};
    window.LCNDA_EXT.chronologie = {kindOf, ageText, birthsOf, csvText, KINDS: KINDS.map(k => k[0]), redraw: () => draw()};
    if (state.module === 'chronologie' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
