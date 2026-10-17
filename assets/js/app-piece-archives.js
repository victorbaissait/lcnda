/* LCNDA — 🏛️ Pièce d'archives en 3D (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * La salle qu'on parcourt aux flèches (Konami code) : classeurs, carte du monde, labo photo, portes vers le musée.
 */
(() => {
    'use strict';
    const {$, $$, card, empty, escapeHtml, persistUiState, personName, setModule, state, toast} = window.LCNDA_APP;
    function archiveRoomSettings(){
        try{return {sound:true,edit:false,bed:true,lamp:true,photoLab:'right',activeRoom:'archive',positions:{},...JSON.parse(localStorage.getItem('genealogie-archive-room')||'{}')}}catch(_){return {sound:true,edit:false,bed:true,lamp:true,photoLab:'right',activeRoom:'archive',positions:{}};}
    }
    function saveArchiveRoomSettings(settings){localStorage.setItem('genealogie-archive-room',JSON.stringify(settings));}
    function archiveRoomPeopleIndex(){
        const people=(state.bootstrap?.archivePeople||state.bootstrap?.persons||[]).filter(Boolean);
        return [...people].sort((a,b)=>{
            // Les fiches sans patronyme restent consultables, après les classeurs alphabétiques.
            const surname=value=>String(value.last_name||value.surname_group||'').trim()||'\uffff';
            const al=surname(a).localeCompare(surname(b),'fr',{sensitivity:'base'});
            if(al)return al;
            const af=(a.first_name||'').localeCompare(b.first_name||'','fr',{sensitivity:'base'});
            return af||Number(a.id||0)-Number(b.id||0);
        });
    }
    function archiveRoomBinderEdge(person){
        const last=String(person?.last_name||person?.surname_group||'').trim();
        const first=String(person?.first_name||'').trim();
        // Les personnes sans patronyme sont rangées après Z, sans nommer la tranche « Sans ».
        return (last||first||'Z').slice(0,3).replace(/\s+/g,'').replace(/^./,c=>c.toUpperCase());
    }
    function archiveRoomBinders(){
        const people=archiveRoomPeopleIndex();
        if(!people.length)return [{label:'Aaa → Zzz',count:0,people:[]}];
        const binders=[];
        for(let i=0;i<people.length;i+=200){
            const slice=people.slice(i,i+200);
            binders.push({label:`${archiveRoomBinderEdge(slice[0])} → ${archiveRoomBinderEdge(slice[slice.length-1])}`,count:slice.length,people:slice});
        }
        return binders;
    }
    function archiveRoomPersonDates(person){
        const birth=person?.birth_date||person?.birth_year||'?';
        const death=person?.death_date||person?.death_year||'?';
        return `${birth} — ${death}`;
    }
    function archiveRoomObject(id,label,module,extra=''){
        const settings=archiveRoomSettings();
        const pos=settings.positions?.[id];
        const style=pos?` style="left:${Number(pos.left).toFixed(2)}%;top:${Number(pos.top).toFixed(2)}%"`:'';
        const object=`<button type="button" class="archive-room-object archive-room-${escapeHtml(id)} ${extra}" data-room-object="${escapeHtml(id)}" data-room-module="${escapeHtml(module)}"${style}><span>${escapeHtml(label)}</span><small>Accéder</small></button>`;
        return id==='graphs'?`${object}${archiveRoomObject('goose','Table · jeu de l’oie','jeu')}`:object;
    }
    function archiveRoomMapDots(){
        const dots=[['Paris',52,38],['Berry',47,52],['Bretagne',34,45],['Lorraine',67,36],['Italie',62,66],['Afrique',55,82],['Pologne',71,24],['Angleterre',38,23]];
        return dots.map(([label,x,y])=>`<i style="left:${x}%;top:${y}%" title="${escapeHtml(label)}"></i>`).join('');
    }
    function archiveRoomPhotoCards(){
        const media=(state.bootstrap?.recent_media||[]).slice(0,4);
        const placeholders=media.length?media.map(item=>item.title||item.filename||'Photo'):['Acte','Portrait','Signature','Document'];
        return placeholders.slice(0,4).map(label=>`<span><b>${escapeHtml(String(label).slice(0,18))}</b></span>`).join('');
    }
    function archiveRoomBinderPanel(index,page=0,turn=''){
        const binder=archiveRoomBinders()[Number(index)]||archiveRoomBinders()[0];
        const people=(binder?.people||[]).slice(0,200);
        const pageSize=12,totalPages=Math.max(1,Math.ceil(people.length/pageSize));
        const safePage=Math.max(0,Math.min(totalPages-1,Number(page)||0));
        const rows=people.length?people.slice(safePage*pageSize,(safePage+1)*pageSize).map((person,i)=>`<button type="button" class="archive-folder-card" data-room-person-id="${person.id}"><span>${String(safePage*pageSize+i+1).padStart(3,'0')}</span><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(archiveRoomPersonDates(person))}</small></button>`).join(''):empty('Aucune fiche dans ce classeur.');
        return `<div class="archive-room-binder-view" data-room-binder-open="${Number(index)}" data-room-binder-page="${safePage}"><header><strong>Classeur ${escapeHtml(binder?.label||'')}</strong><button type="button" class="icon-button" data-room-binder-close title="Ranger le classeur">×</button></header><div class="archive-binder-opening ${turn?`is-turn-${escapeHtml(turn)}`:''}" aria-hidden="true"><div class="archive-binder-back-cover"></div><section class="archive-binder-page archive-binder-page-left"><span class="archive-binder-tab">${escapeHtml(binder?.label||'')}</span><strong>CLASSEUR</strong><small>${Number(binder?.count||0).toLocaleString('fr-FR')} fiches classées</small><i></i><i></i><i></i></section><div class="archive-binder-spine"><i></i><i></i><i></i><i></i></div><section class="archive-binder-page archive-binder-page-right"><strong>INDEX</strong><small>Page ${safePage+1} / ${totalPages}</small><i></i><i></i><i></i><i></i><i></i></section><div class="archive-binder-turn-page"><i></i><i></i><i></i></div></div><p>Classeur ouvert : tourne les pages avec les boutons, puis ouvre une fiche depuis l’index.</p><div class="archive-folder-index">${rows}</div><footer class="archive-binder-index-note"><button type="button" class="button small secondary" data-room-binder-page-action="previous" ${safePage===0?'disabled':''}>← Précédent</button><strong>Page ${safePage+1} / ${totalPages}</strong><button type="button" class="button small secondary" data-room-binder-page-action="next" ${safePage>=totalPages-1?'disabled':''}>Suivant →</button></footer></div>`;
    }
    function archiveRoomHtml(){
        const settings=archiveRoomSettings();
        const binders=archiveRoomBinders();
        const roomTitle=settings.activeRoom==='photo'?'Labo photo':'Pièce d’archives';
        const archiveShortcut='';
        return `<dialog class="archive-room-dialog" id="archive-room-dialog"><div class="archive-room-shell" data-editing="${settings.edit?'1':'0'}" data-sound="${settings.sound?'1':'0'}" data-active-room="${escapeHtml(settings.activeRoom||'archive')}"><header class="archive-room-top"><strong>${escapeHtml(roomTitle)}</strong><div>${archiveShortcut}<button class="button small secondary archive-room-lock" type="button" data-room-edit title="${settings.edit?'Verrouiller : les éléments ne bougent plus, un clic les ouvre':'Déverrouiller pour déplacer les éléments (un clic sans glisser les ouvre toujours)'}">${settings.edit?'🔓 Déverrouillé':'🔒 Verrouillé'}</button><button class="icon-button" type="button" data-room-sound title="${settings.sound?'Couper le son':'Activer le son'}">${settings.sound?'♪':'♪̸'}</button><button class="icon-button" type="button" data-room-close title="Fermer">×</button></div></header><div class="archive-room-stage" tabindex="0"><div class="archive-room-camera"><div class="archive-room-scene"><section class="archive-room-space archive-room-main-space" aria-label="Salle d’archives"><div class="archive-room-plane archive-room-floor"></div><div class="archive-room-plane archive-room-back"></div><div class="archive-room-plane archive-room-left"></div><div class="archive-room-plane archive-room-right"></div><div class="archive-room-plane archive-room-front"></div><div class="archive-room-plane archive-room-ceiling"></div><div class="archive-room-shelves" data-room-object="shelves"><strong>Étagère · classeurs</strong>${binders.map((binder,i)=>`<button type="button" data-room-binder-index="${i}" title="Ouvrir le classeur"><span>${escapeHtml(binder.label)}</span><small>${Number(binder.count||0).toLocaleString('fr-FR')} fiches</small></button>`).join('')}</div><button type="button" class="archive-room-worldmap" data-room-object="worldmap" data-room-module="carte"><span>Carte du monde</span>${archiveRoomMapDots()}<small>Accéder aux cartes</small></button>${archiveRoomObject('graphs','Table à graphiques','graphiques')}${archiveRoomObject('investigation','Tableau d’enquête','enquetes')}${archiveRoomObject('tools','Caisse à outils','maintenance')}${archiveRoomObject('dashboard','Tableau de bord','dashboard')}${settings.bed?archiveRoomObject('bed','Lit','dashboard','optional'):''}${settings.lamp?archiveRoomObject('lamp','Lampe','dashboard','optional'):''}<button type="button" class="archive-room-doorway" data-room-switch="photo"><span>Passer au labo photo</span></button><button type="button" class="archive-room-doorway archive-room-doorway-museum" data-room-museum><span>Entrer au musée</span></button></section><section class="archive-room-space archive-room-photo-space" aria-label="Labo photo"><div class="archive-room-plane archive-room-floor"></div><div class="archive-room-plane archive-room-back"></div><div class="archive-room-plane archive-room-left"></div><div class="archive-room-plane archive-room-right"></div><div class="archive-room-plane archive-room-front"></div><div class="archive-room-plane archive-room-ceiling"></div><button type="button" class="archive-room-object archive-room-photolab" data-room-object="photolab" data-room-module="listes" data-room-list="media"><span>Labo photo</span><small>Accéder aux médias</small></button><div class="archive-room-photo-line">${archiveRoomPhotoCards()}</div><div class="archive-room-trays"><i></i><i></i><i></i></div><button type="button" class="archive-room-doorway archive-room-doorway-back" data-room-switch="archive"><span>Retour aux archives</span></button></section></div></div><aside class="archive-room-help"><span>Flèches : se déplacer dans la pièce</span><span>Clic ou Entrée : ouvrir</span><span>${settings.edit?'Mode édition':'Konami Code'}</span></aside><div class="archive-room-binder-slot"></div></div>${settings.edit?`<footer class="archive-room-editor"><strong>🛋️ Aménager la pièce</strong><span class="archive-room-edit-hint">Glisse un meuble pour le déplacer · un clic sans glisser l’ouvre · 🔒 fige un élément · un tableau glisse le long de son mur · clic puis R : le tourner</span><div class="archive-room-pieces" data-room-pieces></div><button class="button small secondary" type="button" data-room-reset>Tout remettre</button></footer>`:''}</div></dialog>`;
    }

    let archiveRoomThreePromise=null;
    function loadArchiveRoomThree(){
        archiveRoomThreePromise??=import('../vendor/three.module.js');
        return archiveRoomThreePromise;
    }
    function archiveRoomCanvasLabel(THREE,label,{width=512,height=144,subLabel=''}={}){
        const canvas=document.createElement('canvas');
        canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
        ctx.lineWidth=12;ctx.strokeStyle='#000000';ctx.strokeRect(6,6,width-12,height-12);
        ctx.fillStyle='#000000';ctx.font=`900 ${Math.max(26,Math.floor(width/17))}px Arial`;
        const words=String(label).split(/\s+/);let line='',y=height*.46;
        for(const word of words){const next=`${line}${line?' ':''}${word}`;if(ctx.measureText(next).width>width-42&&line){ctx.fillText(line,22,y);line=word;y+=Math.max(30,Math.floor(width/17));}else line=next;}
        if(line)ctx.fillText(line,22,y);
        if(subLabel){ctx.fillStyle='#555';ctx.font=`800 ${Math.max(17,Math.floor(width/28))}px Arial`;ctx.fillText(subLabel,22,height-20);}
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide});
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);
        mesh.scale.set(width/185,height/185,1);
        return mesh;
    }
    function archiveRoomWorldMapMesh(THREE){
        const canvas=document.createElement('canvas');canvas.width=760;canvas.height=430;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle='#000';ctx.lineWidth=9;ctx.strokeRect(5,5,750,420);
        ctx.strokeStyle='#d6d6d6';ctx.lineWidth=2;
        for(let x=95;x<760;x+=95){ctx.beginPath();ctx.moveTo(x,18);ctx.lineTo(x,412);ctx.stroke();}
        for(let y=92;y<430;y+=78){ctx.beginPath();ctx.moveTo(18,y);ctx.lineTo(742,y);ctx.stroke();}
        const coast=(points)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.strokeStyle='#000';ctx.lineWidth=5;ctx.stroke();};
        coast([[82,100],[128,62],[195,68],[214,100],[194,128],[153,145],[115,132]]);
        coast([[186,158],[218,185],[224,244],[204,310],[178,336],[160,280],[164,218]]);
        coast([[344,92],[388,58],[454,68],[476,104],[451,132],[404,124],[375,148]]);
        coast([[380,147],[429,163],[450,220],[428,284],[390,300],[364,238]]);
        coast([[465,90],[540,58],[647,84],[691,128],[657,168],[590,153],[551,194],[496,167]]);
        coast([[618,262],[671,276],[694,318],[650,342],[607,318]]);
        ctx.fillStyle='#000';ctx.font='900 30px Arial';ctx.fillText('CARTE DU MONDE',26,48);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
        mesh.scale.set(2.75,1.55,1);return mesh;
    }
    function archiveRoomInvestigationMesh(THREE){
        const canvas=document.createElement('canvas');canvas.width=620;canvas.height=620;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='#f7f7f7';ctx.fillRect(0,0,620,620);
        ctx.lineWidth=12;ctx.strokeStyle='#000';ctx.strokeRect(6,6,608,608);
        const card=(x,y,w,h,title)=>{ctx.fillStyle='#fff';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#000';ctx.lineWidth=5;ctx.strokeRect(x,y,w,h);ctx.fillStyle='#000';ctx.font='900 24px Arial';ctx.fillText(title,x+13,y+32);ctx.fillStyle='#777';ctx.fillRect(x+13,y+47,w-26,5);ctx.fillRect(x+13,y+62,w*.55,5);};
        const pin=(x,y)=>{ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=4;ctx.stroke();};
        ctx.strokeStyle='#000';ctx.lineWidth=4;[[[138,162],[310,286]],[[458,150],[310,286]],[[150,470],[310,286]],[[470,472],[310,286]]].forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();});
        card(55,88,165,90,'PISTE');card(398,76,165,92,'ACTE');card(58,412,170,94,'PHOTO');card(393,415,170,92,'LIEU');pin(310,286);pin(138,162);pin(458,150);pin(150,470);pin(470,472);
        ctx.fillStyle='#000';ctx.font='900 30px Arial';ctx.fillText('TABLEAU D’ENQUÊTE',28,580);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
        mesh.scale.set(1.7,1.7,1);return mesh;
    }
    async function mountArchiveRoomThree(dialog){
        const stage=$('.archive-room-stage',dialog);
        if(!stage)return;
        const mount=document.createElement('div');mount.className='archive-room-three';mount.setAttribute('aria-label','Pièce d’archives navigable en trois dimensions');
        stage.prepend(mount);
        try{
            const THREE=await loadArchiveRoomThree();
            if(!dialog.isConnected)return;
            const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);
            const camera=new THREE.PerspectiveCamera(62,1,.1,80);
            const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
            renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
            renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Vue intérieure de la pièce d’archives');mount.append(renderer.domElement);
            const ink=new THREE.LineBasicMaterial({color:0x000000});
            const black=new THREE.MeshBasicMaterial({color:0x111111});
            const white=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
            const pale=new THREE.MeshBasicMaterial({color:0xf0f0f0,side:THREE.DoubleSide});
            const floorMaterial=new THREE.MeshBasicMaterial({color:0xfafafa,side:THREE.DoubleSide});
            const targets=[];
            const room={width:10,height:4.8,depth:8};
            const addPlane=(width,height,position,rotation,material=white)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);mesh.position.copy(position);mesh.rotation.set(...rotation);scene.add(mesh);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),ink);edges.position.copy(position);edges.rotation.copy(mesh.rotation);scene.add(edges);return mesh;};
            addPlane(room.width,room.height,new THREE.Vector3(0,room.height/2,-room.depth/2),[0,0,0]);
            addPlane(room.depth,room.height,new THREE.Vector3(-room.width/2,room.height/2,0),[0,Math.PI/2,0],pale);
            addPlane(room.depth,room.height,new THREE.Vector3(room.width/2,room.height/2,0),[0,-Math.PI/2,0],pale);
            addPlane(room.width,room.height,new THREE.Vector3(0,room.height/2,room.depth/2),[0,Math.PI,0],white);
            addPlane(room.width,room.depth,new THREE.Vector3(0,0,0),[-Math.PI/2,0,0],floorMaterial);
            addPlane(room.width,room.depth,new THREE.Vector3(0,room.height,0),[Math.PI/2,0,0],pale);
            const floorGrid=new THREE.GridHelper(room.width,12,0xd4d4d4,0xe9e9e9);floorGrid.position.y=.012;scene.add(floorGrid);
            let into=null; // le meuble en cours (un groupe qu'on peut déplacer en mode édition)
            const panel=(label,x,y,z,w,h,action,subLabel='')=>{const mesh=archiveRoomCanvasLabel(THREE,label,{width:Math.round(w*220),height:Math.round(h*220),subLabel});mesh.position.set(x,y,z);mesh.userData.action=action;(into||scene).add(mesh);targets.push(mesh);return mesh;};
            const box=(width,height,depth,x,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),white);mesh.position.set(x,y,z);(into||scene).add(mesh);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),ink);edges.position.copy(mesh.position);(into||scene).add(edges);return mesh;};
            const prop=(geometry,x,y,z,material=white)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);(into||scene).add(mesh);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),ink);edges.position.copy(mesh.position);edges.rotation.copy(mesh.rotation);(into||scene).add(edges);return mesh;};
            /* Les meubles : chacun est un groupe centré sur lui-même ; en mode édition on le glisse sur le sol (ou le long de son mur), R le tourne.
               Leur place est gardée (settings.layout) ; sinon, leur place de départ. */
            const pieces=[];
            const piece=(id,label,build,{wall=null,def=null}={})=>{
                const g=new THREE.Group();into=g;build();into=null;
                const c=new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());g.children.forEach(o=>{o.position.x-=c.x;o.position.z-=c.z;});
                const L=(archiveRoomSettings().layout||{})[id]||{},d=def||{x:c.x,z:c.z};
                g.position.set(Number.isFinite(L.x)?L.x:d.x,0,Number.isFinite(L.z)?L.z:d.z);g.rotation.y=(Number(L.r)||0)*Math.PI/2;g.visible=!(L.hide??((id==='bed'&&archiveRoomSettings().bed===false)||(id==='lamp'&&archiveRoomSettings().lamp===false)));
                g.userData.piece={id,label,wall,home:{x:d.x,z:d.z}};scene.add(g);pieces.push(g);return g;};
            const line=(points)=>scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x,y,z])=>new THREE.Vector3(x,y,z))),ink));
            // Architectural seams make the room readable from inside without adding colour.
            for(let x=-4.5;x<=4.5;x+=.75)line([[x,.02,-3.96],[x,4.78,-3.96]]);
            for(let z=-3.45;z<=3.45;z+=.7){
                line([[-4.96,.02,z],[-4.96,4.78,z]]);
                line([[4.96,.02,z],[4.96,4.78,z]]);
            }
            box(9.8,.10,.12,0,.08,-3.9);
            box(.12,.10,7.8,-4.9,.08,0);
            box(.12,.10,7.8,4.9,.08,0);
            const settings=archiveRoomSettings();
            if((settings.activeRoom||'archive')==='photo'){
                panel('Labo photo',0,3.1,-4.92,2.9,.72,{type:'module',module:'listes',list:'media'},'ACCÉDER AUX MÉDIAS');
                const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4,2.15,-4.88),new THREE.Vector3(4,2.15,-4.88)]),ink);scene.add(line);
                archiveRoomPhotoCards().match(/<b>(.*?)<\/b>/g)?.slice(0,5).forEach((item,index)=>{const title=item.replace(/<[^>]+>/g,'');panel(title,-3.1+index*1.55,1.55,-4.86,1.05,1.25,{type:'module',module:'listes',list:'media'});});
                [-2.4,0,2.4].forEach(x=>box(1.7,.16,.8,x,.45,-2.6));
                // Porte de sortie bien visible dans le labo photo : elle ramène à la salle d’archives.
                box(.10,2.35,.10,3.02,1.18,3.88);box(.10,2.35,.10,4.08,1.18,3.88);box(1.16,.10,.10,3.55,2.35,3.88);
                const returnDoor=panel('Retour aux archives',3.55,1.18,3.92,.92,2.05,{type:'switch',room:'archive'},'PORTE');
                returnDoor.rotation.y=Math.PI;
            }else{
                // A real bookcase: the binders stand upright and each one remains readable.
                const shelf=box(4.0,3.45,.42,-2.92,2.0,-3.72);shelf.userData.action={type:'binder',index:0};targets.push(shelf);
                [.52,1.15,1.78,2.41,3.04,3.67].forEach(y=>box(3.75,.08,.52,-2.92,y,-3.48));
                const binders=archiveRoomBinders().slice(0,20);
                binders.forEach((binder,index)=>{
                    const column=index%4,row=Math.floor(index/4);
                    const x=-4.10+column*.78,y=3.34-row*.63;
                    const binderBox=box(.66,.48,.31,x,y,-3.46);
                    binderBox.material=new THREE.MeshBasicMaterial({color:index%2?0xf4f4f4:0xffffff});binderBox.userData.action={type:'binder',index};targets.push(binderBox);
                    panel(binder.label,x,y,-3.28,.62,.40,{type:'binder',index});
                });
                piece('worldmap','Carte du monde',()=>{const worldMap=archiveRoomWorldMapMesh(THREE);worldMap.position.set(-4.88,3.02,.75);worldMap.rotation.y=Math.PI/2;worldMap.userData.action={type:'module',module:'carte'};into.add(worldMap);targets.push(worldMap);},{wall:'left'});
                piece('board','Tableau des enquêtes',()=>{const investigationBoard=archiveRoomInvestigationMesh(THREE);investigationBoard.position.set(4.88,2.85,-.55);investigationBoard.rotation.y=-Math.PI/2;investigationBoard.userData.action={type:'module',module:'enquetes'};into.add(investigationBoard);targets.push(investigationBoard);},{wall:'right'});
                piece('dashpanel','Panneau « Tableau de bord »',()=>{const dashboardPanel=panel('Tableau de bord',-4.87,1.25,-1.85,1.7,.62,{type:'module',module:'dashboard'},'ACCÉDER');dashboardPanel.rotation.y=Math.PI/2;},{wall:'left'});
                piece('toolspanel','Panneau « Caisse à outils »',()=>{const toolsPanel=panel('Caisse à outils',4.87,1.05,-2.75,1.28,.62,{type:'module',module:'maintenance'},'ACCÉDER');toolsPanel.rotation.y=-Math.PI/2;},{wall:'right'});
                piece('graph','Table à graphiques',()=>{const graphTable=box(2.45,.62,1.22,-.65,.48,-1.42);graphTable.userData.action={type:'module',module:'graphiques'};targets.push(graphTable);
                const graphLabel=panel('Table à graphiques',-.65,.83,-1.42,2.08,.46,{type:'module',module:'graphiques'},'ACCÉDER');graphLabel.rotation.x=-Math.PI/2;});
                const gamePawn=(x,z,material)=>{prop(new THREE.CylinderGeometry(.07,.1,.08,12),x,.84,z,material);prop(new THREE.CylinderGeometry(.04,.07,.15,12),x,.94,z,material);prop(new THREE.SphereGeometry(.07,12,10),x,1.05,z,material);};
                const gameHorse=(x,z,material)=>{prop(new THREE.CylinderGeometry(.075,.11,.07,12),x,.84,z,material);prop(new THREE.BoxGeometry(.11,.16,.07),x,.95,z,material);prop(new THREE.ConeGeometry(.065,.16,4),x,1.10,z,material);};
                piece('games','Table de jeux',()=>{const gooseTable=box(2.1,.62,1.22,2.05,.48,-1.42);gooseTable.userData.action={type:'module',module:'jeu'};targets.push(gooseTable);
                // Les accessoires restent aux quatre coins : ils ne masquent jamais le cartouche cliquable.
                prop(new THREE.BoxGeometry(.20,.20,.20),1.16,.91,-1.90,white);prop(new THREE.BoxGeometry(.18,.18,.18),1.40,.90,-1.85,black);
                gamePawn(2.96,-1.90,black);gamePawn(2.78,-1.86,white);gameHorse(2.97,-.98,white);gameHorse(2.76,-1.00,black);
                const gooseLabel=panel('Table de jeux',2.05,.83,-1.42,1.76,.46,{type:'module',module:'jeu'},'JOUER');gooseLabel.rotation.x=-Math.PI/2;},{def:{x:2.25,z:-1.42}});
                // A simple bed is made of a frame, mattress, headboard and two pillows.
                {piece('bed','Lit',()=>{
                    const bed=box(3.1,.22,1.82,1.45,.42,-1.45);box(3.18,.26,1.9,1.45,.19,-1.45);box(3.18,.42,.14,1.45,.76,-2.3);box(.82,.12,.48,.55,.68,-1.92);box(.82,.12,.48,1.55,.68,-1.92);bed.userData.action={type:'module',module:'dashboard'};targets.push(bed);},{def:{x:-3.15,z:1.45}});
                }
                // Floor lamp against the right wall.
                piece('lamp','Lampe',()=>{box(.14,1.3,.14,4.55,1.0,-2.7);box(.82,.35,.82,4.55,1.82,-2.7);box(.9,.08,.9,4.55,.08,-2.7);});
                // Door frame on the front wall gives a clear second point of orientation.
                box(.10,2.3,.10,3.02,1.15,3.88);box(.10,2.3,.10,4.08,1.15,3.88);box(1.16,.10,.10,3.55,2.3,3.88);
                panel('Labo photo',3.55,1.82,3.92,.92,2.1,{type:'switch',room:'photo'},'PORTE').rotation.y=Math.PI;
                // Porte du musée de famille (même mur, de l'autre côté) : la visite 3D des salles qu'on aménage soi-même.
                box(.10,2.3,.10,-3.02,1.15,3.88);box(.10,2.3,.10,-4.08,1.15,3.88);box(1.16,.10,.10,-3.55,2.3,3.88);
                panel('Musée',-3.55,1.82,3.92,.92,2.1,{type:'museum'},'PORTE').rotation.y=Math.PI;
            }
            let yaw=0,pitch=0,dragging=false,moved=false,lastX=0,lastY=0;
            const position=new THREE.Vector3(0,1.68,2.6);
            const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
            const updateCamera=()=>{const direction=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));camera.position.copy(position);camera.lookAt(position.clone().add(direction));renderer.render(scene,camera);};
            const resize=()=>{const rect=mount.getBoundingClientRect();camera.aspect=Math.max(1,rect.width)/Math.max(1,rect.height);camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false);updateCamera();};
            const moveRoom=key=>{const distance=.42;const forward=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));if(key==='ArrowUp')position.addScaledVector(forward,distance);if(key==='ArrowDown')position.addScaledVector(forward,-distance);if(key==='ArrowLeft')yaw-=.16;if(key==='ArrowRight')yaw+=.16; /* comme dans le musée : ← tourne à gauche, → à droite */position.x=Math.max(-4.2,Math.min(4.2,position.x));position.z=Math.max(-3.25,Math.min(3.25,position.z));updateCamera();archiveRoomSound();};
            const openTarget=target=>{const action=target?.userData?.action;if(!action)return;if(action.type==='binder'){dialog._roomPass=true;try{$(`[data-room-binder-index="${action.index}"]`,dialog)?.click();}finally{dialog._roomPass=false;}return;}if(action.type==='module'){if(action.list)state.listType=action.list;dialog.close();setModule(action.module);return;}if(action.type==='museum'){dialog.close();window.LCNDA_EXT?.openMuseum?.(0,0);return;}if(action.type==='switch'){const settings=archiveRoomSettings();settings.activeRoom=action.room;saveArchiveRoomSettings(settings);openArchiveRoom();}};
            const pick=event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const shown=o=>{for(let x=o;x;x=x.parent)if(x.visible===false)return false;return true;};const hits=raycaster.intersectObjects(targets.filter(shown),false);if(hits[0])openTarget(hits[0].object);};
            const editing=()=>archiveRoomSettings().edit;let held=null,selected=null;
            const pieceAt=event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const h=raycaster.intersectObjects(pieces.filter(g=>g.visible),true)[0];if(!h)return null;let o=h.object;while(o&&!o.userData.piece)o=o.parent;return o?{g:o,y:h.point.y}:null;};
            const savePiece=g=>{const settings=archiveRoomSettings(),id=g.userData.piece.id;settings.layout={...(settings.layout||{}),[id]:{...((settings.layout||{})[id]||{}),x:Math.round(g.position.x*100)/100,z:Math.round(g.position.z*100)/100,r:Math.round(g.rotation.y/(Math.PI/2))}};saveArchiveRoomSettings(settings);};
            const outline=new THREE.BoxHelper(new THREE.Object3D(),0x0066cc);outline.visible=false;scene.add(outline);
            const select=g=>{selected=g;if(g){outline.setFromObject(g);outline.visible=true;}else outline.visible=false;dialog.querySelectorAll('[data-room-piece]').forEach(r=>r.classList.toggle('is-on',r.dataset.roomPiece===g?.userData.piece.id));renderer.render(scene,camera);};
            dialog._archiveRoomPieces={list:()=>pieces.map(g=>g.userData.piece),select:id=>select(pieces.find(g=>g.userData.piece.id===id)||null),
                rotate:id=>{const g=pieces.find(x=>x.userData.piece.id===id);if(!g||g.userData.piece.wall)return;if(lockedPiece(g)){toast('Élément verrouillé : déverrouille-le (🔒) pour le tourner.');return;}g.rotation.y+=Math.PI/2;savePiece(g);select(g);},
                toggle:(id,on)=>{const g=pieces.find(x=>x.userData.piece.id===id);if(!g)return;g.visible=on;const settings=archiveRoomSettings();settings.layout={...(settings.layout||{}),[id]:{...((settings.layout||{})[id]||{}),hide:!on}};saveArchiveRoomSettings(settings);select(on?g:null);},
                home:id=>{const g=pieces.find(x=>x.userData.piece.id===id);if(!g)return;if(lockedPiece(g)){toast('Élément verrouillé : déverrouille-le (🔒) pour le remettre en place.');return;}g.position.x=g.userData.piece.home.x;g.position.z=g.userData.piece.home.z;g.rotation.y=0;savePiece(g);select(g);}};
            renderer.domElement.addEventListener('keydown',event=>{if(!editing()||!selected)return;if(event.key==='r'||event.key==='R'){event.preventDefault();dialog._archiveRoomPieces.rotate(selected.userData.piece.id);}});
            const lockedPiece=g=>!!((archiveRoomSettings().layout||{})[g.userData.piece.id]?.lock);
            renderer.domElement.addEventListener('pointerdown',event=>{if(editing()&&event.button===0){const at=pieceAt(event);if(at&&lockedPiece(at.g)){select(at.g);return;}if(at){const g=at.g;event.stopImmediatePropagation();held={g,sx:event.clientX,sy:event.clientY,x:g.position.x,z:g.position.z,moved:false};select(g);renderer.domElement.setPointerCapture?.(event.pointerId);return;}select(null);}},true);
            renderer.domElement.addEventListener('pointermove',event=>{if(!held)return;event.stopImmediatePropagation();if(Math.abs(event.clientX-held.sx)+Math.abs(event.clientY-held.sy)>4)held.moved=true;if(!held.moved)return;const g=held.g,w=g.userData.piece.wall,rect=renderer.domElement.getBoundingClientRect();
                // la souris bouge à l'écran : gauche/droite = de côté, haut/bas = vers le fond / vers soi, à l'échelle de la distance du meuble
                const k=2*camera.position.distanceTo(g.position)*Math.tan(camera.fov*Math.PI/360)/Math.max(1,rect.height),dx=(event.clientX-held.sx)*k,dy=(event.clientY-held.sy)*k;
                const p={x:held.x+Math.cos(yaw)*dx-Math.sin(yaw)*dy,z:held.z+Math.sin(yaw)*dx+Math.cos(yaw)*dy};
                if(w)g.position.z=Math.max(-3.4,Math.min(3.4,p.z)); // un tableau glisse le long de son mur
                else{g.position.x=Math.max(-4.4,Math.min(4.4,p.x));g.position.z=Math.max(-3.3,Math.min(3.5,p.z));}
                outline.setFromObject(g);renderer.render(scene,camera);},true);
            renderer.domElement.addEventListener('pointerup',event=>{if(!held)return;event.stopImmediatePropagation();const h=held;held=null;if(h.moved)savePiece(h.g);else pick(event);},true); // un clic sans glisser ouvre l'élément
            renderer.domElement.addEventListener('pointerdown',event=>{dragging=true;moved=false;lastX=event.clientX;lastY=event.clientY;renderer.domElement.setPointerCapture?.(event.pointerId);renderer.domElement.classList.add('is-looking');});
            renderer.domElement.addEventListener('pointermove',event=>{if(!dragging)return;const dx=event.clientX-lastX,dy=event.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;yaw+=dx*.006;pitch=Math.max(-.52,Math.min(.52,pitch-dy*.005));lastX=event.clientX;lastY=event.clientY;updateCamera();});
            renderer.domElement.addEventListener('pointerup',event=>{if(!dragging)return;dragging=false;renderer.domElement.classList.remove('is-looking');if(!moved)pick(event);});
            dialog._archiveRoomMove=moveRoom;
            dialog._archiveRoomThreeCleanup=()=>{delete dialog._archiveRoomMove;window.removeEventListener('resize',resize);renderer.dispose();mount.remove();};
            window.addEventListener('resize',resize);resize();dialog.classList.add('is-three-ready');
            const list=dialog.querySelector('[data-room-pieces]');
            if(list){const L=archiveRoomSettings().layout||{};list.innerHTML=pieces.map(g=>{const p=g.userData.piece;return `<span class="archive-room-piece" data-room-piece="${escapeHtml(p.id)}"><label><input type="checkbox" data-room-pshow ${g.visible?'checked':''}> ${escapeHtml(p.label)}</label>${p.wall?'':'<button type="button" data-room-prot title="Tourner d’un quart de tour (R)">↻</button>'}<button type="button" data-room-phome title="Remettre à sa place de départ">⌂</button><button type="button" data-room-plock title="${L[p.id]?.lock?'Élément verrouillé : il ne bouge plus (cliquer pour le libérer)':'Verrouiller cet élément'}">${L[p.id]?.lock?'🔒':'🔓'}</button></span>`;}).join('');
                list.addEventListener('click',e=>{const row=e.target.closest('[data-room-piece]');if(!row)return;const id=row.dataset.roomPiece;if(e.target.closest('[data-room-plock]')){const st=archiveRoomSettings(),cur=(st.layout||{})[id]||{};st.layout={...(st.layout||{}),[id]:{...cur,lock:!cur.lock}};saveArchiveRoomSettings(st);const b=e.target.closest('[data-room-plock]');b.textContent=cur.lock?'🔓':'🔒';b.title=cur.lock?'Verrouiller cet élément':'Élément verrouillé : il ne bouge plus (cliquer pour le libérer)';return;}if(e.target.closest('[data-room-prot]'))dialog._archiveRoomPieces.rotate(id);else if(e.target.closest('[data-room-phome]'))dialog._archiveRoomPieces.home(id);else if(!e.target.closest('input'))dialog._archiveRoomPieces.select(id);});
                list.addEventListener('change',e=>{const row=e.target.closest('[data-room-piece]');if(row&&e.target.matches('[data-room-pshow]'))dialog._archiveRoomPieces.toggle(row.dataset.roomPiece,e.target.checked);});}
        }catch(error){console.warn('Impossible de charger la pièce 3D.',error);mount.remove();}
    }
    function openArchiveRoom(){
        $('#archive-room-dialog')?.remove();
        document.body.insertAdjacentHTML('beforeend',archiveRoomHtml());
        const dialog=$('#archive-room-dialog'),stage=$('.archive-room-stage',dialog);
        dialog.addEventListener('close',()=>{dialog._archiveRoomThreeCleanup?.();dialog.remove();});
        dialog.showModal();
        stage.focus();
        bindArchiveRoom(dialog);
        mountArchiveRoomThree(dialog);
    }
    function archiveRoomSound(){
        const settings=archiveRoomSettings();
        if(!settings.sound)return;
        try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=180;gain.gain.value=.025;osc.connect(gain);gain.connect(ctx.destination);osc.start();gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.16);osc.stop(ctx.currentTime+.18);}catch(_){}
    }
    function bindArchiveRoom(dialog){
        let x=0,z=0,rot=0;
        const stage=$('.archive-room-stage',dialog),camera=$('.archive-room-camera',dialog);
        const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
        const move=()=>{
            // The room is a first-person interior. Keep the viewpoint inside it instead of
            // translating the entire 3D scene beyond its walls.
            stage.style.setProperty('--archive-room-pan-x',`${x + rot * .45}px`);
            stage.style.setProperty('--archive-room-pan-y',`${z * .1}px`);
            camera.style.transform='none';
        };
        dialog.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();if(typeof dialog._archiveRoomMove==='function'){dialog._archiveRoomMove(event.key);return;}rot=clamp(rot+(event.key==='ArrowLeft'?-4:event.key==='ArrowRight'?4:0),-24,24);z=clamp(z+(event.key==='ArrowUp'?-14:event.key==='ArrowDown'?14:0),-55,55);x=clamp(x+(event.key==='ArrowLeft'?8:event.key==='ArrowRight'?-8:0),-55,55);move();archiveRoomSound();}if(event.key==='Escape')dialog.close();});
        $('[data-room-close]',dialog)?.addEventListener('click',()=>dialog.close());
        $('[data-room-sound]',dialog)?.addEventListener('click',()=>{const settings=archiveRoomSettings();settings.sound=!settings.sound;saveArchiveRoomSettings(settings);openArchiveRoom();});
        $('[data-room-edit]',dialog)?.addEventListener('click',()=>{const settings=archiveRoomSettings();settings.edit=!settings.edit;saveArchiveRoomSettings(settings);openArchiveRoom();});
        $('[data-room-reset]',dialog)?.addEventListener('click',()=>{if(!confirm('Remettre tous les meubles à leur place de départ ?'))return;const settings=archiveRoomSettings();settings.positions={};settings.layout={};settings.bed=true;settings.lamp=true;saveArchiveRoomSettings(settings);openArchiveRoom();});
        $$('[data-room-toggle]',dialog).forEach(input=>input.addEventListener('change',()=>{const settings=archiveRoomSettings();settings[input.dataset.roomToggle]=input.checked;saveArchiveRoomSettings(settings);openArchiveRoom();}));
        $$('[data-room-switch]',dialog).forEach(button=>button.addEventListener('click',()=>{const settings=archiveRoomSettings();settings.activeRoom=button.dataset.roomSwitch||'archive';saveArchiveRoomSettings(settings);archiveRoomSound();openArchiveRoom();}));
        const openBinderFromButton=(button,event=null)=>{
            event?.stopPropagation();if(!button||(archiveRoomSettings().edit&&!dialog._roomPass))return;archiveRoomSound();
            $$('[data-room-binder-index]',dialog).forEach(item=>item.classList.toggle('is-picked',item===button));
            const slot=$('.archive-room-binder-slot',dialog),binderIndex=Number(button.dataset.roomBinderIndex);
            const renderBinderPage=(page=0,turn='')=>{
                slot.innerHTML=archiveRoomBinderPanel(binderIndex,page,turn);
                $('[data-room-binder-close]',slot)?.addEventListener('click',()=>{slot.innerHTML='';button.classList.remove('is-picked');});
                $$('[data-room-binder-page-action]',slot).forEach(control=>control.addEventListener('click',()=>{
                    const current=Number($('.archive-room-binder-view',slot)?.dataset.roomBinderPage||0);
                    const turn=control.dataset.roomBinderPageAction;
                    renderBinderPage(current+(turn==='next'?1:-1),turn);archiveRoomSound();
                }));
                $$('[data-room-person-id]',slot).forEach(link=>link.addEventListener('click',()=>{archiveRoomSound();state.currentPersonId=Number(link.dataset.roomPersonId);persistUiState();dialog.close();setModule('personnes');}));
            };
            renderBinderPage();
        };
        $('.archive-room-shelves',dialog)?.addEventListener('click',event=>openBinderFromButton(event.target.closest('[data-room-binder-index]'),event));
        stage?.addEventListener('click',event=>{
            if(archiveRoomSettings().edit||event.target.closest('[data-room-binder-index],.archive-room-binder-view,[data-room-module],[data-room-switch]'))return;
            const shelves=$('.archive-room-shelves',dialog);
            if(!shelves)return;
            const rect=shelves.getBoundingClientRect();
            if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;
            const buttons=$$('[data-room-binder-index]',shelves);
            if(!buttons.length)return;
            const index=clamp(Math.floor(((event.clientY-rect.top)/Math.max(1,rect.height))*buttons.length),0,buttons.length-1);
            openBinderFromButton(buttons[index],event);
        });
        $$('[data-room-binder-index]',dialog).forEach(button=>button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openBinderFromButton(button,event);}}));
        $$('[data-room-module]',dialog).forEach(button=>button.addEventListener('click',event=>{if(archiveRoomSettings().edit&&!dialog._roomPass)return;archiveRoomSound();if(button.dataset.roomList)state.listType=button.dataset.roomList;dialog.close();setModule(button.dataset.roomModule);}));
        if(!archiveRoomSettings().edit)return;
        $$('[data-room-object]',dialog).forEach(object=>{
            object.addEventListener('pointerdown',event=>{
                if(!archiveRoomSettings().edit||event.button!==0)return;
                event.preventDefault();object.setPointerCapture(event.pointerId);
                const rect=stage.getBoundingClientRect(),id=object.dataset.roomObject;
                const moveObject=ev=>{const settings=archiveRoomSettings(),pos={left:Math.max(1,Math.min(92,(ev.clientX-rect.left)/rect.width*100)),top:Math.max(1,Math.min(88,(ev.clientY-rect.top)/rect.height*100))};settings.positions={...(settings.positions||{}),[id]:pos};saveArchiveRoomSettings(settings);object.style.left=`${pos.left}%`;object.style.top=`${pos.top}%`;object.style.left=`${settings.positions[id].left}%`;object.style.top=`${settings.positions[id].top}%`;};
                const sx=event.clientX,sy=event.clientY,hit=event.target.closest('[data-room-module],[data-room-binder-index]')||object;let movedObj=false; // l'élément réellement cliqué (classeur précis), pas le premier de l'objet
                const moveGuard=ev=>{if(!movedObj&&Math.abs(ev.clientX-sx)+Math.abs(ev.clientY-sy)<=4)return;movedObj=true;moveObject(ev);};
                const stop=()=>{object.removeEventListener('pointermove',moveGuard);object.removeEventListener('pointerup',stop);if(!movedObj){dialog._roomPass=true;try{(hit.matches('[data-room-module],[data-room-binder-index]')?hit:hit.querySelector('[data-room-module],[data-room-binder-index]'))?.click();}finally{dialog._roomPass=false;}}};
                object.addEventListener('pointermove',moveGuard);
                object.addEventListener('pointerup',stop);
            });
        });
    }

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {openArchiveRoom});
})();
