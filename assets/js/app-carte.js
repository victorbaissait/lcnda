/* LCNDA — 🗺️ Carte (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent,
 * et les outils de carte partagés avec le tableau de bord : projection lngToX/latToY…, personnes des parcours).
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const {$, $$, api, confirmBox, plural, applyDesign, orderedMapTypes, empty, escapeHtml, isUsableMapCoord, latToY, lngToX, mapBackgroundSelectHtml, mapBackgroundValue, mapRouteColor, mapTileUrl, openViewDialog, persistUiState, personName, placeDisplay, readDesignSettings, reloadBootstrap, renderSidebar, routePeopleSelection, savedView, setModule, setupMapRoutePersonControls, setupMapSurnameAutocomplete, setupSavedViewsDrag, sidebarSignal, sideButton, state, xToLng, years, yToLat} = window.LCNDA_APP;
    function renderMapSidebar(content, footer) {
        const views=state.bootstrap.savedViews.filter(view=>view.module==='map');
        content.innerHTML=`<div class="segmented"><button data-map-tab="types" class="${state.mapTab==='types'?'is-active':''}">Cartes</button><button data-map-tab="saved" class="${state.mapTab==='saved'?'is-active':''}">Enregistrées</button></div>
        ${state.mapTab==='types'?`<div class="side-menu">${orderedMapTypes().map(([v,i,l])=>sideButton(v,i,l,state.mapTag)).join('')}</div><div class="section-label">Mode</div><div class="side-menu">${sideButton('standard','A','Carte',state.mapMode)}${sideButton('overlay','B','Superposition',state.mapMode)}${sideButton('timeline','C','Animation',state.mapMode)}${sideButton('life','D','Itinéraire',state.mapMode)}${sideButton('cemetery','E','Cimetières',state.mapMode)}${window.LCNDA_PHOTOMAPS?sideButton('photos','H','📸 Cartes de photos',state.mapMode):''}${window.LCNDA_EXT?.mesCartes?sideButton('mine','I','🗺 Mes cartes',state.mapMode):''}${window.LCNDA_EXT?.lifeMap?'<button class="side-menu-item" type="button" data-open-life-map title="Tous les lieux de la vie d’une personne, dans l’ordre, animés (et en vidéo)"><span class="side-number">I</span>🗺 Carte de la vie</button>':''}</div><div class="section-label">Affichage</div><div class="side-menu">${sideButton('markers','F','Marqueurs',state.mapDisplay)}${sideButton('heat','G','Carte thermique',state.mapDisplay)}${mapOptButtonsHtml()}</div>`:`<div class="saved-list">${views.map(view=>savedView(view)).join('')}</div>`}`;
        footer.innerHTML=''; // 💾 Enregistrer la vue : dans la barre d'outils de la carte (même place que Graphiques)
        if(state.mapTab==='types'&&state.mapMode==='photos')window.LCNDA_PHOTOMAPS?.renderCarteSidebar?.(content); // 📸 heritage-photomaps.js : la liste des cartes de photos
        if(state.mapTab==='types'&&state.mapMode==='mine')window.LCNDA_EXT?.mesCartes?.sidebar?.(content); // 🗺 heritage-cartes-perso.js : mes cartes
        content.addEventListener('click',async event=>{
            const tab=event.target.closest('[data-map-tab]');if(tab){state.mapTab=tab.dataset.mapTab;renderSidebar();return;}
            const opt=event.target.closest('[data-map-opt]');if(opt){const k=opt.dataset.mapOpt,on=!mapOpts()[k];setMapOpt(k,on);renderSidebar();if(k==='gravity'&&on)await loadGravity();drawMap();return;}
            const more=event.target.closest('[data-view-more]');if(more){event.stopPropagation();const view=views.find(v=>Number(v.id)===Number(more.dataset.viewMore));if(view)UI().menuAt?.(more,savedViewMenu(view));return;}
            if(event.target.closest('[data-open-life-map]')){window.LCNDA_EXT?.lifeMap?.open?.((routePeopleSelection()[0]?.id)||Number(state.currentPersonId)||0);return;} // 🗺 heritage-carte-vie.js
            const item=event.target.closest('[data-side-value]');if(item){const value=item.dataset.sideValue;if(['markers','heat'].includes(value))state.mapDisplay=value;else if(['standard','overlay','timeline','life','cemetery','photos','mine'].includes(value))state.mapMode=value;else state.mapTag=value;persistUiState();renderSidebar();await renderMap();return;}
            const saved=event.target.closest('[data-view-id]');if(saved&&!event.target.closest('.saved-delete')&&!event.target.closest('.saved-grip')&&!event.target.closest('.saved-edit')){const view=views.find(v=>Number(v.id)===Number(saved.dataset.viewId));if(view)await applyMapView(view);}
            const edit=event.target.closest('[data-edit-view]');if(edit){event.stopPropagation();const view=views.find(v=>Number(v.id)===Number(edit.dataset.editView));if(view)openViewDialog(view.module,view.config||{},view.id,view.name);return;}
            const del=event.target.closest('[data-delete-view]');if(del){event.stopPropagation();await deleteMapView(Number(del.dataset.deleteView));return;}
        },{signal:sidebarSignal()});
        decorateSavedViews(content,views);
        async function applyMapView(view){if(view){state.mapTag=view.config.event||'all';state.mapDisplay=view.config.display||'markers';state.mapMode=view.config.mode||'standard';state.mapZoom=Number(view.config.zoom||state.mapZoom||6);state.mapYearFrom=view.config.yearFrom??'';state.mapYearTo=view.config.yearTo??'';state.mapGender=view.config.gender??'';state.mapSurname=view.config.surname??'';state.mapSurnameMode=view.config.surnameMode||'last_name';state.mapAgeFrom=view.config.ageFrom??'';state.mapAgeTo=view.config.ageTo??'';state.mapTimelineYear=view.config.timelineYear??'';state.mapRoutePeople=Array.isArray(view.config.routePeople)?view.config.routePeople:[];state.mapLocationMode=view.config.locationMode||'city';state.mapOverlayBg=view.config.overlayBg||'cassini';state.mapOverlayOpacity=Number.isFinite(Number(view.config.overlayOpacity))?Number(view.config.overlayOpacity):50;setLineage(view.config.lineage&&typeof view.config.lineage==='object'?view.config.lineage:LIN_DEF);persistUiState();renderSidebar();await renderMap();}}
        /** R11 : ⋯ et clic droit sur une vue enregistrée — Ouvrir · Modifier · — · 🗑 Supprimer (sans modification en mode consultation) */
        function savedViewMenu(view){return [{icon:'↗',label:i18n('Ouvrir'),run:()=>applyMapView(view)},...(kiosk()?[]:[{icon:'✎',label:i18n('Modifier'),run:()=>openViewDialog(view.module,view.config||{},view.id,view.name)},{icon:'🗑',label:i18n('Supprimer'),danger:true,run:()=>deleteMapView(Number(view.id))}])];}
        function decorateSavedViews(box,list){$$('.saved-list [data-view-id]',box).forEach(row=>{const view=list.find(v=>Number(v.id)===Number(row.dataset.viewId));if(!view)return;if(!row.querySelector('[data-view-more]')){const b=document.createElement('button');b.type='button';b.className='saved-more';b.dataset.viewMore=String(view.id);b.title=i18n('Plus d’actions');b.setAttribute('aria-label',i18n('Plus d’actions'));b.textContent='⋯';row.appendChild(b);}row.addEventListener('contextmenu',e=>UI().contextMenu?.(e,savedViewMenu(view)));});}
        setupSavedViewsDrag($('#sidebar-content .saved-list'), async orderedIds => {
            for(let i=0;i<orderedIds.length;i++){await api('set_view_order',{},{method:'POST',body:{id:orderedIds[i],sort_order:(i+1)*10}});}
            await reloadBootstrap();
        });
    }
    /* H7 : supprimée tout de suite, « ↶ Annuler » la remet */
    async function deleteMapView(vid){await window.LCNDA_APP.deleteWithUndo({action:'delete_view',body:{id:vid},type:'view',id:vid,message:'Vue enregistrée supprimée',after:async()=>{await reloadBootstrap();renderSidebar();}});}
    /** 💾 Enregistrer la vue (barre d'outils) : tous les réglages de la carte, filtres de lignée compris */
    function saveMapView(){openViewDialog('map',{event:state.mapTag,display:state.mapDisplay,mode:state.mapMode,zoom:state.mapZoom,yearFrom:state.mapYearFrom,yearTo:state.mapYearTo,gender:state.mapGender,surname:state.mapSurname,surnameMode:state.mapSurnameMode,ageFrom:state.mapAgeFrom,ageTo:state.mapAgeTo,timelineYear:state.mapTimelineYear,routePeople:state.mapRoutePeople,locationMode:state.mapLocationMode,overlayBg:state.mapOverlayBg,overlayOpacity:state.mapOverlayOpacity,lineage:lineage()});}

    function mapPointYearRange(points){
        const years=(points||[]).map(point=>Number(point.year)).filter(isKnownMapYear);
        if(!years.length)return null;
        return {min:Math.min(...years),max:Math.max(...years)};
    }
    function isKnownMapYear(year){year=Number(year);return Number.isFinite(year)&&year>0;}
    function mapRoutePeopleHtml(){
        const selected=routePeopleSelection();
        return `<div class="map-route-people"><span>Personnes</span><div class="map-route-person-chips">${selected.map((person,index)=>`<span class="map-route-chip" style="--route-color:${mapRouteColor(index)}"><i></i>${escapeHtml(person.name||i18n('Personne #{id}',{id:String(person.id)}))}<button type="button" data-remove-route-person="${person.id}" aria-label="${escapeHtml(i18n('Retirer {name}',{name:person.name||i18n('cette personne')}))}">×</button></span>`).join('')||'<em>Aucune personne</em>'}</div><div class="map-route-person-search-wrap" id="map-route-person-search">${window.LCNDA_PICKER?.pickerField({name: 'map_route_person', kind: 'person', placeholder: '＋ Ajouter une personne…'}) || ''}</div></div>`; // menu de choix unique : la personne choisie rejoint le parcours
    }
    function eventRoutePoint(event, person, personIndex){
        const usePrecise=(state.mapLocationMode==='precise'||state.mapLocationMode==='combined')&&event.precise_lat!=null&&event.precise_lon!=null;
        const lat=Number(usePrecise?event.precise_lat:event.latitude),lon=Number(usePrecise?event.precise_lon:event.longitude);
        if(!isKnownMapYear(event.year)||!isUsableMapCoord(lat,lon))return null;
        return {
            ...event,
            latitude:lat,
            longitude:lon,
            name:event.place_name||event.name||'Lieu',
            person_id:person.id,
            first_name:person.first_name,
            middle_name:person.middle_name,
            last_name:person.last_name,
            route_person_name:personName(person),
            route_person_index:personIndex,
            route_color:mapRouteColor(personIndex),
        };
    }
    function routePointsFromPerson(detail, personIndex){
        const person=detail?.person;if(!person)return [];
        return (detail.events||[]).map(event=>eventRoutePoint(event,person,personIndex)).filter(Boolean).sort((a,b)=>(Number(a.year)||99999)-(Number(b.year)||99999)||Number(a.id||0)-Number(b.id||0)).map((point,index)=>({...point,person_route_index:index}));
    }
    async function loadMapRoutePoints(){
        state.mapRoutePoints=[];
        if(state.mapMode!=='life')return;
        const selected=routePeopleSelection();
        if(!selected.length)return;
        const details=await Promise.all(selected.map(async person=>{try{return await api('person',{id:person.id});}catch(_){return null;}}));
        const loadedPeople=[];
        state.mapRoutePoints=details.flatMap((detail,index)=>{
            if(detail?.person)loadedPeople.push({id:Number(detail.person.id),name:personName(detail.person)});
            return routePointsFromPerson(detail,index);
        }).sort((a,b)=>(Number(a.year)||99999)-(Number(b.year)||99999)||Number(a.route_person_index||0)-Number(b.route_person_index||0)||Number(a.id||0)-Number(b.id||0)).map((point,index)=>({...point,route_index:index}));
        if(loadedPeople.length)state.mapRoutePeople=loadedPeople;
        if(state.mapRouteStep!=='all'){
            const maxIndex=Math.max(0,state.mapRoutePoints.length-1);
            state.mapRouteStep=String(Math.max(0,Math.min(maxIndex,Number(state.mapRouteStep)||0)));
        }
    }

    async function renderMap(token=++state.workspaceToken) {
        if(state.mapMode==='photos'){if(window.LCNDA_PHOTOMAPS)return window.LCNDA_PHOTOMAPS.renderCarte(token);state.mapMode='standard';} // 📸 cartes de photos (heritage-photomaps.js)
        if(state.mapMode==='mine'){const mc=window.LCNDA_EXT?.mesCartes;if(!mc)state.mapMode='standard';else if(!(await mc.before(token)))return;} // 🗺 mes cartes (heritage-cartes-perso.js) : la liste, ou une carte ouverte dessinée par ext.mapDraw
        const isCemetery=state.mapMode==='cemetery';
        const waitTimer=setTimeout(()=>{if(token!==state.workspaceToken||state.module!=='carte')return;const st=$('#map-stage');if(st)st.classList.add('is-loading');else $('#workspace').innerHTML=UI().spinner?.(i18n('Chargement de la carte…'))||'';},250); // R10 : l'attente commune (C7)
        if(state.mapTag!=='all'&&!(state.bootstrap?.mapEventTags||[]).some(t=>t.gedcom_tag===state.mapTag))state.mapTag='all';const data=state.mapMode==='mine'?{points:[],total:0}:await api(isCemetery?'cemetery_map':'map',isCemetery?{}:{tag:state.mapTag,limit:20000,year_from:state.mapYearFrom||undefined,year_to:state.mapYearTo||undefined,gender:state.mapGender||undefined,surname:state.mapSurname||undefined,surname_mode:state.mapSurnameMode||'last_name',age_from:state.mapAgeFrom||undefined,age_to:state.mapAgeTo||undefined,location_mode:state.mapLocationMode==='precise'?'precise':'city'});state.mapPoints=(data.points||[]).filter(point=>!(Number(point.is_private)&&document.body.classList.contains('is-kiosk'))); /* 🔒 un événement confidentiel n'est pas montré en consultation */state.mapPointsTotal=Number.isFinite(data.total)?data.total:state.mapPoints.length;
        const lin=lineage();state.mapLineageNote='';
        if(!isCemetery&&state.mapMode!=='mine'&&lineageActive(lin)){try{const keep=await lineageScope(lin);if(keep){state.mapPoints=state.mapPoints.filter(point=>keep.has(Number(point.person_id)));state.mapPointsTotal=state.mapPoints.length;}}catch(error){state.mapLineageNote=error.message||'';}}
        const choices=isCemetery||state.mapMode==='mine'?null:await mapChoices();
        if(mapOpts().gravity)await loadGravity();
        if(!isCemetery)await loadMapRoutePoints();else state.mapRoutePoints=[];
        clearTimeout(waitTimer);
        if(token!==state.workspaceToken||state.module!=='carte')return;
        const design=readDesignSettings(),mapBg=mapBackgroundValue((state.mapMode==='mine'&&state.mapMineBg)||design.mapBackground);
        const yearRange=mapPointYearRange(state.mapPoints);
        if(state.mapMode==='timeline'&&yearRange&&(!state.mapTimelineYear||Number(state.mapTimelineYear)<yearRange.min||Number(state.mapTimelineYear)>yearRange.max))state.mapTimelineYear=String(yearRange.max);
        const routeStepOptions=state.mapRoutePoints.map((point,index)=>`<option value="${index}" ${String(state.mapRouteStep)===String(index)?'selected':''}>${escapeHtml(point.date_text||point.year||'date inconnue')} · ${escapeHtml(point.type_label||'Événement')}</option>`).join('');
        const modeControls=state.mapMode==='timeline'&&yearRange?`<div class="map-mode-controls"><label>Année <input id="map-time-year" type="range" min="${yearRange.min}" max="${yearRange.max}" value="${escapeHtml(state.mapTimelineYear||yearRange.max)}"></label><strong id="map-time-year-label">${escapeHtml(state.mapTimelineYear||yearRange.max)}</strong></div>`:state.mapMode==='life'?`<div class="map-mode-controls map-mode-controls-life">${mapRoutePeopleHtml()}<label>Étape <select id="map-route-step"><option value="all" ${state.mapRouteStep==='all'?'selected':''}>Toutes</option>${routeStepOptions}</select></label><label class="ui-toggle"><input type="checkbox" id="map-route-arrows" ${state.mapRouteArrows?'checked':''}><i></i>Flèches</label>${window.LCNDA_EXT?.lifeMap?'<button type="button" class="button small secondary" data-open-life-map-route title="La même vie, étape par étape, avec la lecture ▶ et la vidéo">▶ Carte de la vie animée</button>':''}${!routePeopleSelection().length?'<em>Ajoute une personne.</em>':(!state.mapRoutePoints.length?'<em>Aucun lieu daté.</em>':'')}</div>`:state.mapMode==='overlay'?`<div class="map-mode-controls map-mode-controls-overlay"><label>Comparer avec <select id="map-overlay-background">${mapBackgroundSelectHtml(mapBackgroundValue(state.mapOverlayBg))}</select></label><label>Opacité <input id="map-overlay-opacity" type="range" min="0" max="100" value="${escapeHtml(String(state.mapOverlayOpacity??50))}"></label><strong id="map-overlay-opacity-label">${escapeHtml(String(state.mapOverlayOpacity??50))}%</strong></div>`:'';
        const cemeteryFilters=state.mapMode==='mine'?'<span class="mcp-strip-slot"></span>':isCemetery?'<span class="muted">Sépultures et cimetières renseignés dans la base.</span>':mapFilterStripHtml(choices);
        const filterPanel=isCemetery||state.mapMode==='mine'?'':mapFilterPanelHtml(choices);
        const unit=isCemetery?'sépulture':'évt';
        $('#workspace').innerHTML=`<section class="map-layout"><div class="tool-strip"><span class="eyebrow map-where">${escapeHtml(i18n('CARTE · {x}',{x:mapModeLabel().toUpperCase()}))}</span><label>Fond <select id="map-background">${mapBackgroundSelectHtml(mapBg)}</select></label><span>${(state.mapPointsTotal||state.mapPoints.length).toLocaleString(window.LCNDA_I18N?.locale?.()||'fr-FR')} ${i18n(unit,{ctx:'carte'})}${(state.mapPointsTotal||0)>state.mapPoints.length?` <small style="opacity:.7">(${plural(state.mapPoints.length,'affiché')})</small>`:''}</span>${cemeteryFilters}${modeControls}<span class="spacer"></span><button class="button small" id="map-france" title="${escapeHtml(i18n('Voir tous les points (⌘0)'))}">Recentrer</button>${mapToolsHtml()}</div>${filterPanel}<div class="map-stage map-bg-${escapeHtml(mapBg)}" id="map-stage"><div class="map-tiles" id="map-tiles"></div><div class="map-tiles map-tiles-overlay" id="map-tiles-overlay" style="opacity:${(Number(state.mapOverlayOpacity??50))/100}"></div><svg class="map-route-layer" id="map-route-layer" aria-hidden="true"></svg><svg class="map-gravity-layer" id="map-gravity-layer" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;overflow:visible"></svg><div class="${state.mapDisplay==='heat'?'heat-layer':'map-marker-layer'}" id="map-overlay"></div><div class="map-legend" id="map-legend" hidden style="position:absolute;left:10px;bottom:26px;z-index:4;pointer-events:none"></div><aside class="map-zone-panel" id="map-zone-panel" style="position:absolute;right:10px;top:10px;z-index:6" hidden aria-label="${escapeHtml(i18n('Dans cette zone'))}"></aside><div class="map-caption">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a> · connexion requise pour les tuiles</div></div></section>`;
        (window.LCNDA_EXT?.mapSetup||[]).forEach(fn=>{try{fn();}catch(error){console.error(error);}});
        bindMapTools(isCemetery);
        if(!state.mapKeepCenter)fitMapToPoints(state.mapMode==='life'?state.mapRoutePoints:state.mapPoints);
        state.mapKeepCenter=false;
        drawMap();
        const timeYear=$('#map-time-year');
        if(timeYear)timeYear.addEventListener('input',event=>{state.mapTimelineYear=event.target.value;$('#map-time-year-label').textContent=event.target.value;persistUiState();drawMap();});
        const routeStep=$('#map-route-step');
        if(routeStep)routeStep.addEventListener('change',event=>{state.mapRouteStep=event.target.value;persistUiState();drawMap();});
        $('[data-open-life-map-route]')?.addEventListener('click',()=>window.LCNDA_EXT?.lifeMap?.open?.((routePeopleSelection()[0]?.id)||Number(state.currentPersonId)||0)); // 🗺 heritage-carte-vie.js
        const routeArrows=$('#map-route-arrows');
        if(routeArrows)routeArrows.addEventListener('change',event=>{state.mapRouteArrows=event.target.checked;persistUiState();drawMap();});
        const overlayBgSelect=$('#map-overlay-background');
        if(overlayBgSelect)overlayBgSelect.addEventListener('change',event=>{state.mapOverlayBg=event.target.value;persistUiState();drawMap();});
        const overlayOpacity=$('#map-overlay-opacity');
        if(overlayOpacity)overlayOpacity.addEventListener('input',event=>{state.mapOverlayOpacity=Number(event.target.value);$('#map-overlay-opacity-label').textContent=event.target.value+'%';const overlayTiles=$('#map-tiles-overlay');if(overlayTiles)overlayTiles.style.opacity=String(Number(event.target.value)/100);persistUiState();});
        setupMapRoutePersonControls();
        $('#map-background').addEventListener('change',event=>{const values=readDesignSettings();values.mapBackground=event.target.value;localStorage.setItem('genealogie-design',JSON.stringify(values));applyDesign();renderMap();});
        const applyMapFilters=()=>{state.mapYearFrom=$('#map-year-from').value;state.mapYearTo=$('#map-year-to').value;state.mapAgeFrom=$('#map-age-from').value;state.mapAgeTo=$('#map-age-to').value;persistUiState();renderMap();};if(!isCemetery&&state.mapMode!=='mine'){['map-year-from','map-year-to','map-age-from','map-age-to'].forEach(id=>{const el=$('#'+id);el.addEventListener('change',applyMapFilters);el.addEventListener('keydown',e=>{if(e.key==='Enter'){el.blur();applyMapFilters();}});});$('#map-gender').addEventListener('change',()=>{state.mapGender=$('#map-gender').value;persistUiState();renderMap();});setupMapSurnameAutocomplete();}
        $('#map-france').addEventListener('click',()=>{fitMapToPoints(state.mapMode==='life'?state.mapRoutePoints:state.mapPoints);persistUiState();drawMap();});
        const mapSurnameMode=$('#map-surname-mode');if(mapSurnameMode)mapSurnameMode.addEventListener('change',event=>{state.mapSurnameMode=event.target.value;persistUiState();renderMap();});const mapLocMode=$('#map-location-mode');if(mapLocMode)mapLocMode.addEventListener('change',event=>{state.mapLocationMode=event.target.value;persistUiState();renderMap();});$('#map-reset')?.addEventListener('click',()=>{setLineage(LIN_DEF);state.mapGender='';state.mapYearFrom='';state.mapYearTo='';state.mapSurname='';state.mapSurnameMode='last_name';state.mapAgeFrom='';state.mapAgeTo='';state.mapLocationMode='city';persistUiState();renderMap();});
        const stage=$('#map-stage');let drag=null;
        stage.addEventListener('pointerdown',event=>{if(event.target.closest('button,a,input'))return;hideMapTooltip();drag={x:event.clientX,y:event.clientY,center:{...state.mapCenter}};stage.setPointerCapture(event.pointerId);});
        stage.addEventListener('pointermove',event=>{if(!drag)return;const scale=256*Math.pow(2,state.mapZoom);state.mapCenter.lon=drag.center.lon-(event.clientX-drag.x)/scale*360;state.mapCenter.lat=drag.center.lat+(event.clientY-drag.y)/scale*260;drawMap();});
        stage.addEventListener('pointerup',()=>drag=null);
        let lastWheel=0;
        stage.addEventListener('wheel',event=>{event.preventDefault();const now=Date.now();if(now-lastWheel<110)return;lastWheel=now;const nextZoom=Math.max(4,Math.min(20,state.mapZoom+(event.deltaY<0?1:-1)));if(nextZoom===state.mapZoom)return;const rect=stage.getBoundingClientRect(),localX=event.clientX-rect.left,localY=event.clientY-rect.top;const oldCenterX=lngToX(state.mapCenter.lon,state.mapZoom),oldCenterY=latToY(state.mapCenter.lat,state.mapZoom);const pointerLon=xToLng(oldCenterX-stage.clientWidth/2+localX,state.mapZoom),pointerLat=yToLat(oldCenterY-stage.clientHeight/2+localY,state.mapZoom);const newCenterX=lngToX(pointerLon,nextZoom)-(localX-stage.clientWidth/2),newCenterY=latToY(pointerLat,nextZoom)-(localY-stage.clientHeight/2);state.mapZoom=nextZoom;state.mapCenter={lon:xToLng(newCenterX,nextZoom),lat:Math.max(-85,Math.min(85,yToLat(newCenterY,nextZoom)))};persistUiState();drawMap();},{passive:false});
    }

    function fitMapToPoints(points){
        const usePreciseCoords=(state.mapLocationMode==='precise'||state.mapLocationMode==='combined');
        let valid=points.map(point=>{
            const usePrecise=usePreciseCoords&&point.precise_lat!=null&&point.precise_lon!=null;
            return {lat:Number(usePrecise?point.precise_lat:point.latitude),lon:Number(usePrecise?point.precise_lon:point.longitude)};
        }).filter(point=>isUsableMapCoord(point.lat,point.lon));
        if(!valid.length){state.mapCenter={lat:46.7,lon:2.3};state.mapZoom=6;return;}
        if(valid.length>25){
            const sortedLat=[...valid].sort((a,b)=>a.lat-b.lat),sortedLon=[...valid].sort((a,b)=>a.lon-b.lon),lo=Math.floor(valid.length*.05),hi=Math.ceil(valid.length*.95)-1;
            const latMin=sortedLat[lo].lat,latMax=sortedLat[hi].lat,lonMin=sortedLon[lo].lon,lonMax=sortedLon[hi].lon;
            valid=valid.filter(point=>point.lat>=latMin&&point.lat<=latMax&&point.lon>=lonMin&&point.lon<=lonMax);
        }
        const lats=valid.map(point=>point.lat),lons=valid.map(point=>point.lon),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
        state.mapCenter={lat:(minLat+maxLat)/2,lon:(minLon+maxLon)/2};
        const stage=$('#map-stage'),width=Math.max(320,stage?.clientWidth||900),height=Math.max(260,stage?.clientHeight||520),padding=190;
        let best=4;
        // Plafond de zoom : 13 en général, 14 en mode lieu précis (points proches mais pas trop zoomé)
        const zoomCap=state.mapLocationMode==='precise'?14:13;
        for(let z=zoomCap;z>=4;z--){
            const x1=lngToX(minLon,z),x2=lngToX(maxLon,z),y1=latToY(maxLat,z),y2=latToY(minLat,z);
            if(Math.abs(x2-x1)<=width-padding&&Math.abs(y2-y1)<=height-padding){best=z;break;}
        }
        state.mapZoom=best;
    }
    function mapDisplayPoints(){
        if(state.mapMode==='life'){
            const step=state.mapRouteStep==='all'?null:Number(state.mapRouteStep);
            return (state.mapRoutePoints||[]).map(point=>{
                let timeClass='';
                if(step!==null&&Number.isFinite(step))timeClass=point.route_index<step?'past':(point.route_index===step?'current':'future');
                return {...point,_timeClass:timeClass};
            });
        }
        if(state.mapMode==='timeline'&&state.mapTimelineYear){
            const year=Number(state.mapTimelineYear);
            return (state.mapPoints||[]).filter(point=>isKnownMapYear(point.year)&&Number(point.year)<=year).map(point=>({...point,_timeClass:Number(point.year)===year?'current':'past'}));
        }
        return state.mapPoints||[];
    }
    function drawMapRoutes(left,top,z,width,height){
        const svg=$('#map-route-layer');if(!svg)return;
        if(state.mapMode!=='life'||!(state.mapRoutePoints||[]).length){svg.innerHTML='';return;}
        svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
        const step=state.mapRouteStep==='all'?null:Number(state.mapRouteStep);
        const points=(state.mapRoutePoints||[]).map(point=>({...point,_x:lngToX(Number(point.longitude),z)-left,_y:latToY(Number(point.latitude),z)-top})).filter(point=>Number.isFinite(point._x)&&Number.isFinite(point._y));
        const paths=Object.values(points.reduce((acc,point)=>{const key=String(point.route_person_index||0);(acc[key]||(acc[key]=[])).push(point);return acc;},{})).map(personPoints=>{
            const visible=personPoints.filter(point=>point._x>-120&&point._x<width+120&&point._y>-120&&point._y<height+120);
            if(visible.length<2)return '';
            const d=visible.map((point,index)=>`${index?'L':'M'} ${point._x.toFixed(1)} ${point._y.toFixed(1)}`).join(' ');
            return `<path class="map-route-path" style="--route-color:${escapeHtml(visible[0].route_color||'var(--ink)')}" d="${d}" ${state.mapRouteArrows?'marker-end="url(#map-route-arrow)"':''}></path>`;
        }).filter(Boolean).join('');
        if(!paths){svg.innerHTML='';return;}
        const marker=state.mapRouteArrows?`<defs><marker id="map-route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z"></path></marker></defs>`:'';
        const current=step!==null&&Number.isFinite(step)&&points[step]?`<circle class="map-route-current" cx="${points[step]._x}" cy="${points[step]._y}" r="14"></circle>`:'';
        svg.innerHTML=`${marker}${paths}${current}`;
    }
    function drawMap(){
        const stage=$('#map-stage');if(!stage)return;const width=stage.clientWidth,height=stage.clientHeight,z=state.mapZoom;
        if(!width||!height){requestAnimationFrame(drawMap);return;}
        const cx=lngToX(state.mapCenter.lon,z),cy=latToY(state.mapCenter.lat,z),left=cx-width/2,top=cy-height/2;
        const minX=Math.floor(left/256),maxX=Math.ceil((left+width)/256),minY=Math.floor(top/256),maxY=Math.ceil((top+height)/256),world=Math.pow(2,z);
        const design=readDesignSettings(),mapBg=mapBackgroundValue((state.mapMode==='mine'&&state.mapMineBg)||design.mapBackground);
        let tiles='';if(mapBg!=='grid')for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){if(y<0||y>=world)continue;const wrapped=((x%world)+world)%world;tiles+=`<img class="map-tile" draggable="false" referrerpolicy="no-referrer" src="${mapTileUrl(mapBg,z,wrapped,y)}" style="left:${x*256-left}px;top:${y*256-top}px" alt="">`;}
        $('#map-tiles').innerHTML=tiles;
        const overlayTilesEl=$('#map-tiles-overlay');
        if(overlayTilesEl){
            if(state.mapMode==='overlay'){
                const overlayBg=mapBackgroundValue(state.mapOverlayBg);
                let overlayTiles='';if(overlayBg!=='grid')for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){if(y<0||y>=world)continue;const wrapped=((x%world)+world)%world;overlayTiles+=`<img class="map-tile" draggable="false" referrerpolicy="no-referrer" src="${mapTileUrl(overlayBg,z,wrapped,y)}" style="left:${x*256-left}px;top:${y*256-top}px" alt="">`;}
                overlayTilesEl.innerHTML=overlayTiles;
                overlayTilesEl.style.opacity=String((Number(state.mapOverlayOpacity??50))/100);
            }else{
                overlayTilesEl.innerHTML='';
            }
        }
        stage.classList.remove('has-tile-error');
        let tileFailures=0;
        const isBelgianHistCart=['ferraris','vandermaelen','popp','frickx','buurtwegen'].includes(mapBg);
        $$('.map-tile',stage).forEach(tile=>tile.addEventListener('error',()=>{tileFailures++;if(tileFailures>3){stage.classList.add('has-tile-error');if(isBelgianHistCart)stage.dataset.tileErrorMsg='Carte historique belge temporairement indisponible (service Digitaal Vlaanderen en panne)';else delete stage.dataset.tileErrorMsg;}},{once:true}));
        drawMapRoutes(left,top,z,width,height);
        (window.LCNDA_EXT?.mapDraw||[]).forEach(fn=>{try{fn({stage,left,top,z,width,height});}catch(error){console.error(error);}});
        const visible=mapDisplayPoints().filter(point=>{const usePrecise=state.mapMode!=='life'&&(state.mapLocationMode==='precise'||state.mapLocationMode==='combined')&&point.precise_lat!=null&&point.precise_lon!=null;const useLat=usePrecise?Number(point.precise_lat):Number(point.latitude);const useLon=usePrecise?Number(point.precise_lon):Number(point.longitude);if(!isUsableMapCoord(useLat,useLon))return false;point._x=lngToX(useLon,z)-left;point._y=latToY(useLat,z)-top;return point._x>-90&&point._x<width+90&&point._y>-90&&point._y<height+90;});
        const groups=Object.values(visible.reduce((acc,point)=>{
            // En mode précis ou combiné : si le point a des coords précises, clé unique par coords précises
            const usePreciseKey=(state.mapLocationMode==='precise'||state.mapLocationMode==='combined')&&point.precise_lat!=null&&point.precise_lon!=null;
            const key=usePreciseKey?`precise:${Number(point.precise_lat).toFixed(6)},${Number(point.precise_lon).toFixed(6)}`:(point.place_id||`${point.latitude},${point.longitude}`);
            if(!acc[key]){
                // Coords du groupe : précises si dispo en mode adéquat, sinon commune
                const grpLat=usePreciseKey?Number(point.precise_lat):Number(point.latitude);
                const grpLon=usePreciseKey?Number(point.precise_lon):Number(point.longitude);
                acc[key]={...point,latitude:grpLat,longitude:grpLon,_groupKey:key,events:[],count:0,_timeClass:point._timeClass||''};
            }
            if(point._timeClass==='current')acc[key]._timeClass='current';
            else if(point._timeClass==='future'&&acc[key]._timeClass!=='current')acc[key]._timeClass='future';
            acc[key].events.push(point);acc[key].count++;return acc;
        },{}));
        // 🔢 regroupement : au zoom faible, les lieux proches deviennent une pastille « 37 » (clic = zoomer dessus)
        const clusters=mapClusters(groups);
        const sampled=clusters?groups:(state.mapDisplay==='markers'&&groups.length>700?groups.filter((_,i)=>i%Math.ceil(groups.length/700)===0):groups);
        const gKey=group=>String(group._groupKey||group.place_id||`${group.latitude},${group.longitude}`);
        const markerHtml=group=>{const kind=state.mapMode!=='life'&&state.mapMode!=='timeline'?groupKind(group):null;return `<button class="map-marker ${state.mapMode==='life'?'is-route':''} ${kind?'is-kind':''} ${group.count>1?'has-count':''} ${group._timeClass?`is-${group._timeClass}`:''}" style="left:${group._x}px;top:${group._y}px;--route-color:${escapeHtml(group.route_color||'var(--blue)')}${kind?`;--kind-color:${kind[2]}`:''}" data-map-group="${escapeHtml(gKey(group))}" aria-label="${escapeHtml(group.name||'Lieu')}">${group.count>1?`<span>${group.count}</span>`:''}</button>`;};
        const clusterHtml=(c,i)=>c.items.length===1?markerHtml(c.items[0]):`<button type="button" class="map-cluster" style="left:${c._x.toFixed(1)}px;top:${c._y.toFixed(1)}px;--kind-color:${groupKind({events:c.items.flatMap(g=>g.events)})[2]}" data-map-cluster="${i}" title="${escapeHtml(i18n('{n} événements dans {p} lieux : clique pour zoomer',{n:c.count,p:c.items.length}))}" aria-label="${escapeHtml(i18n('{n} événements',{n:c.count}))}"><span>${c.count>999?Math.round(c.count/100)/10+' k':c.count}</span></button>`;
        $('#map-overlay').innerHTML=sampled.length?(clusters?clusters.map(clusterHtml).join(''):sampled.map(group=>state.mapDisplay==='heat'?`<span class="heat-spot" style="left:${group._x}px;top:${group._y}px"></span>`:markerHtml(group)).join('')):state.mapMode==='mine'?'':empty('Aucun événement dans cette zone',{icon:'🗺',action:{label:'⤢ Voir tout',attrs:'data-empty-click="#map-france"'}}).replace('class="empty-line"','class="empty-line map-empty-overlay"');
        $$('[data-map-group]').forEach(button=>{const group=sampled.find(g=>gKey(g)===String(button.dataset.mapGroup));button.addEventListener('mouseenter',event=>{showMapTooltip(event,group);});button.addEventListener('click',event=>showMapTooltip(event,group,true));});
        $$('[data-map-cluster]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();zoomOnCluster(clusters[Number(button.dataset.mapCluster)]);}));
        state.mapLastDraw={left,top,z,width,height,visible,groups,clusters,gKey};
        drawGravity(left,top,z,width,height);
        drawLegend(visible);
        scheduleZonePanel();
    }

    function showMapTooltip(event,point,pinned=false){if(!point)return;hideMapTooltip();const tip=document.createElement('div');tip.className=`map-tooltip ${pinned?'is-pinned':''}`;tip.id='map-tooltip';const events=point.events||[point];
        if(point.is_cemetery){tip.innerHTML=`<div class="map-tooltip-header"><strong>${escapeHtml(point.cemetery_name||'Sépulture')}</strong><button type="button" class="map-tooltip-close" aria-label="Fermer">×</button></div><small>${escapeHtml([point.city,point.country].filter(Boolean).join(', ')||'Lieu non précisé')}</small><div class="map-event-list">${events.slice(0,30).map(item=>`<div class="map-cemetery-item"><strong>${escapeHtml(item.cemetery_name||'Sépulture')}</strong>${item.concession?`<em>Concession : ${escapeHtml(item.concession)}</em>`:''}${item.photo_filename?`<button class="button small secondary" type="button" data-open-cemetery-photo="${escapeHtml(item.photo_filename)}">Voir la tombe</button>`:''}${Array.isArray(item.people)&&item.people.length?`<span>${item.people.map(person=>escapeHtml(typeof person==='string'?person:person.name||'Personne')).join(' · ')}</span>`:''}</div>`).join('')}</div>`;const markerEl=event.target.closest('[data-map-group]');const rect=markerEl?markerEl.getBoundingClientRect():{left:event.clientX,top:event.clientY,right:event.clientX,bottom:event.clientY};const tipW=270,tipH=300;const left=rect.right+8+tipW>innerWidth?rect.left-tipW-8:rect.right+8;const top=Math.max(8,Math.min(innerHeight-tipH-8,rect.top-10));tip.style.left=`${left}px`;tip.style.top=`${top}px`;document.body.append(tip);tip.querySelector('.map-tooltip-close')?.addEventListener('click',()=>hideMapTooltip());$$('[data-open-cemetery-photo]',tip).forEach(button=>button.addEventListener('click',()=>{const filename=button.dataset.openCemeteryPhoto;if(filename)window.open(`media/${encodeURIComponent(filename)}`,'_blank','noopener');}));return;}
        // En mode lieu précis ou combiné : afficher l'adresse précise sous le nom de la commune
        const isPreciseMode=state.mapLocationMode==='precise'||state.mapLocationMode==='combined';
        const firstAddr=events[0]?.address||'';
        const preciseSubtitle=isPreciseMode&&(point.precise_lat!=null||firstAddr)
            ? `<div class="map-tooltip-precise">${firstAddr?`<span class="map-tooltip-address">📍 ${escapeHtml(firstAddr)}</span>`:`<span class="map-tooltip-coords">📍 ${Number(point.precise_lat).toFixed(5)}°, ${Number(point.precise_lon).toFixed(5)}°</span>`}</div>`
            : '';
        tip.innerHTML=`<div class="map-tooltip-header"><strong>${escapeHtml(placeDisplay(point))}</strong><button type="button" class="map-tooltip-close" aria-label="Fermer">×</button></div>${preciseSubtitle}<small>${events.length} événement${events.length>1?'s':''}</small><div class="map-event-list">${events.slice(0,80).map(item=>{const addr=(isPreciseMode||(item.precise_lat!=null&&item.precise_lon!=null))&&item.address?`<em class="map-tooltip-item-addr">📍 ${escapeHtml(item.address)}</em>`:'';
return `<button type="button" data-open-person="${item.person_id||''}"><span>${escapeHtml(item.type_label)} · ${escapeHtml(item.date_text||item.year||'date inconnue')}${window.LCNDA_APP?.privateEventBadge?.(item)||''}</span><em>${escapeHtml(item.route_person_name||[item.first_name,item.middle_name,item.last_name].filter(Boolean).join(' ')||(item.person_id?'Personne sans nom':'Événement non rattaché'))}</em>${addr}</button>`;}).join('')}${events.length>80?`<p>+ ${plural(events.length-80,'autre')}</p>`:''}</div>`;const markerEl=event.target.closest('[data-map-group]');const rect=markerEl?markerEl.getBoundingClientRect():{left:event.clientX,top:event.clientY,right:event.clientX,bottom:event.clientY};const tipW=250,tipH=300;const left=rect.right+8+tipW>innerWidth?rect.left-tipW-8:rect.right+8;const top=Math.max(8,Math.min(innerHeight-tipH-8,rect.top-10));tip.style.left=`${left}px`;tip.style.top=`${top}px`;document.body.append(tip);tip.querySelector('.map-tooltip-close')?.addEventListener('click',()=>hideMapTooltip());$$('[data-open-person]',tip).forEach(button=>{button.addEventListener('click',()=>{const id=Number(button.dataset.openPerson);if(id){state.currentPersonId=id;hideMapTooltip();setModule('personnes');}});});}
    function hideMapTooltip(){$('#map-tooltip')?.remove();}

    /* ═════ Audit 🗺 Carte : un seul « Filtrer ▾ » (avec les filtres de lignée du moteur de Mes cartes), regroupement des points,
     * « Dans cette zone », centre de gravité par génération, légende, ⤓ Exporter · 🖨 Imprimer · 💾 Enregistrer la vue · ⛶,
     * aller à un lieu, lieux sans position, raccourcis ⌘+ ⌘− ⌘0 ⌘P, mode consultation (R6). ═════ */
    const UI=()=>window.LCNDA_UI||{};
    const kiosk=()=>document.body.classList.contains('is-kiosk');
    const toast=(m,k)=>window.LCNDA_APP?.toast?.(m,k);
    const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(_){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_){}}};
    const LIN_KEY='genealogie-map-lineage',OPT_KEY='genealogie-map-options';
    const LIN_DEF={person:null,rel:'asc',gens:6,sosa:false,sosaGens:0,side:'',branch:0,label:0};
    function lineage(){const v=store.get(LIN_KEY,null);return {...LIN_DEF,...(v&&typeof v==='object'?v:{})};}
    function setLineage(v){store.set(LIN_KEY,{...LIN_DEF,...(v||{})});}
    const lineageActive=l=>!!(l.person?.id||l.sosa||l.side||Number(l.branch)||Number(l.label));
    function mapOpts(){const v=store.get(OPT_KEY,{});return {cluster:true,legend:true,gravity:false,zone:false,...(v&&typeof v==='object'?v:{})};}
    function setMapOpt(k,v){store.set(OPT_KEY,{...mapOpts(),[k]:!!v});}
    const fresh=(c,ms=60000)=>c&&Date.now()-c.t<ms;
    const scopeCache=new Map();
    /** les personnes gardées par les filtres de lignée (même moteur que les couches de « Mes cartes » : mcp_person_scope) ; null = tout le monde */
    async function lineageScope(l){
        const f={persons:l.person?.id?[Number(l.person.id)]:[],rel:l.person?.id?l.rel:'self',gens:Number(l.gens)||6,sosa:!!l.sosa||!!l.side,sosaGens:Number(l.sosaGens)||0,side:l.side||'',branch:Number(l.branch)||0,labels:Number(l.label)?[Number(l.label)]:[]};
        const key=JSON.stringify(f),hit=scopeCache.get(key);if(fresh(hit))return hit.set;
        const r=await api('cartes_perso',{op:'map_scope',f:key});const set=r.all?null:new Set((r.ids||[]).map(Number));
        scopeCache.set(key,{t:Date.now(),set});return set;
    }
    let choicesCache=null;
    async function mapChoices(){
        if(fresh(choicesCache,120000))return choicesCache.v;
        const [b,l]=await Promise.all([api('branches').catch(()=>({})),api('labels').catch(()=>({}))]);
        choicesCache={t:Date.now(),v:{branches:(b.branches||[]).map(x=>({id:Number(x.id),name:x.name||x.root_name||`#${x.id}`})),labels:(l.labels||[]).map(x=>({id:Number(x.id),name:x.name,color:x.color}))}};
        return choicesCache.v;
    }
    const MODE_LABELS={overlay:'Superposition',timeline:'Animation',life:'Itinéraire',cemetery:'Cimetières',photos:'Cartes de photos',mine:'Mes cartes'};
    function mapModeLabel(){if(state.mapMode==='standard'||!MODE_LABELS[state.mapMode]){const t=orderedMapTypes().find(([v])=>v===state.mapTag);return t?t[2]:i18n('Tous les événements');}return i18n(MODE_LABELS[state.mapMode]);}
    function mapTitle(){return `${i18n('Carte')} · ${mapModeLabel()}`;}
    /** la colonne → Affichage : les calques que l'on allume ou éteint */
    function mapOptButtonsHtml(){const o=mapOpts();const b=(k,ico,label,help)=>`<button type="button" class="side-menu-item map-opt ${o[k]?'is-active':''}" data-map-opt="${k}" aria-pressed="${o[k]?'true':'false'}" title="${escapeHtml(i18n(help))}"><span class="side-number">${o[k]?'✓':''}</span>${ico} ${escapeHtml(i18n(label))}</button>`;
        return b('cluster','🔢','Regrouper les points proches','Au zoom faible, les points proches deviennent une pastille avec leur nombre')+b('zone','📋','Dans cette zone','La liste des événements visibles, qui suit la carte')+b('gravity','🧲','Centre de gravité par génération','Un point par génération d’ancêtres (la moyenne des lieux de naissance), reliés par une flèche')+b('legend','🗒','Légende','Les couleurs des sortes d’événements et la période');}

    /* ── Filtrer ▾ ── */
    function mapActiveFilters(ch){
        const a=[],L=lineage();
        if(state.mapGender)a.push({t:i18n({male:'Hommes',female:'Femmes',unknown:'Sexe inconnu'}[state.mapGender]||state.mapGender),rm:()=>{state.mapGender='';}});
        if(state.mapYearFrom||state.mapYearTo)a.push({t:state.mapYearFrom&&state.mapYearTo?i18n('De {a} à {b}',{a:state.mapYearFrom,b:state.mapYearTo}):state.mapYearFrom?i18n('Depuis {a}',{a:state.mapYearFrom}):i18n('Jusqu’à {b}',{b:state.mapYearTo}),rm:()=>{state.mapYearFrom='';state.mapYearTo='';}});
        if(state.mapSurname)a.push({t:i18n('Nom : {x}',{x:state.mapSurname}),rm:()=>{state.mapSurname='';}});
        if(state.mapAgeFrom||state.mapAgeTo)a.push({t:i18n('Âge {a} – {b}',{a:state.mapAgeFrom||'0',b:state.mapAgeTo||'…'}),rm:()=>{state.mapAgeFrom='';state.mapAgeTo='';}});
        if(L.person?.id){const rel={self:'{nm}',asc:'Ascendants de {nm}',desc:'Descendants de {nm}',both:'Famille de {nm}'}[L.rel]||'{nm}';a.push({t:i18n(rel,{nm:L.person.title||`#${L.person.id}`}),rm:()=>setLineage({...lineage(),person:null})});}
        if(L.sosa)a.push({t:Number(L.sosaGens)?i18n('Ancêtres (Sosa) sur {n} générations',{n:L.sosaGens}):i18n('Ancêtres (Sosa)'),rm:()=>setLineage({...lineage(),sosa:false})});
        if(L.side)a.push({t:i18n(L.side==='father'?'Côté du père':'Côté de la mère'),rm:()=>setLineage({...lineage(),side:''})});
        if(Number(L.branch))a.push({t:i18n('Branche : {x}',{x:ch?.branches.find(b=>b.id===Number(L.branch))?.name||`#${L.branch}`}),rm:()=>setLineage({...lineage(),branch:0})});
        if(Number(L.label))a.push({t:i18n('Étiquette : {x}',{x:ch?.labels.find(b=>b.id===Number(L.label))?.name||`#${L.label}`}),rm:()=>setLineage({...lineage(),label:0})});
        return a;
    }
    function mapFilterStripHtml(ch){
        const act=mapActiveFilters(ch),P=window.LCNDA_PICKER;
        const chips=act.map((x,i)=>`<span class="map-chip">${escapeHtml(x.t)}<button type="button" data-map-chip="${i}" aria-label="${escapeHtml(i18n('Retirer ce filtre'))}">×</button></span>`).join('');
        const goTo=P?.pickerField?`<span class="map-goto" id="map-goto" title="${escapeHtml(i18n('Centrer la carte sur un lieu et ouvrir sa bulle'))}">${P.pickerField({name:'map_goto',hiddenName:false,kind:'place',allowCreate:false,placeholder:i18n('Aller à un lieu…')})}</span>`:'';
        return `<span class="map-filter-strip"><button type="button" class="ui-listbar-btn map-filter-btn ${act.length?'has-active':''}" id="map-filter-btn" aria-haspopup="true" aria-expanded="${state.mapFilterOpen?'true':'false'}">${escapeHtml(i18n('Filtrer ▾'))}${act.length?` <b class="ui-listbar-n">${act.length}</b>`:''}</button>${chips}${act.length?`<button type="button" class="link-button map-chip-all" data-map-chip-all>${escapeHtml(i18n('Tout effacer'))}</button>`:''}${state.mapLineageNote?`<span class="muted">${escapeHtml(state.mapLineageNote)}</span>`:''}</span>${goTo}`;
    }
    function mapFilterPanelHtml(ch){
        const L=lineage(),P=window.LCNDA_PICKER,opt=(v,cur,lab)=>`<option value="${escapeHtml(String(v))}" ${String(cur)===String(v)?'selected':''}>${escapeHtml(lab)}</option>`;
        const person=P?.pickerField?P.pickerField({name:'map_lin_person',hiddenName:false,kind:'person',allowCreate:false,placeholder:i18n('Une personne…'),value:L.person?.id?{id:Number(L.person.id),title:L.person.title||'',kind:'person'}:null}):'';
        return `<div class="map-filter-panel" id="map-filter-panel" role="dialog" aria-label="${escapeHtml(i18n('Filtrer'))}" ${state.mapFilterOpen?'':'hidden'}>
            <div class="map-filter-group"><b>${escapeHtml(i18n('Qui'))}</b><label>Sexe <select id="map-gender">${opt('',state.mapGender,'Tous')}${opt('male',state.mapGender,'Hommes')}${opt('female',state.mapGender,'Femmes')}${opt('unknown',state.mapGender,'Inconnu')}</select></label><label>Nom de famille <input id="map-surname" type="text" autocomplete="off" value="${escapeHtml(state.mapSurname)}" placeholder="Nom"></label><label>Type <select id="map-surname-mode">${opt('last_name',state.mapSurnameMode==='group'?'group':'last_name','Nom inscrit')}${opt('group',state.mapSurnameMode==='group'?'group':'last_name','Famille / groupe')}</select></label><span class="map-filter-pair"><label>Âge de <input id="map-age-from" type="number" min="0" max="150" value="${escapeHtml(state.mapAgeFrom)}" placeholder="Âge"></label><label>à <input id="map-age-to" type="number" min="0" max="150" value="${escapeHtml(state.mapAgeTo)}" placeholder="Âge"></label></span></div>
            <div class="map-filter-group"><b>${escapeHtml(i18n('Quand'))}</b><span class="map-filter-pair"><label>Année de <input id="map-year-from" type="number" min="1" max="9999" value="${escapeHtml(state.mapYearFrom)}" placeholder="Année"></label><label>à <input id="map-year-to" type="number" min="1" max="9999" value="${escapeHtml(state.mapYearTo)}" placeholder="Année"></label></span></div>
            <div class="map-filter-group map-filter-lineage"><b>${escapeHtml(i18n('Lignée'))}</b>
                <div class="pk-host"><span>${escapeHtml(i18n('Autour de'))}</span><div id="map-lin-person">${person}</div></div>
                ${L.person?.id?`<span class="map-filter-pair"><label>${escapeHtml(i18n('Garder'))} <select id="map-lin-rel">${opt('asc',L.rel,i18n('ses ascendants'))}${opt('desc',L.rel,i18n('ses descendants'))}${opt('both',L.rel,i18n('les deux'))}${opt('self',L.rel,i18n('elle seule'))}</select></label>${L.rel!=='self'?`<label><input id="map-lin-gens" type="number" min="1" max="40" value="${escapeHtml(String(L.gens))}"> ${escapeHtml(i18n('générations'))}</label>`:''}</span>`:''}
                <label class="checkbox-line"><input type="checkbox" id="map-lin-sosa" ${L.sosa?'checked':''}> ${escapeHtml(i18n('Seulement mes ancêtres (Sosa)'))}</label>${L.sosa?`<label>${escapeHtml(i18n('Au plus'))} <input id="map-lin-sosa-gens" type="number" min="0" max="40" value="${escapeHtml(String(L.sosaGens||''))}" placeholder="${escapeHtml(i18n('toutes'))}"> ${escapeHtml(i18n('générations'))}</label>`:''}
                <label>${escapeHtml(i18n('Côté'))} <select id="map-lin-side">${opt('',L.side,i18n('Les deux côtés'))}${opt('father',L.side,i18n('Côté du père'))}${opt('mother',L.side,i18n('Côté de la mère'))}</select></label>
                <label>${escapeHtml(i18n('Branche'))} <select id="map-lin-branch">${opt(0,Number(L.branch),i18n('Toutes'))}${(ch?.branches||[]).map(b=>opt(b.id,Number(L.branch),b.name)).join('')}</select></label>
                <label>${escapeHtml(i18n('Étiquette'))} <select id="map-lin-label">${opt(0,Number(L.label),i18n('Toutes'))}${(ch?.labels||[]).map(b=>opt(b.id,Number(L.label),b.name)).join('')}</select></label>
                <small class="ui-hint">${escapeHtml(i18n('Sosa et côtés : depuis la personne de départ.'))}</small></div>
            <div class="map-filter-group"><b>${escapeHtml(i18n('Où'))}</b><label>Position <select id="map-location-mode">${opt('city',state.mapLocationMode==='combined'||state.mapLocationMode==='precise'?state.mapLocationMode:'city','Ville')}${opt('combined',state.mapLocationMode,'Combiné')}${opt('precise',state.mapLocationMode,'Lieu précis')}</select></label></div>
            <div class="map-filter-foot"><button class="button small secondary" type="button" id="map-reset">↺ Remettre comme au départ</button><button class="button small" type="button" id="map-filter-close">${escapeHtml(i18n('Fermer'))}</button></div></div>`;
    }
    function mapToolsHtml(){
        return `<span class="map-tools"><button class="button small secondary" type="button" id="map-export" title="${escapeHtml(i18n('PNG, JPG, PDF ou CSV de la carte affichée'))}">${escapeHtml(i18n('⤓ Exporter ▾'))}</button><button class="button small secondary" type="button" id="map-print" title="${escapeHtml(i18n('Imprimer la carte affichée (⌘P)'))}">${escapeHtml(i18n('🖨 Imprimer'))}</button>${kiosk()?'':`<button class="button small secondary gp-edit" type="button" id="map-save-view">${escapeHtml(i18n('💾 Enregistrer la vue'))}</button>`}<button class="icon-button" type="button" id="map-full" title="${escapeHtml(i18n('Plein écran'))}" aria-label="${escapeHtml(i18n('Plein écran'))}">⛶</button></span>`;
    }
    function bindMapTools(isCemetery){
        const strip=$('.map-layout .tool-strip'),panel=$('#map-filter-panel'),btn=$('#map-filter-btn');
        const place=()=>{if(panel&&strip)panel.style.top=`${strip.offsetTop+strip.offsetHeight+4}px`;};
        btn?.addEventListener('click',()=>{state.mapFilterOpen=!state.mapFilterOpen;if(panel){panel.hidden=!state.mapFilterOpen;place();}btn.setAttribute('aria-expanded',String(!!state.mapFilterOpen));});
        $('#map-filter-close')?.addEventListener('click',()=>{state.mapFilterOpen=false;if(panel)panel.hidden=true;btn?.setAttribute('aria-expanded','false');});
        place();
        const reload=()=>{persistUiState();renderMap();};
        $$('[data-map-chip]').forEach(b=>b.addEventListener('click',async()=>{const x=mapActiveFilters(await mapChoices())[Number(b.dataset.mapChip)];if(x){x.rm();reload();}}));
        $('[data-map-chip-all]')?.addEventListener('click',()=>$('#map-reset')?.click());
        const linSet=patch=>{setLineage({...lineage(),...patch});reload();};
        $('#map-lin-person')?.addEventListener('picker-change',e=>{const it=e.detail?.item;linSet({person:it&&!it.free&&Number(it.id)?{id:Number(it.id),title:it.title||''}:null});});
        $('#map-lin-rel')?.addEventListener('change',e=>linSet({rel:e.target.value}));
        $('#map-lin-gens')?.addEventListener('change',e=>linSet({gens:Math.max(1,Math.min(40,Number(e.target.value)||6))}));
        $('#map-lin-sosa')?.addEventListener('change',e=>linSet({sosa:e.target.checked}));
        $('#map-lin-sosa-gens')?.addEventListener('change',e=>linSet({sosaGens:Math.max(0,Math.min(40,Number(e.target.value)||0))}));
        $('#map-lin-side')?.addEventListener('change',e=>linSet({side:e.target.value}));
        $('#map-lin-branch')?.addEventListener('change',e=>linSet({branch:Number(e.target.value)||0}));
        $('#map-lin-label')?.addEventListener('change',e=>linSet({label:Number(e.target.value)||0}));
        $('#map-goto')?.addEventListener('picker-change',e=>{const it=e.detail?.item;if(it&&!it.free&&Number(it.id))goToPlace(Number(it.id),it.title||'');});
        $('#map-export')?.addEventListener('click',()=>openMapExport());
        $('#map-print')?.addEventListener('click',()=>mapPrint());
        $('#map-save-view')?.addEventListener('click',()=>saveMapView());
        $('#map-full')?.addEventListener('click',()=>toggleFull($('.map-layout')));
        const zone=$('#map-zone-panel');
        zone?.addEventListener('click',e=>{if(e.target.closest('[data-zone-close]')){setMapOpt('zone',false);zone.hidden=true;renderSidebar();return;}const it=e.target.closest('[data-zone-key]');if(it)flashGroup(it.dataset.zoneKey);});
        if(!isCemetery)updateUnplaced();
    }

    /* ── couleurs des sortes, regroupement ── */
    const KINDS=[['births','Naissances','#2b8a3e',['BIRT','CHR','BAPM']],['marriages','Mariages','#c2255c',['MARR','MARC','ENGA','MARB','MARL','MARS']],['deaths','Décès','#495057',['DEAT']],['burials','Inhumations','#7048e8',['BURI','CREM']],['residences','Résidences','#1971c2',['RESI']],['census','Recensements','#0b7285',['CENS']],['events','Autres événements','#e8590c',[]]];
    function kindOf(p){if(p?.is_cemetery)return KINDS[3];const t=String(p?.gedcom_tag||'').toUpperCase();return KINDS.find(k=>k[3].includes(t))||KINDS[6];}
    function groupKind(group){const n=new Map();(group.events||[group]).forEach(e=>{const k=kindOf(e);n.set(k,(n.get(k)||0)+1);});let best=KINDS[6],m=-1;n.forEach((v,k)=>{if(v>m){m=v;best=k;}});return best;}
    function mapClusters(groups){
        if(state.mapDisplay!=='markers'||!mapOpts().cluster||state.mapMode==='life'||state.mapZoom>12||groups.length<2)return null;
        // au plus près : chaque lieu rejoint la pastille la plus proche à moins de 48 px (les plus gros d'abord), sinon il en commence une
        const R=48,out=[];
        [...groups].sort((a,b)=>(b.count||1)-(a.count||1)).forEach(g=>{let best=null,bd=R*R;out.forEach(c=>{const dx=c._x-g._x,dy=c._y-g._y,d=dx*dx+dy*dy;if(d<=bd){bd=d;best=c;}});if(!best){best={_x:g._x,_y:g._y,sx:0,sy:0,items:[],count:0};out.push(best);}best.items.push(g);best.sx+=g._x;best.sy+=g._y;best.count+=g.count||1;best._x=best.sx/best.items.length;best._y=best.sy/best.items.length;});
        return out;
    }
    function zoomOnCluster(c){
        if(!c)return;const pts=c.items.map(g=>({lat:Number(g.latitude),lon:Number(g.longitude)})).filter(p=>isUsableMapCoord(p.lat,p.lon));if(!pts.length)return;
        const lat=pts.reduce((s,p)=>s+p.lat,0)/pts.length,lon=pts.reduce((s,p)=>s+p.lon,0)/pts.length,stage=$('#map-stage'),w=stage?.clientWidth||900,h=stage?.clientHeight||520;
        let z=Math.min(18,state.mapZoom+1);
        for(let t=state.mapZoom+1;t<=18;t++){const xs=pts.map(p=>lngToX(p.lon,t)),ys=pts.map(p=>latToY(p.lat,t));if(Math.max(...xs)-Math.min(...xs)>w*.6||Math.max(...ys)-Math.min(...ys)>h*.6)break;z=t;if(Math.max(...xs)-Math.min(...xs)>140||Math.max(...ys)-Math.min(...ys)>140)break;}
        state.mapCenter={lat,lon};state.mapZoom=Math.max(state.mapZoom+1,z);hideMapTooltip();persistUiState();drawMap();
    }
    function flashGroup(key){
        const d=state.mapLastDraw;if(!d)return;
        let el=$$('[data-map-group]').find(b=>b.dataset.mapGroup===String(key));
        const group=d.groups.find(g=>d.gKey(g)===String(key));
        if(!el&&d.clusters){const i=d.clusters.findIndex(c=>c.items.some(g=>d.gKey(g)===String(key)));if(i>=0)el=$(`[data-map-cluster="${i}"]`);}
        $$('.map-layout .is-flash').forEach(x=>x.classList.remove('is-flash'));
        if(!el)return;el.classList.add('is-flash');setTimeout(()=>el.classList.remove('is-flash'),2400);
        if(el.dataset.mapGroup&&group){const r=el.getBoundingClientRect();showMapTooltip({target:el,clientX:r.left,clientY:r.top},group,true);}
    }

    /* ── 📋 Dans cette zone ── */
    let zoneTimer=0;
    function scheduleZonePanel(){clearTimeout(zoneTimer);zoneTimer=setTimeout(renderZonePanel,120);}
    function renderZonePanel(){
        const box=$('#map-zone-panel'),d=state.mapLastDraw;if(!box)return;
        if(!mapOpts().zone||!d||state.mapDisplay!=='markers'&&state.mapDisplay!=='heat'){box.hidden=true;return;}
        box.hidden=false;
        const inside=d.visible.filter(p=>p._x>=0&&p._x<=d.width&&p._y>=0&&p._y<=d.height);
        const keyOf=new Map();d.groups.forEach(g=>(g.events||[]).forEach(e=>keyOf.set(e,d.gKey(g))));
        const people=new Set(inside.map(p=>Number(p.person_id)).filter(Boolean));
        const rows=[...inside].sort((a,b)=>(Number(a.year)||99999)-(Number(b.year)||99999)).slice(0,250);
        const who=p=>p.route_person_name||[p.first_name,p.middle_name,p.last_name].filter(Boolean).join(' ')||(p.cemetery_name||i18n('Personne sans nom'));
        box.innerHTML=`<header><b>📋 ${escapeHtml(i18n('Dans cette zone'))}</b><button type="button" class="icon-button" data-zone-close aria-label="${escapeHtml(i18n('Fermer'))}">×</button></header><small class="map-zone-count">${escapeHtml(i18n('{e} · {p}',{e:plural(inside.length,'événement'),p:plural(people.size,'personne')}))}</small>
            <div class="map-zone-list">${rows.map(p=>`<button type="button" data-zone-key="${escapeHtml(keyOf.get(p)||'')}"><span>${escapeHtml(who(p))}</span><small>${escapeHtml([p.type_label||'',p.date_text||p.year||'',placeDisplay(p)].filter(Boolean).join(' · '))}</small></button>`).join('')||`<p class="muted">${escapeHtml(i18n('Rien dans le cadre : déplace la carte ou dézoome.'))}</p>`}${inside.length>rows.length?`<p class="muted">${escapeHtml(i18n('+ {n} autres : zoome pour les voir.',{n:inside.length-rows.length}))}</p>`:''}</div>`;
    }

    /* ── 🧲 centre de gravité, 📍 lieu choisi ── */
    async function loadGravity(){if(fresh(state.mapGravity))return state.mapGravity.data;try{const r=await api('cartes_perso',{op:'map_gravity'});state.mapGravity={t:Date.now(),data:r};}catch(error){state.mapGravity={t:Date.now(),data:{generations:[],note:error.message}};}return state.mapGravity.data;}
    function drawGravity(left,top,z,width,height){
        const svg=$('#map-gravity-layer');if(!svg)return;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
        let h='';const xy=(lat,lon)=>[lngToX(Number(lon),z)-left,latToY(Number(lat),z)-top];
        const gens=mapOpts().gravity?(state.mapGravity?.data?.generations||[]):[];
        if(gens.length){
            const pts=[...gens].sort((a,b)=>b.gen-a.gen).map(g=>({...g,xy:xy(g.lat,g.lon)}));
            h+=`<defs><marker id="map-grav-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#d9480f"></path></marker></defs>`;
            if(pts.length>1)h+=`<path d="${pts.map((p,i)=>`${i?'L':'M'}${p.xy[0].toFixed(1)} ${p.xy[1].toFixed(1)}`).join(' ')}" fill="none" stroke="#d9480f" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#map-grav-arrow)"></path>`;
            h+=pts.map(p=>`<g class="map-grav-pt" transform="translate(${p.xy[0].toFixed(1)} ${p.xy[1].toFixed(1)})"><title>${escapeHtml(i18n('Génération {g} : {n}{y}',{g:p.gen,n:plural(p.n,'naissance'),y:p.y0?` (${p.y0}–${p.y1})`:''}))}</title><circle r="11" fill="#fff" stroke="#d9480f" stroke-width="3"></circle><text y="4" text-anchor="middle" font-size="10" font-weight="800" fill="#d9480f">G${p.gen}</text></g>`).join('');
        }
        const pin=state.mapGotoPin;
        if(pin){const [x,y]=xy(pin.lat,pin.lon);h+=`<g class="map-goto-pin" transform="translate(${Math.round(x)} ${Math.round(y)})"><circle r="14" fill="#055dff" fill-opacity=".18" stroke="#055dff" stroke-width="2"></circle><circle r="4" fill="#055dff"></circle><text y="-20" text-anchor="middle" font-size="13" font-weight="700" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${escapeHtml(pin.label)}</text></g>`;}
        svg.innerHTML=h;
    }
    async function goToPlace(id,label){
        try{
            const r=await api('cartes_perso',{op:'map_place',id});const pl=r.place||{};
            if(pl.lat==null||pl.lon==null){toast(i18n('« {x} » n’a pas encore de position sur la carte.',{x:pl.name||label}),'error');return;}
            state.mapCenter={lat:pl.lat,lon:pl.lon};state.mapZoom=Math.max(state.mapZoom,12);state.mapGotoPin={lat:pl.lat,lon:pl.lon,label:pl.name||label};persistUiState();drawMap();
            const d=state.mapLastDraw,g=d?.groups.find(x=>Number(x.place_id)===Number(id)||(x.events||[]).some(e=>Number(e.place_id)===Number(id)));
            if(g){state.mapGotoPin=null;drawMap();requestAnimationFrame(()=>flashGroup(state.mapLastDraw.gKey(g)));}
        }catch(error){toast(error.message,'error');}
    }

    /* ── 🗒 légende ── */
    function drawLegend(visible){
        const box=$('#map-legend');if(!box)return;
        if(!mapOpts().legend||state.mapMode==='mine'){box.hidden=true;return;}
        let rows='';
        if(state.mapMode==='life'){rows=routePeopleSelection().map((p,i)=>`<span><i style="background:${mapRouteColor(i)}"></i>${escapeHtml(p.name||'')}</span>`).join('');}
        else if(state.mapDisplay==='markers'&&state.mapMode!=='timeline'){const n=new Map();visible.forEach(p=>{const k=kindOf(p);n.set(k,(n.get(k)||0)+1);});rows=KINDS.filter(k=>n.has(k)).map(k=>`<span><i style="background:${k[2]}"></i>${escapeHtml(i18n(k[1]))} <small>${n.get(k).toLocaleString('fr-FR')}</small></span>`).join('');}
        if(mapOpts().gravity&&(state.mapGravity?.data?.generations||[]).length)rows+=`<span><i class="is-grav"></i>${escapeHtml(i18n('Centre de gravité (G1 = la personne de départ)'))}</span>`;
        const yr=mapPointYearRange(mapDisplayPoints());
        const lin=mapActiveFilters(choicesCache?.v).map(x=>x.t).join(' · ');
        box.hidden=!rows&&!yr;
        box.innerHTML=`<b>${escapeHtml(mapModeLabel())}</b>${rows}${yr?`<small>${escapeHtml(yr.min===yr.max?String(yr.min):i18n('Période : {a} – {b}',{a:String(yr.min),b:String(yr.max)}))}</small>`:''}${lin?`<small>${escapeHtml(lin)}</small>`:''}${mapOpts().gravity&&state.mapGravity?.data?.note?`<small>${escapeHtml(i18n(state.mapGravity.data.note))}</small>`:''}`;
    }

    /* ── 🕳 lieux sans position : le compteur sur le bouton « Lieux à placer » ── */
    let unplacedCache=null;
    async function updateUnplaced(){
        try{if(!fresh(unplacedCache))unplacedCache={t:Date.now(),v:await api('cartes_perso',{op:'map_unplaced'})};}catch(_){return;}
        const n=Number(unplacedCache.v.places)||0,ev=Number(unplacedCache.v.events)||0;if(!n)return;
        const label='🕳 '+(n===1?i18n('1 lieu pas sur la carte'):i18n('{n} lieux pas sur la carte',{n:n.toLocaleString('fr-FR')}));
        const help=i18n('{e} sans position : clique pour placer leurs lieux',{e:plural(ev,'événement')});
        const b=$('.map-layout [data-lap-open]');
        if(b){if(kiosk())return;b.textContent=label;b.title=help;b.classList.add('map-unplaced');return;}
        const strip=$('.map-layout .tool-strip');if(!strip||strip.querySelector('.map-unplaced'))return;
        const s=document.createElement('span');s.className='map-unplaced muted';s.textContent=label;s.title=help;strip.insertBefore(s,strip.querySelector('.spacer'));
    }

    /* ── ⤓ Exporter · 🖨 Imprimer : la carte telle qu'elle est affichée ── */
    async function mapCanvas(scale=1){
        const stage=$('#map-stage');if(!stage)throw new Error(i18n('Aucune carte à exporter.'));
        const W=stage.clientWidth,H=stage.clientHeight,c=document.createElement('canvas');c.width=Math.round(W*scale);c.height=Math.round(H*scale);
        const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#dde3e6';ctx.fillRect(0,0,W,H);
        const load=src=>new Promise(res=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=()=>res(null);setTimeout(()=>res(null),8000);i.src=src;});
        const tiles=async(box,alpha)=>{if(!box)return;const imgs=$$('img.map-tile',box),got=await Promise.all(imgs.map(im=>load(im.src)));ctx.globalAlpha=alpha;got.forEach((im,i)=>{if(im)ctx.drawImage(im,parseFloat(imgs[i].style.left)||0,parseFloat(imgs[i].style.top)||0,256,256);});ctx.globalAlpha=1;};
        await tiles($('#map-tiles'),1);if(state.mapMode==='overlay')await tiles($('#map-tiles-overlay'),(Number(state.mapOverlayOpacity??50))/100);
        for(const svg of $$('#map-route-layer, #map-gravity-layer',stage)){
            if(!svg.innerHTML.trim())continue;const cl=svg.cloneNode(true);cl.setAttribute('xmlns','http://www.w3.org/2000/svg');cl.setAttribute('width',W);cl.setAttribute('height',H);cl.setAttribute('viewBox',`0 0 ${W} ${H}`);
            [...svg.querySelectorAll('path')].forEach((p,i)=>{const cs=getComputedStyle(p),q=cl.querySelectorAll('path')[i];if(q&&!q.getAttribute('stroke')){q.setAttribute('stroke',cs.stroke);q.setAttribute('stroke-width',cs.strokeWidth);q.setAttribute('fill',cs.fill);}});
            const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(cl)],{type:'image/svg+xml'}));const im=await load(url);URL.revokeObjectURL(url);if(im)ctx.drawImage(im,0,0,W,H);
        }
        const sr=stage.getBoundingClientRect();
        $$('#map-overlay .heat-spot',stage).forEach(el=>{const x=parseFloat(el.style.left),y=parseFloat(el.style.top),g=ctx.createRadialGradient(x,y,0,x,y,28);g.addColorStop(0,'rgba(230,40,0,.55)');g.addColorStop(1,'rgba(230,40,0,0)');ctx.fillStyle=g;ctx.fillRect(x-28,y-28,56,56);});
        $$('#map-overlay .map-marker, #map-overlay .map-cluster',stage).forEach(el=>{
            const r=el.getBoundingClientRect(),x=r.left-sr.left+r.width/2,y=r.top-sr.top+r.height/2,cs=getComputedStyle(el),cl=el.classList.contains('map-cluster'),size=cl?Math.max(r.width,r.height)/2:(el.offsetWidth||18)/2;
            ctx.fillStyle=cs.backgroundColor||'#0066cc';ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.beginPath();
            if(cl)ctx.arc(x,y,size,0,Math.PI*2);else{ctx.moveTo(x,y-size*1.3);ctx.lineTo(x+size*1.3,y);ctx.lineTo(x,y+size*1.3);ctx.lineTo(x-size*1.3,y);ctx.closePath();}
            ctx.fill();ctx.stroke();
            const t=el.querySelector('span')?.textContent||'';if(t){ctx.fillStyle='#fff';ctx.font='900 11px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,x,y);}
        });
        const lg=$('#map-legend');
        if(lg&&!lg.hidden){const items=[...lg.children],lh=18,w=Math.min(320,W-20),h=12+items.length*lh;ctx.fillStyle='rgba(255,255,255,.94)';ctx.strokeStyle='#111';ctx.lineWidth=1.5;ctx.fillRect(10,H-h-30,w,h);ctx.strokeRect(10,H-h-30,w,h);ctx.textAlign='left';ctx.textBaseline='middle';
            items.forEach((it,i)=>{const y=H-h-30+12+i*lh;const dot=it.querySelector('i');let x=18;if(dot){ctx.fillStyle=getComputedStyle(dot).backgroundColor||'#d9480f';ctx.fillRect(x,y-5,10,10);x+=16;}ctx.fillStyle='#111';ctx.font=`${it.tagName==='B'?'800 12px':'11px'} system-ui,sans-serif`;ctx.fillText(it.textContent.trim().slice(0,60),x,y+1);});}
        ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(W-260,H-18,260,18);ctx.fillStyle='#333';ctx.font='10px system-ui,sans-serif';ctx.textAlign='right';ctx.fillText(i18n('© contributeurs OpenStreetMap'),W-6,H-8);
        return c;
    }
    async function mapDownload(format,{filename='',quality=150}={}){
        const c=await mapCanvas(Math.max(1,Math.min(4,(Number(quality)||150)/96))),mime=format==='jpeg'?'image/jpeg':'image/png';
        const blob=await new Promise(res=>{try{c.toBlob(res,mime,.92);}catch(_){res(null);}});if(!blob)throw new Error(i18n('Image impossible avec ce fond de carte : choisis PDF.'));
        const a=document.createElement('a');a.download=filename||`${mapTitle()}.${format==='jpeg'?'jpg':'png'}`;a.href=URL.createObjectURL(blob);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    }
    function mapCsv({filename=''}={}){
        const d=state.mapLastDraw,cell=window.LCNDA_APP.csvCell||(v=>`"${String(v??'').replace(/"/g,'""')}"`);
        const rows=(d?.visible||[]).filter(p=>p._x>=0&&p._x<=d.width&&p._y>=0&&p._y<=d.height);
        const head=['Lieu','Latitude','Longitude','Événement','Date','Personne'].map(x=>i18n(x));
        const csv='﻿'+[head,...rows.map(p=>[placeDisplay(p),p.latitude,p.longitude,p.type_label||'',p.date_text||p.year||'',p.route_person_name||[p.first_name,p.middle_name,p.last_name].filter(Boolean).join(' ')])].map(r=>r.map(v=>cell(v)).join(';')).join('\r\n');
        const a=document.createElement('a');a.download=filename||`${mapTitle()}.csv`;a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    }
    async function mapPrintDoc(){
        let body;try{const c=await mapCanvas(2);body=`<img src="${c.toDataURL('image/png')}" alt="" style="width:100%;height:auto;display:block;border:1px solid #999">`;}catch(_){const st=$('#map-stage');body=st?st.outerHTML:'';}
        const t=escapeHtml(mapTitle());
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${t}</title><style>@page{size:A4 landscape;margin:10mm}body{margin:0;font:12px system-ui,sans-serif;color:#111}h1{font-size:16px;margin:0 0 6px}</style></head><body><h1>${t}</h1>${body}</body></html>`;
    }
    async function mapPrint(asPdf=false){
        const doc=await mapPrintDoc(),U=UI();
        if(U.printDocument)U.printDocument(doc,{orientation:'landscape'});else{const w=window.open('','_blank');if(w){w.document.write(doc);w.document.close();w.print();}}
        if(asPdf)toast(i18n('Dans la fenêtre d’impression, choisis « Enregistrer en PDF ».'));
    }
    function openMapExport(){
        const U=UI();if(!U.openExportDialog)return mapPrint(true);
        U.openExportDialog({title:mapTitle(),defaultName:mapTitle(),quality:150,
            formats:[{id:'png',run:o=>mapDownload('png',o)},{id:'jpg',run:o=>mapDownload('jpeg',o)},{id:'pdf',hint:i18n('par l’impression : « Enregistrer en PDF »'),quality:false,ext:'',run:async()=>mapPrint(true)},{id:'csv',label:'📊 CSV',hint:i18n('les événements visibles'),ext:'csv',quality:false,run:async o=>mapCsv(o)},{id:'print',quality:false,run:async()=>mapPrint()}]});
    }
    /* ⛶ plein écran (Graphiques le fait pareil) */
    function toggleFull(el){if(!el)return;if(document.fullscreenElement){document.exitFullscreen?.();return;}const r=el.requestFullscreen?.();if(r?.catch)r.catch(()=>el.classList.toggle('is-full'));else if(!r)el.classList.toggle('is-full');}
    document.addEventListener('fullscreenchange',()=>{if(state.module==='carte')requestAnimationFrame(drawMap);});
    /* ⌨ ⌘+ ⌘− zoomer, ⌘0 tout voir, ⌘P imprimer (seulement dans la Carte, hors champ de saisie et hors fenêtre) */
    window.addEventListener('keydown',e=>{
        if(state.module!=='carte'||!$('#map-stage')||document.querySelector('dialog[open]')||e.altKey||!(e.metaKey||e.ctrlKey))return;
        if(e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
        const k=e.key;
        if(k==='+'||k==='='){state.mapZoom=Math.min(20,state.mapZoom+1);}
        else if(k==='-'||k==='_'){state.mapZoom=Math.max(4,state.mapZoom-1);}
        else if(k==='0'){fitMapToPoints(state.mapMode==='life'?state.mapRoutePoints:state.mapPoints);}
        else if(k.toLowerCase()==='p'&&!e.shiftKey){e.preventDefault();e.stopImmediatePropagation();mapPrint();return;}
        else return;
        e.preventDefault();e.stopImmediatePropagation();hideMapTooltip();persistUiState();drawMap();
    },true);


    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderMap, renderMapSidebar, drawMap, hideMapTooltip});
    if (state.module === 'carte' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
