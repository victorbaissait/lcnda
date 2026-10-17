/* LCNDA — 📊 Graphiques (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Arbres, éventails, sabliers, parenté, réseaux, monographie de commune, implexe, distributions. Les statistiques (partagées avec le tableau de bord) restent dans app.js.
 */
(() => {
    'use strict';
    const {$, $$, api, confirmBox, plural, applyGenderColorsToDocument, ascendantsTreeHtml, bindGraphExportControls, debounce, DEFAULT_GENDER_COLORS, defaultGraphStatsItems, descendantsTreeHtml, empty, escapeHtml, getStatsColors, getTreeCardFields, graphExportToolbarHtml, loadLineage, openStatsColorsDialog, openViewDialog, orderedGraphDiagramItems, orderedGraphStatsItems, persistUiState, personName, relationYears, reloadBootstrap, renderGraphStats, renderSidebar, safeUrl, savedView, saveGenderColors, setModule, setupSavedViewsDrag, sidebarSignal, sideButton, state, summaryFromState, years} = window.LCNDA_APP;
    function renderGraphSidebar(content, footer) {
        const views = state.bootstrap.savedViews.filter(view => view.module === 'graph');
        content.innerHTML = `<div class="segmented"><button data-graph-tab="types" class="${state.graphTab==='types'?'is-active':''}">Diagrammes</button><button data-graph-tab="saved" class="${state.graphTab==='saved'?'is-active':''}">Enregistrés</button></div>
            ${state.graphTab === 'types' ? `<div class="side-menu">
                ${orderedGraphDiagramItems().map(([key,num,label])=>sideButton(key,num,label,state.graphMode)).join('')}
            </div>${state.graphMode==='kinship'?kinshipSearchPanel():''}<div class="section-label">Statistiques</div><div class="side-menu">${orderedGraphStatsItems().map(([key,num,label],index)=>statsSideButton([key,label],index)).join('')}</div>${customStatsSideHtml()}` : `<div class="saved-list">${views.map(view => savedView(view)).join('') || empty('Aucune vue enregistrée pour l’instant',{icon:'💾',hint:'Règle un diagramme puis enregistre-le comme vue pour le retrouver ici.'})}</div>`}`;
        footer.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px"><button class="button small" id="save-current-graph">+ Enregistrer la vue</button><button class="button small secondary" id="open-decor-tree" title="Éventail, roue ou arbre dessiné, en grand format, à retoucher puis imprimer">🌳 Arbre décoratif à imprimer</button><button class="button small secondary" id="open-stats-colors">🎨 Couleurs des stats</button></div>';
        content.addEventListener('click', async event => {
            const tab=event.target.closest('[data-graph-tab]');if(tab){state.graphTab=tab.dataset.graphTab;renderSidebar();return;}
            if(event.target.closest('[data-open-stats-editor]')){state.maintenanceTab='stats_editor';setModule('maintenance');return;}
            if(event.target.closest('[data-open-diagram-new]')){window.LCNDA_EXT?.openDiagramEditor?.(null);return;}
            const mode=event.target.closest('[data-side-value]');if(mode){const value=mode.dataset.sideValue;if(value.startsWith('stats:')){state.graphMode='stats';state.graphStatsType=value.slice(6);state.graphStatsFrozenColors=null;}else if(value.startsWith('diagram:')){state.graphMode='diagram';state.graphDiagramId=Number(value.slice(8));}else{state.graphMode=value;state.graphStatsFrozenColors=null;}await renderGraph();renderSidebar();return;}
            const saved=event.target.closest('[data-view-id]');if(saved&&!event.target.closest('.saved-delete')&&!event.target.closest('.saved-grip')&&!event.target.closest('.saved-edit')){const view=views.find(v=>Number(v.id)===Number(saved.dataset.viewId));if(view){state.graphMode=view.config.mode||'ancestors';state.graphDepth=Number(view.config.depth||4);state.graphStatsType=view.config.statsType||state.graphStatsType;state.graphStatsYearFrom=view.config.graphStatsYearFrom??'';state.graphStatsYearTo=view.config.graphStatsYearTo??'';if(view.config.kinship)state.graphKinship={...state.graphKinship,...view.config.kinship};// Restore frozen colors if saved with this view
            state.graphStatsFrozenColors=Array.isArray(view.config.statsColors)&&view.config.statsColors.length?view.config.statsColors:null;state.graphStatsLimit=view.config.graphStatsLimit??'';state.graphStatsGender=view.config.graphStatsGender??'';state.graphStatsRules=Array.isArray(view.config.graphStatsRules)?view.config.graphStatsRules:[];if(view.config.placeMonograph)state.graphPlaceMonograph={...state.graphPlaceMonograph,...view.config.placeMonograph};if(view.config.personId)state.currentPersonId=Number(view.config.personId);
            if(view.config.genderColors&&view.config.mode!=='stats'&&view.config.mode!=='distribution'){const gc=view.config.genderColors;saveGenderColors({male:{bg:gc.male?.bg||DEFAULT_GENDER_COLORS.male.bg,text:gc.male?.text||DEFAULT_GENDER_COLORS.male.text},female:{bg:gc.female?.bg||DEFAULT_GENDER_COLORS.female.bg,text:gc.female?.text||DEFAULT_GENDER_COLORS.female.text},unknown:{bg:gc.unknown?.bg||DEFAULT_GENDER_COLORS.unknown.bg,text:gc.unknown?.text||DEFAULT_GENDER_COLORS.unknown.text}});applyGenderColorsToDocument();}else if(view.config.mode!=='stats'&&view.config.mode!=='distribution'){applyGenderColorsToDocument();}
            await renderGraph();}}
            const edit=event.target.closest('[data-edit-view]');if(edit){event.stopPropagation();const view=views.find(v=>Number(v.id)===Number(edit.dataset.editView));if(view)openViewDialog(view.module,view.config||{},view.id,view.name);return;}
            const del=event.target.closest('[data-delete-view]');if(del){event.stopPropagation();if(!await confirmBox('La vue enregistrée sera supprimée. Le diagramme lui-même ne change pas.',{title:'Supprimer cette vue enregistrée ?',okLabel:'Supprimer la vue'}))return;await api('delete_view',{},{method:'POST',body:{id:Number(del.dataset.deleteView)}});await reloadBootstrap();renderSidebar();return;}
        },{signal:sidebarSignal()});
        setupSavedViewsDrag($('#sidebar-content .saved-list'), async orderedIds => {
            for(let i=0;i<orderedIds.length;i++){await api('set_view_order',{},{method:'POST',body:{id:orderedIds[i],sort_order:(i+1)*10}});}
            await reloadBootstrap();
        });
        $('#save-current-graph').addEventListener('click',()=>{
            const config={mode:state.graphMode,depth:state.graphDepth,statsType:state.graphStatsType,graphStatsYearFrom:state.graphStatsYearFrom,graphStatsYearTo:state.graphStatsYearTo,graphStatsLimit:state.graphStatsLimit,graphStatsRules:state.graphStatsRules,graphStatsGender:state.graphStatsGender,personId:state.currentPersonId,kinship:state.graphKinship,placeMonograph:state.graphPlaceMonograph};
            // Snapshot current colors palette when saving a stats view
            if(state.graphMode==='stats')config.statsColors=getStatsColors();
            openViewDialog('graph',config);
        });
        $('#open-stats-colors')?.addEventListener('click',()=>openStatsColorsDialog());
        $('#open-decor-tree')?.addEventListener('click',()=>window.LCNDA_EXT?.openDecorTree?.());
        if(state.graphMode==='kinship')bindKinshipSearch();
    }

    function kinshipSearchPanel(){return `<div class="kinship-search"><label>Première personne<input id="kinship-from-search" value="${escapeHtml(state.graphKinship.fromName)}" placeholder="Prénom et nom"></label><div class="relation-results" id="kinship-from-results"></div><label>Deuxième personne<input id="kinship-to-search" value="${escapeHtml(state.graphKinship.toName)}" placeholder="Prénom et nom"></label><div class="relation-results" id="kinship-to-results"></div><button class="button" id="show-kinship" ${state.graphKinship.from&&state.graphKinship.to?'':'disabled'}>Afficher le lien</button></div>`;}
    function bindKinshipSearch(){['from','to'].forEach(side=>{const input=$(`#kinship-${side}-search`),results=$(`#kinship-${side}-results`);let controller=null;input.addEventListener('input',debounce(async()=>{const q=input.value.trim();state.graphKinship[`${side}Name`]=input.value;state.graphKinship[side]=0;$('#show-kinship').disabled=true;if(q.length<2){results.innerHTML='';return;}controller?.abort();controller=new AbortController();const data=await api('people',{q,limit:20},{signal:controller.signal});results.innerHTML=data.people.map(person=>`<button type="button" class="relation-result" data-kinship-side="${side}" data-person-id="${person.id}" data-person-name="${escapeHtml(personName(person))}"><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(relationYears(person))}</small></button>`).join('')||'<p>Aucune personne trouvée.</p>';},220));});$$('[id^="kinship-"][id$="-results"]').forEach(results=>results.addEventListener('click',event=>{const button=event.target.closest('[data-kinship-side]');if(!button)return;const side=button.dataset.kinshipSide;state.graphKinship[side]=Number(button.dataset.personId);state.graphKinship[`${side}Name`]=button.dataset.personName;$(`#kinship-${side}-search`).value=button.dataset.personName;results.innerHTML='';$('#show-kinship').disabled=!(state.graphKinship.from&&state.graphKinship.to);persistUiState();}));$('#show-kinship').addEventListener('click',()=>renderGraph());}
    function graphComparePanelHtml(){
        if(!state.graphCompare.enabled)return '';
        return `<div class="graph-compare-panel"><label>Orientation <select id="graph-compare-orientation"><option value="vertical" ${state.graphCompare.orientation==='vertical'?'selected':''}>Côte à côte</option><option value="horizontal" ${state.graphCompare.orientation==='horizontal'?'selected':''}>Dessus / dessous</option></select></label><label>Personne A<input id="graph-compare-a-search" value="${escapeHtml(state.graphCompare.aName||'')}" placeholder="Prénom et nom"></label><div class="relation-results" id="graph-compare-a-results"></div><label>Personne B<input id="graph-compare-b-search" value="${escapeHtml(state.graphCompare.bName||'')}" placeholder="Prénom et nom"></label><div class="relation-results" id="graph-compare-b-results"></div><button type="button" class="button small" id="graph-compare-apply" ${state.graphCompare.a&&state.graphCompare.b?'':'disabled'}>Comparer</button></div>`;
    }
    function bindGraphCompareControls(){
        const toggle=$('#graph-compare-toggle');
        if(toggle)toggle.addEventListener('click',async()=>{state.graphCompare.enabled=!state.graphCompare.enabled;persistUiState();await renderGraph();});
        const orientation=$('#graph-compare-orientation');
        if(orientation)orientation.addEventListener('change',async event=>{state.graphCompare.orientation=event.target.value;persistUiState();await renderGraph();});
        ['a','b'].forEach(side=>{
            const input=$(`#graph-compare-${side}-search`),results=$(`#graph-compare-${side}-results`);
            if(!input||!results)return;
            let controller=null;
            input.addEventListener('input',debounce(async()=>{
                const q=input.value.trim();
                state.graphCompare[`${side}Name`]=input.value;
                state.graphCompare[side]=0;
                const apply=$('#graph-compare-apply');if(apply)apply.disabled=true;
                if(q.length<2){results.innerHTML='';return;}
                controller?.abort();
                controller=new AbortController();
                const data=await api('people',{q,limit:20},{signal:controller.signal});
                results.innerHTML=data.people.map(person=>`<button type="button" class="relation-result" data-graph-compare-side="${side}" data-person-id="${person.id}" data-person-name="${escapeHtml(personName(person))}"><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(relationYears(person))}</small></button>`).join('')||'<p>Aucune personne trouvée.</p>';
            },220));
            results.addEventListener('click',event=>{
                const button=event.target.closest('[data-graph-compare-side]');
                if(!button)return;
                const selectedSide=button.dataset.graphCompareSide;
                state.graphCompare[selectedSide]=Number(button.dataset.personId);
                state.graphCompare[`${selectedSide}Name`]=button.dataset.personName;
                $(`#graph-compare-${selectedSide}-search`).value=button.dataset.personName;
                results.innerHTML='';
                const apply=$('#graph-compare-apply');if(apply)apply.disabled=!(state.graphCompare.a&&state.graphCompare.b);
                persistUiState();
            });
        });
        $('#graph-compare-apply')?.addEventListener('click',()=>renderGraph());
    }
    function graphStatsOptions(){return defaultGraphStatsItems;}
    /** Graphiques → « Mes statistiques » : celles faites dans Maintenance → Éditeur de statistiques */
function customStatsSideHtml(){const items=window.LCNDA_EXT?.customStatItems?.()||[];return `<div class="section-label">Mes statistiques</div><div class="side-menu">${items.map(([key,label],index)=>`<button class="side-menu-item ${state.graphMode==='stats'&&state.graphStatsType===key?'is-active':''}" data-side-value="stats:${escapeHtml(key)}"><span class="side-number">M${index+1}</span>${escapeHtml(label)}</button>`).join('')}<button class="side-menu-item" type="button" data-open-stats-editor><span class="side-number">+</span>Créer une statistique</button></div>${diagramsSideHtml()}`;}
    /** Graphiques → « Mes diagrammes » (hémicycles, frises, camemberts… faits à la main ou avec les chiffres de l'app) */
function diagramsSideHtml(){const items=window.LCNDA_EXT?.diagramItems?.()||[];return `<div class="section-label">Mes diagrammes</div><div class="side-menu">${items.map(([id,label],index)=>`<button class="side-menu-item ${state.graphMode==='diagram'&&Number(state.graphDiagramId)===Number(id)?'is-active':''}" data-side-value="diagram:${Number(id)}"><span class="side-number">D${index+1}</span>${escapeHtml(label)}</button>`).join('')}<button class="side-menu-item" type="button" data-open-diagram-new><span class="side-number">+</span>Créer un diagramme</button></div>`;}
function statsSideButton([type,label],index){return `<button class="side-menu-item ${state.graphMode==='stats'&&state.graphStatsType===type?'is-active':''}" data-side-value="stats:${type}"><span class="side-number">S${index+1}</span>${label}</button>`;}
    const DIAGRAM_MODES = new Set(['ancestors','descendants','hourglass','fan','kinship','social','occupations','migrations','household','square','circular','symmetric','fractal','genogram']);
    function renderGraphNetwork(data){
        if(data.kind==='household'){
            const households=data.households||[];
            return households.length?`<div class="household-view">${households.map(h=>`<section class="household-card"><header><span class="eyebrow">RECENSEMENT</span><h3>${escapeHtml(h.year||'Année non renseignée')}${h.place?` · ${escapeHtml(h.place)}`:''}</h3><p>${escapeHtml(h.address||'Adresse non renseignée')}</p></header><div class="household-members">${(h.members||[]).map(member=>member.person_id?`<button class="household-member" data-tree-person="${member.person_id}"><strong>${escapeHtml(member.name||'Personne sans nom')}</strong><small>${escapeHtml([member.role,member.occupation].filter(Boolean).join(' · ')||'Membre du foyer')}</small></button>`:`<div class="household-member"><strong>${escapeHtml(member.name||'Personne non liée')}</strong><small>${escapeHtml([member.role,member.occupation].filter(Boolean).join(' · ')||'Membre du foyer')}</small></div>`).join('')||'<small>Aucun membre relevé.</small>'}</div></section>`).join('')}</div>`:empty('Aucune maisonnée recensée pour cette personne.',{icon:'🏠',hint:'Ajoute des recensements depuis sa fiche.'});
        }
        const nodes=data.nodes||[],edges=data.edges||[];
        if(nodes.length<2)return empty(data.kind==='migrations'?'Aucun déplacement entre deux lieux géocodés n’est encore disponible pour cette branche.':'Pas encore assez de liens renseignés pour dessiner ce graphe.');
        const width=Math.max(1000,Math.min(2600,620+nodes.length*104));
        const height=Math.max(600,Math.min(1500,480+Math.ceil(nodes.length/7)*170));
        const center={x:width/2,y:height/2};
        const positions=new Map();
        const root=nodes.find(node=>node.kind==='root')||nodes[0];
        positions.set(root.id,center);
        const others=nodes.filter(node=>node.id!==root.id);
        others.forEach((node,index)=>{const ring=1+Math.floor(index/12);const ringStart=(ring-1)*12;const count=Math.min(12,others.length-ringStart);const ringIndex=index-ringStart;const angle=(Math.PI*2*(ringIndex/Math.max(1,count)))-Math.PI/2;const radius=160+(ring-1)*175;positions.set(node.id,{x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius});});
        const edgeHtml=edges.map(edge=>{const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)return '';const label=edge.count>1?`${edge.label} (${edge.count})`:edge.label;return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"><title>${escapeHtml(label)}</title></line>`;}).join('');
        const nodeHtml=nodes.map(node=>{const pos=positions.get(node.id)||center;const body=`<strong>${escapeHtml(node.label||'Sans nom')}</strong><small>${escapeHtml(node.subtitle||'')}</small>`;return node.person_id?`<button class="network-node ${node.kind==='root'?'is-root':''}" style="left:${pos.x}px;top:${pos.y}px" data-tree-person="${node.person_id}">${body}</button>`:`<div class="network-node ${node.kind==='root'?'is-root':''}" style="left:${pos.x}px;top:${pos.y}px">${body}</div>`;}).join('');
        const title={social:'Réseau social',occupations:'Métiers transmis',migrations:'Migrations de la branche'}[data.kind]||'Réseau';
        return `<section class="network-graph"><header><span class="eyebrow">${escapeHtml(title)}</span><p>${plural(nodes.length,'nœud')} · ${plural(edges.length,'lien')}. Survole un lien pour voir sa nature et clique sur une personne pour ouvrir sa fiche.</p></header><div class="network-stage" style="width:${width}px;height:${height}px"><svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${edgeHtml}</svg>${nodeHtml}</div></section>`;
    }

    function placeMonographRows(items, render, emptyMessage){
        return items?.length ? `<div class="place-monograph-rows">${items.map(render).join('')}</div>` : `<p class="place-monograph-empty">${escapeHtml(emptyMessage)}</p>`;
    }

    function placeMonographSection(label, count, body, tone=''){
        return `<section class="place-monograph-section ${tone?`is-${tone}`:''}"><header><span class="eyebrow">${escapeHtml(label)}</span><strong>${Number(count||0)}</strong></header>${body}</section>`;
    }

    async function renderPlaceMonograph(token=++state.workspaceToken){
        const cfg=state.graphPlaceMonograph;
        const data=await api('place_monograph',{
            place_id:cfg.id||0,place_name:cfg.name||'',county:cfg.county||'',state:cfg.state||'',country:cfg.country||'',
            year_from:cfg.yearFrom||'',year_to:cfg.yearTo||'',event_type_id:cfg.eventTypeId||0,
            show_events:cfg.showEvents?1:0,show_digests:cfg.showDigests?1:0,show_battues:cfg.showBattues?1:0,show_cemetery:cfg.showCemetery?1:0,
        });
        if(token!==state.workspaceToken||state.module!=='graphiques')return;
        const place=data.place||{};
        const title=place.name||cfg.name||'Monographie de commune';
        const typeOptions=(data.event_types||[]).map(type=>`<option value="${type.id}" ${Number(cfg.eventTypeId)===Number(type.id)?'selected':''}>${escapeHtml(type.label)}</option>`).join('');
        const activeFilters=`<div class="place-monograph-filter">
            <div class="place-monograph-search-wrap"><label>Commune<input id="place-monograph-search" value="${escapeHtml(cfg.name||'')}" placeholder="Tape une commune..."></label><div class="place-suggestions" id="place-monograph-results"></div></div>
            <label>De<input id="place-monograph-from" inputmode="numeric" value="${escapeHtml(cfg.yearFrom||'')}" placeholder="Année"></label>
            <label>À<input id="place-monograph-to" inputmode="numeric" value="${escapeHtml(cfg.yearTo||'')}" placeholder="Année"></label>
            <label>Type d’acte<select id="place-monograph-type"><option value="0">Tous les actes</option>${typeOptions}</select></label>
            <div class="place-monograph-checks">
                <label><input id="place-monograph-events" type="checkbox" ${cfg.showEvents?'checked':''}> Actes rattachés</label>
                <label><input id="place-monograph-digests" type="checkbox" ${cfg.showDigests?'checked':''}> Dépouillements</label>
                <label><input id="place-monograph-battues" type="checkbox" ${cfg.showBattues?'checked':''}> Battues</label>
                <label><input id="place-monograph-cemetery" type="checkbox" ${cfg.showCemetery?'checked':''}> Cimetière</label>
            </div><button class="button" id="place-monograph-refresh">Actualiser</button>
        </div>`;
        let body=empty('Choisis une commune pour afficher les actes, dépouillements, battues et sépultures liés à ce lieu.',{icon:'🏘️'});
        if(data.ready){
            const counts=data.counts||{};
            const metrics=[['Actes liés',counts.events],['Personnes',counts.people],['Recensements',counts.census],['Dépouillements',counts.digests],['Battues',counts.battues],['Sépultures',counts.graves]];
            const events=placeMonographRows(data.events||[],row=>`<article class="place-monograph-row"><div><strong>${escapeHtml(row.type_label||'Événement')} ${row.date_text?`· ${escapeHtml(row.date_text)}`:''}</strong><small>${escapeHtml(row.person_id?row.person_name:([row.partner1_name,row.partner2_name].filter(Boolean).join(' et ')||'Personne non liée'))}${row.description?` · ${escapeHtml(row.description)}`:''}</small></div><span class="place-monograph-open">${row.person_id?`<button class="button small secondary" data-monograph-person="${row.person_id}">Ouvrir</button>`:[[row.partner1_id,row.partner1_name],[row.partner2_id,row.partner2_name]].filter(([id])=>id).map(([id,name])=>`<button class="button small secondary" data-monograph-person="${id}">Ouvrir ${escapeHtml(String(name||'').split(' ')[0])}</button>`).join('')}</span></article>`,'Aucun acte pour ces filtres.');
            const census=placeMonographRows(data.census||[],row=>`<article class="place-monograph-row"><div><strong>${escapeHtml(row.year||'Année non renseignée')} · Recensement</strong><small>${escapeHtml([row.address,row.status].filter(Boolean).join(' · ')||'Sans précision')}</small></div></article>`,'Aucun recensement pour ces filtres.');
            const digests=placeMonographRows(data.digests||[],row=>`<article class="place-monograph-row"><div><strong>${escapeHtml(row.record_label||row.record_type||'Dépouillement')} ${row.year_text?`· ${escapeHtml(row.year_text)}`:''}</strong><small>${escapeHtml([row.archive_reference,row.status_label,row.archive_service].filter(Boolean).join(' · ')||'Sans cote')}</small></div>${row.archive_url?`<a class="button small secondary" href="${escapeHtml(safeUrl(row.archive_url))}" target="_blank" rel="noopener">Archive</a>`:''}</article>`,'Aucun dépouillement enregistré pour ces filtres.');
            const battues=placeMonographRows(data.battues||[],row=>`<article class="place-monograph-row"><div><strong>${escapeHtml(row.title||'Battue sans titre')}</strong><small>${escapeHtml(row.target_text||row.status_label||'')}</small></div><button class="button small secondary" data-monograph-battue="${row.id}">Ouvrir</button></article>`,'Aucune battue ne démarre dans cette commune.');
            const graves=placeMonographRows(data.graves||[],row=>`<article class="place-monograph-row"><div><strong>${escapeHtml(row.cemetery_name||'Sépulture')}</strong><small>${escapeHtml([row.address,row.person_names].filter(Boolean).join(' · ')||'Sans précision')}</small></div></article>`,'Aucune sépulture renseignée dans cette commune.');
            body=`<div class="place-monograph-summary"><div><span class="eyebrow">LIEU</span><h2 class="place-monograph-title">${escapeHtml(title)}</h2><p>${escapeHtml([place.subdivision,place.county,place.state,place.country].filter(Boolean).join(' · ')||'')}</p></div>${place.latitude!==null&&place.longitude!==null?`<button class="button secondary" id="place-monograph-map">Voir sur la carte</button>`:''}</div>
                <div class="place-monograph-metrics">${metrics.map(([label,value])=>`<div><strong>${Number(value||0)}</strong><span>${label}</span></div>`).join('')}</div>
                <div class="place-monograph-sections">
                    ${cfg.showEvents?placeMonographSection('Actes rattachés',counts.events,events,'events'):''}
                    ${cfg.showEvents&&Number(counts.census||0)?placeMonographSection('Recensements',counts.census,census,'census'):''}
                    ${cfg.showDigests?placeMonographSection('Dépouillements',counts.digests,digests,'digests'):''}
                    ${cfg.showBattues?placeMonographSection('Battues',counts.battues,battues,'battues'):''}
                    ${cfg.showCemetery?placeMonographSection('Cimetière',counts.graves,graves,'cemetery'):''}
                </div>`;
        }
        $('#workspace').innerHTML=`<section class="graph-layout place-monograph-layout"><div class="tool-strip"><span class="eyebrow">GRAPHIQUES · LIEUX</span><span class="spacer"></span>${graphExportToolbarHtml()}</div><main class="place-monograph-stage"><div class="place-monograph-shell"><header class="place-monograph-head"><span class="eyebrow">SYNTHÈSE LOCALE</span><h1>Monographie de commune</h1><p>Regroupe les sources et recherches déjà rattachées à un même lieu.</p></header>${activeFilters}${body}</div></main></section>`;
        // Organisation propre à un widget ou un onglet (écran intégré) : ordre et parties montrées
        const own=window.LCNDA_SCREEN_LAYOUT;
        if(own?.kind==='monograph'&&Array.isArray(own.order)){
            const hide=new Set(own.hidden||[]),box=$('.place-monograph-sections');
            if(hide.has('filters'))$('.place-monograph-filter')?.setAttribute('hidden','');
            if(hide.has('metrics'))$('.place-monograph-metrics')?.setAttribute('hidden','');
            if(box)own.order.forEach(k=>{const el=box.querySelector(`.place-monograph-section.is-${k==='cemetery'?'cemetery':k}`);if(el){if(hide.has(k))el.hidden=true;box.appendChild(el);}});
        }
        const saveFilters=()=>{cfg.yearFrom=$('#place-monograph-from').value.trim();cfg.yearTo=$('#place-monograph-to').value.trim();cfg.eventTypeId=Number($('#place-monograph-type').value||0);cfg.showEvents=$('#place-monograph-events').checked;cfg.showDigests=$('#place-monograph-digests').checked;cfg.showBattues=$('#place-monograph-battues').checked;cfg.showCemetery=$('#place-monograph-cemetery').checked;persistUiState();};
        $('#place-monograph-refresh').addEventListener('click',async()=>{saveFilters();await renderPlaceMonograph();});
        let placeController=null;
        const monographSearchInput=$('#place-monograph-search');
        const searchPlaceMonograph=debounce(async q=>{
            const results=$('#place-monograph-results');
            if(q.length<2){results.innerHTML='';return;}
            placeController?.abort();
            placeController=new AbortController();
            try{
                const found=await api('place_name_search',{q},{signal:placeController.signal});
                results.innerHTML=(found.places||[]).slice(0,12).map(item=>`<button type="button" data-place-monograph-choice='${escapeHtml(JSON.stringify(item))}'><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.label||[item.county,item.state,item.country].filter(Boolean).join(' · '))}</small></button>`).join('')||'<small class="place-monograph-no-result">Aucune commune trouvée.</small>';
            }catch(error){
                if(error.name!=='AbortError')results.innerHTML='<small class="place-monograph-no-result">Recherche indisponible.</small>';
            }
        },240);
        monographSearchInput.addEventListener('input',event=>{
            const q=event.currentTarget.value.trim();
            Object.assign(cfg,{name:q,id:0,county:'',state:'',country:'',latitude:null,longitude:null});
            persistUiState();
            searchPlaceMonograph(q);
        });
        $('#place-monograph-results').addEventListener('click',async event=>{const choice=event.target.closest('[data-place-monograph-choice]');if(!choice)return;const place=JSON.parse(choice.dataset.placeMonographChoice);Object.assign(cfg,{id:Number(place.id||0),name:place.name||'',county:place.county||'',state:place.state||'',country:place.country||'',latitude:place.latitude??null,longitude:place.longitude??null});persistUiState();await renderPlaceMonograph();});
        $('#place-monograph-map')?.addEventListener('click',()=>{state.mapCenter={lat:Number(place.latitude),lon:Number(place.longitude)};state.mapKeepCenter=true;setModule('carte');});
        $$('[data-monograph-person]').forEach(button=>button.addEventListener('click',()=>{state.currentPersonId=Number(button.dataset.monographPerson);setModule('personnes');}));
        $$('[data-monograph-battue]').forEach(button=>button.addEventListener('click',()=>{state.currentBattueId=Number(button.dataset.monographBattue);state.enquetesTab='battue';setModule('enquetes');}));
        bindGraphExportControls();
    }
    /** Implexe : ancêtres présents à plusieurs places de l'ascendance, et taux par génération. */
    function renderImplexe(data,root){
        const rootName=personName(root||{})||'cette personne';
        const sosaList=list=>list.map(n=>`Sosa ${n}`).join(', ').replace(/, ([^,]*)$/,' et $1');
        const row=item=>`<li class="implexe-row${item.entry?' is-entry':''}"><button class="table-link" type="button" data-tree-person="${item.id}">${escapeHtml(personName(item.person||{}))}</button> <small>${escapeHtml(years(item.person||{}))}</small><span>est ${escapeHtml(sosaList(item.sosas))}${item.count>item.sosas.length?` (… ${item.count} places en tout)`:''} · génération${item.generations.length>1?'s':''} ${item.generations.join(', ')}</span></li>`;
        const entries=data.repeated.filter(item=>item.entry),others=data.repeated.filter(item=>!item.entry);
        const table=`<table class="implexe-table"><thead><tr><th>Génération</th><th>Places théoriques</th><th>Places connues</th><th>Personnes différentes</th><th>Implexe</th><th>Implexe cumulé</th></tr></thead><tbody>${data.generations.map(g=>`<tr><td>${g.generation}</td><td>${g.theoretical===null?'—':Number(g.theoretical).toLocaleString('fr-FR')}</td><td>${g.slots}</td><td>${g.people}</td><td>${String(g.rate).replace('.',',')} %</td><td>${String(g.cumulative_rate).replace('.',',')} %</td></tr>`).join('')}</tbody></table>`;
        return `<div class="implexe-view"><span class="eyebrow">IMPLEXE</span><h2>Ancêtres répétés de ${escapeHtml(rootName)}</h2>
            <p class="muted">Quand deux ancêtres sont cousins, leurs propres ancêtres apparaissent plusieurs fois dans l’arbre : c’est l’implexe. Seules les filiations biologiques comptent. Le taux = 1 − personnes différentes ÷ places connues.</p>
            <div class="implexe-summary"><div><strong>${data.slots}</strong><span>places connues</span></div><div><strong>${data.people}</strong><span>ancêtres différents</span></div><div><strong>${String(data.rate).replace('.',',')} %</strong><span>implexe global</span></div><div><strong>${data.repeated_total}</strong><span>ancêtres répétés</span></div></div>
            ${data.truncated?'<p class="muted">Calcul arrêté : arbre trop grand.</p>':''}
            ${data.repeated_total?`<h3>Les couples communs les plus proches</h3><p class="muted">C’est ici que les branches se rejoignent ; leurs ancêtres sont répétés à leur suite.</p><ul class="implexe-list">${entries.map(row).join('')}</ul>${others.length?`<details class="implexe-more"><summary>Voir aussi leurs ancêtres répétés (${others.length})</summary><ul class="implexe-list">${others.map(row).join('')}</ul></details>`:''}`:empty('Aucun ancêtre répété : chaque ancêtre connu n’apparaît qu’une fois.',{icon:'✅'})}
            <h3>Par génération</h3><div class="implexe-table-wrap">${table}</div></div>`;
    }
    async function renderGraph(token=++state.workspaceToken) {
        const current = summaryFromState();
        if (state.graphMode === 'stats') return renderGraphStats(token);
        if (state.graphMode === 'place_monograph') return renderPlaceMonograph(token);
        if (state.graphMode === 'diagram' && window.LCNDA_EXT?.renderDiagramPage) return window.LCNDA_EXT.renderDiagramPage(token, Number(state.graphDiagramId) || 0);
        let stageHtml = '';
        if(state.graphMode==='distribution'){
            const data=await api('graph_distribution',{name_mode:state.distributionNameMode});if(token!==state.workspaceToken||state.module!=='graphiques')return;stageHtml=renderDistributionDiagram(data);
        } else if(['social','occupations','migrations','household'].includes(state.graphMode)){
            const data=await api('graph_network',{kind:state.graphMode,id:state.currentPersonId});if(token!==state.workspaceToken||state.module!=='graphiques')return;stageHtml=renderGraphNetwork(data);
        } else if(state.graphMode==='lineage'){
            const depth=Math.min(8,state.graphDepth||3);
            const data=await loadLineage(state.currentPersonId,depth,depth);if(token!==state.workspaceToken||state.module!=='graphiques')return;
            stageHtml=`<div class="lineage-graph"><section><h3>Ascendants</h3>${ascendantsTreeHtml(data)}</section><section><h3>Descendants</h3>${descendantsTreeHtml(data)}</section>${state.graphDepth>8?'<p class="muted">Limité à 8 générations dans cette vue.</p>':''}</div>`;
        } else if(state.graphMode==='implexe'){
            const data=await api('implexe',{id:state.currentPersonId});if(token!==state.workspaceToken||state.module!=='graphiques')return;stageHtml=renderImplexe(data,current);
        } else if(state.graphMode==='kinship'){
            if(!state.graphKinship.from||!state.graphKinship.to)stageHtml=`<div class="kinship-empty"><span class="eyebrow">LIENS DE PARENTÉ</span><h2>Choisis deux personnes</h2><p>Recherche les deux individus dans la colonne de gauche pour afficher le chemin familial le plus court.</p></div>`;
            else{const data=await api('kinship',{from:state.graphKinship.from,to:state.graphKinship.to});if(token!==state.workspaceToken||state.module!=='graphiques')return;stageHtml=data.path.length?`<div class="kinship-path">${data.path.map((person,index)=>`${index?`<div class="kinship-connector"><span>${escapeHtml(data.relations[index-1]||'lié à')}</span><i>→</i></div>`:''}<button class="kinship-person gender-${person.gender||'unknown'} ${index===0||index===data.path.length-1?'is-endpoint':''}" data-tree-person="${person.id}">${person.portrait?`<img src="media/${encodeURIComponent(person.portrait)}" alt="">`:'<span class="kinship-initial">'+escapeHtml((person.first_name?.[0]||'')+(person.last_name?.[0]||''))+'</span>'}<strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small></button>`).join('')}</div><p class="kinship-summary">${plural(data.length,'lien')} entre les deux personnes.</p>`:empty('Aucun chemin familial trouvé entre ces deux personnes.',{icon:'🔗'})}
        } else if(['square','circular','symmetric','fractal','genogram'].includes(state.graphMode)){
            const data=await api('tree',{id:state.currentPersonId,mode:'ancestors',depth:state.graphDepth});if(token!==state.workspaceToken||state.module!=='graphiques')return;stageHtml=renderSpecialDiagram(data.tree,state.graphMode);
        } else if (state.graphMode === 'hourglass') {
            const [ancestors, descendants] = await Promise.all([
                api('tree',{id:state.currentPersonId,mode:'ancestors',depth:state.graphDepth,pets:treePets()?1:undefined}),
                api('tree',{id:state.currentPersonId,mode:'descendants',depth:state.graphDepth,pets:treePets()?1:undefined}),
            ]);
            if(token!==state.workspaceToken||state.module!=='graphiques')return;
            stageHtml = `<div class="hourglass-grid"><section><span class="section-label">ASCENDANTS</span><div class="tree"><ul><li>${treeHtml(ancestors.tree)}</li></ul></div></section><section><span class="section-label">DESCENDANTS</span><div class="tree"><ul><li>${treeHtml(descendants.tree)}</li></ul></div></section></div>`;
        } else {
            const apiMode = state.graphMode === 'descendants' ? 'descendants' : 'ancestors';
            const data = await api('tree',{id:state.currentPersonId,mode:apiMode,depth:state.graphDepth,pets:treePets()?1:undefined});
            if(token!==state.workspaceToken||state.module!=='graphiques')return;
            if (state.graphMode === 'fan') {
                stageHtml = renderFanChart(data.tree);
            } else {
                stageHtml = `<div class="tree">${data.tree ? `<ul><li>${treeHtml(data.tree)}</li></ul>` : empty('Aucune relation disponible.',{icon:'🔗',hint:'Ajoute des parents, conjoints ou enfants sur la fiche.'})}</div>`;
            }
        }
        const compareAvailable = ['ancestors','descendants','fan'].includes(state.graphMode);
        if(compareAvailable && state.graphCompare.enabled && state.graphCompare.a && state.graphCompare.b){
            const compareMode=state.graphMode==='descendants'?'descendants':'ancestors';
            const [left,right]=await Promise.all([
                api('tree',{id:state.graphCompare.a,mode:compareMode,depth:state.graphDepth}),
                api('tree',{id:state.graphCompare.b,mode:compareMode,depth:state.graphDepth}),
            ]);
            if(token!==state.workspaceToken||state.module!=='graphiques')return;
            const leftName=state.graphCompare.aName||personName(left.tree?.person||{})||`Personne #${state.graphCompare.a}`;
            const rightName=state.graphCompare.bName||personName(right.tree?.person||{})||`Personne #${state.graphCompare.b}`;
            const renderTree=node=>`<div class="tree">${node?`<ul><li>${treeHtml(node)}</li></ul>`:empty('Aucune relation disponible.',{icon:'🔗',hint:'Ajoute des parents, conjoints ou enfants sur la fiche.'})}</div>`;
            stageHtml=`<div class="graph-compare-layout is-${escapeHtml(state.graphCompare.orientation||'vertical')}"><section class="graph-compare-tree"><h3>${escapeHtml(leftName)}</h3>${renderTree(left.tree)}</section><section class="graph-compare-tree"><h3>${escapeHtml(rightName)}</h3>${renderTree(right.tree)}</section></div>`;
        }
        const compareButton=compareAvailable?`<button class="button small secondary" id="graph-compare-toggle">${state.graphCompare.enabled?'Masquer comparaison':'Comparer deux arbres'}</button>`:'';
        $('#workspace').innerHTML = `<section class="graph-layout"><div class="tool-strip"><span class="eyebrow">${escapeHtml(personName(current))}</span><label>Générations <select id="graph-depth">${Array.from({length:19},(_,i)=>i+2).map(n=>`<option ${n===state.graphDepth?'selected':''}>${n}</option>`).join('')}</select></label>${['ancestors','descendants','hourglass'].includes(state.graphMode)?`<label class="check-line" title="Montrer les animaux de chacun à côté de leur maître (trait pointillé)"><input type="checkbox" id="graph-pets" ${treePets()?'checked':''}> 🐾 avec les animaux</label>`:''}<div class="graph-zoom-buttons"><button class="icon-button" id="graph-zoom-out" aria-label="Dézoomer" title="Dézoomer">−</button><label class="graph-zoom-control">Zoom <input id="graph-zoom" type="range" min="0.3" max="1.8" step="0.05" value="${state.graphZoom}"><output id="graph-zoom-value">${Math.round(state.graphZoom*100)} %</output></label><button class="icon-button" id="graph-zoom-in" aria-label="Zoomer" title="Zoomer">+</button></div><button class="button small secondary" id="graph-reset-zoom">100 %</button>${state.graphMode==='distribution'?`<label>Afficher <select id="distribution-name-mode"><option value="last_name" ${state.distributionNameMode==='group'?'':'selected'}>Nom inscrit</option><option value="group" ${state.distributionNameMode==='group'?'selected':''}>Famille / groupe</option></select></label>`:''}<span class="spacer"></span><span class="wheel-hint">Molette : zoomer · Maj + molette ou glisser : déplacer</span>${graphExportToolbarHtml()}<button class="button small" id="graph-person">Choisir dans Personnes</button>${compareButton}</div>
            ${compareAvailable?graphComparePanelHtml():''}<div class="tree-stage"><div class="tree-zoom-layer"><div class="tree-scale-content">${stageHtml}</div></div></div></section>`;
        $('#graph-depth').addEventListener('change',async event=>{state.graphDepth=Number(event.target.value);await renderGraph();});$('#graph-pets')?.addEventListener('change',async event=>{try{localStorage.setItem('genealogie-tree-pets',event.target.checked?'1':'0');}catch(_){}await renderGraph();});const distNameMode=$('#distribution-name-mode');if(distNameMode)distNameMode.addEventListener('change',async event=>{state.distributionNameMode=event.target.value;persistUiState();await renderGraph();});
        $('#graph-person').addEventListener('click',()=>setModule('personnes'));
        bindGraphCompareControls();
        bindGraphExportControls();
        $$('[data-tree-person]').forEach(button=>button.addEventListener('click',async()=>{state.currentPersonId=Number(button.dataset.treePerson);await renderGraph();}));
        const stage = $('.tree-stage');
        const zoomLayer=$('.tree-zoom-layer');
        const scaleContent=$('.tree-scale-content');
        const measureGraphContent=()=>{const child=scaleContent.firstElementChild;const width=child?.offsetWidth||scaleContent.scrollWidth||stage.clientWidth;const height=child?.offsetHeight||scaleContent.scrollHeight||stage.clientHeight;return{width,height};};
        const applyGraphZoom=(recenter=false,anchor=null)=>{
            const previousZoom=Math.max(.3,Math.min(1.8,Number(state.graphZoom)||1));
            const oldZoom=Number(zoomLayer.dataset.zoom)||previousZoom||1;
            const oldOffsetX=parseFloat(scaleContent.style.left)||0;
            const oldOffsetY=parseFloat(scaleContent.style.top)||0;
            const before=anchor?{x:(stage.scrollLeft+anchor.x-oldOffsetX)/oldZoom,y:(stage.scrollTop+anchor.y-oldOffsetY)/oldZoom}:null;
            state.graphZoom=previousZoom;
            const size=measureGraphContent();
            const scaledWidth=size.width*state.graphZoom;
            const scaledHeight=size.height*state.graphZoom;
            const offsetX=Math.max(0,(stage.clientWidth-scaledWidth)/2);
            const offsetY=Math.max(0,(stage.clientHeight-scaledHeight)/2);
            scaleContent.style.left=`${offsetX}px`;
            scaleContent.style.top=`${offsetY}px`;
            scaleContent.style.transform=`scale(${state.graphZoom})`;
            zoomLayer.style.width=`${Math.ceil(Math.max(scaledWidth,stage.clientWidth))}px`;
            zoomLayer.style.height=`${Math.ceil(Math.max(scaledHeight,stage.clientHeight))}px`;
            zoomLayer.dataset.zoom=String(state.graphZoom);
            $('#graph-zoom').value=state.graphZoom;
            $('#graph-zoom-value').textContent=`${Math.round(state.graphZoom*100)} %`;
            persistUiState();
            if(before){stage.scrollLeft=before.x*state.graphZoom+offsetX-anchor.x;stage.scrollTop=before.y*state.graphZoom+offsetY-anchor.y;}
            if(recenter)requestAnimationFrame(centerTree);
        };
        const centerTree = () => { stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2); stage.scrollTop = 0; };
        applyGraphZoom();
        $('#graph-zoom').addEventListener('input',event=>{state.graphZoom=Number(event.target.value);applyGraphZoom(false,{x:stage.clientWidth/2,y:stage.clientHeight/2});});
        $('#graph-zoom-out').addEventListener('click',()=>{state.graphZoom-=.1;applyGraphZoom(false,{x:stage.clientWidth/2,y:stage.clientHeight/2});});
        $('#graph-zoom-in').addEventListener('click',()=>{state.graphZoom+=.1;applyGraphZoom(false,{x:stage.clientWidth/2,y:stage.clientHeight/2});});
        $('#graph-reset-zoom').addEventListener('click',()=>{state.graphZoom=1;applyGraphZoom(true);});
        requestAnimationFrame(() => requestAnimationFrame(centerTree));
        setTimeout(centerTree, 120);
        stage.addEventListener('wheel',event=>{
            if(!event.shiftKey){event.preventDefault();const rect=stage.getBoundingClientRect();state.graphZoom+=event.deltaY<0?.1:-.1;applyGraphZoom(false,{x:event.clientX-rect.left,y:event.clientY-rect.top});return;}
            const canHorizontal=stage.scrollWidth>stage.clientWidth;
            const canVertical=stage.scrollHeight>stage.clientHeight;
            if(!canHorizontal&&!canVertical)return;
            event.preventDefault();
            if(event.shiftKey||(Math.abs(event.deltaX)>Math.abs(event.deltaY))){stage.scrollLeft+=event.deltaX||event.deltaY;stage.scrollTop+=event.deltaY&&event.deltaX?event.deltaY:0;}
            else if(canVertical){stage.scrollTop+=event.deltaY;stage.scrollLeft+=event.deltaX;}
            else stage.scrollLeft+=event.deltaY;
        },{passive:false});
        let graphDrag=null;
        stage.addEventListener('pointerdown',event=>{if(event.target.closest('button,a,input,select'))return;graphDrag={x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop};stage.classList.add('is-dragging');stage.setPointerCapture(event.pointerId);});
        stage.addEventListener('pointermove',event=>{if(!graphDrag)return;stage.scrollLeft=graphDrag.left-(event.clientX-graphDrag.x);stage.scrollTop=graphDrag.top-(event.clientY-graphDrag.y);});
        stage.addEventListener('pointerup',()=>{graphDrag=null;stage.classList.remove('is-dragging');});
    }

    function collectGenerations(node, level, generations) {
        if (!node) return;
        generations[level] ||= [];
        generations[level].push(node.person);
        (node.children || []).forEach(child => collectGenerations(child, level + 1, generations));
    }

    function flattenDiagramTree(root){const nodes=[];let serial=0;const walk=(node,level,index,parentKey=null)=>{if(!node)return;const key=`n${serial++}`;nodes.push({key,parentKey,level,index,person:node.person});(node.children||[]).forEach((child,childIndex)=>walk(child,level+1,index*2+childIndex,key));};walk(root,0,0);return nodes;}
    // ─── Éventail des générations (fan chart radial) ───────────────────────────
    // Chaque anneau concentrique = une génération. La personne centrale occupe
    // le disque du milieu ; chaque anneau suivant montre les parents de la
    // génération précédente, divisé en 2^niveau secteurs égaux qui couvrent
    // tout le cercle (comme dans MacFamilyTree / Heredis).
    function renderFanChart(root){
        if(!root) return empty('Aucune ascendance disponible.',{icon:'🌳',hint:'Ajoute des parents sur la fiche pour voir l’arbre.'});
        const nodes=flattenDiagramTree(root);
        const maxLevel=Math.max(...nodes.map(node=>node.level));
        const centerR=86;
        const ringH=104;
        const gapDeg=.7;
        const totalR=centerR+maxLevel*ringH;
        const size=totalR*2+60;
        const cx=size/2, cy=size/2;
        // angle en degrés, 0° = haut (12h), sens horaire.
        const point=(r,deg)=>{const a=(deg-90)*Math.PI/180;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];};
        const fmt=([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`;
        let svgParts=[];
        let labelParts=[];
        nodes.forEach(node=>{
            const person=node.person;
            const gender=person.gender||'unknown';
            const title=`${escapeHtml(personName(person))}${years(person)?' — '+escapeHtml(years(person)):''}`;
            if(node.level===0){
                svgParts.push(`<circle class="fan-wedge fan-center gender-${gender}" cx="${cx}" cy="${cy}" r="${centerR}" data-tree-person="${person.id}"><title>${title}</title></circle>`);
                labelParts.push(`<foreignObject x="${cx-centerR+10}" y="${cy-centerR+10}" width="${(centerR-10)*2}" height="${(centerR-10)*2}" style="pointer-events:none"><div xmlns="http://www.w3.org/1999/xhtml" class="fan-center-label"><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small></div></foreignObject>`);
                return;
            }
            const span=360/Math.pow(2,node.level);
            const start=node.index*span+gapDeg/2;
            const end=(node.index+1)*span-gapDeg/2;
            const inner=centerR+(node.level-1)*ringH;
            const outer=inner+ringH-Math.min(6,ringH*.06);
            const p1=point(inner,start), p2=point(outer,start), p3=point(outer,end), p4=point(inner,end);
            const largeArc=(end-start)>180?1:0;
            const path=`M${fmt(p1)} L${fmt(p2)} A${outer.toFixed(2)} ${outer.toFixed(2)} 0 ${largeArc} 1 ${fmt(p3)} L${fmt(p4)} A${inner.toFixed(2)} ${inner.toFixed(2)} 0 ${largeArc} 0 ${fmt(p1)} Z`;
            svgParts.push(`<path class="fan-wedge gender-${gender}" d="${path}" data-tree-person="${person.id}"><title>${title}</title></path>`);
            const midDeg=(start+end)/2;
            const midR=(inner+outer)/2;
            const arcLen=(end-start)*Math.PI/180*midR;
            if(arcLen>16){
                let rot=midDeg;
                if(rot>90&&rot<270)rot+=180;
                const [tx,ty]=point(midR,midDeg);
                const fontSize=Math.max(8.5,Math.min(12.5,arcLen/9));
                labelParts.push(`<g class="fan-label" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${rot.toFixed(2)})" style="pointer-events:none"><text class="fan-label-name" font-size="${fontSize}" text-anchor="middle" dy="-1">${escapeHtml(personName(person))}</text>${years(person)?`<text class="fan-label-years" font-size="${Math.max(7,fontSize-2)}" text-anchor="middle" dy="${fontSize+1}">${escapeHtml(years(person))}</text>`:''}</g>`);
            }
        });
        const svg=`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${svgParts.join('')}${labelParts.join('')}</svg>`;
        return `<div class="fan-chart-radial" style="width:${size}px;height:${size}px">${svg}</div>`;
    }
    function renderSpecialDiagram(root,type){if(!root)return empty('Aucune ascendance disponible.',{icon:'🌳',hint:'Ajoute des parents sur la fiche pour voir l’arbre.'});const nodes=flattenDiagramTree(root),maxLevel=Math.max(...nodes.map(node=>node.level)),levels=[];nodes.forEach(node=>(levels[node.level]??=[]).push(node));let width=1600,height=Math.max(type==='genogram'?460:520,(maxLevel+1)*155+180),positions=new Map();
        if(type==='circular'||type==='fractal'){const largest=Math.max(...levels.map(level=>level?.length||0));width=Math.max(1500,Math.min(5200,1000+largest*20));height=width;const center=width/2;levels.forEach((level,levelIndex)=>{const radius=levelIndex===0?0:Math.min(center-110,levelIndex*(center-120)/Math.max(1,maxLevel));level.forEach((node,index)=>{let angle;if(type==='circular')angle=-Math.PI/2+(Math.PI*2*(index+.5))/level.length;else{const normalized=(node.index+.5)/Math.max(1,2**node.level);angle=-Math.PI/2+(normalized-.5)*Math.PI*1.82+(levelIndex%2?-.08:.08);}positions.set(node.key,{x:center+Math.cos(angle)*radius,y:center+Math.sin(angle)*radius});});});}
        else{const largest=Math.max(...levels.map(level=>level?.length||0));width=Math.max(1500,Math.min(42000,(largest+1)*(type==='genogram'?135:190)));levels.forEach((level,levelIndex)=>level.forEach((node,index)=>{const x=(index+1)*width/(level.length+1);const y=type==='genogram'?110+levelIndex*145:height-110-levelIndex*150;positions.set(node.key,{x,y});}));}
        const lines=nodes.filter(node=>node.parentKey).map(node=>{const a=positions.get(node.parentKey),b=positions.get(node.key);if(type==='square'||type==='genogram'){const mid=(a.y+b.y)/2;return `<path d="M${a.x} ${a.y} V${mid} H${b.x} V${b.y}"/>`;}return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;}).join('');
        const cards=nodes.map(node=>{const position=positions.get(node.key),person=node.person,photo=person.portrait?`<img src="media/${encodeURIComponent(person.portrait)}" alt="">`:'';const convention=type==='genogram'?`<span class="genogram-person-convention">${person.gender==='male'?'♂ Masculin':person.gender==='female'?'♀ Féminin':'◇ Sexe non renseigné'}</span>`:'';return `<button class="diagram-person level-${node.level} gender-${person.gender||'unknown'}" style="left:${position.x}px;top:${position.y}px" data-tree-person="${person.id}">${photo}<strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small>${convention}</button>`;}).join('');
        const legend=type==='genogram'?'<div class="genogram-legend"><span class="genogram-legend-male">□ Masculin</span><span class="genogram-legend-female">○ Féminin</span><span>◇ Sexe non renseigné</span><span>Les traits relient les générations connues.</span></div>':'';
        return `${legend}<div class="special-diagram ${type}" style="width:${width}px;height:${height}px"><svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${lines}</svg>${cards}</div>`;}
    function renderDistributionDiagram(data){const names=Object.keys(data.series),width=Math.max(1500,names.length*90+180),height=900,top=70,bottom=790,left=90,range=Math.max(10,data.maxYear-data.minYear),xStep=(width-left-50)/Math.max(1,names.length),allValues=Object.values(data.series).flatMap(series=>Object.values(series)),maxValue=Math.max(1,...allValues);const y=year=>top+(data.maxYear-year)/range*(bottom-top);const grid=[];for(let year=Math.ceil(data.minYear/50)*50;year<=data.maxYear;year+=50)grid.push(`<line x1="${left}" y1="${y(year)}" x2="${width-30}" y2="${y(year)}"/><text x="12" y="${y(year)+4}">${year}</text>`);const violins=names.map((name,index)=>{const center=left+xStep*(index+.5),series=data.series[name],years=Object.keys(series).map(Number).sort((a,b)=>a-b),points=years.map(year=>[year,Math.max(3,Number(series[year])/maxValue*xStep*.42)]),right=points.map(([year,size])=>`${center+size},${y(year)}`).join(' '),leftPoints=[...points].reverse().map(([year,size])=>`${center-size},${y(year)}`).join(' ');return `<polygon points="${right} ${leftPoints}"/><text class="distribution-name" transform="translate(${center+4} ${bottom+22}) rotate(55)">${escapeHtml(name)}</text>`;}).join('');return `<div class="distribution-diagram" style="width:${width}px;height:${height}px"><header><span class="eyebrow">DISTRIBUTION</span><h2>Distribution des noms</h2><p>${plural(data.count,'naissance regroupée','naissances regroupées')} par année et patronyme.</p></header><svg viewBox="0 0 ${width} ${height}"><g class="distribution-grid">${grid.join('')}</g><g class="distribution-violins">${violins}</g></svg></div>`;}

    function treeCardEventLine(label, dateText, year) {
        const d = (dateText && dateText.trim()) ? dateText.trim() : (year ? String(year) : null);
        return d ? `<small class="tree-card-extra">${escapeHtml(label + ' ' + d)}</small>` : '';
    }
    function treeCardExtras(p, tFields) {
        const parts = [];
        if(tFields.occupation && p.occupation && p.occupation.trim()) parts.push(`<small class="tree-card-extra tree-card-occupation">&#9670; ${escapeHtml(p.occupation.trim())}</small>`);
        if(tFields.marr) { const l=treeCardEventLine('\u221e',p.marr_date,p.marr_year); if(l)parts.push(l); }
        if(tFields.buri) { const l=treeCardEventLine('\u271a',p.buri_date,p.buri_year); if(l)parts.push(l); }
        if(tFields.bapt) { const l=treeCardEventLine('\u271d',p.bapt_date,p.bapt_year); if(l)parts.push(l); }
        if(tFields.living_status && p.living_status) { const st={living:'Vivant\u00b7e',deceased:'D\u00e9c\u00e9d\u00e9\u00b7e',unknown:'\u00c0 v\u00e9rifier'}[p.living_status]; if(st)parts.push(`<small class="tree-card-extra tree-card-status">&#9719; ${escapeHtml(st)}</small>`); }
        if(tFields.id) parts.push(`<small class="tree-card-extra tree-card-id"># ${p.id}</small>`);
        return parts.length ? `<span class="tree-card-extras">${parts.join('')}</span>` : '';
    }
    // en option (Graphiques → « 🐾 avec les animaux ») : les animaux de chacun, à côté de leur maître
    const treePets=()=>{try{return localStorage.getItem('genealogie-tree-pets')==='1';}catch(_){return false;}};
    const treePetsHtml=p=>(p.pets||[]).length?`<div class="tree-pets">${p.pets.map(a=>`<button type="button" class="tree-pet-card" ${a.person_id?`data-tree-person="${a.person_id}"`:`data-pet-goto="${a.id}"`} title="${escapeHtml(a.role||'')}">🐾 ${escapeHtml(a.title)}</button>`).join('')}</div>`:'';
    function treeHtml(node) {
        const p=node.person;
        const tFields=getTreeCardFields();
        const extrasHtml=treeCardExtras(p,tFields);
        const partners=(node.partners||[]).map(partner=>{
            const pExtrasHtml=treeCardExtras(partner,tFields);
            return `<div class="tree-partner-link"><span aria-hidden="true">\u221e</span><button class="tree-card tree-partner-card gender-${partner.gender||'unknown'}" data-tree-person="${partner.id}"><strong>${escapeHtml(personName(partner))}</strong><small>${escapeHtml(years(partner))}</small>${pExtrasHtml}</button></div>`;
        }).join('');
        return `<div class="tree-node-shell"><div class="tree-person-unit"><button class="tree-card gender-${p.gender||'unknown'}" data-tree-person="${p.id}"><strong>${escapeHtml(personName(p))}</strong><small>${escapeHtml(years(p))}</small>${extrasHtml}</button>${partners?`<div class="tree-partners">${partners}</div>`:''}${treePetsHtml(p)}</div>${node.has_more?'<span class="tree-continuation" title="D\u2019autres g\u00e9n\u00e9rations existent" aria-label="D\u2019autres g\u00e9n\u00e9rations existent"></span>':''}</div>${node.children?.length?`<ul>${node.children.map(child=>`<li>${treeHtml(child)}</li>`).join('')}</ul>`:''}`;
    }

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderGraph, renderGraphSidebar});
    if (state.module === 'graphiques' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
