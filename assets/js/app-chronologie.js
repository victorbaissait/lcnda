/* LCNDA — 🕰️ Chronologie (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Frise de vie, frise historique réglable, comparaison de deux personnes dans le temps.
 */
(() => {
    'use strict';
    const {$, $$, api, bindTableLinks, card, debounce, empty, emptyState, escapeHtml, persistUiState, personName, plural, renderSidebar, setModule, state, summaryFromState, toast, years} = window.LCNDA_APP;
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
            const lines=group.events.map(event=>`<div class="timeline-card-line"><strong>${escapeHtml(event.type)} · <button class="table-link" data-open-person="${event.person_id}">${escapeHtml([event.first_name,event.last_name].filter(Boolean).join(' '))}</button></strong><p>${escapeHtml([event.date_text,event.place].filter(Boolean).join(' — '))}</p></div>`).join('');
            const first=group.events[0];
            return `<article class="timeline-aligned-row" style="--timeline-top:${top}px;--event-color:${escapeHtml(first.color)}"><div class="timeline-year">${group.year}</div><span class="timeline-node"></span><div class="timeline-card">${lines}</div></article>`;
        }).join('');
        const personLane=`<section class="timeline-aligned-lane"><header><span class="eyebrow">FRISE PERSONNELLE</span><h3>Événements</h3></header><div class="timeline-aligned-stage" style="--timeline-stage-height:${positions.height}px">${personRows}</div></section>`;
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
    function renderTimelineSidebar(content,footer){
        content.innerHTML=`<div class="section-label" style="margin-top:0">Personne de départ</div><button class="person-list-item" id="timeline-person"><strong>${escapeHtml(personName(summaryFromState()))}</strong><small>Changer dans l’onglet Personnes</small></button><div class="section-label">Inclure</div><div class="form-grid one-column" style="padding:0;gap:10px"><label>Ascendants<select id="timeline-up"><option value="0">Aucun</option>${Array.from({length:10},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===state.timeline.up?'selected':''}>${n} génération${n>1?'s':''}</option>`).join('')}</select></label><label>Descendants<select id="timeline-down"><option value="0">Aucun</option>${Array.from({length:10},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===state.timeline.down?'selected':''}>${n} génération${n>1?'s':''}</option>`).join('')}</select></label><label class="ui-toggle"><input id="timeline-partners" type="checkbox" ${state.timeline.partners?'checked':''}><i></i>Conjoints</label><label class="ui-toggle"><input id="timeline-history" type="checkbox" ${state.timeline.history?'checked':''}><i></i>Frise historique</label></div><div class="section-label">Comparer</div><div class="timeline-compare-control"><label class="ui-toggle timeline-compare-toggle"><input id="timeline-compare" type="checkbox" ${state.timeline.compare?'checked':''}><i></i>Ajouter une deuxième personne</label><div id="timeline-compare-picker" class="timeline-compare-picker" ${state.timeline.compare?'':'hidden'}><input id="timeline-compare-search" type="hidden" value="${escapeHtml(state.timeline.comparePersonName||'')}"><input id="timeline-compare-id" type="hidden" value="${escapeHtml(String(state.timeline.comparePersonId||0))}"></div></div><button class="button" id="timeline-refresh" style="margin-top:18px;width:100%">Actualiser</button>`;
        footer.innerHTML='Les événements sans année restent sur les fiches.<button class="button small secondary" type="button" data-world-list style="margin-top:8px;width:100%" title="Les grands événements livrés avec l’app, et les tiens (histoire locale)">🌍 Le monde autour…</button><button class="button small secondary" type="button" id="edit-historical-timeline" style="margin-top:8px;width:100%">Modifier la frise historique</button>';
        const parallelMode=state.timeline.parallelMode||((state.timeline.compare)?'person':'single');
        const compareControl=$('.timeline-compare-control',content);
        if(compareControl)compareControl.innerHTML=`<label>Mode de chronologie parallèle<select id="timeline-parallel-mode"><option value="single" ${parallelMode==='single'?'selected':''}>Une personne</option><option value="person" ${parallelMode==='person'?'selected':''}>Une autre personne</option><option value="couple" ${parallelMode==='couple'?'selected':''}>Le couple</option><option value="siblings" ${parallelMode==='siblings'?'selected':''}>La fratrie</option><option value="multiple" ${parallelMode==='multiple'?'selected':''}>Plusieurs personnes choisies</option></select></label><input id="timeline-compare" type="checkbox" hidden ${parallelMode!=='single'?'checked':''}><div id="timeline-compare-picker" class="timeline-compare-picker" ${['person','multiple'].includes(parallelMode)?'':'hidden'}><span class="pk-lab">${parallelMode==='multiple'?'Personnes à comparer':'Personne à comparer'}</span><div class="timeline-compare-input-wrap" id="timeline-compare-pk">${(window.LCNDA_PICKER?.pickerField(parallelMode==='multiple'?{name:'timeline_parallel',kind:'person',multiple:true,allowCreate:false,value:(state.timeline.parallelPeople||[]).filter(person=>Number(person.id)).map(person=>({id:Number(person.id),title:person.name||'',kind:'person'}))}:{name:'timeline_compare',kind:'person',allowCreate:false,value:Number(state.timeline.comparePersonId)?{id:Number(state.timeline.comparePersonId),title:state.timeline.comparePersonName||'',kind:'person'}:null})||'').replace(/ name="timeline_(parallel|compare)"/,'')}<input id="timeline-compare-search" type="hidden" value="${escapeHtml(parallelMode==='person'?(state.timeline.comparePersonName||''):'')}"><input id="timeline-compare-id" type="hidden" value="${escapeHtml(String(state.timeline.comparePersonId||0))}"></div>${parallelMode==='multiple'&&!(state.timeline.parallelPeople||[]).length?'<small>Ajoute au moins une personne.</small>':''}</div>`;
        $('#timeline-person').addEventListener('click',()=>setModule('personnes'));
        $('#edit-historical-timeline')?.addEventListener('click',openHistoricalTimelineDialog);
        const syncTimelineOptions=()=>{state.timeline.up=Number($('#timeline-up').value);state.timeline.down=Number($('#timeline-down').value);state.timeline.partners=$('#timeline-partners').checked;state.timeline.history=$('#timeline-history').checked;state.timeline.parallelMode=$('#timeline-parallel-mode')?.value||'single';state.timeline.compare=state.timeline.parallelMode!=='single';state.timeline.comparePersonId=Number($('#timeline-compare-id')?.value)||0;state.timeline.comparePersonName=$('#timeline-compare-search')?.value.trim()||'';persistUiState();};
        $('#timeline-history')?.addEventListener('change',async()=>{syncTimelineOptions();await renderTimeline();});
        $('#timeline-parallel-mode')?.addEventListener('change',()=>{syncTimelineOptions();renderSidebar();});
        $$('[data-remove-timeline-person]',content).forEach(button=>button.addEventListener('click',()=>{state.timeline.parallelPeople=state.timeline.parallelPeople.filter(person=>Number(person.id)!==Number(button.dataset.removeTimelinePerson));persistUiState();renderSidebar();}));
        setupTimelineComparisonPicker();
        $('#timeline-refresh').addEventListener('click',async()=>{syncTimelineOptions();await renderTimeline();});
    }

    // personne(s) à comparer : menu de choix unique (une personne, ou plusieurs en mode « Plusieurs personnes choisies »)
    function setupTimelineComparisonPicker(){
        const wrap=$('#timeline-compare-pk'),hidden=$('#timeline-compare-id'),name=$('#timeline-compare-search');
        if(!wrap||!hidden||!name)return;
        wrap.addEventListener('picker-change',event=>{
            if((state.timeline.parallelMode||'person')==='multiple'){state.timeline.parallelPeople=(event.detail.items||[]).filter(it=>!it.free&&it.id).map(it=>({id:Number(it.id),name:it.title}));persistUiState();return;}
            const it=event.detail.item;hidden.value=String(it&&!it.free?Number(it.id):0);name.value=it?it.title:'';
            state.timeline.comparePersonId=Number(hidden.value)||0;state.timeline.comparePersonName=name.value;persistUiState();
        });
    }

    function timelineRowsHtml(data){
        return data.events.length?`<div class="timeline">${data.events.map(event=>`<article class="timeline-row"><div class="timeline-year">${event.year}</div><span class="timeline-node" style="--event-color:${escapeHtml(event.color)}"></span><div class="timeline-card"><strong>${escapeHtml(event.type)} · <button class="table-link" data-open-person="${event.person_id}">${escapeHtml([event.first_name,event.last_name].filter(Boolean).join(' '))}</button></strong><p>${escapeHtml([event.date_text,event.place].filter(Boolean).join(' — '))}</p></div></article>`).join('')}</div>`:emptyState({text: 'Aucun événement daté dans cette sélection.', icon:'🕰️',hint:'Ajoute des dates aux événements des fiches pour les voir sur la frise.'});
    }

    async function renderTimeline(token=++state.workspaceToken){
        const mode=state.timeline.parallelMode||((state.timeline.compare)?'person':'single');
        let parallel=[];
        if(mode==='person'&&Number(state.timeline.comparePersonId))parallel=[{id:Number(state.timeline.comparePersonId),name:state.timeline.comparePersonName||'Personne comparée'}];
        else if(mode==='multiple')parallel=(state.timeline.parallelPeople||[]).filter(person=>Number(person.id));
        else if(['couple','siblings'].includes(mode)){
            const relatives=await api('timeline_people',{id:state.currentPersonId});
            parallel=(mode==='couple'?relatives.partners:relatives.siblings).map(person=>({id:Number(person.id),name:personName(person)}));
        }
        parallel=parallel.filter((person,index,items)=>Number(person.id)&&Number(person.id)!==Number(state.currentPersonId)&&items.findIndex(candidate=>Number(candidate.id)===Number(person.id))===index).slice(0,8);
        const results=await Promise.all([state.currentPersonId,...parallel.map(person=>person.id)].map(id=>api('timeline',{id,up:state.timeline.up,down:state.timeline.down,partners:state.timeline.partners?1:0})));
        const data=results[0],compared=results.slice(1);
        if(token!==state.workspaceToken||state.module!=='chronologie')return;
        const allYears=results.flatMap(result=>(result.events||[]).map(event=>Number(event.year)).filter(Boolean));
        const minYear=allYears.length?Math.min(...allYears):1200,maxYear=allYears.length?Math.max(...allYears):new Date().getFullYear();
        const showAligned=results.length>1||state.timeline.history;
        const historicalYears=state.timeline.history?historicalTimelineEvents().filter(event=>!event.hidden&&event.end_year>=minYear&&event.start_year<=maxYear).flatMap(event=>[Math.max(event.start_year,minYear),Math.min(event.end_year,maxYear)]):[];
        const sharedPositions=showAligned?relaxedTimelinePositions([...allYears,...historicalYears],minYear,maxYear):null;
        const primaryHtml=showAligned?timelineAlignedHtml(data.events,minYear,maxYear,sharedPositions,state.timeline.history):timelineRowsHtml(data);
        const lane=(label,title,rows)=>`<section><header class="timeline-compare-heading"><span class="eyebrow">${escapeHtml(label)}</span><h3>${escapeHtml(title)}</h3></header>${timelineAlignedHtml(rows,minYear,maxYear,sharedPositions,false)}</section>`;
        const lanes=[lane('PERSONNE A',personName(summaryFromState()),data.events),...compared.map((result,index)=>lane(`PERSONNE ${String.fromCharCode(66+index)}`,parallel[index]?.name||'Personne comparée',result.events))];
        const timelineHtml=results.length>1?`<div class="timeline-comparison-layout is-multiple">${lanes.join('')}</div>`:primaryHtml;
        const historyHtml=state.timeline.history&&results.length>1?`<aside class="historical-timeline is-aligned"><header><span class="eyebrow">FRISE HISTORIQUE</span><h3>Contexte commun</h3></header><div class="historical-aligned-stage" style="--timeline-stage-height:${sharedPositions.height}px">${historicalTimelineHtml([],minYear,maxYear,sharedPositions)}</div></aside>`:'';
        $('#workspace').innerHTML=`<section class="page">${window.LCNDA_UI.pageHeader({title:'Chronologie',help:`<b class="ui-ph-count">${plural(data.peopleCount,'personne')}${results.length>1?` · ${results.length} frises parallèles`:''}</b> · Événements connus autour de ${escapeHtml(personName(summaryFromState()))}, classés sans modifier la formulation originale des dates.`})}<div class="timeline-layout ${state.timeline.history?'has-history':''}">${timelineHtml}${historyHtml}</div></section>`;
        bindTableLinks();
    }

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderTimeline, renderTimelineSidebar});
    if (state.module === 'chronologie' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
