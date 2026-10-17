/* LCNDA — ⚖️ Comparaison (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Comparer deux personnes, ou deux images (signatures, photos) avec zoom et superposition.
 */
(() => {
    'use strict';
    const {$, $$, api, card, dataRow, debounce, empty, escapeHtml, fetchMediaCompareInfo, genderText, mediaCompareLinkInfo, mediaCompareThumb, normalizedMediaType, persistUiState, personName, placeDisplay, renderSidebar, setModule, sidebarSignal, state, years} = window.LCNDA_APP;
    function renderComparisonSidebar(content,footer){
        const modeToggle=`<div class="segmented comparison-mode-toggle"><button class="${state.comparisonMode!=='images'?'is-active ':''}comparison-mode-btn" data-comparison-mode="personnes">Personnes</button><button class="${state.comparisonMode==='images'?'is-active ':''}comparison-mode-btn" data-comparison-mode="images">Images</button></div>`;
        if(state.comparisonMode==='images'){
            content.innerHTML=`${modeToggle}<div class="search-box"><label for="comparison-image-search">Chercher un média, une personne, une cote…</label><div class="search-row"><input id="comparison-image-search" value="${escapeHtml(state.imageCompare.query)}" placeholder="Chercher un média, une personne, une cote…" autocomplete="off"></div><div class="media-compare-scope" id="comparison-image-scope"><button type="button" class="media-compare-scope-btn ${!state.imageCompare.scope?'is-active':''}" data-scope="">Tous</button><button type="button" class="media-compare-scope-btn ${state.imageCompare.scope==='person'?'is-active':''}" data-scope="person">Personne</button><button type="button" class="media-compare-scope-btn ${state.imageCompare.scope==='origin'?'is-active':''}" data-scope="origin">Enquête / battue</button><button type="button" class="media-compare-scope-btn ${state.imageCompare.scope==='name'?'is-active':''}" data-scope="name">Nom</button><button type="button" class="media-compare-scope-btn ${state.imageCompare.scope==='cote'?'is-active':''}" data-scope="cote">Côte</button></div><div id="comparison-image-suggestions" class="person-suggestions"></div></div><div id="comparison-image-results" class="person-list">${state.imageCompare.query.trim().length>=2?'':'<p>Saisis au moins deux caractères.</p>'}</div>`;
            footer.innerHTML=`<button class="button small secondary" id="clear-image-comparison">Réinitialiser</button>`;
            const search=$('#comparison-image-search'),resultsBox=$('#comparison-image-results'),scopeBar=$('#comparison-image-scope'),suggestionsBox=$('#comparison-image-suggestions');
            const renderImgResults=()=>{
                const rows=state.imageCompare.results||[];
                resultsBox.innerHTML=rows.length?rows.map(item=>`<article class="saved-item media-compare-result-row"><span>${mediaCompareThumb(item)}<span class="media-compare-info"><strong>${escapeHtml(item.title||item.attachment_label||item.filename)}</strong><small>${escapeHtml([item.date_text,item.document_reference,item.attachment_label].filter(Boolean).join(' · ')||'Même contexte')}</small></span></span><span class="saved-actions"><button type="button" data-image-side="left" data-image-pick="${item.id}">A</button><button type="button" data-image-side="right" data-image-pick="${item.id}">B</button></span></article>`).join(''):'<p>Aucun média trouvé.</p>';
            };
            const renderPersonSuggestions=()=>{
                if(state.imageCompare.scope!=='person'||!suggestionsBox)return;
                if(state.imageCompare.personId){
                    suggestionsBox.innerHTML=`<span class="person-suggestion-locked">Personne choisie : <strong>${escapeHtml(state.imageCompare.personName)}</strong> <button type="button" data-person-suggest-clear="1">changer</button></span>`;
                    return;
                }
                const list=state.imageCompare.personSuggestions||[];
                suggestionsBox.innerHTML=list.length?`<span class="person-suggestion-label">Suggestions :</span>${list.map(p=>`<button type="button" class="person-suggestion-chip" data-person-suggest="${p.id}" data-person-suggest-name="${escapeHtml(personName(p))}">${escapeHtml(personName(p))}${years(p)?` <small>${escapeHtml(years(p))}</small>`:''}</button>`).join('')}`:'';
            };
            const runImgSearch=debounce(async()=>{
                state.imageCompare.query=search.value;persistUiState();
                const q=search.value.trim();
                if(q.length<2){state.imageCompare.results=[];state.imageCompare.personSuggestions=[];resultsBox.innerHTML='<p>Saisis au moins deux caractères.</p>';renderPersonSuggestions();return;}
                if(state.imageCompare.scope==='person'&&!state.imageCompare.personId){
                    api('people',{q,limit:8}).then(peopleData=>{
                        state.imageCompare.personSuggestions=peopleData.people||[];
                        renderPersonSuggestions();
                    }).catch(()=>{});
                }else{
                    suggestionsBox.innerHTML='';
                }
                const params={type:'media',q,limit:40,scope:state.imageCompare.scope};
                if(state.imageCompare.scope==='person'&&state.imageCompare.personId)params.person_id=state.imageCompare.personId;
                const data=await api('list',params);
                state.imageCompare.results=data.rows||[];
                renderImgResults();
            },260);
            search.addEventListener('input',()=>{if(state.imageCompare.personId){state.imageCompare.personId=0;state.imageCompare.personName='';}runImgSearch();},{signal:sidebarSignal()});
            scopeBar.addEventListener('click',event=>{const btn=event.target.closest('[data-scope]');if(!btn)return;state.imageCompare.scope=btn.dataset.scope;state.imageCompare.personId=0;state.imageCompare.personName='';state.imageCompare.personSuggestions=[];$$('.media-compare-scope-btn',scopeBar).forEach(b=>b.classList.toggle('is-active',b===btn));renderPersonSuggestions();runImgSearch();},{signal:sidebarSignal()});
            renderPersonSuggestions();
            content.addEventListener('click',async event=>{
                const modeBtn=event.target.closest('[data-comparison-mode]');
                if(modeBtn){state.comparisonMode=modeBtn.dataset.comparisonMode;persistUiState();renderSidebar();await renderComparison();return;}
                const suggestBtn=event.target.closest('[data-person-suggest]');
                if(suggestBtn){
                    state.imageCompare.personId=Number(suggestBtn.dataset.personSuggest);
                    state.imageCompare.personName=suggestBtn.dataset.personSuggestName||'';
                    search.value=state.imageCompare.personName;
                    state.imageCompare.query=state.imageCompare.personName;
                    persistUiState();
                    renderPersonSuggestions();
                    runImgSearch();
                    return;
                }
                const suggestClearBtn=event.target.closest('[data-person-suggest-clear]');
                if(suggestClearBtn){
                    state.imageCompare.personId=0;state.imageCompare.personName='';
                    renderPersonSuggestions();
                    runImgSearch();
                    return;
                }
                const pickBtn=event.target.closest('[data-image-pick]');
                if(pickBtn){
                    const id=Number(pickBtn.dataset.imagePick);
                    const found=(state.imageCompare.results||[]).find(item=>Number(item.id)===id);
                    if(found){state.imageCompare[pickBtn.dataset.imageSide]=found;await renderComparison();}
                    return;
                }
            },{signal:sidebarSignal()});
            $('#clear-image-comparison').addEventListener('click',async()=>{state.imageCompare={left:null,right:null,query:'',scope:'',results:[],personId:0,personName:'',personSuggestions:[]};persistUiState();renderSidebar();await renderComparison();},{signal:sidebarSignal()});
            return;
        }
        content.innerHTML=`${modeToggle}<div class="search-box"><label for="comparison-global-search">Chercher une personne</label><div class="search-row"><input id="comparison-global-search" value="${escapeHtml(state.comparison.query)}" placeholder="Nom, prénom…"><button id="comparison-search-button">⌕</button></div></div><div class="person-list" id="comparison-results">${empty('Cherche puis choisis A ou B dans les résultats.')}</div>`;
        footer.innerHTML=`<button class="button small secondary" id="clear-comparison">Réinitialiser</button>`;
        const run=debounce(async()=>{state.comparison.query=$('#comparison-global-search').value;persistUiState();const q=state.comparison.query.trim();if(q.length<2){$('#comparison-results').innerHTML=empty('Saisis au moins deux caractères.');return;}const data=await api('people',{q,limit:40});$('#comparison-results').innerHTML=data.people.map(person=>`<article class="saved-item"><span><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small></span><span class="saved-actions"><button data-compare-side="left" data-person-id="${person.id}" data-person-name="${escapeHtml(personName(person))}">A</button><button data-compare-side="right" data-person-id="${person.id}" data-person-name="${escapeHtml(personName(person))}">B</button></span></article>`).join('')||empty('Aucun résultat.');});
        $('#comparison-global-search').addEventListener('input',run,{signal:sidebarSignal()});$('#comparison-search-button').addEventListener('click',run,{signal:sidebarSignal()});
        content.addEventListener('click',async event=>{const modeBtn=event.target.closest('[data-comparison-mode]');if(modeBtn){state.comparisonMode=modeBtn.dataset.comparisonMode;persistUiState();renderSidebar();await renderComparison();return;}const button=event.target.closest('[data-compare-side]');if(!button)return;const side=button.dataset.compareSide;state.comparison[side]=Number(button.dataset.personId);state.comparison[`${side}Name`]=button.dataset.personName;persistUiState();await renderComparison();},{signal:sidebarSignal()});
        $('#clear-comparison').addEventListener('click',async()=>{state.comparison={left:0,right:0,leftName:'',rightName:'',query:''};persistUiState();renderSidebar();await renderComparison();},{signal:sidebarSignal()});
    }

    async function renderComparison(token=++state.workspaceToken){
        if(state.comparisonMode==='images')return renderComparisonImages(token);
        const data=await api('comparison',{a:state.comparison.left||0,b:state.comparison.right||0});if(token!==state.workspaceToken||state.module!=='comparaison')return;
        const left=data.left,right=data.right;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">MODE COMPARAISON</span><h2>Comparer deux individus</h2><p>Utile pour décider si deux fiches sont des doublons, des homonymes ou deux branches distinctes.</p></div></header>
        <div class="comparison-grid">
            ${comparisonPanel('A',left,state.comparison.leftName)}
            ${comparisonPanel('B',right,state.comparison.rightName)}
        </div>
        ${left&&right?comparisonTable(left,right):empty('Choisis une personne A et une personne B dans la colonne de gauche.')}</section>`;
        $$('[data-open-person]').forEach(button=>button.addEventListener('click',()=>{state.currentPersonId=Number(button.dataset.openPerson);setModule('personnes');}));
    }

    function comparisonPanel(label,item,fallback){
        if(!item)return `<article class="card span-6"><header class="card-head"><div class="card-title"><span class="card-index">${label}</span><h3>À choisir</h3></div></header><div class="card-body">${empty('Choisis cette personne dans la recherche de gauche.')}</div></article>`;
        const p=item.person;
        return `<article class="card span-6"><header class="card-head"><div class="card-title"><span class="card-index">${label}</span><h3>${escapeHtml(personName(p)||fallback)}</h3></div><button class="button small secondary" data-open-person="${p.id}">Ouvrir</button></header><div class="card-body"><dl class="data-list">${dataRow('Dates',years(p))}${dataRow('Genre',genderText(p.gender))}${dataRow('Groupe',p.surname_group||'—')}${dataRow('Médias',item.counts.media_count||0)}${dataRow('Sources',item.counts.source_count||0)}${dataRow('Preuves',item.counts.evidence_count||0)}${dataRow('Hypothèses',item.counts.hypothesis_count||0)}</dl></div></article>`;
    }
    function comparisonTable(left,right){
        const eventRows=Math.max(left.events.length,right.events.length,1);
        const events=Array.from({length:eventRows},(_,i)=>`<tr><td>${compareEvent(left.events[i])}</td><td>${compareEvent(right.events[i])}</td></tr>`).join('');
        const relText=item=>item.relations.reduce((acc,row)=>{(acc[row.role]??=[]).push(row.name);return acc;},{});const lr=relText(left),rr=relText(right);
        return `<section class="card span-12 comparison-table"><header class="card-head"><div class="card-title"><span class="card-index">Δ</span><h3>Différences visibles</h3></div></header><div class="card-body"><table><thead><tr><th>${escapeHtml(personName(left.person))}</th><th>${escapeHtml(personName(right.person))}</th></tr></thead><tbody><tr><td>${compareRelations(lr)}</td><td>${compareRelations(rr)}</td></tr>${events}</tbody></table></div></section>`;
    }
    function compareEvent(event){return event?`<strong>${escapeHtml(event.type)}</strong><br><small>${escapeHtml(event.date_text||event.year||'?')} · ${escapeHtml(placeDisplay(event)||'lieu inconnu')}</small>`:'—';}
    function compareRelations(rel){return `<strong>Relations</strong><br><small>Parents : ${escapeHtml((rel.parent||[]).join(', ')||'—')}</small><br><small>Conjoints : ${escapeHtml((rel.spouse||[]).join(', ')||'—')}</small><br><small>Enfants : ${escapeHtml((rel.child||[]).join(', ')||'—')}</small>`;}

    function comparisonImagePane(label,item,slot){
        if(!item)return `<section class="media-compare-pane is-empty" data-slot="${slot}"><header><div><span>${escapeHtml(label)}</span></div></header><p>Choisis un média à gauche pour ${slot==='left'?'Document A':'Document B'}.</p></section>`;
        const title=escapeHtml(item.title||item.attachment_label||item.filename||'Média');
        const body=normalizedMediaType(item)==='pdf'
            ? `<iframe src="media/${encodeURIComponent(item.filename)}" title="${title}"></iframe>`
            : `<div class="media-compare-zoom-wrap" data-compare-zoom="${slot}"><img class="media-compare-zoom-img" src="media/${encodeURIComponent(item.filename)}" alt="${title}" draggable="false"></div>`;
        return `<section class="media-compare-pane" data-slot="${slot}"><header><div><span>${escapeHtml(label)}</span><strong>${title}</strong><small class="media-compare-pane-link">${escapeHtml(mediaCompareLinkInfo(item))}</small></div><div class="media-compare-pane-actions"><button type="button" class="button small danger" data-image-remove="${slot}">Retirer</button></div></header>${body}</section>`;
    }
    function comparisonOverlayHtml(left,right){
        if(!left||!right||normalizedMediaType(left)==='pdf'||normalizedMediaType(right)==='pdf')return '';
        const leftTitle=escapeHtml(left.title||left.filename||'Document A'),rightTitle=escapeHtml(right.title||right.filename||'Document B');
        return `<section class="media-compare-overlay"><header><div><span class="eyebrow">SIGNATURES</span><h3>Superposition</h3><p>${leftTitle} + ${rightTitle}</p></div><label>Opacité B<input id="signature-overlay-opacity" type="range" min="0" max="100" value="50"></label></header><div class="signature-overlay-stage"><img src="media/${encodeURIComponent(left.filename)}" alt="${leftTitle}"><img class="signature-overlay-top" src="media/${encodeURIComponent(right.filename)}" alt="${rightTitle}" style="opacity:.5"></div></section>`;
    }
    function setupComparisonImageZoom(grid){
        $$('.media-compare-zoom-wrap',grid).forEach(wrap=>{
            const img=wrap.querySelector('img');if(!img)return;
            let scale=1,tx=0,ty=0,dragging=false,startX=0,startY=0;
            const apply=()=>{img.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;wrap.classList.toggle('is-zoomed',scale>1);};
            const clamp=()=>{
                if(scale<=1){tx=0;ty=0;return;}
                const maxX=(wrap.clientWidth*(scale-1))/2,maxY=(wrap.clientHeight*(scale-1))/2;
                tx=Math.max(-maxX,Math.min(maxX,tx));ty=Math.max(-maxY,Math.min(maxY,ty));
            };
            wrap.addEventListener('wheel',event=>{
                event.preventDefault();
                const prevScale=scale;
                scale=Math.max(1,Math.min(6,scale+(event.deltaY<0?0.35:-0.35)));
                if(scale===prevScale)return;
                const rect=wrap.getBoundingClientRect(),cx=event.clientX-rect.left-rect.width/2,cy=event.clientY-rect.top-rect.height/2;
                tx-=cx*(scale/prevScale-1);ty-=cy*(scale/prevScale-1);
                clamp();apply();
            },{passive:false});
            wrap.addEventListener('dblclick',()=>{scale=1;tx=0;ty=0;apply();});
            wrap.addEventListener('mousedown',event=>{
                if(scale<=1)return;
                dragging=true;wrap.classList.add('is-dragging');startX=event.clientX-tx;startY=event.clientY-ty;event.preventDefault();
            });
            // écouteurs posés le temps du glisser seulement (sinon ils s'accumulent à chaque comparaison)
            const move=event=>{tx=event.clientX-startX;ty=event.clientY-startY;clamp();apply();};
            const up=()=>{dragging=false;wrap.classList.remove('is-dragging');window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
            wrap.addEventListener('mousedown',()=>{if(dragging){window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);}});
            wrap.addEventListener('click',event=>{
                if(scale>1)return; // un clic en zoom sert à faire glisser, pas à re-zoomer
                scale=2.5;
                clamp();apply();
                event.stopPropagation();
            });
        });
    }
    async function renderComparisonImages(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='comparaison'||state.comparisonMode!=='images')return;
        let left=state.imageCompare.left,right=state.imageCompare.right;
        if(left&&!left.people_links)left=await fetchMediaCompareInfo(left);
        if(right&&!right.people_links)right=await fetchMediaCompareInfo(right);
        if(token!==state.workspaceToken||state.module!=='comparaison'||state.comparisonMode!=='images')return;
        state.imageCompare.left=left;state.imageCompare.right=right;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">MODE COMPARAISON</span><h2>Comparer deux documents</h2><p>Choisis deux médias dans la colonne de gauche (recherche par média, personne, nom ou cote) pour les comparer côte à côte, avec zoom indépendant sur chaque image.</p></div></header>
        <div class="media-compare-grid" id="comparison-image-grid">${comparisonImagePane('Document A',left,'left')}${comparisonImagePane('Document B',right,'right')}</div>${comparisonOverlayHtml(left,right)}</section>`;
        const grid=$('#comparison-image-grid');
        setupComparisonImageZoom(grid);
        $('#signature-overlay-opacity')?.addEventListener('input',event=>{$('.signature-overlay-top').style.opacity=String((Number(event.target.value)||0)/100);});
        $$('[data-image-remove]',grid).forEach(button=>button.addEventListener('click',async()=>{state.imageCompare[button.dataset.imageRemove]=null;await renderComparisonImages();}));
    }

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderComparison, renderComparisonSidebar, setupComparisonImageZoom});
    if (state.module === 'comparaison') renderSidebar(); // la colonne de gauche attendait ce fichier
})();
