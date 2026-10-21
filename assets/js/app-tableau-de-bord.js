/* LCNDA — 🏠 Tableau de bord (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * La vue générale et ses widgets (cartes, fenêtres de réglage, ordre). Les réglages des widgets, partagés avec « Mes onglets » et les fiches, restent dans app.js.
 */
(() => {
    'use strict';
    const {$, $$, api, confirmBox, emptyState, plural, bindWebSearchPanels, bindWebSearchSitesEditors, card, censusStatusText, currentCustomTab, currentDashboardPage, dabovilleNumberFor, dashboardBaseType, dashboardBlockSettings, dashboardGroupItem, dashboardLineageCard, dashboardNewWidget, dashboardNormalizeWidget, dashboardPages, dashboardRecentPeople, dashboardSaintCard, dashboardWidgetInfo, dashboardWidgetLabel, dataRow, debounce, defaultDashboardBlockLimits, defaultDashboardBlocks, defaultDashboardBlockSpans, defaultPersonBlocks, empty, escapeHtml, familyMemoryCardHtml, familyObjectCardHtml, fillLineageWidgets, genderText, generationLabel, isUsableMapCoord, latToY, lifeText, lngToX, mapBackgroundValue, mapTileUrl, mediaPreviewHtml, mediaTypeShortLabelWithIcon, normalizedMediaType, openLightbox, orderedDashboardWidgetTypes, personBlockWidthChoices, personEventMap, personName, placeDisplay, readDesignSettings, readWebSearchSitesEditor, renderSidebar, restoreDoneText, saveDashboardBlockSettings, saveDashboardPages, setModule, sidebarSignal, sosaMap, sosaNumberFor, sosaNumbersText, sosaRootId, state, toast, webSearchPanelHtml, webSearchSettings, webSearchSitesEditor, years} = window.LCNDA_APP;
    // tableau de bord vide : « ＋ Ajouter un widget » montre la liste des widgets de la colonne de gauche (rouverte si besoin)
    document.addEventListener('click',event=>{if(!event.target.closest?.('[data-dash-empty-add]'))return;document.getElementById('app')?.classList.remove('sidebar-collapsed');const first=document.querySelector('[data-add-dashboard-widget]');if(first){first.scrollIntoView({behavior:'smooth',block:'center'});first.focus({preventScroll:true});}});
    function renderDashboardSidebar(content, footer) {
        const catalog=orderedDashboardWidgetTypes(false);
        content.innerHTML = `<div class="dashboard-widget-catalog"><div class="dashboard-widget-catalog-item dashboard-widget-overview is-active"><div><span>01</span><strong>Vue générale</strong></div></div>${catalog.map(([type,number,label])=>`<div class="dashboard-widget-catalog-item"><div><span>${escapeHtml(number)}</span><strong>${escapeHtml(label)}</strong></div><div class="dashboard-widget-catalog-actions"><button type="button" data-info-dashboard-widget="${escapeHtml(type)}" aria-label="Infos ${escapeHtml(label)}">i</button><button type="button" data-add-dashboard-widget="${escapeHtml(type)}" aria-label="Ajouter ${escapeHtml(label)}">+</button></div></div>`).join('')}</div>`;
        footer.innerHTML = `<div class="dashboard-footer-actions"><button class="button small secondary" id="dashboard-open-design">Apparence</button><button class="button small secondary" id="dashboard-reorder" title="Changer l’ordre des widgets de la vue générale">Réordonner les widgets</button><button class="button small secondary" id="dashboard-create-widget" title="Créer ton propre widget, de zéro ou à partir d’un widget existant">+ Créer un widget</button></div><span style="display:block;margin-top:9px">Widgets duplicables et configurables.</span>`;
        $$('[data-info-dashboard-widget]',content).forEach(button=>button.addEventListener('click',()=>toast(dashboardWidgetInfo[button.dataset.infoDashboardWidget]||dashboardWidgetLabel(button.dataset.infoDashboardWidget)),{signal:sidebarSignal()}));
        $$('[data-add-dashboard-widget]',content).forEach(button=>button.addEventListener('click',async()=>{
            const settings=dashboardBlockSettings();
            settings.widgets.push(dashboardNewWidget(button.dataset.addDashboardWidget));
            saveDashboardBlockSettings(settings);
            toast('Widget ajouté.');
            await renderDashboard();
        },{signal:sidebarSignal()}));
        $('#dashboard-open-design')?.addEventListener('click',()=>{state.maintenanceTab='design';setModule('maintenance');},{signal:sidebarSignal()});
        $('#dashboard-reorder')?.addEventListener('click',()=>openDashboardReorderDialog(),{signal:sidebarSignal()});
        $('#dashboard-create-widget')?.addEventListener('click',()=>{state.maintenanceTab='widget_editor';setModule('maintenance');},{signal:sidebarSignal()});
    }
    let dashboardCache=null;
    async function renderDashboard(token=++state.workspaceToken,{reuse=false}={}){
        const settings=dashboardBlockSettings();
        // Widget à soi qui « habille » un widget de l'app : il en reprend les données et l'affichage (titre, icône, couleur, texte à soi)
        const customDefs=window.LCNDA_EXT?.customWidgetDefs?.()||{};
        settings.widgets=settings.widgets.map(widget=>{const d=customDefs[widget.type];return d&&d.kind==='app'&&d.base&&defaultDashboardBlocks.some(item=>item[0]===d.base)?{...widget,type:d.base,cwDef:d.id}:widget;});
        const randomSeedOf=widget=>Number(widget.config?.randomSeed)||Math.abs([...String(widget.id)].reduce((sum,char)=>sum+char.charCodeAt(0),0))+1;
        const seedPairs=(types)=>settings.widgets.filter(widget=>types.includes(widget.type)&&widget.config?.personMode!=='specific').map(widget=>`${encodeURIComponent(widget.id)}:${randomSeedOf(widget)}`).join(',');
        const mediaSeedPairs=settings.widgets.filter(widget=>widget.type==='random_media'&&!Number(widget.config?.mediaId)).map(widget=>`${encodeURIComponent(widget.id)}:${randomSeedOf(widget)}`).join(',');
        const selectedPeople=[...new Set(settings.widgets.filter(widget=>['chosen_person','random_person','random_person_map','person_block','person_timeline','kinship_widget','session_goal'].includes(widget.type)&&Number(widget.config?.personId)>0).map(widget=>Number(widget.config.personId)).concat(settings.widgets.filter(widget=>widget.type==='kinship_widget'&&Number(widget.config?.personId2)>0).map(widget=>Number(widget.config.personId2))))];
        const branchName=(settings.widgets.find(widget=>widget.type==='branch_map'&&widget.config?.branchName)?.config?.branchName||'').trim();
        const dashParams={people:selectedPeople.join(','),branch:branchName||undefined,sosa_root_id:sosaRootId()||undefined,person_seeds:seedPairs(['random_person','person_block','person_timeline'])||undefined,media_seeds:mediaSeedPairs||undefined,person_map_seeds:seedPairs(['random_person_map'])||undefined};
        const cacheKey=JSON.stringify([dashParams,settings.widgets.filter(w=>w.type==='person_quiz').map(w=>[w.id,w.config,w.limit])]);
        const cached=reuse&&dashboardCache?.key===cacheKey?dashboardCache:null;
        const data=cached?cached.data:await api('dashboard',{seed:state.dashboardRandomSeed||Date.now(),...dashParams});
        if(token!==state.workspaceToken||state.module!=='dashboard')return;
        const quizData=cached?cached.quizData:{};
        const sosaIds=Object.keys(sosaMap()).filter(id=>Number(id)>0&&Number(sosaNumberFor(id))>0).join(',');
        if(!cached)await Promise.all(settings.widgets.filter(widget=>widget.type==='person_quiz').map(async widget=>{
            const config=widget.config||{};
            const personMode=config.personMode==='specific'?'specific':'random';
            const eventTypeIds=(Array.isArray(config.quizEventTypeIds)?config.quizEventTypeIds:[]).map(Number).filter(Boolean).join(',');
            try{
                const result=await api('dashboard_quiz',{
                    seed:randomSeedOf(widget),
                    person_id:personMode==='specific'?(Number(config.personId)||0):0,
                    choices:Math.max(3,Math.min(8,Number(widget.limit||defaultDashboardBlockLimits.person_quiz||4))),
                    event_type_ids:eventTypeIds,
                    sosa_only:config.quizSosaOnly?1:0,
                    sosa_ids:config.quizSosaOnly?sosaIds:''
                });
                quizData[widget.id]=result.quiz||null;
            }catch(_){quizData[widget.id]=null;}
        }));
        if(token!==state.workspaceToken||state.module!=='dashboard')return;
        dashboardCache={key:cacheKey,data,quizData};
        const personBlockIds=[...new Set(settings.widgets.filter(widget=>['person_block','person_timeline'].includes(widget.type)).map(widget=>widget.config?.personMode==='specific'?Number(widget.config.personId):Number(data.widget_people?.[widget.id]?.id||data.random_person?.id)).filter(Boolean))];
        const personBlockDetails={};
        // « Chercher sur internet » : la personne choisie, ou la dernière fiche consultée
        const webSearchPersonId=widget=>widget.config?.personMode==='specific'?Number(widget.config.personId)||0:Number(dashboardRecentPeople()[0]?.id)||0;
        settings.widgets.filter(widget=>['web_search','family_objects_widget','family_memories_widget','lineage_widget'].includes(widget.type)).forEach(widget=>{const id=webSearchPersonId(widget);if(id&&!personBlockIds.includes(id))personBlockIds.push(id);});
        const saintData=settings.widgets.some(widget=>widget.type==='saint_day')?await api('saint_of_day').catch(()=>null):null;
        const progressData=settings.widgets.some(widget=>widget.type==='research_progress')?await api('research_progress').catch(()=>null):null;
        await Promise.all(personBlockIds.map(async id=>{try{personBlockDetails[id]=await api('person',{id});}catch(_){personBlockDetails[id]=null;}}));
        if(token!==state.workspaceToken||state.module!=='dashboard')return;
        let index=1;
        const limit=widget=>Math.max(1,Number(widget.limit||defaultDashboardBlockLimits[widget.type]||6));
        const span=widget=>`span-${widget.width||defaultDashboardBlockSpans[widget.type]||'6'}`;
        const widgetPerson=widget=>widget.config?.personMode==='specific'||widget.type==='chosen_person'?data.selected_people?.[String(widget.config.personId)]||null:data.widget_people?.[widget.id]||data.random_person;
        const widgetPersonMap=widget=>widget.config?.personMode==='specific'?data.selected_person_maps?.[String(widget.config.personId)]||{}:data.widget_person_maps?.[widget.id]||data.random_person_map||{};
        const widgetPersonDetail=widget=>personBlockDetails[widget.config?.personMode==='specific'?Number(widget.config.personId):Number(data.widget_people?.[widget.id]?.id||data.random_person?.id)]||null;
        const blockRenderers={
            stats:widget=>dashboardStatsCard(String(index++).padStart(2,'0'),data.stats||{},span(widget)),
            upcoming:widget=>dashboardUpcomingCard(String(index++).padStart(2,'0'),(data.upcoming||[]).slice(0,limit(widget)),span(widget)),
            today:widget=>dashboardTodayCard(String(index++).padStart(2,'0'),(data.today||[]).slice(0,limit(widget)),span(widget)),
            reminders:widget=>dashboardRemindersCard(String(index++).padStart(2,'0'),(data.reminders||[]).slice(0,limit(widget)),span(widget)),
            recent_changes:widget=>dashboardChangesCard(String(index++).padStart(2,'0'),(data.recent_changes||[]).slice(0,limit(widget)),span(widget)),
            recent_deletions:widget=>dashboardDeletionsCard(String(index++).padStart(2,'0'),(data.recent_deletions||[]).slice(0,limit(widget)),span(widget)),
            locked_people:widget=>dashboardLockedPeopleCard(String(index++).padStart(2,'0'),(data.locked_people||[]).slice(0,limit(widget)),span(widget)),
            recent_people:widget=>dashboardRecentPeopleCard(String(index++).padStart(2,'0'),dashboardRecentPeople().slice(0,limit(widget)),span(widget)),
            random_person:widget=>dashboardRandomPersonCard(String(index++).padStart(2,'0'),widgetPerson(widget),span(widget),false,widget.id),
            chosen_person:widget=>dashboardRandomPersonCard(String(index++).padStart(2,'0'),widgetPerson(widget),span(widget),true,widget.id),
            web_search:widget=>dashboardWebSearchCard(String(index++).padStart(2,'0'),personBlockDetails[webSearchPersonId(widget)]||null,widget,span(widget)),
            saint_day:widget=>dashboardSaintCard(String(index++).padStart(2,'0'),saintData,span(widget)),
            lineage_widget:widget=>dashboardLineageCard(String(index++).padStart(2,'0'),widget,span(widget),webSearchPersonId(widget)),
            research_progress:widget=>dashboardProgressCard(String(index++).padStart(2,'0'),progressData,span(widget)),
            family_objects_widget:widget=>dashboardCollectionCard(String(index++).padStart(2,'0'),personBlockDetails[webSearchPersonId(widget)]||null,widget,span(widget),'objects'),
            family_memories_widget:widget=>dashboardCollectionCard(String(index++).padStart(2,'0'),personBlockDetails[webSearchPersonId(widget)]||null,widget,span(widget),'memories'),
            person_quiz:widget=>dashboardPersonQuizCard(String(index++).padStart(2,'0'),quizData[widget.id],span(widget),widget.id),
            person_block:widget=>dashboardPersonBlockCard(String(index++).padStart(2,'0'),widgetPersonDetail(widget),widget.config?.personBlockKey||'identity',span(widget),widget.config?.personMode==='specific',widget.id),
            random_media:widget=>dashboardRandomMediaCard(String(index++).padStart(2,'0'),data.widget_media?.[widget.id]||data.random_media,span(widget),widget.id),
            favorite_image:widget=>dashboardRandomMediaCard(String(index++).padStart(2,'0'),widget.config?.mediaId?{id:widget.config.mediaId,title:widget.config.mediaTitle,filename:widget.config.mediaFilename,thumbnail:widget.config.mediaThumbnail,media_type:'image',attachment_origin_label:widget.config.mediaOrigin||''}:null,span(widget),widget.id,true),
            favorites:widget=>dashboardFavoritesCard(String(index++).padStart(2,'0'),(data.favorites||[]).slice(0,limit(widget)),span(widget)),
            work:widget=>dashboardWorkCard(String(index++).padStart(2,'0'),data.work||{},span(widget)),
            completion:widget=>dashboardCompletionCard(String(index++).padStart(2,'0'),(data.completion||[]).slice(0,limit(widget)),span(widget)),
            persons_without_sources:widget=>dashboardPeopleIssueCard(String(index++).padStart(2,'0'),'Personnes sans source',(data.persons_without_sources||[]).slice(0,limit(widget)),span(widget),'Toutes les personnes récentes ont au moins une source.'),
            events_without_sources:widget=>dashboardEventSourceCard(String(index++).padStart(2,'0'),(data.events_without_sources||[]).slice(0,limit(widget)),span(widget)),
            events_without_media:widget=>dashboardEventIssueCard(String(index++).padStart(2,'0'),'Événements sans média',(data.events_without_media||[]).slice(0,limit(widget)),span(widget),'Tous les événements récents ont un média.'),
            recent_media:widget=>dashboardMediaIssueCard(String(index++).padStart(2,'0'),'Derniers médias ajoutés',(data.recent_media||[]).slice(0,limit(widget)),span(widget),'Aucun média.'),
            media_unlinked:widget=>dashboardMediaIssueCard(String(index++).padStart(2,'0'),'Médias non rattachés',(data.media_unlinked||[]).slice(0,limit(widget)),span(widget),'Aucun média isolé.'),
            media_to_transcribe:widget=>dashboardMediaIssueCard(String(index++).padStart(2,'0'),'Médias à transcrire',(data.media_to_transcribe||[]).slice(0,limit(widget)),span(widget),'Aucun média à transcrire.'),
            media_to_identify:widget=>dashboardMediaIssueCard(String(index++).padStart(2,'0'),'Médias à identifier',(data.media_to_identify||[]).slice(0,limit(widget)),span(widget),'Toutes les images récentes ont au moins une zone identifiée.'),
            signatures_to_compare:widget=>dashboardSignaturesToCompareCard(String(index++).padStart(2,'0'),(data.signatures_to_compare||[]).slice(0,limit(widget)),span(widget)),
            places_to_complete:widget=>dashboardPlacesToCompleteCard(String(index++).padStart(2,'0'),(data.places_to_complete||[]).slice(0,limit(widget)),span(widget)),
            branches_less_documented:widget=>dashboardBranchesCard(String(index++).padStart(2,'0'),(data.branches_less_documented||[]).slice(0,limit(widget)),span(widget)),
            couples_without_marriage:widget=>dashboardCouplesCard(String(index++).padStart(2,'0'),(data.couples_without_marriage||[]).slice(0,limit(widget)),span(widget)),
            children_missing_parents:widget=>dashboardPeopleIssueCard(String(index++).padStart(2,'0'),'Enfants sans parents complets',(data.children_missing_parents||[]).slice(0,limit(widget)),span(widget),'Aucune fiche récente avec parent manquant.'),
            consistency_issues:widget=>dashboardConsistencyCard(String(index++).padStart(2,'0'),(data.consistency_issues||[]).slice(0,limit(widget)),span(widget)),
            baptisms_without_sponsors:widget=>dashboardEventIssueCard(String(index++).padStart(2,'0'),'Baptêmes sans parrain/marraine',(data.baptisms_without_sponsors||[]).slice(0,limit(widget)),span(widget),'Aucun baptême récent sans parrain/marraine.'),
            sosa_missing_near:widget=>dashboardSosaMissingCard(String(index++).padStart(2,'0'),(data.sosa_missing_near||[]).slice(0,limit(widget)),span(widget)),
            battue_towns:widget=>dashboardBattueTownsCard(String(index++).padStart(2,'0'),(data.battue_towns||[]).slice(0,limit(widget)),span(widget)),
            battues_priority:widget=>dashboardBattuesPriorityCard(String(index++).padStart(2,'0'),(data.battues_priority||[]).slice(0,limit(widget)),span(widget)),
            sources_to_check:widget=>dashboardSourcesToCheckCard(String(index++).padStart(2,'0'),(data.sources_to_check||[]).slice(0,limit(widget)),span(widget)),
            archive_favorites:widget=>dashboardArchiveFavoritesCard(String(index++).padStart(2,'0'),(data.archive_favorites||[]).slice(0,limit(widget)),span(widget)),
            daily_research:widget=>dashboardDailyResearchCard(String(index++).padStart(2,'0'),(data.daily_research||[]).slice(0,limit(widget)),span(widget)),
            reread_items:widget=>dashboardRereadCard(String(index++).padStart(2,'0'),(data.reread_items||[]).slice(0,limit(widget)),span(widget)),
            sosa_progress:widget=>dashboardSosaProgressCard(String(index++).padStart(2,'0'),data.sosa_progress||{},span(widget)),
            duplicates:widget=>dashboardDuplicatesCard(String(index++).padStart(2,'0'),(data.duplicates||[]).slice(0,limit(widget)),span(widget)),
            labels:widget=>dashboardLabelsCard(String(index++).padStart(2,'0'),(data.labels_overview||[]).slice(0,limit(widget)),span(widget)),
            map_overview:widget=>dashboardMapCard(String(index++).padStart(2,'0'),'Carte globale',data.map_overview||{},span(widget),limit(widget)),
            branch_map:widget=>dashboardMapCard(String(index++).padStart(2,'0'),`Carte d’une branche${data.branch_map?.branch?` · ${data.branch_map.branch}`:''}`,data.branch_map||{},span(widget),limit(widget)),
            random_person_map:widget=>dashboardPersonMapCard(String(index++).padStart(2,'0'),widgetPersonMap(widget),span(widget),limit(widget),widget.config?.personMode==='specific',widget.id),
            person_timeline:widget=>dashboardPersonTimelineCard(String(index++).padStart(2,'0'),widgetPersonDetail(widget),span(widget),limit(widget),widget.config?.personMode==='specific',widget.id),
            kinship_widget:widget=>dashboardKinshipWidgetCard(String(index++).padStart(2,'0'),data.selected_people?.[String(widget.config?.personId)]||null,data.selected_people?.[String(widget.config?.personId2)]||null,span(widget)),
            quick_stat:widget=>dashboardQuickStatCard(String(index++).padStart(2,'0'),data,widget.config?.quickStat||'persons',span(widget)),
            session_goal:widget=>dashboardSessionGoalCard(String(index++).padStart(2,'0'),widget.config?.sessionGoal||'',span(widget),data.selected_people?.[String(widget.config?.personId)]||null),
            achievements:widget=>dashboardAchievementsCard(String(index++).padStart(2,'0'),data,span(widget)),
            coverage:widget=>dashboardCoverageCard(String(index++).padStart(2,'0'),data.coverage||{},span(widget)),
            places:widget=>dashboardPlacesCard(String(index++).padStart(2,'0'),(data.top_places||[]).slice(0,limit(widget)),span(widget))
        };
        // Widgets ajoutés par assets/js/heritage.js : chacun charge ses données une fois
        const extDashboard=window.LCNDA_EXT?.dashboard||{};const extData={};
        await Promise.all([...new Set(settings.widgets.map(widget=>widget.type).filter(type=>extDashboard[type]))].map(async type=>{try{extData[type]=extDashboard[type].load?await extDashboard[type].load():null;}catch(_){extData[type]=null;}}));
        if(token!==state.workspaceToken||state.module!=='dashboard')return;
        Object.keys(extDashboard).forEach(type=>{blockRenderers[type]=widget=>extDashboard[type].render(String(index++).padStart(2,'0'),widget,span(widget),extData[type]);});
        const dress=(widget,html)=>widget.cwDef&&window.LCNDA_EXT?.dressWidget?window.LCNDA_EXT.dressWidget(customDefs[widget.cwDef],html):html;
        // Ensembles : un cadre fin, son titre (qui reste quand on le replie) et ses widgets ; les sous-ensembles dedans
        let blocks='';const open=[];let hiddenFrom=null;
        const closeTo=depth=>{while(open.length&&open[open.length-1]>=depth){open.pop();blocks+='</div></section>';}if(hiddenFrom!==null&&open.length<=hiddenFrom)hiddenFrom=null;};
        settings.widgets.forEach(widget=>{
            if(widget.type==='__group'){
                const c=widget.config||{};closeTo(c.depth);
                if(hiddenFrom!==null){open.push(c.depth);blocks+='<section hidden><div>';return;} // dans un ensemble replié
                blocks+=`<section class="dash-group span-12 depth-${c.depth}${c.collapsed?' is-collapsed':''}" data-dash-group="${escapeHtml(widget.id)}"><button type="button" class="dash-group-toggle" data-dash-group-toggle="${escapeHtml(widget.id)}" aria-expanded="${c.collapsed?'false':'true'}" title="${c.collapsed?'Ouvrir':'Fermer'}">${c.collapsed?'▸':'▾'}</button><header class="dash-group-head"><h3>${escapeHtml(c.title||'Ensemble')}</h3></header><div class="card-grid dashboard-grid dash-group-body"${c.collapsed?' hidden':''}>`;
                open.push(c.depth);if(c.collapsed)hiddenFrom=open.length-1;
                return;
            }
            if(hiddenFrom!==null)return;
            if(blockRenderers[widget.type])blocks+=dashboardWidgetChrome(widget,dress(widget,blockRenderers[widget.type](widget)));
        });
        closeTo(-1);
        const ownTab=currentCustomTab();
        const {pages:dashPagesList}=dashboardPages(),dashPage=currentDashboardPage();
        const dashPagesBar=dashPagesList.length>1?`<div class="segmented dash-pages" role="tablist">${dashPagesList.map(p=>`<button type="button" role="tab" data-dash-page="${escapeHtml(p.id)}" class="${p.id===dashPage.id?'is-active':''}" aria-selected="${p.id===dashPage.id}">${escapeHtml(p.name||'Page')}</button>`).join('')}</div>`:'';
        $('#workspace').innerHTML=`<section class="page dashboard-page${ownTab?' custom-tab-page':''}"><header class="page-header">${ownTab?`<div><span class="eyebrow">MON ONGLET</span><h2>${escapeHtml(`${ownTab.icon?ownTab.icon+' ':''}${ownTab.name||'Mon onglet'}`)}</h2>${ownTab.intro?`<p>${escapeHtml(ownTab.intro)}</p>`:''}</div><div class="page-actions"><button type="button" class="button secondary small" data-edit-custom-tab="${escapeHtml(ownTab.id)}">⚙️ Modifier l’onglet</button></div>`:`<div><span class="eyebrow">TABLEAU DE BORD</span><h2>${escapeHtml(dashPage.name||'Vue d’ensemble')}</h2><p>Un point rapide sur la base, les dates qui approchent, les modifications récentes et le travail à suivre.</p>${dashPagesBar}</div>`}</header>
        <div class="card-grid dashboard-grid">${blocks||emptyState({text: ownTab?'Onglet vide':'Aucun widget affiché', icon:'🧩',hint:ownTab?'Ajoute des widgets, tes listes ou tes graphiques depuis la colonne de gauche.':'Ajoute-en depuis la colonne de gauche, ou crée le tien.',action:{label:'＋ Ajouter un widget',attrs:document.querySelector('[data-add-dashboard-widget]')?'data-dash-empty-add':'data-empty-click="#dashboard-create-widget"'}})}</div></section>`;
        $$('[data-dash-page]').forEach(b=>b.addEventListener('click',()=>{state.dashboardPage=b.dataset.dashPage;renderDashboard();renderSidebar();}));
        $$('[data-dash-group-toggle]').forEach(b=>b.addEventListener('click',()=>{const current=dashboardBlockSettings();const g=current.widgets.find(w=>w.id===b.dataset.dashGroupToggle);if(!g)return;g.config={...g.config,collapsed:!g.config?.collapsed};saveDashboardBlockSettings(current);renderDashboard(undefined,{reuse:true});}));
        $('[data-edit-custom-tab]')?.addEventListener('click',()=>{state.tabsEditorOpen=ownTab.id;state.maintenanceTab='tabs_editor';setModule('maintenance');});
        $$('[data-reroll-dashboard-widget]').forEach(button=>button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();const current=dashboardBlockSettings();const widget=current.widgets.find(item=>item.id===button.dataset.rerollDashboardWidget);if(widget){widget.config={...(widget.config||{}),randomSeed:Date.now()};saveDashboardBlockSettings(current);}await renderDashboard();}));
        $$('[data-edit-dashboard-widget]').forEach(button=>button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();state.dashboardEditingWidget=state.dashboardEditingWidget===button.dataset.editDashboardWidget?'':button.dataset.editDashboardWidget;await renderDashboard(undefined,{reuse:true});}));
        $$('[data-delete-dashboard-widget]').forEach(button=>button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();const id=button.dataset.deleteDashboardWidget;button.closest('.dashboard-widget')?.remove();const current=dashboardBlockSettings();const before=JSON.parse(JSON.stringify(current.widgets));const gone=before.find(widget=>widget.id===id);current.widgets=current.widgets.filter(widget=>widget.id!==id);saveDashboardBlockSettings(current);state.dashboardEditingWidget='';
            // H7 : pas de question avant ; « ↶ Annuler » remet le widget à sa place (avec ses réglages)
            const label=gone?dashboardWidgetLabel(gone.type||gone.id):'';const undo=window.LCNDA_APP?.undoToast;
            if(undo)undo(label?`Widget « ${label} » retiré du tableau de bord.`:'Widget retiré du tableau de bord.',{undo:async()=>{const now=dashboardBlockSettings();now.widgets=before;saveDashboardBlockSettings(now);await renderDashboard();},redo:async()=>{const now=dashboardBlockSettings();now.widgets=now.widgets.filter(widget=>widget.id!==id);saveDashboardBlockSettings(now);await renderDashboard();}});
            else toast('Widget supprimé du tableau de bord.');
            await renderDashboard();}));
        $$('[data-cancel-dashboard-widget]').forEach(button=>button.addEventListener('click',async()=>{state.dashboardEditingWidget='';await renderDashboard(undefined,{reuse:true});}));
        $$('[data-save-dashboard-widget]').forEach(button=>button.addEventListener('click',async()=>{saveDashboardWidgetFromEditor(button.dataset.saveDashboardWidget);state.dashboardEditingWidget='';toast('Widget modifié.');await renderDashboard();}));
        $$('.dashboard-widget-back [data-block-width]').forEach(button=>button.addEventListener('click',()=>{const group=button.closest('.block-widths');$$('[data-block-width]',group).forEach(item=>item.setAttribute('aria-pressed',String(item===button)));}));
        $$('[data-dashboard-quiz-all]').forEach(input=>input.addEventListener('change',()=>{
            const editor=input.closest('[data-dashboard-widget-editor]');
            $$('[data-dashboard-quiz-type]',editor).forEach(typeInput=>{typeInput.disabled=input.checked;if(input.checked)typeInput.checked=false;});
        }));
        setupDashboardWidgetPersonPickers();
        setupDashboardWidgetMediaPickers();
        bindWebSearchPanels($('#workspace'));
        bindWebSearchSitesEditors($('#workspace'));
        fillLineageWidgets();
        $$('[data-open-dashboard-person]').forEach(button=>button.addEventListener('click',()=>{state.currentPersonId=Number(button.dataset.openDashboardPerson);setModule('personnes');}));
        const dashboardMediaPool=[data.random_media,...Object.values(data.widget_media||{}),...settings.widgets.filter(widget=>widget.type==='favorite_image'&&Number(widget.config?.mediaId)).map(widget=>({id:widget.config.mediaId,title:widget.config.mediaTitle,filename:widget.config.mediaFilename,thumbnail:widget.config.mediaThumbnail,media_type:'image'}))].filter(Boolean);
        $$('[data-open-dashboard-media]').forEach(button=>button.addEventListener('click',()=>{const item=dashboardMediaPool.find(media=>Number(media.id)===Number(button.dataset.openDashboardMedia));if(item)openLightbox([item],0,true);}));
        $$('[data-open-dashboard-map]').forEach(button=>button.addEventListener('click',()=>{state.mapTag='all';state.mapMode='standard';state.mapDisplay='markers';setModule('carte');}));
        $$('[data-open-dashboard-person-map]').forEach(button=>button.addEventListener('click',()=>{const id=Number(button.dataset.openDashboardPersonMap);if(id){state.currentPersonId=id;state.mapRoutePeople=[{id,name:button.dataset.personName||''}];state.mapMode='life';state.mapTag='all';state.mapDisplay='markers';setModule('carte');}}));
        $$('[data-dashboard-list]').forEach(button=>button.addEventListener('click',()=>{state.listType=button.dataset.dashboardList;setModule('listes');}));
        $$('[data-dashboard-maintenance]').forEach(button=>button.addEventListener('click',()=>{state.maintenanceTab=button.dataset.dashboardMaintenance;setModule('maintenance');}));
        $$('[data-dashboard-module]').forEach(button=>button.addEventListener('click',()=>setModule(button.dataset.dashboardModule)));
        $$('[data-dashboard-restore]').forEach(button=>button.addEventListener('click',async()=>{
            if(!await confirmBox('L’élément supprimé sera remis dans la base.',{title:'Restaurer cette suppression ?',okLabel:'Restaurer',danger:false}))return;
            button.disabled=true;
            try{const r=await api('restore_change',{}, {method:'POST',body:{id:button.dataset.dashboardRestore}});toast(restoreDoneText(r));await renderDashboard();}
            catch(error){button.disabled=false;toast(error.message,'error');}
        }));
        $$('[data-dashboard-quiz-choice]').forEach(button=>button.addEventListener('click',()=>{
            const wrap=button.closest('.dashboard-quiz-answers');
            if(!wrap)return;
            $$('[data-dashboard-quiz-choice]',wrap).forEach(choice=>choice.disabled=true);
            button.classList.toggle('is-correct',button.dataset.correct==='1');
            button.classList.toggle('is-wrong',button.dataset.correct!=='1');
            $$('[data-correct="1"]',wrap).forEach(choice=>choice.classList.add('is-correct'));
        }));
    }
    function dashboardWidgetChrome(widget,html){
        const editing=state.dashboardEditingWidget===widget.id;
        const tools=`<div class="dashboard-widget-tools"><button type="button" class="icon-action" data-edit-dashboard-widget="${escapeHtml(widget.id)}" title="${editing?'Revenir au widget':'Modifier le widget'}">${editing?'↩':'✎'}</button><button type="button" class="icon-action danger" data-delete-dashboard-widget="${escapeHtml(widget.id)}" title="Supprimer ce widget">×</button></div>`;
        const wrapper=document.createElement('div');
        wrapper.innerHTML=html.trim();
        const section=wrapper.querySelector('.card');
        if(!section)return html;
        section.classList.add('dashboard-widget');
        section.classList.toggle('is-editing',editing);
        section.dataset.dashboardWidget=widget.id;
        section.dataset.widgetType=widget.type;
        const header=section.querySelector('.card-head');
        if(header)header.insertAdjacentHTML('beforeend',tools);
        if(editing)section.insertAdjacentHTML('beforeend',dashboardWidgetEditorPanel(widget));
        return wrapper.innerHTML;
    }
    function dashboardWidgetEditorPanel(widget){
        const hasLimit=!!defaultDashboardBlockLimits[widget.type]&&widget.type!=='person_quiz';
        const personWidget=['chosen_person','random_person','person_quiz','random_person_map','person_block','person_timeline'].includes(widget.type);
        const secondPersonWidget=widget.type==='kinship_widget';
        const mode=widget.config?.personMode==='specific'?'specific':'random';
        const quickStatOptions=[['persons','Personnes'],['events','Événements'],['media','Médias'],['sources','Sources'],['reminders_due','Rappels proches'],['open_investigations','Enquêtes ouvertes'],['open_battues','Battues ouvertes'],['issues','Incohérences']];
        // personne du widget : menu de choix unique ; les champs cachés [data-dashboard-person-search] (nom) et [data-dashboard-person-id] suivent
        const personPicker=(label,nameKey,idKey)=>{const id=Number(widget.config?.[idKey])||0,name=widget.config?.[nameKey]||'';return `<div class="pk-host"><span>${escapeHtml(label)}</span><span data-dashboard-person-pk>${(window.LCNDA_PICKER?.pickerField({name:'dashboard_person_'+idKey,kind:'person',allowCreate:false,value:id?{id,title:name,kind:'person'}:null})||'').replace(` name="dashboard_person_${idKey}"`,'')}<input type="hidden" data-dashboard-person-search data-dashboard-person-name-key="${escapeHtml(nameKey)}" data-dashboard-person-id-key="${escapeHtml(idKey)}" value="${escapeHtml(name)}"><input type="hidden" data-dashboard-person-id value="${escapeHtml(widget.config?.[idKey]||'')}"></span></div>`;};
        const quizTypeIds=Array.isArray(widget.config?.quizEventTypeIds)?widget.config.quizEventTypeIds.map(Number).filter(Boolean):[];
        const quizAll=!quizTypeIds.length;
        const quizTypes=(state.bootstrap?.eventTypes||[]).filter(type=>Number(type.usage_count)>0).sort((a,b)=>String(a.label||'').localeCompare(String(b.label||''),'fr',{sensitivity:'base'}));
        const quizPanel=widget.type==='person_quiz'?`<label>Nombre de propositions<input type="number" min="3" max="8" data-dashboard-quiz-choices value="${escapeHtml(widget.limit||defaultDashboardBlockLimits.person_quiz||4)}"></label><label class="checkbox-line"><input type="checkbox" data-dashboard-quiz-sosa-only ${widget.config?.quizSosaOnly?'checked':''}> Seulement les SOSA</label><fieldset class="dashboard-quiz-type-editor"><legend>Types d’évènements</legend><label class="checkbox-line"><input type="checkbox" data-dashboard-quiz-all ${quizAll?'checked':''}> Tous</label><div>${quizTypes.map(type=>`<label class="checkbox-line"><input type="checkbox" data-dashboard-quiz-type value="${type.id}" ${quizTypeIds.includes(Number(type.id))?'checked':''} ${quizAll?'disabled':''}> ${escapeHtml(type.label)} <small>${Number(type.usage_count).toLocaleString('fr-FR')}</small></label>`).join('')}</div></fieldset>`:'';
        const sessionGoalPanel=widget.type==='session_goal'?`<label>Objectif<textarea data-dashboard-session-goal rows="3" placeholder="Ex : trouver la date de naissance de Jean Dupont">${escapeHtml(widget.config?.sessionGoal||'')}</textarea></label><div class="dashboard-person-widget-settings">${personPicker('Personne liée (facultatif)','personName','personId')}</div>`:'';
        return `<div class="dashboard-widget-back" data-dashboard-widget-editor="${escapeHtml(widget.id)}"><div class="dashboard-widget-back-title"><strong>Réglages du widget</strong><span>${escapeHtml(dashboardWidgetLabel(widget.type))}</span></div>${String(widget.type).startsWith('cw_')?(window.LCNDA_EXT?.shortcuts?.panelHtml?.(widget.type)||''):''}<label>Largeur<div class="block-widths dashboard-widget-widths">${personBlockWidthChoices.map(([value,text])=>`<button type="button" data-block-width="${value}" aria-pressed="${String(widget.width)===value?'true':'false'}" title="Largeur ${text}">${text}</button>`).join('')}</div></label>${hasLimit?`<label>Nombre d’éléments<input type="number" min="1" max="80" data-dashboard-widget-limit value="${escapeHtml(widget.limit||defaultDashboardBlockLimits[widget.type])}"></label>`:''}${quizPanel}${widget.type==='person_block'?`<label>Bloc de fiche à afficher<select data-dashboard-person-block-key>${defaultPersonBlocks.map(([key,label])=>`<option value="${escapeHtml(key)}" ${(widget.config?.personBlockKey||'identity')===key?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></label>`:''}${widget.type==='branch_map'?`<label>Branche / patronyme<input type="text" data-dashboard-branch-name list="dashboard-branch-options" value="${escapeHtml(widget.config?.branchName||'')}" placeholder="Ex : Dupont"><datalist id="dashboard-branch-options">${(state.bootstrap?.surnameGroups||[]).map(group=>`<option value="${escapeHtml(group.name||group)}"></option>`).join('')}</datalist></label>`:''}${widget.type==='quick_stat'?`<label>Statistique affichée<select data-dashboard-quick-stat>${quickStatOptions.map(([key,label])=>`<option value="${escapeHtml(key)}" ${(widget.config?.quickStat||'persons')===key?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></label>`:''}${sessionGoalPanel}${window.LCNDA_EXT?.dashboardConfig?.[dashboardBaseType(widget.type)]?.html?.(widget)||''}${widget.type==='lineage_widget'?`<div class="dashboard-person-widget-settings"><label>Personne<select data-dashboard-person-mode><option value="last" ${widget.config?.personMode!=='specific'?'selected':''}>Dernière fiche consultée</option><option value="specific" ${widget.config?.personMode==='specific'?'selected':''}>Personne choisie</option></select></label>${personPicker('Choisir une personne','personName','personId')}<label>Afficher<select data-lineage-direction><option value="desc" ${(widget.config?.lineageDirection||'desc')==='desc'?'selected':''}>Les descendants</option><option value="asc" ${widget.config?.lineageDirection==='asc'?'selected':''}>Les ascendants</option><option value="both" ${widget.config?.lineageDirection==='both'?'selected':''}>Les deux</option></select></label><label>Ascendants<select data-lineage-asc>${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${(Number(widget.config?.lineageAsc)||3)===n?'selected':''}>${escapeHtml(generationLabel(n,'asc'))}</option>`).join('')}</select></label><label>Descendants<select data-lineage-desc>${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${(Number(widget.config?.lineageDesc)||2)===n?'selected':''}>${escapeHtml(generationLabel(n,'desc'))}</option>`).join('')}</select></label></div>`:''}${['family_objects_widget','family_memories_widget'].includes(widget.type)?`<div class="dashboard-person-widget-settings"><label>Personne<select data-dashboard-person-mode><option value="last" ${widget.config?.personMode!=='specific'?'selected':''}>Dernière fiche consultée</option><option value="specific" ${widget.config?.personMode==='specific'?'selected':''}>Personne choisie</option></select></label>${personPicker('Choisir une personne','personName','personId')}</div>`:''}${widget.type==='web_search'?`<div class="dashboard-person-widget-settings"><label>Personne<select data-dashboard-person-mode><option value="last" ${widget.config?.personMode!=='specific'?'selected':''}>Dernière fiche consultée</option><option value="specific" ${widget.config?.personMode==='specific'?'selected':''}>Personne choisie</option></select></label>${personPicker('Choisir une personne','personName','personId')}</div>${webSearchSitesEditor(`ws-widget-${widget.id}`,'Sites affichés',widget.config?.sites?webSearchSettings(0,widget.config.sites):webSearchSettings(),{saveButton:false})}`:''}${widget.type==='favorite_image'?`<div class="dashboard-media-field" data-dashboard-media-field><span class="pk-lab">Image favorite</span>${window.LCNDA_PICKER?.mediaField?window.LCNDA_PICKER.mediaField({name:'',types:['image'],title:'Image favorite',okLabel:'Prendre cette image',value:Number(widget.config?.mediaId)?{id:Number(widget.config.mediaId),title:widget.config?.mediaTitle||'',filename:widget.config?.mediaFilename||'',thumb:(widget.config?.mediaThumbnail||widget.config?.mediaFilename)?`media/${encodeURIComponent(widget.config.mediaThumbnail||widget.config.mediaFilename)}`:''}:null}):''}<input type="hidden" data-dashboard-media-search value="${escapeHtml(widget.config?.mediaTitle||'')}"><input type="hidden" data-dashboard-media-id value="${escapeHtml(widget.config?.mediaId||'')}"><input type="hidden" data-dashboard-media-title value="${escapeHtml(widget.config?.mediaTitle||'')}"><input type="hidden" data-dashboard-media-filename value="${escapeHtml(widget.config?.mediaFilename||'')}"><input type="hidden" data-dashboard-media-thumbnail value="${escapeHtml(widget.config?.mediaThumbnail||'')}"></div><label>Provenance affichée<input type="text" data-dashboard-media-origin value="${escapeHtml(widget.config?.mediaOrigin||'')}" placeholder="Ex : Jean Dupont · Enquête"></label>`:''}${personWidget?`<div class="dashboard-person-widget-settings">${widget.type==='chosen_person'?'<input type="hidden" data-dashboard-person-mode value="specific">':`<label>Personne affichée<select data-dashboard-person-mode><option value="random" ${mode==='random'?'selected':''}>Aléatoire</option><option value="specific" ${mode==='specific'?'selected':''}>Personne précise</option></select></label>`}${personPicker('Choisir une personne','personName','personId')}</div>`:''}${secondPersonWidget?`<div class="dashboard-person-widget-settings">${personPicker('Première personne','personName','personId')}${personPicker('Deuxième personne','personName2','personId2')}</div>`:''}<div class="page-actions compact"><button class="button small" type="button" data-save-dashboard-widget="${escapeHtml(widget.id)}">Enregistrer</button><button class="button small secondary" type="button" data-cancel-dashboard-widget="${escapeHtml(widget.id)}">Annuler</button></div></div>`;
    }
    function saveDashboardWidgetFromEditor(widgetId){
        const settings=dashboardBlockSettings();
        const widget=settings.widgets.find(item=>item.id===widgetId);
        const editor=$$('[data-dashboard-widget-editor]').find(node=>node.dataset.dashboardWidgetEditor===widgetId);
        if(!widget||!editor)return;
        const wt=dashboardBaseType(widget.type);
        widget.width=$('.block-widths [aria-pressed="true"]',editor)?.dataset.blockWidth||widget.width;
        const limitInput=$('[data-dashboard-widget-limit]',editor);
        if(limitInput)widget.limit=Math.max(1,Math.min(80,Number(limitInput.value)||defaultDashboardBlockLimits[wt]||6));
        const quizChoices=$('[data-dashboard-quiz-choices]',editor);
        if(quizChoices)widget.limit=Math.max(3,Math.min(8,Number(quizChoices.value)||defaultDashboardBlockLimits.person_quiz||4));
        const mode=$('[data-dashboard-person-mode]',editor)?.value;
        const blockKey=$('[data-dashboard-person-block-key]',editor)?.value;
        if(blockKey)widget.config={...(widget.config||{}),personBlockKey:blockKey};
        const branchName=$('[data-dashboard-branch-name]',editor)?.value;
        if(branchName!==undefined)widget.config={...(widget.config||{}),branchName:branchName.trim()};
        const quickStat=$('[data-dashboard-quick-stat]',editor)?.value;
        if(quickStat)widget.config={...(widget.config||{}),quickStat};
        const extConfig=window.LCNDA_EXT?.dashboardConfig?.[wt];if(extConfig?.read)widget.config={...(widget.config||{}),...extConfig.read(editor)}; // réglages propres d'un widget ajouté par un module
        if(wt==='lineage_widget')widget.config={...(widget.config||{}),lineageDirection:$('[data-lineage-direction]',editor)?.value||'desc',lineageAsc:Number($('[data-lineage-asc]',editor)?.value)||3,lineageDesc:Number($('[data-lineage-desc]',editor)?.value)||2};
        if(wt==='web_search'){const list=$(`#ws-widget-${CSS.escape(widget.id)}`,editor);if(list)widget.config={...(widget.config||{}),sites:readWebSearchSitesEditor(list)};}
        const sessionGoal=$('[data-dashboard-session-goal]',editor)?.value;
        if(sessionGoal!==undefined)widget.config={...(widget.config||{}),sessionGoal:sessionGoal.trim()};
        if(wt==='session_goal'){
            widget.config={...(widget.config||{}),personId:Number($('[data-dashboard-person-id]',editor)?.value)||0,personName:$('[data-dashboard-person-search]',editor)?.value.trim()||''};
        }
        if(wt==='favorite_image')widget.config={...(widget.config||{}),mediaId:Number($('[data-dashboard-media-id]',editor)?.value)||0,mediaTitle:$('[data-dashboard-media-title]',editor)?.value.trim()||$('[data-dashboard-media-search]',editor)?.value.trim()||'',mediaFilename:$('[data-dashboard-media-filename]',editor)?.value.trim()||'',mediaThumbnail:$('[data-dashboard-media-thumbnail]',editor)?.value.trim()||'',mediaOrigin:$('[data-dashboard-media-origin]',editor)?.value.trim()||''};
        if(wt==='person_quiz'){
            const allTypes=$('[data-dashboard-quiz-all]',editor)?.checked;
            const quizEventTypeIds=allTypes?[]:$$('[data-dashboard-quiz-type]:checked',editor).map(input=>Number(input.value)).filter(Boolean);
            widget.config={...(widget.config||{}),quizSosaOnly:!!$('[data-dashboard-quiz-sosa-only]',editor)?.checked,quizEventTypeIds};
        }
        if(mode){
            widget.config={...(widget.config||{}),personMode:mode};
            if(mode==='specific'){
                widget.config.personId=Number($('[data-dashboard-person-id]',editor)?.value)||0;
                widget.config.personName=$('[data-dashboard-person-search]',editor)?.value.trim()||'';
            }
        }
        if(wt==='kinship_widget')$$('[data-dashboard-person-search]',editor).forEach(input=>{const idKey=input.dataset.dashboardPersonIdKey||'personId',nameKey=input.dataset.dashboardPersonNameKey||'personName';widget.config={...(widget.config||{}),[idKey]:Number(input.parentElement.querySelector('[data-dashboard-person-id]')?.value)||0,[nameKey]:input.value.trim()};});
        saveDashboardBlockSettings(settings);
    }
    function setupDashboardWidgetPersonPickers(){
        $$('[data-dashboard-person-pk]').forEach(wrap=>{
            if(wrap.dataset.pkBound)return;wrap.dataset.pkBound='1';
            wrap.addEventListener('picker-change',event=>{
                const it=event.detail.item;
                wrap.querySelector('[data-dashboard-person-id]').value=it&&!it.free?it.id:'';
                wrap.querySelector('[data-dashboard-person-search]').value=it?it.title:'';
                const mode=$('[data-dashboard-person-mode]',wrap.closest('[data-dashboard-widget-editor]'));if(mode&&it)mode.value='specific';
            });
        });
    }
    /** Widget « Image favorite » : la fenêtre unique des médias (pastille du champ) remplit les cases cachées lues à l'enregistrement. */
    function setupDashboardWidgetMediaPickers(){
        $$('[data-dashboard-media-field]').forEach(wrap=>{
            if(wrap.dataset.mediaBound)return;wrap.dataset.mediaBound='1';
            const originInput=wrap.closest('[data-dashboard-widget-editor]')?.querySelector('[data-dashboard-media-origin]');
            const set=(sel,v)=>{const el=wrap.querySelector(sel);if(el)el.value=v;};
            // E4 : une image glissée (ou collée) sur le champ entre dans les médias et devient l'image favorite
            const field=wrap.querySelector('[data-media-field]');
            if(field&&window.LCNDA_UI?.bindFileDrop&&window.LCNDA_APP.importMediaFile){
                window.LCNDA_UI.bindFileDrop(wrap,async files=>{
                    try{const it=await window.LCNDA_APP.importMediaFile(files[0],['image']);window.LCNDA_PICKER.mediaSet(field,it);field.dispatchEvent(new CustomEvent('media-change',{bubbles:true,detail:{kind:'media',item:it,value:it.id}}));window.LCNDA_APP.toast(`« ${it.title||'Image'} » est rangée dans les médias : enregistre le widget pour la garder.`);}
                    catch(error){window.LCNDA_APP.toast(error.message,'error');}
                },{accept:'image/*'});
                if(!wrap.querySelector('.dashboard-media-drophint'))wrap.insertAdjacentHTML('beforeend','<small class="muted dashboard-media-drophint">📁 ou glisse une image ici, ou colle-la (⌘V).</small>');
            }
            wrap.addEventListener('media-change',async event=>{
                const media=event.detail.item;
                const title=media?(media.title||media.filename||'Média'):'';
                set('[data-dashboard-media-id]',media?String(media.id):'');set('[data-dashboard-media-title]',title);set('[data-dashboard-media-search]',title);
                set('[data-dashboard-media-filename]',media?.filename||'');set('[data-dashboard-media-thumbnail]',media?(media.thumbnail||media.filename||''):'');
                // provenance : la personne rattachée (comme avant), sauf si elle a été écrite à la main
                if(!media||!originInput||(originInput.value.trim()&&originInput.value.trim()!==(originInput.dataset.autofilled||'')))return;
                let origin='';const pid=Number((media.people_ids||[])[0])||0;
                if(pid){try{const r=await api('picker_search',{kind:'person',ids:String(pid)});origin=r.groups?.[0]?.items?.[0]?.title||'';}catch(_){}}
                originInput.value=origin;originInput.dataset.autofilled=origin;
            });
        });
    }
    /** Tableau de bord → « Réordonner les widgets » : glisser une ligne, ou ses flèches ↑ ↓, puis Enregistrer. */
    function openDashboardReorderDialog(){
        const ownTab=currentCustomTab();
        const current=dashboardBlockSettings();
        // Copie de travail des pages (le tableau de bord principal) ; un onglet à soi n'a qu'une page
        const meta=dashboardPages();
        let pagesWork=ownTab?[{id:'pg_tab',name:ownTab.name,widgets:current.widgets}]:meta.pages.map(p=>({...p,widgets:Array.isArray(p.widgets)?p.widgets.map(dashboardNormalizeWidget).filter(Boolean):(p.id===currentDashboardPage().id?current.widgets:[])}));
        let defaultWork=ownTab?'pg_tab':meta.defaultPage,editing=ownTab?'pg_tab':currentDashboardPage().id;
        const page=()=>pagesWork.find(p=>p.id===editing)||pagesWork[0];
        const subtitle=w=>w.config?.personMode==='specific'&&w.config?.personName?w.config.personName:(w.type==='person_block'?(defaultPersonBlocks.find(r=>r[0]===(w.config?.personBlockKey||'identity'))||[,''])[1]:'');
        const widthText=w=>(personBlockWidthChoices.find(([v])=>String(v)===String(w.width))||[,''])[1];
        const dialog=document.createElement('dialog');dialog.className='modal dashboard-reorder-dialog';
        const newPageId=()=>'pg_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
        const draw=()=>{
            const widgets=page().widgets;let depth=-1;
            $('.dash-pages-editor',dialog).innerHTML=ownTab?'':`<h3>Pages du tableau de bord</h3><p class="muted">Chaque page a ses widgets ; les boutons des pages sont en haut du tableau de bord. La page cochée s’affiche à l’ouverture.</p>
                <div class="dash-pages-rows">${pagesWork.map(p=>`<div class="dash-page-row${p.id===editing?' is-editing':''}" data-page-row="${escapeHtml(p.id)}"><label class="checkbox-line" title="Page affichée à l’ouverture"><input type="radio" name="dash-default" value="${escapeHtml(p.id)}" ${p.id===defaultWork?'checked':''}> par défaut</label><input data-page-name value="${escapeHtml(p.name||'')}" maxlength="40" placeholder="Nom de la page"><button type="button" class="button small ${p.id===editing?'':'secondary'}" data-page-edit>${p.id===editing?'✎ en cours':'Ranger ses widgets'}</button>${pagesWork.length>1?'<button type="button" class="icon-button danger" data-page-del title="Supprimer cette page">🗑</button>':''}</div>`).join('')}</div>
                <button type="button" class="button small secondary" data-page-add>+ Nouvelle page</button>`;
            $('.dashboard-reorder-list',dialog).innerHTML=widgets.length?widgets.map((w,i)=>{
                if(w.type==='__group'){depth=w.config.depth;return `<li class="dashboard-reorder-row is-group" draggable="true" data-index="${i}" style="margin-left:${Math.min(w.config.depth,8)*22}px"><span class="order-grip" aria-hidden="true">↕</span><span class="dash-group-icon" aria-hidden="true">📁</span><input class="dash-group-title" data-group-title value="${escapeHtml(w.config.title||'')}" maxlength="80" placeholder="Titre de l’ensemble"><span class="dashboard-reorder-moves"><button type="button" class="icon-button" data-depth="-1" ${w.config.depth?'':'disabled'} title="Un niveau plus haut">◀</button><button type="button" class="icon-button" data-depth="1" ${w.config.depth>=12?'disabled':''} title="Sous-ensemble (un niveau plus bas)">▶</button><button type="button" class="icon-button" data-move="-1" ${i===0?'disabled':''} aria-label="Monter">↑</button><button type="button" class="icon-button" data-move="1" ${i===widgets.length-1?'disabled':''} aria-label="Descendre">↓</button><button type="button" class="icon-button danger" data-group-del title="Retirer l’ensemble (ses widgets restent)">×</button></span></li>`;}
                return `<li class="dashboard-reorder-row" draggable="true" data-index="${i}" style="margin-left:${Math.min(depth+1,9)*22}px"><span class="order-grip" aria-hidden="true">↕</span><span class="order-number">${String(i+1).padStart(2,'0')}</span><b>${escapeHtml(dashboardWidgetLabel(w.type))}${subtitle(w)?` <small>${escapeHtml(subtitle(w))}</small>`:''}</b><small class="cell-muted">${escapeHtml(widthText(w))}</small><span class="dashboard-reorder-moves"><button type="button" class="icon-button" data-move="-1" ${i===0?'disabled':''} aria-label="Monter">↑</button><button type="button" class="icon-button" data-move="1" ${i===widgets.length-1?'disabled':''} aria-label="Descendre">↓</button></span></li>`;
            }).join(''):`<li class="empty-line"><span class="empty-line-ico" aria-hidden="true">🗂️</span><span class="empty-line-text">Aucun widget sur cette page : ajoute-en depuis la colonne de gauche du tableau de bord.</span></li>`;
        };
        dialog.innerHTML=`<div class="modal-head"><div><span class="eyebrow">${ownTab?'MON ONGLET':'TABLEAU DE BORD'}</span><h2>Réordonner les widgets</h2><p>Glisse une ligne, ou utilise ses flèches. Un ensemble regroupe les widgets qui le suivent, dans un cadre avec son titre ; ▶ en fait un sous-ensemble.</p></div><button class="icon-button" type="button" data-close aria-label="Fermer">×</button></div>
            <section class="dash-pages-editor"></section>
            <div class="dash-reorder-tools"><button type="button" class="button small secondary" data-group-add>📁 + Ensemble</button><span class="muted">Le nouvel ensemble arrive en haut : glisse-le au-dessus de ses widgets.</span></div>
            <ol class="dashboard-reorder-list" data-dnd-off></ol><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close>Annuler</button><button class="button" type="button" data-save>Enregistrer</button></div>`;
        document.body.append(dialog);draw();
        const list=$('.dashboard-reorder-list',dialog);let dragFrom=-1;
        const widgets=()=>page().widgets;
        list.addEventListener('click',e=>{
            const row=e.target.closest('[data-index]');if(!row)return;const i=Number(row.dataset.index),ws=widgets();
            const mv=e.target.closest('[data-move]');if(mv){const j=i+Number(mv.dataset.move);if(j<0||j>=ws.length)return;[ws[i],ws[j]]=[ws[j],ws[i]];draw();list.querySelector(`[data-index="${j}"] [data-move="${mv.dataset.move}"]`)?.focus();return;}
            const dp=e.target.closest('[data-depth]');if(dp){const g=ws[i];g.config={...g.config,depth:Math.max(0,Math.min(12,(g.config.depth||0)+Number(dp.dataset.depth)))};draw();return;}
            if(e.target.closest('[data-group-del]')){ws.splice(i,1);draw();}
        });
        list.addEventListener('input',e=>{const t=e.target.closest('[data-group-title]');if(!t)return;widgets()[Number(t.closest('[data-index]').dataset.index)].config.title=t.value;});
        list.addEventListener('dragstart',e=>{if(e.target.closest?.('input'))return;const row=e.target.closest?.('[data-index]');if(!row)return;dragFrom=Number(row.dataset.index);row.classList.add('is-dragging');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','w');}catch(_){}});
        list.addEventListener('dragover',e=>{if(dragFrom<0)return;e.preventDefault();$$('.is-drop-target',list).forEach(r=>r.classList.remove('is-drop-target'));e.target.closest('[data-index]')?.classList.add('is-drop-target');});
        list.addEventListener('drop',e=>{e.preventDefault();const row=e.target.closest('[data-index]');if(!row||dragFrom<0)return;const to=Number(row.dataset.index),ws=widgets();const [moved]=ws.splice(dragFrom,1);ws.splice(to,0,moved);dragFrom=-1;draw();});
        list.addEventListener('dragend',()=>{dragFrom=-1;$$('.is-dragging,.is-drop-target',list).forEach(r=>r.classList.remove('is-dragging','is-drop-target'));});
        $('[data-group-add]',dialog).addEventListener('click',()=>{widgets().unshift(dashboardGroupItem({config:{title:'Nouvel ensemble',depth:0}}));draw();setTimeout(()=>{const t=$('[data-group-title]',list);t?.focus();t?.select();},0);});
        const pagesBox=$('.dash-pages-editor',dialog);
        pagesBox.addEventListener('click',async e=>{
            if(e.target.closest('[data-page-add]')){const id=newPageId();pagesWork.push({id,name:`Page ${pagesWork.length+1}`,widgets:[]});editing=id;draw();setTimeout(()=>{const inp=pagesBox.querySelector(`[data-page-row="${id}"] [data-page-name]`);inp?.focus();inp?.select();},0);return;}
            const row=e.target.closest('[data-page-row]');if(!row)return;const id=row.dataset.pageRow;
            if(e.target.closest('[data-page-edit]')){editing=id;draw();return;}
            if(e.target.closest('[data-page-del]')){const p=pagesWork.find(x=>x.id===id);if(p.widgets.length&&!await confirmBox(p.widgets.length<2?'Son widget sera supprimé avec elle.':`Ses ${plural(p.widgets.length,'widget')} seront supprimés avec elle.`,{title:`Supprimer la page « ${p.name||'Page'} » ?`,okLabel:'Supprimer la page'}))return;pagesWork=pagesWork.filter(x=>x.id!==id);if(editing===id)editing=pagesWork[0].id;if(defaultWork===id)defaultWork=pagesWork[0].id;draw();}
        });
        pagesBox.addEventListener('input',e=>{const inp=e.target.closest('[data-page-name]');if(inp)pagesWork.find(x=>x.id===inp.closest('[data-page-row]').dataset.pageRow).name=inp.value;});
        pagesBox.addEventListener('change',e=>{if(e.target.name==='dash-default')defaultWork=e.target.value;});
        const close=()=>{dialog.close();dialog.remove();};
        $$('[data-close]',dialog).forEach(b=>b.addEventListener('click',close));
        $('[data-save]',dialog).addEventListener('click',async()=>{
            if(ownTab)saveDashboardBlockSettings({widgets:page().widgets});
            else{
                const clean=pagesWork.map(p=>({id:p.id,name:String(p.name||'').trim().slice(0,40)||'Page',widgets:p.widgets.map(w=>w.type==='__group'?dashboardGroupItem(w):dashboardNewWidget(w.type,w))}));
                saveDashboardPages(clean,defaultWork);
                if(!clean.some(p=>p.id===state.dashboardPage))state.dashboardPage=defaultWork;
            }
            close();toast('Tableau de bord enregistré.');if(state.module==='dashboard')await renderDashboard();
        });
        dialog.addEventListener('close',()=>dialog.remove());
        dialog.showModal();
    }
    function progressSentence(p){
        const n=(v,one,many)=>v?`${Number(v).toLocaleString('fr-FR')} ${v>1?many:one}`:'';
        return [n(p.persons_created,'fiche créée','fiches créées'),n(p.persons_edited,'fiche complétée','fiches complétées'),n(p.events_created,'événement ajouté','événements ajoutés'),n(p.sources_created,'source ajoutée','sources ajoutées'),n(p.census_created,'recensement ajouté','recensements ajoutés'),n(p.media_added,'média ajouté','médias ajoutés'),n(p.sosa_new,'nouvel ancêtre Sosa','nouveaux ancêtres Sosa'),n(p.battues_closed,'battue terminée','battues terminées'),n(p.investigations_closed,'enquête terminée','enquêtes terminées')].filter(Boolean).join(', ');
    }
    function dashboardProgressCard(index,data,spanClass){
        if(!data)return card(index,'Bilan de recherche','',empty('Bilan indisponible.',{icon:'📊'}),spanClass);
        const month=new Date().toLocaleDateString('fr-FR',{month:'long'});
        const m=data.month,y=data.year,prev=data.previous_month;
        const monthText=progressSentence(m)||'pas encore de modification ce mois-ci';
        const trend=prev.changes?(m.changes>=prev.changes?`<span class="progress-up">↑ plus actif que le mois dernier</span>`:''):'';
        const max=Math.max(1,...data.months.map(x=>x.changes));
        const bars=data.months.map(x=>{const label=new Date(x.month+'-15').toLocaleDateString('fr-FR',{month:'short'});return `<div class="progress-bar" title="${escapeHtml(label)} : ${x.changes} modification${x.changes>1?'s':''}${x.persons?`, ${x.persons} fiche${x.persons>1?'s':''} créée${x.persons>1?'s':''}`:''}"><span style="height:${Math.max(x.changes?4:0,Math.round(60*x.changes/max))}px"></span><small>${escapeHtml(label.replace('.',''))}</small></div>`;}).join('');
        const body=`<p class="progress-line"><strong>En ${escapeHtml(month)} :</strong> ${escapeHtml(monthText)}.${m.work_days?` <span class="muted">${m.work_days} jour${m.work_days>1?'s':''} de recherche.</span>`:''} ${trend}</p>
            <p class="progress-line"><strong>En ${escapeHtml(data.year_label)} :</strong> ${escapeHtml(progressSentence(y)||'rien pour l’instant')}.${y.work_days?` <span class="muted">${plural(y.work_days,'jour')} de recherche, ${plural(y.changes,'modification')}.</span>`:''}</p>
            <div class="progress-chart" aria-label="Modifications par mois sur un an">${bars}</div>
            <small class="muted">D’après le journal des modifications : le travail fait à la main (les imports de fichiers ne comptent pas comme fiches créées).</small>`;
        return card(index,'Bilan de recherche','',body,spanClass);
    }
    function dashboardCollectionCard(index,detail,widget,spanClass,kind){
        const specific=widget.config?.personMode==='specific';const person=detail?.person;const title=kind==='objects'?'Objets de famille':'Mémoire familiale';
        if(!person)return card(index,title,'',empty(specific?'Choisis une personne avec le crayon.':'Ouvre une fiche : elle apparaîtra ici.',{icon:'👤'}),spanClass);
        const rows=kind==='objects'?(detail.family_objects||[]):(detail.family_memories||[]);
        const body=`<p class="web-search-person"><button class="link-button" type="button" data-open-dashboard-person="${person.id}">${escapeHtml(personName(person))}</button> <small>${escapeHtml(years(person))}${specific?'':' · dernière fiche consultée'}</small></p>${rows.length?`<div class="collection-grid is-compact">${rows.map(row=>kind==='objects'?familyObjectCardHtml(row,true):familyMemoryCardHtml(row,true)).join('')}</div>`:empty(kind==='objects'?'Aucun objet lié à cette personne.':'Aucun souvenir lié à cette personne.',{icon:'🏺'})}<div class="page-actions"><button class="button small secondary" type="button" data-open-list="${kind==='objects'?'family_objects':'family_memories'}">Tout voir</button></div>`;
        return card(index,title,rows.length||'',body,spanClass);
    }
    function dashboardWebSearchCard(index,detail,widget,spanClass){
        const specific=widget.config?.personMode==='specific';
        const person=detail?.person;
        const settings=widget.config?.sites?webSearchSettings(0,widget.config.sites):webSearchSettings(person?.id||0);
        const body=person?`<p class="web-search-person"><button class="link-button" type="button" data-open-dashboard-person="${person.id}">${escapeHtml(personName(person))}</button> <small>${escapeHtml(years(person))}${specific?'':' · dernière fiche consultée'}</small></p>${webSearchPanelHtml(detail,settings,`widget-${widget.id}`)}`:empty(specific?'Choisis une personne avec le crayon.':'Ouvre une fiche : elle apparaîtra ici.',{icon:'👤'});
        return card(index,'Chercher sur internet','',body,spanClass);
    }
    function dashboardListRows(items,emptyText,mapper){
        if(!items.length)return empty(emptyText,{icon:'📭'});
        return `<div class="dashboard-list">${items.map(mapper).join('')}</div>`;
    }
    function dashboardTodayCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucun anniversaire aujourd’hui.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.date_label)} · ${escapeHtml(item.when_label)}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:''}</article>`);
        return card(index,'Anniversaires du jour',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-module="chronologie">Chronologie</button>`);
    }
    function dashboardRecentPeopleCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune fiche consultée sur ce navigateur.',person=>`<article class="dashboard-row"><div><strong>${escapeHtml(person.name||'Personne')}</strong><small>${escapeHtml(person.years||'')}</small></div><button class="button small secondary" data-open-dashboard-person="${person.id}">Ouvrir</button></article>`);
        return card(index,'Dernières fiches consultées',items.length,body,spanClass);
    }
    function dashboardLockedPeopleCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune personne verrouillée récemment.',person=>`<article class="dashboard-row"><div><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small></div><button class="button small secondary" data-open-dashboard-person="${person.id}">Ouvrir</button></article>`);
        return card(index,'Personnes verrouillées récemment',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="persons">Personnes</button>`);
    }
    function dashboardPersonBlockCard(index,detail,blockKey,spanClass,isSpecific=false,widgetId=''){
        if(!detail?.person)return card(index,'Bloc de fiche personne','',empty('Aucune personne disponible pour ce widget.',{icon:'👥'}),spanClass);
        const person=detail.person;
        const label=(defaultPersonBlocks.find(row=>row[0]===blockKey)||[, 'Identité'])[1];
        const arrays={
            events:detail.events||[], media:detail.media||[], notes:detail.notes||[], sources:detail.sources||[],
            investigations:detail.investigations||[], battues:detail.battues||[], signatures:detail.signatures||[],
            children:detail.children||[], partners:detail.partners||[]
        };
        const personTitle=personName(person)||`Personne #${person.id}`;
        const listRows=(items,emptyText,mapper)=>items.length?`<div class="dashboard-list">${items.map(mapper).join('')}</div>`:empty(emptyText,{icon:'📭'});
        const mediaPreview=item=>mediaPreviewHtml(item,item.title||item.filename||'Média');
        const bodies={
            identity:()=>`<dl class="data-list">${dataRow('Prénom',person.first_name||'—')}${dataRow('Autres prénoms',person.middle_name||'—')}${dataRow('Nom inscrit',person.last_name||'—')}${dataRow('Dates',years(person)||'—')}${dataRow('Genre',genderText(person.gender))}${dataRow('Statut',lifeText(person.living_status))}${dataRow('Groupe',person.surname_group||'—')}${person.occupation?dataRow('Métier / activité',person.occupation):''}</dl>`,
            events:()=>listRows(arrays.events.slice(0,6),'Aucun événement renseigné.',event=>`<article class="dashboard-row"><div><strong>${escapeHtml(event.type_label||'Événement')} · ${escapeHtml(event.date_text||event.year||'date inconnue')}</strong><small>${escapeHtml(placeDisplay(event)||'')}</small></div></article>`),
            media:()=>arrays.media.length?`<div class="media-grid media-card-grid dashboard-person-block-media">${arrays.media.slice(0,8).map(item=>`<article class="media-card-item"><button class="media-item media-card-preview" type="button" data-open-dashboard-person="${person.id}">${mediaPreview(item)}<span>${escapeHtml(item.attachment_label||item.title||item.filename||'Média')}</span></button></article>`).join('')}</div>`:empty('Aucun média.',{icon:'🖼️'}),
            notes:()=>listRows(arrays.notes.slice(0,5),'Aucune note.',note=>`<article class="dashboard-row"><div><strong>${escapeHtml(note.title||'Note sans titre')}</strong><small>${escapeHtml(String(note.body||'').slice(0,140))}</small></div></article>`),
            census:()=>{const records=detail.census?.records||[];return listRows(records.slice(0,6),'Aucun recensement.',record=>`<article class="dashboard-row"><div><strong>${escapeHtml(String(record.year||'Recensement'))}</strong><small>${escapeHtml([censusStatusText(record.status),record.place_name,record.address].filter(Boolean).join(' · '))}</small></div></article>`);},
            sources:()=>listRows(arrays.sources.slice(0,6),'Aucune source ou citation.',source=>`<article class="dashboard-row"><div><strong>${escapeHtml(source.title||source.name||'Source')}</strong><small>${escapeHtml(source.repository||source.url||source.entity_type||'')}</small></div></article>`),
            refs:()=>`<dl class="data-list">${dataRow('Identifiant GEDCOM',person.gedcom_id||'—')}${dataRow('FamilySearch',person.familysearch_id||'—')}${dataRow('Identifiant source',person.source_id||'—')}${dataRow('Numéro Sosa',sosaNumbersText(person.id)||'—')}${dataRow("Numéro d'Aboville",dabovilleNumberFor(person.id)||'—')}</dl>`,
            maternity:()=>person.gender==='female'?`<dl class="data-list">${dataRow('Enfants connus',arrays.children.length)}${dataRow('Conjoints connus',arrays.partners.length)}${dataRow('Naissance',person.birth_date||person.birth_year||'—')}${dataRow('Décès',person.death_date||person.death_year||'—')}</dl>`:empty('Bloc surtout utile pour une fiche féminine.',{icon:'👩'}),
            investigations:()=>listRows([...arrays.battues.map(item=>({...item,_kind:'Battue'})),...arrays.investigations.map(item=>({...item,_kind:'Enquête'}))].slice(0,6),'Aucune enquête ou battue liée.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item._kind)} · ${escapeHtml(item.title||'Sans titre')}</strong><small>${escapeHtml(item.status||'')}</small></div></article>`),
            signatures:()=>arrays.signatures.length?`<div class="list-card-grid person-signature-grid">${arrays.signatures.slice(0,6).map(sig=>`<article class="list-card" data-open-dashboard-person="${person.id}"><span class="list-card-icon">${sig.thumbnail?`<img src="media/${encodeURIComponent(sig.thumbnail)}" alt="">`:'✍'}</span><div><small class="list-card-date">${escapeHtml(sig.date_text||sig.created_at||'Date inconnue')}</small><h3>${escapeHtml(sig.title||sig.filename||'Signature')}</h3><p>${escapeHtml(sig.document_reference||sig.document_title||'Média lié')}</p></div></article>`).join('')}</div>`:empty('Aucune signature identifiée.',{icon:'✍️'}),
            event_map:()=>personEventMap(arrays.events),
            completion:()=>{const completion=detail.completion||{score:0,items:[]};return `<div class="dashboard-coverage"><div><span>Score</span><strong>${Number(completion.score||0)}%</strong><i><b style="width:${Math.max(0,Math.min(100,Number(completion.score||0)))}%"></b></i><small>${(completion.items||[]).slice(0,4).map(item=>item.label||item).join(' · ')||'Aucun détail'}</small></div></div>`;},
            bio:()=>`<p class="auto-biography">${escapeHtml(detail.biography||'Pas assez d’informations pour générer une biographie utile.')}</p>`,
            military:()=>{const milData=detail.militaryData||{};const rows=[['N° matricule',milData.matricule],['Classe',milData.classe_mobilisation],['Bureau',milData.bureau_recrutement],['Décision',milData.decision_conseil],['Notes',milData.notes_militaires]].filter(([,v])=>v&&String(v).trim());return rows.length?`<dl class="data-list">${rows.map(([k,v])=>dataRow(k,v)).join('')}</dl>`:empty('Aucune information militaire renseignée.',{icon:'🎖️'});},
            artistic_works:()=>{const artisticIds=new Set((state.bootstrap?.eventTypes||[]).filter(t=>Number(t.is_artistic)).map(t=>Number(t.id)));const works=arrays.events.filter(event=>artisticIds.has(Number(event.event_type_id)));return listRows(works.slice(0,6),'Aucune œuvre ou réalisation enregistrée.',event=>`<article class="dashboard-row"><div><strong>${escapeHtml(event.type_label||'Œuvre')}</strong><small>${escapeHtml([event.date_text||event.year,event.title||event.description].filter(Boolean).join(' · '))}</small></div></article>`);}
        };
        const body=(bodies[blockKey]||bodies.identity)();
        return card(index,`${label} · ${personTitle}`,'',body,spanClass,`${isSpecific?'':`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>`}<button class="button small" data-open-dashboard-person="${person.id}">Ouvrir fiche</button>`);
    }
    function dashboardCompletionCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune fiche prioritaire à compléter.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.person_name||'Personne')}</strong><small>${escapeHtml((item.reasons||[]).join(' · '))}</small></div><button class="button small secondary" data-open-dashboard-person="${item.id}">Ouvrir</button></article>`);
        return card(index,'Personnes à compléter',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="persons">Personnes</button>`);
    }
    function dashboardPeopleIssueCard(index,title,items,spanClass,emptyText){
        const body=dashboardListRows(items,emptyText,item=>`<article class="dashboard-row"><div><strong>${escapeHtml(personName(item)||item.person_name||'Personne')}</strong><small>${escapeHtml(years(item)||'Dates inconnues')}</small></div><button class="button small secondary" data-open-dashboard-person="${item.id}">Ouvrir</button></article>`);
        return card(index,title,items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="persons">Personnes</button>`);
    }
    function dashboardEventSourceCard(index,items,spanClass){
        const body=dashboardListRows(items,'Tous les événements récents ont une source.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.type_label||'Événement')} · ${escapeHtml(item.date_text||item.year||'date inconnue')}</strong><small>${escapeHtml(item.person_name||'Personne non liée')}${item.place_name?` · ${escapeHtml(item.place_name)}`:''}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:''}</article>`);
        return card(index,'Événements sans source',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="events">Événements</button>`);
    }
    function dashboardEventIssueCard(index,title,items,spanClass,emptyText){
        const body=dashboardListRows(items,emptyText,item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.type_label||'Événement')} · ${escapeHtml(item.date_text||item.year||'date inconnue')}</strong><small>${escapeHtml(item.person_name||'Personne non liée')}${item.place_name?` · ${escapeHtml(item.place_name)}`:''}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:''}</article>`);
        return card(index,title,items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="events">Événements</button>`);
    }
    function dashboardMediaIssueCard(index,title,items,spanClass,emptyText){
        const body=dashboardListRows(items,emptyText,item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.title||item.filename||'Média')}</strong><small>${item.date_text||item.document_reference?escapeHtml(item.date_text||item.document_reference):mediaTypeShortLabelWithIcon(item)}</small></div><button class="button small secondary" data-dashboard-list="media">Médias</button></article>`);
        return card(index,title,items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="media">Voir les médias</button>`);
    }
    function dashboardSignaturesToCompareCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune signature identifiée à comparer.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.person_name||'Signature')}</strong><small>${escapeHtml(item.title||item.document_reference||item.filename||'Média lié')}${item.confidence?` · ${escapeHtml(item.confidence)}`:''}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:''}</article>`);
        return card(index,'Signatures à comparer',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="signatures">Signatures</button>`);
    }
    function dashboardPlacesToCompleteCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucun lieu prioritaire à compléter.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml([item.name,item.subdivision].filter(Boolean).join(' · ')||'Lieu')}</strong><small>${escapeHtml([item.county,item.state,item.country].filter(Boolean).join(', ')||'Coordonnées ou pays à compléter')} · ${plural(Number(item.event_count||0),'évènement')}</small></div><button class="button small secondary" data-dashboard-list="places">Lieux</button></article>`);
        return card(index,'Communes à compléter',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="places">Lieux</button>`);
    }
    function dashboardBranchesCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune branche à prioriser.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.branch||'Branche')}</strong><small>${plural(Number(item.person_count||0),'personne')} · ${plural(Number(item.source_count||0),'source')} · ${plural(Number(item.media_count||0),'média')}</small></div></article>`);
        return card(index,'Branches les moins documentées',items.length,body,spanClass);
    }
    function dashboardCouplesCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucun couple prioritaire sans mariage.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml([item.partner1_name||'Personne 1',item.partner2_name||'Personne 2'].join(' + '))}</strong><small>${plural(Number(item.child_count||0),'enfant connu','enfants connus')}</small></div>${item.partner1_id?`<button class="button small secondary" data-open-dashboard-person="${item.partner1_id}">Ouvrir</button>`:''}</article>`);
        return card(index,'Couples sans mariage',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="events">Événements</button>`);
    }
    function dashboardConsistencyCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune incohérence de dates détectée.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml([item.first_name,item.last_name].filter(Boolean).join(' ')||'Personne')}</strong><small>Naissance ${escapeHtml(item.birth_year||'?')} · décès ${escapeHtml(item.death_year||'?')}</small></div><button class="button small secondary" data-open-dashboard-person="${item.id}">Ouvrir</button></article>`);
        return card(index,'Incohérences et conflits',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-maintenance="issues">Vérifier</button>`);
    }
    function dashboardSosaMissingCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucun SOSA manquant proche.',item=>`<article class="dashboard-row"><div><strong>SOSA ${Number(item.sosa||0).toLocaleString('fr-FR')}</strong><small>${escapeHtml(item.side||'')} · génération ${Number(item.generation||0)}</small></div><button class="button small secondary" data-dashboard-list="sosa">SOSA</button></article>`);
        return card(index,'SOSA manquants proches',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="sosa">SOSA</button>`);
    }
    function dashboardBattueTownsCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune commune de battue à reprendre.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.commune_name||item.insee_code||'Commune')}</strong><small>${escapeHtml(item.battue_title||'Battue')} · ${escapeHtml(item.status_label||'Pas commencé')} · ${Number(item.todo_count||0)} à chercher</small></div><button class="button small secondary" data-dashboard-module="enquetes">Battues</button></article>`);
        return card(index,'Communes à explorer',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-module="enquetes">Battues</button>`);
    }
    function dashboardBattuesPriorityCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune battue prioritaire.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.title||'Battue')}</strong><small>${escapeHtml(item.start_name||'Commune de départ inconnue')} · ${Number(item.todo_count||0)} à chercher · ${plural(Number(item.item_count||0),'annotation')}</small></div><button class="button small secondary" data-dashboard-module="enquetes">Ouvrir</button></article>`);
        return card(index,'Battues prioritaires',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-module="enquetes">Battues</button>`);
    }
    function dashboardSourcesToCheckCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune source ou piste à vérifier.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.title||'À vérifier')}</strong><small>${escapeHtml(item.origin||'')} ${item.status_label?`· ${escapeHtml(item.status_label)}`:''}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:''}</article>`);
        return card(index,'Sources à vérifier',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="reminders">Rappels</button>`);
    }
    function dashboardDailyResearchCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune action prioritaire pour le moment.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.title||'À traiter')}</strong><small>${escapeHtml(item.origin||'')} ${item.status_label?`· ${escapeHtml(item.status_label)}`:''}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:`<button class="button small secondary" data-dashboard-module="recherche">Voir</button>`}</article>`);
        return card(index,'Liste de travail quotidienne',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-module="recherche">Recherche</button>`);
    }
    function dashboardArchiveFavoritesCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucune archive disponible.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(`${item.code||''} · ${item.name||item.department||'Archives'}`)}</strong><small>${escapeHtml(item.search_url||item.url||'Lien à vérifier')}</small></div>${item.search_url||item.url?`<a class="button small secondary" href="${escapeHtml(window.LCNDA_APP.safeUrl?.(item.search_url||item.url)||'#')}" target="_blank" rel="noopener">Ouvrir</a>`:''}</article>`);
        return card(index,'Archives favorites',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="archives">Archives</button>`);
    }
    function dashboardRereadCard(index,items,spanClass){
        const body=dashboardListRows(items,'Rien à relire pour le moment.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.title||'À relire')}</strong><small>${escapeHtml(item.investigation_title||'Enquête')} · ${escapeHtml(item.status||'')}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:''}</article>`);
        return card(index,'À relire',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-module="enquetes">Enquêtes</button>`);
    }
    function dashboardSosaProgressCard(index,progress,spanClass){
        const pct=Number(progress.percent||0);
        const body=progress.root_id?`<div class="dashboard-coverage"><div><span>${escapeHtml(progress.root_name||'Racine SOSA')}</span><strong>${pct.toLocaleString('fr-FR')}%</strong><i><b style="width:${Math.max(0,Math.min(100,pct))}%"></b></i><small>${plural(Number(progress.found||0),'renseigné')} · ${plural(Number(progress.missing||0),'manquant')} · ${plural(Number(progress.duplicates||0),'doublon')}</small></div></div>`:empty('Aucune racine SOSA définie.',{icon:'🌳'});
        return card(index,'Progression SOSA','',body,spanClass,`<button class="button small secondary" data-dashboard-list="sosa">SOSA</button>`);
    }
    function dashboardDuplicatesCard(index,items,spanClass){
        const body=dashboardListRows(items,'Aucun doublon probable repéré.',item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.label||'Doublon probable')}</strong><small>${plural(Number(item.count||0),'personne')} · naissance ${escapeHtml(item.birth_year||'?')}</small></div><button class="button small secondary" data-dashboard-maintenance="duplicates">Vérifier</button></article>`);
        return card(index,'Doublons probables',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-maintenance="duplicates">Doublons</button>`);
    }
    function dashboardLabelsCard(index,items,spanClass){
        const body=items.length?`<div class="dashboard-labels">${items.map(label=>`<button type="button" class="dashboard-label-chip" data-dashboard-list="labels" style="--label-color:${escapeHtml(label.color||'#f1c36d')}"><span></span><strong>${escapeHtml(label.name)}</strong><small>${plural(Number(label.link_count||0),'lien')}</small></button>`).join('')}</div>`:empty('Aucune étiquette.',{icon:'🏷️'});
        return card(index,'Étiquettes',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="labels">Toutes</button>`);
    }
    function dashboardMiniMapSvg(points,limit=80){
        const valid=(points||[]).slice(0,Math.max(1,limit)).map(point=>({lat:Number(point.latitude),lon:Number(point.longitude),count:Number(point.count||1),label:point.name||point.place||''})).filter(point=>isUsableMapCoord(point.lat,point.lon));
        if(!valid.length)return empty('Aucun point géographique exploitable.',{icon:'🗺️'});
        const width=620,height=260,padding=48;
        let zoom=valid.length===1?11:7;
        for(let z=12;z>=2;z--){
            const xs=valid.map(point=>lngToX(point.lon,z)),ys=valid.map(point=>latToY(point.lat,z));
            const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys);
            if((valid.length===1||dx<=width-padding*2)&&dy<=height-padding*2){zoom=z;break;}
        }
        const xs=valid.map(point=>lngToX(point.lon,zoom)),ys=valid.map(point=>latToY(point.lat,zoom));
        const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
        const left=(minX+maxX)/2-width/2,top=(minY+maxY)/2-height/2;
        let design={};try{design=readDesignSettings();}catch(_){design={};}
        const mapBg=mapBackgroundValue(design.mapBackground);
        const world=Math.pow(2,zoom),tileMinX=Math.floor(left/256),tileMaxX=Math.ceil((left+width)/256),tileMinY=Math.floor(top/256),tileMaxY=Math.ceil((top+height)/256);
        let tiles='',tileCount=0;
        if(!['grid','color'].includes(mapBg)){
            for(let tx=tileMinX;tx<=tileMaxX;tx++){
                for(let ty=tileMinY;ty<=tileMaxY;ty++){
                    if(ty<0||ty>=world||tileCount>80)continue;
                    const wrapped=((tx%world)+world)%world;
                    tiles+=`<img class="dashboard-mini-map-tile" draggable="false" referrerpolicy="no-referrer" src="${mapTileUrl(mapBg,zoom,wrapped,ty)}" style="left:${((tx*256-left)/width)*100}%;top:${((ty*256-top)/height)*100}%;width:${(256/width)*100}%;height:${(256/height)*100}%" alt="">`;
                    tileCount++;
                }
            }
        }
        const markers=valid.map(point=>{const px=Math.max(18,Math.min(width-18,lngToX(point.lon,zoom)-left)),py=Math.max(18,Math.min(height-18,latToY(point.lat,zoom)-top));return `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><title>${escapeHtml(point.label)}</title><rect x="-7" y="-7" width="14" height="14" transform="rotate(45)"/><text y="4">${point.count>1?Math.min(99,point.count):''}</text></g>`;}).join('');
        return `<div class="dashboard-mini-map map-bg-${escapeHtml(mapBg)}">${tiles}<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Aperçu cartographique"><defs><pattern id="dashboard-map-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" fill="none"/></pattern></defs><rect width="${width}" height="${height}" class="dashboard-mini-map-bg"/><rect width="${width}" height="${height}" fill="url(#dashboard-map-grid)" class="dashboard-mini-map-grid"/>${markers}</svg></div>`;
    }
    function dashboardMapCard(index,title,map,spanClass,limit){
        const body=dashboardMiniMapSvg(map.points||[],limit);
        return card(index,title,Number(map.total||0).toLocaleString('fr-FR'),body,spanClass,`<button class="button small secondary" data-open-dashboard-map="1">Ouvrir la carte</button>`);
    }
    function dashboardPersonMapCard(index,map,spanClass,limit,isSpecific=false,widgetId=''){
        const person=map.person||null;
        const body=person?`<div class="dashboard-person-map-head"><strong>${escapeHtml(person.person_name||'Personne')}</strong><small>${escapeHtml(person.years||'')}</small></div>${dashboardMiniMapSvg(map.points||[],limit)}`:empty('Aucune personne avec lieux datés.',{icon:'🗺️'});
        return card(index,'Carte d’une personne',Number(map.points?.length||0),body,spanClass,`${isSpecific?'':`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>`}${person?`<button class="button small" data-open-dashboard-person-map="${person.id}" data-person-name="${escapeHtml(person.person_name||'')}">Itinéraire</button>`:''}`);
    }
    function dashboardPersonTimelineCard(index,detail,spanClass,limit,isSpecific=false,widgetId=''){
        if(!detail?.person)return card(index,'Timeline d’une personne','',empty('Aucune personne disponible.',{icon:'👥'}),spanClass);
        const person=detail.person;
        const events=[...(detail.events||[])].filter(event=>event.date_text||event.year).sort((a,b)=>(Number(a.year)||99999)-(Number(b.year)||99999)||Number(a.id)-Number(b.id)).slice(0,limit);
        const body=events.length?`<div class="dashboard-list dashboard-timeline-list">${events.map(event=>`<article class="dashboard-row"><div><strong>${escapeHtml(event.date_text||event.year||'Date inconnue')}</strong><small>${escapeHtml(event.type_label||'Événement')}${placeDisplay(event)?` · ${escapeHtml(placeDisplay(event))}`:''}</small></div></article>`).join('')}</div>`:empty('Aucun événement daté.',{icon:'📅'});
        return card(index,`Timeline · ${personName(person)||'Personne'}`,events.length,body,spanClass,`${isSpecific?'':`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>`}<button class="button small" data-open-dashboard-person="${person.id}">Ouvrir fiche</button>`);
    }
    function dashboardQuickStatCard(index,data,key,spanClass){
        const stats=data.stats||{},work=data.work||{};
        const values={
            persons:['Personnes',stats.persons,'Fiches dans la base'],
            events:['Événements',stats.events,'Éléments datés ou localisés'],
            media:['Médias',stats.media,'Documents et images'],
            sources:['Sources',stats.sources,'Sources enregistrées'],
            reminders_due:['Rappels proches',work.reminders_due,'À faire dans les 30 jours'],
            open_investigations:['Enquêtes ouvertes',work.open_investigations,'En cours ou en pause'],
            open_battues:['Battues ouvertes',work.open_battues,'Recherches commune par commune'],
            issues:['Incohérences',work.issues,'À vérifier dans maintenance']
        };
        const [label,value,subtitle]=values[key]||values.persons;
        const body=`<div class="dashboard-single-stat"><strong>${Number(value||0).toLocaleString('fr-FR')}</strong><span>${escapeHtml(subtitle)}</span></div>`;
        return card(index,label,'',body,spanClass);
    }
    function dashboardSessionGoalCard(index,goal,spanClass,person=null){
        const linkedPerson=person?`<button class="table-link" data-open-dashboard-person="${person.id}">${escapeHtml(personName(person))}</button>`:'';
        const body=goal?`<div class="dashboard-session-goal"><p>${escapeHtml(goal)}</p>${linkedPerson?`<small>Personne liée : ${linkedPerson}</small>`:''}</div>`:empty('Ajoute un objectif dans les réglages du widget.',{icon:'🎯'});
        return card(index,'Objectif de session','',body,spanClass);
    }
    function dashboardAchievementsCard(index,data,spanClass){
        const stats=data.stats||{},coverage=data.coverage||{},sosa=data.sosa_progress||{};
        const badges=[
            [Number(stats.persons||0)>=100,'100 fiches','Au moins 100 personnes enregistrées'],
            [Number(stats.media||0)>=100,'100 médias','Au moins 100 documents conservés'],
            [Number(coverage.sources?.percent||0)>=50,'Sources','Au moins la moitié des fiches sourcées'],
            [Number(coverage.media?.percent||0)>=50,'Illustrée','Au moins la moitié des fiches avec un média'],
            [Number(sosa.complete_generations||0)>=5,'5 générations SOSA','Cinq générations complètes'],
            [Number(stats.battues||0)>=1,'Battue','Au moins une battue créée']
        ];
        const earned=badges.filter(item=>item[0]);
        const body=`<div class="dashboard-achievements">${badges.map(([done,label,detail])=>`<article class="${done?'is-earned':''}"><span>${done?'★':'○'}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div></article>`).join('')}</div>`;
        return card(index,'Accomplissements',`${earned.length}/${badges.length}`,body,spanClass);
    }
    function dashboardStatsCard(index,stats,spanClass){
        const metrics=[['Personnes',stats.persons],['Événements',stats.events],['Médias',stats.media],['Lieux',stats.places],['Sources',stats.sources],['Étiquettes',stats.labels],['Enquêtes',stats.investigations],['Battues',stats.battues]];
        return card(index,'Chiffres clés','',`<div class="dashboard-metrics">${metrics.map(([label,value])=>`<div><strong>${Number(value||0).toLocaleString('fr-FR')}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>`, spanClass, `<button class="button small secondary" data-dashboard-list="persons">Listes</button>`);
    }
    function dashboardUpcomingCard(index,items,spanClass){
        const body=items.length?`<div class="dashboard-list">${items.map(item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.date_label)} · ${escapeHtml(item.when_label)}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:''}</article>`).join('')}</div>`:empty('Aucune date récurrente repérée dans les 7 prochains jours.',{icon:'🎂'});
        return card(index,'Cette semaine dans l’histoire familiale',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-module="chronologie">Chronologie</button>`);
    }
    function dashboardRemindersCard(index,items,spanClass){
        const body=items.length?`<div class="dashboard-list">${items.map(item=>`<article class="dashboard-row"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.date_label)} · ${escapeHtml(item.origin||'Rappel')}</small></div>${item.person_id?`<button class="button small secondary" data-open-dashboard-person="${item.person_id}">Ouvrir</button>`:''}</article>`).join('')}</div>`:empty('Aucun rappel à venir.',{icon:'⏰'});
        return card(index,'Rappels',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="reminders">Tous</button>`);
    }
    function dashboardChangesCard(index,items,spanClass){
        return card(index,'Dernières modifications',items.length,dashboardChangeRows(items,false),spanClass,`<button class="button small secondary" data-dashboard-maintenance="changes">Journal</button>`);
    }
    function dashboardDeletionsCard(index,items,spanClass){
        return card(index,'Dernières suppressions',items.length,dashboardChangeRows(items,true),spanClass,`<button class="button small secondary" data-dashboard-maintenance="changes">Journal</button>`);
    }
    function dashboardChangeRows(items,restore){
        if(!items.length)return empty(restore?'Aucune suppression récente.':'Aucune modification récente.',{icon:'🕘'});
        return `<div class="dashboard-list">${items.map(row=>`<article class="dashboard-row"><div><strong>${escapeHtml(row.summary||row.action||'Modification')}</strong><small>${window.LCNDA_UI?.when?.(row.created_at)||escapeHtml(row.created_at||'')} · ${escapeHtml(row.entity_label||row.entity_type||'')}</small></div>${restore&&row.restore_available?`<button class="button small secondary" data-dashboard-restore="${row.id}">Restaurer</button>`:restore&&row.restore_blocked?`<button class="button small secondary is-disabled" disabled title="${escapeHtml(row.restore_block_reason||'Restauration bloquée')}">Restaurer</button>`:''}</article>`).join('')}</div>`;
    }
    function dashboardRandomPersonCard(index,person,spanClass,isSpecific=false,widgetId=''){
        const body=person?`<div class="dashboard-person">${window.LCNDA_UI?.avatarOn?.()?window.LCNDA_UI.avatar({...person,name:personName(person),photo:person.portrait?`media/${encodeURIComponent(person.portrait)}`:''},48):`<div class="avatar">${escapeHtml((person.first_name||person.last_name||'?').slice(0,2).toUpperCase())}</div>`}<div><h4>${escapeHtml(personName(person))}</h4><p>${escapeHtml(years(person))}</p>${person.surname_group?`<small>Groupe : ${escapeHtml(person.surname_group)}</small>`:''}</div></div>`:empty('Aucune personne disponible.',{icon:'👥'});
        return card(index,isSpecific?'Personne choisie':'Personne au hasard','',body,spanClass,`${isSpecific?'':`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>`}${person?`<button class="button small" data-open-dashboard-person="${person.id}">Ouvrir</button>`:''}`);
    }
    function dashboardPersonQuizCard(index,quiz,spanClass,widgetId=''){
        if(!quiz)return card(index,'Quiz personne','',empty('Aucun événement exploitable pour ce quiz avec les filtres choisis.',{icon:'❓'}),spanClass,`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>`);
        const label=String(quiz.event_label||'événement').toLowerCase();
        const person=quiz.person_name||'Personne sans nom';
        const answer=String(quiz.answer||'').trim();
        const choices=(quiz.choices||[]).filter(Boolean);
        if(!answer||choices.length<2)return card(index,'Quiz personne','',empty('Pas assez de dates distinctes pour générer des propositions.',{icon:'❓'}),spanClass,`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>`);
        const body=`<div class="dashboard-quiz"><p>Quelle est la date de <strong>${escapeHtml(label)}</strong> de <strong>${escapeHtml(person)}</strong> ?</p><div class="dashboard-quiz-answers">${choices.map(choice=>`<button type="button" data-dashboard-quiz-choice data-correct="${choice===answer?'1':'0'}">${escapeHtml(choice)}</button>`).join('')}</div></div>`;
        return card(index,'Quiz personne','',body,spanClass,`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>${quiz.person_id?`<button class="button small" data-open-dashboard-person="${quiz.person_id}">Ouvrir</button>`:''}`);
    }
    function dashboardRandomMediaCard(index,media,spanClass,widgetId='',isFavorite=false){
        if(!media)return card(index,isFavorite?'Image favorite':'Image au hasard','',empty(isFavorite?'Choisis une image dans les réglages du widget.':'Aucune image disponible.',{icon:'🖼️'}),spanClass,isFavorite?'':`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>`);
        const title=media?.title||media?.document_title||media?.filename||'Média';
        const personLink=media?.attachment_person_id?`<button type="button" class="table-link dashboard-media-person" data-open-dashboard-person="${media.attachment_person_id}">${escapeHtml(media.attachment_person_name||'Personne liée')}</button>`:'';
        const preview=normalizedMediaType(media)==='image'&&(media.thumbnail||media.filename)?`<img src="media/${encodeURIComponent(media.thumbnail||media.filename)}" alt="${escapeHtml(title)}">`:`<span>${mediaTypeShortLabelWithIcon(media)}</span>`;
        const originLabel=media?.attachment_origin_label||media?.attachment_label||'';
        const origin=personLink?`<div class="dashboard-media-origin">${personLink}</div>`:(originLabel?`<div class="dashboard-media-origin">${escapeHtml(originLabel)}</div>`:'');
        const body=`<article class="dashboard-media-random"><button type="button" class="dashboard-media-preview" data-open-dashboard-media="${media.id}">${preview}</button>${origin}<button type="button" class="dashboard-media-title" data-open-dashboard-media="${media.id}"><strong>${escapeHtml(title)}</strong></button><small>${escapeHtml(media.date_text||media.document_reference||'')}</small></article>`;
        return card(index,isFavorite?'Image favorite':'Image au hasard','',body,spanClass,isFavorite?'':`<button class="button small secondary" data-reroll-dashboard-widget="${escapeHtml(widgetId)}">Changer</button>`);
    }
    function dashboardKinshipWidgetCard(index,left,right,spanClass){
        const body=(left&&right)?`<div class="dashboard-kinship-widget"><button class="table-link" data-open-dashboard-person="${left.id}">${escapeHtml(personName(left))}</button><span>↔</span><button class="table-link" data-open-dashboard-person="${right.id}">${escapeHtml(personName(right))}</button><small>Ouvre Comparaison pour analyser le lien.</small></div>`:empty('Choisis deux personnes dans les réglages du widget.',{icon:'👥'});
        return card(index,'Lien entre deux personnes','',body,spanClass,`<button class="button small secondary" data-dashboard-module="comparaison">Comparer</button>`);
    }
    function dashboardFavoritesCard(index,items,spanClass){
        const body=items.length?`<div class="dashboard-list">${items.map(person=>`<article class="dashboard-row"><div><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small></div><button class="button small secondary" data-open-dashboard-person="${person.id}">Ouvrir</button></article>`).join('')}</div>`:empty('Aucune personne favorite.',{icon:'⭐'});
        return card(index,'Personnes favorites',items.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="persons">Personnes</button>`);
    }
    function dashboardWorkCard(index,work,spanClass){
        const metrics=[['Rappels à traiter',work.reminders_due],['Alertes cohérence',work.issues],['Enquêtes ouvertes',work.open_investigations],['Battues ouvertes',work.open_battues],['Suppressions restaurables',work.restorable_deletions]];
        return card(index,'Travail à suivre','',`<div class="dashboard-mini-metrics">${metrics.map(([label,value])=>`<button type="button" ${label.includes('Alertes')?'data-dashboard-maintenance="issues"':label.includes('Suppressions')?'data-dashboard-maintenance="changes"':label.includes('Enquêtes')||label.includes('Battues')?'data-dashboard-module="enquetes"':'data-dashboard-list="reminders"'}><strong>${Number(value||0).toLocaleString('fr-FR')}</strong><span>${escapeHtml(label)}</span></button>`).join('')}</div>`,spanClass);
    }
    function dashboardCoverageCard(index,coverage,spanClass){
        const rows=[['Naissance renseignée',coverage.birth],['Décès renseigné',coverage.death],['Au moins un média',coverage.media],['Au moins une source',coverage.sources]];
        return card(index,'Couverture de la base','',`<div class="dashboard-coverage">${rows.map(([label,row])=>{const pct=Number(row?.percent||0);return `<div><span>${escapeHtml(label)}</span><strong>${pct.toLocaleString('fr-FR')}%</strong><i><b style="width:${Math.max(0,Math.min(100,pct))}%"></b></i><small>${Number(row?.count||0).toLocaleString('fr-FR')} / ${Number(coverage.total||0).toLocaleString('fr-FR')}</small></div>`;}).join('')}</div>`,spanClass);
    }
    function dashboardPlacesCard(index,places,spanClass){
        const body=places.length?`<div class="dashboard-list">${places.map(place=>`<article class="dashboard-row"><div><strong>${escapeHtml(place.name||'Lieu sans nom')}</strong><small>${plural(Number(place.event_count||0),'événement')}</small></div></article>`).join('')}</div>`:empty('Aucun lieu renseigné.',{icon:'📍'});
        return card(index,'Lieux les plus présents',places.length,body,spanClass,`<button class="button small secondary" data-dashboard-list="places">Voir les lieux</button>`);
    }

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderDashboard, renderDashboardSidebar});
    if (state.module === 'dashboard' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
