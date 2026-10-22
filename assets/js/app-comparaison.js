/* LCNDA — ⚖️ Comparaison (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Comparer deux personnes, ou deux images (signatures, photos) avec zoom et superposition.
 */
(() => {
    'use strict';
    const {$, $$, api, card, dataRow, debounce, empty, escapeHtml, fetchMediaCompareInfo, genderText, mediaCompareLinkInfo, mediaCompareThumb, normalizedMediaType, persistUiState, personName, placeDisplay, renderSidebar, setModule, sidebarSignal, state, years} = window.LCNDA_APP;
    function renderComparisonSidebar(content,footer){
        const modeToggle=`<div class="segmented comparison-mode-toggle"><button class="${state.comparisonMode!=='images'?'is-active ':''}comparison-mode-btn" data-comparison-mode="personnes">Personnes</button><button class="${state.comparisonMode==='images'?'is-active ':''}comparison-mode-btn" data-comparison-mode="images">Images</button></div>`;
        if(state.comparisonMode==='images'){
            // images A et B : la fenêtre unique des médias, dans un champ (pastille, « 🖼 Changer », ×) — comme les personnes A et B
            const mfSide=(side,label)=>{const it=state.imageCompare[side];const value=it?.id?{...it,thumb:it.thumb||(normalizedMediaType(it)==='image'&&(it.thumbnail||it.filename)?`media/${encodeURIComponent(it.thumbnail||it.filename)}`:'')}:null;return `<div class="pk-host"><span>${label}</span><div data-compare-mf="${side}">${window.LCNDA_PICKER?.mediaField?window.LCNDA_PICKER.mediaField({name:'',types:['image','document'],value,title:`Choisir ${label.toLowerCase()}`,okLabel:'Comparer'}):''}</div></div>`;};
            content.innerHTML=`${modeToggle}<div class="search-box comparison-pickers">${mfSide('left','L’image A')}${mfSide('right','L’image B')}</div>`;
            footer.innerHTML=`<button class="button small secondary" id="clear-image-comparison">↺ Remettre comme au départ</button>`;
            content.addEventListener('media-change',async event=>{
                const side=event.target.closest('[data-compare-mf]')?.dataset.compareMf;if(!side)return;
                const it=event.detail.item;
                state.imageCompare[side]=it?await fetchMediaCompareInfo({...it,thumbnail:it.thumbnail||it.filename,document_reference:it.cote||it.document_reference||'',date_text:it.date_text||''}):null;
                persistUiState();await renderComparison();
            },{signal:sidebarSignal()});
            content.addEventListener('click',async event=>{
                const modeBtn=event.target.closest('[data-comparison-mode]');
                if(modeBtn){state.comparisonMode=modeBtn.dataset.comparisonMode;persistUiState();renderSidebar();await renderComparison();}
            },{signal:sidebarSignal()});
            $('#clear-image-comparison').addEventListener('click',async()=>{state.imageCompare={left:null,right:null,query:'',scope:'',results:[],personId:0,personName:'',personSuggestions:[]};persistUiState();renderSidebar();await renderComparison();},{signal:sidebarSignal()});
            return;
        }
        // personnes A et B : menu de choix unique
        const pkSide=(side,label)=>{const id=Number(state.comparison[side])||0;return `<div class="pk-host"><span>${label}</span><div data-compare-pk="${side}">${(window.LCNDA_PICKER?.pickerField({name:'compare_'+side,kind:'person',allowCreate:false,value:id?{id,title:state.comparison[`${side}Name`]||'',kind:'person'}:null})||'').replace(` name="compare_${side}"`,'')}</div></div>`;};
        content.innerHTML=`${modeToggle}<div class="search-box comparison-pickers">${pkSide('left','Personne A')}${pkSide('right','Personne B')}</div>`;
        footer.innerHTML=`<button class="button small secondary" id="clear-comparison">↺ Remettre comme au départ</button>`;
        content.addEventListener('picker-change',async event=>{const side=event.target.closest('[data-compare-pk]')?.dataset.comparePk;if(!side)return;const it=event.detail.item;state.comparison[side]=it&&!it.free?Number(it.id):0;state.comparison[`${side}Name`]=it?it.title:'';persistUiState();await renderComparison();},{signal:sidebarSignal()});
        content.addEventListener('click',async event=>{const modeBtn=event.target.closest('[data-comparison-mode]');if(modeBtn){state.comparisonMode=modeBtn.dataset.comparisonMode;persistUiState();renderSidebar();await renderComparison();}},{signal:sidebarSignal()});
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
        ${left&&right?comparisonTable(left,right):empty('Choisis une personne A et une personne B dans la colonne de gauche.',{icon:'⚖️'})}</section>`;
        $$('[data-open-person]').forEach(button=>button.addEventListener('click',()=>{state.currentPersonId=Number(button.dataset.openPerson);setModule('personnes');}));
    }

    function comparisonPanel(label,item,fallback){
        if(!item)return `<article class="card span-6"><header class="card-head"><div class="card-title"><span class="card-index">${label}</span><h3>À choisir</h3></div></header><div class="card-body">${empty('Choisis cette personne dans la recherche de gauche.',{icon:'👤'})}</div></article>`;
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
        // 🔍 deux photos : l'outil « Comparer deux photos » dans la page (fondu, rideau, yeux alignés, ressemblance) ; un PDF garde les deux cases
        if(left&&right&&normalizedMediaType(left)==='image'&&normalizedMediaType(right)==='image'&&window.LCNDA_EXT?.mountPhotoCompare){
            state._photoCompareTool?.destroy?.();
            $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">MODE COMPARAISON</span><h2>🔍 Comparer deux photos</h2><p>Côte à côte, en fondu ou en rideau, avec le même zoom ; aligne les yeux pour juger une ressemblance. Change les photos ici ou dans la colonne de gauche.</p></div></header><div class="h-pc-inline" id="comparison-photo-tool"></div></section>`;
            state._photoCompareTool=window.LCNDA_EXT.mountPhotoCompare($('#comparison-photo-tool'),{inline:true,a:left,b:right});
            return;
        }
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">MODE COMPARAISON</span><h2>Comparer deux documents</h2><p>Choisis deux médias dans la colonne de gauche (« L’image A », « L’image B » : recherche par titre, cote, personne, lieu ou année) pour les comparer côte à côte, avec zoom indépendant sur chaque image.</p></div></header>
        <div class="media-compare-grid" id="comparison-image-grid">${comparisonImagePane('Document A',left,'left')}${comparisonImagePane('Document B',right,'right')}</div>${comparisonOverlayHtml(left,right)}</section>`;
        const grid=$('#comparison-image-grid');
        setupComparisonImageZoom(grid);
        $('#signature-overlay-opacity')?.addEventListener('input',event=>{$('.signature-overlay-top').style.opacity=String((Number(event.target.value)||0)/100);});
        $$('[data-image-remove]',grid).forEach(button=>button.addEventListener('click',async()=>{const side=button.dataset.imageRemove;state.imageCompare[side]=null;persistUiState();const f=document.querySelector(`[data-compare-mf="${side}"] [data-media-field]`);if(f)window.LCNDA_PICKER?.mediaSet?.(f,null);await renderComparisonImages();}));
    }

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderComparison, renderComparisonSidebar, setupComparisonImageZoom});
    if (state.module === 'comparaison' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
