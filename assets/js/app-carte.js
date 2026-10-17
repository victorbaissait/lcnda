/* LCNDA — 🗺️ Carte (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent,
 * et les outils de carte partagés avec le tableau de bord : projection lngToX/latToY…, personnes des parcours).
 */
(() => {
    'use strict';
    const {$, $$, api, applyDesign, orderedMapTypes, empty, escapeHtml, isUsableMapCoord, latToY, lngToX, mapBackgroundSelectHtml, mapBackgroundValue, mapRouteColor, mapTileUrl, openViewDialog, persistUiState, personName, placeDisplay, readDesignSettings, reloadBootstrap, renderSidebar, routePeopleSelection, savedView, setModule, setupMapRoutePersonControls, setupMapSurnameAutocomplete, setupSavedViewsDrag, sidebarSignal, sideButton, state, xToLng, years, yToLat} = window.LCNDA_APP;
    function renderMapSidebar(content, footer) {
        const views=state.bootstrap.savedViews.filter(view=>view.module==='map');
        content.innerHTML=`<div class="segmented"><button data-map-tab="types" class="${state.mapTab==='types'?'is-active':''}">Cartes</button><button data-map-tab="saved" class="${state.mapTab==='saved'?'is-active':''}">Enregistrées</button></div>
        ${state.mapTab==='types'?`<div class="side-menu">${orderedMapTypes().map(([v,i,l])=>sideButton(v,i,l,state.mapTag)).join('')}</div><div class="section-label">Mode</div><div class="side-menu">${sideButton('standard','A','Carte',state.mapMode)}${sideButton('overlay','B','Superposition',state.mapMode)}${sideButton('timeline','C','Animation',state.mapMode)}${sideButton('life','D','Itinéraire',state.mapMode)}${sideButton('cemetery','E','Cimetières',state.mapMode)}</div><div class="section-label">Affichage</div><div class="side-menu">${sideButton('markers','F','Marqueurs',state.mapDisplay)}${sideButton('heat','G','Carte thermique',state.mapDisplay)}</div>`:`<div class="saved-list">${views.map(view=>savedView(view)).join('')}</div>`}`;
        footer.innerHTML='<button class="button small" id="save-current-map">+ Enregistrer la carte</button>';
        content.addEventListener('click',async event=>{
            const tab=event.target.closest('[data-map-tab]');if(tab){state.mapTab=tab.dataset.mapTab;renderSidebar();return;}
            const item=event.target.closest('[data-side-value]');if(item){const value=item.dataset.sideValue;if(['markers','heat'].includes(value))state.mapDisplay=value;else if(['standard','overlay','timeline','life','cemetery'].includes(value))state.mapMode=value;else state.mapTag=value;persistUiState();renderSidebar();await renderMap();return;}
            const saved=event.target.closest('[data-view-id]');if(saved&&!event.target.closest('.saved-delete')&&!event.target.closest('.saved-grip')&&!event.target.closest('.saved-edit')){const view=views.find(v=>Number(v.id)===Number(saved.dataset.viewId));if(view){state.mapTag=view.config.event||'all';state.mapDisplay=view.config.display||'markers';state.mapMode=view.config.mode||'standard';state.mapZoom=Number(view.config.zoom||state.mapZoom||6);state.mapYearFrom=view.config.yearFrom??'';state.mapYearTo=view.config.yearTo??'';state.mapGender=view.config.gender??'';state.mapSurname=view.config.surname??'';state.mapSurnameMode=view.config.surnameMode||'last_name';state.mapAgeFrom=view.config.ageFrom??'';state.mapAgeTo=view.config.ageTo??'';state.mapTimelineYear=view.config.timelineYear??'';state.mapRoutePeople=Array.isArray(view.config.routePeople)?view.config.routePeople:[];state.mapLocationMode=view.config.locationMode||'city';state.mapOverlayBg=view.config.overlayBg||'cassini';state.mapOverlayOpacity=Number.isFinite(Number(view.config.overlayOpacity))?Number(view.config.overlayOpacity):50;persistUiState();renderSidebar();await renderMap();}}
            const edit=event.target.closest('[data-edit-view]');if(edit){event.stopPropagation();const view=views.find(v=>Number(v.id)===Number(edit.dataset.editView));if(view)openViewDialog(view.module,view.config||{},view.id,view.name);return;}
            const del=event.target.closest('[data-delete-view]');if(del){event.stopPropagation();if(!confirm('Supprimer cette vue enregistrée ?'))return;await api('delete_view',{},{method:'POST',body:{id:Number(del.dataset.deleteView)}});await reloadBootstrap();renderSidebar();return;}
        },{signal:sidebarSignal()});
        setupSavedViewsDrag($('#sidebar-content .saved-list'), async orderedIds => {
            for(let i=0;i<orderedIds.length;i++){await api('set_view_order',{},{method:'POST',body:{id:orderedIds[i],sort_order:(i+1)*10}});}
            await reloadBootstrap();
        });
        $('#save-current-map').addEventListener('click',()=>openViewDialog('map',{event:state.mapTag,display:state.mapDisplay,mode:state.mapMode,zoom:state.mapZoom,yearFrom:state.mapYearFrom,yearTo:state.mapYearTo,gender:state.mapGender,surname:state.mapSurname,surnameMode:state.mapSurnameMode,ageFrom:state.mapAgeFrom,ageTo:state.mapAgeTo,timelineYear:state.mapTimelineYear,routePeople:state.mapRoutePeople,locationMode:state.mapLocationMode,overlayBg:state.mapOverlayBg,overlayOpacity:state.mapOverlayOpacity}));
    }

    function mapPointYearRange(points){
        const years=(points||[]).map(point=>Number(point.year)).filter(isKnownMapYear);
        if(!years.length)return null;
        return {min:Math.min(...years),max:Math.max(...years)};
    }
    function isKnownMapYear(year){year=Number(year);return Number.isFinite(year)&&year>0;}
    function mapRoutePeopleHtml(){
        const selected=routePeopleSelection();
        return `<div class="map-route-people"><span>Personnes</span><div class="map-route-person-chips">${selected.map((person,index)=>`<span class="map-route-chip" style="--route-color:${mapRouteColor(index)}"><i></i>${escapeHtml(person.name||`Personne #${person.id}`)}<button type="button" data-remove-route-person="${person.id}" aria-label="Retirer ${escapeHtml(person.name||'cette personne')}">×</button></span>`).join('')||'<em>Aucune personne</em>'}</div><div class="map-route-person-search-wrap"><input id="map-route-person-search" type="text" placeholder="Ajouter une personne…" autocomplete="off"><div id="map-route-person-suggestions" class="place-suggestions map-route-person-suggestions" hidden></div></div></div>`;
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
        const isCemetery=state.mapMode==='cemetery';
        if(state.mapTag!=='all'&&!(state.bootstrap?.mapEventTags||[]).some(t=>t.gedcom_tag===state.mapTag))state.mapTag='all';const data=await api(isCemetery?'cemetery_map':'map',isCemetery?{}:{tag:state.mapTag,limit:20000,year_from:state.mapYearFrom||undefined,year_to:state.mapYearTo||undefined,gender:state.mapGender||undefined,surname:state.mapSurname||undefined,surname_mode:state.mapSurnameMode||'last_name',age_from:state.mapAgeFrom||undefined,age_to:state.mapAgeTo||undefined,location_mode:state.mapLocationMode==='precise'?'precise':'city'});state.mapPoints=data.points||[];state.mapPointsTotal=Number.isFinite(data.total)?data.total:state.mapPoints.length;
        if(!isCemetery)await loadMapRoutePoints();else state.mapRoutePoints=[];
        if(token!==state.workspaceToken||state.module!=='carte')return;
        const design=readDesignSettings(),mapBg=mapBackgroundValue(design.mapBackground);
        const yearRange=mapPointYearRange(state.mapPoints);
        if(state.mapMode==='timeline'&&yearRange&&(!state.mapTimelineYear||Number(state.mapTimelineYear)<yearRange.min||Number(state.mapTimelineYear)>yearRange.max))state.mapTimelineYear=String(yearRange.max);
        const routeStepOptions=state.mapRoutePoints.map((point,index)=>`<option value="${index}" ${String(state.mapRouteStep)===String(index)?'selected':''}>${escapeHtml(point.date_text||point.year||'date inconnue')} · ${escapeHtml(point.type_label||'Événement')}</option>`).join('');
        const modeControls=state.mapMode==='timeline'&&yearRange?`<div class="map-mode-controls"><label>Année <input id="map-time-year" type="range" min="${yearRange.min}" max="${yearRange.max}" value="${escapeHtml(state.mapTimelineYear||yearRange.max)}"></label><strong id="map-time-year-label">${escapeHtml(state.mapTimelineYear||yearRange.max)}</strong></div>`:state.mapMode==='life'?`<div class="map-mode-controls map-mode-controls-life">${mapRoutePeopleHtml()}<label>Étape <select id="map-route-step"><option value="all" ${state.mapRouteStep==='all'?'selected':''}>Toutes</option>${routeStepOptions}</select></label><label class="inline-check"><input type="checkbox" id="map-route-arrows" ${state.mapRouteArrows?'checked':''}> Flèches</label>${!routePeopleSelection().length?'<em>Ajoute une personne.</em>':(!state.mapRoutePoints.length?'<em>Aucun lieu daté.</em>':'')}</div>`:state.mapMode==='overlay'?`<div class="map-mode-controls map-mode-controls-overlay"><label>Comparer avec <select id="map-overlay-background">${mapBackgroundSelectHtml(mapBackgroundValue(state.mapOverlayBg))}</select></label><label>Opacité <input id="map-overlay-opacity" type="range" min="0" max="100" value="${escapeHtml(String(state.mapOverlayOpacity??50))}"></label><strong id="map-overlay-opacity-label">${escapeHtml(String(state.mapOverlayOpacity??50))}%</strong></div>`:'';
        const cemeteryFilters=isCemetery?'<span class="muted">Sépultures et cimetières renseignés dans la base.</span>':`<div class="map-year-filter"><label>Sexe <select id="map-gender"><option value="" ${state.mapGender===''?'selected':''}>Tous</option><option value="male" ${state.mapGender==='male'?'selected':''}>Hommes</option><option value="female" ${state.mapGender==='female'?'selected':''}>Femmes</option><option value="unknown" ${state.mapGender==='unknown'?'selected':''}>Inconnu</option></select></label><label>Année de <input id="map-year-from" type="number" min="1" max="9999" value="${escapeHtml(state.mapYearFrom)}" placeholder="Année"></label><label>à <input id="map-year-to" type="number" min="1" max="9999" value="${escapeHtml(state.mapYearTo)}" placeholder="Année"></label><label>Nom de famille <input id="map-surname" type="text" autocomplete="off" value="${escapeHtml(state.mapSurname)}" placeholder="Nom"></label><label>Type <select id="map-surname-mode"><option value="last_name" ${state.mapSurnameMode==='group'?'':'selected'}>Nom inscrit</option><option value="group" ${state.mapSurnameMode==='group'?'selected':''}>Famille / groupe</option></select></label><label>Âge de <input id="map-age-from" type="number" min="0" max="150" value="${escapeHtml(state.mapAgeFrom)}" placeholder="Âge"></label><label>à <input id="map-age-to" type="number" min="0" max="150" value="${escapeHtml(state.mapAgeTo)}" placeholder="Âge"></label><label>Position <select id="map-location-mode"><option value="city" ${state.mapLocationMode==='city'||!state.mapLocationMode?'selected':''}>Ville</option><option value="combined" ${state.mapLocationMode==='combined'?'selected':''}>Combiné</option><option value="precise" ${state.mapLocationMode==='precise'?'selected':''}>Lieu précis</option></select></label></div>`;
        const unit=isCemetery?'sépulture':'évt';
        $('#workspace').innerHTML=`<section class="map-layout"><div class="tool-strip"><label>Fond <select id="map-background">${mapBackgroundSelectHtml(mapBg)}</select></label><span>${(state.mapPointsTotal||state.mapPoints.length).toLocaleString('fr-FR')} ${unit}${(state.mapPointsTotal||0)>state.mapPoints.length?` <small style="opacity:.7">(${state.mapPoints.length.toLocaleString('fr-FR')} affichés)</small>`:''}</span>${cemeteryFilters}${modeControls}<span class="spacer"></span><button class="button small" id="map-reset">Réinitialiser</button><button class="button small" id="map-france">Recentrer</button></div><div class="map-stage map-bg-${escapeHtml(mapBg)}" id="map-stage"><div class="map-tiles" id="map-tiles"></div><div class="map-tiles map-tiles-overlay" id="map-tiles-overlay" style="opacity:${(Number(state.mapOverlayOpacity??50))/100}"></div><svg class="map-route-layer" id="map-route-layer" aria-hidden="true"></svg><div class="${state.mapDisplay==='heat'?'heat-layer':'map-marker-layer'}" id="map-overlay"></div><div class="map-caption">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a> · connexion requise pour les tuiles</div></div></section>`;
        (window.LCNDA_EXT?.mapSetup||[]).forEach(fn=>{try{fn();}catch(error){console.error(error);}});
        if(!state.mapKeepCenter)fitMapToPoints(state.mapMode==='life'?state.mapRoutePoints:state.mapPoints);
        state.mapKeepCenter=false;
        drawMap();
        const timeYear=$('#map-time-year');
        if(timeYear)timeYear.addEventListener('input',event=>{state.mapTimelineYear=event.target.value;$('#map-time-year-label').textContent=event.target.value;persistUiState();drawMap();});
        const routeStep=$('#map-route-step');
        if(routeStep)routeStep.addEventListener('change',event=>{state.mapRouteStep=event.target.value;persistUiState();drawMap();});
        const routeArrows=$('#map-route-arrows');
        if(routeArrows)routeArrows.addEventListener('change',event=>{state.mapRouteArrows=event.target.checked;persistUiState();drawMap();});
        const overlayBgSelect=$('#map-overlay-background');
        if(overlayBgSelect)overlayBgSelect.addEventListener('change',event=>{state.mapOverlayBg=event.target.value;persistUiState();drawMap();});
        const overlayOpacity=$('#map-overlay-opacity');
        if(overlayOpacity)overlayOpacity.addEventListener('input',event=>{state.mapOverlayOpacity=Number(event.target.value);$('#map-overlay-opacity-label').textContent=event.target.value+'%';const overlayTiles=$('#map-tiles-overlay');if(overlayTiles)overlayTiles.style.opacity=String(Number(event.target.value)/100);persistUiState();});
        setupMapRoutePersonControls();
        $('#map-background').addEventListener('change',event=>{const values=readDesignSettings();values.mapBackground=event.target.value;localStorage.setItem('genealogie-design',JSON.stringify(values));applyDesign();renderMap();});
        const applyMapFilters=()=>{state.mapYearFrom=$('#map-year-from').value;state.mapYearTo=$('#map-year-to').value;state.mapAgeFrom=$('#map-age-from').value;state.mapAgeTo=$('#map-age-to').value;persistUiState();renderMap();};if(!isCemetery){['map-year-from','map-year-to','map-age-from','map-age-to'].forEach(id=>{const el=$('#'+id);el.addEventListener('change',applyMapFilters);el.addEventListener('keydown',e=>{if(e.key==='Enter'){el.blur();applyMapFilters();}});});$('#map-gender').addEventListener('change',()=>{state.mapGender=$('#map-gender').value;persistUiState();renderMap();});setupMapSurnameAutocomplete();}
        $('#map-france').addEventListener('click',()=>{fitMapToPoints(state.mapMode==='life'?state.mapRoutePoints:state.mapPoints);persistUiState();drawMap();});
        const mapSurnameMode=$('#map-surname-mode');if(mapSurnameMode)mapSurnameMode.addEventListener('change',event=>{state.mapSurnameMode=event.target.value;persistUiState();renderMap();});const mapLocMode=$('#map-location-mode');if(mapLocMode)mapLocMode.addEventListener('change',event=>{state.mapLocationMode=event.target.value;persistUiState();renderMap();});$('#map-reset').addEventListener('click',()=>{state.mapGender='';state.mapYearFrom='';state.mapYearTo='';state.mapSurname='';state.mapSurnameMode='last_name';state.mapAgeFrom='';state.mapAgeTo='';state.mapLocationMode='city';persistUiState();renderMap();});
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
        const design=readDesignSettings(),mapBg=mapBackgroundValue(design.mapBackground);
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
        const sampled=state.mapDisplay==='markers'&&groups.length>700?groups.filter((_,i)=>i%Math.ceil(groups.length/700)===0):groups;
        $('#map-overlay').innerHTML=sampled.length?sampled.map(group=>state.mapDisplay==='heat'?`<span class="heat-spot" style="left:${group._x}px;top:${group._y}px"></span>`:`<button class="map-marker ${state.mapMode==='life'?'is-route':''} ${group.count>1?'has-count':''} ${group._timeClass?`is-${group._timeClass}`:''}" style="left:${group._x}px;top:${group._y}px;--route-color:${escapeHtml(group.route_color||'var(--blue)')}" data-map-group="${escapeHtml(group._groupKey||group.place_id||`${group.latitude},${group.longitude}`)}" aria-label="${escapeHtml(group.name||'Lieu')}">${group.count>1?`<span>${group.count}</span>`:''}</button>`).join(''):`<div class="map-empty-overlay">Aucun événement visible dans cette zone. Clique sur “Recentrer” pour revenir aux événements.</div>`;
        $$('[data-map-group]').forEach(button=>{const group=sampled.find(g=>String(g._groupKey||g.place_id||`${g.latitude},${g.longitude}`)===String(button.dataset.mapGroup));button.addEventListener('mouseenter',event=>{showMapTooltip(event,group);});button.addEventListener('click',event=>showMapTooltip(event,group,true));});
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
return `<button type="button" data-open-person="${item.person_id||''}"><span>${escapeHtml(item.type_label)} · ${escapeHtml(item.date_text||item.year||'date inconnue')}</span><em>${escapeHtml(item.route_person_name||[item.first_name,item.middle_name,item.last_name].filter(Boolean).join(' ')||(item.person_id?'Personne sans nom':'Événement non rattaché'))}</em>${addr}</button>`;}).join('')}${events.length>80?`<p>+ ${events.length-80} autre(s)</p>`:''}</div>`;const markerEl=event.target.closest('[data-map-group]');const rect=markerEl?markerEl.getBoundingClientRect():{left:event.clientX,top:event.clientY,right:event.clientX,bottom:event.clientY};const tipW=250,tipH=300;const left=rect.right+8+tipW>innerWidth?rect.left-tipW-8:rect.right+8;const top=Math.max(8,Math.min(innerHeight-tipH-8,rect.top-10));tip.style.left=`${left}px`;tip.style.top=`${top}px`;document.body.append(tip);tip.querySelector('.map-tooltip-close')?.addEventListener('click',()=>hideMapTooltip());$$('[data-open-person]',tip).forEach(button=>{button.addEventListener('click',()=>{const id=Number(button.dataset.openPerson);if(id){state.currentPersonId=id;hideMapTooltip();setModule('personnes');}});});}
    function hideMapTooltip(){$('#map-tooltip')?.remove();}

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderMap, renderMapSidebar, drawMap, hideMapTooltip});
    if (state.module === 'carte') renderSidebar(); // la colonne de gauche attendait ce fichier
})();
