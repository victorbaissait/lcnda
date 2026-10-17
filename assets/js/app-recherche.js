/* LCNDA — 🔎 Recherche (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Recherche par question, texte, lieu, dates, proximité, transcriptions, INSEE, internet, recherches enregistrées. Les imports INSEE (aussi lancés au démarrage) restent dans app.js.
 */
(() => {
    'use strict';
    const {$, $$, api, askText, bindTableLinks, debounce, empty, escapeHtml, formObject, importUpload, inseeAuto, inseeImportRemote, inseeSize, mediaTypeShortLabel, mediaTypeShortLabelWithIcon, normalizedMediaType, onOutsideClick, openLightbox, persistUiState, personName, placeDisplay, relationYears, renderSidebar, researchProximityFieldsHtml, safeUrl, setupDragOrder, sidebarSignal, state, toast, typeGlyph, webSearchAllSites, webSearchContext, webSearchGroups, webSearchLifeRange, webSearchParams, webSearchSettings, years} = window.LCNDA_APP;
    function renderResearchSidebar(content,footer){
        const usedTypes=state.bootstrap.eventTypes.filter(type=>Number(type.usage_count)>0).sort((a,b)=>a.label.localeCompare(b.label,'fr',{sensitivity:'base'}));
        const options=usedTypes.map(type=>`<option value="${type.id}" ${Number(type.id)===Number(state.dateSearch.eventTypeId)?'selected':''}>${escapeHtml(type.label)} (${Number(type.usage_count).toLocaleString('fr-FR')})</option>`).join('');
        const dateWindowMode=state.dateSearch.dateWindowMode||'exact';
        content.innerHTML=`<form id="research-form" class="sidebar-form"><label>Type de recherche<select name="search_kind"><option value="question" ${state.researchKind==='question'?'selected':''}>Poser une question en français</option><option value="text" ${state.researchKind==='text'?'selected':''}>Texte, personne ou lieu</option><option value="place_name" ${state.researchKind==='place_name'?'selected':''}>Nom de lieu avec joker</option><option value="dates" ${state.researchKind==='dates'?'selected':''}>Période ou date précise</option><option value="proximity" ${state.researchKind==='proximity'?'selected':''}>Proximité géographique et temporelle</option><option value="transcriptions" ${state.researchKind==='transcriptions'?'selected':''}>Plein texte dans les transcriptions</option><option value="insee" ${state.researchKind==='insee'?'selected':''}>Décès (fichier INSEE)</option><option value="web" ${state.researchKind==='web'?'selected':''}>Chercher sur internet</option><option value="saved" ${state.researchKind==='saved'?'selected':''}>Recherche multicritère / recherches enregistrées</option></select></label>${researchProximityFieldsHtml()}<div id="research-text-fields"><label>Rechercher<input name="text_q" value="${escapeHtml(state.research.q)}" placeholder="Nom, ville, année…" autocomplete="off"></label><label>Dans<select name="category"><option value="all">Tout</option><option value="name" ${state.research.category==='name'?'selected':''}>Noms et personnes</option><option value="place" ${state.research.category==='place'?'selected':''}>Villes, lieux et pays</option><option value="year" ${state.research.category==='year'?'selected':''}>Années</option><option value="occupation" ${state.research.category==='occupation'?'selected':''}>Métier / activité</option><option value="employer" ${state.research.category==='employer'?'selected':''}>Employeur</option></select></label></div><div id="research-place-name-fields"><label>Nom du lieu<input name="place_name_q" value="${escapeHtml(state.placeNameSearch?.q||'')}" placeholder="Ex : *aris, Sa* Denis, **mont" autocomplete="off"></label><label>Pays<input name="place_name_country" value="${escapeHtml(state.placeNameSearch?.country||'')}" placeholder="France, Belgique…" list="place-name-country-options" autocomplete="off"><datalist id="place-name-country-options"></datalist></label><label>Division / subdivision<input name="place_name_division" value="${escapeHtml(state.placeNameSearch?.division||'')}" placeholder="Seine-Saint-Denis, Réunion, Québec…" list="place-name-division-options" autocomplete="off"><datalist id="place-name-division-options"></datalist></label></div><div id="research-transcription-fields"><label>Texte à chercher<input name="transcription_q" value="${escapeHtml(state.transcriptionSearch.q||'')}" placeholder="Mot ou expression dans OCR, HTR ou saisie manuelle…" autocomplete="off"></label></div><div id="research-insee-fields"><label>Prénom<input name="insee_prenom" value="${escapeHtml(state.inseeSearch?.prenom||'')}" placeholder="Prénom" autocomplete="off"></label><label>Nom<input name="insee_nom" value="${escapeHtml(state.inseeSearch?.nom||'')}" placeholder="Nom" autocomplete="off"></label><label>Sexe<select name="insee_sexe"><option value="">Indifférent</option><option value="M" ${state.inseeSearch?.sexe==='M'?'selected':''}>Homme</option><option value="F" ${state.inseeSearch?.sexe==='F'?'selected':''}>Femme</option></select></label><label>Date de naissance<input name="insee_date_naissance" value="${escapeHtml(state.inseeSearch?.dateNaissance||'')}" placeholder="JJ/MM/AAAA ou AAAA"></label><div class="year-range-fields"><label>Né(e) entre<input name="insee_birth_year_from" type="number" min="1700" max="2200" value="${escapeHtml(state.inseeSearch?.birthYearFrom||'')}" placeholder="1900"></label><label>et<input name="insee_birth_year_to" type="number" min="1700" max="2200" value="${escapeHtml(state.inseeSearch?.birthYearTo||'')}" placeholder="1950"></label></div><label>Commune de naissance<input name="insee_commune_naissance" value="${escapeHtml(state.inseeSearch?.communeNaissance||'')}" placeholder="Ville de naissance" autocomplete="off"></label><label>Date de décès<input name="insee_date_deces" value="${escapeHtml(state.inseeSearch?.dateDeces||'')}" placeholder="JJ/MM/AAAA ou AAAA"></label><div class="year-range-fields"><label>Décédé(e) entre<input name="insee_death_year_from" type="number" min="1700" max="2200" value="${escapeHtml(state.inseeSearch?.deathYearFrom||'')}" placeholder="2000"></label><label>et<input name="insee_death_year_to" type="number" min="1700" max="2200" value="${escapeHtml(state.inseeSearch?.deathYearTo||'')}" placeholder="2024"></label></div><label>Commune de décès<input name="insee_commune_deces" value="${escapeHtml(state.inseeSearch?.communeDeces||'')}" placeholder="Ville de décès" autocomplete="off"></label><label>Département (naissance ou décès)<input name="insee_departement" value="${escapeHtml(state.inseeSearch?.departement||'')}" placeholder="Ex : 75, 2A, 971…" autocomplete="off"></label><label>Région (naissance ou décès)<input name="insee_region" value="${escapeHtml(state.inseeSearch?.region||'')}" placeholder="Ex : Bretagne, Occitanie…" autocomplete="off"></label></div><div id="research-date-fields"><label>Précision<select name="date_mode"><option value="range">Période par années</option><option value="exact" ${state.dateSearch.mode==='exact'?'selected':''}>Date(s) précise(s)</option></select></label><div class="year-range-fields" id="research-year-range"><label>De<input name="year_from" type="number" min="1" max="9999" value="${escapeHtml(state.dateSearch.yearFrom)}" placeholder="1300"></label><label>À<input name="year_to" type="number" min="1" max="9999" value="${escapeHtml(state.dateSearch.yearTo)}" placeholder="1650"></label></div><div id="research-exact-date-fields"><label>Date(s) précise(s)<input name="exact_dates" value="${escapeHtml(state.dateSearch.values)}" placeholder="08/03/1922, 07/05/1925"></label><label>Élargir<select name="date_window_mode"><option value="exact">Non, date exacte</option><option value="before" ${dateWindowMode==='before'?'selected':''}>Avant</option><option value="after" ${dateWindowMode==='after'?'selected':''}>Après</option><option value="both" ${dateWindowMode==='both'?'selected':''}>Avant et après</option></select></label><label id="research-date-window-days">Nombre de jours<input name="date_window_days" type="number" min="0" max="365" step="1" value="${escapeHtml(state.dateSearch.dateWindowDays||'')}" placeholder="30"></label></div><label>Événements<select name="event_type_id"><option value="0">Tous les événements</option>${options}</select></label><label>Métier<select name="occupation_id"><option value="">Tous les métiers</option>${(state.bootstrap.occupations||[]).map(occ=>`<option value="${escapeHtml(occ.name)}" ${state.dateSearch.occupationId===occ.name?'selected':''} >${escapeHtml(occ.name)} (${Number(occ.person_count).toLocaleString('fr-FR')})</option>`).join('')}</select></label><div class="research-place-picker" id="research-place-picker"><span class="research-place-label">Ville</span><div class="research-place-input-wrap"><input id="research-place-input" type="text" autocomplete="off" placeholder="Filtrer par ville…" value=""><input type="hidden" name="date_place_id" value="${escapeHtml(String(state.dateSearch.placeId||0))}"><div class="place-suggestions" id="research-place-suggestions" hidden></div></div>${state.dateSearch.placeId&&state.dateSearch.placeName?`<div class="research-place-chip"><span>${escapeHtml(state.dateSearch.placeName)}</span><button type="button" class="research-place-chip-remove" id="research-place-remove" aria-label="Supprimer la ville">×</button></div>`:''}</div><label>Mot facultatif<input name="date_q" value="${state.researchKind==='dates'?escapeHtml(state.research.q):''}" placeholder="Personne, type…"></label></div><button class="button" type="submit">Afficher les correspondances</button><div class="segmented result-display"><button type="button" data-research-display="list" class="${state.researchDisplay==='list'?'is-active':''}">Liste</button><button type="button" data-research-display="cards" class="${state.researchDisplay==='cards'?'is-active':''}">Fiches</button></div></form>`;
        footer.textContent='Un clic sur une ville d’un graphique ouvre aussi cet écran.';
        const searchKindSelect=$('#research-form').elements.search_kind;
        if(searchKindSelect&&!searchKindSelect.querySelector('option[value="archive_digest"]')){
            const option=document.createElement('option');
            option.value='archive_digest';
            option.textContent='Dépouillement d’archive';
            option.selected=state.researchKind==='archive_digest';
            searchKindSelect.insertBefore(option,searchKindSelect.querySelector('option[value="insee"]'));
        }
        const ads=state.archiveDigestSearch||{};
        const archiveRadius=Number(ads.radiusKm)||0;
        const archiveRadiusLabel=archiveRadius>0?`Rayon : ${archiveRadius} km`:'Commune exacte uniquement';
        $('#research-insee-fields')?.insertAdjacentHTML('beforebegin',`<div id="research-archive-digest-fields"><label>Recherche<input name="archive_digest_q" value="${escapeHtml(ads.q||'')}" placeholder="Cote, nom, archive, annotation…" autocomplete="off"></label><div class="research-place-picker archive-digest-place-picker" id="archive-digest-place-picker"><span class="research-place-label">Ville ou commune</span><div class="research-place-input-wrap"><input id="archive-digest-place-input" name="archive_digest_city" value="${escapeHtml(ads.city||ads.placeName||'')}" placeholder="Tape pour choisir une commune…" autocomplete="off"><input type="hidden" name="archive_digest_place_id" value="${escapeHtml(String(ads.placeId||0))}"><div class="place-suggestions" id="archive-digest-place-suggestions" hidden></div></div><div class="proximity-radius-field archive-digest-radius-field"><span class="research-place-label">Zone autour de la commune</span><input id="archive-digest-radius" name="archive_digest_radius_km" type="range" min="0" max="50" step="1" value="${archiveRadius}"><output id="archive-digest-radius-value" class="proximity-radius-value">${escapeHtml(archiveRadiusLabel)}</output></div></div><label>Département<input name="archive_digest_dept" value="${escapeHtml(ads.dept||'')}" placeholder="18, Cher…" autocomplete="off"></label><label>Région<input name="archive_digest_region" value="${escapeHtml(ads.region||'')}" placeholder="Centre-Val de Loire…" autocomplete="off"></label><label>Type d’acte<select name="archive_digest_record_type"><option value="">Tous</option><option value="table_decennale">Table décennale</option><option value="mariage">Mariage</option><option value="naissance">Naissance</option><option value="deces">Décès</option><option value="bapteme">Baptême</option><option value="succession">Succession</option><option value="recensement">Recensement</option><option value="prison">Prison</option><option value="fiche_militaire">Fiche militaire</option><option value="liste_prisonnier">Liste prisonnier</option><option value="autre">Autre</option></select></label><label>État<select name="archive_digest_status"><option value="">Tous</option><option value="todo">À faire</option><option value="done">Terminé</option><option value="review">À revoir</option><option value="doubt">Doute</option><option value="priority">Priorité</option><option value="later">Plus tard</option></select></label></div>`);
        if($('#research-form').elements.archive_digest_record_type)$('#research-form').elements.archive_digest_record_type.value=state.archiveDigestSearch?.recordType||'';
        if($('#research-form').elements.archive_digest_status)$('#research-form').elements.archive_digest_status.value=state.archiveDigestSearch?.status||'';
        const archiveDigestAddButton=document.createElement('button');
        archiveDigestAddButton.type='button';
        archiveDigestAddButton.className='button secondary';
        archiveDigestAddButton.id='archive-digest-add';
        archiveDigestAddButton.textContent='+ Ajouter un dépouillement';
        $('#research-form button[type="submit"]')?.insertAdjacentElement('afterend',archiveDigestAddButton);
        const updateFields=()=>{const form=$('#research-form'),kind=form.elements.search_kind.value;const dates=kind==='dates';const proximity=kind==='proximity';const transcriptions=kind==='transcriptions';const placeName=kind==='place_name';const insee=kind==='insee';const archiveDigest=kind==='archive_digest';const web=kind==='web'||kind==='question';$('#research-text-fields').hidden=dates||proximity||transcriptions||placeName||insee||archiveDigest||web;$('#research-archive-digest-fields').hidden=!archiveDigest;$('#research-place-name-fields').hidden=!placeName;$('#research-transcription-fields').hidden=!transcriptions;$('#research-insee-fields').hidden=!insee;$('#research-date-fields').hidden=!dates;$('#research-proximity-fields').hidden=!proximity;archiveDigestAddButton.hidden=!archiveDigest;if(dates){const exact=form.elements.date_mode.value==='exact';$('#research-year-range').hidden=exact;$('#research-exact-date-fields').hidden=!exact;$('#research-date-window-days').hidden=!exact||form.elements.date_window_mode.value==='exact';}if(proximity){const exact=(form.elements.proximity_date_mode?.value||'range')==='exact';$('#proximity-year-range').hidden=exact;$('#proximity-exact-date-fields').hidden=!exact;$('#proximity-date-window-days').hidden=!exact||form.elements.proximity_date_window_mode.value==='exact';}};updateFields();setupResearchPlacePicker();setupProximityPlacePicker();setupArchiveDigestPlacePicker();setupPlaceNameFacets();
        $('#proximity-radius')?.addEventListener('input',event=>{const km=Number(event.target.value)||0;$('#proximity-radius-value').textContent=km>0?`± ${km} km autour de la commune`:'Commune exacte uniquement';});
        $('#archive-digest-radius')?.addEventListener('input',event=>{const km=Number(event.target.value)||0;$('#archive-digest-radius-value').textContent=km>0?`Rayon : ${km} km`:'Commune exacte uniquement';});
        $('#research-form').elements.search_kind.addEventListener('change',event=>{updateFields();if(event.currentTarget.value==='insee'&&state.researchKind!=='insee'){state.researchKind='insee';persistUiState();renderResearch();}if(event.currentTarget.value==='web'&&state.researchKind!=='web'){state.researchKind='web';persistUiState();renderResearch();}if(event.currentTarget.value==='saved'&&state.researchKind!=='saved'){state.researchKind='saved';persistUiState();renderResearch();}if(event.currentTarget.value==='question'&&state.researchKind!=='question'){state.researchKind='question';persistUiState();renderResearch();}});$('#research-form').elements.date_mode.addEventListener('change',updateFields);$('#research-form').elements.date_window_mode.addEventListener('change',updateFields);$('#research-form').elements.proximity_date_mode.addEventListener('change',updateFields);$('#research-form').elements.proximity_date_window_mode.addEventListener('change',updateFields);
        $$('[data-research-display]',content).forEach(button=>button.addEventListener('click',()=>{state.researchDisplay=button.dataset.researchDisplay;persistUiState();renderSidebar();renderResearch();}));
        archiveDigestAddButton.addEventListener('click',()=>{state.archiveDigestAdding=true;state.archiveDigestEditId=0;renderResearch();});
        $('#research-form').addEventListener('submit',event=>{event.preventDefault();const values=formObject(event.currentTarget);state.researchKind=values.search_kind;if(state.researchKind!=='archive_digest')state.archiveDigestAdding=false;const query=values.search_kind==='dates'?values.date_q:(values.search_kind==='transcriptions'?values.transcription_q:(values.search_kind==='place_name'?values.place_name_q:(values.search_kind==='archive_digest'?values.archive_digest_q:values.text_q)));state.research={q:(query||'').trim(),category:values.category||'all'};state.placeNameSearch={q:(values.place_name_q||'').trim(),country:(values.place_name_country||'').trim(),division:(values.place_name_division||'').trim()};state.archiveDigestSearch={q:(values.archive_digest_q||'').trim(),city:(values.archive_digest_city||'').trim(),placeId:Number(values.archive_digest_place_id)||0,placeName:state.archiveDigestSearch.placeName||'',radiusKm:Number(values.archive_digest_radius_km)||0,dept:(values.archive_digest_dept||'').trim(),region:(values.archive_digest_region||'').trim(),recordType:values.archive_digest_record_type||'',status:values.archive_digest_status||''};state.transcriptionSearch={q:(values.transcription_q||'').trim(),scope:'all'};state.dateSearch={mode:values.date_mode,yearFrom:values.year_from,yearTo:values.year_to,values:(values.exact_dates||'').trim(),dateWindowMode:values.date_window_mode||'exact',dateWindowDays:values.date_window_days||'',eventTypeId:Number(values.event_type_id)||0,occupationId:values.occupation_id||'',sortDir:state.dateSearch.sortDir||'asc',placeId:Number(values.date_place_id)||0,placeName:state.dateSearch.placeName||''};state.proximitySearch={placeId:Number(values.proximity_place_id)||0,placeName:state.proximitySearch.placeName||'',dateMode:values.proximity_date_mode||'range',yearFrom:values.proximity_year_from,yearTo:values.proximity_year_to,exactDate:(values.proximity_exact_date||'').trim(),dateWindowMode:values.proximity_date_window_mode||'exact',dateWindowDays:values.proximity_date_window_days||'',radiusKm:Number(values.proximity_radius_km)||0};state.inseeSearch={nom:(values.insee_nom||'').trim(),prenom:(values.insee_prenom||'').trim(),sexe:values.insee_sexe||'',dateNaissance:(values.insee_date_naissance||'').trim(),dateDeces:(values.insee_date_deces||'').trim(),birthYearFrom:values.insee_birth_year_from||'',birthYearTo:values.insee_birth_year_to||'',deathYearFrom:values.insee_death_year_from||'',deathYearTo:values.insee_death_year_to||'',communeNaissance:(values.insee_commune_naissance||'').trim(),communeDeces:(values.insee_commune_deces||'').trim(),departement:(values.insee_departement||'').trim(),region:(values.insee_region||'').trim()};persistUiState();renderResearch();});
    }

    // --- Place-picker pour la recherche par dates ---
    function setupPlaceNameFacets(){
        const form=$('#research-form');
        const countryInput=form?.elements.place_name_country;
        const divisionInput=form?.elements.place_name_division;
        const countryList=$('#place-name-country-options');
        const divisionList=$('#place-name-division-options');
        if(!form||!countryInput||!divisionInput||!countryList||!divisionList)return;
        const optionHtml=(rows,withMeta=false)=>(rows||[]).map(row=>{
            const label=row.label||'';
            const meta=withMeta?[row.kind,row.country].filter(Boolean).join(' · '):`${Number(row.count||0).toLocaleString('fr-FR')} lieu(x)`;
            return `<option value="${escapeHtml(label)}" label="${escapeHtml(meta)}"></option>`;
        }).join('');
        const refreshCountries=debounce(async()=>{
            try{
                const data=await api('place_name_facets',{q:countryInput.value.trim()});
                countryList.innerHTML=optionHtml(data.countries||[]);
            }catch(_){}
        },180);
        const refreshDivisions=debounce(async()=>{
            try{
                const data=await api('place_name_facets',{country:countryInput.value.trim(),q:divisionInput.value.trim()});
                divisionList.innerHTML=optionHtml(data.divisions||[],true);
            }catch(_){}
        },180);
        countryInput.addEventListener('focus',refreshCountries);
        countryInput.addEventListener('input',()=>{refreshCountries();refreshDivisions();});
        divisionInput.addEventListener('focus',refreshDivisions);
        divisionInput.addEventListener('input',refreshDivisions);
    }

    function setupResearchPlacePicker(){
        const input=$('#research-place-input');
        const hidden=$('#research-form').elements.date_place_id;
        const suggestionsBox=$('#research-place-suggestions');
        if(!input||!hidden||!suggestionsBox)return;

        // Afficher la valeur persistée
        if(state.dateSearch.placeId&&state.dateSearch.placeName)input.value=state.dateSearch.placeName;

        const hide=()=>{suggestionsBox.hidden=true;suggestionsBox.innerHTML='';};

        const search=debounce(async()=>{
            const q=input.value.trim();
            if(q.length<2){hide();return;}
            try{
                const data=await api('place_suggestions',{q,country:''});
                suggestionsBox.innerHTML=(data.places||[]).map(place=>
                    `<button type="button" data-place-id="${place.id}" data-place-label="${escapeHtml(place.label||place.name)}" data-place-name="${escapeHtml(place.name)}"><strong>${escapeHtml(place.name)}</strong>${place.subdivision?`<span>${escapeHtml(place.subdivision)}</span>`:''}<small>${escapeHtml([place.county,place.state,place.country].filter(Boolean).join(', '))}</small></button>`
                ).join('');
                suggestionsBox.hidden=!suggestionsBox.innerHTML;
            }catch(_){hide();}
        },220);

        input.addEventListener('input',()=>{
            // Si on retape, on réinitialise la sélection
            hidden.value='0';
            state.dateSearch.placeId=0;
            state.dateSearch.placeName='';
            const chip=$('.research-place-chip');
            if(chip)chip.remove();
            search();
        });
        input.addEventListener('focus',()=>{if(suggestionsBox.innerHTML)suggestionsBox.hidden=false;});

        suggestionsBox.addEventListener('click',event=>{
            const button=event.target.closest('button[data-place-id]');
            if(!button)return;
            const placeId=Number(button.dataset.placeId);
            const placeName=button.dataset.placeName||button.dataset.placeLabel||'';
            hidden.value=String(placeId);
            input.value=placeName;
            state.dateSearch.placeId=placeId;
            state.dateSearch.placeName=placeName;
            persistUiState();
            hide();
            // Afficher le chip
            let chip=$('.research-place-chip');
            if(!chip){
                chip=document.createElement('div');
                chip.className='research-place-chip';
                input.closest('.research-place-input-wrap').insertAdjacentElement('afterend',chip);
            }
            chip.innerHTML=`<span title="${escapeHtml(button.dataset.placeLabel||placeName)}">${escapeHtml(placeName)}</span><button type="button" class="research-place-chip-remove" id="research-place-remove" aria-label="Supprimer la ville">×</button>`;
            bindResearchPlaceRemove();
        });

        onOutsideClick('research-place',event=>{
            if(!$('#research-place-picker')?.contains(event.target))hide();
        });

        bindResearchPlaceRemove();
    }

    function bindResearchPlaceRemove(){
        const btn=$('#research-place-remove');
        if(!btn||btn._placeBound)return;
        btn._placeBound=true;
        btn.addEventListener('click',()=>{
            state.dateSearch.placeId=0;
            state.dateSearch.placeName='';
            persistUiState();
            const hidden=$('#research-form')?.elements.date_place_id;
            if(hidden)hidden.value='0';
            const input=$('#research-place-input');
            if(input)input.value='';
            const chip=$('.research-place-chip');
            if(chip)chip.remove();
        });
    }
    // --- Place-picker pour la recherche par proximité géographique et temporelle ---
    function setupProximityPlacePicker(){
        const input=$('#proximity-place-input');
        const hidden=$('#research-form').elements.proximity_place_id;
        const suggestionsBox=$('#proximity-place-suggestions');
        if(!input||!hidden||!suggestionsBox)return;

        if(state.proximitySearch.placeId&&state.proximitySearch.placeName)input.value=state.proximitySearch.placeName;

        const hide=()=>{suggestionsBox.hidden=true;suggestionsBox.innerHTML='';};

        const search=debounce(async()=>{
            const q=input.value.trim();
            if(q.length<2){hide();return;}
            try{
                const data=await api('place_suggestions',{q,country:''});
                suggestionsBox.innerHTML=(data.places||[]).map(place=>
                    `<button type="button" data-place-id="${place.id}" data-place-label="${escapeHtml(place.label||place.name)}" data-place-name="${escapeHtml(place.name)}"><strong>${escapeHtml(place.name)}</strong>${place.subdivision?`<span>${escapeHtml(place.subdivision)}</span>`:''}<small>${escapeHtml([place.county,place.state,place.country].filter(Boolean).join(', '))}</small></button>`
                ).join('');
                suggestionsBox.hidden=!suggestionsBox.innerHTML;
            }catch(_){hide();}
        },220);

        input.addEventListener('input',()=>{
            hidden.value='0';
            state.proximitySearch.placeId=0;
            state.proximitySearch.placeName='';
            const chip=$('#proximity-place-picker .research-place-chip');
            if(chip)chip.remove();
            search();
        });
        input.addEventListener('focus',()=>{if(suggestionsBox.innerHTML)suggestionsBox.hidden=false;});

        suggestionsBox.addEventListener('click',event=>{
            const button=event.target.closest('button[data-place-id]');
            if(!button)return;
            const placeId=Number(button.dataset.placeId);
            const placeName=button.dataset.placeName||button.dataset.placeLabel||'';
            hidden.value=String(placeId);
            input.value=placeName;
            state.proximitySearch.placeId=placeId;
            state.proximitySearch.placeName=placeName;
            persistUiState();
            hide();
            let chip=$('#proximity-place-picker .research-place-chip');
            if(!chip){
                chip=document.createElement('div');
                chip.className='research-place-chip';
                input.closest('.research-place-input-wrap').insertAdjacentElement('afterend',chip);
            }
            chip.innerHTML=`<span title="${escapeHtml(button.dataset.placeLabel||placeName)}">${escapeHtml(placeName)}</span><button type="button" class="research-place-chip-remove" id="proximity-place-remove" aria-label="Supprimer la commune">×</button>`;
            bindProximityPlaceRemove();
        });

        onOutsideClick('proximity-place',event=>{
            if(!$('#proximity-place-picker')?.contains(event.target))hide();
        });

        bindProximityPlaceRemove();
    }

    function bindProximityPlaceRemove(){
        const btn=$('#proximity-place-remove');
        if(!btn||btn._placeBound)return;
        btn._placeBound=true;
        btn.addEventListener('click',()=>{
            state.proximitySearch.placeId=0;
            state.proximitySearch.placeName='';
            persistUiState();
            const hidden=$('#research-form')?.elements.proximity_place_id;
            if(hidden)hidden.value='0';
            const input=$('#proximity-place-input');
            if(input)input.value='';
            const chip=$('#proximity-place-picker .research-place-chip');
            if(chip)chip.remove();
        });
    }

    // Commune de référence du dépouillement : la sélection explicite donne
    // accès au rayon géographique, tandis qu'une saisie libre conserve la
    // recherche textuelle habituelle sur les anciens noms de commune.
    function setupArchiveDigestPlacePicker(){
        const form=$('#research-form');
        const input=$('#archive-digest-place-input');
        const hidden=form?.elements.archive_digest_place_id;
        const suggestionsBox=$('#archive-digest-place-suggestions');
        if(!input||!hidden||!suggestionsBox)return;
        const ads=state.archiveDigestSearch||{};
        if(ads.placeId&&ads.placeName)input.value=ads.placeName;
        const hide=()=>{suggestionsBox.hidden=true;suggestionsBox.innerHTML='';};
        const search=debounce(async()=>{
            const q=input.value.trim();
            if(q.length<2){hide();return;}
            try{
                const data=await api('place_suggestions',{q,country:''});
                suggestionsBox.innerHTML=(data.places||[]).map(place=>`<button type="button" data-place-id="${place.id}" data-place-label="${escapeHtml(place.label||place.name)}" data-place-name="${escapeHtml(place.name)}"><strong>${escapeHtml(place.name)}</strong>${place.subdivision?`<span>${escapeHtml(place.subdivision)}</span>`:''}<small>${escapeHtml([place.county,place.state,place.country].filter(Boolean).join(', '))}</small></button>`).join('');
                suggestionsBox.hidden=!suggestionsBox.innerHTML;
            }catch(_){hide();}
        },220);
        input.addEventListener('input',()=>{
            hidden.value='0';
            state.archiveDigestSearch.placeId=0;
            state.archiveDigestSearch.placeName='';
            search();
        });
        input.addEventListener('focus',()=>{if(suggestionsBox.innerHTML)suggestionsBox.hidden=false;});
        suggestionsBox.addEventListener('click',event=>{
            const button=event.target.closest('button[data-place-id]');
            if(!button)return;
            const placeId=Number(button.dataset.placeId);
            const placeName=button.dataset.placeName||button.dataset.placeLabel||'';
            hidden.value=String(placeId);
            input.value=placeName;
            state.archiveDigestSearch.placeId=placeId;
            state.archiveDigestSearch.placeName=placeName;
            persistUiState();
            hide();
        });
        onOutsideClick('archive-digest-place',event=>{
            if(!$('#archive-digest-place-picker')?.contains(event.target))hide();
        });
    }
    // --- fin place-picker proximité ---

    // --- fin place-picker ---

    /**
     * Recherche → « Chercher sur internet » : formulaire libre (prénom, nom, lieu, années, conjoint), ou rempli depuis une fiche.
     * Mêmes sites et même ordre que dans Apparence ; mêmes options contre les homonymes que le bloc de la fiche.
     */
    function renderWebSearchTool(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const f=state.webSearchForm||(state.webSearchForm={first:'',middle:'',last:'',place:'',placeKind:'birth',y1:'',y2:'',spouseFirst:'',spouseLast:'',useMiddle:false,married:false});
        const settings=webSearchSettings();const sites=webSearchAllSites();
        const visible=settings.order.filter(key=>!settings.hidden.includes(key)).map(key=>sites.find(site=>site[0]===key)).filter(Boolean);
        const groups=webSearchGroups.map(group=>[group,visible.filter(site=>site[2]===group)]).filter(([,list])=>list.length);
        const v=key=>escapeHtml(f[key]??'');
        $('#workspace').innerHTML=`<section class="page web-search-tool"><header class="page-header"><div><span class="eyebrow">RECHERCHE</span><h2>Chercher sur internet</h2><p>Pour une personne qui n’est pas encore dans la base, ou pour partir d’une fiche et changer un détail. Les sites s’ouvrent dans ton navigateur ; leur choix et leur ordre se règlent dans Maintenance → Apparence.</p></div></header>
            <section class="maintenance-panel"><div class="web-search-tool-from"><label>Partir d’une fiche<input type="search" id="wst-person" placeholder="Tape un nom…" autocomplete="off"></label><div class="autocomplete-list" id="wst-person-list" hidden></div><button class="button small secondary" type="button" id="wst-clear">Vider</button></div>
            <form id="wst-form" class="form-grid web-search-tool-form" style="padding:0">
                <label>Prénom<input name="first" value="${v('first')}" placeholder="Jean"></label>
                <label>Autres prénoms<input name="middle" value="${v('middle')}" placeholder="Pierre Marie"></label>
                <label>Nom<input name="last" value="${v('last')}" placeholder="Dupont"></label>
                <label>Lieu<input name="place" value="${v('place')}" placeholder="Arras"></label>
                <label>Ce lieu est celui<select name="placeKind"><option value="birth" ${f.placeKind==='birth'?'selected':''}>de la naissance</option><option value="death" ${f.placeKind==='death'?'selected':''}>du décès</option><option value="other" ${f.placeKind==='other'?'selected':''}>du mariage ou d’un autre événement</option></select></label>
                <label>Année de naissance<input name="y1" type="number" min="1000" max="2100" value="${v('y1')}" placeholder="1775"></label>
                <label>Année de décès<input name="y2" type="number" min="1000" max="2100" value="${v('y2')}" placeholder="1840"></label>
                <label>Prénom du conjoint<input name="spouseFirst" value="${v('spouseFirst')}"></label>
                <label>Nom du conjoint<input name="spouseLast" value="${v('spouseLast')}"></label>
                <div class="checkbox-group"><label class="checkbox-line"><input type="checkbox" name="useMiddle" ${f.useMiddle?'checked':''}> Deuxièmes prénoms</label><label class="checkbox-line"><input type="checkbox" name="married" ${f.married?'checked':''}> Aussi sous le nom d’épouse</label></div>
            </form></section>
            <section class="maintenance-panel"><div class="web-search-panel" id="wst-sites"><p class="muted" id="wst-query"></p>${visible.length>1?`<div class="web-search-multi"><button class="button small secondary" type="button" data-ws-pick-all>Tout cocher</button><button class="button small secondary" type="button" data-ws-pick-none>Tout décocher</button><button class="button small" type="button" data-ws-open-picked disabled>Ouvrir les sites cochés</button></div>`:''}${groups.map(([group,list])=>`<div class="web-search-group"><span>${escapeHtml(group)}</span><div class="web-search-links">${list.map(site=>`<span class="web-search-site"><input type="checkbox" data-ws-pick="${escapeHtml(site[0])}" aria-label="Cocher ${escapeHtml(site[1])}"><a class="button small secondary" data-ws-site="${escapeHtml(site[0])}" href="#" target="_blank" rel="noopener noreferrer">${escapeHtml(site[1])}</a></span>`).join('')}</div></div>`).join('')||empty('Aucun site choisi : règle-les dans Maintenance → Apparence.')}</div></section></section>`;
        const form=$('#wst-form'),panel=$('#wst-sites');
        const update=()=>{
            const x=formObject(form);x.useMiddle=form.elements.useMiddle.checked;x.married=form.elements.married.checked;Object.assign(f,x);
            const first=[x.first,x.middle].filter(Boolean).join(' ').trim();
            const ctx={first,firstOnly:String(x.first||'').trim().split(/\s+/)[0]||first,last:String(x.last||'').trim(),birthYear:Number(x.y1)||0,deathYear:Number(x.y2)||0,places:x.place?[{value:x.place.trim(),kind:x.placeKind}]:[],
                partners:(x.spouseFirst||x.spouseLast)?[{first:String(x.spouseFirst||'').trim(),firstOnly:String(x.spouseFirst||'').trim().split(/\s+/)[0]||'',last:String(x.spouseLast||'').trim()}]:[]};
            const life=webSearchLifeRange(ctx);
            const p=webSearchParams(ctx,{middle:x.useMiddle,years:Boolean(x.y1||x.y2),y1:life.from,y2:life.to,place:x.place?x.place.trim():'',spouse:ctx.partners.length?'0':'',married:x.married});
            const ok=Boolean(ctx.first||ctx.last);
            $('#wst-query').textContent=ok?`Recherche : ${p.q}`:'Tape au moins un prénom ou un nom.';
            $$('[data-ws-site]',panel).forEach(link=>{const site=sites.find(item=>item[0]===link.dataset.wsSite);link.classList.toggle('is-disabled',!ok);if(site&&ok){try{link.href=site[3](p);}catch(_){link.removeAttribute('href');}}else link.setAttribute('href','#');});
        };
        form.addEventListener('input',update);form.addEventListener('change',update);update();
        const updatePicked=()=>{const count=$$('[data-ws-pick]:checked',panel).length;const open=$('[data-ws-open-picked]',panel);if(open){open.disabled=!count;open.textContent=count?`Ouvrir les ${count} site${count>1?'s':''} cochés`:'Ouvrir les sites cochés';}};
        panel.addEventListener('change',updatePicked);
        $('[data-ws-pick-all]',panel)?.addEventListener('click',()=>{$$('[data-ws-pick]',panel).forEach(input=>{input.checked=true;});updatePicked();});
        $('[data-ws-pick-none]',panel)?.addEventListener('click',()=>{$$('[data-ws-pick]',panel).forEach(input=>{input.checked=false;});updatePicked();});
        $('[data-ws-open-picked]',panel)?.addEventListener('click',()=>{$$('[data-ws-pick]:checked',panel).forEach(input=>{const link=$(`[data-ws-site="${CSS.escape(input.dataset.wsPick)}"]`,panel);if(link?.href&&!link.href.endsWith('#'))window.open(link.href,'_blank','noopener');});});
        panel.addEventListener('click',event=>{const link=event.target.closest('[data-ws-site]');if(link&&link.getAttribute('href')==='#'){event.preventDefault();toast('Tape au moins un prénom ou un nom.');}});
        $('#wst-clear').addEventListener('click',()=>{state.webSearchForm=null;renderWebSearchTool();});
        // Remplir depuis une fiche de la base
        const input=$('#wst-person'),list=$('#wst-person-list');let timer=0;
        input.addEventListener('input',()=>{clearTimeout(timer);const q=input.value.trim();if(q.length<2){list.hidden=true;return;}timer=setTimeout(async()=>{let data={data:[]};try{data=await api('search',{type:'persons',q,limit:8});}catch(_){}list.innerHTML=(data.data||[]).map(person=>`<button type="button" data-wst-person="${person.id}">${escapeHtml(personName(person))} <small>${escapeHtml(years(person))}</small></button>`).join('')||'<small class="muted">Aucune fiche</small>';list.hidden=false;},200);});
        list.addEventListener('click',async event=>{const button=event.target.closest('[data-wst-person]');if(!button)return;list.hidden=true;
            let detail;try{detail=await api('person',{id:button.dataset.wstPerson});}catch(error){toast(error.message,'error');return;}
            const person=detail.person||{};const ctx=webSearchContext(detail);const spouse=(detail.partners||[])[0];
            const placeOf=kind=>ctx.places.find(place=>place.kind===kind);const place=placeOf('birth')||placeOf('death')||ctx.places[0];
            state.webSearchForm={first:String(person.first_name||'').trim(),middle:String(person.middle_name||'').trim(),last:String(person.last_name||'').trim(),place:place?.value||'',placeKind:place?.kind||'birth',
                y1:ctx.birthYear||ctx.birthEst?.from||'',y2:ctx.deathYear||ctx.deathEst?.to||'',spouseFirst:spouse?String(spouse.first_name||'').trim():'',spouseLast:spouse?String(spouse.last_name||'').trim():'',useMiddle:f.useMiddle,married:false};
            renderWebSearchTool();});
    }
    async function renderResearch(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        if(state.researchKind==='dates')return renderDateSearch(token);
        if(state.researchKind==='proximity')return renderProximitySearch(token);
        if(state.researchKind==='transcriptions')return renderTranscriptionSearch(token);
        if(state.researchKind==='place_name')return renderPlaceNameSearch(token);
        if(state.researchKind==='archive_digest')return renderArchiveDigestSearch(token);
        if(state.researchKind==='insee')return renderInseeSearch(token);
        if(state.researchKind==='web')return renderWebSearchTool(token);
        if(state.researchKind==='saved'&&window.LCNDA_EXT?.research)return window.LCNDA_EXT.research(token);
        if(state.researchKind==='question'&&window.LCNDA_EXT?.question)return window.LCNDA_EXT.question(token);
        const q=state.research.q.trim();
        if(!q){$('#workspace').innerHTML=`<section class="empty-state"><span class="eyebrow">RECHERCHE GÉNÉALOGIQUE</span><h2>Chercher dans toute la base</h2><p>Utilise un nom, une ville, un pays ou une année.</p></section>`;return;}
        $('#workspace').innerHTML='<section class="loading-screen"><div class="loading-mark">⌕</div><p>Recherche dans les personnes et les événements…</p></section>';
        const data=await api('research',{q,category:state.research.category});
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const categoryLabel={all:'toute la base',name:'les noms et personnes',place:'les lieux',year:'les années',occupation:'les métiers',employer:'les employeurs'}[state.research.category];
        const results=state.researchDisplay==='list'?researchTableHtml(data.people):`<div class="date-results">${data.people.length?data.people.map(researchPersonCard).join(''):empty('Aucune personne ne correspond à cette recherche.')}</div>`;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">RECHERCHE · ${escapeHtml(categoryLabel)}</span><h2>« ${escapeHtml(q)} »</h2><p>${data.people.length.toLocaleString('fr-FR')} personne${data.people.length>1?'s':''} trouvée${data.people.length>1?'s':''}. Chaque résultat indique pourquoi il correspond.</p></div></header>${results}</section>`;bindTableLinks();
    }

    function researchPersonCard(person){const matches=(person.matches||[]).map(match=>`<span class="research-match ${match.kind}"><strong>${escapeHtml(match.label)}</strong>${match.date?`<small>${escapeHtml(match.date)}</small>`:''}${match.place?`<small>${escapeHtml(match.place)}</small>`:''}</span>`).join('');return `<article class="date-result research-person-card"><div class="person-card-initial">${escapeHtml((person.first_name?.[0]||'')+(person.last_name?.[0]||''))}</div><div><button class="table-link person-card-name" data-open-person="${person.id}">${escapeHtml(personName(person))}</button><p>${escapeHtml(relationYears(person))}</p><div class="research-matches">${matches}</div></div></article>`;}

    function researchTableHtml(people){
        if(!people.length)return empty('Aucune personne ne correspond à cette recherche.');
        return `<div class="data-table-wrap"><table class="data-table research-table sortable-table"><thead><tr><th><button data-sort-column="0">Personne</button></th><th><button data-sort-column="1">Élément correspondant</button></th><th><button data-sort-column="2">Naissance</button></th><th><button data-sort-column="3">Décès</button></th></tr></thead><tbody>${people.map(person=>`<tr><td data-sort-value="${escapeHtml(personName(person).toLowerCase())}"><button class="table-link" data-open-person="${person.id}">${escapeHtml(personName(person))}</button>${person.surname_group?`<small class="cell-muted">Famille ${escapeHtml(person.surname_group)}</small>`:''}</td><td data-sort-value="${escapeHtml((person.matches?.[0]?.label||'').toLowerCase())}"><div class="research-matches">${(person.matches||[]).map(match=>`<span class="research-match ${match.kind}"><strong>${escapeHtml(match.label)}</strong>${match.date?`<small>${escapeHtml(match.date)}</small>`:''}${match.place?`<small>${escapeHtml(match.place)}</small>`:''}</span>`).join('')||'<span class="cell-muted">Correspondance générale</span>'}</div></td><td data-sort-value="${person.birth_year||9999}">${escapeHtml(person.birth_date||person.birth_year||'—')}</td><td data-sort-value="${person.death_year||9999}">${escapeHtml(person.death_date||person.death_year||(person.living_status==='living'?'Vivante':'—'))}</td></tr>`).join('')}</tbody></table></div>`;
    }

    function archiveDigestTypeOptions(selected=''){
        const labels={table_decennale:'Table décennale',mariage:'Mariage',naissance:'Naissance',deces:'Décès',bapteme:'Baptême',succession:'Succession',recensement:'Recensement',prison:'Prison',fiche_militaire:'Fiche militaire',liste_prisonnier:'Liste prisonnier',autre:'Autre'};
        return Object.entries(labels).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
    }
    function archiveDigestStatusOptions(selected='todo'){
        const labels={todo:'À faire',done:'Terminé',review:'À revoir',doubt:'Doute',priority:'À faire en priorité',later:'À faire plus tard'};
        return Object.entries(labels).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
    }
    const ARCHIVE_DIGEST_PAGE_STATUSES={checked:'Dépouillée',empty:'Sans information',review:'À revoir',todo:'Pas terminé · à faire',found:'Pas terminé · informations trouvées',incomplete:'Page incomplète'};
    function archiveDigestPageStatusOptions(selected='checked'){
        return Object.entries(ARCHIVE_DIGEST_PAGE_STATUSES).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
    }
    const ARCHIVE_DIGEST_TEMPLATES={
        standard:{label:'Registre général',help:'Cote, période, pages et notes libres.'},
        civil:{label:'État civil',help:'Actes numérotés, période, vues et personnes relevées.'},
        census:{label:'Recensement',help:'Adresse, numéro de foyer, personnes et professions.'},
        military:{label:'Militaire / prison',help:'Cote, matricule ou dossier, périodes et annotations.'},
        notarial:{label:'Notarial / succession',help:'Cote, actes, parties citées et contenu relevé.'},
        table:{label:'Table décennale / index',help:'Période, type d’acte et références à vérifier.'}
    };
    function archiveDigestTemplateOptions(selected='standard'){
        return Object.entries(ARCHIVE_DIGEST_TEMPLATES).map(([value,template])=>`<option value="${value}" ${value===selected?'selected':''}>${template.label}</option>`).join('');
    }
    function archiveDigestLabel(map,value){return (map&&map[value])||value||'—';}
    function archiveDigestFormHtml(row={}){
        return `<form id="archive-digest-form" class="archive-digest-form card-form"><input type="hidden" name="id" value="${escapeHtml(String(row.id||0))}"><div class="form-grid"><label>Modèle de dépouillement<select name="template_key" data-archive-digest-template>${archiveDigestTemplateOptions(row.template_key||'standard')}</select><small data-archive-digest-template-help>${escapeHtml(ARCHIVE_DIGEST_TEMPLATES[row.template_key||'standard']?.help||ARCHIVE_DIGEST_TEMPLATES.standard.help)}</small></label><label>Type d’acte<select name="record_type">${archiveDigestTypeOptions(row.record_type||'autre')}</select></label><label>Ville / commune<div class="research-place-input-wrap"><input name="city_name" value="${escapeHtml(row.city_name||row.place_name||'')}" placeholder="Tape pour choisir une commune ou saisis un ancien nom" autocomplete="off"><input type="hidden" name="place_id" value="${escapeHtml(String(row.place_id||0))}"><div class="place-suggestions" data-archive-digest-place-suggestions hidden></div></div></label><label>Commune liée / rattachée<input name="city_alias" value="${escapeHtml(row.city_alias||'')}" placeholder="Ancienne commune, hameau…"></label><label>Département<input name="department" value="${escapeHtml(row.department||row.county||'')}" placeholder="18, Cher…"></label><label>Région<input name="region" value="${escapeHtml(row.region||row.state||'')}" placeholder="Région"></label><label>Archives / service<input name="archive_service" value="${escapeHtml(row.archive_service||'')}" placeholder="AD 18, commune…"></label><label>Cote / registre<input name="archive_reference" value="${escapeHtml(row.archive_reference||'')}" placeholder="3 E 123, vue 42…"></label><label class="span-2">Lien direct vers l’archive<input name="archive_url" type="url" value="${escapeHtml(row.archive_url||'')}" placeholder="https://archives…"></label><label>Période / année<input name="year_text" value="${escapeHtml(row.year_text||'')}" placeholder="1801, 1793-1802…"></label><label>État<select name="status">${archiveDigestStatusOptions(row.status||'todo')}</select></label></div><div class="archive-digest-textareas"><label>Ce que je cherche<textarea name="searched" rows="3" placeholder="Nom, famille, acte, hypothèse…">${escapeHtml(row.searched||'')}</textarea></label><label>Ce que j’ai trouvé<textarea name="found" rows="3" placeholder="Homonyme, cousin possible, rien trouvé…">${escapeHtml(row.found||'')}</textarea></label><label>Annotation<textarea name="notes" rows="3" placeholder="À revoir, lacune, table incomplète, piste annexe…">${escapeHtml(row.notes||'')}</textarea></label></div><div class="modal-actions"><span class="spacer"></span>${row.id?'<button class="button secondary" type="button" data-archive-digest-cancel>Annuler</button>':''}<button class="button" type="submit">${row.id?'Enregistrer':'Ajouter le dépouillement'}</button></div></form>`;
    }
    function enhanceArchiveDigestForm(form,row={}){
        if(!form||form.querySelector('[data-archive-digest-details]'))return;
        const details=`<section class="archive-digest-details" data-archive-digest-details><span class="section-label">SUIVI GÉNÉRAL DU REGISTRE</span><div class="form-grid"><label>Nombre total de pages / vues<input name="page_total" type="number" min="0" value="${escapeHtml(String(row.page_total||''))}" placeholder="Ex : 286"></label><label class="span-2">Adresse / lieu-dit<input name="address" value="${escapeHtml(row.address||'')}" placeholder="Rue, avenue, hameau, lieu-dit…"></label><label>N° de foyer<input name="household_number" value="${escapeHtml(row.household_number||'')}" placeholder="Pour un recensement"></label></div><div class="archive-digest-complete"><label class="compact-checkbox"><input type="checkbox" name="is_exhaustive" value="1" ${Number(row.is_exhaustive)?'checked':''}> Registre, année ou période entièrement dépouillé(e) et noté(e)</label><label>Résumé du dépouillement complet<textarea name="exhaustive_note" rows="2" placeholder="Ex : toutes les naissances de 1880 relevées, y compris les pages sans acte…">${escapeHtml(row.exhaustive_note||'')}</textarea></label></div></section>`;
        form.querySelector('.archive-digest-textareas')?.insertAdjacentHTML('beforebegin',details);
        const select=form.elements.template_key,help=$('[data-archive-digest-template-help]',form);
        select?.addEventListener('change',()=>{if(help)help.textContent=ARCHIVE_DIGEST_TEMPLATES[select.value]?.help||ARCHIVE_DIGEST_TEMPLATES.standard.help;});
    }
    function setupArchiveDigestPages(form,row={}){
        const box=$('[data-archive-digest-pages]',form),list=$('[data-archive-digest-pages-list]',form),hidden=form?.elements.pages_json;
        if(!box||!list||!hidden)return;
        let pages=Array.isArray(row.pages)?row.pages.map(page=>({number:page.number||'',status:page.status||'checked',content_type:page.content_type||'acts',act_from:page.act_from||'',act_to:page.act_to||'',note:page.note||''})):[];
        if(!pages.length&&row.page_number)pages=[{number:row.page_number,status:'checked',note:''}];
        const render=()=>{
            list.innerHTML=pages.length?pages.map((page,index)=>`<div class="archive-digest-page-row" data-archive-page-index="${index}"><label>Page / vue<input data-page-number value="${escapeHtml(page.number)}" placeholder="Ex : 42"></label><label>État<select data-page-status>${archiveDigestPageStatusOptions(page.status)}</select></label><label>Note / contenu<input data-page-note value="${escapeHtml(page.note)}" placeholder="Couverture, acte n°18, lacune…"></label><button class="icon-button danger" type="button" data-archive-digest-page-remove="${index}" title="Retirer cette page">×</button></div>`).join(''):'<p class="archive-digest-pages-empty">Aucune page détaillée. Ajoute une page si tu veux suivre le registre vue par vue.</p>';
            hidden.value=JSON.stringify(pages);
            $$('[data-archive-page-index]',list).forEach(item=>item.addEventListener('input',()=>{const page=pages[Number(item.dataset.archivePageIndex)];page.number=$('[data-page-number]',item).value;page.status=$('[data-page-status]',item).value;page.note=$('[data-page-note]',item).value;hidden.value=JSON.stringify(pages);}));
            $$('[data-archive-page-status]',list).forEach(select=>select.addEventListener('change',()=>select.closest('[data-archive-page-index]')?.dispatchEvent(new Event('input'))));
            $$('[data-archive-digest-page-remove]',list).forEach(button=>button.addEventListener('click',()=>{pages.splice(Number(button.dataset.archiveDigestPageRemove),1);render();}));
        };
        $('[data-archive-digest-page-add]',box).addEventListener('click',()=>{pages.push({number:'',status:'checked',note:''});render();list.lastElementChild?.scrollIntoView({block:'nearest',behavior:'smooth'});});
        render();
    }
    function archiveDigestPageMediaHtml(row,pageNumber){
        const media=(row.media||[]).filter(item=>String(item.archive_page_number||'').trim()===String(pageNumber||'').trim());
        if(!media.length)return '';
        return `<section class="archive-digest-page-media"><strong>Médias de cette page</strong>${media.map(item=>`<article class="archive-digest-page-media-item"><button type="button" class="archive-digest-page-media-preview" data-open-archive-digest-page-media="${item.id}" data-archive-digest-id="${row.id}" title="Voir le média">${normalizedMediaType(item)==='image'&&item.thumbnail?`<img src="media/${encodeURIComponent(item.thumbnail)}" alt="">`:`<span>${mediaTypeShortLabelWithIcon(item)}</span>`}</button><div><b>${escapeHtml(item.title||item.filename||'Média sans titre')}</b><small>${escapeHtml(mediaTypeShortLabel(item))}</small><span><button class="button small secondary" type="button" data-open-archive-digest-page-media="${item.id}" data-archive-digest-id="${row.id}">Voir</button><button class="button small secondary" type="button" data-edit-archive-digest-page-media="${item.id}" data-archive-digest-id="${row.id}">Modifier</button></span></div></article>`).join('')}</section>`;
    }
    function archiveDigestPeopleHtml(row){
        const people=row.people||[];
        const pageMedia=(row.media||[]).filter(item=>String(item.archive_page_number||'').trim()!=='');
        if(!people.length&&!pageMedia.length)return '';
        const item=person=>`<div class="archive-digest-person"><span>${person.person_id?`<button class="table-link" type="button" data-open-person="${person.person_id}">${escapeHtml(person.person_name)}</button>`:`<b>${escapeHtml(person.person_name)}</b>`}${[person.page_number&&`Page ${person.page_number}`,person.address,person.household_key&&`Foyer ${person.household_key}`,person.age_text,person.household_position,person.occupation].filter(Boolean).length?`<small>${escapeHtml([person.page_number&&`Page ${person.page_number}`,person.address,person.household_key&&`Foyer ${person.household_key}`,person.age_text,person.household_position,person.occupation].filter(Boolean).join(' · '))}</small>`:''}</span><span><button class="icon-button" type="button" title="Modifier" data-archive-digest-person-edit="${person.id}" data-archive-digest-id="${row.id}">✎</button><button class="icon-button danger" type="button" title="Retirer" data-archive-digest-person-delete="${person.id}">×</button></span></div>`;
        if(!state.archiveDigestGroupByPage){
            const pageNumbers=[...new Set(pageMedia.map(media=>String(media.archive_page_number||'').trim()).filter(Boolean))];
            return `<div class="archive-digest-people"><strong>Personnes relevées</strong>${people.map(item).join('')}${pageNumbers.map(number=>archiveDigestPageMediaHtml(row,number)).join('')}</div>`;
        }
        const groups=new Map();
        people.forEach(person=>{const key=person.page_number?`Page ${person.page_number}`:'Sans page précisée';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(person);});
        const pagesByNumber=new Map((row.pages||[]).map(page=>[String(page.number||'').trim(),page]));
        (row.pages||[]).forEach(page=>{const pageNumber=String(page.number||'').trim();if(pageNumber&&!groups.has(`Page ${pageNumber}`))groups.set(`Page ${pageNumber}`,[]);});
        pageMedia.forEach(media=>{const pageNumber=String(media.archive_page_number||'').trim();if(pageNumber&&!groups.has(`Page ${pageNumber}`))groups.set(`Page ${pageNumber}`,[]);});
        const pageSortValue=label=>{
            const match=String(label||'').match(/\d+/);
            return match?Number(match[0]):Number.MAX_SAFE_INTEGER;
        };
        const pageEntries=Array.from(groups.entries()).sort(([a],[b])=>{
            const aOrder=pageSortValue(a);
            const bOrder=pageSortValue(b);
            if(aOrder!==bOrder)return aOrder-bOrder;
            return a.localeCompare(b,'fr',{numeric:true});
        });
        const seenHouseholds=new Set();
        return `<section class="archive-digest-people archive-digest-people-grouped"><header><strong>Personnes relevées par page</strong><small>Vue, adresse et foyer</small></header>${pageEntries.map(([label,items])=>{const pageNumber=String(label).replace(/^Page\s+/i,'');const page=pagesByNumber.get(pageNumber);const pageState=page?ARCHIVE_DIGEST_PAGE_STATUSES[page.status]||ARCHIVE_DIGEST_PAGE_STATUSES.checked:'';const addresses=new Map();items.forEach(person=>{const address=String(person.address||'').trim();const addressKey=address||'__unspecified_address__';if(!addresses.has(addressKey))addresses.set(addressKey,{address,households:new Map()});const addressGroup=addresses.get(addressKey);const householdKey=String(person.household_key||'').trim();const householdId=householdKey||'__unspecified_household__';if(!addressGroup.households.has(householdId))addressGroup.households.set(householdId,{householdKey,members:[]});addressGroup.households.get(householdId).members.push(person);});return `<section class="archive-digest-page-group"><header><h4>${escapeHtml(label)}${pageState?` <span class="archive-digest-page-state">${escapeHtml(pageState)}</span>`:''}</h4><small>${items.length} personne${items.length>1?'s':''}</small></header>${addresses.size?`<div class="archive-digest-page-households">${Array.from(addresses.entries()).map(([addressKey,addressGroup])=>`<section class="archive-digest-address"><header><h5>${escapeHtml(addressGroup.address||'Adresse non précisée')}</h5><small>${addressGroup.households.size} foyer${addressGroup.households.size>1?'s':''}</small></header><div class="archive-digest-address-households">${Array.from(addressGroup.households.entries()).map(([householdId,household])=>{const continuityKey=`${addressKey}|${householdId}`;const continued=seenHouseholds.has(continuityKey);seenHouseholds.add(continuityKey);return `<section class="archive-digest-household"><header><h6>${escapeHtml(household.householdKey?`Foyer ${household.householdKey}`:'Foyer non précisé')}${continued?' · suite':''}</h6><small>${household.members.length} personne${household.members.length>1?'s':''}</small></header>${household.members.map(item).join('')}</section>`;}).join('')}</div></section>`).join('')}</div>`:''}${archiveDigestPageMediaHtml(row,pageNumber)}</section>`;}).join('')}</section>`;
    }
    function archiveDigestPagesHtml(row){
        const pages=Array.isArray(row.pages)?row.pages:[];
        if(!pages.length)return '';
        const labels=ARCHIVE_DIGEST_PAGE_STATUSES;
        const types={acts:'Actes / informations',empty:'Page sans information',cover:'Couverture / index',review:'À revoir',other:'Autre'};
        return `<div class="archive-digest-pages-summary"><strong>Pages / vues relevées</strong>${pages.map((page,index)=>{const acts=[page.act_from&&`acte n°${page.act_from}`,page.act_to&&`à ${page.act_to}`].filter(Boolean).join(' ');const peopleCount=(row.people||[]).filter(person=>String(person.page_number||'')===String(page.number||'')).length;return `<div><span><b>Page ${escapeHtml(page.number||'—')}</b><small>${escapeHtml([types[page.content_type]||types.acts,labels[page.status]||labels.checked,acts,peopleCount?`${peopleCount} personne${peopleCount>1?'s':''}`:''].filter(Boolean).join(' · '))}${page.note?`<em>${escapeHtml(page.note)}</em>`:''}</small></span><span><button class="button small secondary" type="button" data-archive-digest-page-person="${index}" data-archive-digest-id="${row.id}">+ Personne</button><button class="button small secondary" type="button" data-archive-digest-page-media="${index}" data-archive-digest-id="${row.id}">+ Média</button><button class="icon-button" type="button" title="Modifier" data-archive-digest-page-edit="${index}" data-archive-digest-id="${row.id}">✎</button><button class="icon-button danger" type="button" title="Retirer" data-archive-digest-page-delete="${index}" data-archive-digest-id="${row.id}">×</button></span></div>`;}).join('')}</div>`;
    }
    function archiveDigestEntryHtml(row,types,statuses){
        const media=(row.media||[]).filter(item=>String(item.archive_page_number||'').trim()==='');
        const attachments=media.length?`<div class="archive-digest-media"><strong>Médias non rattachés à une page</strong>${media.map(item=>`<button type="button" class="media-list-open" data-open-archive-digest-media="${item.id}" title="Ouvrir le média">${normalizedMediaType(item)==='image'&&item.thumbnail?`<img src="media/${encodeURIComponent(item.thumbnail)}" alt="">`:`<span class="pdf-pill">${mediaTypeShortLabelWithIcon(item)}</span>`}</button><button type="button" class="archive-digest-media-remove" data-unlink-archive-digest-media="${item.id}" data-archive-digest-id="${row.id}" title="Retirer ce média">×</button>`).join('')}</div>`:'';
        const progress=[row.page_total&&`${row.page_total} pages / vues`,(row.pages||[]).length&&`${row.pages.length} page${row.pages.length>1?'s':''} détaillée${row.pages.length>1?'s':''}`].filter(Boolean);
        const peopleBlock=archiveDigestPeopleHtml(row);
        const pagesBlock=archiveDigestPagesHtml(row);
        return `<article class="archive-digest-row" data-archive-digest-id="${row.id}"><div><strong>${row.year_text?escapeHtml(row.year_text):'Sans période'}</strong><p>${row.archive_url?`<a href="${escapeHtml(safeUrl(row.archive_url))}" target="_blank" rel="noopener">${escapeHtml([row.archive_service,row.archive_reference].filter(Boolean).join(' · ')||'Ouvrir l’archive')}</a>`:escapeHtml([row.archive_service,row.archive_reference].filter(Boolean).join(' · ')||'Sans cote')}</p><small>${escapeHtml([row.city_alias,row.department,row.region].filter(Boolean).join(' · '))}</small></div><span class="status-badge">${escapeHtml(archiveDigestLabel(statuses,row.status))}</span><div class="archive-digest-notes">${progress.length?`<p class="archive-digest-progress">${escapeHtml(progress.join(' · '))}</p>`:''}${Number(row.is_exhaustive)?'<span class="status-badge archive-digest-complete-badge">Dépouillement complet</span>':''}${row.exhaustive_note?`<p>${escapeHtml(row.exhaustive_note)}</p>`:''}${row.searched?`<p><b>Cherché</b> ${escapeHtml(row.searched)}</p>`:''}${row.found?`<p><b>Trouvé</b> ${escapeHtml(row.found)}</p>`:''}${row.notes?`<p>${escapeHtml(row.notes)}</p>`:''}${attachments}</div><div class="row-actions"><button class="button small secondary" type="button" data-archive-digest-person="${row.id}">+ Personne</button><button class="button small secondary" type="button" data-archive-digest-page="${row.id}">+ Page / vue</button><button class="button small secondary" type="button" data-archive-digest-media="${row.id}">+ Média</button><button class="button small secondary" type="button" data-archive-digest-transcription="${row.id}">Transcrire</button>${window.LCNDA_EXT?.openDepouillement?`<button class="button small secondary" type="button" data-open-depouillement="${row.id}" title="Le même dépouillement page par page (photos, personnes par foyer, transcription) : Listes › Dépouillements">📜 Pages</button>`:''}<button class="icon-button" type="button" data-archive-digest-edit="${row.id}" title="Modifier">✎</button><button class="icon-button danger" type="button" data-archive-digest-delete="${row.id}" title="Supprimer">🗑</button></div>${peopleBlock}${pagesBlock}</article>`;
    }
    function archiveDigestCategoryOrder(keys){
        let saved=[];
        try{saved=JSON.parse(localStorage.getItem('genealogie-archive-digest-category-order')||'[]');}catch(_){}
        return [...saved.filter(key=>keys.includes(key)),...keys.filter(key=>!saved.includes(key))];
    }
    function archiveDigestRowsHtml(rows,types,statuses){
        if(!rows.length)return empty('Aucun dépouillement enregistré pour ces critères.');
        const cities=new Map();
        rows.forEach(row=>{const city=(row.place_name||row.city_name||row.city_alias||'Ville non précisée').trim();if(!cities.has(city))cities.set(city,[]);cities.get(city).push(row);});
        return `<div class="archive-digest-groups">${Array.from(cities.entries()).map(([city,cityRows])=>{const localities=new Map();cityRows.forEach(row=>{const locality=(row.city_alias||city).trim()||city;if(!localities.has(locality))localities.set(locality,[]);localities.get(locality).push(row);});return `<section class="archive-digest-group"><h3>${escapeHtml(city)} <small>${cityRows.length}</small></h3><div class="archive-digest-localities">${Array.from(localities.entries()).map(([locality,localityRows])=>{const categories=new Map();localityRows.forEach(row=>{const type=row.record_type||'autre';if(!categories.has(type))categories.set(type,[]);categories.get(type).push(row);});const orderedTypes=archiveDigestCategoryOrder([...categories.keys()]);return `<section class="archive-digest-locality"><header><h4>${escapeHtml(locality)}</h4><small>${localityRows.length} entrée${localityRows.length>1?'s':''}</small></header>${orderedTypes.map(type=>{const items=categories.get(type)||[];return `<section class="archive-digest-category"><header><h4>${escapeHtml(archiveDigestLabel(types,type))}</h4><small>${items.length} entrée${items.length>1?'s':''}</small></header><div class="archive-digest-category-entries">${items.map(row=>archiveDigestEntryHtml(row,types,statuses)).join('')}</div></section>`;}).join('')}</section>`;}).join('')}</div></section>`;}).join('')}</div>`;
    }
    async function renderArchiveDigestSearch(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        $('#workspace').innerHTML='<section class="loading-screen"><div class="loading-mark">⌕</div><p>Chargement des dépouillements…</p></section>';
        const filters=state.archiveDigestSearch||{};
        const data=await api('archive_digest_search',{id:filters.id||'',q:filters.q||'',city:filters.city||'',place_id:filters.placeId||0,radius_km:filters.radiusKm||0,dept:filters.dept||'',region:filters.region||'',record_type:filters.recordType||'',status:filters.status||''});
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const editing=(data.rows||[]).find(row=>Number(row.id)===Number(state.archiveDigestEditId))||null;
        const adding=state.archiveDigestAdding===true||Boolean(editing);
        const radiusNote=Number(data.radius_km||0)>0?` · rayon de ${Number(data.radius_km)} km autour de la commune${data.radius_unavailable?' (coordonnées absentes, commune exacte seulement)':''}`:'';
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">RECHERCHE · DÉPOUILLEMENT D’ARCHIVE</span><h2>Suivi des registres dépouillés</h2><p>${Number(data.rows?.length||0).toLocaleString('fr-FR')} entrée${(data.rows?.length||0)>1?'s':''} affichée${(data.rows?.length||0)>1?'s':''}${escapeHtml(radiusNote)}. Regroupe ce que tu as déjà vérifié, ce qui est à revoir et les pistes annexes.</p></div><div class="page-actions"><button class="button secondary" type="button" id="archive-digest-csv">Importer CSV</button>${window.LCNDA_EXT?.openDepouillement?`<button class="button secondary" type="button" data-h-open-list="depouillements" title="Les mêmes dépouillements, page par page (Listes › Dépouillements)">📜 En pages (Listes)</button>`:''}<button class="button secondary" type="button" id="archive-digest-index">Index des cotes</button><button class="button secondary" type="button" id="archive-digest-requests">Actes à commander</button><button class="button secondary" type="button" id="archive-digest-gaps">Lacunes d’archives</button><button class="button secondary" type="button" id="archive-digest-category-order">Ordre des catégories</button></div></header>${adding?archiveDigestFormHtml(editing||{}):''}${archiveDigestRowsHtml(data.rows||[],data.types||{},data.statuses||{})}</section>`;
        if(state.researchDisplay==='cards')$('.archive-digest-groups')?.classList.add('is-cards');
        $('#archive-digest-category-order')?.addEventListener('click',()=>openArchiveDigestCategoryOrderDialog(data.types||{}));
        $('#archive-digest-csv')?.addEventListener('click',()=>openArchiveDigestCsvDialog());
        $('#archive-digest-index')?.addEventListener('click',()=>openArchiveDigestIndexDialog(data.rows||[]));
        $('#archive-digest-requests')?.addEventListener('click',()=>openArchiveDigestAuxiliaryDialog('requests',data.rows||[]));
        $('#archive-digest-gaps')?.addEventListener('click',()=>openArchiveDigestAuxiliaryDialog('gaps',data.rows||[]));
        bindArchiveDigestUi(data.rows||[]);
    }
    function bindArchiveDigestUi(rows){
        const form=$('#archive-digest-form');
        const formRow=rows.find(row=>Number(row.id)===Number(form?.elements.id?.value))||{};
        enhanceArchiveDigestForm(form,formRow);
        setupArchiveDigestEntryPlacePicker(form);
        form?.addEventListener('submit',async event=>{
            event.preventDefault();
            const values=formObject(form);
            try{
                await api('save_archive_digest',{}, {method:'POST',body:values});
                state.archiveDigestAdding=false;
                state.archiveDigestEditId=0;
                toast(values.id&&Number(values.id)?'Dépouillement modifié.':'Dépouillement ajouté.');
                await renderResearch();
            }catch(error){toast(error.message||'Enregistrement impossible.','error');}
        });
        $$('[data-archive-digest-edit]').forEach(button=>button.addEventListener('click',()=>{
            const id=Number(button.dataset.archiveDigestEdit);
            const row=rows.find(item=>Number(item.id)===id);
            if(!row)return;
            state.archiveDigestAdding=true;
            state.archiveDigestEditId=id;
            renderResearch();
        }));
        $$('[data-archive-digest-cancel]').forEach(button=>button.addEventListener('click',()=>{state.archiveDigestAdding=false;state.archiveDigestEditId=0;renderResearch();}));
        $$('[data-archive-digest-delete]').forEach(button=>button.addEventListener('click',async()=>{
            if(!confirm('Supprimer ce dépouillement ?'))return;
            try{await api('delete_archive_digest',{}, {method:'POST',body:{id:Number(button.dataset.archiveDigestDelete)}});toast('Dépouillement supprimé.');await renderResearch();}catch(error){toast(error.message||'Suppression impossible.','error');}
        }));
        $$('[data-archive-digest-media]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestMedia));
            if(row)openArchiveDigestMediaDialog(row);
        }));
        $$('[data-archive-digest-transcription]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestTranscription));
            if(row)openArchiveDigestTranscriptionDialog(row);
        }));
        $$('[data-archive-digest-person]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestPerson));
            if(row)openArchiveDigestPersonDialog(row);
        }));
        $$('[data-archive-digest-person-edit]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestId));
            const member=row?.people?.find(item=>Number(item.id)===Number(button.dataset.archiveDigestPersonEdit));
            if(row&&member)openArchiveDigestPersonDialog(row,member);
        }));
        $$('[data-archive-digest-person-delete]').forEach(button=>button.addEventListener('click',async()=>{
            if(!confirm('Retirer cette personne relevée ?'))return;
            try{await api('delete_archive_digest_person',{}, {method:'POST',body:{id:Number(button.dataset.archiveDigestPersonDelete)}});toast('Personne relevée retirée.');await renderResearch();}catch(error){toast(error.message||'Retrait impossible.','error');}
        }));
        $$('[data-archive-digest-page]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestPage));
            if(row)openArchiveDigestPageDialog(row);
        }));
        $$('[data-archive-digest-page-edit]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestId));
            if(row)openArchiveDigestPageDialog(row,Number(button.dataset.archiveDigestPageEdit));
        }));
        $$('[data-archive-digest-page-person]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestId));
            const page=row?.pages?.[Number(button.dataset.archiveDigestPagePerson)];
            if(row&&page)openArchiveDigestPersonDialog(row,null,page.number||'');
        }));
        $$('[data-archive-digest-page-media]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestId));
            const page=row?.pages?.[Number(button.dataset.archiveDigestPageMedia)];
            if(row&&page)openArchiveDigestMediaDialog(row,page.number||'');
        }));
        $$('[data-archive-digest-page-delete]').forEach(button=>button.addEventListener('click',async()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestId));
            const index=Number(button.dataset.archiveDigestPageDelete);
            if(!row||!Number.isInteger(index)||!confirm('Retirer cette page / vue ?'))return;
            try{await saveArchiveDigestPages(row,(row.pages||[]).filter((_,itemIndex)=>itemIndex!==index));toast('Page retirée.');await renderResearch();}catch(error){toast(error.message||'Retrait impossible.','error');}
        }));
        $$('[data-archive-digest-id]').forEach(article=>{
            const row=rows.find(item=>Number(item.id)===Number(article.dataset.archiveDigestId));
            const actions=$('.row-actions',article);
            if(!row?.people?.length||!actions)return;
            actions.insertAdjacentHTML('beforeend',`<button class="button small secondary" type="button" data-archive-digest-group-pages="${row.id}">${state.archiveDigestGroupByPage?'Liste simple':'Regrouper par page et foyer'}</button>`);
        });
        $$('[data-archive-digest-group-pages]').forEach(button=>button.addEventListener('click',()=>{state.archiveDigestGroupByPage=!state.archiveDigestGroupByPage;renderResearch();}));
        $$('[data-unlink-archive-digest-media]').forEach(button=>button.addEventListener('click',async()=>{
            try{await api('unlink_archive_digest_media',{}, {method:'POST',body:{archive_digest_id:Number(button.dataset.archiveDigestId),media_id:Number(button.dataset.unlinkArchiveDigestMedia)}});toast('Média retiré du dépouillement.');await renderResearch();}catch(error){toast(error.message||'Retrait impossible.','error');}
        }));
        $$('[data-open-archive-digest-media]').forEach(button=>button.addEventListener('click',()=>{
            const id=Number(button.dataset.openArchiveDigestMedia);
            const media=rows.flatMap(row=>row.media||[]);
            const index=media.findIndex(item=>Number(item.id)===id);
            if(index>=0)openLightbox(media,index,true);
        }));
        $$('[data-open-archive-digest-page-media]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestId));
            const media=row?.media?.find(item=>Number(item.id)===Number(button.dataset.openArchiveDigestPageMedia));
            if(media)openLightbox([media],0,true);
        }));
        $$('[data-edit-archive-digest-page-media]').forEach(button=>button.addEventListener('click',()=>{
            const row=rows.find(item=>Number(item.id)===Number(button.dataset.archiveDigestId));
            const media=row?.media?.find(item=>Number(item.id)===Number(button.dataset.editArchiveDigestPageMedia));
            if(media)openLightbox([media],0,false);
        }));
        bindTableLinks();
    }

    function archiveDigestSavePayload(entry,pages){
        return {id:entry.id,place_id:entry.place_id||0,city_name:entry.city_name||'',city_alias:entry.city_alias||'',department:entry.department||'',region:entry.region||'',archive_service:entry.archive_service||'',archive_reference:entry.archive_reference||'',archive_url:entry.archive_url||'',year_text:entry.year_text||'',record_type:entry.record_type||'autre',template_key:entry.template_key||'standard',status:entry.status||'todo',searched:entry.searched||'',found:entry.found||'',notes:entry.notes||'',address:entry.address||'',household_number:entry.household_number||'',is_exhaustive:Number(entry.is_exhaustive)?1:0,exhaustive_note:entry.exhaustive_note||'',act_number:entry.act_number||'',page_number:entry.page_number||'',page_total:entry.page_total||'',pages_checked:entry.pages_checked||'',pages_without_info:entry.pages_without_info||'',pages_json:JSON.stringify(pages)};
    }
    async function saveArchiveDigestPages(entry,pages){
        return api('save_archive_digest',{}, {method:'POST',body:archiveDigestSavePayload(entry,pages)});
    }
    function openArchiveDigestPageDialog(entry,index=null){
        $('#archive-digest-page-dialog')?.remove();
        const pages=Array.isArray(entry.pages)?entry.pages.map(page=>({...page})):[];
        const current=index===null?{number:'',status:'checked',content_type:'acts',act_from:'',act_to:'',note:''}:pages[index];
        if(!current)return;
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal small-modal" id="archive-digest-page-dialog"><form id="archive-digest-page-form"><div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>${index===null?'Ajouter une page / vue':'Modifier la page / vue'}</h2><p>${escapeHtml([entry.city_name||entry.place_name,entry.year_text,entry.archive_reference].filter(Boolean).join(' · '))}</p></div><button class="icon-button" type="button" data-close-archive-digest-page>×</button></div><div class="form-grid"><label>Page / vue<input name="number" value="${escapeHtml(current.number||'')}" placeholder="Ex : 42" required></label><label>Nature<select name="content_type"><option value="acts" ${current.content_type==='acts'?'selected':''}>Actes / informations</option><option value="empty" ${current.content_type==='empty'?'selected':''}>Page sans information</option><option value="cover" ${current.content_type==='cover'?'selected':''}>Couverture / index</option><option value="review" ${current.content_type==='review'?'selected':''}>À revoir</option><option value="other" ${current.content_type==='other'?'selected':''}>Autre</option></select></label><label>État<select name="status">${archiveDigestPageStatusOptions(current.status||'checked')}</select></label><label>N° d’acte, de<input name="act_from" value="${escapeHtml(current.act_from||'')}" placeholder="Ex : 18"></label><label>N° d’acte, à<input name="act_to" value="${escapeHtml(current.act_to||'')}" placeholder="Ex : 23"></label><label class="span-2">Texte / informations de la page<textarea name="note" rows="4" placeholder="Résumé, noms trouvés, couverture, lacune, piste…">${escapeHtml(current.note||'')}</textarea></label><div class="span-2 archive-digest-after-actions"><label class="archive-digest-add-person-after"><input type="checkbox" name="add_person_after"> Ajouter une personne après l’enregistrement</label><label class="archive-digest-add-person-after"><input type="checkbox" name="add_media_after"> Ajouter un média après l’enregistrement</label></div></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close-archive-digest-page>Annuler</button><button class="button" type="submit">${index===null?'Ajouter la page':'Enregistrer'}</button></div></form></dialog>`);
        const dialog=$('#archive-digest-page-dialog'),form=$('#archive-digest-page-form',dialog);
        $$('[data-close-archive-digest-page]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
        form.addEventListener('submit',async event=>{event.preventDefault();const values=formObject(form);const addPersonAfter=Boolean(form.elements.add_person_after?.checked);const addMediaAfter=Boolean(form.elements.add_media_after?.checked);const page={number:values.number,status:values.status,content_type:values.content_type,act_from:values.act_from,act_to:values.act_to,note:values.note};if(index===null)pages.push(page);else pages[index]=page;try{await saveArchiveDigestPages(entry,pages);dialog.close();toast(index===null?'Page ajoutée.':'Page modifiée.');if(addPersonAfter||addMediaAfter){const refreshed=await api('archive_digest_search',{id:entry.id});await renderResearch();const saved=(refreshed.rows||[])[0];if(saved&&addMediaAfter)openArchiveDigestMediaDialog(saved,page.number);else if(saved&&addPersonAfter)openArchiveDigestPersonDialog(saved,null,page.number);}else await renderResearch();}catch(error){toast(error.message||'Enregistrement impossible.','error');}});
        dialog.addEventListener('close',()=>dialog.remove());
        dialog.showModal();
    }

    function openArchiveDigestCategoryOrderDialog(types){
        $('#archive-digest-category-order-dialog')?.remove();
        const keys=archiveDigestCategoryOrder(Object.keys(types));
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal small-modal" id="archive-digest-category-order-dialog"><div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>Ordre des catégories</h2><p>Glisse les catégories pour choisir leur ordre dans chaque ville.</p></div><button class="icon-button" type="button" data-close-archive-digest-category-order>×</button></div><div class="order-list" id="archive-digest-category-order-list">${keys.map((key,index)=>`<div class="order-row" data-order-key="${escapeHtml(key)}"><span class="order-grip" draggable="true" aria-hidden="true">↕</span><span class="order-number">${String(index+1).padStart(2,'0')}</span><b>${escapeHtml(archiveDigestLabel(types,key))}</b></div>`).join('')}</div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close-archive-digest-category-order>Annuler</button><button class="button" type="button" data-save-archive-digest-category-order>Enregistrer l’ordre</button></div></dialog>`);
        const dialog=$('#archive-digest-category-order-dialog'),list=$('#archive-digest-category-order-list',dialog);
        setupDragOrder(list);
        $$('[data-close-archive-digest-category-order]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
        $('[data-save-archive-digest-category-order]',dialog).addEventListener('click',()=>{localStorage.setItem('genealogie-archive-digest-category-order',JSON.stringify($$('.order-row',list).map(row=>row.dataset.orderKey)));dialog.close();toast('Ordre des catégories enregistré.');renderResearch();});
        dialog.addEventListener('close',()=>dialog.remove());
        dialog.showModal();
    }

    function archiveDigestCsvTemplate(){
        return 'ville;commune_liee;departement;region;archives;cote;lien_archive;periode;type_acte;modele;etat;ce_que_je_cherche;ce_que_j_ai_trouve;annotation;prenom;nom;page;adresse;foyer;age;profession\nVulaines-sur-Seine;;Seine-et-Marne;Ile-de-France;AD 77;6 M 24;https://archives.example;1921;recensement;recensement;a_faire;Famille Martin;;;Jean;Martin;42;Rue de la Mairie;12;42 ans;Cultivateur';
    }
    function parseDelimitedCsv(text){
        const delimiter=(text.match(/;/g)||[]).length>=(text.match(/,/g)||[]).length?';':',';
        const rows=[];let row=[],cell='',quoted=false;
        for(let index=0;index<text.length;index++){
            const char=text[index],next=text[index+1];
            if(char==='"'&&quoted&&next==='"'){cell+='"';index++;continue;}
            if(char==='"'){quoted=!quoted;continue;}
            if(char===delimiter&&!quoted){row.push(cell.trim());cell='';continue;}
            if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')index++;row.push(cell.trim());if(row.some(value=>value!==''))rows.push(row);row=[];cell='';continue;}
            cell+=char;
        }
        row.push(cell.trim());if(row.some(value=>value!==''))rows.push(row);
        if(rows.length<2)return [];
        const normalize=value=>String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
        const headers=rows.shift().map(normalize);
        return rows.map(cells=>Object.fromEntries(headers.map((header,index)=>[header,cells[index]||'']))).filter(row=>Object.values(row).some(Boolean));
    }
    function archiveDigestCsvType(value){
        const normalized=String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]+/g,'_').replace(/^_|_$/g,'');
        const aliases={table_decennale:'table_decennale',table_decennale_:'table_decennale',table:'table_decennale',mariage:'mariage',naissance:'naissance',deces:'deces',bapteme:'bapteme',succession:'succession',recensement:'recensement',prison:'prison',fiche_militaire:'fiche_militaire',liste_prisonnier:'liste_prisonnier'};
        return aliases[normalized]||'autre';
    }
    function archiveDigestCsvStatus(value){
        const normalized=String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]+/g,'_').replace(/^_|_$/g,'');
        return ({termine:'done',fini:'done',a_revoir:'review',doute:'doubt',priorite:'priority',a_faire_en_priorite:'priority',plus_tard:'later',a_faire:'todo'})[normalized]||'todo';
    }
    function archiveDigestCsvTemplateKey(value,type){
        const normalized=String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]+/g,'_').replace(/^_|_$/g,'');
        if(ARCHIVE_DIGEST_TEMPLATES[normalized])return normalized;
        if(type==='recensement')return 'census';
        if(['fiche_militaire','prison','liste_prisonnier'].includes(type))return 'military';
        if(type==='succession')return 'notarial';
        if(type==='table_decennale')return 'table';
        if(['naissance','mariage','deces','bapteme'].includes(type))return 'civil';
        return 'standard';
    }
    function openArchiveDigestCsvDialog(){
        $('#archive-digest-csv-dialog')?.remove();
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal small-modal" id="archive-digest-csv-dialog"><form id="archive-digest-csv-form"><div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>Importer un tableur CSV</h2><p>Une ligne crée un suivi de registre. Les colonnes prénom et nom sont facultatives et ajoutent une personne relevée.</p></div><button class="icon-button" type="button" data-close-archive-digest-csv>×</button></div><div class="csv-import-help"><b>Colonnes reconnues</b><p>ville, commune_liee, departement, region, archives, cote, lien_archive, periode, type_acte, modele, etat, ce_que_je_cherche, ce_que_j_ai_trouve, annotation, prenom, nom, page, adresse, foyer, age, profession.</p><button class="button small secondary" type="button" data-download-archive-digest-csv> Télécharger le modèle CSV</button></div><label>Fichier CSV<input name="file" type="file" accept=".csv,text/csv" required></label><p class="csv-import-status" data-archive-digest-csv-status></p><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close-archive-digest-csv>Annuler</button><button class="button" type="submit">Importer les lignes</button></div></form></dialog>`);
        const dialog=$('#archive-digest-csv-dialog'),form=$('#archive-digest-csv-form',dialog),status=$('[data-archive-digest-csv-status]',dialog);
        const close=()=>dialog.close();
        $$('[data-close-archive-digest-csv]',dialog).forEach(button=>button.addEventListener('click',close));
        $('[data-download-archive-digest-csv]',dialog).addEventListener('click',()=>{const blob=new Blob([archiveDigestCsvTemplate()],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='modele-depouillement.csv';link.click();URL.revokeObjectURL(link.href);});
        form.addEventListener('submit',async event=>{
            event.preventDefault();const file=form.elements.file.files?.[0];if(!file)return;
            const rows=parseDelimitedCsv(await file.text());if(!rows.length){status.textContent='Aucune ligne exploitable trouvée.';return;}
            form.querySelector('button[type="submit"]').disabled=true;let imported=0,people=0,failed=0;
            for(const item of rows){
                try{
                    const type=archiveDigestCsvType(item.type_acte||item.type||'');
                    const payload={city_name:item.ville||item.commune||'',city_alias:item.commune_liee||item.ville_liee||'',department:item.departement||'',region:item.region||'',archive_service:item.archives||item.service||'',archive_reference:item.cote||item.registre||'',archive_url:item.lien_archive||item.url||'',year_text:item.periode||item.annee||'',record_type:type,template_key:archiveDigestCsvTemplateKey(item.modele||'',type),status:archiveDigestCsvStatus(item.etat||''),searched:item.ce_que_je_cherche||item.cherche||'',found:item.ce_que_j_ai_trouve||item.trouve||'',notes:item.annotation||item.note||'',pages_json:'[]'};
                    const saved=await api('save_archive_digest',{}, {method:'POST',body:payload}); imported++;
                    if((item.prenom||item.nom||item.nom_releve)&&saved.result?.id){await api('save_archive_digest_person',{}, {method:'POST',body:{archive_digest_id:saved.result.id,first_name:item.prenom||'',last_name:item.nom||item.nom_releve||'',page_number:item.page||'',address:item.adresse||'',household_key:item.foyer||'',age_text:item.age||'',occupation:item.profession||''}});people++;}
                }catch(_){failed++;}
                status.textContent=`Import : ${imported}/${rows.length} suivi(s), ${people} personne(s) relevée(s)${failed?`, ${failed} ligne(s) ignorée(s)`:''}.`;
            }
            toast(`${imported} dépouillement(s) importé(s).`);dialog.close();await renderResearch();
        });
        dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
    }
    function archiveDigestEntryOptions(rows,selected=0){
        return `<option value="">Aucun suivi précis</option>${rows.map(row=>`<option value="${row.id}" ${Number(selected)===Number(row.id)?'selected':''}>${escapeHtml([row.record_type&&archiveDigestLabel({table_decennale:'Table décennale',mariage:'Mariage',naissance:'Naissance',deces:'Décès',bapteme:'Baptême',succession:'Succession',recensement:'Recensement',prison:'Prison',fiche_militaire:'Fiche militaire',liste_prisonnier:'Liste prisonnier',autre:'Autre'},row.record_type),row.year_text,row.city_alias||row.city_name||row.place_name,row.archive_reference].filter(Boolean).join(' · '))}</option>`).join('')}`;
    }
    async function openArchiveDigestAuxiliaryDialog(mode,rows=[]){
        const auxiliary=await api('archive_digest_auxiliary');
        const isGap=mode==='gaps',items=isGap?(auxiliary.gaps||[]):(auxiliary.requests||[]),types=isGap?(auxiliary.gap_types||{}):(auxiliary.request_types||{}),statuses=isGap?{open:'Ouverte',closed:'Résolue'}:(auxiliary.request_statuses||{});
        const id=`archive-digest-${isGap?'gaps':'requests'}-dialog`; $(`#${id}`)?.remove();
        const itemHtml=item=>isGap?`<article class="archive-digest-aux-row"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml([types[item.gap_type],item.period_text,archiveDigestReferenceText(item)].filter(Boolean).join(' · '))}</p>${item.notes?`<small>${escapeHtml(item.notes)}</small>`:''}</div><span class="status-badge">${escapeHtml(statuses[item.status]||item.status)}</span><div>${item.url?`<a class="button small secondary" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener">Ouvrir</a>`:''}<button class="icon-button danger" type="button" data-archive-aux-delete="${item.id}">×</button></div></article>`:`<article class="archive-digest-aux-row"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml([types[item.request_type],archiveDigestReferenceText(item),item.due_at&&`pour le ${item.due_at}`].filter(Boolean).join(' · '))}</p>${item.notes?`<small>${escapeHtml(item.notes)}</small>`:''}</div><span class="status-badge">${escapeHtml(statuses[item.status]||item.status)}</span><div>${item.url?`<a class="button small secondary" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener">Ouvrir</a>`:''}<button class="icon-button danger" type="button" data-archive-aux-delete="${item.id}">×</button></div></article>`;
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal archive-digest-aux-dialog" id="${id}"><form id="${id}-form"><div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>${isGap?'Lacunes d’archives':'Actes à commander ou consulter'}</h2><p>${isGap?'Registres détruits, périodes absentes ou documents non numérisés.':'Liste de travail indépendante pour les actes à commander, consulter en salle ou faire reproduire.'}</p></div><button class="icon-button" type="button" data-close-archive-aux>×</button></div><section class="archive-digest-aux-form"><div class="form-grid"><label>Type<select name="${isGap?'gap_type':'request_type'}">${Object.entries(types).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>État<select name="status">${Object.entries(statuses).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label class="span-2">Suivi de registre lié<select name="archive_digest_id">${archiveDigestEntryOptions(rows)}</select></label><label class="span-2">Intitulé<input name="title" required placeholder="${isGap?'Ex : Registre de naissances détruit':'Ex : Commander la copie de l’acte n°18'}"></label>${isGap?`<label>Période concernée<input name="period_text" placeholder="Ex : 1871-1872"></label>`:`<label>Date souhaitée<input name="due_at" type="date"></label><label>Archives / service<input name="archive_service" placeholder="AD, mairie…"></label><label>Cote / référence<input name="archive_reference" placeholder="3 E 123, vue 42…"></label>`}<label class="span-2">Lien direct<input name="url" type="url" placeholder="https://archives…"></label><label class="span-2">Note<textarea name="notes" rows="3" placeholder="Détail, réponse des archives, raison de la lacune…"></textarea></label></div><div class="modal-actions"><span class="spacer"></span><button class="button" type="submit">Ajouter</button></div></section></form><section class="archive-digest-aux-list"><h3>${items.length} élément${items.length>1?'s':''}</h3>${items.length?items.map(itemHtml).join(''):empty(isGap?'Aucune lacune signalée.':'Aucun acte à commander ou consulter.')}</section></dialog>`);
        const dialog=$(`#${id}`),form=$(`#${id}-form`,dialog);$$('[data-close-archive-aux]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
        form.addEventListener('submit',async event=>{event.preventDefault();try{await api(isGap?'save_archive_digest_gap':'save_archive_digest_request',{}, {method:'POST',body:formObject(form)});toast(isGap?'Lacune ajoutée.':'Acte ajouté à la liste.');dialog.close();openArchiveDigestAuxiliaryDialog(mode,rows);}catch(error){toast(error.message||'Enregistrement impossible.','error');}});
        $$('[data-archive-aux-delete]',dialog).forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Supprimer cet élément ?'))return;try{await api(isGap?'delete_archive_digest_gap':'delete_archive_digest_request',{}, {method:'POST',body:{id:Number(button.dataset.archiveAuxDelete)}});toast('Élément supprimé.');dialog.close();openArchiveDigestAuxiliaryDialog(mode,rows);}catch(error){toast(error.message||'Suppression impossible.','error');}}));
        dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
    }
    function archiveDigestReferenceText(item){return [item.place_name||item.city_name||item.city_alias,item.year_text,item.archive_reference||item.linked_archive_reference].filter(Boolean).join(' · ');}
    function openArchiveDigestIndexDialog(rows){
        $('#archive-digest-index-dialog')?.remove();
        const ordered=[...rows].sort((a,b)=>[a.archive_service,a.archive_reference,a.city_name,a.year_text].join(' ').localeCompare([b.archive_service,b.archive_reference,b.city_name,b.year_text].join(' '),'fr'));
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal archive-digest-aux-dialog" id="archive-digest-index-dialog"><div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>Index des cotes consultées</h2><p>${ordered.length} cote${ordered.length>1?'s':''} ou registre${ordered.length>1?'s':''} déjà suivis dans cette sélection.</p></div><button class="icon-button" type="button" data-close-archive-digest-index>×</button></div><div class="archive-digest-aux-list">${ordered.length?ordered.map(row=>`<article class="archive-digest-aux-row"><div><strong>${escapeHtml(row.archive_reference||'Sans cote')}</strong><p>${escapeHtml([row.archive_service,row.year_text,row.city_alias||row.city_name||row.place_name,archiveDigestLabel({table_decennale:'Table décennale',mariage:'Mariage',naissance:'Naissance',deces:'Décès',bapteme:'Baptême',succession:'Succession',recensement:'Recensement',prison:'Prison',fiche_militaire:'Fiche militaire',liste_prisonnier:'Liste prisonnier',autre:'Autre'},row.record_type)].filter(Boolean).join(' · '))}</p></div><span class="status-badge">${escapeHtml(archiveDigestLabel({todo:'À faire',done:'Terminé',review:'À revoir',doubt:'Doute',priority:'Priorité',later:'Plus tard'},row.status))}</span><div>${row.archive_url?`<a class="button small secondary" href="${escapeHtml(safeUrl(row.archive_url))}" target="_blank" rel="noopener">Ouvrir</a>`:''}<button class="button small secondary" type="button" data-index-open-digest="${row.id}">Voir</button></div></article>`).join(''):empty('Aucune cote dans cette sélection.')}</div></dialog>`);
        const dialog=$('#archive-digest-index-dialog');$$('[data-close-archive-digest-index]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));$$('[data-index-open-digest]',dialog).forEach(button=>button.addEventListener('click',()=>{dialog.close();state.archiveDigestEditId=Number(button.dataset.indexOpenDigest);state.archiveDigestAdding=true;renderResearch();}));dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
    }

    async function openArchiveDigestTranscriptionDialog(entry){
        $('#archive-digest-transcription-dialog')?.remove();
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal archive-digest-transcription-dialog" id="archive-digest-transcription-dialog"><div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>Transcription ligne à ligne</h2><p>${escapeHtml([entry.city_name||entry.place_name,entry.record_type,entry.year_text,entry.archive_reference].filter(Boolean).join(' · '))}</p></div><button class="icon-button" type="button" data-close-archive-transcription>×</button></div><div data-archive-transcription-content></div></dialog>`);
        const dialog=$('#archive-digest-transcription-dialog');$$('[data-close-archive-transcription]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
        const refresh=async()=>{const data=await api('archive_digest_transcriptions',{id:entry.id});renderArchiveDigestTranscription(dialog,data,refresh);};
        dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
        try{await refresh();}catch(error){$('[data-archive-transcription-content]',dialog).innerHTML=empty(error.message||'Chargement impossible.');}
    }
    function archiveDigestMediaImageUrl(media){return media?.filename?`media/${encodeURIComponent(media.filename)}`:'';}
    function archiveDigestLineZone(line){try{return line.zone_json?JSON.parse(line.zone_json):null;}catch(_){return null;}}
    function archiveDigestVersionOptions(versions){return versions.map(version=>`<option value="${version.id}">${escapeHtml(version.title||`Version ${version.id}`)}</option>`).join('');}
    function renderArchiveDigestTranscription(dialog,data,refresh){
        const root=$('[data-archive-transcription-content]',dialog),images=(data.media||[]).filter(media=>normalizedMediaType(media)==='image'),lines=data.lines||[],versions=data.versions||[];
        root.innerHTML=`<div class="archive-transcription-layout"><section class="archive-transcription-editor"><form data-archive-transcription-form><input type="hidden" name="archive_digest_id" value="${data.entry.id}"><input type="hidden" name="zone_json" value=""><div class="form-grid"><label>Média image<select name="media_id" data-archive-transcription-media><option value="">Aucun média / transcription libre</option>${images.map(media=>`<option value="${media.id}">${escapeHtml(media.title||media.filename||`Média #${media.id}`)}</option>`).join('')}</select></label><label>Page / vue<input name="page_number" placeholder="Ex : 42"></label><label>Ligne n°<input name="line_number" type="number" min="1" value="${lines.length+1}"></label><label class="span-2">Texte de la ligne<textarea name="content" rows="3" required placeholder="Transcris ici une ligne ou un passage du registre…"></textarea></label></div><div class="archive-transcription-zone" data-archive-transcription-zone><div class="archive-transcription-zone-empty">Choisis une image pour relier la transcription à une zone.</div></div><p class="cell-muted">Trace un rectangle sur l’image si la ligne est visible sur le document.</p><div class="modal-actions"><span class="spacer"></span><button class="button" type="submit">Ajouter la ligne</button></div></form></section><section class="archive-transcription-lines"><div class="archive-transcription-lines-head"><div><h3>Lignes relevées</h3><p>${lines.length} ligne${lines.length>1?'s':''}</p></div><button class="button small secondary" type="button" data-archive-transcription-snapshot ${lines.length?'':'disabled'}>Créer une version</button></div>${lines.length?lines.map(line=>{const zone=archiveDigestLineZone(line);return `<article class="archive-transcription-line"><div><strong>${escapeHtml([line.page_number&&`Page ${line.page_number}`,line.line_number&&`Ligne ${line.line_number}`].filter(Boolean).join(' · ')||'Ligne')}</strong><p>${escapeHtml(line.content)}</p><small>${escapeHtml(line.media_title||'Sans média')}${zone?' · zone liée':''}</small></div><div>${zone?`<button class="button small secondary" type="button" data-archive-transcription-focus="${line.media_id||0}" data-zone="${escapeHtml(line.zone_json||'')}">Voir la zone</button>`:''}<button class="icon-button danger" type="button" data-archive-transcription-line-delete="${line.id}" title="Retirer la ligne">×</button></div></article>`;}).join(''):empty('Aucune ligne relevée pour le moment.')}</section></div><section class="archive-transcription-compare"><div><span class="eyebrow">VERSIONS</span><h3>Comparer deux versions</h3><p>Les versions sont des instantanés de la transcription, utiles pour relire une correction.</p></div>${versions.length>1?`<div class="archive-transcription-version-controls"><select data-archive-transcription-version-a>${archiveDigestVersionOptions(versions)}</select><select data-archive-transcription-version-b>${archiveDigestVersionOptions(versions.slice(1))}</select><button class="button secondary" type="button" data-archive-transcription-compare>Comparer</button></div><div data-archive-transcription-comparison></div>`:'<p class="cell-muted">Crée au moins deux versions pour comparer les modifications.</p>'}</section>`;
        const form=$('[data-archive-transcription-form]',root),mediaSelect=$('[data-archive-transcription-media]',form),zoneBox=$('[data-archive-transcription-zone]',form);
        const draw=zone=>renderArchiveDigestZone(zoneBox,images.find(media=>Number(media.id)===Number(mediaSelect.value)),zone,form.elements.zone_json);
        mediaSelect.addEventListener('change',()=>draw(null)); draw(null);
        form.addEventListener('submit',async event=>{event.preventDefault();try{await api('save_archive_digest_transcription_line',{}, {method:'POST',body:formObject(form)});toast('Ligne ajoutée.');await refresh();}catch(error){toast(error.message||'Enregistrement impossible.','error');}});
        $$('[data-archive-transcription-line-delete]',root).forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Retirer cette ligne ?'))return;try{await api('delete_archive_digest_transcription_line',{}, {method:'POST',body:{id:Number(button.dataset.archiveTranscriptionLineDelete)}});await refresh();}catch(error){toast(error.message||'Suppression impossible.','error');}}));
        $$('[data-archive-transcription-focus]',root).forEach(button=>button.addEventListener('click',()=>{mediaSelect.value=button.dataset.archiveTranscriptionFocus||'';draw(archiveDigestLineZone({zone_json:button.dataset.zone||''}));zoneBox.scrollIntoView({behavior:'smooth',block:'center'});}));
        $('[data-archive-transcription-snapshot]',root)?.addEventListener('click',async()=>{const title=await askText({title:'Enregistrer une version',message:'Nom de cette version (facultatif) :',okLabel:'Enregistrer'});if(title===null)return;try{await api('save_archive_digest_transcription_version',{}, {method:'POST',body:{archive_digest_id:data.entry.id,title}});toast('Version enregistrée.');await refresh();}catch(error){toast(error.message||'Version impossible.','error');}});
        $('[data-archive-transcription-compare]',root)?.addEventListener('click',()=>{const a=versions.find(version=>Number(version.id)===Number($('[data-archive-transcription-version-a]',root)?.value)),b=versions.find(version=>Number(version.id)===Number($('[data-archive-transcription-version-b]',root)?.value));const target=$('[data-archive-transcription-comparison]',root);if(target&&a&&b)target.innerHTML=archiveDigestTranscriptionDiff(a,b);});
    }
    function renderArchiveDigestZone(box,media,initialZone,hidden){
        if(!media){box.innerHTML='<div class="archive-transcription-zone-empty">Choisis une image pour relier la transcription à une zone.</div>';if(hidden)hidden.value='';return;}
        const zone=initialZone&&initialZone.width?initialZone:null;
        box.innerHTML=`<div class="archive-transcription-canvas"><img src="${archiveDigestMediaImageUrl(media)}" alt="${escapeHtml(media.title||'Document')}">${zone?`<span class="archive-transcription-selection" style="left:${zone.x}%;top:${zone.y}%;width:${zone.width}%;height:${zone.height}%"></span>`:''}</div>`;
        if(hidden)hidden.value=zone?JSON.stringify(zone):'';
        const canvas=$('.archive-transcription-canvas',box);let start=null;
        canvas.addEventListener('pointerdown',event=>{event.preventDefault();const rect=canvas.getBoundingClientRect();start={x:Math.max(0,Math.min(100,(event.clientX-rect.left)*100/rect.width)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)*100/rect.height))};canvas.setPointerCapture?.(event.pointerId);});
        canvas.addEventListener('pointerup',event=>{if(!start)return;const rect=canvas.getBoundingClientRect(),end={x:Math.max(0,Math.min(100,(event.clientX-rect.left)*100/rect.width)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)*100/rect.height))};const next={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)};start=null;if(next.width<1||next.height<1)return;renderArchiveDigestZone(box,media,next,hidden);});
    }
    function archiveDigestTranscriptionDiff(a,b){
        let left=[],right=[];try{left=JSON.parse(a.lines_json||'[]');right=JSON.parse(b.lines_json||'[]');}catch(_){}
        const count=Math.max(left.length,right.length);return `<div class="archive-transcription-diff"><h4>${escapeHtml(a.title)} / ${escapeHtml(b.title)}</h4>${Array.from({length:count},(_,index)=>{const before=left[index]?.content||'',after=right[index]?.content||'';const same=before===after;return `<div class="${same?'is-same':'is-changed'}"><span>${index+1}</span><p>${same?escapeHtml(after):`<del>${escapeHtml(before||'—')}</del><ins>${escapeHtml(after||'—')}</ins>`}</p></div>`;}).join('')}</div>`;}

    function openArchiveDigestPersonDialog(entry,member=null,pageNumber=''){
        $('#archive-digest-person-dialog')?.remove();
        const current=member||{};
        const initialMode=current.person_id?'existing':'manual';
        const pageOptions=(entry.pages||[]).map(page=>`<option value="${escapeHtml(page.number||'')}">`).join('');
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal" id="archive-digest-person-dialog"><form id="archive-digest-person-form"><div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>${member?'Modifier une personne relevée':pageNumber?`Ajouter une personne - page ${escapeHtml(pageNumber)}`:'Ajouter une personne relevée'}</h2><p>${escapeHtml([entry.city_name||entry.place_name,entry.record_type,entry.year_text].filter(Boolean).join(' · '))}</p></div><button class="icon-button" type="button" data-close-archive-digest-person>×</button></div><input type="hidden" name="id" value="${escapeHtml(String(current.id||''))}"><input type="hidden" name="archive_digest_id" value="${entry.id}"><input type="hidden" name="person_id" value="${escapeHtml(String(current.person_id||''))}"><div class="form-grid"><label>Ajouter comme<select name="person_mode"><option value="manual" ${initialMode==='manual'?'selected':''}>Nom relevé seulement</option><option value="existing" ${initialMode==='existing'?'selected':''}>Lier à une personne existante</option><option value="create">Créer une nouvelle personne</option></select></label><label>Page / vue associée<input name="page_number" list="archive-digest-pages-options" value="${escapeHtml(current.page_number||pageNumber||'')}" placeholder="Ex : 42"><datalist id="archive-digest-pages-options">${pageOptions}</datalist></label><label class="span-2" data-archive-person-existing ${initialMode==='existing'?'':'hidden'}>Rechercher la personne existante<input name="person_search" autocomplete="off" placeholder="Tape un prénom ou un nom"><div class="relation-results" data-archive-person-results></div><small data-archive-person-selected>${current.person_id?`Personne liée : ${escapeHtml(current.person_name||'')}`:''}</small></label><label>Prénom<input name="first_name" value="${escapeHtml(current.first_name||'')}"></label><label>Nom<input name="last_name" value="${escapeHtml(current.last_name||'')}"></label><label class="span-2">Adresse complète / n° et rue<input name="address" value="${escapeHtml(current.address||'')}" placeholder="Ex : 12 rue des Vignes, hameau de la Gare…"></label><label>Foyer / groupe<input name="household_key" value="${escapeHtml(current.household_key||'')}" placeholder="Ex : foyer 12"></label><label>Âge / année de naissance<input name="age_text" value="${escapeHtml(current.age_text||'')}" placeholder="42 ans, né en 1841…"></label><label>Lieu de naissance<input name="birth_place" value="${escapeHtml(current.birth_place||'')}"></label><label>Profession<input name="occupation" value="${escapeHtml(current.occupation||'')}"></label><label>Employeur / entreprise<input name="employer" value="${escapeHtml(current.employer||'')}"></label><label>Position dans le foyer<input name="household_position" value="${escapeHtml(current.household_position||'')}" placeholder="chef, épouse, fils…"></label><label>Situation personnelle<input name="personal_status" value="${escapeHtml(current.personal_status||'')}" placeholder="marié, veuve…"></label><label>Nationalité<input name="nationality" value="${escapeHtml(current.nationality||'')}"></label><label class="span-2">Informations supplémentaires<textarea name="extra_info" rows="3" placeholder="Tout détail relevé dans le registre…">${escapeHtml(current.extra_info||'')}</textarea></label><label class="span-2">Note<textarea name="notes" rows="3" placeholder="Hypothèse, rapprochement, à vérifier…">${escapeHtml(current.notes||'')}</textarea></label></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close-archive-digest-person>Annuler</button><button class="button" type="submit">${member?'Enregistrer':'Ajouter la personne'}</button></div></form></dialog>`);
        const dialog=$('#archive-digest-person-dialog'),form=$('#archive-digest-person-form',dialog),mode=form.elements.person_mode,existing=$('[data-archive-person-existing]',form),results=$('[data-archive-person-results]',form),selected=$('[data-archive-person-selected]',form);
        const sync=()=>{existing.hidden=mode.value!=='existing';if(mode.value!=='existing'){form.elements.person_id.value='';selected.textContent='';results.innerHTML='';}};
        mode.addEventListener('change',sync);
        form.elements.person_search.addEventListener('input',debounce(async()=>{const q=form.elements.person_search.value.trim();if(q.length<2){results.innerHTML='';return;}try{const data=await api('people',{q,limit:12});results.innerHTML=(data.people||[]).map(person=>`<button class="relation-result" type="button" data-archive-person-candidate="${person.id}" data-first="${escapeHtml(person.first_name||'')}" data-last="${escapeHtml(person.last_name||'')}" data-name="${escapeHtml(personName(person))}"><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(relationYears(person))}</small></button>`).join('')||'<p>Aucune personne trouvée.</p>';}catch(error){results.innerHTML=`<p>${escapeHtml(error.message||'Recherche indisponible.')}</p>`;}},220));
        results.addEventListener('click',event=>{const button=event.target.closest('[data-archive-person-candidate]');if(!button)return;form.elements.person_id.value=button.dataset.archivePersonCandidate;form.elements.first_name.value=button.dataset.first||'';form.elements.last_name.value=button.dataset.last||'';form.elements.person_search.value=button.dataset.name||'';selected.textContent=`Personne liée : ${button.dataset.name||''}`;results.innerHTML='';});
        $$('[data-close-archive-digest-person]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
        form.addEventListener('submit',async event=>{event.preventDefault();try{await api('save_archive_digest_person',{}, {method:'POST',body:formObject(form)});dialog.close();toast(member?'Personne relevée modifiée.':'Personne relevée ajoutée.');await renderResearch();}catch(error){toast(error.message||'Enregistrement impossible.','error');}});
        dialog.addEventListener('close',()=>dialog.remove());
        dialog.showModal();
    }

    function setupArchiveDigestEntryPlacePicker(form){
        if(!form)return;
        const input=form?.elements.city_name;
        const hidden=form?.elements.place_id;
        const suggestions=form.querySelector('[data-archive-digest-place-suggestions]');
        if(!input||!hidden||!suggestions)return;
        const hide=()=>{suggestions.hidden=true;suggestions.innerHTML='';};
        const search=debounce(async()=>{
            const q=input.value.trim();
            if(q.length<2){hide();return;}
            try{
                const data=await api('place_suggestions',{q,country:''});
                suggestions.innerHTML=(data.places||[]).map(place=>`<button type="button" data-place-id="${place.id}" data-place-name="${escapeHtml(place.name||'')}" data-place-county="${escapeHtml(place.county||'')}" data-place-state="${escapeHtml(place.state||'')}"><strong>${escapeHtml(place.name||'')}</strong><small>${escapeHtml([place.subdivision,place.county,place.state,place.country].filter(Boolean).join(' · '))}</small></button>`).join('');
                suggestions.hidden=!suggestions.innerHTML;
            }catch(_){hide();}
        },220);
        input.addEventListener('input',()=>{hidden.value='0';search();});
        input.addEventListener('focus',()=>{if(suggestions.innerHTML)suggestions.hidden=false;});
        suggestions.addEventListener('click',event=>{
            const button=event.target.closest('button[data-place-id]');
            if(!button)return;
            hidden.value=button.dataset.placeId||'0';
            input.value=button.dataset.placeName||'';
            const dept=form.elements.department,region=form.elements.region;
            if(dept&&!dept.value)dept.value=button.dataset.placeCounty||'';
            if(region&&!region.value)region.value=button.dataset.placeState||'';
            hide();
        });
        document.addEventListener('click',event=>{if(!form.contains(event.target))hide();},{signal:sidebarSignal()});
    }

    function openArchiveDigestMediaDialog(row,pageNumber=''){
        $('#archive-digest-media-dialog')?.remove();
        const savedPages=Array.isArray(row.pages)?row.pages:[];
        const pageNumbers=[...new Set([
            ...savedPages.map(page=>String(page.number||'').trim()),
            ...(row.people||[]).map(person=>String(person.page_number||'').trim()),
            ...(row.media||[]).map(media=>String(media.archive_page_number||'').trim())
        ].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
        const pageOptions=`<option value="">Non rattaché à une page</option>${pageNumbers.map(number=>`<option value="${escapeHtml(number)}" ${String(number)===String(pageNumber||'')?'selected':''}>Page / vue ${escapeHtml(number)}</option>`).join('')}`;
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal small-modal" id="archive-digest-media-dialog"><form id="archive-digest-media-form"><div class="modal-head"><div><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>Ajouter un média</h2><p>${escapeHtml([row.city_name||row.place_name,row.archive_reference].filter(Boolean).join(' · ')||'Registre')}</p></div><button class="icon-button" type="button" data-close-archive-digest-media>×</button></div><div class="form-grid one-column"><label>Page / vue liée<select name="page_number">${pageOptions}</select></label><label>Ajouter<select name="mode"><option value="new">Un nouveau fichier</option><option value="existing">Un média existant</option></select></label><div data-archive-digest-new-media><label>Titre<input name="title" placeholder="Ex : Table décennale 1803-1812, vue 42"></label><label>Fichier(s)<input name="files[]" type="file" multiple accept="image/*,.pdf,audio/*,video/*"></label></div><div data-archive-digest-existing-media hidden><label>Chercher un média existant<input name="media_search" autocomplete="off" placeholder="Titre ou nom du fichier…"></label><input type="hidden" name="media_id"><p class="selected-relation" data-archive-digest-selected-media hidden></p><div class="relation-results" data-archive-digest-media-results></div></div></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close-archive-digest-media>Annuler</button><button class="button" type="submit" data-archive-digest-media-submit>Importer</button></div></form></dialog>`);
        const dialog=$('#archive-digest-media-dialog'),form=$('#archive-digest-media-form',document);
        const mode=form.elements.mode,newMedia=$('[data-archive-digest-new-media]',dialog),existingMedia=$('[data-archive-digest-existing-media]',dialog),results=$('[data-archive-digest-media-results]',dialog),selected=$('[data-archive-digest-selected-media]',dialog),submit=$('[data-archive-digest-media-submit]',dialog);
        const syncMode=()=>{const isExisting=mode.value==='existing';newMedia.hidden=isExisting;existingMedia.hidden=!isExisting;submit.textContent=isExisting?'Ajouter le média':'Importer';};
        mode.addEventListener('change',syncMode);syncMode();
        $$('[data-close-archive-digest-media]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
        form.elements.media_search.addEventListener('input',debounce(async()=>{
            const q=form.elements.media_search.value.trim();
            if(q.length<2){results.innerHTML='';return;}
            try{
                const data=await api('archive_digest_media_search',{q});
                results.innerHTML=(data.rows||[]).map(item=>`<button type="button" class="relation-result" data-archive-digest-existing-media="${item.id}" data-title="${escapeHtml(item.title||item.filename||'Média sans titre')}">${normalizedMediaType(item)==='image'&&item.thumbnail?`<img src="media/${encodeURIComponent(item.thumbnail)}" alt="">`:`<span class="pdf-pill">${mediaTypeShortLabelWithIcon(item)}</span>`}<span><strong>${escapeHtml(item.title||item.filename||'Média sans titre')}</strong><small>${escapeHtml(mediaTypeShortLabel(item))}</small></span></button>`).join('')||'<p>Aucun média trouvé.</p>';
            }catch(error){results.innerHTML=`<p>${escapeHtml(error.message||'Recherche indisponible.')}</p>`;}
        },220));
        results.addEventListener('click',event=>{
            const button=event.target.closest('[data-archive-digest-existing-media]');
            if(!button)return;
            form.elements.media_id.value=button.dataset.archiveDigestExistingMedia;
            selected.hidden=false;
            selected.textContent=`Média choisi : ${button.dataset.title||''}`;
            results.innerHTML='';
        });
        form.addEventListener('submit',async event=>{
            event.preventDefault();
            if(mode.value==='existing'){
                const mediaId=Number(form.elements.media_id.value||0);
                if(!mediaId){toast('Choisis un média existant.','error');return;}
                try{
                    await api('link_archive_digest_media',{}, {method:'POST',body:{archive_digest_id:row.id,media_id:mediaId,page_number:form.elements.page_number.value||''}});
                    dialog.close();toast('Média lié au dépouillement.');await renderResearch();
                }catch(error){toast(error.message||'Ajout impossible.','error');}
                return;
            }
            const files=[...(form.elements['files[]'].files||[])];
            if(!files.length){toast('Choisis au moins un fichier.','error');return;}
            const fd=new FormData(form);
            fd.append('archive_digest_id',String(row.id));
            fd.append('archive_digest_page_number',form.elements.page_number.value||'');
            fd.append('csrf',state.csrf);
            const response=await fetch('upload.php',{method:'POST',body:fd});
            const data=await response.json().catch(()=>({error:'Réponse illisible'}));
            if(!response.ok||data.error){toast(data.error||'Import impossible','error');return;}
            dialog.close();
            toast(`${Number(data.media?.length||0)} média(s) ajouté(s).`);
            await renderResearch();
        });
        dialog.showModal();
    }

    async function renderPlaceNameSearch(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const q=(state.placeNameSearch?.q||state.research.q||'').trim();
        if(!q){$('#workspace').innerHTML=`<section class="empty-state"><span class="eyebrow">RECHERCHE DE LIEU</span><h2>Chercher un nom de lieu incomplet</h2><p>Utilise <strong>*</strong> comme joker : <code>*aris</code>, <code>Sa* Denis</code>, <code>**mont</code>.</p></section>`;return;}
        $('#workspace').innerHTML='<section class="loading-screen"><div class="loading-mark">⌕</div><p>Recherche dans les lieux de la base…</p></section>';
        const data=await api('place_name_search',{q,country:state.placeNameSearch?.country||'',division:state.placeNameSearch?.division||''});
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const rows=data.places||[];
        const table=`<div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr><th><button data-sort-column="0">Lieu</button></th><th><button data-sort-column="1">Subdivision</button></th><th><button data-sort-column="2">Pays</button></th><th><button data-sort-column="3">Coordonnées</button></th><th><button data-sort-column="4">Présence dans la base</button></th></tr></thead><tbody>${rows.map(place=>`<tr><td data-sort-value="${escapeHtml((place.name||'').toLowerCase())}"><strong>${escapeHtml(place.name||'Lieu sans nom')}</strong><small class="cell-muted">${escapeHtml(place.label||'')}</small></td><td data-sort-value="${escapeHtml([place.subdivision,place.county,place.state].filter(Boolean).join(' ').toLowerCase())}">${escapeHtml([place.subdivision,place.county,place.state].filter(Boolean).join(' · ')||'—')}</td><td data-sort-value="${escapeHtml(place.country||'')}">${escapeHtml(place.country||'—')}</td><td data-sort-value="${place.latitude||''}">${place.latitude&&place.longitude?`${Number(place.latitude).toFixed(5)}, ${Number(place.longitude).toFixed(5)}`:'—'}</td><td data-sort-value="${Number(place.event_count||0)+Number(place.census_count||0)}">${Number(place.event_count||0).toLocaleString('fr-FR')} évt · ${Number(place.census_count||0).toLocaleString('fr-FR')} rec.</td></tr>`).join('')}</tbody></table></div>`;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">LIEUX · JOKER</span><h2>${escapeHtml(q)}</h2><p>${rows.length.toLocaleString('fr-FR')} lieu${rows.length>1?'x':''} trouvé${rows.length>1?'s':''}${state.placeNameSearch?.country?` · pays : ${escapeHtml(state.placeNameSearch.country)}`:''}${state.placeNameSearch?.division?` · division : ${escapeHtml(state.placeNameSearch.division)}`:''}.</p></div></header>${rows.length?table:empty('Aucun lieu ne correspond à cette recherche.')}</section>`;
        bindTableLinks();
    }

    // --- Recherche dans le fichier des personnes décédées de l'INSEE (base locale, importée via CSV) ---
    async function renderInseeSearch(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        $('#workspace').innerHTML='<section class="loading-screen"><div class="loading-mark">⌕</div><p>Chargement du module Décès INSEE…</p></section>';
        const stats=await api('insee_stats');
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const is=state.inseeSearch||{};
        const hasCriteria=!!(is.nom||is.prenom||is.sexe||is.dateNaissance||is.dateDeces||is.birthYearFrom||is.birthYearTo||is.deathYearFrom||is.deathYearTo||is.communeNaissance||is.communeDeces||is.departement||is.region);
        let resultsHtml='';
        if(hasCriteria){
            const data=await api('insee_search',{nom:is.nom||'',prenom:is.prenom||'',sexe:is.sexe||'',date_naissance:is.dateNaissance||'',date_deces:is.dateDeces||'',birth_year_from:is.birthYearFrom||'',birth_year_to:is.birthYearTo||'',death_year_from:is.deathYearFrom||'',death_year_to:is.deathYearTo||'',commune_naissance:is.communeNaissance||'',commune_deces:is.communeDeces||'',departement:is.departement||'',region:is.region||'',limit:100,offset:0});
            if(token!==state.workspaceToken||state.module!=='recherche')return;
            resultsHtml=`<section class="page"><header class="page-header"><div><span class="eyebrow">DÉCÈS INSEE</span><h2>${Number(data.total||0).toLocaleString('fr-FR')} résultat${data.total>1?'s':''}</h2><p>${data.rows.length.toLocaleString('fr-FR')} affiché${data.rows.length>1?'s':''}${data.has_more?' · affine ta recherche pour réduire la liste' :''}.</p></div></header>${inseeResultsTableHtml(data.rows)}</section>`;
        }else{
            resultsHtml=`<section class="empty-state"><span class="eyebrow">DÉCÈS INSEE</span><h2>Renseigne au moins un critère</h2><p>Combine prénom, nom, sexe, dates, communes, département ou région pour lancer la recherche dans le fichier des personnes décédées.</p></section>`;
        }
        $('#workspace').innerHTML=`${inseeStatsBarHtml(stats)}${resultsHtml}`;
        bindTableLinks();
        bindInseeStatsBar();
    }

    const INSEE_MONTH_NAMES_FR=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    function inseeMonthYearLabel(rawDate,fallbackYear){
        const digits=(rawDate||'').replace(/\D/g,'');
        if(digits.length>=6){
            const y=digits.slice(0,4),m=parseInt(digits.slice(4,6),10);
            if(m>=1&&m<=12)return `${INSEE_MONTH_NAMES_FR[m-1]} ${y}`;
        }
        return fallbackYear?String(fallbackYear):'';
    }
    function inseeStatsBarHtml(stats){
        const count=Number(stats.count||0);
        const lastImport=stats.last_import;
        const maxYear=stats.max_annee_deces;
        const minYear=stats.min_annee_deces;
        let upToDate='Aucune donnée importée pour le moment.';
        if(count>0){
            if(minYear&&maxYear){
                const minLabel=inseeMonthYearLabel(stats.min_date_deces,minYear);
                const maxLabel=inseeMonthYearLabel(stats.max_date_deces,maxYear);
                upToDate=minYear===maxYear?`Données couvrant ${maxLabel||maxYear}.`:`Données couvrant les décès de ${minLabel||minYear} à ${maxLabel||maxYear}.`;
            }else if(maxYear){
                upToDate=`Données à jour jusqu'en ${maxYear}.`;
            }else{
                upToDate='Année de décès la plus récente inconnue.';
            }
            if(lastImport&&lastImport.imported_at){
                const parsed=new Date(String(lastImport.imported_at).replace(' ','T'));
                const dateLabel=isNaN(parsed.getTime())?lastImport.imported_at:parsed.toLocaleDateString('fr-FR');
                upToDate+=` Dernier import : « ${escapeHtml(lastImport.filename||'fichier')} » le ${escapeHtml(dateLabel)}.`;
            }
        }
        const viewImportsButton=(stats.imports_count>0)?`<button type="button" class="button small secondary" id="insee-view-imports">Voir les imports</button>`:'';
        const importButton=`<button type="button" class="button small" id="insee-open-remote">Fichiers de l’INSEE${state.inseeRemote?.new_count?` <span class="h-new-badge">${state.inseeRemote.new_count} nouveau${state.inseeRemote.new_count>1?'x':''}</span>`:''}</button><button type="button" class="button small secondary" id="insee-open-import">Importer un fichier</button>`;
        return `<section class="page" style="padding-bottom:.5rem"><header class="page-header"><div><span class="eyebrow">DÉCÈS INSEE · BASE LOCALE</span><h2>${count.toLocaleString('fr-FR')} personne${count>1?'s':''} dans la base</h2><p>${upToDate}</p></div><div class="page-actions">${importButton}${viewImportsButton}</div></header></section>`;
    }

    function inseeImportPanelHtml(){
        return `<p>Sélectionne un ou plusieurs fichiers du fichier des personnes décédées (CSV, TXT ou ZIP contenant un CSV/TXT). Chaque fichier vient s'ajouter à la base existante, rien n'est écrasé. Un même fichier déjà importé est détecté et une confirmation te sera demandée avant de le réimporter.</p><form id="insee-import-form" class="sidebar-form"><label>Fichier(s) INSEE<input type="file" name="files" accept=".csv,.txt,.zip,text/csv,text/plain,application/zip,application/x-zip-compressed" multiple></label><button class="button" type="submit">Importer</button></form><div id="insee-import-result" class="muted" style="margin-top:.6rem"></div>`;
    }

    // Fenêtre d'import : sélection d'un ou plusieurs fichiers CSV, ouverte depuis le bouton
    // « Importer » du bandeau. Les imports multiples sont traités les uns après les autres
    // (voir bindInseeImportPanel), avec un message de progression par fichier.
    function openInseeImportDialog(){
        let dialog=$('#insee-import-dialog');
        if(!dialog){
            document.body.insertAdjacentHTML('beforeend',`<dialog class="modal insee-import-modal" id="insee-import-dialog"><div class="modal-head"><div><span class="eyebrow">DÉCÈS INSEE</span><h2>Importer des fichiers CSV</h2></div><button class="modal-close" data-close-insee-import aria-label="Fermer">×</button></div><div class="modal-body" id="insee-import-body"></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" data-close-insee-import>Fermer</button></div></dialog>`);
            dialog=$('#insee-import-dialog');
            $$('[data-close-insee-import]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
            dialog.addEventListener('close',()=>{renderInseeSearch();});
        }
        $('#insee-import-body').innerHTML=inseeImportPanelHtml();
        bindInseeImportPanel();
        dialog.showModal();
    }

    function inseeResultsTableHtml(rows){
        if(!rows.length)return empty('Aucune personne ne correspond à ces critères.');
        return `<div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr><th><button data-sort-column="0">Nom</button></th><th><button data-sort-column="1">Prénom(s)</button></th><th><button data-sort-column="2">Sexe</button></th><th><button data-sort-column="3">Naissance</button></th><th><button data-sort-column="4">Décès</button></th></tr></thead><tbody>${rows.map(r=>`<tr><td data-sort-value="${escapeHtml((r.nom||'').toLowerCase())}"><strong>${escapeHtml(r.nom||'—')}</strong></td><td data-sort-value="${escapeHtml((r.prenoms||r.prenom||'').toLowerCase())}">${escapeHtml(r.prenoms||r.prenom||'—')}</td><td data-sort-value="${escapeHtml(r.sexe||'')}">${r.sexe==='M'?'Homme':r.sexe==='F'?'Femme':'—'}</td><td data-sort-value="${r.annee_naissance||9999}">${formatInseeDate(r.date_naissance)}${r.commune_naissance?` · ${escapeHtml(r.commune_naissance)}`:''}</td><td data-sort-value="${r.annee_deces||9999}">${formatInseeDate(r.date_deces)}${r.commune_deces?` · ${escapeHtml(r.commune_deces)}`:''}</td></tr>`).join('')}</tbody></table></div>`;
    }

    function formatInseeDate(raw){
        const digits=(raw||'').replace(/\D/g,'');
        if(digits.length<8)return raw?escapeHtml(raw):'—';
        const y=digits.slice(0,4),m=digits.slice(4,6),d=digits.slice(6,8);
        if(y==='0000')return '—';
        return `${d!=='00'?d:'??'}/${m!=='00'?m:'??'}/${y}`;
    }

    function bindInseeImportPanel(){
        const form=$('#insee-import-form');
        if(!form)return;
        form.addEventListener('submit',async event=>{
            event.preventDefault();
            const files=[...(form.elements.files.files||[])];
            if(!files.length){toast('Sélectionne au moins un fichier INSEE.','error');return;}
            const result=$('#insee-import-result');
            let totalInserted=0;
            for(const [index,file] of files.entries()){
                result.textContent=`Import de « ${file.name} » (${index+1}/${files.length})…`;
                try{
                    const data=await importUpload('insee_import',file);
                    totalInserted+=Number(data.inserted||0);
                    result.textContent=`« ${file.name} » : ${Number(data.inserted||0).toLocaleString('fr-FR')} ligne(s) importée(s).`;
                }catch(error){
                    if(error?.data?.duplicate){
                        const existing=error.data.existing_import||{};
                        const confirmMsg=`« ${file.name} » semble déjà avoir été importé (fichier « ${existing.filename||'?'} » le ${existing.imported_at||'?'}, ${Number(existing.inserted_count||0).toLocaleString('fr-FR')} ligne(s)). Importer quand même ?`;
                        if(confirm(confirmMsg)){
                            try{
                                const retryData=await importUpload('insee_import',file,{force:'1'});
                                totalInserted+=Number(retryData.inserted||0);
                                result.textContent=`« ${file.name} » : ${Number(retryData.inserted||0).toLocaleString('fr-FR')} ligne(s) importée(s) (doublon confirmé).`;
                            }catch(error2){
                                toast(`Import de « ${file.name} » impossible : ${error2.message}`,'error');
                            }
                        }else{
                            toast(`Import de « ${file.name} » annulé (déjà importé).`,'error');
                        }
                        continue;
                    }
                    toast(`Import de « ${file.name} » impossible : ${error.message}`,'error');
                }
            }
            toast(`${totalInserted.toLocaleString('fr-FR')} personne(s) importée(s) au total.`);
            await renderInseeSearch();
        });
    }

    function bindInseeStatsBar(){
        $('#insee-view-imports')?.addEventListener('click',()=>openInseeImportsDialog());
        $('#insee-open-import')?.addEventListener('click',()=>openInseeImportDialog());
        $('#insee-open-remote')?.addEventListener('click',()=>openInseeRemoteDialog());
    }
    async function openInseeRemoteDialog(){
        let dialog=$('#insee-remote-dialog');
        if(!dialog){
            document.body.insertAdjacentHTML('beforeend',`<dialog class="modal insee-imports-modal" id="insee-remote-dialog"><div class="modal-head"><div><span class="eyebrow">DÉCÈS INSEE · DATA.GOUV.FR</span><h2>Fichiers publiés par l’INSEE</h2></div><button class="modal-close" data-close-insee-remote aria-label="Fermer">×</button></div><div class="modal-body" id="insee-remote-body"></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" data-close-insee-remote>Fermer</button></div></dialog>`);
            dialog=$('#insee-remote-dialog');
            $$('[data-close-insee-remote]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
            dialog.addEventListener('close',()=>{if(state.module==='recherche'&&state.researchKind==='insee')renderInseeSearch();});
        }
        const body=$('#insee-remote-body');
        if(!dialog.open)dialog.showModal();
        body.innerHTML='<div class="loading-block">Lecture de la liste sur data.gouv.fr…</div>';
        let data;
        try{data=state.inseeRemote=await api('insee_remote_files');try{localStorage.setItem('lcnda-insee-checked',new Date().toISOString().slice(0,10));}catch(_){}}
        catch(error){body.innerHTML=`<p class="h-offsite-sentence is-warn">${escapeHtml(error.message)}</p>`;return;}
        const files=data.files||[],todo=files.filter(f=>f.new);
        const status=f=>f.imported?`<span class="collection-kind">importé${f.imported_at?` le ${escapeHtml(new Date(String(f.imported_at).replace(' ','T')).toLocaleDateString('fr-FR'))}`:''}</span>`:f.superseded?'<span class="muted">compris dans le fichier de l’année</span>':f.new?'<span class="h-new-badge">nouveau</span>':'<span class="muted">pas importé</span>';
        body.innerHTML=`<p>L’INSEE publie un fichier par année (depuis 1970), puis un par mois pour l’année en cours. Quand le fichier de l’année sort, il remplace ceux des mois : l’app retire alors les mois déjà importés pour éviter les doublons. Les fichiers sont gros (60 à 150 Mo par année) : l’import peut prendre quelques minutes.</p>
            <div class="page-actions">${todo.length?`<button type="button" class="button" data-insee-remote-new>Importer les nouveaux (${todo.length})</button>`:'<span class="muted">Pas de nouveau fichier depuis ton dernier import.</span>'}</div>
            <label class="checkbox-line"><input type="checkbox" data-insee-auto ${inseeAuto()?'checked':''}> Vérifier chaque jour à l’ouverture de l’app et importer tout seul les nouveaux fichiers</label>
            <p id="insee-remote-progress" class="muted" aria-live="polite"></p>
            <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Période</th><th>Fichier</th><th>Publié le</th><th>État</th><th></th></tr></thead><tbody>${files.map((f,i)=>`<tr class="${f.new?'is-new':''}"><td><strong>${escapeHtml(f.label)}</strong></td><td><small>${escapeHtml(f.name)}${f.size?` · ${inseeSize(f.size)}`:''}</small></td><td>${escapeHtml(f.published?new Date(f.published).toLocaleDateString('fr-FR'):'')}</td><td>${status(f)}</td><td>${f.imported||f.superseded?'':`<button type="button" class="button small secondary" data-insee-remote-one="${i}">Télécharger et importer</button>`}</td></tr>`).join('')}</tbody></table></div>
            <p class="muted">Source : <a href="${escapeHtml(safeUrl(data.source))}" target="_blank" rel="noopener noreferrer">Fichier des personnes décédées, INSEE, sur data.gouv.fr ↗</a></p>`;
        const progress=$('#insee-remote-progress',body);
        const run=async list=>{
            $$('button',body).forEach(b=>{if(b.dataset.inseeRemoteOne!==undefined||b.dataset.inseeRemoteNew!==undefined)b.disabled=true;});
            const n=await inseeImportRemote(list,text=>{progress.textContent=text;});
            toast(`${n.toLocaleString('fr-FR')} décès importé${n>1?'s':''}.`);
            if(dialog.open)openInseeRemoteDialog();
        };
        $('[data-insee-remote-new]',body)?.addEventListener('click',()=>run(todo));
        $$('[data-insee-remote-one]',body).forEach(b=>b.addEventListener('click',()=>run([files[Number(b.dataset.inseeRemoteOne)]])));
        $('[data-insee-auto]',body).addEventListener('change',e=>{try{localStorage.setItem('genealogie-insee-auto',e.target.checked?'1':'0');}catch(_){}toast(e.target.checked?'Les nouveaux fichiers seront importés tout seuls.':'Import automatique arrêté : l’app te préviendra seulement.');});
    }

    // Fenêtre listant précisément chaque fichier déjà importé (nom, date, lignes lues/insérées,
    // plage d'années couverte), pour que l'utilisateur sache exactement ce qui a été chargé.
    async function openInseeImportsDialog(){
        let dialog=$('#insee-imports-dialog');
        if(!dialog){
            document.body.insertAdjacentHTML('beforeend',`<dialog class="modal insee-imports-modal" id="insee-imports-dialog"><div class="modal-head"><div><span class="eyebrow">DÉCÈS INSEE</span><h2>Fichiers déjà importés</h2></div><button class="modal-close" data-close-insee-imports aria-label="Fermer">×</button></div><div class="modal-body" id="insee-imports-body"></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" data-close-insee-imports>Fermer</button></div></dialog>`);
            dialog=$('#insee-imports-dialog');
            $$('[data-close-insee-imports]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
        }
        const body=$('#insee-imports-body');
        body.innerHTML='<div class="loading-block">Chargement des imports…</div>';
        if(!dialog.open)dialog.showModal();
        try{
            const data=await api('insee_imports_list');
            const rows=data.imports||[];
            const recordsCount=Number(data.records_count||0);
            body.innerHTML=rows.length?`<div class="insee-imports-toolbar"><span>${rows.length.toLocaleString('fr-FR')} fichier(s) · ${recordsCount.toLocaleString('fr-FR')} fiche(s) décès</span><button type="button" class="button small danger-soft" id="delete-all-insee-imports">Tout supprimer</button></div><div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr><th><button data-sort-column="0">Fichier</button></th><th><button data-sort-column="1">Importé le</button></th><th><button data-sort-column="2">Lignes lues</button></th><th><button data-sort-column="3">Insérées</button></th><th><button data-sort-column="4">Années couvertes</button></th><th></th></tr></thead><tbody>${rows.map(row=>{
                const parsed=new Date(String(row.imported_at||'').replace(' ','T'));
                const dateLabel=isNaN(parsed.getTime())?(row.imported_at||'—'):parsed.toLocaleString('fr-FR');
                const minY=row.min_annee_deces,maxY=row.max_annee_deces;
                const years=minY&&maxY?(minY===maxY?String(maxY):`${minY} – ${maxY}`):(maxY||minY||'—');
                return `<tr><td data-sort-value="${escapeHtml((row.filename||'').toLowerCase())}"><strong>${escapeHtml(row.filename||'—')}</strong></td><td data-sort-value="${escapeHtml(String(row.imported_at||''))}">${escapeHtml(dateLabel)}</td><td data-sort-value="${Number(row.row_count||0)}">${Number(row.row_count||0).toLocaleString('fr-FR')}</td><td data-sort-value="${Number(row.inserted_count||0)}">${Number(row.inserted_count||0).toLocaleString('fr-FR')}</td><td data-sort-value="${Number(minY||0)}">${escapeHtml(String(years))}</td><td><button type="button" class="button small danger-soft" data-delete-insee-import="${row.id}">Supprimer</button></td></tr>`;
            }).join('')}</tbody></table></div>`:empty('Aucun import enregistré pour le moment.');
            bindTableLinks();
            $('#delete-all-insee-imports',body)?.addEventListener('click',async()=>{
                const button=$('#delete-all-insee-imports',body);
                if(!confirm(`Supprimer les ${rows.length.toLocaleString('fr-FR')} fichier(s) importé(s) et les ${recordsCount.toLocaleString('fr-FR')} fiche(s) de l’index Décès INSEE ?\n\nCette action ne supprime aucune personne de ta généalogie, mais elle est irréversible.`))return;
                try{
                    button.disabled=true;
                    let removed=0,completed=false;
                    while(!completed){
                        button.textContent=`Suppression… ${removed.toLocaleString('fr-FR')}`;
                        const result=await api('delete_all_insee_imports',{},{method:'POST',body:{chunk_size:5000}});
                        const payload=result.result||result;
                        removed+=Number(payload.deleted_rows||0);
                        completed=Boolean(payload.completed);
                    }
                    toast(`${removed.toLocaleString('fr-FR')} fiche(s) décès et tous les imports INSEE ont été supprimés.`);
                    await openInseeImportsDialog();
                }catch(error){
                    button.disabled=false;
                    button.textContent='Tout supprimer';
                    toast(error.message,'error');
                }
            });
            $$('[data-delete-insee-import]',body).forEach(button=>button.addEventListener('click',async()=>{
                const filename=button.closest('tr')?.querySelector('strong')?.textContent||'ce fichier';
                if(!confirm(`Supprimer l'import « ${filename} » ? Toutes les fiches décès venant de ce fichier seront retirées de la base.`))return;
                try{
                    button.disabled=true;
                    let removed=0, completed=false;
                    while(!completed){
                        button.textContent=`Suppression… ${removed.toLocaleString('fr-FR')}`;
                        const result=await api('delete_insee_import',{},{method:'POST',body:{id:button.dataset.deleteInseeImport,chunk_size:2000}});
                        const payload=result.result||result;
                        removed+=Number(payload.deleted_rows||0);
                        completed=Boolean(payload.completed);
                    }
                    toast(`Import supprimé (${removed.toLocaleString('fr-FR')} fiche(s) retirée(s)).`);
                    await openInseeImportsDialog();
                }catch(error){
                    button.disabled=false;
                    button.textContent='Supprimer';
                    toast(error.message,'error');
                }
            }));
        }catch(error){
            body.innerHTML=`<p class="muted" style="color:var(--red)">${escapeHtml(error.message)}</p>`;
        }
    }

    async function renderTranscriptionSearch(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const q=(state.transcriptionSearch.q||state.research.q||'').trim();
        if(!q){$('#workspace').innerHTML=`<section class="empty-state"><span class="eyebrow">RECHERCHE DANS LES TRANSCRIPTIONS</span><h2>Chercher dans les transcriptions</h2><p>Entre un mot ou une expression pour retrouver les médias dont la transcription contient ce texte.</p></section>`;return;}
        $('#workspace').innerHTML='<section class="loading-screen"><div class="loading-mark">⌕</div><p>Recherche dans les transcriptions…</p></section>';
        const data=await api('transcription_search',{q});
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const rows=data.media||[];
        state.currentListRows=rows;
        const results=state.researchDisplay==='list'?transcriptionSearchTableHtml(rows):`<div class="date-results">${rows.length?rows.map(transcriptionSearchCardHtml).join(''):empty('Aucune transcription ne contient ce texte.')}</div>`;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">TRANSCRIPTIONS · OCR, HTR ET SAISIE MANUELLE</span><h2>« ${escapeHtml(q)} »</h2><p>${rows.length.toLocaleString('fr-FR')} média${rows.length>1?'s':''} trouvé${rows.length>1?'s':''}. Un clic ouvre le média et sa transcription.</p></div></header>${results}</section>`;
        bindTableLinks();
    }

    function transcriptionSearchTitle(media){return media.title||media.document_title||media.attachment_label||media.filename||`Média #${media.id}`;}
    function transcriptionSearchPeople(media){return (media.people_links||[]).map(person=>`<button class="table-link" data-open-person="${person.id}">${escapeHtml(person.name||'Personne sans nom')}</button>`).join(', ')||'<span class="cell-muted">N/A</span>';}
    function transcriptionSearchTableHtml(rows){
        if(!rows.length)return empty('Aucune transcription ne contient ce texte.');
        return `<div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr><th><button data-sort-column="0">Média</button></th><th><button data-sort-column="1">Date</button></th><th><button data-sort-column="2">Rattaché à</button></th><th><button data-sort-column="3">Extrait</button></th></tr></thead><tbody>${rows.map(media=>`<tr><td data-sort-value="${escapeHtml(transcriptionSearchTitle(media).toLowerCase())}"><button class="table-link" data-open-media="${media.id}">${escapeHtml(transcriptionSearchTitle(media))}</button><small class="cell-muted">${escapeHtml(media.filename||'')}</small></td><td data-sort-value="${escapeHtml(media.date_text||'')}">${escapeHtml(media.date_text||'—')}</td><td data-sort-value="${escapeHtml(media.attachment_label||'')}">${escapeHtml(media.attachment_label||'Non rattaché')}<div>${transcriptionSearchPeople(media)}</div></td><td data-sort-value="${escapeHtml(media.excerpt||'')}">${escapeHtml(media.excerpt||'—')}</td></tr>`).join('')}</tbody></table></div>`;
    }
    function transcriptionSearchCardHtml(media){
        const title=transcriptionSearchTitle(media);
        return `<article class="date-result research-person-card"><div class="person-card-initial">TXT</div><div><button class="table-link person-card-name" data-open-media="${media.id}">${escapeHtml(title)}</button><p>${escapeHtml([media.date_text,media.attachment_label].filter(Boolean).join(' · ')||'Média')}</p><div class="research-matches"><span class="research-match event"><strong>Extrait</strong><small>${escapeHtml(media.excerpt||'—')}</small></span></div></div></article>`;
    }

    async function renderDateSearch(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const hasDate=state.dateSearch.mode==='exact'?state.dateSearch.values.trim():(state.dateSearch.yearFrom||state.dateSearch.yearTo);
        if(!hasDate){$('#workspace').innerHTML=`<section class="empty-state"><span class="eyebrow">RECHERCHE PAR DATES</span><h2>Choisis une période</h2><p>Renseigne une année de début et une année de fin, ou sélectionne « Date(s) précise(s) ».</p></section>`;return;}
        $('#workspace').innerHTML='<section class="loading-screen"><div class="loading-mark">31</div><p>Recherche des événements…</p></section>';
        const data=await api('date_search',{mode:state.dateSearch.mode,year_from:state.dateSearch.yearFrom,year_to:state.dateSearch.yearTo,values:state.dateSearch.values,date_window_mode:state.dateSearch.dateWindowMode||'exact',date_window_days:state.dateSearch.dateWindowDays||'',event_type_id:state.dateSearch.eventTypeId,occupation:state.dateSearch.occupationId||'',place_id:state.dateSearch.placeId||0,q:state.research.q});
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const sortDir=state.dateSearch.sortDir==='desc'?'desc':'asc';
        const eventSortValue=event=>{const y=Number(event.year);return Number.isFinite(y)?y:(sortDir==='asc'?9999999:-9999999);};
        const events=[...data.events].sort((a,b)=>sortDir==='asc'?eventSortValue(a)-eventSortValue(b):eventSortValue(b)-eventSortValue(a));
        const selectedType=state.dateSearch.eventTypeId?state.bootstrap.eventTypes.find(type=>Number(type.id)===Number(state.dateSearch.eventTypeId))?.label:'Tous les événements';
        const title=state.dateSearch.mode==='range'?`${data.yearFrom} — ${data.yearTo}`:(data.windowLabel||state.dateSearch.values.replace(/\n+/g,' · '));
        const results=state.researchDisplay==='list'?dateTableHtml(events):`<div class="date-results">${events.length?events.map(dateEventHtml).join(''):empty('Aucun événement ne correspond à cette sélection.')}</div>`;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">DATES · ${escapeHtml(selectedType||'Tous les événements')}</span><h2>${escapeHtml(title)}</h2><p style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">${events.length.toLocaleString('fr-FR')} événement${events.length>1?'s':''} correspondant${events.length>1?'s':''}.<button type="button" class="icon-button" id="date-sort-toggle" title="${sortDir==='asc'?'Chronologique (du plus ancien au plus récent)':'Anti-chronologique (du plus récent au plus ancien)'}" aria-label="${sortDir==='asc'?'Trier par ordre anti-chronologique':'Trier par ordre chronologique'}" style="font-size:15px">${sortDir==='asc'?'↑':'↓'}</button></p></div></header>${results}</section>`;bindTableLinks();
        $('#date-sort-toggle').addEventListener('click',()=>{state.dateSearch.sortDir=sortDir==='asc'?'desc':'asc';persistUiState();renderDateSearch();});
    }

    function dateTableHtml(events){if(!events.length)return empty('Aucun événement ne correspond à cette sélection.');return `<div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr><th><button data-sort-column="0">Personne</button></th><th><button data-sort-column="1">Événement</button></th><th><button data-sort-column="2">Date</button></th><th><button data-sort-column="3">Lieu</button></th></tr></thead><tbody>${events.map(event=>{const people=(event.participants||[]).map(person=>`<button class="table-link" data-open-person="${person.id}">${escapeHtml(person.name)}</button>`).join(' + ')||'—',place=placeDisplay(event);return `<tr><td data-sort-value="${escapeHtml((event.participants?.[0]?.name||'').toLowerCase())}">${people}</td><td data-sort-value="${escapeHtml(event.type.toLowerCase())}">${escapeHtml(event.type)}</td><td data-sort-value="${event.year||9999}">${escapeHtml(event.date_text||event.year||'—')}</td><td data-sort-value="${escapeHtml(place.toLowerCase())}">${escapeHtml(place||'—')}</td></tr>`;}).join('')}</tbody></table></div>`;}

    function dateEventHtml(event){
        const people=(event.participants||[]).map(person=>`<button class="table-link" data-open-person="${person.id}">${escapeHtml(person.name||'Personne sans nom')}</button>`).join('<span class="date-person-separator"> + </span>')||'<span>Personne non rattachée</span>';
        const place=placeDisplay(event);
        return `<article class="date-result"><span class="event-icon" style="--event-color:${escapeHtml(event.color||'#0066cc')}">${typeGlyph(event.icon,event.gedcom_tag)}</span><div><span class="eyebrow">${escapeHtml(event.date_text||event.year||'Date inconnue')}</span><h3>${escapeHtml(event.type)}</h3><div class="date-people">${people}</div>${place?`<p>${escapeHtml(place)}</p>`:''}</div></article>`;
    }

    // --- Recherche par proximité géographique et temporelle : « qui d'autre était dans cette commune à cette date ? » ---
    async function renderProximitySearch(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const ps=state.proximitySearch;
        const exactMode=(ps.dateMode||'range')==='exact';
        if(!ps.placeId||(exactMode?!ps.exactDate:(!ps.yearFrom&&!ps.yearTo))){$('#workspace').innerHTML=`<section class="empty-state"><span class="eyebrow">PROXIMITÉ GÉOGRAPHIQUE ET TEMPORELLE</span><h2>Choisis une commune et une date</h2><p>Sélectionne une commune puis une période ou une date précise pour repérer qui d’autre y apparaît : voisins, témoins récurrents…</p></section>`;return;}
        const radiusKm=Number(ps.radiusKm)||0;
        $('#workspace').innerHTML=`<section class="loading-screen"><div class="loading-mark">⌕</div><p>Recherche des personnes présentes dans cette commune${radiusKm>0?` et dans un rayon de ${radiusKm} km autour`:''} sur cette ${exactMode?'date':'période'}…</p></section>`;
        const data=await api('proximity_search',{place_id:ps.placeId,date_mode:ps.dateMode||'range',year_from:ps.yearFrom,year_to:ps.yearTo,exact_date:ps.exactDate||'',date_window_mode:ps.dateWindowMode||'exact',date_window_days:ps.dateWindowDays||'',radius_km:radiusKm});
        if(token!==state.workspaceToken||state.module!=='recherche')return;
        const radiusNote=data.radiusKm>0?` · rayon ${data.radiusKm} km${data.geocoded===false?' (commune non géolocalisée, résultat limité à la commune exacte)':''}${(data.nearbyPlaces||[]).length?` · ${data.nearbyPlaces.length} commune(s) voisine(s) incluse(s)`:''}`:'';
        const dateLabel=data.dateLabel||`${data.yearFrom} — ${data.yearTo}`;
        const title=`${escapeHtml(data.placeName||ps.placeName)} · ${escapeHtml(dateLabel)}${escapeHtml(radiusNote)}`;
        const people=data.people||[];
        const results=people.length?`<div class="date-results">${people.map(p=>proximityPersonCard(p,radiusKm>0)).join('')}</div>`:empty('Aucune autre personne trouvée dans cette commune sur cette période.');
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">PROXIMITÉ · qui d’autre était là ?</span><h2>${title}</h2><p>${people.length.toLocaleString('fr-FR')} personne${people.length>1?'s':''} repérée${people.length>1?'s':''}, classée${people.length>1?'s':''} par nombre d’occurrences.</p></div></header>${results}</section>`;bindTableLinks();
    }

    function proximityPersonCard(person,includesNearby=false){
        const roleLabel={principal:'Événement',famille:'Conjoint / famille',temoin:'Témoin'};
        const events=(person.events||[]).slice(0,8).map(ev=>`<span class="research-match ${ev.role==='temoin'?'event':'identity'}"><strong>${escapeHtml(roleLabel[ev.role]||'Événement')} — ${escapeHtml(ev.type||'')}</strong><small>${escapeHtml([ev.date_text||ev.year,ev.place].filter(Boolean).join(' — '))}</small></span>`).join('');
        const more=(person.events||[]).length>8?`<small class="cell-muted">+ ${person.events.length-8} autre(s)</small>`:'';
        return `<article class="date-result research-person-card"><div class="person-card-initial">${escapeHtml((person.name||'').trim().split(/\s+/).map(part=>part[0]||'').join('').slice(0,2).toUpperCase())}</div><div><button class="table-link person-card-name" data-open-person="${person.id}">${escapeHtml(person.name||'Personne sans nom')}</button><p>${person.count} occurrence${person.count>1?'s':''} dans ${includesNearby?'cette zone':'cette commune'} sur cette période</p><div class="research-matches">${events}${more}</div></div></article>`;
    }

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderResearch, renderResearchSidebar});
    if (state.module === 'recherche') renderSidebar(); // la colonne de gauche attendait ce fichier
})();
