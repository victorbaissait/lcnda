/* LCNDA — 📊 Graphiques (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Arbres, éventails, sabliers, parenté, réseaux, monographie de commune, implexe, distributions. Les statistiques (partagées avec le tableau de bord) restent dans app.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const listFmt = l => { try { return new Intl.ListFormat(window.LCNDA_I18N?.locale?.() || 'fr-FR', {type: 'conjunction'}).format(l); } catch (_) { return l.join(', '); } };
    const {$, $$, api, confirmBox, plural, applyGenderColorsToDocument, ascendantsTreeHtml, bindGraphExportControls, debounce, DEFAULT_GENDER_COLORS, defaultGraphStatsItems, descendantsTreeHtml, empty, emptyState, escapeHtml, getStatsColors, getTreeCardFields, graphExportToolbarHtml, loadLineage, openStatsColorsDialog, openViewDialog, orderedGraphDiagramItems, orderedGraphStatsItems, persistUiState, personName, relationYears, reloadBootstrap, renderGraphStats, renderSidebar, safeUrl, savedView, saveGenderColors, setModule, setupSavedViewsDrag, sidebarSignal, sideButton, state, summaryFromState, years} = window.LCNDA_APP;
    function renderGraphSidebar(content, footer) {
        const views = state.bootstrap.savedViews.filter(view => view.module === 'graph');
        content.innerHTML = `<div class="segmented"><button data-graph-tab="types" class="${state.graphTab==='types'?'is-active':''}">Diagrammes</button><button data-graph-tab="saved" class="${state.graphTab==='saved'?'is-active':''}">Enregistrées</button></div>
            ${state.graphTab === 'types' ? `<div class="side-menu">
                ${orderedGraphDiagramItems().map(([key,num,label])=>sideButton(key,num,label,state.graphMode)).join('')}
            </div>${state.graphMode==='kinship'?kinshipSearchPanel():''}<div class="section-label">Statistiques</div><div class="side-menu">${orderedGraphStatsItems().map(([key,num,label],index)=>statsSideButton([key,label],index)).join('')}</div>${customStatsSideHtml()}` : `<div class="saved-list">${views.map(view => savedView(view)).join('') || emptyState({text: 'Aucune vue enregistrée pour l’instant', icon:'💾',hint:'Règle un diagramme puis enregistre-le comme vue pour le retrouver ici.'})}</div>`}`;
        footer.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px"><button class="button small secondary" id="open-decor-tree" title="Éventail, roue ou arbre dessiné, en grand format, à retoucher puis imprimer">🌳 Arbre décoratif à imprimer</button><button class="button small secondary" id="open-stats-colors" title="La palette des statistiques, les cases des arbres et la couleur de chaque sexe">🎨 Couleurs des stats et des arbres</button><button class="button small secondary" id="open-graph-reorder" title="L’ordre des diagrammes et des statistiques dans cette colonne, et ceux qu’on cache">⠿ Réordonner les graphiques</button></div>';
        window.LCNDA_SIDE_FOLDERS?.bind(content,{signal:sidebarSignal()}); // 📁 ouvrir, fermer, créer, renommer, supprimer, glisser
        content.addEventListener('click', async event => {
            const tab=event.target.closest('[data-graph-tab]');if(tab){state.graphTab=tab.dataset.graphTab;renderSidebar();return;}
            const more=event.target.closest('[data-view-more]');if(more){event.stopPropagation();const view=views.find(v=>Number(v.id)===Number(more.dataset.viewMore));if(view)window.LCNDA_UI?.menuAt?.(more,graphViewMenu(view,saved=>saved.click()));return;}
            if(event.target.closest('[data-open-stats-editor]')){state.maintenanceTab='stats_editor';setModule('maintenance');return;}
            if(event.target.closest('[data-open-diagram-new]')){window.LCNDA_EXT?.openDiagramEditor?.(null);return;}
            const mode=event.target.closest('[data-side-value]');if(mode){const value=mode.dataset.sideValue;if(value.startsWith('stats:')){state.graphMode='stats';state.graphStatsType=value.slice(6);state.graphStatsFrozenColors=null;}else if(value.startsWith('diagram:')){state.graphMode='diagram';state.graphDiagramId=Number(value.slice(8));}else{state.graphMode=value;state.graphStatsFrozenColors=null;}await renderGraph();renderSidebar();return;}
            const saved=event.target.closest('[data-view-id]');if(saved&&!event.target.closest('.saved-delete')&&!event.target.closest('.saved-grip')&&!event.target.closest('.saved-edit')){const view=views.find(v=>Number(v.id)===Number(saved.dataset.viewId));if(view){state.graphMode=view.config.mode||'ancestors';state.graphDepth=Number(view.config.depth||4);state.graphStatsType=view.config.statsType||state.graphStatsType;state.graphStatsYearFrom=view.config.graphStatsYearFrom??'';state.graphStatsYearTo=view.config.graphStatsYearTo??'';if(view.config.kinship)state.graphKinship={...state.graphKinship,...view.config.kinship};// Restore frozen colors if saved with this view
            state.graphStatsFrozenColors=Array.isArray(view.config.statsColors)&&view.config.statsColors.length?view.config.statsColors:null;state.graphStatsLimit=view.config.graphStatsLimit??'';state.graphStatsGender=view.config.graphStatsGender??'';state.graphStatsRules=Array.isArray(view.config.graphStatsRules)?view.config.graphStatsRules:[];if(view.config.placeMonograph)state.graphPlaceMonograph={...state.graphPlaceMonograph,...view.config.placeMonograph};if(view.config.personId)state.currentPersonId=Number(view.config.personId);
            if(view.config.genderColors&&view.config.mode!=='stats'&&view.config.mode!=='distribution'){const gc=view.config.genderColors;saveGenderColors({male:{bg:gc.male?.bg||DEFAULT_GENDER_COLORS.male.bg,text:gc.male?.text||DEFAULT_GENDER_COLORS.male.text},female:{bg:gc.female?.bg||DEFAULT_GENDER_COLORS.female.bg,text:gc.female?.text||DEFAULT_GENDER_COLORS.female.text},unknown:{bg:gc.unknown?.bg||DEFAULT_GENDER_COLORS.unknown.bg,text:gc.unknown?.text||DEFAULT_GENDER_COLORS.unknown.text}});applyGenderColorsToDocument();}else if(view.config.mode!=='stats'&&view.config.mode!=='distribution'){applyGenderColorsToDocument();}
            await renderGraph();}}
            const edit=event.target.closest('[data-edit-view]');if(edit){event.stopPropagation();const view=views.find(v=>Number(v.id)===Number(edit.dataset.editView));if(view)openViewDialog(view.module,view.config||{},view.id,view.name);return;}
            const del=event.target.closest('[data-delete-view]');if(del){event.stopPropagation();/* H7 : supprimée tout de suite, « ↶ Annuler » la remet */const vid=Number(del.dataset.deleteView);await window.LCNDA_APP.deleteWithUndo({action:'delete_view',body:{id:vid},type:'view',id:vid,message:'Vue enregistrée supprimée',after:async()=>{await reloadBootstrap();renderSidebar();}});return;}
        },{signal:sidebarSignal()});
        setupSavedViewsDrag($('#sidebar-content .saved-list'), async orderedIds => {
            for(let i=0;i<orderedIds.length;i++){await api('set_view_order',{},{method:'POST',body:{id:orderedIds[i],sort_order:(i+1)*10}});}
            await reloadBootstrap();
        });
        // R11 : ⋯ et clic droit sur chaque vue enregistrée (Ouvrir · Modifier · — · 🗑 Supprimer)
        $$('.saved-list [data-view-id]',content).forEach(row=>{const view=views.find(v=>Number(v.id)===Number(row.dataset.viewId));if(!view)return;if(!row.querySelector('[data-view-more]')){const b=document.createElement('button');b.type='button';b.className='saved-more';b.dataset.viewMore=String(view.id);b.title=i18n('Plus d’actions');b.setAttribute('aria-label',i18n('Plus d’actions'));b.textContent='⋯';row.appendChild(b);}row.addEventListener('contextmenu',e=>window.LCNDA_UI?.contextMenu?.(e,graphViewMenu(view,()=>row.click())));});
        $('#open-stats-colors')?.addEventListener('click',()=>openStatsColorsDialog());
        $('#open-graph-reorder')?.addEventListener('click',()=>window.LCNDA_APP.openGraphReorderDialog());
        $('#open-decor-tree')?.addEventListener('click',()=>window.LCNDA_EXT?.openDecorTree?.());
        if(state.graphMode==='kinship')bindKinshipSearch();
    }

    function graphViewMenu(view,open){const row=$(`#sidebar-content [data-view-id="${Number(view.id)}"]`);return [{icon:'↗',label:i18n('Ouvrir'),run:()=>row&&open(row)},...(gpKiosk()?[]:[{icon:'✎',label:i18n('Modifier'),run:()=>openViewDialog(view.module,view.config||{},view.id,view.name)},{icon:'🗑',label:i18n('Supprimer'),danger:true,run:()=>row?.querySelector('[data-delete-view]')?.click()}])];}
    /** 💾 Enregistrer la vue (barre d'outils, même place dans Graphiques et Carte) */
    function saveGraphView(){
        const config={mode:state.graphMode,depth:state.graphDepth,statsType:state.graphStatsType,graphStatsYearFrom:state.graphStatsYearFrom,graphStatsYearTo:state.graphStatsYearTo,graphStatsLimit:state.graphStatsLimit,graphStatsRules:state.graphStatsRules,graphStatsGender:state.graphStatsGender,personId:state.currentPersonId,kinship:state.graphKinship,placeMonograph:state.graphPlaceMonograph};
        if(state.graphMode==='stats')config.statsColors=getStatsColors(); // la palette du moment, pour une vue de statistique
        openViewDialog('graph',config);
    }
    /** 🔍 Menu de choix unique ; champ caché sans name (le graphique lit le choix par picker-change). */
    const pk = o => (window.LCNDA_PICKER?.pickerField(o) || '').replace(` name="${o.name}"`, '');
    const pkPerson = (id, name) => Number(id) ? {id: Number(id), title: name || '', kind: 'person'} : null;
    function kinshipSearchPanel(){return `<div class="kinship-search"><div class="pk-host"><span>Première personne</span><div id="kinship-from-search">${pk({name:'kinship_from',kind:'person',allowCreate:false,value:pkPerson(state.graphKinship.from,state.graphKinship.fromName)})}</div></div><div class="pk-host"><span>Deuxième personne</span><div id="kinship-to-search">${pk({name:'kinship_to',kind:'person',allowCreate:false,value:pkPerson(state.graphKinship.to,state.graphKinship.toName)})}</div></div><button class="button" id="show-kinship" ${state.graphKinship.from&&state.graphKinship.to?'':'disabled'}>Afficher le lien</button></div>`;}
    function bindKinshipSearch(){['from','to'].forEach(side=>{$(`#kinship-${side}-search`)?.addEventListener('picker-change',event=>{const it=event.detail.item;state.graphKinship[side]=it&&!it.free?Number(it.id):0;state.graphKinship[`${side}Name`]=it?it.title:'';$('#show-kinship').disabled=!(state.graphKinship.from&&state.graphKinship.to);persistUiState();});});$('#show-kinship').addEventListener('click',()=>renderGraph());}
    function graphComparePanelHtml(){
        if(!state.graphCompare.enabled)return '';
        return `<div class="graph-compare-panel"><label>Orientation <select id="graph-compare-orientation"><option value="vertical" ${state.graphCompare.orientation==='vertical'?'selected':''}>Côte à côte</option><option value="horizontal" ${state.graphCompare.orientation==='horizontal'?'selected':''}>Dessus / dessous</option></select></label><div class="pk-host"><span>Personne A</span><div id="graph-compare-a-search">${pk({name:'graph_compare_a',kind:'person',allowCreate:false,value:pkPerson(state.graphCompare.a,state.graphCompare.aName)})}</div></div><div class="pk-host"><span>Personne B</span><div id="graph-compare-b-search">${pk({name:'graph_compare_b',kind:'person',allowCreate:false,value:pkPerson(state.graphCompare.b,state.graphCompare.bName)})}</div></div><button type="button" class="button small" id="graph-compare-apply" ${state.graphCompare.a&&state.graphCompare.b?'':'disabled'}>Comparer</button></div>`;
    }
    function bindGraphCompareControls(){
        const toggle=$('#graph-compare-toggle');
        if(toggle)toggle.addEventListener('click',async()=>{state.graphCompare.enabled=!state.graphCompare.enabled;persistUiState();await renderGraph();});
        const orientation=$('#graph-compare-orientation');
        if(orientation)orientation.addEventListener('change',async event=>{state.graphCompare.orientation=event.target.value;persistUiState();await renderGraph();});
        // personnes A et B : menu de choix unique
        ['a','b'].forEach(side=>{
            $(`#graph-compare-${side}-search`)?.addEventListener('picker-change',event=>{
                const it=event.detail.item;
                state.graphCompare[side]=it&&!it.free?Number(it.id):0;
                state.graphCompare[`${side}Name`]=it?it.title:'';
                const apply=$('#graph-compare-apply');if(apply)apply.disabled=!(state.graphCompare.a&&state.graphCompare.b);
                persistUiState();
            });
        });
        $('#graph-compare-apply')?.addEventListener('click',()=>renderGraph());
    }
    function graphStatsOptions(){return defaultGraphStatsItems;}
    /** Graphiques → « Mes graphiques » : ceux faits dans Réglages → Éditeur de graphiques */
