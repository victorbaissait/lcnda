/* LCNDA — 🕵️ Enquêtes (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Enquêtes (dossiers, pistes, médias évalués, dossiers de pièces) et battues (communes, registres, carte). Les fenêtres de saisie partagées restent dans app.js.
 */
(() => {
    'use strict';
    const {$, $$, actionButton, api, confirmBox, emptyState, plural, archiveDigestOptionLabel, askText, battueTargetText, bindReminderButtons, bindTableLinks, debounce, empty, escapeHtml, investigationFolderPath, mediaTypeShortLabelWithIcon, normalizedMediaType, openBattueAliasDialog, openBattueDialog, openBattueLevelColorsDialog, openBattueMediaDialog, openBattueSearchDialog, openInvestigationDialog, openInvestigationItemDialog, openInvestigationItemEventDialog, openInvestigationMediaDialog, openInvestigationUploadDialog, openLightbox, persistUiState, reminderIsPast, renderSidebar, safeUrl, setModule, sidebarSignal, sideButton, state, toast} = window.LCNDA_APP;
    function renderInvestigationsSidebar(content,footer){
        const isBattue=state.enquetesTab==='battue',isAtelier=state.enquetesTab==='atelier';
        const tabs=`<div class="segmented enquetes-tab-toggle">${[['enquetes','🔍','Enquêtes'],['battue','🧭','Battue'],['atelier','📚','Atelier'],['tableaux','🧩','Tableaux']].map(([k,icon,label])=>`<button class="${state.enquetesTab===k||(k==='enquetes'&&!['battue','atelier','tableaux'].includes(state.enquetesTab))?'is-active ':''}enquetes-tab-btn" data-enquetes-tab="${k}"><span class="enquetes-tab-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}</div>`;
        if(state.enquetesTab==='tableaux'&&window.LCNDA_EXT?.boardsSidebar){
            window.LCNDA_EXT.boardsSidebar(content,footer,tabs,sidebarSignal());
            content.addEventListener('click',event=>{const tab=event.target.closest('[data-enquetes-tab]');if(tab){state.enquetesTab=tab.dataset.enquetesTab;state.currentInvestigationId=0;state.currentBattueId=0;state.currentBoardId=0;persistUiState();renderSidebar();renderInvestigations();}},{signal:sidebarSignal()});
            return;
        }
        if(isAtelier){
            content.innerHTML=`${tabs}<p class="enquetes-tab-help">Tes projets d’écriture et de recherche (thèse, livre, article, exposition) : dossiers et sous-dossiers, références, citations, images, brouillons.</p><div class="side-menu">${[['all','01','Tous'],['active','02','En cours'],['paused','03','En pause'],['done','04','Terminés']].map(([v,i,l])=>`<button class="side-menu-item ${(state.atelierStatus||'all')===v?'is-active':''}" data-atelier-status="${v}"><span class="side-number">${i}</span>${l}</button>`).join('')}</div>`;
            footer.innerHTML=`<button class="button small" id="new-atelier-project">＋ Nouveau projet</button>`;
            content.addEventListener('click',event=>{const tab=event.target.closest('[data-enquetes-tab]');if(tab){state.enquetesTab=tab.dataset.enquetesTab;state.currentInvestigationId=0;state.currentBattueId=0;persistUiState();renderSidebar();renderInvestigations();}},{signal:sidebarSignal()});
            $('#new-atelier-project').addEventListener('click',()=>window.LCNDA_EXT?.atelierNewProject?.());
            content.addEventListener('click',event=>{const f=event.target.closest('[data-atelier-status]');if(!f)return;state.atelierStatus=f.dataset.atelierStatus;if(state.atelier)state.atelier.project=0;renderSidebar();renderInvestigations();},{signal:sidebarSignal()});
            return;
        }
        content.innerHTML=`${tabs}<div class="search-box"><label for="investigation-search">${isBattue?'Rechercher une battue':'Rechercher une enquête'}</label><div class="search-row"><input id="investigation-search" value="${escapeHtml(state.investigationQuery)}" placeholder="${isBattue?'Nom, commune, cible…':'Personne, acte, lieu…'}"><button id="investigation-search-button">⌕</button></div></div><div class="side-menu">${sideButton('all','01','Toutes',state.investigationStatus)}${sideButton('open','02','En cours',state.investigationStatus)}${sideButton('paused','03','En pause',state.investigationStatus)}${sideButton('closed','04','Terminées',state.investigationStatus)}</div><div class="segmented investigation-display"><button class="${state.investigationDisplay==='list'?'is-active':''}" data-investigation-display="list">Liste</button><button class="${state.investigationDisplay==='cards'?'is-active':''}" data-investigation-display="cards">Fiches</button></div>`;
        footer.innerHTML=`<button class="button small" id="new-investigation-global">${isBattue?'＋ Nouvelle battue':'＋ Nouvelle enquête'}</button>`;
        content.addEventListener('click',event=>{const tab=event.target.closest('[data-enquetes-tab]');if(tab){state.enquetesTab=tab.dataset.enquetesTab;state.currentInvestigationId=0;state.currentBattueId=0;persistUiState();renderSidebar();renderInvestigations();return;}const status=event.target.closest('[data-side-value]');if(status){state.investigationStatus=status.dataset.sideValue;state.currentInvestigationId=0;state.investigationFolderId=0;state.currentBattueId=0;renderSidebar();renderInvestigations();}const display=event.target.closest('[data-investigation-display]');if(display){state.investigationDisplay=display.dataset.investigationDisplay;renderSidebar();renderInvestigations();}},{signal:sidebarSignal()});
        const run=()=>{const input=$('#investigation-search');if(!input)return; /* la colonne a changé pendant l'attente */state.investigationQuery=input.value;state.currentInvestigationId=0;state.investigationFolderId=0;state.currentBattueId=0;persistUiState();renderInvestigations();};$('#investigation-search').addEventListener('input',debounce(run));$('#investigation-search-button').addEventListener('click',run);$('#new-investigation-global').addEventListener('click',()=>{if(state.enquetesTab==='battue')openBattueDialog();else openInvestigationDialog(state.currentPersonId);});
    }

    async function renderInvestigations(token=++state.workspaceToken){
        if(state.currentInvestigationId)return renderInvestigationDetail(state.currentInvestigationId,token);
        if(state.enquetesTab==='battue')return renderBattues(token);
        if(state.enquetesTab==='atelier'&&window.LCNDA_EXT?.atelier)return window.LCNDA_EXT.atelier(token);
        if(state.enquetesTab==='tableaux'&&window.LCNDA_EXT?.boards)return window.LCNDA_EXT.boards(token);
        const data=await api('investigations',{status:state.investigationStatus,q:state.investigationQuery});if(token!==state.workspaceToken||state.module!=='enquetes')return;
        const sortedInvestigations=applyListSort(data.investigations,state.investigationSort,'title','created_at');
        const statusOf=st=>st==='closed'?['Terminée','grey']:st==='paused'?['En pause','yellow']:['En cours','blue'];
        // K9 : la vignette unique (UI.cardsHtml)
        const cards=sortedInvestigations.length?window.LCNDA_UI.cardsHtml(sortedInvestigations.map(item=>({thumb:'<span class="ui-card-ico">🔍</span>',name:item.title,open:`data-open-investigation="${item.id}"`,lines:[item.person_name||'',item.question||'Aucune question détaillée.'],badges:[{text:statusOf(item.status)[0],kind:statusOf(item.status)[1]},{text:`${plural(item.item_count,'piste')} · ${plural(item.media_count,'média')}`,kind:'grey'}],when:item.created_at,whenLabel:'Créée',menu:item.person_id?[`<button type="button" data-open-person="${item.person_id}">↗ Fiche de ${escapeHtml(item.person_name||'la personne')}</button>`]:[]}))):'';
        const rows=sortedInvestigations.map(item=>[item.person_name,item.title,item.status==='closed'?'Terminée':item.status==='paused'?'En pause':'En cours',`${plural(item.item_count,'piste')}`,{label:'Ouvrir',personId:null,investigationId:item.id}]);
        $('#workspace').innerHTML=`<section class="page">${window.LCNDA_UI.pageHeader({title:'Enquêtes',help:'Questions en cours, documents consultés, pistes prometteuses et hypothèses écartées.'})}<div class="inv-countbar"><span class="muted">${plural(data.investigations.length,'enquête')}</span><label class="media-filter-label">Trier : <select id="investigation-sort-select">${sortOptionsHtml(state.investigationSort)}</select></label></div>${state.investigationDisplay==='cards'?`<div class="investigation-cards">${cards||emptyState({text: 'Aucune enquête dans cette sélection.', icon:'🔍',hint:'Une enquête rassemble les pistes, médias et notes d’une question à résoudre.',action:{label:'＋ Nouvelle enquête',attrs:'data-empty-click="#new-investigation-global"'}})}</div>`:investigationTable(rows)}</section>`;bindInvestigationLinks();
        $('#investigation-sort-select')?.addEventListener('change',event=>{state.investigationSort=event.target.value;persistUiState();renderInvestigations();});
    }
    const battueMapLevels=[0,1,2,3,4,5,6,7,8,9,10];
    const battueStatusText=status=>({open:'En cours',paused:'En pause',closed:'Terminée'}[status]||'En cours');
    // K4 : « Créée aujourd’hui à 10 h 22 », date complète au survol (window.LCNDA_UI.when)
    function createdDateBadge(dateStr){
        const html=window.LCNDA_UI?.when?.(dateStr,{label:'Créée'});
        return html?`<span class="ui-badge is-date entity-date-badge">${html}</span>`:'';
    }
    const sortOptionLabels={'':'Par défaut',alpha_asc:'Alphabétique (A → Z)',alpha_desc:'Alphabétique (Z → A)',date_asc:'Date d’ajout (anciennes d’abord)',date_desc:'Date d’ajout (récentes d’abord)'};
    function sortOptionsHtml(selected){return Object.entries(sortOptionLabels).map(([value,label])=>`<option value="${value}" ${value===(selected||'')?'selected':''}>${escapeHtml(label)}</option>`).join('');}
    function applyListSort(items,option,titleKey='title',dateKey='created_at'){
        if(!option||!Array.isArray(items))return items;
        const arr=items.slice();
        if(option==='alpha_asc')arr.sort((a,b)=>String(a[titleKey]||'').localeCompare(String(b[titleKey]||''),'fr',{sensitivity:'base'}));
        else if(option==='alpha_desc')arr.sort((a,b)=>String(b[titleKey]||'').localeCompare(String(a[titleKey]||''),'fr',{sensitivity:'base'}));
        else if(option==='date_asc')arr.sort((a,b)=>String(a[dateKey]||'').localeCompare(String(b[dateKey]||'')));
        else if(option==='date_desc')arr.sort((a,b)=>String(b[dateKey]||'').localeCompare(String(a[dateKey]||'')));
        return arr;
    }
    const battueSearchTitle=(item,types,statuses)=>`${escapeHtml(item.title||battueTargetText(types,item.record_type))}${item.period?` <small>${escapeHtml(item.period)}</small>`:''}<span class="battue-status ${escapeHtml(item.status||'todo')}">${escapeHtml(statuses?.[item.status]||item.status||'À chercher')}</span>`;
    const battueCommuneStatusText=(statuses,status)=>statuses?.[status]||'Pas commencé';
    const battueCommuneStatusOptions=(statuses,selected='not_started')=>Object.entries(statuses||{}).map(([value,label])=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');

    async function renderBattues(token=++state.workspaceToken){
        if(state.currentBattueId){
            try{return await renderBattueDetail(state.currentBattueId,token);}
            catch(error){
                if(!String(error.message||'').includes('Battue introuvable'))throw error;
                state.currentBattueId=0;
                state.currentBattueDetail=null;
                persistUiState();
            }
        }
        const data=await api('battues',{status:state.investigationStatus,q:state.investigationQuery});
        if(token!==state.workspaceToken||state.module!=='enquetes'||state.enquetesTab!=='battue')return;
        state.battueTargetTypes=data.target_types||state.battueTargetTypes;
        const sortedBattues=applyListSort(data.battues,state.battueSort,'title','created_at');
        $('#workspace').innerHTML=`<section class="page battue-page">${window.LCNDA_UI.pageHeader({title:'Battues',help:'Recherche commune par commune, niveaux de voisinage et suivi des tables consultées.'})}<div class="inv-countbar"><span class="muted">${plural(data.battues.length,'battue')}</span><label class="media-filter-label">Trier : <select id="battue-sort-select">${sortOptionsHtml(state.battueSort)}</select></label></div>
        <div id="battue-countries"></div>
        ${state.investigationDisplay==='cards'?battueCardsHtml(sortedBattues,data.target_types):battueTable(sortedBattues,data.target_types)}</section>`;
        renderBattueCountries(token);
        $$('[data-open-battue]').forEach(button=>button.addEventListener('click',()=>{state.currentBattueId=Number(button.dataset.openBattue);persistUiState();renderBattues();}));
        $('#battue-sort-select')?.addEventListener('change',event=>{state.battueSort=event.target.value;persistUiState();renderBattues();});
    }
    const battueRegionOrder=['France d’outre-mer','Europe de l’Ouest','Europe du Nord','Europe centrale et de l’Est','Balkans et Grèce','Afrique du Nord et Moyen-Orient','Amérique du Nord et centrale','Caraïbes','Amérique du Sud','Asie','Afrique','Océanie','Autres'];
    const megabytes=bytes=>bytes>=1048576?`${(bytes/1048576).toLocaleString('fr-FR',{maximumFractionDigits:1})} Mo`:`${Math.max(1,Math.round(bytes/1024))} Ko`;

    async function renderBattueCountries(token){
        const box=$('#battue-countries');if(!box)return;
        let data;try{data=await api('reference_countries');}catch(_){return;}
        if(token!==state.workspaceToken||!document.body.contains(box))return;
        const details=data.details||Object.fromEntries(Object.entries(data.available||{}).map(([code,name])=>[code,{name,region:'Autres',present:true,size:0}]));
        if(!Object.keys(details).length){box.innerHTML='';return;}
        const active=new Set(data.active||[]);
        const byRegion=new Map(battueRegionOrder.map(region=>[region,[]]));
        Object.entries(details).forEach(([code,info])=>{const region=byRegion.has(info.region)?info.region:'Autres';byRegion.get(region).push(code);});
        const groups=[...byRegion].filter(([,codes])=>codes.length).map(([title,codes])=>[title,codes.sort((a,b)=>details[a].name.localeCompare(details[b].name,'fr'))]);
        const checkbox=code=>{const info=details[code];const extra=!info.present&&!active.has(code)?` <small class="muted">${escapeHtml(megabytes(info.size||0))} à télécharger</small>`:'';return `<label class="check-row"><input type="checkbox" data-battue-country="${escapeHtml(code)}" ${active.has(code)?'checked':''}> ${escapeHtml(info.name)}${extra}</label>`;};
        const counted=codes=>{const n=codes.filter(code=>active.has(code)).length;return n?` <small>${n}/${codes.length}</small>`:'';};
        box.innerHTML=`<section class="maintenance-panel battue-countries"><h3>Pays des battues</h3><p>La France est toujours disponible. Ajoute les pays utiles à tes recherches : leurs communes, leurs anciennes communes et les communes voisines de part et d’autre des frontières. Certains pays sont téléchargés la première fois qu’on les coche (il faut alors internet), puis restent sur l’ordinateur.</p>${groups.map(([title,codes],index)=>`<details class="battue-country-group" ${codes.some(code=>active.has(code))||title==='Europe de l’Ouest'?'open':''}><summary>${escapeHtml(title)}${counted(codes)}</summary><div class="check-row-list">${codes.map(checkbox).join('')}</div><div class="battue-countries-actions"><button type="button" class="button small secondary" data-battue-countries-all="1" data-battue-group="${index}">Tout cocher</button><button type="button" class="button small secondary" data-battue-countries-all="0" data-battue-group="${index}">Tout décocher</button></div></details>`).join('')}<div class="battue-countries-actions"><button type="button" class="button small" data-battue-countries-all="1">Tout cocher (tous les pays)</button><button type="button" class="button small" data-battue-countries-all="0">Tout décocher (tous les pays)</button></div><p class="muted" data-battue-country-status></p></section>`;
        const status=box.querySelector('[data-battue-country-status]');
        const lock=on=>box.querySelectorAll('input,button').forEach(el=>el.disabled=on);
        // Ajout d'un pays : s'il n'est pas sur l'ordinateur, on télécharge d'abord son fichier (Electron, sinon le serveur PHP)
        const setCountry=async(country,enabled)=>{
            try{return await api('set_reference_country',{}, {method:'POST',body:{country,enabled}});}
            catch(error){
                if(!enabled||!/téléchargées/.test(String(error.message||'')))throw error;
                status.textContent=`Téléchargement : ${details[country]?.name||country} (${megabytes(details[country]?.size||0)})…`;
                if(window.lcnda?.downloadReference){const r=await window.lcnda.downloadReference(country);if(!r?.ok)throw new Error(r?.error||'Téléchargement impossible.');}
                else await api('download_reference_country',{}, {method:'POST',body:{country}});
                status.textContent=`Ajout des communes : ${details[country]?.name||country}…`;
                return api('set_reference_country',{}, {method:'POST',body:{country,enabled}});
            }
        };
        box.querySelectorAll('[data-battue-country]').forEach(input=>input.addEventListener('change',async()=>{
            lock(true);
            status.textContent=input.checked?'Ajout des communes en cours…':'Retrait en cours…';
            try{
                const r=await setCountry(input.dataset.battueCountry,input.checked);
                toast(input.checked?`${plural(r.communes,'commune ajoutée','communes ajoutées')} (${plural(r.border_links,'lien de voisinage','liens de voisinage')} avec les pays voisins).`:`${plural(r.communes,'commune retirée','communes retirées')}.`);
            }catch(error){input.checked=!input.checked;toast(error.message,'error');}
            renderBattueCountries(token);
        }));
        // Tout cocher / décocher (une région ou tous les pays) : un pays après l'autre ; un pays utilisé par une battue reste coché
        box.querySelectorAll('[data-battue-countries-all]').forEach(button=>button.addEventListener('click',async()=>{
            const enabled=button.dataset.battueCountriesAll==='1';
            const scope=button.dataset.battueGroup!==undefined?button.closest('.battue-country-group'):box;
            const todo=[...scope.querySelectorAll('[data-battue-country]')].filter(input=>input.checked!==enabled);
            if(!todo.length)return;
            const toDownload=enabled?todo.map(input=>details[input.dataset.battueCountry]).filter(info=>info&&!info.present):[];
            if(toDownload.length&&!await confirmBox(`${plural(toDownload.length,'pays')} à télécharger (${megabytes(toDownload.reduce((sum,info)=>sum+(info.size||0),0))} en tout). Continuer ?`,{title:'Télécharger les pays ?',okLabel:'Télécharger'}))return;
            // Beaucoup de lieux copiés dans la base (≈ 250 octets chacun) : on prévient avant
            const places=enabled?todo.reduce((sum,input)=>sum+(details[input.dataset.battueCountry]?.places||0),0):0;
            if(places>300000&&!await confirmBox(`Cela ajoutera environ ${places.toLocaleString('fr-FR')} lieux à ta base (environ ${megabytes(places*250)} de plus). Les pays restent retirables à tout moment. Continuer ?`,{title:'Ajouter beaucoup de lieux ?',okLabel:'Ajouter les lieux',danger:false}))return;
            lock(true);
            let communes=0;const refused=[];
            for(const [index,input] of todo.entries()){
                const name=details[input.dataset.battueCountry]?.name||input.dataset.battueCountry;
                status.textContent=`${enabled?'Ajout':'Retrait'} : ${name} (${index+1}/${todo.length})…`;
                try{communes+=Number((await setCountry(input.dataset.battueCountry,enabled)).communes||0);}
                catch(_){refused.push(name);}
            }
            toast(`${enabled?plural(communes,'commune ajoutée','communes ajoutées'):plural(communes,'commune retirée','communes retirées')}.`+(refused.length?` Non ${enabled?'ajoutés':'retirés'} : ${refused.join(', ')}${enabled?' (téléchargement impossible ?)':' (utilisés par une battue)'}.`:''),refused.length?'error':undefined);
            renderBattueCountries(token);
        }));
    }

    function battueCardsHtml(battues,targetTypes){
        // K9 : la vignette unique (UI.cardsHtml)
        const kind=st=>st==='closed'?'grey':st==='paused'?'yellow':'blue';
        return battues.length?window.LCNDA_UI.cardsHtml(battues.map(item=>({thumb:'<span class="ui-card-ico">🗺️</span>',name:item.title,open:`data-open-battue="${item.id}"`,lines:[`${battueTargetText(targetTypes,item.target_type)}${item.target_text?` · ${item.target_text}`:''}`,`${item.start_name||''} (${item.start_insee_code||''}) · niveau ${Number(item.max_level||0)}`],badges:[{text:battueStatusText(item.status),kind:kind(item.status)},{text:`${plural(Number(item.item_count||0),'annotation')} · ${Number(item.todo_count||0)} à chercher`,kind:'grey'}],when:item.created_at,whenLabel:'Créée'}))):emptyState({text: 'Aucune battue dans cette sélection.', icon:'🗺️',hint:'Une battue suit commune par commune les registres déjà consultés.',action:{label:'＋ Nouvelle battue',attrs:'data-empty-click="#new-investigation-global"'}});
    }

    function battueTable(battues,targetTypes){
        if(!battues.length)return emptyState({text: 'Aucune battue dans cette sélection.', icon:'🗺️',hint:'Une battue suit commune par commune les registres déjà consultés.',action:{label:'＋ Nouvelle battue',attrs:'data-empty-click="#new-investigation-global"'}});
        return `<div class="data-table-wrap battue-table-wrap"><table class="data-table sortable-table" data-sortbar="battue" data-sortbar-fem="1"><thead><tr><th><button data-sort-column="0">Titre</button></th><th><button data-sort-column="1">Recherche</button></th><th><button data-sort-column="2">Commune départ</button></th><th><button data-sort-column="3">État</button></th><th>Suivi</th><th></th></tr></thead><tbody>${battues.map(item=>`<tr><td data-sort-value="${escapeHtml((item.title||'').toLowerCase())}"><strong>${escapeHtml(item.title)}</strong></td><td data-sort-value="${escapeHtml(battueTargetText(targetTypes,item.target_type).toLowerCase())}">${escapeHtml(battueTargetText(targetTypes,item.target_type))}${item.target_text?`<br><small>${escapeHtml(item.target_text)}</small>`:''}</td><td data-sort-value="${escapeHtml((item.start_name||'').toLowerCase())}">${escapeHtml(item.start_name)}<br><small>${escapeHtml(item.start_insee_code)}</small></td><td data-sort-value="${escapeHtml(battueStatusText(item.status))}">${battueStatusText(item.status)}</td><td>${plural(Number(item.item_count||0),'annotation')}<br><small>${Number(item.todo_count||0)} à chercher · niveau ${Number(item.max_level||0)}</small></td><td><button class="button small" data-open-battue="${item.id}">Ouvrir</button></td></tr>`).join('')}</tbody></table></div>`;
    }
    async function renderBattueDetail(id,token=++state.workspaceToken){
        const data=await api('battue_detail',{id});
        if(token!==state.workspaceToken||state.module!=='enquetes'||state.enquetesTab!=='battue')return;
        state.currentBattueDetail=data;
        state.battueTargetTypes=data.target_types||state.battueTargetTypes;
        const b=data.battue, communes=data.communes||[];
        const levels=Object.keys(data.levels||{}).map(Number).sort((a,b)=>a-b);
        $('#workspace').innerHTML=`<section class="page battue-page battue-detail"><header class="page-header"><div><button class="back-link" id="back-battues">← Toutes les battues</button><span class="eyebrow">BATTUE</span><h2>${escapeHtml(b.title)}</h2><p>${escapeHtml(battueTargetText(data.target_types,b.target_type))}${b.target_text?` · ${escapeHtml(b.target_text)}`:''} · départ ${escapeHtml(b.start_name)} (${escapeHtml(b.start_insee_code)})</p></div><div class="page-actions"><button class="button secondary" id="edit-battue">Modifier</button><button class="button danger" id="delete-battue">Supprimer</button></div></header>
        <div class="battue-map-panel">${battueMapHtml(communes)}</div>
        <div class="battue-overview-row">${battueCommuneFilterHtml(data.commune_statuses)}${battueLevelProgressHtml(levels,communes)}</div>
        <div class="battue-levels">${levels.map(level=>battueLevelHtml(level,communes.filter(c=>Number(c.level)===level),data)).join('')}</div></section>`;
        bindBattueDetail(data);
    }

    function battueBounds(communes){
        let minLon=Infinity,minLat=Infinity,maxLon=-Infinity,maxLat=-Infinity;
        communes.forEach(c=>{minLon=Math.min(minLon,Number(c.min_lon));minLat=Math.min(minLat,Number(c.min_lat));maxLon=Math.max(maxLon,Number(c.max_lon));maxLat=Math.max(maxLat,Number(c.max_lat));});
        if(!isFinite(minLon))return {minLon:-5,minLat:41,maxLon:9,maxLat:51};
        const padLon=Math.max((maxLon-minLon)*.08,.02),padLat=Math.max((maxLat-minLat)*.08,.02);
        return {minLon:minLon-padLon,minLat:minLat-padLat,maxLon:maxLon+padLon,maxLat:maxLat+padLat};
    }
    function battuePathForRing(ring,bounds,w,h){
        if(!Array.isArray(ring)||ring.length<2)return '';
        return ring.map((pt,i)=>{
            const lon=Number(pt[0]),lat=Number(pt[1]);
            const x=((lon-bounds.minLon)/(bounds.maxLon-bounds.minLon))*w;
            const y=h-((lat-bounds.minLat)/(bounds.maxLat-bounds.minLat))*h;
            return `${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ')+' Z';
    }
    function battueGeometryPaths(geometry,bounds,w,h){
        if(!geometry)return [];
        if(geometry.type==='Polygon')return (geometry.coordinates||[]).slice(0,1).map(ring=>battuePathForRing(ring,bounds,w,h)).filter(Boolean);
        if(geometry.type==='MultiPolygon')return (geometry.coordinates||[]).flatMap(poly=>(poly||[]).slice(0,1).map(ring=>battuePathForRing(ring,bounds,w,h))).filter(Boolean);
        return [];
    }
    function battueDistanceScale(bounds){
        const midLat=(bounds.minLat+bounds.maxLat)/2;
        const kmPerLonDegree=111.32*Math.max(.1,Math.cos(midLat*Math.PI/180));
        const mapKm=Math.max(.001,(bounds.maxLon-bounds.minLon)*kmPerLonDegree);
        const targetKm=mapKm*.18;
        const power=Math.pow(10,Math.floor(Math.log10(targetKm)));
        const nice=[1,2,5,10].map(step=>step*power).find(value=>value>=targetKm)||10*power;
        const width=Math.max(4,Math.min(38,(nice/mapKm)*100));
        const label=nice<1?`${Math.round(nice*1000)} m`:`${nice>=10?Math.round(nice):Number(nice.toFixed(1)).toLocaleString('fr-FR')} km`;
        return {width,label};
    }
    function battueMapHtml(communes){
        const w=1000,h=560,bounds=battueBounds(communes);
        const scale=battueDistanceScale(bounds);
        const paths=communes.flatMap(c=>battueGeometryPaths(c.geometry,bounds,w,h).map(d=>`<path d="${d}" class="battue-map-shape level-${Number(c.level)} commune-status-${escapeHtml(c.commune_status||'not_started')}" data-map-commune="${escapeHtml(c.insee_code)}" data-map-name="${escapeHtml(c.name)}" data-map-country="${escapeHtml(c.country||'')}" data-map-level="${Number(c.level)}" data-commune-status="${escapeHtml(c.commune_status||'not_started')}" tabindex="0"><title>${escapeHtml(c.name)}${c.country?` (${escapeHtml(c.country)})`:''} · niveau ${Number(c.level)}</title></path>`)).join('');
        return `<div class="battue-map-distance-scale" aria-label="Échelle de distance"><span>Échelle</span><strong>${escapeHtml(scale.label)}</strong><i style="width:${scale.width.toFixed(2)}%"></i></div><div class="battue-map-hover" id="battue-map-hover"><span>Commune</span><strong>Survole la carte</strong><small>Nom, pays et niveau</small></div><svg class="battue-map" viewBox="0 0 ${w} ${h}" role="img" aria-label="Carte des communes de la battue">${paths}</svg><div class="battue-map-legend">${battueMapLevels.map(level=>`<span><i class="level-${level}"></i>Niveau ${level}</span>`).join('')}<button type="button" class="button small secondary battue-colors-button" id="open-battue-level-colors">Couleurs</button><span class="battue-scale">Contours locaux · voisinage par frontière commune</span><span class="battue-boundary-note">Bord sans voisine : limite extérieure possible (mer/océan ou frontière)</span></div>`;
    }
    function battueCommuneFilterHtml(statuses){
        const filters=[['all','Tous'],...Object.entries(statuses||{})];
        const active=state.battueCommuneFilter||'all';
        return `<div class="battue-filter-panel"><span class="eyebrow">ÉTAT DES VILLES</span><div class="battue-filter-options">${filters.map(([value,label])=>`<label class="battue-filter-option ${active===value?'is-active':''}"><input type="checkbox" data-battue-filter="${escapeHtml(value)}" ${active===value?'checked':''}> ${escapeHtml(label)}</label>`).join('')}</div></div>`;
    }
    function battueLevelProgressHtml(levels,communes){
        const rows=levels.map(level=>{
            const list=communes.filter(item=>Number(item.level)===Number(level));
            const done=list.filter(item=>(item.commune_status||'not_started')==='done').length;
            const complete=list.length&&done===list.length;
            return `<span class="battue-level-progress ${complete?'is-done':''}" data-battue-level-progress="${level}"><strong>Niveau ${level}</strong><em>${done}/${list.length}</em>${complete?'<b>Terminé</b>':''}</span>`;
        }).join('');
        return `<div class="battue-level-progress-panel"><span class="eyebrow">NIVEAUX TERMINÉS</span><div class="battue-level-progress-list">${rows}</div></div>`;
    }
    function battueLevelHtml(level,communes,data){
        const done=communes.length&&communes.every(c=>(c.commune_status||'not_started')==='done');
        return `<section class="battue-level" data-battue-level="${level}"><div class="section-title"><div><span class="eyebrow">NIVEAU ${level}</span><div class="battue-level-heading" data-battue-level-heading="${level}"><h3>${plural(communes.length,'commune')}</h3>${done?'<span class="battue-level-done">Terminé</span>':''}</div></div></div><div class="battue-commune-list">${communes.map(c=>battueCommuneHtml(c,data)).join('')}</div></section>`;
    }
    function battueItemSortValue(item){const text=String(item.period||item.title||'');const found=text.match(/\d{3,4}/);return found?Number(found[0]):999999;}
    function battueItemHtml(item,data){
        const mediaCount=(item.media||[]).length;
        const digestLinks=(item.archive_digests||[]).map(digest=>`<button type="button" class="table-link battue-digest-link" data-open-battue-archive-digest="${digest.id}">Suivi lié : ${escapeHtml(archiveDigestOptionLabel(digest))}</button>`).join('');
        return `<div class="battue-item"><div><strong>${battueSearchTitle(item,data.target_types,data.statuses)}</strong>${item.register?`<small class="battue-register">${escapeHtml(item.register)}</small>`:''}${digestLinks}${item.note?`<p>${escapeHtml(item.note)}</p>`:''}${item.url?`<a class="table-link" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener">Ouvrir la source</a>`:''}${mediaCount?`<small class="battue-register">${plural(mediaCount,'média lié','médias liés')}</small>`:''}</div><div class="page-actions"><button type="button" class="button small secondary" data-add-battue-media="${item.id}">＋ Média</button>${actionButton('edit','Modifier',`data-edit-battue-item="${item.id}"`)}${actionButton('delete','Supprimer',`data-delete-battue-item="${item.id}"`)}</div></div>`;
    }
    function battueMediaGroupKey(commune,groupId){return `${commune.insee_code}::${groupId||'current'}`;}
    function battueMediaForGroup(commune,groupId){
        const expected=groupId==='current'?'':String(groupId||'');
        return (commune.items||[])
            .filter(item=>expected?String(item.alias_id||'')===expected:!Number(item.alias_id))
            .flatMap(item=>(item.media||[]).map(media=>({...media,attachment_label:media.attachment_label||`${item.title||battueTargetText(state.currentBattueDetail?.target_types,item.record_type)} · ${item.period||''}`.trim()})));
    }
    function battueMediaByGroupKey(key){
        const [insee,groupId='current']=String(key||'').split('::');
        const commune=(state.currentBattueDetail?.communes||[]).find(item=>String(item.insee_code)===String(insee));
        return commune?battueMediaForGroup(commune,groupId):[];
    }
    function battueMediaGalleryHtml(commune,groupId){
        const media=battueMediaForGroup(commune,groupId);
        if(!media.length)return '';
        const key=battueMediaGroupKey(commune,groupId);
        return `<div class="battue-media-gallery" data-battue-media-panel="${escapeHtml(key)}" hidden>${media.map((item,index)=>`<button type="button" class="battue-media-thumb" data-open-battue-media="${escapeHtml(key)}" data-media-index="${index}" title="${escapeHtml(item.title||item.filename||'Média')}">${normalizedMediaType(item)==='image'?`<img src="media/${encodeURIComponent(item.thumbnail||item.filename)}" alt="${escapeHtml(item.title||'Média lié')}">`:`<span class="pdf-mark">${mediaTypeShortLabelWithIcon(item)}</span>`}<span>${escapeHtml(item.title||item.filename||'Document')}</span></button>`).join('')}</div>`;
    }
    function battueCommuneSearchGroupsHtml(commune,data){
        const aliases=commune.aliases||[],items=commune.items||[];
        const groups=[{id:'',name:`${commune.name} (commune actuelle)`,note:'',items:items.filter(item=>!Number(item.alias_id))},...aliases.map(alias=>({id:String(alias.id),name:alias.name,note:alias.note||'',items:items.filter(item=>String(item.alias_id||'')===String(alias.id))}))];
        return `<div class="battue-subcommunes">${groups.map(group=>{const byType={};group.items.forEach(item=>{const key=item.record_type||'autre';(byType[key]||(byType[key]=[])).push(item);});const types=Object.keys(byType).sort((a,b)=>battueTargetText(data.target_types,a).localeCompare(battueTargetText(data.target_types,b),'fr',{sensitivity:'base'}));const groupId=group.id||'current';const mediaCount=battueMediaForGroup(commune,groupId).length;const mediaToggle=mediaCount?`<button type="button" class="button small secondary battue-media-toggle" data-battue-media-toggle="${escapeHtml(battueMediaGroupKey(commune,groupId))}">Voir médias (${mediaCount})</button>`:'';return `<section class="battue-subcommune"><header><div><h5>${escapeHtml(group.name)}</h5>${group.note?`<small>${escapeHtml(group.note)}</small>`:''}</div>${mediaToggle}</header>${battueMediaGalleryHtml(commune,groupId)}${types.length?types.map(type=>`<div class="battue-type-group"><h6>${escapeHtml(battueTargetText(data.target_types,type))}</h6>${byType[type].sort((a,b)=>battueItemSortValue(a)-battueItemSortValue(b)||String(a.period||'').localeCompare(String(b.period||''),'fr')).map(item=>battueItemHtml(item,data)).join('')}</div>`).join(''):'<small class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">Aucune annotation pour cette commune.</span></small>'}</section>`;}).join('')}</div>`;
    }
    function battueCommuneHtml(commune,data){
        const aliases=commune.aliases||[],items=commune.items||[];
        const counts=Object.entries(commune.status_counts||{}).map(([status,count])=>`<span>${escapeHtml(data.statuses?.[status]||status)} : ${count}</span>`).join('');
        const communeStatus=commune.commune_status||'not_started';
        const parishHint=window.LCNDA_EXT?.parishHint?.(commune.insee_code)||'';
        return `<article class="battue-commune commune-status-${escapeHtml(communeStatus)}" id="battue-commune-${escapeHtml(commune.insee_code)}" data-battue-commune-card="${escapeHtml(commune.insee_code)}" data-commune-status="${escapeHtml(communeStatus)}"><header><div><h4>${escapeHtml(commune.name)}</h4><small>INSEE ${escapeHtml(commune.insee_code)} · niveau ${Number(commune.level)}</small>${parishHint}</div><div class="battue-commune-controls"><label>État d'exploration<select data-battue-commune-status="${escapeHtml(commune.insee_code)}">${battueCommuneStatusOptions(data.commune_statuses,communeStatus)}</select></label><div class="page-actions"><button class="button small secondary" data-add-battue-alias="${escapeHtml(commune.insee_code)}">＋ Commune liée</button><button class="button small secondary" data-battue-registers="${escapeHtml(commune.insee_code)}" aria-expanded="false">Registres en ligne</button><button class="button small" data-add-battue-item="${escapeHtml(commune.insee_code)}">＋ Annotation</button></div></div></header><div class="battue-registers" data-battue-registers-panel="${escapeHtml(commune.insee_code)}" hidden></div><div class="battue-commune-status-line">${escapeHtml(battueCommuneStatusText(data.commune_statuses,communeStatus))}</div>${counts?`<div class="battue-counts">${counts}</div>`:''}<div class="battue-aliases">${aliases.map(alias=>`<span class="battue-chip">${escapeHtml(alias.name)}<button type="button" data-edit-battue-alias="${alias.id}" aria-label="Modifier">✎</button><button type="button" data-delete-battue-alias="${alias.id}" aria-label="Supprimer">×</button></span>`).join('')||'<small class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">Aucune ancienne commune liée.</span></small>'}</div>${battueCommuneSearchGroupsHtml(commune,data)}</article>`;
    }
    // « Registres en ligne » : services d'archives du pays ou de la région de la commune (liens seulement, rien n'est téléchargé)
    async function copyText(text){try{await navigator.clipboard.writeText(text);return true;}catch(_){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();let ok=false;try{ok=document.execCommand('copy');}catch(__){}area.remove();return ok;}}
    async function toggleBattueRegisters(button){
        const code=button.dataset.battueRegisters;
        const panel=document.querySelector(`[data-battue-registers-panel="${CSS.escape(code)}"]`);
        if(!panel)return;
        const open=panel.hidden;
        panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
        if(!open||panel.dataset.loaded)return;
        const commune=battueCommuneByInsee(code);
        const names=[commune?.name,...(commune?.aliases||[]).map(alias=>alias.name)].filter(Boolean).filter((name,index,list)=>list.indexOf(name)===index);
        panel.innerHTML='<small class="cell-muted">Recherche des services d\'archives…</small>';
        try{
            const result=await api('online_registers',{code,name:commune?.name||''});
            panel.dataset.loaded='1';
            const place=[result.region,result.country].filter(Boolean).join(', ');
            const nameChoice=names.length>1?`<label class="battue-registers-name">Nom à chercher<select data-registers-name>${names.map(name=>`<option>${escapeHtml(name)}</option>`).join('')}</select></label>`:'';
            panel.innerHTML=`<div class="battue-registers-head"><strong>Registres en ligne</strong>${place?`<small>${escapeHtml(place)}</small>`:''}${nameChoice}</div><ul>${(result.links||[]).map(link=>`<li><div><span class="battue-registers-label">${escapeHtml(link.label)}</span>${link.note?`<small>${escapeHtml(link.note)}</small>`:''}</div>${link.kind==='prefilled'?`<button type="button" class="button small" data-registers-open="${escapeHtml(link.url)}" data-registers-prefilled="1">Ouvrir sur ce lieu</button>`:`<button type="button" class="button small secondary" data-registers-open="${escapeHtml(link.url)}" title="Le nom de la commune est copié : colle-le dans la recherche du site.">Copier le nom et ouvrir</button>`}</li>`).join('')}</ul><small class="cell-muted">Liens vers les sites des archives : rien n'est téléchargé dans le logiciel. Certains sites demandent un compte gratuit.</small>`;
            panel.querySelectorAll('[data-registers-open]').forEach(link=>link.addEventListener('click',async()=>{
                const name=panel.querySelector('[data-registers-name]')?.value||commune?.name||'';
                let url=link.dataset.registersOpen;
                if(link.dataset.registersPrefilled&&name!==commune?.name)url=url.split(encodeURIComponent(commune?.name||'')).join(encodeURIComponent(name));
                if(!link.dataset.registersPrefilled){const ok=await copyText(name);toast(ok?`« ${name} » copié : colle-le dans la recherche du site.`:`Cherche « ${name} » sur le site.`);}
                window.open(url,'_blank','noopener');
            }));
        }catch(error){panel.innerHTML=`<small class="cell-muted">${escapeHtml(error.message)}</small>`;}
    }
    function battueCommuneByInsee(insee){return state.currentBattueDetail?.communes?.find(c=>String(c.insee_code)===String(insee));}
    function applyBattueCommuneFilter(){
        const active=state.battueCommuneFilter||'all';
        $$('.battue-filter-option').forEach(label=>{const input=label.querySelector('input');const selected=input?.dataset.battueFilter===active;label.classList.toggle('is-active',selected);if(input)input.checked=selected;});
        $$('[data-commune-status]').forEach(element=>{
            const status=element.dataset.communeStatus||'not_started';
            element.classList.toggle('is-filter-dimmed',active!=='all'&&status!==active);
        });
    }
    function updateBattueCommuneStatusInDom(insee,status,label){
        const card=document.querySelector(`[data-battue-commune-card="${CSS.escape(String(insee))}"]`);
        if(card){
            card.dataset.communeStatus=status;
            card.className=card.className.replace(/\bcommune-status-\S+/g,'').trim()+` commune-status-${status}`;
            const line=card.querySelector('.battue-commune-status-line');
            if(line)line.textContent=label;
        }
        $$(`[data-map-commune="${CSS.escape(String(insee))}"]`).forEach(path=>{
            path.dataset.communeStatus=status;
            path.className.baseVal=path.className.baseVal.replace(/\bcommune-status-\S+/g,'').trim()+` commune-status-${status}`;
        });
        const commune=state.currentBattueDetail?.communes?.find(item=>String(item.insee_code)===String(insee));
        if(commune){
            commune.commune_status=status;
            updateBattueLevelDoneInDom(commune.level);
        }
        applyBattueCommuneFilter();
    }
    function updateBattueLevelDoneInDom(level){
        const communes=(state.currentBattueDetail?.communes||[]).filter(item=>Number(item.level)===Number(level));
        const heading=document.querySelector(`[data-battue-level-heading="${CSS.escape(String(level))}"]`);
        if(!heading)return;
        const done=communes.length&&communes.every(item=>(item.commune_status||'not_started')==='done');
        const badge=heading.querySelector('.battue-level-done');
        if(done&&!badge)heading.insertAdjacentHTML('beforeend','<span class="battue-level-done">Terminé</span>');
        if(!done&&badge)badge.remove();
        const progress=document.querySelector(`[data-battue-level-progress="${CSS.escape(String(level))}"]`);
        if(progress){
            const doneCount=communes.filter(item=>(item.commune_status||'not_started')==='done').length;
            progress.classList.toggle('is-done',!!done);
            const count=progress.querySelector('em');
            if(count)count.textContent=`${doneCount}/${communes.length}`;
            let doneBadge=progress.querySelector('b');
            if(done&&!doneBadge)progress.insertAdjacentHTML('beforeend','<b>Terminé</b>');
            if(!done&&doneBadge)doneBadge.remove();
        }
    }
    function bindBattueDetail(data){
        $('#back-battues').addEventListener('click',()=>{state.currentBattueId=0;state.currentBattueDetail=null;persistUiState();renderBattues();});
        $('#edit-battue').addEventListener('click',()=>openBattueDialog({...data.battue,linked_persons:data.linked_persons||[],linked_investigations:data.linked_investigations||[]}));
        $('#delete-battue').addEventListener('click',async()=>{if(!await confirmBox('La battue et toutes ses annotations seront supprimées.',{title:'Supprimer cette battue ?',okLabel:'Supprimer la battue'}))return;await api('delete_battue',{},{method:'POST',body:{id:data.battue.id}});state.currentBattueId=0;toast('Battue supprimée.');persistUiState();renderBattues();});
        $('#open-battue-level-colors')?.addEventListener('click',()=>openBattueLevelColorsDialog());
        const hover=$('#battue-map-hover');
        const setHover=path=>{if(!hover||!path)return;hover.classList.add('is-active');const code=path.dataset.mapCommune||'';hover.innerHTML=`<span>Commune</span><strong>${escapeHtml(path.dataset.mapName||'')}</strong>${path.dataset.mapCountry?`<em class="battue-map-hover-country">${escapeHtml(path.dataset.mapCountry)}</em>`:''}<small>${/^[A-Z]{2}-/.test(code)?'Code':'INSEE'} ${escapeHtml(code)} · niveau ${escapeHtml(path.dataset.mapLevel||'')}</small>`;};
        const clearHover=()=>{if(!hover)return;hover.classList.remove('is-active');hover.innerHTML='<span>Commune</span><strong>Survole la carte</strong><small>Nom, pays et niveau</small>';};
        $('.battue-map')?.addEventListener('mousemove',event=>{const path=event.target.closest?.('[data-map-commune]');if(path)setHover(path);});
        $('.battue-map')?.addEventListener('mouseleave',clearHover);
        $$('[data-map-commune]').forEach(path=>{path.addEventListener('click',()=>document.getElementById(`battue-commune-${path.dataset.mapCommune}`)?.scrollIntoView({behavior:'smooth',block:'center'}));path.addEventListener('mouseenter',()=>setHover(path));path.addEventListener('focus',()=>setHover(path));path.addEventListener('mouseleave',clearHover);path.addEventListener('blur',clearHover);});
        $$('[data-battue-filter]').forEach(input=>input.addEventListener('change',()=>{
            state.battueCommuneFilter=input.dataset.battueFilter||'all';
            applyBattueCommuneFilter();
        }));
        $$('[data-battue-commune-status]').forEach(select=>select.addEventListener('change',async()=>{
            const insee=select.dataset.battueCommuneStatus;
            const status=select.value||'not_started';
            const label=data.commune_statuses?.[status]||'Pas commencé';
            select.disabled=true;
            try{
                await api('save_battue_commune_status',{},{method:'POST',body:{battue_id:data.battue.id,insee_code:insee,status}});
                updateBattueCommuneStatusInDom(insee,status,label);
                toast('État de la ville enregistré.');
            }catch(error){
                toast(error.message,'error');
            }finally{
                select.disabled=false;
            }
        }));
        applyBattueCommuneFilter();
        $$('[data-add-battue-alias]').forEach(button=>button.addEventListener('click',()=>openBattueAliasDialog(data.battue.id,battueCommuneByInsee(button.dataset.addBattueAlias))));
        $$('[data-edit-battue-alias]').forEach(button=>button.addEventListener('click',()=>{const aliasId=Number(button.dataset.editBattueAlias);const commune=data.communes.find(c=>(c.aliases||[]).some(a=>Number(a.id)===aliasId));const alias=commune?.aliases.find(a=>Number(a.id)===aliasId);if(commune&&alias)openBattueAliasDialog(data.battue.id,commune,alias);}));
        $$('[data-delete-battue-alias]').forEach(button=>button.addEventListener('click',async()=>{/* H7 : supprimé tout de suite, « ↶ Annuler » la remet */const aid=Number(button.dataset.deleteBattueAlias),bid=data.battue.id,del=()=>api('delete_battue_alias',{},{method:'POST',body:{id:aid}}),again=()=>{if(state.module==='enquetes'&&Number(state.currentBattueId)===Number(bid))return renderBattueDetail(bid);};try{await del();window.LCNDA_APP.undoDelete({type:'battue_alias',id:aid,message:'Commune liée retirée de la battue',redo:del,after:again});renderBattueDetail(bid);}catch(error){toast(error.message,'error');}}));
        $$('[data-add-battue-item]').forEach(button=>button.addEventListener('click',()=>openBattueSearchDialog(data.battue.id,battueCommuneByInsee(button.dataset.addBattueItem))));
        $$('[data-battue-registers]').forEach(button=>button.addEventListener('click',()=>toggleBattueRegisters(button)));
        $$('[data-edit-battue-item]').forEach(button=>button.addEventListener('click',()=>{const itemId=Number(button.dataset.editBattueItem);const commune=data.communes.find(c=>(c.items||[]).some(i=>Number(i.id)===itemId));const item=commune?.items.find(i=>Number(i.id)===itemId);if(commune&&item)openBattueSearchDialog(data.battue.id,commune,item);}));
        $$('[data-delete-battue-item]').forEach(button=>button.addEventListener('click',async()=>{/* H7 : supprimée tout de suite, « ↶ Annuler » la remet (avec ses médias) */const iid=Number(button.dataset.deleteBattueItem),bid=data.battue.id,del=()=>api('delete_battue_search_item',{},{method:'POST',body:{id:iid}}),again=()=>{if(state.module==='enquetes'&&Number(state.currentBattueId)===Number(bid))return renderBattueDetail(bid);};try{await del();window.LCNDA_APP.undoDelete({type:'battue_item',id:iid,message:'Annotation supprimée',redo:del,after:again});renderBattueDetail(bid);}catch(error){toast(error.message,'error');}}));
        $$('[data-add-battue-media]').forEach(button=>button.addEventListener('click',()=>{const itemId=Number(button.dataset.addBattueMedia);const commune=data.communes.find(c=>(c.items||[]).some(i=>Number(i.id)===itemId));const item=commune?.items.find(i=>Number(i.id)===itemId);if(item)openBattueMediaDialog(item);}));
        $$('[data-open-battue-archive-digest]').forEach(button=>button.addEventListener('click',()=>{
            state.researchKind='archive_digest';
            state.archiveDigestAdding=false;
            state.archiveDigestEditId=0;
            state.archiveDigestSearch={id:Number(button.dataset.openBattueArchiveDigest)||0,q:'',city:'',dept:'',region:'',recordType:'',status:''};
            persistUiState();
            setModule('recherche');
        }));
        $$('[data-battue-media-toggle]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.battueMediaToggle;const panel=document.querySelector(`[data-battue-media-panel="${CSS.escape(String(key))}"]`);if(!panel)return;panel.hidden=!panel.hidden;button.textContent=(panel.hidden?'Voir médias':'Masquer médias')+` (${battueMediaByGroupKey(key).length})`; }));
        $$('[data-open-battue-media]').forEach(button=>button.addEventListener('click',()=>{const media=battueMediaByGroupKey(button.dataset.openBattueMedia);const index=Number(button.dataset.mediaIndex)||0;if(media.length)openLightbox(media,index,false);}));
    }
    function investigationTable(rows){return rows.length?`<div class="data-table-wrap"><table class="data-table sortable-table" data-sortbar="enquête" data-sortbar-fem="1"><thead><tr><th><button data-sort-column="0">Personne</button></th><th><button data-sort-column="1">Recherche</button></th><th><button data-sort-column="2">État</button></th><th>Pistes</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr><td data-sort-value="${escapeHtml(row[0].toLowerCase())}">${escapeHtml(row[0])}</td><td data-sort-value="${escapeHtml(row[1].toLowerCase())}">${escapeHtml(row[1])}</td><td data-sort-value="${row[2]}">${row[2]}</td><td>${row[3]}</td><td><button class="button small" data-open-investigation="${row[4].investigationId}">Ouvrir</button></td></tr>`).join('')}</tbody></table></div>`:emptyState({text: 'Aucune enquête dans cette sélection.', icon:'🔍',hint:'Une enquête rassemble les pistes, médias et notes d’une question à résoudre.',action:{label:'＋ Nouvelle enquête',attrs:'data-empty-click="#new-investigation-global"'}});}
    function investigationItemMediaHtml(itemId,media){const linked=media.filter(file=>(file.item_ids||'').split(',').map(Number).includes(Number(itemId)));return linked.length?`<div class="investigation-item-media">${linked.map(file=>`<span class="investigation-item-media-wrap" style="position:relative;display:inline-block;">${normalizedMediaType(file)==='image'?`<img src="media/${encodeURIComponent(file.thumbnail||file.filename)}" alt="${escapeHtml(file.title||'Média lié')}">`:`<span class="pdf-mark" title="${escapeHtml(file.title||file.filename)}">${mediaTypeShortLabelWithIcon(file)}</span>`}<button type="button" class="investigation-media-unlink-from-item" data-unlink-media-from-item="${file.link_id}" data-inv-item-id="${itemId}" aria-label="Retirer ce média de la piste" title="Retirer ce média de la piste" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--danger,#c0392b);color:#fff;border:none;cursor:pointer;font-size:10px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;">×</button></span>`).join('')}<small>${plural(linked.length,'média lié','médias liés')}</small></div>`:'<small class="empty-line"><span class="empty-line-ico" aria-hidden="true">🖼️</span><span class="empty-line-text">Aucun média lié</span></small>';}
    function investigationFolderChildren(folders,parentId){return folders.filter(folder=>(Number(folder.parent_id)||0)===(Number(parentId)||0));}
    function investigationMediaInFolder(mediaList,folderId){return mediaList.filter(item=>(Number(item.folder_id)||0)===(Number(folderId)||0));}
    function investigationFolderCardsHtml(folders,parentId,sortAsc){
        const children=[...investigationFolderChildren(folders,parentId)].sort((a,b)=>{const cmp=a.name.localeCompare(b.name,'fr',{sensitivity:'base'});return sortAsc===false?-cmp:cmp;});
        if(!children.length)return '';
        return `<div class="investigation-folder-grid">${children.map(folder=>`<article class="investigation-folder" data-folder-drop="${folder.id}"><button type="button" class="investigation-folder-open" data-open-folder="${folder.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg><span>${escapeHtml(folder.name)}</span><small>${plural(Number(folder.media_count||0),'média')}${Number(folder.subfolder_count||0)?` · ${plural(folder.subfolder_count,'sous-dossier')}`:''}</small></button><div class="investigation-folder-actions">${actionButton('edit','Renommer le dossier',`data-rename-folder="${folder.id}"`)}${actionButton('delete','Supprimer le dossier',`data-delete-folder="${folder.id}"`)}</div></article>`).join('')}</div>`;
    }
    function investigationFolderBreadcrumbHtml(folders,folderId){
        if(!folderId)return '';
        const path=investigationFolderPath(folders,folderId);
        const crumbs=[`<button type="button" class="investigation-folder-crumb" data-open-folder="0">Pièces</button>`,...path.map(folder=>`<button type="button" class="investigation-folder-crumb" data-open-folder="${folder.id}">${escapeHtml(folder.name)}</button>`)];
        return `<div class="investigation-folder-breadcrumb">${crumbs.join('<span class="investigation-folder-sep">/</span>')}</div>`;
    }
    function investigationFolderTotalMediaCount(folders,mediaList,folderId){
        let total=investigationMediaInFolder(mediaList,folderId).length;
        for(const child of investigationFolderChildren(folders,folderId))total+=investigationFolderTotalMediaCount(folders,mediaList,child.id);
        return total;
    }
    function investigationFolderTreeHtml(folders,mediaList,parentId,activeFolderId,depth=0){
        const children=investigationFolderChildren(folders,parentId);
        if(!children.length)return '';
        return `<ul class="investigation-folder-tree"${depth===0?' role="tree"':''}>${children.map(folder=>{
            const total=investigationFolderTotalMediaCount(folders,mediaList,folder.id);
            const direct=investigationMediaInFolder(mediaList,folder.id).length;
            const hasChildren=investigationFolderChildren(folders,folder.id).length>0;
            const countLabel=hasChildren&&total!==direct?`${plural(total,'média')} au total`:`${plural(direct,'média')}`;
            return `<li><button type="button" class="investigation-folder-tree-row${Number(folder.id)===Number(activeFolderId)?' is-active':''}" data-open-folder="${folder.id}" data-folder-drop="${folder.id}"><span class="investigation-folder-tree-icon" aria-hidden="true">📁</span><span class="investigation-folder-tree-name">${escapeHtml(folder.name)}</span><span class="investigation-folder-tree-count">${countLabel}</span></button>${investigationFolderTreeHtml(folders,mediaList,folder.id,activeFolderId,depth+1)}</li>`;
        }).join('')}</ul>`;
    }
    function investigationFolderTreePanelHtml(folders,mediaList,activeFolderId){
        if(!folders.length)return '';
        const rootCount=investigationMediaInFolder(mediaList,0).length;
        return `<details class="investigation-folder-tree-panel"><summary>Voir l’arborescence complète des dossiers</summary><div class="investigation-folder-tree-wrap"><button type="button" class="investigation-folder-tree-row investigation-folder-tree-root${activeFolderId===0?' is-active':''}" data-open-folder="0"><span class="investigation-folder-tree-icon" aria-hidden="true">🗂️</span><span class="investigation-folder-tree-name">Racine des pièces</span><span class="investigation-folder-tree-count">${plural(rootCount,'média')} à la racine</span></button>${investigationFolderTreeHtml(folders,mediaList,0,activeFolderId)}</div></details>`;
    }
    function bindInvestigationFolderEvents(investigationId,folders,visibleMedia=[]){
        $$('[data-open-investigation-media]').forEach(button=>button.addEventListener('click',()=>openLightbox(visibleMedia,Number(button.dataset.openInvestigationMedia))));$$('[data-play-investigation-media]').forEach(button=>button.addEventListener('click',()=>window.LCNDA_EXT?.playMedia?.(visibleMedia.map(m=>({...m,kind:normalizedMediaType(m)})),Number(button.dataset.playInvestigationMedia),{subtitle:m=>m.reason||''})));
        $$('[data-open-folder]').forEach(button=>button.addEventListener('click',()=>{state.investigationFolderId=Number(button.dataset.openFolder)||0;renderInvestigationDetail(investigationId);}));$('#folder-sort-btn')?.addEventListener('click',()=>{state.folderSortAsc=state.folderSortAsc===false?true:false;renderInvestigationDetail(investigationId);});
        $('#new-investigation-folder')?.addEventListener('click',async()=>{
            const name=await askText({title:'Nouveau dossier',message:'Nom du nouveau dossier :',okLabel:'Créer'});
            if(!name||!name.trim())return;
            try{await api('save_investigation_media_folder',{},{method:'POST',body:{investigation_id:investigationId,parent_id:state.investigationFolderId||'',name:name.trim()}});renderInvestigationDetail(investigationId);}
            catch(error){toast(error.message,'error');}
        });
        $$('[data-rename-folder]').forEach(button=>button.addEventListener('click',async event=>{
            event.stopPropagation();
            const folderId=Number(button.dataset.renameFolder);
            const folder=folders.find(item=>Number(item.id)===folderId);
            const name=await askText({title:'Renommer le dossier',message:'Nouveau nom du dossier :',value:folder?.name||'',okLabel:'Renommer'});
            if(!name||!name.trim())return;
            try{await api('save_investigation_media_folder',{},{method:'POST',body:{id:folderId,name:name.trim()}});renderInvestigationDetail(investigationId);}
            catch(error){toast(error.message,'error');}
        }));
        $$('[data-delete-folder]').forEach(button=>button.addEventListener('click',async event=>{
            event.stopPropagation();
            const folderId=Number(button.dataset.deleteFolder);
            if(!await confirmBox('Son contenu (médias et sous-dossiers) remontera au niveau au-dessus.',{title:'Supprimer ce dossier ?',okLabel:'Supprimer le dossier'}))return;
            try{await api('delete_investigation_media_folder',{},{method:'POST',body:{id:folderId}});renderInvestigationDetail(investigationId);}
            catch(error){toast(error.message,'error');}
        }));
        $$('[data-move-media]').forEach(select=>select.addEventListener('change',async()=>{
            const linkId=Number(select.dataset.moveMedia);
            const folderId=select.value;
            try{await api('move_investigation_media',{},{method:'POST',body:{link_id:linkId,folder_id:folderId}});renderInvestigationDetail(investigationId);}
            catch(error){toast(error.message,'error');select.value='';}
        }));
        // Glisser-déposer : un média glissé sur une carte-dossier (ou sur le fil d'ariane) s'y range.
        $$('.investigation-media[draggable="true"]').forEach(card=>{
            card.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/investigation-link-id',card.dataset.linkId);event.dataTransfer.effectAllowed='move';card.classList.add('is-dragging');});
            card.addEventListener('dragend',()=>card.classList.remove('is-dragging'));
        });
        const dropTargets=[...$$('[data-folder-drop]'),...$$('[data-open-folder]')];
        dropTargets.forEach(target=>{
            target.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('text/investigation-link-id')){event.preventDefault();target.classList.add('is-drop-target');}});
            target.addEventListener('dragleave',()=>target.classList.remove('is-drop-target'));
            target.addEventListener('drop',async event=>{
                event.preventDefault();target.classList.remove('is-drop-target');
                const linkId=Number(event.dataTransfer.getData('text/investigation-link-id'));
                if(!linkId)return;
                const folderId=target.dataset.folderDrop||target.dataset.openFolder||'';
                try{await api('move_investigation_media',{},{method:'POST',body:{link_id:linkId,folder_id:folderId}});renderInvestigationDetail(investigationId);}
                catch(error){toast(error.message,'error');}
            });
        });
    }
    function renderInvestigationReminderStates(items=[]){
        items.forEach(item=>{
            if(!item.reminder_due_at||item.reminder_mode==='none')return;
            const article=document.querySelector(`[data-item-id="${CSS.escape(String(item.id))}"]`);
            const badge=article?.querySelector('.investigation-item-reminder-badge');
            if(!badge||article.querySelector('.investigation-reminder-state'))return;
            const past=reminderIsPast(item),done=Number(item.reminder_done||0)===1;
            if(!past&&!done)return;
            badge.insertAdjacentHTML('afterend',`<span class="investigation-reminder-state ${done?'is-done':'is-late'}">${done?'Fait':'Non fait'}</span><button type="button" class="button small secondary investigation-reminder-toggle" data-reminder-done="${item.id}" data-done="${done?0:1}">${done?'Marquer non fait':'Marquer fait'}</button>`);
        });
        bindReminderButtons();
    }

    async function renderInvestigationDetail(id,token=++state.workspaceToken){const data=await api('investigation',{id});if(token!==state.workspaceToken||state.module!=='enquetes')return;const inv=data.investigation;const folders=data.folders||[];const linkedPersons=data.linked_persons||[];const linkedBattues=data.linked_battues||[];if(state.investigationFolderId&&!folders.some(folder=>Number(folder.id)===Number(state.investigationFolderId)))state.investigationFolderId=0;const activeFolderId=Number(state.investigationFolderId)||0;const visibleMedia=investigationMediaInFolder(data.media,activeFolderId).slice().sort((a,b)=>{const cmp=(a.title||a.filename||'').localeCompare((b.title||b.filename||''),'fr',{sensitivity:'base'});return state.folderSortAsc===false?-cmp:cmp;});const parentOfActive=activeFolderId?(folders.find(folder=>Number(folder.id)===activeFolderId)?.parent_id||0):0;$('#workspace').innerHTML=`<section class="page investigation-detail"><header class="page-header"><div><button class="back-link" id="back-investigations">← Toutes les enquêtes</button><span class="eyebrow">DOSSIER DE RECHERCHE</span><h2>${escapeHtml(inv.title)}</h2><button class="table-link" data-open-person="${inv.person_id}">${escapeHtml(inv.person_name)}</button>${(()=>{const primaries=linkedPersons.filter(p=>p.role==='primary');const secondaries=linkedPersons.filter(p=>p.role==='secondary');if(!linkedPersons.length)return '';let h='<div class="inv-linked-persons">';if(primaries.length)h+='<div class="inv-linked-persons-group"><span class="inv-linked-persons-label">Personnes principales</span><div class="inv-linked-persons-chips">'+primaries.map(p=>`<button class="table-link inv-linked-person-chip primary" data-open-person="${p.person_id}">${escapeHtml(p.person_name)}</button>`).join('')+"</div></div>";if(primaries.length&&secondaries.length)h+='<div class="inv-linked-persons-sep"></div>';if(secondaries.length)h+='<div class="inv-linked-persons-group"><span class="inv-linked-persons-label">Personnes secondaires</span><div class="inv-linked-persons-chips">'+secondaries.map(p=>`<button class="table-link inv-linked-person-chip secondary" data-open-person="${p.person_id}">${escapeHtml(p.person_name)}</button>`).join('')+"</div></div>";h+='</div>';return h;})()}</div><div class="page-actions"><button class="button secondary" id="edit-investigation">Modifier</button><button class="button danger" id="delete-investigation">Supprimer</button></div></header><div class="investigation-summary"><article><h3>Question</h3><p>${escapeHtml(inv.question||'—')}</p></article><article><h3>Ce que je sais</h3><p>${escapeHtml(inv.known_facts||'—')}</p></article><article><h3>Documents disponibles</h3><p>${escapeHtml(inv.documents||'—')}</p></article></div><div class="section-title"><div><span class="eyebrow">JOURNAL</span><h3>Pistes, liens et sources</h3></div><div class="page-actions" style="gap:.5rem;align-items:center"><label class="media-filter-label" style="font-size:.8em">Trier <select id="investigation-items-sort" class="button small secondary" style="padding:.3rem .6rem;font-size:.8em"><option value="kind">Par nature</option><option value="alpha">Alphabétique</option><option value="manual">Manuel (glisser-déposer)</option></select></label><button type="button" class="icon-action media-order-lock is-disabled" id="investigation-items-lock" data-locked="1" aria-label="Activer le glisser-déposer" title="Activer le glisser-déposer"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></button><select id="investigation-items-filter" class="button small secondary" style="padding:.3rem .6rem;font-size:.8em"><option value="">Tous les résultats</option><option value="no_closed">Tous sauf fermés</option><option value="no_explored">Tous sauf explorés</option><option value="no_closed_explored">Tous sauf fermés et explorés</option><option value="to_explore_priority">À explorer (prioritaire)</option><option value="to_explore">À explorer (pas prioritaire)</option><option value="promising">Prometteuses</option><option value="explored">Explorées</option><option value="closed">Fermées</option></select><button class="button small" id="add-investigation-item">＋ Ajouter</button></div></div><div class="investigation-items">${data.items.map(item=>{const kindLabels={'lead':'Piste','link':'Lien','source':'Source','document':'Document','note':'Note','event':'Événement'};const statusLabels={'promising':'Prometteuse','closed':'Fermée / écartée','to_explore_priority':'À explorer (prioritaire)','to_explore':'À explorer (pas prioritaire)','explored':'Explorée'};const kindLabel=kindLabels[item.kind]||item.kind;const statusLabel=statusLabels[item.status]||'Explorée';const hasUrl=!!(item.url&&item.url.trim());const hasNotes=!!(item.notes&&item.notes.trim());const hasReminder=!!(item.reminder_mode&&item.reminder_mode!=='none'&&item.reminder_due_at);const hasEvent=!!(item.linked_event_id&&Number(item.linked_event_id)>0);let urlLabel=item.url||'';if(hasUrl){try{urlLabel=new URL(item.url).hostname.replace(/^www\./,'');}catch(_){urlLabel=item.url;}}const reminderPrefix=item.reminder_mode==='before'?'Avant le ':item.reminder_mode==='after'?'Après le ':'Le ';return `<article class="investigation-item inv-item-framed ${item.status}" draggable="false" data-item-id="${item.id}"><span class="investigation-item-grip" aria-hidden="true" style="display:none;cursor:grab;color:var(--muted);font-size:1.1em;padding:0 .4rem;align-self:flex-start;padding-top:.15rem">⠿</span><div class="investigation-item-kind-col"><span class="investigation-item-kind-badge">${escapeHtml(kindLabel)}</span>${hasReminder?`<span class="investigation-item-reminder-badge" title="${escapeHtml(reminderPrefix+item.reminder_due_at)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>${escapeHtml(reminderPrefix)}${escapeHtml(item.reminder_due_at)}</span>`:''}</div><div class="investigation-item-body"><div class="investigation-item-head"><h4>${hasUrl?`<a href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>`:escapeHtml(item.title)}</h4><span class="investigation-item-status-badge status-${item.status}">${escapeHtml(statusLabel)}</span></div>${(hasUrl||hasEvent)?`<div class="investigation-item-meta">${hasUrl?`<a class="investigation-item-meta-pill is-link" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener" title="${escapeHtml(item.url)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 15l6-6M10 7l1-1a4 4 0 0 1 6 6l-1 1M14 17l-1 1a4 4 0 0 1-6-6l1-1"/></svg>${escapeHtml(urlLabel)}</a>`:''}${hasEvent?`<span class="investigation-item-meta-pill is-event" title="${escapeHtml(item.linked_event_label||'Événement lié')}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>${escapeHtml(item.linked_event_label||'Événement lié')}<button type="button" class="investigation-item-meta-pill-remove" data-unlink-event-from-item="${item.id}" aria-label="Retirer l’événement lié" title="Retirer l’événement lié">×</button></span>`:''}</div>`:''}${hasNotes?`<p class="investigation-item-notes">${escapeHtml(item.notes)}</p>`:''}${investigationItemMediaHtml(item.id,data.media)}<div class="investigation-item-actions"><button class="button small secondary" data-link-media-to-item="${item.id}">Relier un média</button><span style="display:inline-block;width:.75rem"></span><button class="button small secondary" data-link-event-to-item="${item.id}">Relier un événement</button></div></div><div style="display:flex;flex-direction:column;gap:.3rem;align-items:center"><button type="button" class="icon-action icon-edit" data-edit-investigation-item="${item.id}" aria-label="Modifier" title="Modifier"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9.5-13.5 4 4"/></svg></button>${actionButton('delete','Supprimer',`data-delete-investigation-item="${item.id}"`)}</div></article>`;}).join('')||emptyState({text: 'Aucune piste pour l’instant', icon:'🧭',hint:'Note chaque source consultée, même sans résultat.',action:{label:'＋ Ajouter une piste',attrs:'data-empty-click="#add-investigation-item"'}})}</div><div class="section-title"><div><span class="eyebrow">PIÈCES</span><h3>Médias évalués${data.media.length?` <span class="investigation-media-total">(${data.media.length})</span>`:''}</h3></div><div class="page-actions"><button class="button small secondary" id="new-investigation-folder">＋ Nouveau dossier</button><button class="button small" id="add-investigation-media">＋ Média existant</button><button class="button small" id="upload-investigation-media">＋ Nouveau média</button>${window.LCNDA_EXT?.recueilAttachDialog?'<button class="button small secondary" id="add-investigation-recueil" title="Relier tout ou partie d’un recueil (registre, liste photographiée…) à ce dossier">＋ Page d’un recueil</button>':''}</div></div>${investigationFolderBreadcrumbHtml(folders,activeFolderId)}${investigationFolderTreePanelHtml(folders,data.media,activeFolderId)}${activeFolderId?`<button type="button" class="back-link investigation-folder-back" data-open-folder="${parentOfActive}">← Dossier précédent</button>`:''}${folders.length>=1?`<div class="investigation-folder-sort-bar"><button type="button" class="button small secondary investigation-folder-sort" id="folder-sort-btn"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/></svg> ${state.folderSortAsc===false?"Z → A":"A → Z"}</button></div>`:''}${investigationFolderCardsHtml(folders,activeFolderId,state.folderSortAsc)}<div data-rc-host data-rc-type="investigation" data-rc-key="${inv.id}" data-rc-hide-empty data-rc-folder="${activeFolderId}" data-rc-folders="${escapeHtml(JSON.stringify(folders.map(folder=>({id:Number(folder.id),name:folder.name,depth:Math.max(0,investigationFolderPath(folders,folder.id).length-1)}))))}"></div><div class="investigation-media-grid">${visibleMedia.map((item,mediaIndex)=>`<article class="investigation-media ${item.verdict}" draggable="true" data-link-id="${item.link_id}"><button type="button" class="investigation-media-thumb" data-open-investigation-media="${mediaIndex}" aria-label="Voir le média en grand">${normalizedMediaType(item)==='image'?`<img src="media/${encodeURIComponent(item.thumbnail||item.filename)}" alt="">`:`<span class="pdf-mark">${mediaTypeShortLabelWithIcon(item)}</span>`}</button><div><strong>${escapeHtml(item.title||item.filename)}</strong><span>${item.verdict==='interesting'?'Intéressant':'Rejeté'}</span><p>${escapeHtml(item.reason)}</p>${['audio','video'].includes(normalizedMediaType(item))?`<button type="button" class="button small investigation-media-play" data-play-investigation-media="${mediaIndex}" title="Lire avec le lecteur (vitesse, ±, précédent / suivant)">▶ ${normalizedMediaType(item)==='video'?'Regarder':'Écouter'}</button>`:''}<small>${item.item_titles?`Pistes : ${escapeHtml(item.item_titles.split('|').join(', '))}`:'Aucune piste associée'}</small><button class="button small secondary" data-edit-media-items="${item.link_id}" data-media-id="${item.id}">Relier aux pistes</button><label class="investigation-media-move">Déplacer vers<select data-move-media="${item.link_id}"><option value="" ${!item.folder_id?'selected':''}>Racine de l’enquête</option>${folders.map(folder=>`<option value="${folder.id}" ${Number(item.folder_id)===Number(folder.id)?'selected':''}>${'— '.repeat(Math.max(0,investigationFolderPath(folders,folder.id).length-1))}${escapeHtml(folder.name)}</option>`).join('')}</select></label></div>${actionButton('delete','Retirer',`data-unlink-investigation-media="${item.link_id}"`)}</article>`).join('')||empty(activeFolderId?'Aucun média dans ce dossier.':'Aucun média évalué.')}</div></section>`;

        bindInvestigationLinks();renderInvestigationReminderStates(data.items);bindInvestigationFolderEvents(id,folders,visibleMedia);
        // E4 : des fichiers glissés (ou collés) sur l'enquête ouvrent la fenêtre d'import, fichiers déjà mis
        const invPage=$('.investigation-detail');if(invPage&&window.LCNDA_UI?.bindFileDrop)window.LCNDA_UI.bindFileDrop(invPage,files=>{window.LCNDA_APP.openInvestigationUploadDialog(id,inv.person_id,data.items,folders);window.LCNDA_APP.addMediaDialogFiles(files);},{accept:'image/*,application/pdf,audio/*,video/*,.aif,.aiff,.aifc'});$('#back-investigations').addEventListener('click',()=>{state.currentInvestigationId=0;state.investigationFolderId=0;renderInvestigations();});$('#edit-investigation').addEventListener('click',()=>openInvestigationDialog(inv.person_id,Object.assign({},inv,{linked_persons:linkedPersons,linked_battues:linkedBattues})));$('#delete-investigation').addEventListener('click',async()=>{if(!await confirmBox('L’enquête, ses pistes et son journal seront supprimés. Les personnes de la généalogie ne sont pas supprimées.',{title:'Supprimer cette enquête ?',okLabel:'Supprimer l’enquête'}))return;await api('delete_investigation',{}, {method:'POST',body:{id}});state.currentInvestigationId=0;state.investigationFolderId=0;renderInvestigations();});$('#add-investigation-item').addEventListener('click',()=>openInvestigationItemDialog(id));$('#add-investigation-media').addEventListener('click',()=>openInvestigationMediaDialog(id,inv.person_id,[],[],data.items,null,folders));$('#upload-investigation-media')?.addEventListener('click',()=>openInvestigationUploadDialog(id,inv.person_id,data.items,folders));$('#add-investigation-recueil')?.addEventListener('click',()=>window.LCNDA_EXT.recueilAttachDialog('investigation',String(id),()=>window.LCNDA_EXT.refreshRecueilHosts?.(),{folderId:activeFolderId}));$$('[data-link-media-to-item]').forEach(button=>button.addEventListener('click',()=>openInvestigationMediaDialog(id,inv.person_id,[],[Number(button.dataset.linkMediaToItem)],data.items,null,folders)));$$('[data-edit-media-items]').forEach(button=>button.addEventListener('click',()=>{const file=data.media.find(item=>Number(item.link_id)===Number(button.dataset.editMediaItems));openInvestigationMediaDialog(id,inv.person_id,[Number(button.dataset.mediaId)],(file?.item_ids||'').split(',').filter(Boolean).map(Number),data.items,file,folders);}));$$('[data-delete-investigation-item]').forEach(button=>button.addEventListener('click',async()=>{/* H7 : supprimée tout de suite, « ↶ Annuler » la remet */const iid=Number(button.dataset.deleteInvestigationItem),del=()=>api('delete_investigation_item',{}, {method:'POST',body:{id:iid}}),again=()=>{if(state.module==='enquetes'&&Number(state.currentInvestigationId)===Number(id))return renderInvestigationDetail(id);};try{await del();window.LCNDA_APP.undoDelete({type:'investigation_item',id:iid,message:'Piste supprimée',redo:del,after:again});renderInvestigationDetail(id);}catch(error){toast(error.message,'error');}}));$$('[data-unlink-investigation-media]').forEach(button=>button.addEventListener('click',async()=>{await api('unlink_investigation_media',{}, {method:'POST',body:{id:button.dataset.unlinkInvestigationMedia}});renderInvestigationDetail(id);}));
        $$('[data-unlink-media-from-item]').forEach(button=>button.addEventListener('click',async()=>{if(!await confirmBox('Le média reste dans l’enquête, il n’est plus lié à cette piste.',{title:'Retirer ce média de cette piste ?',okLabel:'Retirer'}))return;await api('unlink_media_from_investigation_item',{},{method:'POST',body:{link_id:button.dataset.unlinkMediaFromItem,item_id:button.dataset.invItemId}});renderInvestigationDetail(id);}));
        $$('[data-unlink-event-from-item]').forEach(button=>button.addEventListener('click',async event=>{event.stopPropagation();if(!await confirmBox('L’événement reste dans la généalogie, il n’est plus lié à cette piste.',{title:'Retirer l’événement lié ?',okLabel:'Retirer'}))return;await api('unlink_event_from_investigation_item',{},{method:'POST',body:{item_id:button.dataset.unlinkEventFromItem}});renderInvestigationDetail(id);}));
        // Edit investigation item
        $$('[data-edit-investigation-item]').forEach(button=>button.addEventListener('click',()=>{
            const itemId=Number(button.dataset.editInvestigationItem);
            const item=data.items.find(i=>Number(i.id)===itemId);if(!item)return;
            openInvestigationItemDialog(id,item);
        }));
        // Link event to item
        $$('[data-link-event-to-item]').forEach(button=>button.addEventListener('click',async()=>{
            const itemId=Number(button.dataset.linkEventToItem);
            openInvestigationItemEventDialog(id,itemId,inv.person_id,data.items);
        }));
        // ── Filter items by status ──────────────────────────────────────
        function applyInvestigationFilter(){
            const filter=$('#investigation-items-filter')?.value||'';
            $$('.investigation-item').forEach(article=>{
                const status=article.classList[1];
                let show=true;
                if(filter==='no_closed') show=status!=='closed';
                else if(filter==='no_explored') show=status!=='explored';
                else if(filter==='no_closed_explored') show=status!=='closed'&&status!=='explored';
                else if(filter) show=status===filter;
                article.style.display=show?'':'none';
            });
        }
        $('#investigation-items-filter')?.addEventListener('change',applyInvestigationFilter);

        // ── Sort items ───────────────────────────────────────────────
        const itemsContainer=$('.investigation-items');
        let invItemsDragEnabled=false;

        function sortInvestigationItems(mode){
            if(!itemsContainer)return;
            const articles=[...$$('.investigation-item',itemsContainer)];
            if(mode==='alpha'){
                articles.sort((a,b)=>{
                    const ta=a.querySelector('h4')?.textContent||'';
                    const tb=b.querySelector('h4')?.textContent||'';
                    return ta.localeCompare(tb,'fr',{sensitivity:'base'});
                });
                articles.forEach(a=>itemsContainer.append(a));
            }else if(mode==='kind'){
                const order={'lead':0,'source':1,'link':2,'document':3,'note':4,'event':5};
                articles.sort((a,b)=>{
                    const ka=(order[a.querySelector('span:not(.investigation-item-grip)')?.textContent?.toLowerCase()]??9);
                    const kb=(order[b.querySelector('span:not(.investigation-item-grip)')?.textContent?.toLowerCase()]??9);
                    return ka-kb||(a.querySelector('h4')?.textContent||'').localeCompare(b.querySelector('h4')?.textContent||'','fr',{sensitivity:'base'});
                });
                articles.forEach(a=>itemsContainer.append(a));
            }
            // manual: no re-sort, user drags
        }

        function setInvestigationDragMode(enabled){
            invItemsDragEnabled=enabled;
            $$('.investigation-item',itemsContainer).forEach(a=>{
                a.draggable=enabled;
                const grip=a.querySelector('.investigation-item-grip');
                if(grip)grip.style.display=enabled?'inline-block':'none';
            });
        }

        // Sort select change
        $('#investigation-items-sort')?.addEventListener('change',event=>{
            const mode=event.target.value;
            const lockBtn=$('#investigation-items-lock');
            const isManual=mode==='manual';
            if(lockBtn){
                lockBtn.dataset.locked=isManual?'0':'1';
                lockBtn.classList.toggle('is-unlocked',isManual);
                lockBtn.classList.toggle('is-disabled',!isManual);
                lockBtn.querySelector('svg').innerHTML=isManual
                    ?'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.3-2.2M12 14v3"/>'
                    :'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>';
                lockBtn.title=isManual?'Verrouiller le glisser-déposer':'Activer le glisser-déposer';
                lockBtn.setAttribute('aria-label',lockBtn.title);
            }
            setInvestigationDragMode(isManual);
            if(!isManual)sortInvestigationItems(mode);
        });

        // Lock button click (toggle drag on/off when in manual mode)
        $('#investigation-items-lock')?.addEventListener('click',()=>{
            const btn=$('#investigation-items-lock');
            const sortSel=$('#investigation-items-sort');
            if(!btn||sortSel?.value!=='manual')return;
            const locked=btn.dataset.locked==='1';
            const nowUnlocked=locked; // clicking unlocked → enabled
            btn.dataset.locked=nowUnlocked?'0':'1';
            btn.classList.toggle('is-unlocked',nowUnlocked);
            btn.classList.toggle('is-disabled',!nowUnlocked);
            btn.querySelector('svg').innerHTML=nowUnlocked
                ?'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.3-2.2M12 14v3"/>'
                :'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>';
            btn.title=nowUnlocked?'Verrouiller le glisser-déposer':'Activer le glisser-déposer';
            btn.setAttribute('aria-label',btn.title);
            setInvestigationDragMode(nowUnlocked);
        });

        // ── Drag-and-drop for items ──────────────────────────────────
        let invDragged=null;
        itemsContainer?.addEventListener('dragstart',event=>{
            const article=event.target.closest('.investigation-item[draggable="true"]');
            if(!article||!invItemsDragEnabled){event.preventDefault();return;}
            invDragged=article;article.classList.add('is-dragging');
            event.dataTransfer.effectAllowed='move';
        });
        itemsContainer?.addEventListener('dragover',event=>{
            if(!invDragged)return;event.preventDefault();
            const after=getInvDragAfter(itemsContainer,event.clientY);
            if(after==null)itemsContainer.append(invDragged);
            else itemsContainer.insertBefore(invDragged,after);
        });
        itemsContainer?.addEventListener('dragend',()=>{invDragged?.classList.remove('is-dragging');invDragged=null;});
        function getInvDragAfter(container,y){
            return $$('.investigation-item:not(.is-dragging)',container).reduce((closest,child)=>{
                const box=child.getBoundingClientRect();
                const offset=y-box.top-box.height/2;
                return offset<0&&offset>closest.offset?{offset,element:child}:closest;
            },{offset:Number.NEGATIVE_INFINITY,element:null}).element;
        }
    }
    function bindInvestigationLinks(){bindTableLinks();$$('[data-open-investigation]').forEach(button=>button.addEventListener('click',()=>{state.currentInvestigationId=Number(button.dataset.openInvestigation);state.investigationFolderId=0;persistUiState();renderInvestigations();}));}

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderInvestigations, renderInvestigationsSidebar, renderInvestigationDetail, renderBattues, renderBattueDetail});
    if (state.module === 'enquetes' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
