/* LCNDA — 🕵️ Enquêtes (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Enquêtes (dossiers, pistes, médias évalués, dossiers de pièces) et battues (communes, registres, carte). Les fenêtres de saisie partagées restent dans app.js.
 */
(() => {
    'use strict';
    const i18n = (text, vars) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(text, vars) : String(text ?? '')); // 🌐 app-i18n.js
    const {$, $$, actionButton, api, confirmBox, emptyState, plural, archiveDigestOptionLabel, askText, battueTargetText, bindReminderButtons, bindTableLinks, debounce, empty, escapeHtml, investigationFolderPath, mediaTypeShortLabelWithIcon, normalizedMediaType, openBattueAliasDialog, openBattueDialog, openBattueLevelColorsDialog, openBattueMediaDialog, openBattueSearchDialog, openInvestigationDialog, openInvestigationItemDialog, openInvestigationItemEventDialog, openInvestigationMediaDialog, openInvestigationUploadDialog, openLightbox, persistUiState, reminderIsPast, renderSidebar, safeUrl, setModule, sidebarSignal, sideButton, state, toast} = window.LCNDA_APP;
    /* ═════════ Audit des onglets (docs/design/audit-onglets.html) : barre commune H10 (R2), « ⋯ » et clic droit (R11), ↶ Annuler (R7),
     * mode consultation (R6), ⤓ Exporter ▾ et 🖨 Imprimer (R4), mots d'état (R9), attente (R10), chercher dans la page (R13) ;
     * ajouts : 🧩 pistes en colonnes, ✅ conclure l'enquête, 🚫 recherches négatives, 🗂 modèles d'enquête, 🖨 rapport d'enquête,
     * ⏱ temps passé, 🔦 avancement des battues sur la carte. Serveur : lib/enquetes_plus.php. Essai : tests/test-audit-enquetes.js */
    const UI=()=>window.LCNDA_UI||{};
    const A=()=>window.LCNDA_APP||{};
    const kiosk=()=>document.body.classList.contains('is-kiosk'); // R6 : en consultation, rien à modifier
    const postR=(action,body)=>api(action,{},{method:'POST',body}).then(r=>r&&r.result!==undefined?r.result:r);
    const plusPost=(op,body={})=>postR('enquetes_plus',{op,...body});
    const plusGet=(op,q={})=>api('enquetes_plus',{op,...q});
    const ENQ_PREFS='genealogie-enquetes-prefs'; // réglages choisis (gardés avec la base) : vue des pistes, couleurs de la carte des battues
    const enqPrefs=()=>{try{return JSON.parse(localStorage.getItem(ENQ_PREFS)||'{}')||{};}catch(_){return {};}};
    const setEnqPref=(k,v)=>{try{localStorage.setItem(ENQ_PREFS,JSON.stringify({...enqPrefs(),[k]:v}));}catch(_){}};
    const undoToast=(msg,o)=>(window.LCNDA_APP.undoToast?window.LCNDA_APP.undoToast(msg,o):toast(msg));
    const undoDelete=o=>(window.LCNDA_APP.undoDelete?window.LCNDA_APP.undoDelete(o):toast(o.message||'Supprimé.'));
    const cellCsv=v=>(window.LCNDA_APP.csvCell?window.LCNDA_APP.csvCell(v,{sep:';',quote:'always'}):`"${String(v??'').replace(/"/g,'""')}"`);
    const fileName=(s,fb)=>(window.LCNDA_APP.safeExportFilename?window.LCNDA_APP.safeExportFilename(s,fb):String(s||fb).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||fb);
    function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
    const downloadCsv=(rows,name)=>downloadBlob(new Blob(['﻿'+rows.map(r=>r.map(cellCsv).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),name);
    /** R10 : la phrase d'attente commune si le chargement dure (pas de clignotement pour un chargement rapide) */
    function waitLater(token,text){return setTimeout(()=>{if(token===state.workspaceToken&&state.module==='enquetes'){const ws=$('#workspace');if(ws)ws.innerHTML=`<section class="page enq-wait">${UI().spinner?UI().spinner(i18n(text)):escapeHtml(i18n(text))}</section>`;}},250);}
    /** R6 : en consultation, les boutons qui modifient disparaissent (le serveur refuse de toute façon) */
    const RO_SEL='#edit-investigation,#delete-investigation,#add-investigation-item,#new-investigation-folder,#add-investigation-media,#upload-investigation-media,#add-investigation-recueil,[data-delete-investigation-item],[data-edit-investigation-item],[data-link-media-to-item],[data-link-event-to-item],[data-unlink-investigation-media],.investigation-media-unlink-from-item,.investigation-item-meta-pill-remove,[data-rename-folder],[data-folder-more],[data-delete-folder],.investigation-media-move,[data-edit-media-items],#investigation-items-lock,[data-enq-edit],#edit-battue,#delete-battue,[data-add-battue-alias],[data-add-battue-item],[data-edit-battue-item],[data-delete-battue-item],[data-add-battue-media],[data-edit-battue-alias],[data-delete-battue-alias],#open-battue-level-colors,#battue-countries,[data-empty-click],.investigation-reminder-toggle';
    function readOnly(root){
        if(!kiosk()||!root)return;
        root.querySelectorAll(RO_SEL).forEach(el=>el.remove());
        root.querySelectorAll('[data-battue-commune-status],[data-enq-ro-disable]').forEach(el=>{el.disabled=true;});
        root.querySelectorAll('.investigation-media[draggable="true"]').forEach(el=>el.setAttribute('draggable','false'));
    }
    /** R9 : les mêmes mots d'état partout (À faire · En cours · En pause · Terminé(e)) */
    const COMMUNE_WORDS={not_started:'À faire',unfinished:'En cours',done:'Terminé',doubt:'Exploré avec doute'};
    const communeWords=st=>Object.fromEntries(Object.keys(st||COMMUNE_WORDS).map(k=>[k,COMMUNE_WORDS[k]||st?.[k]||k]));
    /* ── ⏱ temps passé ── */
    const hm=sec=>{sec=Math.max(0,Math.round(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);return h?i18n('{h} h {m}',{h,m:String(m).padStart(2,'0')}):m?i18n('{m} min',{m}):i18n('{s} s',{s:sec});};
    let chronoTimer=0;
    function chronoHtml(ex){return `<button type="button" class="button secondary enq-chrono${ex.running?' is-running':''}" data-enq-chrono data-enq-edit-soft title="${escapeHtml(i18n(ex.running?'Arrêter le chronomètre':'Lancer le chronomètre : le temps passé sur cette enquête'))}">${ex.running?'⏸':'⏱'} <span data-enq-chrono-t>${escapeHtml(hm(ex.elapsed))}</span></button>`;}
    function bindChrono(id,ex){
        clearInterval(chronoTimer);
        const btn=$('[data-enq-chrono]');if(!btn)return;
        if(kiosk()){btn.disabled=true;}
        let base=Number(ex.elapsed)||0,t0=Date.now(),running=!!ex.running;
        const paint=()=>{const t=btn.querySelector('[data-enq-chrono-t]');if(t)t.textContent=hm(base+(running?(Date.now()-t0)/1000:0));btn.classList.toggle('is-running',running);btn.firstChild.textContent=running?'⏸':'⏱';};
        if(running)chronoTimer=setInterval(()=>{if(!btn.isConnected){clearInterval(chronoTimer);return;}paint();},1000);
        btn.addEventListener('click',async()=>{
            try{const r=await plusPost('chrono',{investigation_id:id,what:running?'stop':'start'});base=Number(r.extras.elapsed)||0;t0=Date.now();running=!!r.extras.running;paint();clearInterval(chronoTimer);if(running)chronoTimer=setInterval(()=>{if(!btn.isConnected){clearInterval(chronoTimer);return;}paint();},1000);toast(running?i18n('⏱ Chronomètre lancé.'):i18n('⏱ Temps gardé : {t}.',{t:hm(base)}));}
            catch(error){toast(error.message,'error');}
        });
        btn._reset=async()=>{const before=base+(running?(Date.now()-t0)/1000:0);await plusPost('chrono',{investigation_id:id,what:'reset'});base=0;running=false;clearInterval(chronoTimer);paint();
            undoToast(i18n('Temps remis à zéro'),{undo:async()=>{await plusPost('chrono',{investigation_id:id,what:'set',seconds:Math.round(before)});base=Math.round(before);paint();},redo:async()=>{await plusPost('chrono',{investigation_id:id,what:'reset'});base=0;paint();}});};
    }
    /* ── 🗂 modèles d'enquête ── */
    const TEMPLATES=[
        {key:'parents',icon:'👪',name:'Trouver les parents de…',title:'Les parents de {name}',question:'Qui sont le père et la mère de {name} ? Où et quand se sont-ils mariés ?',known:'',
            items:[['source','Acte de naissance ou de baptême','to_explore_priority'],['source','Acte de mariage (il nomme les parents)','to_explore_priority'],['source','Acte de décès (âge, parents, témoins)','to_explore'],['source','Tables décennales autour de la naissance','to_explore'],['source','Recensements : le foyer et ses voisins','to_explore'],['lead','Contrat de mariage chez le notaire','to_explore']]},
        {key:'soldat',icon:'🎖',name:'Retrouver un soldat',title:'Le parcours militaire de {name}',question:'Dans quelle unité {name} a-t-il servi, où, et que lui est-il arrivé ?',known:'',
            items:[['source','Fiche matricule (registres matricules des archives départementales)','to_explore_priority'],['link','Mémoire des hommes : morts pour la France, journaux des unités','to_explore','https://www.memoiredeshommes.sga.defense.gouv.fr/'],['link','MémorialGenWeb : monuments aux morts','to_explore','https://www.memorialgenweb.org/'],['source','Journal des marches et opérations (JMO) de son régiment','to_explore'],['document','Livret militaire, lettres, photos de famille','to_explore'],['lead','Sépultures de guerre et nécropoles','to_explore']]},
        {key:'emigre',icon:'🚢',name:'Émigré : retrouver le départ et l’arrivée',title:'Le départ de {name}',question:'Quand et par où {name} est-il parti, et où s’est-il installé ?',known:'',
            items:[['source','Passeports et registres de départ (archives départementales, série M)','to_explore_priority'],['source','Listes de passagers (port de départ, port d’arrivée)','to_explore_priority'],['source','Recensements du pays d’arrivée','to_explore'],['source','Naturalisation dans le pays d’arrivée','to_explore'],['source','Registres des consulats','to_explore'],['lead','Presse locale et courriers de la famille restée au pays','to_explore']]},
        {key:'vide',icon:'📄',name:'Enquête vide',title:'',question:'',known:'',items:[]},
    ];
    function openTemplateDialog(){
        if(kiosk())return;
        const P=window.LCNDA_PICKER;
        const dlg=document.createElement('dialog');dlg.className='modal enq-tpl-dialog';
        dlg.innerHTML=`<form method="dialog" novalidate><div class="modal-head"><div><span class="eyebrow">${escapeHtml(i18n('ENQUÊTES'))}</span><h2>🗂 ${escapeHtml(i18n('Nouvelle enquête depuis un modèle'))}</h2></div><button type="button" class="icon-button" data-x aria-label="${escapeHtml(i18n('Fermer'))}">×</button></div>
            <div class="enq-tpl-list" role="radiogroup">${TEMPLATES.map((t,i)=>`<label class="enq-tpl"><input type="radio" name="tpl" value="${t.key}" ${i===0?'checked':''}><span class="enq-tpl-ico" aria-hidden="true">${t.icon}</span><span><b>${escapeHtml(i18n(t.name))}</b><small class="muted">${t.items.length?escapeHtml(i18n('{n} pistes préparées',{n:t.items.length})):escapeHtml(i18n('Rien de prérempli'))}</small></span></label>`).join('')}</div>
            <div class="form-grid"><div class="span-2"><span class="pk-lab">${escapeHtml(i18n('Personne cherchée'))}</span>${P?.pickerField?P.pickerField({name:'enq_tpl_person',kind:'person',value:Number(state.currentPersonId)||null}):'<input name="enq_tpl_person" type="number">'}</div>
            <label class="span-2">${escapeHtml(i18n('Titre'))}<input name="title" data-enq-tpl-title maxlength="300"></label></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>${escapeHtml(i18n('Annuler'))}</button><button type="submit" class="button" data-enq-tpl-go>${escapeHtml(i18n('Créer l’enquête'))}</button></div></form>`;
        document.body.appendChild(dlg);
        const tpl=()=>TEMPLATES.find(t=>t.key===dlg.querySelector('[name=tpl]:checked')?.value)||TEMPLATES[0];
        let pname='',touched=false;
        const titleIn=dlg.querySelector('[data-enq-tpl-title]');
        const fill=()=>{if(touched)return;const t=tpl();titleIn.value=t.title?i18n(t.title,{name:pname||i18n('…')}):'';};
        dlg.addEventListener('picker-change',e=>{pname=e.detail?.item?.title||e.detail?.item?.name||'';fill();});
        titleIn.addEventListener('input',()=>{touched=true;});
        dlg.addEventListener('change',e=>{if(e.target.name==='tpl'){touched=false;fill();}});
        dlg.addEventListener('click',e=>{if(e.target.closest('[data-x]'))dlg.close();});
        dlg.addEventListener('close',()=>dlg.remove());
        // le nom de la personne déjà choisie (fiche ouverte)
        const cur=state.currentPerson?.person;if(cur&&Number(cur.id)===Number(state.currentPersonId))pname=window.LCNDA_APP.personName?window.LCNDA_APP.personName(cur):'';
        fill();
        dlg.querySelector('form').addEventListener('submit',async e=>{
            e.preventDefault();
            const t=tpl(),pid=Number(dlg.querySelector('[name=enq_tpl_person]')?.value)||0,title=titleIn.value.trim()||i18n(t.name);
            if(!pid){toast(i18n('Choisis la personne cherchée.'),'error');return;}
            const go=dlg.querySelector('[data-enq-tpl-go]');go.disabled=true;
            try{
                const r=await postR('save_investigation',{person_id:pid,title,question:t.question?i18n(t.question,{name:pname||title}):'',known_facts:t.known,documents:'',status:'open'});
                const id=Number(r.id);
                for(const [kind,ttl,status,url] of t.items)await postR('add_investigation_item',{investigation_id:id,kind,title:i18n(ttl),status,url:url||''});
                dlg.close();
                state.enquetesTab='enquetes';state.currentInvestigationId=id;state.investigationFolderId=0;persistUiState();renderSidebar();renderInvestigations();
                undoToast(i18n('Enquête « {title} » créée',{title}),{undo:async()=>{await postR('delete_investigation',{id});if(Number(state.currentInvestigationId)===id){state.currentInvestigationId=0;}if(state.module==='enquetes')renderInvestigations();}});
            }catch(error){go.disabled=false;toast(error.message,'error');}
        });
        dlg.showModal();
    }
    /* ── ⋯ et clic droit (R11) : Ouvrir · Modifier · ⧉ Dupliquer · ⤓ Exporter · — · 🗑 Supprimer ── */
    async function editInvestigation(id){const d=await api('investigation',{id});openInvestigationDialog(d.investigation.person_id,Object.assign({},d.investigation,{linked_persons:d.linked_persons||[],linked_battues:d.linked_battues||[]}));}
    async function editBattue(id){const d=await api('battue_detail',{id});openBattueDialog({...d.battue,linked_persons:d.linked_persons||[],linked_battues:d.linked_battues||[],linked_investigations:d.linked_investigations||[]});}
    async function deleteInvestigation(id,title=''){
        const del=()=>postR('delete_investigation',{id});
        const again=()=>{if(state.module==='enquetes')return renderInvestigations();};
        try{await del();}catch(error){toast(error.message,'error');return;}
        if(Number(state.currentInvestigationId)===Number(id)){state.currentInvestigationId=0;state.investigationFolderId=0;persistUiState();}
        undoDelete({type:'investigation',id,message:title?i18n('Enquête « {title} » supprimée',{title}):i18n('Enquête supprimée'),redo:del,after:again});
        renderInvestigations();
    }
    async function deleteBattue(id,title=''){
        const del=()=>postR('delete_battue',{id});
        const again=()=>{if(state.module==='enquetes'&&state.enquetesTab==='battue')return renderBattues();};
        try{await del();}catch(error){toast(error.message,'error');return;}
        if(Number(state.currentBattueId)===Number(id)){state.currentBattueId=0;state.currentBattueDetail=null;persistUiState();}
        undoDelete({type:'battue',id,message:title?i18n('Battue « {title} » supprimée',{title}):i18n('Battue supprimée'),redo:del,after:again});
        renderBattues();
    }
    async function duplicateInvestigation(id){
        try{const r=await plusPost('duplicate',{investigation_id:id});const nid=Number(r.id);
            state.currentInvestigationId=nid;state.investigationFolderId=0;persistUiState();renderInvestigations();
            undoToast(i18n('Enquête dupliquée'),{undo:async()=>{await postR('delete_investigation',{id:nid});if(Number(state.currentInvestigationId)===nid)state.currentInvestigationId=0;if(state.module==='enquetes')renderInvestigations();}});
        }catch(error){toast(error.message,'error');}
    }
    function rowMenuItems(kind,id,title){
        const ro=kiosk();
        if(kind==='inv')return [{icon:'↗',label:i18n('Ouvrir'),run:()=>{state.currentInvestigationId=id;state.investigationFolderId=0;persistUiState();renderInvestigations();}},
            ro?null:{icon:'✎',label:i18n('Modifier'),run:()=>editInvestigation(id).catch(e=>toast(e.message,'error'))},
            ro?null:{icon:'⧉',label:i18n('Dupliquer'),run:()=>duplicateInvestigation(id)},
            {icon:'⤓',label:i18n('Exporter le rapport…'),run:()=>exportReport(id)},
            {icon:'🖨',label:i18n('Imprimer le rapport'),run:()=>printReport(id)},
            ro?null:'-',ro?null:{icon:'🗑',label:i18n('Supprimer'),danger:true,run:()=>deleteInvestigation(id,title)}].filter(Boolean);
        if(kind==='battue')return [{icon:'↗',label:i18n('Ouvrir'),run:()=>{state.currentBattueId=id;persistUiState();renderBattues();}},
            ro?null:{icon:'✎',label:i18n('Modifier'),run:()=>editBattue(id).catch(e=>toast(e.message,'error'))},
            {icon:'⤓',label:i18n('Exporter les annotations (CSV)'),run:()=>api('battue_detail',{id}).then(d=>downloadCsv(battueCsvRows(d),`${fileName(d.battue.title,'battue')}.csv`)).catch(e=>toast(e.message,'error'))},
            ro?null:'-',ro?null:{icon:'🗑',label:i18n('Supprimer'),danger:true,run:()=>deleteBattue(id,title)}].filter(Boolean);
        return [];
    }
    function bindRowMenus(root){
        if(!root||root._enqMenus)return;root._enqMenus=true;
        const parse=el=>{const [k,i]=String(el.dataset.enqRow||el.dataset.enqMenu||'').split(':');return [k,Number(i),el.dataset.enqTitle||el.closest('[data-enq-title]')?.dataset.enqTitle||''];};
        root.addEventListener('click',e=>{const b=e.target.closest('[data-enq-menu]');if(!b)return;e.preventDefault();e.stopPropagation();const [k,i,t]=parse(b);UI().menuAt?.(b,rowMenuItems(k,i,t),{title:t?`« ${t.slice(0,50)} »`:''});});
        root.addEventListener('contextmenu',e=>{const r=e.target.closest('[data-enq-row]');if(!r||e.shiftKey||e.target.closest('a,input,select,textarea'))return;const [k,i,t]=parse(r);if(!UI().contextMenu)return;e.preventDefault();UI().contextMenu(e,rowMenuItems(k,i,t),{title:t?`« ${t.slice(0,50)} »`:''});});
    }
    const menuBtn=(kind,id,title)=>`<button type="button" class="icon-button small enq-more" data-enq-menu="${kind}:${id}" data-enq-title="${escapeHtml(title||'')}" aria-label="${escapeHtml(i18n('Plus d’actions'))}" title="${escapeHtml(i18n('Plus d’actions'))}">⋯</button>`;
    /* ── ⤓ Exporter ▾ / 🖨 Imprimer (R4) ── */
    function exportList(kind,rows,title){
        const csv=o=>downloadCsv(rows,o.filename||`${fileName(title,kind)}.csv`);
        const print=()=>UI().printPage?UI().printPage(title):window.print();
        if(!UI().openExportDialog)return csv({});
        return UI().openExportDialog({title,defaultName:title,quality:false,info:i18n('{n} lignes',{n:Math.max(0,rows.length-1)}),formats:[
            {id:'csv',label:i18n('📊 Tableur'),hint:i18n('CSV (Excel, Numbers, LibreOffice)'),ext:'csv',run:async o=>csv(o)},
            {id:'pdf',hint:i18n('la page affichée (« Enregistrer en PDF »)'),ext:'',run:async()=>print()},
            {id:'print',hint:i18n('la page affichée'),run:async()=>print()}]});
    }
    const exportButtons=()=>`<button type="button" class="button secondary" data-enq-export>${escapeHtml(i18n('⤓ Exporter ▾'))}</button><button type="button" class="button secondary" data-enq-print>${escapeHtml(i18n('🖨 Imprimer'))}</button>`;
    function battueCsvRows(d){
        const st=d.statuses||{},cs=communeWords(d.commune_statuses);
        const rows=[[i18n('Commune'),i18n('Code'),i18n('Niveau'),i18n('État de la commune'),i18n('Recherche'),i18n('Période'),i18n('État'),i18n('Registre'),i18n('Note'),i18n('Adresse')]];
        (d.communes||[]).forEach(c=>{const items=c.items||[];if(!items.length)rows.push([c.name,c.insee_code,c.level,cs[c.commune_status||'not_started']||'','','','','','','']);items.forEach(it=>rows.push([c.name,c.insee_code,c.level,cs[c.commune_status||'not_started']||'',battueTargetText(d.target_types,it.record_type),it.period||'',st[it.status]||it.status||'',it.register||'',it.note||'',it.url||'']));});
        return rows;
    }
    /* ── 🖨 rapport d'enquête : question, chronologie des pistes, recherches négatives, pièces (vignettes), conclusion ── */
    const ITEM_KIND={lead:'Piste',link:'Lien',source:'Source',document:'Document',note:'Note',event:'Événement'};
    const ITEM_STATUS={promising:'Prometteuse',closed:'Fermée / écartée',to_explore_priority:'À explorer (prioritaire)',to_explore:'À explorer (pas prioritaire)',explored:'Explorée'};
    const frDate=s=>{const d=new Date(String(s||'').replace(' ','T'));return isNaN(d)?String(s||''):d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});};
    async function reportHtml(id){
        const [d,plus]=await Promise.all([api('investigation',{id}),plusGet('detail',{id}).catch(()=>({extras:{},negatives:[]}))]);
        const inv=d.investigation,ex=plus.extras||{},negs=plus.negatives||[],e=escapeHtml;
        const items=(d.items||[]).slice().sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||a.id-b.id);
        const kept=new Set((ex.kept_item_ids||[]).map(Number));
        const base=location.href.replace(/[#?].*$/,'').replace(/[^/]*$/,'');
        const statusWord=st=>st==='closed'?i18n('Terminée'):st==='paused'?i18n('En pause'):i18n('En cours');
        const persons=(d.linked_persons||[]).map(p=>p.person_name).filter(Boolean);
        const body=`<h1>🕵️ ${e(inv.title)}</h1><p class="meta">${e(i18n('Enquête sur {name}',{name:inv.person_name||''}))}${persons.length?` · ${e(i18n('aussi : {list}',{list:persons.join(', ')}))}`:''} · ${e(statusWord(inv.status))} · ${e(i18n('ouverte le {d}',{d:frDate(inv.created_at)}))}${ex.elapsed?` · ⏱ ${e(hm(ex.elapsed))}`:''}</p>
            <h2>${e(i18n('Question'))}</h2><p>${e(inv.question||'—')}</p>${inv.known_facts?`<h2>${e(i18n('Ce que je sais'))}</h2><p>${e(inv.known_facts)}</p>`:''}${inv.documents?`<h2>${e(i18n('Documents disponibles'))}</h2><p>${e(inv.documents)}</p>`:''}
            <h2>${e(i18n('Chronologie des pistes'))}</h2>${items.length?`<table><thead><tr><th>${e(i18n('Date'))}</th><th>${e(i18n('Nature'))}</th><th>${e(i18n('Piste'))}</th><th>${e(i18n('État'))}</th></tr></thead><tbody>${items.map(it=>`<tr><td>${e(frDate(it.created_at))}</td><td>${e(i18n(ITEM_KIND[it.kind]||it.kind))}</td><td><b>${e(it.title)}</b>${kept.has(Number(it.id))?' ✓':''}${it.url?`<br><small>${e(it.url)}</small>`:''}${it.notes?`<br><small>${e(it.notes)}</small>`:''}</td><td>${e(i18n(ITEM_STATUS[it.status]||it.status))}</td></tr>`).join('')}</tbody></table>`:`<p>${e(i18n('Aucune piste.'))}</p>`}
            ${negs.length?`<h2>${e(i18n('Recherches sans résultat'))}</h2><table><thead><tr><th>${e(i18n('Fonds'))}</th><th>${e(i18n('Cote'))}</th><th>${e(i18n('Années'))}</th><th>${e(i18n('Le'))}</th><th>📎</th></tr></thead><tbody>${negs.map(n=>`<tr><td>${e(n.repository)}</td><td>${e(n.cote)}</td><td>${n.year_from?e(n.year_to&&n.year_to!==n.year_from?`${n.year_from}–${n.year_to}`:String(n.year_from)):''}</td><td>${e(frDate(n.searched_on))}</td><td>${(n.media||[]).length?`📎 ${(n.media||[]).length}`:''}${n.folder_path?` 📁`:''}</td></tr>`).join('')}</tbody></table>`:''}
            ${(d.media||[]).length?`<h2>${e(i18n('Pièces'))}</h2><div class="thumbs">${d.media.map(m=>`<figure>${normalizedMediaType(m)==='image'?`<img src="media/${encodeURIComponent(m.thumbnail||m.filename)}" alt="">`:`<span class="doc">${e(mediaTypeShortLabelWithIcon(m).replace(/<[^>]+>/g,''))}</span>`}<figcaption>${e(m.title||m.filename)}<br><small>${e(m.verdict==='interesting'?i18n('Intéressant'):i18n('Rejeté'))}</small></figcaption></figure>`).join('')}</div>`:''}
            <h2>${e(i18n('Conclusion'))}</h2>${ex.conclusion?`<p>${e(ex.conclusion)}</p>${ex.proof?`<h3>${e(i18n('Argument de preuve'))}</h3><p>${e(ex.proof)}</p>`:''}${kept.size?`<h3>${e(i18n('Sources retenues'))}</h3><ul>${items.filter(it=>kept.has(Number(it.id))).map(it=>`<li>${e(it.title)}</li>`).join('')}</ul>`:''}`:`<p>${e(i18n('Pas encore de conclusion.'))}</p>`}
            <p class="foot">${e(i18n('Rapport fait le {d}',{d:frDate(new Date().toISOString())}))}</p>`;
        const css='body{font:11pt/1.45 Georgia,serif;color:#222;padding:14mm}h1{font-size:19pt;margin:0 0 4pt}h2{font-size:13pt;margin:14pt 0 4pt;border-bottom:1px solid #999}h3{font-size:11pt;margin:8pt 0 2pt}.meta{color:#555}p{white-space:pre-wrap;margin:3pt 0}table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{border:1px solid #bbb;padding:3pt 5pt;text-align:left;vertical-align:top}th{background:#eee}.thumbs{display:flex;flex-wrap:wrap;gap:8pt}figure{margin:0;width:32mm;font-size:8pt;break-inside:avoid}figure img{width:32mm;height:32mm;object-fit:cover;border:1px solid #bbb}.doc{display:flex;align-items:center;justify-content:center;width:32mm;height:32mm;border:1px solid #bbb;background:#f4f4f4}.foot{color:#777;font-size:8.5pt;margin-top:16pt}';
        return {title:inv.title,html:`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${e(inv.title)}</title><base href="${e(base)}"><style>${css}</style></head><body>${body}</body></html>`};
    }
    async function printReport(id){try{const r=await reportHtml(id);if(UI().openPrintDialog)UI().openPrintDialog({title:i18n('Rapport : {t}',{t:r.title}),icon:'🕵️',key:'enquete-rapport',html:r.html,photos:false});else{const w=window.open('','_blank');w?.document.write(r.html);}}catch(error){toast(error.message,'error');}}
    async function exportReport(id){
        if(!UI().openExportDialog)return printReport(id);
        let r;try{r=await reportHtml(id);}catch(error){toast(error.message,'error');return;}
        return UI().openExportDialog({title:i18n('Rapport : {t}',{t:r.title}),defaultName:r.title,quality:false,info:i18n('Question, chronologie des pistes, pièces, conclusion : à envoyer à un cousin ou à une association.'),formats:[
            {id:'pdf',hint:i18n('« Enregistrer en PDF » dans la fenêtre d’impression'),ext:'',run:async()=>printReport(id)},
            {id:'print',hint:i18n('tout de suite'),run:async()=>printReport(id)},
            {id:'file',label:i18n('🌐 Page web'),hint:i18n('un fichier .html à envoyer'),ext:'html',run:async o=>downloadBlob(new Blob([r.html],{type:'text/html;charset=utf-8'}),o.filename||`${fileName(r.title,'enquete')}.html`)}]});
    }
    /* ── 🔍 chercher dans cette page (R13) : filtre les pistes, recherches et pièces d'une longue page ── */
    function pageFind(page,sel){
        if(!page||page.querySelector('.enq-find'))return;
        const n=page.querySelectorAll(sel).length;if(n<8)return;
        const fold=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
        const box=document.createElement('div');box.className='enq-find ui-l6';box.setAttribute('role','search');
        const sf=UI().searchField?UI().searchField({placeholder:i18n('Chercher dans cette page…'),label:i18n('Chercher dans cette page')}):null;
        const input=sf?sf.input:Object.assign(document.createElement('input'),{type:'search',placeholder:i18n('Chercher dans cette page…')});
        input.dataset.enqFind='1';box.appendChild(sf||input);
        const info=document.createElement('small');info.className='ui-l6-info';info.setAttribute('aria-live','polite');box.appendChild(info);
        const apply=()=>{const q=fold(input.value.trim());let hit=0,all=0;page.querySelectorAll(sel).forEach(el=>{all++;const ok=!q||fold(el.textContent).includes(q);el.classList.toggle('enq-find-off',!ok);if(ok)hit++;});info.textContent=q?i18n('{n} sur {all}',{n:hit,all}):'';};
        input.addEventListener('input',()=>{clearTimeout(input._t);input._t=setTimeout(apply,120);});input.addEventListener('search',apply);
        const head=page.querySelector(':scope > .page-header');if(head)head.after(box);else page.prepend(box);
    }
    /* ── ✅ conclusion (Genealogical Proof Standard : une conclusion écrite, un argument, les sources retenues) ── */
    function conclusionHtml(inv,items,ex){
        const kept=new Set((ex.kept_item_ids||[]).map(Number)),keptItems=items.filter(it=>kept.has(Number(it.id)));
        return `<section class="enq-conclusion${ex.conclusion?' has-conclusion':''}" data-enq-conclusion><div class="section-title"><div><span class="eyebrow">${escapeHtml(i18n('CONCLUSION'))}</span><h3>✅ ${escapeHtml(i18n('Ce que l’enquête a établi'))}</h3></div>
            <div class="page-actions"><button type="button" class="button small${ex.conclusion?' secondary':''}" data-enq-conclude data-enq-edit>${escapeHtml(ex.conclusion?i18n('✎ Modifier la conclusion'):i18n('✅ Conclure l’enquête'))}</button></div></div>
            ${ex.conclusion?`<div class="enq-conclusion-body"><p class="enq-conclusion-text">${escapeHtml(ex.conclusion)}</p>${ex.proof?`<h4>${escapeHtml(i18n('Argument de preuve'))}</h4><p>${escapeHtml(ex.proof)}</p>`:''}${keptItems.length?`<h4>${escapeHtml(i18n('Sources retenues'))}</h4><ul class="enq-kept">${keptItems.map(it=>`<li>${escapeHtml(it.title)}</li>`).join('')}</ul>`:''}${ex.concluded_at?`<small class="muted">${escapeHtml(i18n('Conclue le {d}',{d:frDate(ex.concluded_at)}))}</small>`:''}</div>`
            :`<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">✅</span><span class="empty-line-text">${escapeHtml(i18n('Pas encore de conclusion : quand tu as la réponse, écris-la avec l’argument qui la prouve et les sources retenues.'))}</span></p>`}
            <div class="enq-conclusion-propose" data-enq-propose hidden></div></section>`;
    }
    function openConclusionDialog(id,inv,items,ex,reload){
        const kept=new Set((ex.kept_item_ids||[]).map(Number));
        const dlg=document.createElement('dialog');dlg.className='modal enq-conclude-dialog';
        const pre=it=>kept.size?kept.has(Number(it.id)):(['source','document'].includes(it.kind)&&['promising','explored'].includes(it.status));
        dlg.innerHTML=`<form method="dialog" novalidate><div class="modal-head"><div><span class="eyebrow">${escapeHtml(i18n('ENQUÊTE'))}</span><h2>✅ ${escapeHtml(i18n('Conclure l’enquête'))}</h2></div><button type="button" class="icon-button" data-x aria-label="${escapeHtml(i18n('Fermer'))}">×</button></div>
            <p class="muted">${escapeHtml(inv.question||'')}</p>
            <label>${escapeHtml(i18n('Conclusion'))}<textarea name="conclusion" rows="4" required placeholder="${escapeHtml(i18n('Ex. Jean DURAND est le fils de Pierre DURAND et de Marie LACOMBE.'))}">${escapeHtml(ex.conclusion||'')}</textarea></label>
            <label>${escapeHtml(i18n('Argument de preuve'))} <small class="muted">${escapeHtml(i18n('(pourquoi c’est sûr : les sources qui s’accordent, les contradictions levées)'))}</small><textarea name="proof" rows="5">${escapeHtml(ex.proof||'')}</textarea></label>
            <fieldset class="enq-kept-pick"><legend>${escapeHtml(i18n('Sources retenues'))}</legend>${items.map(it=>`<label class="checkbox-line"><input type="checkbox" name="kept" value="${it.id}" ${pre(it)?'checked':''}> ${escapeHtml(it.title)} <small class="muted">${escapeHtml(i18n(ITEM_KIND[it.kind]||it.kind))}</small></label>`).join('')||empty(i18n('Aucune piste dans cette enquête.'),{icon:'🔍'})}</fieldset>
            <label class="checkbox-line"><input type="checkbox" name="close" ${inv.status!=='closed'?'checked':''}> ${escapeHtml(i18n('Mettre l’enquête dans « Terminées »'))}</label>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>${escapeHtml(i18n('Annuler'))}</button><button type="submit" class="button" data-enq-conclude-go>${escapeHtml(i18n('Enregistrer la conclusion'))}</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click',e=>{if(e.target.closest('[data-x]'))dlg.close();});
        dlg.addEventListener('close',()=>dlg.remove());
        dlg.querySelector('form').addEventListener('submit',async e=>{
            e.preventDefault();
            const f=e.target,conclusion=f.conclusion.value.trim();
            if(!conclusion){UI().fail?UI().fail(f.conclusion,i18n('Écris la conclusion.')):toast(i18n('Écris la conclusion.'),'error');return;}
            const close=f.close.checked;
            try{
                const r=await plusPost('save_conclusion',{investigation_id:id,conclusion,proof:f.proof.value.trim(),kept_item_ids:[...f.querySelectorAll('[name=kept]:checked')].map(x=>Number(x.value)),close:close?1:0});
                dlg.close();
                undoToast(i18n('Conclusion enregistrée'),{undo:async()=>{await plusPost('restore_conclusion',{investigation_id:id,before:r.before});await reload();},redo:async()=>{await plusPost('save_conclusion',{investigation_id:id,conclusion,proof:f.proof.value.trim(),kept_item_ids:r.extras.kept_item_ids,close:close?1:0});await reload();}});
                await reload();
                if(close&&inv.status!=='closed')proposeOnFiche(id,inv,conclusion,f.proof.value.trim());
            }catch(error){toast(error.message,'error');}
        });
        dlg.showModal();
    }
    /** à la clôture : « 📝 Mettre la conclusion sur la fiche de … » (une note sur la fiche, ↶ Annuler) */
    function proposeOnFiche(id,inv,conclusion,proof){
        const box=$('[data-enq-propose]');if(!box||!inv.person_id||kiosk())return;
        const who=inv.person_name||i18n('la personne');
        box.hidden=false;
        box.innerHTML=`<p>📝 ${escapeHtml(i18n('L’enquête est terminée. Mettre la conclusion sur la fiche de {name} ?',{name:who}))}</p><div class="page-actions"><button type="button" class="button small" data-enq-onfiche>${escapeHtml(i18n('Ajouter en note sur la fiche'))}</button><button type="button" class="button small secondary" data-enq-onfiche-no>${escapeHtml(i18n('Non merci'))}</button></div>`;
        box.querySelector('[data-enq-onfiche-no]').addEventListener('click',()=>{box.hidden=true;box.innerHTML='';});
        box.querySelector('[data-enq-onfiche]').addEventListener('click',async()=>{
            const body=`${conclusion}${proof?`\n\n${i18n('Argument de preuve')} : ${proof}`:''}\n\n${i18n('D’après l’enquête « {title} ».',{title:inv.title})}`;
            const add=()=>postR('add_note',{person_id:inv.person_id,title:i18n('Conclusion : {title}',{title:inv.title}),body});
            try{let r=await add();box.hidden=true;box.innerHTML='';
                undoToast(i18n('Conclusion ajoutée sur la fiche de {name}',{name:who}),{undo:async()=>{await postR('delete_note',{id:r.id});},redo:async()=>{r=await add();}});
            }catch(error){toast(error.message,'error');}
        });
    }
    /* ── 🚫 recherches négatives : « rien trouvé » avec la cote, les années, la date ; avertissement avant de refaire la même ── */
    const yearsText=n=>n.year_from?(n.year_to&&n.year_to!==n.year_from?`${n.year_from}–${n.year_to}`:String(n.year_from)):'';
    /* 📎 pièces jointes d'une recherche négative : des images de l'app (ouvertes dans la visionneuse) et un dossier de l'ordinateur
     * (le chemin seulement ; ouvert par l'app de bureau, electron/preload.js : jamais dans le navigateur ni en consultation) */
    const deskFolders=()=>!!(window.lcnda&&typeof window.lcnda.chooseFolder==='function'&&typeof window.lcnda.openFolder==='function');
    const folderLabel=p=>String(p||'').replace(/[\\/]+$/,'').split(/[\\/]/).pop()||String(p||'');
    const negThumbSrc=m=>`media/${encodeURIComponent(m.thumbnail||m.filename||'')}`;
    function negAttachBadge(n){
        const media=n.media||[],dir=n.folder_path||'',out=[];
        if(media.length){const m=media[0];out.push(`<button type="button" class="enq-neg-att-badge" data-enq-neg-view="${n.id}" title="${escapeHtml(i18n('Voir les images jointes'))}"><img src="${escapeHtml(negThumbSrc(m))}" alt="" loading="lazy"><span>📎 ${media.length}</span></button>`);}
        if(dir){
            if(kiosk())out.push(`<span class="enq-neg-att-dir" title="${escapeHtml(i18n('Un dossier de l’ordinateur'))}">📁</span>`);
            else if(deskFolders())out.push(`<button type="button" class="enq-neg-att-dir is-link" data-enq-neg-dir-open="${n.id}" title="${escapeHtml(i18n('Ouvrir le dossier {name}',{name:dir}))}">📁 ${escapeHtml(folderLabel(dir))}</button>`);
            else out.push(`<span class="enq-neg-att-dir" title="${escapeHtml(dir)}">📁 ${escapeHtml(folderLabel(dir))}</span>`);
        }
        return out.join('');
    }
    function viewNegativeMedia(n,index=0){const media=(n?.media||[]).map(m=>({...m}));if(!media.length)return;openLightbox(media,Math.max(0,Math.min(index,media.length-1)),kiosk());}
    async function openNegativeFolder(dir){
        if(!dir||kiosk()||!deskFolders())return;
        try{const r=await window.lcnda.openFolder(dir);if(r&&!r.ok)toast(i18n(r.error||'Impossible d’ouvrir ce dossier.'),'error');}catch(error){toast(error.message,'error');}
    }
    function bindNegativeAttach(root,negs){
        root.querySelectorAll('[data-enq-neg-view]').forEach(b=>b.addEventListener('click',()=>viewNegativeMedia(negs.find(x=>Number(x.id)===Number(b.dataset.enqNegView)))));
        root.querySelectorAll('[data-enq-neg-dir-open]').forEach(b=>b.addEventListener('click',()=>openNegativeFolder(negs.find(x=>Number(x.id)===Number(b.dataset.enqNegDirOpen))?.folder_path)));
    }
    function negativesHtml(negs){
        return `<section class="enq-negatives" data-enq-negatives><div class="section-title"><div><span class="eyebrow">${escapeHtml(i18n('RIEN TROUVÉ'))}</span><h3>🚫 ${escapeHtml(i18n('Recherches sans résultat'))}${negs.length?` <span class="investigation-media-total">(${negs.length})</span>`:''}</h3></div><div class="page-actions"><button type="button" class="button small secondary" data-enq-neg-add data-enq-edit>${escapeHtml(i18n('＋ Recherche sans résultat'))}</button></div></div>
            ${negs.length?`<div class="data-table-wrap"><table class="data-table enq-neg-table"><thead><tr><th>${escapeHtml(i18n('Fonds ou archives'))}</th><th>${escapeHtml(i18n('Cote'))}</th><th>${escapeHtml(i18n('Années parcourues'))}</th><th>${escapeHtml(i18n('Le'))}</th><th>${escapeHtml(i18n('Note'))}</th><th class="enq-neg-att-th"><span aria-label="${escapeHtml(i18n('Pièces jointes'))}" title="${escapeHtml(i18n('Pièces jointes'))}">📎</span></th><th></th></tr></thead><tbody>${negs.map(n=>`<tr data-enq-neg="${n.id}"><td>${escapeHtml(n.repository)}</td><td><b>${escapeHtml(n.cote)}</b></td><td>${escapeHtml(yearsText(n))}</td><td>${escapeHtml(frDate(n.searched_on))}</td><td><small>${escapeHtml(n.note)}</small></td><td class="enq-neg-att-cell">${negAttachBadge(n)}</td><td class="enq-neg-act"><button type="button" class="icon-button small" data-enq-neg-menu="${n.id}" aria-label="${escapeHtml(i18n('Plus d’actions'))}" title="${escapeHtml(i18n('Plus d’actions'))}" data-enq-edit>⋯</button></td></tr>`).join('')}</tbody></table></div>`
            :`<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🚫</span><span class="empty-line-text">${escapeHtml(i18n('Note ici chaque registre parcouru sans rien trouver : l’app te prévient avant de le refaire.'))}</span></p>`}</section>`;
    }
    function openNegativeDialog(id,n,reload){
        n=n||{};
        const dlg=document.createElement('dialog');dlg.className='modal enq-neg-dialog';
        const today=new Date().toISOString().slice(0,10);
        dlg.innerHTML=`<form method="dialog" novalidate><div class="modal-head"><div><span class="eyebrow">${escapeHtml(i18n('ENQUÊTE'))}</span><h2>🚫 ${escapeHtml(n.id?i18n('Modifier la recherche sans résultat'):i18n('Recherche sans résultat'))}</h2></div><button type="button" class="icon-button" data-x aria-label="${escapeHtml(i18n('Fermer'))}">×</button></div>
            <div class="form-grid"><label class="span-2">${escapeHtml(i18n('Fonds ou archives'))}<input name="repository" value="${escapeHtml(n.repository||'')}" placeholder="${escapeHtml(i18n('Ex. AD de la Corrèze, registres paroissiaux de Naves'))}"></label>
            <label class="span-2">${escapeHtml(i18n('Cote'))}<input name="cote" value="${escapeHtml(n.cote||'')}" placeholder="${escapeHtml(i18n('Ex. 3 E 145/2'))}" data-enq-neg-cote></label>
            <label>${escapeHtml(i18n('Années parcourues : de'))}<input name="year_from" type="number" min="1000" max="2100" value="${escapeHtml(n.year_from||'')}" data-enq-neg-y></label><label>${escapeHtml(i18n('à'))}<input name="year_to" type="number" min="1000" max="2100" value="${escapeHtml(n.year_to||'')}" data-enq-neg-y></label>
            <label>${escapeHtml(i18n('Parcouru le'))}<input name="searched_on" type="date" value="${escapeHtml(n.searched_on||today)}"></label><span></span>
            <label class="span-2">${escapeHtml(i18n('Note'))}<textarea name="note" rows="2">${escapeHtml(n.note||'')}</textarea></label></div>
            <div class="enq-neg-att" data-enq-neg-att><div class="enq-neg-att-line"><span class="enq-neg-att-label">📎 ${escapeHtml(i18n('Pièces jointes'))}</span>${kiosk()?'':`<span class="enq-neg-att-acts"><button type="button" class="button small secondary" data-enq-neg-img title="${escapeHtml(i18n('Une ou plusieurs images de l’ordinateur : elles entrent dans les médias de l’app. Tu peux aussi les glisser ici.'))}">${escapeHtml(i18n('＋ Images…'))}</button><button type="button" class="button small secondary" data-enq-neg-pick title="${escapeHtml(i18n('Des images déjà dans l’app'))}">🖼 ${escapeHtml(i18n('Déjà dans l’app…'))}</button>${deskFolders()?`<button type="button" class="button small secondary" data-enq-neg-dir title="${escapeHtml(i18n('Seul le chemin du dossier est gardé : rien n’est copié.'))}">${escapeHtml(i18n('📁 Un dossier…'))}</button>`:''}<input type="file" accept="image/*" multiple hidden data-enq-neg-file></span>`}</div>
            <div class="enq-neg-thumbs" data-enq-neg-thumbs></div><div class="enq-neg-dirline" data-enq-neg-dirline></div></div>
            <div class="enq-neg-warn" data-enq-neg-warn hidden></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>${escapeHtml(i18n('Annuler'))}</button><button type="submit" class="button" data-enq-neg-go>${escapeHtml(i18n('Enregistrer'))}</button></div></form>`;
        document.body.appendChild(dlg);
        const f=dlg.querySelector('form'),warn=dlg.querySelector('[data-enq-neg-warn]');
        const check=async()=>{
            const cote=f.cote.value.trim();if(!cote){warn.hidden=true;return [];}
            let r;try{r=await plusGet('check_negative',{cote,year_from:f.year_from.value,year_to:f.year_to.value,except:n.id||0});}catch(_){return [];}
            const m=r.matches||[];warn.hidden=!m.length;
            warn.innerHTML=m.length?`<p>⚠️ <b>${escapeHtml(i18n('Déjà parcouru :'))}</b></p><ul>${m.slice(0,5).map(x=>`<li>${escapeHtml(i18n('{cote} ({years}) le {d}, enquête « {title} »',{cote:x.cote,years:yearsText(x)||i18n('années non notées'),d:frDate(x.searched_on),title:x.investigation_title||'?'}))}</li>`).join('')}</ul>`:'';
            return m;
        };
        dlg.querySelectorAll('[data-enq-neg-cote],[data-enq-neg-y]').forEach(i=>i.addEventListener('input',()=>{clearTimeout(f._t);f._t=setTimeout(check,250);}));
        /* 📎 pièces jointes : la liste vit dans la fenêtre, elle est gardée avec « Enregistrer » */
        const att={media:(n.media||[]).map(m=>({...m})),folder:n.folder_path||''};
        const thumbs=dlg.querySelector('[data-enq-neg-thumbs]'),dirLine=dlg.querySelector('[data-enq-neg-dirline]');
        const paintAtt=()=>{
            thumbs.innerHTML=att.media.map((m,i)=>`<span class="enq-neg-thumb" data-enq-neg-thumb="${m.id}"><button type="button" class="enq-neg-thumb-img" data-enq-neg-tview="${i}" title="${escapeHtml(m.title||m.filename||'')}"><img src="${escapeHtml(negThumbSrc(m))}" alt="${escapeHtml(m.title||'')}"></button>${kiosk()?'':`<button type="button" class="enq-neg-thumb-x" data-enq-neg-tx="${i}" aria-label="${escapeHtml(i18n('Retirer'))}" title="${escapeHtml(i18n('Retirer'))}">×</button>`}</span>`).join('');
            dirLine.innerHTML=att.folder?`<span class="enq-neg-dirchip">${deskFolders()&&!kiosk()?`<button type="button" class="table-link" data-enq-neg-dopen title="${escapeHtml(att.folder)}">📁 ${escapeHtml(folderLabel(att.folder))}</button>`:`<span title="${escapeHtml(att.folder)}">📁 ${escapeHtml(folderLabel(att.folder))}</span>`}${kiosk()?'':`<button type="button" class="enq-neg-thumb-x" data-enq-neg-dx aria-label="${escapeHtml(i18n('Retirer'))}" title="${escapeHtml(i18n('Retirer'))}">×</button>`}</span>`:'';
        };
        const addMedia=list=>{const have=new Set(att.media.map(m=>Number(m.id)));list.filter(m=>m&&Number(m.id)>0&&!have.has(Number(m.id))).forEach(m=>{have.add(Number(m.id));att.media.push(m);});paintAtt();};
        const importFiles=async files=>{
            if(kiosk())return;
            const imp=A().importMediaFile||window.LCNDA_PICKER?.importMediaFile;if(!imp){toast(i18n('L’import des images n’est pas disponible.'),'error');return;}
            const imgs=[...files].filter(fl=>/^image\//.test(fl.type||''));if(!imgs.length){toast(i18n('Ici, il faut une image.'),'error');return;}
            const got=[];thumbs.classList.add('is-busy');
            for(const fl of imgs){try{got.push(await imp(fl,['image']));}catch(error){toast(error.message,'error');}}
            thumbs.classList.remove('is-busy');addMedia(got);
            if(got.length)toast(i18n(got.length>1?'{n} images ajoutées aux médias de l’app.':'Image ajoutée aux médias de l’app.',{n:got.length}));
        };
        paintAtt();
        if(!kiosk()){
            const fileIn=dlg.querySelector('[data-enq-neg-file]');
            dlg.querySelector('[data-enq-neg-img]')?.addEventListener('click',()=>fileIn?.click());
            fileIn?.addEventListener('change',()=>{const fl=[...fileIn.files];fileIn.value='';if(fl.length)importFiles(fl);});
            UI().bindFileDrop?.(dlg.querySelector('[data-enq-neg-att]'),importFiles,{accept:'image/*'});
            UI().bindFileDrop?.(f,importFiles,{accept:'image/*',paste:false});
            dlg.querySelector('[data-enq-neg-pick]')?.addEventListener('click',async()=>{
                const open=A().openMediaPicker||window.LCNDA_PICKER?.openMediaPicker;if(!open){toast(i18n('Le choix des médias n’est pas disponible.'),'error');return;}
                const list=await open({multiple:true,types:['image'],value:att.media,eyebrow:i18n('ENQUÊTE'),title:i18n('Images de la recherche sans résultat'),okLabel:i18n('Joindre')});
                if(Array.isArray(list)){const keep=new Set(list.map(m=>Number(m.id)));att.media=att.media.filter(m=>keep.has(Number(m.id)));addMedia(list);}
            });
            dlg.querySelector('[data-enq-neg-dir]')?.addEventListener('click',async()=>{
                if(!deskFolders())return;
                try{const r=await window.lcnda.chooseFolder();if(r&&!r.canceled&&r.dir){att.folder=String(r.dir);paintAtt();}}catch(error){toast(error.message,'error');}
            });
        }
        dlg.querySelector('[data-enq-neg-att]').addEventListener('click',e=>{
            const v=e.target.closest('[data-enq-neg-tview]');if(v){openLightbox(att.media.map(m=>({...m})),Number(v.dataset.enqNegTview),true);return;}
            if(e.target.closest('[data-enq-neg-dopen]')){openNegativeFolder(att.folder);return;}
            const x=e.target.closest('[data-enq-neg-tx]');
            if(x&&!kiosk()){const i=Number(x.dataset.enqNegTx),m=att.media[i];if(!m)return;att.media.splice(i,1);paintAtt();
                undoToast(i18n('Image retirée de la recherche'),{undo:async()=>{if(!att.media.some(y=>Number(y.id)===Number(m.id)))att.media.splice(Math.min(i,att.media.length),0,m);paintAtt();},redo:async()=>{att.media=att.media.filter(y=>Number(y.id)!==Number(m.id));paintAtt();}});return;}
            if(e.target.closest('[data-enq-neg-dx]')&&!kiosk()){const old=att.folder;att.folder='';paintAtt();
                undoToast(i18n('Dossier retiré de la recherche'),{undo:async()=>{att.folder=old;paintAtt();},redo:async()=>{att.folder='';paintAtt();}});}
        });
        dlg.addEventListener('click',e=>{if(e.target.closest('[data-x]'))dlg.close();});
        dlg.addEventListener('close',()=>dlg.remove());
        f.addEventListener('submit',async e=>{
            e.preventDefault();
            if(!f.cote.value.trim()&&!f.repository.value.trim()){toast(i18n('Donne au moins la cote ou le fonds parcouru.'),'error');return;}
            try{await plusPost('save_negative',{investigation_id:id,id:n.id||0,repository:f.repository.value,cote:f.cote.value,year_from:f.year_from.value,year_to:f.year_to.value,searched_on:f.searched_on.value,note:f.note.value,media_ids:att.media.map(m=>Number(m.id)),folder_path:att.folder});dlg.close();toast(i18n('Recherche sans résultat notée.'));await reload();}
            catch(error){toast(error.message,'error');}
        });
        dlg.showModal();
        if(n.cote)check();
    }
    async function deleteNegative(nid,reload){
        try{const r=await plusPost('delete_negative',{id:nid});await reload();
            undoToast(i18n('Recherche sans résultat supprimée'),{undo:async()=>{await plusPost('restore_negative',{row:r.row});await reload();},redo:async()=>{await plusPost('delete_negative',{id:nid});await reload();}});
        }catch(error){toast(error.message,'error');}
    }
    /* ── 🧩 pistes en colonnes : À explorer → En cours → Explorée → Impasse (glisser une carte, ou son « ⋯ ») ── */
    const KANBAN=[['todo','À explorer',['to_explore_priority','to_explore']],['doing','En cours',['promising']],['done','Explorée',['explored']],['dead','Impasse',['closed']]];
    const colOf=st=>KANBAN.find(c=>c[2].includes(st))?.[0]||'done';
    const statusFor=(col,old)=>col==='todo'?(old==='to_explore_priority'?old:'to_explore'):col==='doing'?'promising':col==='dead'?'closed':'explored';
    function kanbanHtml(items){
        return `<div class="enq-kanban" data-enq-kanban>${KANBAN.map(([k,label])=>{const list=items.filter(it=>colOf(it.status)===k);return `<section class="enq-kcol" data-enq-kcol="${k}"><h4>${escapeHtml(i18n(label))} <small>${list.length}</small></h4><div class="enq-kcards" data-enq-kdrop="${k}">${list.map(it=>`<article class="enq-kcard${it.status==='to_explore_priority'?' is-priority':''}" draggable="${kiosk()?'false':'true'}" data-enq-kcard="${it.id}" tabindex="0"><span class="investigation-item-kind-badge">${escapeHtml(i18n(ITEM_KIND[it.kind]||it.kind))}</span><b>${escapeHtml(it.title)}</b>${it.status==='to_explore_priority'?`<small class="enq-kprio">${escapeHtml(i18n('prioritaire'))}</small>`:''}<button type="button" class="icon-button small enq-more" data-enq-kmenu="${it.id}" aria-label="${escapeHtml(i18n('Plus d’actions'))}" title="${escapeHtml(i18n('Plus d’actions'))}">⋯</button></article>`).join('')||`<small class="muted enq-kempty">${escapeHtml(i18n('Glisse une piste ici'))}</small>`}</div></section>`;}).join('')}</div>`;
    }
    async function moveItem(id,item,col,reload){
        const status=statusFor(col,item.status),old=item.status;if(status===old)return;
        try{await plusPost('item_status',{item_id:item.id,status});await reload();
            undoToast(i18n('Piste « {title} » : {col}',{title:item.title,col:i18n(KANBAN.find(c=>c[0]===col)?.[1]||'')}),{undo:async()=>{await plusPost('item_status',{item_id:item.id,status:old});await reload();},redo:async()=>{await plusPost('item_status',{item_id:item.id,status});await reload();}});
        }catch(error){toast(error.message,'error');}
    }
    function itemMenuItems(id,item,reload,data){
        const ro=kiosk(),out=[];
        if(item.url)out.push({icon:'↗',label:i18n('Ouvrir le lien'),run:()=>window.open(safeUrl(item.url),'_blank','noopener')});
        if(!ro){out.push({icon:'✎',label:i18n('Modifier'),run:()=>openInvestigationItemDialog(id,item)});
            out.push({icon:'🖼',label:i18n('Relier un média'),run:()=>openInvestigationMediaDialog(id,data.investigation.person_id,[],[Number(item.id)],data.items,null,data.folders||[])});
            const CX=window.LCNDA_EXT?.connexions;if(CX?.enabled?.()!==false&&CX)out.push({icon:'📥',label:i18n('Prendre dans cette piste…'),run:()=>CX.openTake({dest:CX.pisteDest(id,item)})}); // 🧺 plusieurs pièces par piste (heritage-connexions.js)
            const NX=window.LCNDA_EXT?.cxNeeds;if(NX?.enabled?.())out.push({icon:'🧩',label:i18n('Ce qui manque… (quoi · qui · où · quand)'),run:()=>NX.edit({item,investigation_id:id,person_id:Number(data.investigation.person_id)||0,after:reload})}); // 🧩 la piste dit ce qu'elle cherche
            if(window.LCNDA_EXT?.openActLetter)out.push({icon:'📮',label:i18n('Demander l’acte… (relié à cette piste)'),run:()=>window.LCNDA_EXT.openActLetter({person_id:Number(data.investigation.person_id),item_id:Number(item.id),item_title:item.title})});
            out.push('-',...KANBAN.filter(c=>c[0]!==colOf(item.status)).map(([k,label])=>({icon:'→',label:i18n('Mettre dans « {col} »',{col:i18n(label)}),run:()=>moveItem(id,item,k,reload)})));
            out.push('-',{icon:'🗑',label:i18n('Supprimer'),danger:true,run:()=>$(`[data-delete-investigation-item="${item.id}"]`)?.click()||deleteItemNow(id,item.id,reload)});}
        return out;
    }
    async function deleteItemNow(id,iid,reload){const del=()=>postR('delete_investigation_item',{id:iid});try{await del();undoDelete({type:'investigation_item',id:iid,message:i18n('Piste supprimée'),redo:del,after:reload});await reload();}catch(error){toast(error.message,'error');}}
    function bindKanban(id,data,reload){
        const box=$('[data-enq-kanban]');if(!box)return;
        const byId=iid=>data.items.find(i=>Number(i.id)===Number(iid));
        let dragged=0;
        box.addEventListener('dragstart',e=>{const c=e.target.closest('[data-enq-kcard]');if(!c||kiosk())return;dragged=Number(c.dataset.enqKcard);e.dataTransfer.setData('text/enq-item',String(dragged));e.dataTransfer.effectAllowed='move';c.classList.add('is-dragging');});
        box.addEventListener('dragend',e=>{e.target.closest?.('[data-enq-kcard]')?.classList.remove('is-dragging');box.querySelectorAll('.is-drop-target').forEach(x=>x.classList.remove('is-drop-target'));});
        box.querySelectorAll('[data-enq-kdrop]').forEach(zone=>{
            zone.addEventListener('dragover',e=>{if(!dragged&&!e.dataTransfer.types.includes('text/enq-item'))return;e.preventDefault();zone.classList.add('is-drop-target');});
            zone.addEventListener('dragleave',()=>zone.classList.remove('is-drop-target'));
            zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('is-drop-target');const iid=Number(e.dataTransfer.getData('text/enq-item'))||dragged;dragged=0;const it=byId(iid);if(it)moveItem(id,it,zone.dataset.enqKdrop,reload);});
        });
        box.addEventListener('click',e=>{const m=e.target.closest('[data-enq-kmenu]');if(m){const it=byId(m.dataset.enqKmenu);if(it)UI().menuAt?.(m,itemMenuItems(id,it,reload,data),{title:`« ${it.title.slice(0,50)} »`});return;}});
        box.addEventListener('dblclick',e=>{const c=e.target.closest('[data-enq-kcard]');if(c&&!kiosk()){const it=byId(c.dataset.enqKcard);if(it)openInvestigationItemDialog(id,it);}});
        box.addEventListener('contextmenu',e=>{const c=e.target.closest('[data-enq-kcard]');if(!c||e.shiftKey||!UI().contextMenu)return;const it=byId(c.dataset.enqKcard);if(!it)return;e.preventDefault();UI().contextMenu(e,itemMenuItems(id,it,reload,data),{title:`« ${it.title.slice(0,50)} »`});});
        // au clavier : ← → changent de colonne
        box.addEventListener('keydown',e=>{const c=e.target.closest('[data-enq-kcard]');if(!c||kiosk()||!['ArrowLeft','ArrowRight'].includes(e.key))return;const it=byId(c.dataset.enqKcard);const i=KANBAN.findIndex(k=>k[0]===colOf(it.status)),j=i+(e.key==='ArrowRight'?1:-1);if(j<0||j>=KANBAN.length)return;e.preventDefault();moveItem(id,it,KANBAN[j][0],reload);});
    }
    function renderInvestigationsSidebar(content,footer){
        const isBattue=state.enquetesTab==='battue',isAtelier=state.enquetesTab==='atelier';
        const tabs=`<div class="segmented enquetes-tab-toggle">${[['enquetes','🔍','Enquêtes'],['battue','🔦','Battue'],['atelier','📚','Atelier'],['tableaux','🧩','Tableaux']].map(([k,icon,label])=>`<button class="${state.enquetesTab===k||(k==='enquetes'&&!['battue','atelier','tableaux'].includes(state.enquetesTab))?'is-active ':''}enquetes-tab-btn" data-enquetes-tab="${k}"><span class="enquetes-tab-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}</div>`;
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
        // R2 : la barre commune H10 (🔍 Chercher · Filtrer ▾ · Liste | Fiches · Trier) ; plus de bouton « ⌕ »
        content.innerHTML=`${tabs}<div class="enq-bar" data-enq-bar></div><p class="enquetes-tab-help">${escapeHtml(i18n(isBattue?'Recherche commune par commune : les registres parcourus, ville par ville.':'Une question à résoudre : ses pistes, ses pièces, sa conclusion.'))}</p>`;
        footer.innerHTML=kiosk()?'':`<button class="button small" id="new-investigation-global">${isBattue?'＋ Nouvelle battue':'＋ Nouvelle enquête'}</button>${isBattue?'':`<button class="button small secondary" id="new-investigation-template" title="${escapeHtml(i18n('« Trouver les parents de… », « Retrouver un soldat », « Émigré » : questions et pistes préparées'))}">🗂 ${escapeHtml(i18n('Depuis un modèle…'))}</button>`}`;
        content.addEventListener('click',event=>{const tab=event.target.closest('[data-enquetes-tab]');if(tab){state.enquetesTab=tab.dataset.enquetesTab;state.currentInvestigationId=0;state.currentBattueId=0;persistUiState();renderSidebar();renderInvestigations();}},{signal:sidebarSignal()});
        const statusOpts=[['all',i18n(isBattue?'Toutes':'Toutes')],['open',i18n('En cours')],['paused',i18n('En pause')],['closed',i18n('Terminées')]];
        const filters=[{id:'status',label:i18n('État'),type:'radio',options:statusOpts,value:state.investigationStatus||'all',dflt:'all'}];
        if(!isBattue)filters.push({id:'person',label:i18n('Personne'),type:'person',chipPrefix:'👤',value:state.investigationPersonPick||''});
        const setPersonPick=v=>{state.investigationPersonPick=v&&typeof v==='object'&&v.id?{id:Number(v.id),title:v.title||''}:'';state.investigationPerson=state.investigationPersonPick?state.investigationPersonPick.id:0;};
        const sortKey=isBattue?'battueSort':'investigationSort';
        const bar=UI().listBar?UI().listBar({key:isBattue?'enquetes-battues':'enquetes',remember:'given',search:{placeholder:i18n(isBattue?'Chercher une battue… (nom, commune, cible)':'Chercher une enquête… (personne, acte, lieu)'),value:state.investigationQuery||''},filters,
            view:{key:isBattue?'enquetes-battues':'enquetes',value:state.investigationDisplay==='cards'?'cards':'list',what:isBattue?'battues':'enquêtes'},
            sort:{options:Object.entries(sortOptionLabels).map(([v,l])=>[v,i18n(l)]),value:state[sortKey]||''},
            onChange:(st,{what}={})=>{
                if(what==='q'){state.investigationQuery=st.q;}
                state.investigationStatus=st.filters.status||'all';setPersonPick(st.filters.person);
                state.investigationDisplay=st.view==='cards'?'cards':'list';state[sortKey]=st.sort||'';
                state.currentInvestigationId=0;state.investigationFolderId=0;state.currentBattueId=0;persistUiState();renderInvestigations();
            }}):null;
        if(bar){content.querySelector('[data-enq-bar]').appendChild(bar);const st=bar.state;state.investigationStatus=st.filters.status||'all';setPersonPick(st.filters.person);state.investigationQuery=st.q||'';}
        $('#new-investigation-global')?.addEventListener('click',()=>{if(state.enquetesTab==='battue')openBattueDialog();else openInvestigationDialog(state.currentPersonId);});
        $('#new-investigation-template')?.addEventListener('click',()=>openTemplateDialog());
    }

    async function renderInvestigations(token=++state.workspaceToken){
        clearInterval(chronoTimer);
        if(state.currentInvestigationId)return renderInvestigationDetail(state.currentInvestigationId,token);
        if(state.enquetesTab==='battue')return renderBattues(token);
        if(state.enquetesTab==='atelier'&&window.LCNDA_EXT?.atelier)return window.LCNDA_EXT.atelier(token);
        if(state.enquetesTab==='tableaux'&&window.LCNDA_EXT?.boards)return window.LCNDA_EXT.boards(token);
        const wait=waitLater(token,'Chargement des enquêtes…');
        let data,times={};
        try{[data,times]=await Promise.all([api('investigations',{status:state.investigationStatus,q:state.investigationQuery}),plusGet('times').then(r=>r.times||{}).catch(()=>({}))]);}finally{clearTimeout(wait);}
        if(token!==state.workspaceToken||state.module!=='enquetes')return;
        const pid=Number(state.investigationPerson)||0;
        const list=pid?data.investigations.filter(item=>Number(item.person_id)===pid):data.investigations;
        const sortedInvestigations=applyListSort(list,state.investigationSort,'title','created_at');
        const statusOf=st=>st==='closed'?['Terminée','grey']:st==='paused'?['En pause','yellow']:['En cours','blue'];
        const timeOf=item=>times[item.id]?.elapsed?` · ⏱ ${hm(times[item.id].elapsed)}`:'';
        // K9 : la vignette unique (UI.cardsHtml) ; R11 : « ⋯ » et clic droit
        const invCards=list=>window.LCNDA_UI.cardsHtml(list.map(item=>({thumb:'<span class="ui-card-ico">🔍</span>',name:item.title,open:`data-open-investigation="${item.id}"`,attrs:`data-enq-row="inv:${item.id}" data-enq-title="${escapeHtml(item.title)}"`,quick:menuBtn('inv',item.id,item.title),lines:[item.person_name||'',item.question||'Aucune question détaillée.'],badges:[{text:statusOf(item.status)[0],kind:statusOf(item.status)[1]},{text:`${plural(item.item_count,'piste')} · ${plural(item.media_count,'média')}${timeOf(item)}`,kind:'grey'},...(times[item.id]?.concluded?[{text:i18n('✅ Conclue'),kind:'green'}]:[])],when:item.created_at,whenLabel:'Créée',menu:item.person_id?[`<button type="button" data-open-person="${item.person_id}">${i18n('↗ Fiche de {name}',{name:escapeHtml(item.person_name||i18n('la personne'))})}</button>`]:[]})));const cards=sortedInvestigations.length?invCards(sortedInvestigations):'';
        const rows=sortedInvestigations.map(item=>[item.person_name,item.title,item.status==='closed'?'Terminée':item.status==='paused'?'En pause':'En cours',`${plural(item.item_count,'piste')}${timeOf(item)}`,{label:'Ouvrir',personId:null,investigationId:item.id,title:item.title}]);
        // 🗂 « Ranger par personne » (case de cet écran, non au départ ; seulement si le réglage « Un cadre par personne » est mis)
        const byPerson=!!(window.LCNDA_UI.framesOn?.()&&window.LCNDA_UI.framesPref('enquetes'));
        const invGroups=byPerson?window.LCNDA_UI.groupByPerson(sortedInvestigations.map((item,i)=>({item,row:rows[i]})),x=>x.item.person_id).map(g=>({key:g.key,name:g.items[0].item.person_name||'',items:g.items.map(x=>x.item),rows:g.items.map(x=>x.row)})):null;
        const cardsBy=invGroups&&cards?window.LCNDA_UI.personCardsHtml(invGroups.map(g=>window.LCNDA_UI.personCardHtml({id:g.key,name:g.key?g.name:i18n('Sans personne'),count:plural(g.items.length,'enquête'),body:invCards(g.items)})).join('')):cards;
        const csvRows=[[i18n('Personne'),i18n('Enquête'),i18n('État'),i18n('Pistes'),i18n('Médias'),i18n('Temps passé'),i18n('Question'),i18n('Créée le')],...sortedInvestigations.map(item=>[item.person_name||'',item.title,i18n(statusOf(item.status)[0]),item.item_count,item.media_count,times[item.id]?.elapsed?hm(times[item.id].elapsed):'',item.question||'',item.created_at||''])];
        const primary=kiosk()?'':`<button type="button" class="button" data-enq-new>＋ ${escapeHtml(i18n('Nouvelle enquête'))}</button>`;
        $('#workspace').innerHTML=`<section class="page enq-list-page">${window.LCNDA_UI.pageHeader({title:'Enquêtes',help:'Questions en cours, documents consultés, pistes prometteuses et hypothèses écartées.',primary,actions:[exportButtons()],more:kiosk()?[]:[`<button type="button" data-enq-tpl>🗂 ${escapeHtml(i18n('Nouvelle enquête depuis un modèle…'))}</button>`]})}<div class="inv-countbar"><span class="muted">${plural(sortedInvestigations.length,'enquête')}</span></div>${state.investigationDisplay==='cards'?`<div class="investigation-cards">${cardsBy||emptyState({text: 'Aucune enquête dans cette sélection.', icon:'🔍',hint:'Une enquête rassemble les pistes, médias et notes d’une question à résoudre.',action:{label:'＋ Nouvelle enquête',attrs:'data-empty-click="#new-investigation-global"'}})}</div>`:investigationTable(rows,invGroups)}</section>`;bindInvestigationLinks();
        const page=$('.enq-list-page');bindRowMenus(page);readOnly(page);page.querySelector('.inv-countbar')?.append(window.LCNDA_UI.framesOption?.('enquetes',()=>renderInvestigations())||'');
        page.querySelector('[data-enq-new]')?.addEventListener('click',()=>openInvestigationDialog(state.currentPersonId));
        page.querySelector('[data-enq-tpl]')?.addEventListener('click',()=>openTemplateDialog());
        page.querySelector('[data-enq-export]')?.addEventListener('click',()=>exportList('enquetes',csvRows,i18n('Enquêtes')));
        page.querySelector('[data-enq-print]')?.addEventListener('click',()=>UI().printPage?.(i18n('Enquêtes')));
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
    const battueCommuneStatusText=(statuses,status)=>statuses?.[status]||i18n('À faire');
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
        const wait=waitLater(token,'Chargement des battues…');
        let data;try{data=await api('battues',{status:state.investigationStatus,q:state.investigationQuery});}finally{clearTimeout(wait);}
        if(token!==state.workspaceToken||state.module!=='enquetes'||state.enquetesTab!=='battue')return;
        state.battueTargetTypes=data.target_types||state.battueTargetTypes;
        const sortedBattues=applyListSort(data.battues,state.battueSort,'title','created_at');
        const csvRows=[[i18n('Battue'),i18n('Recherche'),i18n('Commune de départ'),i18n('Code'),i18n('Niveau'),i18n('État'),i18n('Annotations'),i18n('À chercher'),i18n('Créée le')],...sortedBattues.map(b=>[b.title,`${battueTargetText(data.target_types,b.target_type)}${b.target_text?` · ${b.target_text}`:''}`,b.start_name||'',b.start_insee_code||'',Number(b.max_level||0),i18n(battueStatusText(b.status)),Number(b.item_count||0),Number(b.todo_count||0),b.created_at||''])];
        const primary=kiosk()?'':`<button type="button" class="button" data-enq-new>＋ ${escapeHtml(i18n('Nouvelle battue'))}</button>`;
        $('#workspace').innerHTML=`<section class="page battue-page">${window.LCNDA_UI.pageHeader({title:'Battues',help:'Recherche commune par commune, niveaux de voisinage et suivi des tables consultées.',primary,actions:[exportButtons()]})}<div class="inv-countbar"><span class="muted">${plural(data.battues.length,'battue')}</span></div>
        <div id="battue-countries"></div>
        ${state.investigationDisplay==='cards'?battueCardsHtml(sortedBattues,data.target_types):battueTable(sortedBattues,data.target_types)}</section>`;
        if(!kiosk())renderBattueCountries(token);
        $$('[data-open-battue]').forEach(button=>button.addEventListener('click',()=>{state.currentBattueId=Number(button.dataset.openBattue);persistUiState();renderBattues();}));
        const page=$('.battue-page');bindRowMenus(page);readOnly(page);
        page.querySelector('[data-enq-new]')?.addEventListener('click',()=>openBattueDialog());
        page.querySelector('[data-enq-export]')?.addEventListener('click',()=>exportList('battues',csvRows,i18n('Battues')));
        page.querySelector('[data-enq-print]')?.addEventListener('click',()=>UI().printPage?.(i18n('Battues')));
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
        const checkbox=code=>{const info=details[code];const extra=!info.present&&!active.has(code)?` <small class="muted">${i18n('{size} à télécharger',{size:escapeHtml(megabytes(info.size||0))})}</small>`:'';return `<label class="check-row"><input type="checkbox" data-battue-country="${escapeHtml(code)}" ${active.has(code)?'checked':''}> ${escapeHtml(info.name)}${extra}</label>`;};
        const counted=codes=>{const n=codes.filter(code=>active.has(code)).length;return n?` <small>${n}/${codes.length}</small>`:'';};
        box.innerHTML=`<section class="maintenance-panel battue-countries"><h3>Pays des battues</h3><p>La France est toujours disponible. Ajoute les pays utiles à tes recherches : leurs communes, leurs anciennes communes et les communes voisines de part et d’autre des frontières. Certains pays sont téléchargés la première fois qu’on les coche (il faut alors internet), puis restent sur l’ordinateur.</p>${groups.map(([title,codes],index)=>`<details class="battue-country-group" ${codes.some(code=>active.has(code))||title==='Europe de l’Ouest'?'open':''}><summary>${escapeHtml(title)}${counted(codes)}</summary><div class="check-row-list">${codes.map(checkbox).join('')}</div><div class="battue-countries-actions"><button type="button" class="button small secondary" data-battue-countries-all="1" data-battue-group="${index}">Tout cocher</button><button type="button" class="button small secondary" data-battue-countries-all="0" data-battue-group="${index}">Tout décocher</button></div></details>`).join('')}<div class="battue-countries-actions"><button type="button" class="button small" data-battue-countries-all="1">Tout cocher (tous les pays)</button><button type="button" class="button small" data-battue-countries-all="0">Tout décocher (tous les pays)</button></div><p class="muted" data-battue-country-status></p></section>`;
        const status=box.querySelector('[data-battue-country-status]');
        const lock=on=>box.querySelectorAll('input,button').forEach(el=>el.disabled=on);
        // Ajout d'un pays : s'il n'est pas sur l'ordinateur, on télécharge d'abord son fichier (Electron, sinon le serveur PHP)
        const setCountry=async(country,enabled)=>{
            try{return await api('set_reference_country',{}, {method:'POST',body:{country,enabled}});}
            catch(error){
                if(!enabled||!/téléchargées/.test(String(error.message||'')))throw error;
                status.textContent=i18n('Téléchargement : {name} ({size})…',{name:details[country]?.name||country,size:megabytes(details[country]?.size||0)});
                if(window.lcnda?.downloadReference){const r=await window.lcnda.downloadReference(country);if(!r?.ok)throw new Error(r?.error||'Téléchargement impossible.');}
                else await api('download_reference_country',{}, {method:'POST',body:{country}});
                status.textContent=i18n('Ajout des communes : {name}…',{name:details[country]?.name||country});
                return api('set_reference_country',{}, {method:'POST',body:{country,enabled}});
            }
        };
        box.querySelectorAll('[data-battue-country]').forEach(input=>input.addEventListener('change',async()=>{
            lock(true);
            status.textContent=input.checked?'Ajout des communes en cours…':'Retrait en cours…';
            try{
                const r=await setCountry(input.dataset.battueCountry,input.checked);
                toast(input.checked?i18n('{communes} ({links} avec les pays voisins).',{communes:plural(r.communes,'commune ajoutée','communes ajoutées'),links:plural(r.border_links,'lien de voisinage','liens de voisinage')}):`${plural(r.communes,'commune retirée','communes retirées')}.`);
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
            if(toDownload.length&&!await confirmBox(i18n('{n} à télécharger ({size} en tout). Continuer ?',{n:plural(toDownload.length,'pays'),size:megabytes(toDownload.reduce((sum,info)=>sum+(info.size||0),0))}),{title:'Télécharger les pays ?',okLabel:'Télécharger'}))return;
            // Beaucoup de lieux copiés dans la base (≈ 250 octets chacun) : on prévient avant
            const places=enabled?todo.reduce((sum,input)=>sum+(details[input.dataset.battueCountry]?.places||0),0):0;
            if(places>300000&&!await confirmBox(i18n('Cela ajoutera environ {n} lieux à ta base (environ {size} de plus). Les pays restent retirables à tout moment. Continuer ?',{n:places,size:megabytes(places*250)}),{title:'Ajouter beaucoup de lieux ?',okLabel:'Ajouter les lieux',danger:false}))return;
            lock(true);
            let communes=0;const refused=[];
            for(const [index,input] of todo.entries()){
                const name=details[input.dataset.battueCountry]?.name||input.dataset.battueCountry;
                status.textContent=`${enabled?'Ajout':'Retrait'} : ${name} (${index+1}/${todo.length})…`;
                try{communes+=Number((await setCountry(input.dataset.battueCountry,enabled)).communes||0);}
                catch(_){refused.push(name);}
            }
            toast(`${enabled?plural(communes,'commune ajoutée','communes ajoutées'):plural(communes,'commune retirée','communes retirées')}.`+(refused.length?' '+i18n(enabled?'Non ajoutés : {list} (téléchargement impossible ?).':'Non retirés : {list} (utilisés par une battue).',{list:refused.join(', ')}):''),refused.length?'error':undefined);
            renderBattueCountries(token);
        }));
    }

    function battueCardsHtml(battues,targetTypes){
        // K9 : la vignette unique (UI.cardsHtml)
        const kind=st=>st==='closed'?'grey':st==='paused'?'yellow':'blue';
        return battues.length?window.LCNDA_UI.cardsHtml(battues.map(item=>({thumb:'<span class="ui-card-ico">🗺️</span>',name:item.title,open:`data-open-battue="${item.id}"`,lines:[`${battueTargetText(targetTypes,item.target_type)}${item.target_text?` · ${item.target_text}`:''}`,i18n('{name} ({code}) · niveau {n}',{name:item.start_name||'',code:item.start_insee_code||'',n:Number(item.max_level||0)})],badges:[{text:battueStatusText(item.status),kind:kind(item.status)},{text:`${plural(Number(item.item_count||0),'annotation')} · ${i18n('{n} à chercher',{n:Number(item.todo_count||0)})}`,kind:'grey'}],when:item.created_at,whenLabel:'Créée',attrs:`data-enq-row="battue:${item.id}" data-enq-title="${escapeHtml(item.title)}"`,quick:menuBtn('battue',item.id,item.title)}))):emptyState({text: 'Aucune battue dans cette sélection.', icon:'🗺️',hint:'Une battue suit commune par commune les registres déjà consultés.',action:{label:'＋ Nouvelle battue',attrs:'data-empty-click="#new-investigation-global"'}});
    }

    function battueTable(battues,targetTypes){
        if(!battues.length)return emptyState({text: 'Aucune battue dans cette sélection.', icon:'🗺️',hint:'Une battue suit commune par commune les registres déjà consultés.',action:{label:'＋ Nouvelle battue',attrs:'data-empty-click="#new-investigation-global"'}});
        return `<div class="data-table-wrap battue-table-wrap"><table class="data-table sortable-table" data-sortbar="battue" data-sortbar-fem="1"><thead><tr><th><button data-sort-column="0">Titre</button></th><th><button data-sort-column="1">Recherche</button></th><th><button data-sort-column="2">Commune départ</button></th><th><button data-sort-column="3">État</button></th><th>Suivi</th><th></th></tr></thead><tbody>${battues.map(item=>`<tr data-enq-row="battue:${item.id}" data-enq-title="${escapeHtml(item.title)}"><td data-sort-value="${escapeHtml((item.title||'').toLowerCase())}"><strong>${escapeHtml(item.title)}</strong></td><td data-sort-value="${escapeHtml(battueTargetText(targetTypes,item.target_type).toLowerCase())}">${escapeHtml(battueTargetText(targetTypes,item.target_type))}${item.target_text?`<br><small>${escapeHtml(item.target_text)}</small>`:''}</td><td data-sort-value="${escapeHtml((item.start_name||'').toLowerCase())}">${escapeHtml(item.start_name)}<br><small>${escapeHtml(item.start_insee_code)}</small></td><td data-sort-value="${escapeHtml(battueStatusText(item.status))}">${battueStatusText(item.status)}</td><td>${plural(Number(item.item_count||0),'annotation')}<br><small>${i18n('{n} à chercher · niveau {level}',{n:Number(item.todo_count||0),level:Number(item.max_level||0)})}</small></td><td class="enq-row-act"><button class="button small" data-open-battue="${item.id}">Ouvrir</button>${menuBtn('battue',item.id,item.title)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    async function renderBattueDetail(id,token=++state.workspaceToken){
        const wait=waitLater(token,'Chargement de la battue…');
        let data;try{data=await api('battue_detail',{id});}finally{clearTimeout(wait);}
        if(token!==state.workspaceToken||state.module!=='enquetes'||state.enquetesTab!=='battue')return;
        data.commune_statuses=communeWords(data.commune_statuses); // R9 : À faire · En cours · Terminé
        state.currentBattueDetail=data;
        state.battueTargetTypes=data.target_types||state.battueTargetTypes;
        const b=data.battue, communes=data.communes||[];
        const levels=Object.keys(data.levels||{}).map(Number).sort((a,b)=>a-b);
        const back=`<button class="back-link" id="back-battues">← ${escapeHtml(i18n('Toutes les battues'))}</button>`;
        const help=`${escapeHtml(battueTargetText(data.target_types,b.target_type))}${b.target_text?` · ${escapeHtml(b.target_text)}`:''} · ${i18n('départ {name} ({code})',{name:escapeHtml(b.start_name),code:escapeHtml(b.start_insee_code)})}`;
        const head=window.LCNDA_UI.pageHeader({title:b.title,back,help,detail:true,primary:kiosk()?'':`<button class="button" id="edit-battue">${escapeHtml(i18n('✎ Modifier'))}</button>`,actions:[exportButtons()],more:kiosk()?[]:[`<button type="button" class="is-danger" id="delete-battue">🗑 ${escapeHtml(i18n('Supprimer la battue'))}</button>`]});
        $('#workspace').innerHTML=`<section class="page battue-page battue-detail">${head}
        <div class="battue-map-panel">${battueMapHtml(communes)}</div>
        ${battueProgressHtml(communes)}
        <div class="battue-overview-row">${battueCommuneFilterHtml(data.commune_statuses)}${battueLevelProgressHtml(levels,communes)}</div>
        <div class="battue-levels">${levels.map(level=>battueLevelHtml(level,communes.filter(c=>Number(c.level)===level),data)).join('')}</div></section>`;
        bindBattueDetail(data);
        const page=$('.battue-detail');readOnly(page);pageFind(page,'.battue-commune');
        page.querySelector('[data-enq-export]')?.addEventListener('click',()=>exportList('battue',battueCsvRows(data),b.title));
        page.querySelector('[data-enq-print]')?.addEventListener('click',()=>UI().printPage?.(b.title));
    }
    /* 🧭 l'avancement : registres parcourus (une annotation qui n'est plus « À chercher ») et communes terminées */
    function battueProgressCounts(communes){
        const items=communes.flatMap(c=>c.items||[]),reg=items.filter(i=>(i.status||'todo')!=='todo').length;
        const done=communes.filter(c=>(c.commune_status||'not_started')==='done').length,started=communes.filter(c=>(c.commune_status||'not_started')!=='not_started').length;
        const pct=(n,t)=>t?Math.round(n*100/t):0;
        return {reg,regAll:items.length,regPct:pct(reg,items.length),done,started,all:communes.length,donePct:pct(done,communes.length)};
    }
    function battueProgressHtml(communes){
        const c=battueProgressCounts(communes);
        return `<div class="battue-progress-panel" data-battue-progress><span class="eyebrow">${escapeHtml(i18n('AVANCEMENT'))}</span><div class="battue-progress-bars">
            <div class="battue-pline"><span>${escapeHtml(i18n('Registres parcourus'))}</span><b data-bp-reg>${escapeHtml(i18n('{n}/{all} ({pct} %)',{n:c.reg,all:c.regAll,pct:c.regPct}))}</b><i class="battue-pbar" aria-hidden="true"><em style="width:${c.regPct}%"></em></i></div>
            <div class="battue-pline"><span>${escapeHtml(i18n('Communes terminées'))}</span><b data-bp-com>${escapeHtml(i18n('{n}/{all} ({pct} %)',{n:c.done,all:c.all,pct:c.donePct}))}</b><i class="battue-pbar" aria-hidden="true"><em data-bp-combar style="width:${c.donePct}%"></em></i><small class="muted" data-bp-started>${escapeHtml(i18n('{n} commencées',{n:c.started}))}</small></div></div></div>`;
    }
    function refreshBattueProgress(){
        const box=$('[data-battue-progress]');if(!box)return;
        const c=battueProgressCounts(state.currentBattueDetail?.communes||[]);
        box.querySelector('[data-bp-com]').textContent=i18n('{n}/{all} ({pct} %)',{n:c.done,all:c.all,pct:c.donePct});
        box.querySelector('[data-bp-combar]').style.width=`${c.donePct}%`;
        box.querySelector('[data-bp-started]').textContent=i18n('{n} commencées',{n:c.started});
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
        const regOf=c=>{const it=c.items||[];return it.length?` · ${i18n('{n}/{all} registres parcourus',{n:it.filter(i=>(i.status||'todo')!=='todo').length,all:it.length})}`:'';};
        const paths=communes.flatMap(c=>battueGeometryPaths(c.geometry,bounds,w,h).map(d=>`<path d="${d}" class="battue-map-shape level-${Number(c.level)} commune-status-${escapeHtml(c.commune_status||'not_started')}" data-map-commune="${escapeHtml(c.insee_code)}" data-map-name="${escapeHtml(c.name)}" data-map-country="${escapeHtml(c.country||'')}" data-map-level="${Number(c.level)}" data-commune-status="${escapeHtml(c.commune_status||'not_started')}" tabindex="0"><title>${escapeHtml(c.name)}${c.country?` (${escapeHtml(c.country)})`:''} · niveau ${Number(c.level)} · ${escapeHtml(COMMUNE_WORDS[c.commune_status||'not_started']?i18n(COMMUNE_WORDS[c.commune_status||'not_started']):'')}${escapeHtml(regOf(c))}</title></path>`)).join('');
        const mode=enqPrefs().battueMapColor==='progress'?'progress':'level';
        return `<div class="battue-map-distance-scale" aria-label="Échelle de distance"><span>Échelle</span><strong>${escapeHtml(scale.label)}</strong><i style="width:${scale.width.toFixed(2)}%"></i></div><div class="battue-map-hover" id="battue-map-hover"><span>Commune</span><strong>Survole la carte</strong><small>Nom, pays et niveau</small></div><svg class="battue-map${mode==='progress'?' is-progress':''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Carte des communes de la battue">${paths}</svg><div class="battue-map-legend"><span class="segmented battue-color-mode" role="group" aria-label="${escapeHtml(i18n('Couleurs de la carte'))}"><button type="button" data-battue-color="level" class="${mode==='level'?'is-active':''}">${escapeHtml(i18n('Niveaux'))}</button><button type="button" data-battue-color="progress" class="${mode==='progress'?'is-active':''}">${escapeHtml(i18n('Avancement'))}</button></span><span class="battue-legend-level"${mode==='progress'?' hidden':''}>${battueMapLevels.map(level=>`<span><i class="level-${level}"></i>Niveau ${level}</span>`).join('')}</span><span class="battue-legend-progress"${mode==='progress'?'':' hidden'}>${Object.entries(COMMUNE_WORDS).map(([k,l])=>`<span><i class="commune-status-${k}"></i>${escapeHtml(i18n(l))}</span>`).join('')}</span><button type="button" class="button small secondary battue-colors-button" id="open-battue-level-colors">Couleurs</button><span class="battue-scale">Contours locaux · voisinage par frontière commune</span><span class="battue-boundary-note">Bord sans voisine : limite extérieure possible (mer/océan ou frontière)</span></div>`;
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
        return `<div class="battue-item"><div><strong>${battueSearchTitle(item,data.target_types,data.statuses)}</strong>${item.register?`<small class="battue-register">${escapeHtml(item.register)}</small>`:''}${digestLinks}${item.note?`<p>${escapeHtml(item.note)}</p>`:''}${item.url?`${window.LCNDA_UI.extLink(safeUrl(item.url), '', {cls: 'table-link'})}`:''}${mediaCount?`<small class="battue-register">${plural(mediaCount,'média lié','médias liés')}</small>`:''}</div><div class="page-actions"><button type="button" class="button small secondary" data-add-battue-media="${item.id}">＋ Média</button>${actionButton('edit','Modifier',`data-edit-battue-item="${item.id}"`)}${actionButton('delete','Supprimer',`data-delete-battue-item="${item.id}"`)}</div></div>`;
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
        return `<div class="battue-subcommunes">${groups.map(group=>{const byType={};group.items.forEach(item=>{const key=item.record_type||'autre';(byType[key]||(byType[key]=[])).push(item);});const types=Object.keys(byType).sort((a,b)=>battueTargetText(data.target_types,a).localeCompare(battueTargetText(data.target_types,b),'fr',{sensitivity:'base'}));const groupId=group.id||'current';const mediaCount=battueMediaForGroup(commune,groupId).length;const mediaToggle=mediaCount?`<button type="button" class="button small secondary battue-media-toggle" data-battue-media-toggle="${escapeHtml(battueMediaGroupKey(commune,groupId))}">${i18n('Voir médias ({n})',{n:mediaCount})}</button>`:'';return `<section class="battue-subcommune"><header><div><h5>${escapeHtml(group.name)}</h5>${group.note?`<small>${escapeHtml(group.note)}</small>`:''}</div>${mediaToggle}</header>${battueMediaGalleryHtml(commune,groupId)}${types.length?types.map(type=>`<div class="battue-type-group"><h6>${escapeHtml(battueTargetText(data.target_types,type))}</h6>${byType[type].sort((a,b)=>battueItemSortValue(a)-battueItemSortValue(b)||String(a.period||'').localeCompare(String(b.period||''),'fr')).map(item=>battueItemHtml(item,data)).join('')}</div>`).join(''):'<small class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">Aucune annotation pour cette commune.</span></small>'}</section>`;}).join('')}</div>`;
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
        panel.innerHTML=window.LCNDA_UI.spinner('Recherche des services d\'archives…');
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
                if(!link.dataset.registersPrefilled){const ok=await copyText(name);toast(i18n(ok?'« {name} » copié : colle-le dans la recherche du site.':'Cherche « {name} » sur le site.',{name}));}
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
            refreshBattueProgress();
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
        $('#edit-battue')?.addEventListener('click',()=>openBattueDialog({...data.battue,linked_persons:data.linked_persons||[],linked_investigations:data.linked_investigations||[]}));
        $('#delete-battue')?.addEventListener('click',()=>deleteBattue(data.battue.id,data.battue.title)); // R7 : tout de suite, « ↶ Annuler » la remet
        $$('[data-battue-color]').forEach(btn=>btn.addEventListener('click',()=>{const m=btn.dataset.battueColor;setEnqPref('battueMapColor',m);$$('[data-battue-color]').forEach(x=>x.classList.toggle('is-active',x===btn));$('.battue-map')?.classList.toggle('is-progress',m==='progress');const L=$('.battue-legend-level'),P=$('.battue-legend-progress');if(L)L.hidden=m==='progress';if(P)P.hidden=m!=='progress';}));
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
            const label=data.commune_statuses?.[status]||i18n('À faire');
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
        $$('[data-battue-media-toggle]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.battueMediaToggle;const panel=document.querySelector(`[data-battue-media-panel="${CSS.escape(String(key))}"]`);if(!panel)return;panel.hidden=!panel.hidden;button.textContent=i18n(panel.hidden?'Voir médias ({n})':'Masquer médias ({n})',{n:battueMediaByGroupKey(key).length}); }));
        $$('[data-open-battue-media]').forEach(button=>button.addEventListener('click',()=>{const media=battueMediaByGroupKey(button.dataset.openBattueMedia);const index=Number(button.dataset.mediaIndex)||0;if(media.length)openLightbox(media,index,false);}));
    }
    function investigationTable(rows,groups=null){const tr=row=>`<tr data-enq-row="inv:${row[4].investigationId}" data-enq-title="${escapeHtml(row[4].title||row[1])}"><td data-sort-value="${escapeHtml(String(row[0]||'').toLowerCase())}">${escapeHtml(row[0])}</td><td data-sort-value="${escapeHtml(row[1].toLowerCase())}">${escapeHtml(row[1])}</td><td data-sort-value="${row[2]}">${row[2]}</td><td>${row[3]}</td><td class="enq-row-act"><button class="button small" data-open-investigation="${row[4].investigationId}">Ouvrir</button>${menuBtn('inv',row[4].investigationId,row[4].title)}</td></tr>`;return rows.length?`<div class="data-table-wrap"><table class="data-table sortable-table" data-sortbar="enquête" data-sortbar-fem="1"><thead><tr><th><button data-sort-column="0">Personne</button></th><th><button data-sort-column="1">Recherche</button></th><th><button data-sort-column="2">État</button></th><th>Pistes</th><th></th></tr></thead>${groups?groups.map(g=>window.LCNDA_UI.personTbodyHtml({cols:5,id:g.key,name:g.key?g.name:i18n('Sans personne'),count:plural(g.rows.length,'enquête'),rows:g.rows.map(tr).join('')})).join(''):`<tbody>${rows.map(tr).join('')}</tbody>`}</table></div>`:emptyState({text: 'Aucune enquête dans cette sélection.', icon:'🔍',hint:'Une enquête rassemble les pistes, médias et notes d’une question à résoudre.',action:{label:'＋ Nouvelle enquête',attrs:'data-empty-click="#new-investigation-global"'}});}
    function investigationItemMediaHtml(itemId,media){const linked=media.filter(file=>(file.item_ids||'').split(',').map(Number).includes(Number(itemId)));return linked.length?`<div class="investigation-item-media">${linked.map(file=>`<span class="investigation-item-media-wrap" style="position:relative;display:inline-block;">${normalizedMediaType(file)==='image'?`<img src="media/${encodeURIComponent(file.thumbnail||file.filename)}" alt="${escapeHtml(file.title||'Média lié')}">`:`<span class="pdf-mark" title="${escapeHtml(file.title||file.filename)}">${mediaTypeShortLabelWithIcon(file)}</span>`}<button type="button" class="investigation-media-unlink-from-item" data-unlink-media-from-item="${file.link_id}" data-inv-item-id="${itemId}" aria-label="Retirer ce média de la piste" title="Retirer ce média de la piste" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--danger,#c0392b);color:#fff;border:none;cursor:pointer;font-size:10px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;">×</button></span>`).join('')}<small>${plural(linked.length,'média lié','médias liés')}</small></div>`:'<small class="empty-line"><span class="empty-line-ico" aria-hidden="true">🖼️</span><span class="empty-line-text">Aucun média lié</span></small>';}
    /* 🎨 un dossier de pièces : sa couleur (« #rrggbb » ou rien) et son icône (un emoji, 📁 sinon) — partout où il se montre */
    const folderIcon=folder=>String(folder?.icon||'')||'📁';
    const folderColor=folder=>/^#[0-9a-f]{6}$/i.test(String(folder?.color||''))?String(folder.color):'';
    const folderStyleAttr=folder=>folderColor(folder)?` style="--inv-fc:${folderColor(folder)}"`:'';
    const folderOptionText=(folders,folder)=>`${'— '.repeat(Math.max(0,investigationFolderPath(folders,folder.id).length-1))}${folderIcon(folder)} ${folder.name}`;
    /** « ＋ Nouveau dossier » et « ✎ Modifier le dossier » : le nom, et replié « 🎨 Couleur et icône » → {name, color, icon} ou null */
    function askFolder(cur={}){
        const isNew=!cur.id,ext=window.LCNDA_EXT||{};
        if(!ext.openDialog||!UI().colorField)return askText({title:isNew?i18n('Nouveau dossier'):i18n('Renommer le dossier'),message:isNew?i18n('Nom du nouveau dossier :'):i18n('Nouveau nom du dossier :'),value:cur.name||'',okLabel:isNew?i18n('Créer'):i18n('Renommer')}).then(name=>name&&name.trim()?{name:name.trim()}:null);
        return new Promise(res=>{let done=false;const styled=!!(folderColor(cur)||cur.icon);
            ext.openDialog({eyebrow:'📁',title:isNew?i18n('Nouveau dossier'):i18n('Modifier le dossier'),submitLabel:isNew?i18n('Créer le dossier'):i18n('Enregistrer'),
                body:`<div class="form-grid one-column inv-fform"><label>${escapeHtml(i18n('Nom du dossier'))}<input name="name" maxlength="120" required value="${escapeHtml(cur.name||'')}" placeholder="${escapeHtml(i18n('ex. Actes MAZAUD'))}"></label>
                    <details class="inv-fstyle"${styled?' open':''}><summary>🎨 ${escapeHtml(i18n('Couleur et icône'))}</summary><div class="inv-fstyle-row"><label>${escapeHtml(i18n('Couleur'))}<span data-inv-fcolor></span></label><label>${escapeHtml(i18n('Icône'))}<input type="hidden" name="icon" data-ui-icon="emoji" data-ui-icon-none="0" value="${escapeHtml(folderIcon(cur))}"></label></div></details></div>`,
                onOpen:d=>{const cf=UI().colorField({name:'color',value:folderColor(cur),allowNone:true});d.querySelector('[data-inv-fcolor]')?.appendChild(cf);d.addEventListener('close',()=>{if(!done)res(null);});setTimeout(()=>d.querySelector('[name=name]')?.focus(),30);},
                onSubmit:f=>{const name=f.elements.name.value.trim();if(!name)return false;done=true;res({name,color:f.elements.color?.value||'',icon:f.elements.icon?.value||'📁'});}});
        });
    }
    function investigationFolderChildren(folders,parentId){return folders.filter(folder=>(Number(folder.parent_id)||0)===(Number(parentId)||0));}
    function investigationMediaInFolder(mediaList,folderId){return mediaList.filter(item=>(Number(item.folder_id)||0)===(Number(folderId)||0));}
    function investigationFolderCardsHtml(folders,parentId,sortAsc){
        const children=[...investigationFolderChildren(folders,parentId)].sort((a,b)=>{const cmp=a.name.localeCompare(b.name,'fr',{sensitivity:'base'});return sortAsc===false?-cmp:cmp;});
        if(!children.length)return '';
        return `<div class="investigation-folder-grid">${children.map(folder=>`<article class="investigation-folder${folderColor(folder)?' has-color':''}" data-folder-drop="${folder.id}"${folderStyleAttr(folder)}><button type="button" class="investigation-folder-open" data-open-folder="${folder.id}">${folder.icon?`<i class="investigation-folder-emoji" aria-hidden="true">${escapeHtml(folder.icon)}</i>`:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>'}<span>${escapeHtml(folder.name)}</span><small>${plural(Number(folder.media_count||0),'média')}${Number(folder.subfolder_count||0)?` · ${plural(folder.subfolder_count,'sous-dossier')}`:''}</small></button><div class="investigation-folder-actions">${actionButton('edit',i18n('Modifier le dossier'),`data-rename-folder="${folder.id}"`)}<button type="button" class="icon-button small enq-more" data-folder-more="${folder.id}" aria-label="${escapeHtml(i18n('Plus d’actions'))}" title="${escapeHtml(i18n('Couleur, icône…'))}">⋯</button>${actionButton('delete','Supprimer le dossier',`data-delete-folder="${folder.id}"`)}</div></article>`).join('')}</div>`;
    }
    function investigationFolderBreadcrumbHtml(folders,folderId){
        if(!folderId)return '';
        const path=investigationFolderPath(folders,folderId);
        const crumbs=[`<button type="button" class="investigation-folder-crumb" data-open-folder="0">Pièces</button>`,...path.map(folder=>`<button type="button" class="investigation-folder-crumb" data-open-folder="${folder.id}">${folder.icon?`${escapeHtml(folder.icon)} `:''}${escapeHtml(folder.name)}</button>`)];
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
            return `<li><button type="button" class="investigation-folder-tree-row${Number(folder.id)===Number(activeFolderId)?' is-active':''}${folderColor(folder)?' has-color':''}" data-open-folder="${folder.id}" data-folder-drop="${folder.id}"${folderStyleAttr(folder)}><span class="investigation-folder-tree-icon" aria-hidden="true">${escapeHtml(folderIcon(folder))}</span><span class="investigation-folder-tree-name">${escapeHtml(folder.name)}</span><span class="investigation-folder-tree-count">${countLabel}</span></button>${investigationFolderTreeHtml(folders,mediaList,folder.id,activeFolderId,depth+1)}</li>`;
        }).join('')}</ul>`;
    }
    function investigationFolderTreePanelHtml(folders,mediaList,activeFolderId){
        if(!folders.length)return '';
        const rootCount=investigationMediaInFolder(mediaList,0).length;
        return `<details class="investigation-folder-tree-panel"><summary>Voir l’arborescence complète des dossiers</summary><div class="investigation-folder-tree-wrap"><button type="button" class="investigation-folder-tree-row investigation-folder-tree-root${activeFolderId===0?' is-active':''}" data-open-folder="0"><span class="investigation-folder-tree-icon" aria-hidden="true">🗂️</span><span class="investigation-folder-tree-name">Racine des pièces</span><span class="investigation-folder-tree-count">${plural(rootCount,'média')} à la racine</span></button>${investigationFolderTreeHtml(folders,mediaList,0,activeFolderId)}</div></details>`;
    }
    function bindInvestigationFolderEvents(investigationId,folders,visibleMedia=[],allMedia=[]){
        $$('[data-open-investigation-media]').forEach(button=>button.addEventListener('click',()=>openLightbox(visibleMedia,Number(button.dataset.openInvestigationMedia))));$$('[data-play-investigation-media]').forEach(button=>button.addEventListener('click',()=>window.LCNDA_EXT?.playMedia?.(visibleMedia.map(m=>({...m,kind:normalizedMediaType(m)})),Number(button.dataset.playInvestigationMedia),{subtitle:m=>m.reason||''})));
        $$('[data-open-folder]').forEach(button=>button.addEventListener('click',()=>{state.investigationFolderId=Number(button.dataset.openFolder)||0;renderInvestigationDetail(investigationId);}));$('#folder-sort-btn')?.addEventListener('click',()=>{state.folderSortAsc=state.folderSortAsc===false?true:false;renderInvestigationDetail(investigationId);});
        $('#new-investigation-folder')?.addEventListener('click',async()=>{
            const got=await askFolder({});
            if(!got)return;
            try{await api('save_investigation_media_folder',{},{method:'POST',body:{investigation_id:investigationId,parent_id:state.investigationFolderId||'',...got}});renderInvestigationDetail(investigationId);}
            catch(error){toast(error.message,'error');}
        });
        // 🎨 changer le nom, la couleur ou l'icône d'un dossier ; « ↶ Annuler » remet ceux d'avant
        const again=()=>{if(state.module==='enquetes'&&Number(state.currentInvestigationId)===Number(investigationId))return renderInvestigationDetail(investigationId);};
        const restyle=async(folder,patch,msg)=>{
            const before={id:Number(folder.id),name:folder.name,color:folderColor(folder),icon:folder.icon||''},after={...before,...patch};
            if(after.name===before.name&&after.color===before.color&&(after.icon||'📁')===(before.icon||'📁'))return;
            const put=v=>postR('save_investigation_media_folder',v);
            try{await put(after);await again();undoToast(msg,{undo:async()=>{await put(before);await again();},redo:async()=>{await put(after);await again();}});}
            catch(error){toast(error.message,'error');}
        };
        const folderOf=id=>folders.find(item=>Number(item.id)===Number(id));
        const pickColor=(anchor,folder)=>{if(!UI().openColorBox)return;let last=folderColor(folder);UI().openColorBox(anchor,{allowNone:true,get:()=>last,set:(v,final)=>{if(!final)return;last=String(v||'').slice(0,7);restyle(folder,{color:last},last?i18n('Couleur du dossier « {name} » changée',{name:folder.name}):i18n('Couleur du dossier « {name} » retirée',{name:folder.name}));}});};
        const pickFolderIcon=(anchor,folder)=>{if(UI().iconPicker)UI().iconPicker({anchor,emoji:true,value:folderIcon(folder),title:i18n('Icône du dossier'),onPick:v=>{if(v)restyle(folder,{icon:String(v)},i18n('Icône du dossier « {name} » changée',{name:folder.name}));}});};
        $$('[data-folder-more]').forEach(button=>button.addEventListener('click',event=>{
            event.stopPropagation();const folder=folderOf(button.dataset.folderMore);if(!folder||!UI().menuAt)return;
            UI().menuAt(button,[{icon:'🎨',label:i18n('Couleur…'),run:()=>pickColor(button,folder)},{icon:'🙂',label:i18n('Icône…'),run:()=>pickFolderIcon(button,folder)},
                (folderColor(folder)||folder.icon)?{icon:'↺',label:i18n('Remettre 📁 sans couleur'),run:()=>restyle(folder,{color:'',icon:''},i18n('Dossier « {name} » remis à 📁 sans couleur',{name:folder.name}))}:null,
                '-',{icon:'✎',label:i18n('Modifier le dossier…'),run:()=>button.closest('.investigation-folder')?.querySelector('[data-rename-folder]')?.click()}].filter(Boolean),{title:`📁 « ${folder.name} »`});
        }));
        $$('[data-rename-folder]').forEach(button=>button.addEventListener('click',async event=>{
            event.stopPropagation();
            const folderId=Number(button.dataset.renameFolder);
            const folder=folders.find(item=>Number(item.id)===folderId);
            if(!folder)return;
            const got=await askFolder(folder);
            if(!got)return;
            await restyle(folder,got,i18n('Dossier « {name} » modifié',{name:got.name}));
        }));
        $$('[data-delete-folder]').forEach(button=>button.addEventListener('click',async event=>{
            event.stopPropagation();
            // R7 : supprimé tout de suite (son contenu remonte d'un niveau) ; « ↶ Annuler » remet le dossier, ses médias et ses sous-dossiers
            const folderId=Number(button.dataset.deleteFolder);
            const folder=folders.find(f=>Number(f.id)===folderId)||{id:folderId,name:''};
            const snap={folder:{id:folderId,investigation_id:investigationId,parent_id:Number(folder.parent_id)||0,name:folder.name||'',color:folderColor(folder),icon:folder.icon||''},media_links:allMedia.filter(m=>Number(m.folder_id)===folderId).map(m=>Number(m.link_id)),children:folders.filter(f=>Number(f.parent_id)===folderId).map(f=>Number(f.id))};
            const del=()=>postR('delete_investigation_media_folder',{id:folderId}),again=()=>{if(state.module==='enquetes'&&Number(state.currentInvestigationId)===Number(investigationId))return renderInvestigationDetail(investigationId);};
            try{await del();if(Number(state.investigationFolderId)===folderId)state.investigationFolderId=snap.folder.parent_id;await again();
                undoToast(i18n('Dossier « {name} » supprimé',{name:folder.name||''}),{undo:async()=>{await plusPost('restore_folder',snap);await again();},redo:async()=>{await del();await again();}});}
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

    async function renderInvestigationDetail(id,token=++state.workspaceToken){clearInterval(chronoTimer);const wait=waitLater(token,'Chargement de l’enquête…');let data,plus;try{[data,plus]=await Promise.all([api('investigation',{id}),plusGet('detail',{id}).catch(()=>({extras:{elapsed:0,running:false,kept_item_ids:[]},negatives:[]}))]);}finally{clearTimeout(wait);}if(token!==state.workspaceToken||state.module!=='enquetes')return;const inv=data.investigation;const ex=plus.extras||{};const negs=plus.negatives||[];const pistesView=enqPrefs().pistesView==='columns'?'columns':'list';const reload=()=>{if(state.module==='enquetes'&&Number(state.currentInvestigationId)===Number(id))return renderInvestigationDetail(id);};const folders=data.folders||[];const linkedPersons=data.linked_persons||[];const linkedBattues=data.linked_battues||[];if(state.investigationFolderId&&!folders.some(folder=>Number(folder.id)===Number(state.investigationFolderId)))state.investigationFolderId=0;const activeFolderId=Number(state.investigationFolderId)||0;const visibleMedia=investigationMediaInFolder(data.media,activeFolderId).slice().sort((a,b)=>{const cmp=(a.title||a.filename||'').localeCompare((b.title||b.filename||''),'fr',{sensitivity:'base'});return state.folderSortAsc===false?-cmp:cmp;});const parentOfActive=activeFolderId?(folders.find(folder=>Number(folder.id)===activeFolderId)?.parent_id||0):0;const head=window.LCNDA_UI.pageHeader({title:inv.title,back:`<button class="back-link" id="back-investigations">← ${escapeHtml(i18n('Toutes les enquêtes'))}</button>`,help:`${escapeHtml(i18n('Dossier de recherche sur'))} <button class="table-link" data-open-person="${inv.person_id}">${escapeHtml(inv.person_name)}</button>`,detail:true,primary:kiosk()?'':`<button class="button" id="edit-investigation">${escapeHtml(i18n('✎ Modifier'))}</button>`,actions:[exportButtons()],more:[`<button type="button" data-enq-report-export>⤓ ${escapeHtml(i18n('Exporter le rapport…'))}</button>`,...(kiosk()?[]:[`<button type="button" data-enq-dup>⧉ ${escapeHtml(i18n('Dupliquer l’enquête'))}</button>`,`<button type="button" data-enq-chrono-reset>⏱ ${escapeHtml(i18n('Remettre le temps à zéro'))}</button>`,`<button type="button" class="is-danger" id="delete-investigation">🗑 ${escapeHtml(i18n('Supprimer l’enquête'))}</button>`])]});$('#workspace').innerHTML=`<section class="page investigation-detail">${head}<div class="enq-meta-bar">${chronoHtml(ex)}</div>${(()=>{const primaries=linkedPersons.filter(p=>p.role==='primary');const secondaries=linkedPersons.filter(p=>p.role==='secondary');if(!linkedPersons.length)return '';let h='<div class="inv-linked-persons">';if(primaries.length)h+='<div class="inv-linked-persons-group"><span class="inv-linked-persons-label">Personnes principales</span><div class="inv-linked-persons-chips">'+primaries.map(p=>`<button class="table-link inv-linked-person-chip primary" data-open-person="${p.person_id}">${escapeHtml(p.person_name)}</button>`).join('')+"</div></div>";if(primaries.length&&secondaries.length)h+='<div class="inv-linked-persons-sep"></div>';if(secondaries.length)h+='<div class="inv-linked-persons-group"><span class="inv-linked-persons-label">Personnes secondaires</span><div class="inv-linked-persons-chips">'+secondaries.map(p=>`<button class="table-link inv-linked-person-chip secondary" data-open-person="${p.person_id}">${escapeHtml(p.person_name)}</button>`).join('')+"</div></div>";h+='</div>';return h;})()}<div class="investigation-summary"><article><h3>Question</h3><p>${escapeHtml(inv.question||'—')}</p></article><article><h3>Ce que je sais</h3><p>${escapeHtml(inv.known_facts||'—')}</p></article><article><h3>Documents disponibles</h3><p>${escapeHtml(inv.documents||'—')}</p></article></div>${conclusionHtml(inv,data.items,ex)}<div class="section-title"><div><span class="eyebrow">JOURNAL</span><h3>Pistes, liens et sources</h3></div><div class="page-actions" style="gap:.5rem;align-items:center"><span class="segmented enq-pistes-view" role="group" aria-label="${escapeHtml(i18n('Affichage des pistes'))}"><button type="button" data-enq-pview="list" class="${pistesView==='list'?'is-active':''}">${escapeHtml(i18n('Liste'))}</button><button type="button" data-enq-pview="columns" class="${pistesView==='columns'?'is-active':''}" title="${escapeHtml(i18n('À explorer → En cours → Explorée → Impasse : glisse les pistes d’une colonne à l’autre'))}">🧩 ${escapeHtml(i18n('Colonnes'))}</button></span><span class="enq-list-tools"${pistesView==='columns'?' hidden':''}><label class="media-filter-label" style="font-size:.8em">Trier <select id="investigation-items-sort" class="button small secondary" style="padding:.3rem .6rem;font-size:.8em"><option value="kind">Par nature</option><option value="alpha">Alphabétique</option><option value="manual">Manuel (glisser-déposer)</option></select></label><button type="button" class="icon-action media-order-lock is-disabled" id="investigation-items-lock" data-locked="1" aria-label="Activer le glisser-déposer" title="Activer le glisser-déposer"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></button><select id="investigation-items-filter" class="button small secondary" style="padding:.3rem .6rem;font-size:.8em"><option value="">Tous les résultats</option><option value="no_closed">Tous sauf fermés</option><option value="no_explored">Tous sauf explorés</option><option value="no_closed_explored">Tous sauf fermés et explorés</option><option value="to_explore_priority">À explorer (prioritaire)</option><option value="to_explore">À explorer (pas prioritaire)</option><option value="promising">Prometteuses</option><option value="explored">Explorées</option><option value="closed">Fermées</option></select></span><button class="button small" id="add-investigation-item">＋ Ajouter</button></div></div>${pistesView==='columns'?kanbanHtml(data.items):''}<div class="investigation-items"${pistesView==='columns'?' hidden':''}>${data.items.map(item=>{const kindLabels={'lead':'Piste','link':'Lien','source':'Source','document':'Document','note':'Note','event':'Événement'};const statusLabels={'promising':'Prometteuse','closed':'Fermée / écartée','to_explore_priority':'À explorer (prioritaire)','to_explore':'À explorer (pas prioritaire)','explored':'Explorée'};const kindLabel=kindLabels[item.kind]||item.kind;const statusLabel=statusLabels[item.status]||'Explorée';const hasUrl=!!(item.url&&item.url.trim());const hasNotes=!!(item.notes&&item.notes.trim());const hasReminder=!!(item.reminder_mode&&item.reminder_mode!=='none'&&item.reminder_due_at);const hasEvent=!!(item.linked_event_id&&Number(item.linked_event_id)>0);let urlLabel=item.url||'';if(hasUrl){try{urlLabel=new URL(item.url).hostname.replace(/^www\./,'');}catch(_){urlLabel=item.url;}}const reminderPrefix=item.reminder_mode==='before'?'Avant le ':item.reminder_mode==='after'?'Après le ':'Le ';return `<article class="investigation-item inv-item-framed ${item.status}" draggable="false" data-item-id="${item.id}" data-enq-piste="${item.id}"><span class="investigation-item-grip" aria-hidden="true" style="display:none;cursor:grab;color:var(--muted);font-size:1.1em;padding:0 .4rem;align-self:flex-start;padding-top:.15rem">⠿</span><div class="investigation-item-kind-col"><span class="investigation-item-kind-badge">${escapeHtml(kindLabel)}</span>${hasReminder?`<span class="investigation-item-reminder-badge" title="${escapeHtml(reminderPrefix+item.reminder_due_at)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>${escapeHtml(reminderPrefix)}${escapeHtml(item.reminder_due_at)}</span>`:''}</div><div class="investigation-item-body"><div class="investigation-item-head"><h4>${hasUrl?`${window.LCNDA_UI.extLink(safeUrl(item.url), item.title)}`:escapeHtml(item.title)}</h4><span class="investigation-item-status-badge status-${item.status}">${escapeHtml(statusLabel)}</span></div>${(hasUrl||hasEvent)?`<div class="investigation-item-meta">${hasUrl?`<a class="investigation-item-meta-pill is-link" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener" title="${escapeHtml(item.url)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 15l6-6M10 7l1-1a4 4 0 0 1 6 6l-1 1M14 17l-1 1a4 4 0 0 1-6-6l1-1"/></svg>${escapeHtml(urlLabel)}</a>`:''}${hasEvent?`<span class="investigation-item-meta-pill is-event" title="${escapeHtml(item.linked_event_label||'Événement lié')}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>${escapeHtml(item.linked_event_label||'Événement lié')}<button type="button" class="investigation-item-meta-pill-remove" data-unlink-event-from-item="${item.id}" aria-label="Retirer l’événement lié" title="Retirer l’événement lié">×</button></span>`:''}</div>`:''}${hasNotes?`<p class="investigation-item-notes">${escapeHtml(item.notes)}</p>`:''}${investigationItemMediaHtml(item.id,data.media)}${window.LCNDA_EXT?.connexions?.linksHtml?.(item)||''}<div class="investigation-item-actions"><button class="button small secondary" data-link-media-to-item="${item.id}">Relier un média</button><span style="display:inline-block;width:.75rem"></span><button class="button small secondary" data-link-event-to-item="${item.id}">Relier un événement</button></div></div><div style="display:flex;flex-direction:column;gap:.3rem;align-items:center"><button type="button" class="icon-action icon-edit" data-edit-investigation-item="${item.id}" aria-label="Modifier" title="Modifier"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9.5-13.5 4 4"/></svg></button>${actionButton('delete','Supprimer',`data-delete-investigation-item="${item.id}"`)}<button type="button" class="icon-button small enq-more" data-enq-pmenu="${item.id}" aria-label="${escapeHtml(i18n('Plus d’actions'))}" title="${escapeHtml(i18n('Plus d’actions'))}">⋯</button></div></article>`;}).join('')||emptyState({text: 'Aucune piste pour l’instant', icon:'🧭',hint:'Note chaque source consultée, même sans résultat.',action:{label:'＋ Ajouter une piste',attrs:'data-empty-click="#add-investigation-item"'}})}</div>${negativesHtml(negs)}<div class="section-title"><div><span class="eyebrow">PIÈCES</span><h3>Médias évalués${data.media.length?` <span class="investigation-media-total">(${data.media.length})</span>`:''}</h3></div><div class="page-actions"><button class="button small secondary" id="new-investigation-folder">＋ Nouveau dossier</button><button class="button small" id="add-investigation-media">＋ Média existant</button><button class="button small" id="upload-investigation-media">＋ Nouveau média</button>${activeFolderId&&!kiosk()&&window.LCNDA_EXT?.connexions?.folderDest?`<button class="button small secondary" id="take-into-folder" title="${escapeHtml(i18n('Des médias, des actes, des sources… rangés dans ce dossier'))}">📥 ${escapeHtml(i18n('Prendre depuis…'))}</button>`:''}${window.LCNDA_EXT?.recueilAttachDialog?'<button class="button small secondary" id="add-investigation-recueil" title="Relier tout ou partie d’un recueil (registre, liste photographiée…) à ce dossier">＋ Page d’un recueil</button>':''}</div></div>${investigationFolderBreadcrumbHtml(folders,activeFolderId)}${investigationFolderTreePanelHtml(folders,data.media,activeFolderId)}${activeFolderId?`<button type="button" class="back-link investigation-folder-back" data-open-folder="${parentOfActive}">← Dossier précédent</button>`:''}${folders.length>=1?`<div class="investigation-folder-sort-bar"><button type="button" class="button small secondary investigation-folder-sort" id="folder-sort-btn"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/></svg> ${state.folderSortAsc===false?"Z → A":"A → Z"}</button></div>`:''}${investigationFolderCardsHtml(folders,activeFolderId,state.folderSortAsc)}<div data-rc-host data-rc-type="investigation" data-rc-key="${inv.id}" data-rc-hide-empty data-rc-folder="${activeFolderId}" data-rc-folders="${escapeHtml(JSON.stringify(folders.map(folder=>({id:Number(folder.id),name:folder.name,icon:folder.icon||'',depth:Math.max(0,investigationFolderPath(folders,folder.id).length-1)}))))}"></div><div class="investigation-media-grid">${visibleMedia.map((item,mediaIndex)=>`<article class="investigation-media ${item.verdict}" draggable="true" data-link-id="${item.link_id}"><button type="button" class="investigation-media-thumb" data-open-investigation-media="${mediaIndex}" aria-label="Voir le média en grand">${normalizedMediaType(item)==='image'?`<img src="media/${encodeURIComponent(item.thumbnail||item.filename)}" alt="">`:`<span class="pdf-mark">${mediaTypeShortLabelWithIcon(item)}</span>`}</button><div><strong>${escapeHtml(item.title||item.filename)}</strong><span>${item.verdict==='interesting'?'Intéressant':'Rejeté'}</span><p>${escapeHtml(item.reason)}</p>${['audio','video'].includes(normalizedMediaType(item))?`<button type="button" class="button small investigation-media-play" data-play-investigation-media="${mediaIndex}" title="Lire avec le lecteur (vitesse, ±, précédent / suivant)">▶ ${normalizedMediaType(item)==='video'?'Regarder':'Écouter'}</button>`:''}<small>${item.item_titles?`Pistes : ${escapeHtml(item.item_titles.split('|').join(', '))}`:'Aucune piste associée'}</small><button class="button small secondary" data-edit-media-items="${item.link_id}" data-media-id="${item.id}">Relier aux pistes</button><label class="investigation-media-move">Déplacer vers<select data-move-media="${item.link_id}"><option value="" ${!item.folder_id?'selected':''}>Racine de l’enquête</option>${folders.map(folder=>`<option value="${folder.id}" ${Number(item.folder_id)===Number(folder.id)?'selected':''}>${escapeHtml(folderOptionText(folders,folder))}</option>`).join('')}</select></label></div>${actionButton('delete','Retirer',`data-unlink-investigation-media="${item.link_id}"`)}</article>`).join('')||empty(activeFolderId?'Aucun média dans ce dossier.':'Aucun média évalué.')}</div></section>`;

        bindInvestigationLinks();renderInvestigationReminderStates(data.items);bindInvestigationFolderEvents(id,folders,visibleMedia,data.media);
        { // audit : ⏱ temps, ✅ conclusion, 🚫 recherches négatives, 🧩 colonnes, ⋯ des pistes, ⤓ / 🖨, consultation, chercher dans la page
            const page=$('.investigation-detail');
            bindChrono(id,ex);
            page.querySelector('[data-enq-chrono-reset]')?.addEventListener('click',()=>$('[data-enq-chrono]')?._reset?.().catch(e=>toast(e.message,'error')));
            page.querySelector('[data-enq-conclude]')?.addEventListener('click',()=>openConclusionDialog(id,inv,data.items,ex,reload));
            page.querySelector('[data-enq-neg-add]')?.addEventListener('click',()=>openNegativeDialog(id,null,reload));
            bindNegativeAttach(page,negs);
            page.querySelectorAll('[data-enq-neg-menu]').forEach(b=>b.addEventListener('click',()=>{const n=negs.find(x=>Number(x.id)===Number(b.dataset.enqNegMenu));if(!n)return;UI().menuAt?.(b,[{icon:'✎',label:i18n('Modifier'),run:()=>openNegativeDialog(id,n,reload)},'-',{icon:'🗑',label:i18n('Supprimer'),danger:true,run:()=>deleteNegative(n.id,reload)}],{title:`« ${(n.cote||n.repository).slice(0,50)} »`});}));
            page.querySelectorAll('[data-enq-pview]').forEach(b=>b.addEventListener('click',()=>{setEnqPref('pistesView',b.dataset.enqPview);renderInvestigationDetail(id);}));
            bindKanban(id,data,reload);
            const pisteMenu=(el,ev)=>{const it=data.items.find(x=>Number(x.id)===Number(el.dataset.enqPmenu||el.dataset.enqPiste));if(!it)return;const items=itemMenuItems(id,it,reload,data);if(ev)UI().contextMenu?.(ev,items,{title:`« ${it.title.slice(0,50)} »`});else UI().menuAt?.(el,items,{title:`« ${it.title.slice(0,50)} »`});};
            page.querySelectorAll('[data-enq-pmenu]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();pisteMenu(b);}));
            page.querySelector('.investigation-items')?.addEventListener('contextmenu',e=>{const a=e.target.closest('[data-enq-piste]');if(!a||e.shiftKey||e.target.closest('a,input,select,textarea'))return;e.preventDefault();pisteMenu(a,e);});
            page.querySelector('[data-enq-export]')?.addEventListener('click',()=>exportReport(id));
            page.querySelector('[data-enq-report-export]')?.addEventListener('click',()=>exportReport(id));
            page.querySelector('[data-enq-print]')?.addEventListener('click',()=>printReport(id));
            page.querySelector('[data-enq-dup]')?.addEventListener('click',()=>duplicateInvestigation(id));
            readOnly(page);
            pageFind(page,'.investigation-item, .enq-kcard, .enq-neg-table tbody tr, .investigation-media, .investigation-folder');
        }
        window.LCNDA_EXT?.invDocLinks?.($('.investigation-detail'),data,id,()=>renderInvestigationDetail(id)); // 🔗 les documents liés du dossier (heritage-liens.js)
        window.LCNDA_EXT?.cxNeeds?.paintInvestigation?.($('.investigation-detail'),data,id,()=>renderInvestigationDetail(id)); // 🧩 ce qui manque aux pistes (heritage-connexions-besoins.js)
        // E4 : des fichiers glissés (ou collés) sur l'enquête ouvrent la fenêtre d'import, fichiers déjà mis
        const invPage=$('.investigation-detail');if(invPage&&!kiosk()&&window.LCNDA_UI?.bindFileDrop)window.LCNDA_UI.bindFileDrop(invPage,files=>{window.LCNDA_APP.openInvestigationUploadDialog(id,inv.person_id,data.items,folders);window.LCNDA_APP.addMediaDialogFiles(files);},{accept:'image/*,application/pdf,audio/*,video/*,.aif,.aiff,.aifc'});$('#back-investigations').addEventListener('click',()=>{state.currentInvestigationId=0;state.investigationFolderId=0;renderInvestigations();});$('#edit-investigation')?.addEventListener('click',()=>openInvestigationDialog(inv.person_id,Object.assign({},inv,{linked_persons:linkedPersons,linked_battues:linkedBattues})));$('#delete-investigation')?.addEventListener('click',()=>deleteInvestigation(id,inv.title)); /* R7 : tout de suite, « ↶ Annuler » la remet avec ses pistes et ses pièces */$('#add-investigation-item')?.addEventListener('click',e=>{/* 🧺 « ＋ Ajouter » : un menu (une piste, un média, un fichier, une page de recueil, 📥 Prendre depuis…) quand les connexions sont allumées */const more=window.LCNDA_EXT?.connexions?.addMenuItems?.()||[];if(!more.length)return openInvestigationItemDialog(id);UI().menuAt?.(e.currentTarget,[{icon:'📌',label:i18n('Une piste'),run:()=>openInvestigationItemDialog(id)},{icon:'🖼',label:i18n('Un média de l’app…'),run:()=>openInvestigationMediaDialog(id,inv.person_id,[],[],data.items,null,folders)},{icon:'⬆',label:i18n('Un nouveau fichier…'),run:()=>openInvestigationUploadDialog(id,inv.person_id,data.items,folders)},...(window.LCNDA_EXT?.recueilAttachDialog?[{icon:'📚',label:i18n('Une page d’un recueil…'),run:()=>window.LCNDA_EXT.recueilAttachDialog('investigation',String(id),()=>window.LCNDA_EXT.refreshRecueilHosts?.(),{folderId:activeFolderId})}]:[]),...more],{title:i18n('＋ Ajouter')});});$('#add-investigation-media')?.addEventListener('click',()=>openInvestigationMediaDialog(id,inv.person_id,[],[],data.items,null,folders));$('#upload-investigation-media')?.addEventListener('click',()=>openInvestigationUploadDialog(id,inv.person_id,data.items,folders));$('#take-into-folder')?.addEventListener('click',()=>{const CX=window.LCNDA_EXT.connexions,f=folders.find(x=>Number(x.id)===activeFolderId);CX.openTake({dest:CX.folderDest(id,activeFolderId,f?.name||'')});}); /* 📁 Prendre depuis… dans CE dossier (heritage-connexions.js) */$('#add-investigation-recueil')?.addEventListener('click',()=>window.LCNDA_EXT.recueilAttachDialog('investigation',String(id),()=>window.LCNDA_EXT.refreshRecueilHosts?.(),{folderId:activeFolderId}));$$('[data-link-media-to-item]').forEach(button=>button.addEventListener('click',()=>openInvestigationMediaDialog(id,inv.person_id,[],[Number(button.dataset.linkMediaToItem)],data.items,null,folders)));$$('[data-edit-media-items]').forEach(button=>button.addEventListener('click',()=>{const file=data.media.find(item=>Number(item.link_id)===Number(button.dataset.editMediaItems));openInvestigationMediaDialog(id,inv.person_id,[Number(button.dataset.mediaId)],(file?.item_ids||'').split(',').filter(Boolean).map(Number),data.items,file,folders);}));$$('[data-delete-investigation-item]').forEach(button=>button.addEventListener('click',async()=>{/* H7 : supprimée tout de suite, « ↶ Annuler » la remet */const iid=Number(button.dataset.deleteInvestigationItem),del=()=>api('delete_investigation_item',{}, {method:'POST',body:{id:iid}}),again=()=>{if(state.module==='enquetes'&&Number(state.currentInvestigationId)===Number(id))return renderInvestigationDetail(id);};try{await del();window.LCNDA_APP.undoDelete({type:'investigation_item',id:iid,message:'Piste supprimée',redo:del,after:again});renderInvestigationDetail(id);}catch(error){toast(error.message,'error');}}));$$('[data-unlink-investigation-media]').forEach(button=>button.addEventListener('click',async()=>{/* R7 : « ↶ Annuler » le remet (avec ses pistes) */const lid=Number(button.dataset.unlinkInvestigationMedia),del=()=>postR('unlink_investigation_media',{id:lid});try{await del();undoDelete({type:'investigation_media',id:lid,message:i18n('Média retiré de l’enquête'),redo:del,after:reload});renderInvestigationDetail(id);}catch(error){toast(error.message,'error');}}));
        $$('[data-unlink-media-from-item]').forEach(button=>button.addEventListener('click',async()=>{/* R7 : retiré tout de suite (le média reste dans l’enquête), « ↶ Annuler » le relie */const link_id=Number(button.dataset.unlinkMediaFromItem),item_id=Number(button.dataset.invItemId),del=()=>postR('unlink_media_from_investigation_item',{link_id,item_id});try{await del();await reload();undoToast(i18n('Média retiré de la piste'),{undo:async()=>{await plusPost('relink_media_item',{link_id,item_id});await reload();},redo:async()=>{await del();await reload();}});}catch(error){toast(error.message,'error');}}));
        $$('[data-unlink-event-from-item]').forEach(button=>button.addEventListener('click',async event=>{event.stopPropagation();/* R7 : retiré tout de suite (l’événement reste dans la généalogie), « ↶ Annuler » le relie */const item_id=Number(button.dataset.unlinkEventFromItem),it=data.items.find(x=>Number(x.id)===item_id),event_id=Number(it?.linked_event_id)||0,del=()=>postR('unlink_event_from_investigation_item',{item_id});try{await del();await reload();undoToast(i18n('Événement retiré de la piste'),{undo:event_id?async()=>{await postR('link_event_to_investigation_item',{item_id,event_id,person_label:inv.person_name||''});await reload();}:null,redo:async()=>{await del();await reload();}});}catch(error){toast(error.message,'error');}}));
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
    Object.assign(window.LCNDA_PARTS, {renderInvestigations, renderInvestigationsSidebar, renderInvestigationDetail, renderBattues, renderBattueDetail, enqReportHtml: reportHtml, enqTemplates: TEMPLATES});
    if (state.module === 'enquetes' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