function customStatsSideHtml(){const items=window.LCNDA_EXT?.customStatItems?.()||[];const isActive=key=>state.graphMode==='stats'&&state.graphStatsType===key;const itemHtml=(key,label,index)=>`<button class="side-menu-item ${isActive(key)?'is-active':''}" data-side-value="stats:${escapeHtml(key)}"><span class="side-number">M${index+1}</span>${escapeHtml(label)}</button>`;const footer='<button class="side-menu-item" type="button" data-open-stats-editor><span class="side-number">+</span>Créer un graphique</button>';const SF=window.LCNDA_SIDE_FOLDERS;/* 📁 dossiers et sous-dossiers (app-side-folders.js) */return (SF?SF.sectionHtml('graph',{label:'Mes graphiques',items,isActive,itemHtml,footer}):`<div class="section-label">Mes graphiques</div><div class="side-menu">${items.map(([key,label],index)=>itemHtml(key,label,index)).join('')}${footer}</div>`)+diagramsSideHtml();}
    /** Graphiques → « Mes diagrammes » (hémicycles, frises, camemberts… faits à la main ou avec les chiffres de l'app) */
function diagramsSideHtml(){const items=window.LCNDA_EXT?.diagramItems?.()||[];const isActive=id=>state.graphMode==='diagram'&&Number(state.graphDiagramId)===Number(id);const itemHtml=(id,label,index)=>`<button class="side-menu-item ${isActive(id)?'is-active':''}" data-side-value="diagram:${Number(id)}"><span class="side-number">D${index+1}</span>${escapeHtml(label)}</button>`;const footer='<button class="side-menu-item" type="button" data-open-diagram-new><span class="side-number">+</span>Créer un diagramme</button>';const SF=window.LCNDA_SIDE_FOLDERS;/* 📁 dossiers et sous-dossiers ; on y range aussi en glissant */return SF?SF.sectionHtml('diagram',{label:'Mes diagrammes',items,isActive,itemHtml,footer}):`<div class="section-label">Mes diagrammes</div><div class="side-menu">${items.map(([id,label],index)=>itemHtml(id,label,index)).join('')}${footer}</div>`;}
function statsSideButton([type,label],index){return `<button class="side-menu-item ${state.graphMode==='stats'&&state.graphStatsType===type?'is-active':''}" data-side-value="stats:${type}"><span class="side-number">S${index+1}</span>${label}</button>`;}
    const DIAGRAM_MODES = new Set(['ancestors','descendants','hourglass','fan','kinship','social','occupations','migrations','household','square','circular','symmetric','fractal','genogram']);
    function renderGraphNetwork(data){
        if(data.kind==='household'){
            const households=data.households||[];
            return households.length?`<div class="household-view">${households.map(h=>`<section class="household-card"><header><span class="eyebrow">RECENSEMENT</span><h3>${escapeHtml(h.year||'Année non renseignée')}${h.place?` · ${escapeHtml(h.place)}`:''}</h3><p>${escapeHtml(h.address||'Adresse non renseignée')}</p></header><div class="household-members">${(h.members||[]).map(member=>member.person_id?`<button class="household-member" data-tree-person="${member.person_id}"><strong>${escapeHtml(member.name||'Personne sans nom')}</strong><small>${escapeHtml([member.role,member.occupation].filter(Boolean).join(' · ')||'Membre du foyer')}</small></button>`:`<div class="household-member"><strong>${escapeHtml(member.name||'Personne non liée')}</strong><small>${escapeHtml([member.role,member.occupation].filter(Boolean).join(' · ')||'Membre du foyer')}</small></div>`).join('')||'<small>Aucun membre relevé.</small>'}</div></section>`).join('')}</div>`:emptyState({text: 'Aucune maisonnée recensée pour cette personne.', icon:'🏠',hint:'Ajoute des recensements depuis sa fiche.'});
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
        return `<section class="network-graph"><header><span class="eyebrow">${escapeHtml(title)}</span><p>${i18n('{nodes} · {links}. Survole un lien pour voir sa nature et clique sur une personne pour ouvrir sa fiche.',{nodes:plural(nodes.length,'nœud'),links:plural(edges.length,'lien')})}</p></header><div class="network-stage" style="width:${width}px;height:${height}px"><svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${edgeHtml}</svg>${nodeHtml}</div></section>`;
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
            <div class="place-monograph-search-wrap pk-host"><span>Commune</span><div id="place-monograph-search">${pk({name:'place_monograph',kind:'place',allowCreate:false,value:Number(cfg.id)?{id:Number(cfg.id),title:cfg.name||'',name:cfg.name||'',kind:'place',short:cfg.county||''}:null})}</div></div>
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
            body=`<div class="place-monograph-summary"><div><span class="eyebrow">LIEU</span><h2 class="place-monograph-title">${escapeHtml(title)}</h2><p>${escapeHtml([place.subdivision,place.county,place.state,place.country].filter(Boolean).join(' · ')||'')}</p>${Number(place.id)?`<div class="wx-alt-host" data-wx-place-alt="${Number(place.id)}"></div>`:''}${window.LCNDA_EXT?.sourcesOuvertes2?.placeHtml?.(place)||''}${window.LCNDA_EXT?.sourcesOuvertes4?.placeHtml?.(place)||''}${window.LCNDA_EXT?.sourcesOuvertes7?.placeHtml?.(place)||''}</div>${place.latitude!==null&&place.longitude!==null?`<button class="button secondary" id="place-monograph-map">Voir sur la carte</button>`:''}</div>
                <div class="place-monograph-metrics">${metrics.map(([label,value])=>`<div><strong>${Number(value||0)}</strong><span>${label}</span></div>`).join('')}</div>
                <div class="place-monograph-sections">
                    ${cfg.showEvents?placeMonographSection('Actes rattachés',counts.events,events,'events'):''}
                    ${cfg.showEvents&&Number(counts.census||0)?placeMonographSection('Recensements',counts.census,census,'census'):''}
                    ${cfg.showDigests?placeMonographSection('Dépouillements',counts.digests,digests,'digests'):''}
                    ${cfg.showBattues?placeMonographSection('Battues',counts.battues,battues,'battues'):''}
                    ${cfg.showCemetery?placeMonographSection('Cimetière',counts.graves,graves,'cemetery'):''}
                    ${Number(place.id)?`<div class="place-monograph-postcards" data-cpo-host data-cpo-place="${Number(place.id)}" data-cpo-name="${escapeHtml(place.name||'')}"></div>`:''}
                    ${Number(place.id)?`<div class="place-monograph-images" data-pli-host data-pli-place="${Number(place.id)}" data-pli-name="${escapeHtml(place.name||'')}" data-pli-lat="${place.latitude??''}" data-pli-lon="${place.longitude??''}"></div>`:''}
                </div>`;
        }
        $('#workspace').innerHTML=`<section class="graph-layout place-monograph-layout"><div class="tool-strip"><span class="eyebrow">GRAPHIQUES · LIEUX</span><span class="spacer"></span>${graphExportToolbarHtml()}</div><main class="place-monograph-stage"><div class="place-monograph-shell"><header class="place-monograph-head"><span class="eyebrow">SYNTHÈSE LOCALE</span><h1>Monographie de commune</h1><p>Regroupe les sources et recherches déjà rattachées à un même lieu.</p></header>${activeFilters}${body}</div></main></section>`;
        document.querySelectorAll('#workspace [data-wx-place-alt]').forEach(h=>window.LCNDA_EXT?.meteo?.placeAltitudeInto?.(h)); // 🌦 ⛰ altitude du lieu (heritage-meteo.js)
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
        // la commune : menu de choix unique (lieux de la base, communes de France, villes du monde) ; les coordonnées viennent de place_name_search
        $('#place-monograph-search').addEventListener('picker-change',async event=>{
            const it=event.detail.item;
            if(!it||it.free){Object.assign(cfg,{name:'',id:0,county:'',state:'',country:'',latitude:null,longitude:null});persistUiState();await renderPlaceMonograph();return;}
            Object.assign(cfg,{id:Number(it.id),name:it.name||it.title,county:it.county||'',state:it.state_name||'',country:'',latitude:null,longitude:null});
            try{const found=await api('place_name_search',{q:it.name||it.title});const same=(found.places||[]).find(p=>Number(p.id)===Number(it.id));if(same)Object.assign(cfg,{county:same.county||cfg.county,state:same.state||cfg.state,country:same.country||'',latitude:same.latitude??null,longitude:same.longitude??null});}catch(_){}
            persistUiState();await renderPlaceMonograph();
        });
        $('#place-monograph-map')?.addEventListener('click',()=>{state.mapCenter={lat:Number(place.latitude),lon:Number(place.longitude)};state.mapKeepCenter=true;setModule('carte');});
        $$('[data-monograph-person]').forEach(button=>button.addEventListener('click',()=>{state.currentPersonId=Number(button.dataset.monographPerson);setModule('personnes');}));
        $$('[data-monograph-battue]').forEach(button=>button.addEventListener('click',()=>{state.currentBattueId=Number(button.dataset.monographBattue);state.enquetesTab='battue';setModule('enquetes');}));
        bindGraphExportControls();
    }
    /** Implexe : ancêtres présents à plusieurs places de l'ascendance, et taux par génération. */
    function renderImplexe(data,root){
        const rootName=personName(root||{})||i18n('cette personne');
        const sosaList=list=>listFmt(list.map(n=>`Sosa ${n}`));
        const row=item=>`<li class="implexe-row${item.entry?' is-entry':''}"><button class="table-link" type="button" data-tree-person="${item.id}">${escapeHtml(personName(item.person||{}))}</button> <small>${escapeHtml(years(item.person||{}))}</small><span>${i18n('est {list}',{list:escapeHtml(sosaList(item.sosas))})}${item.count>item.sosas.length?` ${i18n('(… {n} places en tout)',{n:item.count})}`:''} · ${i18n(item.generations.length>1?'générations {list}':'génération {list}',{list:item.generations.join(', ')})}</span></li>`;
        const entries=data.repeated.filter(item=>item.entry),others=data.repeated.filter(item=>!item.entry);
        const table=`<table class="implexe-table"><thead><tr><th>Génération</th><th>Places théoriques</th><th>Places connues</th><th>Personnes différentes</th><th>Implexe</th><th>Implexe cumulé</th></tr></thead><tbody>${data.generations.map(g=>`<tr><td>${g.generation}</td><td>${g.theoretical===null?'—':Number(g.theoretical).toLocaleString('fr-FR')}</td><td>${g.slots}</td><td>${g.people}</td><td>${String(g.rate).replace('.',',')} %</td><td>${String(g.cumulative_rate).replace('.',',')} %</td></tr>`).join('')}</tbody></table>`;
        return `<div class="implexe-view"><span class="eyebrow">IMPLEXE</span><h2>${i18n('Ancêtres répétés de {name}',{name:escapeHtml(rootName)})}</h2>
            <p class="muted">Quand deux ancêtres sont cousins, leurs propres ancêtres apparaissent plusieurs fois dans l’arbre : c’est l’implexe. Seules les filiations biologiques comptent. Le taux = 1 − personnes différentes ÷ places connues.</p>
            <div class="implexe-summary"><div><strong>${data.slots}</strong><span>places connues</span></div><div><strong>${data.people}</strong><span>ancêtres différents</span></div><div><strong>${String(data.rate).replace('.',',')} %</strong><span>implexe global</span></div><div><strong>${data.repeated_total}</strong><span>ancêtres répétés</span></div></div>
            ${data.truncated?'<p class="muted">Calcul arrêté : arbre trop grand.</p>':''}
            ${data.repeated_total?`<h3>Les couples communs les plus proches</h3><p class="muted">C’est ici que les branches se rejoignent ; leurs ancêtres sont répétés à leur suite.</p><ul class="implexe-list">${entries.map(row).join('')}</ul>${others.length?`<details class="implexe-more"><summary>${i18n('Voir aussi leurs ancêtres répétés ({n})',{n:others.length})}</summary><ul class="implexe-list">${others.map(row).join('')}</ul></details>`:''}`:empty('Aucun ancêtre répété : chaque ancêtre connu n’apparaît qu’une fois.',{icon:'✅'})}
            <h3>Par génération</h3><div class="implexe-table-wrap">${table}</div></div>`;
    }
    async function renderGraph(token=++state.workspaceToken) {
        const current = summaryFromState();
        const waitTimer=setTimeout(()=>{if(token!==state.workspaceToken||state.module!=='graphiques')return;const st=$('#workspace .tree-stage, #workspace .stats-stage');if(st)st.classList.add('is-loading');else $('#workspace').innerHTML=window.LCNDA_UI?.spinner?.(i18n('Chargement du graphique…'))||'';},250); // R10 : l'attente commune (C7)
        try{return await renderGraphInner(token,current);}finally{clearTimeout(waitTimer);}
    }
    async function renderGraphInner(token,current){
        if (state.graphMode === 'stats') { await renderGraphStats(token); return gpAfterRender(); }
        if (state.graphMode === 'place_monograph') { await renderPlaceMonograph(token); return gpAfterRender(); }
        if (state.graphMode === 'diagram' && window.LCNDA_EXT?.renderDiagramPage) { await window.LCNDA_EXT.renderDiagramPage(token, Number(state.graphDiagramId) || 0); return gpAfterRender(); }
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
            else{const data=await api('kinship',{from:state.graphKinship.from,to:state.graphKinship.to});if(token!==state.workspaceToken||state.module!=='graphiques')return;stageHtml=data.path.length?`<div class="kinship-path">${data.path.map((person,index)=>`${index?`<div class="kinship-connector"><span>${escapeHtml(data.relations[index-1]||'lié à')}</span><i>→</i></div>`:''}<button class="kinship-person gender-${person.gender||'unknown'} ${index===0||index===data.path.length-1?'is-endpoint':''}" data-tree-person="${person.id}">${person.portrait?`<img src="media/${encodeURIComponent(person.portrait)}" alt="">`:'<span class="kinship-initial">'+escapeHtml((person.first_name?.[0]||'')+(person.last_name?.[0]||''))+'</span>'}<strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small></button>`).join('')}</div><p class="kinship-summary">${i18n('{links} entre les deux personnes.',{links:plural(data.length,'lien')})}</p>`:empty('Aucun chemin familial trouvé entre ces deux personnes.',{icon:'🔗'})}
        } else if(state.graphMode==='occtree'&&window.LCNDA_EXT?.occTree){ // 🧬 Arbre des métiers (heritage-metiers-arbre.js)
            stageHtml=await window.LCNDA_EXT.occTree.stage(token);if(token!==state.workspaceToken||state.module!=='graphiques')return;
        } else if(['square','circular','symmetric','fractal','genogram'].includes(state.graphMode)){
            const data=await api('tree',{id:state.currentPersonId,mode:'ancestors',depth:state.graphDepth});if(token!==state.workspaceToken||state.module!=='graphiques')return;stageHtml=renderSpecialDiagram(data.tree,state.graphMode);
        } else if (state.graphMode === 'hourglass') {
            const [ancestors, descendants] = await Promise.all([
                api('tree',{id:state.currentPersonId,mode:'ancestors',depth:state.graphDepth,pets:treePets()?1:undefined}),
                api('tree',{id:state.currentPersonId,mode:'descendants',depth:state.graphDepth,pets:treePets()?1:undefined}),
            ]);
            if(token!==state.workspaceToken||state.module!=='graphiques')return;
            stageHtml = `<div class="hourglass-grid"><section><span class="section-label">ASCENDANTS</span><div class="tree"><ul><li>${treeHtml(ancestors.tree,{asc:true,level:0,depth:state.graphDepth})}</li></ul></div></section><section><span class="section-label">DESCENDANTS</span><div class="tree"><ul><li>${treeHtml(descendants.tree)}</li></ul></div></section></div>`;
        } else {
            const apiMode = state.graphMode === 'descendants' ? 'descendants' : 'ancestors';
            const data = await api('tree',{id:state.currentPersonId,mode:apiMode,depth:state.graphDepth,pets:treePets()?1:undefined});
            if(token!==state.workspaceToken||state.module!=='graphiques')return;
            if (state.graphMode === 'fan') {
                stageHtml = renderFanChart(data.tree);
            } else {
                stageHtml = `<div class="tree">${data.tree ? `<ul><li>${treeHtml(data.tree,apiMode==='ancestors'?{asc:true,level:0,depth:state.graphDepth}:null)}</li></ul>` : emptyState({text: 'Aucune relation disponible.', icon:'🔗',hint:'Ajoute des parents, conjoints ou enfants sur la fiche.'})}</div>`;
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
            const leftName=state.graphCompare.aName||personName(left.tree?.person||{})||i18n('Personne #{id}',{id:String(state.graphCompare.a)});
            const rightName=state.graphCompare.bName||personName(right.tree?.person||{})||i18n('Personne #{id}',{id:String(state.graphCompare.b)});
            const renderTree=node=>`<div class="tree">${node?`<ul><li>${treeHtml(node)}</li></ul>`:emptyState({text: 'Aucune relation disponible.', icon:'🔗',hint:'Ajoute des parents, conjoints ou enfants sur la fiche.'})}</div>`;
            stageHtml=`<div class="graph-compare-layout is-${escapeHtml(state.graphCompare.orientation||'vertical')}"><section class="graph-compare-tree"><h3>${escapeHtml(leftName)}</h3>${renderTree(left.tree)}</section><section class="graph-compare-tree"><h3>${escapeHtml(rightName)}</h3>${renderTree(right.tree)}</section></div>`;
        }
        const compareButton=compareAvailable?`<button class="button small secondary" id="graph-compare-toggle">${state.graphCompare.enabled?'Masquer comparaison':'Comparer deux arbres'}</button>`:'';
        $('#workspace').innerHTML = `<section class="graph-layout"><div class="tool-strip"><span class="eyebrow gp-where">${escapeHtml(gpWhere())}</span><strong class="gp-who">${escapeHtml(personName(current))}</strong><label>Générations <select id="graph-depth">${Array.from({length:19},(_,i)=>i+2).map(n=>`<option ${n===state.graphDepth?'selected':''}>${n}</option>`).join('')}</select></label>${['ancestors','descendants','hourglass'].includes(state.graphMode)?`<label class="ui-toggle" title="Montrer les animaux de chacun à côté de leur maître (trait pointillé)"><input type="checkbox" id="graph-pets" ${treePets()?'checked':''}><i></i>🐾 avec les animaux</label>`:''}<div class="graph-zoom-buttons"><button class="icon-button" id="graph-zoom-out" aria-label="Dézoomer" title="Dézoomer">−</button><label class="graph-zoom-control">Zoom <input id="graph-zoom" type="range" min="0.3" max="1.8" step="0.05" value="${state.graphZoom}"><output id="graph-zoom-value">${Math.round(state.graphZoom*100)} %</output></label><button class="icon-button" id="graph-zoom-in" aria-label="Zoomer" title="Zoomer">+</button></div><button class="button small secondary" id="graph-reset-zoom">100 %</button>${state.graphMode==='distribution'?`<label>Afficher <select id="distribution-name-mode"><option value="last_name" ${state.distributionNameMode==='group'?'':'selected'}>Nom inscrit</option><option value="group" ${state.distributionNameMode==='group'?'selected':''}>Famille / groupe</option></select></label>`:''}${gpTreeOptionsHtml()}<span class="spacer"></span><span class="wheel-hint">Molette : zoomer · Maj + molette ou glisser : déplacer</span>${graphExportToolbarHtml()}<button class="button small" id="graph-person">Choisir dans Personnes</button>${compareButton}</div>
            ${compareAvailable?graphComparePanelHtml():''}<div class="tree-stage"><div class="tree-zoom-layer"><div class="tree-scale-content">${stageHtml}</div></div></div></section>`;
        $('#graph-depth').addEventListener('change',async event=>{state.graphDepth=Number(event.target.value);await renderGraph();});$('#graph-pets')?.addEventListener('change',async event=>{try{localStorage.setItem('genealogie-tree-pets',event.target.checked?'1':'0');}catch(_){}await renderGraph();});const distNameMode=$('#distribution-name-mode');if(distNameMode)distNameMode.addEventListener('change',async event=>{state.distributionNameMode=event.target.value;persistUiState();await renderGraph();});
        $('#graph-person').addEventListener('click',()=>setModule('personnes'));
        bindGraphCompareControls();
        bindGraphExportControls();
        if(state.graphMode==='occtree')window.LCNDA_EXT?.occTree?.bind?.();
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
        gpAfterRender();
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
        if(!root) return emptyState({text: 'Aucune ascendance disponible.', icon:'🌳',hint:'Ajoute des parents sur la fiche pour voir l’arbre.'});
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
    function renderSpecialDiagram(root,type){if(!root)return emptyState({text: 'Aucune ascendance disponible.', icon:'🌳',hint:'Ajoute des parents sur la fiche pour voir l’arbre.'});const nodes=flattenDiagramTree(root),maxLevel=Math.max(...nodes.map(node=>node.level)),levels=[];nodes.forEach(node=>(levels[node.level]??=[]).push(node));let width=1600,height=Math.max(type==='genogram'?460:520,(maxLevel+1)*155+180),positions=new Map();
        if(type==='circular'||type==='fractal'){const largest=Math.max(...levels.map(level=>level?.length||0));width=Math.max(1500,Math.min(5200,1000+largest*20));height=width;const center=width/2;levels.forEach((level,levelIndex)=>{const radius=levelIndex===0?0:Math.min(center-110,levelIndex*(center-120)/Math.max(1,maxLevel));level.forEach((node,index)=>{let angle;if(type==='circular')angle=-Math.PI/2+(Math.PI*2*(index+.5))/level.length;else{const normalized=(node.index+.5)/Math.max(1,2**node.level);angle=-Math.PI/2+(normalized-.5)*Math.PI*1.82+(levelIndex%2?-.08:.08);}positions.set(node.key,{x:center+Math.cos(angle)*radius,y:center+Math.sin(angle)*radius});});});}
        else{const largest=Math.max(...levels.map(level=>level?.length||0));width=Math.max(1500,Math.min(42000,(largest+1)*(type==='genogram'?135:190)));levels.forEach((level,levelIndex)=>level.forEach((node,index)=>{const x=(index+1)*width/(level.length+1);const y=type==='genogram'?110+levelIndex*145:height-110-levelIndex*150;positions.set(node.key,{x,y});}));}
        const lines=nodes.filter(node=>node.parentKey).map(node=>{const a=positions.get(node.parentKey),b=positions.get(node.key);if(type==='square'||type==='genogram'){const mid=(a.y+b.y)/2;return `<path d="M${a.x} ${a.y} V${mid} H${b.x} V${b.y}"/>`;}return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;}).join('');
        const cards=nodes.map(node=>{const position=positions.get(node.key),person=node.person,lcAv=treeAv(person),photo=lcAv||(person.portrait?`<img src="media/${encodeURIComponent(person.portrait)}" alt="">`:'');const convention=type==='genogram'?`<span class="genogram-person-convention">${person.gender==='male'?'♂ Masculin':person.gender==='female'?'♀ Féminin':'◇ Sexe non renseigné'}</span>`:'';return `<button class="diagram-person level-${node.level} gender-${person.gender||'unknown'}${lcAv?' has-lc-av':''}" style="left:${position.x}px;top:${position.y}px" data-tree-person="${person.id}">${photo}<strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small>${convention}</button>`;}).join('');
        const legend=type==='genogram'?'<div class="genogram-legend"><span class="genogram-legend-male">□ Masculin</span><span class="genogram-legend-female">○ Féminin</span><span>◇ Sexe non renseigné</span><span>Les traits relient les générations connues.</span></div>':'';
        return `${legend}<div class="special-diagram ${type}" style="width:${width}px;height:${height}px"><svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${lines}</svg>${cards}</div>`;}
    function renderDistributionDiagram(data){const names=Object.keys(data.series),width=Math.max(1500,names.length*90+180),height=900,top=70,bottom=790,left=90,range=Math.max(10,data.maxYear-data.minYear),xStep=(width-left-50)/Math.max(1,names.length),allValues=Object.values(data.series).flatMap(series=>Object.values(series)),maxValue=Math.max(1,...allValues);const y=year=>top+(data.maxYear-year)/range*(bottom-top);const grid=[];for(let year=Math.ceil(data.minYear/50)*50;year<=data.maxYear;year+=50)grid.push(`<line x1="${left}" y1="${y(year)}" x2="${width-30}" y2="${y(year)}"/><text x="12" y="${y(year)+4}">${year}</text>`);const violins=names.map((name,index)=>{const center=left+xStep*(index+.5),series=data.series[name],years=Object.keys(series).map(Number).sort((a,b)=>a-b),points=years.map(year=>[year,Math.max(3,Number(series[year])/maxValue*xStep*.42)]),right=points.map(([year,size])=>`${center+size},${y(year)}`).join(' '),leftPoints=[...points].reverse().map(([year,size])=>`${center-size},${y(year)}`).join(' ');return `<polygon points="${right} ${leftPoints}"/><text class="distribution-name" transform="translate(${center+4} ${bottom+22}) rotate(55)">${escapeHtml(name)}</text>`;}).join('');return `<div class="distribution-diagram" style="width:${width}px;height:${height}px"><header><span class="eyebrow">DISTRIBUTION</span><h2>Distribution des noms</h2><p>${i18n('{births} par année et patronyme.',{births:plural(data.count,'naissance regroupée','naissances regroupées')})}</p></header><svg viewBox="0 0 ${width} ${height}"><g class="distribution-grid">${grid.join('')}</g><g class="distribution-violins">${violins}</g></svg></div>`;}

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
    /** K7 : le portrait commun (48 px) dans les cases de l'arbre, seulement si Apparence → Portraits n'est pas « Comme avant » */
    const treeAv=p=>(window.LCNDA_UI?.avatarOn?.()||window.LCNDA_DESIGNS?.treePhoto?.()||gpPortraits())&&p?window.LCNDA_UI.avatar({...p,name:personName(p),photo:p.portrait?`media/${encodeURIComponent(p.portrait)}`:''},48):'';
    function treeHtml(node, opt=null) {
        const p=node.person;
        const tFields=getTreeCardFields();
        const extrasHtml=treeCardExtras(p,tFields);
        const partners=(node.partners||[]).map(partner=>{
            const pExtrasHtml=treeCardExtras(partner,tFields);
            return `<div class="tree-partner-link"><span aria-hidden="true">\u221e</span><button class="tree-card tree-partner-card gender-${partner.gender||'unknown'}${treeAv(partner)?' has-lc-av':''}" data-tree-person="${partner.id}">${treeAv(partner)}<strong>${escapeHtml(personName(partner))}</strong><small>${escapeHtml(years(partner))}</small>${pExtrasHtml}</button></div>`;
        }).join('');
        return `<div class="tree-node-shell"><div class="tree-person-unit"><button class="tree-card gender-${p.gender||'unknown'}${treeAv(p)?' has-lc-av':''}" data-tree-person="${p.id}">${treeAv(p)}<strong>${escapeHtml(personName(p))}</strong><small>${escapeHtml(years(p))}</small>${extrasHtml}</button>${partners?`<div class="tree-partners">${partners}</div>`:''}${treePetsHtml(p)}</div>${node.has_more?'<span class="tree-continuation" title="D\u2019autres g\u00e9n\u00e9rations existent" aria-label="D\u2019autres g\u00e9n\u00e9rations existent"></span>':''}</div>${node.children?.length||gpMissingParents(node,opt).length?`<ul>${(node.children||[]).map(child=>`<li>${treeHtml(child,opt?{...opt,level:opt.level+1}:null)}</li>`).join('')}${gpMissingParents(node,opt).map(role=>`<li>${gpUnknownCard(node.person,role)}</li>`).join('')}</ul>`:''}`;
    }


    /* ═════ Audit 📊 Graphiques : barre d'outils unique (où l'on est · ⤓ Exporter · 🖨 Imprimer · 💾 Enregistrer la vue · ⛶), 🧩 grand arbre en feuilles
     * à assembler (F12), menu clic droit des cases, « ＋ ? » pour un parent inconnu, mini-plan, portraits, repères de couleur, chiffres et comparaison
     * des statistiques, raccourcis ⌘+ ⌘− ⌘0 ↑ ↓ ⌘P, mode consultation (R6). ═════ */
    const gpKiosk=()=>document.body.classList.contains('is-kiosk');
    const gpToast=(m,k)=>window.LCNDA_APP?.toast?.(m,k);
    const gpGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(_){return d;}};
    const gpSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(_){}};
    const gpPortraits=()=>gpGet('genealogie-tree-portraits',false)===true;
    const TREE_MODES=['ancestors','descendants','hourglass','lineage','square','circular','symmetric','fractal','genogram','fan'];
    function gpViewLabel(){
        if(state.graphMode==='stats'){const it=orderedGraphStatsItems().find(([k])=>k===state.graphStatsType);return it?it[2]:i18n('Statistiques');}
        if(state.graphMode==='diagram')return i18n('Mes diagrammes');
        if(state.graphMode==='place_monograph')return i18n('Monographie de commune');
        const it=orderedGraphDiagramItems().find(([k])=>k===state.graphMode);return it?it[2]:'';
    }
    function gpWhere(){const v=gpViewLabel();return v?`${i18n('GRAPHIQUES')} · ${v}`:i18n('GRAPHIQUES');}
    /** les réglages des cases dans la barre : 🖼 portraits, 🧷 repères de couleur, branches masquées */
    function gpTreeOptionsHtml(){
        if(!TREE_MODES.includes(state.graphMode))return '';
        const mark=gpGet('genealogie-graph-marks','');
        return `${['ancestors','descendants','hourglass'].includes(state.graphMode)?`<label class="ui-toggle" title="${escapeHtml(i18n('La photo de la fiche dans chaque case'))}"><input type="checkbox" id="gp-portraits" ${gpPortraits()?'checked':''}><i></i>${escapeHtml(i18n('🖼 Portraits'))}</label>`:''}<label class="gp-marks" title="${escapeHtml(i18n('Colorer les cases : une étiquette, une branche, ou les fiches sans source'))}">${escapeHtml(i18n('🧷 Repères'))} <select id="gp-marks"><option value="">${escapeHtml(i18n('Aucun'))}</option><option value="nosource" ${mark==='nosource'?'selected':''}>${escapeHtml(i18n('Sans source (en rouge)'))}</option>${mark&&mark!=='nosource'?`<option value="${escapeHtml(mark)}" selected>…</option>`:''}</select></label><span class="gp-marks-n muted" id="gp-marks-n"></span><button type="button" class="button small secondary" id="gp-unhide" hidden></button>`;
    }

    /* ── ＋ ? : un parent inconnu dans l'arbre des ascendants ── */
    function gpMissingParents(node,opt){
        if(!opt?.asc||gpKiosk()||!node?.person||node.has_more||opt.level>=opt.depth)return [];
        const kids=node.children||[];if(kids.length>=2)return [];
        const g=kids.map(k=>k.person?.gender);
        if(kids.length===1)return [g[0]==='male'?'mother':g[0]==='female'?'father':'parent'];
        return ['father','mother'];
    }
    function gpUnknownCard(p,role){
        const lab={father:'Ajouter le père',mother:'Ajouter la mère',parent:'Ajouter l’autre parent'}[role];
        return `<div class="tree-node-shell"><button type="button" class="tree-card tree-card-unknown gp-edit" data-tree-add-parent="${Number(p.id)}" title="${escapeHtml(i18n('{what} de {nm} (créer la fiche ou relier une fiche)',{what:i18n(lab),nm:personName(p)}))}"><strong>?</strong><small>＋ ${escapeHtml(i18n(lab))}</small></button></div>`;
    }
    /** la fenêtre « Ajouter un parent / un enfant » de la fiche (même formulaire), puis l'arbre se redessine */
    function gpAddRelation(personId,type){
        const form=$('#relation-form'),dlg=$('#relation-dialog');
        if(!form||!dlg){state.currentPersonId=personId;setModule('personnes');return;}
        form.reset();form.elements.person_id.value=personId;form.elements.relation_type.value=type;
        const pkHost=$('#relation-search');if(pkHost&&window.LCNDA_PICKER?.pickerSet)try{window.LCNDA_PICKER.pickerSet(pkHost,null);}catch(_){}
        if(form.elements.entry_mode)[...form.elements.entry_mode.options].forEach(o=>o.hidden=type==='parent'&&['none','none_suspected'].includes(o.value));
        const ex=$('#relation-existing-fields'),nw=$('#relation-new-fields');if(ex)ex.hidden=false;if(nw)nw.hidden=true;
        const t=$('#relation-dialog-title');if(t)t.textContent=type==='parent'?i18n('Ajouter un parent'):i18n('Ajouter un enfant');
        dlg.showModal();setTimeout(()=>$('#relation-search .pk-input')?.focus(),30);
        dlg.addEventListener('close',()=>{if(state.module==='graphiques')setTimeout(()=>renderGraph(),250);},{once:true});
    }

    /* ── 🖱 menu clic droit d'une case ── */
    const gpHidden=new Set();
    function gpCardMenu(card){
        const id=Number(card.dataset.treePerson),name=(card.querySelector('strong')?.textContent||'').trim()||i18n('Personne #{id}',{id:String(id)}),yrs=(card.querySelector('small')?.textContent||'').trim();
        const li=card.closest('.tree li'),canHide=!!li?.querySelector(':scope > ul')&&card.closest('.tree-person-unit')&&!card.classList.contains('tree-partner-card');
        return [{icon:'↗',label:i18n('Ouvrir la fiche'),run:()=>{state.currentPersonId=id;setModule('personnes');}},
            {icon:'🎯',label:i18n('Recentrer l’arbre ici'),run:async()=>{state.currentPersonId=id;persistUiState();await renderGraph();}},
            ...(gpKiosk()?[]:['-',{icon:'＋',label:i18n('Ajouter un parent'),run:()=>gpAddRelation(id,'parent')},{icon:'＋',label:i18n('Ajouter un enfant'),run:()=>gpAddRelation(id,'child')}]),
            '-',
            ...(canHide?[gpHidden.has(id)?{icon:'👁',label:i18n('Montrer cette branche'),run:()=>{gpHidden.delete(id);gpApplyHidden();}}:{icon:'🙈',label:i18n('Masquer cette branche'),run:()=>{gpHidden.add(id);gpApplyHidden();}}]:[]),
            {icon:'⧉',label:i18n('Copier la référence'),run:()=>gpCopy(`${name}${yrs?` (${yrs})`:''} · #${id}`)}];
    }
    async function gpCopy(text){try{await navigator.clipboard.writeText(text);gpToast(i18n('Copié : {x}',{x:text}));}catch(_){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');gpToast(i18n('Copié : {x}',{x:text}));}catch(__){}ta.remove();}}
    function gpApplyHidden(){
        $$('#workspace .tree .tree-person-unit > .tree-card[data-tree-person]').forEach(card=>{const id=Number(card.dataset.treePerson),ul=card.closest('li')?.querySelector(':scope > ul');if(!ul)return;const off=gpHidden.has(id);ul.hidden=off;card.classList.toggle('is-branch-hidden',off);});
        const b=$('#gp-unhide');if(b){const n=$$('#workspace .tree-card.is-branch-hidden').length;b.hidden=!n;b.textContent=i18n('👁 Montrer les branches masquées ({n})',{n});}
    }

    /* ── 🧷 repères de couleur ── */
    let gpChoices=null;const gpScopes=new Map();
    async function gpMarkChoices(){if(gpChoices)return gpChoices;const [b,l]=await Promise.all([api('branches').catch(()=>({})),api('labels').catch(()=>({}))]);gpChoices={branches:b.branches||[],labels:l.labels||[]};return gpChoices;}
    async function gpApplyMarks(){
        const sel=$('#gp-marks');if(!sel)return;
        const ch=await gpMarkChoices().catch(()=>({branches:[],labels:[]}));
        if(!sel.dataset.filled){const v=gpGet('genealogie-graph-marks','');sel.innerHTML=`<option value="">${escapeHtml(i18n('Aucun'))}</option><option value="nosource">${escapeHtml(i18n('Sans source (en rouge)'))}</option>${ch.labels.length?`<optgroup label="${escapeHtml(i18n('Étiquette'))}">${ch.labels.map(l=>`<option value="label:${Number(l.id)}">${escapeHtml(l.name)}</option>`).join('')}</optgroup>`:''}${ch.branches.length?`<optgroup label="${escapeHtml(i18n('Branche'))}">${ch.branches.map(b=>`<option value="branch:${Number(b.id)}">${escapeHtml(b.name||b.root_name||'#'+b.id)}</option>`).join('')}</optgroup>`:''}`;sel.value=v;if(sel.value!==v)sel.value='';sel.dataset.filled='1';}
        const v=sel.value,cards=$$('#workspace .tree-stage [data-tree-person]');
        cards.forEach(c=>{c.classList.remove('gp-marked');c.style.removeProperty('--gp-mark');});
        const n=$('#gp-marks-n');if(n)n.textContent='';
        if(!v)return;
        const [kind,idStr]=v.split(':'),f=kind==='nosource'?{nosource:1}:kind==='label'?{labels:[Number(idStr)]}:{branch:Number(idStr)};
        const color=kind==='nosource'?'#d6336c':kind==='label'?(ch.labels.find(l=>Number(l.id)===Number(idStr))?.color||'#e8590c'):'#f08c00';
        const key=JSON.stringify(f);let set=gpScopes.get(key);
        if(!set||Date.now()-set.t>60000){try{const r=await api('cartes_perso',{op:'map_scope',f:key});set={t:Date.now(),ids:new Set((r.ids||[]).map(Number))};gpScopes.set(key,set);}catch(error){gpToast(error.message,'error');return;}}
        let k=0;cards.forEach(c=>{if(set.ids.has(Number(c.dataset.treePerson))){c.classList.add('gp-marked');c.style.setProperty('--gp-mark',color);k++;}});
        if(n)n.textContent=k===1?i18n('1 case repérée'):i18n('{n} cases repérées',{n:k});
    }

    /* ── 🗺 mini-plan (vue d'ensemble d'un grand arbre) ── */
    function gpMinimap(){
        const layout=$('#workspace .graph-layout'),stage=$('#workspace .tree-stage'),layer=$('#workspace .tree-zoom-layer');
        $('#workspace .gp-minimap')?.remove();
        if(!layout||!stage||!layer)return;
        const box=document.createElement('div');box.className='gp-minimap';box.dataset.gpMinimap='';box.style.cssText='position:absolute;right:14px;bottom:14px;z-index:8';
        box.innerHTML=`<canvas aria-label="${escapeHtml(i18n('Vue d’ensemble : glisse le cadre pour te déplacer'))}" role="img"></canvas><button type="button" class="gp-mm-toggle" title="${escapeHtml(i18n('Vue d’ensemble'))}" aria-label="${escapeHtml(i18n('Vue d’ensemble'))}">🗺</button>`;
        layout.appendChild(box);
        const cv=box.querySelector('canvas'),ctx=cv.getContext('2d');let rects=null,sizeKey='',k=1;
        const shown=()=>gpGet('genealogie-graph-minimap',true)!==false;
        const draw=()=>{
            if(!box.isConnected)return;
            const W=layer.offsetWidth||1,H=layer.offsetHeight||1,big=W>stage.clientWidth*1.15||H>stage.clientHeight*1.15;
            box.hidden=!big;box.classList.toggle('is-closed',!shown());if(!big||!shown())return;
            k=Math.min(190/W,140/H);cv.width=Math.max(20,Math.round(W*k));cv.height=Math.max(20,Math.round(H*k));
            const key=`${W}x${H}`;
            if(key!==sizeKey||!rects){sizeKey=key;const lr=layer.getBoundingClientRect(),z=1;rects=$$('[data-tree-person], .tree-card, .fan-sector, path[data-person]',layer).slice(0,6000).map(c=>{const r=c.getBoundingClientRect();return [(r.left-lr.left)/z,(r.top-lr.top)/z,r.width,r.height,c.classList.contains('gender-male')?'#7aa7e6':c.classList.contains('gender-female')?'#e690ad':'#b8b8b8'];});}
            ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
            rects.forEach(([x,y,w,h,c])=>{ctx.fillStyle=c;ctx.fillRect(x*k,y*k,Math.max(1,w*k),Math.max(1,h*k));});
            ctx.strokeStyle='#055dff';ctx.lineWidth=2;ctx.fillStyle='rgba(5,93,255,.10)';
            const vx=stage.scrollLeft*k,vy=stage.scrollTop*k,vw=stage.clientWidth*k,vh=stage.clientHeight*k;ctx.fillRect(vx,vy,vw,vh);ctx.strokeRect(vx+1,vy+1,Math.max(2,vw-2),Math.max(2,vh-2));
        };
        let drag=false;const go=e=>{const r=cv.getBoundingClientRect();stage.scrollLeft=(e.clientX-r.left)/k-stage.clientWidth/2;stage.scrollTop=(e.clientY-r.top)/k-stage.clientHeight/2;};
        cv.addEventListener('pointerdown',e=>{drag=true;cv.setPointerCapture(e.pointerId);go(e);});
        cv.addEventListener('pointermove',e=>{if(drag)go(e);});
        cv.addEventListener('pointerup',()=>{drag=false;});
        box.querySelector('.gp-mm-toggle').addEventListener('click',()=>{gpSet('genealogie-graph-minimap',!shown());draw();});
        stage.addEventListener('scroll',()=>requestAnimationFrame(draw),{passive:true});
        if(window.ResizeObserver){const ro=new ResizeObserver(()=>{rects=null;draw();});ro.observe(layer);ro.observe(stage);}
        setTimeout(draw,160);
    }

    /* ── 🖨 Imprimer, ⛶ plein écran ── */
    function gpTarget(){return $('.place-monograph-stage')||$('.stats-stage')||$('.tree-scale-content')?.firstElementChild||$('.tree-stage')||$('#workspace .graph-layout');}
    function gpTitle(){return ($('.stats-title h2')?.textContent||$('.place-monograph-title')?.textContent||[gpViewLabel(),$('.tool-strip .gp-who')?.textContent].filter(Boolean).join(' · ')||i18n('Graphique')).trim();}
    function gpPrint(){
        const t=gpTarget();if(!t){gpToast(i18n('Rien à imprimer.'),'error');return;}
        const clone=t.cloneNode(true);clone.querySelectorAll('.no-export,.graph-export-toolbar,script,.gp-minimap').forEach(n=>n.remove());
        clone.querySelectorAll('img[src]').forEach(img=>{try{img.src=new URL(img.getAttribute('src'),location.href).href;}catch(_){}});
        const css=window.LCNDA_APP.graphExportCss?.()||'',title=escapeHtml(gpTitle());
        const doc=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>${css}@page{margin:10mm}</style></head><body><main class="graph-print-page">${clone.outerHTML}</main></body></html>`;
        const U=window.LCNDA_UI;if(U?.openPrintDialog)U.openPrintDialog({title:gpTitle(),html:doc,orientation:'landscape'});else if(U?.printDocument)U.printDocument(doc);else window.print();
    }
    function gpFull(el){if(!el)return;if(document.fullscreenElement){document.exitFullscreen?.();return;}const r=el.requestFullscreen?.();if(r?.catch)r.catch(()=>el.classList.toggle('is-full'));else if(!r)el.classList.toggle('is-full');}

    /* ── 🧩 grand arbre en feuilles A4/A3 à assembler (F12) ── */
    const COLS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function gpPosterPlan(W,H,pageMm,{cols=3,overlap=10,margin=8}={}){
        const [pw,ph]=pageMm,aw=pw-2*margin,ah=ph-2*margin,o=Math.max(0,Math.min(Number(overlap)||0,Math.min(aw,ah)/3)),C=Math.max(1,Math.min(26,Math.round(Number(cols)||1)));
        const posterW=C*aw-(C-1)*o,mmPerPx=posterW/Math.max(1,W),posterH=H*mmPerPx,R=Math.max(1,Math.ceil((posterH-o)/(ah-o)-1e-9));
        return {pw,ph,aw,ah,o,C,R,margin,posterW,posterH,mmPerPx,sheets:Array.from({length:R*C},(_,i)=>{const r=Math.floor(i/C),c=i%C;return {r,c,name:`${COLS[c]}${r+1}`,x0:c*(aw-o),y0:r*(ah-o)};})};
    }
    function gpPosterDoc(choix,src){
        const U=window.LCNDA_UI,W=src.w,H=src.h,plan=gpPosterPlan(W,H,choix.pageMm||[210,297],{cols:choix.cols,overlap:choix.overlap});
        const PX=96/25.4,k=plan.mmPerPx*PX,m=plan.margin,o=plan.o,r1=v=>Math.round(v*100)/100;
        const content=(x0,y0)=>`<div class="gpp-win" style="left:${m}mm;top:${m}mm;width:${r1(plan.aw)}mm;height:${r1(plan.ah)}mm"><div class="gpp-src" style="left:${r1(-x0)}mm;top:${r1(-y0)}mm;width:${W}px;height:${H}px;transform:scale(${r1(k*1e4)/1e4})">${src.html}</div></div>`;
        const pages=[];
        if(choix.map!==false){
            const cell=Math.min((plan.pw-30)/plan.C,(plan.ph-80)/plan.R),gw=cell*plan.C,gh=cell*plan.R,th=Math.min(gw/W,gh/H)*PX;
            pages.push({html:`<div class="gpp-map"><h1>${escapeHtml(i18n('Plan d’assemblage'))}</h1><p>${escapeHtml(i18n('{n} feuilles : {c} en largeur, {r} en hauteur. Affiche finie : {w} × {h} cm.',{n:plan.C*plan.R,c:plan.C,r:plan.R,w:Math.round(plan.posterW/10),h:Math.round(plan.posterH/10)}))}</p>
                <div class="gpp-grid" style="width:${r1(gw)}mm;height:${r1(gh)}mm;grid-template-columns:repeat(${plan.C},1fr);grid-template-rows:repeat(${plan.R},1fr)"><div class="gpp-thumb" style="width:${W}px;height:${H}px;transform:scale(${r1(th*1e4)/1e4})">${src.html}</div>${plan.sheets.map(s=>`<span>${s.name}</span>`).join('')}</div>
                <ol class="gpp-steps"><li>${escapeHtml(i18n('Imprime à 100 % (sans « ajuster à la page »).'))}</li><li>${escapeHtml(i18n('Pose les feuilles dans l’ordre du plan : A1 en haut à gauche.'))}</li><li>${escapeHtml(i18n('Sur chaque feuille qui n’est pas dans la première colonne ou la première rangée, coupe la marge blanche le long du trait ✂.'))}</li><li>${escapeHtml(i18n('Pose-la sur sa voisine jusqu’au pointillé, en faisant coïncider les croix ⊕, puis colle.'))}</li></ol></div>`});
        }
        plan.sheets.forEach(s=>{
            const marks=choix.marks!==false;let h=content(s.x0,s.y0);
            const right=s.c<plan.C-1,bottom=s.r<plan.R-1,left=s.c>0,top=s.r>0;
            if(right)h+=`<div class="gpp-ov gpp-ov-r" style="left:${r1(m+plan.aw-o)}mm;top:${m}mm;width:${r1(o)}mm;height:${r1(plan.ah)}mm"></div>`;
            if(bottom)h+=`<div class="gpp-ov gpp-ov-b" style="left:${m}mm;top:${r1(m+plan.ah-o)}mm;width:${r1(plan.aw)}mm;height:${r1(o)}mm"></div>`;
            if(marks){
                if(right)h+=`<div class="gpp-glue-v" style="left:${r1(m+plan.aw-o)}mm;top:${m}mm;height:${r1(plan.ah)}mm"><span>${escapeHtml(i18n('{x} se pose ici',{x:`${COLS[s.c+1]}${s.r+1}`}))}</span></div>`;
                if(bottom)h+=`<div class="gpp-glue-h" style="top:${r1(m+plan.ah-o)}mm;left:${m}mm;width:${r1(plan.aw)}mm"><span>${escapeHtml(i18n('{x} se pose ici',{x:`${COLS[s.c]}${s.r+2}`}))}</span></div>`;
                if(left)h+=`<div class="gpp-cut-v" style="left:${m}mm;top:0;height:${plan.ph}mm"><span>✂</span></div>`;
                if(top)h+=`<div class="gpp-cut-h" style="top:${m}mm;left:0;width:${plan.pw}mm"><span>✂</span></div>`;
                const cross=(x,y)=>`<div class="gpp-cross" style="left:${r1(x)}mm;top:${r1(y)}mm"></div>`;
                [.25,.75].forEach(f=>{if(right)h+=cross(m+plan.aw-o/2,m+plan.ah*f);if(left)h+=cross(m+o/2,m+plan.ah*f);if(bottom)h+=cross(m+plan.aw*f,m+plan.ah-o/2);if(top)h+=cross(m+plan.aw*f,m+o/2);});
            }
            const where=[left?i18n('à gauche : {x}',{x:`${COLS[s.c-1]}${s.r+1}`}):'',top?i18n('au-dessus : {x}',{x:`${COLS[s.c]}${s.r}`}):''].filter(Boolean).join(' · ');
            h+=`<div class="gpp-label" style="left:${m}mm;bottom:2mm"><b>${s.name}</b> · ${escapeHtml(i18n('rangée {r}, colonne {c}',{r:s.r+1,c:s.c+1}))}${where?` · ${escapeHtml(where)}`:''} · ${escapeHtml(src.title)}</div>`;
            pages.push({html:h});
        });
        const css=`${window.LCNDA_APP.graphExportCss?.()||''}
            .k-sheet{position:relative}.gpp-win{position:absolute;overflow:hidden}.gpp-src{position:absolute;transform-origin:0 0}.gpp-src .tree-scale-content,.gpp-src>*{position:static!important;transform:none!important}
            .gpp-ov{position:absolute;background:repeating-linear-gradient(45deg,rgba(0,0,0,.05) 0 3mm,transparent 3mm 6mm);pointer-events:none}
            .gpp-glue-v,.gpp-glue-h{position:absolute;border:0 dashed #555}.gpp-glue-v{border-left-width:.35mm}.gpp-glue-h{border-top-width:.35mm}
            .gpp-glue-v span{position:absolute;top:2mm;left:1mm;font:7pt system-ui;background:#fff;padding:0 1mm;white-space:nowrap}.gpp-glue-h span{position:absolute;left:2mm;top:1mm;font:7pt system-ui;background:#fff;padding:0 1mm}
            .gpp-cut-v,.gpp-cut-h{position:absolute;border:0 solid #c92a2a}.gpp-cut-v{border-left-width:.25mm}.gpp-cut-h{border-top-width:.25mm}.gpp-cut-v span,.gpp-cut-h span{position:absolute;font:9pt system-ui;color:#c92a2a;background:#fff}.gpp-cut-v span{top:1mm;left:-2.2mm}.gpp-cut-h span{left:1mm;top:-2.6mm}
            .gpp-cross{position:absolute;width:6mm;height:6mm;margin:-3mm 0 0 -3mm;border-radius:50%;border:.3mm solid #111;background:linear-gradient(#111,#111) center/100% .3mm no-repeat,linear-gradient(#111,#111) center/.3mm 100% no-repeat}
            .gpp-label{position:absolute;font:7.5pt system-ui;color:#333}
            .gpp-map{padding:12mm;font:10pt system-ui;color:#111}.gpp-map h1{font-size:16pt;margin:0 0 3mm}.gpp-grid{position:relative;display:grid;border:.4mm solid #111;margin:4mm 0;overflow:hidden}.gpp-grid span{position:relative;border:.2mm dashed #555;display:grid;place-items:center;font:700 14pt system-ui;color:#055dff;text-shadow:0 0 2px #fff,0 0 4px #fff}.gpp-thumb{position:absolute;left:0;top:0;transform-origin:0 0;opacity:.45}.gpp-thumb>*{position:static!important;transform:none!important}.gpp-steps{margin:3mm 0 0 5mm;padding:0}`;
        return U.printSheets({title:src.title,css,pages,choix,pad:0});
    }
    function gpPosterSource(){
        const content=$('.tree-scale-content'),el=content?.firstElementChild;if(!el)return null;
        const clone=el.cloneNode(true);clone.querySelectorAll('.no-export,.graph-export-toolbar,script,.tree-card-unknown,.tree-continuation').forEach(n=>n.remove());
        clone.querySelectorAll('img[src]').forEach(img=>{try{img.src=new URL(img.getAttribute('src'),location.href).href;}catch(_){}});
        clone.querySelectorAll('ul[hidden]').forEach(n=>n.remove());
        return {html:clone.outerHTML,w:Math.max(200,el.scrollWidth||el.offsetWidth),h:Math.max(120,el.scrollHeight||el.offsetHeight),title:gpTitle()};
    }
    function gpPoster(){
        const U=window.LCNDA_UI,src=gpPosterSource();
        if(!src){gpToast(i18n('Affiche d’abord un arbre.'),'error');return;}
        if(!U?.openPrintDialog||!U.printSheets){gpToast(i18n('L’impression en feuilles n’est pas disponible ici.'),'error');return;}
        U.openPrintDialog({title:i18n('Grand arbre à assembler'),icon:'🧩',key:'gp-poster',paper:'A4',papers:['A4','A3'],orientation:'portrait',photos:false,
            info:i18n('L’arbre est découpé en feuilles qui se recouvrent un peu : coupe, pose sur la voisine en faisant coïncider les croix, colle.'),
            options:[{key:'cols',type:'number',label:i18n('Feuilles en largeur'),value:3,min:1,max:12,step:1},{key:'overlap',type:'number',label:i18n('Recouvrement'),unit:'mm',value:10,min:0,max:30,step:1},{key:'map',label:i18n('Plan d’assemblage en première page'),checked:true},{key:'marks',label:i18n('Repères de collage (✂, pointillés, croix)'),checked:true}],
            html:choix=>gpPosterDoc(choix,src)});
    }

    /* ── 🧮 statistiques : voir les chiffres, ↔ comparer deux statistiques ── */
    function gpStatsParams(over={}){
        const supportsGender=!['sex_distribution','children_per_family'].includes(state.graphStatsType),rules=(state.graphStatsRules||[]).filter(r=>r&&r.field);
        const p={type:state.graphStatsType,year_from:state.graphStatsYearFrom||undefined,year_to:state.graphStatsYearTo||undefined,gender:supportsGender?(state.graphStatsGender||undefined):undefined,sosa_root_id:state.currentPersonId||undefined,kind:window.LCNDA_APP.baseMode?.()==='breeding'?'animal':undefined,def:rules.length?JSON.stringify({rules}):undefined,...over};
        Object.keys(p).forEach(k=>{if(p[k]===undefined||p[k]==='')delete p[k];});return p;
    }
    const gpStatsPlain=()=>{const t=String(state.graphStatsType||'');return t&&!t.startsWith('cw_')&&t!=='saint_names'&&!window.LCNDA_EXT?.graphStats?.[t];};
    const gpCsvCell=v=>{const s=String(v??'');return /[;"\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
    function gpDecorateStats(){
        const stage=$('#workspace .stats-stage'),head=stage?.querySelector('.stats-title');if(!head||stage.querySelector('[data-gp-stat-tools]')||!gpStatsPlain())return;
        const bar=document.createElement('div');bar.className='gp-stat-tools no-export';bar.dataset.gpStatTools='';
        bar.innerHTML=`<button type="button" class="button small secondary" data-gp-numbers aria-expanded="false">${escapeHtml(i18n('🧮 Voir les chiffres'))}</button><button type="button" class="button small secondary" data-gp-compare aria-expanded="false">${escapeHtml(i18n('↔ Comparer'))}</button>`;
        head.after(bar);const out=document.createElement('div');out.className='gp-stat-out';bar.after(out);
        bar.querySelector('[data-gp-numbers]').addEventListener('click',async e=>{const b=e.currentTarget,open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));bar.querySelector('[data-gp-compare]').setAttribute('aria-expanded','false');out.innerHTML=open?window.LCNDA_UI?.spinner?.(i18n('Calcul…'),{inline:true})||'':'';if(open)await gpNumbers(out);});
        bar.querySelector('[data-gp-compare]').addEventListener('click',e=>{const b=e.currentTarget,open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));bar.querySelector('[data-gp-numbers]').setAttribute('aria-expanded','false');out.innerHTML='';if(open)gpComparePanel(out);});
    }
    async function gpNumbers(out){
        let data;try{data=await api('graph_stats',gpStatsParams());}catch(error){out.innerHTML=window.LCNDA_UI?.notice?.('error',error.message)||escapeHtml(error.message);return;}
        const rows=data.rows||[],hasGen=rows.some(r=>r.generation),hasCount=rows.some(r=>r.count!=null&&r.count!==r.value),hasUnit=rows.some(r=>r.unit);
        const head=[...(hasGen?[i18n('Groupe')]:[]),i18n('Libellé'),i18n('Valeur'),...(hasUnit?[i18n('Unité')]:[]),...(hasCount?[i18n('Nombre')]:[])];
        const line=r=>[...(hasGen?[r.generation||'']:[]),r.label??'',r.value??'',...(hasUnit?[r.unit||'']:[]),...(hasCount?[r.count??'']:[])];
        out.innerHTML=`<section class="gp-numbers"><header><b>${escapeHtml(i18n('Les chiffres : {t}',{t:data.title||''}))}</b><span class="muted">${escapeHtml(plural(rows.length,'ligne'))}</span><span class="spacer"></span><button type="button" class="button small secondary" data-gp-copy>${escapeHtml(i18n('⧉ Copier'))}</button><button type="button" class="button small secondary" data-gp-csv>${escapeHtml(i18n('⤓ CSV'))}</button></header>
            <div class="gp-numbers-scroll"><table class="data-table"><thead><tr>${head.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${line(r).map((v,i)=>`<td${typeof v==='number'||/^-?\d+([.,]\d+)?$/.test(String(v))?' class="num"':''}>${escapeHtml(typeof v==='number'?v.toLocaleString('fr-FR'):String(v))}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${head.length}">${escapeHtml(i18n('Aucune donnée.'))}</td></tr>`}</tbody></table></div></section>`;
        const tsv=[head,...rows.map(line)].map(r=>r.join('\t')).join('\n');
        out.querySelector('[data-gp-copy]').addEventListener('click',()=>gpCopy(tsv));
        out.querySelector('[data-gp-csv]').addEventListener('click',()=>{const csv='﻿'+[head,...rows.map(line)].map(r=>r.map(gpCsvCell).join(';')).join('\r\n'),a=document.createElement('a');a.download=`${(data.title||'statistique').replace(/[\\/:*?"<>|]+/g,'-')}.csv`;a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);});
    }
    function gpComparePanel(out){
        const c=gpGet('genealogie-stats-compare',{how:'periods',a1:'1700',a2:'1799',b1:'1800',b2:'1899'});
        const how=c.how==='genders'?'genders':'periods';
        out.innerHTML=`<section class="gp-compare"><header><b>${escapeHtml(i18n('↔ Comparer deux statistiques'))}</b><label>${escapeHtml(i18n('Comparer'))} <select data-gp-cmp-how><option value="periods" ${how==='periods'?'selected':''}>${escapeHtml(i18n('deux périodes'))}</option><option value="genders" ${how==='genders'?'selected':''}>${escapeHtml(i18n('les hommes et les femmes'))}</option></select></label>
            ${how==='periods'?`<span class="gp-cmp-range"><b>A</b> <input data-gp-cmp="a1" inputmode="numeric" maxlength="4" value="${escapeHtml(c.a1||'')}" placeholder="${escapeHtml(i18n('Année'))}"> – <input data-gp-cmp="a2" inputmode="numeric" maxlength="4" value="${escapeHtml(c.a2||'')}" placeholder="${escapeHtml(i18n('Année'))}"></span><span class="gp-cmp-range"><b>B</b> <input data-gp-cmp="b1" inputmode="numeric" maxlength="4" value="${escapeHtml(c.b1||'')}" placeholder="${escapeHtml(i18n('Année'))}"> – <input data-gp-cmp="b2" inputmode="numeric" maxlength="4" value="${escapeHtml(c.b2||'')}" placeholder="${escapeHtml(i18n('Année'))}"></span>`:''}
            <button type="button" class="button small" data-gp-cmp-go>${escapeHtml(i18n('Comparer'))}</button></header><div class="gp-compare-body"></div></section>`;
        const save=()=>{const v={...c,how:out.querySelector('[data-gp-cmp-how]').value};out.querySelectorAll('[data-gp-cmp]').forEach(i=>{v[i.dataset.gpCmp]=i.value.replace(/\D/g,'').slice(0,4);});gpSet('genealogie-stats-compare',v);return v;};
        out.querySelector('[data-gp-cmp-how]').addEventListener('change',()=>{save();gpComparePanel(out);});
        out.querySelector('[data-gp-cmp-go]').addEventListener('click',()=>gpCompareRun(out.querySelector('.gp-compare-body'),save()));
        gpCompareRun(out.querySelector('.gp-compare-body'),c.how===how?c:{...c,how});
    }
    async function gpCompareRun(body,c){
        body.innerHTML=window.LCNDA_UI?.spinner?.(i18n('Calcul…'),{inline:true})||'';
        const sides=c.how==='genders'?[[i18n('Hommes'),{gender:'male'}],[i18n('Femmes'),{gender:'female'}]]:[[`A · ${c.a1||'…'}–${c.a2||'…'}`,{year_from:c.a1||undefined,year_to:c.a2||undefined}],[`B · ${c.b1||'…'}–${c.b2||'…'}`,{year_from:c.b1||undefined,year_to:c.b2||undefined}]];
        let res;try{res=await Promise.all(sides.map(([,o])=>api('graph_stats',gpStatsParams(o))));}catch(error){body.innerHTML=window.LCNDA_UI?.notice?.('error',error.message)||escapeHtml(error.message);return;}
        const keyOf=r=>`${r.generation?r.generation+' · ':''}${r.label??''}`;
        const labels=[];const seen=new Set();res.forEach(d=>(d.rows||[]).forEach(r=>{const k=keyOf(r);if(!seen.has(k)){seen.add(k);labels.push(k);}}));
        const val=(d,k)=>Number((d.rows||[]).find(r=>keyOf(r)===k)?.value)||0;
        const histo=res[0]?.kind==='histogram';
        const order=histo?labels:[...labels].sort((x,y)=>(val(res[1],y)+val(res[0],y))-(val(res[1],x)+val(res[0],x)));
        const shown=order.slice(0,40),max=Math.max(1,...shown.flatMap(k=>res.map(d=>val(d,k))));
        const colors=getStatsColors();
        body.innerHTML=`<p class="muted">${escapeHtml(i18n('Même échelle des deux côtés (le plus grand = {m}).',{m:max.toLocaleString('fr-FR')}))}${order.length>shown.length?' '+escapeHtml(i18n('Les {n} premiers.',{n:shown.length})):''}</p><div class="gp-compare-grid">${res.map((d,i)=>`<section><h3 style="color:${colors[i%colors.length]}">${escapeHtml(sides[i][0])}</h3><small class="muted">${escapeHtml(plural((d.rows||[]).reduce((s,r)=>s+(Number(r.value)||0),0),'élément compté','éléments comptés'))}</small><div class="stats-chart compact">${shown.map(k=>{const v=val(d,k);return `<div class="stats-chart-row"><span class="stats-chart-label" title="${escapeHtml(k)}">${escapeHtml(k)}</span><span class="stats-chart-track"><span class="stats-chart-bar" style="width:${v?Math.max(1,Math.round(v/max*100)):0}%;background:${colors[i%colors.length]}"></span></span><strong class="stats-chart-value">${v.toLocaleString('fr-FR')}</strong></div>`;}).join('')}</div></section>`).join('')}</div>`;
    }

    /* ── branchement après chaque dessin ── */
    function gpDecorate(){
        if(state.module!=='graphiques')return;
        const strip=$('#workspace .graph-layout > .tool-strip');
        if(strip&&!strip.querySelector('[data-gp-tools]')){
            const eb=strip.querySelector('.eyebrow');if(eb&&!eb.classList.contains('gp-where')&&!/^GRAPHIQUES/i.test(eb.textContent.trim())){eb.textContent=`${i18n('GRAPHIQUES')} · ${eb.textContent.trim()}`;eb.classList.add('gp-where');}
            const tools=document.createElement('span');tools.className='gp-tools';tools.dataset.gpTools='';
            const tree=!!$('#workspace .tree-scale-content')?.firstElementChild;
            tools.innerHTML=`${tree?`<button type="button" class="button small secondary" data-gp-poster title="${escapeHtml(i18n('Imprimer l’arbre en grand, sur plusieurs feuilles A4 ou A3 à assembler'))}">${escapeHtml(i18n('🧩 Grand format à assembler'))}</button>`:''}<button type="button" class="button small secondary" data-gp-print title="${escapeHtml(i18n('Imprimer ce graphique (⌘P)'))}">${escapeHtml(i18n('🖨 Imprimer'))}</button>${gpKiosk()?'':`<button type="button" class="button small secondary gp-edit" data-gp-save>${escapeHtml(i18n('💾 Enregistrer la vue'))}</button>`}<button type="button" class="icon-button" data-gp-full title="${escapeHtml(i18n('Plein écran'))}" aria-label="${escapeHtml(i18n('Plein écran'))}">⛶</button>`;
            const exp=strip.querySelector('.graph-export-toolbar');if(exp)exp.after(tools);else strip.appendChild(tools);
            tools.querySelector('[data-gp-poster]')?.addEventListener('click',gpPoster);
            tools.querySelector('[data-gp-print]').addEventListener('click',gpPrint);
            tools.querySelector('[data-gp-save]')?.addEventListener('click',saveGraphView);
            tools.querySelector('[data-gp-full]').addEventListener('click',()=>gpFull($('#workspace .graph-layout')));
        }
        gpDecorateStats();
    }
    function gpAfterRender(){
        if(state.module!=='graphiques')return;
        gpDecorate();
        $('#gp-portraits')?.addEventListener('change',async e=>{gpSet('genealogie-tree-portraits',e.target.checked);await renderGraph();});
        $('#gp-marks')?.addEventListener('change',e=>{gpSet('genealogie-graph-marks',e.target.value);gpApplyMarks();});
        $('#gp-unhide')?.addEventListener('click',()=>{gpHidden.clear();gpApplyHidden();});
        $$('#workspace [data-tree-add-parent]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();gpAddRelation(Number(b.dataset.treeAddParent),'parent');}));
        if($('#workspace .tree-stage')){gpApplyHidden();gpApplyMarks();gpMinimap();}
        // 🧭 « Ton lien avec… » (app.js paDecorateKin(root)) : aussi dans les cases des arbres ascendant et descendant
        const kinRoot=$('#workspace .tree-stage')||$('#workspace .graph-layout');if(kinRoot)window.LCNDA_APP?.decorateKinship?.(kinRoot);
    }
    const gpBoot=()=>{
        const ws=$('#workspace');if(!ws)return;
        new MutationObserver(()=>{if(state.module==='graphiques')queueMicrotask(gpDecorate);}).observe(ws,{childList:true});
    };
    /* 🖱 clic droit d'une case : nos entrées d'abord ; si 🛡 heritage-preuve.js ouvre aussi son menu (dossier de preuve, solidité du lien),
       ses entrées viennent à la suite dans le même menu (un seul menu, K14) */
    window.addEventListener('contextmenu',e=>{
        const UI=window.LCNDA_UI;
        if(state.module!=='graphiques'||e.shiftKey||!UI?.contextMenu)return;
        const card=e.target.closest?.('#workspace .graph-layout [data-tree-person]');if(!card||card.matches('[data-tree-add-parent]'))return;
        e.preventDefault();
        const mine=gpCardMenu(card),orig=UI.contextMenu,at={clientX:e.clientX,clientY:e.clientY,preventDefault(){}};
        let used=false;
        UI.contextMenu=(ev,items,o)=>{UI.contextMenu=orig;used=true;const more=(items||[]).filter(it=>!(it&&it!=='-'&&/^Ouvrir la fiche$/.test(String(it.label||''))));return orig(ev,[...mine,...(more.length?['-',...more]:[])],o);};
        setTimeout(()=>{if(!used){UI.contextMenu=orig;orig(at,mine,{title:(card.querySelector('strong')?.textContent||'').trim()});}},0);
    },true);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',gpBoot);else gpBoot();
    /* ⌨ ⌘+ ⌘− zoomer, ⌘0 taille réelle, ↑ ↓ une génération de plus ou de moins, ⌘P imprimer (seulement dans Graphiques, hors champ et hors fenêtre) */
    window.addEventListener('keydown',e=>{
        if(state.module!=='graphiques'||!$('#workspace .graph-layout')||document.querySelector('dialog[open]')||e.altKey)return;
        if(e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
        const mod=e.metaKey||e.ctrlKey,k=e.key,click=sel=>{const b=$(sel);if(b){b.click();return true;}return false;};
        let done=false;
        if(mod&&(k==='+'||k==='='))done=click('#graph-zoom-in');
        else if(mod&&(k==='-'||k==='_'))done=click('#graph-zoom-out');
        else if(mod&&k==='0')done=click('#graph-reset-zoom');
        else if(mod&&k.toLowerCase()==='p'&&!e.shiftKey){gpPrint();done=true;}
        else if(!mod&&!e.shiftKey&&(k==='ArrowUp'||k==='ArrowDown')){const sel=$('#graph-depth');if(sel){const n=Math.max(2,Math.min(20,Number(sel.value)+(k==='ArrowUp'?1:-1)));if(n!==Number(sel.value)){sel.value=String(n);sel.dispatchEvent(new Event('change',{bubbles:true}));}done=true;}}
        if(done){e.preventDefault();e.stopImmediatePropagation();}
    },true);
    document.addEventListener('fullscreenchange',()=>{if(state.module==='graphiques')$('#graph-reset-zoom')&&requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));});
    window.LCNDA_GRAPH_POSTER={plan:gpPosterPlan}; // pour les essais (tests/test-audit-cartes.js)

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderGraph, renderGraphSidebar, treeHtml}); // treeHtml : aussi pour les aperçus de Designs au choix (A5)
    if (state.module === 'graphiques' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
