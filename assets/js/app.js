(() => {
    'use strict';

    // ── Réglages de l'interface rangés aussi dans la base (structure n°4, lib/settings.php) ──
    // Les réglages restent lus dans le localStorage (rapide, comme avant) ; la base en garde une copie pour qu'ils
    // suivent la sauvegarde complète et un autre ordinateur. Au démarrage : la base gagne pour les clés qu'elle
    // connaît ; les clés seulement présentes ici (réglages d'avant la mise à jour) y sont envoyées. Ensuite, chaque
    // setItem / removeItem d'une clé « genealogie-* » est renvoyé à la base (groupé, ~1 s plus tard).
    (function syncSettingsWithDatabase(){
        const fromBase=window.LCNDA_SETTINGS;
        if(!window.GENEALOGY_READY||!fromBase||typeof fromBase!=='object')return;
        let store;try{store=window.localStorage;store.length;}catch(_){return;}
        const LOCAL_ONLY=new Set(['genealogie-auto-backup-lock','genealogie-baissait-ui-v2','genealogie-last-route']);
        const synced=key=>typeof key==='string'&&/^genealogie-[a-z0-9-]{1,80}$/.test(key)&&!LOCAL_ONLY.has(key);
        const proto=Object.getPrototypeOf(store);
        const originalSet=proto.setItem,originalRemove=proto.removeItem;
        const pending={set:{},remove:new Set()};let timer=null;
        let detached=false;
        const flush=(keepalive=false)=>{
            clearTimeout(timer);timer=null;
            const set=pending.set,remove=[...pending.remove];
            if(!Object.keys(set).length&&!remove.length)return Promise.resolve();
            pending.set={};pending.remove.clear();
            const csrf=window.INSTALL_CSRF||'';
            return fetch('api.php?action=save_settings',{method:'POST',keepalive,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({set,remove,csrf})})
                .catch(()=>{Object.assign(pending.set,set);remove.forEach(k=>pending.remove.add(k));});
        };
        // Changer de généalogie : les derniers réglages partent dans la base ouverte, puis la copie locale est vidée
        // (sans le dire à la base) ; la généalogie suivante démarre avec SES réglages, rien n'est mélangé.
        window.LCNDA_SETTINGS_DETACH=async()=>{await flush(false);detached=true;for(let i=store.length-1;i>=0;i--){const key=store.key(i);if(synced(key)){try{originalRemove.call(store,key);}catch(_){}}}};
        const schedule=()=>{if(!timer)timer=setTimeout(()=>flush(false),1000);};
        const base=Array.isArray(fromBase)?{}:fromBase;
        // Deuxième écran ou écran posé dans un onglet (?view=…) : la fenêtre principale tient déjà les réglages à jour.
        // Les recopier depuis la base effacerait ce qu'elle vient d'enregistrer et que la base n'a pas encore reçu.
        const secondary=(()=>{try{return new URLSearchParams(location.search).has('view');}catch(_){return false;}})();
        if(!secondary){
            for(const [key,value] of Object.entries(base)){if(synced(key)&&typeof value==='string'){try{originalSet.call(store,key,value);}catch(_){}}}
            for(let i=0;i<store.length;i++){const key=store.key(i);if(synced(key)&&!(key in base)){pending.set[key]=store.getItem(key);}}
        }
        if(Object.keys(pending.set).length)schedule();
        proto.setItem=function(key,value){originalSet.call(this,key,value);if(this===store&&!detached&&synced(String(key))){pending.remove.delete(String(key));pending.set[String(key)]=String(value);schedule();}};
        proto.removeItem=function(key){originalRemove.call(this,key);if(this===store&&!detached&&synced(String(key))){delete pending.set[String(key)];pending.remove.add(String(key));schedule();}};
        window.addEventListener('pagehide',()=>flush(true));
    })();

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    /** Adresse web d'un lien : seulement http(s), mailto ou tel (une adresse « javascript: » importée ne doit pas s'exécuter). */
    /** Réglages d'apparence ; un réglage abîmé (import, édition à la main) ne doit pas empêcher l'app de démarrer. */
    const readDesignSettings = () => { try { const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch (_) { return {}; } };
    const safeUrl = (value = '') => /^(https?:|mailto:|tel:)/i.test(String(value).trim()) ? String(value).trim() : '#';
    const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
    const formObject = form => Object.fromEntries(new FormData(form).entries());
    const lifeText = status => ({living:'Vivante', deceased:'Décédée', unknown:'À vérifier'}[status] || 'À vérifier');
    const genderText = gender => ({male:'Masculin', female:'Féminin', nonbinary:'Autre / non binaire', unknown:'Non renseigné'}[gender] || 'Non renseigné');
    const personName = person => [person.prefix, person.first_name, person.middle_name, person.last_name, person.suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Personne sans nom';
    const years = person => {
        const birth = person.birth_date || person.birth_year || '?';
        const death = person.death_date || (person.living_status === 'living' ? 'aujourd’hui' : person.death_year || '?');
        return `${birth} — ${death}`;
    };
    const eventSymbol = tag => ({BIRT:'★', DEAT:'†', BURI:'✚', MARR:'∞', OCCU:'◆', RESI:'⌂', CENS:'#'}[tag] || '◆');
    const htrLanguageForModel = model => ({
        'fr-actes':'fra',
        'en-handwritten':'eng',
        'latin-medieval':'lat',
        'spanish-historical':'spa',
        'german-19':'deu',
        'italian-medieval':'ita',
        'dutch-experimental':'nld',
        'portuguese-16-19':'por',
        'polish-experimental':'pol',
        'russian-cyrillic':'rus',
        'danish-old-norse':'dan',
        'swedish-old-norse':'swe',
        'finnish-experimental':'fin',
        'norwegian-old-norse':'nor',
        'serbian-cyrillic-old':'srp',
        'croatian-experimental':'hrv',
        'czech-bohemia-19':'ces',
        'hungarian-experimental':'hun',
        'slovak-experimental':'slk',
        'estonian-experimental':'est',
        'latvian-experimental':'lav',
        'lithuanian-experimental':'lit',
        'irish-experimental':'gle',
        'greek-historical':'ell',
        'romanian-experimental':'ron',
        'ukrainian-cyrillic-old':'ukr',
        'yiddish-hebrew-script':'yid'
    }[model] || 'fra');
    const EVENT_ICON_GROUPS = [
        {group:'Généalogie', items:[
            {v:'star',g:'★',l:'Naissance (étoile)'},
            {v:'cross',g:'†',l:'Décès (croix)'},
            {v:'plus',g:'✚',l:'Baptême / Inhumation'},
            {v:'infinity',g:'∞',l:'Union / Mariage'},
            {v:'rings',g:'⚭',l:'Mariage (anneaux)'},
            {v:'house',g:'⌂',l:'Résidence'},
            {v:'hash',g:'#',l:'Recensement'},
            {v:'fleur',g:'⚜',l:'Blason / Noblesse'},
            {v:'church',g:'✝',l:'Religieux'},
            {v:'churchBuilding',g:'⛪',l:'Église'},
            {v:'coffin',g:'⚰',l:'Inhumation (cercueil)'},
            {v:'urn',g:'⚱',l:'Crémation (urne)'},
        ]},
        {group:'Génériques', items:[
            {v:'diamond',g:'◆',l:'Losange'},
            {v:'circle',g:'●',l:'Cercle'},
            {v:'square',g:'■',l:'Carré'},
            {v:'triangle',g:'▲',l:'Triangle'},
            {v:'starOutline',g:'☆',l:'Étoile creuse'},
            {v:'flag',g:'⚑',l:'Drapeau'},
            {v:'bolt',g:'⚡',l:'Éclair'},
            {v:'anchor',g:'⚓',l:'Ancre'},
            {v:'scale',g:'⚖',l:'Balance / Justice'},
            {v:'sword',g:'⚔',l:'Militaire'},
            {v:'mail',g:'✉',l:'Courrier'},
            {v:'pen',g:'✎',l:'Note'},
            {v:'gear',g:'⚙',l:'Administratif'},
            {v:'clock',g:'◷',l:'Horloge'},
            {v:'hourglass',g:'⧗',l:'Sablier'},
            {v:'hexagon',g:'⬡',l:'Hexagone'},
            {v:'pentagon',g:'⬠',l:'Pentagone'},
            {v:'music',g:'♪',l:'Note de musique'},
            {v:'sun',g:'☼',l:'Soleil'},
            {v:'moon',g:'☾',l:'Lune'},
            {v:'flower',g:'⚘',l:'Fleur'},
            {v:'starFilled',g:'✦',l:'Étoile pleine'},
            {v:'starFilled2',g:'✧',l:'Étoile fine'},
            {v:'diamondX',g:'❖',l:'Losange orné'},
            {v:'hexagonFull',g:'⬢',l:'Hexagone plein'},
            {v:'commandKey',g:'⌘',l:'Repère'},
            {v:'hammerPick',g:'⚒',l:'Outils / Artisan'},
            {v:'pick',g:'⛏',l:'Mine / Travail'},
            {v:'umbrella',g:'☂',l:'Parapluie'},
            {v:'shamrock',g:'☘',l:'Trèfle'},
            {v:'telephone',g:'☎',l:'Téléphone'},
            {v:'checkbox',g:'☑',l:'Case validée'},
            {v:'checkboxX',g:'☒',l:'Case refusée'},
            {v:'arrow',g:'➤',l:'Flèche'},
            {v:'check',g:'✓',l:'Coche'},
            {v:'cross2',g:'✗',l:'Croix (annulation)'},
            {v:'scissors',g:'✂',l:'Ciseaux'},
            {v:'airplane',g:'✈',l:'Voyage / Émigration'},
            {v:'circledStar',g:'✪',l:'Étoile cerclée'},
            {v:'pinwheelStar',g:'✯',l:'Étoile à roulette'},
            {v:'florette',g:'❀',l:'Florette'},
            {v:'florette2',g:'❁',l:'Florette pleine'},
            {v:'comet',g:'☄',l:'Comète / Long voyage'},
            {v:'atom',g:'⚛',l:'Science'},
            {v:'benzene',g:'⌬',l:'Chimie'},
            {v:'target',g:'⌖',l:'Lieu / Position'},
            {v:'medical',g:'⚕',l:'Santé / Médecine'},
            {v:'helm',g:'⎈',l:'Voyage maritime'},
            {v:'chains',g:'⛓',l:'Captivité / Esclavage'},
            {v:'hermes',g:'⚚',l:'Commerce'},
            {v:'shield',g:'⛨',l:'Protection / Militaire'},
            {v:'asterisk',g:'✤',l:'Astérisque'},
        ]},
        {group:'Artistique', items:[
            {v:'camera',g:'📷',l:'Photographie'},
            {v:'art',g:'🎨',l:'Peinture / Arts plastiques'},
            {v:'book',g:'📖',l:'Livre / Publication'},
            {v:'movie',g:'🎬',l:'Film / Cinéma'},
            {v:'chisel',g:'⛏',l:'Sculpture'},
            {v:'mask',g:'🎭',l:'Théâtre / Scène'},
            {v:'poem',g:'✍',l:'Poème / Écriture'},
            {v:'play',g:'▶',l:'Vidéo / Performance'},
            {v:'shape',g:'◈',l:'Arts plastiques'},
            {v:'dance',g:'♩',l:'Danse / Spectacle'},
            {v:'stage',g:'✦',l:'Rôle / Acteur'},
        ]},
    ];
    const EVENT_ICON_GLYPHS = Object.fromEntries(EVENT_ICON_GROUPS.flatMap(g=>g.items).map(i=>[i.v,i.g]));
    const typeGlyph = (icon, gedcomTag) => EVENT_ICON_GLYPHS[icon] || eventSymbol(gedcomTag);
    const eventIconOptionsHtml = selected => EVENT_ICON_GROUPS.map(group=>`<optgroup label="${escapeHtml(group.group)}">${group.items.map(i=>`<option value="${i.v}" ${i.v===selected?'selected':''}>${i.g} — ${escapeHtml(i.l)}</option>`).join('')}</optgroup>`).join('');
    const debounce = (fn, wait = 240) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };
    const actionButton = (kind,label,attributes='') => {
        const icon=kind==='delete'?'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5m4-5v5"/>':kind==='add'?'<path d="M12 5v14M5 12h14"/>':kind==='family'?'<circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><path d="M3 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M13 20v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2"/>':kind==='bookmark'||kind==='bookmark-on'?'<path d="M7 4h10v16l-5-4-5 4z"/>':kind==='lock'?'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>':kind==='unlock'?'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.3-2.2M12 14v3"/>':kind==='history'?'<path d="M12 8v5l3 2"/><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/>':kind==='proof'?'<path d="M7 3h8l4 4v14H7zM14 3v5h5M10 14l2 2 4-5"/>':kind==='hypothesis'?'<path d="M12 18h.01M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.3-1.7 2.7"/><circle cx="12" cy="12" r="9"/>':kind==='media'?'<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m7 17 4-4 3 3 2-2 3 3"/>':kind==='tag'?'<path d="M20 10 12 18 4 10V4h6l10 10Z"/><circle cx="7.5" cy="7.5" r="1.2"/>':kind==='source'?'<path d="M7 3h7l5 5v13H7zM14 3v6h5M10 13h6M10 17h6"/>':'<path d="M4 20h4L19 9l-4-4L4 16v4Zm9.5-13.5 4 4"/>';
        return `<button type="button" class="icon-action icon-${escapeHtml(kind)} ${kind==='delete'?'is-danger':''}" ${attributes} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></button>`;
    };
    let listController = null, relationController = null, censusMemberController = null, sidebarController = null, sosaSearchController = null, sosaOutsideClickHandler = null, autoBackupTimer = null, autoBackupRunning = false;
    /* Pour les listes (app-listes.js) : renouveler les contrôleurs d’annulation qui vivent ici. */ function renewListController(){listController?.abort();listController=new AbortController();} const listControllerSignal=()=>listController.signal; function renewSosaSearchController(){sosaSearchController?.abort();sosaSearchController=new AbortController();} const sosaSearchSignal=()=>sosaSearchController.signal; const keepSosaOutsideClick=handler=>sosaOutsideClickHandler=sosaOutsideClickHandler||handler;

    const state = {
        csrf: '', bootstrap: null, module: 'dashboard', currentPersonId: 0, currentPerson: null,
        people: [], peopleQuery: '', peoplePhonetic: false, personTab: 'all', graphTab: 'types', graphMode: 'ancestors', graphDepth: 4, graphZoom: 1, graphStatsType: 'surnames', graphStatsYearFrom:'', graphStatsYearTo:'', graphStatsLimit:'', graphStatsGender:'',graphStatsRules:[], graphKinship:{from:0,to:0,fromName:'',toName:''}, graphCompare:{enabled:false,orientation:'vertical',a:0,b:0,aName:'',bName:''}, graphPlaceMonograph:{id:0,name:'',county:'',state:'',country:'',latitude:null,longitude:null,yearFrom:'',yearTo:'',eventTypeId:0,showEvents:true,showDigests:true,showBattues:true,showCemetery:true}, graphStatsFrozenColors: null,
        mapTab: 'types', mapTag: 'all', mapDisplay: 'markers', mapMode:'standard', mapLocationMode:'city', mapZoom: 6, mapYearFrom:'', mapYearTo:'', mapGender:'', mapSurname:'', mapSurnameMode:'last_name', mapAgeFrom:'', mapAgeTo:'', mapTimelineYear:'', mapRouteArrows:true, mapRouteStep:'all', mapRoutePeople:[], mapRoutePoints:[], mapCenter: {lat:46.7, lon:2.3}, mapPoints: [], distributionNameMode:'last_name', mapOverlayBg:'cassini', mapOverlayOpacity:50,
        listType: '', listGender: '', listReminderMode: '', listReminderCategory: '', listDisplay:'table', listMediaCity: '', listMediaDateFrom: '', listMediaDateTo: '', listMediaKind: 'all', listSosaSort:'sosa_asc', listSosaMissing:false, listSosaImpossible:false, listSosaRootId:0, listSosaRootName:'', listDabovilleSort:'daboville_asc', listDabovilleRootId:0, listDabovilleRootName:'', listCourrierFilter:'', externalLinksSort:'created_desc', externalLinksCountry:'', externalLinksQuery:'', externalLinksShowForm:false, researchKind:'text', researchDisplay:'cards', research: {category:'all',q:''}, placeNameSearch:{q:'',country:'',division:''}, archiveDigestSearch:{q:'',city:'',placeId:0,placeName:'',radiusKm:0,dept:'',region:'',recordType:'',status:''}, archiveDigestGroupByPage:true, dateSearch: {mode:'range',yearFrom:'',yearTo:'',values:'',dateWindowMode:'exact',dateWindowDays:'',eventTypeId:0,occupationId:'',sortDir:'asc',placeId:0,placeName:''}, proximitySearch: {placeId:0,placeName:'',dateMode:'range',yearFrom:'',yearTo:'',exactDate:'',dateWindowMode:'exact',dateWindowDays:'',radiusKm:0}, transcriptionSearch:{q:'',scope:'both'}, inseeSearch:{nom:'',prenom:'',sexe:'',dateNaissance:'',dateDeces:'',birthYearFrom:'',birthYearTo:'',deathYearFrom:'',deathYearTo:'',communeNaissance:'',communeDeces:'',departement:'',region:''}, investigationStatus:'all', investigationDisplay:'cards', investigationQuery:'', currentInvestigationId:0, investigationFolderId:0, currentBattueId:0, battueEditDraft:null, battueShowForm:false, battueCommuneFilter:'all', currentBattueDetail:null, battueTargetTypes:null, folderSortAsc:true,enquetesTab:'enquetes', comparison:{left:0,right:0,leftName:'',rightName:'',query:''}, comparisonMode:'personnes', imageCompare:{left:null,right:null,query:'',scope:'',results:[],personId:0,personName:'',personSuggestions:[]}, maintenanceTab: 'design', timeline: {up:2, down:2, partners:true, history:false}, investigationSort:'', battueSort:'',
        dashboardRandomSeed: 0, lightboxMedia: [], lightboxIndex: 0, lightboxZoom: 1, lightboxPan: {x:0,y:0}, scrollPositions: {}, hasRendered: false, workspaceToken: 0, mapKeepCenter: false, currentLabelsCache: null, eventWitnesses: [], eventSponsors: [], witnessSearchController: null, eventDisplayMode: 'all_mixed', lightboxTagMode: false, lightboxTagType: 'person', lightboxTags: [], lightboxTagDraw: null, lightboxTagsVisible: true, lightboxTagEditId: null,
    };

    const PERSIST_KEY = 'genealogie-baissait-ui-v2';
    // Deuxième écran (panneau « À côté » ou fenêtre détachée) : ouvert avec ?view=… ; il ne mémorise ni sa page ni son
    // état, pour ne pas écraser ceux de la fenêtre principale (même localStorage).
    const SECONDARY_VIEW=(()=>{try{const raw=new URLSearchParams(location.search).get('view');return raw?JSON.parse(raw):null;}catch(_){return null;}})();
    const IS_SECONDARY=Boolean(SECONDARY_VIEW);
    const IS_EMBEDDED=(()=>{try{return window.self!==window.top;}catch(_){return true;}})();
    const LAST_ROUTE_KEY = 'genealogie-last-route';
    const STATS_COLORS_KEY = 'genealogie-stats-colors';
    const STATS_COLORS_PRESETS_KEY = 'genealogie-stats-colors-presets';
    const DEFAULT_STATS_COLORS = ['#0066cc','#075dff','#008fb8','#00a77d','#6d4aff','#c043d7','#e24b75','#ef762f','#1d8a6f','#b03a2e','#1a5276','#7d3c98','#117a65','#9a7d0a','#1f618d','#cb4335','#0e6655','#784212','#2874a6','#b7950b','#154360','#4a235a','#145a32','#7e5109','#1b4f72','#922b21','#0b5345','#6e2f0a','#1a237e','#880e4f','#006064','#33691e','#4a148c','#bf360c','#01579b','#827717','#37474f','#4e342e','#283593','#558b2f'];
    const BATTUE_LEVEL_COLORS_KEY = 'genealogie-battue-level-colors';
    const BATTUE_LEVEL_COLOR_PRESETS_KEY = 'genealogie-battue-level-color-presets';
    const DEFAULT_BATTUE_LEVEL_COLORS = ['#0066cc','#37a36b','#e0b24b','#d96b43','#8f6bd9','#999999','#5b9bd5','#8aa64b','#c75f7a','#4f9d95','#7a6a8f'];
    const PERSON_BADGE_COLORS_KEY = 'genealogie-person-badge-colors';
    const PERSON_BADGE_COLOR_PRESETS_KEY = 'genealogie-person-badge-color-presets';
    const SITE_DEFAULTS_APPLIED_KEY = 'genealogie-site-defaults-applied';
    const SITE_DEFAULT_KEYS = [
        'genealogie-design','genealogie-design-presets','genealogie-menu-order','genealogie-menu-hidden','genealogie-menu-names','genealogie-lightbox-sections','genealogie-calendar-choices','genealogie-diagram-kinds','genealogie-house-snap','genealogie-house-lib','lcnda-decor-tree','genealogie-decor-tree-formats','genealogie-decor-tree-styles','genealogie-edit-tools-order','genealogie-maintenance-groups','genealogie-list-groups','genealogie-mylists-order','genealogie-keynote-prefs','genealogie-vector-map-palette',
        'genealogie-list-order','genealogie-list-hidden','genealogie-map-order','genealogie-map-hidden','genealogie-maintenance-order','genealogie-board-prefs','genealogie-board-prefs-sets',
        'genealogie-graph-diagram-order','genealogie-graph-diagram-hidden','genealogie-graph-stats-order','genealogie-graph-stats-hidden',
        'genealogie-tile-cat-order','genealogie-tile-hidden-cats','genealogie-tile-hidden','genealogie-tile-custom-cats',
        'genealogie-person-blocks','genealogie-dashboard-blocks','genealogie-dashboard-widget-catalog-order','genealogie-dashboard-widget-catalog-hidden','genealogie-events-filter','genealogie-stats-colors','genealogie-stats-colors-presets',
        'genealogie-gender-colors','genealogie-tree-card-fields','genealogie-identity-name-variants-display',
        'genealogie-battue-level-colors','genealogie-battue-level-color-presets','genealogie-person-badge-colors','genealogie-person-badge-color-presets',
    ];
    const DEFAULT_PERSON_BADGE_COLORS = {
        sosa_bg:'#fff7c4', sosa_text:'#5b4300', sosa_star:'#b8860b',
        daboville_bg:'#d8ecff', daboville_text:'#0b3d66', daboville_star:'#1a73b0',
        living_bg:'#bdffd7', living_text:'#000000',
        deceased_bg:'#111111', deceased_text:'#ffffff',
        unknown_bg:'#fff2a6', unknown_text:'#000000',
        outside_bg:'#ffeac0', outside_text:'#7a3800',
        artist_bg:'#e8d5f5', artist_text:'#5c1a99',
    };
    function getStatsColors(){try{const stored=JSON.parse(localStorage.getItem(STATS_COLORS_KEY)||'null');if(Array.isArray(stored)&&stored.length>=1){const out=stored.map((c,i)=>/^#[0-9a-f]{3,8}$/i.test(String(c))?c:DEFAULT_STATS_COLORS[i%DEFAULT_STATS_COLORS.length]);// seulement de vraies couleurs : elles sont écrites telles quelles dans le HTML des graphiques
while(out.length<40)out.push(DEFAULT_STATS_COLORS[out.length%DEFAULT_STATS_COLORS.length]);return out;}return [...DEFAULT_STATS_COLORS];}catch(_){return [...DEFAULT_STATS_COLORS];}}
    function saveStatsColors(colors){localStorage.setItem(STATS_COLORS_KEY,JSON.stringify(colors));}
    function getStatsColorPresets(){try{return JSON.parse(localStorage.getItem(STATS_COLORS_PRESETS_KEY)||'{}');}catch(_){return {};}}
    function saveStatsColorPresets(presets){localStorage.setItem(STATS_COLORS_PRESETS_KEY,JSON.stringify(presets));}
    function getBattueLevelColors(){try{const stored=JSON.parse(localStorage.getItem(BATTUE_LEVEL_COLORS_KEY)||'null');if(Array.isArray(stored)&&stored.length){const out=[...stored];while(out.length<DEFAULT_BATTUE_LEVEL_COLORS.length)out.push(DEFAULT_BATTUE_LEVEL_COLORS[out.length]);return out.slice(0,DEFAULT_BATTUE_LEVEL_COLORS.length);}return [...DEFAULT_BATTUE_LEVEL_COLORS];}catch(_){return [...DEFAULT_BATTUE_LEVEL_COLORS];}}
    function saveBattueLevelColors(colors){localStorage.setItem(BATTUE_LEVEL_COLORS_KEY,JSON.stringify(colors.slice(0,DEFAULT_BATTUE_LEVEL_COLORS.length)));applyBattueLevelColors();}
    function getBattueLevelColorPresets(){try{return JSON.parse(localStorage.getItem(BATTUE_LEVEL_COLOR_PRESETS_KEY)||'{}');}catch(_){return {};}}
    function saveBattueLevelColorPresets(presets){localStorage.setItem(BATTUE_LEVEL_COLOR_PRESETS_KEY,JSON.stringify(presets));}
    function applyBattueLevelColors(){getBattueLevelColors().forEach((color,index)=>document.documentElement.style.setProperty(`--battue-level-${index}`,color));}
    function getPersonBadgeColors(){try{const stored=JSON.parse(localStorage.getItem(PERSON_BADGE_COLORS_KEY)||'null');return {...DEFAULT_PERSON_BADGE_COLORS,...(stored&&typeof stored==='object'?stored:{})};}catch(_){return {...DEFAULT_PERSON_BADGE_COLORS};}}
    function savePersonBadgeColors(colors){localStorage.setItem(PERSON_BADGE_COLORS_KEY,JSON.stringify({...DEFAULT_PERSON_BADGE_COLORS,...colors}));applyPersonBadgeColors();}
    function getPersonBadgeColorPresets(){try{return JSON.parse(localStorage.getItem(PERSON_BADGE_COLOR_PRESETS_KEY)||'{}');}catch(_){return {};}}
    function savePersonBadgeColorPresets(presets){localStorage.setItem(PERSON_BADGE_COLOR_PRESETS_KEY,JSON.stringify(presets));}
    function applyPersonBadgeColors(){const colors=getPersonBadgeColors();Object.entries(colors).forEach(([key,color])=>document.documentElement.style.setProperty(`--person-badge-${key.replaceAll('_','-')}`,color));}
    function collectSiteDefaultSettings(extra={}){
        const settings={...extra};
        SITE_DEFAULT_KEYS.forEach(key=>{const value=localStorage.getItem(key);if(value!==null)settings[key]=value;});
        for(let i=0;i<localStorage.length;i++){
            const key=localStorage.key(i);
            if(!key||!key.startsWith('genealogie-tile-items-'))continue;
            const value=localStorage.getItem(key);
            if(value!==null)settings[key]=value;
        }
        return settings;
    }
    function applySiteDefaults(defaults,force=false){
        const settings=defaults?.settings||{};
        const updated=String(defaults?.updated_at||'');
        if(!Object.keys(settings).length)return false;
        if(!force&&updated&&localStorage.getItem(SITE_DEFAULTS_APPLIED_KEY)===updated)return false;
        let changed=false;
        Object.entries(settings).forEach(([key,value])=>{
            if(typeof value!=='string')return;
            if(force||localStorage.getItem(key)===null){
                localStorage.setItem(key,value);
                changed=true;
            }
        });
        if(updated)localStorage.setItem(SITE_DEFAULTS_APPLIED_KEY,updated);
        if(changed){
            try{
                const design=readDesignSettings();
                if(design.eventDisplayMode)state.eventDisplayMode=design.eventDisplayMode;
                if(design.defaultMapLocationMode)state.mapLocationMode=design.defaultMapLocationMode;
            }catch(_){}
            applyDesign();
            applyGenderColorsToDocument();
            applyBattueLevelColors();
            applyPersonBadgeColors();
            applyMenuOrder();
        }
        return changed;
    }

    // Couleurs de fond/texte par sexe pour les cartes de l'arbre généalogique
    // (modes Ascendants, Descendants, Sablier, Éventail, formes spéciales,
    // Liens de parenté — tout sauf le module Statistiques).
    const GENDER_COLORS_KEY = 'genealogie-gender-colors';
    const DEFAULT_GENDER_COLORS = {
        male:    {bg:'#ffffff', text:'#000000'},
        female:  {bg:'#ffffff', text:'#000000'},
        unknown: {bg:'#ffffff', text:'#000000'},
    };
    function getGenderColors(){
        try{
            const stored=JSON.parse(localStorage.getItem(GENDER_COLORS_KEY)||'null');
            if(stored&&typeof stored==='object'){
                return {
                    male:{bg:stored.male?.bg||DEFAULT_GENDER_COLORS.male.bg,text:stored.male?.text||DEFAULT_GENDER_COLORS.male.text},
                    female:{bg:stored.female?.bg||DEFAULT_GENDER_COLORS.female.bg,text:stored.female?.text||DEFAULT_GENDER_COLORS.female.text},
                    unknown:{bg:stored.unknown?.bg||DEFAULT_GENDER_COLORS.unknown.bg,text:stored.unknown?.text||DEFAULT_GENDER_COLORS.unknown.text},
                };
            }
        }catch(_){}
        return JSON.parse(JSON.stringify(DEFAULT_GENDER_COLORS));
    }
    function saveGenderColors(colors){localStorage.setItem(GENDER_COLORS_KEY,JSON.stringify(colors));}

    // Champs à afficher dans les fiches de l'arbre généalogique
    const TREE_CARD_FIELDS_KEY = 'genealogie-tree-card-fields';
    const DEFAULT_TREE_CARD_FIELDS = {occupation:false,partners:false,living_status:false,marr:false,buri:false,bapt:false,id:false};
    function getTreeCardFields(){try{const stored=JSON.parse(localStorage.getItem(TREE_CARD_FIELDS_KEY)||'null');if(stored&&typeof stored==='object')return {...DEFAULT_TREE_CARD_FIELDS,...stored};return {...DEFAULT_TREE_CARD_FIELDS};}catch(_){return {...DEFAULT_TREE_CARD_FIELDS};}}
    function saveTreeCardFields(fields){localStorage.setItem(TREE_CARD_FIELDS_KEY,JSON.stringify(fields));}

    // Affichage des variantes de nom dans la section Identité
    const IDENTITY_NAME_VARIANTS_DISPLAY_KEY = 'genealogie-identity-name-variants-display';
    function getIdentityNameVariantsDisplay(){try{return localStorage.getItem(IDENTITY_NAME_VARIANTS_DISPLAY_KEY)||'if_filled';}catch(_){return 'if_filled';}}
    function saveIdentityNameVariantsDisplay(value){localStorage.setItem(IDENTITY_NAME_VARIANTS_DISPLAY_KEY,value);}

    function applyGenderColorsToDocument(){
        const colors=getGenderColors();
        const root=document.documentElement;
        root.style.setProperty('--gender-male-bg',colors.male.bg);
        root.style.setProperty('--gender-male-text',colors.male.text);
        root.style.setProperty('--gender-female-bg',colors.female.bg);
        root.style.setProperty('--gender-female-text',colors.female.text);
        root.style.setProperty('--gender-unknown-bg',colors.unknown.bg);
        root.style.setProperty('--gender-unknown-text',colors.unknown.text);
    }
    let persisted = {};
    try { persisted = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}'); } catch (_) { persisted = {}; }
    ['module','currentPersonId','peopleQuery','peoplePhonetic','personTab','peopleScope','graphTab','graphMode','graphDepth','graphZoom','graphStatsType','graphStatsYearFrom','graphStatsYearTo','graphStatsLimit','graphStatsGender','graphStatsRules','mapTag','mapDisplay','mapMode','mapLocationMode','mapZoom','mapYearFrom','mapYearTo','mapGender','mapSurname','mapSurnameMode','mapAgeFrom','mapAgeTo','mapTimelineYear','mapRouteArrows','mapRouteStep','mapRoutePeople','mapOverlayBg','mapOverlayOpacity','distributionNameMode','listType','listGender','listReminderMode','listReminderCategory','listDisplay','listMediaCity','listMediaDateFrom','listMediaDateTo','listMediaKind','listSosaSort','listSosaMissing','listSosaImpossible','listSosaRootId','listSosaRootName','listDabovilleSort','listDabovilleRootId','listDabovilleRootName','listCourrierFilter','externalLinksSort','externalLinksCountry','externalLinksQuery','researchKind','researchDisplay','placeNameSearch','archiveDigestSearch','inseeSearch','investigationStatus','investigationDisplay','investigationQuery','currentInvestigationId','currentBattueId','enquetesTab','maintenanceTab','eventDisplayMode'].forEach(key => {
        if (persisted[key] !== undefined) state[key] = persisted[key];
    });
    if (persisted.mapCenter) state.mapCenter = persisted.mapCenter;
    if (persisted.timeline) state.timeline = {...state.timeline,...persisted.timeline};
    state.timeline = {compare:false,comparePersonId:0,comparePersonName:'',parallelMode:'single',parallelPeople:[],...state.timeline};
    if(!Array.isArray(state.timeline.parallelPeople))state.timeline.parallelPeople=[];
    if (persisted.research) state.research = {...state.research,...persisted.research};
    if (persisted.dateSearch) state.dateSearch = {...state.dateSearch,...persisted.dateSearch};
    if (persisted.proximitySearch) state.proximitySearch = {...state.proximitySearch,...persisted.proximitySearch};
    if (persisted.transcriptionSearch) state.transcriptionSearch = {...state.transcriptionSearch,...persisted.transcriptionSearch};
    if (persisted.graphKinship) state.graphKinship = {...state.graphKinship,...persisted.graphKinship};
    if (persisted.graphCompare) state.graphCompare = {...state.graphCompare,...persisted.graphCompare};
    if (persisted.graphPlaceMonograph) state.graphPlaceMonograph = {...state.graphPlaceMonograph,...persisted.graphPlaceMonograph};
    if (persisted.comparison) state.comparison = {...state.comparison,...persisted.comparison};
    if(!['all','open','paused','closed'].includes(state.investigationStatus))state.investigationStatus='all';
    state.scrollPositions = persisted.scrollPositions || {};

    const modules = {
        jeu: ['JEU', 'Jeu de l’oie / Serpents et échelles / Petits chevaux'],
        dashboard: ['01 — PILOTER', 'Tableau de bord'],
        personnes: ['02 — EXPLORER', 'Personnes'], animaux: ['02 — EXPLORER', 'Animaux'], graphiques: ['03 — VISUALISER', 'Graphiques'],
        carte: ['04 — LOCALISER', 'Carte'], listes: ['05 — INVENTORIER', 'Listes'],
        chronologie: ['06 — RACONTER', 'Chronologie'], recherche: ['07 — RECHERCHER', 'Recherche'],
        enquetes: ['08 — ENQUÊTER', 'Enquêtes'], fiches: ['08 — DOCUMENTER', 'Fiches'], adn: ['08 — ADN', 'ADN'], comparaison: ['09 — COMPARER', 'Comparaison'], maintenance: ['10 — VÉRIFIER', 'Maintenance'],
    };
    const defaultMenuOrder = Object.keys(modules).filter(key=>key!=='jeu');
    const defaultDashboardBlocks = [['stats','Chiffres clés'],['research_progress','Bilan de recherche'],['upcoming','Cette semaine dans l’histoire familiale'],['today','Anniversaires du jour'],['saint_day','Prénom et saint du jour'],['reminders','Rappels'],['recent_changes','Dernières modifications'],['recent_deletions','Dernières suppressions'],['locked_people','Personnes verrouillées récemment'],['recent_people','Dernières fiches consultées'],['random_person','Personne au hasard'],['chosen_person','Personne choisie'],['person_quiz','Quiz personne'],['person_block','Bloc de fiche personne'],['web_search','Chercher sur internet'],['family_objects_widget','Objets de famille'],['family_memories_widget','Mémoire familiale'],['lineage_widget','Ascendants / descendants'],['random_media','Image au hasard'],['favorite_image','Image favorite'],['kinship_widget','Lien entre deux personnes'],['favorites','Personnes favorites'],['work','Travail à suivre'],['completion','Personnes à compléter'],['persons_without_sources','Personnes sans source'],['events_without_sources','Événements sans source'],['events_without_media','Événements sans média'],['recent_media','Derniers médias ajoutés'],['media_unlinked','Médias non rattachés'],['media_to_transcribe','Médias à transcrire'],['media_to_identify','Médias à identifier'],['signatures_to_compare','Signatures à comparer'],['places_to_complete','Communes à compléter'],['branches_less_documented','Branches les moins documentées'],['couples_without_marriage','Couples sans mariage'],['children_missing_parents','Enfants sans parents complets'],['consistency_issues','Incohérences et conflits'],['baptisms_without_sponsors','Baptêmes sans parrain/marraine'],['sosa_missing_near','SOSA manquants proches'],['battue_towns','Communes à explorer'],['battues_priority','Battues prioritaires'],['sources_to_check','Sources à vérifier'],['archive_favorites','Archives favorites'],['daily_research','Liste de travail quotidienne'],['reread_items','À relire'],['sosa_progress','Progression SOSA'],['duplicates','Doublons probables'],['labels','Étiquettes'],['map_overview','Carte globale'],['branch_map','Carte d’une branche'],['random_person_map','Carte d’une personne'],['person_timeline','Timeline d’une personne'],['quick_stat','Stat rapide'],['session_goal','Objectif de session'],['coverage','Couverture de la base'],['places','Lieux les plus présents']];
    const defaultDashboardBlockSpans={lineage_widget:'6',research_progress:'6',saint_day:'6',family_objects_widget:'6',family_memories_widget:'6',web_search:'6',stats:'12',upcoming:'12',today:'6',reminders:'6',recent_changes:'6',recent_deletions:'6',locked_people:'6',recent_people:'6',random_person:'6',chosen_person:'6',person_quiz:'6',person_block:'6',random_media:'6',favorite_image:'6',kinship_widget:'6',favorites:'6',work:'6',completion:'6',persons_without_sources:'6',events_without_sources:'6',events_without_media:'6',recent_media:'6',media_unlinked:'6',media_to_transcribe:'6',media_to_identify:'6',signatures_to_compare:'6',places_to_complete:'6',branches_less_documented:'6',couples_without_marriage:'6',children_missing_parents:'6',consistency_issues:'6',baptisms_without_sponsors:'6',sosa_missing_near:'6',battue_towns:'6',battues_priority:'6',sources_to_check:'6',archive_favorites:'6',daily_research:'6',reread_items:'6',sosa_progress:'6',duplicates:'6',labels:'6',map_overview:'12',branch_map:'12',random_person_map:'12',person_timeline:'6',quick_stat:'6',session_goal:'6',coverage:'6',places:'6'};
    const defaultDashboardBlockLimits={research_suggestions:8,agenda_widget:10,upcoming:8,today:8,reminders:6,recent_changes:6,recent_deletions:6,locked_people:6,recent_people:6,person_quiz:4,favorites:6,completion:6,persons_without_sources:6,events_without_sources:6,events_without_media:6,recent_media:6,media_unlinked:6,media_to_transcribe:6,media_to_identify:6,signatures_to_compare:6,places_to_complete:6,branches_less_documented:6,couples_without_marriage:6,children_missing_parents:6,consistency_issues:6,baptisms_without_sponsors:6,sosa_missing_near:8,battue_towns:6,battues_priority:6,sources_to_check:6,archive_favorites:6,daily_research:5,reread_items:6,duplicates:6,labels:10,places:8,map_overview:80,branch_map:80,random_person_map:40,person_timeline:10};
    defaultDashboardBlocks.push(['achievements','Accomplissements']);
    defaultDashboardBlockSpans.achievements='6';
    // Fiches « patrimoine » (assets/js/heritage.js)
    defaultDashboardBlocks.push(['pets_widget','Animaux de compagnie'],['research_suggestions','Suggestions de recherche'],['app_screen','Écran de l’app (une liste, un diagramme, une fiche…)'],['tab_note','Texte libre (titre, note, consigne)'],['agenda_widget','Mon agenda : à venir'],['voyages_widget','Départs et émigration'],['placements_widget','Enfants placés'],['heraldry_widget','Armoiries'],['poilus_widget','Poilus 14-18'],['saved_searches_widget','Recherches enregistrées'],['field_trips_widget','Circuits sur le terrain'],['offsite_backup_widget','Copie hors de l’ordinateur'],['scan_inbox_widget','Dossier Scans'],['journeys_widget','Voyages impossibles'],['cited_names_widget','Le cercle des ancêtres'],['help_requests_widget','Demandes d’entraide']);
    // Widgets créés dans Maintenance → Éditeur de widgets (assets/js/heritage-widgets.js) : un type « cw_… » chacun
    function syncCustomDashboardWidgets(){
        let defs=[];try{defs=JSON.parse(localStorage.getItem('genealogie-custom-widgets')||'[]');}catch(_){defs=[];}
        for(let i=defaultDashboardBlocks.length-1;i>=0;i--){if(String(defaultDashboardBlocks[i][0]).startsWith('cw_'))defaultDashboardBlocks.splice(i,1);}
        (Array.isArray(defs)?defs:[]).forEach(d=>{if(d&&/^cw_[a-z0-9]{4,24}$/.test(String(d.id))){defaultDashboardBlocks.push([d.id,`${d.icon?d.icon+' ':''}${d.name||'Mon widget'}`]);defaultDashboardBlockSpans[d.id]=String(d.width||'6');}});
    }
    syncCustomDashboardWidgets();
    Object.assign(defaultDashboardBlockSpans,{pets_widget:'12',research_suggestions:'6',app_screen:'12',tab_note:'6',agenda_widget:'6',voyages_widget:'12',placements_widget:'12',heraldry_widget:'6',poilus_widget:'6',saved_searches_widget:'6',field_trips_widget:'6',offsite_backup_widget:'6',scan_inbox_widget:'6',journeys_widget:'6',cited_names_widget:'6',help_requests_widget:'6'});
    const dashboardWidgetInfo={
        app_screen:'N’importe quel écran de l’app dans la page : une liste, un diagramme, une statistique, une fiche, la carte, un outil… Choisis-le avec le crayon ✎.',
        tab_note:'Un titre, une note, une consigne ou un pense-bête, avec des émojis.',
        research_suggestions:'Les trous de ta lignée Sosa, avec où et quand chercher : « Ton Sosa 18 n’a pas de décès : regarde les décès et sépultures de Lille entre 1820 et 1840 ». Les générations les plus proches d’abord.',
        stats:'Résumé chiffré de la base.',
        upcoming:'Dates familiales qui reviennent dans les prochains jours.',
        today:'Anniversaires de naissance, mariage ou décès du jour.',
        reminders:'Rappels autonomes et rappels liés aux enquêtes.',
        recent_changes:'Dernières actions enregistrées dans le journal.',
        recent_deletions:'Dernières suppressions restaurables quand c’est possible.',
        locked_people:'Personnes verrouillées récemment.',
        recent_people:'Fiches ouvertes récemment sur ce navigateur.',
        random_person:'Affiche une personne au hasard ou une personne précise.',
        lineage_widget:'Les ascendants ou les descendants (ou les deux) d’une personne choisie ou de la dernière fiche consultée. Le crayon règle la personne, le sens et le nombre de générations.',
        research_progress:'Ton bilan de recherche : ce que tu as fait ce mois-ci et cette année (fiches créées, sources, médias, nouveaux ancêtres Sosa, battues et enquêtes terminées), d’après le journal des modifications.',
        saint_day:'Le saint fêté aujourd’hui et les personnes de ta base nées ou baptisées ce jour-là ; signale celles qui portent le prénom du saint (autrefois, on donnait souvent ce prénom).',
        family_objects_widget:'Les objets de famille d’une personne (choisie, ou la dernière fiche consultée) : photo, transmission, qui les a aujourd’hui. Le crayon règle la personne.',
        family_memories_widget:'La mémoire familiale d’une personne (choisie, ou la dernière fiche consultée) : recettes, expressions, chansons, surnoms, traditions. Le crayon règle la personne.',
        web_search:'Cherche une personne (choisie, ou la dernière fiche consultée) sur les moteurs de recherche, les sites de généalogie, la presse ancienne… Le crayon règle la personne et les sites affichés.',
        person_quiz:'Quiz rapide sur une personne choisie ou aléatoire.',
        person_block:'Affiche un bloc de fiche personne pour une personne choisie ou aléatoire.',
        random_media:'Affiche une image au hasard.',
        favorites:'Personnes marquées comme favorites.',
        work:'Synthèse des choses à traiter.',
        completion:'Fiches qui manquent d’informations importantes.',
        persons_without_sources:'Personnes qui n’ont aucune source directe ou indirecte.',
        events_without_sources:'Événements sans source associée.',
        events_without_media:'Événements sans média associé.',
        recent_media:'Derniers médias ajoutés à la base.',
        media_unlinked:'Médias isolés ou mal rattachés.',
        media_to_transcribe:'Médias sans transcription OCR, HTR ou manuelle.',
        media_to_identify:'Images sans personne ou signature identifiée.',
        signatures_to_compare:'Signatures identifiées qui méritent comparaison.',
        places_to_complete:'Communes ou lieux sans coordonnées complètes.',
        branches_less_documented:'Branches familiales qui ont peu de sources/médias.',
        couples_without_marriage:'Couples sans événement de mariage enregistré.',
        children_missing_parents:'Personnes dont un parent ou les deux manquent.',
        consistency_issues:'Dates, lieux et liens parentaux susceptibles de se contredire.',
        baptisms_without_sponsors:'Baptêmes sans parrain ou marraine enregistré.',
        sosa_missing_near:'Premiers numéros SOSA manquants.',
        battue_towns:'Communes de battue qui restent à explorer.',
        battues_priority:'Battues ouvertes avec le plus de choses à chercher.',
        sources_to_check:'Pistes et sources à vérifier.',
        archive_favorites:'Accès rapide aux archives départementales favorites ou utiles.',
        daily_research:'Actions prioritaires issues des rappels, lacunes d’archives et battues.',
        reread_items:'Éléments à relire ou à vérifier.',
        sosa_progress:'Avancement de la lignée SOSA.',
        duplicates:'Groupes de doublons probables.',
        labels:'Étiquettes les plus utilisées.',
        map_overview:'Mini-carte globale des lieux de la base.',
        branch_map:'Mini-carte filtrée sur une branche ou un patronyme.',
        random_person_map:'Mini-carte d’itinéraire, au hasard ou pour une personne précise.',
        person_timeline:'Timeline compacte des événements d’une personne.',
        quick_stat:'Un indicateur configurable en grand.',
        session_goal:'Objectif libre pour garder le cap pendant une session.',
        achievements:'Badges obtenus à partir de la complétude et de la progression de la base.',
        coverage:'Taux de fiches avec naissance, décès, média et source.',
        voyages_widget:'Les départs de ta famille (Québec, États-Unis, Argentine, Algérie…) : date, port, navire, destination, et le trajet sur la carte, à travers l’océan.',
        placements_widget:'Les enfants mis en nourrice, abandonnés ou recueillis par l’hospice : lieu, durée du placement, et la carte des trajets.',
        heraldry_widget:'Les armoiries de ta famille : l’image du blason, sa description héraldique et les personnes qui l’ont porté.',
        poilus_widget:'Les soldats de 14-18 : régiments, blessures, et le lien vers les journaux de marche et opérations (Mémoire des hommes).',
        saved_searches_widget:'Tes recherches enregistrées, relancées à l’ouverture : signale les nouvelles fiches qui y répondent (après un import, une fusion…).',
        field_trips_widget:'Les circuits « sur les traces de mes ancêtres » à faire, avec leurs étapes.',
        offsite_backup_widget:'Date de ta dernière copie hors de cet ordinateur (disque externe, clé, iCloud, Dropbox…).',
        scan_inbox_widget:'Les derniers fichiers arrivés par le dossier Scans surveillé (scanner, téléphone, AirDrop), à identifier.',
        journeys_widget:'Une même fiche à deux endroits trop éloignés en trop peu de temps : signe de deux homonymes confondus.',
        agenda_widget:'Ce qui t’attend : salons, visites d’archives, rappels, relances, circuits, tâches… sur les jours que tu choisis (7 jours, un mois…), avec ce qui est en retard et les anniversaires de la famille.',
        pets_widget:'Les animaux de la famille, avec leur photo : chiens, chats, chevaux… et leurs anniversaires.',
        help_requests_widget:'Tes demandes d’entraide en cours (forums, Geneanet, Facebook) : rédigées, publiées, réponse reçue.',
        cited_names_widget:'Les personnes sans fiche qui reviennent le plus souvent dans tes transcriptions (témoins, voisins, parrains…).',
        places:'Lieux les plus présents dans les événements.'
    };
    const defaultListTypes = [['persons','01','Personnes'],['events','02','Événements'],['places','03','Lieux'],['precise_places','03b','Lieux précis'],['media','04','Médias'],['recueils','04a','Recueils'],['depouillements','04a2','Dépouillements'],['audios','04b','Audios'],['videos','04c','Vidéos'],['labels','05','Étiquettes'],['occupations','06','Métiers'],['employers','07','Employeurs'],['census','08','Recensements'],['census_households','08b','Recensements : tous les foyers'],['reminders','09','Rappels'],['my_calendar','09b','Mon agenda'],['genea_calendar','09c','Calendrier de la famille'],['research_budget','10','Budget de recherche'],['signatures','11','Signatures'],['sosa','12','SOSA'],['daboville','12b',"d'Aboville"],['archives','13','Archives'],['external_links','14','Liens externes utiles'],['courriers','15','Registre de courriers'],['archive_visits','16','Planificateur de visite d’archives'],['living_contacts','17','Répertoire des vivants'],['family_objects','18','Objets de famille'],['family_memories','19','Mémoire familiale'],['fairs','20','Salons et événements'],['closed_branches','21','Branches fermées'],['field_trips','22','Circuits sur le terrain'],['family_papers','23','Papiers de famille'],['coats_of_arms','24','Armoiries'],['old_maps','25','Cartes anciennes'],['probate','26','Inventaires après décès'],['voyages_list','27','Départs et émigration'],['placements_list','28','Enfants placés'],['poilus_list','29','Poilus 14-18'],['parishes','30','Paroisses d’Ancien Régime'],['cited_names','31','Noms cités (le cercle)'],['languages','32','Langues de la famille'],['help_requests','33','Demandes d’entraide'],['historical_context','34','Épidémies, guerres, hivers'],['resistance_list','35','Résistants'],['villages','36','Fiche d’un village'],['voter_cards','37','Cartes d’électeur'],['family_booklets','38','Livrets de famille'],['investigations_list','39','Enquêtes'],['battues_list','40','Battues'],['atelier_list','41','Projets de l’Atelier'],['boards_list','42','Tableaux'],['pets','43','Animaux de compagnie'],['topic_sheets_list','44','Fiches'],['layout_books','44b','Livres de famille (mise en page)'],['edit_tools','44c','Outils de modification'],['houses','44d','Maisons de famille'],['periodicals','44d','Revues, livres et documentaires'],['press_ads','44e','Petites annonces et courriers aux journaux']];
    const defaultExternalLinks=[
        {id:'socface',name:'Projet SocFace',url:'https://socface.site.ined.fr/',access:'public',cost:'gratuit',category:'Population / histoire sociale',country:'France',description:'Projet scientifique utile pour croiser histoire sociale, familles et populations.'},
        {id:'francearchives',name:'FranceArchives',url:'https://francearchives.gouv.fr/',access:'public',cost:'gratuit',category:'Archives',country:'France',description:'Portail national des archives françaises.'},
        {id:'gallica',name:'Gallica',url:'https://gallica.bnf.fr/',access:'public',cost:'gratuit',category:'Bibliothèque numérique',country:'France',description:'Presse, livres, cartes, images et documents numérisés de la BnF.'},
        {id:'memoire-hommes',name:'Mémoire des hommes',url:'https://www.memoiredeshommes.sga.defense.gouv.fr/',access:'public',cost:'gratuit',category:'Militaire',country:'France',description:'Bases militaires françaises, morts pour la France, unités, journaux de marche.'},
        {id:'familysearch',name:'FamilySearch',url:'https://www.familysearch.org/',access:'public',cost:'gratuit',category:'Généalogie',country:'',description:'Documents et arbres collaboratifs, compte souvent nécessaire.'},
        {id:'geneanet',name:'Geneanet',url:'https://www.geneanet.org/',access:'public',cost:'semi-gratuit',category:'Généalogie',country:'',description:'Arbres, relevés, bibliothèques et entraide généalogique.'},
        {id:'filae',name:'Filae',url:'https://www.filae.com/',access:'public',cost:'payant',category:'Généalogie',country:'France',description:'Recherches nominatives et collections indexées.'},
        {id:'openstreetmap',name:'OpenStreetMap',url:'https://www.openstreetmap.org/',access:'public',cost:'gratuit',category:'Cartographie',country:'',description:'Carte collaborative utile pour repérer communes, hameaux et lieux-dits.'}
    ];
    function externalLinks(){try{const stored=JSON.parse(localStorage.getItem('genealogie-external-links')||'null');return Array.isArray(stored)?stored:defaultExternalLinks;}catch(_){return defaultExternalLinks;}}
    function saveExternalLinks(rows){localStorage.setItem('genealogie-external-links',JSON.stringify(rows));}
    const reminderCategories = [['chercher_acte','Chercher un acte'],['commander_acte','Commander un acte'],['attente_reception_acte',"Attente de la réception d'un acte"],['fin_abonnement',"Fin d'abonnement"],['prendre_abonnement','Prendre un abonnement'],['se_desabonner','Se désabonner'],['acheter_revue','Acheter une revue'],['emprunter_revue','Emprunter une revue'],['consulter_revue','Consulter une revue'],['acheter_livre','Acheter un livre'],['retrouver_livre','Retrouver un livre'],['prendre_livre_bibliotheque','Prendre un livre à la bibliothèque'],['rendre_livre_bibliotheque','Rendre le livre à la bibliothèque'],['rendre_livre','Rendre livre'],['chercher_internet','Chercher sur internet'],['continuer_recherche_internet','Continuer la recherche sur internet'],['analyser_document','Analyser un document'],['se_rendre_archives','Se rendre à des archives'],['se_rendre_endroit','Se rendre à un endroit'],['autre','Autre']];
    const reminderCategoryLabel = value => (reminderCategories.find(([key])=>key===value)||[,''])[1];
    const budgetCategories = [['acte_payant','Acte payant'],['abonnement','Abonnement'],['deplacement_archives','Déplacement aux archives'],['revue_livre','Revue / livre'],['materiel','Matériel'],['autre','Autre']];
    const budgetCategoryLabel = value => (budgetCategories.find(([key])=>key===value)||[,'Autre'])[1];
    const courrierOrganismes = [['mairie','Mairie'],['archives','Archives départementales'],['copies','Service de reproduction / commande de copies'],['greffe','Greffe / tribunal'],['notaire','Notaire'],['autre','Autre organisme']];
    const courrierOrganismeLabel = value => (courrierOrganismes.find(([key])=>key===value)||[,'Autre organisme'])[1];
    const courrierCopyFormats = [['numerique','Fichier numérique (PDF / image)'],['papier','Photocopie papier'],['haute_definition','Scan haute définition'],['autre','Autre support']];
    const courrierCopyFormatLabel = value => (courrierCopyFormats.find(([key])=>key===value)||[,'Fichier numérique (PDF / image)'])[1];
    const courrierStatuts = [['envoye','Envoyé'],['en_attente','En attente'],['reponse_recue','Réponse reçue']];
    const courrierStatutLabel = value => (courrierStatuts.find(([key])=>key===value)||[,'Envoyé'])[1];
    const courrierFilters = [['','En cours'],['fait_utilise','Faits — utilisés'],['fait_non_utilise','Faits — non utilisés'],['fait_tous','Tous les faits'],['tous','Tout (en cours + faits)']];
    const defaultMapTypes = [['all','Tous les événements'],['BIRT','Naissances'],['DEAT','Décès'],['MARR','Mariages'],['BURI','Inhumations']];
    const defaultPersonBlocks = [
        ['identity','Identité'],['animal','🐾 Caractéristiques de l’animal (résumé)'],['animal_ident','🔖 Animal : identification et origines'],['animal_parents','🌳 Animal : parents et pedigree'],['animal_offspring','🐾 Animal : descendance'],['animal_siblings','👥 Animal : frères et sœurs'],['animal_owners','🏠 Animal : ses maîtres'],['animal_titles','🏆 Animal : titres, concours'],['animal_health','🩺 Animal : santé'],['animal_measures','📏 Animal : poids et taille'],['animal_life','📅 Animal : sa vie'],['animal_story','📖 Animal : histoire et souvenirs'],['animal_custom','🗂️ Animal : mes catégories'],['web_search','Chercher sur internet'],['family_objects','Objets de famille'],['family_memories','Mémoire familiale'],['events','Événements'],['ascendants','Ascendants'],['descendants','Descendants'],['media','Médias'],['correspondance','Correspondance'],['memories','Témoignages / souvenirs'],['notes','Notes'],['census','Recensements'],['sources','Sources & citations'],['refs','Références externes'],['maternity','Repères de maternité'],['investigations','Enquêtes'],['signatures','Signatures'],['event_map','Carte des événements'],['completion','Score de complétude'],['bio','Biographie automatique'],['military','Militaire'],['cemetery','Cimetière'],['artistic_works','Œuvres artistiques'],['artist_books','📚 Artiste : bibliographie'],['artist_works','🖼️ Artiste : œuvres et inventaire'],['artist_discography','💿 Artiste : discographie'],['artist_filmography','🎬 Artiste : filmographie'],['voyages','Départs / émigration'],['placements','Enfant placé'],['heraldry','Blason / noblesse'],['poilu','Poilu 14-18'],['probate','Inventaire après décès'],['family_papers_block','Papiers de famille (originaux)'],['languages','Langues'],['resistance','Résistant'],['voter','Cartes d’électeur'],['booklets','Livrets de famille'],['boards','Tableaux'],['diagrams','📊 Diagrammes'],['dna','🧬 ADN'],['pets','Animaux de compagnie'],['custom_blocks','Mes blocs (éditeur de blocs)'],['mentions','Cité dans'],['recueils','Recueils'],['person_exports','Exports fiche']
    ];
    const defaultPersonBlockSpans={diagrams:'12',dna:'12',recueils:'12',voter:'12',booklets:'12',boards:'12',pets:'12',animal:'12',animal_ident:'6',animal_parents:'12',animal_offspring:'12',animal_siblings:'6',animal_owners:'6',animal_titles:'12',animal_health:'6',animal_measures:'6',animal_life:'12',animal_story:'12',animal_custom:'12',ascendants:'6',descendants:'6',family_objects:'12',family_memories:'12',web_search:'12',identity:'4',events:'8',media:'12',correspondance:'12',memories:'12',notes:'4',census:'12',sources:'4',refs:'4',maternity:'12',investigations:'12',signatures:'12',event_map:'6',completion:'6',bio:'12',military:'12',cemetery:'12',artistic_works:'12',artist_books:'12',artist_works:'12',artist_discography:'12',artist_filmography:'12',voyages:'12',placements:'12',heraldry:'6',poilu:'12',probate:'12',family_papers_block:'6',languages:'6',resistance:'12',custom_blocks:'12',mentions:'6',person_exports:'6'};
    const personBlockWidthChoices=[['12','1'],['6','1/2'],['4','1/3'],['3','1/4'],['8','2/3'],['9','3/4']];
    function savedOrder(key,defaults){try{const stored=JSON.parse(localStorage.getItem(key)||'[]');const order=stored.filter(item=>defaults.includes(item));defaults.forEach((item,index)=>{if(order.includes(item))return;const previous=defaults.slice(0,index).reverse().find(value=>order.includes(value));const next=defaults.slice(index+1).find(value=>order.includes(value));if(previous)order.splice(order.indexOf(previous)+1,0,item);else if(next)order.splice(order.indexOf(next),0,item);else order.push(item);});return order;}catch(_){return defaults;}}
    /** Ordre du menu principal : les onglets de l'app et ses onglets à soi (Éditeur d'onglets), rangés ensemble */
    function orderedMenuKeys(){
        const defaults=[...defaultMenuOrder];
        customTabs().forEach(t=>{const at=t.after&&defaults.includes(t.after)?defaults.indexOf(t.after)+1:defaults.indexOf('maintenance');defaults.splice(at<0?defaults.length:at,0,t.id);});
        return savedOrder('genealogie-menu-order',defaults);
    }
    function dashboardWidgetCatalogHiddenKeys(){try{return JSON.parse(localStorage.getItem('genealogie-dashboard-widget-catalog-hidden')||'[]');}catch(_){return[];}}
    function orderedDashboardWidgetTypes(includeHidden=false){const keys=defaultDashboardBlocks.map(item=>item[0]);const order=savedOrder('genealogie-dashboard-widget-catalog-order',keys);const hidden=dashboardWidgetCatalogHiddenKeys();return order.filter(type=>includeHidden||!hidden.includes(type)).map((type,index)=>{const item=defaultDashboardBlocks.find(row=>row[0]===type)||[type,type];return [item[0],String(index+1).padStart(2,'0'),item[1]];});}
    function listHiddenKeys(){try{return JSON.parse(localStorage.getItem('genealogie-list-hidden')||'[]');}catch(_){return[];}}
    function orderedListTypes(includeHidden=false){const order=savedOrder('genealogie-list-order',defaultListTypes.map(item=>item[0]));const hidden=listHiddenKeys();let visibleIndex=0;return order.filter(value=>includeHidden||!hidden.includes(value)).map((value,index)=>{const item=defaultListTypes.find(row=>row[0]===value);return [item[0],String(includeHidden?index+1:++visibleIndex).padStart(2,'0'),item[2]];});}
    function dynamicMapTypes(){const tags=(state.bootstrap?.mapEventTags||[]);const extra=tags.map(t=>[t.gedcom_tag,t.label]);const all=[['all','Tous les événements'],...extra];return all;}function orderedMapTypes(includeHidden=false){const dynamic=dynamicMapTypes();const keys=dynamic.map(i=>i[0]);const order=savedOrder('genealogie-map-order',keys);const hidden=mapHiddenKeys();return order.filter(value=>includeHidden||value==='all'||!hidden.includes(value)).map((value,index)=>{const item=dynamic.find(r=>r[0]===value)||[value,value];return [item[0],String(index+1).padStart(2,'0'),item[1]];});}
    const defaultMaintenanceTabs=[['design','01','Apparence'],['design_board','01b','Tableau de bord'],['design_sheets','01c','Fiches personnes et animaux'],['issues','02','Incohérences avancées'],['duplicates','03','Fusion de doublons'],['branches','04','Branches'],['bulk','05','Modifications groupées'],['changes','06','Journal des modifications'],['export','07','Export propre'],['import','08','Import'],['labels','09','Étiquettes'],['event_types','10','Types d\'événements'],['calendar_measures','11','Calendrier / mesures'],['help','12','Glossaire'],['faq','12b','FAQ / tuto'],['infos','13','Infos'],['safety','14','Sécurité & comparaison'],['entretien','15','Entretien'],['fusion','16','Fusionner un arbre'],['raccourcis','17','Raccourcis clavier'],['journeys','18','Voyages impossibles'],['scan_inbox','19','Dossier « Scans » surveillé'],['sync','20','Travail à deux'],['ages','21','Âges et écarts'],['harmonize','22','Harmoniser les variantes'],['misplaced','23','Lieux mal placés'],['cousin_vault','24','Copie chez un cousin'],['block_editor','25','Éditeur de blocs'],['board_prefs','25e','Réglages des tableaux'],['pet_prefs','25f','Réglages des animaux'],['montage_prefs','25g','Montage, retouche, mise en page et son'],['dna_prefs','25h','ADN : affichage et réglages'],['viewer_prefs','25i','Visionneuse d’images'],['diagram_kinds','25j','Types de diagrammes'],['widget_editor','25b','Éditeur de widgets'],['stats_editor','25c','Éditeur de statistiques'],['tabs_editor','25d','Éditeur d’onglets'],['htr','26','Reconnaissance d’écriture (HTR)'],['my_lists','27','Éditeur de listes'],['atelier','28','Atelier de recherche']];
    function orderedMaintenanceTabs(){const order=savedOrder('genealogie-maintenance-order',defaultMaintenanceTabs.map(item=>item[0]));return order.map((value,index)=>{const item=defaultMaintenanceTabs.find(row=>row[0]===value);return [item[0],String(index+1).padStart(2,'0'),item[2]];});}
    function mapBackgroundValue(value){return ['offline','color','grid','dark','osmfr','light','minimal','roads','relief','cyclosm','wikimedia','satellite','ohm','esri_topo','esri_street','voyager','osmde','cassini','cassini_royal','etatmajor','nls_6inch','nls_natgrid','cartoweb','swisstopo','swisstopo_dufour','swisstopo_siegfried','ferraris','vandermaelen','popp','frickx','buurtwegen','ign_ortho_1950','ign_scan50_1950','ign_hr_ortho','ign_planv2','nls_25inch','nls_1inch','gsgs3906','london_1940s','usgs_topo','usgs_imagery','ign_es_mtn50','ign_es_pnoa','esri_ocean','esri_natgeo','esri_physical','esri_relief','nasa_modis','nasa_landsat_weld'].includes(value)?value:'bw';}
    function mapBackgroundSelectHtml(mapBg){
        const cats=orderedTileCategories(false);
        return cats.map(cat=>{
            const options=cat.items.map(([v,l])=>`<option value="${escapeHtml(v)}" ${mapBg===v?'selected':''}>${escapeHtml(l)}</option>`).join('');
            return `<optgroup label="${escapeHtml('— '+cat.label+' —')}">${options}</optgroup>`;
        }).join('');
    }
    /**
     * Fond hors ligne : tuiles dessinées par l'application à partir des contours de communes de la base. Utilisé quand on le
     * choisit, quand l'ordinateur n'a pas Internet, et à la place de toute tuile qui ne se charge pas.
     */
    const offlineTileFallback=new Map();
    function offlineTileUrl(z,x,y){const n=2**z;return `api.php?action=offline_tile&z=${z}&x=${((x%n)+n)%n}&y=${y}`;}
    function mapTileUrl(bg,z,x,y){
        if(bg==='offline'||(typeof navigator!=='undefined'&&navigator.onLine===false))return offlineTileUrl(z,x,y);
        const url=mapTileUrlOnline(bg,z,x,y);
        if(url){offlineTileFallback.set(url,offlineTileUrl(z,x,y));if(offlineTileFallback.size>4000)offlineTileFallback.delete(offlineTileFallback.keys().next().value);}
        return url;
    }
    // Une tuile d'Internet qui ne vient pas (pas de réseau, site en panne) : remplacée par la tuile hors ligne
    document.addEventListener('error',event=>{const el=event.target;if(!el||!el.getAttribute)return;
        const attr=el.tagName==='IMG'?'src':(el.tagName?.toLowerCase()==='image'?'href':'');if(!attr)return;
        const src=el.getAttribute(attr)||el.getAttribute('xlink:href')||'';const alt=offlineTileFallback.get(src);
        if(alt&&src!==alt){el.setAttribute(attr,alt);if(el.hasAttribute('xlink:href'))el.setAttribute('xlink:href',alt);}},true);
    window.addEventListener('offline',()=>{toast('Pas d’Internet : les cartes passent au fond hors ligne.');if(['carte','enquetes','personnes','listes'].includes(state.module))setModule(state.module,false);});
    function mapTileUrlOnline(bg,z,x,y){
        if(bg==='dark')return `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
        if(bg==='osmfr')return `https://a.tile.openstreetmap.fr/hot/${z}/${x}/${y}.png`;
        if(bg==='light')return `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
        if(bg==='minimal')return `https://a.basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`;
        if(bg==='roads')return `https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/${z}/${x}/${y}.png`;
        if(bg==='relief'){
            // OpenTopoMap ne fournit pas de tuiles natives au-delà du zoom 17 : on réutilise (overzoom)
            // la tuile la plus proche disponible plutôt que de charger une tuile vide/cassée.
            const maxZ=17;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://a.tile.opentopomap.org/${maxZ}/${Math.floor(x/factor)}/${Math.floor(y/factor)}.png`;}
            return `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`;
        }
        if(bg==='cyclosm')return `https://a.tile-cyclosm.openstreetmap.fr/cyclosm/${z}/${x}/${y}.png`;
        if(bg==='wikimedia')return `https://maps.wikimedia.org/osm-intl/${z}/${x}/${y}.png`;
        if(bg==='satellite')return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
        if(bg==='ohm')return `https://tile.openhistoricalmap.org/map/${z}/${x}/${y}.png`;
        if(bg==='esri_topo')return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`;
        if(bg==='esri_street')return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
        if(bg==='voyager')return `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
        if(bg==='osmde')return `https://a.tile.openstreetmap.de/${z}/${x}/${y}.png`;
        if(bg==='cassini'){
            // La carte de Cassini (Géoplateforme/IGN, numérisation BnF haute définition) est disponible du zoom 6 au zoom 14.
            // Couche correcte : BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI, TileMatrixSet PM_6_14, format image/png.
            // En dessous de 6 : fond OSM standard (couverture mondiale).
            // Au-delà de 14 : overzoom sur la tuile zoom 14 la plus proche.
            const minZ=6,maxZ=14;
            if(z<minZ)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI&STYLE=normal&TILEMATRIXSET=PM_6_14&TILEMATRIX=${maxZ}&TILECOL=${Math.floor(x/factor)}&TILEROW=${Math.floor(y/factor)}&FORMAT=image/png`;}
            return `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI&STYLE=normal&TILEMATRIXSET=PM_6_14&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/png`;
        }
        if(bg==='cassini_royal'){
            // Carte de Cassini, exemplaire du roi (Géoplateforme/IGN), disponible du zoom 0 au zoom 14.
            // Couche : AN-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI, TileMatrixSet PM_0_14, format image/jpeg.
            const maxZ=14;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=AN-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI&STYLE=normal&TILEMATRIXSET=PM_0_14&TILEMATRIX=${maxZ}&TILECOL=${Math.floor(x/factor)}&TILEROW=${Math.floor(y/factor)}&FORMAT=image/jpeg`;}
            return `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=AN-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI&STYLE=normal&TILEMATRIXSET=PM_0_14&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/jpeg`;
        }
        if(bg==='etatmajor'){
            // Carte d'État-Major (Géoplateforme/IGN), France, 19e siècle (1820-1866). Disponible du zoom 6 au zoom 15.
            // Couche : GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40, TileMatrixSet PM_6_15, format image/jpeg.
            const minZ=6,maxZ=15;
            if(z<minZ)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40&STYLE=normal&TILEMATRIXSET=PM_6_15&TILEMATRIX=${maxZ}&TILECOL=${Math.floor(x/factor)}&TILEROW=${Math.floor(y/factor)}&FORMAT=image/jpeg`;}
            return `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40&STYLE=normal&TILEMATRIXSET=PM_6_15&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/jpeg`;
        }
        if(bg==='swisstopo_dufour'||bg==='swisstopo_siegfried'){
            // Swisstopo — cartes historiques suisses (WMTS public sans clé) :
            // swisstopo_dufour  : Carte Dufour (1845-1865), couche ch.swisstopo.hiks-dufour, format image/png.
            // swisstopo_siegfried : Carte Siegfried (1870-1949), couche ch.swisstopo.hiks-siegfried, format image/png.
            // Ces couches couvrent la Suisse uniquement ; en dehors de la zone ou hors plage de zoom on replie sur OSM.
            const tileLon=(tx,tz)=>(tx+0.5)/Math.pow(2,tz)*360-180;
            const tileLat=(ty,tz)=>{const n=Math.PI-2*Math.PI*(ty+0.5)/Math.pow(2,tz);return 180/Math.PI*Math.atan(Math.sinh(n));};
            const lon=tileLon(x,z),lat=tileLat(y,z);
            const inSwitzerlandArea=lon>=5.9&&lon<=10.6&&lat>=45.7&&lat<=47.9;
            if(!inSwitzerlandArea)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            const layer=bg==='swisstopo_dufour'?'ch.swisstopo.hiks-dufour':'ch.swisstopo.hiks-siegfried';
            const minZ=4,maxZ=17;
            if(z<minZ)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/${maxZ}/${Math.floor(x/factor)}/${Math.floor(y/factor)}.png`;}
            return `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/${z}/${x}/${y}.png`;
        }
        if(bg==='nls_6inch'||bg==='nls_natgrid'){
            // National Library of Scotland — tuiles publiques hébergées sur S3 (gratuites, sans clé).
            // nls_6inch : Ordnance Survey 6-inch County Series 1842-1882 (Écosse), zoom max 16.
            // nls_natgrid : Ordnance Survey 1:10 560 National Grid Maps 1940s-1960s (majeure partie de la Grande-Bretagne), zoom max 16.
            // Ces tuilesets sont au format XYZ standard (même convention que partout ailleurs dans ce fichier) :
            // le préfixe "tms:" parfois utilisé pour les référencer (ex. JOSM) désigne juste une source de tuiles
            // personnalisée et ne signale pas une inversion d'axe Y ; il ne faut donc PAS inverser y ici.
            const minZ=4,maxZ=16,path=bg==='nls_6inch'?'os/6inchfirst':'os/britain10knatgrid';
            if(z<minZ)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://mapseries-tilesets.s3.amazonaws.com/${path}/${maxZ}/${Math.floor(x/factor)}/${Math.floor(y/factor)}.png`;}
            return `https://mapseries-tilesets.s3.amazonaws.com/${path}/${z}/${x}/${y}.png`;
        }
        if(bg==='cartoweb'){
            // CartoWeb.be (IGN/NGI belge) — carte topographique officielle Belgique, zoom 7–17, couvre uniquement la Belgique.
            const tileLon=(tx,tz)=>(tx+0.5)/Math.pow(2,tz)*360-180;
            const tileLat=(ty,tz)=>{const n=Math.PI-2*Math.PI*(ty+0.5)/Math.pow(2,tz);return 180/Math.PI*Math.atan(Math.sinh(n));};
            const lon=tileLon(x,z),lat=tileLat(y,z);
            const inBelgiumArea=lon>=2.1&&lon<=6.6&&lat>=49.4&&lat<=51.95;
            if(!inBelgiumArea)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            const minZ=7,maxZ=17;
            if(z<minZ)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/${maxZ}/${Math.floor(y/factor)}/${Math.floor(x/factor)}.png`;}
            return `https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/${z}/${y}/${x}.png`;
        }
        if(bg==='swisstopo'){
            // Swisstopo (swisstopo.ch) — carte nationale couleur de la Suisse, zoom 2–17.
            // Couche : ch.swisstopo.pixelkarte-farbe, WMTS public sans clé, format image/jpeg.
            // En dehors de la zone suisse ou hors de la plage de zoom, on replie sur OSM.
            const tileLon=(tx,tz)=>(tx+0.5)/Math.pow(2,tz)*360-180;
            const tileLat=(ty,tz)=>{const n=Math.PI-2*Math.PI*(ty+0.5)/Math.pow(2,tz);return 180/Math.PI*Math.atan(Math.sinh(n));};
            const lon=tileLon(x,z),lat=tileLat(y,z);
            const inSwitzerlandArea=lon>=5.9&&lon<=10.6&&lat>=45.7&&lat<=47.9;
            if(!inSwitzerlandArea)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            const minZ=2,maxZ=17;
            if(z<minZ)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${maxZ}/${Math.floor(x/factor)}/${Math.floor(y/factor)}.jpeg`;}
            return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`;
        }
        if(bg==='ign_ortho_1950'){
            // Photos aériennes historiques IGN 1950-1965 (Géoplateforme, sans clé).
            return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS.1950-1965&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/png`;
        }
        if(bg==='ign_scan50_1950'){
            // Carte Scan50 1950 — carte papier numérisée IGN (Géoplateforme, sans clé).
            return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/jpeg`;
        }
        if(bg==='ign_hr_ortho'){
            // Orthophotos actuelles haute résolution IGN (Géoplateforme, sans clé).
            return `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=HR.ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/jpeg`;
        }
        if(bg==='ign_planv2'){
            // Plan IGN v2 — carte topographique actuelle France (Géoplateforme, sans clé).
            return `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/png`;
        }
        if(bg==='nls_25inch'){
            // OS 25-inch County Series Écosse 1892-1905 (National Library of Scotland), zoom max 18.
            const maxZ=18;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://mapseries-tilesets.s3.amazonaws.com/os/25inch/${maxZ}/${Math.floor(x/factor)}/${Math.floor(y/factor)}.png`;}
            return `https://mapseries-tilesets.s3.amazonaws.com/os/25inch/${z}/${x}/${y}.png`;
        }
        if(bg==='nls_1inch'){
            // OS 1-inch première série Grande-Bretagne (National Library of Scotland), vers 1885-1900, zoom max 15.
            const maxZ=15;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://mapseries-tilesets.s3.amazonaws.com/os/one-inch-first-bart38/${maxZ}/${Math.floor(x/factor)}/${Math.floor(y/factor)}.png`;}
            return `https://mapseries-tilesets.s3.amazonaws.com/os/one-inch-first-bart38/${z}/${x}/${y}.png`;
        }
        if(bg==='gsgs3906'){
            // GSGS 3906 — carte militaire 1:25000 War Office 1940-1943 (Écosse), zoom max 15.
            const maxZ=15;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://mapseries-tilesets.s3.amazonaws.com/gsgs3906/${maxZ}/${Math.floor(x/factor)}/${Math.floor(y/factor)}.png`;}
            return `https://mapseries-tilesets.s3.amazonaws.com/gsgs3906/${z}/${x}/${y}.png`;
        }
        if(bg==='london_1940s'){
            // Londres 1940s — cartes 1:1250/1:2500 National Grid (National Library of Scotland), zoom max 16.
            const maxZ=16;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://mapseries-tilesets.s3.amazonaws.com/london_1940s/${maxZ}/${Math.floor(x/factor)}/${Math.floor(y/factor)}.png`;}
            return `https://mapseries-tilesets.s3.amazonaws.com/london_1940s/${z}/${x}/${y}.png`;
        }
        if(bg==='usgs_topo'){
            // USGS National Topo Map — carte topographique officielle USA (domaine public), format ArcGIS tile/z/y/x.
            return `https://basemap.nationalmap.gov/ArcGIS/rest/services/USGSTopo/MapServer/tile/${z}/${y}/${x}`;
        }
        if(bg==='usgs_imagery'){
            // USGS Imagery Only — satellite USA (domaine public), format ArcGIS tile/z/y/x.
            return `https://basemap.nationalmap.gov/ArcGIS/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`;
        }
        if(bg==='ign_es_mtn50'){
            // MTN50 première édition Espagne 1910-1970 (IGN España, sans clé).
            return `https://www.ign.es/wmts/primera-edicion-mtn?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN50&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image/jpeg`;
        }
        if(bg==='ign_es_pnoa'){
            // Orthophotos PNOA actuelles Espagne (IGN España, sans clé).
            return `https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image/jpeg`;
        }
        if(['ferraris','vandermaelen','popp','frickx','buurtwegen'].includes(bg)){
            // Cartes historiques officielles de Digitaal Vlaanderen (geo.api.vlaanderen.be), Belgique.
            // TILEMATRIXSET=GoogleMapsVL est compatible Web Mercator/XYZ standard (pas d'inversion d'axe nécessaire).
            // ferraris : Carte de Ferraris (1777), couvre les Pays-Bas autrichiens et la principauté de Liège (≈ Belgique actuelle).
            // vandermaelen : Carte topographique Vandermaelen (1846-1854).
            // popp : Atlas cadastral Popp (1842-1879).
            // frickx : Carte Fricx (1744).
            // buurtwegen : Atlas der Buurtwegen (≈1840), couverture flamande.
            // Zoom 0 à 21 annoncé par le fournisseur ; on garde un overzoom de sécurité au-delà de 19 pour limiter le nombre de requêtes à très fort zoom.
            // Ce service ne couvre en réalité que la Belgique (essentiellement la Flandre) : en dehors de cette zone,
            // chaque tuile demandée échoue (404/vide), ce qui déclenche le message "fond indisponible" même si le
            // service fonctionne correctement à l'intérieur de sa zone. On calcule donc la position (lon/lat) du
            // centre de la tuile demandée et on retombe sur OSM si elle est hors du territoire belge (mêmes formules
            // de projection Web Mercator que pour le reste de la carte).
            const tileLon=(tx,tz)=>(tx+0.5)/Math.pow(2,tz)*360-180;
            const tileLat=(ty,tz)=>{const n=Math.PI-2*Math.PI*(ty+0.5)/Math.pow(2,tz);return 180/Math.PI*Math.atan(Math.sinh(n));};
            const lon=tileLon(x,z),lat=tileLat(y,z);
            // Bornes officielles du territoire belge "onshore" (EPSG:31370, WGS84 bounds) : 2.5–6.4°E, 49.5–51.51°N.
            const inBelgiumArea=lon>=2.5&&lon<=6.4&&lat>=49.5&&lat<=51.51;
            if(!inBelgiumArea)return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
            const layerByBg={ferraris:'ferraris',vandermaelen:'vandermaelen',popp:'popp',frickx:'frickx',buurtwegen:'abw'},maxZ=19,layer=layerByBg[bg];
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://geo.api.vlaanderen.be/HISTCART/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=${layer}&STYLE=&FORMAT=image/png&TILEMATRIXSET=GoogleMapsVL&TILEMATRIX=${maxZ}&TILEROW=${Math.floor(y/factor)}&TILECOL=${Math.floor(x/factor)}`;}
            return `https://geo.api.vlaanderen.be/HISTCART/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=${layer}&STYLE=&FORMAT=image/png&TILEMATRIXSET=GoogleMapsVL&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
        }
        if(bg==='esri_ocean')return `https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/${z}/${y}/${x}`;
        if(bg==='esri_natgeo')return `https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/${z}/${y}/${x}`;
        if(bg==='esri_physical')return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/${z}/${y}/${x}`;
        if(bg==='esri_relief')return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/${z}/${y}/${x}`;
        if(bg==='nasa_modis'){
            // MODIS Terra TrueColor (NASA GIBS) — zoom max 9, date figée 2024-06-01.
            // Format : /z/y/x.jpg (ordre WMTS standard : zoom / row / col).
            const maxZ=9;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-06-01/GoogleMapsCompatible_Level9/${maxZ}/${Math.floor(y/factor)}/${Math.floor(x/factor)}.jpg`;}
            return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-06-01/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
        }
        if(bg==='nasa_landsat_weld'){
            // Landsat/WELD TrueColor annuel (NASA GIBS) — imagerie historique mondiale, date figée 2000-12-01.
            // Zoom max 12, format : /z/y/x.jpg (ordre WMTS standard : zoom / row / col).
            const maxZ=12;
            if(z>maxZ){const factor=Math.pow(2,z-maxZ);return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/2000-12-01/GoogleMapsCompatible_Level12/${maxZ}/${Math.floor(y/factor)}/${Math.floor(x/factor)}.jpg`;}
            return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/2000-12-01/GoogleMapsCompatible_Level12/${z}/${y}/${x}.jpg`;
        }
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }
    const fontFamilyOptions=[
        ['system','Police système (auto)'],
        ['arial','Arial'],
        ['comicsans','Comic Sans MS'],
        ['courier','Courier New'],
        ['garamond','Garamond'],
        ['georgia','Georgia'],
        ['helvetica','Helvetica'],
        ['palatino','Palatino Linotype'],
        ['tahoma','Tahoma'],
        ['times','Times New Roman'],
        ['trebuchet','Trebuchet MS'],
        ['verdana','Verdana'],
    ];
    function fontFamilyValue(value){if(typeof value==='string'&&value.indexOf('local:')===0&&value.length>6)return value;return fontFamilyOptions.some(item=>item[0]===value)?value:'system';}
    function fontFamilyStack(value){
        const stacks={
            system:'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
            arial:'Arial,Helvetica,sans-serif',
            helvetica:'Helvetica,Arial,sans-serif',
            georgia:'Georgia,"Times New Roman",serif',
            times:'"Times New Roman",Times,serif',
            verdana:'Verdana,Geneva,Arial,sans-serif',
            trebuchet:'"Trebuchet MS",Arial,sans-serif',
            courier:'"Courier New",Courier,monospace',
            garamond:'Garamond,Georgia,serif',
            tahoma:'Tahoma,Verdana,Arial,sans-serif',
            palatino:'"Palatino Linotype","Book Antiqua",Georgia,serif',
            comicsans:'"Comic Sans MS","Comic Sans",cursive,sans-serif',
        };
        // Police détectée dynamiquement via l'API Local Font Access (préfixée "local:" + nom exact de la famille).
        if(typeof value==='string'&&value.indexOf('local:')===0){
            const familyName=value.slice(6);
            return familyName?`"${familyName.replace(/"/g,'')}",Arial,Helvetica,sans-serif`:stacks.arial;
        }
        // Si la police choisie n'est pas reconnue (ex: design importé depuis un autre projet), on retombe sur la police système.
        return stacks[fontFamilyValue(value)]||stacks.system;
    }
    // fiches des personnes et fiches des animaux : deux réglages à part (« Toutes les fiches »), plus l'exception de chaque fiche
    // blocs propres aux animaux (seulement sur leurs fiches) ; sur une fiche d'animal, les blocs d'humains les plus courants sont cachés au départ
    const ANIMAL_BLOCKS=['animal','animal_ident','animal_parents','animal_offspring','animal_siblings','animal_owners','animal_titles','animal_health','animal_measures','animal_life','animal_story','animal_custom'];
    // la disposition de départ des fiches d'animaux (avant tout réglage) : ordre, blocs cachés, largeurs
    const ANIMAL_BLOCKS0={'order':['identity','animal','animal_ident','animal_parents','animal_offspring','animal_siblings','animal_owners','animal_titles','animal_health','animal_measures','animal_life','animal_story','animal_custom','web_search','family_objects','family_memories','events','ascendants','descendants','media','correspondance','memories','notes','census','sources','refs','maternity','investigations','signatures','event_map','completion','bio','military','cemetery','artistic_works','voyages','placements','heraldry','poilu','probate','family_papers_block','languages','resistance','voter','booklets','boards','pets','custom_blocks','mentions','recueils','person_exports'],'hidden':['web_search','family_objects','family_memories','correspondance','census','maternity','signatures','military','voter','booklets','pets'],'widths':{'identity':'4','animal':'4','animal_ident':'4','animal_parents':'4','animal_offspring':'4','animal_siblings':'4','animal_owners':'4','animal_titles':'4','animal_health':'4','animal_measures':'4','animal_life':'4','animal_story':'4','animal_custom':'4','web_search':'12','family_objects':'12','family_memories':'12','events':'4','ascendants':'4','descendants':'4','media':'12','correspondance':'12','memories':'12','notes':'4','census':'12','sources':'4','refs':'4','maternity':'12','investigations':'4','signatures':'12','event_map':'6','completion':'6','bio':'12','military':'12','cemetery':'12','artistic_works':'12','voyages':'12','placements':'12','heraldry':'6','poilu':'12','probate':'12','family_papers_block':'6','languages':'6','resistance':'6','voter':'12','booklets':'12','boards':'6','pets':'6','custom_blocks':'6','mentions':'6','recueils':'6','person_exports':'6'}};
    const blockKindOf=personId=>personId&&Number(personId)===Number(state.currentPersonId)&&state.currentPersonKind==='animal'?'animal':'human';
    const blockBaseKey=kind=>kind==='animal'?'genealogie-animal-blocks':'genealogie-person-blocks';
    function personBlockSettings(personId=0,kind=blockKindOf(personId)){const baseKey=blockBaseKey(kind);const defaults=defaultPersonBlocks.map(item=>item[0]);let settings={order:defaults,hidden:[],hideEmptyIdentity:false,widths:{}};if(kind==='animal')settings={...settings,order:[...ANIMAL_BLOCKS0.order],hidden:[...ANIMAL_BLOCKS0.hidden],widths:{...ANIMAL_BLOCKS0.widths}};try{settings={...settings,...JSON.parse(localStorage.getItem(baseKey)||'{}')};}catch(_){}if(personId){try{settings={...settings,...JSON.parse(localStorage.getItem(`genealogie-person-blocks-${personId}`)||'{}')};}catch(_){}}settings.order=[...(settings.order||[]).filter(key=>defaults.includes(key)),...defaults.filter(key=>!(settings.order||[]).includes(key))];settings.hidden=(settings.hidden||[]).filter(key=>defaults.includes(key));
        // Blocs ajoutés le 2026-10-08 : masqués tant qu'ils n'ont jamais été réglés dans Apparence
        let savedBlockOrder=[];try{savedBlockOrder=[...(JSON.parse(localStorage.getItem(baseKey)||'{}').order||[]),...(personId?(JSON.parse(localStorage.getItem(`genealogie-person-blocks-${personId}`)||'{}').order||[]):[])];}catch(_){}
        ['family_objects','family_memories'].forEach(key=>{if(!savedBlockOrder.includes(key)&&!settings.hidden.includes(key))settings.hidden.push(key);});
        // bloc des animaux (2026-10-15) : sous l'identité, même si l'ordre a déjà été réglé
        // blocs des animaux : sous l'identité tant qu'ils n'ont pas été rangés ; sur une fiche d'animal jamais réglée, les blocs d'humains courants cachés
        {const missing=ANIMAL_BLOCKS.filter(k=>!savedBlockOrder.includes(k));if(missing.length){settings.order=settings.order.filter(k=>!missing.includes(k));const at=settings.order.indexOf('identity');settings.order.splice(at+1,0,...missing);}}
        settings.hideEmptyIdentity=!!settings.hideEmptyIdentity;
        // lignes vides de l'Identité : choix fait sur la fiche elle-même (bouton en bas du bloc)
        if(personId){let own=null;try{own=localStorage.getItem(`genealogie-identity-empty-${personId}`);}catch(_){}if(own==='1'||own==='0')settings.hideEmptyIdentity=own==='1';}
        settings.widths=Object.fromEntries(Object.entries(settings.widths||{}).filter(([key,value])=>defaults.includes(key)&&personBlockWidthChoices.some(choice=>choice[0]===String(value))));defaults.forEach(key=>{if(!settings.widths[key])settings.widths[key]=defaultPersonBlockSpans[key]||'12';});return settings;}
    function savePersonBlockSettings(settings,personId=0,kind='human'){const key=personId?`genealogie-person-blocks-${personId}`:blockBaseKey(kind);localStorage.setItem(key,JSON.stringify({order:settings.order,hidden:settings.hidden||[],widths:settings.widths||{},hideEmptyIdentity:!!settings.hideEmptyIdentity}));}
    function dashboardWidgetId(type){return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
    function dashboardWidgetLabel(type){if(type==='__group')return '📁 Ensemble (titre)';return (defaultDashboardBlocks.find(item=>item[0]===type)||[,type])[1];}
    /** Un widget à soi qui habille un widget de l'app (Éditeur de widgets) se règle comme ce widget-là. */
    function dashboardBaseType(type){const d=String(type).startsWith('cw_')?window.LCNDA_EXT?.customWidgetDefs?.()?.[type]:null;return d&&d.kind==='app'&&d.base?d.base:type;}
    function dashboardNewWidget(type,source={}){
        const width=String(source.width||defaultDashboardBlockSpans[type]||'6');
        const lt=dashboardBaseType(type);
        const limit=defaultDashboardBlockLimits[lt]?Math.max(1,Math.min(80,Number(source.limit||defaultDashboardBlockLimits[lt])||defaultDashboardBlockLimits[lt])):0;
        return {id:source.id||dashboardWidgetId(type),type,width:personBlockWidthChoices.some(choice=>choice[0]===width)?width:(defaultDashboardBlockSpans[type]||'6'),limit,config:{...(source.config||{})}};
    }
    /** Un ensemble de widgets (titre, niveau 0 à 3, replié ou non) : une ligne-titre dans la liste ; les widgets qui
     *  suivent lui appartiennent jusqu'au prochain ensemble de même niveau ou plus haut. */
    function dashboardGroupItem(source={}){const c=source.config||{};return {id:/^grp_[a-z0-9]{4,24}$/.test(String(source.id))?source.id:'grp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),type:'__group',width:'12',limit:0,config:{title:String(c.title||'Ensemble').slice(0,80),depth:Math.max(0,Math.min(12,Number(c.depth)||0)),collapsed:!!c.collapsed}};}
    function dashboardNormalizeWidget(widget){
        if(widget?.type==='__group')return dashboardGroupItem(widget);
        const defaults=defaultDashboardBlocks.map(item=>item[0]);
        if(!widget||!defaults.includes(widget.type))return null;
        return dashboardNewWidget(widget.type,widget);
    }
    // ── Onglets à soi (Maintenance → Éditeur d'onglets) : une page de widgets comme le tableau de bord, ou un raccourci vers un écran ──
    const CUSTOM_TAB_ID=/^ct_[a-z0-9]{4,24}$/;
    function customTabs(){try{const v=JSON.parse(localStorage.getItem('genealogie-custom-tabs')||'[]');return Array.isArray(v)?v.filter(t=>t&&CUSTOM_TAB_ID.test(String(t.id))):[];}catch(_){return [];}}
    function saveCustomTabs(list){try{localStorage.setItem('genealogie-custom-tabs',JSON.stringify(list));}catch(_){toast('Réglage impossible à enregistrer dans ce navigateur.','error');}applyMenuOrder();}
    function currentCustomTab(){const id=state.dashboardBoard||'';return id?customTabs().find(t=>t.id===id&&t.kind!=='screen')||null:null;}
    // ── Pages du tableau de bord : plusieurs pages de widgets nommées, choisies en haut ; l'une est affichée d'office ──
    function dashboardStored(){try{const v=JSON.parse(localStorage.getItem('genealogie-dashboard-blocks')||'{}');return v&&typeof v==='object'?v:{};}catch(_){return {};}}
    function dashboardPages(){
        const stored=dashboardStored();
        const pages=(Array.isArray(stored.pages)?stored.pages:[]).filter(p=>p&&/^pg_[a-z0-9]{2,24}$/.test(String(p.id)));
        if(pages.length)return {pages,defaultPage:pages.some(p=>p.id===stored.defaultPage)?stored.defaultPage:pages[0].id};
        return {pages:[{id:'pg_main',name:'Vue d’ensemble',widgets:null}],defaultPage:'pg_main'}; // widgets null : ceux d'avant les pages
    }
    function currentDashboardPage(){const {pages,defaultPage}=dashboardPages();return pages.find(p=>p.id===state.dashboardPage)||pages.find(p=>p.id===defaultPage)||pages[0];}
    function saveDashboardPages(pages,defaultPage){
        const stored=dashboardStored();const first=pages[0];
        localStorage.setItem('genealogie-dashboard-blocks',JSON.stringify({...stored,pages,defaultPage:pages.some(p=>p.id===defaultPage)?defaultPage:first.id,widgets:Array.isArray(first.widgets)?first.widgets:(Array.isArray(stored.widgets)?stored.widgets:undefined)}));
    }
    function dashboardBlockSettings(){
        const tab=currentCustomTab();
        if(tab)return {widgets:(Array.isArray(tab.widgets)?tab.widgets:[]).map(dashboardNormalizeWidget).filter(Boolean)};
        const page=currentDashboardPage();
        if(Array.isArray(page.widgets))return {widgets:page.widgets.map(dashboardNormalizeWidget).filter(Boolean)};
        const defaults=defaultDashboardBlocks.map(item=>item[0]);
        const stored=dashboardStored();
        if(Array.isArray(stored.widgets)){
            const widgets=stored.widgets.map(dashboardNormalizeWidget).filter(Boolean);
            return {widgets};
        }
        const order=Array.isArray(stored.order)?stored.order:[];
        const hidden=Array.isArray(stored.hidden)?stored.hidden:[];
        const legacyOrder=[...order.filter(key=>defaults.includes(key)),...defaults.filter(key=>!order.includes(key))];
        // Identifiant FIXE pour les widgets par défaut : un identifiant tiré au hasard changeait à chaque affichage, et le
        // crayon (qui réaffiche le tableau de bord) ne retrouvait plus le widget à modifier sur une base jamais personnalisée.
        const widgets=legacyOrder.filter(key=>!hidden.includes(key)).map(key=>dashboardNewWidget(key,{id:`${key}-defaut`,width:stored.widths?.[key],limit:stored.limits?.[key]}));
        return {widgets};
    }
    function saveDashboardBlockSettings(settings){
        const tab=currentCustomTab();
        if(tab){const list=customTabs();const i=list.findIndex(t=>t.id===tab.id);if(i>=0){list[i]={...list[i],widgets:(settings.widgets||[]).map(widget=>widget.type==='__group'?dashboardGroupItem(widget):dashboardNewWidget(widget.type,widget))};saveCustomTabs(list);}return;}
        const widgets=(settings.widgets||[]).map(widget=>widget.type==='__group'?dashboardGroupItem(widget):dashboardNewWidget(widget.type,widget));
        const {pages,defaultPage}=dashboardPages();const page=currentDashboardPage();
        if(pages.length===1&&page.id==='pg_main'&&!Array.isArray(dashboardStored().pages)){localStorage.setItem('genealogie-dashboard-blocks',JSON.stringify({...dashboardStored(),widgets}));return;}
        saveDashboardPages(pages.map(p=>p.id===page.id?{...p,widgets}:p),defaultPage);}
    function eventsFilterSettings(personId=0){const defaults={hiddenTypeIds:[],showCensus:false};let settings={...defaults};try{settings={...settings,...JSON.parse(localStorage.getItem('genealogie-events-filter')||'{}')};}catch(_){}if(personId){try{const ps=JSON.parse(localStorage.getItem(`genealogie-events-filter-${personId}`)||'{}');if(Object.keys(ps).length)settings={...settings,...ps};}catch(_){}}settings.hiddenTypeIds=(settings.hiddenTypeIds||[]).map(Number).filter(n=>n>0);settings.showCensus=!!settings.showCensus;return settings;}
    function saveEventsFilterSettings(settings,personId=0){const key=personId?`genealogie-events-filter-${personId}`:'genealogie-events-filter';localStorage.setItem(key,JSON.stringify({hiddenTypeIds:(settings.hiddenTypeIds||[]).map(Number).filter(n=>n>0),showCensus:!!settings.showCensus}));}
    // ── Chercher sur internet (bloc de fiche + widget) : chaque bouton ouvre la recherche du site dans le navigateur ──
    // Adresses vérifiées le 2026-10-08 (Geneanet, FamilySearch, Filae, matchID…). Léonore, Mémoire des hommes et Yad Vashem
    // ne gardent pas la recherche dans leur adresse : recherche Google limitée à leur site.
    const webSearchGroups=['Moteurs de recherche','Généalogie','Archives et bases','Presse et livres','Notices d’autorité','Autres','Mes sites'];
    const webSearchEnc=value=>encodeURIComponent(String(value||'').trim());
    const webSearchSlug=value=>String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    const webSearchGoogleSite=(site,p)=>`https://www.google.com/search?q=${webSearchEnc(`site:${site} "${p.last}" "${p.first}"`)}`;
    const webSearchSites=[
        ['google','Google','Moteurs de recherche',p=>`https://www.google.com/search?q=${webSearchEnc(p.q)}`],
        ['bing','Bing','Moteurs de recherche',p=>`https://www.bing.com/search?q=${webSearchEnc(p.q)}`],
        ['duckduckgo','DuckDuckGo','Moteurs de recherche',p=>`https://duckduckgo.com/?q=${webSearchEnc(p.q)}`],
        ['qwant','Qwant','Moteurs de recherche',p=>`https://www.qwant.com/?q=${webSearchEnc(p.q)}`],
        ['ecosia','Ecosia','Moteurs de recherche',p=>`https://www.ecosia.org/search?q=${webSearchEnc(p.q)}`],
        ['brave','Brave Search','Moteurs de recherche',p=>`https://search.brave.com/search?q=${webSearchEnc(p.q)}`],
        ['startpage','Startpage','Moteurs de recherche',p=>`https://www.startpage.com/do/search?query=${webSearchEnc(p.q)}`],
        ['yahoo','Yahoo','Moteurs de recherche',p=>`https://search.yahoo.com/search?p=${webSearchEnc(p.q)}`],
        ['yandex','Yandex','Moteurs de recherche',p=>`https://yandex.com/search/?text=${webSearchEnc(p.q)}`],
        ['baidu','Baidu','Moteurs de recherche',p=>`https://www.baidu.com/s?wd=${webSearchEnc(p.q)}`],
        ['mojeek','Mojeek','Moteurs de recherche',p=>`https://www.mojeek.com/search?q=${webSearchEnc(p.q)}`],
        ['geneanet','Geneanet','Généalogie',p=>`https://www.geneanet.org/fonds/individus/?go=1&nom=${webSearchEnc(p.last)}&prenom=${webSearchEnc(p.first)}${p.place?`&place__0__=${webSearchEnc(p.place)}`:''}${p.y1?`&type_periode=between&from=${p.y1}&to=${p.y2}`:''}`],
        ['familysearch','FamilySearch','Généalogie',p=>`https://www.familysearch.org/fr/search/record/results?q.givenName=${webSearchEnc(p.first)}&q.surname=${webSearchEnc(p.last)}${p.place?`&q.${p.placeKind==='death'?'deathLikePlace':'birthLikePlace'}=${webSearchEnc(p.place)}`:''}${p.birthFrom?`&q.birthLikeDate.from=${p.birthFrom}&q.birthLikeDate.to=${p.birthTo}`:''}${p.deathFrom?`&q.deathLikeDate.from=${p.deathFrom}&q.deathLikeDate.to=${p.deathTo}`:''}${p.spouseFirst?`&q.spouseGivenName=${webSearchEnc(p.spouseFirst)}`:''}${p.spouseLast?`&q.spouseSurname=${webSearchEnc(p.spouseLast)}`:''}`],
        ['filae','Filae','Généalogie',p=>`https://www.filae.com/search?ln=${webSearchEnc(p.last)}&fn=${webSearchEnc(p.first)}${p.y1?`&sy=${p.y1}&ey=${p.y2}`:''}`],
        ['myheritage','MyHeritage','Généalogie',p=>`https://www.myheritage.fr/names/${webSearchSlug(p.first)}_${webSearchSlug(p.last)}`],
        ['ancestry','Ancestry','Généalogie',p=>`https://www.ancestry.fr/search/?name=${webSearchEnc(p.first)}_${webSearchEnc(p.last)}${p.year?`&birth=${p.year}${p.place?`_${webSearchEnc(p.place)}`:''}`:''}`],
        ['findmypast','Findmypast','Généalogie',p=>`https://www.findmypast.fr/search/results?firstname=${webSearchEnc(p.first)}&lastname=${webSearchEnc(p.last)}${p.year?`&yearofbirth=${p.year}&yearofbirth_offset=5`:''}`],
        ['wikitree','WikiTree','Généalogie',p=>`https://www.wikitree.com/index.php?title=Special:SearchPerson&wpFirst=${webSearchEnc(p.first)}&wpLast=${webSearchEnc(p.last)}`],
        ['geni','Geni','Généalogie',p=>`https://www.geni.com/search?search_type=people&names=${webSearchEnc(p.name)}`],
        ['findagrave','Find a Grave','Généalogie',p=>`https://www.findagrave.com/memorial/search?firstname=${webSearchEnc(p.first)}&lastname=${webSearchEnc(p.last)}${p.year?`&birthyear=${p.year}&birthyearfilter=5`:''}`],
        ['billiongraves','BillionGraves','Généalogie',p=>`https://billiongraves.com/search/results?given_names=${webSearchEnc(p.first)}&family_names=${webSearchEnc(p.last)}${p.year?`&birth_year=${p.year}&year_range=5`:''}`],
        ['matchid','Décès INSEE depuis 1970 (matchID)','Archives et bases',p=>`https://deces.matchid.io/search?q=${webSearchEnc([p.first,p.last,p.year].filter(Boolean).join(' '))}`],
        ['memoiredeshommes','Mémoire des hommes','Archives et bases',p=>webSearchGoogleSite('memoiredeshommes.sga.defense.gouv.fr',p)],
        ['leonore','Léonore (Légion d’honneur)','Archives et bases',p=>webSearchGoogleSite('leonore.archives-nationales.culture.gouv.fr',p)],
        ['francearchives','FranceArchives','Archives et bases',p=>`https://francearchives.gouv.fr/fr/search?q=${webSearchEnc(`"${p.name}"`)}`],
        ['arolsen','Arolsen Archives','Archives et bases',p=>`https://collections.arolsen-archives.org/en/search?s=${webSearchEnc(p.name)}`],
        ['yadvashem','Yad Vashem (victimes de la Shoah)','Archives et bases',p=>webSearchGoogleSite('collections.yadvashem.org',p)],
        ['gallica','Gallica (BnF)','Presse et livres',p=>`https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${webSearchEnc(`(gallica all "${p.name}")${p.place?` and (gallica all "${p.place}")`:''}`)}`],
        ['retronews','RetroNews','Presse et livres',p=>`https://www.retronews.fr/search#allTerms=${webSearchEnc(`"${p.name}"${p.place?` ${p.place}`:''}`)}&sort=score&page=1&searchIn=all`],
        ['europeana','Europeana','Presse et livres',p=>`https://www.europeana.eu/fr/search?query=${webSearchEnc(p.q)}`],
        ['googlebooks','Google Livres','Presse et livres',p=>`https://www.google.com/search?tbm=bks&q=${webSearchEnc(p.q)}`],
        ['archiveorg','Internet Archive','Presse et livres',p=>`https://archive.org/search?query=${webSearchEnc(`"${p.name}"`)}`],
        ['newspapers','Newspapers.com','Presse et livres',p=>`https://www.newspapers.com/search/?query=${webSearchEnc(`"${p.name}"`)}`],
        ['chroniclingamerica','Chronicling America (États-Unis)','Presse et livres',p=>`https://www.loc.gov/collections/chronicling-america/?q=${webSearchEnc(`"${p.name}"`)}`],
        ['trove','Trove (Australie)','Presse et livres',p=>`https://trove.nla.gov.au/search/category/newspapers?keyword=${webSearchEnc(`"${p.name}"`)}`],
        ['delpher','Delpher (Pays-Bas)','Presse et livres',p=>`https://www.delpher.nl/nl/kranten/results?query=${webSearchEnc(`"${p.name}"`)}&coll=ddd`],
        ['anno','ANNO (Autriche)','Presse et livres',p=>`https://anno.onb.ac.at/anno-suche#searchMode=simple&query=${webSearchEnc(`"${p.name}"`)}`],
        // Notices d'autorité : identifiants des personnes connues des bibliothèques (auteurs, artistes, militaires, notables…)
        ['viaf','VIAF','Notices d’autorité',p=>webSearchGoogleSite('viaf.org',p)],
        ['isni','ISNI','Notices d’autorité',p=>`https://isni.oclc.org/xslt/CMD?ACT=SRCHA&IKT=8006&TRM=${webSearchEnc(`${p.last} ${p.first}`.trim())}`],
        ['idref','IdRef','Notices d’autorité',p=>webSearchGoogleSite('idref.fr',p)],
        ['gnd','GND','Notices d’autorité',p=>`https://lobid.org/gnd/search?q=${webSearchEnc(p.name)}&filter=type:Person`],
        ['databnf','data.bnf.fr','Notices d’autorité',p=>`https://data.bnf.fr/search?term=${webSearchEnc(p.name)}`],
        ['bnfauth','BnF (autorités)','Notices d’autorité',p=>`https://catalogue.bnf.fr/rechercher.do?motRecherche=${webSearchEnc(p.name)}&critereRecherche=0`],
        ['loc','Library of Congress','Notices d’autorité',p=>`https://id.loc.gov/search/?q=${webSearchEnc(p.name)}&q=cs:http://id.loc.gov/authorities/names`],
        ['wikipedia','Wikipédia','Autres',p=>`https://fr.wikipedia.org/w/index.php?search=${webSearchEnc(p.q)}`],
        ['wikidata','Wikidata','Autres',p=>`https://www.wikidata.org/w/index.php?search=${webSearchEnc(p.name)}`],
    ];
    const webSearchDefaultVisible=['google','duckduckgo','qwant','bing','geneanet','familysearch','filae','myheritage','ancestry','matchid','memoiredeshommes','leonore','francearchives','gallica','retronews','findagrave','viaf','isni','idref','gnd','wikipedia'];
    /** Sites ajoutés par l'utilisateur : adresse modèle avec {prénom}, {nom}, {nom_complet}, {lieu}, {année}, {de}, {à}, {conjoint}, {requête}. */
    function webSearchCustomSites(){try{const list=JSON.parse(localStorage.getItem('genealogie-web-search-custom')||'[]');return Array.isArray(list)?list.filter(site=>site&&site.key&&site.label&&/^https?:\/\//i.test(String(site.url||''))):[];}catch(_){return[];}}
    function saveWebSearchCustomSites(list){localStorage.setItem('genealogie-web-search-custom',JSON.stringify(list.map(site=>({key:site.key,label:String(site.label).slice(0,80),url:String(site.url).slice(0,500)}))));}
    function webSearchAllSites(){
        const fill=(template,p)=>String(template).replace(/\{(prénom|prenom|nom|nom_complet|lieu|année|annee|de|à|a|conjoint|requête|requete)\}/gi,(_,key)=>{
            const k=key.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
            return webSearchEnc({prenom:p.first,nom:p.last,nom_complet:p.name,lieu:p.place,annee:p.year,de:p.y1,a:p.y2,conjoint:p.spouseName,requete:p.q}[k]);
        });
        return [...webSearchSites,...webSearchCustomSites().map(site=>[site.key,site.label,'Mes sites',p=>fill(site.url,p)])];
    }
    function webSearchSettings(personId=0,base=null){
        const keys=webSearchAllSites().map(site=>site[0]);
        let settings={order:keys,hidden:keys.filter(key=>!webSearchDefaultVisible.includes(key)&&!key.startsWith('custom-'))};
        try{const stored=JSON.parse(localStorage.getItem('genealogie-web-search')||'{}');if(Array.isArray(stored.order))settings={order:stored.order,hidden:Array.isArray(stored.hidden)?stored.hidden:[]};}catch(_){}
        if(base)settings={order:base.order||settings.order,hidden:base.hidden||settings.hidden};
        if(personId){try{const ps=JSON.parse(localStorage.getItem(`genealogie-web-search-${personId}`)||'{}');if(Array.isArray(ps.order))settings={order:ps.order,hidden:Array.isArray(ps.hidden)?ps.hidden:[]};}catch(_){}}
        settings.order=[...settings.order.filter(key=>keys.includes(key)),...keys.filter(key=>!settings.order.includes(key))];
        settings.hidden=settings.hidden.filter(key=>keys.includes(key));
        return settings;
    }
    function saveWebSearchSettings(settings,personId=0){localStorage.setItem(personId?`genealogie-web-search-${personId}`:'genealogie-web-search',JSON.stringify({order:settings.order,hidden:settings.hidden||[]}));}
    /** Ce que la fiche apporte à la recherche : nom, années, lieux, conjoints, nom d'épouse. */
    function webSearchContext(detail){
        const person=detail?.person||{};const events=detail?.events||[];const partners=detail?.partners||[];
        const first=[person.first_name,person.middle_name].filter(Boolean).join(' ').trim();const last=String(person.last_name||'').trim();
        const eventOf=tags=>events.find(event=>tags.includes(event.gedcom_tag));
        const birth=eventOf(['BIRT'])||eventOf(['CHR','BAPM']);const death=eventOf(['DEAT'])||eventOf(['BURI']);
        const birthYear=Number(birth?.year||person.birth_year)||0;const deathYear=Number(death?.year||person.death_year)||0;
        const places=[];const addPlace=(kind,label,event)=>{const value=String(event?.place_name||'').split(',')[0].trim();if(value&&!places.some(p=>p.value===value))places.push({kind,label:`${label} : ${value}`,value});};
        addPlace('birth','Naissance',birth);addPlace('death','Décès',death);addPlace('other','Mariage',eventOf(['MARR']));
        const firstOnly=String(person.first_name||'').trim().split(/\s+/)[0]||first;
        const estimates=detail?.estimates||{};
        const dated=events.map(event=>{const d=parsedGenealogyDate(event.date_text||'');return d?.exact?{label:event.type_label||'Événement',tag:event.gedcom_tag,date:d.date}:null;}).filter(Boolean);
        return {id:Number(person.id)||0,first,firstOnly,last,female:person.gender==='female',birthYear,deathYear,birthEst:estimates.birth||null,deathEst:estimates.death||null,dated,places,
            partners:partners.map(partner=>({first:[partner.first_name,partner.middle_name].filter(Boolean).join(' ').trim(),firstOnly:String(partner.first_name||'').trim().split(/\s+/)[0]||'',last:String(partner.last_name||'').trim()})).filter(partner=>partner.first||partner.last)};
    }
    /** Plage de vie proposée : naissance → décès ; sinon dates estimées ; sinon une durée de vie probable. */
    function webSearchLifeRange(ctx){
        const now=new Date().getFullYear();
        let from=ctx.birthYear||ctx.birthEst?.from||ctx.birthEst?.to||0;let to=ctx.deathYear||ctx.deathEst?.to||0;
        if(!from&&to)from=to-80;if(from&&!to)to=Math.min(from+90,now);
        if(from&&!ctx.deathYear)to=Math.min(to,from+90,now); // décès seulement estimé : au plus 90 ans de vie
        return {from:from||'',to:to||'',estimated:Boolean(from&&(!ctx.birthYear||!ctx.deathYear))};
    }
    /** Paramètres de la recherche d'après les options cochées sous les boutons. */
    function webSearchParams(ctx,options){
        // Sans « Deuxièmes prénoms » : seulement le premier prénom (« Bernard » et non « Bernard Raoul Auguste »)
        const first=options.middle?ctx.first:(ctx.firstOnly||ctx.first);
        const p={first,last:ctx.last,name:[first,ctx.last].filter(Boolean).join(' '),place:'',placeKind:'birth',y1:0,y2:0,year:0,spouseFirst:'',spouseLast:'',spouseName:''};
        if(options.place){const place=ctx.places.find(item=>item.value===options.place);p.place=options.place;p.placeKind=place?.kind||'birth';}
        // Années : y1–y2 = plage de vie (Geneanet, Filae) ; birthFrom/To et deathFrom/To = champs « naissance » / « décès »
        // (FamilySearch) ; year = année de naissance (Ancestry, Find a Grave…). Les moteurs de recherche n'en reçoivent aucune.
        if(options.years){
            p.y1=Number(options.y1)||0;p.y2=Number(options.y2)||p.y1;if(p.y1&&p.y2<p.y1)[p.y1,p.y2]=[p.y2,p.y1];
            if(ctx.birthYear){p.birthFrom=ctx.birthYear-2;p.birthTo=ctx.birthYear+2;}
            else if(ctx.birthEst?.from||ctx.birthEst?.to){p.birthFrom=ctx.birthEst.from||ctx.birthEst.to-30;p.birthTo=ctx.birthEst.to||ctx.birthEst.from+30;}
            else if(p.y1){p.birthFrom=p.y1-5;p.birthTo=p.y1+5;}
            if(ctx.deathYear){p.deathFrom=ctx.deathYear-2;p.deathTo=ctx.deathYear+2;}
            p.year=p.birthFrom?Math.round((p.birthFrom+p.birthTo)/2):0;
        }
        const spouse=options.spouse!==''&&options.spouse!==undefined?ctx.partners[Number(options.spouse)]:null;
        if(spouse){const spouseFirst=options.middle?spouse.first:(spouse.firstOnly||spouse.first);p.spouseFirst=spouseFirst;p.spouseLast=spouse.last;p.spouseName=[spouseFirst,spouse.last].filter(Boolean).join(' ');}
        const married=options.married&&spouse?.last&&spouse.last!==ctx.last?`${first} ${spouse.last}`.trim():'';
        p.q=[married?`("${p.name}" OR "${married}")`:`"${p.name}"`,p.place,p.spouseName?`"${p.spouseName}"`:''].filter(Boolean).join(' ');
        return p;
    }
    const webSearchContexts=new Map();
    function webSearchPanelHtml(detail,settings,uid){
        const ctx=webSearchContext(detail);webSearchContexts.set(uid,ctx);
        if(!ctx.first&&!ctx.last)return empty('Cette fiche n’a ni prénom ni nom à chercher.',{icon:'🔎'});
        const sites=webSearchAllSites();const visible=settings.order.filter(key=>!settings.hidden.includes(key)).map(key=>sites.find(site=>site[0]===key)).filter(Boolean);
        const life=webSearchLifeRange(ctx);const y1=life.from,y2=life.to;
        const hasMiddle=ctx.first!==ctx.firstOnly||ctx.partners.some(partner=>partner.first!==partner.firstOnly);
        let middleChecked=false;try{middleChecked=localStorage.getItem('genealogie-web-search-middle')==='1';}catch(_){}
        const options=`<div class="web-search-options">
            ${hasMiddle?`<label class="checkbox-line" title="${escapeHtml(ctx.first)}"><input type="checkbox" data-ws-middle ${middleChecked?'checked':''}> Deuxièmes prénoms</label>`:''}
            <label class="checkbox-line" title="De la naissance au décès ; pour les sites qui ont des champs de date (Geneanet, Filae, FamilySearch…). Les moteurs de recherche ne reçoivent pas d’année."><input type="checkbox" data-ws-years ${y1?'checked':''}> Années${life.estimated?' <small class="muted">(estimées)</small>':''} <input type="number" data-ws-y1 value="${escapeHtml(y1)}" placeholder="de" min="1000" max="2100"> – <input type="number" data-ws-y2 value="${escapeHtml(y2)}" placeholder="à" min="1000" max="2100"></label>
            ${ctx.places.length?`<label>Lieu <select data-ws-place><option value="">Aucun</option>${ctx.places.map(place=>`<option value="${escapeHtml(place.value)}">${escapeHtml(place.label)}</option>`).join('')}</select></label>`:''}
            ${ctx.partners.length?`<label>Conjoint <select data-ws-spouse><option value="">Aucun</option>${ctx.partners.map((partner,index)=>`<option value="${index}">${escapeHtml([partner.first,partner.last].filter(Boolean).join(' '))}</option>`).join('')}</select></label>`:''}
            ${ctx.female&&ctx.partners.some(partner=>partner.last&&partner.last!==ctx.last)?`<label class="checkbox-line"><input type="checkbox" data-ws-married> Aussi sous le nom d’épouse (moteurs de recherche)</label>`:''}
        </div>`;
        const groups=webSearchGroups.map(group=>[group,visible.filter(site=>site[2]===group)]).filter(([,list])=>list.length);
        const buttons=visible.length?groups.map(([group,list])=>`<div class="web-search-group"><span>${escapeHtml(group)}</span><div class="web-search-links">${list.map(site=>`<span class="web-search-site"><input type="checkbox" data-ws-pick="${escapeHtml(site[0])}" aria-label="Cocher ${escapeHtml(site[1])}"><a class="button small secondary" data-ws-site="${escapeHtml(site[0])}" href="#" target="_blank" rel="noopener noreferrer">${escapeHtml(site[1])}</a></span>`).join('')}</div></div>`).join(''):empty('Aucun site choisi',{icon:'🌐',hint:'Règle-les dans Maintenance → Apparence.'});
        const news=webSearchNewsHtml(ctx);
        const multi=visible.length>1?`<div class="web-search-multi"><button class="button small secondary" type="button" data-ws-pick-all>Tout cocher</button><button class="button small secondary" type="button" data-ws-pick-none>Tout décocher</button><button class="button small" type="button" data-ws-open-picked disabled>Ouvrir les sites cochés</button></div>`:'';
        return `<div class="web-search-panel" data-web-search="${escapeHtml(uid)}"><p class="muted">S’ouvre dans ton navigateur. Coche le lieu, les années ou le conjoint pour écarter les homonymes.</p>${options}${multi}${buttons}${news}</div>`;
    }
    /** Journaux numérisés sur Gallica, consultables à une date précise (adresse « …/date AAAAMMJJ »). */
    const gallicaDailies=[['Le Petit Journal','cb32895690j',1863,1944],['Le Petit Parisien','cb34419111x',1876,1944],['Le Figaro','cb34355551z',1854,1942],['Le Temps','cb34431794k',1861,1942]];
    function gallicaDailyUrl(ark,date){const p=n=>String(n).padStart(2,'0');return `https://gallica.bnf.fr/ark:/12148/${ark}/date${date.getUTCFullYear()}${p(date.getUTCMonth()+1)}${p(date.getUTCDate())}`;}
    function webSearchNewsHtml(ctx){
        const order=['BIRT','CHR','BAPM','MARR','DEAT','BURI'];
        const events=(ctx.dated||[]).filter(e=>{const y=e.date.getUTCFullYear();return y>=1854&&y<=1944;}).sort((a,b)=>((order.indexOf(a.tag)+1)||9)-((order.indexOf(b.tag)+1)||9)||a.date-b.date);
        if(!events.length)return '';
        const fmt=d=>d.toLocaleDateString('fr-FR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
        return `<div class="web-search-group web-search-news"><span>La une du jour (Gallica)</span><label class="web-search-news-pick">Le jour de <select data-ws-news>${events.map((e,i)=>`<option value="${i}" data-date="${e.date.toISOString().slice(0,10)}">${escapeHtml(e.label)} · ${escapeHtml(fmt(e.date))}</option>`).join('')}</select></label><div class="web-search-links" data-ws-news-links></div><small class="muted">Journaux numérisés de 1854 à 1944. Si le journal n’est pas paru ce jour-là, Gallica montre le calendrier du mois.</small></div>`;
    }
    function updateWebSearchNews(panel){
        const select=$('[data-ws-news]',panel),box=$('[data-ws-news-links]',panel);if(!select||!box)return;
        const date=new Date(select.selectedOptions[0].dataset.date+'T00:00:00Z');const y=date.getUTCFullYear();
        box.innerHTML=gallicaDailies.filter(([, ,from,to])=>y>=from&&y<=to).map(([name,ark])=>`<a class="button small secondary" href="${escapeHtml(gallicaDailyUrl(ark,date))}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`).join('')||'<small class="muted">Aucun de ces journaux n’est numérisé pour cette année.</small>';
    }
    /** Met à jour les adresses des boutons quand une option change (et au premier affichage). */
    function bindWebSearchPanels(root=document){
        $$('[data-web-search]',root).forEach(panel=>{
            const ctx=webSearchContexts.get(panel.dataset.webSearch);if(!ctx||panel.dataset.wsBound)return;panel.dataset.wsBound='1';
            const update=()=>{
                const p=webSearchParams(ctx,{middle:$('[data-ws-middle]',panel)?.checked,years:$('[data-ws-years]',panel)?.checked,y1:$('[data-ws-y1]',panel)?.value,y2:$('[data-ws-y2]',panel)?.value,place:$('[data-ws-place]',panel)?.value||'',spouse:$('[data-ws-spouse]',panel)?.value??'',married:$('[data-ws-married]',panel)?.checked});
                const sites=webSearchAllSites();
                $$('[data-ws-site]',panel).forEach(link=>{const site=sites.find(item=>item[0]===link.dataset.wsSite);if(site){try{link.href=site[3](p);}catch(_){link.removeAttribute('href');}}});
            };
            const updatePicked=()=>{const count=$$('[data-ws-pick]:checked',panel).length;const open=$('[data-ws-open-picked]',panel);if(open){open.disabled=!count;open.textContent=count?(count>1?`Ouvrir les ${count} sites cochés`:'Ouvrir le site coché'):'Ouvrir les sites cochés';}};
            updateWebSearchNews(panel);$('[data-ws-news]',panel)?.addEventListener('change',()=>updateWebSearchNews(panel));
            panel.addEventListener('input',update);panel.addEventListener('change',event=>{if(event.target.matches?.('[data-ws-middle]')){try{localStorage.setItem('genealogie-web-search-middle',event.target.checked?'1':'0');}catch(_){}}update();updatePicked();});update();
            $('[data-ws-pick-all]',panel)?.addEventListener('click',()=>{$$('[data-ws-pick]',panel).forEach(input=>{input.checked=true;});updatePicked();});
            $('[data-ws-pick-none]',panel)?.addEventListener('click',()=>{$$('[data-ws-pick]',panel).forEach(input=>{input.checked=false;});updatePicked();});
            // Ouvre chaque site coché dans un onglet du navigateur (dans un navigateur web, autoriser les fenêtres surgissantes)
            $('[data-ws-open-picked]',panel)?.addEventListener('click',()=>{$$('[data-ws-pick]:checked',panel).forEach(input=>{const link=$(`[data-ws-site="${CSS.escape(input.dataset.wsPick)}"]`,panel);if(link?.href&&!link.href.endsWith('#'))window.open(link.href,'_blank','noopener');});});
        });
    }
    /** Éditeur des sites (Apparence et réglages du widget) : glisser pour l'ordre, cocher pour afficher. */
    function webSearchSitesEditor(id,title,settings,{personId=0,saveButton=true,resetLabel='Annuler l’exception'}={}){
        const sites=webSearchAllSites();
        const rows=settings.order.map((key,index)=>{const site=sites.find(item=>item[0]===key);return site?menuOrderRow(key,`${site[1]} · ${site[2]}`,index,true,!settings.hidden.includes(key)):'';}).join('');
        return `<section class="maintenance-panel order-editor block-order-editor web-search-editor"><div class="item-title-row"><h3>${escapeHtml(title)}</h3>${personId?`<button class="button small secondary" type="button" data-reset-web-search="${personId}">${escapeHtml(resetLabel)}</button>`:''}</div><div class="page-actions"><button class="button small secondary" type="button" data-ws-all="${id}">Tout sélectionner</button><button class="button small secondary" type="button" data-ws-none="${id}">Tout désélectionner</button></div><div class="order-list" id="${id}">${rows}</div>${saveButton?`<div class="page-actions action-zone"><button class="button small" type="button" data-web-search-save="${id}" data-web-search-person-id="${personId}">Enregistrer ces sites</button></div>`:''}</section>`;
    }
    function webSearchCustomSitesEditorHtml(){
        const list=webSearchCustomSites();
        return `<section class="maintenance-panel order-editor block-order-editor"><h3>Mes sites</h3><p class="muted">Adresse de recherche d’un site, avec à la place du nom cherché : <code>{prénom}</code> <code>{nom}</code> <code>{nom_complet}</code> <code>{lieu}</code> <code>{année}</code> <code>{de}</code> <code>{à}</code> <code>{conjoint}</code> ou <code>{requête}</code> (nom entre guillemets + options). Ex. : <code>https://exemple.fr/recherche?nom={nom}&amp;prenom={prénom}</code></p>${list.length?`<div class="web-search-custom-list">${list.map(site=>`<div class="web-search-custom-row"><strong>${escapeHtml(site.label)}</strong><small>${escapeHtml(site.url)}</small><button class="button small secondary" type="button" data-ws-custom-delete="${escapeHtml(site.key)}">Supprimer</button></div>`).join('')}</div>`:''}<div class="form-grid"><label>Nom du site<input type="text" id="ws-custom-label" maxlength="80" placeholder="Ex : Archives du Lot"></label><label>Adresse de recherche<input type="url" id="ws-custom-url" maxlength="500" placeholder="https://…{nom}…"></label></div><div class="page-actions action-zone"><button class="button small" type="button" id="ws-custom-add">Ajouter ce site</button></div></section>`;
    }
    /** Fiches qui ont leur propre réglage (blocs, filtres d'événements, sites de recherche) : lues dans les réglages enregistrés. */
    async function renderPersonExceptionsList(){
        const box=$('#person-exceptions-list');if(!box)return;
        const kinds=[['person-blocks','Blocs de la fiche'],['events-filter','Filtres du bloc Événements'],['web-search','Chercher sur internet'],['lineage','Ascendants / descendants']];
        const found=Object.fromEntries(kinds.map(([kind])=>[kind,[]]));
        for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)||'';const m=key.match(/^genealogie-(person-blocks|events-filter|web-search|lineage)-(\d+)$/);if(m)found[m[1]].push(Number(m[2]));}
        const ids=[...new Set(Object.values(found).flat())];
        let people={};
        if(ids.length){try{(await api('person_labels',{ids:ids.join(',')})).people.forEach(person=>{people[person.id]=person;});}catch(_){}}
        if(!document.body.contains(box))return;
        // Titre « Exception pour Personne #… » quand la fiche n'était pas encore chargée : le vrai nom
        const currentId=Number(state.currentPersonId)||0;
        if(currentId&&!state.currentPerson?.person){
            if(!people[currentId]){try{(await api('person_labels',{ids:String(currentId)})).people.forEach(person=>{people[person.id]=person;});}catch(_){}}
            const label=people[currentId]?`${personName(people[currentId])}${years(people[currentId])?` (${years(people[currentId])})`:''}`:'';
            if(label)$$('.person-block-config h3').forEach(h3=>{if(h3.textContent===`Exception pour Personne #${currentId}`)h3.textContent=`Exception pour ${label}`;});
        }
        // Dans chaque rubrique : sur quelles fiches une exception a été mise
        $$('[data-exception-summary]').forEach(el=>{const ids=(found[el.dataset.exceptionSummary]||[]);el.innerHTML=ids.length?`<strong>Exception mise sur ${ids.length} fiche${ids.length>1?'s':''} :</strong> ${ids.map(id=>`<button class="link-button" type="button" data-exception-open="${id}">${escapeHtml(people[id]?personName(people[id]):`Fiche n° ${id}`)}</button>`).join(', ')}`:'<span class="muted">Aucune fiche n’a d’exception : toutes suivent ce réglage.</span>';});
        $$('[data-exception-summary] [data-exception-open]').forEach(button=>button.addEventListener('click',()=>{state.currentPersonId=Number(button.dataset.exceptionOpen);setModule('personnes');}));
        const nameOf=id=>people[id]?`${personName(people[id])}${years(people[id])?` · ${years(people[id])}`:''}`:`Fiche n° ${id} (supprimée ?)`;
        box.innerHTML=kinds.map(([kind,title])=>`<section class="maintenance-panel order-editor block-order-editor"><h3>${escapeHtml(title)} <small>(${found[kind].length})</small></h3>${found[kind].length?`<div class="person-exception-list">${found[kind].sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'fr')).map(id=>`<div class="person-exception-row"><button class="link-button" type="button" data-exception-open="${id}">${escapeHtml(nameOf(id))}</button><button class="button small secondary" type="button" data-exception-delete="genealogie-${kind}-${id}">Retirer l’exception</button></div>`).join('')}</div>`:'<p class="muted">Aucune fiche : toutes suivent le réglage commun.</p>'}</section>`).join('');
        $$('[data-exception-open]',box).forEach(button=>button.addEventListener('click',()=>{state.currentPersonId=Number(button.dataset.exceptionOpen);setModule('personnes');}));
        $$('[data-exception-delete]',box).forEach(button=>button.addEventListener('click',async()=>{if(!await confirmBox('Elle suivra le réglage de toutes les fiches.',{title:'Retirer le réglage particulier de cette fiche ?',okLabel:'Retirer le réglage'}))return;localStorage.removeItem(button.dataset.exceptionDelete);toast('Exception retirée.');renderDesignTools();}));
    }
    function readWebSearchSitesEditor(list){const rows=$$('.order-row',list);return {order:rows.map(row=>row.dataset.orderKey),hidden:rows.filter(row=>!row.querySelector('input[type="checkbox"]')?.checked).map(row=>row.dataset.orderKey)};}
    function bindWebSearchSitesEditors(root=document){
        $$('.web-search-editor .order-list',root).forEach(list=>{if(!list.dataset.dragBound){list.dataset.dragBound='1';setupDragOrder(list);}});
        $$('[data-ws-all],[data-ws-none]',root).forEach(button=>button.addEventListener('click',()=>{const list=document.getElementById(button.dataset.wsAll||button.dataset.wsNone);$$('input[type="checkbox"]',list).forEach(input=>{input.checked=!!button.dataset.wsAll;});}));
    }
    // l'onglet « Animaux » est caché tant qu'on ne l'a pas montré (Apparence → Ordre du menu principal)
    // « Animaux » et « Fiches » sont cachés tant que l'ordre du menu n'a pas été réglé une fois
    function menuHiddenKeys(){let l=[];try{l=JSON.parse(localStorage.getItem('genealogie-menu-hidden')||'[]');if(!localStorage.getItem('genealogie-menu-animaux')&&!l.includes('animaux'))l.push('animaux');if(!localStorage.getItem('genealogie-menu-fiches')&&!l.includes('fiches'))l.push('fiches');if(!localStorage.getItem('genealogie-menu-adn')&&!l.includes('adn'))l.push('adn');}catch(_){l=['animaux','fiches','adn'];}return l;}
    // onglet « Animaux » montré : « Personnes » ne liste que les personnes, « Animaux » que les animaux (la même fiche, à part)
    const animalsTabOn=()=>!menuHiddenKeys().includes('animaux');
    function mapHiddenKeys(){try{return JSON.parse(localStorage.getItem('genealogie-map-hidden')||'[]');}catch(_){return[];}}
    function graphDiagramHiddenKeys(){try{return JSON.parse(localStorage.getItem('genealogie-graph-diagram-hidden')||'[]');}catch(_){return[];}}
    function graphStatsHiddenKeys(){try{return JSON.parse(localStorage.getItem('genealogie-graph-stats-hidden')||'[]');}catch(_){return[];}}
    function tileLayerHiddenKeys(){try{return JSON.parse(localStorage.getItem('genealogie-tile-hidden')||'[]');}catch(_){return[];}}
    const defaultGraphDiagramItems=[['ancestors','Arbre des ascendants'],['descendants','Arbre des descendants'],['hourglass','Sablier familial'],['fan','Éventail des générations'],['kinship','Liens de parenté'],['implexe','Implexe (ancêtres répétés)'],['lineage','Ascendants et descendants (liste)'],['social','Réseau : témoins et voisins'],['occupations','Transmission des métiers'],['migrations','Migrations d’une branche'],['household','Maisonnée et recensements'],['square','Carré'],['circular','Circulaire'],['symmetric','Symétrique'],['fractal','Arbre fractal'],['genogram','Génogramme détaillé'],['distribution','Distribution'],['place_monograph','Monographie de commune']];
    const defaultGraphStatsItems=[['surnames','Noms'],['firstnames','Prénoms'],['saint_names','Prénom et saint du jour'],['firstnames_france','Prénoms : la famille et la France'],['probate_wealth','Richesse d’après les inventaires après décès'],['heights','Taille des ancêtres'],['firstnames_by_generation','Distribution des prénoms par génération'],['birth_places','Lieux de naissance'],['marriage_places','Lieux de mariage'],['death_places','Lieux de décès'],['birth_countries','Pays de naissance'],['death_countries','Pays de décès'],['sex_distribution','Sexes'],['age_at_death','Âge au décès'],['genealogy_age_pyramid','Pyramide des âges complète'],['death_age_by_generation','Âge au décès par génération'],['life_expectancy_generation_century','Espérance de vie génération/siècle'],['life_expectancy_lineage_generation_century','Espérance de vie dans ta lignée'],['life_expectancy_century_branch','Espérance de vie siècle/branche'],['marriage_first_birth_age','Âge mariage / naissances'],['sibling_birth_interval','Intervalle des fratries'],['infant_mortality_period','Mortalité infantile par période'],['marital_patterns','Remariage, veuvage, célibat'],['death_causes','Causes de décès'],['completeness','Complétude des données'],['family_gravity_migration','Migration — centre familial'],['farthest_from_origin','Lieux les plus éloignés'],['residence_duration','Durée de résidence'],['mobility_by_generation','Mobilité par génération'],['birth_years','Années de naissance'],['death_years','Années de décès'],['children_per_family','Enfants par famille'],['occupation_timeline','Métiers dans le temps'],['occupation_by_generation','Métiers par génération'],['occupation_branch_evolution','Métiers par branche'],['endogamy_index','Endogamie / consanguinité']];
    function orderedGraphDiagramItems(includeHidden=false){const keys=defaultGraphDiagramItems.map(i=>i[0]);const order=savedOrder('genealogie-graph-diagram-order',keys);const hidden=graphDiagramHiddenKeys();return order.filter(v=>includeHidden||!hidden.includes(v)).map((v,idx)=>{const item=defaultGraphDiagramItems.find(r=>r[0]===v)||[v,v];return [item[0],String(idx+1).padStart(2,'0'),item[1]];});}
    function orderedGraphStatsItems(includeHidden=false){const keys=defaultGraphStatsItems.map(i=>i[0]);const order=savedOrder('genealogie-graph-stats-order',keys);const hidden=graphStatsHiddenKeys();return order.filter(v=>includeHidden||!hidden.includes(v)).map((v,idx)=>{const item=defaultGraphStatsItems.find(r=>r[0]===v)||[v,v];return [item[0],String(idx+1).padStart(2,'0'),item[1]];});}
    // Tile layers with categories
    const TILE_LAYER_CATEGORIES=[
        {id:'standard',label:'Fond de cartes standard',items:[['bw','Noir & blanc'],['offline','Hors ligne (frontières et communes, sans Internet)'],['color','Couleur (OSM)'],['light','Claire'],['minimal','Minimaliste'],['roads','Routes seules'],['dark','Sombre'],['osmfr','OSM France'],['relief','Relief léger'],['cyclosm','CyclOSM (relief + routes)'],['wikimedia','Wikimedia Maps'],['satellite','Satellite (Esri)'],['esri_topo','Topographique (Esri)'],['esri_street','Rues couleur (Esri)'],['esri_ocean','Océan (Esri)'],['esri_natgeo','National Geographic (Esri)'],['esri_physical','Physique (Esri)'],['esri_relief','Ombrage relief (Esri)'],['voyager','Voyager (avec labels)'],['osmde','OSM Allemagne'],['cartoweb','CartoWeb.be (Belgique, IGN)'],['swisstopo','Swisstopo (Suisse)'],['grid','Quadrillé']]},
        {id:'historical',label:'Cartes historiques',items:[['ohm','OpenHistoricalMap'],['cassini','Carte de Cassini (18e s.)'],['cassini_royal','Cassini — exemplaire du roi'],['etatmajor','État-Major (France, 19e s.)'],['swisstopo_dufour','Swisstopo — Carte Dufour (Suisse, 1845-1865)'],['swisstopo_siegfried','Swisstopo — Carte Siegfried (Suisse, 1870-1949)'],['nls_6inch','OS 6-inch Écosse (1842-1882)'],['nls_natgrid','OS National Grid UK (1940-1960)'],['ferraris','Carte de Ferraris (Belgique, 1777)'],['vandermaelen','Carte Vandermaelen (Belgique, 1846-1854)'],['popp','Atlas Popp (Belgique, 1842-1879)'],['frickx','Carte Fricx (Belgique, 1744)'],['buurtwegen','Atlas der Buurtwegen (Flandre, ~1840)']]},
        {id:'ign_fr',label:'France IGN (Géoplateforme)',items:[['ign_ortho_1950','Photos aériennes historiques IGN (1950-1965)'],['ign_scan50_1950','Scan50 1950 — carte papier IGN'],['ign_hr_ortho','Orthophotos actuelles HD IGN'],['ign_planv2','Plan IGN v2 (actuel)']]},
        {id:'nls_gb',label:'Grande-Bretagne (NLS)',items:[['nls_25inch','OS 25-inch Écosse (1892-1905)'],['nls_1inch','OS 1-inch GB (1885-1900)'],['gsgs3906','GSGS 3906 — War Office 1940-1943 (Écosse)'],['london_1940s','Londres 1940s (1:1250/1:2500)']]},
        {id:'usgs',label:'États-Unis (USGS)',items:[['usgs_topo','USGS Topo (USA, actuel)'],['usgs_imagery','USGS Satellite (USA)']]},
        {id:'nasa',label:'NASA (satellite)',items:[['nasa_landsat_weld','Landsat/WELD TrueColor (NASA, 2000)'],['nasa_modis','MODIS Terra TrueColor (NASA, 2024-06-01)']]},
        {id:'ign_es',label:'Espagne (IGN España)',items:[['ign_es_mtn50','MTN50 première édition (Espagne, 1910-1970)'],['ign_es_pnoa','Orthophotos PNOA actuelles (Espagne)']]},
    ];
    function tileLayerHiddenCategories(){try{return JSON.parse(localStorage.getItem('genealogie-tile-hidden-cats')||'[]');}catch(_){return[];}}
    function tileCustomCategories(){try{return JSON.parse(localStorage.getItem('genealogie-tile-custom-cats')||'null');}catch(_){return null;}}
    function orderedTileCategories(includeHidden=false){
        const custom=tileCustomCategories();
        let cats;
        if(custom){
            const allItems=Object.fromEntries(TILE_LAYER_CATEGORIES.flatMap(c=>c.items));
            cats=custom.map(c=>({id:c.id,label:c.label,items:c.items.map(k=>[k,allItems[k]||k]).filter(([,l])=>l)}));
            TILE_LAYER_CATEGORIES.forEach(defaultCat=>{
                const defaultKeys=defaultCat.items.map(([key])=>key);
                const knownKeys=new Set(cats.flatMap(cat=>cat.items.map(([key])=>key)));
                const missing=defaultCat.items.filter(([key])=>!knownKeys.has(key));
                if(!missing.length)return;
                const existing=cats.find(cat=>cat.id===defaultCat.id);
                if(existing)existing.items.push(...missing);
                else cats.push({...defaultCat,items:missing});
            });
        } else {
            cats=TILE_LAYER_CATEGORIES.map(cat=>{
                try{const saved=JSON.parse(localStorage.getItem(`genealogie-tile-items-${cat.id}`)||'null');
                if(saved&&Array.isArray(saved)){const itemMap=Object.fromEntries(cat.items);const ordered=saved.filter(k=>itemMap[k]).map(k=>[k,itemMap[k]]);const rest=cat.items.filter(([k])=>!saved.includes(k));return {...cat,items:[...ordered,...rest]};}
                }catch(_){}
                return cat;
            });
            const keys=cats.map(c=>c.id);const order=savedOrder('genealogie-tile-cat-order',keys);cats=order.map(id=>cats.find(c=>c.id===id)).filter(Boolean);
        }
        const hidden=tileLayerHiddenCategories();
        return includeHidden?cats:cats.filter(c=>!hidden.includes(c.id));
    }

    /** Noms des onglets du menu choisis dans Apparence (« Ordre du menu principal ») : {clé: nom}, vide = nom d'origine */
    function menuNames(){try{const o=JSON.parse(localStorage.getItem('genealogie-menu-names')||'{}');return o&&typeof o==='object'?o:{};}catch(_){return{};}}
    function menuLabel(key,fallback){const n=String(menuNames()[key]||'').trim();return n||fallback;}
    function applyMenuOrder(){const nav=$('.main-nav');if(!nav)return;let visibleIndex=0;const hidden=menuHiddenKeys();
        $$('.nav-custom-tab',nav).forEach(button=>button.remove());
        // Onglets à soi : un bouton chacun, à sa place dans « Ordre du menu principal » (Apparence)
        const tabs=Object.fromEntries(customTabs().map(t=>[t.id,t]));
        const customButton=t=>{const b=document.createElement('button');b.type='button';b.className='nav-item nav-custom-tab';b.dataset.module='dashboard';b.dataset.board=t.id;if(t.kind==='screen'){b.dataset.customScreen=String(t.target||'');delete b.dataset.module;}b.title=t.intro||t.name||'';b.innerHTML=`<span></span>${escapeHtml(menuLabel(t.id,`${t.icon?t.icon+' ':''}${t.name||'Mon onglet'}`))}`;b.classList.toggle('is-active',state.module==='dashboard'&&state.dashboardBoard===t.id);return b;};
        orderedMenuKeys().forEach(key=>{
            const tab=tabs[key];
            const button=tab?customButton(tab):nav.querySelector(`[data-module="${key}"]:not(.nav-custom-tab)`);if(!button)return;
            const isHidden=key!=='maintenance'&&(hidden.includes(key)||!!tab?.hidden);
            if(!tab){const label=[...button.childNodes].find(n=>n.nodeType===3);if(label){if(button.dataset.defaultLabel===undefined)button.dataset.defaultLabel=label.textContent;label.textContent=menuLabel(key,button.dataset.defaultLabel);}}
            button.style.display=isHidden?'none':'';if(!isHidden){button.querySelector('span').textContent=String(++visibleIndex).padStart(2,'0');}nav.append(button);
        });
    }
    /** Onglet raccourci : ouvre un écran de l'app (mêmes cibles que les raccourcis des widgets : module:, list:, maint:, graph:, stat:) */
    async function openCustomScreen(target){
        const [type,...rest]=String(target||'').split(':'),value=rest.join(':');
        if(type==='module'&&modules[value]&&value!=='jeu')return setModule(value);
        if(type==='list'){state.listType=value;return setModule('listes');}
        if(type==='maint'){state.maintenanceTab=value;return setModule('maintenance');}
        if(type==='graph'){state.graphMode=value;state.graphStatsFrozenColors=null;return setModule('graphiques');}
        if(type==='stat'){state.graphMode='stats';state.graphStatsType=value;state.graphStatsFrozenColors=null;return setModule('graphiques');}
        if(type==='mylist'&&Number(value)){state.maintenanceTab='my_lists';state.hListOpen=Number(value);return setModule('maintenance');}
        if(type==='person'&&Number(value)){state.currentPersonId=Number(value);return setModule('personnes');}
        // une commune choisie : sa fiche de village, ou sa monographie (lieu principal de la commune)
        if(type==='village'&&value){state.listType='villages';state.hVillage=value;return setModule('listes');}
        if(type==='monograph'&&value){let v=null;try{v=await api('village',{key:value});}catch(_){}
            if(!v){toast('Commune introuvable.','error');return;}
            state.graphMode='place_monograph';state.graphPlaceMonograph={...(state.graphPlaceMonograph||{}),id:v.place_id,name:v.name,county:v.county||'',country:v.country||'',showEvents:true,showDigests:true,showBattues:true,showCemetery:true};return setModule('graphiques');}
        toast('Cet écran n’existe plus : modifie l’onglet dans Maintenance → Éditeur d’onglets.','error');
    }

    async function api(action, params = {}, options = {}) {
        const url = new URL('api.php', location.href);
        url.searchParams.set('action', action);
        Object.entries(params).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, value));
        const init = {headers: {'Accept':'application/json'}, ...options};
        if (options.method && options.method !== 'GET') {
            init.headers = {...init.headers, 'Content-Type':'application/json', 'X-CSRF-Token':state.csrf};
            init.body = JSON.stringify({...options.body, csrf:state.csrf});
        }
        const response = await fetch(url, init);
        const data = await response.json().catch(() => ({error:'Réponse illisible du serveur'}));
        if (!response.ok || data.error) throw new Error(data.error || `Erreur ${response.status}`);
        // Après une modification, le nombre de personnes affiché est recompté (création, suppression, fusion,
        // ajout d'un parent… : il n'était calculé qu'à l'ouverture de l'application).
        if (options.method && options.method !== 'GET' && action !== 'save_settings') { schedulePersonCountRefresh(); window.dispatchEvent(new CustomEvent('lcnda:data-changed', {detail: {action}})); }
        return data;
    }

    // type de base : famille (par défaut), élevage (que des animaux) ou les deux
    const baseMode = () => { try { return ['family', 'breeding', 'both'].includes(localStorage.getItem('genealogie-base-mode')) ? localStorage.getItem('genealogie-base-mode') : 'family'; } catch (_) { return 'family'; } };
    /** Le compteur en haut à droite : une ligne par élément (« 3 861 personnes » / « 1 animal ») */
    function setCountStatus(el, label) { if (!el) return; el.innerHTML = String(label).split(' · ').map(part => `<span class="db-count-line">${escapeHtml(part)}</span>`).join(''); el.title = String(label); }
    function personCountLabel(count, animals = state.bootstrap?.stats?.animaux) {
        const n = Number(count) || 0, a = Number(animals) || 0, mode = baseMode();
        const ppl = `${n.toLocaleString('fr-FR')} personne${n > 1 ? 's' : ''}`, ani = `${a.toLocaleString('fr-FR')} anima${a > 1 ? 'ux' : 'l'}`;
        if (mode === 'breeding') return n ? `${ani} · ${ppl}` : ani;
        return a ? `${ppl} · ${ani}` : ppl;
    }
    let personCountTimer = null;
    // Barre de menus du haut plus large que la fenêtre : la molette d'une souris (défilement vertical) la fait défiler
    // de côté. Sans trackpad, les derniers menus étaient sinon inaccessibles.
    document.addEventListener('wheel', event => {
        const nav = event.target.closest?.('.main-nav');
        if (!nav || nav.scrollWidth <= nav.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        nav.scrollLeft += event.deltaY;
        event.preventDefault();
    }, {passive: false});

    function schedulePersonCountRefresh() {
        clearTimeout(personCountTimer);
        personCountTimer = setTimeout(async () => {
            try{window.lcnda?.refreshReminders?.();}catch(_){} // chiffre des rappels sur l'icône de l'application
            clearLineageCache();
            try {
                const {count, animals} = await api('person_count');
                const before = JSON.stringify(state.bootstrap?.stats ? peopleTabs() : []);
                if (state.bootstrap?.stats) { state.bootstrap.stats.personnes = Number(count) || 0; state.bootstrap.stats.animaux = Number(animals) || 0; }
                const tabBefore = state.personTab;
                if (state.module === 'personnes' && state.bootstrap?.stats && (JSON.stringify(peopleTabs()) !== before || state.personTab !== tabBefore)) { const seg = $('#sidebar-content .segmented'); if (seg) seg.innerHTML = peopleTabs().map(([k, l]) => `<button class="${state.personTab === k ? 'is-active':''}" data-person-tab="${k}">${l}</button>`).join(''); loadPeople(); }
                const label = personCountLabel(count, animals);
                const status = $('#database-status');
                setCountStatus(status, label);
                const footerCount = $('[data-person-count]');
                if (footerCount) footerCount.textContent = `${label} dans la base`;
            } catch (_) { /* sans gravité : le compteur sera juste à la prochaine ouverture */ }
        }, 400);
    }

    /**
     * Fenêtre de saisie de l'application, à la place de window.prompt() : Electron ne la fournit pas (« prompt() is
     * not supported » : le bouton ne faisait alors rien). Renvoie le texte saisi, ou null si on annule.
     * confirmWord : le bouton reste inactif tant que ce mot n'est pas tapé (ex. « SUPPRIMER »).
     */
    /** Mot de passe d'une sauvegarde protégée (null si on annule). */
    async function askBackupPassword(wrong=false){
        const value=await askText({title:'Sauvegarde protégée',message:wrong?'Mot de passe incorrect. Réessaie (attention aux majuscules).':'Cette sauvegarde est protégée par un mot de passe.',placeholder:'Mot de passe',okLabel:'Ouvrir',inputType:'password'});
        return value===null||value===undefined?null:String(value);
    }
    function askText({title='', message='', value='', placeholder='', okLabel='Valider', danger=false, confirmWord='', inputMode='text', inputType='text'}={}){
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');
            dialog.className='modal small-modal ask-text-dialog';
            dialog.innerHTML=`<form method="dialog"><div class="modal-head"><div><h2>${escapeHtml(title)}</h2>${message?`<p style="white-space:pre-line">${escapeHtml(message)}</p>`:''}</div><button class="icon-button" type="button" data-ask-cancel aria-label="Annuler">×</button></div><div class="form-grid one-column"><label>${confirmWord?`Tape <b>${escapeHtml(confirmWord)}</b> pour confirmer`:'Réponse'}<input name="answer" type="${inputType==='password'?'password':'text'}" autocomplete="off" inputmode="${escapeHtml(inputMode)}" placeholder="${escapeHtml(placeholder)}"></label></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-ask-cancel>Annuler</button><button class="button${danger?' danger':''}" type="submit" data-ask-ok>${escapeHtml(okLabel)}</button></div></form>`;
            document.body.appendChild(dialog);
            const input=dialog.querySelector('input'),ok=dialog.querySelector('[data-ask-ok]');
            input.value=value;
            let answer=null;
            const sync=()=>{if(confirmWord)ok.disabled=input.value.trim()!==confirmWord;};
            input.addEventListener('input',sync);sync();
            dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();if(ok.disabled)return;answer=input.value;dialog.close();});
            dialog.querySelectorAll('[data-ask-cancel]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
            dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);});
            dialog.showModal();
            input.focus();input.select();
        });
    }

    /** ✅ Confirmation au style de l'app (remplace confirm() du navigateur) : renvoie true ou false.
     *  danger : bouton rouge (par défaut quand le texte parle de supprimer, effacer, retirer, vider, écraser, remplacer). */
    function confirmBox(message='', {title='', okLabel='', cancelLabel='Annuler', danger=null}={}){
        if(typeof message==='object'&&message){({message='',title='',okLabel='',cancelLabel='Annuler',danger=null}=message);}
        const isDanger=danger===null?/supprim|effac|retir|vider|écras|remplac|détach|oubli|perd|annul|réinitialis|définitiv/i.test(`${title} ${message} ${okLabel}`):!!danger;
        const ok=okLabel||(isDanger?(/supprim/i.test(`${title} ${message}`)?'Supprimer':'Continuer'):'Continuer');
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');
            dialog.className='modal small-modal confirm-box-dialog';
            dialog.innerHTML=`<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${isDanger?'⚠️ ATTENTION':'CONFIRMER'}</span><h2>${escapeHtml(title||(isDanger?'Es-tu sûr ?':'Confirmer'))}</h2></div><button class="icon-button" type="button" data-cb-cancel aria-label="Fermer">×</button></div>${message?`<p class="confirm-box-text">${escapeHtml(message)}</p>`:''}<div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-cb-cancel>${escapeHtml(cancelLabel)}</button><button class="button${isDanger?' danger':''}" type="submit" data-cb-ok>${escapeHtml(ok)}</button></div></form>`;
            document.body.appendChild(dialog);
            let answer=false;
            dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();answer=true;dialog.close();});
            dialog.querySelectorAll('[data-cb-cancel]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
            dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);});
            dialog.showModal();
            (isDanger?dialog.querySelector('[data-cb-cancel].button'):dialog.querySelector('[data-cb-ok]'))?.focus();
        });
    }
    /** Pluriels : plural(1,'personne') → « 1 personne », plural(3,'personne') → « 3 personnes », plural(2,'cheval','chevaux') ; 0 et 1 au singulier */
    function plural(n,one,many=''){const v=Number(n)||0;return `${v.toLocaleString('fr-FR')} ${Math.abs(v)<2?one:(many||(/[sxz]$/.test(one)?one:`${one}s`))}`;}
    /** 📭 Liste vide : toujours le même message clair, avec le bouton pour commencer.
     *  emptyState({icon:'📚', text:'Aucun livre pour l’instant', hint:'…', action:{label:'＋ Nouveau livre', attrs:'data-x'}}) */
    function emptyState({icon='📭',text='Rien pour l’instant',hint='',action=null}={}){
        return `<div class="empty-box empty-card"><span class="empty-box-ico" aria-hidden="true">${escapeHtml(icon)}</span><b>${escapeHtml(text)}</b>${hint?`<small>${escapeHtml(hint)}</small>`:''}${action?`<button type="button" class="button small" ${action.attrs||''}>${escapeHtml(action.label)}</button>`:''}</div>`;
    }

    /** Bouton d'une liste vide : data-empty-click="#id" clique le vrai bouton de création (même code) ; data-empty-focus="#form [name=x]" va au champ du formulaire de création déjà affiché. */
    document.addEventListener('click',event=>{const b=event.target.closest?.('[data-empty-click],[data-empty-focus]');if(!b)return;if(b.dataset.emptyClick){const target=document.querySelector(b.dataset.emptyClick);if(target&&target!==b)target.click();return;}const field=document.querySelector(b.dataset.emptyFocus);if(field){field.scrollIntoView({behavior:'smooth',block:'center'});field.focus({preventScroll:true});}});

    /** Clic en dehors d'une liste de suggestions : un seul écouteur par clé (sinon un de plus à chaque affichage de l'écran). */
    const outsideClickHandlers={};
    function onOutsideClick(key,fn){if(outsideClickHandlers[key])document.removeEventListener('click',outsideClickHandlers[key]);outsideClickHandlers[key]=fn;document.addEventListener('click',fn);}

    function toast(message, type = '') {
        const item = document.createElement('div');
        item.className = `toast ${type}`;
        item.textContent = message;
        $('#toast-region').append(item);
        setTimeout(() => item.remove(), 4200);
    }

    function safeExportFilename(value, fallback='graphique'){
        const cleaned=String(value||fallback).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();
        return cleaned||fallback;
    }
    function graphExportToolbarHtml(){
        return `<div class="graph-export-toolbar no-export" aria-label="Exporter le graphique">
            <button class="button small secondary" type="button" data-graph-export="pdf">PDF</button>
            <button class="button small secondary" type="button" data-graph-export="png">PNG</button>
            <button class="button small secondary" type="button" data-graph-export="jpeg">JPEG</button>
            <button class="button small secondary" type="button" data-graph-export="print">Imprimer</button>
        </div>`;
    }
    function graphExportTitle(){
        const title=$('.place-monograph-title')?.textContent||$('.stats-title h2')?.textContent||$('.distribution-diagram h2')?.textContent||$('.tool-strip strong')?.textContent||$('.tool-strip .eyebrow')?.textContent||'graphique';
        return title.trim()||'graphique';
    }
    function graphExportTarget(){
        if($('.place-monograph-stage'))return $('.place-monograph-stage');
        if($('.stats-stage'))return $('.stats-stage');
        return $('.tree-scale-content')?.firstElementChild||$('.tree-stage')||$('#workspace .graph-layout');
    }
    function absoluteMediaSources(root){
        $$('img[src]',root).forEach(img=>{
            try{img.src=new URL(img.getAttribute('src'),location.href).href;}catch(_){}
        });
    }
    function graphExportCss(){
        const css=[];
        Array.from(document.styleSheets).forEach(sheet=>{
            try{css.push(Array.from(sheet.cssRules).map(rule=>rule.cssText).join('\n'));}catch(_){}
        });
        css.push('body{margin:0;background:#fff;color:#000}.no-export,.graph-export-toolbar,.stats-year-filter{display:none!important}.stats-stage,.tree-stage{height:auto!important;overflow:visible!important}.tree-scale-content{position:relative!important;left:0!important;top:0!important;transform:none!important}.tree,.special-diagram,.distribution-diagram{margin:0 auto}');
        return css.join('\n');
    }
    function cloneGraphForExport(){
        const target=graphExportTarget();
        if(!target)throw new Error('Aucun graphique à exporter.');
        const clone=target.cloneNode(true);
        clone.querySelectorAll('.no-export,.graph-export-toolbar,script').forEach(node=>node.remove());
        absoluteMediaSources(clone);
        return clone;
    }
    function printGraphExport(asPdf=false){
        const clone=cloneGraphForExport();
        const title=escapeHtml(graphExportTitle());
        const win=window.open('','_blank','width=1100,height=800');
        if(!win){toast('Fenêtre d’impression bloquée par le navigateur.','error');return;}
        win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${graphExportCss()}@page{margin:12mm}</style></head><body><main class="graph-print-page">${clone.outerHTML}</main><script>window.onload=()=>setTimeout(()=>window.print(),150);<\/script></body></html>`);
        win.document.close();
        if(asPdf)toast('Dans la fenêtre d’impression, choisis “Enregistrer en PDF”.');
    }
    async function exportGraphImage(format){
        const clone=cloneGraphForExport();
        const target=graphExportTarget();
        const rect=target.getBoundingClientRect();
        const width=Math.min(14000,Math.max(640,Math.ceil(target.scrollWidth||rect.width||1000)));
        const height=Math.min(14000,Math.max(360,Math.ceil(target.scrollHeight||rect.height||700)));
        clone.style.width=`${width}px`;
        clone.style.minHeight=`${height}px`;
        const html=`<style>${graphExportCss()}</style><div xmlns="http://www.w3.org/1999/xhtml" class="graph-export-snapshot">${clone.outerHTML}</div>`;
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
        const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        try{
            const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;});
            const canvas=document.createElement('canvas');
            canvas.width=width;canvas.height=height;
            const ctx=canvas.getContext('2d');
            if(format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);}
            ctx.drawImage(img,0,0);
            const mime=format==='jpeg'?'image/jpeg':'image/png';
            const link=document.createElement('a');
            link.download=`${safeExportFilename(graphExportTitle())}.${format==='jpeg'?'jpg':'png'}`;
            link.href=canvas.toDataURL(mime,.92);
            link.click();
        }finally{
            URL.revokeObjectURL(url);
        }
    }
    function bindGraphExportControls(){
        $$('[data-graph-export]').forEach(button=>{
            button.addEventListener('click',async()=>{
                const format=button.dataset.graphExport;
                try{
                    if(format==='print'||format==='pdf')printGraphExport(format==='pdf');
                    else await exportGraphImage(format);
                }catch(error){toast(error.message||'Export impossible.','error');}
            });
        });
    }

    const AUTO_BACKUP_KEY = 'genealogie-auto-backup-settings';
    function autoBackupSettings(){
        const defaults={enabled:false,dir:'data/backups',intervalMinutes:60,maxFiles:10,lastRun:0,lastResult:null};
        try{return {...defaults,...JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY)||'{}')};}catch(_){return defaults;}
    }
    function saveAutoBackupSettings(settings){
        localStorage.setItem(AUTO_BACKUP_KEY,JSON.stringify(settings));
    }
    function formatFileSize(bytes){
        const n=Number(bytes)||0;
        if(n>=1024*1024*1024)return `${(n/1024/1024/1024).toFixed(1)} Go`;
        if(n>=1024*1024)return `${(n/1024/1024).toFixed(1)} Mo`;
        if(n>=1024)return `${(n/1024).toFixed(1)} Ko`;
        return `${n} o`;
    }
    function formatBackupDate(value){
        if(!value)return 'jamais';
        const date=new Date(value);
        return Number.isNaN(date.getTime())?'jamais':date.toLocaleString('fr-FR');
    }
    function setupAutoBackupTimer(){
        if(autoBackupTimer){clearInterval(autoBackupTimer);autoBackupTimer=null;}
        const settings=autoBackupSettings();
        if(!settings.enabled)return;
        autoBackupTimer=setInterval(()=>maybeRunAutoBackup(),60000);
        maybeRunAutoBackup();
    }
    async function maybeRunAutoBackup(){
        const settings=autoBackupSettings();
        if(!settings.enabled||autoBackupRunning||!state.csrf)return;
        const interval=Math.max(15,Number(settings.intervalMinutes)||60)*60000;
        const last=Number(settings.lastRun)||0;
        if(Date.now()-last<interval)return;
        const lock=Number(localStorage.getItem('genealogie-auto-backup-lock')||0);
        if(lock&&Date.now()-lock<10*60000)return;
        autoBackupRunning=true;
        localStorage.setItem('genealogie-auto-backup-lock',String(Date.now()));
        try{
            const result=await api('backup_sqlite',{}, {method:'POST',body:{dir:settings.dir,max_files:settings.maxFiles,mode:'auto'}});
            const next={...autoBackupSettings(),lastRun:Date.now(),lastResult:{ok:true,file:result.file,path:result.path,size:result.size,created_at:result.created_at}};
            saveAutoBackupSettings(next);
            if(state.module==='maintenance'&&state.maintenanceTab==='export')renderExportTools();
        }catch(error){
            const next={...autoBackupSettings(),lastRun:Date.now(),lastResult:{ok:false,message:error.message,created_at:new Date().toISOString()}};
            saveAutoBackupSettings(next);
            if(state.module==='maintenance'&&state.maintenanceTab==='export')renderExportTools();
        }finally{
            localStorage.removeItem('genealogie-auto-backup-lock');
            autoBackupRunning=false;
        }
    }

    async function init() {
        if (!window.GENEALOGY_READY) { bindInstallScreen(); return; }
        applyDesign();
        applyGenderColorsToDocument();
        applyBattueLevelColors();
        applyPersonBadgeColors();
        bindGlobalEvents();
        try {
            state.bootstrap = await api('bootstrap');
            state.csrf = state.bootstrap.csrf;
            applySiteDefaults(state.bootstrap.siteDefaults,false);
            applyMenuOrder();
            if(!IS_SECONDARY)setupAutoBackupTimer();
            const urlPersonId = Number(new URLSearchParams(location.search).get('person')) || 0;
            state.currentPersonId = urlPersonId || Number(state.currentPersonId) || state.bootstrap.startPersonId;
            $('#app').classList.toggle('sidebar-collapsed',Boolean(persisted.sidebarCollapsed));
            if(IS_SECONDARY){applyViewSnapshot(SECONDARY_VIEW);document.documentElement.classList.toggle('is-embedded',IS_EMBEDDED);
                // Écran de l'app posé dans un de ses onglets : sans la barre du haut ni la colonne de gauche
                if(SECONDARY_VIEW.screen){document.documentElement.classList.add('is-screen-embed');if(SECONDARY_VIEW.layout&&typeof SECONDARY_VIEW.layout==='object')window.LCNDA_SCREEN_LAYOUT=SECONDARY_VIEW.layout;if(SECONDARY_VIEW.sidebar)document.documentElement.classList.add('is-screen-embed-sidebar');await openCustomScreen(SECONDARY_VIEW.screen);return;}
                await setModule(SECONDARY_VIEW.module||'personnes',false);bindSidePanelButton();return;}
            bindSidePanelButton();
            setCountStatus($('#database-status'), personCountLabel(state.bootstrap.stats.personnes));
            const initialRoute = chooseInitialRoute(urlPersonId);
            if(initialRoute.maintenanceTab)state.maintenanceTab=initialRoute.maintenanceTab;
            await setModule((urlPersonId ? 'personnes' : (initialRoute.module || 'dashboard')), false);
            if(!urlPersonId)updateBrowserRoute(moduleHash(state.module),false,state.module);
            setTimeout(checkInseeRemote,8000); // nouveaux fichiers des décès INSEE (une fois par jour)
        } catch (error) {
            $('#workspace').innerHTML = errorState(error.message);
            toast(error.message, 'error');
        }
    }

    function bindInstallScreen() {
        const csrf = window.INSTALL_CSRF || '';

        const importForm = $('#install-import-form');
        if (importForm) {
            const result = $('#install-import-result');
            const showImported = (data) => {
                const st = data.stats || {};
                const n = (v) => Number(v || 0).toLocaleString('fr-FR');
                const parts = [`${plural(st.persons || st.personnes,'personne')}`];
                if (st.sources) parts.push(`${plural(st.sources,'source')}`);
                if (st.tasks) parts.push(`${plural(st.tasks,'tâche devenue','tâches devenues')} des rappels`);
                if (st.media) parts.push(`${plural(st.media,'média')}`);
                const missing = Number(st.media_missing || 0);
                result.innerHTML = `<p>Import terminé : ${parts.join(', ')}.</p>`
                    + (missing ? `<p class="muted">${plural(missing,'fichier')} de média ${Number(missing)<2?'introuvable':'introuvables'} : les fiches existent, mais sans le fichier. Avec une base .db seule, utilise plutôt la « Sauvegarde complète (.zip) » (Maintenance → Export), qui contient les médias.</p><p><button class="button" type="button" data-install-continue>Continuer</button></p>` : '<p class="muted">Rechargement…</p>');
                if (missing) result.querySelector('[data-install-continue]').addEventListener('click', () => location.reload());
                else setTimeout(() => location.reload(), 900);
            };
            // Application de bureau : fenêtre de choix du système, puis lecture du fichier sur place. Indispensable
            // pour un paquet MacFamilyTree (.mftpkg), qui est un dossier : la page ne peut pas l'envoyer.
            let chosen = null;
            const fileInput = importForm.elements.file;
            if (window.lcnda && fileInput) {
                const pickButton = document.createElement('button');
                pickButton.type = 'button';
                pickButton.className = 'button small secondary';
                pickButton.textContent = 'Choisir un fichier…';
                const chosenLabel = document.createElement('span');
                chosenLabel.className = 'muted';
                chosenLabel.textContent = ' Aucun fichier choisi';
                fileInput.hidden = true;
                fileInput.after(pickButton, chosenLabel);
                pickButton.addEventListener('click', async () => {
                    const picked = await window.lcnda.chooseImportFile();
                    if (!picked || picked.canceled) return;
                    chosen = picked;
                    chosenLabel.textContent = ' ' + picked.name;
                });
            }
            importForm.addEventListener('submit', async event => {
                event.preventDefault();
                if (chosen) {
                    const picked = chosen;
                    chosen = null;
                    result.innerHTML = `<p class="muted">Import de ${escapeHtml(picked.name)} en cours… (quelques minutes pour une grande généalogie avec photos)</p>`;
                    try {
                        let {status, data} = await window.lcnda.importChosenFile(picked.token);
                        while (status === 401 && data.password_required) {
                            const password = await askBackupPassword(data.wrong_password);
                            if (password === null) { result.innerHTML = ''; return; }
                            ({status, data} = await window.lcnda.importChosenFile(picked.token, password));
                        }
                        if (status >= 400 || data.error) throw new Error(data.error || 'Erreur serveur');
                        showImported(data);
                    } catch (error) {
                        result.innerHTML = '';
                        toast(error.message, 'error');
                    }
                    return;
                }
                const file = fileInput.files[0];
                if (!file) { toast('Sélectionne un fichier', 'error'); return; }
                const ext = (file.name.split('.').pop() || '').toLowerCase();
                const isRealImport = ['ged', 'gedcom', 'heredis', 'mftpkg', 'zip', 'gdz', 'db', 'sqlite'].includes(ext);
                const action = isRealImport ? 'import_package' : 'import_analyse';
                result.innerHTML = `<p class="muted">${isRealImport ? 'Import' : 'Analyse'} en cours…</p>`;
                try {
                    const send = async (password = '') => {
                        const fd = new FormData();
                        fd.append('file', file);
                        fd.append('csrf', csrf);
                        if (password) fd.append('password', password);
                        const resp = await fetch(`api.php?action=${action}`, {method: 'POST', headers: {'X-CSRF-Token': csrf}, body: fd});
                        return {resp, data: await resp.json().catch(() => ({error: 'Réponse illisible'}))};
                    };
                    let {resp, data} = await send();
                    while (resp.status === 401 && data.password_required) {
                        const password = await askBackupPassword(data.wrong_password);
                        if (password === null) { result.innerHTML = ''; return; }
                        ({resp, data} = await send(password));
                    }
                    if (!resp.ok || data.error) throw new Error(data.error || 'Erreur serveur');
                    if (isRealImport) {
                        showImported(data);
                    } else {
                        result.innerHTML = `<p class="muted">Fichier analysé (${escapeHtml(data.format || '')}). L'import direct pour ce format n'est pas encore disponible ; utilise un fichier GEDCOM ou .mftpkg pour importer directement.</p>`;
                    }
                } catch (error) {
                    result.innerHTML = '';
                    toast(error.message, 'error');
                }
            });
        }

        const personForm = $('#install-person-form');
        if (personForm) {
            personForm.addEventListener('submit', async event => {
                event.preventDefault();
                const data = formObject(personForm);
                const result = $('#install-person-result');
                if (!data.first_name?.trim() && !data.last_name?.trim()) { toast('Indique au moins un prénom ou un nom', 'error'); return; }
                result.innerHTML = '<p class="muted">Création en cours…</p>';
                try {
                    const resp = await fetch('api.php?action=save_person', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf},
                        body: JSON.stringify({...data, init_if_missing: true, csrf}),
                    });
                    const created = await resp.json().catch(() => ({error: 'Réponse illisible'}));
                    if (!resp.ok || created.error) throw new Error(created.error || 'Erreur serveur');
                    result.innerHTML = '<p>Première personne créée. Rechargement…</p>';
                    setTimeout(() => location.reload(), 700);
                } catch (error) {
                    result.innerHTML = '';
                    toast(error.message, 'error');
                }
            });
        }
    }

    function applyDesign(){
        const design=readDesignSettings();
        const presets={
            portfolio:{blue:'#0066cc',bg:'#ffffff',paper:'#ffffff',card:'#ffffff',cardHead:'#fafafa',dark:false},
            soft:{blue:'#3978d8',bg:'#f7f9ff',paper:'#ffffff',card:'#ffffff',cardHead:'#f4f8ff',dark:false},
            archive:{blue:'#315f9f',bg:'#f6f1e8',paper:'#fffaf0',card:'#fffaf0',cardHead:'#f2ead8',dark:false},
            archiveBlue:{blue:'#315f9f',bg:'#e8eef6',paper:'#f0f6ff',card:'#f0f6ff',cardHead:'#d8e3f2',dark:false},
            archiveGreen:{blue:'#315f9f',bg:'#e8f6ed',paper:'#f0fff5',card:'#f0fff5',cardHead:'#d8f2e1',dark:false},
            archiveRed:{blue:'#315f9f',bg:'#f6e9e8',paper:'#fff1f0',card:'#fff1f0',cardHead:'#f2dad8',dark:false},
            archivePurple:{blue:'#315f9f',bg:'#f1e8f6',paper:'#faf0ff',card:'#faf0ff',cardHead:'#e9d8f2',dark:false},
            archiveOrange:{blue:'#315f9f',bg:'#f6eee8',paper:'#fff7f0',card:'#fff7f0',cardHead:'#f2e4d8',dark:false},
            archiveTurquoise:{blue:'#315f9f',bg:'#daf1f0',paper:'#eaf7f6',card:'#eaf7f6',cardHead:'#bfe7e5',dark:false},
            archivePink:{blue:'#315f9f',bg:'#f2dfe8',paper:'#f8eef3',card:'#f8eef3',cardHead:'#e7c7d6',dark:false},
            archivePetrol:{blue:'#315f9f',bg:'#d9e7eb',paper:'#eef5f7',card:'#eef5f7',cardHead:'#b7d0d8',dark:false},
            archiveSalmon:{blue:'#315f9f',bg:'#f4dfd9',paper:'#faf0ed',card:'#faf0ed',cardHead:'#ebc4b8',dark:false},
            archiveLavender:{blue:'#315f9f',bg:'#e2e0f2',paper:'#f2f1fa',card:'#f2f1fa',cardHead:'#c9c5e6',dark:false},
            archiveYellow:{blue:'#315f9f',bg:'#f8f2d3',paper:'#fbf8e8',card:'#fbf8e8',cardHead:'#f4e8b2',dark:false},
            dark:{blue:'#4d9fff',bg:'#1a1a1a',paper:'#1a1a1a',card:'#242424',cardHead:'#2e2e2e',dark:true},
        };
        const preset=presets[design.preset]||presets.portfolio;
        document.documentElement.dataset.theme=preset.dark?'dark':'';
        const cardBackgrounds={
            white:{card:preset.card,cardHead:preset.cardHead},
            portfolio:{card:preset.card,cardHead:preset.cardHead},
            blue:{card:'#eef6ff',cardHead:'#ddebff'},
            bw:{card:'#ffffff',cardHead:'#eeeeee'},
            archive:{card:'#fff7e5',cardHead:'#efe3c6'},
            green:{card:'#f0fbf4',cardHead:'#dff3e7'},
        };
        const cardBg=cardBackgrounds[design.cardBackground]||cardBackgrounds.white;
        document.documentElement.style.setProperty('--blue',design.blue||preset.blue);
        document.documentElement.style.setProperty('--bg',preset.bg);
        document.documentElement.style.setProperty('--paper',preset.paper);
        document.documentElement.style.setProperty('--card-bg',cardBg.card);
        document.documentElement.style.setProperty('--card-head-bg',cardBg.cardHead);
        document.documentElement.lang='fr';
        // Agencement : menu des onglets en haut ou en bas, colonne latérale à gauche ou à droite
        document.documentElement.classList.toggle('nav-bottom',design.navPosition==='bottom');
        document.documentElement.classList.toggle('side-right',design.sidebarPosition==='right');
        document.documentElement.classList.toggle('brand-hidden',design.brandDisplay==='hide');
        const reopen=document.getElementById('sidebar-reopen');if(reopen)reopen.textContent=design.sidebarPosition==='right'?'← Liste':'Liste →';
        document.documentElement.dataset.mapBackground=mapBackgroundValue(design.mapBackground);
        document.documentElement.style.fontSize=`${Math.round(Number(design.fontScale||1)*100)}%`;
        document.documentElement.style.setProperty('--font-family',fontFamilyStack(design.fontFamily));
        const brandFirst=$('#brand-firstname'),brandLast=$('#brand-lastname');
        if(brandFirst)brandFirst.textContent=design.ownerFirst||'MA';
        if(brandLast)brandLast.textContent=design.ownerLast||'FAMILLE';
        // Titre de la fenêtre : « Généalogie <Nom> » si un nom est choisi dans Apparence, sinon le nom du logiciel.
        {const last=String(design.ownerLast||'').trim();document.title=last?`Généalogie ${last.charAt(0).toLocaleUpperCase('fr')}${last.slice(1).toLocaleLowerCase('fr')}`:'Carnet numérique des ancêtres';}
        document.documentElement.dataset.avatarShape=design.avatarShape||'tilted';
        // Sync default event display mode from design (only if not explicitly persisted by user)
        if(design.eventDisplayMode&&!persisted.eventDisplayMode)state.eventDisplayMode=design.eventDisplayMode;
        if(design.defaultMapLocationMode&&!persisted.mapLocationMode)state.mapLocationMode=design.defaultMapLocationMode;
    }

    function bindGlobalEvents() {
        $('.main-nav').addEventListener('click', event => {
            const screen = event.target.closest('[data-custom-screen]');
            if (screen) { openCustomScreen(screen.dataset.customScreen); return; }
            const button = event.target.closest('[data-module]');
            if (!button) return;
            if (button.dataset.module === 'dashboard') state.dashboardBoard = button.dataset.board || '';
            if (button.dataset.module === 'personnes' || button.dataset.module === 'animaux') state.scopeSwitch = true; // l'onglet cliqué : sa dernière fiche
            setModule(button.dataset.module);
        });
        $('#sidebar-toggle').addEventListener('click', () => { $('#app').classList.add('sidebar-collapsed'); persistUiState(); });
        $('#sidebar-reopen').addEventListener('click', () => { $('#app').classList.remove('sidebar-collapsed'); persistUiState(); });
        window.addEventListener('hashchange', () => {
            const route=routeFromHash(location.hash);
            if(route?.maintenanceTab)state.maintenanceTab=route.maintenanceTab;
        if(route?.module==='dashboard')state.dashboardBoard=route.board||'';
            setModule(route?.module || state.module || 'dashboard', false);
        });
        $('#workspace').addEventListener('scroll',debounce(saveScrollPosition,120));
        $('#sidebar-content').addEventListener('scroll',debounce(saveScrollPosition,120));
        window.addEventListener('beforeunload',()=>{saveCurrentRoute();saveScrollPosition();});
        window.setInterval(saveScrollPosition,500);
        bindArchiveRoomShortcut();
        bindDialogs();
    }

    function bindArchiveRoomShortcut(){
        const code=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
        let index=0;
        document.addEventListener('keydown',event=>{
            if(event.target.matches('input,textarea,select')||$('#lightbox')?.open)return;
            const key=event.key.length===1?event.key.toLowerCase():event.key;
            index=key===code[index]?index+1:(key===code[0]?1:0);
            if(index===code.length){index=0;openArchiveRoom();}
        });
    }

    var setModuleImpl=null; // var : peut servir avant cette ligne (démarrage)
    function setModule(module,pushHash=true){return setModuleImpl?setModuleImpl(module,pushHash):setModuleReal(module,pushHash);}
    async function setModuleReal(module, pushHash = true) {
        if(state.module==='carte'&&module!=='carte'){hideMapTooltip();const surnameBox=document.getElementById('map-surname-suggestions');if(surnameBox)surnameBox.hidden=true;}
        if(state.hasRendered)saveScrollPosition();
        if (!modules[module]) module = 'personnes';
        if (module === 'animaux') { state.peopleScope = 'animals'; module = 'personnes'; } else if (module === 'personnes' && !setModuleReal.keepScope) state.peopleScope = '';
        setModuleReal.keepScope = false;
        if (!animalsTabOn()) state.peopleScope = '';
        if(module!=='dashboard'||(state.dashboardBoard&&!currentCustomTab()))state.dashboardBoard='';
        if(module!=='listes')listController?.abort();
        state.module = module;
        const renderToken=++state.workspaceToken;
        persistUiState();
        const hash=moduleHash(module);
        saveLastRoute(hash);
        updateBrowserRoute(hash,pushHash,module);
        markNavActive();
        const ownTab = module === 'dashboard' ? currentCustomTab() : null;
        $('#sidebar-index').textContent = ownTab ? 'MON ONGLET' : modules[module][0];
        $('#sidebar-title').textContent = ownTab ? menuLabel(ownTab.id, `${ownTab.icon ? ownTab.icon + ' ' : ''}${ownTab.name || 'Mon onglet'}`) : module === 'personnes' && state.peopleScope === 'animals' ? menuLabel('animaux', 'Animaux') : menuLabel(module, modules[module][1]);
        $('#workspace').innerHTML = '<section class="loading-screen"><div class="loading-mark">VB</div><p>Préparation de la vue…</p></section>';
        renderSidebar();
        try {
        if (module === 'dashboard') await renderDashboard(renderToken);
        if (module === 'personnes') await loadPeopleAndPerson();
            if (module === 'graphiques') await renderGraph(renderToken);
            if (module === 'jeu') await renderGooseGame(renderToken);
            if (module === 'carte') await renderMap(renderToken);
            if (module === 'listes') await renderList(renderToken);
            if (module === 'chronologie') await renderTimeline(renderToken);
            if (module === 'recherche') await renderResearch(renderToken);
            if (module === 'enquetes') await renderInvestigations(renderToken);
            if (module === 'fiches') await window.LCNDA_EXT?.fiches?.render?.(renderToken);
            if (module === 'adn') await window.LCNDA_EXT?.adn?.render?.(renderToken);
            if (module === 'comparaison') await renderComparison(renderToken);
            if (module === 'maintenance') await renderMaintenance(renderToken);
            if(renderToken!==state.workspaceToken)return;
            state.hasRendered=true;
            restoreScrollPosition();
        } catch (error) {
            if(renderToken!==state.workspaceToken)return; // un ancien écran qui échoue n'efface pas celui qu'on regarde
            $('#workspace').innerHTML = errorState(error.message);
            toast(error.message, 'error');
        }
    }

    function moduleFromHash(){
        const route=routeFromHash(location.hash);
        if(route?.maintenanceTab)state.maintenanceTab=route.maintenanceTab;
        return route?.module||'';
    }

    function routeFromHash(hashValue){
        let raw=String(hashValue||'').trim();
        if(!raw)return null;
        if(raw.startsWith('{')){
            try{raw=String(JSON.parse(raw).hash||'').trim();}catch(_){}
        }
        raw=decodeURIComponent(raw.replace(/^#/,'')).trim();
        raw=raw.replace(/^!?\//,'').replace(/^!/,'');
        if(!raw)return null;
        const parts=raw.split('/').map(part=>part.trim()).filter(Boolean);
        const module=parts[0]||'';
        if(!modules[module])return null;
        return {module,maintenanceTab:module==='maintenance'&&parts[1]?parts[1]:'',board:module==='dashboard'&&CUSTOM_TAB_ID.test(parts[1]||'')?parts[1]:''};
    }

    function markNavActive(){const module=state.module,shown=module==='personnes'&&state.peopleScope==='animals'?'animaux':module;$$('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.module === shown && (module !== 'dashboard' || (button.dataset.board || '') === (state.dashboardBoard || ''))));}
    // une fiche d'animal ouverte depuis « Personnes » passe dans « Animaux » (et l'inverse), si l'onglet est montré
    function syncPeopleScope(person){
        if(!animalsTabOn()||state.module!=='personnes'||!person)return;
        const want=person.kind==='animal'?'animals':'';
        if((state.peopleScope||'')===want)return;
        state.peopleScope=want;state.personTab=want?'animals':'all';markNavActive();
        $('#sidebar-title').textContent=want?'Animaux':'Personnes';renderSidebar();loadPeople();
    }
    function moduleHash(module=state.module){
        if(module==='maintenance')return `#maintenance/${encodeURIComponent(state.maintenanceTab||'issues')}`;
        if(module==='dashboard'&&state.dashboardBoard)return `#dashboard/${encodeURIComponent(state.dashboardBoard)}`;
        return `#${module}`;
    }

    function updateBrowserRoute(hash,push=true,module=state.module){
        const url=new URL(location.href);
        if(module!=='personnes')url.searchParams.delete('person');
        url.hash=hash.replace(/^#/,'');
        const target=url.pathname+url.search+url.hash;
        if(push){
            if(location.pathname+location.search+location.hash!==target)history.pushState(null,'',target);
        }else{
            history.replaceState(null,'',target);
        }
    }

    function saveLastRoute(hash){
        if(IS_SECONDARY)return;
        try{localStorage.setItem(LAST_ROUTE_KEY,JSON.stringify({hash,ts:Date.now()}));}catch(_){}
    }

    function storedRouteRecord(){
        try{
            const raw=localStorage.getItem(LAST_ROUTE_KEY)||'';
            if(!raw)return null;
            const parsed=raw.startsWith('{')?JSON.parse(raw):{hash:raw,ts:0};
            const route=routeFromHash(parsed.hash||'');
            return route?{route,hash:parsed.hash||'',ts:Number(parsed.ts)||0}:null;
        }catch(_){
            const route=routeFromHash(localStorage.getItem(LAST_ROUTE_KEY)||'');
            return route?{route,hash:'',ts:0}:null;
        }
    }

    function chooseInitialRoute(urlPersonId=0){
        if(urlPersonId)return {module:'personnes'};
        const urlRoute=routeFromHash(location.hash);
        const stored=storedRouteRecord();
        // Une adresse explicitement demandée (y compris #personnes) doit
        // gagner sur la dernière page mémorisée.
        if(urlRoute?.module)return urlRoute;
        return urlRoute||stored?.route||{module:state.module||'dashboard'};
    }

    function saveCurrentRoute(){
        if(!state.module||!modules[state.module])return;
        saveLastRoute(moduleHash(state.module));
    }

    function persistUiState() {
        if(IS_SECONDARY)return;
        const data = {
            module:state.module,currentPersonId:state.currentPersonId,peopleQuery:state.peopleQuery,peoplePhonetic:state.peoplePhonetic,personTab:state.personTab,peopleScope:state.peopleScope||'',
            graphTab:state.graphTab,graphMode:state.graphMode,graphDepth:state.graphDepth,graphStatsType:state.graphStatsType,graphStatsYearFrom:state.graphStatsYearFrom,graphStatsYearTo:state.graphStatsYearTo,graphStatsLimit:state.graphStatsLimit,graphStatsRules:state.graphStatsRules,graphStatsGender:state.graphStatsGender,graphKinship:state.graphKinship,graphCompare:state.graphCompare,graphPlaceMonograph:state.graphPlaceMonograph,mapTag:state.mapTag,mapDisplay:state.mapDisplay,mapMode:state.mapMode,mapZoom:state.mapZoom,mapYearFrom:state.mapYearFrom,mapYearTo:state.mapYearTo,mapGender:state.mapGender,mapSurname:state.mapSurname,mapSurnameMode:state.mapSurnameMode,mapAgeFrom:state.mapAgeFrom,mapAgeTo:state.mapAgeTo,mapTimelineYear:state.mapTimelineYear,mapRouteArrows:state.mapRouteArrows,mapRouteStep:state.mapRouteStep,mapRoutePeople:state.mapRoutePeople,mapOverlayBg:state.mapOverlayBg,mapOverlayOpacity:state.mapOverlayOpacity,
            mapCenter:state.mapCenter,listType:state.listType,listGender:state.listGender,listReminderMode:state.listReminderMode,listReminderCategory:state.listReminderCategory,listDisplay:state.listDisplay,listMediaCity:state.listMediaCity,listMediaDateFrom:state.listMediaDateFrom,listMediaDateTo:state.listMediaDateTo,listMediaKind:state.listMediaKind,listSosaSort:state.listSosaSort,listSosaMissing:state.listSosaMissing,listSosaImpossible:state.listSosaImpossible,listSosaRootId:state.listSosaRootId,listSosaRootName:state.listSosaRootName,listDabovilleSort:state.listDabovilleSort,listDabovilleRootId:state.listDabovilleRootId,listDabovilleRootName:state.listDabovilleRootName,listCourrierFilter:state.listCourrierFilter,externalLinksSort:state.externalLinksSort,externalLinksCountry:state.externalLinksCountry,externalLinksQuery:state.externalLinksQuery,researchKind:state.researchKind,researchDisplay:state.researchDisplay,research:state.research,placeNameSearch:state.placeNameSearch,dateSearch:state.dateSearch,proximitySearch:state.proximitySearch,transcriptionSearch:state.transcriptionSearch,inseeSearch:state.inseeSearch,investigationStatus:state.investigationStatus,investigationDisplay:state.investigationDisplay,investigationQuery:state.investigationQuery,currentInvestigationId:state.currentInvestigationId,currentBattueId:state.currentBattueId,enquetesTab:state.enquetesTab,comparison:state.comparison,comparisonMode:state.comparisonMode,maintenanceTab:state.maintenanceTab,timeline:state.timeline,investigationSort:state.investigationSort,battueSort:state.battueSort,
            sidebarCollapsed:$('#app')?.classList.contains('sidebar-collapsed') || false,scrollPositions:state.scrollPositions,
        };
        try { localStorage.setItem(PERSIST_KEY,JSON.stringify(data)); } catch (_) {}
    }

    function saveScrollPosition() {
        if (!state.module||!state.hasRendered) return;
        state.scrollPositions[state.module] = {workspace:$('#workspace')?.scrollTop || 0,sidebar:$('#sidebar-content')?.scrollTop || 0};
        persistUiState();
    }

    function restoreScrollPosition() {
        const position=state.scrollPositions[state.module];if(!position)return;
        setTimeout(()=>{if($('#workspace'))$('#workspace').scrollTop=position.workspace||0;if($('#sidebar-content'))$('#sidebar-content').scrollTop=position.sidebar||0;},80);
    }

    function renderSidebar() {
        sidebarController?.abort();sidebarController=new AbortController();
        const content = $('#sidebar-content');
        const footer = $('#sidebar-footer');
        footer.textContent = '';
        if (state.module === 'dashboard') renderDashboardSidebar(content, footer);
        if (state.module === 'personnes') renderPeopleSidebar(content, footer);
        if (state.module === 'graphiques') renderGraphSidebar(content, footer);
        if (state.module === 'jeu') renderGooseGameSidebar(content, footer);
        if (state.module === 'carte') renderMapSidebar(content, footer);
        if (state.module === 'listes') renderListSidebar(content, footer);
        if (state.module === 'chronologie') renderTimelineSidebar(content, footer);
        if (state.module === 'recherche') renderResearchSidebar(content, footer);
        if (state.module === 'enquetes') renderInvestigationsSidebar(content, footer);
        if (state.module === 'fiches') window.LCNDA_EXT?.fiches?.sidebar?.(content, footer);
        if (state.module === 'adn') window.LCNDA_EXT?.adn?.sidebar?.(content, footer);
        if (state.module === 'comparaison') renderComparisonSidebar(content, footer);
        if (state.module === 'maintenance') renderMaintenanceSidebar(content, footer);
    }

    /* 🏠 Tableau de bord : dans app-tableau-de-bord.js (chargé juste après app.js) ; ici, des relais. */
    async function renderDashboard(...a){const f=await appPartReady('renderDashboard');if(f)return f(...a);$('#workspace').innerHTML=empty('Le tableau de bord n’a pas pu se charger (fichier app-tableau-de-bord.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderDashboardSidebar(...a){const f=appPart('renderDashboardSidebar');if(f)return f(...a);}

    /** Dernières données du tableau de bord : ouvrir ou fermer les réglages d'un widget (✎) les reprend au lieu de tout redemander */
    function dashboardBlockEditor(settings,labels){
        return `<section class="maintenance-panel order-editor block-order-editor dashboard-block-editor"><h3>Widgets posés sur le tableau de bord</h3><p style="font-size:.8rem;color:var(--muted);margin:.25rem 0 .75rem">Règle l’ordre, la largeur et le nombre d’éléments des widgets déjà affichés.</p><div class="order-list block-order-list" id="dashboard-blocks">${settings.widgets.map((widget,index)=>dashboardOrderRow(widget,labels[widget.type]||widget.type,index)).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="dashboard-blocks">Enregistrer ces widgets</button></div></section>`;
    }
    function dashboardOrderRow(widget,label,index){
        const bt=dashboardBaseType(widget.type);
        const parts=[];
        if(bt==='person_block')parts.push((defaultPersonBlocks.find(row=>row[0]===(widget.config?.personBlockKey||'identity'))||[, 'Identité'])[1]);
        if(widget.config?.personMode==='specific'&&widget.config?.personName)parts.push(widget.config.personName);
        const subtitle=parts.length?`<small>${escapeHtml(parts.join(' · '))}</small>`:'';
        const limitLabel=bt==='person_quiz'?'Prop.':'Nb.';
        const limitMax=bt==='person_quiz'?8:80;
        const limitMin=bt==='person_quiz'?3:1;
        return `<div class="order-row dashboard-order-row" data-widget-id="${escapeHtml(widget.id)}" data-widget-type="${escapeHtml(widget.type)}"><span class="order-grip" draggable="true" aria-hidden="true">↕</span><span class="order-number">${String(index+1).padStart(2,'0')}</span><b>${escapeHtml(label)}${subtitle}</b><div class="block-widths" aria-label="Largeur du widget">${personBlockWidthChoices.map(([value,text])=>`<button type="button" data-block-width="${value}" aria-pressed="${String(widget.width)===value?'true':'false'}" title="Largeur ${text}">${text}</button>`).join('')}</div>${defaultDashboardBlockLimits[bt]?`<label class="dashboard-limit" title="${bt==='person_quiz'?'Nombre de propositions':'Nombre d’éléments'}">${limitLabel} <input type="number" min="${limitMin}" max="${limitMax}" value="${escapeHtml(widget.limit||defaultDashboardBlockLimits[bt])}"></label>`:'<span></span>'}</div>`;
    }
    /** Message après une restauration (une fiche restaurée peut avoir perdu un lien vers un élément supprimé depuis). */
    function restoreDoneText(result){
        const r=result?.result||result||{};const skipped=Number(r.skipped)||0;
        const what=r.entity_type==='person'?'Fiche restaurée avec ses événements, liens familiaux, notes, médias et sources.':'Suppression restaurée.';
        return skipped?`${what} ${Number(skipped)<2?`${plural(skipped,'élément')} n’a pas pu être remis`:`${plural(skipped,'élément')} n’ont pas pu être remis`} (un élément lié a été supprimé depuis).`:what;
    }
    /** Widget « Bilan de recherche » : le chemin parcouru, d'après le journal des modifications. */
    function dashboardRecentPeople(){
        try{return JSON.parse(localStorage.getItem('genealogie-dashboard-recent-people')||'[]').filter(item=>item&&Number(item.id));}catch(_){return[];}
    }
    function rememberDashboardPerson(person){
        if(!person?.id)return;
        const item={id:Number(person.id),name:personName(person),years:years(person),seen_at:new Date().toISOString()};
        const rows=[item,...dashboardRecentPeople().filter(row=>Number(row.id)!==Number(item.id))].slice(0,30);
        localStorage.setItem('genealogie-dashboard-recent-people',JSON.stringify(rows));
    }

    function renderPeopleSidebar(content, footer) {
        content.innerHTML = `
            <div class="segmented">${peopleTabs().map(([k, l]) => `<button class="${state.personTab === k ? 'is-active':''}" data-person-tab="${k}">${l}</button>`).join('')}</div>
            <div class="search-box"><label for="person-search">Prénom, nom (de naissance ou mariage) ou variante</label><div class="search-row"><input id="person-search" value="${escapeHtml(state.peopleQuery)}" placeholder="Dupont, Dupond…"><button id="person-search-button" aria-label="Rechercher">⌕</button></div><label class="check-line" title="Tolère les variantes orthographiques d'époque et rattrape les erreurs de transcription via un Soundex français combiné"><input type="checkbox" id="person-phonetic" ${state.peoplePhonetic?'checked':''}> Recherche phonétique</label></div>
            <div class="person-list" id="person-list"><div class="loading-block">Chargement…</div></div>`;
        footer.innerHTML = `<button class="button small" id="new-person">${baseMode() === 'breeding' || state.peopleScope === 'animals' || state.personTab === 'animals' ? '＋ Nouvel animal' : animalsTabOn() ? '＋ Nouvelle personne' : '＋ Nouvelle fiche'}</button><span style="display:block;margin-top:9px" data-person-count>${personCountLabel(state.bootstrap.stats.personnes)} dans la base</span>`;
        content.addEventListener('click', event => {
            const tab = event.target.closest('[data-person-tab]');
            if (tab) { state.personTab = tab.dataset.personTab; renderSidebar(); loadPeople(); }
            const person = event.target.closest('[data-person-id]');
            if (person) selectPerson(Number(person.dataset.personId));
        },{signal:sidebarController.signal});
        const searchInput=$('#person-search');
        const runSearch=()=>{state.peopleQuery=searchInput.value;persistUiState();loadPeople();};
        searchInput.addEventListener('input',debounce(runSearch));
        searchInput.addEventListener('change',runSearch);
        searchInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runSearch();}});
        $('#person-search-button').addEventListener('click',runSearch);
        $('#person-phonetic').addEventListener('change',event=>{state.peoplePhonetic=event.target.checked;persistUiState();loadPeople();});
        $('#new-person').addEventListener('click', openNewPersonDialog);
    }

    async function loadPeopleAndPerson() {
        await loadPeople();
        // onglets « Personnes » et « Animaux » à part : on rouvre la dernière fiche de cet onglet
        const switched = state.scopeSwitch; state.scopeSwitch = false;
        if (switched && animalsTabOn() && state.currentPersonKind && (state.currentPersonKind === 'animal') !== (state.peopleScope === 'animals')) {
            const alt = state.peopleScope === 'animals' ? state.lastAnimalId : state.lastHumanId;
            if (state.peopleScope === 'animals' && !alt && !state.people.length && !state.peopleQuery && state.personTab !== 'bookmarked') { $('#workspace').innerHTML = `<section class="page">${empty('Aucun animal pour l’instant',{icon:'🐾',hint:'« + Nouvel animal » en bas de la colonne de gauche, ou Listes → Animaux de compagnie.'})}</section>`; return; }
            state.currentPersonId = Number(alt) || Number(state.people[0]?.id) || state.currentPersonId;
        }
        await selectPerson(state.currentPersonId, false);
    }

    // onglets de la liste : « Animaux » seulement s'il y a des animaux, « Personnes » seulement s'il y a des personnes
    function peopleTabs(){
        const h=Number(state.bootstrap?.stats?.personnes)||0,an=Number(state.bootstrap?.stats?.animaux)||0;
        if(animalsTabOn()){const tabs=state.peopleScope==='animals'?[['animals','🐾 Animaux'],['bookmarked','Signets']]:[['all','Personnes'],['bookmarked','Signets']];if(!tabs.some(t=>t[0]===state.personTab))state.personTab=tabs[0][0];return tabs;}
        const tabs=[...(h||!an?[['all',baseMode()==='both'&&an?'Tous':'Personnes']]:[]),...(an?[['animals','🐾 Animaux']]:[]),['bookmarked','Signets']];
        if(!tabs.some(t=>t[0]===state.personTab))state.personTab=tabs[0][0];
        return tabs;
    }
    let peopleSeq=0;
    async function loadPeople() {
        const seq=++peopleSeq; // une réponse lente d'une recherche plus ancienne ne remplace pas la liste
        // « Personnes » sans les animaux (sauf base « les deux » : tout), « Animaux » seulement eux ; base d'élevage : les animaux d'abord
        if (!animalsTabOn() && baseMode() === 'breeding' && state.personTab === 'all' && !loadPeople.modeSet && Number(state.bootstrap?.stats?.animaux)) { state.personTab = 'animals'; loadPeople.modeSet = true; }
        const kind = animalsTabOn() ? (state.peopleScope === 'animals' ? 'animal' : 'human') : state.personTab === 'animals' ? 'animal' : state.personTab === 'all' && baseMode() === 'family' && Number(state.bootstrap?.stats?.animaux) ? 'human' : '';
        const data = await api('people', {q:state.peopleQuery, limit:180, phonetic:state.peoplePhonetic?1:0, kind});
        if(seq!==peopleSeq)return;
        state.people = state.personTab === 'bookmarked' ? data.people.filter(person => Number(person.is_bookmarked)) : data.people;
        const list = $('#person-list');
        if (!list) return;
        list.innerHTML = state.people.length ? state.people.map(person => `
            <button class="person-list-item ${person.portrait?'has-thumb':''} ${Number(person.id) === state.currentPersonId ? 'is-active':''}" data-person-id="${person.id}">
                ${Number(person.outside_genealogy)?'<span class="outside-genealogy-mark" title="Hors généalogie"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>':''}${person.kind==='animal'?'<span class="animal-mark" title="Animal">🐾</span>':''}<span class="life-dot ${person.living_status}"></span>${person.portrait?`<img class="person-thumb" src="media/${encodeURIComponent(person.portrait)}" alt="">`:''}<span class="person-list-copy"><strong>${Number(person.is_bookmarked)?'<span class="bookmark-mark" title="En signet" aria-label="En signet"></span>':''}${escapeHtml(personName(person))}</strong><small>${escapeHtml(years(person))}</small></span>
            </button>`).join('') : empty('Aucune personne ne correspond à cette recherche.', {icon: '🔎', hint: 'Essaie une autre orthographe ou une partie du nom.'});
    }

    function getDesignEventDisplayMode(){try{const d=readDesignSettings();return d.eventDisplayMode||'all_mixed';}catch(_){return 'all_mixed';}}

    let personSeq=0;
    async function selectPerson(id, refreshList = true) {
        const changed=Number(id)!==Number(state.currentPersonId);
        state.currentPersonId = Number(id);
        if(state.module==='personnes'&&state.currentPersonId){
            const url=new URL(location.href);
            url.searchParams.set('person',String(state.currentPersonId));
            url.hash='personnes';
            history.replaceState(null,'',url);
        }
        if(changed)state.eventDisplayMode=getDesignEventDisplayMode();
        if(changed||refreshList)state.scrollPositions.personnes = {workspace:0,sidebar:$('#sidebar-content')?.scrollTop || 0};
        persistUiState();
        if (refreshList) $$('.person-list-item').forEach(item => item.classList.toggle('is-active', Number(item.dataset.personId) === state.currentPersonId));
        // La fiche, son dossier militaire et sa sépulture, en parallèle et pour CETTE personne : si on clique vite sur une
        // autre fiche, la réponse de la première est ignorée (sinon deux fiches se mélangeaient).
        const personId=state.currentPersonId,seq=++personSeq;
        let detail;
        try{detail=await api('person', {id:personId});}
        catch(error){
            if(seq!==personSeq)return;
            // Fiche supprimée (ici, dans une autre fenêtre, ou base restaurée) : on ouvre une autre fiche au lieu d'une page d'erreur
            const fallback=Number(state.people?.find(p=>Number(p.id)!==personId)?.id||state.bootstrap?.startPersonId||0);
            if(fallback&&fallback!==personId&&/introuvable/i.test(String(error.message||''))){toast('Cette fiche n’existe plus : une autre est affichée.');return selectPerson(fallback,refreshList);}
            throw error;
        }
        const [milResp,graveResp]=await Promise.all([api('military',{id:personId}).catch(()=>null),api('cemetery',{id:personId}).catch(()=>null)]);
        if(seq!==personSeq||state.currentPersonId!==personId)return;
        detail.militaryData=milResp?.data||{};
        detail.grave=graveResp?.grave||null;
        state.currentPerson = detail;
        rememberDashboardPerson(detail.person);
        if (state.module === 'personnes') renderPerson(detail);
    }

    function relationChips(label, type, people, status='unknown', locked=false) {
        const statusText=status==='none'?(type==='spouse'?'Pas de conjoint':'Pas d’enfant'):status==='none_suspected'?(type==='spouse'?'Pas de conjoint suspecté':'Pas d’enfant suspecté'):'Non renseigné';
        const addAction=locked?'':actionButton('add',`Ajouter : ${label}`,`data-add-relation="${type}"`);
        const removeAction=person=>locked?'':actionButton('delete',`Retirer ${personName(person)}`,`data-remove-relation="${type}" data-related-id="${person.id}"`);
        return `<div class="relation-group"><div class="relation-heading"><span>${label}</span>${addAction}</div><div class="relation-chips">${people.length ? people.map(person => `<div class="relation-entry"><button class="relation-chip" data-open-person="${person.id}"><strong>${escapeHtml(personName(person))}</strong><small>${relationYears(person)}</small></button>${removeAction(person)}</div>`).join('') : `<small class="relation-status ${status!=='unknown'?'is-confirmed':''}">${escapeHtml(statusText)}</small>`}</div></div>`;
    }

    function relationYears(person){const birth=person.birth_year||'?';const death=person.death_year||(person.living_status==='living'?'…':'?');return `${birth} — ${death}`;}

    function parsedGenealogyDate(text=''){const clean=String(text).trim().toLowerCase();let m=clean.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(m)return {exact:true,date:new Date(Date.UTC(+m[3],+m[2]-1,+m[1])),year:+m[3]};const months={janvier:0,février:1,fevrier:1,mars:2,avril:3,mai:4,juin:5,juillet:6,août:7,aout:7,septembre:8,octobre:9,novembre:10,décembre:11,decembre:11};m=clean.match(/^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/);if(m&&months[m[2]]!==undefined)return {exact:true,date:new Date(Date.UTC(+m[3],months[m[2]],+m[1])),year:+m[3]};m=clean.match(/(1[0-9]{3}|20[0-9]{2})/);return m?{exact:false,year:+m[1]}:null;}
    function eventAgeText(event,birthEvent){if(!birthEvent||event.id===birthEvent.id)return event.id===birthEvent?.id?'À la naissance':'';const birth=parsedGenealogyDate(birthEvent.date_text||birthEvent.year),target=parsedGenealogyDate(event.date_text||event.year);if(!birth||!target)return '';if(birth.exact&&target.exact&&target.date>=birth.date){let years=target.date.getUTCFullYear()-birth.date.getUTCFullYear(),months=target.date.getUTCMonth()-birth.date.getUTCMonth(),days=target.date.getUTCDate()-birth.date.getUTCDate();if(days<0){months--;days+=new Date(Date.UTC(target.date.getUTCFullYear(),target.date.getUTCMonth(),0)).getUTCDate();}if(months<0){years--;months+=12;}return `${years} an${years>1?'s':''} ${months} mois et ${days} jour${days>1?'s':''}`;}const years=(target.year||0)-(birth.year||0);return years>=0?`Environ ${years} an${years!==1?'s':''}`:'';}
    function eventConvertedDateHtml(event){
        const uncertain=Number(event?.date_uncertain)===1?'<small class="event-date-uncertain" title="Date incertaine (cochée dans « Modifier l’événement »)">? date incertaine</small>':'';
        return uncertain+eventCalendarEquivalentHtml(event);
    }
    function eventCalendarEquivalentHtml(event){
        const source=event?.date_calendar||'gregorian';
        const target=defaultCalendarSetting();
        if(source===target)return '';
        // recalculée à l'affichage : le calendrier par défaut a pu changer depuis l'enregistrement
        const converted=automaticEquivalentFromDateText(event?.date_text||'',source,target)||(String(event?.date_converted||'').startsWith(calendarLabel(target)+' :')?event.date_converted:'');
        return converted?`<small class="event-date-converted">${escapeHtml(converted)}</small>`:'';
    }

    function factConfidenceLabel(value){return ({certain:'Certain',deduced:'Déduit',estimated:'Estimé',doubt:'Doute'}[value]||'Non évalué');}
    function eventFactConfidenceHtml(event){const confidence=event?.fact_confidence||'unknown';if(confidence==='unknown'&&!event?.confidence_origin&&!event?.confidence_media_id)return '';return `<div class="event-fact-confidence is-${escapeHtml(confidence)}"><strong>Fiabilité : ${escapeHtml(factConfidenceLabel(confidence))}</strong>${event?.confidence_origin?`<span>${escapeHtml(event.confidence_origin)}</span>`:''}${event?.confidence_media_id?'<span class="event-fact-confidence-proof">Média de preuve lié</span>':''}</div>`;}

    function timelineDateLabel(text,year){return text&&String(text).trim()!==''?String(text).trim():String(year||'?');}
    function ageAtTimelineDate(person,dateText,yearFallback){const birthDate=parsedGenealogyDate(person.birth_date||person.birth_year),target=parsedGenealogyDate(dateText||yearFallback);if(!birthDate||!target)return '';if(birthDate.exact&&target.exact&&target.date>=birthDate.date){let years=target.date.getUTCFullYear()-birthDate.date.getUTCFullYear();const beforeBirthday=target.date.getUTCMonth()<birthDate.date.getUTCMonth()||(target.date.getUTCMonth()===birthDate.date.getUTCMonth()&&target.date.getUTCDate()<birthDate.date.getUTCDate());if(beforeBirthday)years--;return ` (${years} an${years!==1?'s':''})`;}const years=(target.year||0)-(birthDate.year||0);return years>=0?` (${years} an${years!==1?'s':''})`:'';}
    function timelineYearFraction(item){const parsed=parsedGenealogyDate(item.date||item.year);if(parsed?.exact)return parsed.date.getUTCFullYear()+(parsed.date.getUTCMonth()/12)+(parsed.date.getUTCDate()/365);return Number(item.year)||0;}
    function maternityGapKey(gap){return `${gap.from.personId||gap.from.year}-${gap.to.personId||gap.to.year}-${gap.from.year}-${gap.to.year}`;}
    function maternityGapStatuses(personId){try{return JSON.parse(localStorage.getItem(`genealogie-maternity-gaps-${personId}`)||'{}');}catch(_){return {};}}
    function saveMaternityGapStatus(personId,key,status){const statuses=maternityGapStatuses(personId);statuses[key]=status;localStorage.setItem(`genealogie-maternity-gaps-${personId}`,JSON.stringify(statuses));}
    function maternityGapStatusLabel(status){return ({not_verified:'Non vérifié',verified_empty:'Vérifié : aucun enfant vu',probably_empty:'Sûrement pas d’enfant, mais doute'}[status]||'Non vérifié');}
    function maternityTimeline(person,children,partners,events=[]){
        const birth=Number(person.birth_year)||0;
        const childRows=children.filter(child=>Number(child.birth_year)).map(child=>({type:'child',year:Number(child.birth_year),date:child.birth_date||String(child.birth_year),name:personName(child),personId:child.id}));
        const partnerDeaths=partners.filter(partner=>Number(partner.death_year)).map(partner=>({type:'partner-death',year:Number(partner.death_year),date:partner.death_date||String(partner.death_year),name:personName(partner)}));
        const marriages=events.filter(event=>event.gedcom_tag==='MARR'&&Number(event.year)).map(event=>({type:'marriage',year:Number(event.year),date:event.date_text||String(event.year),name:event.type_label||'Mariage'}));
        if(!birth)return card('09','Repères de maternité','',empty('Ajoute une année de naissance pour calculer cette frise.',{icon:'🕰️'}),'span-12');
        const death=Number(person.death_year)||0,lastKnown=Math.max(birth+55,...childRows.map(item=>item.year),...partnerDeaths.map(item=>item.year),...marriages.map(item=>item.year));
        const end=death?Math.max(death,birth+1):(person.living_status==='living'?Math.max(new Date().getFullYear(),lastKnown):Math.max(birth+60,lastKnown));
        const range=Math.max(1,end-birth),position=year=>Math.max(0,Math.min(100,(year-birth)/range*100));
        const ageAt=year=>Math.max(0,year-birth),ageLabel=year=>`${year} (${ageAt(year)} an${ageAt(year)!==1?'s':''})`;
        const timelineItems=[...childRows,...marriages,...partnerDeaths].sort((a,b)=>timelineYearFraction(a)-timelineYearFraction(b));
        const markerLabel=item=>`${item.type==='partner-death'?'† ':item.type==='marriage'?'⚭ ':''}${timelineDateLabel(item.date,item.year)}${ageAtTimelineDate(person,item.date,item.year)}`;
        const markerTitle=item=>`${item.type==='child'?`Naissance de ${item.name}`:item.type==='marriage'?'Mariage':`Décès de ${item.name}`} · ${markerLabel(item)}`;
        const markers=timelineItems.map((item,index)=>{const left=position(item.year),row=index%4,labelBottom=92+(row*25),leaderHeight=Math.max(12,labelBottom-46);if(item.type==='child'&&item.personId)return `<button class="maternity-marker ${item.type}" style="left:${left}%" data-open-person="${item.personId}" title="${escapeHtml(markerTitle(item))}"></button><span class="maternity-label ${item.type}" style="left:${left}%;--label-bottom:${labelBottom}px;--leader-height:${leaderHeight}px"><span>${escapeHtml(markerLabel(item))}</span></span>`;return `<span class="maternity-marker ${item.type}" style="left:${left}%" title="${escapeHtml(markerTitle(item))}"></span><span class="maternity-label ${item.type}" style="left:${left}%;--label-bottom:${labelBottom}px;--leader-height:${leaderHeight}px"><span>${escapeHtml(markerLabel(item))}</span></span>`;}).join('');
        const sortedChildren=[...childRows].sort((a,b)=>timelineYearFraction(a)-timelineYearFraction(b));
        const childGaps=sortedChildren.slice(1).map((item,index)=>{const previous=sortedChildren[index],gap=timelineYearFraction(item)-timelineYearFraction(previous);return gap>.75?{from:previous,to:item,years:gap}:null;}).filter(Boolean);
        const gapStatuses=maternityGapStatuses(person.id);
        const gapBands=childGaps.map(gap=>{const key=maternityGapKey(gap),status=gapStatuses[key]||'not_verified',start=position(timelineYearFraction(gap.from)),endPosition=position(timelineYearFraction(gap.to)),width=Math.max(1,endPosition-start);return `<button class="maternity-gap-band ${status}" style="left:${start}%;width:${width}%" data-gap-jump="${escapeHtml(key)}" title="${escapeHtml(`Intervalle ${timelineDateLabel(gap.from.date,gap.from.year)} → ${timelineDateLabel(gap.to.date,gap.to.year)} · ${maternityGapStatusLabel(status)}`)}"></button>`;}).join('');
        const gapNotes=childGaps.length?`<div class="maternity-gaps">${childGaps.map(gap=>{const key=maternityGapKey(gap),status=gapStatuses[key]||'not_verified';return `<article class="maternity-gap ${status}" data-maternity-gap-key="${escapeHtml(key)}"><span>Intervalle ${timelineDateLabel(gap.from.date,gap.from.year)} → ${timelineDateLabel(gap.to.date,gap.to.year)} : ${gap.years>=1?`${gap.years.toFixed(1).replace('.',',')} ${gap.years<2?'an':'ans'}`:'plus de 9 mois'} — enfant manquant possible.</span><label>État <select data-maternity-gap-status="${escapeHtml(key)}" data-person-id="${person.id}"><option value="not_verified" ${status==='not_verified'?'selected':''}>Non vérifié</option><option value="verified_empty" ${status==='verified_empty'?'selected':''}>Vérifié : aucun enfant vu</option><option value="probably_empty" ${status==='probably_empty'?'selected':''}>Sûrement pas d’enfant, mais doute</option></select></label></article>`;}).join('')}</div>`:'';
        const endText=death?`Fin de vie : ${ageLabel(end)}`:`Fin estimée : ${ageLabel(end)}`;
        return card('09','Repères de maternité','',`<div class="maternity-timeline"><div class="maternity-controls"><label><input type="checkbox" data-maternity-toggle="child" checked> Enfants</label><label><input type="checkbox" data-maternity-toggle="marriage" checked> Mariages</label><label><input type="checkbox" data-maternity-toggle="partner-death" checked> Décès d’un conjoint</label><label><input type="checkbox" data-maternity-toggle="gap" checked> Intervalles possibles</label></div><div class="maternity-note">Repère documentaire : zone féconde indicative 12–55 ans. Grossesse estimée : 9 mois avant chaque naissance. ${death?'La frise s’arrête au décès.':'Sans décès connu, la frise s’arrête à la dernière borne utile.'}</div><div class="maternity-axis"><span class="maternity-block before" style="width:${position(birth+12)}%">avant 12 ans</span><span class="maternity-block after" style="left:${position(birth+55)}%;width:${Math.max(0,100-position(birth+55))}%">après 55 ans</span>${gapBands}${markers}</div><div class="maternity-years"><span>${timelineDateLabel(person.birth_date,birth)} (0 ans)</span><span>${endText}</span></div><div class="maternity-legend"><span><i class="child"></i> Naissance d’un enfant</span><span><i class="marriage"></i> Mariage</span><span><i class="death"></i> Décès d’un conjoint</span><span><i class="gap"></i> Enfant possible entre deux naissances</span></div>${gapNotes}</div>`,'span-12');
    }

    function csvIds(value){return String(value||'').split(',').map(Number).filter(Boolean);}
    function mediaForEvent(media,eventId){return media.filter(item=>csvIds(item.event_ids).includes(Number(eventId)));}
    function eventConfidenceMediaPeople(item){return (item.people_links||item.people||[]).map(person=>person.name||person.person_name).filter(Boolean);}
    function eventConfidenceMediaLabel(item){return [item.title||item.document_title||item.filename||item.attachment_label,item.document_reference,item.date_text,eventConfidenceMediaPeople(item).join(', ')].filter(Boolean).join(' · ')||`Média #${item.id}`;}
    /** Média de preuve du fait : menu de choix unique (champ confidence_media_id) ; un média de la fiche est montré sans relecture. */
    function renderEventConfidenceMediaChoices(detail,selectedId=0){const field=$('#event-confidence-media');if(!field)return;const selected=Number(selectedId)||0;const media=(detail?.media||[]).find(item=>Number(item.id)===selected);pkSet(field,selected?(media?{id:selected,kind:'media',title:eventConfidenceMediaLabel(media),thumb:normalizedMediaType(media)==='image'?`media/${encodeURIComponent(media.thumbnail||media.filename)}`:''}:selected):null);}
    function eventConfidenceOriginQuery(input){const caret=input.selectionStart??input.value.length,before=input.value.slice(0,caret),segment=before.slice(Math.max(0,...['.',',',';',':','('].map(mark=>before.lastIndexOf(mark)+1))).trim();const words=segment.split(/\s+/).filter(Boolean);const clean=words=>words.join(' ').replace(/^(?:de|du|des|d['’]|chez|avec|pour|par)\s+/i,'').trim();const primary=clean(words.slice(-2)),fallback=clean(words.slice(-1));const query=primary.length>=2?primary:fallback;const start=query?before.lastIndexOf(query):caret;return {query,start:start<0?caret:start,end:caret,fallback:fallback!==query&&fallback.length>=2?fallback:''};}
    function setupEventConfidencePickers(detail){
        const origin=$('#event-confidence-origin'),personSuggestions=$('#event-confidence-person-suggestions');// le média de preuve : menu de choix unique (renderEventConfidenceMediaChoices)
        if(origin&&personSuggestions){
            let candidates=[],range={start:0,end:0};
            const findPeople=async query=>{const response=await api('people',{q:query,limit:8});return response.people||[];};
            origin.oninput=debounce(async()=>{const parsed=eventConfidenceOriginQuery(origin);if(parsed.query.length<2){personSuggestions.hidden=true;personSuggestions.innerHTML='';return;}try{let people=await findPeople(parsed.query),usedQuery=parsed.query;if(!people.length&&parsed.fallback){people=await findPeople(parsed.fallback);usedQuery=parsed.fallback;}range={start:Math.max(0,(origin.selectionStart??origin.value.length)-usedQuery.length),end:origin.selectionStart??origin.value.length};candidates=people;personSuggestions.innerHTML=people.map(person=>`<button type="button" class="place-suggestion" data-confidence-person-id="${person.id}">${escapeHtml(personName(person))}<small>${escapeHtml(years(person))}</small></button>`).join('')||'<div class="place-no-result">Aucun nom trouvé</div>';personSuggestions.hidden=false;}catch(_){personSuggestions.hidden=true;}},180);
            personSuggestions.onclick=event=>{const button=event.target.closest('[data-confidence-person-id]');if(!button)return;const person=candidates.find(row=>Number(row.id)===Number(button.dataset.confidencePersonId));if(!person)return;const name=personName(person),before=origin.value.slice(0,range.start),after=origin.value.slice(range.end);origin.value=before+name+after;const cursor=(before+name).length;origin.focus();origin.setSelectionRange(cursor,cursor);personSuggestions.hidden=true;personSuggestions.innerHTML='';};
        }
    }
    function mediaForCensus(media,censusId){return media.filter(item=>csvIds(item.census_ids).includes(Number(censusId)));}
    function mediaForMilitary(media,personId){return media.filter(item=>csvIds(item.military_ids).includes(Number(personId)));}
    function mediaForGrave(media,graveId){return media.filter(item=>csvIds(item.grave_ids).includes(Number(graveId)));}
    function censusStatusText(status){return ({todo:'À chercher',found:'Trouvé',not_found:'Non trouvé',not_born:'Pas encore né',not_in_france:'Pas encore en France',not_france:'Pas en France',left_france:'Plus en France',dead:'Déjà décédé'}[status]||'À chercher');}
    function expectedCensusFields(year){return Number(year)>=1896?['Nom','Prénoms','Profession','Employeur / entreprise','Année de naissance','Ville de naissance','Adresse','Position dans le ménage','Nationalité','Rubriques supplémentaires']:['Nom','Prénoms','Profession','Employeur / entreprise','Âge','Ville de naissance','Adresse','Situation personnelle','Nationalité','Rubriques supplémentaires'];}
    function censusDefaultStatus(year,person){const birth=Number(person.birth_year)||0,death=Number(person.death_year)||0;if(birth&&year<birth)return 'not_born';if(death&&year>death)return 'dead';return 'todo';}
    function censusDetailsPreference(personId){
        const personKey=`genealogie-census-details-${personId}`;
        const localValue=localStorage.getItem(personKey);
        if(localValue==='expanded'||localValue==='collapsed')return {value:localValue,custom:true};
        let design={};
        try{design=readDesignSettings();}catch(_){design={};}
        return {value:design.censusDetailsDefault==='expanded'?'expanded':'collapsed',custom:false};
    }
    function setCensusDetailsPreference(personId,value){localStorage.setItem(`genealogie-census-details-${personId}`,value==='expanded'?'expanded':'collapsed');}
    function resetCensusDetailsPreference(personId){localStorage.removeItem(`genealogie-census-details-${personId}`);}
    function renderCensusCard(person,census={},allMedia=[],locked=false){
        const official=census.official_years||[],records=census.records||[];
        const officialRecords=records.filter(item=>Number(item.is_special||0)!==1);
        const specialRecords=records.filter(item=>Number(item.is_special||0)===1);
        const byYear=new Map(officialRecords.map(item=>[Number(item.year),item]));
        const birth=Number(person.birth_year)||0,death=Number(person.death_year)||0;
        const years=official.filter(year=>(!birth||year>=birth-1)&&(!death||year<=death+1));
        const visibleYears=years.length?years:official;
        const editAttrs=(year,record)=>locked?'':`data-edit-census-year="${year}" data-census-id="${record?.id||''}"`;
        let design={};try{design=readDesignSettings();}catch(_){design={};}
        const specialOrder=design.censusSpecialOrder==='chronological'?'chronological':'official_first';
        const officialTiles=visibleYears.map(year=>({year,special:false,record:byYear.get(year),html:''})).map(item=>{const status=item.record?.status||censusDefaultStatus(item.year,person),mediaCount=item.record?.media?.length||mediaForCensus(allMedia,item.record?.id).length;item.html=`<button class="census-year ${status}" ${editAttrs(item.year,item.record)} title="${escapeHtml(censusStatusText(status))}"><strong>${item.year}</strong><span>${escapeHtml(censusStatusText(status))}</span>${mediaCount?`<em>${mediaCount} média</em>`:''}</button>`;return item;});
        const specialTiles=specialRecords.map(record=>{const year=Number(record.year),status=record.status||'todo',mediaCount=record.media?.length||mediaForCensus(allMedia,record.id).length;return {year,special:true,record,html:`<div class="census-year-special-wrap"><button class="census-year ${status} special" ${locked?'':`data-edit-census="${record.id}"`} title="Recensement spécial · ${escapeHtml(censusStatusText(status))}"><strong>${year}<b class="census-special-mark" aria-label="Recensement spécial">✦</b></strong><span>${escapeHtml(censusStatusText(status))}</span>${mediaCount?`<em>${mediaCount} média</em>`:''}</button>${locked?'':actionButton('delete','Supprimer ce recensement spécial',`data-delete-census="${record.id}"`)}</div>`};});
        const yearButtons=(specialOrder==='chronological'?[...officialTiles,...specialTiles].sort((a,b)=>a.year-b.year||(a.special?1:0)-(b.special?1:0)):officialTiles.concat(specialTiles)).map(item=>item.html).join('');
        const specialAdd=locked?'':`<div class="census-special-add"><button class="button small secondary" type="button" data-add-special-census="${person.id}">+ Recensement spécial</button></div>`;
        const detailsPref=censusDetailsPreference(person.id),detailsExpanded=detailsPref.value==='expanded';
        const detailToggle=records.length?`<div class="census-details-toolbar"><button class="button small secondary" type="button" data-toggle-census-details="${person.id}" data-census-details-value="${detailsExpanded?'collapsed':'expanded'}">${detailsExpanded?'Masquer les détails':'Afficher les détails'}</button>${detailsPref.custom?`<button class="button small secondary" type="button" data-reset-census-details="${person.id}">Revenir au réglage global</button>`:''}</div>`:'';
        const recordList=records.map(record=>{const recordMedia=record.media?.length?record.media:mediaForCensus(allMedia,record.id);const recordActions=locked?`${recordMedia.length?actionButton('media','Voir les médias',`data-view-census-media="${record.id}"`):''}`:`${actionButton('media','Gérer les médias',`data-manage-census-media="${record.id}"`)}${actionButton('edit','Modifier',`data-edit-census="${record.id}"`)}${actionButton('delete','Supprimer ce recensement',`data-delete-census="${record.id}"`)}`;return `<article class="census-record ${record.status}">
            <div class="item-title-row"><strong>${record.year} · ${escapeHtml(censusStatusText(record.status))}</strong><span class="item-title-extra">${entityLabelsInline('census',record.id,record.labels,true)}<span class="inline-actions">${recordActions}</span></span></div>
            <p>${escapeHtml([record.address,placeDisplay(record)].filter(Boolean).join(' — ')||'Lieu/adresse à préciser')}</p>
            <small>Champs attendus (${record.year}) : ${(record.expected_fields||expectedCensusFields(record.year)).map(escapeHtml).join(', ')}</small>
            ${recordMedia.length?`<div class="census-media-strip">${recordMedia.slice(0,8).map((item,index)=>`<button data-view-census-media="${record.id}" title="${escapeHtml(item.title||item.filename)}">${normalizedMediaType(item)==='image'?`<img src="media/${encodeURIComponent(item.thumbnail||item.filename)}" alt="">`:`<span class="pdf-pill">${mediaTypeShortLabelWithIcon(item)}</span>`}</button>`).join('')}${recordMedia.length>8?`<small>+ ${recordMedia.length-8}</small>`:''}</div>`:''}
            ${recordMedia.some(mediaDocumentSummary)?`<div class="census-document-refs">${recordMedia.filter(mediaDocumentSummary).map(item=>`<span>${mediaDocumentLink(item)}</span>`).join('')}</div>`:''}
            <div class="census-household">${(record.members||[]).map(member=>{const dates=member.person_id&&member.birth_year?(member.death_year?`${member.birth_year} — ${member.death_year}`:`${member.birth_year} — ?`):'';return `<span class="census-household-member">${member.person_id?`<button class="table-link" data-open-person="${member.person_id}">${escapeHtml(member.person_name||member.display_name)}</button>`:escapeHtml(member.display_name||'Personne non liée')}${dates?` <small class="census-member-dates">(${escapeHtml(dates)})</small>`:''}${member.household_position?` · ${escapeHtml(member.household_position)}`:''}${member.occupation?` · ${escapeHtml(member.occupation)}`:''}${member.employer?` · <button type="button" class="table-link" data-employer-open="${escapeHtml(member.employer)}" title="Fiche de l’employeur">🏢 ${escapeHtml(member.employer)}</button>`:''}${member.birth_place?` · né(e) à ${escapeHtml(member.birth_place)}`:''}${locked?'':`<span class="inline-actions">${actionButton('edit','Modifier ce membre',`data-edit-census-member="${member.id}"`)}${actionButton('delete','Retirer du foyer',`data-delete-census-member="${member.id}"`)}</span>`}</span>`;}).join('')}</div>
            ${locked?'':`<button class="button small secondary" data-add-census-member="${record.id}">+ Membre du foyer</button>`}
        </article>`;}).join('');
        return card('08','Recensements',records.length,`<div class="census-intro">Les années grisées sont probablement impossibles d’après naissance/décès. 1916 et 1941 ne sont pas proposés car les recensements généraux n’ont pas eu lieu.</div><div class="census-years">${yearButtons}</div>${specialAdd}${detailToggle}${recordList&&detailsExpanded?`<div class="census-records">${recordList}</div>`:''}`,'span-12');
    }
    const vagueCountryNames=new Set('allemagne,angleterre,belgique,canada,espagne,etats-unis,etats unis,france,irlande,italie,luxembourg,pays-bas,pays bas,pologne,royaume-uni,royaume uni,suisse'.split(','));
    function normalizePlaceText(value=''){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,' ').replace(/\s+/g,' ');}
    function eventHasCoordinates(event){const lat=Number(event.latitude),lng=Number(event.longitude);return Number.isFinite(lat)&&Number.isFinite(lng)&&(lat!==0||lng!==0)&&lat>=-85&&lat<=85&&lng>=-180&&lng<=180;}
    function placeParts(item){return [item.place_name||item.name||item.place,item.subdivision,item.county,item.state,item.country].filter(Boolean);}
    function placeDisplay(item){return placeParts(item).join(', ');}
    function eventPlaceLabel(event){return placeDisplay(event)||'Lieu sans nom';}
    function isVagueEventPlace(event){
        const name=normalizePlaceText(event.place_name);
        const country=normalizePlaceText(event.country);
        const county=normalizePlaceText(event.county);
        const state=normalizePlaceText(event.state);
        if(!name)return true;
        if(['lieu sans nom','sans lieu','lieu inconnu','inconnu','unknown','pays inconnu'].includes(name))return true;
        if(!county&&!state&&(name===country||vagueCountryNames.has(name)))return true;
        return false;
    }
    function isPlottableEventPlace(event){return eventHasCoordinates(event)&&!isVagueEventPlace(event);}
    function personMapListHtml(groups){
        return groups.map(group=>{
            const plottable=group.latitude!==null&&group.longitude!==null;
            const attrs=plottable?`data-person-map-lat="${group.latitude}" data-person-map-lon="${group.longitude}"`:'';
            const hint=plottable?'':`<small class="person-map-hint">Lieu trop vague pour être placé sur la carte</small>`;
            const yearAttr=group.minYear!==Infinity?` data-place-year="${group.minYear}"`:'';
            return `<button type="button" class="${plottable?'':'is-muted'}" ${attrs} data-person-map-place="${escapeHtml(group.place)}"${yearAttr}><strong>${escapeHtml(group.place||'Lieu sans nom')}</strong><small>${group.events.length} événement${group.events.length>1?'s':''}</small>${hint}<span class="person-map-event-list">${group.events.map(event=>`<em>${escapeHtml(event.type_label)} · ${escapeHtml(event.date_text||event.year||'date inconnue')}</em>`).join('')}</span></button>`;
        }).join('');
    }
    function personEventMap(events){
        const allEvents=Array.isArray(events)?events:[];
        const geocoded=allEvents.filter(isPlottableEventPlace);
        const groupedList=Object.values(allEvents.reduce((acc,event)=>{
            const label=eventPlaceLabel(event);
            const key=event.place_id||label;
            const group=acc[key]??={place:label,events:[],latitude:null,longitude:null,minYear:Infinity};
            group.events.push(event);
            const yr=Number(event.year)||Number((event.date_text||'').match(/\d{4}/)?.[0])||Infinity;
            if(yr<group.minYear)group.minYear=yr;
            if(isPlottableEventPlace(event)&&group.latitude===null){
                group.latitude=Number(event.latitude);
                group.longitude=Number(event.longitude);
            }
            return acc;
        },{}));
        if(!geocoded.length)return `<div class="person-event-map"><div class="person-map-stage person-map-empty">${empty('Aucun lieu assez précis à afficher sur la carte.',{icon:'🗺️'})}</div><div class="person-map-list">${personMapListHtml(groupedList)}</div></div>`;
        const groups=Object.values(geocoded.reduce((acc,event)=>{
            const key=event.place_id||`${Number(event.latitude).toFixed(4)},${Number(event.longitude).toFixed(4)}`;
            const group=acc[key]??={latitude:Number(event.latitude),longitude:Number(event.longitude),place:eventPlaceLabel(event),events:[]};
            group.events.push(event);
            return acc;
        },{}));
        const width=1000,height=360,padding=80;
        let zoom=groups.length===1?11:7;
        for(let z=13;z>=3;z--){
            const xs=groups.map(group=>lngToX(group.longitude,z)),ys=groups.map(group=>latToY(group.latitude,z));
            const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys);
            if((groups.length===1||dx<=width-padding*2)&&dy<=height-padding*2){zoom=z;break;}
        }
        const xs=groups.map(group=>lngToX(group.longitude,zoom)),ys=groups.map(group=>latToY(group.latitude,zoom));
        const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
        const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2,left=centerX-width/2,top=centerY-height/2;
        const design=readDesignSettings(),mapBg=mapBackgroundValue(design.mapBackground);
        const world=Math.pow(2,zoom),tileMinX=Math.floor(left/256),tileMaxX=Math.ceil((left+width)/256),tileMinY=Math.floor(top/256),tileMaxY=Math.ceil((top+height)/256);
        let tiles='',tileCount=0;
        if(mapBg!=='grid'){
            for(let tx=tileMinX;tx<=tileMaxX;tx++){
                for(let ty=tileMinY;ty<=tileMaxY;ty++){
                    if(ty<0||ty>=world||tileCount>80)continue;
                    const wrapped=((tx%world)+world)%world;
                    tiles+=`<img class="person-map-tile" draggable="false" referrerpolicy="no-referrer" src="${mapTileUrl(mapBg,zoom,wrapped,ty)}" style="left:${((tx*256-left)/width)*100}%;top:${((ty*256-top)/height)*100}%;width:${(256/width)*100}%;height:${(256/height)*100}%" alt="">`;
                    tileCount++;
                }
            }
        }
        const markers=groups.map(group=>{const first=group.events[0],label=[group.place,...group.events.map(event=>`${event.type_label} ${event.date_text||event.year||''}`.trim())].filter(Boolean).join(' · '),px=Math.max(20,Math.min(width-20,lngToX(group.longitude,zoom)-left)),py=Math.max(20,Math.min(height-20,latToY(group.latitude,zoom)-top)),symbol=group.events.length>1?group.events.length:eventSymbol(first.gedcom_tag);return `<g class="person-map-point" tabindex="0" role="button" data-person-map-lat="${group.latitude}" data-person-map-lon="${group.longitude}" data-person-map-place="${escapeHtml(group.place)}" transform="translate(${px} ${py})" style="--event-color:${escapeHtml(first.color||'#0066cc')}"><title>${escapeHtml(label)}</title><rect x="-15" y="-15" width="30" height="30" transform="rotate(45)"/><text y="5">${escapeHtml(symbol)}</text></g>`;}).join('');
        return `<div class="person-event-map"><div class="person-map-stage map-bg-${escapeHtml(mapBg)}" role="img" aria-label="Carte des événements de la personne">${tiles}<svg viewBox="0 0 ${width} ${height}"><defs><pattern id="person-map-grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0v44" fill="none"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#person-map-grid)" class="person-map-grid"/>${markers}</svg></div><div class="person-map-footer"><div class="person-map-sort" role="group" aria-label="Ordre des lieux"><button type="button" class="person-map-sort-btn is-active" data-map-sort="chrono" title="Ordre chronologique" aria-pressed="true"><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 5.5V10l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg></button><button type="button" class="person-map-sort-btn" data-map-sort="alpha" title="Ordre alphabétique" aria-pressed="false"><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><text x="1" y="14" font-size="11" font-weight="800" font-family="Arial,sans-serif" fill="currentColor">A→Z</text></svg></button></div><div class="person-map-osm-credit">© contributeurs OpenStreetMap</div></div><div class="person-map-list">${personMapListHtml(groupedList)}</div></div>`;
    }
    function renderPersonBlocks(personId,renderers){
        const settings=personBlockSettings(personId);
        let visualIndex=1;
        return settings.order.map(key=>{
            if(settings.hidden.includes(key)||!renderers[key])return '';
            const index=String(visualIndex).padStart(2,'0');
            try{
                const block=renderers[key](index);
                if(block)visualIndex++;
                return applyBlockWidth(block?String(block).replace('<section class="card',`<section data-pblock="${escapeHtml(key)}" class="card`):block,settings.widths?.[key]); // data-pblock : pour ouvrir la fiche sur ce bloc
            }catch(error){
                console.error(`Erreur dans le bloc personne "${key}"`,error);
                visualIndex++;
                const label=defaultPersonBlocks.find(row=>row[0]===key)?.[1]||key;
                return applyBlockWidth(card(index,label,'',`<div class="empty-card">Ce bloc a été isolé car il provoquait une erreur : ${escapeHtml(error.message||'erreur JavaScript')}</div>`),settings.widths?.[key]);
            }
        }).join('');
    }
    function applyBlockWidth(html,width){return width?html.replace(/\bspan-(3|4|5|6|7|8|9|12)\b/,`span-${width}`):html;}

    function renderPerson(detail) {
        state.currentPersonKind = detail?.person?.kind === 'animal' ? 'animal' : 'human';
        if (detail?.person?.id) { if (state.currentPersonKind === 'animal') state.lastAnimalId = Number(detail.person.id); else state.lastHumanId = Number(detail.person.id); }
        syncPeopleScope(detail?.person);
        const {person, estimates={}, saint=null, family_objects:personObjects=[], family_memories:personMemories=[], events, parents, partners, families=[], children, siblings=[], variants, labels=[], notes, media, signatures=[], sources, investigations=[], battues=[], hypotheses=[], evidence=[], census={}, completion={score:0,items:[]}, biography='', onlineSheets=[]} = detail;
        const birthEvent=events.find(event=>event.gedcom_tag==='BIRT');
        const isLocked=Number(person.is_locked)===1;
        const editOnly=html=>isLocked?'':html;
        const orderedMedia = [...media].sort((a,b) => mediaChronologyKey(a) - mediaChronologyKey(b) || Number(a.link_position||0) - Number(b.link_position||0) || Number(a.id) - Number(b.id));
        const portrait = person.portrait ? `<img class="portrait" src="media/${encodeURIComponent(person.portrait)}" alt="Portrait de ${escapeHtml(personName(person))}">` : `<div class="portrait portrait-placeholder">${escapeHtml((person.first_name?.[0] || '') + (person.last_name?.[0] || ''))}</div>`;
        const parishes=detail.heritage?.parishes||{};
        // Avant 1790 (ou la date du rattachement), un hameau dépendait souvent de la paroisse d'à côté (Listes → Paroisses d'Ancien Régime)
        const parishText=event=>{const year=Number(event.year)||Number(String(event.date_text||'').match(/\b(1[0-9]{3})\b/)?.[1])||0;const p=(parishes[event.place_id]||[]).find(item=>!year||(year<item.until&&(!item.from||year>=item.from)));return p&&(!year||year<p.until)?` · ⛪ avant ${p.until}, chercher dans les registres de la paroisse de ${p.parish}`:'';};
        const placeText = event => {const current=[event.place_name,event.county,event.state,event.country].filter(Boolean).join(', ');const addr=event.address||'';const former=[event.former_place_name,event.former_country].filter(Boolean).join(', ');const base=[current,addr].filter(Boolean).join(' · ');return (former?`${base}${base?' ':''}(anciennement : ${former})`:base)+(base?parishText(event):'');};
        const eventSources=eventId=>sources.filter(source=>source.entity_type==='event'&&Number(source.entity_id)===Number(eventId));
        const eventSourcesHtml=event=>{const rows=eventSources(event.id);return rows.length?`<div class="event-source-list">${rows.map(source=>sourceItemHtml(source,events,isLocked)).join('')}</div>`:'';};
        const blockSettings=personBlockSettings(person.id);
        const evtFilter=eventsFilterSettings(person.id);
        const animalIdentity=person.kind==='animal'?window.LCNDA_EXT?.animalIdentityHtml?.(detail):'';
        const identityRows=animalIdentity||(person.kind==='animal'?[ // un animal : ses mots à lui (le reste est dans « Caractéristiques de l'animal »)
            ['Nom',person.first_name],['Autres noms',person.middle_name],['Affixe',person.last_name],['Sexe',person.gender==='male'?'♂ mâle':person.gender==='female'?'♀ femelle':'?'],['Statut',{living:'En vie',deceased:'Mort(e)'}[person.living_status]||'À vérifier'],['Mode vérification',person.verify_status==='verify'?'À vérifier':'Normal'],['Rôle / travail',person.occupation],['Taille',person.height_text],['Description',person.physical_description],['Yeux',person.eye_color],['Référence',person.reference_number]
        ].filter(([,v],i)=>v||i<5) : [
            ['Prénom',person.first_name],['Autres prénoms',person.middle_name],['Nom inscrit',person.last_name],['Titre / préfixe',[person.prefix,person.suffix].filter(Boolean).join(' ')],['Genre',genderText(person.gender)],['Statut',lifeText(person.living_status)],['Mode vérification',person.verify_status==='verify'?'À vérifier':'Normal'],['Métier / activité',person.occupation],['Taille',person.height_text],['Description physique',person.physical_description],['Yeux',person.eye_color],['Peau',person.skin_color],['Nationalité',person.nationality],['Origine / mention',person.ethnicity],...( person.mort_pour_la_france==='yes'?[['Mort Pour La France','Oui']]:[] ),['Référence',person.reference_number]
        ]).map(([label,value])=>identityDataRow(label,value,blockSettings)).join('');
        const personBlockRenderers={
            identity:index=>card(index,'Identité','',`<dl class="data-list">${identityRows}</dl>${personSaintHtml(saint)}${dateEstimatesHtml(estimates,person)}${identityVariantsHtml(events,census,person,orderedMedia,blockSettings)}${person.surname_group?`<div class="identity-variants identity-surname"><dl class="data-list">${dataRow('Famille / groupe',person.surname_group)}</dl></div>`:''}${onlineSheetsHtml(onlineSheets,person.id,isLocked)}<div class="identity-labels">${entityLabelsField('person',person.id,labels,isLocked)}</div>${person.kind==='animal'?identityEmptyBar(person.id,blockSettings):''}`,'span-4',editOnly(`${actionButton('edit','Modifier l’identité',`data-edit-person-inline="${person.id}"`)}`)),
            events:index=>{
                const witnessEvs=detail.witnessEvents||[];
                const mode=state.eventDisplayMode||'all_mixed';
                const showWitness=mode==='all_mixed'||mode==='all_bottom'||mode==='witness_only';
                const showOwn=mode!=='witness_only';
                const renderOwnEvent=event=>`<div class="event-row"><span class="event-icon" style="--event-color:${escapeHtml(event.color)}">${typeGlyph(event.icon,event.gedcom_tag)}</span><div class="event-date">${escapeHtml(event.date_text || 'Date inconnue')}${eventConvertedDateHtml(event)}<small>${escapeHtml(eventAgeText(event,birthEvent))}</small></div><div class="event-content"><div class="item-title-row"><strong>${escapeHtml(event.type_label)}</strong><span class="item-title-extra"><span class="inline-actions">${mediaForEvent(orderedMedia,event.id).length?actionButton('media','Voir les médias liés',`data-view-event-media="${event.id}"`):''}${editOnly(`${actionButton('source',`Source${eventSources(event.id).length?` (${eventSources(event.id).length})`:''}`,`data-add-event-source="${event.id}"`)}${actionButton('edit','Modifier',`data-edit-event="${event.id}"`)}${actionButton('delete','Supprimer',`data-delete-event="${event.id}"`)}`)}</span></span></div>${placeText(event) ? `<p>${escapeHtml(placeText(event))}</p>`:''}${event.title || event.description ? `<p>${escapeHtml(event.title || event.description)}</p>`:''}${eventFactConfidenceHtml(event)}${eventSourcesHtml(event)}${(event.witnesses&&event.witnesses.length)?`<div class="event-witnesses"><span>Témoins</span><div class="event-witnesses-names">${event.witnesses.map(w=>`<span class="event-witness"><button type="button" class="witness-owner-link" data-open-person="${w.person_id}"><strong>${escapeHtml([w.first_name,w.last_name].filter(Boolean).join(' '))}</strong></button>${w.note?` — ${escapeHtml(w.note)}`:''}</span>`).join('')}</div></div>`:''}</div></div>`;
                const renderWitnessEvent=ev=>`<div class="event-row event-row-witness"><span class="event-icon-witness" style="--event-color:${escapeHtml(ev.color)}">${typeGlyph(ev.icon,ev.gedcom_tag)}</span><div class="event-date">${escapeHtml(ev.date_text||'Date inconnue')}${eventConvertedDateHtml(ev)}</div><div class="event-content"><div class="item-title-row"><strong><button type="button" class="witness-owner-link" data-open-person="${ev.person_id}">${escapeHtml(ev.owner_name||'Personne')}</button> — ${escapeHtml(ev.type_label)}</strong></div>${placeText(ev)?`<p>${escapeHtml(placeText(ev))}</p>`:''}${ev.witness_note?`<p class="witness-role">${escapeHtml(ev.witness_note)}</p>`:''}</div></div>`;
                // Convertit les recensements trouvés en événements virtuels si l'option est active
                const showCensusInEvents=evtFilter.showCensus;const artistDisplay=person.artist_events_display||'events';const artisticTypeIds=new Set((state.bootstrap?.eventTypes||[]).filter(t=>Number(t.is_artistic)).map(t=>Number(t.id)));const filteredEvents=events.filter(e=>!evtFilter.hiddenTypeIds.includes(Number(e.event_type_id))&&(artistDisplay!=='block'||!artisticTypeIds.has(Number(e.event_type_id))));
                const censusRecords=census?.records||[];
                const censusFakeColor='#7c5c2e';
                const renderCensusEvent=record=>`<div class="event-row event-row-census"><span class="event-icon" style="--event-color:${escapeHtml(censusFakeColor)}">📋</span><div class="event-date">${escapeHtml(record.date_text||(record.year?String(record.year):'Date inconnue'))}<small>${escapeHtml(eventAgeText({id:record.id,date_text:record.date_text,year:record.year},birthEvent))}</small></div><div class="event-content"><div class="item-title-row"><strong>Recensement ${escapeHtml(String(record.year||''))}</strong><span class="item-title-extra"><span class="census-event-badge">recensement</span>${editOnly(`<span class="inline-actions">${actionButton('edit','Modifier ce recensement',`data-edit-census="${record.id}"`)}</span>`)}</span></div>${record.place_name?`<p>${escapeHtml(placeDisplay(record))}</p>`:record.country?`<p>${escapeHtml(record.country)}</p>`:''}<p>${escapeHtml(censusStatusText(record.status))}${record.address?` — ${escapeHtml(record.address)}`:''}</p>${record.occupation||record.household_position?`<p>${[record.occupation,record.household_position].filter(Boolean).map(escapeHtml).join(' · ')}</p>`:''}</div></div>`;
                let allMixed='',ownPart='',witnessPart='';
                if(mode==='all_mixed'){
                    const eventSortKey=e=>{const p=parsedGenealogyDate(e.date_text||e.year);if(p?.exact)return p.date.getTime();return((p?.year||9999)-1970)*365.25*86400000+(e.gedcom_tag==='BIRT'?0:1e9);};const censusItems=showCensusInEvents?censusRecords.filter(r=>r.status==='found').map(r=>({...r,_isCensus:true,date_text:r.date_text||(r.year?String(r.year):'')})):[];const combined=[...filteredEvents.map(e=>({...e,_isWitness:false,_isCensus:false})),...witnessEvs.map(e=>({...e,_isWitness:true,_isCensus:false})),...censusItems].sort((a,b)=>eventSortKey(a)-eventSortKey(b)||(Number(a.id)-Number(b.id)));
                    allMixed=combined.map(e=>e._isCensus?renderCensusEvent(e):e._isWitness?renderWitnessEvent(e):renderOwnEvent(e)).join('');
                }else if(mode==='all_bottom'){
                    ownPart=filteredEvents.map(renderOwnEvent).join('');
                    if(showCensusInEvents&&censusRecords.filter(r=>r.status==='found').length){const sep=ownPart?`<div class="witness-events-separator"><span>Recensements</span></div>`:'';ownPart+=sep+censusRecords.filter(r=>r.status==='found').sort((a,b)=>Number(a.year)-Number(b.year)).map(renderCensusEvent).join('');}
                    if(witnessEvs.length)witnessPart=`<div class="witness-events-separator"><span>Témoin</span></div>${witnessEvs.map(renderWitnessEvent).join('')}`;
                }else if(mode==='witness_only'){
                    ownPart=witnessEvs.map(renderWitnessEvent).join('');
                }else{
                    ownPart=filteredEvents.map(renderOwnEvent).join('');
                    if(showCensusInEvents&&censusRecords.filter(r=>r.status==='found').length){ownPart+=censusRecords.filter(r=>r.status==='found').sort((a,b)=>Number(a.year)-Number(b.year)).map(renderCensusEvent).join('');}
                }
                const body=(mode==='all_mixed'?allMixed:(ownPart+witnessPart))||'';
                const censusFoundCount=showCensusInEvents?censusRecords.filter(r=>r.status==='found').length:0;
                const totalCount=showOwn&&showWitness?filteredEvents.length+witnessEvs.length+censusFoundCount:showWitness?witnessEvs.length:filteredEvents.length+censusFoundCount;
                const displaySelect=`<label class="media-filter-label">Afficher <select id="event-display-mode"><option value="all_mixed" ${mode==='all_mixed'?'selected':''}>Tous (mélangés)</option><option value="all_bottom" ${mode==='all_bottom'?'selected':''}>Tous (séparés)</option><option value="own_only" ${mode==='own_only'?'selected':''}>Mes événements</option><option value="witness_only" ${mode==='witness_only'?'selected':''}>Comme témoin</option></select></label>`;
                return card(index,'Événements',events.length,body?`<div class="event-list">${body}</div>`:empty('Aucun événement pour l’instant',{icon:'📅',hint:'Naissance, baptême, mariage, décès… tout ce qui date une vie.',action:isLocked?null:{label:'＋ Ajouter un événement',attrs:`data-add-event-inline="${person.id}"`}}),'span-8',`${displaySelect}${editOnly(actionButton('add','Ajouter un événement',`data-add-event-inline="${person.id}"`))}${editOnly(families.length?actionButton('family','Ajouter un événement de famille',`data-add-family-event-inline="${person.id}"`):'')}`);
            },
            media:index=>{const displayMedia=sortMediaForDisplay(orderedMedia,person.id);const directPortraits=displayMedia.filter(item=>Number(item.direct_person_link)===1&&Number(item.other_context_link_count||0)===0).sort((a,b)=>Number(a.direct_person_position||0)-Number(b.direct_person_position||0)||Number(a.id)-Number(b.id));const portraitIds=new Set(directPortraits.map(item=>Number(item.id)));const otherMedia=displayMedia.filter(item=>!portraitIds.has(Number(item.id)));const mediaCard=item=>`<article class="media-card-item" data-media-card-id="${item.id}"><button class="media-item media-card-preview" draggable="false" data-media-id="${item.id}" data-media-index="${orderedMedia.indexOf(item)}" data-media-types="${escapeHtml(mediaFilterValue(item))}">${mediaPreviewHtml(item,item.title || 'Document généalogique')}<span>${escapeHtml(item.attachment_label || item.title || 'Document')}</span></button><div class="media-card-labels">${entityLabelsInline('media',item.id,item.labels,true)}</div></article>`;const portraits=directPortraits.length?`<section class="person-portraits"><div class="person-portraits-head"><div><strong>Médias de la fiche</strong><small>Rattachés uniquement à cette personne, dont les portraits.</small></div>${editOnly(`<button type="button" class="icon-action media-order-lock is-unlocked" id="portrait-order-lock" data-locked="0" aria-label="Verrouiller le réordonnancement des médias de la fiche" title="Verrouiller le réordonnancement des médias de la fiche"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.3-2.2M12 14v3"/></svg></button>`)}</div><div class="media-grid media-card-grid drag-unlocked" id="person-portrait-grid">${directPortraits.map(mediaCard).join('')}</div></section>`:'';const body=displayMedia.length?`${portraits}${otherMedia.length?`<div class="media-grid media-card-grid" id="person-media-grid">${otherMedia.map(mediaCard).join('')}</div>`:''}`:empty('Aucune photographie ou reproduction d’acte.',{icon:'🖼️'});return card(index,'Médias',displayMedia.length,body,'span-12',`${mediaFilterSelect(displayMedia)}${editOnly(mediaSortControlsHtml(person.id))}${editOnly(actionButton('add','Ajouter des médias',`data-add-media-inline="${person.id}"`))}`);},
            correspondance:index=>{
                const correspondenceItems=correspondenceMediaOnly(orderedMedia);
                return card(index,'Correspondance',correspondenceItems.length,correspondenceItems.length?correspondenceBodyHtml(correspondenceItems,orderedMedia,person.id):empty('Aucune lettre, carte postale ou autre correspondance enregistrée.',{icon:'✉️'}),'span-12',`${correspondenceItems.length?correspondenceSortControlsHtml(person.id):''}${editOnly(actionButton('add','Ajouter une correspondance',`data-add-correspondence-inline="${person.id}"`))}`);
            },
            memories:index=>{
                const memoryItems=memoryMediaOnly(orderedMedia);
                const body=memoryItems.length?`<div class="memory-list">${memoryItems.map(item=>{
                    const mediaKind=normalizedMediaType(item);
                    const player=mediaKind==='video'
                        ?`<video controls preload="metadata" src="media/${encodeURIComponent(item.filename)}"></video>`
                        :`<audio controls src="media/${encodeURIComponent(item.filename)}"></audio>`;
                    return `<article class="memory-item" data-media-card-id="${item.id}"><div class="memory-player">${player}</div><div class="memory-content"><div class="item-title-row"><strong>${escapeHtml(item.title||'Témoignage / souvenir')}</strong><span class="inline-actions">${actionButton('media','Ouvrir',`data-media-id="${item.id}" data-media-index="${orderedMedia.indexOf(item)}"`)}</span></div>${item.date_text?`<small>${escapeHtml(item.date_text)}</small>`:''}${item.attachment_label?`<p>${escapeHtml(item.attachment_label)}</p>`:''}${item.description?`<p>${escapeHtml(item.description)}</p>`:''}${entityLabelsInline('media',item.id,item.labels,true)}</div></article>`;
                }).join('')}</div>`:empty('Aucun témoignage ou souvenir audio/vidéo.',{icon:'🎙️'});
                return card(index,'Témoignages / souvenirs',memoryItems.length,body,'span-12',editOnly(actionButton('add','Ajouter un témoignage / souvenir',`data-add-memory-inline="${person.id}"`)));
            },
            signatures:index=>card(index,'Signatures',signatures.length,signatures.length?`<div class="list-card-grid person-signature-grid">${signatures.map(sig=>`<article class="list-card" data-open-media="${sig.media_id}"><span class="list-card-icon">${sig.thumbnail?`<img src="media/${encodeURIComponent(sig.thumbnail)}" alt="">`:'✍'}</span><div><small class="list-card-date">${escapeHtml(sig.date_text||sig.created_at||'Date inconnue')}</small><h3>${escapeHtml(sig.title||sig.document_title||sig.filename||'Signature')}</h3><p>${escapeHtml(sig.document_reference||sig.document_title||'Média lié')}</p>${sig.note?`<p class="list-card-place">${escapeHtml(sig.note)}</p>`:''}<div class="list-card-details"><small>${escapeHtml(confidenceLabel(sig.confidence))}</small></div></div></article>`).join('')}</div>`:empty('Aucune signature identifiée.',{icon:'✍️'}),'span-12'),
            notes:index=>card(index,'Notes',notes.length,notes.length ? notes.map(note => `<article class="note-item"><div class="item-title-row">${note.title ? `<strong>${escapeHtml(note.title)}</strong>`:'<strong>Note sans titre</strong>'}<span class="item-title-extra">${entityLabelsInline('note',note.id,note.labels,true)}${editOnly(`<span class="inline-actions">${actionButton('edit','Modifier',`data-edit-note="${note.id}"`)}${actionButton('delete','Supprimer',`data-delete-note="${note.id}"`)}</span>`)}</span></div><p>${linkify(note.body)}</p></article>`).join('') : empty('Aucune note pour l’instant',{icon:'📝',action:isLocked?null:{label:'＋ Ajouter une note',attrs:`data-add-note-inline="${person.id}"`}}),'span-4',editOnly(actionButton('add','Ajouter une note',`data-add-note-inline="${person.id}"`))),
            census:index=>renderCensusCard(person,census,orderedMedia,isLocked).replace('card-index">08<','card-index">'+index+'<'),
            sources:index=>card(index,'Sources & citations',sources.length,sources.length ? sources.map(source=>sourceItemHtml(source,events,isLocked)).join('') : empty('Aucune source pour l’instant',{icon:'📚',hint:'Note d’où vient chaque information : acte, registre, site…',action:isLocked?null:{label:'＋ Ajouter une source',attrs:`data-add-source-inline="${person.id}"`}}),'span-4',editOnly(actionButton('add','Ajouter une source',`data-add-source-inline="${person.id}"`))),
            refs:index=>card(index,'Références externes','',`<dl class="data-list">${dataRow('Identifiant GEDCOM',person.gedcom_id || '—')}${dataRow('FamilySearch',person.familysearch_id || '—')}${dataRow('Identifiant source',person.source_id || '—')}${dataRow('Numéro Sosa',sosaNumbersText(person.id)||'—')}${dataRow("Numéro d'Aboville",dabovilleNumberFor(person.id)||'—')}</dl>`,'span-4'),
            maternity:index=>person.gender==='female'?maternityTimeline(person,children,partners,events).replace('card-index">09<','card-index">'+index+'<'):'',
            investigations:index=>{
                const showSecondary=(()=>{try{return (readDesignSettings()).showInvestigationsAsSecondary!=='hide';}catch(_){return true;}})();
                const visibleInv=showSecondary?investigations:investigations.filter(item=>item.person_role==='primary'||!item.person_role);
                const invItems=visibleInv.map(item=>({kind:'Enquête',status:item.status,title:item.title,subtitle:item.question||'Sans question détaillée',openAttr:`data-open-investigation="${item.id}"`}));
                const battueItems=(battues||[]).map(item=>({kind:'Battue',status:item.status,title:item.title,subtitle:`${battueTargetText(state.battueTargetTypes,item.target_type)}${item.target_text?` · ${item.target_text}`:''} · ${item.start_name||''} (${item.start_insee_code||''})`,openAttr:`data-open-battue-from-person="${item.id}"`}));
                const rows=[...battueItems,...invItems];
                const html=rows.length?`<div class="person-investigation-list">${rows.map(item=>`<article class="person-investigation-card"><button class="investigation-person-link" ${item.openAttr}><span class="person-investigation-kind">${escapeHtml(item.kind)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small><span class="investigation-status ${escapeHtml(item.status)}">${item.status==='closed'?'Terminée':item.status==='paused'?'En pause':'En cours'}</span></button></article>`).join('')}</div>`:empty('Aucune enquête ou battue liée à cette personne.',{icon:'🔍'});
                return card(index,'Enquêtes',rows.length,html,'span-12',editOnly(`<button class="button small secondary" data-new-battue="${person.id}">+ Battue</button><button class="button small" data-new-investigation="${person.id}">+ Enquête</button>`));
            },
            event_map:index=>{const showCensusMap=evtFilter.showCensus;const censusEventsForMap=showCensusMap?(census?.records||[]).filter(r=>r.status==='found').map(r=>({type_label:'Recensement '+r.year,date_text:r.date_text||(r.year?String(r.year):''),year:r.year,gedcom_tag:'CENS',color:'#7c5c2e',icon:null,place_name:r.place_name,subdivision:r.subdivision,county:r.county,state:r.state,country:r.country,address:r.address,former_place_name:null,former_country:null,place_id:r.place_id,latitude:r.latitude,longitude:r.longitude,precise_lat:r.precise_lat,precise_lon:r.precise_lon,id:'census-'+r.id,_isCensus:true})):[]; const allEvForMap=[...events,...censusEventsForMap]; return card(index,'Carte des événements',allEvForMap.filter(event=>event.place_name||event.country||eventHasCoordinates(event)).length,personEventMap(allEvForMap),'span-6');},
            completion:index=>card(index,'Score de complétude',`${completion.score}%`,completionHtml(completion),'span-6'),
            bio:index=>card(index,'Biographie automatique','',`<p class="auto-biography">${escapeHtml(biography || 'Pas assez d’informations pour générer une biographie utile.')}</p>`,'span-12'),
            military:index=>{
                // Affiché automatiquement pour les hommes, sur demande pour les femmes (show_military_block=1)
                const isMale=person.gender==='male';
                const showForFemale=Number(person.show_military_block)===1;
                if(!isMale&&!showForFemale)return '';
                const milData=state.currentPerson?.militaryData||{};
                const milRows=[
                    ['N° matricule',milData.matricule],
                    ['Classe de mobilisation',milData.classe_mobilisation],
                    ['Bureau de recrutement',milData.bureau_recrutement],
                    ['Décision du conseil de révision',milData.decision_conseil],
                    ['Compris dans la liste',milData.compris_liste],
                ].map(([label,value])=>identityDataRow(label,value,blockSettings)).join('');
                const signRows=[
                    ['Cheveux',milData.cheveux],['Sourcils',milData.sourcils],['Yeux',milData.yeux],['Front',milData.front],['Nez',milData.nez],['Bouche',milData.bouche],['Menton',milData.menton],['Visage',milData.visage],['Taille',milData.taille],['Marques particulières',milData.marques_particulieres],['Degré d\'instruction générale',milData.degre_instruction_gen],['Degré d\'instruction militaire',milData.degre_instruction_mil],
                ].map(([label,value])=>identityDataRow(label,value,blockSettings)).join('');
                const corpsRows=[
                    ['Armée active',milData.corps_armee_active],['Disponibilité / réserve active',milData.corps_disponibilite],['Armée territoriale',milData.corps_territoriale],
                ].map(([label,value])=>identityDataRow(label,value,blockSettings)).join('');
                const datesRows=[
                    ['Entrée active',milData.date_entree_active],['Passé en disponibilité',milData.date_disponibilite],['Passé en réserve active',milData.date_reserve],['Passé en territoriale',milData.date_territoriale],['Passé en réserve territoriale',milData.date_reserve_territ],['Libéré du service',milData.date_liberation],
                ].map(([label,value])=>identityDataRow(label,value,blockSettings)).join('');
                const milMedia=mediaForMilitary(state.currentPerson?.media||[],person.id);
                const hasAny=Object.values(milData).some(v=>v&&String(v).trim())||milMedia.length>0;
                const milMediaRow=milMedia.length?`<p class="mil-media-row"><button type="button" class="button small secondary" data-view-military-media="${person.id}">${plural(milMedia.length,'document lié','documents liés')}</button></p>`:'';
                const body=hasAny?`
                    ${milMediaRow}
                    <dl class="data-list">${milRows}</dl>
                    ${signRows?`<details class="mil-section"><summary>Signalement physique</summary><dl class="data-list">${signRows}</dl></details>`:''}
                    ${corpsRows?`<details class="mil-section"><summary>Corps d'affectation</summary><dl class="data-list">${corpsRows}</dl></details>`:''}
                    ${datesRows?`<details class="mil-section"><summary>Époques de passage</summary><dl class="data-list">${datesRows}</dl></details>`:''}
                    ${milData.services_mutations?`<details class="mil-section" open><summary>Services, campagnes &amp; décorations</summary><p class="mil-freetext">${escapeHtml(milData.services_mutations)}</p></details>`:''}
                    ${milData.localites_successives?`<details class="mil-section"><summary>Localités successives</summary><p class="mil-freetext">${escapeHtml(milData.localites_successives)}</p></details>`:''}
                    ${milData.condamnations?`<details class="mil-section"><summary>Condamnations judiciaires</summary><p class="mil-freetext">${escapeHtml(milData.condamnations)}</p></details>`:''}
                    ${milData.notes_militaires?`<details class="mil-section"><summary>Notes complémentaires</summary><p class="mil-freetext">${escapeHtml(milData.notes_militaires)}</p></details>`:''}
                `:empty('Aucune information militaire renseignée.',{icon:'🎖️'});
                return card(index,'Militaire','',body,'span-12',editOnly(actionButton('edit','Modifier les informations militaires',`data-edit-military="${person.id}"`)));
            },
            cemetery:index=>{
                const grave=state.currentPerson?.grave||null;
                const conditionLabels={bon:'Bon état',moyen:'État moyen',mauvais:'Mauvais état',a_restaurer:'À restaurer',disparu:'Disparue',inconnu:'État inconnu'};
                if(!grave){
                    return card(index,'Cimetière','',empty('Aucune sépulture pour l’instant',{icon:'🪦',action:isLocked?null:{label:'＋ Renseigner la sépulture',attrs:`data-edit-grave="${person.id}"`}}),'span-12',editOnly(actionButton('add','Renseigner la sépulture',`data-edit-grave="${person.id}"`)));
                }
                const graveRows=[
                    ['Cimetière',grave.cemetery_name],
                    ['Ville',grave.city],
                    ['Pays',grave.country],
                    ['Adresse',grave.address],
                    ['Emplacement / plan',grave.plan_ref],
                ].map(([label,value])=>identityDataRow(label,value,blockSettings)).join('');
                const hasGps=grave.gps_lat!=null&&grave.gps_lon!=null&&grave.gps_lat!==''&&grave.gps_lon!=='';
                const gpsRow=hasGps?`<p class="grave-gps"><span class="grave-gps-icon">📍</span> ${Number(grave.gps_lat).toFixed(6)}°, ${Number(grave.gps_lon).toFixed(6)}° <a href="https://www.google.com/maps?q=${Number(grave.gps_lat)},${Number(grave.gps_lon)}" target="_blank" rel="noopener">Voir sur la carte ↗</a></p>`:'';
                const stillExists=Number(grave.grave_exists)!==0;
                const statusBadge=`<span class="grave-status-badge ${stillExists?'is-existing':'is-gone'}">${stillExists?'Sépulture existante':'⚠ Sépulture disparue'}</span>`;
                const conditionBadge=`<span class="grave-condition-badge grave-condition-${grave.condition_state||'inconnu'}">${conditionLabels[grave.condition_state]||'État inconnu'}</span>`;
                const gravePersons=(grave.persons||[]);
                const personsHtml=gravePersons.length?`<ul class="grave-person-list">${gravePersons.map(p=>{const nm=escapeHtml((p.first_name+' '+p.last_name).trim()||'(Sans nom)');const dates=p.birth_year?(p.death_year?`${p.birth_year} — ${p.death_year}`:`${p.birth_year} — ?`):'';const isCurrent=Number(p.id)===Number(person.id);return `<li class="grave-person-item${isCurrent?' is-current':''}"><button type="button" class="link-button" data-open-person="${p.id}"><strong>${nm}</strong>${dates?` <small>${escapeHtml(dates)}</small>`:''}</button>${editOnly(!isCurrent?actionButton('delete','Retirer de la sépulture',`data-remove-grave-person="${p.id}" data-grave-id="${grave.id}"`):'')}</li>`;}).join('')}</ul>`:empty('Aucune personne rattachée.',{icon:'👥'});
                const photos=(grave.photos||[]);
                const photosHtml=photos.length?`<div class="grave-photo-gallery">${photos.map((ph,i)=>`<button type="button" class="grave-photo-thumb" data-view-grave-photo="${i}">${normalizedMediaType(ph)==='image'?`<img src="media/${encodeURIComponent(ph.thumbnail||ph.filename)}" alt="">`:`<span class="grave-photo-doc">${mediaTypeShortLabelWithIcon(ph)}</span>`}${ph.date_text?`<small class="grave-photo-date">${escapeHtml(ph.date_text)}</small>`:''}</button>`).join('')}</div>`:empty('Aucune photo datée de la sépulture.',{icon:'📷'});
                const body=`
                    <div class="grave-status-row">${statusBadge} ${conditionBadge}</div>
                    <dl class="data-list">${graveRows}</dl>
                    ${gpsRow}
                    ${grave.notes?`<details class="mil-section" open><summary>Notes</summary><p class="mil-freetext">${escapeHtml(grave.notes)}</p></details>`:''}
                    <details class="mil-section" open><summary>Personnes inhumées ici (${gravePersons.length})</summary>${personsHtml}${editOnly(`<button type="button" class="button small secondary" data-add-grave-person="${grave.id}">+ Ajouter une personne</button>`)}</details>
                    <details class="mil-section" open><summary>Photos datées (${photos.length})</summary>${photosHtml}${editOnly(`<button type="button" class="button small secondary" data-manage-grave-media="${grave.id}">+ Ajouter ou lier une photo</button>`)}</details>
                `;
                return card(index,'Cimetière','',body,'span-12',editOnly(`${actionButton('edit','Modifier la sépulture',`data-edit-grave="${person.id}"`)}${actionButton('delete','Supprimer la sépulture',`data-delete-grave="${grave.id}"`)}`));
            },
            artistic_works:index=>{
                if(!Number(person.is_artist))return '';
                const artisticTypeIds=new Set((state.bootstrap?.eventTypes||[]).filter(t=>Number(t.is_artistic)).map(t=>Number(t.id)));
                const artisticEvs=events.filter(e=>artisticTypeIds.has(Number(e.event_type_id)));
                const discipline=person.artist_discipline||'';
                const disciplineLabel={'photographe':'Photographe','peintre':'Peintre','ecrivain':'Écrivain','cineaste':'Cinéaste','sculpteur':'Sculpteur','dramaturge':'Dramaturge','poete':'Poète','videaste':'Vidéaste','plasticien':'Plasticien','danseur':'Danseur','acteur':'Acteur','musicien':'Musicien','chanteur':'Chanteur','compositeur':'Compositeur','chef':'Chef d’orchestre','groupe':'Groupe de musique'}[discipline]||discipline||'Artiste';
                const renderArtisticEv=ev=>{let workValues={};if(ev.work_fields){try{workValues=JSON.parse(ev.work_fields)||{};}catch(_){workValues={};}}const workDetailsHtml=Object.keys(workValues).length?`<dl class="work-fields-list">${Object.entries(workValues).map(([k,v])=>`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>`:'';return `<div class="event-row"><span class="event-icon" style="--event-color:${escapeHtml(ev.color)}">${typeGlyph(ev.icon,ev.gedcom_tag)}</span><div class="event-date">${escapeHtml(ev.date_text||'Date inconnue')}${eventConvertedDateHtml(ev)}<small>${escapeHtml(eventAgeText(ev,birthEvent))}</small></div><div class="event-content"><div class="item-title-row"><strong>${escapeHtml(ev.type_label)}</strong><span class="item-title-extra"><span class="inline-actions">${mediaForEvent(orderedMedia,ev.id).length?actionButton('media','Voir les médias liés',`data-view-event-media="${ev.id}"`):''}${editOnly(`${actionButton('source',`Source${eventSources(ev.id).length?` (${eventSources(ev.id).length})`:''}`,`data-add-event-source="${ev.id}"`)}${actionButton('edit','Modifier',`data-edit-event="${ev.id}"`)}${actionButton('delete','Supprimer',`data-delete-event="${ev.id}"`)}`)}</span></span></div>${ev.title||ev.description?`<p>${escapeHtml(ev.title||ev.description)}</p>`:''}${eventFactConfidenceHtml(ev)}${workDetailsHtml}</div></div>`;};
                const body=artisticEvs.length?`<div class="event-list">${artisticEvs.map(renderArtisticEv).join('')}</div>`:empty('Aucune œuvre ou réalisation enregistrée.',{icon:'🎨'});
                return card(index,`Œuvres — ${escapeHtml(disciplineLabel)}`,artisticEvs.length,body,'span-12',editOnly(actionButton('add','Ajouter une œuvre / réalisation',`data-add-event-inline-artistic="${person.id}"`)));
            },
            web_search:index=>card(index,'Chercher sur internet','',webSearchPanelHtml(detail,webSearchSettings(person.id),`person-${person.id}`),'span-12'),
            ascendants:index=>{const ls=lineageSettings(person.id);return card(index,'Ascendants','',`<div data-lineage-block="asc"><small class="muted">Chargement…</small></div>`,'span-6',lineageDepthSelect('asc',ls.asc));},
            descendants:index=>{const ls=lineageSettings(person.id);return card(index,'Descendants','',`<div data-lineage-block="desc"><small class="muted">Chargement…</small></div>`,'span-6',lineageDepthSelect('desc',ls.desc));},
            family_objects:index=>card(index,'Objets de famille',personObjects.length||'',personObjects.length?`<div class="collection-grid is-compact">${personObjects.map(o=>familyObjectCardHtml(o,true)).join('')}</div>`:empty('Aucun objet lié à cette personne.',{icon:'🏺'}),'span-12',`<button class="button small secondary" type="button" data-open-list="family_objects">Gérer les objets</button>`),
            family_memories:index=>card(index,'Mémoire familiale',personMemories.length||'',personMemories.length?`<div class="collection-grid is-compact">${personMemories.map(m=>familyMemoryCardHtml(m,true)).join('')}</div>`:empty('Aucun souvenir lié à cette personne.',{icon:'💬'}),'span-12',`<button class="button small secondary" type="button" data-open-list="family_memories">Gérer la mémoire familiale</button>`),
            person_exports:index=>{
                const body=`<div class="person-export-block"><p>Exports rapides de cette fiche. Le PDF utilise l’impression du navigateur, avec l’ordre, la taille et la visibilité des blocs de cette fiche.</p><div class="page-actions"><button class="button small secondary" type="button" data-customize-person-export="${person.id}">Personnaliser l’export</button><button class="button small secondary" type="button" data-print-person="${person.id}">PDF / imprimer</button><button class="button small secondary" type="button" data-export-person-json="${person.id}">JSON fiche</button></div></div>`;
                return card(index,'Exports fiche','',body,'span-6');
            },
        };
        Object.entries(window.LCNDA_EXT?.personBlocks||{}).forEach(([key,render])=>{personBlockRenderers[key]=index=>render(index,detail,{isLocked,editOnly});});
        const sosaNumber=sosaNumbersText(person.id);
        const dabovilleNumber=dabovilleNumberFor(person.id);
        $('#workspace').innerHTML = `<article class="page person-page">
            <div class="person-hero">
                ${portrait}<div><span class="eyebrow">${person.kind==='animal'?`🐾 FICHE ANIMAL${detail.heritage?.animal?.data?.species?' · '+escapeHtml(window.LCNDA_EXT?.speciesLabel?.(detail.heritage.animal.data.species)||(detail.heritage.animal.species||{})[detail.heritage.animal.data.species]||''):''}${detail.heritage?.animal?.data?.breed?' · '+escapeHtml(detail.heritage.animal.data.breed):''}`:'FICHE INDIVIDUELLE'} · #${person.id}</span><h2>${escapeHtml(personName(person))}</h2><div class="person-meta"><span>${escapeHtml(years(person))}</span><span>${person.kind==='animal'?`Sexe : <strong>${person.gender==='male'?'♂ mâle':person.gender==='female'?'♀ femelle':'?'}</strong>`:`Genre : <strong>${genderText(person.gender)}</strong>`}</span>${person.surname_group ? `<span>Groupe : <strong>${escapeHtml(person.surname_group)}</strong></span>`:''}</div></div>
                <div class="person-hero-tools"><div class="person-hero-status">${sosaNumber?`<span class="sosa-star" title="${sosaNumber.includes('&')?'Numéros Sosa (ancêtre présent plusieurs fois dans l’arbre)':'Numéro Sosa'} ${escapeHtml(sosaNumber)}"><span>★</span> SOSA : ${escapeHtml(String(sosaNumber))}</span>`:''}${dabovilleNumber?`<span class="daboville-tag" title="Numéro d'Aboville ${escapeHtml(dabovilleNumber)}"><span>◆</span> Aboville : ${escapeHtml(dabovilleNumber)}</span>`:''}<span class="status-badge ${person.living_status}">${lifeText(person.living_status)}</span>${person.outside_genealogy?'<span class="outside-genealogy-badge">Hors généalogie</span>':''}${Number(person.is_artist)?`<span class="artist-badge" title="${escapeHtml({'photographe':'Photographe','peintre':'Peintre','ecrivain':'Écrivain','cineaste':'Cinéaste','sculpteur':'Sculpteur','dramaturge':'Dramaturge','poete':'Poète','videaste':'Vidéaste','plasticien':'Plasticien','danseur':'Danseur','acteur':'Acteur'}[person.artist_discipline||'']||'Artiste')}">🎨 Artiste</span>`:''}</div><div class="person-hero-actions">${actionButton(Number(person.is_bookmarked)?'bookmark-on':'bookmark',bookmarkButtonLabel(person),`data-toggle-bookmark="${person.id}"`)}${editOnly(actionButton('delete','Supprimer cette fiche',`data-delete-person="${person.id}"`))}${actionButton(isLocked?'lock':'unlock',isLocked?'Déverrouiller la fiche':'Verrouiller la fiche',`data-toggle-person-lock="${person.id}" data-lock-value="${isLocked?0:1}"`)}${actionButton('history','Historique de la fiche',`data-person-history="${person.id}"`)}</div></div>
            </div>
            <div class="relations-strip">${relationChips('Parents','parent',parents,'unknown',isLocked)}${relationChips('Conjoints','spouse',partners,person.spouse_status,isLocked)}${relationChips('Enfants','child',children,person.children_status,isLocked)}${siblingChips('Frères & sœurs',siblings)}</div>
            <div class="card-grid">
                ${renderPersonBlocks(person.id,personBlockRenderers)}
            </div>
        </article>`;
        bindPersonPage({...detail,media:orderedMedia});
        (window.LCNDA_EXT?.afterPerson||[]).forEach(fn=>{try{fn(detail);}catch(error){console.error(error);}});
    }

    function dataRow(label, value) { return `<div class="data-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`; }
    function siblingChips(label,people=[]){return `<div class="relation-group"><div class="relation-heading"><span>${label}</span></div><div class="relation-chips">${people.length?people.map(person=>`<div class="relation-entry"><button class="relation-chip" data-open-person="${person.id}"><strong>${escapeHtml(personName(person))}</strong><small>${escapeHtml(relationYears(person))}</small></button></div>`).join(''):'<small class="relation-status">Aucun renseigné</small>'}</div></div>`;}
    /** Bas du bloc Identité : cacher ou montrer les lignes pas remplies, pour cette fiche ou pour toutes */
    function identityEmptyBar(personId,settings){const hide=!!settings.hideEmptyIdentity,verb=hide?'Afficher':'Masquer';return `<div class="identity-empty-bar"><span>${hide?'🙈 Lignes vides masquées':'👁 Lignes vides affichées'}</span><button type="button" class="button small secondary" data-identity-empty="this" data-hide="${hide?0:1}" data-person="${Number(personId)}">${verb} sur cette fiche</button><button type="button" class="button small secondary" data-identity-empty="all" data-hide="${hide?0:1}" data-person="${Number(personId)}">${verb} sur toutes</button></div>`;}
    function setIdentityEmpty(scope,hide,personId){
        try{
            if(scope==='this'){localStorage.setItem(`genealogie-identity-empty-${personId}`,hide?'1':'0');}
            else{
                ['human','animal'].forEach(kind=>{const key=blockBaseKey(kind);let v={};try{v=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(_){}v.hideEmptyIdentity=hide;localStorage.setItem(key,JSON.stringify(v));});
                // « toutes » : les choix faits fiche par fiche s'effacent
                for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i)||'';if(key.startsWith('genealogie-identity-empty-'))localStorage.removeItem(key);else if(key.startsWith('genealogie-person-blocks-')){try{const v=JSON.parse(localStorage.getItem(key)||'{}');if(v&&typeof v==='object'&&'hideEmptyIdentity' in v){delete v.hideEmptyIdentity;localStorage.setItem(key,JSON.stringify(v));}}catch(_){}}}
            }
        }catch(_){toast('Réglage non enregistré (stockage indisponible).','error');return;}
        toast(hide?(scope==='this'?'Lignes vides masquées sur cette fiche.':'Lignes vides masquées sur toutes les fiches.'):(scope==='this'?'Lignes vides affichées sur cette fiche.':'Lignes vides affichées sur toutes les fiches.'));
    }
    function identityDataRow(label,value,settings){const empty=value===undefined||value===null||String(value).trim()===''||String(value).trim()==='—';return settings.hideEmptyIdentity&&empty?'':dataRow(label,empty?'—':value);}
    const onlineSheetFields=[
        ['first_name','Prénom'],['last_name','Nom'],['birth_date','Date de naissance'],['birth_place','Lieu de naissance'],
        ['marriage_date','Date de mariage'],['marriage_place','Lieu de mariage'],['death_date','Date de décès'],['death_place','Lieu de décès'],
        ['occupation','Métier / activité'],['parents','Parents'],['other','Autre information']
    ];
    const onlineSheetStatuses=[['exact','Exacte'],['inexact','Inexacte'],['incomplet','Incomplète'],['approximatif','Approximative'],['inconnu','Inconnue']];
    function onlineSheetStatusLabel(status){return (onlineSheetStatuses.find(row=>row[0]===status)||[,'Inconnue'])[1];}
    function onlineSheetChecksSummaryHtml(checks=[]){
        const notable=checks.filter(check=>check.status&&check.status!=='exact');
        if(!checks.length)return '<p class="muted">Aucune vérification effectuée.</p>';
        return `<ul class="online-sheet-checks">${checks.map(check=>`<li class="online-sheet-check status-${escapeHtml(check.status)}"><span class="online-sheet-check-field">${escapeHtml(check.field_label||check.field)}</span><span class="online-sheet-check-status">${escapeHtml(onlineSheetStatusLabel(check.status))}</span>${check.comment?`<span class="online-sheet-check-comment">${escapeHtml(check.comment)}</span>`:''}</li>`).join('')}</ul>${notable.length?'':''}`;
    }
    function onlineSheetsHtml(sheets=[],personId,locked){
        const items=sheets.map(sheet=>`<article class="online-sheet-card" data-online-sheet-id="${sheet.id}">
            <div class="online-sheet-head">
                <div><strong>${escapeHtml(sheet.label||'Fiche en ligne')}</strong>${sheet.site?` <span class="muted">— ${escapeHtml(sheet.site)}</span>`:''}</div>
                ${locked?'':`<div class="page-actions compact">${actionButton('edit','Modifier',`data-edit-online-sheet="${sheet.id}"`)}${actionButton('delete','Supprimer',`data-delete-online-sheet="${sheet.id}"`)}</div>`}
            </div>
            ${sheet.url?`<a class="table-link" href="${escapeHtml(safeUrl(sheet.url))}" target="_blank" rel="noopener">${escapeHtml(sheet.url)}</a>`:''}
            ${sheet.notes?`<p>${escapeHtml(sheet.notes)}</p>`:''}
            ${sheet.screenshot_media_id&&sheet.screenshot_filename?`<button type="button" class="online-sheet-shot-thumb" data-online-shot-open="${sheet.id}" title="Voir la capture de l’arbre en grand"><img src="media/${encodeURIComponent(sheet.screenshot_thumbnail||sheet.screenshot_filename)}" alt="Capture d’écran de l’arbre"></button>`:''}
            ${onlineSheetChecksSummaryHtml(sheet.checks)}
        </article>`).join('');
        // Repliable avec la même flèche que la FAQ ; ouvert ou fermé, c'est retenu pour toutes les fiches
        let open=true;try{open=localStorage.getItem('genealogie-online-sheets-open')!=='0';}catch(_){}
        return `<details class="dialog-labels-block online-sheets-block" data-online-sheets-fold ${open?'open':''}><summary class="section-label">Fiches en ligne${sheets.length?` <span class="muted">(${sheets.length})</span>`:''}</summary><div class="online-sheets-list">${items||empty('Aucune fiche en ligne pour l’instant',{icon:'🌐',hint:'Geneanet, FamilySearch, Filae… les arbres en ligne où figure cette personne.'})}</div>${locked?'':`<button type="button" class="button small secondary" data-add-online-sheet="${personId}">+ Ajouter une fiche en ligne</button>`}</details>`;
    }
    function labelTextColor(color='#0066cc'){const hex=String(color||'#0066cc').replace('#','');const full=hex.length===3?hex.split('').map(char=>char+char).join(''):hex;const r=parseInt(full.slice(0,2),16)||0,g=parseInt(full.slice(2,4),16)||0,b=parseInt(full.slice(4,6),16)||0;return ((r*299+g*587+b*114)/1000)>150?'#000':'#fff';}
    function labelChip(label){const color=label?.color||'#0066cc';return `<span class="label-chip" style="--label-bg:${escapeHtml(color)};--label-fg:${escapeHtml(labelTextColor(color))}">${escapeHtml(label?.name||'Étiquette')}</span>`;}
    function labelsHtml(labels=[]){return labels?.length?`<div class="entity-labels">${labels.map(labelChip).join('')}</div>`:'';}
    function entityLabelsField(entityType,entityId,labels=[],locked=false){
        const chips=(labels||[]).map(l=>{
            const color=l?.color||'#0066cc';
            const remove=locked?'':`<button type="button" class="label-chip-remove" data-remove-label="${l.id}" aria-label="Retirer l’étiquette ${escapeHtml(l.name||'')}" title="Retirer cette étiquette">&times;</button>`;
            return `<span class="label-chip removable" style="--label-bg:${escapeHtml(color)};--label-fg:${escapeHtml(labelTextColor(color))}" data-label-chip="${l.id}"><span>${escapeHtml(l.name||'Étiquette')}</span>${remove}</span>`;
        }).join('');
        const addButton=locked?'':`<button type="button" class="icon-action icon-add labels-add-btn" data-labels-add aria-label="Ajouter une étiquette" title="Ajouter une étiquette"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
        const inputRow=locked?'':`<div class="labels-input-row" hidden><input type="text" class="labels-autocomplete-input" placeholder="Tape pour chercher une étiquette…" autocomplete="off"><div class="labels-suggestions" hidden></div></div>`;
        return `<div class="labels-field" data-labels-entity-type="${escapeHtml(entityType)}" data-labels-entity-id="${entityId}"><div class="labels-field-head"><span class="section-label">Étiquettes</span>${addButton}</div><div class="labels-field-chips">${chips||'<small class="label-field-empty">Aucune étiquette.</small>'}</div>${inputRow}</div>`;
    }
    function entityLabelsInline(entityType,entityId,labels=[],locked=false){
        const chips=(labels||[]).map(l=>{
            const color=l?.color||'#0066cc';
            const remove=locked?'':`<button type="button" class="label-chip-remove" data-remove-label="${l.id}" aria-label="Retirer l’étiquette ${escapeHtml(l.name||'')}" title="Retirer cette étiquette">&times;</button>`;
            return `<span class="label-chip removable" style="--label-bg:${escapeHtml(color)};--label-fg:${escapeHtml(labelTextColor(color))}" data-label-chip="${l.id}"><span>${escapeHtml(l.name||'Étiquette')}</span>${remove}</span>`;
        }).join('');
        const addButton=locked?'':`<button type="button" class="icon-action icon-add labels-add-btn" data-labels-add aria-label="Ajouter une étiquette" title="Ajouter une étiquette"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
        const inputRow=locked?'':`<div class="labels-input-row" hidden><input type="text" class="labels-autocomplete-input" placeholder="Tape pour chercher une étiquette…" autocomplete="off"><div class="labels-suggestions" hidden></div></div>`;
        if(locked&&!chips)return '';
        return `<div class="labels-field labels-field-inline" data-labels-entity-type="${escapeHtml(entityType)}" data-labels-entity-id="${entityId}"><div class="labels-field-chips">${chips}</div>${addButton}${inputRow}</div>`;
    }
    async function ensureLabelsCache(){
        if(Array.isArray(state.currentLabelsCache))return state.currentLabelsCache;
        const data=await api('labels');
        state.currentLabelsCache=data.labels||[];
        return state.currentLabelsCache;
    }
    function updateLabelsFieldChips(field,labels=[]){
        const locked=!field.querySelector('[data-labels-add]')&&!field.querySelector('.labels-input-row');
        const chipsHtml=(labels||[]).map(l=>{
            const color=l?.color||'#0066cc';
            const remove=locked?'':`<button type="button" class="label-chip-remove" data-remove-label="${l.id}" aria-label="Retirer l’étiquette ${escapeHtml(l.name||'')}" title="Retirer cette étiquette">&times;</button>`;
            return `<span class="label-chip removable" style="--label-bg:${escapeHtml(color)};--label-fg:${escapeHtml(labelTextColor(color))}" data-label-chip="${l.id}"><span>${escapeHtml(l.name||'Étiquette')}</span>${remove}</span>`;
        }).join('');
        const chipsBox=$('.labels-field-chips',field);
        if(chipsBox)chipsBox.innerHTML=chipsHtml||'<small class="label-field-empty">Aucune étiquette.</small>';
        $$('[data-remove-label]',field).forEach(button=>button.addEventListener('click',()=>removeLabelFromField(field,Number(button.dataset.removeLabel))));
        const detail=state.currentPerson;
        if(detail&&field.dataset.labelsEntityType==='person'&&Number(field.dataset.labelsEntityId)===Number(detail.person?.id)){detail.labels=labels;}
    }
    function hideLabelSuggestions(field){const box=$('.labels-suggestions',field);if(box){box.hidden=true;box.innerHTML='';}}
    async function renderLabelSuggestions(field,query){
        const box=$('.labels-suggestions',field);
        if(!box)return;
        let all;
        try{all=await ensureLabelsCache();}catch(error){box.innerHTML=`<div class="labels-suggestion-empty">${escapeHtml(error.message)}</div>`;box.hidden=false;return;}
        const currentIds=new Set($$('[data-label-chip]',field).map(chip=>Number(chip.dataset.labelChip)));
        const q=(query||'').trim().toLowerCase();
        const matches=all.filter(l=>!currentIds.has(Number(l.id))&&(!q||String(l.name||'').toLowerCase().includes(q))).slice(0,8);
        const optionsHtml=matches.map(l=>`<button type="button" class="labels-suggestion" data-pick-label="${l.id}">${labelChip(l)}</button>`).join('');
        // Aucune étiquette de ce nom : on peut la créer sur place (au lieu de passer par Listes → Étiquettes)
        const typed=(query||'').trim();
        const exists=all.some(l=>String(l.name||'').trim().toLowerCase()===typed.toLowerCase());
        const createHtml=typed&&!exists?`<button type="button" class="labels-suggestion labels-create" data-create-label="${escapeHtml(typed)}">+ Créer l’étiquette « ${escapeHtml(typed)} »</button>`:'';
        box.innerHTML=(optionsHtml+createHtml)||'<div class="labels-suggestion-empty">Tape le nom d’une étiquette.</div>';
        box.hidden=false;
        $$('[data-pick-label]',box).forEach(btn=>btn.addEventListener('click',()=>addLabelToField(field,Number(btn.dataset.pickLabel))));
        $('[data-create-label]',box)?.addEventListener('click',async event=>{const name=event.currentTarget.dataset.createLabel;
            try{const created=await api('save_label',{}, {method:'POST',body:{name}});const label=created.result;state.currentLabelsCache=null;if(label?.id)await addLabelToField(field,Number(label.id));toast(`Étiquette « ${name} » créée.`);}catch(error){toast(error.message,'error');}});
    }
    async function addLabelToField(field,labelId){
        const entityType=field.dataset.labelsEntityType,entityId=Number(field.dataset.labelsEntityId);
        if(!entityId){toast('Enregistre d’abord cette fiche avant d’ajouter une étiquette.','error');return;}
        const currentIds=$$('[data-label-chip]',field).map(chip=>Number(chip.dataset.labelChip));
        if(currentIds.includes(labelId))return;
        currentIds.push(labelId);
        try{
            const result=await api('set_label_links',{},{method:'POST',body:{entity_type:entityType,entity_id:entityId,label_ids:currentIds}});
            updateLabelsFieldChips(field,result.result.labels||[]);
            const input=$('.labels-autocomplete-input',field);
            if(input){input.value='';input.focus();renderLabelSuggestions(field,'');}
        }catch(error){toast(error.message,'error');}
    }
    async function removeLabelFromField(field,labelId){
        const entityType=field.dataset.labelsEntityType,entityId=Number(field.dataset.labelsEntityId);
        const currentIds=$$('[data-label-chip]',field).map(chip=>Number(chip.dataset.labelChip)).filter(id=>id!==labelId);
        try{
            const result=await api('set_label_links',{},{method:'POST',body:{entity_type:entityType,entity_id:entityId,label_ids:currentIds}});
            updateLabelsFieldChips(field,result.result.labels||[]);
            const input=$('.labels-autocomplete-input',field);
            if(input&&!$('.labels-input-row',field)?.hidden)renderLabelSuggestions(field,input.value);
        }catch(error){toast(error.message,'error');}
    }
    function bindEntityLabelsFields(){
        $$('.labels-field').forEach(field=>{
            if(field.dataset.labelsBound)return;field.dataset.labelsBound='1'; // déjà branché : ne pas doubler les clics
            const addBtn=$('[data-labels-add]',field);
            const inputRow=$('.labels-input-row',field);
            if(addBtn&&inputRow){
                addBtn.addEventListener('click',()=>{
                    const opening=inputRow.hidden;
                    inputRow.hidden=!opening;
                    addBtn.classList.toggle('is-active',opening);
                    const input=$('.labels-autocomplete-input',field);
                    if(opening&&input){input.value='';input.focus();renderLabelSuggestions(field,'');}
                    else hideLabelSuggestions(field);
                });
            }
            $$('[data-remove-label]',field).forEach(button=>button.addEventListener('click',()=>removeLabelFromField(field,Number(button.dataset.removeLabel))));
            const input=$('.labels-autocomplete-input',field);
            if(input){
                input.addEventListener('input',debounce(()=>renderLabelSuggestions(field,input.value),150));
                input.addEventListener('keydown',event=>{
                    if(event.key==='Escape'){hideLabelSuggestions(field);if(inputRow)inputRow.hidden=true;addBtn?.classList.remove('is-active');}
                });
            }
        });
    }
    document.addEventListener('click',event=>{
        $$('.labels-field').forEach(field=>{
            if(field.contains(event.target))return;
            hideLabelSuggestions(field);
            const inputRow=$('.labels-input-row',field);
            const addBtn=$('[data-labels-add]',field);
            if(inputRow)inputRow.hidden=true;
            addBtn?.classList.remove('is-active');
        });
    });
    function labelEntityTypesText(value=''){const names={person:'Personnes',event:'Événements',place:'Lieux',media:'Médias',census:'Recensements',note:'Notes',source:'Sources',investigation:'Enquêtes',view:'Vues enregistrées',archive_visit:'Visites d’archives',family_object:'Objets de famille',family_memory:'Mémoire familiale'};return String(value||'').split(',').filter(Boolean).map(type=>names[type]||type).join(', ')||'—';}
    function mediaDocumentSummary(item){const parts=[item.document_reference,item.document_title,item.document_pages?`pages/vues ${item.document_pages}`:''].filter(Boolean);return parts.join(' · ');}
    function mediaDocumentLink(item){const summary=mediaDocumentSummary(item);if(!summary&&!item.document_url)return '';const label=summary||item.document_url;return item.document_url?`<a href="${escapeHtml(safeUrl(item.document_url))}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`:escapeHtml(label);}
    function sourceTypeText(type){return ({internet:'Internet',book:'Livre / registre',archive:'Archive sans média',testimony:'Témoignage',other:'Autre source'}[type]||'Internet');}
    function sourceTitleHtml(source){const title=escapeHtml(source.title||'Source sans titre');return source.url?`<a href="${escapeHtml(safeUrl(source.url))}" target="_blank" rel="noopener">${title}</a>`:title;}
    function sourceAttachmentText(source,events=[]){if(source.entity_type==='event'){const event=events.find(item=>Number(item.id)===Number(source.entity_id));return event?`${event.type_label} — ${event.date_text||event.year||'date inconnue'}`:'Événement lié';}return 'Toute la fiche';}
    function sourceItemHtml(source,events=[],locked=false){return `<article class="source-item"><div class="item-title-row"><h4>${sourceTitleHtml(source)}</h4><span class="item-title-extra">${entityLabelsInline('source',source.id,source.labels,true)}${locked?'':`<span class="inline-actions">${actionButton('edit','Modifier',`data-edit-source="${source.id}" data-source-link="${source.link_id || ''}"`)}${actionButton('delete','Supprimer',`data-delete-source="${source.id}" data-source-link="${source.link_id || ''}"`)}</span>`}</span></div><p class="source-meta">${escapeHtml([sourceTypeText(source.source_type),sourceAttachmentText(source,events),source.agency,source.author,source.publication?`date : ${source.publication}`:''].filter(Boolean).join(' · '))}</p>${source.text?`<p>${escapeHtml(source.text)}</p>`:''}${source.page?`<small>Réf. ${escapeHtml(source.page)}</small>`:''}${source.note?`<small>${escapeHtml(source.note)}</small>`:''}</article>`;}
    function variantDateText(variant){return variant.date_text||[variant.from_year,variant.to_year].filter(Boolean).join(' — ')||'';}
    function identityVariantsHtml(events,census,person,media,settings){
        const display=getIdentityNameVariantsDisplay();
        if(display==='never')return '';
        const personId=Number(person.id);
        const records=(census&&census.records)||[];
        const fromEvents=(events||[]).filter(event=>(event.first_name||event.last_name)).map(event=>({
            name:[event.first_name,event.last_name].filter(Boolean).join(' '),
            origin:[event.type_label,event.date_text||(event.year?String(event.year):'')].filter(Boolean).join(' — ')
        }));
        const fromCensus=records.filter(record=>(record.members||[]).some(member=>Number(member.person_id)===personId&&(member.first_name||member.display_name))).map(record=>{
            const member=record.members.find(item=>Number(item.person_id)===personId);
            return {
                name:[member.first_name,member.display_name].filter(Boolean).join(' '),
                origin:['Recensement'+(record.year?' '+record.year:''),record.date_text||''].filter(Boolean).join(' — ')
            };
        });
        const items=[...fromEvents,...fromCensus].filter(item=>item.name);
        if(!items.length)return (settings.hideEmptyIdentity&&display!=='always')?'':'<div class="identity-variants is-empty"><h4>Variantes de nom</h4><p>Aucune variante enregistrée.</p></div>';
        return `<div class="identity-variants"><h4>Variantes de nom</h4>${items.map(item=>`<article class="identity-variant-item"><strong>${escapeHtml(item.name)}</strong>${item.origin?`<small>${escapeHtml(item.origin)}</small>`:''}</article>`).join('')}</div>`;
    }
    function card(index, title, count, body, span, actions='') { return `<section class="card ${span}"><header class="card-head"><div class="card-title"><span class="card-index">${index}</span><h3>${escapeHtml(title)}${count !== '' ? ` <small>(${count})</small>`:''}</h3></div>${actions?`<div class="card-head-actions">${actions}</div>`:''}</header><div class="card-body">${body}</div></section>`; }
    function confidenceText(value){return ({low:'faible',medium:'moyenne',high:'forte'}[value]||'moyenne');}
    function hypothesisStatus(value){return ({open:'Ouverte',confirmed:'Confirmée',rejected:'Rejetée'}[value]||'Ouverte');}
    function proofQualityText(value){return ({unsourced:'Non sourcé',indirect:'Source indirecte',original:'Acte original',concordant:'Sources concordantes',contradiction:'Contradiction'}[value]||'Non sourcé');}
    function inlineEventAnnotations(event,hypotheses,evidence,orphansOnly=false){
        const eventId=Number(event.id)||0;
        const proofs=evidence.filter(item=>orphansOnly?!Number(item.event_id):Number(item.event_id)===eventId);
        const guesses=hypotheses.filter(item=>orphansOnly?!Number(item.event_id):Number(item.event_id)===eventId);
        if(!proofs.length&&!guesses.length)return '';
        return `<div class="event-annotations">
            ${proofs.map(item=>`<article class="proof-item ${item.quality}"><div class="item-title-row"><strong>Preuve · ${escapeHtml(item.title)}</strong><span class="inline-actions">${actionButton('edit','Modifier',`data-edit-evidence="${item.id}"`)}${actionButton('delete','Supprimer',`data-delete-evidence="${item.id}"`)}</span></div><small>${proofQualityText(item.quality)} · confiance ${confidenceText(item.confidence)}${item.source_title?` · ${escapeHtml(item.source_title)}`:''}</small>${item.note?`<p>${escapeHtml(item.note)}</p>`:''}</article>`).join('')}
            ${guesses.map(item=>`<article class="hypothesis-item ${item.status}"><div class="item-title-row"><strong>Hypothèse · ${escapeHtml(item.title)}</strong><span class="inline-actions">${actionButton('edit','Modifier',`data-edit-hypothesis="${item.id}"`)}${actionButton('delete','Supprimer',`data-delete-hypothesis="${item.id}"`)}</span></div><small>${hypothesisStatus(item.status)} · confiance ${confidenceText(item.confidence)}${item.related_name?` · lié à ${escapeHtml(item.related_name)}`:''}</small>${item.statement?`<p>${escapeHtml(item.statement)}</p>`:''}</article>`).join('')}
        </div>`;
    }
    function completionHtml(completion){
        const groups=[
            ['complete','Ce qui est complet','✓'],
            ['incomplete','Ce qui est incomplet','~'],
            ['missing','Ce qui manque','•'],
        ];
        return `<div class="completion-score"><strong>${Number(completion.score||0)}%</strong><span>de complétude documentaire</span></div><div class="completion-groups">${groups.map(([status,title,mark])=>{const items=(completion.items||[]).filter(item=>(item.status||'missing')===status);return `<section class="completion-group ${status}"><h4>${escapeHtml(title)} <small>${items.length}</small></h4>${items.length?items.map(item=>`<span>${mark} ${escapeHtml(item.label)}</span>`).join(''):'<em>Rien</em>'}</section>`;}).join('')}</div>`;
    }
    function normalizedMediaType(item){
        const declared=String(item?.media_type||'').toLowerCase();
        if(['image','photo','audio','video','pdf'].includes(declared))return declared==='photo'?'image':declared;
        const text=[item?.mime_type,item?.content_type,item?.filename,item?.thumbnail,item?.title].filter(Boolean).join(' ').toLowerCase();
        if(/\b(audio\/|\.mp3\b|\.wav\b|\.aif\b|\.aiff\b|\.aifc\b|\.m4a\b|\.ogg\b|\.flac\b)/.test(text))return 'audio';
        if(/\b(video\/|\.mp4\b|\.mov\b|\.m4v\b|\.webm\b|\.avi\b|\.mkv\b)/.test(text))return 'video';
        if(/\b(application\/pdf|\.pdf\b)/.test(text))return 'pdf';
        return 'image';
    }
    function mediaFilterTokens(item){
        const type=normalizedMediaType(item);
        const tokens=[{value:'all',label:'Tous'}];
        if(type==='audio')tokens.push({value:'audio',label:'Audio'});
        else if(type==='video')tokens.push({value:'video',label:'Vidéo'});
        else if(type==='image')tokens.push({value:'photo',label:'Photos'});
        if(String(item.census_ids||'').trim())tokens.push({value:'__census',label:'Documents du recensement'});
        if(Number(item.is_person_photo)||String(item.is_person_photo)==='1')tokens.push({value:'__person_photo',label:'Photo de la personne'});
        return tokens;
    }
    function mediaFilterValue(item){return mediaFilterTokens(item).map(token=>token.value).join(',');}
    function mediaFilterSelect(media){const ordered=[['all','Tous'],['photo','Photos'],['audio','Audio'],['video','Vidéo']];const present=new Set(media.flatMap(item=>mediaFilterTokens(item).map(token=>token.value)));return `<label class="media-filter-label">Afficher <select id="person-media-filter">${ordered.filter(([value])=>value==='all'||present.has(value)).map(([value,label])=>`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}</select></label>`;}
    function mediaOrderPreference(personId){
        try{return JSON.parse(localStorage.getItem(`genealogie-media-order-${personId}`)||'null')||{mode:'chrono',ids:[]};}catch(_){return {mode:'chrono',ids:[]};}
    }
    function setMediaOrderPreference(personId,pref){localStorage.setItem(`genealogie-media-order-${personId}`,JSON.stringify(pref));}
    function sortMediaForDisplay(media,personId){
        const pref=mediaOrderPreference(personId);
        if(pref.mode==='alpha')return [...media].sort((a,b)=>(a.attachment_label||a.title||'').localeCompare(b.attachment_label||b.title||'','fr',{sensitivity:'base'}));
        if(pref.mode==='manual'&&pref.ids?.length){
            const byId=new Map(media.map(item=>[Number(item.id),item]));
            const ordered=pref.ids.map(id=>byId.get(Number(id))).filter(Boolean);
            media.forEach(item=>{if(!pref.ids.includes(Number(item.id)))ordered.push(item);});
            return ordered;
        }
        return [...media].sort((a,b)=>mediaChronologyKey(a)-mediaChronologyKey(b)||(Number(a.id)||0)-(Number(b.id)||0));
    }
    function mediaSortControlsHtml(personId){
        const pref=mediaOrderPreference(personId);
        const isManual=pref.mode==='manual';return `<div class="media-sort-controls"><label class="media-filter-label">Trier <select id="person-media-sort"><option value="chrono" ${pref.mode==='chrono'?'selected':''}>Chronologique</option><option value="alpha" ${pref.mode==='alpha'?'selected':''}>Alphabétique</option><option value="manual" ${pref.mode==='manual'?'selected':''}>Manuel (glisser-déposer)</option></select></label><button type="button" class="icon-action media-order-lock ${isManual?'is-unlocked':'is-disabled'}" id="media-order-lock" data-locked="${isManual?'0':'1'}" aria-label="${isManual?'Verrouiller':'Déverrouiller'} le réordonnancement manuel" title="${isManual?'Verrouiller':'Déverrouiller'} le réordonnancement manuel"><svg viewBox="0 0 24 24" aria-hidden="true">${isManual?'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.3-2.2M12 14v3"/>':'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'}</svg></button></div>`;
    }
    function mediaChronologyKey(item){
        const text=[item.attachment_label,item.date_text,item.document_title,item.document_reference,item.title,item.filename].filter(Boolean).join(' ').toLowerCase();
        let match=text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if(match)return Number(match[3])*10000+Number(match[2])*100+Number(match[1]);
        const months={janvier:1,février:2,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,aout:8,septembre:9,octobre:10,novembre:11,décembre:12,decembre:12};
        match=text.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/);
        if(match)return Number(match[3])*10000+months[match[2]]*100+Number(match[1]);
        match=text.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
        if(match)return Number(match[1])*10000+9999;
        return (Number(item.event_year)||9999)*10000+9999;
    }
    function correspondentListFromValue(raw){
        if(!raw)return [];
        try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed.filter(p=>p&&String(p.name||'').trim()).map(p=>({id:Number(p.id)||0,name:String(p.name).trim()}));}catch(_){/* pas du JSON, on retombe sur la liste texte */}
        return String(raw).split(',').map(name=>name.trim()).filter(Boolean).map(name=>({id:0,name}));
    }
    function renderCorrespondentChips(chipsEl,list){
        if(!chipsEl)return;
        chipsEl.innerHTML=list.map((person,index)=>`<span class="map-route-chip correspondent-chip${person.id?'':' is-freetext'}"><i style="--route-color:${person.id?'var(--blue)':'#f2c500'}"></i>${escapeHtml(person.name)}<button type="button" data-remove-correspondent="${index}" aria-label="Retirer ${escapeHtml(person.name)}">×</button></span>`).join('');
    }
    /** Destinataires / expéditeurs d'une correspondance : menu de choix unique (plusieurs personnes, nom libre accepté).
     *  Le champ caché garde son format : JSON [{id, name}] (id 0 = nom libre). Renvoie {get, set} comme avant. */
    function setupCorrespondentPicker({chipsEl,searchInput,suggestionsEl,hiddenInput}){
        if(!chipsEl||!hiddenInput)return null;
        let list=correspondentListFromValue(hiddenInput.value);
        [chipsEl,searchInput,suggestionsEl].forEach(el=>{if(el)el.hidden=true;});
        const host=document.createElement('div');host.className='correspondent-pk';chipsEl.insertAdjacentElement('afterend',host);
        const toValue=l=>l.map(p=>p.id?{id:Number(p.id),title:p.name,kind:'person'}:`txt:${p.name}`);
        host.innerHTML=pkField({name:'correspondent_pick',kind:'person',multiple:true,allowFree:true,value:toValue(list)});
        const field=host.querySelector('.pk');
        // le menu n'envoie rien lui-même : seul le champ caché d'origine part avec le formulaire
        field.querySelector(':scope > input[type=hidden]')?.removeAttribute('name');
        const sync=()=>{hiddenInput.value=JSON.stringify(list);};
        sync();pkBindQuickCreate(host);
        host.addEventListener('picker-change',event=>{field.querySelector(':scope > input[type=hidden]')?.removeAttribute('name');list=(event.detail.items||[]).map(it=>({id:it.free?0:Number(it.id)||0,name:String(it.title||'').trim()})).filter(p=>p.name);sync();});
        return {get:()=>list.slice(),set:newList=>{list=Array.isArray(newList)?newList.filter(p=>p&&p.name).map(p=>({id:Number(p.id)||0,name:String(p.name)})):[];sync();pkSet(field,toValue(list));field.querySelector(':scope > input[type=hidden]')?.removeAttribute('name');}};
    }
    const correspondenceTypeLabels={lettre:'Lettre',carte_postale:'Carte postale',telegramme:'Télégramme',carte_voeux:'Carte de vœux',faire_part:'Faire-part',autre:'Autre correspondance'};
    function correspondenceTypeLabel(value){const text=String(value||'');return text.startsWith('custom:')?text.slice(7):correspondenceTypeLabels[text]||'Correspondance';}
    function correspondenceMediaOnly(media){return media.filter(item=>String(item.correspondence_type||'').trim()!=='');}
    function mediaTypeShortLabel(item){
        const type=normalizedMediaType(item);
        if(type==='pdf')return 'PDF';
        if(type==='audio')return 'AUDIO';
        if(type==='video')return 'VIDÉO';
        return 'IMG';
    }
    // Icônes SVG (fiables, contrairement aux glyphes texte ♪/▶ qui peuvent ne pas
    // s'afficher selon la police système et apparaître comme un simple point).
    function mediaTypeAudioGlyphSvg(size,extraClass){
        const s=size||28;
        return `<svg class="media-type-glyph${extraClass?` ${extraClass}`:''}" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 8 9 13 4 13 20 8 15 3 15 3 9" fill="currentColor" stroke="none"/><path d="M16.2 8.3a5 5 0 0 1 0 7.4"/><path d="M19 5.5a8.5 8.5 0 0 1 0 13"/></svg>`;
    }
    function mediaTypeVideoGlyphSvg(size,extraClass){
        const s=size||28;
        return `<svg class="media-type-glyph${extraClass?` ${extraClass}`:''}" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="m15 10 5-3v10l-5-3z" fill="currentColor" stroke="none"/></svg>`;
    }
    function mediaTypeIconHtml(item){
        const type=normalizedMediaType(item);
        const label=mediaTypeShortLabel(item);
        if(type==='audio')return `<span class="pdf-mark media-type-mark media-type-icon media-type-audio">${mediaTypeAudioGlyphSvg(28)}<small>${escapeHtml(label)}</small></span>`;
        if(type==='video')return `<span class="pdf-mark media-type-mark media-type-icon media-type-video">${mediaTypeVideoGlyphSvg(28)}<small>${escapeHtml(label)}</small></span>`;
        const icon=type==='pdf'?'PDF':'IMG';
        return `<span class="pdf-mark media-type-mark media-type-icon media-type-${escapeHtml(type)}"><b>${escapeHtml(icon)}</b><small>${escapeHtml(label)}</small></span>`;
    }
    // Petit picto SVG (audio / vidéo) accolé à l'étiquette texte, pour les vignettes
    // qui n'utilisent pas mediaPreviewHtml/mediaTypeIconHtml (listes, galeries, aperçus).
    function mediaTypeShortLabelWithIcon(item){
        const type=normalizedMediaType(item);
        const label=escapeHtml(mediaTypeShortLabel(item));
        if(type==='audio')return `${mediaTypeAudioGlyphSvg(13,'media-type-glyph-mini')} ${label}`;
        if(type==='video')return `${mediaTypeVideoGlyphSvg(13,'media-type-glyph-mini')} ${label}`;
        return label;
    }
    function mediaPreviewHtml(item,alt='Média'){
        const type=normalizedMediaType(item);
        if(type==='image'&&(item.thumbnail||item.filename))return `<img src="media/${encodeURIComponent(item.thumbnail||item.filename)}" alt="${escapeHtml(alt)}" loading="lazy">`;
        return mediaTypeIconHtml(item);
    }
    function memoryMediaOnly(media){return media.filter(item=>['audio','video'].includes(normalizedMediaType(item)));}
    function correspondenceSortPreference(personId){try{return localStorage.getItem(`genealogie-correspondence-sort-${personId}`)||'person_asc';}catch(_){return 'person_asc';}}
    function setCorrespondenceSortPreference(personId,mode){try{localStorage.setItem(`genealogie-correspondence-sort-${personId}`,mode);}catch(_){/* stockage indisponible, on ignore */}}
    // Si cette lettre/carte postale/etc. répond à une autre correspondance déjà enregistrée
    // (champ correspondence_reply_to_media_id), on l'indique et on permet d'ouvrir l'autre pièce.
    function correspondenceReplyTagHtml(item,orderedMedia){
        const replyId=Number(item.correspondence_reply_to_media_id||0);
        if(!replyId)return '';
        const target=(orderedMedia||[]).find(row=>Number(row.id)===replyId);
        const label=target?(target.title||target.attachment_label||target.filename||correspondenceTypeLabel(target.correspondence_type)):`Correspondance #${replyId}`;
        return `<button type="button" class="correspondence-reply-tag" data-open-media="${replyId}" title="Ouvrir la correspondance à laquelle celle-ci répond">↩ Répond à : ${escapeHtml(label)}</button>`;
    }
    function correspondenceItemHtml(item,orderedMedia){
        return `<article class="media-card-item correspondence-item" data-media-card-id="${item.id}"><button class="media-item media-card-preview" draggable="false" data-media-id="${item.id}" data-media-index="${orderedMedia.indexOf(item)}" data-media-types="${escapeHtml(mediaFilterValue(item))}">${mediaPreviewHtml(item,item.title||'Correspondance')}<span>${escapeHtml(item.title || item.attachment_label || 'Document')}</span></button><div class="correspondence-meta"><span class="correspondence-type-badge">${escapeHtml(correspondenceTypeLabel(item.correspondence_type))}</span>${item.date_text?`<small class="correspondence-date">${escapeHtml(item.date_text)}</small>`:''}${item.attachment_label?`<small>${escapeHtml(item.attachment_label)}</small>`:''}${correspondenceReplyTagHtml(item,orderedMedia)}</div></article>`;
    }
    function correspondenceNames(item){
        const list=correspondentListFromValue(item.correspondent_json||item.correspondent_name||'');
        return list.length?list.map(p=>p.name):['Correspondant inconnu'];
    }
    function correspondenceBodyHtml(correspondenceItems,orderedMedia,personId){
        const mode=correspondenceSortPreference(personId);
        if(mode==='alpha'){
            const sorted=[...correspondenceItems].sort((a,b)=>(a.title||a.attachment_label||'').localeCompare(b.title||b.attachment_label||'','fr',{sensitivity:'base'}));
            return `<div class="media-grid media-card-grid correspondence-flat-list">${sorted.map(item=>correspondenceItemHtml(item,orderedMedia)).join('')}</div>`;
        }
        if(mode==='label'){
            const groups=new Map();
            correspondenceItems.forEach(item=>{
                const labels=(item.labels||[]).length?item.labels:[{id:0,name:'Sans étiquette',color:''}];
                labels.forEach(label=>{const key=label.name||'Sans étiquette';if(!groups.has(key))groups.set(key,{color:label.color||'',items:[]});groups.get(key).items.push(item);});
            });
            const keys=[...groups.keys()].sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
            return keys.map(key=>{
                const group=groups.get(key);
                const items=group.items.slice().sort((a,b)=>mediaChronologyKey(a)-mediaChronologyKey(b));
                return `<div class="correspondence-group"><h4 class="correspondence-group-title">${group.color?`<span class="correspondence-group-label-swatch" style="background:${escapeHtml(group.color)}"></span>`:''}${escapeHtml(key)} <small>(${items.length})</small></h4><div class="media-grid media-card-grid">${items.map(item=>correspondenceItemHtml(item,orderedMedia)).join('')}</div></div>`;
            }).join('');
        }
        const groups=new Map();
        correspondenceItems.forEach(item=>{correspondenceNames(item).forEach(key=>{if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});});
        let keys=[...groups.keys()].sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
        if(mode==='person_desc')keys.reverse();
        return keys.map(key=>{
            const items=groups.get(key).slice().sort((a,b)=>mediaChronologyKey(a)-mediaChronologyKey(b));
            return `<div class="correspondence-group"><h4 class="correspondence-group-title">${escapeHtml(key)} <small>(${items.length})</small></h4><div class="media-grid media-card-grid">${items.map(item=>correspondenceItemHtml(item,orderedMedia)).join('')}</div></div>`;
        }).join('');
    }
    function correspondenceSortControlsHtml(personId){
        const mode=correspondenceSortPreference(personId);
        return `<label class="media-filter-label">Trier <select id="person-correspondence-sort"><option value="person_asc" ${mode==='person_asc'?'selected':''}>Par correspondant (A → Z)</option><option value="person_desc" ${mode==='person_desc'?'selected':''}>Par correspondant (Z → A)</option><option value="label" ${mode==='label'?'selected':''}>Par étiquette (ex. « Correspondance 1914-1918 »)</option><option value="alpha" ${mode==='alpha'?'selected':''}>Alphabétique (sans le correspondant)</option></select></label>`;
    }
    function empty(text, o = {}) { return emptyState({...o, text}); }
    function linkify(value = '') { return escapeHtml(value).replace(/(https?:\/\/[^\s<]+)/g, '<a class="table-link" href="$1" target="_blank" rel="noopener">$1</a>'); }

    function savePersonExportSettingsFromDialog(dialog,personId){
        const list=$('#person-export-blocks',dialog);
        if(!list)return false;
        const rows=$$('.order-row',list);
        const order=rows.map(row=>row.dataset.orderKey).filter(Boolean);
        const hidden=rows.filter(row=>!$('.order-visible input',row)?.checked).map(row=>row.dataset.orderKey);
        const widths=Object.fromEntries(rows.map(row=>[row.dataset.orderKey,$('.block-widths [aria-pressed="true"]',row)?.dataset.blockWidth||defaultPersonBlockSpans[row.dataset.orderKey]||'12']));
        const hideEmptyIdentity=!!$('[data-hide-empty-identity]',dialog)?.checked;
        savePersonBlockSettings({order,hidden,widths,hideEmptyIdentity},personId);
        return true;
    }
    function openPersonExportDialog(detail){
        $('#person-export-dialog')?.remove();
        const personId=Number(detail.person.id)||0;
        const settings=personBlockSettings(personId);
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal person-export-dialog" id="person-export-dialog"><div class="modal-head"><div><span class="eyebrow">EXPORT FICHE</span><h2>Personnaliser l’export</h2><p>${escapeHtml(personName(detail.person))}</p></div><button class="icon-button" type="button" data-person-export-close>×</button></div><div class="person-export-settings">${blockOrderEditor('person-export-blocks','Ordre, tailles et blocs exportés',settings,personId)}<p class="person-export-help">Ces réglages s’appliquent à cette fiche et donc au PDF généré par impression.</p></div><div class="modal-actions"><button class="button secondary" type="button" data-person-export-reset="${personId}">Revenir aux réglages globaux</button><span class="spacer"></span><button class="button secondary" type="button" data-person-export-close>Annuler</button><button class="button secondary" type="button" data-person-export-print>Enregistrer et imprimer</button><button class="button" type="button" data-person-export-save>Enregistrer</button></div></dialog>`);
        const dialog=$('#person-export-dialog');
        const close=()=>{dialog.close();dialog.remove();};
        $$('[data-person-export-close]',dialog).forEach(button=>button.addEventListener('click',close));
        $$('[data-block-width]',dialog).forEach(button=>button.addEventListener('click',()=>{const group=button.closest('.block-widths');$$('[data-block-width]',group).forEach(item=>item.setAttribute('aria-pressed',String(item===button)));}));
        const list=$('#person-export-blocks',dialog);
        if(list)setupDragOrder(list);
        $('[data-person-export-reset]',dialog)?.addEventListener('click',async()=>{
            localStorage.removeItem(`genealogie-person-blocks-${personId}`);
            toast('Réglages de cette fiche réinitialisés.');
            close();
            await selectPerson(personId,false);
        });
        $('[data-person-export-save]',dialog)?.addEventListener('click',async()=>{
            if(savePersonExportSettingsFromDialog(dialog,personId)){
                toast('Export de cette fiche personnalisé.');
                close();
                await selectPerson(personId,false);
            }
        });
        $('[data-person-export-print]',dialog)?.addEventListener('click',async()=>{
            if(savePersonExportSettingsFromDialog(dialog,personId)){
                close();
                await selectPerson(personId,false);
                setTimeout(()=>window.print(),60);
            }
        });
        dialog.showModal();
    }

    async function openPersonHistoryDialog(personId, detail = null) {
        let dialog = $('#person-history-dialog');
        if (!dialog) {
            document.body.insertAdjacentHTML('beforeend', `<dialog class="modal person-history-modal" id="person-history-dialog"><div class="modal-head"><div><span class="eyebrow">HISTORIQUE</span><h2 id="person-history-title">Historique de la fiche</h2></div><button class="modal-close" data-close-person-history aria-label="Fermer">×</button></div><div class="modal-body" id="person-history-body"></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" data-close-person-history>Fermer</button></div></dialog>`);
            dialog = $('#person-history-dialog');
            $$('[data-close-person-history]', dialog).forEach(button => button.addEventListener('click', () => dialog.close()));
        }
        $('#person-history-title').textContent = detail?.person ? `Historique de ${personName(detail.person)}` : 'Historique de la fiche';
        const body = $('#person-history-body');
        body.innerHTML = '<div class="loading-block">Chargement de l’historique…</div>';
        dialog.showModal();
        try {
            const data = await api('person_history', {id: personId});
            const rows = data.changes || [];
            body.innerHTML = rows.length ? `<div class="person-history-list">${rows.map(row => {
                const label = row.entity_label || `${row.entity_type || 'élément'} #${row.entity_id || '—'}`;
                const technical = `${row.entity_type || 'élément'} #${row.entity_id || '—'} · ${row.action || ''}`;
                const restore = row.restore_available
                    ? `<button type="button" class="button small secondary" data-person-history-restore="${row.id}">Restaurer</button>`
                    : row.restore_blocked
                        ? `<button type="button" class="button small secondary is-disabled" disabled title="${escapeHtml(row.restore_block_reason || 'Restauration bloquée')}">Restaurer</button>`
                        : '';
                const details = (row.before_json || row.after_json) ? `<details class="change-json-details"><summary>Détails</summary><pre>Avant\n${escapeHtml(row.before_json || '—')}\n\nAprès\n${escapeHtml(row.after_json || '—')}</pre></details>` : '';
                return `<article class="person-history-row"><time>${escapeHtml(row.created_at || '')}</time><div><h3>${escapeHtml(row.summary || row.action || 'Modification')}</h3><p><strong>${escapeHtml(label)}</strong> · ${escapeHtml(technical)}</p>${row.changed_fields?.length ? `<small>Champs modifiés : ${escapeHtml(row.changed_fields.slice(0, 10).join(', '))}${row.changed_fields.length > 10 ? '…' : ''}</small>` : ''}${row.restore_blocked ? `<small class="cell-muted">${escapeHtml(row.restore_block_reason || 'Restauration bloquée')}</small>` : ''}${details}</div>${restore}</article>`;
            }).join('')}</div>` : empty('Aucune modification enregistrée pour cette fiche.',{icon:'🕘'});
            $$('[data-person-history-restore]', body).forEach(button => button.addEventListener('click', async () => {
                if (!await confirmBox('L’élément supprimé sera remis dans la base.', {title: 'Restaurer cette suppression ?', okLabel: 'Restaurer', danger: false})) return;
                button.disabled = true;
                try {
                    await api('restore_change', {}, {method: 'POST', body: {id: button.dataset.personHistoryRestore}});
                    toast('Suppression restaurée.');
                    dialog.close();
                    await selectPerson(personId);
                } catch (error) {
                    button.disabled = false;
                    toast(error.message, 'error');
                }
            }));
        } catch (error) {
            body.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
        }
    }

    function bindPersonPage(detail) {
        bindWebSearchPanels($('#workspace'));
        bindLineageDepthControls(detail);fillLineageBlocks(detail);
        $$('[data-edit-person-inline]').forEach(button=>button.addEventListener('click',()=>openPersonDialog(detail)));
        $$('[data-online-sheets-fold]').forEach(fold=>fold.addEventListener('toggle',()=>{try{localStorage.setItem('genealogie-online-sheets-open',fold.open?'1':'0');}catch(_){}}));
        $$('[data-identity-empty]').forEach(button=>button.addEventListener('click',()=>{setIdentityEmpty(button.dataset.identityEmpty,button.dataset.hide==='1',Number(button.dataset.person));renderPerson(detail);}));
        $$('[data-delete-person]').forEach(button=>button.addEventListener('click',()=>deletePerson(detail)));
        $$('[data-toggle-bookmark]').forEach(button=>button.addEventListener('click',()=>togglePersonBookmark().catch(error=>toast(error.message,'error'))));
        $$('[data-person-history]').forEach(button=>button.addEventListener('click',()=>openPersonHistoryDialog(Number(button.dataset.personHistory),detail)));
        $$('[data-edit-military]').forEach(button=>button.addEventListener('click',()=>openMilitaryDialog(detail)));
        $$('[data-edit-grave]').forEach(button=>button.addEventListener('click',()=>openGraveDialog(detail)));
        $$('[data-delete-grave]').forEach(button=>button.addEventListener('click',async()=>{
            if(!await confirmBox('Les personnes qui y sont rattachées ne seront plus liées.',{title:'Supprimer définitivement cette sépulture ?',okLabel:'Supprimer la sépulture'}))return;
            try{await api('delete_grave',{},{method:'POST',body:{grave_id:button.dataset.deleteGrave}});toast('Sépulture supprimée.');await selectPerson(detail.person.id);}catch(error){toast(error.message,'error');}
        }));
        $$('[data-add-grave-person]').forEach(button=>button.addEventListener('click',()=>openAddGravePersonDialog(detail,Number(button.dataset.addGravePerson))));
        $$('[data-remove-grave-person]').forEach(button=>button.addEventListener('click',async()=>{
            if(!await confirmBox('Sa fiche n’est pas supprimée.',{title:'Retirer cette personne de la sépulture ?',okLabel:'Retirer'}))return;
            try{await api('remove_grave_person',{},{method:'POST',body:{grave_id:button.dataset.graveId,person_id:button.dataset.removeGravePerson}});toast('Personne retirée de la sépulture.');await selectPerson(detail.person.id);}catch(error){toast(error.message,'error');}
        }));
        $$('[data-manage-grave-media]').forEach(button=>button.addEventListener('click',()=>openEntityMediaDialog(detail,'grave',Number(button.dataset.manageGraveMedia),'CIMETIÈRE','Ajouter ou lier une photo de la sépulture')));
        $$('[data-view-grave-photo]').forEach(button=>button.addEventListener('click',()=>{const photos=(detail.grave?.photos||[]);if(photos.length)openLightbox(photos,Number(button.dataset.viewGravePhoto));}));
        $$('[data-toggle-person-lock]').forEach(button=>button.addEventListener('click',async()=>{
            try{
                const locked=Number(button.dataset.lockValue)||0;
                await api('set_person_lock',{}, {method:'POST',body:{person_id:button.dataset.togglePersonLock,locked}});
                toast(locked?'Fiche verrouillée.':'Fiche déverrouillée.');
                await selectPerson(detail.person.id);
            }catch(error){toast(error.message,'error');}
        }));
        $$('[data-print-person]').forEach(button=>button.addEventListener('click',()=>window.print()));
        $$('[data-export-person-json]').forEach(button=>button.addEventListener('click',()=>{
            const payload={exported_at:new Date().toISOString(),person:detail.person,events:detail.events,parents:detail.parents,partners:detail.partners,children:detail.children,notes:detail.notes,media:detail.media,sources:detail.sources,investigations:detail.investigations,battues:detail.battues};
            const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
            const link=document.createElement('a');
            link.href=URL.createObjectURL(blob);
            link.download=`fiche-${detail.person.id}-${(personName(detail.person)||'personne').toLowerCase().replace(/[^a-z0-9]+/gi,'-')}.json`;
            link.click();
            setTimeout(()=>URL.revokeObjectURL(link.href),1000);
        }));
        $$('[data-customize-person-export]').forEach(button=>button.addEventListener('click',()=>openPersonExportDialog(detail)));
        $$('[data-add-event-inline]').forEach(button=>button.addEventListener('click',()=>openEventDialog(detail)));
        $$('[data-add-event-inline-artistic]').forEach(button=>button.addEventListener('click',()=>openEventDialog(detail,null,true)));
        $$('[data-add-family-event-inline]').forEach(button=>button.addEventListener('click',()=>openEventDialog(detail,null,false,true)));
        $$('[data-add-media-inline]').forEach(button=>button.addEventListener('click',()=>openMediaDialog(detail)));
        $$('[data-add-correspondence-inline]').forEach(button=>button.addEventListener('click',()=>openMediaDialog(detail,{correspondence:true})));
        $$('[data-add-memory-inline]').forEach(button=>button.addEventListener('click',()=>openMediaDialog(detail,{memory:true})));
        $$('[data-add-note-inline]').forEach(button=>button.addEventListener('click',()=>openNoteDialog(detail.person.id)));
        $$('[data-add-online-sheet]').forEach(button=>button.addEventListener('click',()=>openOnlineSheetDialog(detail.person.id)));
        $$('[data-online-shot-open]').forEach(button=>button.addEventListener('click',()=>{const sheet=(detail.onlineSheets||[]).find(item=>Number(item.id)===Number(button.dataset.onlineShotOpen));if(sheet)openLightbox([{id:sheet.screenshot_media_id,filename:sheet.screenshot_filename,thumbnail:sheet.screenshot_thumbnail,media_type:'image',title:sheet.screenshot_title||'Capture de l’arbre'}],0,true);}));
        $$('[data-edit-online-sheet]').forEach(button=>button.addEventListener('click',()=>openOnlineSheetDialog(detail.person.id,(detail.onlineSheets||[]).find(item=>Number(item.id)===Number(button.dataset.editOnlineSheet)))));
        $$('[data-delete-online-sheet]').forEach(button=>button.addEventListener('click',async()=>{
            if(!await confirmBox('',{title:'Supprimer cette fiche en ligne ?',okLabel:'Supprimer la fiche en ligne'}))return;
            try{await api('delete_online_sheet',{},{method:'POST',body:{id:button.dataset.deleteOnlineSheet}});toast('Fiche en ligne supprimée.');await selectPerson(detail.person.id);}catch(error){toast(error.message,'error');}
        }));
        $$('[data-add-source-inline]').forEach(button=>button.addEventListener('click',()=>openSourceDialog(detail.person.id)));
        $$('[data-open-person]').forEach(button => button.addEventListener('click', () => selectPerson(Number(button.dataset.openPerson))));
        $$('[data-open-media]').forEach(button=>button.addEventListener('click',()=>{const id=Number(button.dataset.openMedia);const media=(detail.media||[]).filter(row=>row.filename);const index=media.findIndex(row=>Number(row.id)===id);if(index>=0)openLightbox(media,index,true);}));
        $$('[data-add-relation]').forEach(button => button.addEventListener('click',()=>openRelationDialog(detail.person.id,button.dataset.addRelation)));
        $$('[data-new-investigation]').forEach(button=>button.addEventListener('click',()=>openInvestigationDialog(Number(button.dataset.newInvestigation))));
        $$('[data-new-battue]').forEach(button=>button.addEventListener('click',()=>openBattueDialog(null,[{person_id:Number(button.dataset.newBattue),person_name:personName(detail.person),role:'primary'}])));
        $$('[data-open-investigation]').forEach(button=>button.addEventListener('click',()=>{state.currentInvestigationId=Number(button.dataset.openInvestigation);state.investigationFolderId=0;setModule('enquetes');}));
        $$('[data-open-battue-from-person]').forEach(button=>button.addEventListener('click',()=>{state.enquetesTab='battue';state.currentInvestigationId=0;state.currentBattueId=Number(button.dataset.openBattueFromPerson);setModule('enquetes');}));
        $$('[data-add-event-source]').forEach(button=>button.addEventListener('click',()=>openSourceDialog(detail.person.id,null,Number(button.dataset.addEventSource))));
        $$('[data-person-map-lat]').forEach(button=>button.addEventListener('click',()=>{state.mapCenter={lat:Number(button.dataset.personMapLat),lon:Number(button.dataset.personMapLon)};state.mapZoom=12;state.mapTag='all';state.mapDisplay='markers';state.mapKeepCenter=true;setModule('carte');}));
        $$('[data-person-map-lat].person-map-point').forEach(point=>point.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();point.dispatchEvent(new MouseEvent('click',{bubbles:true}));}}));
        (()=>{
            const setHover=(place,active)=>{
                $$('.person-map-point[data-person-map-place]').forEach(pt=>{if(pt.dataset.personMapPlace===place)pt.classList.toggle('is-hovered',active);});
                $$('.person-map-list [data-person-map-place]').forEach(btn=>{if(btn.dataset.personMapPlace===place)btn.classList.toggle('is-hovered',active);});
            };
            $$('.person-map-point[data-person-map-place]').forEach(pt=>{pt.addEventListener('mouseenter',()=>setHover(pt.dataset.personMapPlace,true));pt.addEventListener('mouseleave',()=>setHover(pt.dataset.personMapPlace,false));});
            $$('.person-map-list [data-person-map-place]').forEach(btn=>{btn.addEventListener('mouseenter',()=>setHover(btn.dataset.personMapPlace,true));btn.addEventListener('mouseleave',()=>setHover(btn.dataset.personMapPlace,false));});
        })();
        $$('[data-map-sort]').forEach(btn=>btn.addEventListener('click',()=>{
            const mode=btn.dataset.mapSort;
            $$('[data-map-sort]').forEach(b=>{b.classList.toggle('is-active',b===btn);b.setAttribute('aria-pressed',String(b===btn));});
            const list=$('.person-map-list');if(!list)return;
            const items=[...list.querySelectorAll('[data-person-map-place]')];
            if(mode==='alpha'){
                items.sort((a,b)=>(a.querySelector('strong')?.textContent||'').localeCompare(b.querySelector('strong')?.textContent||'','fr',{sensitivity:'base'}));
            } else {
                items.sort((a,b)=>{
                    const ya=Number(a.dataset.placeYear)||Infinity,yb=Number(b.dataset.placeYear)||Infinity;
                    return ya-yb||(a.querySelector('strong')?.textContent||'').localeCompare(b.querySelector('strong')?.textContent||'','fr',{sensitivity:'base'});
                });
            }
            items.forEach(item=>list.append(item));
        }));
        $$('[data-add-event-hypothesis]').forEach(button=>button.addEventListener('click',()=>openHypothesisDialog(detail.person.id,detail,null,Number(button.dataset.addEventHypothesis))));
        $$('[data-edit-hypothesis]').forEach(button=>button.addEventListener('click',()=>openHypothesisDialog(detail.person.id,detail,detail.hypotheses.find(item=>Number(item.id)===Number(button.dataset.editHypothesis)))));
        $$('[data-delete-hypothesis]').forEach(button=>button.addEventListener('click',async()=>{if(!await confirmBox('',{title:'Supprimer cette hypothèse ?',okLabel:'Supprimer l’hypothèse'}))return;await api('delete_hypothesis',{}, {method:'POST',body:{id:button.dataset.deleteHypothesis}});toast('Hypothèse supprimée.');await selectPerson(detail.person.id);}));
        $$('[data-add-event-evidence]').forEach(button=>button.addEventListener('click',()=>openEvidenceDialog(detail.person.id,detail,null,Number(button.dataset.addEventEvidence))));
        $$('[data-edit-evidence]').forEach(button=>button.addEventListener('click',()=>openEvidenceDialog(detail.person.id,detail,detail.evidence.find(item=>Number(item.id)===Number(button.dataset.editEvidence)))));
        $$('[data-delete-evidence]').forEach(button=>button.addEventListener('click',async()=>{if(!await confirmBox('',{title:'Supprimer cette preuve ?',okLabel:'Supprimer la preuve'}))return;await api('delete_evidence',{}, {method:'POST',body:{id:button.dataset.deleteEvidence}});toast('Preuve supprimée.');await selectPerson(detail.person.id);}));
        $$('[data-remove-relation]').forEach(button => button.addEventListener('click',async()=>{
            const related=[...detail.parents,...detail.partners,...detail.children].find(person=>Number(person.id)===Number(button.dataset.relatedId));
            if(!await confirmBox('Le lien de parenté est retiré ; aucune fiche n’est supprimée.',{title:`Retirer ${personName(related||{})} des ${button.dataset.removeRelation==='spouse'?'conjoints':button.dataset.removeRelation==='parent'?'parents':'enfants'} ?`,okLabel:'Retirer le lien'}))return;
            try{await api('remove_relation',{}, {method:'POST',body:{person_id:detail.person.id,related_id:button.dataset.relatedId,relation_type:button.dataset.removeRelation}});toast('Relation retirée.');await selectPerson(detail.person.id);}catch(error){toast(error.message,'error');}
        }));
        $$('[data-media-index]').forEach(button => button.addEventListener('click', () => openLightbox(detail.media,Number(button.dataset.mediaIndex))));
        $$('[data-view-event-media]').forEach(button => button.addEventListener('click',()=>{const items=mediaForEvent(detail.media,Number(button.dataset.viewEventMedia));if(items.length)openLightbox(items,0);}));
        $$('[data-view-census-media]').forEach(button => button.addEventListener('click',()=>{const items=mediaForCensus(detail.media,Number(button.dataset.viewCensusMedia));if(items.length)openLightbox(items,0);}));
        $$('[data-view-military-media]').forEach(button => button.addEventListener('click',()=>{const items=mediaForMilitary(detail.media,Number(button.dataset.viewMilitaryMedia));if(items.length)openLightbox(items,0);}));
        $$('[data-toggle-census-details]').forEach(button => button.addEventListener('click',()=>{setCensusDetailsPreference(detail.person.id,button.dataset.censusDetailsValue);selectPerson(detail.person.id);}));
        $$('[data-reset-census-details]').forEach(button => button.addEventListener('click',()=>{resetCensusDetailsPreference(detail.person.id);selectPerson(detail.person.id);}));
        $$('[data-manage-census-media]').forEach(button => button.addEventListener('click',()=>openCensusMediaDialog(detail,Number(button.dataset.manageCensusMedia))));
        $$('[data-add-special-census]').forEach(button => button.addEventListener('click',async()=>{
            const value=await askText({title:'Recensement spécial',message:'Année du recensement spécial (par exemple 1946) :',placeholder:'1946',okLabel:'Continuer',inputMode:'numeric'});
            if(value===null)return;
            const year=Number(String(value).trim());
            if(!Number.isInteger(year)||year<1700||year>2100){toast('Année invalide pour un recensement spécial.','error');return;}
            openCensusDialog(detail,year,null,{special:true});
        }));
        $$('[data-edit-census-year]').forEach(button => button.addEventListener('click',()=>openCensusDialog(detail,Number(button.dataset.editCensusYear),detail.census?.records?.find(record=>Number(record.id)===Number(button.dataset.censusId)))));
        $$('[data-edit-census]').forEach(button => button.addEventListener('click',()=>{const record=detail.census?.records?.find(item=>Number(item.id)===Number(button.dataset.editCensus));if(record)openCensusDialog(detail,Number(record.year),record);}));
        $$('[data-delete-census]').forEach(button => button.addEventListener('click',async()=>{if(!await confirmBox('Le recensement sera supprimé avec tous les membres du foyer liés à cette année.',{title:'Supprimer ce recensement complet ?',okLabel:'Supprimer le recensement'}))return;try{await api('delete_census_record',{}, {method:'POST',body:{id:button.dataset.deleteCensus}});toast('Recensement supprimé.');await selectPerson(detail.person.id);}catch(error){toast(error.message,'error');}}));
        $$('[data-add-census-member]').forEach(button => button.addEventListener('click',()=>openCensusMemberDialog(Number(button.dataset.addCensusMember),detail.person.id)));
        $$('[data-edit-census-member]').forEach(button => button.addEventListener('click',()=>{const memberId=Number(button.dataset.editCensusMember);const record=(detail.census?.records||[]).find(item=>(item.members||[]).some(member=>Number(member.id)===memberId));const member=record?.members?.find(item=>Number(item.id)===memberId);if(record&&member)openCensusMemberDialog(Number(record.id),detail.person.id,member);}));
        $$('[data-delete-census-member]').forEach(button => button.addEventListener('click',async()=>{if(!await confirmBox('Sa fiche n’est pas supprimée.',{title:'Retirer cette personne du foyer recensé ?',okLabel:'Retirer'}))return;try{await api('delete_census_member',{}, {method:'POST',body:{id:button.dataset.deleteCensusMember}});toast('Membre retiré du foyer.');await selectPerson(detail.person.id);}catch(error){toast(error.message,'error');}}));
        $('#person-media-filter')?.addEventListener('change',event=>{$$('[data-media-index]').forEach(button=>{const hidden=event.target.value!=='all'&&!button.dataset.mediaTypes.split(',').map(type=>type.trim()).includes(event.target.value);const card=button.closest('.media-card-item');if(card)card.hidden=hidden;else button.hidden=hidden;});});
        $('#event-display-mode')?.addEventListener('change',event=>{state.eventDisplayMode=event.target.value;persistUiState();selectPerson(state.currentPersonId);});
        $('#person-correspondence-sort')?.addEventListener('change',event=>{setCorrespondenceSortPreference(detail.person.id,event.target.value);selectPerson(detail.person.id);});
        $('#person-media-sort')?.addEventListener('change',event=>{
            const pref=mediaOrderPreference(detail.person.id);
            pref.mode=event.target.value;
            setMediaOrderPreference(detail.person.id,pref);
            selectPerson(detail.person.id);
        });
        $('#media-order-lock')?.addEventListener('click',event=>{
            const button=event.currentTarget;
            if(button.classList.contains('is-disabled')){toast('Choisis le tri « Manuel » pour activer le glisser-déposer.');return;}
            const locked=button.dataset.locked!=='0';
            button.dataset.locked=locked?'0':'1';
            button.classList.toggle('is-unlocked',locked);
            button.querySelector('svg').innerHTML=locked?'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.3-2.2M12 14v3"/>':'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>';
            button.setAttribute('aria-label',locked?'Verrouiller le réordonnancement manuel':'Déverrouiller le réordonnancement manuel');
            button.title=button.getAttribute('aria-label');
            $('#person-media-grid')?.classList.toggle('drag-unlocked',locked);
            $$('#person-media-grid .media-item').forEach(item=>item.draggable=locked);
        });
        setupMediaDragOrder($('#person-media-grid'),detail.person.id);
        $('#portrait-order-lock')?.addEventListener('click',event=>{
            const button=event.currentTarget;
            const locked=button.dataset.locked!=='0';
            button.dataset.locked=locked?'0':'1';
            button.classList.toggle('is-unlocked',locked);
            button.setAttribute('aria-label',locked?'Verrouiller le réordonnancement des portraits':'Déverrouiller le réordonnancement des portraits');
            button.title=button.getAttribute('aria-label');
            $('#person-portrait-grid')?.classList.toggle('drag-unlocked',locked);
            $$('#person-portrait-grid .media-item').forEach(item=>item.draggable=locked);
        });
        setupMediaDragOrder($('#person-portrait-grid'),detail.person.id,'#portrait-order-lock');
        $$('[data-maternity-toggle]').forEach(input=>input.addEventListener('change',()=>{const timeline=input.closest('.maternity-timeline');if(!timeline)return;$$('[data-maternity-toggle]',timeline).forEach(toggle=>timeline.classList.toggle(`hide-${toggle.dataset.maternityToggle}`,!toggle.checked));}));
        $$('[data-maternity-gap-status]').forEach(select=>select.addEventListener('change',()=>{
            saveMaternityGapStatus(Number(select.dataset.personId),select.dataset.maternityGapStatus,select.value);
            const gap=select.closest('.maternity-gap');
            if(gap){
                gap.classList.remove('not_verified','verified_empty','probably_empty');
                gap.classList.add(select.value);
            }
            $$(`[data-gap-jump="${select.dataset.maternityGapStatus}"]`).forEach(band=>{
                band.classList.remove('not_verified','verified_empty','probably_empty');
                band.classList.add(select.value);
                band.title=band.title.replace(/ · .+$/,'')+` · ${maternityGapStatusLabel(select.value)}`;
            });
        }));
        $$('[data-gap-jump]').forEach(button=>button.addEventListener('click',()=>{
            const gap=$(`[data-maternity-gap-key="${button.dataset.gapJump}"]`);
            if(!gap)return;
            gap.scrollIntoView({block:'nearest',behavior:'smooth'});
            gap.classList.add('is-highlighted');
            setTimeout(()=>gap.classList.remove('is-highlighted'),1200);
        }));
        $$('[data-edit-event]').forEach(button => button.addEventListener('click', () => {
            const eventItem=detail.events.find(item => Number(item.id) === Number(button.dataset.editEvent));
            const eventType=(state.bootstrap?.eventTypes||[]).find(t=>Number(t.id)===Number(eventItem?.event_type_id));
            openEventDialog(detail, eventItem, !!Number(eventType?.is_artistic));
        }));
        $$('[data-delete-event]').forEach(button => button.addEventListener('click', async () => {
            const item = detail.events.find(event => Number(event.id) === Number(button.dataset.deleteEvent));
            if (!await confirmBox('', {title: `Supprimer l’événement « ${item?.type_label || 'sélectionné'} » ?`, okLabel: 'Supprimer l’événement'})) return;
            try { await api('delete_event',{}, {method:'POST',body:{id:button.dataset.deleteEvent}}); toast('Événement supprimé.'); await selectPerson(state.currentPersonId); } catch (error) { toast(error.message,'error'); }
        }));
        $$('[data-edit-note]').forEach(button => button.addEventListener('click', () => openNoteDialog(detail.person.id, detail.notes.find(item => Number(item.id) === Number(button.dataset.editNote)))));
        $$('[data-delete-note]').forEach(button => button.addEventListener('click', async () => {
            if (!await confirmBox('', {title: 'Supprimer cette note ?', okLabel: 'Supprimer la note'})) return;
            try { await api('delete_note',{}, {method:'POST',body:{id:button.dataset.deleteNote}}); toast('Note supprimée.'); await selectPerson(state.currentPersonId); } catch (error) { toast(error.message,'error'); }
        }));
        $$('[data-edit-source]').forEach(button => button.addEventListener('click', () => openSourceDialog(detail.person.id, detail.sources.find(item => Number(item.id) === Number(button.dataset.editSource) && String(item.link_id || '') === String(button.dataset.sourceLink || '')) || detail.sources.find(item => Number(item.id) === Number(button.dataset.editSource)))));
        $$('[data-delete-source]').forEach(button => button.addEventListener('click', async () => {
            if (!await confirmBox('', {title: 'Supprimer cette source ou citation ?', okLabel: 'Supprimer'})) return;
            try { await api('delete_source',{}, {method:'POST',body:{id:button.dataset.deleteSource,link_id:button.dataset.sourceLink || 0}}); toast('Source supprimée.'); await selectPerson(state.currentPersonId); } catch (error) { toast(error.message,'error'); }
        }));
        bindEntityLabelsFields();
    }

    async function deletePerson(detail) {
        const person = detail.person;
        const name = personName(person);
        const message = `Supprimer définitivement la fiche « ${name} » ?\n\nLes relations, événements, notes, variantes, enquêtes et liens directs seront retirés. Les fichiers médias restent sur le disque, mais leurs liens à cette fiche seront supprimés.\n\nTape SUPPRIMER pour confirmer.`;
        if ((await askText({title:'Supprimer cette fiche',message:message.replace(/\n\nTape SUPPRIMER pour confirmer\.$/,''),okLabel:'Supprimer définitivement',danger:true,confirmWord:'SUPPRIMER'})) === null) return;
        try {
            await api('delete_person', {}, {method:'POST', body:{id:person.id}});
            toast('Fiche supprimée.');
            await loadPeople();
            const nextId = state.people[0]?.id || 0;
            if (nextId) await selectPerson(nextId, false);
            else $('#workspace').innerHTML = `<section class="page">${empty('Aucune personne pour l’instant', {icon: '👤', hint: 'Crée la première fiche, ou importe un fichier GEDCOM depuis Maintenance → Import.', action: {label: '＋ Nouvelle personne', attrs: 'data-empty-click="#new-person"'}})}</section>`;
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    /* 📊 Graphiques : dans app-graphiques.js (chargé juste après app.js) ; ici, des relais. */
    async function renderGraph(...a){const f=await appPartReady('renderGraph');if(f)return f(...a);$('#workspace').innerHTML=empty('Les graphiques n’ont pas pu se charger (fichier app-graphiques.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderGraphSidebar(...a){const f=appPart('renderGraphSidebar');if(f)return f(...a);}

    function sideButton(value,index,label,current){return `<button class="side-menu-item ${value===current?'is-active':''}" data-side-value="${value}"><span class="side-number">${index}</span>${label}</button>`;}
    const STATS_MODES = new Set(['stats','distribution']);
    function savedViewPersonLabel(view){
        if(STATS_MODES.has(view.config?.mode)||view.config?.mode==='place_monograph'||view.module!=='graph')return null;
        const pid=Number(view.config?.personId||0); if(!pid)return null;
        const p=state.people.find(p=>Number(p.id)===pid);
        return p?personName(p):`Personne #${pid}`;
    }
    function savedView(view){
        const sub=savedViewPersonLabel(view);
        return `<div class="saved-item order-row" draggable="false" data-view-id="${view.id}">`+
            `<span class="order-grip saved-grip" draggable="true" title="Déplacer" aria-hidden="true">⠿</span>`+
            `<div class="saved-item-body">`+
                `<span class="saved-item-name">${escapeHtml(view.name)}</span>`+
                (sub?`<small class="saved-item-person">👤 ${escapeHtml(sub)}</small>`:'')+
                labelsHtml(view.labels||[])+
            `</div>`+
            `<button class="saved-edit" data-edit-view="${view.id}" title="Modifier" aria-label="Modifier cette vue">✎</button>`+
            `<button class="saved-delete" data-delete-view="${view.id}" title="Supprimer" aria-label="Supprimer cette vue">×</button>`+
        `</div>`;
    }




    /* Distributions : filtres de départ pour toutes (années, limite, sexe, critères) — Graphiques → ⚙️ Réglages par défaut */
    const statsFilterNow=()=>({from:state.graphStatsYearFrom||'',to:state.graphStatsYearTo||'',limit:state.graphStatsLimit||'',gender:state.graphStatsGender||'',rules:(Array.isArray(state.graphStatsRules)?state.graphStatsRules:[]).filter(r=>r&&r.field)});
    const statsDefaultsSaved=()=>{try{return !!localStorage.getItem('genealogie-stats-defaults');}catch(_){return false;}};
    function statsDefaults(){let v={};try{v=JSON.parse(localStorage.getItem('genealogie-stats-defaults')||'{}')||{};}catch(_){}const s=x=>String(x??'').replace(/\D/g,'').slice(0,4);return {from:s(v.from),to:s(v.to),limit:s(v.limit),gender:['male','female','unknown'].includes(v.gender)?v.gender:'',rules:Array.isArray(v.rules)?v.rules.filter(r=>r&&typeof r.field==='string').slice(0,40):[]};}
    function applyStatsDefaults(){const d=statsDefaults();state.graphStatsYearFrom=d.from;state.graphStatsYearTo=d.to;state.graphStatsLimit=d.limit;state.graphStatsGender=d.gender;state.graphStatsRules=JSON.parse(JSON.stringify(d.rules));}
    function statsFilterSummary(d){const rl=window.LCNDA_EXT?.listRules?.()||{};return [d.from||d.to?`années ${d.from||'…'} à ${d.to||'…'}`:'',d.limit?`les ${d.limit} premiers`:'',d.gender?{male:'hommes',female:'femmes',unknown:'sexe inconnu'}[d.gender]:'',...d.rules.map(r=>(r.not?'pas : ':'')+(rl[r.field]?.pe||r.field).toLowerCase()+(r.value?` « ${r.value} »`:'')+(r.from||r.to?` ${r.from??'…'}–${r.to??'…'}`:''))].filter(Boolean).join(' · ')||'toutes les données';}
    // première visite des distributions (rien de mémorisé) : les filtres de départ
    if(persisted.graphStatsYearFrom===undefined&&persisted.graphStatsRules===undefined)applyStatsDefaults();

    async function renderGraphStats(token=++state.workspaceToken) {
        if(state.graphStatsType==='saint_names')return renderSaintStats(token);
        if(String(state.graphStatsType).startsWith('cw_')&&window.LCNDA_EXT?.renderCustomStat)return window.LCNDA_EXT.renderCustomStat(token,state.graphStatsType);
        if(window.LCNDA_EXT?.graphStats?.[state.graphStatsType])return window.LCNDA_EXT.graphStats[state.graphStatsType](token);
        const activeId=document.activeElement&&['stats-year-from','stats-year-to','stats-limit'].includes(document.activeElement.id)?document.activeElement.id:null;
        const activeSelStart=activeId?document.activeElement.selectionStart:null;
        const activeSelEnd=activeId?document.activeElement.selectionEnd:null;
        // Le filtre sexe s'applique à toutes les statistiques basées sur les
        // personnes, sauf "Répartition des sexes" elle-même (non pertinent) et
        // "Enfants par famille" (basée sur les familles, pas un individu).
        const supportsGender = !['sex_distribution','children_per_family'].includes(state.graphStatsType);
        const genderParam = supportsGender ? (state.graphStatsGender||undefined) : undefined;
        if(!Array.isArray(state.graphStatsRules))state.graphStatsRules=[];
        const statRules=state.graphStatsRules.filter(r=>r&&r.field);
        // les critères (« + Critère ») : mêmes menus que Mes listes ; leurs choix (types d'événements, étiquettes) une fois chargés
        if(statRules.length||!state.statsRuleMeta){try{state.statsRuleMeta=state.statsRuleMeta||await api('my_lists');}catch(_){}}
        const data = await api('graph_stats',{type:state.graphStatsType,year_from:state.graphStatsYearFrom||undefined,year_to:state.graphStatsYearTo||undefined,gender:genderParam,sosa_root_id:state.currentPersonId||undefined,kind:baseMode()==='breeding'?'animal':undefined,def:statRules.length?JSON.stringify({rules:statRules}):undefined});
        if(token!==state.workspaceToken||state.module!=='graphiques'||state.graphMode!=='stats')return;
        // Use frozen colors from a saved view if present, otherwise use global palette
        const colors = state.graphStatsFrozenColors || getStatsColors();
        // Ranked-list types support a display limit
        const isRanked = ['surnames','firstnames','birth_places','marriage_places','death_places','birth_countries','death_countries','death_causes','farthest_from_origin'].includes(state.graphStatsType);
        const limit = isRanked && state.graphStatsLimit ? Math.max(1, parseInt(state.graphStatsLimit, 10)||0) : 0;
        const rows = limit ? data.rows.slice(0, limit) : data.rows;
        const max=Math.max(1,...rows.map(row=>Number(row.value)||0));
        const total=Number(data.total??data.rows.reduce((sum,row)=>sum+Number(row.value||0),0));
        const limitField = isRanked ? `<label style="display:flex;align-items:center;gap:5px">Limite <input id="stats-limit" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${escapeHtml(state.graphStatsLimit)}" placeholder="Tous" style="width:60px"></label>` : '';
        const genderField = supportsGender ? `<label style="display:flex;align-items:center;gap:5px">Sexe <select id="stats-gender"><option value="" ${state.graphStatsGender===''?'selected':''}>Tous</option><option value="male" ${state.graphStatsGender==='male'?'selected':''}>Homme</option><option value="female" ${state.graphStatsGender==='female'?'selected':''}>Femme</option><option value="unknown" ${state.graphStatsGender==='unknown'?'selected':''}>Sexe inconnu</option></select></label>` : '';
        const resetBtn = (state.graphStatsYearFrom||state.graphStatsYearTo||statRules.length) ? '<button class="button small secondary" id="stats-year-reset">Réinitialiser</button>' : '';
        const ext=window.LCNDA_EXT||{};
        const rulesHtml=ext.listRuleRowHtml&&state.statsRuleMeta?`<div class="stats-rules">${statRules.map((rule,i)=>ext.listRuleRowHtml(rule,i,'persons',state.statsRuleMeta)).join('')}<label class="stats-addrule">+ Critère <select id="stats-addrule"><option value="">choisir…</option>${ext.ruleOptionsHtml?ext.ruleOptionsHtml('pe'):''}</select></label></div>`:'';
        const defs=statsDefaults(),isDefault=JSON.stringify(statsFilterNow())===JSON.stringify(defs);
        const defaultsHtml=`<details class="stats-defaults"><summary>⚙️ Réglages par défaut des distributions</summary><p class="muted">Les filtres ci-dessus (années, limite, sexe et critères) peuvent devenir ceux de départ de <b>toutes</b> les distributions.${statsDefaultsSaved()?` Par défaut : ${escapeHtml(statsFilterSummary(defs))}.`:' Aucun réglage par défaut pour l’instant : toutes les données.'}</p><div class="page-actions"><button type="button" class="button small" id="stats-defaults-save" ${isDefault&&statsDefaultsSaved()?'disabled':''}>⭐ Garder ces filtres par défaut pour toutes</button><button type="button" class="button small secondary" id="stats-defaults-apply" ${isDefault?'disabled':''}>↺ Revenir aux filtres par défaut</button>${statsDefaultsSaved()?'<button type="button" class="button small secondary" id="stats-defaults-clear">Plus de réglage par défaut</button>':''}</div></details>`;
        const whoOk=!!ext.statWhoSupported?.(state.graphStatsType);
        $('#workspace').innerHTML = `<section class="graph-layout"><div class="tool-strip"><span class="eyebrow">STATISTIQUES</span><strong>${escapeHtml(data.title)}</strong><span>${plural(total,'élément compté','éléments comptés')}</span><span class="spacer"></span>${graphExportToolbarHtml()}<button class="button small" id="graph-person">Revenir à la personne</button></div>
            <div class="stats-stage">
                <header class="stats-title"><span class="eyebrow">${escapeHtml(data.kind === 'histogram' ? 'CHRONOGRAMME' : 'DISTRIBUTION')}</span><h2>${escapeHtml(data.title)}</h2>
                    <div class="stats-year-filter"><label>De <input id="stats-year-from" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${escapeHtml(state.graphStatsYearFrom)}" placeholder="Année"></label><label>à <input id="stats-year-to" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${escapeHtml(state.graphStatsYearTo)}" placeholder="Année"></label>${limitField}${genderField}${resetBtn}</div>
                    ${rulesHtml}
                    <p>${escapeHtml(data.description)}${limit&&data.rows.length>rows.length?` · Affichage limité aux ${rows.length} premiers sur ${data.rows.length}.`:''}${whoOk?' · Clique sur une barre pour voir les personnes.':''}</p>${defaultsHtml}</header>
                ${rows.length ? (data.kind==='histogram'?histogramHtml(rows,max,colors,whoOk):(data.kind==='bar'?`<div class="stats-chart">${rows.map((row,index)=>chartRow(row,max,index,data.type,colors,whoOk)).join('')}</div>`:customStatsHtml(data,rows,colors,whoOk))) : empty('Aucune donnée disponible pour cette statistique.',{icon:'📊'})}
            </div></section>`;
        $('#graph-person').addEventListener('click',()=>{state.graphMode='ancestors';renderSidebar();renderGraph();});
        bindGraphExportControls();
        $$('[data-stat-search]').forEach(button=>button.addEventListener('click',()=>{state.researchKind='text';state.research={category:button.dataset.statCategory,q:button.dataset.statSearch};setModule('recherche');}));
        const applyStatsFilters=debounce(()=>{state.graphStatsYearFrom=$('#stats-year-from').value;state.graphStatsYearTo=$('#stats-year-to').value;state.graphStatsLimit=$('#stats-limit')?.value||'';persistUiState();renderGraphStats();},350);
        const sanitizeYearInput=event=>{const cleaned=event.target.value.replace(/\D/g,'').slice(0,4);if(cleaned!==event.target.value)event.target.value=cleaned;applyStatsFilters();};
        const sanitizeLimitInput=event=>{const cleaned=event.target.value.replace(/\D/g,'').slice(0,4);if(cleaned!==event.target.value)event.target.value=cleaned;applyStatsFilters();};
        $('#stats-year-from').addEventListener('input',sanitizeYearInput);
        $('#stats-year-to').addEventListener('input',sanitizeYearInput);
        $('#stats-limit')?.addEventListener('input',sanitizeLimitInput);
        $('#stats-gender')?.addEventListener('change',async event=>{state.graphStatsGender=event.target.value;persistUiState();await renderGraphStats();});
        const resetButton=$('#stats-year-reset');if(resetButton)resetButton.addEventListener('click',()=>{state.graphStatsYearFrom='';state.graphStatsYearTo='';state.graphStatsRules=[];persistUiState();renderGraphStats();});
        // critères : un de plus, un changé, un retiré
        $('#stats-addrule')?.addEventListener('change',event=>{const field=event.target.value;if(!field)return;state.graphStatsRules=[...statRules,{field,value:{gender:'female',living:'deceased',of_person:'ancestors'}[field]||'',values:[]}];persistUiState();renderGraphStats();});
        const readRule=row=>{const rule=statRules[Number(row.dataset.lrI)];if(!rule)return;row.querySelectorAll('[data-lr]').forEach(el=>{const f=el.dataset.lr;rule[f]=f==='not'?el.checked:f==='values'?[...el.selectedOptions].map(o=>Number(o.value)):(f==='from'||f==='to')?(el.value===''?null:Number(el.value)):el.value;});state.graphStatsRules=statRules;persistUiState();};
        $('.stats-rules')?.addEventListener('change',event=>{const row=event.target.closest('[data-lr-i]');if(row){readRule(row);renderGraphStats();}});
        $('.stats-rules')?.addEventListener('click',event=>{const row=event.target.closest('[data-lr-i]');if(row&&event.target.closest('[data-lr-del]')){statRules.splice(Number(row.dataset.lrI),1);state.graphStatsRules=statRules;persistUiState();renderGraphStats();}});
        // réglages par défaut de toutes les distributions
        $('#stats-defaults-save')?.addEventListener('click',()=>{try{localStorage.setItem('genealogie-stats-defaults',JSON.stringify(statsFilterNow()));}catch(_){}toast('Ces filtres sont maintenant ceux de départ de toutes les distributions.');renderGraphStats();});
        $('#stats-defaults-apply')?.addEventListener('click',()=>{applyStatsDefaults();persistUiState();renderGraphStats();});
        $('#stats-defaults-clear')?.addEventListener('click',()=>{try{localStorage.removeItem('genealogie-stats-defaults');}catch(_){}toast('Plus de filtres par défaut : les distributions partent de toutes les données.');renderGraphStats();});
        // qui est derrière une barre : la même fenêtre que pour une statistique à soi
        if(whoOk)$$('[data-stat-who]').forEach(el=>el.addEventListener('click',()=>{const i=Number(el.dataset.statWho),row=rows[i];if(!row)return;ext.statWho({statType:data.type,statFrom:state.graphStatsYearFrom,statTo:state.graphStatsYearTo,statGender:supportsGender?state.graphStatsGender:'',rules:statRules,kind:baseMode()==='breeding'?'animal':'human',generation:row.generation||''},String(row.label??''),Number(row.value)||0,total,colors[i%colors.length],data.title);}));
        if(activeId){const input=$('#'+activeId);if(input){input.focus();try{input.setSelectionRange(activeSelStart,activeSelEnd);}catch(e){}}}
    }

    function chartRow(row,max,index,type,colors,who=false,whoIndex=index){
        const value=Number(row.value)||0,percent=Math.max(2,Math.round(value/max*100));
        const palette=colors||getStatsColors();
        const placeStat=['birth_places','marriage_places','death_places','birth_countries','death_countries'].includes(type),nameStat=['surnames','firstnames'].includes(type);
        const missing=/^(Aucun|Aucune|Naissance sans|Décès sans|Pays non)/.test(row.label||'');
        const label=(placeStat||nameStat)&&!missing?`<button class="stats-chart-label stats-chart-link" data-stat-search="${escapeHtml(row.label)}" data-stat-category="${placeStat?'place':'name'}" title="Voir les personnes liées à ${escapeHtml(row.label)}">${escapeHtml(row.label||'—')}</button>`:`<span class="stats-chart-label" title="${escapeHtml(row.label||'—')}">${escapeHtml(row.label||'—')}</span>`;
        if(who)return `<div class="stats-chart-row is-who" data-stat-who="${whoIndex}" role="button" tabindex="0" title="Voir les personnes : ${escapeHtml(row.label||'—')}"><span class="stats-chart-label">${escapeHtml(row.label||'—')}</span><span class="stats-chart-track"><span class="stats-chart-bar" style="width:${percent}%;background:${palette[index%palette.length]}"></span></span><strong class="stats-chart-value">${value.toLocaleString('fr-FR')}</strong></div>`;
        return `<div class="stats-chart-row">${label}<span class="stats-chart-track"><span class="stats-chart-bar" style="width:${percent}%;background:${palette[index%palette.length]}"></span></span><strong class="stats-chart-value">${value.toLocaleString('fr-FR')}</strong></div>`;
    }

    function histogramHtml(rows,max,colors,who=false){
        const palette=colors||getStatsColors();
        return `<div class="stats-histogram" role="img" aria-label="Histogramme"><div class="histogram-columns">${rows.map((row,index)=>{const value=Number(row.value)||0,height=Math.max(1,Math.round(value/max*100));return `<div class="histogram-column${who?' is-who':''}" title="${escapeHtml(row.label)} : ${value}${who?' — voir les personnes':''}" ${who?`data-stat-who="${index}" role="button" tabindex="0"`:''}><strong>${value}</strong><div class="histogram-bar" style="height:${height}%;background:${palette[index%palette.length]}"></div><span>${escapeHtml(row.label)}</span></div>`;}).join('')}</div></div>`;
    }
    function customStatsHtml(data,rows,colors,who=false){
        const palette=colors||getStatsColors();
        const groups=[...new Set(rows.map(row=>row.generation||'—'))];
        const max=Math.max(1,...rows.map(row=>Number(row.value)||0));
        if(data.kind==='age_pyramid'){
        return `<div class="stats-custom-grid">${groups.map((group,gIndex)=>{const groupRows=rows.filter(row=>(row.generation||'—')===group);return `<section class="stats-custom-panel"><h3>${escapeHtml(group)}</h3><div class="stats-chart compact">${groupRows.map((row,index)=>chartRow(row,max,index+gIndex,'',palette,who,rows.indexOf(row))).join('')}</div></section>`;}).join('')}</div>`;
        }
        if(data.kind==='metric_grid'){
            return `<div class="stats-custom-grid">${groups.map(group=>{const groupRows=rows.filter(row=>(row.generation||'—')===group).slice(0,14);return `<section class="stats-custom-panel"><h3>${escapeHtml(group)}</h3>${groupRows.map((row,index)=>{const unit=row.unit||'ans';const countUnit=unit==='évènements'?'evt.':'pers.';return `<div class="stats-metric-row"><span>${escapeHtml(row.label)}</span><strong style="color:${palette[index%palette.length]}">${Number(row.value||0).toLocaleString('fr-FR')} ${escapeHtml(unit)}</strong><small>${Number(row.count||0).toLocaleString('fr-FR')} ${countUnit}</small></div>`;}).join('')}</section>`;}).join('')}</div>`;
        }
        if(data.kind==='timeline_bands'){
            return `<div class="stats-timeline-bands">${groups.map((group,gIndex)=>{const groupRows=rows.filter(row=>(row.generation||'—')===group).slice(0,10);return `<section><h3>${escapeHtml(group)}</h3><div>${groupRows.map((row,index)=>`<span class="stats-word-chip" style="--chip-color:${palette[(index+gIndex)%palette.length]};font-size:${Math.min(1.35,.82+Number(row.value||1)/max*.75).toFixed(2)}rem">${escapeHtml(row.label)} <small>${Number(row.value||0)}</small></span>`).join('')}</div></section>`;}).join('')}</div>`;
        }
        if(data.kind==='word_cloud'){
            return `<div class="stats-word-cloud">${groups.map((group,gIndex)=>{const groupRows=rows.filter(row=>(row.generation||'—')===group).slice(0,18);return `<section><h3>${escapeHtml(group)}</h3><div>${groupRows.map((row,index)=>`<span class="stats-word-chip" style="--chip-color:${palette[(index+gIndex)%palette.length]};font-size:${Math.min(1.7,.8+Number(row.value||1)/max*1.25).toFixed(2)}rem">${escapeHtml(row.label)} <small>${Number(row.value||0)}</small></span>`).join('')}</div></section>`;}).join('')}</div>`;
        }
        if(data.kind==='indicator_grid'){
            return `<div class="stats-indicator-grid">${rows.map((row,index)=>`<article class="stats-indicator-card"><span>${escapeHtml(row.label)}</span><strong style="color:${palette[index%palette.length]}">${Number(row.value||0).toLocaleString('fr-FR')}${row.unit==='%'?' %':''}</strong>${row.unit&&row.unit!=='%'?`<small>${escapeHtml(row.unit)}</small>`:''}</article>`).join('')}</div>`;
        }
        return `<div class="stats-chart">${rows.map((row,index)=>chartRow(row,max,index,data.type,palette)).join('')}</div>`;
    }

    function summaryFromState(){return state.currentPerson?.person || state.people.find(p=>Number(p.id)===state.currentPersonId) || {first_name:'Personne',last_name:`#${state.currentPersonId}`};}

    /* 🗺️ Carte : dans app-carte.js (chargé juste après app.js) ; ici, des relais. */
    async function renderMap(...a){const f=await appPartReady('renderMap');if(f)return f(...a);$('#workspace').innerHTML=empty('La carte n’a pas pu se charger (fichier app-carte.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderMapSidebar(...a){const f=appPart('renderMapSidebar');if(f)return f(...a);}
    function drawMap(...a){const f=appPart('drawMap');if(f)return f(...a);}
    function hideMapTooltip(...a){const f=appPart('hideMapTooltip');if(f)return f(...a);}
    function isUsableMapCoord(lat,lon){lat=Number(lat);lon=Number(lon);return Number.isFinite(lat)&&Number.isFinite(lon)&&!(Math.abs(lat)<0.000001&&Math.abs(lon)<0.000001);}
    const mapRouteColor = index => DEFAULT_STATS_COLORS[index%DEFAULT_STATS_COLORS.length];
    function normalizeRoutePeople(){
        const seen=new Set();
        const people=Array.isArray(state.mapRoutePeople)?state.mapRoutePeople:[];
        return people.map(person=>({id:Number(person.id),name:person.name||''})).filter(person=>person.id&&!seen.has(person.id)&&seen.add(person.id)).slice(0,8);
    }
    function routePeopleSelection(){
        const people=normalizeRoutePeople();
        if(people.length)return people;
        if(state.currentPersonId){
            const current=summaryFromState();
            return [{id:Number(state.currentPersonId),name:personName(current)}];
        }
        return [];
    }
    function lngToX(lng,zoom){return (lng+180)/360*256*Math.pow(2,zoom);}
    function latToY(lat,zoom){const sin=Math.sin(lat*Math.PI/180);return (0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*256*Math.pow(2,zoom);}
    function xToLng(x,zoom){return x/(256*Math.pow(2,zoom))*360-180;}
    function yToLat(y,zoom){const n=Math.PI-2*Math.PI*y/(256*Math.pow(2,zoom));return 180/Math.PI*Math.atan(Math.sinh(n));}

    /* 📋 Listes : dans app-listes.js (chargé juste après app.js) ; ici, des relais. */
    async function renderList(...a){const f=await appPartReady('renderList');if(f)return f(...a);$('#workspace').innerHTML=empty('Les listes n’ont pas pu se charger (fichier app-listes.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderListSidebar(...a){const f=appPart('renderListSidebar');if(f)return f(...a);}
    function reminderIsPast(row){
        const date=row.reminder_due_at||'';
        if(!date)return false;
        return date < new Date().toISOString().slice(0,10);
    }
    function openBudgetEditForm(row){
        const form=$('#research-budget-form');if(!form)return;
        $('#add-budget-item').hidden=true;
        form.hidden=false;
        form.elements.id.value=row.id||'';
        form.elements.title.value=row.title||'';
        form.elements.category.value=row.category||'autre';
        form.elements.amount.value=row.amount??'';
        form.elements.currency.value=row.currency||'EUR';
        form.elements.expense_date.value=row.expense_date||'';
        form.elements.renewal_date.value=row.renewal_date||'';
        form.elements.vendor.value=row.vendor||'';
        form.elements.notes.value=row.notes||'';
        $('#research-budget-submit').textContent='Enregistrer les modifications';
        form.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    function bindBudgetButtons(root=document){
        $$('[data-edit-budget-item]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',()=>{const id=Number(button.dataset.editBudgetItem);const row=(state.currentListRows||[]).find(item=>Number(item.id)===id);if(row)openBudgetEditForm(row);});});
        $$('[data-delete-budget-item]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',async()=>{if(!await confirmBox('',{title:'Supprimer cette ligne de budget ?',okLabel:'Supprimer la ligne'}))return;try{await api('delete_research_budget_item',{}, {method:'POST',body:{id:Number(button.dataset.deleteBudgetItem)}});toast('Ligne de budget supprimée.');await renderList();}catch(error){toast(error.message,'error');}});});
    }
    function readCourrierCopyOrder(raw){try{const data=JSON.parse(raw||'{}');return data&&typeof data==='object'?data:{references:'',quantity:1,format:'numerique'};}catch(_){return {references:'',quantity:1,format:'numerique'};}}
    function syncCourrierCopyOrder(form,setDefaultObject=false){if(!form)return;const isCopyOrder=form.elements.organisme?.value==='copies';const panel=$('#courrier-copy-order',form);if(panel)panel.hidden=!isCopyOrder;if(isCopyOrder&&setDefaultObject&&!form.elements.objet.value)form.elements.objet.value='Commande de copies';if(!isCopyOrder&&form.elements.copy_order_json)form.elements.copy_order_json.value='';}
    function openCourrierEditForm(row){
        const form=$('#courrier-form');if(!form)return;
        $('#add-courrier-item').hidden=true;
        form.hidden=false;
        form.elements.id.value=row.id||'';
        form.elements.organisme.value=row.organisme||'mairie';
        form.elements.destinataire.value=row.destinataire||'';
        form.elements.objet.value=row.objet||'';
        form.elements.date_envoi.value=row.date_envoi||'';
        form.elements.statut.value=row.statut||'envoye';
        form.elements.relance_delai_jours.value=row.relance_delai_jours??30;
        form.elements.notes.value=row.notes||'';
        form.elements.copy_order_json.value=row.copy_order_json||'';
        const copyOrder=readCourrierCopyOrder(row.copy_order_json);
        form.elements.copy_order_references.value=copyOrder.references||'';
        form.elements.copy_order_quantity.value=copyOrder.quantity||1;
        form.elements.copy_order_format.value=copyOrder.format||'numerique';
        syncCourrierCopyOrder(form);
        $('#courrier-submit').textContent='Enregistrer les modifications';
        form.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    function bindCourrierButtons(root=document){
        $$('[data-edit-courrier-item]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',()=>{const id=Number(button.dataset.editCourrierItem);const row=(state.currentListRows||[]).find(item=>Number(item.id)===id);if(row)openCourrierEditForm(row);});});
        $$('[data-delete-courrier-item]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',async()=>{if(!await confirmBox('',{title:'Supprimer ce courrier du registre ?',okLabel:'Supprimer le courrier'}))return;try{await api('delete_courrier',{}, {method:'POST',body:{id:Number(button.dataset.deleteCourrierItem)}});toast('Courrier supprimé.');await renderList();}catch(error){toast(error.message,'error');}});});
        $$('[data-courrier-fait]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',async()=>{try{await api('set_courrier_fait',{}, {method:'POST',body:{id:Number(button.dataset.courrierFait),fait:Number(button.dataset.fait),fait_type:button.dataset.faitType||''}});toast(Number(button.dataset.fait)===1?'Courrier classé dans les faits.':'Courrier remis en cours.');await renderList();}catch(error){toast(error.message,'error');}});});
    }
    async function setReminderDone(itemId,done,sourceType='investigation_item'){
        const result=await api('set_reminder_done',{}, {method:'POST',body:{id:itemId,done:done?1:0,source_type:sourceType}});
        if(state.module==='listes')await renderList();
        else if(state.module==='enquetes'&&state.currentInvestigationId)await renderInvestigationDetail(state.currentInvestigationId);
        toast(done?'Rappel marqué comme fait.':'Rappel remis à faire.');
        return result;
    }
    function openStandaloneReminderEditForm(row){
        const form=$('#standalone-reminder-form');
        if(!form)return;
        $('#add-standalone-reminder').hidden=true;
        form.hidden=false;
        if(form.elements.id)form.elements.id.value=row.id;
        if(form.elements.title)form.elements.title.value=row.item_title||'';
        if(form.elements.reminder_category)form.elements.reminder_category.value=row.reminder_category||'';
        if(form.elements.reminder_mode)form.elements.reminder_mode.value=row.reminder_mode||'on';
        if(form.elements.reminder_due_at)form.elements.reminder_due_at.value=row.reminder_due_at||'';
        if(form.elements.notes)form.elements.notes.value=row.notes||'';
        const submitButton=$('#standalone-reminder-submit');
        if(submitButton)submitButton.textContent='Enregistrer les modifications';
        form.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    function openInvestigationReminderEditDialog(row){
        let dlg=$('#investigation-reminder-edit-dialog');
        if(!dlg){
            document.body.insertAdjacentHTML('beforeend',`<dialog class="modal small-modal" id="investigation-reminder-edit-dialog"><form method="dialog" id="investigation-reminder-edit-form"><div class="modal-head"><div><span class="eyebrow">RAPPEL</span><h2>Modifier le rappel</h2></div><button class="icon-button" value="cancel" type="button" id="investigation-reminder-edit-close">×</button></div><input type="hidden" name="id"><div class="form-grid one-column"><label>Échéance<select name="reminder_mode"><option value="on">À faire à cette date</option><option value="before">À faire avant cette date</option><option value="after">À faire après cette date</option></select></label><label>Date<input name="reminder_due_at" type="date" required></label></div><div class="modal-actions"><button value="cancel" type="button" class="button secondary" id="investigation-reminder-edit-cancel">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div></form></dialog>`);
            dlg=$('#investigation-reminder-edit-dialog');
            $('#investigation-reminder-edit-close').addEventListener('click',()=>dlg.close());
            $('#investigation-reminder-edit-cancel').addEventListener('click',()=>dlg.close());
            $('#investigation-reminder-edit-form').addEventListener('submit',async event=>{
                event.preventDefault();
                try{
                    await api('update_investigation_item_reminder',{}, {method:'POST',body:formObject(event.currentTarget)});
                    dlg.close();
                    toast('Rappel modifié.');
                    await renderList();
                }catch(error){toast(error.message,'error');}
            });
        }
        const form=$('#investigation-reminder-edit-form');
        form.elements.id.value=row.id;
        form.elements.reminder_mode.value=row.reminder_mode&&row.reminder_mode!=='none'?row.reminder_mode:'on';
        form.elements.reminder_due_at.value=row.reminder_due_at||'';
        dlg.showModal();
    }
    function bindReminderButtons(root=document){$$('[data-reminder-done]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',async()=>{try{await setReminderDone(Number(button.dataset.reminderDone),Number(button.dataset.done)===1,button.dataset.reminderSource||'investigation_item');}catch(error){toast(error.message,'error');}});});$$('[data-delete-standalone-reminder]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',async()=>{if(!await confirmBox('',{title:'Supprimer ce rappel ?',okLabel:'Supprimer le rappel'}))return;try{await api('delete_standalone_reminder',{}, {method:'POST',body:{id:Number(button.dataset.deleteStandaloneReminder)}});toast('Rappel supprimé.');await renderList();}catch(error){toast(error.message,'error');}});});$$('[data-edit-standalone-reminder]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',()=>{const id=Number(button.dataset.editStandaloneReminder);const row=(state.currentListRows||[]).find(r=>Number(r.id)===id&&r.source_type==='standalone');if(row)openStandaloneReminderEditForm(row);});});$$('[data-edit-investigation-reminder]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',()=>{const id=Number(button.dataset.editInvestigationReminder);const row=(state.currentListRows||[]).find(r=>Number(r.id)===id&&r.source_type!=='standalone');if(row)openInvestigationReminderEditDialog(row);});});$$('[data-clear-investigation-reminder]:not([data-bound])',root).forEach(button=>{button.dataset.bound='1';button.addEventListener('click',async()=>{if(!await confirmBox('La piste liée sera conservée.',{title:'Supprimer ce rappel ?',okLabel:'Supprimer le rappel'}))return;try{await api('clear_investigation_item_reminder',{}, {method:'POST',body:{id:Number(button.dataset.clearInvestigationReminder)}});toast('Rappel supprimé.');await renderList();}catch(error){toast(error.message,'error');}});});}
    function bindTableLinks(){$$('[data-open-person]:not([data-bound])').forEach(button=>{button.dataset.bound='1';button.addEventListener('click',()=>{state.currentPersonId=Number(button.dataset.openPerson);setModule('personnes');});});$$('[data-open-investigation]:not([data-bound])').forEach(button=>{button.dataset.bound='1';button.addEventListener('click',()=>{state.currentInvestigationId=Number(button.dataset.openInvestigation);state.enquetesTab='enquetes';setModule('enquetes');});});$$('[data-open-media]:not([data-bound])').forEach(button=>{button.dataset.bound='1';button.addEventListener('click',()=>{const id=Number(button.dataset.openMedia);const media=(state.currentListRows||[]).filter(row=>row.filename).map(row=>state.listType==='signatures'?{...row,id:Number(row.media_id||row.id)}:row);const index=media.findIndex(row=>Number(row.id)===id);if(index>=0)openLightbox(media,index,!['media','signatures'].includes(state.listType));});});bindReminderButtons();bindBudgetButtons();bindCourrierButtons();bindSortableTables();bindLabelListToggles();}
    function bindSortableTables(){$$('.sortable-table:not([data-sort-bound])').forEach(table=>{table.dataset.sortBound='1';$$('[data-sort-column]',table).forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.sortColumn),direction=button.dataset.direction==='asc'?'desc':'asc';$$('[data-sort-column]',table).forEach(item=>{item.removeAttribute('data-direction');item.querySelector('.sort-mark')?.remove();});button.dataset.direction=direction;button.insertAdjacentHTML('beforeend',`<span class="sort-mark">${direction==='asc'?' ↑':' ↓'}</span>`);const body=$('tbody',table),rows=$$('tr',body);rows.sort((a,b)=>{const av=a.children[index]?.dataset.sortValue||'',bv=b.children[index]?.dataset.sortValue||'';const numeric=!Number.isNaN(Number(av))&&!Number.isNaN(Number(bv));const result=numeric?Number(av)-Number(bv):av.localeCompare(bv,'fr',{numeric:true,sensitivity:'base'});return direction==='asc'?result:-result;});rows.forEach(row=>body.append(row));}));});}

    function bindLabelListToggles(){$$('[data-label-toggle]:not([data-toggle-bound])').forEach(btn=>{btn.dataset.toggleBound='1';btn.addEventListener('click',()=>{const body=btn.closest('.label-list-row')?.querySelector('.label-list-body');if(!body)return;const open=!body.hidden;body.hidden=open;btn.textContent=open?'Afficher les éléments':'Masquer les éléments';});});}
    /* 🕰️ Chronologie : dans app-chronologie.js (chargé juste après app.js). */
    async function renderTimeline(...a){const f=await appPartReady('renderTimeline');if(f)return f(...a);$('#workspace').innerHTML=empty('La chronologie n’a pas pu se charger (fichier app-chronologie.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderTimelineSidebar(...a){const f=appPart('renderTimelineSidebar');if(f)return f(...a);}

    function researchProximityFieldsHtml(){
        // Recherche par proximité géographique et temporelle : « qui d'autre était dans cette commune à cette date ? »
        // Une commune (place picker dédié) + un rayon optionnel (0 = commune exacte uniquement, jusqu'à 40 km pour
        // inclure les communes voisines) + une période d'années ; le backend regroupe les personnes qui y
        // apparaissent (principal, conjoint ou témoin) pour repérer des voisins/témoins récurrents.
        const ps=state.proximitySearch;
        const radiusKm=Number(ps.radiusKm)||0;
        const radiusLabel=radiusKm>0?`± ${radiusKm} km autour de la commune`:'Commune exacte uniquement';
        const dateWindowMode=ps.dateWindowMode||'exact';
        return `<div id="research-proximity-fields"><div class="research-place-picker" id="proximity-place-picker"><span class="research-place-label">Commune</span><div class="research-place-input-wrap" id="proximity-place-input">${pkField({name:'proximity_place_id',kind:'place',allowCreate:false,value:Number(ps.placeId)||null})}</div></div><div class="proximity-radius-field"><span class="research-place-label">Zone de recherche</span><input id="proximity-radius" name="proximity_radius_km" type="range" min="0" max="50" step="1" value="${radiusKm}"><output id="proximity-radius-value" class="proximity-radius-value">${escapeHtml(radiusLabel)}</output></div><label>Temps<select name="proximity_date_mode"><option value="range" ${(ps.dateMode||'range')==='range'?'selected':''}>Période par années</option><option value="exact" ${ps.dateMode==='exact'?'selected':''}>Date précise</option></select></label><div class="year-range-fields" id="proximity-year-range"><label>De<input name="proximity_year_from" type="number" min="1" max="9999" value="${escapeHtml(ps.yearFrom)}" placeholder="1800"></label><label>À<input name="proximity_year_to" type="number" min="1" max="9999" value="${escapeHtml(ps.yearTo)}" placeholder="1810"></label></div><div id="proximity-exact-date-fields"><label>Date précise<input name="proximity_exact_date" value="${escapeHtml(ps.exactDate||'')}" placeholder="30/02/1988"></label><label>Élargir<select name="proximity_date_window_mode"><option value="exact">Non, date exacte</option><option value="before" ${dateWindowMode==='before'?'selected':''}>Avant</option><option value="after" ${dateWindowMode==='after'?'selected':''}>Après</option><option value="both" ${dateWindowMode==='both'?'selected':''}>Avant et après</option></select></label><label id="proximity-date-window-days">Nombre de jours<input name="proximity_date_window_days" type="number" min="0" max="365" step="1" value="${escapeHtml(ps.dateWindowDays||'')}" placeholder="30"></label></div></div>`;
    }
    /* 🔎 Recherche : dans app-recherche.js (chargé juste après app.js) ; ici, des relais. */
    async function renderResearch(...a){const f=await appPartReady('renderResearch');if(f)return f(...a);$('#workspace').innerHTML=empty('La recherche n’a pas pu se charger (fichier app-recherche.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderResearchSidebar(...a){const f=appPart('renderResearchSidebar');if(f)return f(...a);}

    // --- Fichiers des décès publiés par l'INSEE sur data.gouv.fr : téléchargés et importés par l'app ---
    const inseeAuto=()=>{try{return localStorage.getItem('genealogie-insee-auto')==='1';}catch(_){return false;}};
    const inseeSize=n=>n?`${(n/1048576).toLocaleString('fr-FR',{maximumFractionDigits:n>10485760?0:1})} Mo`:'';
    let inseeImporting=false;
    // Importe les fichiers donnés, un par un (chaque fichier = une requête : le serveur télécharge puis importe)
    async function inseeImportRemote(files,onProgress=()=>{}){
        if(inseeImporting){toast('Un import INSEE est déjà en cours.','error');return 0;}
        inseeImporting=true;let total=0;
        try{
            for(const [i,f] of files.entries()){
                onProgress(`Téléchargement et import de « ${f.label} » (${i+1}/${files.length}${f.size?`, ${inseeSize(f.size)}`:''})… Ça peut prendre quelques minutes.`);
                try{const r=await api('insee_remote_import',{}, {method:'POST',body:{url:f.url}});total+=Number(r.inserted||0);}
                catch(error){if(error?.data?.duplicate||/déjà avoir été importé/.test(error.message))continue;toast(`${f.label} : ${error.message}`,'error');}
            }
        }finally{inseeImporting=false;}
        try{state.inseeRemote=await api('insee_remote_files');}catch(_){}
        return total;
    }
    // Une fois par jour : y a-t-il de nouveaux fichiers ? (seulement si des décès INSEE ont déjà été importés)
    async function checkInseeRemote(){
        let today=new Date().toISOString().slice(0,10),last='',told=[];
        try{last=localStorage.getItem('lcnda-insee-checked')||'';told=JSON.parse(localStorage.getItem('lcnda-insee-told')||'[]');}catch(_){}
        if(last===today||navigator.onLine===false)return;
        try{
            const stats=await api('insee_stats');
            if(!Number(stats.imports_count))return;
            const data=state.inseeRemote=await api('insee_remote_files');
            try{localStorage.setItem('lcnda-insee-checked',today);}catch(_){}
            const fresh=(data.files||[]).filter(f=>f.new);
            if(!fresh.length)return;
            if(inseeAuto()){
                toast(`Décès INSEE : ${fresh.length} nouveau${fresh.length>1?'x':''} fichier${fresh.length>1?'s':''}, import en cours…`);
                const n=await inseeImportRemote(fresh);
                toast(`Décès INSEE à jour : ${n.toLocaleString('fr-FR')} décès ajouté${n>1?'s':''} (${fresh.map(f=>f.label).join(', ')}).`);
                return;
            }
            const unseen=fresh.filter(f=>!told.includes(f.key));
            if(!unseen.length)return;
            toast(`Décès INSEE : ${unseen.length>1?`${unseen.length} nouveaux fichiers`:`nouveau fichier (${unseen[0].label})`} sur data.gouv.fr. Recherche → Décès INSEE → « Fichiers de l’INSEE ».`);
            try{localStorage.setItem('lcnda-insee-told',JSON.stringify([...told,...unseen.map(f=>f.key)].slice(-60)));}catch(_){}
        }catch(_){/* hors ligne : on réessaiera au prochain lancement */}
    }

    /* 🕵️ Enquêtes : dans app-enquetes.js (chargé juste après app.js) ; ici, des relais. */
    async function renderInvestigations(...a){const f=await appPartReady('renderInvestigations');if(f)return f(...a);$('#workspace').innerHTML=empty('Les enquêtes n’ont pas pu se charger (fichier app-enquetes.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderInvestigationsSidebar(...a){const f=appPart('renderInvestigationsSidebar');if(f)return f(...a);}
    async function renderInvestigationDetail(...a){const f=await appPartReady('renderInvestigationDetail');if(f)return f(...a);$('#workspace').innerHTML=empty('Les enquêtes n’ont pas pu se charger (fichier app-enquetes.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    async function renderBattues(...a){const f=await appPartReady('renderBattues');if(f)return f(...a);$('#workspace').innerHTML=empty('Les enquêtes n’ont pas pu se charger (fichier app-enquetes.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    async function renderBattueDetail(...a){const f=await appPartReady('renderBattueDetail');if(f)return f(...a);$('#workspace').innerHTML=empty('Les enquêtes n’ont pas pu se charger (fichier app-enquetes.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    const battueTargetTypesDefault={
        naissance:'Naissance',
        tables_decennales:'Tables décennales',
        bapteme:'Baptême',
        mariage:'Mariage',
        deces:'Décès',
        recensement:'Recensement',
        autre:'Autre'
    };
    const battueTargetText=(types,type)=>(types||battueTargetTypesDefault)?.[type]||type||'Recherche';
    const battueTargetOptions=(types,selected='naissance')=>Object.entries(types||battueTargetTypesDefault).map(([value,label])=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');
    const battueStatusOptions=(statuses,selected='todo')=>Object.entries(statuses||{}).map(([value,label])=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');

    // Pays des battues : la France est toujours présente ; chaque pays voisin s'ajoute (communes, voisinages de part et
    // d'autre de la frontière, anciennes communes en sous-nom) ou se retire (refusé si une battue l'utilise).
    // Pays des battues rangés par grandes régions (régions données par le catalogue ; ordre d'affichage ci-dessous)


    function archiveDigestOptionLabel(item){const types={table_decennale:'Table décennale',mariage:'Mariage',naissance:'Naissance',deces:'Décès',bapteme:'Baptême',succession:'Succession',recensement:'Recensement',prison:'Prison',fiche_militaire:'Fiche militaire',liste_prisonnier:'Liste prisonnier',autre:'Autre'};const type=types[item.archive_digest_record_type||item.record_type]||item.archive_digest_record_type||item.record_type||'';return [type,item.archive_digest_year||item.year_text,item.archive_digest_place_name||item.place_name||item.archive_digest_city||item.city_name||item.archive_digest_alias||item.city_alias,item.archive_digest_reference||item.archive_reference].filter(Boolean).join(' · ');}
    /** Dates manquantes estimées d'après la famille et les actes (aide pour savoir quels registres consulter). */
    function dateEstimatesHtml(estimates,person){
        const rows=[['birth',person?.gender==='female'?'Née':'Né'],['death',person?.gender==='female'?'Décédée':'Décédé']].filter(([key])=>estimates?.[key]?.label);
        if(!rows.length)return '';
        return `<div class="date-estimates"><strong>Dates estimées</strong>${rows.map(([key,verb])=>{const e=estimates[key];return `<div class="date-estimate"><span>${escapeHtml(verb)} ${escapeHtml(e.label)}</span><small>D’après : ${escapeHtml((e.reasons||[]).join(' ; '))}${e.other_reasons?.length?`<br>Autres indices compatibles : ${escapeHtml(e.other_reasons.join(' ; '))}`:''}${e.conflicts?.length?`<br><em>Indices contradictoires, à vérifier : ${escapeHtml(e.conflicts.join(' ; '))}</em>`:''}</small></div>`;}).join('')}<small class="muted">Estimation pour orienter les recherches dans les registres, pas une date prouvée.</small></div>`;
    }
    /** Aide à la lecture des actes anciens : abréviations, latin des registres, écriture lettre par lettre. */
    const readingAbbreviations=[
        ['led., lad., lesd.','ledit, ladite, lesdits : la personne ou la chose déjà nommée plus haut'],
        ['dud., desd.','dudit, desdits'],
        ['susd., sd.','susdit(e) : nommé(e) ci-dessus'],
        ['d., dit, dite','surnom ou nom de terre : « Jean Martin dit Lafleur »'],
        ['fils de feu, fille de feu','le père (ou la mère) est déjà mort au moment de l’acte'],
        ['fils de défunt, de deffunct','même sens que « fils de feu »'],
        ['vve, Vve, veufve','veuve'],
        ['fe, fme, fem.','femme (épouse)'],
        ['épx, épse','époux, épouse'],
        ['Me, Mtre','maître (notaire, avocat, chirurgien, artisan reçu maître)'],
        ['Mre','messire (noble ou prêtre)'],
        ['Sr, Sieur','sieur : homme de condition (bourgeois, marchand, officier)'],
        ['Sgr, Seigr','seigneur'],
        ['Ecr, Ec.','écuyer (titre de noblesse)'],
        ['Dlle, Damlle','demoiselle : femme de rang, même mariée, sous l’Ancien Régime'],
        ['hon., honn.','honnête (« honnête homme ») : qualificatif social'],
        ['md, mard, marchd','marchand'],
        ['labr, labour.','laboureur (paysan qui possède un attelage)'],
        ['manouv.','manouvrier, journalier'],
        ['par., psse, paroe','paroisse'],
        ['bapt., bap.','baptisé, baptême'],
        ['inh.','inhumé'],
        ['pnt, pt, pnts','présent, présents'],
        ['soubs., soussig.','soussignés'],
        ['n’a sceu signer','n’a pas su signer (ne savait pas écrire)'],
        ['aagé de','âgé de'],
        ['7bre, 8bre, 9bre, Xbre, 10bre','septembre, octobre, novembre, décembre'],
        ['&, &c','et, et cetera'],
        ['ledit jour et an que dessus','à la date déjà écrite en tête de l’acte'],
        ['en légitime mariage','enfant de parents mariés entre eux'],
        ['fils naturel, fille naturelle','né(e) hors mariage'],
        ['posthume','né(e) après la mort du père'],
        ['mineur','moins de 25 ans sous l’Ancien Régime, moins de 21 ans de 1792 à 1974'],
        ['an VI, 12 brumaire','date du calendrier républicain (convertisseur dans Calendrier / mesures)'],
        ['+, †, croix','décédé'],
    ];
    const readingLatin=[
        ['baptizavi','j’ai baptisé'],['baptizatus, baptizata','baptisé, baptisée'],['natus, nata','né, née'],['hodie, heri','aujourd’hui, hier'],
        ['filius, filia','fils, fille'],['legitimus, legitima','légitime'],['naturalis, illegitimus','naturel, illégitime'],['gemelli','jumeaux'],
        ['infans, proles','enfant'],['pater, mater','père, mère'],['patrinus, matrina','parrain, marraine'],['susceptores, levantes','parrain et marraine (ceux qui ont tenu l’enfant)'],
        ['domi baptizatus ob periculum mortis','ondoyé à la maison en danger de mort'],['conjuges','les époux (le couple)'],
        ['matrimonium contraxerunt','ils se sont mariés'],['matrimonio juncti','unis par le mariage'],['sponsus, sponsa','fiancé, fiancée ou époux, épouse'],
        ['proclamationibus factis, bannis','les bans ayant été publiés'],['dispensatio in tertio gradu consanguinitatis','dispense de parenté (cousins issus de germains)'],
        ['viduus, vidua','veuf, veuve'],['relicta','veuve de (« laissée par »)'],['quondam, q., defunctus, def.','feu, défunt'],
        ['obiit','il (elle) est mort(e)'],['sepultus est, sepulta est','a été inhumé(e)'],['in coemeterio','au cimetière'],['in ecclesia','dans l’église'],
        ['annorum circiter quadraginta','âgé d’environ quarante ans'],['aetatis suae','de son âge'],['anno Domini','l’an du Seigneur'],
        ['die, mensis','le jour, du mois'],['ejusdem mensis','du même mois'],['hujus parochiae, ex hac parochia','de cette paroisse'],['parochianus','paroissien'],
        ['testes, praesentibus','témoins, en présence de'],['infrascriptus, subsignatus','soussigné'],['parochus, curatus, rector','curé'],['vicarius','vicaire'],
        ['sacerdos, presbyter','prêtre'],['Januarii … Decembris','de janvier … de décembre'],['primo, secundo, tertio die','le premier, deuxième, troisième jour'],
        ['agricola','cultivateur'],['faber','forgeron'],['sutor','cordonnier'],['textor','tisserand'],['molitor','meunier'],['sartor','tailleur'],['miles','soldat'],
    ];
    const readingLetters=[
        ['ſ (s long)','s','au début et au milieu des mots ; ressemble à un f sans barre. Le s rond n’est qu’en fin de mot : « ſœur » = sœur.'],
        ['u / v','u ou v','interchangeables jusqu’au XVIIe siècle : « vne » = une, « auoir » = avoir.'],
        ['i / j','i ou j','même lettre : « iour » = jour, « Iean » = Jean ; J et I majuscules se confondent.'],
        ['y final','i','« cecy », « luy », « icy ».'],
        ['ff au début','F','majuscule : « ffrançois » = François.'],
        ['s muet devant consonne','accent circonflexe aujourd’hui','« estoit » = était, « teste » = tête, « maistre » = maître.'],
        ['-oit, -oient','-ait, -aient','imparfait et conditionnel : « il demeuroit » = il demeurait.'],
        ['-ez final','-és','« bontez » = bontés, « nez » peut valoir « nés ».'],
        ['trait ou tilde sur une voyelle','m ou n omis','« cõme » = comme, « mōsieur » = monsieur.'],
        ['ꝑ (p barré)','per / par','« ꝑoisse » = paroisse.'],
        ['ꝓ (p bouclé)','pro','« ꝓcureur » = procureur.'],
        ['q̃, qͥ','que, qui','lettre surmontée d’un signe.'],
        ['lettres en exposant','abréviation','« Mʳ » = monsieur, « ledᵗ » = ledit, « 7ᵇʳᵉ » = septembre.'],
        ['ꝛ (r rond)','r','après o, b, p : ressemble à un 2 ou à un z.'],
        ['d oncial','d','hampe recourbée vers la gauche, comme ∂.'],
        ['e en boucle','e','petit e souvent fermé comme un o ou un c bouclé selon la main.'],
        ['h','h','descend sous la ligne avec une boucle ; se confond avec un z.'],
        ['chiffres romains en j','i final','« iiij » = 4, « vj » = 6, « iiijxx » = quatre-vingts.'],
        ['pas de ponctuation ni d’accent','—','les phrases s’enchaînent et les mots sont coupés en fin de ligne sans tiret ; lire à voix haute aide.'],
    ];
    function readingAidsHtml(){
        const dl=rows=>`<dl>${rows.map(([term,definition])=>`<div class="help-term"><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(definition)}</dd></div>`).join('')}</dl>`;
        return `<section class="maintenance-panel full-width help-intro reading-aids"><h3>Aide à la lecture des actes anciens</h3><p>Repères pour déchiffrer les registres paroissiaux et l’état civil ancien. Tape un mot pour filtrer.</p><label class="reading-aids-filter">Chercher<input type="search" id="reading-aids-filter" placeholder="ex. vve, obiit, ſ…"></label>
            <details class="reading-aid" open><summary>Abréviations et formules courantes (${readingAbbreviations.length})</summary><div class="help-glossary"><section class="help-letter">${dl(readingAbbreviations)}</section></div></details>
            <details class="reading-aid"><summary>Latin des registres paroissiaux (${readingLatin.length})</summary><div class="help-glossary"><section class="help-letter">${dl(readingLatin)}</section></div></details>
            <details class="reading-aid"><summary>Écriture ancienne lettre par lettre (${readingLetters.length})</summary><table class="reading-letters"><thead><tr><th>Ce qu’on voit</th><th>Se lit</th><th>Remarque</th></tr></thead><tbody>${readingLetters.map(([seen,read,note])=>`<tr><td>${escapeHtml(seen)}</td><td>${escapeHtml(read)}</td><td>${escapeHtml(note)}</td></tr>`).join('')}</tbody></table></details>
        </section>`;
    }
    const foldText=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    function bindReadingAids(){
        $('#reading-aids-filter')?.addEventListener('input',event=>{
            const q=foldText(event.target.value.trim());
            $$('.reading-aid').forEach(details=>{let shown=0;$$('.help-term, tbody tr',details).forEach(row=>{const ok=!q||foldText(row.textContent).includes(q);row.hidden=!ok;if(ok)shown++;});if(q)details.open=shown>0;});
        });
    }
    /**
     * Recherche rapide (⌘K sur Mac, Ctrl+K ailleurs) : personnes, battues, enquêtes, lieux cités et écrans de l'application.
     * Flèches pour choisir, Entrée pour y aller, Échap pour fermer.
     */
    function quickSearchScreens(){
        const rows=[];
        Object.entries(modules).filter(([key])=>key!=='jeu').forEach(([key,[,label]])=>rows.push({label,hint:'Écran',go:()=>setModule(key)}));
        defaultMaintenanceTabs.forEach(([key,,label])=>rows.push({label,hint:'Maintenance',go:()=>{state.maintenanceTab=key;setModule('maintenance');}}));
        defaultGraphDiagramItems.forEach(([key,label])=>rows.push({label,hint:'Graphiques',go:()=>{state.graphMode=key;setModule('graphiques');}}));
        rows.push({label:'Rappels',hint:'Listes',go:()=>{state.listType='reminders';setModule('listes');}});
        rows.push({label:'Battues',hint:'Enquêtes',go:()=>{state.enquetesTab='battue';state.currentBattueId=0;state.currentInvestigationId=0;setModule('enquetes');}});
        rows.push({label:'Atelier de recherche',hint:'Enquêtes',go:()=>{state.enquetesTab='atelier';state.currentBattueId=0;state.currentInvestigationId=0;setModule('enquetes');}});
        return rows;
    }
    async function openQuickSearch(){
        const existing=$('#quick-search');if(existing){$('input',existing)?.focus();return;}
        const fold=text=>String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
        const dialog=document.createElement('div');dialog.id='quick-search';dialog.className='quick-search-backdrop';
        dialog.innerHTML=`<div class="quick-search" role="dialog" aria-label="Recherche rapide"><input type="search" placeholder="Une personne, une battue, une enquête, un lieu, un écran…" autocomplete="off" spellcheck="false"><ul class="quick-search-results" role="listbox"></ul><small class="muted">↑ ↓ pour choisir · Entrée pour ouvrir · ⇧ + Entrée pour ouvrir à côté · Échap pour fermer · « battue », « enquête » ou « lieu » devant le mot pour ne chercher que cela</small></div>`;
        document.body.append(dialog);
        const input=$('input',dialog),list=$('ul',dialog);let items=[],active=0,seq=0;
        const close=()=>dialog.remove();
        const paint=()=>{list.innerHTML=items.length?items.map((item,index)=>`<li role="option" class="${index===active?'is-active':''}" data-qs-index="${index}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.hint)}</small></li>`).join(''):`<li class="quick-search-empty">${input.value.trim()?'Aucun résultat':'Tape quelques lettres'}</li>`;list.querySelector('.is-active')?.scrollIntoView({block:'nearest'});};
        // Maj+Entrée (ou Maj+clic) : ouvrir à côté. On rejoue l'action dans un état copié pour savoir quel écran ouvrir.
        const choose=(index,aside=false)=>{const item=items[index];if(!item)return;close();
            if(!aside){item.go();return;}
            const saved=viewSnapshot(),realSetModule=setModuleImpl;let target=null;
            setModuleImpl=module=>{target={...viewSnapshot(),module};};
            try{item.go();}finally{setModuleImpl=realSetModule;}
            applyViewSnapshot(saved);state.module=saved.module;
            if(target)openSidePanel(target);};
        const search=async()=>{
            const q=input.value.trim();const id=++seq;
            const words=fold(q).split(/\s+/).filter(Boolean);
            const screens=words.length?quickSearchScreens().filter(row=>words.every(word=>fold(row.label+' '+row.hint).includes(word))).slice(0,6):[];
            items=screens;active=0;paint();
            if(q.length<2)return;
            let data={};try{data=await api('quick_search',{q});}catch(_){return;}
            if(id!==seq||!document.body.contains(dialog))return;
            const people=(data.persons||[]).map(person=>({label:`${personName(person)}${/\d/.test(years(person)||'')?` (${years(person)})`:''}`,hint:'Personne',go:()=>{state.currentPersonId=Number(person.id);setModule('personnes');}}));
            const battues=(data.battues||[]).map(row=>({label:row.title||'Battue sans titre',hint:`Battue${row.start_name?` · ${row.start_name}`:''}`,go:()=>{state.enquetesTab='battue';state.currentInvestigationId=0;state.currentBattueId=Number(row.id);setModule('enquetes');}}));
            const investigations=(data.investigations||[]).map(row=>({label:row.title||'Enquête sans titre',hint:'Enquête',go:()=>{state.enquetesTab='enquetes';state.currentBattueId=0;state.currentInvestigationId=Number(row.id);state.investigationFolderId=0;setModule('enquetes');}}));
            const places=(data.places||[]).map(row=>({label:[row.name,row.county,row.country].filter(Boolean).join(', '),hint:`Lieu · ${row.uses} événement${Number(row.uses)>1?'s':''}`,go:()=>{state.graphPlaceMonograph={...state.graphPlaceMonograph,id:Number(row.id),name:row.name||'',county:row.county||'',country:row.country||''};state.graphMode='place_monograph';setModule('graphiques');}}));
            items=[...people,...battues,...investigations,...places,...screens];active=0;paint();
        };
        let timer=0;
        input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,150);});
        input.addEventListener('keydown',event=>{
            if(event.key==='ArrowDown'){event.preventDefault();active=Math.min(items.length-1,active+1);paint();}
            else if(event.key==='ArrowUp'){event.preventDefault();active=Math.max(0,active-1);paint();}
            else if(event.key==='Enter'){event.preventDefault();choose(active,event.shiftKey);}
            else if(event.key==='Escape'){event.preventDefault();close();}
        });
        list.addEventListener('click',event=>{const row=event.target.closest('[data-qs-index]');if(row)choose(Number(row.dataset.qsIndex),event.shiftKey);});
        dialog.addEventListener('mousedown',event=>{if(event.target===dialog)close();});
        paint();input.focus();
    }
    // Numéros Sosa recalculés une fois par lancement (l'arbre a pu changer ; ajoute les numéros multiples)
    setTimeout(()=>{syncSosaWithStartPerson().catch(()=>{});},sosaRootId()===Number(state.bootstrap?.startPersonId)?4000:300);
    // Boutons « Gérer les objets », « Tout voir »… : ouvrent la liste correspondante
    document.addEventListener('click',event=>{const b=event.target.closest?.('[data-open-list]');if(!b)return;state.listType=b.dataset.openList;state.precisePlaceKey='';setModule('listes');});
    // Commandes du menu de l'application de bureau (Fichier → Recherche rapide ; clic sur une notification de rappel)
    try{window.lcnda?.onCommand?.(command=>{if(command==='quick-search')openQuickSearch();if(command==='open-reminders'){state.listType='reminders';setModule('listes');}if(command.startsWith('shortcut:'))runShortcutCommand(command.slice(9));});}catch(_){}
    /* ── Plusieurs fenêtres (ou écran divisé) : un réglage changé dans l'une est repris par les autres ──
     * Les fenêtres de l'application partagent le même stockage local : le navigateur prévient les AUTRES fenêtres
     * (événement « storage »). On réapplique l'apparence et on réaffiche l'écran, sauf pendant une saisie (on attend). */
    const CROSS_WINDOW_IGNORED=/^(genealogie-(last-route|baissait-ui-v2|auto-backup-lock|auto-backup-settings|dashboard-recent-people|sosa-map|daboville-map|goose-active-v1|goose-games-v1)$|lcnda-side-panel-)/;
    let crossWindowTimer=null,crossWindowPending=false;
    window.addEventListener('storage',event=>{
        if(event.storageArea&&event.storageArea!==localStorage)return;
        if(event.key&&(!/^(genealogie-|lcnda-)/.test(event.key)||CROSS_WINDOW_IGNORED.test(event.key)))return;
        crossWindowPending=true;clearTimeout(crossWindowTimer);crossWindowTimer=setTimeout(applyCrossWindowChange,500);
    });
    function applyCrossWindowChange(){
        if(!crossWindowPending)return;
        const busy=isTypingTarget(document.activeElement)||openModalDialog()||$('#lightbox')?.open||shortcutCaptureHandler;
        if(busy){clearTimeout(crossWindowTimer);crossWindowTimer=setTimeout(applyCrossWindowChange,1500);return;}
        crossWindowPending=false;
        try{applyDesign();}catch(_){}
        try{applyMenuOrder();}catch(_){}
        try{document.documentElement.classList.toggle('transcription-stacked',localStorage.getItem('genealogie-transcription-layout')==='stacked');}catch(_){}
        publishShortcutsToMenu();
        if(!state.hasRendered)return;
        if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);
        else setModule(state.module,false);
    }

    /* ── Raccourcis clavier ──────────────────────────────────────────────────────────────────────────────────────
     * Une seule liste (SHORTCUT_DEFS) sert à tout : la lecture des touches, le menu de l'application de bureau, l'aide
     * (F1) et l'onglet Maintenance → Raccourcis. « Mod » = ⌘ sur Mac, Ctrl sur Windows et Linux. Les lettres sont lues
     * d'après le caractère tapé (AZERTY compris) ; les chiffres d'après la position de la touche (sinon « & é " »).
     * Règle : un raccourci sans ⌘/Ctrl (lettre seule, ⌥ + flèche…) ne marche jamais pendant qu'on écrit dans une case.
     */
    const IS_MAC=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||'');
    const SHORTCUT_PLATFORM=IS_MAC?'mac':(/Win/.test(navigator.platform||navigator.userAgent||'')?'win':'linux');
    const SHORTCUTS_KEY='genealogie-shortcuts',SHORTCUT_PRESETS_KEY='genealogie-shortcut-presets';
    const SHORTCUT_GROUPS=[['windows','Fenêtres et écran divisé'],['move','Se déplacer'],['person','Sur une fiche personne'],['family','Se promener dans la famille'],['form','Pendant la saisie'],['list','Dans les listes'],['viewer','Dans la visionneuse de médias'],['transcription','Dans une transcription'],['battue','Dans une battue'],['safety','Sécurité']];
    // Ordre de priorité quand une même touche sert à plusieurs endroits (la visionneuse ouverte passe avant la battue…)
    const SHORTCUT_CTX_ORDER=['viewer','form','transcription','battue','list','person','global'];
    const sc=(id,group,label,keys,ctx,run,extra={})=>({id,group,label,keys:typeof keys==='string'?{mac:keys,other:keys}:keys,ctx,run,...extra});
    const SHORTCUT_DEFS=[
        sc('new_window','windows','Ouvrir l’écran actuel dans une nouvelle fenêtre','Mod+N','global',()=>window.open(viewUrl(viewSnapshot()),'_blank'),{menu:true}),
        sc('split','windows','Diviser l’écran en deux (ou le refermer)','Mod+Shift+D','global',()=>splitScreenToggle(),{menu:true}),
        sc('split_orientation','windows','Écran divisé : côte à côte ou en haut et en bas','Mod+Shift+O','global',()=>splitScreenOrientation(),{menu:true}),
        sc('switch_half','windows','Passer d’une moitié de l’écran à l’autre','F6','global',()=>switchScreenHalf(),{menu:true}),
        ...Array.from({length:9},(_,i)=>sc(`go_${i+1}`,'move',`Aller à la rubrique n° ${i+1} de la barre du haut`,`Mod+${i+1}`,'global',()=>goToMenuSection(i),{menu:true})),
        sc('back','move','Écran précédent',{mac:'Mod+ArrowLeft',other:'Alt+ArrowLeft'},'global',()=>navHistoryGo(-1),{noTyping:true,menu:true}),
        sc('forward','move','Écran suivant',{mac:'Mod+ArrowRight',other:'Alt+ArrowRight'},'global',()=>navHistoryGo(1),{noTyping:true,menu:true}),
        sc('find','move','Chercher un mot dans l’écran affiché','Mod+F','global',()=>openFindBar(),{menu:true}),
        sc('quick_search','move','Recherche rapide (personnes, battues, enquêtes, lieux, écrans)','Mod+K','global',()=>openQuickSearch(),{menu:true}),
        sc('settings','move','Ouvrir les réglages (Apparence)','Mod+,','global',()=>{state.maintenanceTab='design';setModule('maintenance');},{menu:true}),
        sc('help','move','Afficher la liste des raccourcis','F1','any',()=>openShortcutHelp(),{menu:true}),
        sc('edit_person','person','Modifier la fiche ouverte','Mod+E','person',()=>{if(personIsLocked())return toast('Cette fiche est verrouillée.','error');openPersonDialog(state.currentPerson);},{noTyping:true,menu:true}),
        sc('new_person','person','Nouvelle personne','Mod+Shift+N','global',()=>openNewPersonDialog(),{menu:true}),
        sc('bookmark','person','Ajouter ou retirer des signets','Mod+D','person',()=>togglePersonBookmark(),{menu:true}),
        sc('print','person','Imprimer la fiche ou l’écran','Mod+P','global',()=>window.print(),{menu:true}),
        sc('copy_ref','person','Copier la référence de la personne (nom, années, Sosa)','Mod+Shift+C','person',()=>copyPersonReference(),{menu:true}),
        sc('go_father','family','Aller au père','Alt+ArrowUp','person',()=>goToRelative('father')),
        sc('go_mother','family','Aller à la mère','Alt+Shift+ArrowUp','person',()=>goToRelative('mother')),
        sc('go_child','family','Aller à un enfant (une liste s’ouvre s’il y en a plusieurs)','Alt+ArrowDown','person',()=>goToRelative('child')),
        sc('go_prev_sibling','family','Frère ou sœur précédent (par ordre de naissance)','Alt+Shift+ArrowLeft','person',()=>goToRelative('prev_sibling')),
        sc('go_next_sibling','family','Frère ou sœur suivant','Alt+Shift+ArrowRight','person',()=>goToRelative('next_sibling')),
        sc('go_spouse','family','Aller au conjoint','Alt+Shift+C','person',()=>goToRelative('spouse')),
        sc('go_root','family','Revenir au de cujus (personne de départ)','Mod+Shift+H','global',()=>{const id=Number(state.bootstrap?.startPersonId)||0;if(!id)return toast('Aucune personne de départ n’est définie.','error');openPersonById(id);},{menu:true}),
        sc('save_form','form','Enregistrer le formulaire ouvert','Mod+Enter','form',()=>submitActiveForm()),
        sc('add_event','form','Ajouter un événement à la fiche','Mod+Shift+E','person',()=>{if(personIsLocked())return toast('Cette fiche est verrouillée.','error');openEventDialog(state.currentPerson);},{menu:true}),
        sc('add_media','form','Ajouter un média à la fiche','Mod+Shift+M','person',()=>{if(personIsLocked())return toast('Cette fiche est verrouillée.','error');openMediaDialog(state.currentPerson);},{menu:true}),
        sc('add_source','form','Ajouter une source ou une citation','Mod+Shift+S','person',()=>{if(personIsLocked())return toast('Cette fiche est verrouillée.','error');openSourceDialog(state.currentPerson.person.id);},{menu:true}),
        sc('add_reminder','form','Créer un rappel lié à la fiche','Mod+Alt+R','person',()=>openPersonReminderDialog(),{menu:true}),
        sc('list_down','list','Ligne suivante','ArrowDown','list',()=>moveListCursor(1)),
        sc('list_up','list','Ligne précédente','ArrowUp','list',()=>moveListCursor(-1)),
        sc('list_open','list','Ouvrir la ligne choisie','Enter','list',()=>openListCursor(),{when:()=>!!listCursorRow()}),
        sc('list_preview','list','Aperçu rapide (photo, document) sans quitter la liste','Space','list',()=>previewListCursor(),{when:()=>!!listCursorRow()}),
        sc('viewer_prev','viewer','Média précédent','ArrowLeft','viewer',()=>moveLightbox(-1)),
        sc('viewer_next','viewer','Média suivant','ArrowRight','viewer',()=>moveLightbox(1)),
        sc('viewer_rotate','viewer','Tourner l’image (vers la droite)','R','viewer',()=>rotateCurrentMedia('right')),
        sc('viewer_zoom_in','viewer','Zoom avant','+','viewer',()=>lightboxZoomBy(1.25),{aliases:['=']}),
        sc('viewer_zoom_out','viewer','Zoom arrière','-','viewer',()=>lightboxZoomBy(0.8)),
        sc('viewer_zoom_reset','viewer','Taille d’origine','0','viewer',()=>resetLightboxZoom()),
        sc('viewer_play','viewer','Lecture / pause (audio, vidéo)','Space','viewer',()=>lightboxPlayer(p=>p.paused?p.play():p.pause())),
        sc('viewer_back','viewer','Reculer de 10 secondes','J','viewer',()=>lightboxPlayer(p=>{p.currentTime=Math.max(0,p.currentTime-10);})),
        sc('viewer_forward','viewer','Avancer de 10 secondes','L','viewer',()=>lightboxPlayer(p=>{p.currentTime=Math.min(p.duration||1e9,p.currentTime+10);})),
        sc('tr_illegible','transcription','Insérer « [illisible] »','Mod+Shift+L','transcription',()=>insertInTranscription('[illisible]')),
        sc('tr_uncertain','transcription','Insérer « [?] » après un mot incertain','Mod+Shift+U','transcription',()=>insertInTranscription('[?]')),
        sc('tr_layout','transcription','Image et texte côte à côte, ou l’un sous l’autre','Mod+Shift+T','transcription',()=>toggleTranscriptionLayout()),
        sc('battue_1','battue','La commune choisie passe à « Pas commencé »','1','battue',()=>setBattueCommuneStatusByKey('not_started')),
        sc('battue_2','battue','La commune choisie passe à « Pas terminé »','2','battue',()=>setBattueCommuneStatusByKey('unfinished')),
        sc('battue_3','battue','La commune choisie passe à « Terminé »','3','battue',()=>setBattueCommuneStatusByKey('done')),
        sc('battue_next','battue','Aller à la prochaine commune pas encore terminée','N','battue',()=>moveBattueCursor()),
        sc('battue_registers','battue','Ouvrir les registres en ligne de la commune choisie','R','battue',()=>{const card=battueActiveCard();card?.querySelector('[data-battue-registers]')?.click();}),
        sc('backup_now','safety','Faire une sauvegarde tout de suite','Mod+Shift+B','global',()=>backupNow(),{menu:true}),
        sc('undo','safety','Annuler la dernière modification d’une fiche (hors d’une case de texte, avec confirmation)','Mod+Z','global',()=>undoLastChange(),{noTyping:true}),
    ];
    // Raccourcis du système : une touche choisie ici ne marcherait pas (ou ferait autre chose). « all » = les trois systèmes,
    // pour les raccourcis du menu de l'application (copier, coller, recharger…).
    const OS_SHORTCUTS={
        all:{'Mod+C':'Copier','Mod+V':'Coller','Mod+X':'Couper','Mod+A':'Tout sélectionner','Mod+Shift+Z':'Rétablir','Mod+R':'Recharger l’écran','Mod+Shift+R':'Forcer le rechargement','Mod+0':'Taille réelle de l’affichage','Mod++':'Zoom de l’affichage','Mod+=':'Zoom de l’affichage','Mod+-':'Zoom arrière de l’affichage','Mod+W':'Fermer la fenêtre','Mod+Q':'Quitter','Mod+M':'Réduire la fenêtre','Tab':'Passer d’un champ à l’autre','Shift+Tab':'Champ précédent','Escape':'Fermer une fenêtre de saisie'},
        mac:{'Mod+H':'Masquer l’application','Mod+Alt+H':'Masquer les autres applications','Mod+Tab':'Changer d’application','Mod+Space':'Spotlight','Mod+Alt+Space':'Recherche du Finder','Mod+Shift+3':'Capture d’écran','Mod+Shift+4':'Capture d’une zone','Mod+Shift+5':'Outil de capture','Mod+Ctrl+Q':'Verrouiller l’écran','Mod+Ctrl+F':'Plein écran','Mod+Alt+Escape':'Forcer à quitter','Mod+?':'Recherche dans le menu Aide','Mod+Alt+D':'Afficher / masquer le Dock','Mod+`':'Passer d’une fenêtre à l’autre','Ctrl+ArrowLeft':'Bureau précédent (Mission Control)','Ctrl+ArrowRight':'Bureau suivant (Mission Control)','Ctrl+ArrowUp':'Mission Control','Ctrl+ArrowDown':'Fenêtres de l’application','Mod+Ctrl+Space':'Emoji et symboles','Mod+Shift+Q':'Fermer la session','Mod+Alt+M':'Réduire toutes les fenêtres'},
        win:{'Alt+F4':'Fermer la fenêtre','Alt+Tab':'Changer d’application','Mod+Escape':'Menu Démarrer','Mod+Shift+Escape':'Gestionnaire des tâches','Mod+Alt+Delete':'Écran de sécurité','Alt+Space':'Menu de la fenêtre','Mod+Alt+ArrowUp':'Rotation de l’écran (pilotes Intel)','Mod+Alt+ArrowDown':'Rotation de l’écran (pilotes Intel)','Mod+Alt+ArrowLeft':'Rotation de l’écran (pilotes Intel)','Mod+Alt+ArrowRight':'Rotation de l’écran (pilotes Intel)','Mod+Y':'Rétablir','F11':'Plein écran','F10':'Menu de la fenêtre','Mod+Shift+I':'Outils de développement (version de test)','Alt':'Menu de la fenêtre'},
        linux:{'Alt+F4':'Fermer la fenêtre','Alt+Tab':'Changer d’application','Mod+Alt+T':'Ouvrir un terminal','Mod+Alt+L':'Verrouiller l’écran','Mod+Alt+Delete':'Fermer la session','Mod+Alt+ArrowUp':'Changer de bureau','Mod+Alt+ArrowDown':'Changer de bureau','Mod+Alt+ArrowLeft':'Changer de bureau','Mod+Alt+ArrowRight':'Changer de bureau','Alt+F2':'Lancer une commande','Alt+F1':'Menu des applications','Alt+F7':'Déplacer la fenêtre','Alt+F8':'Redimensionner la fenêtre','Alt+Space':'Menu de la fenêtre','Mod+Shift+U':'Taper un caractère Unicode (dans les cases de texte)','Mod+Y':'Rétablir','F11':'Plein écran','Mod+Shift+I':'Outils de développement (version de test)'},
    };
    // Touches qui marchent mal sans précaution (affiché à titre d'information, sans empêcher le choix)
    const OS_SHORTCUT_NOTES={mac:{'F1':'Sur beaucoup de claviers Mac, il faut appuyer aussi sur fn (sinon F1 baisse la luminosité).','F6':'Sur beaucoup de claviers Mac, il faut appuyer aussi sur fn.','Mod+E':'Dans une case de texte, ⌘E sert à « chercher la sélection » : le raccourci ne marche donc qu’en dehors des cases.'},win:{},linux:{}};

    function shortcutOverrides(){try{const v=JSON.parse(localStorage.getItem(SHORTCUTS_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch(_){return {};}}
    function saveShortcutOverrides(map){try{localStorage.setItem(SHORTCUTS_KEY,JSON.stringify(map));}catch(_){}publishShortcutsToMenu();applyShortcutHints();}
    const shortcutDefault=def=>IS_MAC?def.keys.mac:def.keys.other;
    function shortcutFor(def){const o=shortcutOverrides();return Object.prototype.hasOwnProperty.call(o,def.id)?String(o[def.id]||''):shortcutDefault(def);}
    const shortcutHasMod=combo=>/(^|\+)(Mod|Ctrl|Meta)\+/.test(combo);
    const shortcutIsFKey=combo=>/(^|\+)F\d{1,2}$/.test(combo);
    /** Ce qu'a tapé la personne, sous la forme « Mod+Shift+D » (même forme que les réglages). */
    function eventCombo(e){
        let key=String(e.key||'');
        if(['Meta','Control','Alt','Shift','OS','AltGraph','CapsLock','Dead','Fn','Unidentified',''].includes(key))return '';
        const code=String(e.code||'');let digit=false,symbol=false;
        if(/^Digit\d$/.test(code)){key=code.slice(5);digit=true;}
        else if(/^Numpad\d$/.test(code)){key=code.slice(6);digit=true;}
        else if(key.length===1&&/[a-z]/i.test(key)&&/^[\x20-\x7e]$/.test(key))key=key.toUpperCase();
        else if(/^Key[A-Z]$/.test(code)&&(e.altKey||e.metaKey||e.ctrlKey))key=code.slice(3); // ⌥ + lettre sur Mac donne « ç », « ∂ »…
        else if(key===' ')key='Space';
        else if(key.length===1){symbol=true;}
        else if(key==='Esc')key='Escape';
        const parts=[];
        if(IS_MAC?e.metaKey:e.ctrlKey)parts.push('Mod');
        if(IS_MAC&&e.ctrlKey)parts.push('Ctrl');
        if(!IS_MAC&&e.metaKey)parts.push('Meta');
        if(e.altKey)parts.push('Alt');
        // Chiffre sans ⌘/Ctrl : la Majuscule est ignorée (sur AZERTY, « 1 » se tape avec Maj)
        if(e.shiftKey&&!symbol&&!(digit&&!parts.includes('Mod')&&!parts.includes('Ctrl')))parts.push('Shift');
        return [...parts,key].join('+');
    }
    function comboLabel(combo){
        if(!combo)return '—';
        const keyNames={ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Enter:IS_MAC?'↩︎':'Entrée',Escape:'Échap',Space:'Espace',Backspace:IS_MAC?'⌫':'Retour arrière',Delete:'Suppr',Tab:'Tab'};
        const raw=combo==='+'?['+']:combo.endsWith('++')?[...combo.slice(0,-2).split('+').filter(Boolean),'+']:combo.split('+');
        const key=raw[raw.length-1],mods=raw.slice(0,-1);
        if(IS_MAC){const g={Ctrl:'⌃',Alt:'⌥',Shift:'⇧',Mod:'⌘'};return mods.map(m=>g[m]||m).join('')+(keyNames[key]||key);}
        const g={Mod:'Ctrl',Alt:'Alt',Shift:'Maj',Meta:'Win'};return [...mods.map(m=>g[m]||m),keyNames[key]||key].join('+');
    }
    const kbd=combo=>`<kbd class="shortcut-kbd">${escapeHtml(comboLabel(combo))}</kbd>`;
    /* ⌨️ Le raccourci d'un bouton se lit dans sa bulle d'aide (data-shortcut, mis en forme par app-harmony.js).
     * Valeur lue à l'affichage : un raccourci personnalisé dans Maintenance → Raccourcis est pris en compte. */
    const SHORTCUT_BUTTONS=[['#new-person','new_person'],['[data-edit-person-inline]','edit_person'],['[data-toggle-bookmark]','bookmark'],['[data-print-person]','print'],
        ['[data-add-event-inline]','add_event'],['[data-add-media-inline]','add_media'],['[data-add-source-inline]','add_source'],
        ['#side-panel-open','split'],['#new-window-open','new_window'],['#dashboard-open-design','settings'],['#auto-backup-save-now','backup_now'],
        ['#lightbox-prev','viewer_prev'],['#lightbox-next','viewer_next'],['#rotate-media-right','viewer_rotate'],
        ['[data-insert="[illisible]"]','tr_illegible'],['[data-insert="[?]"]','tr_uncertain'],['[data-battue-registers]','battue_registers']];
    // Touches fixes (non personnalisables) : Échap ferme la visionneuse et la barre « Chercher dans l’écran »
    const SHORTCUT_FIXED_BUTTONS=[['#lightbox .lightbox-close','Échap'],['[data-find-close]','Échap']];
    function shortcutHintText(id){const def=SHORTCUT_DEFS.find(d=>d.id===id);const combo=def?shortcutFor(def):'';return combo?comboLabel(combo):'';}
    function applyShortcutHints(root=document){
        if(!root?.querySelectorAll)return;
        const set=(el,id)=>{const k=shortcutHintText(id),done=el.dataset.scDone;
            if(!k){if(el.dataset.shortcut){delete el.dataset.shortcut;if(done&&el.title)el.title=el.title.replace(/\s*\([^()]*\)\s*$/,'');delete el.dataset.scDone;}return;}
            if(el.dataset.shortcut===k)return;el.dataset.shortcut=k;
            // Bulle déjà complétée avec l'ancien raccourci : on la remet à jour ici (app-harmony ne revoit que les boutons ajoutés)
            if(done&&done!==k&&el.title){el.title=`${el.title.replace(/\s*\([^()]*\)\s*$/,'')} (${k})`;el.dataset.scDone=k;}};
        SHORTCUT_BUTTONS.forEach(([sel,id])=>{if(root.matches?.(sel))set(root,id);root.querySelectorAll(sel).forEach(el=>set(el,id));});
        SHORTCUT_FIXED_BUTTONS.forEach(([sel,k])=>{const els=[...root.querySelectorAll(sel)];if(root.matches?.(sel))els.push(root);els.forEach(el=>{el.dataset.shortcut=k;});});
        // Fenêtre de saisie : ⌘↩︎ enregistre (premier bouton d'envoi du formulaire, comme submitActiveForm)
        const forms=new Set([...root.querySelectorAll('dialog form')]);if(root.matches?.('dialog form'))forms.add(root);const host=root.closest?.('dialog form');if(host)forms.add(host);
        forms.forEach(form=>{const b=form.querySelector('button[type="submit"]');if(b)set(b,'save_form');});
    }
    new MutationObserver(list=>list.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)applyShortcutHints(n);}))).observe(document.documentElement,{childList:true,subtree:true});
    applyShortcutHints();
    function shortcutOsConflict(combo){return (OS_SHORTCUTS[SHORTCUT_PLATFORM]||{})[combo]||OS_SHORTCUTS.all[combo]||'';}

    const isTypingTarget=el=>!!el&&(el.isContentEditable||(!!el.matches&&el.matches('textarea,select,input')&&!(el.matches('input')&&['checkbox','radio','button','submit','reset','range','color','file','image'].includes(el.type))));
    const openModalDialog=()=>[...document.querySelectorAll('dialog[open]')].find(d=>d.id!=='lightbox'&&!d.classList.contains('find-bar'));
    function shortcutContextActive(ctx){
        const lightboxOpen=!!$('#lightbox')?.open,modal=openModalDialog(),active=document.activeElement;
        if(ctx==='any')return true;
        if(ctx==='viewer')return lightboxOpen&&!modal;
        if(ctx==='form')return !!(active?.closest?.('form')||modal?.querySelector('form'));
        if(ctx==='transcription')return !!(transcriptionArea()||($('#lightbox')?.open)||$('.archive-transcription-layout'));
        if(modal||lightboxOpen)return false;
        if(ctx==='battue')return !!$('[data-battue-commune-card]');
        if(ctx==='list')return !!listCursorRows().length&&(!!active?.closest?.('#sidebar-content')||state.module==='listes'||!!$('.is-key-row'));
        if(ctx==='person')return state.module==='personnes'&&!!state.currentPerson?.person;
        return true;
    }
    let lastShortcutRun={id:'',t:0,source:''};
    function runShortcut(def,source){
        // Le même raccourci peut arriver deux fois (touche lue par la page ET menu de l'application) : une seule exécution
        const now=Date.now();if(lastShortcutRun.id===def.id&&lastShortcutRun.source!==source&&now-lastShortcutRun.t<400)return;lastShortcutRun={id:def.id,t:now,source};
        try{const r=def.run();if(r&&typeof r.catch==='function')r.catch(error=>toast(error.message,'error'));}catch(error){toast(error.message,'error');}
    }
    let shortcutCaptureHandler=null; // onglet Raccourcis : la prochaine touche est enregistrée au lieu d'agir
    document.addEventListener('keydown',event=>{
        if(shortcutCaptureHandler){event.preventDefault();event.stopPropagation();shortcutCaptureHandler(event);return;}
        if(event.isComposing||event.repeat&&!/Arrow/.test(event.key))return;
        const combo=eventCombo(event);if(!combo)return;
        const typing=isTypingTarget(event.target);
        const matches=SHORTCUT_DEFS.filter(def=>{const c=shortcutFor(def);return c&&(c===combo||(c===shortcutDefault(def)&&(def.aliases||[]).includes(combo)));})
            .sort((a,b)=>SHORTCUT_CTX_ORDER.indexOf(a.ctx)-SHORTCUT_CTX_ORDER.indexOf(b.ctx));
        for(const def of matches){
            const allowedTyping=!def.noTyping&&(shortcutHasMod(combo)||shortcutIsFKey(combo));
            if(typing&&!allowedTyping)continue;
            if(!shortcutContextActive(def.ctx))continue;
            if(def.when&&!def.when())continue;
            event.preventDefault();event.stopPropagation();runShortcut(def,'key');return;
        }
    },true);
    // Commandes du menu de l'application de bureau (« shortcut:<id> »), avec les mêmes règles que les touches
    function runShortcutCommand(id){
        if(id==='customize_shortcuts'){state.maintenanceTab='raccourcis';setModule('maintenance');return;}
        if(id==='edit_undo'||id==='edit_redo'){if(isTypingTarget(document.activeElement)){document.execCommand(id==='edit_undo'?'undo':'redo');return;}const top=[...document.querySelectorAll('dialog[open]')].pop();if(top){/* un éditeur ouvert (montage, retouche, mise en page) : le ⌘Z / ⇧⌘Z du menu lui revient, comme une touche */const target=top.contains(document.activeElement)?document.activeElement:top;target.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:true,shiftKey:id==='edit_redo',bubbles:true,cancelable:true}));return;}if(id==='edit_redo')return;id='undo';}const def=SHORTCUT_DEFS.find(d=>d.id===id);if(!def)return;if(def.noTyping&&isTypingTarget(document.activeElement))return;if(!shortcutContextActive(def.ctx))return toast(def.ctx==='person'?'Ouvre d’abord une fiche personne.':'Ce raccourci ne sert pas sur cet écran.');runShortcut(def,'menu');}
    /** Envoie les raccourcis au menu de l'application (Mac, Windows, Linux) pour qu'il les affiche. */
    function publishShortcutsToMenu(){
        if(IS_EMBEDDED||!window.lcnda?.setShortcuts)return;
        const visible=orderedMenuKeys().filter(key=>key==='maintenance'||!menuHiddenKeys().includes(key));
        const items={};SHORTCUT_DEFS.filter(d=>d.menu).forEach(def=>{const combo=shortcutFor(def);
            // Seuls les raccourcis avec ⌘/Ctrl ou une touche F sont « enregistrés » dans le menu ; les autres y sont seulement affichés
            items[def.id]={combo,label:def.id.startsWith('go_')?(modules[visible[Number(def.id.slice(3))-1]]?.[1]||''):'',register:!!combo&&!def.noTyping&&(shortcutHasMod(combo)||shortcutIsFKey(combo))};});
        try{window.lcnda.setShortcuts(items);}catch(_){}
    }

    /* Actions */
    const personIsLocked=()=>Number(state.currentPerson?.person?.is_locked)===1;
    function openPersonById(id){if(!id)return;if(state.module==='personnes')return selectPerson(Number(id));state.currentPersonId=Number(id);setModule('personnes');}
    function goToMenuSection(index){const keys=orderedMenuKeys().filter(key=>key==='maintenance'||!menuHiddenKeys().includes(key));const key=keys[index];if(key)setModule(key);}
    function splitScreenToggle(){if(IS_EMBEDDED){try{return window.parent.lcndaSplitToggle?.();}catch(_){return;}}if($('#side-panel'))closeSidePanel();else openSidePanel();}
    window.lcndaSplitToggle=splitScreenToggle;
    function splitScreenOrientation(){if(IS_EMBEDDED){try{return window.parent.lcndaSplitOrientation?.();}catch(_){return;}}if(!$('#side-panel'))openSidePanel();const next=document.body.classList.contains('side-panel-bottom')?'right':'bottom';setSidePanelOrientation(next);try{localStorage.setItem('lcnda-side-panel-orientation',next);}catch(_){}}
    window.lcndaSplitOrientation=splitScreenOrientation;
    function switchScreenHalf(){
        if(IS_EMBEDDED){try{window.parent.focus();window.parent.lcndaFlashHalf?.('main');}catch(_){}return;}
        const frame=$('#side-panel-frame');if(!frame)return toast('L’écran n’est pas divisé (⌘⇧D / Ctrl+Maj+D pour le diviser).'.replace(IS_MAC?' / Ctrl+Maj+D':'⌘⇧D / ',''));
        frame.focus();try{frame.contentWindow.focus();}catch(_){}lcndaFlashHalf('side');
    }
    function lcndaFlashHalf(which){const el=which==='side'?$('#side-panel'):$('#workspace');if(!el)return;el.classList.remove('is-half-flash');void el.offsetWidth;el.classList.add('is-half-flash');setTimeout(()=>el.classList.remove('is-half-flash'),700);}
    window.lcndaFlashHalf=lcndaFlashHalf;
    /** Ouvre un écran dans la partie principale (appelé par le panneau de droite pour un ⌘-clic). */
    window.lcndaOpenView=view=>{applyViewSnapshot(view);setModule(view.module||'personnes');window.focus();};
    // ⌘-clic (Ctrl-clic) sur une personne, une battue ou une enquête : l'ouvrir dans l'autre moitié ; ⌘⇧-clic : nouvelle fenêtre
    document.addEventListener('click',event=>{
        if(!(IS_MAC?event.metaKey:event.ctrlKey)||event.button!==0)return;
        const el=event.target.closest?.('[data-open-person],[data-open-dashboard-person],.person-list-item[data-person-id],[data-open-battue],[data-open-battue-from-person],[data-open-investigation]');
        if(!el)return;
        const base={...viewSnapshot()};let view=null;
        const pid=Number(el.dataset.openPerson||el.dataset.openDashboardPerson||el.dataset.personId||0);
        if(pid)view={...base,module:'personnes',currentPersonId:pid};
        const bid=Number(el.dataset.openBattue||el.dataset.openBattueFromPerson||0);
        if(bid)view={...base,module:'enquetes',enquetesTab:'battue',currentInvestigationId:0,currentBattueId:bid};
        const iid=Number(el.dataset.openInvestigation||0);
        if(iid)view={...base,module:'enquetes',currentInvestigationId:iid,investigationFolderId:0,currentBattueId:0};
        if(!view)return;
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        if(event.shiftKey)return window.open(viewUrl(view),'_blank');
        if(IS_EMBEDDED){try{window.parent.lcndaOpenView(view);}catch(_){}return;}
        openSidePanel(view);
    },true);

    // Précédent / suivant : historique des écrans visités (relevé toutes les 0,6 s, sans rien enregistrer sur le disque)
    const navHistory={stack:[],index:-1,lockUntil:0};
    function navSnapshotKey(view){const {graphPlaceMonograph,...rest}=view;return JSON.stringify(rest);}
    setInterval(()=>{if(!state.hasRendered||Date.now()<navHistory.lockUntil)return;const view=viewSnapshot();const key=navSnapshotKey(view);if(navHistory.index>=0&&navSnapshotKey(navHistory.stack[navHistory.index])===key)return;navHistory.stack=navHistory.stack.slice(0,navHistory.index+1);navHistory.stack.push(view);if(navHistory.stack.length>100)navHistory.stack.shift();navHistory.index=navHistory.stack.length-1;},600);
    function navHistoryGo(step){
        const target=navHistory.index+step;
        if(target<0||target>=navHistory.stack.length)return toast(step<0?'Pas d’écran précédent.':'Pas d’écran suivant.');
        navHistory.index=target;navHistory.lockUntil=Date.now()+1500;
        const view=navHistory.stack[target];
        if(view.module==='personnes'&&state.module==='personnes'&&view.currentPersonId){applyViewSnapshot(view);selectPerson(view.currentPersonId);return;}
        applyViewSnapshot(view);setModule(view.module||'personnes');
    }
    // Boutons « précédent / suivant » des souris
    window.addEventListener('mouseup',event=>{if(event.button===3||event.button===4){event.preventDefault();navHistoryGo(event.button===3?-1:1);}});

    // Chercher dans l'écran (⌘F)
    /**
     * ⌘F / Ctrl+F : cherche dans l'écran affiché, surligne toutes les occurrences (sans toucher à la page : surlignage
     * CSS Custom Highlight) et affiche « 3 / 12 ». Entrée : suivante ; Maj+Entrée : précédente ; Échap : fermer.
     */
    const findState={ranges:[],index:-1};
    function findRoots(){const open=[...document.querySelectorAll('dialog[open]')];return open.length?[open[open.length-1]]:[$('#workspace'),$('#sidebar')].filter(Boolean);}
    function findCollect(q){
        const ranges=[];if(!q)return ranges;const needle=q.toLocaleLowerCase('fr');
        const fold=t=>t.toLocaleLowerCase('fr');
        findRoots().forEach(root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:node=>{const p=node.parentElement;if(!p||p.closest('script,style,textarea,#find-bar,[hidden]'))return NodeFilter.FILTER_REJECT;if(!p.offsetParent&&p.getClientRects().length===0)return NodeFilter.FILTER_REJECT;return node.nodeValue.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});
            let node;while((node=walker.nextNode())){const text=fold(node.nodeValue);let at=text.indexOf(needle);while(at>=0){const r=document.createRange();r.setStart(node,at);r.setEnd(node,at+q.length);ranges.push(r);at=text.indexOf(needle,at+Math.max(1,q.length));}}
        });
        return ranges;
    }
    function findPaint(){
        if(!window.CSS?.highlights)return;
        CSS.highlights.delete('lcnda-find');CSS.highlights.delete('lcnda-find-current');
        if(findState.ranges.length)CSS.highlights.set('lcnda-find',new Highlight(...findState.ranges));
        const cur=findState.ranges[findState.index];if(cur){CSS.highlights.set('lcnda-find-current',new Highlight(cur));const el=cur.startContainer.parentElement;el?.scrollIntoView({block:'center',behavior:'smooth'});}
    }
    function openFindBar(){
        let bar=$('#find-bar');
        if(!bar){
            bar=document.createElement('div');bar.id='find-bar';bar.className='find-bar';bar.setAttribute('role','search');
            bar.innerHTML=`<input type="search" placeholder="Chercher dans l’écran…" aria-label="Chercher dans l’écran"><span class="find-bar-count" aria-live="polite"></span><button type="button" class="button small secondary" data-find="-1" title="Précédente" data-shortcut="${IS_MAC?'⇧↩︎':'Maj+Entrée'}">↑</button><button type="button" class="button small secondary" data-find="1" title="Suivante" data-shortcut="${IS_MAC?'↩︎':'Entrée'}">↓</button><button type="button" class="icon-button" data-find-close aria-label="Fermer">×</button>`;
            document.body.append(bar);
            const input=$('input',bar),count=$('.find-bar-count',bar);
            const show=()=>{const n=findState.ranges.length;count.textContent=input.value?(n?`${findState.index+1} / ${n}`:'Aucune'):'';count.classList.toggle('is-none',!!input.value&&!n);};
            const refresh=()=>{findState.ranges=findCollect(input.value);findState.index=findState.ranges.length?0:-1;findPaint();show();};
            const go=dir=>{if(!findState.ranges.length){refresh();return;}findState.index=(findState.index+dir+findState.ranges.length)%findState.ranges.length;findPaint();show();input.focus({preventScroll:true});};
            const close=()=>{bar.hidden=true;findState.ranges=[];findState.index=-1;findPaint();};
            input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go(e.shiftKey?-1:1);}if(e.key==='Escape'){e.preventDefault();close();}});
            let timer=0;input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(refresh,120);});
            $$('[data-find]',bar).forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.find))));
            $('[data-find-close]',bar).addEventListener('click',close);
            bar._refresh=refresh;
        }
        bar.hidden=false;const input=$('input',bar);const sel=String(window.getSelection?.()||'').trim();if(sel&&sel.length<80)input.value=sel;input.focus();input.select();if(input.value)bar._refresh();
    }

    function bookmarkButtonLabel(person){const keys=comboLabel(shortcutFor(SHORTCUT_DEFS.find(d=>d.id==='bookmark')));return `${Number(person.is_bookmarked)?'Retirer des signets':'Ajouter aux signets'}${keys&&keys!=='—'?` (${keys})`:''}`;}
    async function togglePersonBookmark(){
        const p=state.currentPerson.person;const on=Number(p.is_bookmarked)?0:1;
        await api('set_person_bookmark',{},{method:'POST',body:{person_id:p.id,bookmarked:on}});
        p.is_bookmarked=on;const listed=(state.people||[]).find(x=>Number(x.id)===Number(p.id));if(listed)listed.is_bookmarked=on;
        $$(`[data-toggle-bookmark="${p.id}"]`).forEach(button=>{button.classList.toggle('icon-bookmark-on',!!on);button.classList.toggle('icon-bookmark',!on);const label=bookmarkButtonLabel(p);button.title=label;button.setAttribute('aria-label',label);});
        $$(`.person-list-item[data-person-id="${p.id}"] strong`).forEach(strong=>{strong.querySelector('.bookmark-mark')?.remove();if(on)strong.insertAdjacentHTML('afterbegin','<span class="bookmark-mark" title="En signet" aria-label="En signet"></span>');});
        if(state.personTab==='bookmarked')loadPeople();
        toast(on?`${personName(p)} est dans les signets.`:`${personName(p)} n’est plus dans les signets.`);
    }
    function personReferenceText(p){const b=p.birth_year||'',d=p.death_year||'';const yrs=b||d?` (${b||'?'}-${d||(p.living_status==='living'?'':'?')})`:'';const sosa=sosaNumbersText(p.id);return `${personName(p)}${yrs}${sosa?`, Sosa ${sosa}`:''}`;}
    async function copyPersonReference(){const text=personReferenceText(state.currentPerson.person);try{await navigator.clipboard.writeText(text);}catch(_){const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove();}toast(`Copié : ${text}`);}
    function chooseFromList(title,items){
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');dialog.className='modal small-modal choose-list-dialog';
            dialog.innerHTML=`<form method="dialog"><div class="modal-head"><div><h2>${escapeHtml(title)}</h2><p>Flèches puis Entrée, ou un clic.</p></div><button class="icon-button" type="button" data-choose-cancel aria-label="Fermer">×</button></div><div class="choose-list">${items.map((item,i)=>`<button type="button" class="choose-list-item" data-choose="${i}">${escapeHtml(item.label)}${item.hint?` <small>${escapeHtml(item.hint)}</small>`:''}</button>`).join('')}</div></form>`;
            document.body.append(dialog);let finished=false;
            const finish=value=>{if(finished)return;finished=true;if(dialog.open)dialog.close();dialog.remove();resolve(value);};
            $$('[data-choose]',dialog).forEach(b=>b.addEventListener('click',()=>finish(items[Number(b.dataset.choose)])));
            dialog.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();e.stopPropagation();const list=$$('[data-choose]',dialog);const i=list.indexOf(document.activeElement);list[(i+(e.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();});
            $('[data-choose-cancel]',dialog).addEventListener('click',()=>finish(null));
            dialog.addEventListener('close',()=>finish(null));
            dialog.showModal();$('[data-choose]',dialog)?.focus();
        });
    }
    const byBirth=(a,b)=>(Number(a.birth_year)||9999)-(Number(b.birth_year)||9999)||Number(a.id)-Number(b.id);
    async function goToRelative(kind){
        const d=state.currentPerson,p=d.person,parents=d.parents||[];
        const pick=async(list,title,empty)=>{if(!list.length)return toast(empty);if(list.length===1)return openPersonById(list[0].id);const chosen=await chooseFromList(title,list.map(x=>({id:x.id,label:personName(x),hint:years(x)})));if(chosen)openPersonById(chosen.id);};
        if(kind==='father')return pick(parents.filter(x=>x.gender==='male'),'Aller à quel père ?','Aucun père connu.');
        if(kind==='mother')return pick(parents.filter(x=>x.gender==='female'),'Aller à quelle mère ?','Aucune mère connue.');
        if(kind==='child')return pick([...(d.children||[])].sort(byBirth),'Aller à quel enfant ?','Aucun enfant connu.');
        if(kind==='spouse')return pick(d.partners||[],'Aller à quel conjoint ?','Aucun conjoint connu.');
        const all=[...(d.siblings||[]).filter(x=>Number(x.id)!==Number(p.id)),p].sort(byBirth);
        const i=all.findIndex(x=>Number(x.id)===Number(p.id));const next=all[i+(kind==='next_sibling'?1:-1)];
        if(!next)return toast((d.siblings||[]).length?(kind==='next_sibling'?'C’est le dernier de la fratrie.':'C’est l’aîné de la fratrie.'):'Aucun frère ni sœur connu.');
        openPersonById(next.id);
    }
    function submitActiveForm(){
        const active=document.activeElement;const form=active?.closest?.('form')||openModalDialog()?.querySelector('form');
        if(!form)return;active?.dispatchEvent?.(new Event('change',{bubbles:true}));
        const submit=form.querySelector('button[type="submit"]:not([disabled]),button:not([type]):not([disabled])');
        if(form.requestSubmit)form.requestSubmit(submit||undefined);else submit?.click();
    }
    async function openPersonReminderDialog(){
        const p=state.currentPerson.person;
        const dialog=document.createElement('dialog');dialog.className='modal small-modal';
        const today=new Date();const iso=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
        dialog.innerHTML=`<form method="dialog" class="person-reminder-form"><div class="modal-head"><div><span class="eyebrow">RAPPEL</span><h2>Rappel pour ${escapeHtml(personName(p))}</h2></div><button class="icon-button" type="button" data-close aria-label="Fermer">×</button></div><div class="form-grid single"><label>Ce qu’il faut faire<input name="title" required value="${escapeHtml(personReferenceText(p))} : "></label><label>Le<input type="date" name="reminder_due_at" required value="${iso}"></label><label>Notes<textarea name="notes" rows="3"></textarea></label></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close>Annuler</button><button class="button" type="submit">Créer le rappel</button></div></form>`;
        document.body.append(dialog);
        $$('[data-close]',dialog).forEach(b=>b.addEventListener('click',()=>{dialog.close();dialog.remove();}));
        dialog.addEventListener('close',()=>dialog.remove());
        $('form',dialog).addEventListener('submit',async event=>{event.preventDefault();const f=event.currentTarget;
            try{await api('save_standalone_reminder',{},{method:'POST',body:{title:f.elements.title.value.trim(),reminder_due_at:f.elements.reminder_due_at.value,reminder_mode:'on',reminder_category:'Fiche',notes:`${f.elements.notes.value.trim()}${f.elements.notes.value.trim()?'\n\n':''}Fiche : ${personReferenceText(p)} (n° ${p.id})`}});dialog.dataset.dirty='';dialog.close();dialog.remove();toast('Rappel créé (Listes → Rappels).');try{window.lcnda?.refreshReminders?.();}catch(_){}}
            catch(error){toast(error.message,'error');}});
        dialog.showModal();const t=$('[name="title"]',dialog);t.focus();t.setSelectionRange(t.value.length,t.value.length);
    }

    // Listes : ↑ ↓ Entrée Espace (liste des personnes à gauche, ou tableau d'une liste)
    function listCursorRows(){
        if(document.activeElement?.closest?.('#sidebar-content')||(!$('.is-key-row')&&state.module==='personnes'))return $$('#sidebar-content .person-list-item').filter(el=>el.offsetParent);
        return $$('#workspace .data-table tbody tr').filter(el=>el.offsetParent);
    }
    function moveListCursor(step){
        const rows=listCursorRows();if(!rows.length)return;
        const current=rows.findIndex(r=>r.classList.contains('is-key-row'));const fallback=rows.findIndex(r=>r===document.activeElement||r.classList.contains('is-active'));
        const from=current>=0?current:fallback;const next=rows[Math.max(0,Math.min(rows.length-1,from<0?(step>0?0:rows.length-1):from+step))];
        $$('.is-key-row').forEach(r=>r.classList.remove('is-key-row'));next.classList.add('is-key-row');next.scrollIntoView({block:'nearest'});
        if(next.matches('button'))next.focus({preventScroll:true});
    }
    const listCursorRow=()=>$('.is-key-row')||(document.activeElement?.matches?.('#sidebar-content .person-list-item')?document.activeElement:null);
    function openListCursor(){const row=listCursorRow();if(!row)return;(row.matches('button')?row:row.querySelector('[data-open-person],[data-open-battue],[data-open-investigation],[data-open-media],a[href],button'))?.click()||row.click();}
    function previewListCursor(){const row=listCursorRow();const target=row?.querySelector('[data-open-media],[data-open-dashboard-media],img');if(target)target.click();else toast('Rien à prévisualiser sur cette ligne.');}

    // Visionneuse
    function lightboxZoomBy(factor){const image=$('#lightbox-image');if(!image||image.hidden)return;state.lightboxZoom=Math.max(1,Math.min(8,state.lightboxZoom*factor));if(state.lightboxZoom===1)state.lightboxPan={x:0,y:0};applyLightboxTransform();}
    function lightboxPlayer(fn){const p=[$('#lightbox-video'),$('#lightbox-audio')].find(el=>el&&!el.hidden);if(p)fn(p);}

    // Transcription
    const transcriptionArea=()=>{const a=document.activeElement;return a?.matches?.('#lightbox-transcription,[data-archive-transcription-form] textarea')?a:null;};
    function insertInTranscription(text){
        const area=transcriptionArea()||($('#lightbox')?.open?$('#lightbox-transcription'):$('[data-archive-transcription-form] textarea'));
        if(!area)return;area.focus();const s=area.selectionStart??area.value.length,e=area.selectionEnd??s;
        const before=area.value.slice(0,s),sep=text==='[?]'||!before||/\s$/.test(before)?'':' ';
        area.setRangeText(sep+text,s,e,'end');area.dispatchEvent(new Event('input',{bubbles:true}));
    }
    function toggleTranscriptionLayout(){
        const stacked=!document.documentElement.classList.contains('transcription-stacked');
        document.documentElement.classList.toggle('transcription-stacked',stacked);
        try{localStorage.setItem('genealogie-transcription-layout',stacked?'stacked':'side');}catch(_){}
        toast(stacked?'Image et texte l’un sous l’autre.':'Image et texte côte à côte.');
    }
    try{if(localStorage.getItem('genealogie-transcription-layout')==='stacked')document.documentElement.classList.add('transcription-stacked');}catch(_){}
    // Bouton « ſ » (s long) à côté des cases de transcription
    function addLongSButtons(root=document){
        $$('#lightbox-transcription,[data-archive-transcription-form] textarea',root).forEach(area=>{
            if(area.dataset.longS)return;area.dataset.longS='1';
            const bar=document.createElement('div');bar.className='transcription-tools';
            bar.innerHTML=`<button type="button" class="button small secondary" data-insert="ſ" title="Insérer le s long">ſ</button><button type="button" class="button small secondary" data-insert="[illisible]" title="Insérer « [illisible] »">[illisible]</button><button type="button" class="button small secondary" data-insert="[?]" title="Insérer « [?] » après un mot incertain">[?]</button>`;
            area.before(bar);
            $$('[data-insert]',bar).forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
            $$('[data-insert]',bar).forEach(b=>b.addEventListener('click',()=>{area.focus();const t=b.dataset.insert;if(t==='ſ'){const s=area.selectionStart,e=area.selectionEnd;area.setRangeText('ſ',s,e,'end');area.dispatchEvent(new Event('input',{bubbles:true}));}else insertInTranscription(t);}));
        });
    }
    new MutationObserver(()=>addLongSButtons()).observe(document.body,{childList:true,subtree:true});
    addLongSButtons();

    // Battue : la commune « choisie » = la dernière sur laquelle on a cliqué (ou survolée au clavier)
    function battueActiveCard(){return $('.battue-commune.is-key-commune')||null;}
    document.addEventListener('click',event=>{const card=event.target.closest?.('[data-battue-commune-card]');if(!card)return;$$('.battue-commune.is-key-commune').forEach(c=>c.classList.remove('is-key-commune'));card.classList.add('is-key-commune');});
    function setBattueCommuneStatusByKey(status){
        const card=battueActiveCard();if(!card)return toast('Clique d’abord sur une commune de la liste (ou N pour aller à la prochaine).');
        const select=card.querySelector('[data-battue-commune-status]');if(!select)return;
        if(![...select.options].some(o=>o.value===status))return;select.value=status;select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    function moveBattueCursor(){
        const cards=$$('[data-battue-commune-card]').filter(c=>c.offsetParent);if(!cards.length)return;
        const from=cards.indexOf(battueActiveCard());
        const ordered=[...cards.slice(from+1),...cards.slice(0,from+1)];
        const next=ordered.find(c=>(c.querySelector('[data-battue-commune-status]')?.value||c.dataset.communeStatus)!=='done');
        if(!next)return toast('Toutes les communes affichées sont terminées.');
        $$('.battue-commune.is-key-commune').forEach(c=>c.classList.remove('is-key-commune'));next.classList.add('is-key-commune');next.scrollIntoView({behavior:'smooth',block:'center'});
    }

    async function backupNow(){
        const settings=autoBackupSettings();toast('Sauvegarde en cours…');
        const result=await api('backup_sqlite',{}, {method:'POST',body:{dir:settings.dir,max_files:settings.maxFiles,mode:'manual'}});
        toast(`Sauvegarde faite : ${result.file||'fichier créé'}.`);
    }
    async function undoLastChange(){
        const c=await api('undo_candidate');
        if(!c.available)return toast(c.summary?`Impossible d’annuler « ${c.summary} » : ${c.reason}`:c.reason,'error');
        const when=c.created_at?new Date(c.created_at.replace(' ','T')+'Z').toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'';
        if(!await confirmBox(`« ${c.summary} »${when?`\n(${when})`:''}\n\n${c.mode==='restore'?'Ce qui a été supprimé sera remis.':'La fiche reprendra exactement son état d’avant cette modification.'}`,{title:'Annuler la dernière modification ?',okLabel:'Annuler la modification',cancelLabel:'Garder',danger:true}))return;
        const r=await api('undo_change',{},{method:'POST',body:{id:c.id}});
        toast(`Annulé : ${r.result?.undone||c.summary}`);
        if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);else setModule(state.module,false);
    }

    // Échap dans une fenêtre de saisie : demander avant de perdre ce qui a été tapé
    document.addEventListener('input',event=>{const d=event.target.closest?.('dialog');if(d&&d.id!=='lightbox')d.dataset.dirty='1';},true);
    document.addEventListener('change',event=>{const d=event.target.closest?.('dialog');if(d&&d.id!=='lightbox'&&!event.target.matches('[type="file"]'))d.dataset.dirty='1';},true);
    const nativeShowModal=HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal=function(...args){this.dataset.dirty='';return nativeShowModal.apply(this,args);};
    document.addEventListener('submit',event=>{const d=event.target.closest?.('dialog');if(d)d.dataset.dirty='';},true);
    document.addEventListener('cancel',event=>{const d=event.target;if(!(d instanceof HTMLDialogElement)||d.id==='lightbox'||d.dataset.dirty!=='1'||d.dataset.ownClose)return;event.preventDefault();confirmBox('Ce que tu as tapé dans cette fenêtre sera perdu.',{title:'Fermer sans enregistrer ?',okLabel:'Fermer sans enregistrer',cancelLabel:'Continuer la saisie',danger:true}).then(ok=>{if(ok){d.dataset.dirty='';d.close();}});},true);

    // Champs de date : « v », « av », « ap », « en » au début → proposer « vers », « avant », « après », « entre … et »
    const DATE_FIELD_SELECTOR='input[name="date_text"],input[name="create_event_date"],input[name="date_alternative"]';
    const DATE_WORDS=[['vers','vers '],['avant','avant '],['après','après '],['entre … et','entre  et ']];
    function hideDateHints(){$('#date-hints')?.remove();}
    document.addEventListener('input',event=>{
        const input=event.target;if(!input.matches?.(DATE_FIELD_SELECTOR))return;hideDateHints();
        const v=input.value.trim().toLowerCase();if(!v||v.length>4||/\d/.test(v))return;
        const fold=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'');
        const options=DATE_WORDS.filter(([label])=>fold(label).startsWith(fold(v))&&fold(label)!==fold(v));if(!options.length)return;
        const box=document.createElement('div');box.id='date-hints';box.className='date-hints';
        box.innerHTML=options.map(([label,text],i)=>`<button type="button" data-date-word="${escapeHtml(text)}" class="${i===0?'is-active':''}">${escapeHtml(label)}</button>`).join('')+'<small>Tab pour choisir</small>';
        const r=input.getBoundingClientRect();box.style.left=`${r.left}px`;box.style.top=`${r.bottom+2}px`;
        (input.closest('dialog')||document.body).append(box);
        const choose=text=>{input.value=text;const pos=text.startsWith('entre')?6:text.length;input.focus();input.setSelectionRange(pos,pos);hideDateHints();input.dispatchEvent(new Event('change',{bubbles:true}));};
        $$('[data-date-word]',box).forEach(b=>{b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>choose(b.dataset.dateWord));});
        input._dateHintChoose=()=>choose($('.is-active',box).dataset.dateWord);
    });
    document.addEventListener('keydown',event=>{
        const box=$('#date-hints');if(!box||!event.target.matches?.(DATE_FIELD_SELECTOR))return;
        if(event.key==='Tab'||(event.key==='Enter'&&!event.metaKey&&!event.ctrlKey)){event.preventDefault();event.target._dateHintChoose?.();}
        else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const list=$$('[data-date-word]',box);const i=list.findIndex(b=>b.classList.contains('is-active'));list[i]?.classList.remove('is-active');list[(i+(event.key==='ArrowDown'?1:-1)+list.length)%list.length].classList.add('is-active');}
        else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hideDateHints();}
    },true);
    document.addEventListener('focusout',event=>{if(event.target.matches?.(DATE_FIELD_SELECTOR))setTimeout(hideDateHints,120);});

    /* Aide (F1) et onglet Maintenance → Raccourcis */
    function shortcutTableHtml(editable){
        return SHORTCUT_GROUPS.map(([group,title])=>{const defs=SHORTCUT_DEFS.filter(d=>d.group===group);if(!defs.length)return '';
            const extra=group==='windows'?`<tr class="shortcut-info"><td>Ouvrir une personne, une battue ou une enquête dans l’autre moitié de l’écran</td><td>${kbd(IS_MAC?'Mod+clic':'Mod+clic')}</td>${editable?'<td colspan="2"><small>Geste de la souris : non modifiable</small></td>':''}</tr><tr class="shortcut-info"><td>… dans une nouvelle fenêtre</td><td>${kbd('Mod+Shift+clic')}</td>${editable?'<td colspan="2"></td>':''}</tr>`
                :group==='form'?`<tr class="shortcut-info"><td>Fermer sans enregistrer (avec une confirmation si tu as tapé quelque chose)</td><td>${kbd('Escape')}</td>${editable?'<td colspan="2"><small>Touche du système</small></td>':''}</tr><tr class="shortcut-info"><td>Dans un champ de date : taper « v », « av », « ap » ou « en » propose « vers », « avant », « après », « entre … et »</td><td>${kbd('Tab')}</td>${editable?'<td colspan="2"></td>':''}</tr>`:'';
            return `<tbody class="shortcut-group"><tr><th colspan="${editable?4:2}">${escapeHtml(title)}</th></tr>${defs.map(def=>{const combo=shortcutFor(def),custom=combo!==shortcutDefault(def);
                return `<tr data-shortcut-row="${def.id}"><td>${escapeHtml(def.label)}${!shortcutHasMod(combo)&&!shortcutIsFKey(combo)&&combo&&!['viewer','list','battue'].includes(def.ctx)?' <small class="cell-muted">(hors des cases de texte)</small>':''}</td><td>${kbd(combo)}${custom?' <small class="shortcut-custom">personnalisé</small>':''}</td>${editable?`<td><button type="button" class="button small secondary" data-shortcut-change="${def.id}">Changer</button></td><td>${custom?`<button type="button" class="button small secondary" data-shortcut-reset="${def.id}" title="Remettre comme au départ : ${escapeHtml(comboLabel(shortcutDefault(def)))}">↺</button>`:''}</td>`:''}</tr>`;}).join('')}${extra}</tbody>`;}).join('');
    }
    function openShortcutHelp(){
        $('#shortcut-help')?.remove();
        const dialog=document.createElement('dialog');dialog.id='shortcut-help';dialog.className='modal shortcut-help-dialog';
        dialog.innerHTML=`<div class="modal-head"><div><span class="eyebrow">AIDE</span><h2>Raccourcis clavier</h2><p>${IS_MAC?'⌘ = touche Commande, ⌥ = Option, ⇧ = Majuscule.':'Ctrl = Contrôle, Maj = Majuscule.'} Les raccourcis sans ${IS_MAC?'⌘':'Ctrl'} ne marchent qu’en dehors des cases de texte.</p></div><button class="icon-button" type="button" data-close aria-label="Fermer">×</button></div><div class="shortcut-help-body"><table class="data-table shortcut-table">${shortcutTableHtml(false)}</table></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-shortcut-customize>Personnaliser…</button><button class="button" type="button" data-close>Fermer</button></div>`;
        document.body.append(dialog);
        $$('[data-close]',dialog).forEach(b=>b.addEventListener('click',()=>{dialog.close();dialog.remove();}));
        $('[data-shortcut-customize]',dialog).addEventListener('click',()=>{dialog.close();dialog.remove();state.maintenanceTab='raccourcis';setModule('maintenance');});
        dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
    }
    function shortcutPresets(){try{const v=JSON.parse(localStorage.getItem(SHORTCUT_PRESETS_KEY)||'[]');return Array.isArray(v)?v:[];}catch(_){return [];}}
    function saveShortcutPresets(list){try{localStorage.setItem(SHORTCUT_PRESETS_KEY,JSON.stringify(list));}catch(_){}}
    function renderShortcutSettings(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='raccourcis')return;
        const presets=shortcutPresets(),customCount=Object.keys(shortcutOverrides()).length;
        $('#workspace').innerHTML=`<section class="page shortcut-page"><header class="page-header"><div><span class="eyebrow">RACCOURCIS CLAVIER</span><h2>Raccourcis clavier</h2><p>Clique sur « Changer » puis appuie sur la nouvelle combinaison. Le logiciel te prévient si elle est déjà prise par ${IS_MAC?'macOS':SHORTCUT_PLATFORM==='win'?'Windows':'Linux'} ou par un autre raccourci. Ces réglages suivent ta base (comme l’apparence). La liste s’affiche aussi avec ${kbd(shortcutFor(SHORTCUT_DEFS.find(d=>d.id==='help')))}.</p></div><div class="page-actions"><button class="button secondary" type="button" id="shortcut-reset-all" ${customCount?'':'disabled'}>Tout réinitialiser</button></div></header>
            <div class="maintenance-panel shortcut-presets"><h3>💾 Réglages enregistrés</h3><p>Comme pour l’apparence : garde un jeu de raccourcis sous un nom, pour y revenir plus tard.</p><div class="shortcut-preset-save"><input id="shortcut-preset-name" placeholder="Nom (ex. Mes raccourcis)" maxlength="60"><button class="button small" type="button" id="shortcut-preset-save">💾 Enregistrer sous ce nom</button></div>${presets.length?`<ul class="shortcut-preset-list">${presets.map((p,i)=>`<li><strong>${escapeHtml(p.name)}</strong> <small>${plural(Object.keys(p.map||{}).length,'personnalisé')}</small><button class="button small secondary" type="button" data-preset-apply="${i}">Appliquer</button><button class="button small secondary" type="button" data-preset-delete="${i}">Supprimer</button></li>`).join('')}</ul>`:'<p class="cell-muted">Aucun pour l’instant.</p>'}</div>
            <div class="data-table-wrap"><table class="data-table shortcut-table is-editable">${shortcutTableHtml(true)}</table></div>
            <div class="maintenance-panel h-ek-panel"><h3>⌨️ Dans les outils de modification</h3><p>Montage vidéo, son, retouche des photos, mise en page : des raccourcis à toi pour chaque outil (aussi dans Maintenance → Montage, retouche, mise en page et son).</p><div id="editor-keys-box"></div></div></section>`;
        window.LCNDA_EXT?.editorKeysPanel?.($('#editor-keys-box'));
        $$('[data-shortcut-change]').forEach(button=>button.addEventListener('click',()=>captureShortcut(SHORTCUT_DEFS.find(d=>d.id===button.dataset.shortcutChange))));
        $$('[data-shortcut-reset]').forEach(button=>button.addEventListener('click',()=>{const o=shortcutOverrides();delete o[button.dataset.shortcutReset];saveShortcutOverrides(o);renderShortcutSettings();}));
        $('#shortcut-reset-all').addEventListener('click',async()=>{if(!await confirmBox('Tous tes raccourcis personnalisés seront remplacés par ceux d’origine.',{title:'Revenir aux raccourcis d’origine ?',okLabel:'Réinitialiser les raccourcis'}))return;saveShortcutOverrides({});renderShortcutSettings();toast('Raccourcis d’origine rétablis.');});
        $('#shortcut-preset-save').addEventListener('click',()=>{const name=$('#shortcut-preset-name').value.trim();if(!name)return toast('Donne un nom au réglage.','error');const list=shortcutPresets().filter(p=>p.name!==name);list.push({name,map:shortcutOverrides(),saved_at:new Date().toISOString()});saveShortcutPresets(list);renderShortcutSettings();toast(`Réglage « ${name} » enregistré.`);});
        $$('[data-preset-apply]').forEach(b=>b.addEventListener('click',()=>{const p=shortcutPresets()[Number(b.dataset.presetApply)];if(!p)return;saveShortcutOverrides({...(p.map||{})});renderShortcutSettings();toast(`Réglage « ${p.name} » appliqué.`);}));
        $$('[data-preset-delete]').forEach(b=>b.addEventListener('click',async()=>{const list=shortcutPresets();const p=list[Number(b.dataset.presetDelete)];if(!p||!await confirmBox('',{title:`Supprimer le réglage « ${p.name} » ?`,okLabel:'Supprimer le réglage'}))return;list.splice(Number(b.dataset.presetDelete),1);saveShortcutPresets(list);renderShortcutSettings();}));
    }
    function captureShortcut(def){
        if(!def)return;
        const dialog=document.createElement('dialog');dialog.className='modal small-modal shortcut-capture';
        dialog.innerHTML=`<div class="modal-head"><div><span class="eyebrow">NOUVEAU RACCOURCI</span><h2>${escapeHtml(def.label)}</h2><p>Appuie maintenant sur la combinaison voulue.<br>Échap : annuler · Retour arrière : aucun raccourci.</p></div></div><div class="shortcut-capture-key">${kbd(shortcutFor(def))}</div><div class="shortcut-capture-warning" aria-live="polite"></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-cancel>Annuler</button><button class="button" type="button" data-ok disabled>Utiliser ce raccourci</button></div>`;
        document.body.append(dialog);let combo=null;
        const warn=$('.shortcut-capture-warning',dialog),ok=$('[data-ok]',dialog);
        const done=()=>{shortcutCaptureHandler=null;dialog.close();dialog.remove();};
        dialog.addEventListener('close',()=>{shortcutCaptureHandler=null;dialog.remove();});
        $('[data-cancel]',dialog).addEventListener('click',done);
        shortcutCaptureHandler=event=>{
            if(event.target.closest?.('[data-cancel],[data-ok]')&&(event.key==='Enter'||event.key===' ')){event.target.click();return;}
            if(event.key==='Escape'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey)return done();
            if(event.key==='Backspace'&&!event.metaKey&&!event.ctrlKey&&!event.altKey){combo='';}
            else{const c=eventCombo(event);if(!c)return;combo=c;}
            $('.shortcut-capture-key',dialog).innerHTML=kbd(combo);
            const notes=[];
            const os=shortcutOsConflict(combo);if(os)notes.push(`<p class="is-danger">⚠️ Déjà pris par ${IS_MAC?'macOS':SHORTCUT_PLATFORM==='win'?'Windows':'Linux'} ou par le menu de l’application : « ${escapeHtml(os)} ». Il risque de ne pas marcher.</p>`);
            const osNote=(OS_SHORTCUT_NOTES[SHORTCUT_PLATFORM]||{})[combo];if(osNote)notes.push(`<p>${escapeHtml(osNote)}</p>`);
            const others=SHORTCUT_DEFS.filter(d=>d.id!==def.id&&combo&&shortcutFor(d)===combo&&(d.ctx===def.ctx||d.ctx==='global'||def.ctx==='global'||d.ctx==='any'||def.ctx==='any'));
            if(others.length)notes.push(`<p class="is-danger">⚠️ Déjà utilisé ici pour « ${escapeHtml(others.map(d=>d.label).join(' », « '))} ». Si tu valides, ${others.length>1?'ces raccourcis seront retirés':'ce raccourci sera retiré'} de l’autre action.</p>`);
            if(combo&&!shortcutHasMod(combo)&&!shortcutIsFKey(combo)&&!['viewer','list','battue'].includes(def.ctx))notes.push('<p>Sans ⌘/Ctrl, il ne marchera qu’en dehors des cases de texte.</p>'.replace('⌘/Ctrl',IS_MAC?'⌘':'Ctrl'));
            if(combo&&!IS_MAC&&/^Alt\+[A-Z]$/.test(combo))notes.push('<p>Sous Windows, Alt + lettre peut aussi ouvrir un menu.</p>');
            if(combo&&IS_MAC&&/^Alt\+(Shift\+)?[A-Z0-9]$/.test(combo))notes.push('<p>Sur Mac, ⌥ + lettre écrit un caractère spécial dans les cases de texte : ce raccourci ne marchera qu’en dehors des cases.</p>');
            if(combo===''){notes.length=0;notes.push('<p>Cette action n’aura plus de raccourci.</p>');}
            warn.innerHTML=notes.join('')||'<p class="is-ok">✓ Aucun conflit connu.</p>';
            ok.disabled=false;
            ok.onclick=()=>{const o=shortcutOverrides();others.forEach(d=>{o[d.id]='';});if(combo===shortcutDefault(def))delete o[def.id];else o[def.id]=combo;others.forEach(d=>{if(shortcutDefault(d)===''&&o[d.id]==='')delete o[d.id];});saveShortcutOverrides(o);done();renderShortcutSettings();toast(combo?`Nouveau raccourci : ${comboLabel(combo)}`:'Raccourci retiré.');};
        };
        dialog.showModal();
    }
    // Menu de l'application : raccourcis envoyés au démarrage (et après chaque changement)
    setTimeout(publishShortcutsToMenu,1500);
    /** Ce qu'il faut pour rouvrir le même écran ailleurs (panneau à côté, fenêtre détachée). */
    function viewSnapshot(){
        return {module:state.module,dashboardBoard:state.dashboardBoard||'',currentPersonId:Number(state.currentPersonId)||0,currentBattueId:Number(state.currentBattueId)||0,currentInvestigationId:Number(state.currentInvestigationId)||0,currentBoardId:Number(state.currentBoardId)||0,
            investigationFolderId:Number(state.investigationFolderId)||0,enquetesTab:state.enquetesTab||'',maintenanceTab:state.maintenanceTab||'',graphMode:state.graphMode||'',listType:state.listType||'',
            researchKind:state.researchKind||'',graphPlaceMonograph:state.graphPlaceMonograph||null,
            // Atelier de recherche : le projet, le dossier ou la vue, l'élément choisi ; une liste à soi (et sa fiche ouverte)
            atelier:state.atelier?.project?{project:Number(state.atelier.project)||0,node:state.atelier.node??'overview',sel:Array.isArray(state.atelier.sel)?state.atelier.sel.slice(0,1):[],deep:!!state.atelier.deep}:null,
            hListOpen:Number(state.hListOpen)||0,hRec:state.hRec?.list?{list:Number(state.hRec.list)||0,open:Number(state.hRec.open)||0,filter:state.hRec.filter||''}:null,
            // et tout ce qui dit quelle fiche est ouverte dans une liste (un animal, un village, un livret, une recherche…) : la fenêtre s'ouvre au même endroit
            hState:Object.fromEntries(Object.entries(state).filter(([k,v])=>/^h[A-Z]\w{1,40}$/.test(k)&&!['hListOpen','hRec','hEdit'].includes(k)&&(typeof v==='number'||typeof v==='boolean'||(typeof v==='string'&&v.length<=300))))};
    }
    function applyViewSnapshot(view){
        if(!view||typeof view!=='object')return;
        state.dashboardBoard=view.module==='dashboard'&&CUSTOM_TAB_ID.test(String(view.dashboardBoard||''))?view.dashboardBoard:'';
        ['currentPersonId','currentBattueId','currentInvestigationId','currentBoardId','investigationFolderId','enquetesTab','maintenanceTab','graphMode','listType','researchKind'].forEach(key=>{if(view[key]!==undefined&&view[key]!==''&&view[key]!==null)state[key]=view[key];});
        if(view.graphPlaceMonograph&&typeof view.graphPlaceMonograph==='object')state.graphPlaceMonograph={...state.graphPlaceMonograph,...view.graphPlaceMonograph};
        if(!view.currentBattueId)state.currentBattueId=0;if(!view.currentInvestigationId)state.currentInvestigationId=0;
        if(view.atelier&&typeof view.atelier==='object'&&Number(view.atelier.project)>0){const node=view.atelier.node;state.atelier={project:Number(view.atelier.project),node:typeof node==='number'||/^[a-z_0-9]{1,40}$/i.test(String(node))?node:'overview',sel:(Array.isArray(view.atelier.sel)?view.atelier.sel:[]).map(Number).filter(Boolean).slice(0,1),tags:[],q:'',type:'',sort:{col:'title',dir:1},closed:{},deep:!!view.atelier.deep};}
        if(Number(view.hListOpen)>0)state.hListOpen=Number(view.hListOpen);
        if(view.hState&&typeof view.hState==='object')Object.entries(view.hState).forEach(([k,v])=>{if(/^h[A-Z]\w{1,40}$/.test(k)&&!['hListOpen','hRec','hEdit'].includes(k)&&(state[k]===undefined||state[k]===null||typeof state[k]===typeof v)&&(typeof v==='number'||typeof v==='boolean'||(typeof v==='string'&&v.length<=300)))state[k]=v;});
        if(view.hRec&&typeof view.hRec==='object'&&Number(view.hRec.list)>0)state.hRec={list:Number(view.hRec.list),open:Number(view.hRec.open)||0,filter:['todo','done','all'].includes(view.hRec.filter)?view.hRec.filter:'todo',q:'',edit:null};
    }
    window.lcndaViewSnapshot=viewSnapshot; // lu par la fenêtre principale (même origine) pour détacher le panneau
    function viewUrl(view){return `${location.pathname}?view=${encodeURIComponent(JSON.stringify(view))}`;}
    /** Ouvre un écran dans le panneau de droite (un seul panneau : il remplace le précédent). */
    function openSidePanel(view=viewSnapshot()){
        let panel=$('#side-panel');
        if(!panel){
            panel=document.createElement('aside');panel.id='side-panel';panel.className='side-panel';
            panel.innerHTML=`<div class="side-panel-resize" title="Glisser pour changer la largeur"></div><header class="side-panel-head"><strong id="side-panel-title">À côté</strong><div class="side-panel-actions"><button type="button" class="button small secondary side-panel-orient" data-orientation="right" title="Côte à côte" aria-label="Côte à côte"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="2"/></svg></button><button type="button" class="button small secondary side-panel-orient" data-orientation="bottom" title="En haut et en bas" aria-label="En haut et en bas"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2"/></svg></button><button type="button" class="button small secondary" id="side-panel-here" title="Afficher cet écran dans la partie principale">⇠ Ici</button><button type="button" class="button small secondary" id="side-panel-window" title="Ouvrir ce panneau dans une vraie fenêtre (pratique avec deux écrans)">Fenêtre ↗</button><button type="button" class="button small secondary" id="side-panel-close" aria-label="Fermer le panneau">✕</button></div></header><iframe id="side-panel-frame" title="Deuxième écran"></iframe>`;
            document.body.append(panel);
            let width=0,height=0,orientation='right';try{width=Number(localStorage.getItem('lcnda-side-panel-width'))||0;height=Number(localStorage.getItem('lcnda-side-panel-height'))||0;orientation=localStorage.getItem('lcnda-side-panel-orientation')||'right';}catch(_){}
            setSidePanelWidth(width||Math.round(window.innerWidth*0.45));setSidePanelHeight(height||Math.round(window.innerHeight*0.45));setSidePanelOrientation(orientation);
            $$('.side-panel-orient',panel).forEach(button=>button.addEventListener('click',()=>{setSidePanelOrientation(button.dataset.orientation);try{localStorage.setItem('lcnda-side-panel-orientation',button.dataset.orientation);}catch(_){}}));
            const frame=$('#side-panel-frame',panel);
            const current=()=>{try{return frame.contentWindow.lcndaViewSnapshot?.()||null;}catch(_){return null;}};
            const title=()=>{try{const doc=frame.contentDocument;const name=doc.querySelector('.person-hero h1, .page-header h2, .battue-detail h2, h2')?.textContent?.trim();const module=doc.querySelector('#sidebar-title')?.textContent?.trim();$('#side-panel-title').textContent=[module,name&&name!==module?name:''].filter(Boolean).join(' · ')||'À côté';}catch(_){}};
            frame.addEventListener('load',title);setInterval(()=>{if(document.body.contains(panel))title();},1500);
            $('#side-panel-close',panel).addEventListener('click',closeSidePanel);
            $('#side-panel-window',panel).addEventListener('click',()=>{const view=current();window.open(viewUrl(view||viewSnapshot()),'_blank');closeSidePanel();});
            $('#side-panel-here',panel).addEventListener('click',()=>{const view=current();if(!view)return;closeSidePanel();applyViewSnapshot(view);setModule(view.module||'personnes');});
            const handle=$('.side-panel-resize',panel);
            handle.addEventListener('pointerdown',event=>{event.preventDefault();handle.setPointerCapture(event.pointerId);document.body.classList.add('is-resizing-side-panel');
                const bottom=document.body.classList.contains('side-panel-bottom');
                const move=e=>bottom?setSidePanelHeight(window.innerHeight-e.clientY):setSidePanelWidth(window.innerWidth-e.clientX);
                const up=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);document.body.classList.remove('is-resizing-side-panel');try{const css=getComputedStyle(document.body);localStorage.setItem(bottom?'lcnda-side-panel-height':'lcnda-side-panel-width',String(parseInt(css.getPropertyValue(bottom?'--side-panel-h':'--side-panel-w'))||0));}catch(_){}};
                handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);});
        }
        document.body.classList.add('has-side-panel');
        $('#side-panel-frame').src=viewUrl(view);
    }
    function setSidePanelHeight(px){const h=Math.max(220,Math.min(Math.round(window.innerHeight*0.8),Math.round(px)));document.body.style.setProperty('--side-panel-h',`${h}px`);}
    function setSidePanelOrientation(value){const bottom=value==='bottom';document.body.classList.toggle('side-panel-bottom',bottom);$$('.side-panel-orient').forEach(button=>button.classList.toggle('is-active',(button.dataset.orientation==='bottom')===bottom));const handle=$('.side-panel-resize');if(handle)handle.title=bottom?'Glisser pour changer la hauteur':'Glisser pour changer la largeur';}
    function setSidePanelWidth(px){const w=Math.max(340,Math.min(Math.round(window.innerWidth*0.75),Math.round(px)));document.body.style.setProperty('--side-panel-w',`${w}px`);}
    function closeSidePanel(){$('#side-panel')?.remove();document.body.classList.remove('has-side-panel','side-panel-bottom');}
    function bindSidePanelButton(){
        const split=$('#side-panel-open'),win=$('#new-window-open');
        if(IS_EMBEDDED){if(split)split.hidden=true;if(win)win.hidden=true;return;}
        split?.addEventListener('click',()=>{if($('#side-panel'))closeSidePanel();else openSidePanel();});
        win?.addEventListener('click',()=>window.open(viewUrl(viewSnapshot()),'_blank'));
    }
    /* ── Objets de famille, mémoire familiale, lieux précis, saint du jour, entretien des liens ── */
    const personChip=person=>person?`<button type="button" class="table-link" data-open-person="${person.id}">${escapeHtml(personName(person))}</button>${/\d/.test(years(person)||'')?` <small>${escapeHtml(years(person))}</small>`:''}`:'';
    const mediaThumbHtml=m=>m.media_type==='image'?`<img src="media/${encodeURIComponent(m.filename)}" alt="${escapeHtml(m.title||'')}" loading="lazy">`:`<span class="collection-file">${m.media_type==='audio'?'♪':(m.media_type==='video'?'▶':'📄')} ${escapeHtml(m.title||'')}</span>`;
    /* ── 🔍 Menu de choix unique (assets/js/app-picker.js, mode d'emploi docs/PICKER.md) ── */
    const PK=()=>window.LCNDA_PICKER||null;
    // titre au-dessus d'un menu de choix dans une grille de formulaire (même allure que les <label> voisins)
    const PK_ROLES=['témoin','parrain','marraine','voisin','employeur','officier','déclarant','épouse','époux','enfant','parent','autre'];
    /** Le champ du menu de choix ; si app-picker.js n'est pas encore chargé, un champ vide qu'il remplira en se liant. */
    function pkField(o={}){
        if(PK())return PK().pickerField(o);
        const opts={name:o.name||'picker',kind:String(o.kind||'person'),multiple:!!o.multiple,placeholder:o.placeholder||'',allowFree:!!o.allowFree,allowCreate:o.allowCreate===undefined?'auto':!!o.allowCreate,roles:o.roles?{main:o.roles.main!==false,roleList:o.roles.roleList?.length?o.roles.roleList:PK_ROLES}:null,animals:o.animals===false?0:1,label:''};
        const v=o.value;const val=opts.roles?(typeof v==='string'?(()=>{try{return JSON.parse(v);}catch(_){return null;}})():v):(v==null||v===''?[]:Array.isArray(v)?v:(opts.multiple&&typeof v==='string'?v.split(','):[v]));
        return `<div class="pk${opts.roles?' pk-roles':''}" data-picker="${escapeHtml(opts.kind)}" data-pk-opts="${escapeHtml(JSON.stringify(opts))}" data-pk-value="${escapeHtml(JSON.stringify(val))}"><input type="hidden" name="${escapeHtml(opts.name)}" value=""></div>`;
    }
    const pkValue=el=>PK()?PK().pickerValue(el):null;
    /** Menu qui n'envoie rien avec le formulaire autour (l'outil lit la valeur lui-même, par picker-change) : champ caché sans name. */
    const pkFieldLocal=o=>pkField(o).replace(` name="${escapeHtml(o.name)}"`,'');
    const pkSet=(el,value)=>{if(el&&PK())PK().pickerSet(el,value);};
    /** Une personne déjà connue → valeur du menu (le composant relit les années, le Sosa, la photo). */
    const pkPersonValue=person=>person&&Number(person.id)?{id:Number(person.id),title:personName(person),kind:'person'}:null;
    /** Pays d'un lieu choisi dans le menu (l'item ne le donne pas à part : il est au bout de la ligne grise). */
    function pkPlaceCountry(item){
        if(!item)return '';
        if(item.group==='fr')return 'France';
        const parts=String(item.meta||'').split(' · ').map(x=>x.trim()).filter(x=>x&&!/hab\.$/.test(x)&&!/^anc\./.test(x));
        const last=parts[parts.length-1]||'';
        if(!last||last===item.county||last.startsWith(String(item.county||'')+' (')&&item.county||last===item.state_name)return '';
        return /^[A-ZÀ-Ý' -]+$/.test(last)?last.charAt(0)+last.slice(1).toLowerCase():last;
    }
    /** « ＋ Créer la fiche » dans une fenêtre déjà ouverte : la fiche est créée tout de suite (prénom + NOM), puis choisie. */
    async function pkQuickCreatePerson(text){
        const words=String(text||'').trim().split(/\s+/).filter(Boolean);if(!words.length)return null;
        const up=words.filter(w=>w.length>1&&w===w.toUpperCase()&&/\p{L}/u.test(w));
        const last=up.length?up.join(' '):words.length>1?words[words.length-1]:words[0];
        const first=up.length?words.filter(w=>!up.includes(w)).join(' '):words.length>1?words.slice(0,-1).join(' '):'';
        const created=await api('save_person',{},{method:'POST',body:{first_name:first,last_name:last,gender:'unknown',living_status:'unknown'}});
        const id=Number(created?.result?.id||0);if(!id)return null;
        try{await loadPeople();}catch(_){}
        toast(`Fiche créée : ${[first,last].filter(Boolean).join(' ')}.`);
        return {id,title:[first,last].filter(Boolean).join(' '),kind:'person'};
    }
    /** Écoute « ＋ Créer la fiche » d'un menu de personnes dans `root` et crée la fiche sans quitter la fenêtre. */
    function pkBindQuickCreate(root){
        if(!root||root.dataset.pkQuickCreate)return;root.dataset.pkQuickCreate='1';
        root.addEventListener('picker-create',event=>{if(event.detail?.kind!=='person'||event.detail.target==='view')return;event.preventDefault();pkQuickCreatePerson(event.detail.text).then(it=>{if(it)event.detail.pick(it);}).catch(error=>toast(error.message,'error'));});
    }
    /** Ancien champ « personne » : il produit maintenant le menu de choix unique (même champ caché `name`, même événement cp-pick).
     *  Une case cachée [data-cp-input] garde le nom choisi pour les outils qui la lisent encore. */
    function collectionPersonField(name,person,placeholder='Tape un nom…'){
        const pid=person&&Number(person.id)?Number(person.id):0;
        const nm=pid?personName(person):'';
        // nom provisoire (« #12 », « Fiche n°12 », « … ») : le composant relit la fiche
        const value=pid?(/^(#\d+|Fiche n°\s*\d+|…|La personne affichée|Personne #?\d+|Personne sans nom)$/.test(nm)?pid:{id:pid,title:nm,kind:'person'}):null;
        return `<span class="collection-person-field cp-picker">${pkField({name,kind:'person',value})}<input type="text" class="cp-compat" data-cp-input="${escapeHtml(name)}" data-cp-bound="1" value="${escapeHtml(pid?nm:'')}" tabindex="-1" aria-hidden="true"></span>`;
    }
    // garde la case [data-cp-input] à jour avec la personne choisie
    document.addEventListener('picker-change',event=>{const wrap=event.target.closest?.('.cp-picker');if(!wrap)return;const inp=wrap.querySelector(':scope > [data-cp-input]');if(inp)inp.value=event.detail?.item?.title||'';});
    // un outil qui donne le focus à l'ancienne case, ou y écrit un nom puis envoie « input », atteint la case du menu
    document.addEventListener('focusin',event=>{if(!event.target.matches?.('.cp-compat'))return;const pk=event.target.closest('.cp-picker')?.querySelector('.pk-search:not([hidden]) .pk-input');if(pk)pk.focus();},true);
    document.addEventListener('input',event=>{if(!event.target.matches?.('.cp-compat'))return;const pk=event.target.closest('.cp-picker')?.querySelector('.pk-search:not([hidden]) .pk-input');if(pk){pk.value=event.target.value;pk.focus();pk.dispatchEvent(new Event('input',{bubbles:true}));}},true);
    /** Le menu se lie tout seul ; ceci ne sert plus qu'aux anciens champs encore écrits à la main ailleurs. */
    function bindCollectionPersonFields(root){bindLegacyPersonFields(root);}
    function bindLegacyPersonFields(root){
        $$('[data-cp-input]',root).forEach(input=>{if(input.dataset.cpBound)return;input.dataset.cpBound='1';
            const hidden=input.parentElement.querySelector('input[type=hidden]'),list=input.parentElement.querySelector('.collection-person-list');let timer=0,seq=0; // seq : une recherche partie avant un choix ne rouvre pas la liste
            input.addEventListener('input',()=>{hidden.value='';clearTimeout(timer);const q=input.value.trim();if(q.length<2){list.hidden=true;return;}
                timer=setTimeout(async()=>{const my=++seq;let data={data:[]};try{data=await api('search',{type:'persons',q,limit:8});}catch(_){}if(my!==seq)return;
                    list.innerHTML=(data.data||[]).map(p=>`<button type="button" data-cp-id="${p.id}" data-cp-name="${escapeHtml(personName(p))}">${escapeHtml(personName(p))} <small>${escapeHtml(years(p))}</small></button>`).join('')||'<small class="muted">Aucune fiche : le texte sera gardé tel quel</small>';list.hidden=false;},200);});
            const pick=b=>{clearTimeout(timer);seq++;hidden.value=b.dataset.cpId;input.value=b.dataset.cpName;list.hidden=true;input.parentElement.dispatchEvent(new CustomEvent('cp-pick',{bubbles:true,detail:{id:Number(b.dataset.cpId),name:b.dataset.cpName,field:hidden.name}}));};
            list.addEventListener('mousedown',event=>event.preventDefault());list.addEventListener('click',event=>{const b=event.target.closest('[data-cp-id]');if(b)pick(b);});
            input.addEventListener('keydown',event=>{const items=[...list.querySelectorAll('[data-cp-id]')];if(list.hidden||!items.length)return;const cur=items.indexOf(list.querySelector('.is-cp-active'));
                if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const n=items[cur<0?(event.key==='ArrowDown'?0:items.length-1):(cur+(event.key==='ArrowDown'?1:-1)+items.length)%items.length];items.forEach(x=>x.classList.toggle('is-cp-active',x===n));n.scrollIntoView({block:'nearest'});}
                else if(event.key==='Enter'){event.preventDefault();pick(items[Math.max(0,cur)]);}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();list.hidden=true;}});
            input.addEventListener('blur',()=>setTimeout(()=>{list.hidden=true;},200));
        });
    }
    async function uploadCollectionFiles(type,id,files){
        if(!files?.length)return 0;
        const fd=new FormData();fd.append('collection_type',type);fd.append('collection_id',id);fd.append('csrf',state.csrf);[...files].forEach(file=>fd.append('files[]',file));
        const response=await fetch('upload.php',{method:'POST',body:fd});const result=await response.json();
        if(!response.ok||result.error)throw new Error(result.error||'Import impossible');
        return (result.media||[]).length;
    }
    function transferText(t){
        const who=(person,text)=>person?personName(person):(text||'?');
        return `${escapeHtml(who(t.from_person,t.from_text))} → ${escapeHtml(who(t.to_person,t.to_text))}${t.date_text?` <small>(${escapeHtml(t.date_text)})</small>`:''}`;
    }
    function collectionLabelChips(labels){return labels?.length?`<div class="collection-labels">${labels.map(l=>{const color=l.color||'#0066cc';return `<span class="label-chip" style="--label-bg:${escapeHtml(color)};--label-fg:${escapeHtml(labelTextColor(color))}"><span>${escapeHtml(l.name)}</span></span>`;}).join('')}</div>`:'';}
    function familyObjectCardHtml(o,compact=false){
        const photo=o.media?.find(m=>m.media_type==='image');
        const holder=o.holder_person?personChip(o.holder_person):escapeHtml(o.holder_text||'');
        return `<article class="collection-card" data-object-id="${o.id}">${photo?`<div class="collection-photo">${mediaThumbHtml(photo)}</div>`:''}<div class="collection-body"><strong>${escapeHtml(o.title)}</strong>${o.kind?` <span class="collection-kind">${escapeHtml(o.kind)}</span>`:''}
            ${!compact&&o.description?`<p>${escapeHtml(o.description)}</p>`:''}
            ${o.transfers?.length?`<div class="collection-chain">${o.transfers.map(transferText).join('<span class="sep"> · </span>')}</div>`:''}
            ${holder?`<div class="collection-holder">Aujourd’hui : ${holder}${o.location_text?` <small>· ${escapeHtml(o.location_text)}</small>`:''}</div>`:''}
            ${collectionLabelChips(o.labels)}
            ${compact?'':`<div class="page-actions"><button type="button" class="button small secondary" data-edit-object="${o.id}">Modifier</button></div>`}</div></article>`;
    }
    function familyMemoryCardHtml(m,compact=false){
        const excerpt=String(m.content||'').slice(0,compact?140:400);
        return `<article class="collection-card" data-memory-id="${m.id}">${m.media?.find(x=>x.media_type==='image')?`<div class="collection-photo">${mediaThumbHtml(m.media.find(x=>x.media_type==='image'))}</div>`:''}<div class="collection-body"><span class="collection-kind">${escapeHtml(m.kind_label||'')}</span> <strong>${escapeHtml(m.title)}</strong>
            ${excerpt?`<p class="collection-text">${escapeHtml(excerpt)}${String(m.content||'').length>excerpt.length?'…':''}</p>`:''}
            ${m.people?.length?`<div class="collection-holder">${m.people.map(l=>`${personChip(l.person)} <small>(${escapeHtml({transmitted:'l’a transmis',received:'l’a reçu',about:'concerné'}[l.role]||'')})</small>`).join(' · ')}</div>`:''}
            ${m.origin_text?`<small class="muted">${escapeHtml(m.origin_text)}</small>`:''}
            ${collectionLabelChips(m.labels)}
            ${compact?'':`<div class="page-actions"><button type="button" class="button small secondary" data-edit-memory="${m.id}">Modifier</button></div>`}</div></article>`;
    }
    /** Listes → Objets de famille */
    async function renderFamilyObjectsList(token,editId=null){
        const q=state.familyObjectsQuery||'';
        const data=await api('family_objects',{q});if(token!==state.workspaceToken||state.module!=='listes')return;
        const objects=data.objects||[];const editing=editId===0?{id:0,title:'',transfers:[],media:[]}:objects.find(o=>Number(o.id)===Number(editId));
        $('#workspace').innerHTML=`<section class="page collection-page"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>Objets de famille</h2><p>La bague, l’horloge, le livre de messe… avec leur photo, de qui à qui ils sont passés, et qui les a aujourd’hui.</p></div></header>
            <div class="collection-toolbar"><input type="search" id="objects-q" value="${escapeHtml(q)}" placeholder="Chercher un objet ou une étiquette…"><button type="button" class="button" id="object-add">+ Objet</button></div>
            ${editing?familyObjectFormHtml(editing):''}
            <div class="collection-grid">${objects.map(o=>familyObjectCardHtml(o)).join('')||empty('Aucun objet pour l’instant',{icon:'🏺',hint:'Horloge, bijou, outil… et à qui il a été transmis.',action:{label:'＋ Objet',attrs:'data-empty-click="#object-add"'}})}</div></section>`;
        $('#objects-q').addEventListener('change',event=>{state.familyObjectsQuery=event.target.value.trim();renderFamilyObjectsList(++state.workspaceToken);});
        $('#object-add').addEventListener('click',()=>renderFamilyObjectsList(++state.workspaceToken,0));
        $$('[data-edit-object]').forEach(b=>b.addEventListener('click',()=>renderFamilyObjectsList(++state.workspaceToken,Number(b.dataset.editObject))));
        if(editing)bindFamilyObjectForm(editing);
        bindTableLinks();
    }
    function familyObjectFormHtml(o){
        const row=(t={})=>`<div class="transfer-row">${collectionPersonField('from_person_id',t.from_person,'De (personne)')}<input type="text" name="from_text" value="${escapeHtml(t.from_text||'')}" placeholder="ou nom libre"><span>→</span>${collectionPersonField('to_person_id',t.to_person,'À (personne)')}<input type="text" name="to_text" value="${escapeHtml(t.to_text||'')}" placeholder="ou nom libre"><input type="text" name="date_text" value="${escapeHtml(t.date_text||'')}" placeholder="Quand (ex. 1923)"><input type="text" name="note" value="${escapeHtml(t.note||'')}" placeholder="Occasion (mariage, héritage…)"><button type="button" class="button small secondary" data-remove-transfer aria-label="Retirer">✕</button></div>`;
        return `<form id="object-form" class="maintenance-panel collection-form" data-id="${o.id||0}"><h3>${o.id?'Modifier l’objet':'Nouvel objet'}</h3>
            <div class="form-grid"><label>Nom de l’objet<input name="title" required value="${escapeHtml(o.title||'')}" placeholder="Horloge comtoise"></label><label>Type<input name="kind" value="${escapeHtml(o.kind||'')}" placeholder="Bijou, meuble, livre…"></label>
            <label>Origine<input name="origin_text" value="${escapeHtml(o.origin_text||'')}" placeholder="Achetée à la foire de Tulle vers 1850"></label>
            <label>Aujourd’hui chez${collectionPersonField('holder_person_id',o.holder_person,'Personne de la base…')}</label><label>ou (nom libre)<input name="holder_text" value="${escapeHtml(o.holder_text||'')}" placeholder="Cousine Anne"></label><label>Où est-il<input name="location_text" value="${escapeHtml(o.location_text||'')}" placeholder="Salon, maison de Brive"></label>
            <label style="grid-column:1/-1">Description<textarea name="description" rows="3">${escapeHtml(o.description||'')}</textarea></label></div>
            <div class="collection-labels-edit">${o.id?entityLabelsField('family_object',o.id,o.labels||[]):'<small class="muted">Étiquettes : enregistre d’abord l’objet, puis ajoute-les ici.</small>'}</div>
            <h4>Transmission (de qui à qui)</h4><div id="transfer-rows">${(o.transfers?.length?o.transfers:[{}]).map(row).join('')}</div><button type="button" class="button small secondary" id="transfer-add">+ Étape</button>
            <h4>Photos</h4><div class="collection-media-edit">${(o.media||[]).map(m=>`<span class="collection-media-item">${mediaThumbHtml(m)}<button type="button" data-remove-media="${m.id}" aria-label="Retirer">✕</button></span>`).join('')}</div><input type="file" name="files" multiple accept="image/*,application/pdf">
            <label style="display:block;margin-top:.6rem">Notes<textarea name="notes" rows="2">${escapeHtml(o.notes||'')}</textarea></label>
            <div class="page-actions action-zone">${o.id?'<button class="button secondary danger" type="button" id="object-delete">Supprimer</button><span class="spacer" style="flex:1"></span>':''}<button class="button secondary" type="button" id="object-cancel">Annuler</button><button class="button" type="submit">Enregistrer</button></div>
            <template id="transfer-template">${row()}</template></form>`;
    }
    function bindFamilyObjectForm(o){
        const form=$('#object-form');bindCollectionPersonFields(form);bindEntityLabelsFields();form.scrollIntoView({block:'start'});
        $('#transfer-add').addEventListener('click',()=>{$('#transfer-rows').insertAdjacentHTML('beforeend',$('#transfer-template').innerHTML);bindCollectionPersonFields(form);});
        form.addEventListener('click',async event=>{
            if(event.target.closest('[data-remove-transfer]'))event.target.closest('.transfer-row').remove();
            const rm=event.target.closest('[data-remove-media]');if(rm&&await confirmBox('Le fichier reste dans tes médias.',{title:'Retirer cette photo de l’objet ?',okLabel:'Retirer la photo'})){await api('remove_collection_media',{}, {method:'POST',body:{collection_type:'family_object',collection_id:o.id,media_id:rm.dataset.removeMedia}});rm.parentElement.remove();}
        });
        $('#object-cancel').addEventListener('click',()=>renderFamilyObjectsList(++state.workspaceToken));
        $('#object-delete')?.addEventListener('click',async()=>{if(!await confirmBox('L’objet et l’historique de sa transmission seront supprimés.',{title:`Supprimer l’objet « ${o.title} » ?`,okLabel:'Supprimer l’objet'}))return;await api('delete_family_object',{}, {method:'POST',body:{id:o.id}});toast('Objet supprimé.');renderFamilyObjectsList(++state.workspaceToken);});
        form.addEventListener('submit',async event=>{event.preventDefault();
            const v=formObject(form);
            const transfers=$$('.transfer-row',form).map(r=>({from_person_id:r.querySelector('[name=from_person_id]').value,from_text:r.querySelector('[name=from_text]').value,to_person_id:r.querySelector('[name=to_person_id]').value,to_text:r.querySelector('[name=to_text]').value,date_text:r.querySelector('[name=date_text]').value,note:r.querySelector('[name=note]').value}));
            try{const saved=await api('save_family_object',{}, {method:'POST',body:{id:o.id,title:v.title,kind:v.kind,origin_text:v.origin_text,holder_person_id:form.querySelector('[name=holder_person_id]').value,holder_text:v.holder_text,location_text:v.location_text,description:v.description,notes:v.notes,transfers}});
                await uploadCollectionFiles('family_object',saved.result.id,form.elements.files.files);toast(o.id?'Objet enregistré.':'Objet enregistré : tu peux maintenant lui mettre des étiquettes.');renderFamilyObjectsList(++state.workspaceToken,o.id?null:saved.result.id);}catch(error){toast(error.message,'error');}
        });
    }
    /** Listes → Mémoire familiale */
    async function renderFamilyMemoriesList(token,editId=null){
        const q=state.familyMemoriesQuery||'',kind=state.familyMemoriesKind||'';
        const data=await api('family_memories',{q,kind});if(token!==state.workspaceToken||state.module!=='listes')return;
        const rows=data.memories||[],kinds=data.kinds||{};const editing=editId===0?{id:0,kind:'recipe',title:'',people:[],media:[]}:rows.find(m=>Number(m.id)===Number(editId));
        $('#workspace').innerHTML=`<section class="page collection-page"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>Mémoire familiale</h2><p>Les recettes de grand-mère, les expressions, les chansons, les surnoms, les traditions, rattachés aux personnes qui les ont transmis.</p></div></header>
            <div class="collection-toolbar"><input type="search" id="memories-q" value="${escapeHtml(q)}" placeholder="Chercher (texte ou étiquette)…"><select id="memories-kind"><option value="">Tout</option>${Object.entries(kinds).map(([k,l])=>`<option value="${k}" ${kind===k?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select><button type="button" class="button" id="memory-add">+ Souvenir</button></div>
            ${editing?familyMemoryFormHtml(editing,kinds):''}
            <div class="collection-grid">${rows.map(m=>familyMemoryCardHtml(m)).join('')||empty('Aucun souvenir pour l’instant',{icon:'💬',hint:'Une recette, une expression, une chanson…',action:{label:'＋ Souvenir',attrs:'data-empty-click="#memory-add"'}})}</div></section>`;
        $('#memories-q').addEventListener('change',event=>{state.familyMemoriesQuery=event.target.value.trim();renderFamilyMemoriesList(++state.workspaceToken);});
        $('#memories-kind').addEventListener('change',event=>{state.familyMemoriesKind=event.target.value;renderFamilyMemoriesList(++state.workspaceToken);});
        $('#memory-add').addEventListener('click',()=>renderFamilyMemoriesList(++state.workspaceToken,0));
        $$('[data-edit-memory]').forEach(b=>b.addEventListener('click',()=>renderFamilyMemoriesList(++state.workspaceToken,Number(b.dataset.editMemory))));
        if(editing)bindFamilyMemoryForm(editing);
        bindTableLinks();
    }
    function familyMemoryFormHtml(m,kinds){
        const row=(l={})=>`<div class="transfer-row">${collectionPersonField('person_id',l.person,'Personne…')}<select name="role"><option value="transmitted" ${l.role!=='received'&&l.role!=='about'?'selected':''}>l’a transmis</option><option value="received" ${l.role==='received'?'selected':''}>l’a reçu</option><option value="about" ${l.role==='about'?'selected':''}>concerné</option></select><button type="button" class="button small secondary" data-remove-transfer aria-label="Retirer">✕</button></div>`;
        return `<form id="memory-form" class="maintenance-panel collection-form"><h3>${m.id?'Modifier':'Nouveau souvenir'}</h3>
            <div class="form-grid"><label>Sorte<select name="kind">${Object.entries(kinds).map(([k,l])=>`<option value="${k}" ${m.kind===k?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select></label><label>Titre<input name="title" required value="${escapeHtml(m.title||'')}" placeholder="La tarte aux pommes de mémé"></label>
            <label>D’où ça vient<input name="origin_text" value="${escapeHtml(m.origin_text||'')}" placeholder="Raconté par tante Lucie en 1985"></label>
            <label style="grid-column:1/-1">Texte (recette, paroles, sens de l’expression…)<textarea name="content" rows="6">${escapeHtml(m.content||'')}</textarea></label></div>
            <div class="collection-labels-edit">${m.id?entityLabelsField('family_memory',m.id,m.labels||[]):'<small class="muted">Étiquettes : enregistre d’abord, puis ajoute-les ici.</small>'}</div>
            <h4>Personnes</h4><div id="memory-people">${(m.people?.length?m.people:[{}]).map(row).join('')}</div><button type="button" class="button small secondary" id="memory-person-add">+ Personne</button>
            <h4>Photos, enregistrements</h4><div class="collection-media-edit">${(m.media||[]).map(x=>`<span class="collection-media-item">${mediaThumbHtml(x)}<button type="button" data-remove-media="${x.id}" aria-label="Retirer">✕</button></span>`).join('')}</div><input type="file" name="files" multiple accept="image/*,audio/*,video/*,application/pdf">
            <div class="page-actions action-zone">${m.id?'<button class="button secondary danger" type="button" id="memory-delete">Supprimer</button><span class="spacer" style="flex:1"></span>':''}<button class="button secondary" type="button" id="memory-cancel">Annuler</button><button class="button" type="submit">Enregistrer</button></div>
            <template id="memory-person-template">${row()}</template></form>`;
    }
    function bindFamilyMemoryForm(m){
        const form=$('#memory-form');bindCollectionPersonFields(form);bindEntityLabelsFields();form.scrollIntoView({block:'start'});
        $('#memory-person-add').addEventListener('click',()=>{$('#memory-people').insertAdjacentHTML('beforeend',$('#memory-person-template').innerHTML);bindCollectionPersonFields(form);});
        form.addEventListener('click',async event=>{
            if(event.target.closest('[data-remove-transfer]'))event.target.closest('.transfer-row').remove();
            const rm=event.target.closest('[data-remove-media]');if(rm&&await confirmBox('Le fichier reste dans tes médias.',{title:'Retirer ce fichier du souvenir ?',okLabel:'Retirer le fichier'})){await api('remove_collection_media',{}, {method:'POST',body:{collection_type:'family_memory',collection_id:m.id,media_id:rm.dataset.removeMedia}});rm.parentElement.remove();}
        });
        $('#memory-cancel').addEventListener('click',()=>renderFamilyMemoriesList(++state.workspaceToken));
        $('#memory-delete')?.addEventListener('click',async()=>{if(!await confirmBox('',{title:`Supprimer « ${m.title} » ?`,okLabel:'Supprimer le souvenir'}))return;await api('delete_family_memory',{}, {method:'POST',body:{id:m.id}});toast('Supprimé.');renderFamilyMemoriesList(++state.workspaceToken);});
        form.addEventListener('submit',async event=>{event.preventDefault();const v=formObject(form);
            const people=$$('#memory-people .transfer-row',form).map(r=>({person_id:r.querySelector('[name=person_id]').value,role:r.querySelector('[name=role]').value})).filter(p=>Number(p.person_id));
            try{const saved=await api('save_family_memory',{}, {method:'POST',body:{id:m.id,kind:v.kind,title:v.title,content:v.content,origin_text:v.origin_text,people}});
                await uploadCollectionFiles('family_memory',saved.result.id,form.elements.files.files);toast(m.id?'Enregistré.':'Enregistré : tu peux maintenant lui mettre des étiquettes.');renderFamilyMemoriesList(++state.workspaceToken,m.id?null:saved.result.id);}catch(error){toast(error.message,'error');}
        });
    }
    /** Listes → Lieux précis (adresse, ferme, maison) et leur fiche « en un coup d'œil » */
    async function renderPrecisePlacesList(token){
        if(state.precisePlaceKey)return renderPrecisePlace(token,state.precisePlaceKey);
        const q=state.precisePlacesQuery||'',radius=Number(state.precisePlacesRadius)||30;
        const data=await api('precise_places',{q,radius});if(token!==state.workspaceToken||state.module!=='listes')return;
        const rows=data.places||[];
        $('#workspace').innerHTML=`<section class="page collection-page"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>Lieux précis</h2><p>Une adresse, une ferme, une maison : tout ce que tu as sur ce lieu. Regroupe la même adresse dans la même commune (en ignorant les différences d’écriture) et les points GPS proches.</p></div></header>
            <div class="collection-toolbar"><input type="search" id="pp-q" value="${escapeHtml(q)}" placeholder="Adresse ou commune…"><label>Points GPS regroupés à moins de <select id="pp-radius">${[10,30,100,300].map(r=>`<option value="${r}" ${radius===r?'selected':''}>${r} m</option>`).join('')}</select></label></div>
            ${rows.length?`<table class="data-table precise-table"><thead><tr><th>Commune</th><th>Lieu précis</th><th>Événements</th><th>Recensements</th><th>Années</th></tr></thead><tbody>${rows.map(r=>`<tr data-pp-key="${escapeHtml(r.key)}" tabindex="0"><td>${escapeHtml(r.place||'—')}</td><td><strong>${escapeHtml(r.label)}</strong>${r.gps_only?' <small class="muted">(position GPS sans adresse)</small>':''}</td><td>${r.events}</td><td>${r.census}</td><td>${r.from?`${r.from}${r.to&&r.to!==r.from?`–${r.to}`:''}`:'—'}</td></tr>`).join('')}</tbody></table>`:empty('Aucun lieu précis : remplis la case « Adresse » des événements ou des recensements, ou place un point GPS précis.',{icon:'📍'})}</section>`;
        $('#pp-q').addEventListener('change',event=>{state.precisePlacesQuery=event.target.value.trim();renderPrecisePlacesList(++state.workspaceToken);});
        $('#pp-radius').addEventListener('change',event=>{state.precisePlacesRadius=Number(event.target.value);renderPrecisePlacesList(++state.workspaceToken);});
        $$('[data-pp-key]').forEach(tr=>{const open=()=>{state.precisePlaceKey=tr.dataset.ppKey;renderPrecisePlacesList(++state.workspaceToken);};tr.addEventListener('click',open);tr.addEventListener('keydown',e=>{if(e.key==='Enter')open();});});
    }
    async function renderPrecisePlace(token,key){
        let data;try{data=await api('precise_place',{key,radius:Number(state.precisePlacesRadius)||30});}catch(error){state.precisePlaceKey='';toast(error.message,'error');return renderPrecisePlacesList(++state.workspaceToken);}
        if(token!==state.workspaceToken||state.module!=='listes')return;
        const p=data.place;
        const mapEvents=data.events.map(e=>({...e,place_name:[p.label,p.place].filter(Boolean).join(', '),latitude:e.precise_lat??p.lat,longitude:e.precise_lon??p.lon,place_id:'pp'}));
        const years=o=>o.from?`${o.from}${o.to&&o.to!==o.from?` à ${o.to}`:''}`:'dates inconnues';
        $('#workspace').innerHTML=`<section class="page precise-place-page"><header class="page-header"><div><span class="eyebrow">LIEU PRÉCIS</span><h2>${escapeHtml(p.label)}</h2><p>${escapeHtml(p.place||'')}${p.from?` · de ${p.from} à ${p.to}`:''} · ${p.events} événement${p.events>1?'s':''}, ${p.census} recensement${p.census>1?'s':''}</p></div><div class="page-actions"><button class="button secondary" type="button" id="pp-back">← Tous les lieux précis</button></div></header>
            <div class="precise-place-grid">
            <section class="card span-6"><header class="card-head"><div class="card-title"><h3>Habitants successifs</h3></div></header><div class="card-body">${data.occupants.length?`<ol class="occupants">${data.occupants.map(o=>`<li><strong>Famille ${escapeHtml(o.family)}</strong> <span class="muted">${escapeHtml(years(o))}</span>${o.people.length?`<div>${o.people.map(personChip).join(' · ')}</div>`:''}</li>`).join('')}</ol>`:empty('Personne de rattaché.',{icon:'👥'})}</div></section>
            <section class="card span-6"><header class="card-head"><div class="card-title"><h3>Sur la carte</h3></div></header><div class="card-body">${p.lat!=null?personEventMap(mapEvents):empty('Pas de coordonnées pour ce lieu.',{icon:'🗺️'})}</div></section>
            <section class="card span-12"><header class="card-head"><div class="card-title"><h3>Tous les événements à cet endroit</h3><span class="card-count">${data.events.length}</span></div></header><div class="card-body">${data.events.length?`<table class="data-table"><thead><tr><th>Date</th><th>Événement</th><th>Personnes</th><th>Adresse écrite</th></tr></thead><tbody>${data.events.map(e=>`<tr><td>${escapeHtml(e.date_text||e.year||'—')}</td><td>${escapeHtml(e.type_label||'')}${e.title?` <small>${escapeHtml(e.title)}</small>`:''}</td><td>${e.people.map(personChip).join(' · ')||'—'}</td><td><small>${escapeHtml(e.address||'(point GPS)')}</small></td></tr>`).join('')}</tbody></table>`:empty('Aucun événement.',{icon:'📅'})}</div></section>
            ${data.census.length?`<section class="card span-12"><header class="card-head"><div class="card-title"><h3>Recensements</h3><span class="card-count">${data.census.length}</span></div></header><div class="card-body">${data.census.map(c=>`<div class="pp-census"><strong>${escapeHtml(c.year||c.date_text||'')}</strong> <small class="muted">${escapeHtml(c.address||'')}</small><ul>${c.members.map(m=>`<li>${m.person?personChip(m.person):escapeHtml(m.display_name||'')}${m.age_text?` <small>${escapeHtml(m.age_text)}</small>`:''}${m.occupation?` · <small>${escapeHtml(m.occupation)}</small>`:''}</li>`).join('')}</ul></div>`).join('')}</div></section>`:''}
            ${data.media.length?`<section class="card span-12"><header class="card-head"><div class="card-title"><h3>Photos et documents</h3><span class="card-count">${data.media.length}</span></div></header><div class="card-body collection-media-edit">${data.media.map(m=>`<span class="collection-media-item">${mediaThumbHtml(m)}</span>`).join('')}</div></section>`:''}
            </div></section>`;
        $('#pp-back').addEventListener('click',()=>{state.precisePlaceKey='';renderPrecisePlacesList(++state.workspaceToken);});
        bindTableLinks();
    }
    /** Ligne « saint du jour » de la fiche (bloc Identité). */
    function personSaintHtml(saint){
        if(!saint?.label)return '';
        return `<div class="person-saint${saint.matched?'':' is-hint'}"><span aria-hidden="true">✶</span> ${escapeHtml(saint.label)}</div>`;
    }
    /** Widget « Prénom et saint du jour » */
    function dashboardSaintCard(index,data,spanClass){
        if(!data)return card(index,'Prénom et saint du jour','',empty('Calendrier indisponible.',{icon:'📅'}),spanClass);
        const saints=(data.saints||[]).join(', ');
        const people=(data.people||[]).slice(0,12);
        const body=`<p class="saint-of-day"><strong>${escapeHtml(data.day_label)}</strong> : ${escapeHtml(saints)}</p>
            ${people.length?`<ul class="saint-people">${people.map(r=>`<li class="${r.named_after?'is-named':''}">${personChip(r.person)} <small>${r.kind==='birth'?(r.person.gender==='female'?'née':'né'):(r.person.gender==='female'?'baptisée':'baptisé')} ce jour${r.named_after?` · prénom du saint (${escapeHtml(r.named_after)})`:''}</small></li>`).join('')}</ul>${data.people_total>people.length?`<small class="muted">… et ${plural(data.people_total-people.length,'autre')}</small>`:''}`:'<small class="muted">Personne de ta base n’est né ou baptisé un '+escapeHtml(data.day_label)+'.</small>'}
            ${data.people_total?`<small class="muted">${data.named_after} sur ${data.people_total} portent le prénom du saint du jour.</small>`:''}`;
        return card(index,'Prénom et saint du jour','',body,spanClass);
    }
    /** Graphiques → Statistiques → Prénom et saint du jour */
    async function renderSaintStats(token){
        const data=await api('saint_stats');if(token!==state.workspaceToken||state.module!=='graphiques')return;
        const bar=v=>`<span class="saint-bar"><span style="width:${Math.min(100,v.percent*3)}%"></span></span>`;
        const table=(rows,first,key)=>`<table class="data-table saint-stats-table"><thead><tr><th>${first}</th><th>Naissances datées</th><th>Prénom du saint du jour</th><th>%</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><button type="button" class="link-button" data-saint-filter="${key}" data-saint-value="${escapeHtml(r.label)}" title="Voir les personnes">${escapeHtml(r.label)}</button></td><td>${r.total}</td><td>${r.matched}</td><td>${String(r.percent).replace('.',',')} %</td><td>${bar(r)}</td></tr>`).join('')}</tbody></table>`;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">STATISTIQUES</span><h2>Prénom et saint du jour</h2><p>Part des personnes qui portent le prénom du saint fêté le jour de leur naissance, de leur baptême, ou le lendemain de leur naissance. ${data.matched} sur ${plural(data.total,'personne')} dont le jour de naissance ou de baptême est connu (${data.total?String(Math.round(1000*data.matched/data.total)/10).replace('.',','):0} %). Calendrier des almanachs français : il a varié selon les époques et les diocèses.</p></div></header>
            <div class="saint-stats-grid"><section class="maintenance-panel"><h3>Par époque</h3>${table(data.periods,'Époque','period')}</section><section class="maintenance-panel"><h3>Par famille (au moins 8 naissances datées)</h3>${data.families.length?table(data.families,'Famille','family'):empty('Pas assez de naissances datées par famille.',{icon:'👶'})}</section></div>
            <section class="maintenance-panel saint-people-panel"><h3>Les personnes concernées</h3>
                <div class="saint-people-tools"><label>Montrer <select data-saint-show><option value="matched">qui portent le prénom du saint</option><option value="other">qui ne le portent pas</option><option value="all">toutes</option></select></label>
                <label>Trier <select data-saint-sort><option value="date_asc">par date (la plus ancienne d’abord)</option><option value="date_desc">par date (la plus récente d’abord)</option><option value="day">par jour de l’année (1er janvier → 31 décembre)</option><option value="name">par nom</option><option value="saint">par saint</option></select></label>
                <input type="search" data-saint-q placeholder="Filtrer : prénom, nom, saint…"><span class="saint-people-scope" data-saint-scope hidden></span></div>
                <div data-saint-people></div></section></section>`;
        const people=data.people||[];
        const ui={show:'matched',sort:'date_asc',q:'',scope:null,limit:200};
        const kindLabel=(r)=>{const f=r.gender==='female';return r.kind==='baptism'?(f?'baptisée':'baptisé'):r.kind==='next'?(f?'née la veille':'né la veille'):(f?'née':'né');};
        const fold=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
        const paint=()=>{
            const q=fold(ui.q);
            let rows=people.filter(r=>ui.show==='all'||(ui.show==='matched'?!!r.saint:!r.saint));
            if(ui.scope)rows=rows.filter(r=>String(r[ui.scope.key]||'')===ui.scope.value);
            if(q)rows=rows.filter(r=>fold(`${r.first_name} ${r.last_name} ${r.saint||''} ${r.date_text}`).includes(q));
            const cmp={date_asc:(a,b)=>(a.year||9999)-(b.year||9999)||a.day.localeCompare(b.day),date_desc:(a,b)=>(b.year||0)-(a.year||0)||b.day.localeCompare(a.day),day:(a,b)=>a.day.localeCompare(b.day)||(a.year||0)-(b.year||0),
                name:(a,b)=>`${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`,'fr',{sensitivity:'base'}),saint:(a,b)=>String(a.saint||'~').localeCompare(String(b.saint||'~'),'fr')||a.day.localeCompare(b.day)}[ui.sort];
            rows=[...rows].sort(cmp);
            const scopeBox=$('[data-saint-scope]');scopeBox.hidden=!ui.scope;
            scopeBox.innerHTML=ui.scope?`${ui.scope.key==='period'?'Époque':'Famille'} : <strong>${escapeHtml(ui.scope.value)}</strong> <button type="button" class="link-button" data-saint-unscope>retirer</button>`:'';
            $('[data-saint-people]').innerHTML=rows.length?`<p class="muted">${rows.length.toLocaleString('fr-FR')} personne${rows.length>1?'s':''}</p><table class="data-table"><thead><tr><th>Personne</th><th>Date</th><th>Jour</th><th>Événement</th><th>Saint du jour</th></tr></thead><tbody>${rows.slice(0,ui.limit).map(r=>`<tr><td><button type="button" class="link-button" data-open-person="${Number(r.id)}">${escapeHtml(`${r.first_name} ${r.last_name}`.trim())}</button></td><td>${escapeHtml(r.date_text||'')}</td><td>${escapeHtml(r.day_label||'')}</td><td>${escapeHtml(kindLabel(r))}</td><td>${r.saint?escapeHtml(r.saint_label||r.saint):'<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table>${rows.length>ui.limit?`<button type="button" class="button small secondary" data-saint-more>Afficher ${Math.min(200,rows.length-ui.limit)} de plus (${plural(rows.length-ui.limit,'restante')})</button>`:''}`:empty('Aucune personne pour ce choix.',{icon:'👥'});
            bindTableLinks();
        };
        $('[data-saint-show]').addEventListener('change',e=>{ui.show=e.target.value;ui.limit=200;paint();});
        $('[data-saint-sort]').addEventListener('change',e=>{ui.sort=e.target.value;paint();});
        $('[data-saint-q]').addEventListener('input',debounce(e=>{ui.q=e.target.value;ui.limit=200;paint();},150));
        $('#workspace > section').addEventListener('click',e=>{
            const f=e.target.closest('[data-saint-filter]');
            if(f){ui.scope={key:f.dataset.saintFilter,value:f.dataset.saintValue};ui.limit=200;paint();$('.saint-people-panel')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
            if(e.target.closest('[data-saint-unscope]')){ui.scope=null;paint();return;}
            if(e.target.closest('[data-saint-more]')){ui.limit+=200;paint();}
        });
        paint();
    }
    /** Maintenance → Entretien : vérifier les liens web enregistrés */
    async function renderUpkeep(token=++state.workspaceToken){
        const data=await api('link_inventory');if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='entretien')return;
        const links=data.links||[];
        // Liens externes utiles (Listes) : gardés dans les réglages de l'interface
        externalLinks().forEach(row=>{const u=String(row.url||'').trim();if(!/^https?:\/\//i.test(u))return;let item=links.find(l=>l.url===u);if(!item){item={url:u,uses:[],check:null};links.push(item);}item.uses.push({what:'Liens externes utiles',label:row.name||'',local:true});});
        const status=l=>{const c=state.linkResults?.[l.url]||l.check;if(!c)return ['unknown','Jamais vérifié'];
            const code=Number(c.status)||0;if(c.ok===true||(code>=200&&code<400)||code===416)return c.final_url?['moved','Déplacé']:['ok','Fonctionne'];
            if([401,403,405,429].includes(code))return ['doubt','Le site refuse les robots (à vérifier à la main)'];return ['dead',code?`Ne répond plus (erreur ${code})`:'Ne répond plus'];};
        const counts={ok:0,moved:0,dead:0,doubt:0,unknown:0};links.forEach(l=>counts[status(l)[0]]++);
        const filter=state.upkeepFilter||'problems';
        const shown=links.filter(l=>filter==='all'||(filter==='problems'?['dead','moved','doubt'].includes(status(l)[0]):status(l)[0]===filter));
        $('#workspace').innerHTML=`<section class="page upkeep-page"><header class="page-header"><div><span class="eyebrow">ENTRETIEN</span><h2>Vérifier les liens web</h2><p>Contrôle les adresses enregistrées (fiches en ligne, sources Internet, médias, liens externes utiles…) et signale celles qui ne marchent plus, avant qu’elles ne soient perdues. Quand un site a déplacé une page, la nouvelle adresse est proposée ; quand une page a disparu, une copie sur Internet Archive (archive.org) est cherchée. Rien n’est remplacé sans ton accord.</p></div></header>
            <section class="maintenance-panel"><div class="page-actions"><button class="button" type="button" id="upkeep-check">${links.length<2?'Vérifier le lien':`Vérifier les ${links.length} liens`}</button><span id="upkeep-progress" class="muted"></span></div>
            <div class="upkeep-summary"><span class="is-ok">${counts.ok} ${counts.ok>1?'fonctionnent':'fonctionne'}</span><span class="is-moved">${plural(counts.moved,'déplacé')}</span><span class="is-dead">${counts.dead} ${counts.dead>1?'ne répondent plus':'ne répond plus'}</span><span class="is-doubt">${counts.doubt} à vérifier</span><span>${counts.unknown} jamais ${counts.unknown>1?'vérifiés':'vérifié'}</span></div>
            <label>Afficher <select id="upkeep-filter"><option value="problems" ${filter==='problems'?'selected':''}>Les liens à regarder</option><option value="all" ${filter==='all'?'selected':''}>Tous les liens</option><option value="unknown" ${filter==='unknown'?'selected':''}>Jamais vérifiés</option><option value="ok" ${filter==='ok'?'selected':''}>Qui fonctionnent</option></select></label></section>
            ${shown.length?`<table class="data-table upkeep-table"><thead><tr><th>Lien</th><th>Où il est enregistré</th><th>État</th><th>Proposition</th></tr></thead><tbody>${shown.map(l=>{const [k,label]=status(l);const c=state.linkResults?.[l.url]||l.check||{};const proposal=c.final_url||c.archive_url||'';
                return `<tr class="upkeep-${k}"><td><a href="${escapeHtml(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.url)}</a></td><td>${l.uses.map(u=>`${escapeHtml(u.what)}${u.label?` : ${escapeHtml(u.label)}`:''}${u.person_id?` <button type="button" class="table-link" data-open-person="${u.person_id}">fiche</button>`:''}`).join('<br>')}</td><td>${escapeHtml(label)}${c.checked_at?`<br><small class="muted">${escapeHtml(String(c.checked_at).slice(0,16))}</small>`:''}</td>
                <td>${proposal?`<a href="${escapeHtml(safeUrl(proposal))}" target="_blank" rel="noopener noreferrer">${c.final_url?'Nouvelle adresse':'Copie archivée'}</a><br><button type="button" class="button small" data-upkeep-replace="${escapeHtml(l.url)}" data-upkeep-new="${escapeHtml(proposal)}" data-upkeep-local="${l.uses.some(u=>u.local)?'1':''}">Remplacer le lien</button>`:(k==='dead'?'<small class="muted">Aucune copie trouvée</small>':'')}</td></tr>`;}).join('')}</tbody></table>`:empty(filter==='problems'?'Aucun lien à regarder. Lance une vérification pour mettre à jour.':'Aucun lien.',{icon:'🔗'})}</section>`;
        $('#upkeep-filter').addEventListener('change',event=>{state.upkeepFilter=event.target.value;renderUpkeep();});
        $('#upkeep-check').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;state.linkResults=state.linkResults||{};const urls=links.map(l=>l.url);
            for(let i=0;i<urls.length;i+=10){$('#upkeep-progress').textContent=`Vérification… ${Math.min(i+10,urls.length)} / ${urls.length}`;
                try{const r=await api('check_links',{}, {method:'POST',body:{urls:urls.slice(i,i+10)}});(r.result.checked||[]).forEach(c=>{state.linkResults[c.url]={...c,checked_at:new Date().toISOString().replace('T',' ')};});}catch(error){toast(error.message,'error');break;}}
            toast('Vérification terminée.');renderUpkeep();});
        $$('[data-upkeep-replace]').forEach(b=>b.addEventListener('click',async()=>{const old=b.dataset.upkeepReplace,neu=b.dataset.upkeepNew;if(!await confirmBox(`${old}\n→ ${neu}`,{title:'Remplacer ce lien partout ?',okLabel:'Remplacer partout'}))return;
            try{const r=await api('replace_link',{}, {method:'POST',body:{old,new:neu}});
                if(b.dataset.upkeepLocal){const list=externalLinks().map(row=>String(row.url||'').trim()===old?{...row,url:neu}:row);localStorage.setItem('genealogie-external-links',JSON.stringify(list));}
                delete state.linkResults?.[old];toast(`Lien remplacé (${Number(r.result.replaced)+(b.dataset.upkeepLocal?1:0)}).`);renderUpkeep();}catch(error){toast(error.message,'error');}}));
        bindTableLinks();
    }
    /** Listes → Salons et événements de généalogie */
    function fairDateText(f){
        if(!f.date_start)return 'Date à préciser';
        const d=v=>new Date(v+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
        const today=new Date();today.setHours(0,0,0,0);const start=new Date(f.date_start+'T00:00:00'),end=new Date((f.date_end||f.date_start)+'T00:00:00');
        const days=Math.round((start-today)/86400000);
        const when=end<today?'passé':(start<=today?'en ce moment':(days===1?'demain':`dans ${days} jours`));
        return `${d(f.date_start)}${f.date_end&&f.date_end!==f.date_start?` au ${d(f.date_end)}`:''} · ${when}`;
    }
    function fairCardHtml(f){
        const today=new Date().toISOString().slice(0,10);const past=(f.date_end||f.date_start)&&(f.date_end||f.date_start)<today;
        const section=(title,text)=>text?`<div class="fair-section"><h5>${escapeHtml(title)}</h5><p>${escapeHtml(text)}</p></div>`:'';
        return `<article class="fair-card${past?' is-past':''}"><header><div><span class="collection-kind">${escapeHtml(f.kind||'Salon')}</span>${Number(f.attended)?' <span class="fair-badge">J’y suis allé</span>':''}<h4>${escapeHtml(f.title)}</h4><p class="fair-when">${escapeHtml(fairDateText(f))}${f.hours_text?` · ${escapeHtml(f.hours_text)}`:''}</p>${f.place_text||f.address?`<p class="muted">${escapeHtml([f.place_text,f.address].filter(Boolean).join(' · '))}</p>`:''}</div><button type="button" class="button small secondary" data-edit-fair="${f.id}">Modifier</button></header>
            <details${past?'':' open'}><summary>Détails</summary>${section('Tarif',f.price_text)}${section('Comment y aller',f.access_text)}${section('Que prévoir',f.prepare_text)}${section('Stands à voir',f.stands_text)}
            ${f.link_list?.length?`<div class="fair-section"><h5>Liens</h5><ul>${f.link_list.map(l=>`<li><a href="${escapeHtml(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label||l.url)}</a></li>`).join('')}</ul></div>`:''}${section('Notes',f.notes)}</details></article>`;
    }
    async function renderFairsList(token,editId=null){
        const data=await api('genealogy_fairs');if(token!==state.workspaceToken||state.module!=='listes')return;
        const rows=data.fairs||[];const editing=editId===0?{id:0,kind:'Salon'}:rows.find(f=>Number(f.id)===Number(editId));
        const today=new Date().toISOString().slice(0,10);const upcoming=rows.filter(f=>!f.date_start||(f.date_end||f.date_start)>=today),past=rows.filter(f=>f.date_start&&(f.date_end||f.date_start)<today);
        // Les salons passés restent consultables, mais ne gênent pas : masqués tant qu'on ne les demande pas
        const fairsFilter=['upcoming','past','all'].includes(state.fairsFilter)?state.fairsFilter:'upcoming';
        $('#workspace').innerHTML=`<section class="page collection-page"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>Salons et événements</h2><p>Salons, forums, congrès, journées portes ouvertes des archives… avec la date, le lieu, comment y aller, que prévoir, les stands à voir et les liens utiles.</p></div></header>
            <div class="collection-toolbar"><button type="button" class="button" id="fair-add">+ Salon ou événement</button><div class="segmented-filter" role="group" aria-label="Afficher">${[['upcoming',`À venir (${upcoming.length})`],['past',`Passés (${past.length})`],['all',`Tous (${rows.length})`]].map(([value,label])=>`<button type="button" class="button small ${fairsFilter===value?'':'secondary'}" data-fairs-filter="${value}" aria-pressed="${fairsFilter===value}">${escapeHtml(label)}</button>`).join('')}</div></div>
            ${editing?fairFormHtml(editing):''}
            ${fairsFilter!=='past'?`<h3>À venir</h3><div class="fair-list">${upcoming.map(fairCardHtml).join('')||empty('Aucun salon à venir',{icon:'🎪',action:{label:'＋ Salon ou événement',attrs:'data-empty-click="#fair-add"'}})}</div>`:''}
            ${fairsFilter==='upcoming'&&past.length?`<p class="muted"><button type="button" class="link-button" data-fairs-filter="past">${past.length>1?`Voir les ${past.length} salons passés`:'Voir le salon passé'}</button></p>`:''}
            ${fairsFilter!=='upcoming'?`<h3>Passés</h3><div class="fair-list">${past.map(fairCardHtml).join('')||empty('Aucun salon passé.',{icon:'🎪'})}</div>`:''}</section>`;
        $$('[data-fairs-filter]').forEach(b=>b.addEventListener('click',()=>{state.fairsFilter=b.dataset.fairsFilter;renderFairsList(++state.workspaceToken);}));
        $('#fair-add').addEventListener('click',()=>renderFairsList(++state.workspaceToken,0));
        $$('[data-edit-fair]').forEach(b=>b.addEventListener('click',()=>renderFairsList(++state.workspaceToken,Number(b.dataset.editFair))));
        if(editing){const form=$('#fair-form');form.scrollIntoView({block:'start'});
            $('#fair-cancel').addEventListener('click',()=>renderFairsList(++state.workspaceToken));
            $('#fair-delete')?.addEventListener('click',async()=>{if(!await confirmBox('',{title:`Supprimer « ${editing.title} » ?`,okLabel:'Supprimer le salon'}))return;await api('delete_genealogy_fair',{}, {method:'POST',body:{id:editing.id}});toast('Supprimé.');renderFairsList(++state.workspaceToken);});
            form.addEventListener('submit',async event=>{event.preventDefault();const v=formObject(form);v.id=editing.id;v.attended=form.elements.attended.checked;v.remind=form.elements.remind.checked;
                try{await api('save_genealogy_fair',{}, {method:'POST',body:v});toast(v.remind&&v.date_start?'Enregistré (avec un rappel).':'Enregistré.');renderFairsList(++state.workspaceToken);}catch(error){toast(error.message,'error');}});}
    }
    function fairFormHtml(f){
        const v=k=>escapeHtml(f[k]||'');
        return `<form id="fair-form" class="maintenance-panel collection-form"><h3>${f.id?'Modifier':'Nouveau salon ou événement'}</h3>
            <div class="form-grid"><label>Nom<input name="title" required value="${v('title')}" placeholder="Salon de la généalogie"></label><label>Type<input name="kind" value="${v('kind')}" list="fair-kinds" placeholder="Salon, forum, congrès…"><datalist id="fair-kinds"><option>Salon</option><option>Forum</option><option>Congrès</option><option>Journée portes ouvertes</option><option>Conférence</option><option>Atelier</option><option>Visite</option></datalist></label>
            <label>Du<input type="date" name="date_start" value="${v('date_start')}"></label><label>Au (si plusieurs jours)<input type="date" name="date_end" value="${v('date_end')}"></label><label>Horaires<input name="hours_text" value="${v('hours_text')}" placeholder="10 h – 18 h"></label><label>Tarif<input name="price_text" value="${v('price_text')}" placeholder="Entrée libre"></label>
            <label>Lieu<input name="place_text" value="${v('place_text')}" placeholder="Mairie du 15e, Paris"></label><label>Adresse<input name="address" value="${v('address')}" placeholder="31 rue Péclet, 75015 Paris"></label>
            <label style="grid-column:1/-1">Comment y aller<textarea name="access_text" rows="2" placeholder="Métro Vaugirard ; parking à 300 m…">${v('access_text')}</textarea></label>
            <label style="grid-column:1/-1">Que prévoir<textarea name="prepare_text" rows="3" placeholder="Liste des branches bloquées, clé USB, questions pour le cercle du Limousin…">${v('prepare_text')}</textarea></label>
            <label style="grid-column:1/-1">Stands à voir<textarea name="stands_text" rows="3" placeholder="Cercle généalogique de la Corrèze (stand 12), Archives départementales…">${v('stands_text')}</textarea></label>
            <label style="grid-column:1/-1">Liens (un par ligne, avec un nom si tu veux : « Programme https://… »)<textarea name="links" rows="3">${v('links')}</textarea></label>
            <label style="grid-column:1/-1">Notes<textarea name="notes" rows="3">${v('notes')}</textarea></label></div>
            <div class="checkbox-group"><label class="checkbox-line"><input type="checkbox" name="remind" ${f.reminder_id||!f.id?'checked':''}> Me le rappeler <input type="number" name="remind_days" min="0" max="60" value="7" style="width:4.5em"> jours avant (Rappels et notification)</label><label class="checkbox-line"><input type="checkbox" name="attended" ${Number(f.attended)?'checked':''}> J’y suis allé</label></div>
            <div class="page-actions action-zone">${f.id?'<button class="button secondary danger" type="button" id="fair-delete">Supprimer</button><span class="spacer" style="flex:1"></span>':''}<button class="button secondary" type="button" id="fair-cancel">Annuler</button><button class="button" type="submit">Enregistrer</button></div></form>`;
    }
    /* ── Ascendants / descendants (blocs de fiche + widget) et branches fermées ── */
    const branchCertainties={certain:'Sûr',very_likely:'Très probable',likely:'Probable',maybe:'Peut-être',doubtful:'Gros doute'};
    const branchReasons={extinct:'Lignée éteinte (aucun descendant)',no_children:'Mort sans enfant',unknown_father:'Enfant naturel, père inconnu',foundling:'Enfant trouvé, parents inconnus',records_lost:'Registres détruits ou perdus',no_more_records:'Plus d’actes plus anciens',searched:'Recherches complètes sans résultat',other:'Autre raison'};
    /** Générations affichées : réglage de toutes les fiches, ou exception pour une fiche (comme l'ordre des blocs). */
    function lineageSettings(personId=0){
        let s={asc:3,desc:2};
        try{s={...s,...JSON.parse(localStorage.getItem('genealogie-lineage')||'{}')};}catch(_){}
        if(personId){try{s={...s,...JSON.parse(localStorage.getItem(`genealogie-lineage-${personId}`)||'{}')};}catch(_){}}
        s.asc=Math.max(1,Math.min(8,Number(s.asc)||3));s.desc=Math.max(1,Math.min(8,Number(s.desc)||2));return s;
    }
    function lineageHasException(personId){try{return !!localStorage.getItem(`genealogie-lineage-${personId}`);}catch(_){return false;}}
    function saveLineageSettings(s,personId=0){localStorage.setItem(personId?`genealogie-lineage-${personId}`:'genealogie-lineage',JSON.stringify({asc:s.asc,desc:s.desc}));}
    const lineageCache=new Map();
    async function loadLineage(personId,asc,desc){const key=`${personId}:${asc}:${desc}`;if(!lineageCache.has(key))lineageCache.set(key,api('lineage',{id:personId,asc,desc}));try{return await lineageCache.get(key);}catch(error){lineageCache.delete(key);throw error;}}
    function clearLineageCache(){lineageCache.clear();}
    const generationLabel=(n,kind)=>kind==='asc'?(['','Parents','Grands-parents','Arrière-grands-parents'][n]||`${n} générations`):(['','Enfants','Petits-enfants','Arrière-petits-enfants'][n]||`${n} générations`);
    function lineagePersonHtml(p,extra=''){
        if(!p)return '<span class="muted">?</span>';
        const name=[p.first_name,p.last_name].filter(Boolean).join(' ')||'Sans nom';
        const yrs=(p.birth_year||p.death_year)?` <small>${p.birth_year||'?'}–${p.death_year||(p.living_status==='living'?'':'?')}</small>`:'';
        const closed=(p.closed||[]).filter(c=>c.direction==='descendance').map(c=>`<span class="branch-closed-badge certainty-${escapeHtml(c.certainty)}" title="${c.direction==='ascendance'?'Ascendance':'Descendance'} fermée : ${escapeHtml(branchCertainties[c.certainty]||'')}">⊘ lignée éteinte${c.certainty==='certain'?'':' · '+escapeHtml((branchCertainties[c.certainty]||'').toLowerCase())}</span>`).join('');
        return `<button type="button" class="table-link lineage-person gender-${escapeHtml(p.gender||'unknown')}" data-open-person="${p.id}">${escapeHtml(name)}</button>${yrs}${extra}${closed}`;
    }
    function ascendantsTreeHtml(data){
        const P=data.people||{};
        const node=(n,role)=>{const p=P[n.id];const label=role?`<span class="lineage-role">${escapeHtml(role)}</span> `:'';
            const more=n.more?'<span class="lineage-more" title="D’autres ancêtres existent au-delà">┄ suite</span>':'';
            const kids=(n.parents||[]).map(x=>{const g=P[x.id]?.gender;return node(x,g==='female'?'Mère':(g==='male'?'Père':'Parent'));});
            return `<li>${label}${lineagePersonHtml(p,more)}${kids.length?`<ul>${kids.join('')}</ul>`:''}</li>`;};
        const root=data.ascendants;if(!root||!(root.parents||[]).length)return empty('Aucun parent connu.',{icon:'🌳'});
        return `<ul class="lineage-tree">${(root.parents||[]).map(x=>{const g=P[x.id]?.gender;return node(x,g==='female'?'Mère':(g==='male'?'Père':'Parent'));}).join('')}</ul>`;
    }
    function descendantsTreeHtml(data){
        const P=data.people||{};
        const byBirth=(a,b)=>(Number(P[a.id]?.birth_year)||9999)-(Number(P[b.id]?.birth_year)||9999);
        const node=n=>{const p=P[n.id];
            const more=n.more?`<span class="lineage-more" title="D’autres descendants existent au-delà">┄ ${n.more_count} enfant${n.more_count>1?'s':''}</span>`:'';
            const unions=(n.unions||[]).map(u=>{const kids=[...(u.children||[])].sort(byBirth).map(node).join('');const spouse=u.spouse?`<span class="lineage-role">∞</span> ${lineagePersonHtml(P[u.spouse])}`:'<span class="lineage-role">∞ conjoint inconnu</span>';return `<li class="lineage-union">${spouse}${kids?`<ul>${kids}</ul>`:''}</li>`;}).join('');
            return `<li>${lineagePersonHtml(p,more)}${unions?`<ul>${unions}</ul>`:''}</li>`;};
        const root=data.descendants;const unions=root?.unions||[];
        if(!unions.some(u=>(u.children||[]).length)&&!unions.length)return empty('Aucun descendant connu.',{icon:'🌱'});
        return `<ul class="lineage-tree">${unions.map(u=>{const kids=[...(u.children||[])].sort(byBirth).map(node).join('');const spouse=u.spouse?`<span class="lineage-role">∞</span> ${lineagePersonHtml(P[u.spouse])}`:'<span class="lineage-role">Enfants</span>';return `<li class="lineage-union">${spouse}${kids?`<ul>${kids}</ul>`:'<ul><li class="muted">Pas d’enfant connu</li></ul>'}</li>`;}).join('')}</ul>`;
    }
    function lineageDepthSelect(kind,value){return `<label class="lineage-depth">Afficher <select data-lineage-depth="${kind}">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===value?'selected':''}>${escapeHtml(generationLabel(n,kind))}</option>`).join('')}</select></label>`;}
    function branchStatusHtml(person,direction,branches){
        const b=(branches||[]).find(x=>x.direction===direction&&(Number(x.person_id)===Number(person.id)||Number(x.partner_id)===Number(person.id)));
        if(!b)return `<div class="branch-status"><button type="button" class="button small secondary" data-close-branch="${direction}">⊘ Déclarer ${direction==='ascendance'?'l’ascendance':'la descendance'} fermée</button></div>`;
        const who=b.partner?`depuis le couple ${escapeHtml(personName(b.person||{}))} et ${escapeHtml(personName(b.partner))}`:'';
        return `<div class="branch-status is-closed certainty-${escapeHtml(b.certainty)}"><strong>⊘ ${direction==='ascendance'?'Ascendance':'Descendance'} fermée</strong> · ${escapeHtml(b.certainty_label||branchCertainties[b.certainty]||'')}${b.reason_label?` · ${escapeHtml(b.reason_label)}`:''}${who?` <small>(${who})</small>`:''}${b.note?`<p>${escapeHtml(b.note)}</p>`:''}<button type="button" class="button small secondary" data-close-branch="${direction}" data-branch-id="${b.id}">Modifier</button></div>`;
    }
    /** Remplit les blocs Ascendants / Descendants de la fiche affichée (après son affichage). */
    async function fillLineageBlocks(detail){
        const boxes=$$('[data-lineage-block]');if(!boxes.length)return;
        const personId=detail.person.id;const s=lineageSettings(personId);
        let data;try{data=await loadLineage(personId,s.asc,s.desc);}catch(error){boxes.forEach(box=>{box.innerHTML=`<small class="muted">${escapeHtml(error.message)}</small>`;});return;}
        if(Number(state.currentPersonId)!==Number(personId))return;
        boxes.forEach(box=>{const kind=box.dataset.lineageBlock;
            box.innerHTML=`${kind==='desc'?branchStatusHtml(detail.person,'descendance',detail.closed_branches||[]):''}${kind==='asc'?ascendantsTreeHtml(data):descendantsTreeHtml(data)}${data.truncated?'<small class="muted">Arbre très grand : affichage limité.</small>':''}`;});
        bindTableLinks();
        $$('[data-close-branch]').forEach(button=>button.addEventListener('click',()=>openClosedBranchDialog(detail,button.dataset.closeBranch,Number(button.dataset.branchId)||0)));
    }
    function bindLineageDepthControls(detail){
        $$('[data-lineage-depth]').forEach(select=>select.addEventListener('change',()=>{
            const personId=detail.person.id;const exception=lineageHasException(personId);const s=lineageSettings(personId);
            s[select.dataset.lineageDepth]=Number(select.value);saveLineageSettings(s,exception?personId:0);
            toast(exception?'Réglage enregistré pour cette fiche.':'Réglage enregistré pour toutes les fiches (exception possible dans Maintenance → Apparence).');
            fillLineageBlocks(detail);}));
    }
    /** Déclarer une branche fermée (depuis la personne ou le couple), avec un degré de certitude. */
    async function openClosedBranchDialog(detail,direction,branchId=0){
        const existing=(detail.closed_branches||[]).find(b=>Number(b.id)===branchId);
        const partners=detail.partners||[];
        const dialog=document.createElement('dialog');dialog.className='modal small-modal';
        dialog.innerHTML=`<form method="dialog" class="closed-branch-form"><div class="modal-head"><div><span class="eyebrow">BRANCHE FERMÉE</span><h2>${direction==='ascendance'?'Ascendance':'Descendance'} de ${escapeHtml(personName(detail.person))}</h2><p>${direction==='ascendance'?'Il n’y a plus d’ancêtres à trouver au-delà (enfant naturel, registres perdus…).':'La lignée s’arrête : plus de descendants à chercher.'}</p></div><button class="icon-button" type="button" data-cb-cancel aria-label="Fermer">×</button></div>
            <div class="form-grid one-column">
            ${direction==='descendance'&&partners.length?`<label>Depuis<select name="partner_id"><option value="">${escapeHtml(personName(detail.person))} seul(e)</option>${partners.map(p=>`<option value="${p.id}" ${Number(existing?.partner_id)===Number(p.id)?'selected':''}>Le couple avec ${escapeHtml(personName(p))}</option>`).join('')}</select></label>`:''}
            <label>Degré de certitude<select name="certainty">${Object.entries(branchCertainties).map(([k,l])=>`<option value="${k}" ${(existing?.certainty||'likely')===k?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select></label>
            <label>Raison<select name="reason"><option value="">—</option>${Object.entries(branchReasons).filter(([k])=>direction==='ascendance'?!['extinct','no_children'].includes(k):!['unknown_father','foundling','no_more_records'].includes(k)).map(([k,l])=>`<option value="${k}" ${existing?.reason===k?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select></label>
            <label>Note (ce qui a été cherché, où, quand)<textarea name="note" rows="4">${escapeHtml(existing?.note||'')}</textarea></label></div>
            <div class="page-actions action-zone"><button class="button" type="submit">Enregistrer</button>${existing?'<button class="button secondary danger" type="button" data-cb-reopen>Rouvrir la branche</button>':''}<button class="button secondary" type="button" data-cb-cancel>Annuler</button></div></form>`;
        document.body.append(dialog);dialog.showModal();
        const close=()=>{dialog.close();dialog.remove();};
        $$('[data-cb-cancel]',dialog).forEach(b=>b.addEventListener('click',close));
        const refresh=async result=>{detail.closed_branches=result.result.branches||[];clearLineageCache();close();await fillLineageBlocks(detail);};
        $('[data-cb-reopen]',dialog)?.addEventListener('click',async()=>{if(!await confirmBox('Elle ne sera plus marquée fermée.',{title:'Rouvrir cette branche ?',okLabel:'Rouvrir la branche',danger:false}))return;try{await refresh(await api('delete_closed_branch',{}, {method:'POST',body:{id:existing.id}}));toast('Branche rouverte.');}catch(error){toast(error.message,'error');}});
        $('form',dialog).addEventListener('submit',async event=>{event.preventDefault();const v=formObject(event.currentTarget);
            try{await refresh(await api('save_closed_branch',{}, {method:'POST',body:{person_id:detail.person.id,direction,partner_id:v.partner_id||'',certainty:v.certainty,reason:v.reason,note:v.note}}));toast('Branche enregistrée comme fermée.');}catch(error){toast(error.message,'error');}});
    }
    /** Listes → Branches fermées */
    async function renderClosedBranchesList(token){
        const data=await api('closed_branches');if(token!==state.workspaceToken||state.module!=='listes')return;
        const rows=(data.branches||[]).filter(r=>r.direction==='descendance');
        $('#workspace').innerHTML=`<section class="page collection-page"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>Branches fermées</h2><p>Les lignées déclarées éteintes (plus de descendants à chercher), avec leur degré de certitude. Pour en ajouter une : sur la fiche, bloc « Descendants ».</p></div></header>
            ${rows.length?`<table class="data-table"><thead><tr><th>Depuis</th><th>Certitude</th><th>Raison</th><th>Note</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${personChip(r.person)}${r.partner?` et ${personChip(r.partner)}`:''}</td><td><span class="branch-closed-badge certainty-${escapeHtml(r.certainty)}">${escapeHtml(r.certainty_label)}</span></td><td>${escapeHtml(r.reason_label||'—')}</td><td><small>${escapeHtml(r.note||'')}</small></td></tr>`).join('')}</tbody></table>`:empty('Aucune branche fermée pour l’instant.',{icon:'🌿',hint:'Une branche fermée est une lignée qu’on ne peut plus remonter (archives détruites, enfant trouvé…).'})}</section>`;
        bindTableLinks();
    }
    /** Widget « Ascendants / descendants » : personne choisie ou dernière fiche, sens et générations réglés au crayon. */
    function dashboardLineageCard(index,widget,spanClass,personId){
        const dir=widget.config?.lineageDirection||'desc';const title=dir==='asc'?'Ascendants':(dir==='both'?'Ascendants et descendants':'Descendants');
        if(!personId)return card(index,title,'',empty(widget.config?.personMode==='specific'?'Choisis une personne avec le crayon.':'Ouvre une fiche : elle apparaîtra ici.',{icon:'👤'}),spanClass);
        return card(index,title,'',`<div data-lineage-widget="${escapeHtml(widget.id)}" data-person="${personId}" data-dir="${escapeHtml(dir)}" data-asc="${Number(widget.config?.lineageAsc)||3}" data-desc="${Number(widget.config?.lineageDesc)||2}"><small class="muted">Chargement…</small></div>`,spanClass);
    }
    async function fillLineageWidgets(){
        for(const box of $$('[data-lineage-widget]')){
            const dir=box.dataset.dir;const asc=dir==='desc'?0:Number(box.dataset.asc);const desc=dir==='asc'?0:Number(box.dataset.desc);
            try{const data=await loadLineage(Number(box.dataset.person),asc||0,desc||0);const p=data.people?.[data.root];
                box.innerHTML=`<p class="web-search-person">${lineagePersonHtml(p)}</p>${dir!=='desc'?`<h4 class="lineage-widget-title">Ascendants</h4>${ascendantsTreeHtml(data)}`:''}${dir!=='asc'?`<h4 class="lineage-widget-title">Descendants</h4>${descendantsTreeHtml(data)}`:''}`;
            }catch(error){box.innerHTML=`<small class="muted">${escapeHtml(error.message)}</small>`;}
        }
        bindTableLinks();
    }
    function lineageSettingsEditor(id,title,s,personId=0){
        return `<section class="maintenance-panel order-editor block-order-editor"><div class="item-title-row"><h3>${escapeHtml(title)}</h3>${personId?`<button class="button small secondary" type="button" data-reset-lineage="${personId}">Annuler l’exception</button>`:''}</div>
            <div class="form-grid" id="${id}"><label>Ascendants${`<select name="asc">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===s.asc?'selected':''}>${escapeHtml(generationLabel(n,'asc'))}</option>`).join('')}</select>`}</label><label>Descendants<select name="desc">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===s.desc?'selected':''}>${escapeHtml(generationLabel(n,'desc'))}</option>`).join('')}</select></label></div>
            <div class="page-actions action-zone"><button class="button small" type="button" data-lineage-save="${id}" data-lineage-person="${personId}">Enregistrer</button></div></section>`;
    }
    function bindLineageSettingsEditors(root=document){
        $$('[data-lineage-save]',root).forEach(b=>b.addEventListener('click',()=>{const box=document.getElementById(b.dataset.lineageSave);saveLineageSettings({asc:Number(box.querySelector('[name=asc]').value),desc:Number(box.querySelector('[name=desc]').value)},Number(b.dataset.lineagePerson)||0);clearLineageCache();toast('Générations enregistrées.');}));
        $$('[data-reset-lineage]',root).forEach(b=>b.addEventListener('click',()=>{localStorage.removeItem(`genealogie-lineage-${b.dataset.resetLineage}`);toast('Exception retirée : la fiche suit le réglage de toutes les fiches.');renderDesignTools();}));
    }
    /** Maintenance → Fusionner un arbre : comparer le GEDCOM d'un cousin à la base, puis décider fiche par fiche. */
    function mergePersonText(p){if(!p)return '';const yrs=(p.birth||p.death)?` (${p.birth||'?'}–${p.death||'?'})`:'';return `${[p.first_name,p.last_name].filter(Boolean).join(' ')||'Sans nom'}${yrs}`;}
    function renderMergeTool(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='fusion')return;
        const m=state.merge;
        if(!m){
            $('#workspace').innerHTML=`<section class="page merge-page"><header class="page-header"><div><span class="eyebrow">FUSIONNER UN ARBRE</span><h2>Fusionner l’arbre d’un cousin</h2><p>Un cousin t’envoie son GEDCOM ? Le logiciel le compare à ta base <b>avant</b> de l’importer et te propose, fiche par fiche : « C’est la même personne : compléter la mienne », « Nouvelle personne : l’ajouter » ou « Ignorer ». Rien n’est modifié avant ta confirmation, et une copie de sécurité de ta base est faite juste avant.</p></div></header>
                <form id="merge-upload" class="maintenance-panel"><div class="form-grid"><label>Fichier GEDCOM reçu (.ged)<input type="file" name="file" accept=".ged,.gedcom" required></label><label>De qui vient cet arbre ?<input name="origin" placeholder="Arbre de cousin Paul" maxlength="80"></label></div><div class="page-actions"><button class="button" type="submit">Comparer avec ma base</button></div><p id="merge-status" class="muted"></p></form></section>`;
            $('#merge-upload').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const file=form.elements.file.files[0];if(!file)return;
                $('#merge-status').textContent='Comparaison en cours… (quelques secondes à une minute selon la taille)';
                const fd=new FormData();fd.append('file',file);fd.append('csrf',state.csrf);
                try{const resp=await fetch('api.php?action=merge_gedcom_analyse',{method:'POST',headers:{'X-CSRF-Token':state.csrf},body:fd});const data=await resp.json();if(!resp.ok||data.error)throw new Error(data.error||'Erreur');
                    const decisions={};data.rows.forEach(r=>{decisions[r.id]=r.proposal==='same'?{action:'same',target:r.candidates[0].id}:(r.proposal==='new'?{action:'new'}:{action:r.candidates[0]?'same':'new',target:r.candidates[0]?.id||0,unsure:true});});
                    state.merge={...data,origin:form.elements.origin.value.trim()||file.name.replace(/\.[^.]+$/,''),decisions,filter:'check',page:0};renderMergeTool();
                }catch(error){$('#merge-status').textContent='';toast(error.message,'error');}});
            return;
        }
        const counts={same:0,new:0,ignore:0};m.rows.forEach(r=>{counts[m.decisions[r.id].action]++;});
        const filters=[['check',`À vérifier (${m.counts.check})`],['same',`Mêmes personnes proposées (${m.counts.same})`],['new',`Nouvelles (${m.counts.new})`],['all',`Tout (${m.rows.length})`]];
        const rows=m.rows.filter(r=>m.filter==='all'||r.proposal===m.filter);const per=60;const pages=Math.max(1,Math.ceil(rows.length/per));const page=Math.min(m.page,pages-1);
        const rowHtml=r=>{const d=m.decisions[r.id];const cands=r.candidates||[];
            return `<article class="merge-row merge-${escapeHtml(r.proposal)}" data-merge-row="${r.id}"><div class="merge-incoming"><span class="eyebrow">ARBRE REÇU</span><strong>${escapeHtml(mergePersonText(r.person))}</strong><small>${escapeHtml((r.person.events||[]).join(' · '))}</small></div>
                <div class="merge-choice"><label class="checkbox-line"><input type="radio" name="m${r.id}" value="ignore" ${d.action==='ignore'?'checked':''}> Ignorer</label><label class="checkbox-line"><input type="radio" name="m${r.id}" value="new" ${d.action==='new'?'checked':''}> Nouvelle personne : l’ajouter</label>
                ${cands.map(c=>`<label class="checkbox-line merge-candidate"><input type="radio" name="m${r.id}" value="same:${c.id}" ${d.action==='same'&&Number(d.target)===Number(c.id)?'checked':''}> Même personne que <button type="button" class="table-link" data-open-person="${c.id}">${escapeHtml(mergePersonText(c.person))}</button> <span class="merge-score">${c.score} %</span>${c.why?.length?`<small>${escapeHtml(c.why.join(', '))}</small>`:''}${c.against?.length?`<small class="merge-against">Différences : ${escapeHtml(c.against.join(', '))}</small>`:''}</label>`).join('')}
                ${r.missing?.length&&d.action==='same'?`<small class="merge-missing">Ajoutera à ta fiche : ${escapeHtml(r.missing.slice(0,5).join(' ; '))}</small>`:''}</div></article>`;};
        $('#workspace').innerHTML=`<section class="page merge-page"><header class="page-header"><div><span class="eyebrow">FUSIONNER UN ARBRE</span><h2>${escapeHtml(m.origin)} : ${plural(m.rows.length,'personne')}</h2><p>Vérifie surtout « À vérifier » : le logiciel a trouvé une ressemblance sans en être sûr. Les fiches « même personne » sont complétées (événements, lieux, notes qui manquent chez toi) ; rien de ta fiche n’est effacé ni remplacé.</p></div></header>
            <div class="merge-summary maintenance-panel"><span><b>${counts.same}</b> à compléter</span><span><b>${counts.new}</b> à ajouter</span><span><b>${counts.ignore}</b> ignorées</span><div class="page-actions"><button class="button" type="button" id="merge-apply">Fusionner</button><button class="button secondary" type="button" id="merge-cancel">Abandonner</button></div></div>
            <div class="segmented merge-filters">${filters.map(([k,l])=>`<button type="button" data-merge-filter="${k}" class="${m.filter===k?'is-active':''}">${escapeHtml(l)}</button>`).join('')}</div>
            <div class="merge-bulk"><button type="button" class="button small secondary" data-merge-bulk="new">Tout ce qui est affiché : nouvelles personnes</button><button type="button" class="button small secondary" data-merge-bulk="ignore">Tout ce qui est affiché : ignorer</button><button type="button" class="button small secondary" data-merge-bulk="proposal">Revenir aux propositions</button></div>
            <div class="merge-list">${rows.slice(page*per,(page+1)*per).map(rowHtml).join('')||empty('Rien dans cette catégorie.',{icon:'📭'})}</div>
            ${pages>1?`<div class="page-actions merge-pages">${Array.from({length:pages},(_,i)=>`<button type="button" class="button small ${i===page?'':'secondary'}" data-merge-page="${i}">${i+1}</button>`).join('')}</div>`:''}</section>`;
        $$('[data-merge-row] input[type=radio]').forEach(input=>input.addEventListener('change',()=>{const id=input.closest('[data-merge-row]').dataset.mergeRow;const [action,target]=input.value.split(':');m.decisions[id]={action,target:Number(target)||0};renderMergeTool();}));
        $$('[data-merge-filter]').forEach(b=>b.addEventListener('click',()=>{m.filter=b.dataset.mergeFilter;m.page=0;renderMergeTool();}));
        $$('[data-merge-page]').forEach(b=>b.addEventListener('click',()=>{m.page=Number(b.dataset.mergePage);renderMergeTool();$('#workspace').scrollTop=0;}));
        $$('[data-merge-bulk]').forEach(b=>b.addEventListener('click',()=>{rows.forEach(r=>{if(b.dataset.mergeBulk==='proposal'){m.decisions[r.id]=r.proposal==='new'||!r.candidates[0]?{action:'new'}:{action:'same',target:r.candidates[0].id};}else m.decisions[r.id]={action:b.dataset.mergeBulk};});renderMergeTool();}));
        $('#merge-cancel').addEventListener('click',async()=>{if(await confirmBox('Rien n’a été modifié dans ta base.',{title:'Abandonner cette fusion ?',okLabel:'Abandonner la fusion',cancelLabel:'Continuer la fusion',danger:true})){state.merge=null;renderMergeTool();}});
        $('#merge-apply').addEventListener('click',async event=>{
            const applyButton=event.currentTarget;
            if(!await confirmBox(`${counts.same<2?`${plural(counts.same,'fiche')} sera complétée`:`${plural(counts.same,'fiche')} seront complétées`}, ${counts.new<2?`${plural(counts.new,'personne')} ajoutée`:`${plural(counts.new,'personne')} ajoutées`}, ${plural(counts.ignore,'ignorée')}.\nUne copie de sécurité de ta base est faite juste avant.`,{title:'Fusionner maintenant ?',okLabel:'Fusionner',danger:false}))return;
            applyButton.disabled=true;
            try{const result=await api('merge_gedcom_apply',{}, {method:'POST',body:{token:m.token,origin:m.origin,decisions:m.decisions}});const s=result.stats;state.merge=null;clearLineageCache();
                $('#workspace').innerHTML=`<section class="page merge-page"><header class="page-header"><div><span class="eyebrow">FUSION TERMINÉE</span><h2>L’arbre a été fusionné</h2><p>${plural(s.added,'personne ajoutée','personnes ajoutées')}, ${plural(s.completed,'fiche complétée','fiches complétées')}${s.unchanged?` (${plural(s.unchanged,'autre')} déjà à jour)`:''}, ${plural(s.events,'événement')}, ${plural(s.families,'famille')} et ${plural(s.children_links,'lien parent-enfant','liens parent-enfant')} ajoutés, ${plural(s.notes,'note')}. Les personnes concernées portent l’étiquette « ${escapeHtml(result.label)} ». Copie de sécurité faite avant : ${escapeHtml(result.backup)}.</p></div></header><div class="page-actions"><button class="button" type="button" data-open-list="labels">Voir les étiquettes</button><button class="button secondary" type="button" id="merge-again">Fusionner un autre arbre</button></div></section>`;
                $('#merge-again').addEventListener('click',()=>renderMergeTool());toast('Fusion terminée.');
            }catch(error){applyButton.disabled=false;toast(error.message,'error');}});
        bindTableLinks();
    }
    function investigationFolderPath(folders,folderId){const path=[];let current=folders.find(folder=>Number(folder.id)===Number(folderId));while(current){path.unshift(current);current=folders.find(folder=>Number(folder.id)===Number(current.parent_id));}return path;}

    /* 🛠️ Maintenance : dans app-maintenance.js (chargé juste après app.js) ; ici, des relais. */
    async function renderMaintenance(...a){const f=await appPartReady('renderMaintenance');if(f)return f(...a);$('#workspace').innerHTML=empty('La maintenance n’a pas pu se charger (fichier app-maintenance.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderMaintenanceSidebar(...a){const f=appPart('renderMaintenanceSidebar');if(f)return f(...a);}
    // Listes → « Réordonner » (en bas à gauche) : l'ordre des listes du menu de gauche
    function openListReorderDialog(){const hidden=listHiddenKeys();const all=orderedListTypes(true).map(([key,,label])=>({key,label,hidden:hidden.includes(key)}));return openSideReorderDialog({eyebrow:'LISTES',title:'Réordonner les listes',canHide:true,rows:all,defaults:defaultListTypes.map(([key,,label])=>({key,label,hidden:false})),save:rows=>{if(rows.every(r=>r.hidden)){toast('Garde au moins une liste visible.','error');return false;}try{localStorage.setItem('genealogie-list-order',JSON.stringify(rows.map(r=>r.key)));localStorage.setItem('genealogie-list-hidden',JSON.stringify(rows.filter(r=>r.hidden).map(r=>r.key)));}catch(_){}toast('Ordre et listes affichées enregistrés.');}});}
    function openSideReorderDialog({eyebrow,title,rows,defaults,save,canHide=false}){
        const dialog=document.createElement('dialog');dialog.className='modal dashboard-reorder-dialog';
        dialog.innerHTML=`<div class="modal-head"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2><p>Glisse une ligne, ou utilise ses flèches${canHide?', clique sur l’œil pour cacher ou montrer':''}, puis Enregistrer.</p></div><button class="icon-button" type="button" data-close aria-label="Fermer">×</button></div>
            <div class="dash-reorder-tools"><button type="button" class="button small secondary" data-reset>↺ Remettre comme au départ</button></div>
            <ol class="dashboard-reorder-list" data-dnd-off></ol><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close>Annuler</button><button class="button" type="button" data-save>Enregistrer</button></div>`;
        const list=$('.dashboard-reorder-list',dialog);
        const draw=()=>{list.innerHTML=rows.map((r,i)=>`<li class="dashboard-reorder-row${r.hidden?' is-hidden-row':''}" draggable="true" data-index="${i}"><span class="order-grip" aria-hidden="true">⠿</span><span class="order-number">${String(i+1).padStart(2,'0')}</span><b style="flex:1">${escapeHtml(r.label)}</b><span class="order-actions">${canHide?`<button type="button" class="button small secondary reorder-eye" data-eye aria-pressed="${r.hidden?'false':'true'}" title="${r.hidden?'Cachée : clique pour la montrer':'Affichée : clique pour la cacher'}">${r.hidden?'🙈 Cachée':'👁 Affichée'}</button>`:''}<button type="button" class="button small secondary" data-move="-1" aria-label="Monter" ${i?'':'disabled'}>↑</button><button type="button" class="button small secondary" data-move="1" aria-label="Descendre" ${i<rows.length-1?'':'disabled'}>↓</button></span></li>`).join('');};
        document.body.append(dialog);draw();
        let dragFrom=-1;
        list.addEventListener('click',e=>{const row=e.target.closest('[data-index]');if(!row)return;const i=Number(row.dataset.index);if(e.target.closest('[data-eye]')){rows[i].hidden=!rows[i].hidden;draw();list.querySelector(`[data-index="${i}"] [data-eye]`)?.focus();return;}const mv=e.target.closest('[data-move]');if(mv){const j=i+Number(mv.dataset.move);if(j<0||j>=rows.length)return;[rows[i],rows[j]]=[rows[j],rows[i]];draw();list.querySelector(`[data-index="${j}"] [data-move="${mv.dataset.move}"]`)?.focus();}});
        list.addEventListener('dragstart',e=>{if(e.target.closest('button'))return;const row=e.target.closest('[data-index]');if(!row)return;dragFrom=Number(row.dataset.index);row.classList.add('is-dragging');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','m');}catch(_){}});
        list.addEventListener('dragover',e=>{if(dragFrom<0)return;e.preventDefault();$$('.is-drop-target',list).forEach(r=>r.classList.remove('is-drop-target'));e.target.closest('[data-index]')?.classList.add('is-drop-target');});
        list.addEventListener('drop',e=>{e.preventDefault();const row=e.target.closest('[data-index]');if(!row||dragFrom<0)return;const to=Number(row.dataset.index);const [moved]=rows.splice(dragFrom,1);rows.splice(to,0,moved);dragFrom=-1;draw();});
        list.addEventListener('dragend',()=>{dragFrom=-1;$$('.is-dragging,.is-drop-target',list).forEach(r=>r.classList.remove('is-dragging','is-drop-target'));});
        $('[data-reset]',dialog).addEventListener('click',()=>{rows=defaults.map(r=>({...r,label:rows.find(x=>x.key===r.key)?.label||r.label}));draw();});
        const close=()=>{dialog.close();dialog.remove();};
        $$('[data-close]',dialog).forEach(b=>b.addEventListener('click',close));
        $('[data-save]',dialog).addEventListener('click',()=>{if(save(rows)===false)return;close();renderSidebar();if(state.module==='maintenance'&&DESIGN_TABS.includes(state.maintenanceTab))renderDesignTools();});
        dialog.addEventListener('cancel',e=>{if(e.target!==dialog)return;e.preventDefault();close();});
        dialog.showModal();
    }

    /* 🏛️ Pièce d'archives et 🎲 jeu : dans app-piece-archives.js et app-jeu.js (chargés juste après ce fichier) ; ici, des relais */
    const appPart = name => window.LCNDA_PARTS?.[name];
    const appPartReady = name => new Promise(ok => { const t0 = Date.now(); const tick = () => (appPart(name) || Date.now() - t0 > 15000) ? ok(appPart(name)) : setTimeout(tick, 30); tick(); });
    function openArchiveRoom(...a){const f=appPart('openArchiveRoom');if(f)return f(...a);toast('La pièce d’archives se charge…');}
    async function renderGooseGame(...a){const f=await appPartReady('renderGooseGame');if(f)return f(...a);$('#workspace').innerHTML=empty('Le jeu n’a pas pu se charger (fichier app-jeu.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderGooseGameSidebar(...a){const f=appPart('renderGooseGameSidebar');if(f)return f(...a);}


    /* ⚖️ Comparaison : dans app-comparaison.js (chargé juste après app.js). */
    async function renderComparison(...a){const f=await appPartReady('renderComparison');if(f)return f(...a);$('#workspace').innerHTML=empty('La comparaison n’a pas pu se charger (fichier app-comparaison.js manquant ?).',{icon:'⚠️',hint:'Recharge la page ; si le problème continue, le fichier manque peut-être.'});}
    function renderComparisonSidebar(...a){const f=appPart('renderComparisonSidebar');if(f)return f(...a);}
    function setupComparisonImageZoom(...a){const f=appPart('setupComparisonImageZoom');if(f)return f(...a);}

    const calendarTypeOptions=[['gregorian','Grégorien'],['julian','Julien'],['republican','Républicain'],['islamic','Musulman civil'],['hebrew','Juif']];
    const republicanMonths=['Vendémiaire','Brumaire','Frimaire','Nivôse','Pluviôse','Ventôse','Germinal','Floréal','Prairial','Messidor','Thermidor','Fructidor','Jours complémentaires'];
    // Tous les calendriers : convertisseur et calendrier par défaut (les dates des fiches se saisissent dans les cinq premiers)
    const converterCalendarOptions=[...calendarTypeOptions,['ethiopic','Éthiopien'],['indian','Indien (national, ère Saka)'],['japanese','Japonais (ères, depuis 1873)'],['korean','Coréen (année Dangi)'],['korean_lunar','Coréen lunaire (traditionnel)'],['chinese','Chinois (lunaire)'],['bengali','Bengali (Bangladesh)'],['persian','Persan (hégirien solaire)'],['juche','Juche (Corée du Nord)'],['thai','Thaï (ère bouddhiste)'],['burmese','Birman (année)'],['druk','Bhoutanais drukpa (année)'],['coptic','Copte'],['byzantine','Byzantin (Anno Mundi, Russie avant 1700)'],['minguo','Minguo (Taïwan)'],['umalqura','Hégirien Umm al-Qura (Arabie saoudite)'],['roman','Romain (calendes, nones, ides)'],['english_os','Angleterre, ancien style (avant 1752)'],['easter_style','France, style de Pâques (avant 1567)'],['spanish_era','Ère d’Espagne'],['maya','Compte long maya']];
    function calendarLabel(value){return (converterCalendarOptions.find(([key])=>key===value)||calendarTypeOptions[0])[1];}
    // « Calendrier de cette date » (événement, média, visionneuse d'images) : tous les calendriers du convertisseur
    document.querySelectorAll('select[name="date_calendar"], #lightbox-date-calendar').forEach(select=>{const value=select.value;select.innerHTML=converterCalendarOptions.map(([key,label])=>`<option value="${key}">${escapeHtml(label)}</option>`).join('');select.value=value||'gregorian';});
    function defaultCalendarValue(design){return converterCalendarOptions.some(([key])=>key===design?.defaultCalendar)?design.defaultCalendar:'gregorian';}
    function gregorianToJdn(year,month,day){const a=Math.floor((14-month)/12),y=year+4800-a,m=month+12*a-3;return day+Math.floor((153*m+2)/5)+365*y+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400)-32045;}
    function jdnToGregorian(jdn){const a=jdn+32044,b=Math.floor((4*a+3)/146097),c=a-Math.floor(146097*b/4),d=Math.floor((4*c+3)/1461),e=c-Math.floor(1461*d/4),m=Math.floor((5*e+2)/153);return {year:100*b+d-4800+Math.floor(m/10),month:m+3-12*Math.floor(m/10),day:e-Math.floor((153*m+2)/5)+1};}
    function julianToJdn(year,month,day){const a=Math.floor((14-month)/12),y=year+4800-a,m=month+12*a-3;return day+Math.floor((153*m+2)/5)+365*y+Math.floor(y/4)-32083;}
    function jdnToJulian(jdn){const c=jdn+32082,d=Math.floor((4*c+3)/1461),e=c-Math.floor(1461*d/4),m=Math.floor((5*e+2)/153);return {year:d-4800+Math.floor(m/10),month:m+3-12*Math.floor(m/10),day:e-Math.floor((153*m+2)/5)+1};}
    function islamicToJdn(year,month,day){return day+Math.ceil(29.5*(month-1))+(year-1)*354+Math.floor((3+11*year)/30)+1948440-1;} // 1er mouharram an 1 = vendredi 16 juillet 622 (julien)
    function jdnToIslamic(jdn){const year=Math.floor((30*(jdn-1948440)+10646)/10631),month=Math.min(12,Math.max(1,Math.ceil((jdn-(29+islamicToJdn(year,1,1)))/29.5)+1)),day=jdn-islamicToJdn(year,month,1)+1;return {year,month,day};}
    function republicanLeap(year){return [3,7,11].includes(year);}
    function republicanYearDays(year){return republicanLeap(year)?366:365;}
    function republicanToJdn(year,month,day){let days=0;for(let y=1;y<year;y++)days+=republicanYearDays(y);return gregorianToJdn(1792,9,22)+days+(month-1)*30+day-1;}
    function jdnToRepublican(jdn){const epoch=gregorianToJdn(1792,9,22);if(jdn<epoch)return null;let days=jdn-epoch,year=1;while(days>=republicanYearDays(year)){days-=republicanYearDays(year);year++;if(year>20)return null;}const month=Math.floor(days/30)+1,day=days%30+1;if(month>13||month===13&&day>(republicanLeap(year)?6:5))return null;return {year,month,day};}
    function formatCalendarDate(date){return `${String(date.day).padStart(2,'0')}/${String(date.month).padStart(2,'0')}/${date.year}`;}
    function formatRepublicanDate(date){return date?`${date.day} ${republicanMonths[date.month-1]} an ${date.year}`:'Hors période républicaine officielle';}
    // Calendrier juif (calcul arithmétique de Reingold et Dershowitz) : mois numérotés depuis Nissan (1) ; l'année commence en Tichri (7) ; Adar II (13) les années embolismiques
    const hebrewMonthNames=['Nissan','Iyar','Sivan','Tamouz','Av','Eloul','Tichri','Heshvan','Kislev','Tevet','Chevat','Adar','Adar II'];
    const HEBREW_EPOCH_RD=-1373427,RD_TO_JDN=1721425;
    function hebrewLeap(year){return ((7*year+1)%19+19)%19<7;}
    function hebrewElapsedDays(year){const months=Math.floor((235*year-234)/19),parts=12084+13753*months,day=29*months+Math.floor(parts/25920);return (3*(day+1))%7<3?day+1:day;}
    function hebrewNewYearRd(year){const ny0=hebrewElapsedDays(year-1),ny1=hebrewElapsedDays(year),ny2=hebrewElapsedDays(year+1);return HEBREW_EPOCH_RD+ny1+(ny2-ny1===356?2:ny1-ny0===382?1:0);}
    function hebrewYearDays(year){return hebrewNewYearRd(year+1)-hebrewNewYearRd(year);}
    function hebrewMonthDays(month,year){const len=hebrewYearDays(year);if([2,4,6,10,13].includes(month)||(month===12&&!hebrewLeap(year))||(month===8&&![355,385].includes(len))||(month===9&&[353,383].includes(len)))return 29;return 30;}
    function hebrewMonthName(month,year){return month===12&&hebrewLeap(year)?'Adar I':hebrewMonthNames[month-1];}
    function hebrewToJdn(year,month,day){
        const last=hebrewLeap(year)?13:12;
        if(month<1||month>last||day<1||day>hebrewMonthDays(month,year))return null;
        let rd=hebrewNewYearRd(year)+day-1;
        if(month<7){for(let m=7;m<=last;m++)rd+=hebrewMonthDays(m,year);for(let m=1;m<month;m++)rd+=hebrewMonthDays(m,year);}
        else for(let m=7;m<month;m++)rd+=hebrewMonthDays(m,year);
        return rd+RD_TO_JDN;
    }
    function jdnToHebrew(jdn){
        const rd=jdn-RD_TO_JDN;
        let year=Math.floor((rd-HEBREW_EPOCH_RD)/(35975351/98496))+1;
        while(hebrewNewYearRd(year)>rd)year--;
        while(hebrewNewYearRd(year+1)<=rd)year++;
        let month=rd<hebrewToJdn(year,1,1)-RD_TO_JDN?7:1;
        while(rd>hebrewToJdn(year,month,hebrewMonthDays(month,year))-RD_TO_JDN)month++;
        return {year,month,day:rd-(hebrewToJdn(year,month,1)-RD_TO_JDN)+1};
    }
    function hebrewDateFromJdn(jdn){if(!jdn||jdn<HEBREW_EPOCH_RD+RD_TO_JDN)return '';const h=jdnToHebrew(jdn);return `${h.day} ${hebrewMonthName(h.month,h.year)} ${h.year}`;}
    // Les mois dans l'ordre de l'année (de Tichri à Eloul), pour les listes déroulantes
    function parseHebrewDateText(text){
        const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
        const m=fold(text).match(/^(\d{1,2})(?: er)? ([a-z]+(?: (?:i|ii|1|2|bet|beth|aleph))?) (\d{3,4})$/);
        if(!m)return null;
        const alias={nissan:1,nisan:1,iyar:2,iyyar:2,sivan:3,tamouz:4,tammouz:4,tammuz:4,av:5,ab:5,eloul:6,elul:6,tichri:7,tishri:7,tisri:7,heshvan:8,hechvan:8,cheshvan:8,marheshvan:8,kislev:9,tevet:10,teveth:10,tebet:10,chevat:11,shevat:11,shvat:11,adar:12,'adar i':12,'adar 1':12,'adar aleph':12,'adar ii':13,'adar 2':13,'adar bet':13,'adar beth':13};
        const month=alias[m[2]];
        return month?{day:Number(m[1]),month,year:Number(m[3])}:null;
    }
    // Période grégorienne d'un mois républicain (« du 22 sept. 1793 au 21 oct. 1793 »)
    /* ── Autres calendriers du convertisseur : éthiopien, indien (Saka), japonais (ères), coréen (Dangi et lunaire) ── */
    // Éthiopien : 13 mois (12 × 30 jours + Pagumé de 5 ou 6 jours), an 1 = 8 de notre ère (calcul exact)
    const ethiopicMonths=['Meskerem','Tikimt','Hidar','Tahsas','Tir','Yekatit','Megabit','Miyazya','Ginbot','Sene','Hamle','Nehasé','Pagumé'];
    const ETHIOPIC_EPOCH=1724221;
    function ethiopicToJdn(year,month,day){return ETHIOPIC_EPOCH-1+365*(year-1)+Math.floor(year/4)+30*(month-1)+day;}
    function jdnToEthiopic(jdn){const year=Math.floor((4*(jdn-ETHIOPIC_EPOCH)+1463)/1461),month=Math.floor((jdn-ethiopicToJdn(year,1,1))/30)+1;return {year,month,day:jdn-ethiopicToJdn(year,month,1)+1};}
    // Indien (calendrier national, ère Saka) : l'an commence le 22 mars (21 les années bissextiles), an Saka = année grégorienne − 78
    const indianMonths=['Chaitra','Vaishakha','Jyeshtha','Ashadha','Shravana','Bhadra','Ashvin','Kartika','Agrahayana','Pausha','Magha','Phalguna'];
    const gregLeap=y=>y%4===0&&(y%100!==0||y%400===0);
    function indianMonthDays(year,month){return month===1?(gregLeap(year+78)?31:30):month<=6?31:30;}
    function indianToJdn(year,month,day){let jdn=gregorianToJdn(year+78,3,gregLeap(year+78)?21:22);for(let m=1;m<month;m++)jdn+=indianMonthDays(year,m);return jdn+day-1;}
    function jdnToIndian(jdn){const g=jdnToGregorian(jdn);let year=g.year-78;if(jdn<indianToJdn(year,1,1))year--;let rest=jdn-indianToJdn(year,1,1),month=1;while(rest>=indianMonthDays(year,month)){rest-=indianMonthDays(year,month);month++;}return {year,month,day:rest+1};}
    // Japonais : calendrier grégorien depuis le 1er janvier 1873 (Meiji 6), les années comptées par ère
    const japaneseEras=[['meiji','Meiji 明治',[1868,10,23]],['taisho','Taishō 大正',[1912,7,30]],['showa','Shōwa 昭和',[1926,12,25]],['heisei','Heisei 平成',[1989,1,8]],['reiwa','Reiwa 令和',[2019,5,1]]];
    const JAPAN_GREGORIAN=gregorianToJdn(1873,1,1);
    function japaneseToJdn(era,year,month,day){const e=japaneseEras.find(x=>x[0]===era);if(!e)return null;const jdn=gregorianToJdn(e[2][0]+year-1,month,day);return jdn>=gregorianToJdn(...e[2])?jdn:null;}
    function jdnToJapanese(jdn){if(jdn<JAPAN_GREGORIAN)return null;let e=japaneseEras[0];japaneseEras.forEach(x=>{if(jdn>=gregorianToJdn(...x[2]))e=x;});const g=jdnToGregorian(jdn),y=g.year-e[2][0]+1;return {era:e,year:y,month:g.month,day:g.day};}
    // Coréen : année Dangi (an grégorien + 2333) ; date lunaire traditionnelle d'après le navigateur (calendrier « dangi »)
    // Date JavaScript à midi UTC d'un jour donné (Date.UTC lirait les années 0 à 99 comme 1900 à 1999)
    function utcNoon(g){const d=new Date(0);d.setUTCFullYear(g.year,g.month-1,g.day);d.setUTCHours(12);return d;}
    function koreanLunarParts(jdn,cal='dangi'){try{const g=jdnToGregorian(jdn),parts=new Intl.DateTimeFormat(`en-u-ca-${cal}`,{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'}).formatToParts(utcNoon(g));const get=t=>parts.find(p=>p.type===t)?.value||'';const monthText=get('month');return {year:Number(get('relatedYear'))||0,month:parseInt(monthText,10)||0,leap:/bis|leap/i.test(monthText),day:Number(get('day'))||0};}catch(_){return null;}}
    function koreanLunarToJdn(year,month,day,leap=false,cal='dangi'){const from=gregorianToJdn(year,1,1),to=gregorianToJdn(year+1,4,1);for(let j=from;j<to;j++){const k=koreanLunarParts(j,cal);if(k&&k.year===year&&k.month===month&&k.day===day&&k.leap===!!leap)return j;}return null;}
    function formatKoreanLunar(jdn){const k=koreanLunarParts(jdn);return k&&k.year?`${k.day} du ${k.month}${k.month===1?'er':'e'} mois${k.leap?' intercalaire':''} de l’année lunaire ${k.year} (Dangi ${k.year+2333})`:'Non disponible dans ce navigateur';}
    // Chinois : même calcul luni-solaire (calendrier « chinese » du navigateur), avec le nom de l'année (tronc céleste et animal)
    const zodiacAnimals=['Rat','Bœuf','Tigre','Lapin','Dragon','Serpent','Cheval','Chèvre','Singe','Coq','Chien','Cochon'];
    const zodiacElements=['Bois','Feu','Terre','Métal','Eau'];
    function sexagenaryName(lunarYear){const k=((lunarYear-4)%60+60)%60;return `${zodiacElements[Math.floor((k%10)/2)]}-${zodiacAnimals[k%12]}`;}
    function chineseYearHan(jdn){try{const g=jdnToGregorian(jdn);return new Intl.DateTimeFormat('zh-u-ca-chinese',{year:'numeric',timeZone:'UTC'}).formatToParts(utcNoon(g)).find(p=>p.type==='yearName')?.value||'';}catch(_){return '';}}
    function formatChineseLunar(jdn){const k=koreanLunarParts(jdn,'chinese');if(!k||!k.year)return 'Non disponible dans ce navigateur';const han=chineseYearHan(jdn);return `${k.day} du ${k.month}${k.month===1?'er':'e'} mois${k.leap?' intercalaire':''} de l’année ${k.year} ${han?`(${han}, `:'('}${sexagenaryName(k.year)})`;}
    // Bengali (calendrier révisé du Bangladesh, 2019) : l'an commence le 14 avril ; 6 mois de 31 jours, puis 30 ; Falgun 29 jours (30 les années bissextiles)
    const bengaliMonths=['Boishakh','Joishtho','Asharh','Srabon','Bhadro','Ashwin','Kartik','Ogrohayon','Poush','Magh','Falgun','Choitro'];
    function bengaliMonthDays(year,month){return month<=6?31:month===11?(gregLeap(year+594)?30:29):30;}
    function bengaliToJdn(year,month,day){let jdn=gregorianToJdn(year+593,4,14);for(let m=1;m<month;m++)jdn+=bengaliMonthDays(year,m);return jdn+day-1;}
    function jdnToBengali(jdn){const g=jdnToGregorian(jdn);let year=g.year-593;if(jdn<bengaliToJdn(year,1,1))year--;let rest=jdn-bengaliToJdn(year,1,1),month=1;while(rest>=bengaliMonthDays(year,month)){rest-=bengaliMonthDays(year,month);month++;}return {year,month,day:rest+1};}
    // Persan (hégirien solaire) : algorithme de Borkowski (années bissextiles réelles, Nouvel An à l'équinoxe de printemps)
    const persianMonths=['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
    const PERSIAN_BREAKS=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
    const idiv=(a,b)=>Math.trunc(a/b),imod=(a,b)=>a-Math.trunc(a/b)*b;
    function persianCal(jy){let leapJ=-14,jp=PERSIAN_BREAKS[0],jump=0;const gy=jy+621;for(let i=1;i<PERSIAN_BREAKS.length;i++){const jm=PERSIAN_BREAKS[i];jump=jm-jp;if(jy<jm)break;leapJ+=idiv(jump,33)*8+idiv(imod(jump,33),4);jp=jm;}let n=jy-jp;leapJ+=idiv(n,33)*8+idiv(imod(n,33)+3,4);if(imod(jump,33)===4&&jump-n===4)leapJ++;const leapG=idiv(gy,4)-idiv((idiv(gy,100)+1)*3,4)-150,march=20+leapJ-leapG;if(jump-n<6)n=n-jump+idiv(jump+4,33)*33;let leap=imod(imod(n+1,33)-1,4);if(leap===-1)leap=4;return {leap,gy,march};}
    function persianToJdn(jy,jm,jd){const r=persianCal(jy);return gregorianToJdn(r.gy,3,r.march)+(jm-1)*31-idiv(jm,7)*(jm-7)+jd-1;}
    function jdnToPersian(jdn){const gy=jdnToGregorian(jdn).year;let jy=gy-621;const r=persianCal(jy);let k=jdn-gregorianToJdn(gy,3,r.march);if(k>=0){if(k<=185)return {year:jy,month:1+idiv(k,31),day:imod(k,31)+1};k-=186;}else{jy--;k+=179;if(r.leap===1)k++;}return {year:jy,month:7+idiv(k,30),day:imod(k,30)+1};}
    function persianMonthDays(year,month){return month<=6?31:month<=11?30:(persianCal(year).leap===0?30:29);}
    // Juche (Corée du Nord) : an 1 = 1912, mois et jours grégoriens
    // Thaï (ère bouddhiste) : an grégorien + 543 ; jusqu'en 1940, l'année commençait le 1er avril
    const thaiMonths=['Makarakhom','Kumphaphan','Minakhom','Mesayon','Phruetsaphakhom','Mithunayon','Karakadakhom','Singhakhom','Kanyayon','Tulakhom','Phruetsachikayon','Thanwakhom'];
    function thaiYear(g){return g.year>=1941||g.month>=4?g.year+543:g.year+542;}
    function thaiToJdn(year,month,day){const greg=year-543;return gregorianToJdn(greg<1941&&month<4?greg+1:greg,month,day);}
    // Birman et bhoutanais (drukpa) : luni-solaires, on donne l'année
    function burmeseYear(g){return g.month>4||(g.month===4&&g.day>=17)?g.year-638:g.year-639;}
    // Copte (Égypte) : comme l'éthiopien, 276 ans plus tôt ; 13 mois (le dernier, Nasie, 5 ou 6 jours)
    const copticMonths=['Thout','Paopi','Hathor','Koiak','Tobi','Meshir','Paremhat','Parmouti','Pashons','Paoni','Epip','Mesori','Nasie'];
    const COPTIC_EPOCH=1825030;
    function copticToJdn(year,month,day){return COPTIC_EPOCH-1+365*(year-1)+Math.floor(year/4)+30*(month-1)+day;}
    function jdnToCoptic(jdn){const year=Math.floor((4*(jdn-COPTIC_EPOCH)+1463)/1461),month=Math.floor((jdn-copticToJdn(year,1,1))/30)+1;return {year,month,day:jdn-copticToJdn(year,month,1)+1};}
    // Hégirien Umm al-Qura (calendrier officiel de l'Arabie saoudite, d'après le navigateur)
    const hijriMonths=['Mouharram','Safar','Rabia al-awal','Rabia ath-thani','Joumada al-oula','Joumada ath-thania','Rajab','Chaabane','Ramadan','Chawwal','Dhou al-qi’da','Dhou al-hijja'];
    function formatUmmAlQura(jdn){try{const g=jdnToGregorian(jdn),p=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'}).formatToParts(utcNoon(g)),get=t=>Number(p.find(x=>x.type===t)?.value);return get('year')>0?`${get('day')} ${hijriMonths[get('month')-1]} ${get('year')}`:'—';}catch(_){return 'Non disponible dans ce navigateur';}}
    // Byzantin (Anno Mundi, création du monde en 5509 av. J.-C.) : jours et mois juliens, l'année commence le 1er septembre (Russie jusqu'en 1700)
    function byzantineYear(j){return j.month>=9?j.year+5509:j.year+5508;}
    function byzantineToJdn(year,month,day){return julianToJdn(month>=9?year-5509:year-5508,month,day);}
    const frenchMonthNames=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    // Angleterre, ancien style : julien jusqu'au 2 septembre 1752, l'année commençait le 25 mars (d'où « 10 février 1712/13 »)
    const BRITISH_REFORM=gregorianToJdn(1752,9,14);
    function englishOldStyle(jdn){if(jdn>=BRITISH_REFORM)return null;const j=jdnToJulian(jdn),before=j.year!==1752&&(j.month<3||(j.month===3&&j.day<25)); /* 1752 commence déjà au 1er janvier */return {...j,text:`${j.day===1?"1er":j.day} ${frenchMonthNames[j.month-1]} ${before?`${j.year-1}/${String(j.year).slice(-2)}`:j.year}`};}
    // France, style de Pâques : jusqu'à l'édit de Roussillon (appliqué en 1567), l'année commençait à Pâques
    function julianEaster(y){const a=y%4,b=y%7,c=y%19,d=(19*c+15)%30,e=(2*a+4*b-d+34)%7;return {month:Math.floor((d+e+114)/31),day:(d+e+114)%31+1};}
    function easterStyle(jdn){if(jdn>=julianToJdn(1567,1,1))return null;const j=jdnToJulian(jdn),e=julianEaster(j.year),year=jdn<julianToJdn(j.year,e.month,e.day)?j.year-1:j.year;return {...j,year,text:`${j.day===1?"1er":j.day} ${frenchMonthNames[j.month-1]} ${year}${year!==j.year?` (notre ${j.year})`:''}`,easter:`${e.day} ${frenchMonthNames[e.month-1]}`};}
    // Calendrier romain : calendes, nones et ides (actes en latin) ; julien avant la réforme de 1582
    const romanMonths=['Ian.','Feb.','Mart.','Apr.','Mai.','Iun.','Iul.','Aug.','Sept.','Oct.','Nov.','Dec.'];
    function toRoman(n){return [['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]].reduce((out,[r,v])=>{while(n>=v){out+=r;n-=v;}return out;},'');}
    function romanDate(jdn){
        const julianPeriod=jdn<gregorianToJdn(1582,10,15),d=julianPeriod?jdnToJulian(jdn):jdnToGregorian(jdn),m=d.month,day=d.day;
        const leap=julianPeriod?d.year%4===0:gregLeap(d.year),nones=[3,5,7,10].includes(m)?7:5,ides=nones+8,next=romanMonths[m%12];
        let text;
        if(day===1)text=`Kal. ${romanMonths[m-1]}`;
        else if(day<nones)text=day===nones-1?`prid. Non. ${romanMonths[m-1]}`:`a.d. ${toRoman(nones-day+1)} Non. ${romanMonths[m-1]}`;
        else if(day===nones)text=`Non. ${romanMonths[m-1]}`;
        else if(day<ides)text=day===ides-1?`prid. Id. ${romanMonths[m-1]}`:`a.d. ${toRoman(ides-day+1)} Id. ${romanMonths[m-1]}`;
        else if(day===ides)text=`Id. ${romanMonths[m-1]}`;
        else{
            const len=m===2?(leap?29:28):[4,6,9,11].includes(m)?30:31;
            if(m===2&&leap&&day===24)text=`a.d. bis VI Kal. Mart.`; // le jour « bissexte »
            else{const n=m===2&&leap&&day<24?30-day:len+2-day;text=n===2?`prid. Kal. ${next}`:`a.d. ${toRoman(n)} Kal. ${next}`;}
        }
        return {text,julianPeriod};
    }
    // Compte long maya (corrélation GMT, 584283)
    function mayaLongCount(jdn){let d=jdn-584283;if(d<0)return '';const out=[];for(const n of [144000,7200,360,20,1]){out.push(Math.floor(d/n));d%=n;}return out.join('.');}
    /** Jour julien d'une date (an, mois, jour) dans n'importe quel calendrier du convertisseur */
    function calendarYmdToJdn(type,year,month,day,{era='',leap=false}={}){
        if(!year||!month||!day)return null;
        if(type==='julian')return julianToJdn(year,month,day);
        if(type==='islamic')return islamicToJdn(year,month,day);
        if(type==='republican')return republicanToJdn(year,month,day);
        if(type==='hebrew')return hebrewToJdn(year,month,day);
        if(type==='ethiopic')return month>13||day>(month===13?(year%4===3?6:5):30)?null:ethiopicToJdn(year,month,day);
        if(type==='indian')return month>12||day>indianMonthDays(year,month)?null:indianToJdn(year,month,day);
        if(type==='japanese')return japaneseToJdn(era,year,month,day);
        if(type==='korean')return gregorianToJdn(year-2333,month,day);
        if(type==='korean_lunar')return koreanLunarToJdn(year,month,day,leap);
        if(type==='chinese')return koreanLunarToJdn(year,month,day,leap,'chinese');
        if(type==='bengali')return month>12||day>bengaliMonthDays(year,month)?null:bengaliToJdn(year,month,day);
        if(type==='persian')return month>12||day>persianMonthDays(year,month)?null:persianToJdn(year,month,day);
        if(type==='juche')return year<1?null:gregorianToJdn(year+1911,month,day);
        if(type==='thai')return thaiToJdn(year,month,day);
        if(type==='coptic')return month>13||day>(month===13?(year%4===3?6:5):30)?null:copticToJdn(year,month,day);
        if(type==='byzantine')return byzantineToJdn(year,month,day);
        if(type==='minguo')return year<1?null:gregorianToJdn(year+1911,month,day);
        return gregorianToJdn(year,month,day);
    }
    function parseNumericCalendarDate(text){
        const value=String(text||'').trim();
        let match=value.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{1,4})$/);
        if(match)return {day:Number(match[1]),month:Number(match[2]),year:Number(match[3])};
        match=value.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
        if(match)return {year:Number(match[1]),month:Number(match[2]),day:Number(match[3])};
        return null;
    }
    function romanToNumber(value){
        const map={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
        const clean=String(value||'').toUpperCase().replace(/[^IVXLCDM]/g,'');
        if(!clean)return null;
        let total=0,prev=0;
        for(let i=clean.length-1;i>=0;i--){const n=map[clean[i]]||0;total+=n<prev?-n:n;prev=Math.max(prev,n);}
        return total||null;
    }
    function parseRepublicanDateText(text){
        const value=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
        const monthMap={
            vendemiaire:1,vendémiaire:1,brumaire:2,frimaire:3,nivose:4,nivôse:4,pluviose:5,pluviôse:5,ventose:6,ventôse:6,
            germinal:7,floreal:8,floréal:8,prairial:9,messidor:10,thermidor:11,fructidor:12,
            complementaire:13,complementaires:13,sansculottides:13,'sans-culottides':13
        };
        const match=value.match(/^(\d{1,2})(?:er)?\s+([a-z-]+)\s+(?:an\s+)?([ivxlcdm]+|\d{1,2})$/i);
        if(!match)return null;
        const day=Number(match[1]),month=monthMap[match[2]],year=/^\d+$/.test(match[3])?Number(match[3]):romanToNumber(match[3]);
        return day&&month&&year?{day,month,year}:null;
    }
    function calendarDateFromText(text,type){
        if(type==='republican')return parseRepublicanDateText(text)||parseNumericCalendarDate(text);
        if(type==='hebrew')return parseHebrewDateText(text);
        return parseNumericCalendarDate(text)||parseFrenchDateText(text);
    }
    // « 15 juin 1950 », « 1er février 1825 » (sans « vers », « avant »… : une date approximative n'a pas d'équivalent exact)
    function parseFrenchDateText(text){
        const v=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
        const m=v.match(/^(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) (\d{1,4})$/);
        if(!m)return null;
        return {day:Number(m[1]),month:['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'].indexOf(m[2])+1,year:Number(m[3])};
    }
    function jdnFromCalendarDate(parsed,type){
        if(!parsed||!parsed.year||!parsed.month||!parsed.day||type==='gregorian')return '';
        let jdn=null;
        if(type==='julian')jdn=julianToJdn(parsed.year,parsed.month,parsed.day);
        if(type==='islamic')jdn=islamicToJdn(parsed.year,parsed.month,parsed.day);
        if(type==='republican')jdn=republicanToJdn(parsed.year,parsed.month,parsed.day);
        if(type==='hebrew')jdn=hebrewToJdn(parsed.year,parsed.month,parsed.day);
        // les autres calendriers du convertisseur (Maintenance → Calendrier / mesures), date écrite en chiffres
        if(jdn===null&&!['roman','english_os','easter_style','spanish_era','maya','umalqura','burmese','druk'].includes(type)){try{jdn=calendarYmdToJdn(type,parsed.year,parsed.month,parsed.day);}catch(_){jdn=null;}}
        return jdn||null;
    }
    function formatCalendarByType(jdn,type){
        if(!jdn)return '';
        if(type==='julian')return formatCalendarDate(jdnToJulian(jdn));
        if(type==='islamic')return formatCalendarDate(jdnToIslamic(jdn));
        if(type==='republican')return formatRepublicanDate(jdnToRepublican(jdn));
        if(type==='hebrew')return hebrewDateFromJdn(jdn);
        const g=jdnToGregorian(jdn);
        if(type==='ethiopic'){const e=jdnToEthiopic(jdn);return `${e.day} ${ethiopicMonths[e.month-1]} ${e.year}`;}
        if(type==='indian'){const i=jdnToIndian(jdn);return `${i.day} ${indianMonths[i.month-1]} ${i.year} (Saka)`;}
        if(type==='japanese'){const j=jdnToJapanese(jdn);return j?`${String(j.day).padStart(2,'0')}/${String(j.month).padStart(2,'0')}, an ${j.year} de l’ère ${j.era[1]}`:'avant 1873 (calendrier luni-solaire)';}
        if(type==='korean')return `${formatCalendarDate(g).slice(0,6)}${g.year+2333} (Dangi)`;
        if(type==='korean_lunar')return formatKoreanLunar(jdn);
        if(type==='chinese')return formatChineseLunar(jdn);
        if(type==='bengali'){const b=jdnToBengali(jdn);return `${b.day} ${bengaliMonths[b.month-1]} ${b.year}`;}
        if(type==='persian'){const pe=jdnToPersian(jdn);return `${pe.day} ${persianMonths[pe.month-1]} ${pe.year}`;}
        if(type==='juche')return g.year>=1912?`${formatCalendarDate(g).slice(0,6)}Juche ${g.year-1911}`:'avant 1912';
        if(type==='thai')return `${g.day} ${thaiMonths[g.month-1]} ${thaiYear(g)}`;
        if(type==='burmese')return `ère birmane ${burmeseYear(g)} (année seulement)`;
        if(type==='coptic'){const c=jdnToCoptic(jdn);return `${c.day} ${copticMonths[c.month-1]} ${c.year}`;}
        if(type==='byzantine'){const j=jdnToJulian(jdn);return `${j.day===1?"1er":j.day} ${frenchMonthNames[j.month-1]} ${byzantineYear(j)} AM`;}
        if(type==='minguo')return g.year>=1912?`${formatCalendarDate(g).slice(0,6)}Minguo ${g.year-1911}`:'avant 1912';
        if(type==='umalqura')return formatUmmAlQura(jdn);
        if(type==='roman')return romanDate(jdn).text;
        if(type==='english_os')return englishOldStyle(jdn)?.text||'après 1752 (nouveau style)';
        if(type==='easter_style')return easterStyle(jdn)?.text||'après 1567 (année au 1er janvier)';
        if(type==='spanish_era'){const j=jdnToJulian(jdn);return `ère ${j.year+38}`;}
        if(type==='maya')return mayaLongCount(jdn);
        if(type==='druk'){const k=koreanLunarParts(jdn,'chinese');return k?.year?`année ${sexagenaryName(k.year)} (année seulement)`:'';}
        return formatCalendarDate(g);
    }
    function defaultCalendarSetting(){
        try{return defaultCalendarValue(readDesignSettings());}catch(_){return 'gregorian';}
    }
    function automaticEquivalentFromDateText(text,sourceType,targetType=defaultCalendarSetting()){
        const parsed=calendarDateFromText(text,sourceType);
        if(!parsed)return '';
        const jdn=sourceType==='gregorian'?gregorianToJdn(parsed.year,parsed.month,parsed.day):jdnFromCalendarDate(parsed,sourceType);
        if(!jdn)return '';
        return `${calendarLabel(targetType)} : ${formatCalendarByType(jdn,targetType)}`;
    }
    function bindEventDateAlternative(){
        const form=$('#event-form');
        if(!form||form.dataset.dateAlternativeBound)return;
        form.dataset.dateAlternativeBound='1';
        const sync=()=>{
            const converted=form.elements.date_converted;
            if(!converted)return;
            const dateText=form.elements.date_text?.value||'';
            if(form.elements.date_calendar&&(form.elements.date_calendar.value||'gregorian')==='gregorian'&&parseRepublicanDateText(dateText)){
                form.elements.date_calendar.value='republican';
            }
            converted.value=automaticEquivalentFromDateText(dateText,form.elements.date_calendar?.value||'gregorian');
        };
        form.elements.date_text?.addEventListener('input',sync);
        form.elements.date_calendar?.addEventListener('change',sync);
    }
    /**
     * Pouvoir d'achat : un montant ancien exprimé en journées de travail d'un journalier (manœuvre agricole de province),
     * puis en euros au salaire d'une journée d'aujourd'hui. Ordres de grandeur : les salaires variaient selon la région,
     * la saison et le métier (Paris nettement plus haut). Avant 1795 : sols par jour (livre tournois) ; ensuite francs par jour
     * (anciens francs jusqu'en 1959, nouveaux francs ensuite) ; après 1914, d'après le salaire minimum horaire × 8 h.
     */
    const journalierWages=[[1550,4],[1600,6],[1650,8],[1700,10],[1726,10],[1750,12],[1770,15],[1789,20],[1795,1.25*20],[1820,1.25*20],[1840,1.4*20],[1850,1.5*20],[1860,1.8*20],[1870,2*20],[1880,2.3*20],[1900,2.6*20],[1913,3.2*20],[1920,10*20],[1930,20*20],[1938,30*20],[1945,120*20],[1950,600*20],[1959,1100*20],[1960,12*20*100],[1970,28*20*100],[1980,105*20*100],[1990,250*20*100],[2001,340*20*100]];
    /** Salaire d'une journée, en sols (avant 1960 : 1 franc compté comme 1 livre = 20 sols ; à partir de 1960 : en sols d'anciens francs). */
    function journalierWageSols(year){
        const rows=journalierWages;if(year<=rows[0][0])return rows[0][1];if(year>=rows[rows.length-1][0])return rows[rows.length-1][1];
        for(let i=1;i<rows.length;i++){const [y1,w1]=rows[i-1],[y2,w2]=rows[i];if(year<=y2)return w1+(w2-w1)*(year-y1)/(y2-y1);}
        return rows[rows.length-1][1];
    }
    // Reconnaissance OCR/HTR par lot, dans l'onglet "Modifications groupées" (Patronymes) de la maintenance.
    // Réutilise les mêmes règles que la reconnaissance individuelle du lightbox média :
    // le texte détecté est toujours ajouté à la fin de la transcription existante, jamais en remplacement.
    // Chaque document traité est enregistré automatiquement via save_media_transcription (aucune fiche n'est modifiée avant validation explicite du lancement du lot).

    function backupSectionHtml(){
        const settings=autoBackupSettings();
        const interval=Number(settings.intervalMinutes)||60;
        const unit=interval%60===0?'hours':'minutes';
        const value=unit==='hours'?Math.max(1,interval/60):Math.max(15,interval);
        const result=settings.lastResult;
        const status=result?result.ok?`Dernière sauvegarde : ${escapeHtml(result.file||'sauvegarde')} · ${formatFileSize(result.size)} · ${formatBackupDate(result.created_at)}`:`Dernier essai échoué : ${escapeHtml(result.message||'Erreur inconnue')} · ${formatBackupDate(result.created_at)}`:'Aucune sauvegarde lancée depuis ce navigateur.';
        return `<section class="maintenance-panel" id="auto-backup-panel">
  <h3>Sauvegarde automatique programmée</h3>
  <p>Copie SQLite locale vers un dossier, en plus de l’export manuel. La programmation fonctionne quand le site est ouvert.</p>
  <form id="auto-backup-form" class="form-grid" style="margin-top:12px;padding:0;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem">
    <label style="grid-column:1/-1">Dossier de sauvegarde<input name="dir" value="${escapeHtml(settings.dir||'data/backups')}" placeholder="data/backups ou /chemin/vers/dossier"></label>
    <label>Toutes les<input name="intervalValue" type="number" min="1" value="${escapeHtml(value)}"></label>
    <label>Unité<select name="intervalUnit"><option value="minutes" ${unit==='minutes'?'selected':''}>minutes</option><option value="hours" ${unit==='hours'?'selected':''}>heures</option></select></label>
    <label>Conserver au maximum<input name="maxFiles" type="number" min="2" max="50" value="${escapeHtml(settings.maxFiles||10)}"></label>
    <label class="checkbox-line" style="grid-column:1/-1"><input type="checkbox" name="enabled" value="1" ${settings.enabled?'checked':''}> Activer la sauvegarde automatique</label>
  </form>
  <p class="muted" id="auto-backup-status" style="margin:.75rem 0;font-size:.9em">${status}</p>
  <div class="page-actions" style="flex-wrap:wrap;gap:.5rem">
    <button class="button secondary" type="button" id="auto-backup-check">Tester le dossier</button>
    <button class="button secondary" type="button" id="auto-backup-save-now">Faire une sauvegarde maintenant</button>
    <button class="button" type="button" id="auto-backup-save-settings">Enregistrer la programmation</button>
  </div>
  <p class="muted" style="margin-top:.5rem;font-size:.85em">Garde-fou : intervalle minimum 15 minutes et rotation automatique entre 2 et 50 fichiers.</p>
</section>`;
    }
    function exportPrivacySettings(){
        try{return {enabled:false,deathCutoffYear:'',...JSON.parse(localStorage.getItem('genealogie-export-privacy')||'{}')}}catch(_){return {enabled:false,deathCutoffYear:''};}
    }
    function saveExportPrivacySettings(settings){localStorage.setItem('genealogie-export-privacy',JSON.stringify(settings));}
    function exportPrivacySectionHtml(settings){
        return `<section class="maintenance-panel">
  <h3>Mode confidentialité</h3>
  <p>Masque les personnes vivantes dans les exports partageables. L’export SQLite reste volontairement complet : c’est une sauvegarde de travail.</p>
  <form id="export-privacy-form" class="form-grid" style="margin-top:12px;padding:0;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem">
    <label class="checkbox-line" style="grid-column:1/-1"><input type="checkbox" name="enabled" value="1" ${settings.enabled?'checked':''}> Masquer les personnes vivantes dans GEDCOM, CSV et JSON</label>
    <label>Masquer aussi les décès depuis l’année<input name="deathCutoffYear" type="number" min="1" max="9999" value="${escapeHtml(settings.deathCutoffYear||'')}" placeholder="ex. 1950"></label>
    <p class="muted" style="align-self:end;margin:0">Vide = seuls les vivants sont masqués.</p>
  </form>
</section>`;
    }
    function renderExportTools(token=++state.workspaceToken){if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='export')return;const privacy=exportPrivacySettings();const exportUrl=(action,params={})=>{const url=new URL('api.php',location.href);url.searchParams.set('action',action);Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));if(privacy.enabled&&action!=='export_sqlite'&&action!=='export_full_backup'){url.searchParams.set('privacy','1');if(privacy.deathCutoffYear)url.searchParams.set('death_cutoff_year',privacy.deathCutoffYear);}return url.toString();};$('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">EXPORT</span><h2>Export des données</h2><p>Télécharge les données dans les formats disponibles.</p></div></header>

${exportPrivacySectionHtml(privacy)}

<section class="maintenance-panel">
  <h3>Export GEDCOM configurable</h3>
  <p>Choisis le contenu transmis avant de télécharger le fichier d'échange.</p>
  <form id="gedcom-export-form" class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem">
    <label>Version GEDCOM<select name="gedcom_version"><option value="7">GEDCOM 7.0 (recommandé)</option><option value="5.5.1">GEDCOM 5.5.1 (compatibilité ancienne)</option></select></label>
    <div class="checkbox-group" style="align-self:end"><label class="checkbox-line"><input type="checkbox" name="include_living" checked> Inclure les personnes vivantes</label></div>
    <div class="checkbox-group"><label class="checkbox-line"><input type="checkbox" name="include_media" checked> Inclure les médias</label></div>
    <div class="checkbox-group"><label class="checkbox-line"><input type="checkbox" name="include_notes" checked> Inclure les notes</label></div>
    <div class="checkbox-group"><label class="checkbox-line"><input type="checkbox" name="include_sources" checked> Inclure les sources</label></div>
    <div class="checkbox-group" style="grid-column:1/-1"><label class="checkbox-line"><input type="checkbox" name="share"> Pour partager : masquer les vivants et les fiches confidentielles</label><p class="muted" style="margin:.3rem 0 0">Les personnes vivantes (ou probablement vivantes : sans décès et nées il y a moins de 100 ans) et les fiches confidentielles restent dans l'arbre sous le nom « Personne vivante » ou « Fiche confidentielle », avec seulement leur sexe et leurs liens familiaux. Rien d'autre d'elles n'est exporté : ni dates, ni lieux, ni notes, ni médias, ni sources.</p></div>
    <div class="page-actions" style="grid-column:1/-1"><button class="button" type="submit">Télécharger le GEDCOM</button></div>
  </form>
  <p class="muted" style="margin-top:.5rem;font-size:.85em">GEDCOM 5.5.1 est une version ancienne. Préférer GEDCOM 7.0 lorsque le logiciel destinataire le permet.</p>
</section>

${(window.LCNDA_EXT?.exportPanels||[]).map(fn=>{try{return fn();}catch(error){console.error(error);return '';}}).join('')}

<section class="maintenance-panel">
  <h3>CSV — Global (toutes tables)</h3>
  <p>Un seul fichier CSV avec toutes les sections : personnes, événements, médias, journal des modifications. Chaque section est délimitée par un en-tête <code>## NOM</code>.</p>
  <div class="page-actions"><a class="button secondary" href="${exportUrl('export_csv_global')}" download>Télécharger le CSV global</a></div>
</section>

<section class="maintenance-panel">
  <h3>CSV — Fichiers séparés par table</h3>
  <div class="page-actions" style="flex-wrap:wrap;gap:.5rem">
    <a class="button secondary" href="${exportUrl('export_csv',{type:'persons'})}" download>Personnes</a>
    <a class="button secondary" href="${exportUrl('export_csv',{type:'events'})}" download>Événements</a>
    <a class="button secondary" href="${exportUrl('export_csv',{type:'media'})}" download>Médias</a>
    <a class="button secondary" href="${exportUrl('export_csv',{type:'changes'})}" download>Journal</a>
  </div>
</section>

<section class="maintenance-panel">
  <h3>JSON — Export complet</h3>
  <p>Dump JSON structuré de toutes les tables (personnes, familles, événements, notes, sources, lieux). Idéal pour la sauvegarde ou un re-import dans une autre instance.</p>
  <div class="page-actions"><a class="button secondary" href="${exportUrl('export_json')}" download>Télécharger le JSON</a></div>
</section>

<section class="maintenance-panel">
  <h3>Sauvegarde complète (.zip)</h3>
  <p>La base <b>et</b> tous les médias (photos, documents, sons, vidéos) dans un seul fichier. C’est le fichier à garder en lieu sûr, ou à ouvrir sur un autre ordinateur : écran de démarrage de LCNDA → « Importer un fichier ». La préparation peut prendre une minute s’il y a beaucoup de photos.</p>
  <div class="page-actions"><a class="button" href="${exportUrl('export_full_backup')}" download>Télécharger la sauvegarde complète</a></div>
  <iframe name="protected-backup-frame" id="protected-backup-frame" hidden></iframe>
  <form id="protected-backup-form" class="backup-protect" method="post" action="api.php?action=export_full_backup" target="protected-backup-frame" autocomplete="off">
    <h4>Protégée par un mot de passe</h4>
    <p class="muted">Pour la mettre sur iCloud, Dropbox ou une clé USB sans risque si elle est perdue ou piratée : la base et les photos sont chiffrées (AES-256). Le mot de passe n’est enregistré nulle part : <strong>s’il est perdu, la sauvegarde ne pourra plus être ouverte</strong>. Hors de LCNDA, elle s’ouvre avec Keka (Mac) ou 7-Zip (Windows, Linux).</p>
    <input type="hidden" name="csrf" value="${escapeHtml(state.csrf)}">
    <div class="form-grid"><label>Mot de passe (8 caractères au moins)<input type="password" name="password" minlength="8" required autocomplete="new-password"></label><label>Le retaper<input type="password" name="password_confirm" minlength="8" required autocomplete="new-password"></label></div>
    <div class="page-actions"><button class="button" type="submit">Télécharger la sauvegarde protégée</button></div>
  </form>
</section>

<section class="maintenance-panel">
  <h3>Base SQLite (.db)</h3>
  <p>Le fichier de base de données seul, <b>sans les médias</b> (il ne contient que le nom des fichiers). Conserve la structure complète, les relations et les index. À ouvrir avec DB Browser for SQLite ou équivalent.</p>
  <div class="page-actions"><a class="button secondary" href="${exportUrl('export_sqlite')}" download>Télécharger le .db</a></div>
</section>

<section class="maintenance-panel">
  <h3>Journal de recherche</h3>
  <p>Rapport de recherche formel à partir du journal, des enquêtes, des pistes et des éléments de preuve.</p>
  <div class="page-actions"><a class="button secondary" href="${exportUrl('export_research_report')}" download>Télécharger le rapport HTML</a></div>
</section>

${window.LCNDA_EXT?.familyBookPanelHtml?.()||''}

${backupSectionHtml()}

</section>`;
        // Sauvegarde protégée : envoi dans un cadre caché (le fichier se télécharge ; une erreur s'y affiche en JSON)
        // Livre de famille : une branche, les parties choisies ; ouvert dans une fenêtre (photos visibles, ⌘P → PDF) ou téléchargé
        window.LCNDA_EXT?.bindFamilyBook?.(exportUrl);
        $('#protected-backup-form')?.addEventListener('submit',event=>{const form=event.currentTarget;
            if(form.elements.password.value!==form.elements.password_confirm.value){event.preventDefault();toast('Les deux mots de passe ne sont pas identiques.','error');return;}
            form.elements.csrf.value=state.csrf;toast('Préparation de la sauvegarde protégée… (le téléchargement va commencer)');
            setTimeout(()=>{form.elements.password.value='';form.elements.password_confirm.value='';},500);});
        $('#protected-backup-frame')?.addEventListener('load',event=>{try{const text=event.currentTarget.contentDocument?.body?.innerText||'';if(text.trim().startsWith('{')){const data=JSON.parse(text);if(data.error)toast(data.error,'error');}}catch(_){}});
        $('#export-privacy-form')?.addEventListener('change',event=>{const form=event.currentTarget;saveExportPrivacySettings({enabled:form.elements.enabled.checked,deathCutoffYear:String(form.elements.deathCutoffYear.value||'').trim()});renderExportTools();});$('#gedcom-export-form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;location.assign(exportUrl('export_gedcom',{gedcom_version:form.elements.gedcom_version.value,include_living:form.elements.include_living.checked?'1':'0',include_media:form.elements.include_media.checked?'1':'0',include_notes:form.elements.include_notes.checked?'1':'0',include_sources:form.elements.include_sources.checked?'1':'0',share:form.elements.share.checked?'1':'0'}));});$('#gedcom-export-form [name=share]')?.addEventListener('change',event=>{const living=event.currentTarget.form.elements.include_living;living.disabled=event.currentTarget.checked;if(event.currentTarget.checked)living.checked=true;});bindAutoBackupControls();(window.LCNDA_EXT?.afterExport||[]).forEach(fn=>{try{fn();}catch(error){console.error(error);}});}
    function readAutoBackupForm(){
        const form=$('#auto-backup-form');
        const data=formObject(form);
        const value=Math.max(1,Number(data.intervalValue)||1);
        const unit=data.intervalUnit==='hours'?'hours':'minutes';
        const intervalMinutes=Math.max(15,unit==='hours'?value*60:value);
        return {
            ...autoBackupSettings(),
            enabled:data.enabled==='1',
            dir:String(data.dir||'data/backups').trim()||'data/backups',
            intervalMinutes,
            maxFiles:Math.max(2,Math.min(50,Number(data.maxFiles)||10)),
        };
    }
    function setAutoBackupStatus(message,type=''){
        const el=$('#auto-backup-status');
        if(!el)return;
        el.textContent=message;
        el.style.color=type==='error'?'#b00020':'';
    }
    function bindAutoBackupControls(){
        const form=$('#auto-backup-form');
        if(!form)return;
        $('#auto-backup-save-settings')?.addEventListener('click',()=>{
            const previous=autoBackupSettings();
            const settings=readAutoBackupForm();
            if(settings.enabled&&!previous.enabled&&!previous.lastRun)settings.lastRun=Date.now();
            saveAutoBackupSettings(settings);
            setupAutoBackupTimer();
            toast(settings.enabled?'Sauvegarde automatique activée.':'Programmation enregistrée.');
            renderExportTools();
        });
        $('#auto-backup-check')?.addEventListener('click',async()=>{
            const settings=readAutoBackupForm();
            setAutoBackupStatus('Vérification du dossier…');
            try{
                const status=await api('backup_sqlite_status',{dir:settings.dir,max_files:settings.maxFiles});
                const fileText=status.last_backup?` Dernière sauvegarde : ${status.last_backup.name} (${formatFileSize(status.last_backup.size)}).`:' Aucune sauvegarde dans ce dossier.';
                setAutoBackupStatus(`${status.writable?'Dossier prêt':'Dossier non inscriptible'} : ${status.dir}.${fileText}`,status.writable?'':'error');
            }catch(error){setAutoBackupStatus(error.message,'error');}
        });
        $('#auto-backup-save-now')?.addEventListener('click',async()=>{
            const settings=readAutoBackupForm();
            saveAutoBackupSettings(settings);
            setAutoBackupStatus('Sauvegarde en cours…');
            try{
                const result=await api('backup_sqlite',{}, {method:'POST',body:{dir:settings.dir,max_files:settings.maxFiles,mode:'manual'}});
                saveAutoBackupSettings({...autoBackupSettings(),lastRun:Date.now(),lastResult:{ok:true,file:result.file,path:result.path,size:result.size,created_at:result.created_at}});
                toast('Sauvegarde créée.');
                setAutoBackupStatus(`Sauvegarde créée : ${result.file} · ${formatFileSize(result.size)} · ${result.path}`);
            }catch(error){
                saveAutoBackupSettings({...autoBackupSettings(),lastResult:{ok:false,message:error.message,created_at:new Date().toISOString()}});
                setAutoBackupStatus(error.message,'error');
                toast(error.message,'error');
            }
            setupAutoBackupTimer();
        });
    }
    // ── Helper : envoie un fichier en POST multipart vers api.php ──
    async function importUpload(action,file,extraFields={}){const fd=new FormData();fd.append('file',file);fd.append('csrf',state.csrf);Object.entries(extraFields||{}).forEach(([k,v])=>fd.append(k,v));const resp=await fetch(`api.php?action=${action}`,{method:'POST',headers:{'X-CSRF-Token':state.csrf},body:fd});const data=await resp.json().catch(()=>({error:'Réponse illisible'}));if(!resp.ok||data.error){const err=new Error(data.error||'Erreur serveur');err.data=data;throw err;}return data;}

    // ── Helper : rendu d'un bloc résultat d'analyse universelle ──

    // ── Helper : rendu résultat vérification GEDCOM ──
    function graphDiagramOrderEditor(items,hiddenKeys){return `<section class="maintenance-panel order-editor compact"><h3>Graphiques — Diagrammes</h3><p style="font-size:.8rem;color:var(--muted);margin:.25rem 0 .75rem">Sauf statistiques. Décocher pour masquer dans la barre latérale.</p><div class="order-list" id="graph-diagram-order">${items.map(([key,label],index)=>menuOrderRow(key,label,index,true,!hiddenKeys.includes(key))).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="graph-diagram-order">Enregistrer</button></div></section>`;}
    function graphStatsOrderEditor(items,hiddenKeys){return `<section class="maintenance-panel order-editor compact"><h3>Graphiques — Statistiques</h3><p style="font-size:.8rem;color:var(--muted);margin:.25rem 0 .75rem">Uniquement les statistiques. Décocher pour masquer.</p><div class="order-list" id="graph-stats-order">${items.map(([key,label],index)=>menuOrderRow('stats:'+key,label,index,true,!hiddenKeys.includes('stats:'+key))).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="graph-stats-order">Enregistrer</button></div></section>`;}
    function tileCategoryOrderEditor(categories,hiddenCats,hiddenKeys){
        const catRows=categories.map((cat,catIdx)=>{
            const catHidden=hiddenCats.includes(cat.id);
            const itemRows=cat.items.map(([key,label],itemIdx)=>menuOrderRow(key,label,itemIdx,true,!hiddenKeys.includes(key))).join('');
            return `<div class="tile-cat-block" data-tile-cat="${escapeHtml(cat.id)}"><div class="tile-cat-header"><span class="order-grip tile-cat-grip" draggable="true" aria-hidden="true">⠿</span><span class="order-number">${String(catIdx+1).padStart(2,'0')}</span><input class="tile-cat-label-input" type="text" value="${escapeHtml(cat.label)}" aria-label="Nom du module"><button class="tile-cat-delete" type="button" title="Supprimer ce module" aria-label="Supprimer">✕</button><label class="order-visible" title="Afficher cette catégorie"><input type="checkbox" class="tile-cat-toggle" ${catHidden?'':'checked'}></label></div><div class="order-list tile-cat-items" id="tile-items-${escapeHtml(cat.id)}">${itemRows}</div></div>`;
        }).join('');
        return `<section class="maintenance-panel order-editor compact tile-layer-editor"><h3>Fonds de cartes</h3><p style="font-size:.8rem;color:var(--muted);margin:.25rem 0 .75rem">Réorganisez les catégories et les fonds. Décochez pour masquer.</p><div class="tile-cat-list" id="tile-cat-order">${catRows}</div><div class="page-actions action-zone"><button class="button small secondary" type="button" id="tile-cat-add">+ Nouveau module</button><button class="button small" type="button" data-order-save="tile-layers">Enregistrer</button></div></section>`;
    }
    function menuOrderEditor(items){const names=menuNames();return `<section class="maintenance-panel order-editor compact"><h3>Ordre et noms du menu principal</h3><p style="font-size:.8rem;color:var(--muted);margin:.25rem 0 .75rem">Maintenance ne peut pas être masqué. Tape un autre nom dans la case pour renommer un onglet (vide = nom d’origine).</p><div class="order-list" id="menu-order">${items.map(([key,label,canHide,visible],index)=>menuOrderRow(key,label,index,canHide,visible).replace('</b>',()=>`</b><input class="order-rename" data-menu-name="${escapeHtml(key)}" value="${escapeHtml(names[key]||'')}" placeholder="${escapeHtml(label)}" maxlength="40" aria-label="Nouveau nom de l’onglet ${escapeHtml(label)}">`)).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="menu-order">Enregistrer</button><button class="button small secondary" type="button" data-menu-names-reset>↺ Remettre les noms comme au départ</button></div></section>`;}
    function menuOrderRow(key,label,index,canHide,visible){return `<div class="order-row has-visibility" data-order-key="${key}"><span class="order-grip" draggable="true" aria-hidden="true">⠿</span><span class="order-number">${String(index+1).padStart(2,'0')}</span><b>${escapeHtml(label)}</b><label class="order-visible" title="${canHide?'Afficher dans le menu':'Toujours visible'}"><input type="checkbox" ${visible?'checked':''} ${canHide?'':'disabled'} style="${canHide?'':'opacity:.35;cursor:not-allowed'}"></label></div>`;}
    function listOrderEditor(items,hiddenKeys){return `<section class="maintenance-panel order-editor compact"><h3>Ordre des listes</h3><p style="font-size:.8rem;color:var(--muted);margin:.25rem 0 .75rem">Décoche une liste pour la masquer dans la barre latérale.</p><div class="order-list" id="list-order">${items.map(([key,label],index)=>menuOrderRow(key,label,index,true,!hiddenKeys.includes(key))).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="list-order">Enregistrer</button></div></section>`;}
    function dashboardWidgetCatalogEditor(items,hiddenKeys){return `<section class="maintenance-panel order-editor block-order-editor"><h3>Bibliothèque des widgets</h3><p style="font-size:.8rem;color:var(--muted);margin:.25rem 0 .75rem">Glisse les types de widgets pour changer leur ordre dans la colonne du tableau de bord. Décoche pour masquer un type.</p><div class="order-list block-order-list" id="dashboard-widget-catalog-order">${items.map(([key,label],index)=>menuOrderRow(key,label,index,true,!hiddenKeys.includes(key))).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="dashboard-widget-catalog-order">Enregistrer la bibliothèque</button></div></section>`;}
    function orderEditor(id,title,items){return `<section class="maintenance-panel order-editor compact"><h3>${escapeHtml(title)}</h3><div class="order-list" id="${id}">${items.map(([key,label],index)=>orderRow(key,label,index)).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="${id}">Enregistrer</button></div></section>`;}
    // grisée (inerte) quand l'exception ne s'applique pas à cette sorte de fiche
    function blockOrderEditor(id,title,settings,personId=0,kind='human',disabled=''){if(kind!=='animal')settings={...settings,order:settings.order.filter(k=>!ANIMAL_BLOCKS.includes(k))};if(disabled)return `<div class="block-editor-off" inert aria-disabled="true"><p class="block-editor-offnote">${escapeHtml(disabled)}</p>${blockOrderEditor(id+'-off',title,settings,personId,kind)}</div>`;const rows=settings.order.map((key,index)=>{const item=defaultPersonBlocks.find(row=>row[0]===key);return item?orderRow(item[0],item[1],index,true,!settings.hidden.includes(item[0]),settings.widths?.[item[0]]||defaultPersonBlockSpans[item[0]]||'12',id):'';}).join('');return `<section class="maintenance-panel order-editor block-order-editor"><div class="item-title-row"><h3>${escapeHtml(title)}</h3>${personId?`<button class="button small secondary" type="button" data-reset-person-blocks="${personId}">Annuler l’exception</button>`:''}</div><div class="order-list block-order-list" id="${id}">${rows}</div><label class="checkbox-line identity-empty-toggle"><input type="checkbox" data-hide-empty-identity ${settings.hideEmptyIdentity?'checked':''}> Masquer les lignes vides (pas remplies) du bloc Identité</label><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="${id}" data-person-block-id="${personId}" data-block-kind="${kind}">Enregistrer ces blocs</button></div></section>`;}
    function orderRow(key,label,index,withVisibility=false,visible=true,width='12',groupId='global'){return `<div class="order-row ${withVisibility?'has-visibility':''}" data-order-key="${key}"><span class="order-grip" draggable="true" aria-hidden="true">↕</span><span class="order-number">${String(index+1).padStart(2,'0')}</span><b>${escapeHtml(label)}</b>${withVisibility?`<div class="block-widths" aria-label="Largeur du bloc">${personBlockWidthChoices.map(([value,text])=>`<button type="button" data-block-width="${value}" aria-pressed="${String(width)===value?'true':'false'}" title="Largeur ${text}">${text}</button>`).join('')}</div><label class="order-visible" title="Afficher le bloc"><input type="checkbox" ${visible?'checked':''}></label>`:''}</div>`;}
    function eventsFilterEditor(id,title,filter,personId=0){const types=(state.bootstrap?.eventTypes||[]).filter(t=>Number(t.usage_count)>0);const censusLabel='Recensements';const censusRow={_isCensusSpecial:true,label:censusLabel};const allItems=[...types,censusRow].sort((a,b)=>a.label.localeCompare(b.label,'fr',{sensitivity:'base'}));const rows=allItems.map(item=>{if(item._isCensusSpecial)return `<div class="events-filter-row" data-filter-census><label class="events-filter-label"><input type="checkbox" ${filter.showCensus?'checked':''}><span class="event-icon" style="--event-color:#7c5c2e">📋</span>${escapeHtml(censusLabel)}</label></div>`;return `<div class="events-filter-row" data-filter-type-id="${item.id}"><label class="events-filter-label"><input type="checkbox" ${!filter.hiddenTypeIds.includes(Number(item.id))?'checked':''}><span class="event-icon" style="--event-color:${escapeHtml(item.color||'#0066cc')}">${typeGlyph(item.icon,item.gedcom_tag)}</span>${escapeHtml(item.label)}</label></div>`;}).join('');return `<section class="maintenance-panel order-editor block-order-editor"><div class="item-title-row"><h3>${escapeHtml(title)}</h3>${personId?`<button class="button small secondary" type="button" data-reset-events-filter="${personId}">Annuler l'exception</button>`:''}</div><div class="events-filter-list" id="${id}">${rows}</div><div class="page-actions action-zone"><button class="button small" type="button" data-events-filter-save="${id}" data-events-filter-person-id="${personId}">Enregistrer ces filtres</button></div></section>`;}
    function lockToolsHtml(data){
        const people=data.people||[];
        return `<!--<section class="maintenance-panel local-lock-tools"><div class="item-title-row"><div><h3>Verrouillage des fiches non modifiées</h3><p>${plural(data.total,'fiche non modifiée','fiches non modifiées')} · ${plural(data.locked,'verrouillée')} · ${plural(data.unlocked,'déverrouillée')}.</p></div><div class="page-actions"><button class="button small" type="button" data-bulk-lock-untouched="1">Verrouiller toutes</button><button class="button small secondary" type="button" data-bulk-lock-untouched="0">Déverrouiller toutes</button></div></div>${people.length?`<div class="lock-people-list">${people.map(person=>`<article class="lock-person-row"><button type="button" class="table-link" data-open-person="${person.id}">${escapeHtml(personName(person))}</button><small>${escapeHtml(years(person))}</small><button class="button small ${Number(person.is_locked)?'secondary':''}" type="button" data-set-listed-person-lock="${person.id}" data-lock-value="${Number(person.is_locked)?0:1}">${Number(person.is_locked)?'Déverrouiller':'Verrouiller'}</button></article>`).join('')}</div>${data.total>data.limit?`<p class="muted">Affichage limité aux ${data.limit} premières fiches.</p>`:''}`:empty('Aucune fiche non modifiée à gérer.',{icon:'✅'})}</section>-->`;
    }
    function lockInlineControlsHtml(data){
        return `<div class="local-lock-inline"><div><strong>Fiches non modifiées</strong><span>${plural(data.total,'fiche')} · ${plural(data.locked,'verrouillée')} · ${plural(data.unlocked,'déverrouillée')}</span></div><div class="page-actions"><button class="button small" type="button" data-bulk-lock-untouched="1">Verrouiller toutes</button><button class="button small secondary" type="button" data-bulk-lock-untouched="0">Déverrouiller toutes</button></div></div>`;
    }
    function sosaRootId(){return Number(localStorage.getItem('genealogie-sosa-root'))||0;}
    function sosaMap(){try{return JSON.parse(localStorage.getItem('genealogie-sosa-map')||'{}');}catch(_){return {};}}
    function sosaNumberFor(personId){const map=sosaMap();const value=map[String(personId)];return value?Number(value):0;}
    /** Tous les numéros Sosa d'une personne (plusieurs si elle apparaît plusieurs fois dans l'arbre) : « 42 & 46 ». */
    function sosaNumbersText(personId){let multi={};try{multi=JSON.parse(localStorage.getItem('genealogie-sosa-multi')||'{}');}catch(_){}const list=Array.isArray(multi[String(personId)])?multi[String(personId)]:[];if(list.length>1)return `${list.slice(0,-1).join(', ')} & ${list[list.length-1]}`;const single=sosaNumberFor(personId);return single?String(single):'';}
    async function recalculateSosaMap(rootId){
        if(!rootId){localStorage.removeItem('genealogie-sosa-root');localStorage.removeItem('genealogie-sosa-map');localStorage.removeItem('genealogie-sosa-multi');return {root_id:0,count:0};}
        const data=await api('sosa_map',{root_id:rootId});
        if(!data.root_id){localStorage.removeItem('genealogie-sosa-root');localStorage.removeItem('genealogie-sosa-map');return {root_id:0,count:0};}
        localStorage.setItem('genealogie-sosa-root',String(data.root_id));localStorage.removeItem('genealogie-sosa-off');
        localStorage.setItem('genealogie-sosa-map',JSON.stringify(data.map||{}));
        localStorage.setItem('genealogie-sosa-multi',JSON.stringify(data.multi||{}));
        if(data.root_name)localStorage.setItem('genealogie-sosa-root-name',data.root_name);
        return {root_id:data.root_id,count:Object.keys(data.map||{}).length};
    }
    /** Le Sosa n°1 et le de cujus (personne de départ de la base) sont la même personne : on enregistre le choix dans la base. */
    async function saveStartPerson(personId){
        personId=Number(personId)||0;if(!personId||document.body.classList.contains('is-kiosk'))return;
        try{await api('set_start_person',{}, {method:'POST',body:{person_id:personId}});if(state.bootstrap){state.bootstrap.startPersonId=personId;state.bootstrap.startPersonFlagged=true;}}catch(_){}
    }
    /** Au lancement (et après un changement de base) : les numéros Sosa gardés dans le navigateur doivent partir du de cujus de la base ouverte. */
    async function syncSosaWithStartPerson(){
        const boot=state.bootstrap||{},start=Number(boot.startPersonId)||0,root=sosaRootId();
        if(!start||localStorage.getItem('genealogie-sosa-off')==='1')return;
        // Racine venue des réglages de CETTE base (et non d'une autre base ouverte avant dans ce navigateur)
        const rootFromThisBase=Number(window.LCNDA_SETTINGS?.['genealogie-sosa-root'])===root;
        if(!boot.startPersonFlagged&&root&&root!==start&&rootFromThisBase){
            // Ancienne installation : la racine choisie dans les réglages devient le de cujus de la base
            const result=await recalculateSosaMap(root);
            if(result.root_id){await saveStartPerson(result.root_id);return;}
        }
        const result=await recalculateSosaMap(start);
        if(result.root_id&&root!==result.root_id&&state.module==='personnes'&&Number(state.currentPersonId)===result.root_id)selectPerson(result.root_id,false);
    }
    function sosaInlineControlsHtml(){
        const rootId=sosaRootId();
        const map=sosaMap();
        const count=Object.keys(map).length;
        const rootName=rootId?(localStorage.getItem('genealogie-sosa-root-name')||`Personne #${rootId}`):'';
        return `<div class="local-lock-inline sosa-inline"><div><strong>Numérotation Sosa</strong><span>${rootId?`Sosa n°1 (de cujus) : ${escapeHtml(rootName)} · ${plural(count,'personne numérotée','personnes numérotées')}`:'Aucune personne racine définie pour le moment'}</span></div><div class="page-actions sosa-inline-actions"><div class="sosa-search-box" id="sosa-root-pick">${pkFieldLocal({name:'sosa_root_pick',kind:'person',value:rootId?(/^Personne #/.test(rootName)?rootId:{id:rootId,title:rootName,kind:'person'}):null})}<input type="hidden" id="sosa-root-search" value="${escapeHtml(rootId?rootName:'')}"><input type="hidden" id="sosa-root-input" value="${rootId||''}"></div><button class="button small" type="button" id="sosa-use-current" ${state.currentPersonId?'':'disabled'} title="Utiliser la personne actuellement ouverte">Utiliser la fiche ouverte</button><button class="button small" type="button" id="sosa-recalculate">Recalculer</button>${rootId?'<button class="button small secondary" type="button" id="sosa-clear">Retirer</button>':''}</div></div>`;
    }
    function dabovilleRootId(){return Number(localStorage.getItem('genealogie-daboville-root'))||0;}
    function dabovilleMap(){try{return JSON.parse(localStorage.getItem('genealogie-daboville-map')||'{}');}catch(_){return {};}}
    function dabovilleNumberFor(personId){const map=dabovilleMap();const value=map[String(personId)];return value?String(value):'';}
    async function recalculateDabovilleMap(rootId){
        if(!rootId){localStorage.removeItem('genealogie-daboville-root');localStorage.removeItem('genealogie-daboville-map');return {root_id:0,count:0};}
        const data=await api('daboville_map',{root_id:rootId});
        if(!data.root_id){localStorage.removeItem('genealogie-daboville-root');localStorage.removeItem('genealogie-daboville-map');return {root_id:0,count:0};}
        localStorage.setItem('genealogie-daboville-root',String(data.root_id));
        localStorage.setItem('genealogie-daboville-map',JSON.stringify(data.map||{}));
        return {root_id:data.root_id,count:Object.keys(data.map||{}).length};
    }
    function dabovilleInlineControlsHtml(){
        const rootId=dabovilleRootId();
        const map=dabovilleMap();
        const count=Object.keys(map).length;
        const rootName=rootId?(localStorage.getItem('genealogie-daboville-root-name')||`Personne #${rootId}`):'';
        return `<div class="local-lock-inline sosa-inline"><div><strong>Numérotation d'Aboville</strong><span>${rootId?`N°1 : ${escapeHtml(rootName)} · ${plural(count,'personne numérotée','personnes numérotées')}`:'Aucune personne racine définie pour le moment'}</span></div><div class="page-actions sosa-inline-actions"><div class="sosa-search-box" id="daboville-root-pick">${pkFieldLocal({name:'daboville_root_pick',kind:'person',value:rootId?(/^Personne #/.test(rootName)?rootId:{id:rootId,title:rootName,kind:'person'}):null})}<input type="hidden" id="daboville-root-search" value="${escapeHtml(rootId?rootName:'')}"><input type="hidden" id="daboville-root-input" value="${rootId||''}"></div><button class="button small" type="button" id="daboville-use-current" ${state.currentPersonId?'':'disabled'} title="Utiliser la personne actuellement ouverte">Utiliser la fiche ouverte</button><button class="button small" type="button" id="daboville-recalculate">Recalculer</button>${rootId?'<button class="button small secondary" type="button" id="daboville-clear">Retirer</button>':''}</div></div>`;
    }
    function designPresets(){try{return JSON.parse(localStorage.getItem('genealogie-design-presets')||'{}');}catch(_){return {};}}
    function saveDesignPresets(presets){localStorage.setItem('genealogie-design-presets',JSON.stringify(presets));}
    function designFieldsHtml(design){
        design=design||{};
        return `<label>Preset<select name="preset"><option value="portfolio">Portfolio actuel</option><option value="soft" ${design.preset==='soft'?'selected':''}>Plus doux</option><option value="archive" ${design.preset==='archive'?'selected':''}>Archive papier</option><option value="archiveBlue" ${design.preset==='archiveBlue'?'selected':''}>Archive bleu</option><option value="archiveGreen" ${design.preset==='archiveGreen'?'selected':''}>Archive vert</option><option value="archiveRed" ${design.preset==='archiveRed'?'selected':''}>Archive rouge</option><option value="archivePurple" ${design.preset==='archivePurple'?'selected':''}>Archive violet</option><option value="archiveOrange" ${design.preset==='archiveOrange'?'selected':''}>Archive orange</option><option value="archiveTurquoise" ${design.preset==='archiveTurquoise'?'selected':''}>Turquoise</option><option value="archivePink" ${design.preset==='archivePink'?'selected':''}>Rose poudré</option><option value="archivePetrol" ${design.preset==='archivePetrol'?'selected':''}>Bleu pétrole pâle</option><option value="archiveSalmon" ${design.preset==='archiveSalmon'?'selected':''}>Saumon clair</option><option value="archiveLavender" ${design.preset==='archiveLavender'?'selected':''}>Lavande grisée</option><option value="archiveYellow" ${design.preset==='archiveYellow'?'selected':''}>Jaune doux</option><option value="dark" ${design.preset==='dark'?'selected':''}>Sombre</option></select></label><label>Couleur principale<input type="color" name="blue" value="${escapeHtml(design.blue||'#0066cc')}"></label><label>Menu des onglets<select name="navPosition"><option value="top" ${design.navPosition!=='bottom'?'selected':''}>En haut (défaut)</option><option value="bottom" ${design.navPosition==='bottom'?'selected':''}>En bas de l’écran</option></select></label><label>Logo « ${escapeHtml(design.ownerFirst||'MA')} ${escapeHtml(design.ownerLast||'FAMILLE')} · GÉNÉALOGIE »<select name="brandDisplay"><option value="show" ${design.brandDisplay!=='hide'?'selected':''}>Afficher (défaut)</option><option value="hide" ${design.brandDisplay==='hide'?'selected':''}>Masquer (onglets plus larges)</option></select></label><label>Colonne latérale<select name="sidebarPosition"><option value="left" ${design.sidebarPosition!=='right'?'selected':''}>À gauche (défaut)</option><option value="right" ${design.sidebarPosition==='right'?'selected':''}>À droite</option></select></label><label>Taille typographique<select name="fontScale"><option value="0.82" ${design.fontScale==='0.82'?'selected':''}>Très compacte (13px)</option><option value="0.88" ${design.fontScale==='0.88'?'selected':''}>Compacte (14px)</option><option value="0.94" ${design.fontScale==='0.94'?'selected':''}>Resserrée (15px)</option><option value="1" ${(!design.fontScale||design.fontScale==='1')?'selected':''}>Normale (16px)</option><option value="1.06" ${design.fontScale==='1.06'?'selected':''}>Confortable (17px)</option><option value="1.13" ${design.fontScale==='1.13'?'selected':''}>Grande (18px)</option><option value="1.19" ${design.fontScale==='1.19'?'selected':''}>Très grande (19px)</option><option value="1.25" ${design.fontScale==='1.25'?'selected':''}>Large (20px)</option><option value="1.38" ${design.fontScale==='1.38'?'selected':''}>Très large (22px)</option><option value="1.5" ${design.fontScale==='1.5'?'selected':''}>Maximale (24px)</option></select></label><label>Police de caractères<select name="fontFamily" id="font-family-select">${fontFamilyOptions.map(([value,label])=>`<option value="${value}" ${fontFamilyValue(design.fontFamily)===value?'selected':''}>${escapeHtml(label)}</option>`).join('')}${(typeof design.fontFamily==='string'&&design.fontFamily.indexOf('local:')===0)?`<optgroup label="— Polices de votre ordinateur —"><option value="${escapeHtml(design.fontFamily)}" selected>${escapeHtml(design.fontFamily.slice(6))}</option></optgroup>`:''}</select><button type="button" class="button small" id="detect-local-fonts" hidden style="margin-top:6px">Voir toutes les polices de mon ordinateur</button></label><label>Fond des blocs de fiche<select name="cardBackground"><option value="white">Selon le preset</option><option value="blue" ${design.cardBackground==='blue'?'selected':''}>Couleur bleutée</option><option value="bw" ${design.cardBackground==='bw'?'selected':''}>Noir et blanc</option><option value="archive" ${design.cardBackground==='archive'?'selected':''}>Papier archive</option><option value="green" ${design.cardBackground==='green'?'selected':''}>Vert doux</option></select></label><label>Fond de carte géographique<select name="mapBackground"><option value="bw" ${mapBackgroundValue(design.mapBackground)==='bw'?'selected':''}>Noir &amp; blanc</option><option value="color" ${mapBackgroundValue(design.mapBackground)==='color'?'selected':''}>Couleur (OSM)</option><option value="light" ${mapBackgroundValue(design.mapBackground)==='light'?'selected':''}>Claire</option><option value="minimal" ${mapBackgroundValue(design.mapBackground)==='minimal'?'selected':''}>Minimaliste</option><option value="roads" ${mapBackgroundValue(design.mapBackground)==='roads'?'selected':''}>Routes seules</option><option value="dark" ${mapBackgroundValue(design.mapBackground)==='dark'?'selected':''}>Sombre</option><option value="osmfr" ${mapBackgroundValue(design.mapBackground)==='osmfr'?'selected':''}>OSM France</option><option value="relief" ${mapBackgroundValue(design.mapBackground)==='relief'?'selected':''}>Relief léger</option><option value="cyclosm" ${mapBackgroundValue(design.mapBackground)==='cyclosm'?'selected':''}>CyclOSM (relief + routes)</option><option value="wikimedia" ${mapBackgroundValue(design.mapBackground)==='wikimedia'?'selected':''}>Wikimedia Maps</option><option value="satellite" ${mapBackgroundValue(design.mapBackground)==='satellite'?'selected':''}>Satellite (Esri)</option><option value="esri_topo" ${mapBackgroundValue(design.mapBackground)==='esri_topo'?'selected':''}>Topographique (Esri)</option><option value="esri_street" ${mapBackgroundValue(design.mapBackground)==='esri_street'?'selected':''}>Rues couleur (Esri)</option><option value="voyager" ${mapBackgroundValue(design.mapBackground)==='voyager'?'selected':''}>Voyager (avec labels)</option><option value="osmde" ${mapBackgroundValue(design.mapBackground)==='osmde'?'selected':''}>OSM Allemagne</option><option value="cartoweb" ${mapBackgroundValue(design.mapBackground)==='cartoweb'?'selected':''}>CartoWeb.be (Belgique, IGN)</option><option value="swisstopo" ${mapBackgroundValue(design.mapBackground)==='swisstopo'?'selected':''}>Swisstopo (Suisse)</option><option value="grid" ${mapBackgroundValue(design.mapBackground)==='grid'?'selected':''}>Quadrillé</option><optgroup label="— Cartes historiques —"></optgroup><option value="ohm" ${mapBackgroundValue(design.mapBackground)==='ohm'?'selected':''}>OpenHistoricalMap</option><option value="cassini" ${mapBackgroundValue(design.mapBackground)==='cassini'?'selected':''}>Carte de Cassini (18e s.)</option><option value="etatmajor" ${mapBackgroundValue(design.mapBackground)==='etatmajor'?'selected':''}>État-Major (France, 19e s.)</option><option value="swisstopo_dufour" ${mapBackgroundValue(design.mapBackground)==='swisstopo_dufour'?'selected':''}>Swisstopo — Carte Dufour (Suisse, 1845-1865)</option><option value="swisstopo_siegfried" ${mapBackgroundValue(design.mapBackground)==='swisstopo_siegfried'?'selected':''}>Swisstopo — Carte Siegfried (Suisse, 1870-1949)</option><option value="nls_6inch" ${mapBackgroundValue(design.mapBackground)==='nls_6inch'?'selected':''}>OS 6-inch Écosse (1842-1882)</option><option value="nls_natgrid" ${mapBackgroundValue(design.mapBackground)==='nls_natgrid'?'selected':''}>OS National Grid UK (1940-1960)</option><option value="ferraris" ${mapBackgroundValue(design.mapBackground)==='ferraris'?'selected':''}>Carte de Ferraris (Belgique, 1777)</option><option value="vandermaelen" ${mapBackgroundValue(design.mapBackground)==='vandermaelen'?'selected':''}>Carte Vandermaelen (Belgique, 1846-1854)</option><option value="popp" ${mapBackgroundValue(design.mapBackground)==='popp'?'selected':''}>Atlas Popp (Belgique, 1842-1879)</option><option value="frickx" ${mapBackgroundValue(design.mapBackground)==='frickx'?'selected':''}>Carte Fricx (Belgique, 1744)</option><option value="buurtwegen" ${mapBackgroundValue(design.mapBackground)==='buurtwegen'?'selected':''}>Atlas der Buurtwegen (Flandre, ~1840)</option><optgroup label="— France IGN (Géoplateforme) —"></optgroup><option value="ign_ortho_1950" ${mapBackgroundValue(design.mapBackground)==='ign_ortho_1950'?'selected':''}>Photos aériennes historiques IGN (1950-1965)</option><option value="ign_scan50_1950" ${mapBackgroundValue(design.mapBackground)==='ign_scan50_1950'?'selected':''}>Scan50 1950 — carte papier IGN</option><option value="ign_hr_ortho" ${mapBackgroundValue(design.mapBackground)==='ign_hr_ortho'?'selected':''}>Orthophotos actuelles HD IGN</option><option value="ign_planv2" ${mapBackgroundValue(design.mapBackground)==='ign_planv2'?'selected':''}>Plan IGN v2 (actuel)</option><optgroup label="— Grande-Bretagne (NLS) —"></optgroup><option value="nls_25inch" ${mapBackgroundValue(design.mapBackground)==='nls_25inch'?'selected':''}>OS 25-inch Écosse (1892-1905)</option><option value="nls_1inch" ${mapBackgroundValue(design.mapBackground)==='nls_1inch'?'selected':''}>OS 1-inch GB (1885-1900)</option><option value="gsgs3906" ${mapBackgroundValue(design.mapBackground)==='gsgs3906'?'selected':''}>GSGS 3906 — War Office 1940-1943 (Écosse)</option><option value="london_1940s" ${mapBackgroundValue(design.mapBackground)==='london_1940s'?'selected':''}>Londres 1940s (1:1250/1:2500)</option><optgroup label="— États-Unis (USGS) —"></optgroup><option value="usgs_topo" ${mapBackgroundValue(design.mapBackground)==='usgs_topo'?'selected':''}>USGS Topo (USA, actuel)</option><option value="usgs_imagery" ${mapBackgroundValue(design.mapBackground)==='usgs_imagery'?'selected':''}>USGS Satellite (USA)</option><optgroup label="— Espagne (IGN España) —"></optgroup><option value="ign_es_mtn50" ${mapBackgroundValue(design.mapBackground)==='ign_es_mtn50'?'selected':''}>MTN50 première édition (Espagne, 1910-1970)</option><option value="ign_es_pnoa" ${mapBackgroundValue(design.mapBackground)==='ign_es_pnoa'?'selected':''}>Orthophotos PNOA actuelles (Espagne)</option></select></label><label>Détails des recensements<select name="censusDetailsDefault"><option value="collapsed" ${design.censusDetailsDefault!=='expanded'?'selected':''}>Masqués par défaut</option><option value="expanded" ${design.censusDetailsDefault==='expanded'?'selected':''}>Affichés par défaut</option></select></label><label>Ordre des recensements spéciaux<select name="censusSpecialOrder"><option value="official_first" ${design.censusSpecialOrder!=='chronological'?'selected':''}>Classiques puis spéciaux</option><option value="chronological" ${design.censusSpecialOrder==='chronological'?'selected':''}>Tout chronologique</option></select></label><label>Forme des avatars<select name="avatarShape"><option value="tilted" ${(design.avatarShape||'tilted')==='tilted'?'selected':''}>Carré penché (défaut)</option><option value="square" ${design.avatarShape==='square'?'selected':''}>Carré droit</option><option value="circle" ${design.avatarShape==='circle'?'selected':''}>Cercle</option><option value="pentagon" ${design.avatarShape==='pentagon'?'selected':''}>Pentagone</option><option value="hexagon" ${design.avatarShape==='hexagon'?'selected':''}>Hexagone</option><option value="diamond" ${design.avatarShape==='diamond'?'selected':''}>Losange</option></select></label><label>Affichage des événements<select name="eventDisplayMode"><option value="all_mixed" ${(design.eventDisplayMode||'all_mixed')==='all_mixed'?'selected':''}>Tous (mélangés)</option><option value="all_bottom" ${design.eventDisplayMode==='all_bottom'?'selected':''}>Tous (séparés)</option><option value="own_only" ${design.eventDisplayMode==='own_only'?'selected':''}>Mes événements</option><option value="witness_only" ${design.eventDisplayMode==='witness_only'?'selected':''}>Comme témoin</option></select></label><label>Position sur la carte (défaut)<select name="defaultMapLocationMode"><option value="city" ${(design.defaultMapLocationMode||'city')==='city'?'selected':''}>Ville</option><option value="combined" ${design.defaultMapLocationMode==='combined'?'selected':''}>Combiné</option><option value="precise" ${design.defaultMapLocationMode==='precise'?'selected':''}>Lieu précis</option></select></label><label>Variantes de nom<select name="identity_name_variants_display"><option value="always" ${getIdentityNameVariantsDisplay()==='always'?'selected':''}>Afficher</option><option value="never" ${getIdentityNameVariantsDisplay()==='never'?'selected':''}>Masquer</option><option value="if_filled" ${(getIdentityNameVariantsDisplay()||'if_filled')==='if_filled'?'selected':''}>Afficher seulement si renseigné</option></select></label><label>Enquêtes en secondaire<select name="showInvestigationsAsSecondary"><option value="show" ${(design.showInvestigationsAsSecondary||'show')==='show'?'selected':''}>Afficher dans la fiche</option><option value="hide" ${design.showInvestigationsAsSecondary==='hide'?'selected':''}>Masquer de la fiche</option></select></label><label>Mort Pour La France (défaut)<select name="defaultMortPourLaFrance"><option value="unknown" ${(design.defaultMortPourLaFrance||'unknown')==='unknown'?'selected':''}>Inconnu</option><option value="yes" ${design.defaultMortPourLaFrance==='yes'?'selected':''}>Oui</option><option value="no" ${design.defaultMortPourLaFrance==='no'?'selected':''}>Non</option><option value="na" ${design.defaultMortPourLaFrance==='na'?'selected':''}>Non applicable</option></select></label><label>Prénom affiché<input name="ownerFirst" value="${escapeHtml(design.ownerFirst||'')}" placeholder="Marie"></label><label>Nom affiché<input name="ownerLast" value="${escapeHtml(design.ownerLast||'')}" placeholder="Dupont"></label><label>Lecteur audio / vidéo : avancer et reculer de (secondes)<input type="number" name="avSkipSeconds" min="1" max="3600" step="1" value="${escapeHtml(String(design.avSkipSeconds||15))}"></label>`;
    }
    function enhanceDesignFormOptions(design){
        const cardSelect=$('#design-form select[name="cardBackground"]');
        if(cardSelect&&!cardSelect.querySelector('option[value="portfolio"]')){
            const option=document.createElement('option');
            option.value='portfolio';
            option.textContent='Portfolio';
            cardSelect.insertBefore(option,cardSelect.options[1]||null);
        }
        if(cardSelect)cardSelect.value=design?.cardBackground||'white';
        const mapSelect=$('#design-form select[name="mapBackground"]');
        if(mapSelect)mapSelect.innerHTML=mapBackgroundSelectHtml(mapBackgroundValue(design?.mapBackground));
        if(cardSelect&&!$('#design-form select[name="interfaceLanguage"]')){
            const languages=[['fr','Français',true],['en','English',false],['es','Español',false],['de','Deutsch',false],['it','Italiano',false],['nl','Nederlands',false],['pt','Português',false],['pl','Polski',false],['da','Dansk',false],['no','Norsk',false],['sv','Svenska',false],['fi','Suomi',false],['cs','Čeština',false],['hu','Magyar',false],['sk','Slovenčina',false],['et','Eesti',false],['lv','Latviešu',false],['lt','Lietuvių',false]];
            const selected=languages.some(([value,,enabled])=>enabled&&value===design?.interfaceLanguage)?design.interfaceLanguage:'fr';
            cardSelect.closest('label')?.insertAdjacentHTML('afterend',`<label>Langue de l'interface<select name="interfaceLanguage">${languages.map(([value,label,enabled])=>`<option value="${value}" ${selected===value?'selected':''} ${enabled?'':'disabled'}>${label}${enabled?'':' — à traduire'}</option>`).join('')}</select></label>`);
        }
        const languageSelect=$('#design-form select[name="interfaceLanguage"]');
        if(languageSelect&&!$('#design-form select[name="defaultCalendar"]')){
            const selectedCalendar=defaultCalendarValue(design);
            languageSelect.closest('label')?.insertAdjacentHTML('afterend',`<label>Calendrier par défaut<select name="defaultCalendar">${converterCalendarOptions.map(([key,label])=>`<option value="${key}" ${selectedCalendar===key?'selected':''}>${label}</option>`).join('')}</select></label>`);
        }
    }
    function reorderDesignPrimaryFields(){
        const fieldLabel=name=>$(`#design-form [name="${name}"]`)?.closest('label');
        const cardBackground=fieldLabel('cardBackground');
        const avatarShape=fieldLabel('avatarShape');
        const mapBackground=fieldLabel('mapBackground');
        const defaultMapLocation=fieldLabel('defaultMapLocationMode');
        const censusDetails=fieldLabel('censusDetailsDefault');
        const eventDisplay=fieldLabel('eventDisplayMode');
        if(cardBackground&&avatarShape)cardBackground.after(avatarShape);
        if(mapBackground&&defaultMapLocation)mapBackground.after(defaultMapLocation);
        if(censusDetails&&eventDisplay)censusDetails.before(eventDisplay);
    }
    function designPresetsHtml(presets){
        const rows=Object.entries(presets).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||'','fr'));
        return `<div class="local-lock-inline design-presets-head"><div><strong>Designs enregistrés</strong><span>Sauvegarde ce réglage sous un nom pour le retrouver et le réappliquer plus tard.</span></div><div class="page-actions"><input type="text" id="design-preset-name" placeholder="Nom du design" maxlength="60"><button class="button small" type="button" id="save-design-preset">Enregistrer ce design</button></div></div><div class="design-presets-list">${rows.length?rows.map(([id,preset])=>`<article class="design-preset-row" data-preset-id="${escapeHtml(id)}"><b>${escapeHtml(preset.name||'Sans nom')}</b><div class="page-actions"><button class="button small secondary" type="button" data-apply-preset="${escapeHtml(id)}">Appliquer</button><button class="button small secondary" type="button" data-edit-preset="${escapeHtml(id)}">Modifier</button><button class="button small secondary" type="button" data-rename-preset="${escapeHtml(id)}">Renommer</button><button class="button small secondary" type="button" data-delete-preset="${escapeHtml(id)}">Supprimer</button></div></article>`).join(''):empty('Aucun design enregistré pour l’instant',{icon:'🎨',hint:'Règle l’apparence puis enregistre-la sous un nom pour la retrouver ici.'})}</div>`;
    }
    function personBadgeColorsFromPanel(){
        const panel=$('#person-badge-colors'),colors={};
        Object.keys(DEFAULT_PERSON_BADGE_COLORS).forEach(key=>{colors[key]=panel?.querySelector(`[name="badge_${key}"]`)?.value||DEFAULT_PERSON_BADGE_COLORS[key];});
        return colors;
    }
    function personBadgePresetSwatches(colors){
        return ['sosa_bg','sosa_star','daboville_bg','daboville_star','deceased_bg','outside_bg','artist_bg'].map(key=>`<span style="display:inline-block;width:13px;height:13px;border:1px solid var(--ink);background:${escapeHtml(colors?.[key]||DEFAULT_PERSON_BADGE_COLORS[key])};margin-right:2px;vertical-align:middle"></span>`).join('');
    }
    function personBadgeColorPanel(){
        const colors=getPersonBadgeColors();
        const rows=[
            ['sosa_bg','SOSA fond'],['sosa_text','SOSA texte'],['sosa_star','Étoile'],
            ['daboville_bg',"d'Aboville fond"],['daboville_text',"d'Aboville texte"],['daboville_star',"d'Aboville symbole"],
            ['deceased_bg','Décédé fond'],['deceased_text','Décédé texte'],
            ['living_bg','Vivant fond'],['living_text','Vivant texte'],
            ['unknown_bg','À vérifier fond'],['unknown_text','À vérifier texte'],
            ['outside_bg','Hors gén. fond'],['outside_text','Hors gén. texte'],
            ['artist_bg','Artiste fond'],['artist_text','Artiste texte'],
        ];
        const presets=Object.entries(getPersonBadgeColorPresets()).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||'','fr'));
        return `<section class="maintenance-panel order-editor compact person-badge-colors" id="person-badge-colors"><h3>Couleurs des badges</h3><div class="person-badge-preview"><span class="sosa-star"><span>★</span> SOSA : 64</span><span class="daboville-tag"><span>◆</span> d'Aboville : 1.2.3</span><span class="status-badge deceased">Décédé(e)</span><span class="outside-genealogy-badge">Hors généalogie</span><span class="artist-badge">🎨 Artiste</span></div><div class="person-badge-color-grid">${rows.map(([key,label])=>`<label><span>${escapeHtml(label)}</span><input type="color" name="badge_${key}" value="${escapeHtml(colors[key]||DEFAULT_PERSON_BADGE_COLORS[key])}"></label>`).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" id="apply-person-badge-colors">Appliquer</button><button class="button small secondary" type="button" id="reset-person-badge-colors">↺ Remettre comme au départ</button></div><div class="person-badge-presets"><strong>Palettes</strong><div class="person-badge-preset-list">${presets.length?presets.map(([id,preset])=>`<article class="design-preset-row"><b>${escapeHtml(preset.name||'Sans nom')}</b><span>${personBadgePresetSwatches(preset.colors||{})}</span><div class="page-actions"><button class="button small secondary" type="button" data-apply-person-badge-preset="${escapeHtml(id)}">Appliquer</button><button class="button small secondary" type="button" data-delete-person-badge-preset="${escapeHtml(id)}">Suppr.</button></div></article>`).join(''):empty('Aucune palette enregistrée pour l’instant',{icon:'🎨',hint:'Donne un nom à tes couleurs ci-dessous puis enregistre-les.'})}</div><div class="page-actions person-badge-save-row"><input type="text" id="person-badge-preset-name" placeholder="Nom de la palette"><button class="button small" type="button" id="save-person-badge-preset">Enregistrer</button></div></div></section>`;
    }
    function openEditPresetDialog(presetId){
        const presets=designPresets(),preset=presets[presetId];
        if(!preset)return;
        $('#edit-preset-dialog')?.remove();
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal small-modal" id="edit-preset-dialog"><form id="edit-preset-form"><div class="modal-head"><h2>Modifier « ${escapeHtml(preset.name||'Sans nom')} »</h2></div><div class="form-grid">${designFieldsHtml(preset.design||{})}</div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" value="cancel">Annuler</button><button class="button" type="submit">Valider</button></div></form></dialog>`);
        const dialog=$('#edit-preset-dialog'),form=$('#edit-preset-form');
        $('button[value="cancel"]',dialog).addEventListener('click',()=>{dialog.close();dialog.remove();});
        dialog.addEventListener('close',()=>dialog.remove());
        form.addEventListener('submit',event=>{
            event.preventDefault();
            const currentPresets=designPresets(),target=currentPresets[presetId];
            if(!target){dialog.close();return;}
            target.design=formObject(form);
            saveDesignPresets(currentPresets);
            toast(`Design « ${target.name||'Sans nom'} » modifié.`);
            dialog.close();
            renderDesignTools();
        });
        dialog.showModal();
    }
    // Apparence en trois pages : l'apparence générale, le tableau de bord, les fiches des personnes et des animaux.
    // Une seule page est construite (tous les réglages restent branchés) ; chaque onglet n'en montre que sa part.
    const DESIGN_TABS=['design','design_board','design_sheets'];
    const DESIGN_PART_HEAD={design_board:['Tableau de bord','La bibliothèque de widgets et les widgets posés sur le tableau de bord.'],design_sheets:['Fiches personnes et animaux','Les blocs des fiches, leur ordre, les filtres, les générations, la recherche sur internet et les exceptions par fiche.']};
    function splitDesignPage(){
        const page=$('#workspace > .page');if(!page)return;const tab=state.maintenanceTab;
        const partOf=el=>{const t=(el.querySelector(':scope > header .eyebrow, :scope > .eyebrow, header .eyebrow')?.textContent||'').toUpperCase();return /TABLEAU DE BORD/.test(t)?'design_board':/FICHES? (PERSONNES|ANIMAUX)/.test(t)?'design_sheets':'design';};
        [...page.children].forEach(el=>{if(el.matches('.page-header'))return;el.hidden=partOf(el)!==tab;});
        const head=DESIGN_PART_HEAD[tab];if(head){const h=page.querySelector('.page-header');if(h){h.querySelector('h2').textContent=head[0];const p=h.querySelector('p');if(p)p.textContent=head[1];}}
    }
    async function renderDesignTools(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='maintenance'||!DESIGN_TABS.includes(state.maintenanceTab))return;
        const lockData=await api('lock_candidates');
        if(token!==state.workspaceToken||state.module!=='maintenance'||!DESIGN_TABS.includes(state.maintenanceTab))return;
        const design=readDesignSettings();
        const menuHidden=menuHiddenKeys();
        const ownTabs=Object.fromEntries(customTabs().map(t=>[t.id,t]));const menuItems=orderedMenuKeys().map(key=>[key,modules[key]?.[1]||(ownTabs[key]?`${ownTabs[key].icon?ownTabs[key].icon+' ':''}${ownTabs[key].name||'Mon onglet'} (mon onglet)`:key),key!=='maintenance',key==='maintenance'||(!menuHidden.includes(key)&&!ownTabs[key]?.hidden)]);
        const listItems=orderedListTypes(true).map(([key,,label])=>[key,label]);
        const listHidden=listHiddenKeys();
        const mapItems=orderedMapTypes(true).map(([key,,label])=>[key,label]);const mapHidden=mapHiddenKeys();
        const maintenanceItems=orderedMaintenanceTabs().map(([key,,label])=>[key,label]);
        const graphDiagramAllItems=orderedGraphDiagramItems(true).map(([key,,label])=>[key,label]);const graphDiagramHidden=graphDiagramHiddenKeys();
        const graphStatsAllItems=orderedGraphStatsItems(true).map(([key,,label])=>[key,label]);const graphStatsHidden=graphStatsHiddenKeys();
        const tileHidden=tileLayerHiddenKeys();const tileAllCats=orderedTileCategories(true);const tileCatHidden=tileLayerHiddenCategories();
        const dashboardCatalogItems=orderedDashboardWidgetTypes(true).map(([key,,label])=>[key,label]);const dashboardCatalogHidden=dashboardWidgetCatalogHiddenKeys();
        const current=summaryFromState(),personId=Number(state.currentPersonId)||0;
        // la fiche ouverte est-elle un animal ? (son exception se règle dans « Fiches animaux », l'autre est grisée)
        let curIsAnimal=(current?.kind||state.currentPersonKind)==='animal';
        if(personId&&!current?.kind&&!state.currentPersonKind){try{curIsAnimal=(await api('person',{id:personId})).person?.kind==='animal';}catch(_){}}
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">APPARENCE</span><h2>Personnalisation locale</h2><p>Presets, couleur, typo, ordre des menus et ordre des listes. Tout est gardé dans ce navigateur.</p></div></header>
        <form class="maintenance-panel" id="design-form"><div class="form-grid design-primary-grid">${designFieldsHtml(design)}</div>${sosaInlineControlsHtml()}${dabovilleInlineControlsHtml()}${lockInlineControlsHtml(lockData)}<div class="page-actions action-zone design-actions"><button class="button" type="submit">Appliquer</button><button class="button secondary" type="button" id="reset-design">↺ Remettre comme au départ</button><button class="button secondary" type="button" id="save-site-defaults">Définir comme défaut du site</button><button class="button secondary" type="button" id="apply-site-defaults">Appliquer les défauts du site</button></div>${designPresetsHtml(designPresets())}</form>
        <div class="design-order-grid design-order-grid-four">${menuOrderEditor(menuItems)}${graphDiagramOrderEditor(graphDiagramAllItems,graphDiagramHidden)}${graphStatsOrderEditor(graphStatsAllItems,graphStatsHidden)}${`<section class="maintenance-panel order-editor compact"><h3>Ordre des cartes</h3><div class="order-list" id="map-order">${mapItems.map(([key,label],index)=>menuOrderRow(key,label,index,key!=='all',!mapHidden.includes(key))).join('')}</div><div class="page-actions action-zone"><button class="button small" type="button" data-order-save="map-order">Enregistrer</button></div></section>`}${tileCategoryOrderEditor(tileAllCats,tileCatHidden,tileHidden)}${window.LCNDA_SIDEGROUPS?.instances?.listes?.panel('Ordre des listes')??listOrderEditor(listItems,listHidden)}${window.LCNDA_SIDEGROUPS?.instances?.maintenance?.panel('Ordre des pages de Maintenance')??orderEditor('maintenance-order','Ordre des onglets Maintenance',maintenanceItems)}${personBadgeColorPanel()}</div>
        ${lockToolsHtml(lockData)}
        <section class="person-block-config"><header><span class="eyebrow">TABLEAU DE BORD</span><h3>Widgets et bibliothèque</h3><p>Réorganise la bibliothèque de widgets de la colonne de gauche, puis règle les widgets déjà posés sur le tableau de bord.</p></header>
            <div class="design-order-grid block-grid dashboard-widget-settings-grid">${dashboardWidgetCatalogEditor(dashboardCatalogItems,dashboardCatalogHidden)}${dashboardBlockEditor(dashboardBlockSettings(),Object.fromEntries(defaultDashboardBlocks))}</div>
        </section>
        <section class="person-block-config"><header><span class="eyebrow">FICHES PERSONNES</span><h3>Ordre et visibilité des blocs</h3><p>Glisse les blocs pour changer leur ordre. Décoche un bloc pour le masquer.</p><p class="person-exception-summary" data-exception-summary="person-blocks"></p></header>
            <div class="design-order-grid block-grid">${blockOrderEditor('person-blocks-global','Toutes les fiches',personBlockSettings(0,'human'),0,'human')}${personId?blockOrderEditor('person-blocks-person',`Exception pour ${personName(current)}`,personBlockSettings(personId,'human'),personId,'human',curIsAnimal?`La fiche ouverte (${personName(current)}) est un animal : son exception se règle plus bas, dans « Fiches animaux ».`:''):'<section class="maintenance-panel order-editor block-order-editor"><h3>Exception fiche actuelle</h3><p>Ouvre une personne pour créer une exception propre à sa fiche.</p></section>'}</div>
        </section>
        <section class="person-block-config"><header><span class="eyebrow">FICHES ANIMAUX</span><h3>Ordre et visibilité des blocs</h3><p>Les fiches complètes des animaux ont leur propre ordre et leurs propres blocs, sans toucher aux fiches des personnes. Glisse les blocs pour changer leur ordre ; décoche pour masquer.</p></header>
            <div class="design-order-grid block-grid">${blockOrderEditor('animal-blocks-global','Toutes les fiches d’animaux',personBlockSettings(0,'animal'),0,'animal')}${personId?blockOrderEditor('animal-blocks-person',`Exception pour ${personName(current)}`,personBlockSettings(personId,'animal'),personId,'animal',curIsAnimal?'':`La fiche ouverte (${personName(current)}) est une personne : son exception se règle plus haut, dans « Fiches personnes ».`):'<section class="maintenance-panel order-editor block-order-editor"><h3>Exception fiche actuelle</h3><p>Ouvre un animal pour créer une exception propre à sa fiche.</p></section>'}</div>
        </section>
        ${(window.LCNDA_EXT?.designPanels||[]).map(fn=>{try{return fn();}catch(error){console.error(error);return '';}}).join('')}
        <section class="person-block-config"><header><span class="eyebrow">FICHES PERSONNES</span><h3>Filtres du bloc Événements</h3><p>Choisis les types d'événements à afficher dans le bloc Événements. Décoche un type pour le masquer.</p><p class="person-exception-summary" data-exception-summary="events-filter"></p></header>
            <div class="design-order-grid block-grid">${eventsFilterEditor('events-filter-global','Toutes les fiches',eventsFilterSettings(),0)}${personId?eventsFilterEditor('events-filter-person',`Exception pour ${personName(current)}`,eventsFilterSettings(personId),personId):'<section class="maintenance-panel order-editor block-order-editor"><h3>Exception fiche actuelle</h3><p>Ouvre une personne pour créer une exception propre à sa fiche.</p></section>'}</div>
        </section>
        <section class="person-block-config" id="lineage-config"><header><span class="eyebrow">FICHES PERSONNES</span><h3>Ascendants et descendants</h3><p>Nombre de générations affichées dans les blocs « Ascendants » et « Descendants » des fiches. Un trait « ┄ suite » signale qu’il y a d’autres générations au-delà.</p><p class="person-exception-summary" data-exception-summary="lineage"></p></header>
            <div class="design-order-grid block-grid">${lineageSettingsEditor('lineage-global','Toutes les fiches',lineageSettings())}${personId?lineageSettingsEditor('lineage-person',`Exception pour ${personName(current)}`,lineageSettings(personId),personId):'<section class="maintenance-panel order-editor block-order-editor"><h3>Exception fiche actuelle</h3><p>Ouvre une personne pour lui donner son propre réglage.</p></section>'}</div>
        </section>
        <section class="person-block-config" id="web-search-config"><header><span class="eyebrow">FICHES PERSONNES</span><h3>Chercher sur internet</h3><p>Choisis les sites proposés dans le bloc « Chercher sur internet » (fiches et widget) et leur ordre. Glisse pour réordonner, décoche pour masquer.</p><p class="person-exception-summary" data-exception-summary="web-search"></p></header>
            <div class="design-order-grid block-grid">${webSearchSitesEditor('web-search-global','Toutes les fiches',webSearchSettings())}${personId?webSearchSitesEditor('web-search-person',`Exception pour ${personName(current)}`,webSearchSettings(personId),{personId}):'<section class="maintenance-panel order-editor block-order-editor"><h3>Exception fiche actuelle</h3><p>Ouvre une personne pour lui donner ses propres sites.</p></section>'}${webSearchCustomSitesEditorHtml()}</div>
        </section>
        <section class="person-block-config"><header><span class="eyebrow">FICHES PERSONNES</span><h3>Fiches avec un réglage particulier</h3><p>Les fiches qui ont leurs propres blocs, filtres d’événements ou sites de recherche (au lieu du réglage de toutes les fiches).</p></header>
            <div class="design-order-grid block-grid" id="person-exceptions-list"><p class="muted">Recherche des fiches…</p></div>
        </section>
        ${(window.LCNDA_EXT?.designPanelsEnd||[]).map(fn=>{try{return fn();}catch(error){console.error(error);return '';}}).join('')}
        </section>`;
        splitDesignPage();
        enhanceDesignFormOptions(design);
        reorderDesignPrimaryFields();
        $('#design-form').addEventListener('submit',async event=>{
            event.preventDefault();
            const values=formObject(event.currentTarget);
            localStorage.setItem('genealogie-design',JSON.stringify(values));
            saveIdentityNameVariantsDisplay(values.identity_name_variants_display||'if_filled');
            applyDesign();
            if(values.eventDisplayMode){state.eventDisplayMode=values.eventDisplayMode;persistUiState();}
            if(values.defaultMapLocationMode){state.mapLocationMode=values.defaultMapLocationMode;persistUiState();}
            const sosaInput=$('#sosa-root-input');
            const sosaPendingId=Number(sosaInput?.value)||0;
            if(sosaPendingId&&sosaPendingId!==sosaRootId()){
                try{
                    const result=await recalculateSosaMap(sosaPendingId);
                    if(result.root_id){await saveStartPerson(result.root_id);}
                }catch(error){toast(error.message,'error');}
            }
            const dabovilleInput=$('#daboville-root-input');
            const dabovillePendingId=Number(dabovilleInput?.value)||0;
            if(dabovillePendingId&&dabovillePendingId!==dabovilleRootId()){
                try{
                    const result=await recalculateDabovilleMap(dabovillePendingId);
                    if(result.root_id){localStorage.setItem('genealogie-daboville-root-name',$('#daboville-root-search')?.value||`Personne #${dabovillePendingId}`);}
                }catch(error){toast(error.message,'error');}
            }
            toast('Apparence appliquée.');
            if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);
            if(sosaPendingId||dabovillePendingId)renderDesignTools();
        });
        $('#reset-design').addEventListener('click',()=>{localStorage.removeItem('genealogie-design');applyDesign();renderDesignTools();});
        $('#save-site-defaults')?.addEventListener('click',async()=>{
            const designForm=$('#design-form');
            const extra=designForm?{'genealogie-design':JSON.stringify(formObject(designForm))}:{};
            try{
                const result=await api('save_site_defaults',{}, {method:'POST',body:{settings:collectSiteDefaultSettings(extra)}});
                await reloadBootstrap();
                localStorage.setItem(SITE_DEFAULTS_APPLIED_KEY,String(state.bootstrap?.siteDefaults?.updated_at||''));
                toast(`${plural(result.result.count,'réglage défini','réglages définis')} comme défaut du site.`);
            }catch(error){toast(error.message,'error');}
        });
        $('#apply-site-defaults')?.addEventListener('click',()=>{
            const applied=applySiteDefaults(state.bootstrap?.siteDefaults,true);
            toast(applied?'Défauts du site appliqués.':'Aucun défaut de site enregistré.');
            renderDesignTools();
            if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);
        });
        const detectFontsBtn=$('#detect-local-fonts');
        if(detectFontsBtn&&typeof window.queryLocalFonts==='function'){
            detectFontsBtn.hidden=false;
            detectFontsBtn.addEventListener('click',async()=>{
                detectFontsBtn.disabled=true;detectFontsBtn.textContent='Lecture des polices…';
                try{
                    const fonts=await window.queryLocalFonts();
                    const families=[...new Set(fonts.map(f=>f.family))].sort((a,b)=>a.localeCompare(b,'fr'));
                    const select=$('#font-family-select');
                    if(select&&families.length){
                        const previousValue=select.value;
                        let group=select.querySelector('optgroup[data-local-fonts]');
                        if(!group){group=document.createElement('optgroup');group.dataset.localFonts='1';group.label='— Polices de votre ordinateur —';select.appendChild(group);}
                        group.innerHTML='';
                        families.forEach(family=>{
                            const option=document.createElement('option');
                            option.value=`local:${family}`;
                            option.textContent=family;
                            group.appendChild(option);
                        });
                        select.value=previousValue;
                        toast(`${plural(families.length,'police trouvée','polices trouvées')} sur cet ordinateur.`);
                    }else{
                        toast('Aucune police supplémentaire trouvée.','error');
                    }
                }catch(err){
                    toast('Accès aux polices refusé ou indisponible.','error');
                }finally{
                    detectFontsBtn.disabled=false;detectFontsBtn.textContent='Voir toutes les polices de mon ordinateur';
                }
            });
        }
        const presetNameInput=$('#design-preset-name');
        presetNameInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#save-design-preset')?.click();}});
        $('#save-design-preset')?.addEventListener('click',()=>{
            const name=(presetNameInput?.value||'').trim();
            if(!name){toast('Indique un nom pour ce design.','error');presetNameInput?.focus();return;}
            const presets=designPresets();
            const id=String(Date.now());
            const formValues=formObject($('#design-form'));localStorage.setItem('genealogie-design',JSON.stringify(formValues));applyDesign();presets[id]={name,design:formValues};
            saveDesignPresets(presets);
            toast(`Design « ${name} » enregistré.`);
            renderDesignTools();
        });
        $$('[data-apply-preset]').forEach(button=>button.addEventListener('click',()=>{
            const presets=designPresets(),preset=presets[button.dataset.applyPreset];
            if(!preset)return;
            localStorage.setItem('genealogie-design',JSON.stringify(preset.design||{}));
            applyDesign();
            toast(`Design « ${preset.name||'Sans nom'} » appliqué.`);
            renderDesignTools();
        }));
        $$('[data-edit-preset]').forEach(button=>button.addEventListener('click',()=>openEditPresetDialog(button.dataset.editPreset)));
        $$('[data-rename-preset]').forEach(button=>button.addEventListener('click',async()=>{
            const presets=designPresets(),preset=presets[button.dataset.renamePreset];
            if(!preset)return;
            const name=await askText({title:'Renommer le design',message:'Nouveau nom pour ce design :',value:preset.name||'',okLabel:'Renommer'});
            if(name===null)return;
            const trimmed=name.trim();
            if(!trimmed){toast('Le nom ne peut pas être vide.','error');return;}
            preset.name=trimmed;
            saveDesignPresets(presets);
            toast('Design renommé.');
            renderDesignTools();
        }));
        $$('[data-delete-preset]').forEach(button=>button.addEventListener('click',async()=>{
            const presets=designPresets(),preset=presets[button.dataset.deletePreset];
            if(!preset)return;
            if(!await confirmBox('',{title:`Supprimer le design « ${preset.name||'Sans nom'} » ?`,okLabel:'Supprimer le design'}))return;
            delete presets[button.dataset.deletePreset];
            saveDesignPresets(presets);
            toast('Design supprimé.');
            renderDesignTools();
        }));
        $('#apply-person-badge-colors')?.addEventListener('click',()=>{savePersonBadgeColors(personBadgeColorsFromPanel());toast('Couleurs des badges appliquées.');if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);});
        $('#reset-person-badge-colors')?.addEventListener('click',()=>{savePersonBadgeColors(DEFAULT_PERSON_BADGE_COLORS);toast('Couleurs des badges réinitialisées.');renderDesignTools();if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);});
        $('#save-person-badge-preset')?.addEventListener('click',()=>{
            const input=$('#person-badge-preset-name'),name=(input?.value||'').trim();
            if(!name){toast('Indique un nom pour cette palette.','error');input?.focus();return;}
            const presets=getPersonBadgeColorPresets();
            presets[String(Date.now())]={name,colors:personBadgeColorsFromPanel()};
            savePersonBadgeColorPresets(presets);
            toast(`Palette « ${name} » enregistrée.`);
            renderDesignTools();
        });
        $$('[data-apply-person-badge-preset]').forEach(button=>button.addEventListener('click',()=>{
            const preset=getPersonBadgeColorPresets()[button.dataset.applyPersonBadgePreset];
            if(!preset)return;
            savePersonBadgeColors(preset.colors||DEFAULT_PERSON_BADGE_COLORS);
            toast(`Palette « ${preset.name||'Sans nom'} » appliquée.`);
            renderDesignTools();
            if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);
        }));
        $$('[data-delete-person-badge-preset]').forEach(button=>button.addEventListener('click',async()=>{
            const presets=getPersonBadgeColorPresets(),preset=presets[button.dataset.deletePersonBadgePreset];
            if(!preset)return;
            if(!await confirmBox('',{title:`Supprimer la palette « ${preset.name||'Sans nom'} » ?`,okLabel:'Supprimer la palette'}))return;
            delete presets[button.dataset.deletePersonBadgePreset];
            savePersonBadgeColorPresets(presets);
            toast('Palette supprimée.');
            renderDesignTools();
        }));
        $$('.order-list:not(.tile-cat-items)').forEach(setupDragOrder);
        // Tile category drag + item drag between modules
        const tileCatList=$('#tile-cat-order');
        if(tileCatList){
            let draggedCat=null;
            let draggedItem=null;
            tileCatList.addEventListener('dragstart',event=>{
                const catGrip=event.target.closest('.tile-cat-grip');
                if(catGrip){draggedCat=catGrip.closest('.tile-cat-block');if(!draggedCat)return;draggedCat.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';event.stopPropagation();return;}
                const itemGrip=event.target.closest('.order-grip');
                if(itemGrip&&!draggedCat){const row=itemGrip.closest('.order-row');if(!row)return;draggedItem=row;draggedItem.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';return;}
                event.preventDefault();
            });
            tileCatList.addEventListener('dragover',event=>{
                event.preventDefault();
                if(draggedCat){const after=getDragAfterElement(tileCatList,event.clientY,'.tile-cat-block');if(after==null)tileCatList.append(draggedCat);else tileCatList.insertBefore(draggedCat,after);renumberTileCategories(tileCatList);return;}
                if(draggedItem){const targetItems=event.target.closest('.tile-cat-items');if(!targetItems)return;const after=getDragAfterElement(targetItems,event.clientY,'.order-row');if(after==null)targetItems.append(draggedItem);else targetItems.insertBefore(draggedItem,after);$$('.tile-cat-items',tileCatList).forEach(list=>renumberOrderList(list));}
            });
            tileCatList.addEventListener('dragend',()=>{
                draggedCat?.classList.remove('is-dragging');draggedCat=null;
                draggedItem?.classList.remove('is-dragging');draggedItem=null;
                renumberTileCategories(tileCatList);$$('.tile-cat-items',tileCatList).forEach(list=>renumberOrderList(list));
            });
            tileCatList.addEventListener('click',async event=>{
                const btn=event.target.closest('.tile-cat-delete');if(!btn)return;
                const block=btn.closest('.tile-cat-block');if(!block)return;
                const rows=$$('.order-row',block);
                if(rows.length>0&&!await confirmBox(rows.length<2?'Son fond sera déplacé dans le premier module.':`Ses ${plural(rows.length,'fond')} seront déplacés dans le premier module.`,{title:'Supprimer ce module ?',okLabel:'Supprimer le module'}))return;
                const firstOther=$$('.tile-cat-block',tileCatList).find(b=>b!==block);
                if(firstOther){const dest=$('.tile-cat-items',firstOther);rows.forEach(r=>dest.append(r));renumberOrderList(dest);}
                block.remove();renumberTileCategories(tileCatList);
            });
            $('#tile-cat-add')?.addEventListener('click',()=>{
                const newId='custom_'+Date.now();
                const newBlock=document.createElement('div');
                newBlock.className='tile-cat-block';newBlock.dataset.tileCat=newId;
                newBlock.innerHTML=`<div class="tile-cat-header"><span class="order-grip tile-cat-grip" draggable="true" aria-hidden="true">⠿</span><span class="order-number">${String($$('.tile-cat-block',tileCatList).length+1).padStart(2,'0')}</span><input class="tile-cat-label-input" type="text" value="Nouveau module" aria-label="Nom du module"><button class="tile-cat-delete" type="button" title="Supprimer ce module" aria-label="Supprimer">✕</button><label class="order-visible" title="Afficher cette catégorie"><input type="checkbox" class="tile-cat-toggle" checked></label></div><div class="order-list tile-cat-items" id="tile-items-${newId}"></div>`;
                tileCatList.append(newBlock);renumberTileCategories(tileCatList);
                newBlock.querySelector('.tile-cat-label-input')?.focus();
            });
        }
        $$('[data-bulk-lock-untouched]').forEach(button=>button.addEventListener('click',async()=>{
            const locked=Number(button.dataset.bulkLockUntouched)||0;
            if(!await confirmBox('',{title:`${locked?'Verrouiller':'Déverrouiller'} toutes les fiches non modifiées ?`,okLabel:locked?'Verrouiller':'Déverrouiller',danger:false}))return;
            try{const result=await api('bulk_lock_people',{}, {method:'POST',body:{scope:'untouched',locked}});toast(`${locked?plural(result.result.count,'fiche verrouillée','fiches verrouillées'):plural(result.result.count,'fiche déverrouillée','fiches déverrouillées')}.`);await renderDesignTools();}catch(error){toast(error.message,'error');}
        }));
        $$('[data-set-listed-person-lock]').forEach(button=>button.addEventListener('click',async()=>{
            try{const locked=Number(button.dataset.lockValue)||0;await api('set_person_lock',{}, {method:'POST',body:{person_id:button.dataset.setListedPersonLock,locked}});toast(locked?'Fiche verrouillée.':'Fiche déverrouillée.');await renderDesignTools();}catch(error){toast(error.message,'error');}
        }));
        $('#sosa-use-current')?.addEventListener('click',()=>{
            if(!state.currentPersonId)return;
            const current=summaryFromState(),name=current?personName(current):`Personne #${state.currentPersonId}`;
            $('#sosa-root-input').value=state.currentPersonId;$('#sosa-root-search').value=name;
            pkSet($('#sosa-root-pick .pk'),{id:Number(state.currentPersonId),title:name,kind:'person'});
        });
        // la racine Sosa : menu de choix unique ; les champs cachés #sosa-root-input / #sosa-root-search suivent
        $('#sosa-root-pick')?.addEventListener('picker-change',event=>{const it=event.detail.item;$('#sosa-root-input').value=it&&!it.free?it.id:'';$('#sosa-root-search').value=it?it.title:'';});
        $('#sosa-recalculate')?.addEventListener('click',async()=>{
            const input=$('#sosa-root-input');
            const rootId=Number(input?.value)||0;
            if(!rootId){toast('Choisis la personne n°1 (de cujus).','error');return;}
            try{
                const result=await recalculateSosaMap(rootId);
                if(!result.root_id){toast('Personne introuvable.','error');return;}
                await saveStartPerson(result.root_id);
                toast(`Numérotation Sosa recalculée : ${plural(result.count,'personne')}.`);
                renderDesignTools();
                if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);
            }catch(error){toast(error.message,'error');}
        });
        $('#sosa-clear')?.addEventListener('click',async()=>{
            await recalculateSosaMap(0);
            localStorage.removeItem('genealogie-sosa-root-name');localStorage.setItem('genealogie-sosa-off','1');
            toast('Numérotation Sosa retirée.');
            renderDesignTools();
            if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);
        });
        $('#daboville-use-current')?.addEventListener('click',()=>{
            if(!state.currentPersonId)return;
            const current=summaryFromState(),name=current?personName(current):`Personne #${state.currentPersonId}`;
            $('#daboville-root-input').value=state.currentPersonId;$('#daboville-root-search').value=name;
            pkSet($('#daboville-root-pick .pk'),{id:Number(state.currentPersonId),title:name,kind:'person'});
        });
        $('#daboville-root-pick')?.addEventListener('picker-change',event=>{const it=event.detail.item;$('#daboville-root-input').value=it&&!it.free?it.id:'';$('#daboville-root-search').value=it?it.title:'';});
        $('#daboville-recalculate')?.addEventListener('click',async()=>{
            const input=$('#daboville-root-input');
            const rootId=Number(input?.value)||0;
            if(!rootId){toast("Choisis la personne n°1 d'Aboville.",'error');return;}
            try{
                const result=await recalculateDabovilleMap(rootId);
                if(!result.root_id){toast('Personne introuvable.','error');return;}
                localStorage.setItem('genealogie-daboville-root-name',$('#daboville-root-search')?.value||`Personne #${rootId}`);
                toast(`Numérotation d'Aboville recalculée : ${plural(result.count,'personne')}.`);
                renderDesignTools();
                if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);
            }catch(error){toast(error.message,'error');}
        });
        $('#daboville-clear')?.addEventListener('click',async()=>{
            await recalculateDabovilleMap(0);
            localStorage.removeItem('genealogie-daboville-root-name');
            toast("Numérotation d'Aboville retirée.");
            renderDesignTools();
            if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);
        });
        $$('[data-block-width]').forEach(button=>button.addEventListener('click',()=>{const group=button.closest('.block-widths');$$('[data-block-width]',group).forEach(item=>item.setAttribute('aria-pressed',String(item===button)));}));
        $('[data-menu-names-reset]')?.addEventListener('click',()=>{localStorage.removeItem('genealogie-menu-names');applyMenuOrder();renderSidebar();renderDesignTools();toast('Noms d’origine des onglets remis.');});
        $$('[data-order-save]').forEach(button=>button.addEventListener('click',()=>{
            if(button.dataset.orderSave==='tile-layers'){
                const catList=$('#tile-cat-order');if(!catList)return;
                const catBlocks=$$('.tile-cat-block',catList);
                const catOrder=catBlocks.map(b=>b.dataset.tileCat);
                const catHidden=catBlocks.filter(b=>!b.querySelector('.tile-cat-toggle')?.checked).map(b=>b.dataset.tileCat);
                const itemHidden=[];catBlocks.forEach(b=>{$$('.order-row',b).filter(r=>!$('.order-visible input',r)?.checked).forEach(r=>itemHidden.push(r.dataset.orderKey));});
                const customCats=catBlocks.map(b=>{const id=b.dataset.tileCat;const label=b.querySelector('.tile-cat-label-input')?.value.trim()||id;const items=$$('.order-row',b).map(r=>r.dataset.orderKey);return{id,label,items};});
                localStorage.setItem('genealogie-tile-cat-order',JSON.stringify(catOrder));
                localStorage.setItem('genealogie-tile-hidden-cats',JSON.stringify(catHidden));
                localStorage.setItem('genealogie-tile-hidden',JSON.stringify(itemHidden));
                localStorage.setItem('genealogie-tile-custom-cats',JSON.stringify(customCats));
                customCats.forEach(({id,items})=>localStorage.setItem(`genealogie-tile-items-${id}`,JSON.stringify(items)));
                renderDesignTools();toast('Fonds de cartes enregistrés.');return;
            }
            const list=$(`#${button.dataset.orderSave}`);if(!list)return;
            const rows=$$('.order-row',list),keys=rows.map(row=>row.dataset.orderKey);
            if(button.dataset.orderSave==='menu-order'){const hidden=rows.filter(row=>!$('.order-visible input',row)?.checked).map(row=>row.dataset.orderKey);localStorage.setItem('genealogie-menu-order',JSON.stringify(keys));localStorage.setItem('genealogie-menu-hidden',JSON.stringify(hidden));const names={};rows.forEach(row=>{const v=($('[data-menu-name]',row)?.value||'').trim().slice(0,40);if(v)names[row.dataset.orderKey]=v;});localStorage.setItem('genealogie-menu-names',JSON.stringify(names));localStorage.setItem('genealogie-menu-animaux','1');localStorage.setItem('genealogie-menu-fiches','1');localStorage.setItem('genealogie-menu-adn','1');
                const own=customTabs();if(own.some(t=>!!t.hidden!==hidden.includes(t.id))){own.forEach(t=>{t.hidden=hidden.includes(t.id);});try{localStorage.setItem('genealogie-custom-tabs',JSON.stringify(own));}catch(_){}}applyMenuOrder();renderDesignTools();toast('Ordre du menu enregistré.');return;}
            if(button.dataset.orderSave==='list-order'){const hidden=rows.filter(row=>!$('.order-visible input',row)?.checked).map(row=>row.dataset.orderKey);localStorage.setItem('genealogie-list-order',JSON.stringify(keys));localStorage.setItem('genealogie-list-hidden',JSON.stringify(hidden));renderSidebar();renderDesignTools();toast('Ordre des listes enregistré.');return;}
            if(button.dataset.orderSave==='dashboard-widget-catalog-order'){const hidden=rows.filter(row=>!$('.order-visible input',row)?.checked).map(row=>row.dataset.orderKey);localStorage.setItem('genealogie-dashboard-widget-catalog-order',JSON.stringify(keys));localStorage.setItem('genealogie-dashboard-widget-catalog-hidden',JSON.stringify(hidden));renderSidebar();renderDesignTools();toast('Bibliothèque de widgets enregistrée.');return;}
            if(button.dataset.orderSave==='map-order'){const hidden=rows.filter(row=>!$('.order-visible input',row)?.checked).map(row=>row.dataset.orderKey);localStorage.setItem('genealogie-map-order',JSON.stringify(keys));localStorage.setItem('genealogie-map-hidden',JSON.stringify(hidden));renderSidebar();renderDesignTools();toast('Ordre des cartes enregistré.');return;}
            if(button.dataset.orderSave==='maintenance-order'){localStorage.setItem('genealogie-maintenance-order',JSON.stringify(keys));renderSidebar();renderDesignTools();toast('Ordre des onglets Maintenance enregistré.');return;}
            if(button.dataset.orderSave==='graph-diagram-order'){const hidden=rows.filter(row=>!$('.order-visible input',row)?.checked).map(row=>row.dataset.orderKey);localStorage.setItem('genealogie-graph-diagram-order',JSON.stringify(keys));localStorage.setItem('genealogie-graph-diagram-hidden',JSON.stringify(hidden));renderSidebar();renderDesignTools();toast('Ordre des diagrammes enregistré.');return;}
            if(button.dataset.orderSave==='graph-stats-order'){const hidden=rows.filter(row=>!$('.order-visible input',row)?.checked).map(row=>row.dataset.orderKey.replace(/^stats:/,''));localStorage.setItem('genealogie-graph-stats-order',JSON.stringify(keys.map(k=>k.replace(/^stats:/,''))));localStorage.setItem('genealogie-graph-stats-hidden',JSON.stringify(hidden));renderSidebar();renderDesignTools();toast('Ordre des statistiques enregistré.');return;}
            if(button.dataset.orderSave==='dashboard-blocks'){
                const dashList=$('#dashboard-blocks');
                if(!dashList)return;
                const current=dashboardBlockSettings();
                const byId=Object.fromEntries((current.widgets||[]).map(widget=>[widget.id,widget]));
                const widgets=$$('.order-row',dashList).map(row=>{
                    const widget={...(byId[row.dataset.widgetId]||dashboardNewWidget(row.dataset.widgetType||'stats'))};
                    widget.id=row.dataset.widgetId||widget.id;
                    widget.type=row.dataset.widgetType||widget.type;
                    widget.width=$('.block-widths [aria-pressed="true"]',row)?.dataset.blockWidth||widget.width||defaultDashboardBlockSpans[widget.type]||'6';
                    const input=$('.dashboard-limit input',row);
                    if(input)widget.limit=widget.type==='person_quiz'
                        ?Math.max(3,Math.min(8,Number(input.value)||defaultDashboardBlockLimits.person_quiz||4))
                        :Math.max(1,Math.min(80,Number(input.value)||defaultDashboardBlockLimits[widget.type]||6));
                    return widget;
                });
                saveDashboardBlockSettings({widgets});
                toast('Widgets du tableau de bord enregistrés.');
                renderDesignTools();
                return;
            }
            if(button.dataset.orderSave.startsWith('person-blocks')||button.dataset.orderSave.startsWith('animal-blocks')){
                const hidden=rows.filter(row=>!$('.order-visible input',row)?.checked).map(row=>row.dataset.orderKey);
                const widths=Object.fromEntries(rows.map(row=>[row.dataset.orderKey,$('.block-widths [aria-pressed="true"]',row)?.dataset.blockWidth||defaultPersonBlockSpans[row.dataset.orderKey]||'12']));
                const section=list.closest('.order-editor');
                const hideEmptyIdentity=!!$('[data-hide-empty-identity]',section)?.checked;
                savePersonBlockSettings({order:keys,hidden,widths,hideEmptyIdentity},Number(button.dataset.personBlockId)||0,button.dataset.blockKind==='animal'?'animal':'human');
                toast(Number(button.dataset.personBlockId)?'Exception de fiche enregistrée.':button.dataset.blockKind==='animal'?'Blocs des fiches d’animaux enregistrés.':'Blocs des fiches enregistrés.');
                if(state.module==='maintenance')renderDesignTools();
            }
        }));
        $$('[data-reset-person-blocks]').forEach(button=>button.addEventListener('click',()=>{localStorage.removeItem(`genealogie-person-blocks-${button.dataset.resetPersonBlocks}`);toast('Exception supprimée.');renderDesignTools();}));
        $$('[data-events-filter-save]').forEach(button=>button.addEventListener('click',()=>{const listId=button.dataset.eventsFilterSave;const list=$(`#${listId}`);if(!list)return;const personId=Number(button.dataset.eventsFilterPersonId)||0;const hiddenTypeIds=$$('.events-filter-row[data-filter-type-id]',list).filter(row=>!$('input[type=checkbox]',row)?.checked).map(row=>Number(row.dataset.filterTypeId));const showCensus=!!$('.events-filter-row[data-filter-census] input[type=checkbox]',list)?.checked;saveEventsFilterSettings({hiddenTypeIds,showCensus},personId);toast(personId?'Exception de filtres enregistrée.':'Filtres des événements enregistrés.');if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);}));
        $$('[data-reset-events-filter]').forEach(button=>button.addEventListener('click',()=>{localStorage.removeItem(`genealogie-events-filter-${button.dataset.resetEventsFilter}`);toast('Exception de filtres supprimée.');renderDesignTools();}));
        bindWebSearchSitesEditors($("#workspace"));bindLineageSettingsEditors($("#workspace"));
        $$('[data-web-search-save]').forEach(button=>button.addEventListener('click',()=>{const list=document.getElementById(button.dataset.webSearchSave);if(!list)return;saveWebSearchSettings(readWebSearchSitesEditor(list),Number(button.dataset.webSearchPersonId)||0);toast('Sites de recherche enregistrés.');renderDesignTools();}));
        $$('[data-reset-web-search]').forEach(button=>button.addEventListener('click',()=>{localStorage.removeItem(`genealogie-web-search-${button.dataset.resetWebSearch}`);toast('Exception de sites supprimée.');renderDesignTools();}));
        $('#ws-custom-add')?.addEventListener('click',async()=>{const label=$('#ws-custom-label').value.trim();const url=$('#ws-custom-url').value.trim();if(!label||!/^https?:\/\/\S+$/i.test(url)){toast('Indique un nom et une adresse qui commence par https://','error');return;}if(!/\{(prénom|prenom|nom|nom_complet|lieu|année|annee|de|à|a|conjoint|requête|requete)\}/i.test(url)&&!await confirmBox('Cette adresse ne contient aucun champ comme {nom} : elle ouvrira toujours la même page.',{title:'Ajouter ce site quand même ?',okLabel:'Ajouter quand même',danger:false}))return;saveWebSearchCustomSites([...webSearchCustomSites(),{key:`custom-${Date.now().toString(36)}`,label,url}]);toast('Site ajouté.');renderDesignTools();});
        $$('[data-ws-custom-delete]').forEach(button=>button.addEventListener('click',async()=>{if(!await confirmBox('',{title:'Supprimer ce site de la liste ?',okLabel:'Supprimer le site'}))return;saveWebSearchCustomSites(webSearchCustomSites().filter(site=>site.key!==button.dataset.wsCustomDelete));toast('Site supprimé.');renderDesignTools();}));
        renderPersonExceptionsList();
        (window.LCNDA_EXT?.afterDesign||[]).forEach(fn=>{try{fn();}catch(error){console.error(error);}});
    }

    function setupDragOrder(list){
        let dragged=null;
        list.addEventListener('dragstart',event=>{const grip=event.target.closest('.order-grip');if(!grip){event.preventDefault();return;}dragged=grip.closest('.order-row');if(!dragged)return;dragged.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';});
        list.addEventListener('dragover',event=>{if(!dragged)return;event.preventDefault();const after=getDragAfterElement(list,event.clientY);if(after==null)list.append(dragged);else list.insertBefore(dragged,after);renumberOrderList(list);});
        list.addEventListener('dragend',()=>{dragged?.classList.remove('is-dragging');dragged=null;renumberOrderList(list);});
    }
    function getDragAfterElement(list,y,selector='.order-row'){return $$(selector+':not(.is-dragging)',list).reduce((closest,child)=>{const box=child.getBoundingClientRect();const offset=y-box.top-box.height/2;return offset<0&&offset>closest.offset?{offset,element:child}:closest;},{offset:Number.NEGATIVE_INFINITY,element:null}).element;}
    function renumberTileCategories(list){$$('.tile-cat-block',list).forEach((cat,i)=>{const num=cat.querySelector('.order-number');if(num)num.textContent=String(i+1).padStart(2,'0');});}
    function setupSavedViewsDrag(list,onReorder){
        if(!list)return;
        let dragged=null;
        list.addEventListener('dragstart',event=>{
            const grip=event.target.closest('.saved-grip');
            if(!grip){event.preventDefault();return;}
            dragged=grip.closest('[data-view-id]');
            if(!dragged)return;
            dragged.classList.add('is-dragging');
            event.dataTransfer.effectAllowed='move';
        });
        list.addEventListener('dragover',event=>{
            if(!dragged)return;
            event.preventDefault();
            const after=$$('[data-view-id]:not(.is-dragging)',list).reduce((closest,child)=>{
                const box=child.getBoundingClientRect(),offset=event.clientY-box.top-box.height/2;
                return offset<0&&offset>closest.offset?{offset,element:child}:closest;
            },{offset:Number.NEGATIVE_INFINITY,element:null}).element;
            if(after==null)list.append(dragged);else list.insertBefore(dragged,after);
        });
        list.addEventListener('dragend',async ()=>{
            dragged?.classList.remove('is-dragging');
            dragged=null;
            if(onReorder){
                const ids=$$('[data-view-id]',list).map(el=>Number(el.dataset.viewId));
                await onReorder(ids);
            }
        });
    }
    function renumberOrderList(list){$$('.order-row',list).forEach((row,index)=>{$('.order-number',row).textContent=String(index+1).padStart(2,'0');});}
    function setupMediaDragOrder(grid,personId,lockSelector='#media-order-lock'){
        if(!grid)return;
        let dragged=null;
        const isUnlocked=()=>$(lockSelector)?.dataset.locked==='0';
        grid.addEventListener('dragstart',event=>{if(!isUnlocked()){event.preventDefault();return;}const item=event.target.closest('.media-card-item')||event.target.closest('.media-item');if(!item){event.preventDefault();return;}dragged=item;item.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';});
        grid.addEventListener('dragover',event=>{if(!dragged||!isUnlocked())return;event.preventDefault();const after=getMediaDragAfterElement(grid,event.clientX,event.clientY);$$('.media-drop-target',grid).forEach(el=>el.classList.remove('media-drop-target'));(after||grid.lastElementChild)?.classList.add('media-drop-target',after?'drop-before':'drop-after');});
        grid.addEventListener('dragleave',event=>{if(!event.relatedTarget||!grid.contains(event.relatedTarget)){$$('.media-drop-target',grid).forEach(el=>el.classList.remove('media-drop-target','drop-before','drop-after'));}});
        grid.addEventListener('drop',event=>{event.preventDefault();if(!dragged||!isUnlocked())return;const after=getMediaDragAfterElement(grid,event.clientX,event.clientY);$$('.media-drop-target',grid).forEach(el=>el.classList.remove('media-drop-target','drop-before','drop-after'));if(after==null)grid.append(dragged);else grid.insertBefore(dragged,after);});
        grid.addEventListener('dragend',async()=>{
            $$('.media-drop-target',grid).forEach(el=>el.classList.remove('media-drop-target','drop-before','drop-after'));
            if(!dragged)return;
            dragged.classList.remove('is-dragging');
            dragged=null;
            const ids=$$('.media-item',grid).map(item=>Number(item.dataset.mediaId));
            try{await api('reorder_entity_media',{}, {method:'POST',body:{entity_type:'person',entity_id:personId,person_id:personId,media_ids:ids}});}catch(error){toast(error.message,'error');}
            if(lockSelector==='#media-order-lock'){setMediaOrderPreference(personId,{mode:'manual',ids});const select=$('#person-media-sort');if(select)select.value='manual';}
        });
    }
    function getMediaDragAfterElement(grid,x,y){
        // Find the element that the dragged item should be inserted BEFORE.
        // Strategy: find which cell the cursor is over (by row then column),
        // and insert before the first cell whose center is to the right or below.
        const selector=grid.querySelector('.media-card-item')?'.media-card-item:not(.is-dragging)':'.media-item:not(.is-dragging)';
        return $$(selector,grid).reduce((closest,child)=>{
            const box=child.getBoundingClientRect();
            const centerX=box.left+box.width/2,centerY=box.top+box.height/2;
            // Is cursor above this element's center row? → insert before it
            // Is cursor on same row and to the left of its center? → insert before it
            const sameRow=Math.abs(y-centerY)<box.height*0.6;
            const isBefore=y<centerY-box.height*0.4||(sameRow&&x<centerX);
            if(!isBefore)return closest;
            // Among all candidates, pick the one closest in document order
            // (smallest centerY first, then smallest centerX)
            const score=centerY*100000+centerX;
            if(score<closest.score)return {score,element:child};
            return closest;
        },{score:Number.POSITIVE_INFINITY,element:null}).element;
    }

    function bindDialogs(){
        $$('dialog button[value="cancel"]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();button.closest('dialog')?.close();}));
        $('#person-form').addEventListener('submit',async event=>{event.preventDefault();const personForm=event.currentTarget;try{const result=await api('save_person',{}, {method:'POST',body:formObject(personForm)});for(const fn of (window.LCNDA_EXT?.afterPersonSave||[])){try{await fn(result.result,personForm);}catch(error){console.error(error);}}$('#person-dialog').close();state.currentPersonId=Number(result.result.id);toast('Fiche enregistrée.');await loadPeople();await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        $('#military-form').addEventListener('submit',async event=>{event.preventDefault();try{const values=formObject(event.currentTarget);await api('save_military',{},{method:'POST',body:values});$('#military-dialog').close();toast('Informations militaires enregistrées.');await selectPerson(Number(values.person_id));}catch(error){toast(error.message,'error');}});
        $('#grave-form').addEventListener('submit',async event=>{event.preventDefault();try{const values=formObject(event.currentTarget);values.city=values.place_name||'';values.gps_lat=values.precise_lat||'';values.gps_lon=values.precise_lon||'';await api('save_grave',{},{method:'POST',body:values});$('#grave-dialog').close();toast('Sépulture enregistrée.');await selectPerson(Number(values.person_id));}catch(error){toast(error.message,'error');}});
        $('#grave-form').addEventListener('click',e=>{
            const btn=e.target.closest('#grave-precise-open');
            if(btn){e.preventDefault();openPreciseMapDialog(btn,'#grave-form',renderGravePreciseBlock);return;}
            const clear=e.target.closest('#grave-precise-clear');
            if(clear){e.preventDefault();const form=$('#grave-form');form.elements.precise_lat.value='';form.elements.precise_lon.value='';renderGravePreciseBlock(form,null);return;}
        });
        $('#grave-person-form').addEventListener('submit',async event=>{event.preventDefault();try{const form=event.currentTarget;const personId=form.elements.selected_person_id.value;if(!Number(personId)){toast('Choisis une personne.','error');return;}await api('add_grave_person',{},{method:'POST',body:{grave_id:form.elements.grave_id.value,person_id:personId}});$('#grave-person-dialog').close();toast('Personne ajoutée à la sépulture.');await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        pkBindQuickCreate($('#grave-person-dialog')); // la personne : menu de choix unique (champ selected_person_id)
        $('#event-form').addEventListener('submit',async event=>{event.preventDefault();if(event.currentTarget.elements.work_fields)event.currentTarget.elements.work_fields.value=collectEventWorkFields();const values=formObject(event.currentTarget);if(event.currentTarget.elements.date_uncertain)values.date_uncertain=event.currentTarget.elements.date_uncertain.checked?'1':'0';try{const result=await api(values.id?'save_event':'add_event',{}, {method:'POST',body:values});const savedId=Number(values.id||result?.result?.id||0);await applyLabelPickerAfterSave('#event-label-picker',savedId);if(savedId&&state.eventWitnesses!==undefined){try{const sponsors=isBaptismEventType(values.event_type_id)?(state.eventSponsors||[]):[];const linked=[...sponsors.map(s=>({person_id:s.person_id,note:sponsorNote(s)})),...state.eventWitnesses.map(w=>({person_id:w.person_id,note:w.note||''}))];await api('save_event_witnesses',{},{method:'POST',body:{event_id:savedId,witnesses:JSON.stringify(linked)}});}catch(_){}}$('#event-dialog').close();toast(values.id?'Événement modifié.':'Événement ajouté.');await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        (()=>{const wrap=$('#event-form .date-text-wrap');if(!wrap)return;const textInput=wrap.querySelector('[name="date_text"]');const hiddenPicker=wrap.querySelector('.date-picker-hidden');const toggleBtn=wrap.querySelector('.date-picker-toggle');if(!textInput||!hiddenPicker||!toggleBtn)return;toggleBtn.addEventListener('click',()=>{hiddenPicker.valueAsDate=null;const iso=dateTextToIso(textInput.value);if(iso)hiddenPicker.value=iso;try{if(hiddenPicker.showPicker)hiddenPicker.showPicker();else hiddenPicker.click();}catch(_){hiddenPicker.click();}});hiddenPicker.addEventListener('change',()=>{if(hiddenPicker.value){textInput.value=isoToDateText(hiddenPicker.value);textInput.dispatchEvent(new Event('input'));}});bindEventDateAlternative();})();
        (()=>{const wrap=$('#media-form .date-text-wrap');if(!wrap)return;const textInput=wrap.querySelector('[name="date_text"]');const hiddenPicker=wrap.querySelector('.date-picker-hidden');const toggleBtn=wrap.querySelector('.date-picker-toggle');if(!textInput||!hiddenPicker||!toggleBtn)return;toggleBtn.addEventListener('click',()=>{hiddenPicker.valueAsDate=null;const iso=dateTextToIso(textInput.value);if(iso)hiddenPicker.value=iso;try{if(hiddenPicker.showPicker)hiddenPicker.showPicker();else hiddenPicker.click();}catch(_){hiddenPicker.click();}});hiddenPicker.addEventListener('change',()=>{if(hiddenPicker.value){textInput.value=isoToDateText(hiddenPicker.value);textInput.dispatchEvent(new Event('input'));}});})();
        (()=>{const textInput=$('#lightbox-date');const hiddenPicker=$('#lightbox-date-picker');const toggleBtn=$('#lightbox-date-toggle');if(!textInput||!hiddenPicker||!toggleBtn)return;toggleBtn.addEventListener('click',()=>{hiddenPicker.valueAsDate=null;const iso=dateTextToIso(textInput.value);if(iso)hiddenPicker.value=iso;try{if(hiddenPicker.showPicker)hiddenPicker.showPicker();else hiddenPicker.click();}catch(_){hiddenPicker.click();}});hiddenPicker.addEventListener('change',()=>{if(hiddenPicker.value){textInput.value=isoToDateText(hiddenPicker.value);textInput.dispatchEvent(new Event('input'));}});})();
        // Position précise sur la carte
        $('#event-form').addEventListener('click',e=>{
            const btn=e.target.closest('#event-precise-open');
            if(btn){e.preventDefault();openPreciseMapDialog(btn);return;}
            const clear=e.target.closest('#event-precise-clear');
            if(clear){e.preventDefault();const form=$('#event-form');form.elements.precise_lat.value='';form.elements.precise_lon.value='';renderEventPreciseBlock(form,null);return;}
        });
        // Position précise sur la carte (recensement, même mécanisme que pour les événements)
        $('#census-form').addEventListener('click',e=>{
            const btn=e.target.closest('#census-precise-open');
            if(btn){e.preventDefault();openPreciseMapDialog(btn,'#census-form',renderCensusPreciseBlock);return;}
            const clear=e.target.closest('#census-precise-clear');
            if(clear){e.preventDefault();const form=$('#census-form');form.elements.precise_lat.value='';form.elements.precise_lon.value='';renderCensusPreciseBlock(form,null);return;}
        });
        $('#event-type-form').addEventListener('submit',async event=>{event.preventDefault();try{const result=await api('add_event_type',{}, {method:'POST',body:formObject(event.currentTarget)});$('#event-type-dialog').close();await reloadBootstrap();fillEventTypes(result.result.id,result.result.scope||'person');$('#event-dialog').showModal();toast('Type d’événement créé.');}catch(error){toast(error.message,'error');}});
        $('#open-event-type').addEventListener('click',()=>{$('#event-dialog').close();$('#event-type-dialog').showModal();});
        $('#former-place-toggle')?.addEventListener('click',()=>{const fields=$('#former-place-fields');const open=!fields.hidden;fields.hidden=open;$('#former-place-toggle').setAttribute('aria-expanded',String(!open));});
        $('#add-sponsor-btn')?.addEventListener('click',()=>openSponsorSearch());
        $('#add-witness-btn').addEventListener('click',()=>openWitnessSearch());
        $('#relation-form').elements.entry_mode.addEventListener('change',event=>{const creating=event.target.value==='new',linking=event.target.value==='existing';$('#relation-existing-fields').hidden=!linking;$('#relation-new-fields').hidden=!creating;});
        // la personne liée : menu de choix unique (champ related_id) ; « ＋ Créer la fiche » passe au mode « nouvelle personne » prérempli
        $('#relation-search').addEventListener('picker-change',event=>{const form=$('#relation-form'),it=event.detail.item;if(it&&Number(it.id)===Number(form.elements.person_id.value)){toast('Choisis une autre personne que celle-ci.','error');pkSet(event.currentTarget,null);}});
        $('#relation-search').addEventListener('picker-create',event=>{if(event.detail.kind!=='person')return;event.preventDefault();const form=$('#relation-form'),words=String(event.detail.text||'').trim().split(/\s+/);form.elements.entry_mode.value='new';form.elements.entry_mode.dispatchEvent(new Event('change'));form.elements.new_last_name.value=words.length>1?words[words.length-1]:words[0]||'';form.elements.new_first_name.value=words.length>1?words.slice(0,-1).join(' '):'';form.elements.new_first_name.focus();});
        $('#relation-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,values=formObject(form);try{if(['none','none_suspected'].includes(values.entry_mode)){await api('set_relation_status',{}, {method:'POST',body:{person_id:values.person_id,relation_type:values.relation_type,status:values.entry_mode}});$('#relation-dialog').close();toast('Mention familiale enregistrée.');await selectPerson(Number(values.person_id));return;}let relatedId=Number(values.related_id)||0;if(values.entry_mode==='new'){const created=await api('save_person',{}, {method:'POST',body:{first_name:values.new_first_name,last_name:values.new_last_name,gender:values.new_gender,living_status:values.new_living_status}});relatedId=Number(created.result.id);}if(!relatedId)throw new Error('Choisis une personne dans les résultats.');await api('add_relation',{}, {method:'POST',body:{person_id:values.person_id,related_id:relatedId,relation_type:values.relation_type}});$('#relation-dialog').close();toast('Relation familiale ajoutée.');await loadPeople();await selectPerson(Number(values.person_id));}catch(error){toast(error.message,'error');}});
        $('#note-form').addEventListener('submit',async event=>{event.preventDefault();const values=formObject(event.currentTarget);try{const result=await api(values.id?'save_note':'add_note',{}, {method:'POST',body:values});const savedId=Number(values.id||result?.result?.id||0);await applyLabelPickerAfterSave('#note-label-picker',savedId);$('#note-dialog').close();toast(values.id?'Note modifiée.':'Note ajoutée.');await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        $('#online-sheet-add-field').addEventListener('click',()=>{const list=$('#online-sheet-checks-list');list.insertAdjacentHTML('beforeend',onlineSheetCheckRowHtml(`custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`,'',null,true));list.lastElementChild.querySelector('[data-check-label]')?.focus();});
        $('#online-sheet-checks-list').addEventListener('click',event=>{if(event.target.closest('[data-check-remove]'))event.target.closest('.online-sheet-check-row')?.remove();});
        $('#online-sheet-shot-file').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)uploadOnlineSheetShot(file);});
        $('#online-sheet-dialog').addEventListener('paste',event=>{if(event.target.matches?.('input[type=text],input:not([type]),textarea')&&!(event.clipboardData?.files||[]).length)return;const file=[...(event.clipboardData?.files||[])].find(f=>/^image\//.test(f.type));if(file){event.preventDefault();uploadOnlineSheetShot(file);}});
        $('#online-sheet-form').addEventListener('submit',async event=>{event.preventDefault();const values=formObject(event.currentTarget);values.checks=JSON.stringify(collectOnlineSheetChecks());try{await api('save_online_sheet',{}, {method:'POST',body:values});$('#online-sheet-dialog').close();toast(values.id?'Fiche en ligne modifiée.':'Fiche en ligne ajoutée.');await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        $('#source-form').elements.entity_type.addEventListener('change',updateSourceTargetFields);
        $('#source-form').addEventListener('submit',async event=>{event.preventDefault();const values=formObject(event.currentTarget);try{const result=await api(values.id?'save_source':'add_web_source',{}, {method:'POST',body:values});const savedId=Number(values.id||result?.result?.id||0);await applyLabelPickerAfterSave('#source-label-picker',savedId);$('#source-dialog').close();toast(values.id?'Source modifiée.':'Source ajoutée.');await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        $('#media-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const battueItemId=Number(form.elements.battue_item_id?.value)||0;const isMilitary=!battueItemId&&form.elements.event_id.value==='__military';const idDocumentTypes={'__voter_card':'voter_card','__id_card':'id_card','__permit':'driving_permit'};const idDocumentSubjectType=!battueItemId?(idDocumentTypes[form.elements.event_id.value]||''):'';const personId=Number(form.elements.person_id.value)||state.currentPersonId;const body=new FormData(form);if(![...(body.getAll('files[]'))].filter(f=>f&&f.size>0).length){toast('Sélectionne au moins un fichier ou un dossier.','error');return;}if(battueItemId){body.set('person_id','');body.set('event_id','');body.set('census_id','');body.set('investigation_id','');}if(isMilitary){body.set('event_id','');body.set('entity_type_override','military');}if(idDocumentSubjectType){body.set('event_id','');}body.append('csrf',state.csrf);try{const response=await fetch('upload.php',{method:'POST',body});const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Import impossible');for(const mediaId of (result.media||[])){await applyLabelPickerAfterSave('#media-label-picker',Number(mediaId));}const isCorrespondence=!$('#media-correspondence-fields').hidden;const dateText=form.elements.date_text?.value||'';const dateCalendar=form.elements.date_calendar?.value||'gregorian';const mediaSubjectType=idDocumentSubjectType||form.elements.media_subject_type?.value||'';const replyTo=form.elements.correspondence_reply_to_media_id?.value||'';if((isCorrespondence||dateText||dateCalendar!=='gregorian'||mediaSubjectType||replyTo)&&(result.media||[]).length){const customType=(form.elements.correspondence_type_custom?.value||'').trim();const correspondenceType=isCorrespondence?(customType?`custom:${customType}`:(form.elements.correspondence_type?.value||'')):'';const correspondentNames=isCorrespondence?($('#media-correspondent-value')?.value||'[]'):'[]';for(const mediaId of (result.media||[])){const saveBody={media_id:mediaId};if(dateText)saveBody.date_text=dateText;saveBody.date_calendar=dateCalendar;if(mediaSubjectType)saveBody.media_subject_type=mediaSubjectType;if(isCorrespondence){saveBody.correspondence_type=correspondenceType;saveBody.correspondent_names=correspondentNames;if(replyTo)saveBody.correspondence_reply_to_media_id=replyTo;}await api('save_media',{},{method:'POST',body:saveBody});}}if(isMilitary&&(result.media||[]).length){await api('link_entity_media',{},{method:'POST',body:{entity_type:'military',entity_id:personId,person_id:personId,media_ids:result.media}});}$('#media-dialog').close();toast(`${plural(result.media.length,'média importé','médias importés')}.`);if(battueItemId)await renderBattueDetail(state.currentBattueId);else if(form.elements.investigation_id.value)await renderInvestigationDetail(Number(form.elements.investigation_id.value));else await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        // Boutons Fichiers / Dossier dans #media-dialog
        (function(){
            let _mediaFiles=[];
            function updateMediaPreview(){
                const preview=$('#media-files-preview');
                const input=$('#media-files-input');
                if(!preview||!input)return;
                // Synchroniser les fichiers dans l'input natif (pour que FormData les capte)
                const dt=new DataTransfer();
                _mediaFiles.forEach(f=>dt.items.add(f));
                input.files=dt.files;
                if(!_mediaFiles.length){preview.hidden=true;preview.innerHTML='';return;}
                preview.hidden=false;
                const names=_mediaFiles.map(f=>`<span class="media-file-chip">${escapeHtml(f.name)}</span>`).join('');
                preview.innerHTML=`<div class="media-files-chip-list">${names}</div><button type="button" class="media-files-clear" id="media-files-clear" title="Supprimer la sélection">×</button>`;
                $('#media-files-clear')?.addEventListener('click',()=>{_mediaFiles=[];updateMediaPreview();});
            }
            $('#media-pick-files-btn')?.addEventListener('click',()=>$('#media-files-input')?.click());
            $('#media-pick-folder-btn')?.addEventListener('click',()=>$('#media-folder-input')?.click());
            $('#media-files-input')?.addEventListener('change',event=>{
                const newFiles=[...(event.target.files||[])];
                // Filtrer les doublons par nom+taille
                const existing=new Set(_mediaFiles.map(f=>f.name+'|'+f.size));
                newFiles.forEach(f=>{if(!existing.has(f.name+'|'+f.size)){_mediaFiles.push(f);existing.add(f.name+'|'+f.size);}});
                updateMediaPreview();
            });
            $('#media-folder-input')?.addEventListener('change',event=>{
                const newFiles=[...(event.target.files||[])].filter(f=>/\.(jpe?g|png|webp|gif|pdf|mp3|m4a|wav|ogg|mp4|mov|webm)$/i.test(f.name));
                const existing=new Set(_mediaFiles.map(f=>f.name+'|'+f.size));
                newFiles.forEach(f=>{if(!existing.has(f.name+'|'+f.size)){_mediaFiles.push(f);existing.add(f.name+'|'+f.size);}});
                updateMediaPreview();
            });
            // Réinitialiser à l'ouverture du dialog
            const origOpenMediaDialog=openMediaDialog;
            // On patchera via un event reset sur le form
            $('#media-form')?.addEventListener('reset',()=>{_mediaFiles=[];updateMediaPreview();});
        })();
        $('#media-form').elements.create_event?.addEventListener('change',updateMediaCreateEventFields);
        $('#media-form').elements.postcard_pair?.addEventListener('change',event=>{if(event.target.checked)$('#media-form').elements.group_upload.checked=true;});
        $('#media-form').elements.group_upload?.addEventListener('change',event=>{if(!event.target.checked)$('#media-form').elements.postcard_pair.checked=false;});
        $('#media-form').elements.census_id?.addEventListener('change',event=>{const form=$('#media-form');if(event.target.value){form.elements.event_id.value='';form.elements.create_event.checked=false;updateMediaCreateEventFields();}});
        $('#media-form').elements.event_id?.addEventListener('change',event=>{if(event.target.value)$('#media-form').elements.census_id.value='';});
        $('#census-form').addEventListener('submit',async event=>{event.preventDefault();const values=formObject(event.currentTarget);try{const result=await api('save_census_record',{}, {method:'POST',body:values});const savedId=Number(values.id||result?.result?.id||0);await applyLabelPickerAfterSave('#census-label-picker',savedId);$('#census-dialog').close();toast('Recensement enregistré.');await selectPerson(Number(values.person_id));}catch(error){toast(error.message,'error');}});
        // la fiche liée : menu de choix unique (champ person_id) ; le nom relevé se remplit s'il est vide
        pkBindQuickCreate($('#census-member-dialog'));
        $('#census-member-search').addEventListener('picker-change',event=>{const form=$('#census-member-form'),it=event.detail.item;if(it&&!it.free&&!form.elements.display_name.value.trim())form.elements.display_name.value=it.title||'';});
        $('#census-member-form').addEventListener('submit',async event=>{event.preventDefault();const values=formObject(event.currentTarget);try{if(!values.id&&values.person_id){const memberships=(await api('census_member_memberships',{person_id:values.person_id})).records||[];const currentId=Number(values.census_id);const sameRecord=memberships.find(item=>Number(item.census_id)===currentId);const otherRecords=memberships.filter(item=>Number(item.census_id)!==currentId);const recordLabel=item=>`recensement ${item.year||'?'}${item.place_name?` à ${item.place_name}`:''}${item.address?` — ${item.address}`:''}`;if(sameRecord&&!await confirmBox(`Elle est déjà rattachée à ce ${recordLabel(sameRecord)}.\n\nEnregistrer mettra à jour ses informations dans ce foyer, sans créer de doublon. Continuer ?`,{title:'Personne déjà dans ce foyer',okLabel:'Enregistrer',danger:false}))return;if(otherRecords.length&&!await confirmBox(`Elle est déjà rattachée à ${otherRecords.length<2?'un autre recensement':`${otherRecords.length} autres recensements`} :\n${otherRecords.map(recordLabel).join('\n')}\n\nC’est normal pour des années différentes ; vérifie toutefois qu’il ne s’agit pas d’un doublon avant d’ajouter ce nouveau rattachement. Continuer ?`,{title:'Personne déjà recensée ailleurs',okLabel:'Ajouter quand même',danger:false}))return;}const result=await api(values.id?'update_census_member':'add_census_member',{}, {method:'POST',body:values});$('#census-member-dialog').close();toast(values.id?'Membre du foyer modifié.':result?.result?.updated_existing?'Membre déjà présent : informations mises à jour.':'Membre du foyer ajouté.');await selectPerson(Number(values.return_person_id)||state.currentPersonId);}catch(error){toast(error.message,'error');}});
        $('#census-media-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,formData=new FormData(form),mediaIds=formData.getAll('media_ids[]'),files=[...(form.elements['files[]']?.files||[])];const personId=Number(form.elements.person_id.value)||state.currentPersonId;try{let linked=0,imported=0;if(mediaIds.length){const result=await api('link_census_media',{}, {method:'POST',body:{census_id:form.elements.census_id.value,person_id:personId,media_ids:mediaIds}});linked=Number(result.result.added)||0;}if(files.length){formData.append('csrf',state.csrf);const response=await fetch('upload.php',{method:'POST',body:formData});const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Import impossible');imported=(result.media||[]).length;}if(!linked&&!imported)throw new Error('Choisis un média existant ou importe un fichier.');$('#census-media-dialog').close();toast([linked?`${plural(linked,'média lié','médias liés')}`:null,imported?`${plural(imported,'média importé','médias importés')}`:null].filter(Boolean).join(' · '));await selectPerson(personId);}catch(error){toast(error.message,'error');}});
        $('#entity-media-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const mediaIds=[...form.querySelectorAll('[name="media_ids[]"] option:checked')].map(option=>option.value);const files=[...(form.elements['files[]']?.files||[])];const personId=Number(form.elements.person_id.value)||state.currentPersonId;const entityType=form.elements.entity_type.value;const entityId=form.elements.entity_id.value;try{let linked=0,imported=0;if(mediaIds.length){const result=await api('link_entity_media',{}, {method:'POST',body:{entity_type:entityType,entity_id:entityId,person_id:personId,media_ids:mediaIds}});linked=Number(result.result.added)||0;}if(files.length){const uploadData=new FormData();uploadData.append('person_id',personId);uploadData.append('title',form.elements.title.value);uploadData.append('document_reference',form.elements.document_reference.value);uploadData.append('document_title',form.elements.document_title.value);uploadData.append('document_url',form.elements.document_url.value);uploadData.append('document_pages',form.elements.document_pages.value);files.forEach(file=>uploadData.append('files[]',file));uploadData.append('csrf',state.csrf);const response=await fetch('upload.php',{method:'POST',body:uploadData});const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Import impossible');imported=(result.media||[]).length;if((result.media||[]).length){await api('link_entity_media',{}, {method:'POST',body:{entity_type:entityType,entity_id:entityId,person_id:personId,media_ids:result.media}});}}if(!linked&&!imported)throw new Error('Choisis un média existant ou importe un fichier.');$('#entity-media-dialog').close();toast([linked?`${plural(linked,'média lié','médias liés')}`:null,imported?`${plural(imported,'média importé','médias importés')}`:null].filter(Boolean).join(' · '));await selectPerson(personId);}catch(error){toast(error.message,'error');}});
        $('#view-form').addEventListener('submit',async event=>{event.preventDefault();const values=formObject(event.currentTarget);const form=event.currentTarget;try{if(values.view_id){const id=Number(values.view_id);const config=JSON.parse(values.config||'{}');if(form.querySelector('[name^="vc_stats_"]')){config.statsColors=Array.from({length:40},(_,i)=>form.querySelector(`[name="vc_stats_${i}"]`)?.value||DEFAULT_STATS_COLORS[i%DEFAULT_STATS_COLORS.length]);}else if(form.querySelector('[name^="vc_gender_"]')){const gColors={};['male','female','unknown'].forEach(key=>{gColors[key]={bg:form.querySelector(`[name="vc_gender_${key}_bg"]`)?.value||DEFAULT_GENDER_COLORS[key].bg,text:form.querySelector(`[name="vc_gender_${key}_text"]`)?.value||DEFAULT_GENDER_COLORS[key].text};});config.genderColors=gColors;}await api('update_view',{},{method:'POST',body:{id,name:values.name,config}});await applyLabelPickerAfterSave('#view-label-picker',id);$('#view-dialog').close();$('#view-dialog').classList.remove('has-colors');$('#view-dialog-colors').innerHTML='';await reloadBootstrap();if(values.module==='graph'&&state.module==='graphiques'){state.graphTab='saved';persistUiState();if(config.genderColors&&config.mode!=='stats'&&config.mode!=='distribution'){const gc=config.genderColors;saveGenderColors({male:{bg:gc.male?.bg||DEFAULT_GENDER_COLORS.male.bg,text:gc.male?.text||DEFAULT_GENDER_COLORS.male.text},female:{bg:gc.female?.bg||DEFAULT_GENDER_COLORS.female.bg,text:gc.female?.text||DEFAULT_GENDER_COLORS.female.text},unknown:{bg:gc.unknown?.bg||DEFAULT_GENDER_COLORS.unknown.bg,text:gc.unknown?.text||DEFAULT_GENDER_COLORS.unknown.text}});applyGenderColorsToDocument();}renderSidebar();await renderGraph();}else{renderSidebar();}toast('Vue modifiée.');}else{const _savedMod=values.module;const saved=await api('save_view',{},{method:'POST',body:{module:_savedMod,name:values.name,config:JSON.parse(values.config)}});const savedId=Number(saved?.result?.id||0);await applyLabelPickerAfterSave('#view-label-picker',savedId);$('#view-dialog').close();await reloadBootstrap();if(_savedMod==='graph'&&state.module==='graphiques'){state.graphTab='saved';persistUiState();}renderSidebar();if(_savedMod==='graph'&&state.module==='graphiques')await renderGraph();toast('Vue enregistrée.');}}catch(error){toast(error.message,'error');}});
        $('#stats-colors-form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;const colors=Array.from({length:40},(_,i)=>form.querySelector(`[name="color_${i}"]`)?.value||DEFAULT_STATS_COLORS[i%DEFAULT_STATS_COLORS.length]);saveStatsColors(colors);state.graphStatsFrozenColors=null;const gColors={};['male','female','unknown'].forEach(key=>{gColors[key]={bg:form.querySelector(`[name="gender_${key}_bg"]`)?.value||DEFAULT_GENDER_COLORS[key].bg,text:form.querySelector(`[name="gender_${key}_text"]`)?.value||DEFAULT_GENDER_COLORS[key].text};});saveGenderColors(gColors);applyGenderColorsToDocument();const tFields={};['occupation','partners','living_status','marr','buri','bapt','id'].forEach(f=>{const el=form.querySelector(`[name="tree_field_${f}"]`);tFields[f]=el?el.checked:false;});saveTreeCardFields(tFields);saveIdentityNameVariantsDisplay(form.querySelector('[name="identity_name_variants_display"]')?.value||'if_filled');$('#stats-colors-dialog').close();toast('Palette enregistrée.');if(state.module==='graphiques'&&state.graphMode==='stats')renderGraphStats();else if(state.module==='graphiques')renderGraph();else if(state.module==='personnes'&&state.currentPersonId)selectPerson(state.currentPersonId,false);});
        $('#stats-colors-reset')?.addEventListener('click',()=>{const form=$('#stats-colors-form');DEFAULT_STATS_COLORS.forEach((c,i)=>{const input=form.querySelector(`[name="color_${i}"]`);if(input)input.value=c;});['male','female','unknown'].forEach(key=>{const bgInput=form.querySelector(`[name="gender_${key}_bg"]`);if(bgInput)bgInput.value=DEFAULT_GENDER_COLORS[key].bg;const textInput=form.querySelector(`[name="gender_${key}_text"]`);if(textInput)textInput.value=DEFAULT_GENDER_COLORS[key].text;});['occupation','partners','living_status','marr','buri','bapt','id'].forEach(f=>{const el=form.querySelector(`[name="tree_field_${f}"]`);if(el)el.checked=DEFAULT_TREE_CARD_FIELDS[f]||false;});const nameVariantsSelect=form.querySelector('[name="identity_name_variants_display"]');if(nameVariantsSelect)nameVariantsSelect.value='if_filled';});
        $('#stats-colors-save-preset')?.addEventListener('click',()=>{const nameInput=$('#stats-colors-preset-name');const name=(nameInput?.value||'').trim();if(!name){toast('Indique un nom pour cette palette.','error');nameInput?.focus();return;}const form=$('#stats-colors-form');const colors=Array.from({length:40},(_,i)=>form.querySelector(`[name="color_${i}"]`)?.value||DEFAULT_STATS_COLORS[i%DEFAULT_STATS_COLORS.length]);const presets=getStatsColorPresets();presets[String(Date.now())]={name,colors};saveStatsColorPresets(presets);if(nameInput)nameInput.value='';renderStatsColorPresetsList();toast(`Palette « ${name} » sauvegardée.`);});
        $('#battue-level-colors-form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;const colors=Array.from({length:DEFAULT_BATTUE_LEVEL_COLORS.length},(_,i)=>form.querySelector(`[name="battue_level_${i}"]`)?.value||DEFAULT_BATTUE_LEVEL_COLORS[i]);saveBattueLevelColors(colors);$('#battue-level-colors-dialog').close();toast('Couleurs des niveaux enregistrées.');});
        $('#battue-level-colors-reset')?.addEventListener('click',()=>{const form=$('#battue-level-colors-form');DEFAULT_BATTUE_LEVEL_COLORS.forEach((c,i)=>{const input=form?.querySelector(`[name="battue_level_${i}"]`);if(input)input.value=c;});});
        $('#battue-level-colors-save-preset')?.addEventListener('click',()=>{const nameInput=$('#battue-level-colors-preset-name');const name=(nameInput?.value||'').trim();if(!name){toast('Indique un nom pour cette palette.','error');nameInput?.focus();return;}const form=$('#battue-level-colors-form');const colors=Array.from({length:DEFAULT_BATTUE_LEVEL_COLORS.length},(_,i)=>form.querySelector(`[name="battue_level_${i}"]`)?.value||DEFAULT_BATTUE_LEVEL_COLORS[i]);const presets=getBattueLevelColorPresets();presets[String(Date.now())]={name,colors};saveBattueLevelColorPresets(presets);if(nameInput)nameInput.value='';renderBattueLevelColorPresetsList();toast(`Palette « ${name} » sauvegardée.`);});
        $('#investigation-form').addEventListener('submit',async event=>{event.preventDefault();try{const formData=formObject(event.currentTarget);formData.additional_persons=$('#investigation-extra-persons')?.value||'';delete formData.people_json;if(!Number(formData.person_id)){toast('Choisis la personne principale de l’enquête.','error');return;}const result=await api('save_investigation',{}, {method:'POST',body:formData});$('#investigation-dialog').close();state.currentInvestigationId=Number(result.result.id);if(state.module==='personnes')await selectPerson(state.currentPersonId);else await renderInvestigations();toast('Enquête enregistrée.');}catch(error){toast(error.message,'error');}});
        $('#battue-form')?.addEventListener('submit',async event=>{
            event.preventDefault();
            const values=formObject(event.currentTarget);delete values.battue_commune_pick;delete values.battue_people_json;
            if(!values.start_insee_code){
                toast('Choisis la commune de départ.','error');
                $('#battue-commune-search .pk-input')?.focus();
                return;
            }
            try{
                const result=await api('save_battue',{}, {method:'POST',body:values});
                $('#battue-dialog').close();
                state.enquetesTab='battue';
                state.currentInvestigationId=0;
                state.currentBattueId=Number(result.result.id);
                state.battueCommuneFilter='all';
                persistUiState();
                toast(values.id?'Battue enregistrée.':'Battue créée.');
                if(state.module==='enquetes'){
                    renderSidebar();
                    await renderInvestigations();
                }
            }catch(error){toast(error.message,'error');}
        });
        $('#investigation-item-form').addEventListener('submit',async event=>{event.preventDefault();try{const form=event.currentTarget;const values=formObject(form);const editId=form.dataset.editItemId;const personIds=$('#investigation-item-person-ids')?.value||'';if(personIds)values.linked_person_ids=personIds;if(editId){values.id=editId;await api('save_investigation_item',{},{method:'POST',body:values});$('#investigation-item-dialog').close();await renderInvestigationDetail(Number(values.investigation_id));toast('Piste modifiée.');}else{await api('add_investigation_item',{},{method:'POST',body:values});$('#investigation-item-dialog').close();await renderInvestigationDetail(Number(values.investigation_id));toast('Piste ajoutée.');}}catch(error){toast(error.message,'error');}});
        $('#investigation-media-form').addEventListener('submit',async event=>{event.preventDefault();try{const form=event.currentTarget,values=formObject(form),formData=new FormData(form);values.media_ids=formData.getAll('media_ids[]');values.item_ids=formData.getAll('item_ids[]');await api('link_investigation_media',{}, {method:'POST',body:values});$('#investigation-media-dialog').close();await renderInvestigationDetail(Number(values.investigation_id));toast(`${plural(values.media_ids.length,'média associé','médias associés')}.`);}catch(error){toast(error.message,'error');}});
        $('#investigation-item-event-form').addEventListener('submit',async event=>{event.preventDefault();try{const form=event.currentTarget;const select=$('#investigation-item-event-select');const option=select.options[select.selectedIndex];if(!option||!option.value){toast('Choisis un événement.','error');return;}const values=formObject(form);if(!values.item_id){toast('Piste introuvable.','error');return;}const personLabel=$('#investigation-item-event-person-search .pk-chosen b')?.textContent||'';await api('link_event_to_investigation_item',{},{method:'POST',body:{item_id:values.item_id,event_id:option.value,person_label:personLabel}});$('#investigation-item-event-dialog').close();await renderInvestigationDetail(Number(values.investigation_id));toast('Événement lié à la piste.');}catch(error){toast(error.message,'error');}});
        $('#hypothesis-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('save_hypothesis',{}, {method:'POST',body:formObject(event.currentTarget)});$('#hypothesis-dialog').close();toast('Hypothèse enregistrée.');await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        $('#evidence-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('save_evidence',{}, {method:'POST',body:formObject(event.currentTarget)});$('#evidence-dialog').close();toast('Preuve enregistrée.');await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        $('#research-note-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('save_research_note',{}, {method:'POST',body:formObject(event.currentTarget)});$('#research-note-dialog').close();toast('Journal enregistré.');await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}});
        $('#battue-alias-form')?.addEventListener('submit',async event=>{event.preventDefault();try{const values=formObject(event.currentTarget);await api('save_battue_alias',{},{method:'POST',body:values});$('#battue-alias-dialog').close();toast('Commune liée enregistrée.');await renderBattueDetail(Number(values.battue_id));}catch(error){toast(error.message,'error');}});
        $('#battue-search-form')?.addEventListener('submit',async event=>{event.preventDefault();try{const values=formObject(event.currentTarget);await api('save_battue_search_item',{},{method:'POST',body:values});$('#battue-search-dialog').close();toast('Annotation enregistrée.');await renderBattueDetail(Number(values.battue_id));}catch(error){toast(error.message,'error');}});
        $('#lightbox .lightbox-close').addEventListener('click',()=>{$('#lightbox').close();// Restore buttons after read-only mode
        const deleteBtn=$('#delete-media'),saveTransBtn=$('#save-transcription'),saveMetaBtn=$('#save-media-meta'),assistBtn=$('#assist-transcription'),ocrBtn=$('#ocr-transcription'),htrControls=$('#htr-controls'),rotateLeft=$('#rotate-media-left'),rotateRight=$('#rotate-media-right');
        if(deleteBtn)deleteBtn.style.display='';if(saveTransBtn)saveTransBtn.style.display='';if(saveMetaBtn)saveMetaBtn.style.display='';if(assistBtn)assistBtn.style.display='';if(ocrBtn)ocrBtn.style.display='';if(htrControls)htrControls.style.display='';if(rotateLeft)rotateLeft.style.display='';if(rotateRight)rotateRight.style.display='';});
        $('#lightbox-prev').addEventListener('click',()=>moveLightbox(-1));
        $('#lightbox-next').addEventListener('click',()=>moveLightbox(1));
        $('#save-transcription').addEventListener('click',saveCurrentTranscription);
        $('#assist-transcription').addEventListener('click',structureCurrentTranscription);
        $('#ocr-transcription')?.addEventListener('click',runOcrTranscription);
        $('#handwriting-transcription')?.addEventListener('click',runHandwritingTranscription);
        $('#act-transcriber-open')?.addEventListener('click',()=>{const item=state.lightboxMedia?.[state.lightboxIndex];if(!item||normalizedMediaType(item)!=='image')return toast('L’atelier de transcription s’ouvre sur une image.','error');window.LCNDA_EXT?.openActTranscriber?.({mediaId:item.id,filename:item.filename,title:item.title||'',text:$('#lightbox-transcription')?.value||item.transcription||''});});
        $('#compare-media')?.addEventListener('click',openMediaCompareDialog);
        $('#rotate-media-left')?.addEventListener('click',()=>rotateCurrentMedia('left'));
        $('#rotate-media-right')?.addEventListener('click',()=>rotateCurrentMedia('right'));
        $('#save-media-meta').addEventListener('click',saveCurrentMediaMeta);
        $('#delete-media').addEventListener('click',deleteCurrentMedia);
        $('#set-portrait').addEventListener('click',setCurrentPortrait);
        $('#lightbox-tag-toggle').addEventListener('click',()=>{if(state.lightboxTagMode&&state.lightboxTagType==='person'){exitTagMode();}else{enterTagMode('person');}});
        $('#lightbox-signature-toggle')?.addEventListener('click',()=>{if(state.lightboxTagMode&&state.lightboxTagType==='signature'){exitTagMode();}else{enterTagMode('signature');}});
        const syncTagVisibilityToggles=checked=>{const personToggle=$('#lightbox-tags-visible-toggle'),signatureToggle=$('#lightbox-signatures-visible-toggle');if(personToggle)personToggle.checked=checked;if(signatureToggle)signatureToggle.checked=checked;};
        $('#lightbox-tags-visible-toggle')?.addEventListener('change',event=>{state.lightboxTagsVisible=event.target.checked;syncTagVisibilityToggles(state.lightboxTagsVisible);renderMediaTagOverlays();});
        $('#lightbox-signatures-visible-toggle')?.addEventListener('change',event=>{state.lightboxTagsVisible=event.target.checked;syncTagVisibilityToggles(state.lightboxTagsVisible);renderMediaTagOverlays();});
        // Listes › Médias : après une rotation, une retouche, une suppression… la liste est redessinée (à la même hauteur)
        document.addEventListener('click',event=>{if($('#lightbox')?.open&&event.target.closest('#rotate-media-left,#rotate-media-right,#delete-media,#save-media-meta,#save-transcription,#retouch-media'))state.lightboxDirty=true;},true);
        $('#lightbox').addEventListener('close',()=>{if(!state.lightboxDirty)return;state.lightboxDirty=false;if(state.module==='listes'&&['media','signatures'].includes(state.listType)){const y=window.scrollY,ws=$('#workspace'),wy=ws?.scrollTop||0;Promise.resolve(renderList()).then(()=>{window.scrollTo(0,y);if(ws)ws.scrollTop=wy;});}});
        $('#lightbox').addEventListener('click',event=>{if(event.target===$('#lightbox'))$('#lightbox').close();});
        $('#lightbox').addEventListener('close',()=>{[$('#lightbox-video'),$('#lightbox-audio')].forEach(p=>{if(p){try{p.pause();}catch{}}});if(state.lightboxTagMode)exitTagMode();});// la vidéo ou le son ne continuent pas une fois la visionneuse fermée
        bindLightboxZoom();
        // Flèches, R, +/−, J/L… : voir les raccourcis clavier (SHORTCUT_DEFS, contexte « viewer »)
        document.addEventListener('keydown',event=>{if(!$('#lightbox').open||event.target.matches('textarea,input,select'))return;if(event.key==='Escape'&&![...document.querySelectorAll('dialog[open]')].some(d=>d!==$('#lightbox')&&$('#lightbox').compareDocumentPosition(d)&Node.DOCUMENT_POSITION_FOLLOWING))$('#lightbox').close();});// Échap dans une fenêtre ouverte par-dessus (retouche…) ne ferme pas aussi la visionneuse
    }

    // un animal : « mâle / femelle », « en vie / mort » ; une personne : comme d'habitude
    function personKindLabels(form,kind){kind=kind||form.querySelector('[name=kind]:checked')?.value||'human';const an=kind==='animal';const g=form.elements.gender;if(g){const t=an?{unknown:'?',male:'♂ Mâle',female:'♀ Femelle',nonbinary:'Autre'}:{unknown:'Non renseigné',male:'Masculin',female:'Féminin',nonbinary:'Autre / non binaire'};[...g.options].forEach(o=>{o.textContent=t[o.value]||o.textContent;});}const s=form.elements.living_status;if(s){const t=an?{unknown:'À vérifier',living:'En vie',deceased:'Mort(e)'}:{unknown:'À vérifier',living:'Vivante',deceased:'Décédée'};[...s.options].forEach(o=>{o.textContent=t[o.value]||o.textContent;});}const f=form.elements.first_name?.closest('label');if(f&&f.firstChild)f.firstChild.textContent=an?'Nom':'Prénom';const l=form.elements.last_name?.closest('label');if(l&&l.firstChild)l.firstChild.textContent=an?'Affixe (nom de l’élevage)':'Nom inscrit';$('#person-dialog-title').textContent=form.elements.id.value?(an?'Modifier l’animal':'Modifier la personne'):(an?'Nouvel animal':'Nouvelle personne');}
    document.addEventListener('change',e=>{if(!e.target.matches?.('#person-form [name=kind]'))return;if(e.target.value==='animal'&&!e.target.form.elements.id.value&&window.LCNDA_EXT?.newAnimalFiche){$('#person-dialog').close();window.LCNDA_EXT.newAnimalFiche();return;}personKindLabels(e.target.form);});
    function openPersonDialog(detail){if(detail?.person?.kind==='animal'&&window.LCNDA_EXT?.editAnimalFiche){window.LCNDA_EXT.editAnimalFiche(detail,'pe1');return;} // un animal : son formulaire d'animal, pas celui d'un humain
        const form=$('#person-form'),p=detail.person;$('#person-dialog-title').textContent='Modifier la personne';{const kc=form.querySelector('[data-kind-choice]');if(kc)kc.hidden=true;}['id','first_name','middle_name','last_name','prefix','suffix','gender','living_status','verify_status','occupation','height_text','physical_description','eye_color','skin_color','nationality','ethnicity','reference_number','mort_pour_la_france'].forEach(field=>form.elements[field].value=p[field]??(field==='verify_status'?'normal':field==='mort_pour_la_france'?'unknown':''));try{const d=readDesignSettings();if(d.defaultMortPourLaFrance&&d.defaultMortPourLaFrance!=='unknown'&&(!p.mort_pour_la_france||p.mort_pour_la_france==='unknown'))form.elements.mort_pour_la_france.value=d.defaultMortPourLaFrance;}catch(_){}form.elements.surname_group_id.innerHTML='<option value="">Non classé</option>'+detail.surnameGroups.map(group=>`<option value="${group.id}" ${Number(group.id)===Number(p.surname_group_id)?'selected':''}>${escapeHtml(group.name)}</option>`).join('');if(form.elements.outside_genealogy)form.elements.outside_genealogy.checked=!!(Number(p.outside_genealogy)||0);
        personKindLabels(form,p.kind==='animal'?'animal':'human');
        // Tout en bas : cacher ou montrer les lignes vides de l'Identité (cette fiche / toutes)
        const emptyWrap=$('#person-identity-empty-wrap');
        if(emptyWrap){const fill=()=>{emptyWrap.innerHTML=identityEmptyBar(p.id,personBlockSettings(p.id,'human'));$$('[data-identity-empty]',emptyWrap).forEach(button=>button.addEventListener('click',()=>{setIdentityEmpty(button.dataset.identityEmpty,button.dataset.hide==='1',Number(button.dataset.person));fill();if(Number(state.currentPersonId)===Number(p.id)&&state.module==='personnes')selectPerson(p.id,false);}));};fill();}
        // Artiste
        const isArtistCb=form.elements.is_artist;if(isArtistCb){isArtistCb.checked=!!(Number(p.is_artist)||0);}
        ['show_voyage_block','show_placement_block','show_heraldry_block','show_poilu_block','show_language_block','show_resistance_block','show_voter_block'].forEach(key=>{if(form.elements[key])form.elements[key].checked=!!Number(p[key]||0);});
        (window.LCNDA_EXT?.afterPersonForm||[]).forEach(fn=>{try{fn(form,p);}catch(error){console.error(error);}});
        if(form.elements.artist_discipline)form.elements.artist_discipline.value=p.artist_discipline||'';
        if(form.elements.artist_events_display)form.elements.artist_events_display.value=p.artist_events_display||'events';
        const disciplineWrap=$('#person-artist-discipline-wrap');const displayWrap=$('#person-artist-display-wrap');
        const updateArtistUI=()=>{const checked=isArtistCb?.checked||false;if(disciplineWrap)disciplineWrap.style.display=checked?'inline-flex':'none';if(displayWrap)displayWrap.style.display=checked?'block':'none';};
        updateArtistUI();
        if(isArtistCb){isArtistCb.removeEventListener('change',isArtistCb._artistHandler||null);isArtistCb._artistHandler=updateArtistUI;isArtistCb.addEventListener('change',updateArtistUI);}
        // Bloc militaire : visible uniquement pour les femmes (les hommes l'ont automatiquement)
        const militaryToggleWrap=$('#person-military-toggle-wrap');
        const militaryShowCb=form.elements.show_military_block;
        const militaryDisabledHint=$('#person-military-disabled-hint');
        if(militaryToggleWrap){
            const isFemale=p.gender==='female';
            militaryToggleWrap.style.display=isFemale?'block':'none';
            if(isFemale){
                // Vérifier si le bloc est activé en maintenance (présent dans l'ordre et non masqué)
                const blockSettings=personBlockSettings(0);
                const militaryEnabled=blockSettings.order.includes('military')&&!blockSettings.hidden.includes('military');
                if(militaryShowCb){
                    militaryShowCb.checked=!!(Number(p.show_military_block)||0);
                    militaryShowCb.disabled=!militaryEnabled;
                }
                if(militaryDisabledHint)militaryDisabledHint.style.display=militaryEnabled?'none':'block';
            }
        }
        // Mettre à jour le toggle si le genre change
        const genderSel=form.elements.gender;
        const updateMilitaryToggle=()=>{
            const isFemale=genderSel.value==='female';
            if(militaryToggleWrap)militaryToggleWrap.style.display=isFemale?'block':'none';
        };
        genderSel.removeEventListener('change',genderSel._militaryHandler||null);
        genderSel._militaryHandler=updateMilitaryToggle;
        genderSel.addEventListener('change',updateMilitaryToggle);
        $('#person-dialog').showModal();}
    function openNewPersonDialog(){if((baseMode()==='breeding'||state.peopleScope==='animals')&&window.LCNDA_EXT?.newAnimalFiche){window.LCNDA_EXT.newAnimalFiche();return;}const form=$('#person-form');form.reset();form.elements.id.value='';{const ew=$('#person-identity-empty-wrap');if(ew)ew.innerHTML='';}$('#person-dialog-title').textContent='Nouvelle fiche';const kc=form.querySelector('[data-kind-choice]');if(kc){kc.hidden=false;const k=baseMode()==='breeding'||state.peopleScope==='animals'||state.personTab==='animals'?'animal':'human';form.querySelectorAll('[name=kind]').forEach(r=>{r.checked=r.value===k;});personKindLabels(form);}const groups=state.currentPerson?.surnameGroups||[];form.elements.surname_group_id.innerHTML='<option value="">Non classé</option>'+groups.map(group=>`<option value="${group.id}">${escapeHtml(group.name)}</option>`).join('');$('#person-dialog').showModal();}

    function openMilitaryDialog(detail){
        const form=$('#military-form');
        const person=detail.person;
        const milData=detail.militaryData||{};
        form.reset();
        form.elements.person_id.value=person.id;
        $('#military-dialog-title').textContent=`Informations militaires — ${escapeHtml(personName(person))}`;
        // Remplir tous les champs
        const fields=['matricule','classe_mobilisation','bureau_recrutement','decision_conseil','compris_liste',
            'cheveux','sourcils','yeux','front','nez','bouche','menton','visage','taille','marques_particulieres',
            'degre_instruction_gen','degre_instruction_mil','corps_armee_active','corps_disponibilite','corps_territoriale',
            'date_entree_active','date_disponibilite','date_reserve','date_territoriale','date_reserve_territ','date_liberation',
            'services_mutations','localites_successives','condamnations','notes_militaires'];
        fields.forEach(field=>{if(form.elements[field])form.elements[field].value=milData[field]||'';});
        const milMediaBtn=$('#military-manage-media-btn');
        milMediaBtn.onclick=()=>openEntityMediaDialog(detail,'military',person.id,'MILITAIRE','Gérer les médias du dossier militaire');
        const linkedMil=mediaForMilitary(detail.media||[],person.id);
        $('#military-media-list').innerHTML=linkedMil.length?`<p class="form-help">${plural(linkedMil.length,'document lié','documents liés')} à ce dossier militaire.</p>`:'';
        $('#military-dialog').showModal();
    }

    function renderGravePreciseBlock(form, graveItem) {
        renderEventPreciseBlock(form, graveItem, {blockId:'grave-precise-block', openId:'grave-precise-open', clearId:'grave-precise-clear'});
    }

    function openGraveDialog(detail){
        const form=$('#grave-form');
        const person=detail.person;
        const grave=detail.grave||null;
        form.reset();
        form.elements.grave_id.value=grave?.id||'';
        form.elements.person_id.value=person.id;
        $('#grave-dialog-title').textContent=grave?`Sépulture — ${escapeHtml(personName(person))}`:`Nouvelle sépulture — ${escapeHtml(personName(person))}`;
        form.elements.cemetery_name.value=grave?.cemetery_name||'';
        form.elements.place_name.value=grave?.city||'';
        form.elements.place_id.value='';
        form.elements.country.value=grave?.country||'France';
        form.elements.address.value=grave?.address||'';
        form.elements.plan_ref.value=grave?.plan_ref||'';
        form.elements.condition_state.value=grave?.condition_state||'inconnu';
        form.elements.grave_exists.checked=grave?Number(grave.grave_exists)!==0:true;
        form.elements.notes.value=grave?.notes||'';
        form.elements.precise_lat.value=grave?.gps_lat!=null?grave.gps_lat:'';
        form.elements.precise_lon.value=grave?.gps_lon!=null?grave.gps_lon:'';
        setupPlaceAutocomplete(form);
        renderGravePreciseBlock(form,grave?{precise_lat:grave.gps_lat,precise_lon:grave.gps_lon}:null);
        const graveMediaBtn=$('#grave-manage-media-btn');
        if(grave){
            graveMediaBtn.disabled=false;graveMediaBtn.title='';
            graveMediaBtn.onclick=()=>openEntityMediaDialog(detail,'grave',grave.id,'CIMETIÈRE','Ajouter ou lier une photo de la sépulture');
            const linkedPhotos=mediaForGrave(detail.media||[],grave.id);
            $('#grave-media-list').innerHTML=linkedPhotos.length?`<p class="form-help">${plural(linkedPhotos.length,'photo ou document lié','photos ou documents liés')} à cette sépulture.</p>`:'';
        } else {
            graveMediaBtn.disabled=true;graveMediaBtn.title='Enregistre d’abord la sépulture pour pouvoir ajouter des photos.';graveMediaBtn.onclick=null;
            $('#grave-media-list').innerHTML='';
        }
        $('#grave-dialog').showModal();
    }

    function openAddGravePersonDialog(detail,graveId){
        const form=$('#grave-person-form');
        form.reset();
        form.elements.grave_id.value=graveId;
        pkSet($('#grave-person-search'),null);
        $('#grave-person-dialog').showModal();
        setTimeout(()=>$('#grave-person-search .pk-input')?.focus(),30);
    }
    function fillEventTypes(selected,scope='person',artisticOnly=false){const person=state.currentPerson?.person||null;const isArtist=person?Number(person.is_artist)===1:true;let types=state.bootstrap.eventTypes.filter(type=>type.scope===scope&&(!Number(type.is_artistic)||isArtist));if(artisticOnly)types=types.filter(type=>Number(type.is_artistic));$('#event-form').elements.event_type_id.innerHTML=types.map(type=>`<option value="${type.id}" ${Number(type.id)===Number(selected)?'selected':''}>${escapeHtml(type.label)}</option>`).join('');}
    // Renvoie la liste des champs spécifiques (dimensions, durée…) définis sur un type d'événement artistique
    function eventTypeCustomFields(typeId){const type=(state.bootstrap?.eventTypes||[]).find(t=>Number(t.id)===Number(typeId));if(!type||!Number(type.is_artistic)||!type.custom_fields)return [];try{const fields=JSON.parse(type.custom_fields);return Array.isArray(fields)?fields:[];}catch(_){return [];}}
    // Affiche dans le formulaire d'événement les champs spécifiques à l'œuvre pour le type sélectionné
    // (ex: Dimensions/Technique pour une peinture, Durée/Genre pour un film) — jamais les champs d'un autre type.
    function renderEventWorkFields(typeId,values={}){
        const wrap=$('#event-work-fields');if(!wrap)return;
        const fields=eventTypeCustomFields(typeId);
        if(!fields.length){wrap.hidden=true;wrap.innerHTML='';return;}
        wrap.hidden=false;
        wrap.innerHTML=`<span class="section-label">Détails de l'œuvre</span><div class="form-grid work-fields-grid">${fields.map(field=>`<label>${escapeHtml(field)}<input type="text" data-work-field="${escapeHtml(field)}" value="${escapeHtml(values?.[field]||'')}" autocomplete="off"></label>`).join('')}</div>`;
    }
    function collectEventWorkFields(){const wrap=$('#event-work-fields');if(!wrap||wrap.hidden)return '';const values={};wrap.querySelectorAll('[data-work-field]').forEach(input=>{const value=input.value.trim();if(value)values[input.dataset.workField]=value;});return Object.keys(values).length?JSON.stringify(values):'';}
    function setupMapSurnameAutocomplete(){
        const input=$('#map-surname');
        if(!input)return;
        let box=document.getElementById('map-surname-suggestions');
        if(!box){
            box=document.createElement('div');
            box.id='map-surname-suggestions';
            box.className='place-suggestions map-surname-fixed-suggestions';
            box.hidden=true;
            document.body.appendChild(box);
        }
        const position=()=>{const rect=input.getBoundingClientRect();box.style.top=(rect.bottom+window.scrollY+4)+'px';box.style.left=(rect.left+window.scrollX)+'px';box.style.width=Math.max(rect.width,220)+'px';};
        const hide=()=>{box.hidden=true;box.innerHTML='';};
        const commit=value=>{state.mapSurname=value;persistUiState();renderMap();};
        const search=()=>{
            const q=input.value.trim().toLowerCase();
            if(q.length<1){hide();return;}
            const matches=(state.bootstrap?.surnames||[]).filter(s=>s.name.toLowerCase().includes(q)).slice(0,8);
            box.innerHTML=matches.map(s=>`<button type="button" data-surname-name="${escapeHtml(s.name)}"><strong>${escapeHtml(s.name)}</strong><small>${Number(s.person_count).toLocaleString('fr-FR')} personne${Number(s.person_count)>1?'s':''}</small></button>`).join('');
            if(box.innerHTML){position();box.hidden=false;}else hide();
        };
        input.addEventListener('input',debounce(search,150));
        input.addEventListener('focus',()=>{if(box.innerHTML){position();box.hidden=false;}});
        input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();hide();input.blur();commit(input.value.trim());}});
        input.addEventListener('blur',()=>{setTimeout(()=>{if(!box.hidden){hide();commit(input.value.trim());}},120);});
        box.addEventListener('click',event=>{
            const button=event.target.closest('button[data-surname-name]');
            if(!button)return;
            input.value=button.dataset.surnameName;
            hide();
            commit(button.dataset.surnameName);
        });
        if(!box.dataset.outsideClickBound){
            box.dataset.outsideClickBound='1';
            document.addEventListener('click',event=>{if(event.target!==input&&!box.contains(event.target))hide();});
            window.addEventListener('scroll',()=>{if(!box.hidden)position();},{passive:true});
            window.addEventListener('resize',()=>{if(!box.hidden)position();});
        }
    }

    function setupMapRoutePersonControls(){
        if(state.mapMode!=='life')return;
        $$('[data-remove-route-person]').forEach(button=>button.addEventListener('click',()=>{
            const id=Number(button.dataset.removeRoutePerson);
            state.mapRoutePeople=normalizeRoutePeople().filter(person=>person.id!==id);
            state.mapRouteStep='all';
            persistUiState();
            renderMap();
        }));
        // ajouter une personne : menu de choix unique (rendu par mapRoutePeopleHtml dans app-carte.js)
        const wrap=$('#map-route-person-search');if(!wrap)return;
        wrap.addEventListener('picker-change',event=>{
            const it=event.detail.item;if(!it||it.free||!it.id)return;
            const people=normalizeRoutePeople();
            if(people.some(item=>item.id===Number(it.id))){pkSet(event.target,null);return;}
            if(people.length>=8){toast('Limite simple : 8 personnes à comparer.','error');pkSet(event.target,null);return;}
            people.push({id:Number(it.id),name:it.title});
            state.mapRoutePeople=people;
            state.mapRouteStep='all';
            persistUiState();
            renderMap();
        });
    }
    /** Lieu d'un événement, d'un recensement, d'une sépulture : le menu de choix unique (📍), posé dans index.php
     *  ([data-place-picker], champ caché place_id). Le formulaire envoie toujours place_id, place_name et country (remplis au choix).
     *  Appelée à chaque ouverture, après le remplissage des champs : elle remet la pastille du lieu enregistré
     *  (ou du nom seul, pour une ancienne sépulture). Un lieu qui n'existe pas encore : « ＋ Créer le lieu ». */
    function setupPlaceAutocomplete(form){
        const host=form?.querySelector('[data-place-picker]'),field=host?.querySelector('.pk');if(!field)return;
        if(!host.dataset.pkBound){host.dataset.pkBound='1';
            host.addEventListener('picker-change',event=>{const item=event.detail.item;if(form.elements.place_name)form.elements.place_name.value=item?(item.free?item.title:(item.name||item.title||'')):'';const country=item&&!item.free?pkPlaceCountry(item):'';if(country&&form.elements.country)form.elements.country.value=country;});
        }
        const id=Number(field.querySelector(':scope > input[type=hidden]')?.value||0)||0,name=form.elements.place_name?.value||'';
        pkSet(field,id?id:(name?`txt:${name}`:null));
        // un nom seul (ancienne sépulture) : si ce lieu est dans ta base, on montre sa vraie pastille
        if(!id&&name){const q=name.split(',')[0].trim(),fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
            api('picker_search',{kind:'place',q,limit:5}).then(data=>{const base=(data.groups||[]).find(g=>g.key==='base')?.items||[];const hit=base.filter(it=>fold(it.name||it.title)===fold(q));if(hit.length===1&&(form.elements.place_name?.value||'')===name)pkSet(field,hit[0]);}).catch(()=>{});}
    }
    function renderEventWitnesses(){
        const list=$('#event-witnesses-list');if(!list)return;
        if(!state.eventWitnesses.length){list.innerHTML='<small class="label-field-empty">Aucun témoin ajouté.</small>';return;}
        list.innerHTML=state.eventWitnesses.map((w,i)=>`<div class="witness-item" data-witness-index="${i}"><div class="witness-header"><strong>${escapeHtml(w.name)}</strong>${actionButton('delete','Retirer ce témoin',`data-remove-witness="${i}"`)}</div><input type="text" class="witness-note-input" placeholder="Rôle ou précision (ex. parrain, témoin de mariage…)" value="${escapeHtml(w.note||'')}" data-witness-note="${i}"></div>`).join('');
        $$('[data-remove-witness]',list).forEach(btn=>btn.addEventListener('click',()=>{state.eventWitnesses.splice(Number(btn.dataset.removeWitness),1);renderEventWitnesses();}));
        $$('[data-witness-note]',list).forEach(input=>input.addEventListener('input',()=>{const idx=Number(input.dataset.witnessNote);if(state.eventWitnesses[idx])state.eventWitnesses[idx].note=input.value;}));
    }

    function isBaptismEventType(typeId){
        const type=(state.bootstrap?.eventTypes||[]).find(row=>Number(row.id)===Number(typeId));
        if(!type)return false;
        const tag=String(type.gedcom_tag||'').toUpperCase();
        const label=String(type.label||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        return tag==='CHR'||tag==='BAPM'||label.includes('bapteme');
    }
    function sponsorNote(sponsor){return `${sponsor.role||'Parrain'}${sponsor.note?` — ${sponsor.note}`:''}`;}
    function parseSponsorWitness(witness){
        const note=String(witness.note||'').trim();
        const match=note.match(/^(Parrain|Marraine)(?:\s*[—-]\s*(.*))?$/i);
        if(!match)return null;
        const role=match[1].toLowerCase()==='marraine'?'Marraine':'Parrain';
        return {person_id:Number(witness.person_id),name:personName(witness),role,note:match[2]||''};
    }
    function renderEventSponsorSection(){
        const section=$('#event-sponsors-section'),list=$('#event-sponsors-list');
        if(!section||!list)return;
        const form=$('#event-form');
        const show=isBaptismEventType(form?.elements.event_type_id?.value);
        section.hidden=!show;
        if(!show)return;
        if(!state.eventSponsors.length){list.innerHTML='<small class="label-field-empty">Aucun parrain ou marraine ajouté.</small>';return;}
        list.innerHTML=state.eventSponsors.map((s,i)=>`<div class="witness-item" data-sponsor-index="${i}"><div class="witness-header"><strong>${escapeHtml(s.name)}</strong>${actionButton('delete','Retirer ce parrain ou cette marraine',`data-remove-sponsor="${i}"`)}</div><div class="relation-new-grid"><label>Rôle<select class="witness-note-input" data-sponsor-role="${i}"><option value="Parrain" ${s.role==='Parrain'?'selected':''}>Parrain</option><option value="Marraine" ${s.role==='Marraine'?'selected':''}>Marraine</option></select></label><label>Précision<input type="text" class="witness-note-input" placeholder="Précision éventuelle" value="${escapeHtml(s.note||'')}" data-sponsor-note="${i}"></label></div></div>`).join('');
        $$('[data-remove-sponsor]',list).forEach(btn=>btn.addEventListener('click',()=>{state.eventSponsors.splice(Number(btn.dataset.removeSponsor),1);renderEventSponsorSection();}));
        $$('[data-sponsor-role]',list).forEach(select=>select.addEventListener('change',()=>{const idx=Number(select.dataset.sponsorRole);if(state.eventSponsors[idx])state.eventSponsors[idx].role=select.value;}));
        $$('[data-sponsor-note]',list).forEach(input=>input.addEventListener('input',()=>{const idx=Number(input.dataset.sponsorNote);if(state.eventSponsors[idx])state.eventSponsors[idx].note=input.value;}));
    }

    /** Petit panneau « ＋ Ajouter un témoin » : le menu de choix unique (« ＋ Créer la fiche » crée la personne sans quitter l'événement). */
    function openWitnessSearch(){
        const block=$('#event-witnesses-block');if(!block)return;
        let panel=$('#witness-search-panel');
        if(panel){panel.remove();return;}
        panel=document.createElement('div');panel.id='witness-search-panel';panel.className='witness-search-panel';
        panel.innerHTML=`<div class="pk-host"><span>Témoin</span>${pkField({name:'witness_pick',kind:'person'})}</div>`;
        const addBtn=$('#add-witness-btn');if(addBtn)addBtn.after(panel);else block.appendChild(panel);
        pkBindQuickCreate(panel);
        panel.addEventListener('picker-change',event=>{const it=event.detail.item;if(!it||it.free||!it.id)return;
            if(Number(it.id)===Number($('#event-form').elements.person_id.value)){toast('C’est la personne de l’événement.','error');pkSet(event.target,null);return;}
            addWitness(Number(it.id),it.title);panel.remove();});
        setTimeout(()=>panel.querySelector('.pk-input')?.focus(),30);
    }

    function addWitness(personId,name){
        if(state.eventWitnesses.some(w=>w.person_id===personId)){toast('Cette personne est déjà témoin.','error');return;}
        state.eventWitnesses.push({person_id:personId,name,note:''});
        renderEventWitnesses();
    }

    function openSponsorSearch(){
        const block=$('#event-sponsors-block');if(!block)return;
        let panel=$('#sponsor-search-panel');
        if(panel){panel.remove();return;}
        panel=document.createElement('div');panel.id='sponsor-search-panel';panel.className='witness-search-panel';
        panel.innerHTML=`<div class="witness-search-entry"><label>Rôle<select id="sponsor-role"><option value="Parrain">Parrain</option><option value="Marraine">Marraine</option></select></label></div><div class="pk-host"><span>Personne</span>${pkField({name:'sponsor_pick',kind:'person'})}</div>`;
        const addBtn=$('#add-sponsor-btn');if(addBtn)addBtn.after(panel);else block.appendChild(panel);
        pkBindQuickCreate(panel);
        panel.addEventListener('picker-change',event=>{const it=event.detail.item;if(!it||it.free||!it.id)return;
            if(Number(it.id)===Number($('#event-form').elements.person_id.value)){toast('C’est la personne de l’événement.','error');pkSet(event.target,null);return;}
            addSponsor(Number(it.id),it.title,$('#sponsor-role')?.value||'Parrain');panel.remove();});
        setTimeout(()=>panel.querySelector('.pk-input')?.focus(),30);
    }

    function addSponsor(personId,name,role='Parrain'){
        if(state.eventSponsors.some(s=>s.person_id===personId)||state.eventWitnesses.some(w=>w.person_id===personId)){toast('Cette personne est déjà liée à cet événement.','error');return;}
        state.eventSponsors.push({person_id:personId,name,role,note:''});
        renderEventSponsorSection();
    }

    function dateTextToIso(text){const m=String(text||'').trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);if(!m)return '';const[,d,mo,y]=m;return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;}
    function isoToDateText(iso){const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';return `${m[3]}/${m[2]}/${m[1]}`;}
    function renderEventPreciseBlock(form, eventItem, opts={}) {
        const blockId=opts.blockId||'event-precise-block';
        const openId=opts.openId||'event-precise-open';
        const clearId=opts.clearId||'event-precise-clear';
        const lat=form.elements.precise_lat?.value;const lon=form.elements.precise_lon?.value;
        const hasPrecise=lat!==''&&lat!=null&&lon!==''&&lon!=null;
        let block=document.getElementById(blockId);
        if(!block){block=document.createElement('div');block.id=blockId;block.className='span-2 event-precise-block';
            // Insert before the Description textarea (label[for] or label wrapping textarea[name=description])
            const descLabel=$('#event-form .form-grid textarea[name="description"]')?.closest('label');
            if(descLabel)descLabel.before(block);else{const actions=$('#event-form .modal-actions');if(actions)actions.before(block);}}
        block.innerHTML=hasPrecise
            ? `<div class="event-precise-status is-set"><span class="event-precise-icon">📍</span><span>Position précise enregistrée : <strong>${Number(lat).toFixed(5)}°, ${Number(lon).toFixed(5)}°</strong></span><button type="button" id="${openId}" class="button small secondary">Modifier</button><button type="button" id="${clearId}" class="button small danger-soft">Retirer la position précise</button></div>`
            : `<div class="event-precise-status"><span class="event-precise-icon">📍</span><span>Aucune position précise (la ville sera utilisée)</span><button type="button" id="${openId}" class="button small secondary">Affiner sur la carte</button></div>`;
    }
    function renderCensusPreciseBlock(form, record) {
        renderEventPreciseBlock(form, record, {blockId:'census-precise-block', openId:'census-precise-open', clearId:'census-precise-clear'});
    }

    function openPreciseMapDialog(triggerBtn, formSel='#event-form', renderFn=renderEventPreciseBlock) {
        const form=$(formSel);
        const placeName=form.elements.place_name?.value||'';
        const currentLat=form.elements.precise_lat?.value||'';const currentLon=form.elements.precise_lon?.value||'';
        const placeId=Number(form.elements.place_id?.value||0);
        // Chercher les coordonnées de la ville : d'abord via mapPoints (par place_id),
        // puis dans tous les points disponibles (carte déjà chargée ou non).
        // Zoom par défaut serré sur la ville (~zoom 14), plus serré si position précise déjà connue.
        let centerLat=46.7,centerLon=2.3,zoom=14;
        if(currentLat&&currentLon){
            // Position précise déjà enregistrée : on se centre dessus, très zoomé
            centerLat=Number(currentLat);centerLon=Number(currentLon);zoom=17;
        } else {
            // Chercher les coords de la commune dans les points de la carte en mémoire
            let pt=null;
            if(placeId)pt=state.mapPoints?.find(p=>p.place_id&&Number(p.place_id)===placeId);
            // Fallback : chercher dans les events du personage courant (person_detail en cache)
            if(!pt&&placeId&&state.currentPerson?.events){
                const ev=state.currentPerson.events.find(e=>Number(e.place_id)===placeId&&e.latitude!=null&&e.longitude!=null);
                if(ev)pt={latitude:ev.latitude,longitude:ev.longitude};
            }
            if(pt){centerLat=Number(pt.latitude);centerLon=Number(pt.longitude);}
            // zoom 14 : niveau "quartier", bien suffisant pour débuter le pointage
        }
        $('#precise-map-dialog')?.remove(); // une fenêtre fermée par Échap restait là, avec les mêmes identifiants
        const dlg=document.createElement('dialog');dlg.className='modal small-modal';dlg.id='precise-map-dialog';
        const listeners=new AbortController();dlg.addEventListener('close',()=>{listeners.abort();dlg.remove();});
        dlg.innerHTML=`<div class="modal-head"><div><span class="eyebrow">POSITION PRÉCISE</span><h2>Affiner la localisation</h2></div><button class="icon-button" id="precise-map-close" type="button">×</button></div>
            <p class="form-help">Cliquez sur la carte pour poser le marqueur. Utilisez le zoom pour affiner. Lieu : <strong>${escapeHtml(placeName||'non renseigné')}</strong></p>
            <div id="precise-map-stage" class="precise-map-stage map-bg-color"><div class="map-tiles" id="precise-map-tiles"></div><div id="precise-map-marker-wrap"></div></div>
            <div id="precise-map-coords" class="precise-map-coords"></div>
            <div class="modal-actions"><button type="button" class="button secondary" id="precise-map-cancel">Annuler</button><button type="button" class="button" id="precise-map-confirm" disabled>Enregistrer cette position</button></div>`;
        document.body.append(dlg);dlg.showModal();
        // Mini map state
        let pLat=currentLat?Number(currentLat):centerLat,pLon=currentLon?Number(currentLon):centerLon;
        let pZoom=zoom,pCenter={lat:centerLat,lon:centerLon};let markerSet=currentLat&&currentLon;
        const stage=$('#precise-map-stage');
        const confirmBtn=$('#precise-map-confirm');
        const coordsEl=$('#precise-map-coords');
        const updateCoords=()=>{if(markerSet)coordsEl.textContent=`Marqueur : ${pLat.toFixed(6)}°N, ${pLon.toFixed(6)}°E`;else coordsEl.textContent='Cliquez sur la carte pour poser le marqueur.';confirmBtn.disabled=!markerSet;};
        const drawMarker=()=>{const wrap=$('#precise-map-marker-wrap');if(!wrap)return;if(!markerSet){wrap.innerHTML='';return;}const w=stage.clientWidth||400,h=stage.clientHeight||320;const z=pZoom;const mx=lngToX(pLon,z)-(lngToX(pCenter.lon,z)-w/2);const my=latToY(pLat,z)-(latToY(pCenter.lat,z)-h/2);wrap.innerHTML=`<div class="precise-map-pin" style="left:${mx}px;top:${my}px">📍</div>`;};
        const drawMiniMap=()=>{const tilesEl=$('#precise-map-tiles');if(!tilesEl)return;const w=stage.clientWidth||400,h=stage.clientHeight||320;tilesEl.innerHTML=renderTileGrid(tilesEl,pCenter.lat,pCenter.lon,pZoom,w,h);drawMarker();updateCoords();};
        setTimeout(()=>{drawMiniMap();},50);
        // If marker already set, pre-position center on it
        if(markerSet){pCenter={lat:pLat,lon:pLon};}
        // Click on map
        stage.addEventListener('click',e=>{if(e.target.closest('#precise-map-marker-wrap')||moved)return;/* fin d'un glissement de la carte : pas un clic */const rect=stage.getBoundingClientRect();const w=stage.clientWidth,h=stage.clientHeight;const px=e.clientX-rect.left,py=e.clientY-rect.top;const tileSize=256;const scale=Math.pow(2,pZoom);const originX=lngToX(pCenter.lon,pZoom)-w/2;const originY=latToY(pCenter.lat,pZoom)-h/2;pLon=xToLng(originX+px,pZoom);pLat=yToLat(originY+py,pZoom);markerSet=true;drawMarker();updateCoords();});
        // Zoom with scroll
        stage.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY<0?1:-1;pZoom=Math.max(4,Math.min(19,pZoom+delta));drawMiniMap();},{passive:false});
        // Drag to pan
        let drag=null,moved=false;stage.addEventListener('mousedown',e=>{drag={x:e.clientX,y:e.clientY,lat:pCenter.lat,lon:pCenter.lon};moved=false;});window.addEventListener('mousemove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;const tileSize=256;const scale=Math.pow(2,pZoom);pCenter.lon=drag.lon-dx/tileSize/scale*360;pCenter.lat=drag.lat===0?0:yToLat(latToY(drag.lat,pZoom)-dy,pZoom);drawMiniMap();},{signal:listeners.signal});window.addEventListener('mouseup',()=>drag=null,{signal:listeners.signal});
        updateCoords();
        $('#precise-map-close').addEventListener('click',()=>{dlg.close();dlg.remove();});
        $('#precise-map-cancel').addEventListener('click',()=>{dlg.close();dlg.remove();});
        $('#precise-map-confirm').addEventListener('click',()=>{if(!markerSet)return;form.elements.precise_lat.value=pLat.toFixed(7);form.elements.precise_lon.value=pLon.toFixed(7);renderFn(form,{precise_lat:pLat,precise_lon:pLon});dlg.close();dlg.remove();});
    }

    function renderTileGrid(container, lat, lon, zoom, w, h) {
        const tileSize=256; const scale=Math.pow(2,zoom);
        const cx=lngToX(lon,zoom), cy=latToY(lat,zoom);
        const left=cx-w/2, top=cy-h/2;
        const tx0=Math.floor(left/tileSize), ty0=Math.floor(top/tileSize);
        const tx1=Math.ceil((left+w)/tileSize), ty1=Math.ceil((top+h)/tileSize);
        const maxT=scale-1;let html='';
        for(let ty=ty0;ty<=ty1;ty++) for(let tx=tx0;tx<=tx1;tx++){
            const ttx=((tx%scale)+scale)%scale,tty=Math.max(0,Math.min(maxT,ty));
            const ox=tx*tileSize-left, oy=ty*tileSize-top;
            html+=`<img src="https://tile.openstreetmap.org/${zoom}/${ttx}/${tty}.png" style="position:absolute;left:${ox}px;top:${oy}px;width:256px;height:256px" draggable="false">`;
        }
        return html;
    }

    function fillFamilyOptions(families,selected){const select=$('#event-form').elements.family_id;if(!select)return;select.innerHTML=(families||[]).map(fam=>{const label=fam.other_partner_name?`Union avec ${fam.other_partner_name}`:`Union #${fam.id}`;const year=fam.marriage_year?` (${fam.marriage_year})`:'';return `<option value="${fam.id}" ${Number(fam.id)===Number(selected)?'selected':''}>${escapeHtml(label+year)}</option>`;}).join('');}
    function openEventDialog(detail,eventItem=null,artisticOnly=false,forceFamily=false){const personId=detail.person.id;const families=detail.families||[];const form=$('#event-form');form.reset();form.elements.person_id.value=personId;form.elements.id.value=eventItem?.id||'';form.elements.place_id.value=eventItem?.place_id||'';
        // Portée famille (ex: Mariage) : uniquement proposée à la création (pas à l'édition) et
        // seulement si la personne a au moins une union enregistrée.
        const canFamily=!eventItem&&!artisticOnly&&families.length>0;
        const scopeField=$('#event-scope-field'),familyField=$('#event-family-field');
        if(scopeField)scopeField.hidden=!canFamily;
        const initialScope=canFamily&&forceFamily?'family':'person';
        if(form.elements.event_scope)form.elements.event_scope.value=initialScope;
        fillFamilyOptions(families,'');
        if(familyField)familyField.hidden=!(canFamily&&initialScope==='family');
        fillEventTypes(eventItem?.event_type_id,eventItem?.scope||initialScope,artisticOnly);
        if(form.elements.event_scope&&!form.elements.event_scope.dataset.familyBound){
            form.elements.event_scope.addEventListener('change',()=>{
                const isFamily=form.elements.event_scope.value==='family';
                if(familyField)familyField.hidden=!isFamily;
                fillEventTypes('',isFamily?'family':'person');
                renderEventWorkFields(form.elements.event_type_id.value);
                renderEventSponsorSection();
            });
            form.elements.event_scope.dataset.familyBound='1';
        }
        form.elements.date_text.value=eventItem?.date_text||'';if(form.elements.date_uncertain)form.elements.date_uncertain.checked=Number(eventItem?.date_uncertain||0)===1;if(form.elements.date_calendar)form.elements.date_calendar.value=eventItem?.date_calendar||(converterCalendarOptions.some(([k])=>k===defaultCalendarSetting())?defaultCalendarSetting():'gregorian');if(form.elements.date_converted)form.elements.date_converted.value=eventItem?.date_converted||automaticEquivalentFromDateText(eventItem?.date_text||'',form.elements.date_calendar?.value||'gregorian');if(form.elements.date_alternative)form.elements.date_alternative.value=eventItem?.date_alternative||'';form.elements.title.value=eventItem?.title||'';form.elements.place_name.value=eventItem?placeDisplay(eventItem):(eventItem?.place_name||'');form.elements.country.value=eventItem?.country||'France';form.elements.description.value=eventItem?.description||'';if(form.elements.fact_confidence)form.elements.fact_confidence.value=eventItem?.fact_confidence||'unknown';if(form.elements.confidence_origin)form.elements.confidence_origin.value=eventItem?.confidence_origin||'';renderEventConfidenceMediaChoices(detail,eventItem?.confidence_media_id||0);setupEventConfidencePickers(detail);
        $('#event-dialog-title').dataset.artisticOnly=artisticOnly?'1':'';
        if(form.elements.first_name)form.elements.first_name.value=eventItem?.first_name||'';
        if(form.elements.last_name)form.elements.last_name.value=eventItem?.last_name||'';
        // Champs spécifiques à l'œuvre (selon le type d'événement sélectionné)
        let initialWorkValues={};if(eventItem?.work_fields){try{initialWorkValues=JSON.parse(eventItem.work_fields)||{};}catch(_){initialWorkValues={};}}
        renderEventWorkFields(form.elements.event_type_id.value,initialWorkValues);
        if(form.elements.work_fields)form.elements.work_fields.value='';
        if(!form.elements.event_type_id.dataset.workFieldsBound){
            form.elements.event_type_id.addEventListener('change',()=>{renderEventWorkFields(form.elements.event_type_id.value);renderEventSponsorSection();});
            form.elements.event_type_id.dataset.workFieldsBound='1';
        }
        // Position précise
        form.elements.precise_lat.value=eventItem?.precise_lat!=null?eventItem.precise_lat:'';form.elements.precise_lon.value=eventItem?.precise_lon!=null?eventItem.precise_lon:'';renderEventPreciseBlock(form,eventItem);
        if(form.elements.address)form.elements.address.value=eventItem?.address||'';
        if(form.elements.extra_info)form.elements.extra_info.value=eventItem?.extra_info||'';
        form.elements.former_place_name.value=eventItem?.former_place_name||'';form.elements.former_country.value=eventItem?.former_country||'';
        const hasFormer=!!(eventItem?.former_place_name||eventItem?.former_country);$('#former-place-fields').hidden=!hasFormer;$('#former-place-toggle').setAttribute('aria-expanded',String(hasFormer));
        setupPlaceAutocomplete(form);$('#event-dialog-title').textContent=eventItem?(artisticOnly?'Modifier une œuvre':'Modifier un événement'):(artisticOnly?'Ajouter une œuvre':(initialScope==='family'?'Ajouter un événement de famille':'Ajouter un événement'));$('#event-submit').textContent=eventItem?'Enregistrer':'Ajouter';renderLabelPicker('#event-label-picker','event',eventItem?.id||0,eventItem?.labels||[]);const eventWitnessRows=eventItem?.witnesses||[];state.eventSponsors=eventWitnessRows.map(parseSponsorWitness).filter(Boolean);state.eventWitnesses=eventWitnessRows.filter(w=>!parseSponsorWitness(w)).map(w=>({person_id:Number(w.person_id),name:personName(w),note:w.note||''}));renderEventSponsorSection();renderEventWitnesses();
        const hiddenPicker=$('#event-form .date-picker-hidden');if(hiddenPicker)hiddenPicker.value=dateTextToIso(eventItem?.date_text||'');
        const eventMediaBtn=$('#event-manage-media-btn');
        const eventMediaList=$('#event-media-list');
        if(eventItem?.id){
            eventMediaBtn.disabled=false;
            eventMediaBtn.onclick=()=>openEventMediaPanel(detail,eventItem.id);
            const linked=mediaForEvent(detail.media||[],eventItem.id);
            eventMediaList.innerHTML=linked.length?`<p class="form-help">${plural(linked.length,'document lié','documents liés')} à cet événement.</p>`:'';
        } else {
            eventMediaBtn.disabled=true;
            eventMediaBtn.onclick=null;
            eventMediaList.innerHTML='<p class="form-help">Enregistre l’événement avant d’ajouter des documents.</p>';
        }
        bindEventDateCheck(detail,eventItem);
        $('#event-dialog').showModal();}
    /** Pendant la saisie d'un événement : la date est-elle possible ? (jour qui existe, pas dans le futur, cohérente avec la naissance,
        le décès, les parents, les enfants, un mariage pas avant 12 ans). Ce n'est qu'un avertissement : on peut enregistrer quand même.
        Tout l'arbre : Maintenance → Incohérences avancées. */
    function eventDateWarnings(detail,form,eventItem){
        const text=String(form.elements.date_text?.value||'').trim();if(!text)return [];
        const cal=form.elements.date_calendar?.value||'gregorian',out=[],now=new Date().getFullYear();
        const type=(state.bootstrap?.eventTypes||[]).find(t=>Number(t.id)===Number(form.elements.event_type_id?.value))||{},tag=type.gedcom_tag||'',label=type.label||'Cet événement';
        // jour, mois et année : dans le calendrier choisi, puis en grégorien pour comparer aux autres dates
        let year=null;
        if(cal==='gregorian'||cal==='julian'){
            const d=parseNumericCalendarDate(text)||parseFrenchDateText(text);
            if(d){
                const leap=cal==='julian'||d.year<1583?d.year%4===0:(d.year%4===0&&(d.year%100!==0||d.year%400===0)); // avant 1582 : calendrier julien
                const max=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][d.month-1];
                if(d.month<1||d.month>12)out.push(`Le mois ${d.month} n’existe pas (de 1 à 12).`);
                else if(d.day<1||d.day>max)out.push(`Le ${d.day} ${['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][d.month-1]} ${d.year} n’existe pas (${max} jours ce mois-là).`);
                year=d.year;
            }
        }
        if(cal!=='gregorian'){const eq=automaticEquivalentFromDateText(text,cal,'gregorian').match(/(\d{3,4})\s*$/);if(eq)year=Number(eq[1]);}
        if(year===null){const m=text.match(/(?:^|\D)(\d{3,4})(?!\d)/g);if(m&&cal==='gregorian')year=Number(m[m.length-1].replace(/\D/g,''));}
        if(!year)return out;
        if(year>now)out.push(`${year} est dans le futur.`);
        const own=(detail.events||[]).filter(e=>!eventItem||Number(e.id)!==Number(eventItem.id));
        const yearOf=tags=>{const ys=own.filter(e=>tags.includes(e.gedcom_tag)&&Number(e.year)).map(e=>Number(e.year));return ys.length?Math.min(...ys):null;};
        const birth=tag==='BIRT'?null:(yearOf(['BIRT'])??(Number(detail.person?.birth_year||0)||null)),death=tag==='DEAT'?null:(yearOf(['DEAT'])??(Number(detail.person?.death_year||0)||null));
        const after=['DEAT','BURI','CREM','PROB','WILL'].includes(tag)||/inhum|obs[eè]qu|succession|testament|s[ée]pult|fun[ée]r/i.test(label);
        if(birth&&year<birth&&tag!=='BIRT')out.push(`${label} en ${year}, avant la naissance (${birth}).`);
        if(death&&year>death&&!after)out.push(`${label} en ${year}, après le décès (${death}).`);
        if(['MARR','MRCI','MRRE','ENGA'].includes(tag)&&birth&&year>=birth&&year-birth<12)out.push(`Mariage à ${year-birth} an${year-birth>1?'s':''} (naissance en ${birth}).`);
        if(tag==='DEAT'&&birth&&year-birth>115)out.push(`Décès à ${year-birth} ans : c’est beaucoup.`);
        if(tag==='BIRT'){
            (detail.parents||[]).forEach(p=>{const pb=Number(p.birth_year)||0,pd=Number(p.death_year)||0,n=personName(p);
                if(pb&&year<=pb)out.push(`Naissance en ${year}, mais son parent ${n} est né en ${pb}.`);
                else if(pb&&year-pb<12)out.push(`Son parent ${n} n’aurait que ${plural(year-pb,'an')}.`);
                else if(pb&&p.gender==='female'&&year-pb>55)out.push(`Sa mère ${n} aurait ${year-pb} ans.`);
                if(pd&&year>pd+(p.gender==='female'?0:1))out.push(`Naissance en ${year}, après le décès de son parent ${n} (${pd}).`);});
            (detail.children||[]).forEach(c=>{const cb=Number(c.birth_year)||0;if(cb&&cb<=year)out.push(`Naissance en ${year}, mais son enfant ${personName(c)} est né en ${cb}.`);});
        }
        if(tag==='DEAT'){(detail.children||[]).forEach(c=>{const cb=Number(c.birth_year)||0;if(cb&&cb>year+1&&detail.person?.gender!=='female')out.push(`Décès en ${year}, mais son enfant ${personName(c)} naît en ${cb}.`);else if(cb&&cb>year&&detail.person?.gender==='female')out.push(`Décès en ${year}, mais son enfant ${personName(c)} naît en ${cb}.`);});}
        return out;
    }
    function bindEventDateCheck(detail,eventItem){
        const form=$('#event-form');if(!form)return;
        let box=$('#event-date-check');
        if(!box){box=document.createElement('div');box.id='event-date-check';box.className='span-2 event-date-check';box.setAttribute('role','status');(form.elements.date_calendar?.closest('label')||form.elements.date_text.closest('label')).after(box);}
        form._dateCheck=()=>{const w=eventDateWarnings(detail,form,eventItem);box.hidden=!w.length;box.innerHTML=w.length?`<strong>⚠️ À vérifier</strong><ul>${w.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><small>Tu peux enregistrer quand même. Tout l’arbre : Maintenance → Incohérences avancées.</small>`:'';};
        if(!form.dataset.dateCheckBound){form.dataset.dateCheckBound='1';['input','change'].forEach(ev=>form.addEventListener(ev,e=>{if(e.target.matches('[name="date_text"],[name="date_calendar"],[name="event_type_id"],.date-picker-hidden'))setTimeout(()=>form._dateCheck?.(),0);}));}
        form._dateCheck();
    }
    function openRelationDialog(personId,type){const form=$('#relation-form');form.reset();form.elements.person_id.value=personId;form.elements.relation_type.value=type;pkSet($('#relation-search'),null);[...form.elements.entry_mode.options].forEach(option=>option.hidden=type==='parent'&&['none','none_suspected'].includes(option.value));$('#relation-existing-fields').hidden=false;$('#relation-new-fields').hidden=true;$('#relation-dialog-title').textContent=`Ajouter ${type==='parent'?'un parent':type==='child'?'un enfant':'un conjoint'}`;$('#relation-dialog').showModal();setTimeout(()=>$('#relation-search .pk-input')?.focus(),30);}
    function openInvestigationDialog(personId,item=null){
        const form=$('#investigation-form');form.reset();
        form.elements.id.value=item?.id||'';
        form.elements.person_id.value=personId;
        ['title','question','known_facts','documents','status'].forEach(field=>form.elements[field].value=item?.[field]||(field==='status'?'open':''));
        $('#investigation-dialog-title').textContent=item?'Modifier l’enquête':'Nouvelle enquête';
        // Personnes : menu de choix unique avec rôles (principale + principales + secondaires). Le serveur reçoit toujours
        // person_id (la principale) et additional_persons « id:primary,id:secondary » ; les noms sans fiche et les mots de rôle ne sont pas gardés.
        const extraPersonsInput=$('#investigation-extra-persons'),peopleBox=$('#investigation-people');
        const linked=(item?.linked_persons||[]).map(p=>({id:Number(p.person_id),title:p.person_name||'',kind:'person',primary:(p.role||'secondary')==='primary'}));
        const mainValue=Number(personId)?(Number(state.currentPerson?.person?.id)===Number(personId)?{id:Number(personId),title:personName(state.currentPerson.person),kind:'person'}:Number(personId)):null;
        peopleBox.innerHTML=pkField({name:'people_json',kind:'person',roles:{main:true},value:{main:mainValue,people:linked}});
        const syncPeople=()=>{const v=pkValue(peopleBox.querySelector('.pk'))||{main:null,people:[]};form.elements.person_id.value=v.main||'';if(extraPersonsInput)extraPersonsInput.value=(v.people||[]).filter(p=>p.id&&Number(p.id)!==Number(v.main)).map(p=>`${p.id}:${p.primary?'primary':'secondary'}`).join(',');};
        syncPeople();
        if(!peopleBox.dataset.pkBound){peopleBox.dataset.pkBound='1';pkBindQuickCreate(peopleBox);peopleBox.addEventListener('picker-change',()=>{const v=pkValue(peopleBox.querySelector('.pk'))||{};$('#investigation-form').elements.person_id.value=v.main||'';const input=$('#investigation-extra-persons');if(input)input.value=(v.people||[]).filter(p=>p.id&&Number(p.id)!==Number(v.main)).map(p=>`${p.id}:${p.primary?'primary':'secondary'}`).join(',');});}
        // Battues liées : menu de choix unique (champ linked_battues « 12,45 »)
        pkSet($('#investigation-battue-search'),(item?.linked_battues||[]).map(b=>({id:Number(b.battue_id||b.id),title:b.title||`Battue #${b.battue_id||b.id}`,kind:'battue',meta:[b.start_name,b.start_insee_code].filter(Boolean).join(' · ')})));
        $('#investigation-dialog').showModal();
    }
    function openBattueDialog(item=null,seedPersons=[]){
        const form=$('#battue-form');
        if(!form)return;
        form.reset();
        const types=state.battueTargetTypes||state.currentBattueDetail?.target_types||battueTargetTypesDefault;
        form.elements.id.value=item?.id||'';
        form.elements.start_insee_code.value=item?.start_insee_code||'';
        form.elements.target_type.innerHTML=battueTargetOptions(types,item?.target_type||'naissance');
        form.elements.title.value=item?.title||'';
        form.elements.target_text.value=item?.target_text||'';
        form.elements.max_level.value=String(item?.max_level ?? 2);
        form.elements.status.value=item?.status||'open';
        form.elements.notes.value=item?.notes||'';
        // Personnes liées : menu de choix unique avec les zones ★ principales / ☆ secondaires (linked_persons « id:primary,id:secondary »)
        const linkedPersons=(item?.linked_persons||seedPersons||[]).map(p=>({id:Number(p.person_id),title:p.person_name||p.name||'',kind:'person',primary:(p.role||'primary')!=='secondary'})).filter(p=>p.id);
        const linkedInput=$('#battue-linked-persons'),peopleBox=$('#battue-person-search');
        const syncLinked=()=>{const v=pkValue(peopleBox.querySelector('.pk'))||{people:[]};if(linkedInput)linkedInput.value=(v.people||[]).filter(p=>p.id).map(p=>`${p.id}:${p.primary?'primary':'secondary'}`).join(',');};
        peopleBox.innerHTML=pkField({name:'battue_people_json',kind:'person',roles:{main:false},value:{people:linkedPersons}});
        if(linkedInput)linkedInput.value=linkedPersons.map(p=>`${p.id}:${p.primary?'primary':'secondary'}`).join(',');
        if(!peopleBox.dataset.pkBound){peopleBox.dataset.pkBound='1';pkBindQuickCreate(peopleBox);peopleBox.addEventListener('picker-change',()=>syncLinked());}
        // Enquêtes liées : menu de choix unique (champ linked_investigations « 3,8 »)
        pkSet($('#battue-investigation-search'),(item?.linked_investigations||[]).map(inv=>({id:Number(inv.investigation_id||inv.id),title:inv.title||`Enquête #${inv.investigation_id||inv.id}`,kind:'investigation',meta:inv.person_name||''})));
        // Commune de départ : menu des lieux ; la battue garde le code INSEE (start_insee_code) de la commune choisie
        const communeField=$('#battue-commune-search');
        pkSet(communeField,item?.start_insee_code?{id:-1,kind:'place',title:item.start_name||item.start_insee_code,name:item.start_name||item.start_insee_code,short:item.start_insee_code,group:'base'}:null);
        if(!communeField.dataset.pkBattue){communeField.dataset.pkBattue='1';communeField.addEventListener('picker-change',async event=>{const it=event.detail.item,form=$('#battue-form');form.elements.start_insee_code.value='';if(!it||it.free)return;
            const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
            try{const data=await api('commune_suggestions',{q:it.name||it.title});const rows=(data.communes||[]).filter(r=>fold(r.name)===fold(it.name||it.title));const hit=rows.find(r=>!it.county||fold(r.admin2)===fold(it.county))||(rows.length===1?rows[0]:null);
                if(hit)form.elements.start_insee_code.value=hit.insee_code;else{toast('Ce lieu n’est pas une commune française connue : choisis une commune de France.','error');pkSet(communeField,null);}}catch(error){toast(error.message,'error');}});}
        $('#battue-dialog-title').textContent=item?'Modifier la battue':'Nouvelle battue';
        $('#battue-submit').textContent=item?'Enregistrer':'Créer la battue';
        $('#battue-dialog').showModal();
        setTimeout(()=>$('#battue-title')?.focus(),30);
    }
    function openHypothesisDialog(personId,detail,item=null,eventId=0){const form=$('#hypothesis-form');form.reset();form.elements.id.value=item?.id||'';form.elements.person_id.value=personId;form.elements.event_id.innerHTML='<option value="">À rattacher plus tard</option>'+detail.events.map(event=>`<option value="${event.id}">${escapeHtml(event.type_label)} — ${escapeHtml(event.date_text||event.year||'date inconnue')}</option>`).join('');['title','event_id','type','related_person_id','confidence','status','statement'].forEach(field=>form.elements[field].value=item?.[field]??(field==='event_id'?(eventId||''):field==='confidence'?'medium':field==='status'?'open':field==='type'?'identity':''));$('#hypothesis-dialog-title').textContent=item?'Modifier l’hypothèse':'Nouvelle hypothèse';$('#hypothesis-dialog').showModal();}
    function openEvidenceDialog(personId,detail,item=null,eventId=0){const form=$('#evidence-form');form.reset();form.elements.id.value=item?.id||'';form.elements.person_id.value=personId;form.elements.event_id.innerHTML='<option value="">À rattacher plus tard</option>'+detail.events.map(event=>`<option value="${event.id}">${escapeHtml(event.type_label)} — ${escapeHtml(event.date_text||event.year||'date inconnue')}</option>`).join('');form.elements.source_id.innerHTML='<option value="">Aucune source précise</option>'+detail.sources.map(source=>`<option value="${source.id}">${escapeHtml(source.title||'Source #'+source.id)}</option>`).join('');['title','subject','event_id','source_id','quality','confidence','note'].forEach(field=>form.elements[field].value=item?.[field]??(field==='event_id'?(eventId||''):field==='quality'?'unsourced':field==='confidence'?'medium':''));$('#evidence-dialog-title').textContent=item?'Modifier la preuve':'Nouvelle preuve';$('#evidence-dialog').showModal();}
    function openResearchNoteDialog(personId,item=null){const form=$('#research-note-form');form.reset();form.elements.id.value=item?.id||'';form.elements.person_id.value=personId;['title','body','result','next_step'].forEach(field=>form.elements[field].value=item?.[field]||'');$('#research-note-dialog-title').textContent=item?'Modifier l’entrée':'Nouvelle entrée';$('#research-note-dialog').showModal();}
    function openBattueAliasDialog(battueId,commune,alias=null){
        if(!commune)return;
        const form=$('#battue-alias-form');
        form.reset();
        form.elements.id.value=alias?.id||'';
        form.elements.battue_id.value=battueId;
        form.elements.insee_code.value=commune.insee_code;
        form.elements.name.value=alias?.name||'';
        form.elements.note.value=alias?.note||'';
        $('#battue-alias-title').textContent=alias?'Modifier la commune liée':`Ajouter une commune liée à ${commune.name}`;
        $('#battue-alias-dialog').showModal();
    }
    function openBattueSearchDialog(battueId,commune,item=null){
        if(!commune)return;
        const data=state.currentBattueDetail||{};
        const form=$('#battue-search-form');
        form.reset();
        form.elements.id.value=item?.id||'';
        form.elements.battue_id.value=battueId;
        form.elements.insee_code.value=commune.insee_code;
        form.elements.alias_id.innerHTML=`<option value="">${escapeHtml(commune.name)} (commune actuelle)</option>${(commune.aliases||[]).map(alias=>`<option value="${alias.id}">${escapeHtml(alias.name)}</option>`).join('')}`;
        form.elements.alias_id.value=item?.alias_id||'';
        form.elements.record_type.innerHTML=battueTargetOptions(data.target_types,item?.record_type||data.battue?.target_type||'naissance');
        form.elements.period.value=item?.period||'';
        form.elements.register.value=item?.register||'';
        form.elements.title.value=item?.title||'';
        form.elements.status.innerHTML=battueStatusOptions(data.statuses,item?.status||'todo');
        const digestInput=form.elements.archive_digest_search;
        const digestId=form.elements.archive_digest_id;
        const digestResults=$('[data-battue-archive-digest-results]',form);
        const digestSelected=$('[data-battue-archive-digest-selected]',form);
        let selectedDigests=(item?.archive_digests||[]).map(digest=>({...digest}));
        const renderSelectedDigests=()=>{
            digestId.value=selectedDigests.map(digest=>digest.id).join(',');
            digestSelected.innerHTML=selectedDigests.map(digest=>`<span class="selected-relation"><span>${escapeHtml(archiveDigestOptionLabel(digest))}</span><button type="button" class="icon-button" title="Retirer ce suivi" aria-label="Retirer ce suivi" data-remove-battue-archive-digest="${digest.id}">×</button></span>`).join('');
        };
        if(!selectedDigests.length&&item?.archive_digest_id&&[item.archive_digest_place_name,item.archive_digest_city,item.archive_digest_alias,item.archive_digest_reference,item.archive_digest_year].some(Boolean))selectedDigests=[{id:item.archive_digest_id,city_name:item.archive_digest_city,city_alias:item.archive_digest_alias,archive_reference:item.archive_digest_reference,year_text:item.archive_digest_year,record_type:item.archive_digest_record_type,place_name:item.archive_digest_place_name}];
        renderSelectedDigests();
        digestInput.oninput=debounce(async()=>{
            const q=digestInput.value.trim();
            if(q.length<2){digestResults.innerHTML='';return;}
            try{
                const result=await api('archive_digest_search',{q});
                digestResults.innerHTML=(result.rows||[]).slice(0,12).map(digest=>`<button class="relation-result" type="button" data-battue-archive-digest-candidate="${digest.id}"><strong>${escapeHtml(archiveDigestOptionLabel(digest)||'Suivi sans intitulé')}</strong><small>${escapeHtml([digest.status,digest.searched].filter(Boolean).join(' · '))}</small></button>`).join('')||'<p>Aucun suivi trouvé.</p>';
                $$('[data-battue-archive-digest-candidate]',digestResults).forEach(candidate=>candidate.addEventListener('click',()=>{const digest=(result.rows||[]).find(row=>Number(row.id)===Number(candidate.dataset.battueArchiveDigestCandidate));if(digest&&!selectedDigests.some(row=>Number(row.id)===Number(digest.id)))selectedDigests.push(digest);digestInput.value='';digestResults.innerHTML='';renderSelectedDigests();}));
            }catch(error){digestResults.innerHTML=`<p>${escapeHtml(error.message||'Recherche indisponible.')}</p>`;}
        },220);
        digestSelected.onclick=event=>{const remove=event.target.closest('[data-remove-battue-archive-digest]');if(!remove)return;selectedDigests=selectedDigests.filter(digest=>Number(digest.id)!==Number(remove.dataset.removeBattueArchiveDigest));renderSelectedDigests();};
        form.elements.url.value=item?.url||'';
        form.elements.note.value=item?.note||'';
        $('#battue-search-title').textContent=item?'Modifier l’annotation':`Annoter ${commune.name}`;
        $('#battue-search-dialog').showModal();
    }
    function openInvestigationItemDialog(investigationId,item=null){
        const form=$('#investigation-item-form');form.reset();
        form.elements.investigation_id.value=investigationId;
        const dialogTitle=$('#investigation-item-dialog-title'),dialogEyebrow=$('#investigation-item-eyebrow'),submitButton=$('#investigation-item-submit');
        if(dialogTitle)dialogTitle.textContent=item?'Modifier une piste ou une source':'Ajouter une piste ou une source';
        if(dialogEyebrow)dialogEyebrow.textContent=item?'MODIFICATION':'PISTE EXPLORÉE';
        if(submitButton)submitButton.textContent=item?'Enregistrer':'Ajouter';
        if(item){
            ['kind','title','url','notes','status','reminder_mode','reminder_due_at'].forEach(f=>{if(form.elements[f])form.elements[f].value=item[f]||'';});
            if(form.elements.reminder_mode&&!form.elements.reminder_mode.value)form.elements.reminder_mode.value='none';
            form.dataset.editItemId=item.id||'';
        }else{
            form.dataset.editItemId='';
        }
        const digestInput=form.elements.archive_digest_search,digestId=form.elements.archive_digest_id,digestResults=$('[data-investigation-archive-digest-results]',form),digestSelected=$('[data-investigation-archive-digest-selected]',form);
        let selectedDigests=(item?.archive_digests||[]).map(digest=>({...digest}));
        const renderSelectedDigests=()=>{
            digestId.value=selectedDigests.map(digest=>digest.id).join(',');
            digestSelected.innerHTML=selectedDigests.map(digest=>`<span class="selected-relation"><span>${escapeHtml(archiveDigestOptionLabel(digest))}</span><button type="button" class="icon-button" title="Retirer ce suivi" aria-label="Retirer ce suivi" data-remove-investigation-archive-digest="${digest.id}">×</button></span>`).join('');
        };
        if(!selectedDigests.length&&item?.archive_digest_id&&[item.archive_digest_place_name,item.archive_digest_city,item.archive_digest_alias,item.archive_digest_reference,item.archive_digest_year].some(Boolean))selectedDigests=[{id:item.archive_digest_id,city_name:item.archive_digest_city,city_alias:item.archive_digest_alias,archive_reference:item.archive_digest_reference,year_text:item.archive_digest_year,record_type:item.archive_digest_record_type,place_name:item.archive_digest_place_name}];
        renderSelectedDigests();
        digestInput.oninput=debounce(async()=>{const q=digestInput.value.trim();if(q.length<2){digestResults.innerHTML='';return;}try{const result=await api('archive_digest_search',{q});digestResults.innerHTML=(result.rows||[]).slice(0,12).map(digest=>`<button class="relation-result" type="button" data-investigation-archive-digest-candidate="${digest.id}"><strong>${escapeHtml(archiveDigestOptionLabel(digest)||'Suivi sans intitulé')}</strong><small>${escapeHtml([digest.status,digest.searched].filter(Boolean).join(' · '))}</small></button>`).join('')||'<p>Aucun suivi trouvé.</p>';$$('[data-investigation-archive-digest-candidate]',digestResults).forEach(candidate=>candidate.addEventListener('click',()=>{const digest=(result.rows||[]).find(row=>Number(row.id)===Number(candidate.dataset.investigationArchiveDigestCandidate));if(digest&&!selectedDigests.some(row=>Number(row.id)===Number(digest.id)))selectedDigests.push(digest);digestInput.value='';digestResults.innerHTML='';renderSelectedDigests();}));}catch(error){digestResults.innerHTML=`<p>${escapeHtml(error.message||'Recherche indisponible.')}</p>`;}},220);
        digestSelected.onclick=event=>{const remove=event.target.closest('[data-remove-investigation-archive-digest]');if(!remove)return;selectedDigests=selectedDigests.filter(digest=>Number(digest.id)!==Number(remove.dataset.removeInvestigationArchiveDigest));renderSelectedDigests();};
        // Personnes liées : menu de choix unique (champ linked_person_ids « 12,45 »)
        let itemLinkedPersons=[];
        if(item?.linked_person_ids){const names=String(item.linked_person_names||'').split('|');itemLinkedPersons=String(item.linked_person_ids).split(',').filter(Boolean).map((id,i)=>({id:Number(id),title:names[i]||'',kind:'person'}));}
        else if(item?.linked_person_id)itemLinkedPersons=[{id:Number(item.linked_person_id),title:item.linked_person_name||'',kind:'person'}];
        pkSet($('#investigation-item-person-search'),itemLinkedPersons);pkBindQuickCreate($('#investigation-item-dialog'));
        const reminderButton=$('#download-investigation-reminder');if(reminderButton)reminderButton.onclick=()=>downloadInvestigationReminderIcs(form);
        $('#investigation-item-dialog').showModal();
    }
    function downloadInvestigationReminderIcs(form){
        const title=(form.elements.title?.value||'Rappel généalogique').trim();
        const date=form.elements.reminder_due_at?.value||'';
        const mode=form.elements.reminder_mode?.value||'none';
        if(!date||mode==='none'){toast('Choisis une date de rappel.','error');return;}
        const ymd=date.replaceAll('-','');
        const summary=(mode==='before'?'À faire avant : ':mode==='after'?'À faire après : ':'À faire : ')+title;
        const desc=(form.elements.notes?.value||'').replace(/\r?\n/g,'\\n');
        const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
        const esc=value=>String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/([,;])/g,'\\$1');
        const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Genealogie//Rappel//FR','BEGIN:VEVENT',`UID:${Date.now()}-${Math.random().toString(16).slice(2)}@genealogie.local`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${ymd}`,`SUMMARY:${esc(summary)}`,`DESCRIPTION:${esc(desc)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
        const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=`rappel-${date}-${title.toLowerCase().replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'genealogie'}.ics`;
        document.body.append(a);a.click();const href=a.href;a.remove();setTimeout(()=>URL.revokeObjectURL(href),500);
    }
    async function openInvestigationMediaDialog(investigationId,personId,selectedMediaIds=[],selectedItemIds=[],items=[],currentFile=null,folders=[]){
        const form=$('#investigation-media-form');form.reset();form.elements.investigation_id.value=investigationId;form.elements.verdict.value=currentFile?.verdict||'interesting';form.elements.reason.value=currentFile?.reason||'';
        const mediaSelect=form.querySelector('[name="media_ids[]"]'),itemSelect=form.querySelector('[name="item_ids[]"]');
        itemSelect.innerHTML=items.map(item=>`<option value="${item.id}" ${selectedItemIds.includes(Number(item.id))?'selected':''}>${escapeHtml(item.title)}</option>`).join('');
        const folderSelect=form.querySelector('[name="folder_id"]');
        if(folderSelect)folderSelect.innerHTML=`<option value="">Racine de l’enquête</option>${folders.map(folder=>`<option value="${folder.id}" ${Number(currentFile?.folder_id||0)===Number(folder.id)?'selected':''}>${'— '.repeat(Math.max(0,investigationFolderPath(folders,folder.id).length-1))}${escapeHtml(folder.name)}</option>`).join('')}`;
        mediaSelect.innerHTML='<option value="" disabled>— Choisis d’abord une personne —</option>';
        const previewWrap=$('#inv-media-preview-wrap'),previewBox=$('#inv-media-preview');
        previewWrap.style.display='none';previewBox.innerHTML='';
        // la personne dont on montre les médias : menu de choix unique (champ inv_media_person_id ; inv_media_person_name suit)
        const personField=$('#inv-media-person-search');
        pkSet(personField,null);form.elements.inv_media_person_name.value='';
        const loadMediaForPerson=async(pid)=>{
            try{
                const det=await api('person',{id:pid});
                mediaSelect.innerHTML=det.media.length?det.media.map(m=>`<option value="${m.id}" ${selectedMediaIds.includes(Number(m.id))?'selected':''}>${escapeHtml(m.attachment_label||m.title||m.filename)}</option>`).join(''):'<option value="" disabled>Aucun média pour cette personne</option>';
                // Preview: show thumbnails
                previewBox.innerHTML=det.media.map(m=>`<button type="button" data-inv-preview-id="${m.id}" data-inv-preview-title="${escapeHtml(m.title||m.filename)}" title="${escapeHtml(m.title||m.filename)}" style="background:none;border:2px solid transparent;border-radius:4px;padding:2px;cursor:pointer;transition:opacity .15s,transform .15s,border-color .15s">${normalizedMediaType(m)==='image'?`<img src="media/${encodeURIComponent(m.thumbnail||m.filename)}" alt="${escapeHtml(m.title||m.filename)}" style="height:64px;width:64px;object-fit:cover;border-radius:3px;display:block">`:`<span class="media-preview-type-mark">${mediaTypeShortLabelWithIcon(m)}</span>`}<span style="display:block;font-size:.6em;max-width:64px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;color:var(--muted)">${escapeHtml((m.title||m.filename).slice(0,14))}</span></button>`).join('');
                previewWrap.style.display=det.media.length?'block':'none';
                // Click on preview opens lightbox-like full view
                // Sync thumbnail visual state with <select>
                function syncPreviewHighlights(){
                    const selected=new Set([...mediaSelect.options].filter(o=>o.selected).map(o=>o.value));
                    const anySelected=selected.size>0;
                    previewBox.querySelectorAll('[data-inv-preview-id]').forEach(b=>{
                        const isSelected=selected.has(b.dataset.invPreviewId);
                        b.style.borderColor=isSelected?'var(--accent,#0066cc)':'transparent';
                        b.style.opacity=anySelected?(isSelected?'1':'0.3'):'1';
                        b.style.transform=isSelected?'scale(1.05)':'scale(1)';
                        b.title=b.dataset.invPreviewTitle+(isSelected?' ✓ Sélectionné':'');
                    });
                }
                // Sync select → thumbnails
                mediaSelect.addEventListener('change',syncPreviewHighlights);
                previewBox.querySelectorAll('[data-inv-preview-id]').forEach(btn=>{
                    // Single click: toggle selection in the <select> and update visual
                    btn.addEventListener('click',e=>{
                        // If Ctrl/Meta pressed, open lightbox instead
                        if(e.ctrlKey||e.metaKey||e.shiftKey){
                            const mid=Number(btn.dataset.invPreviewId);
                            const mfile=det.media.find(m=>Number(m.id)===mid);if(!mfile)return;
                            openLightbox([mfile],0,true);return;
                        }
                        const mid=btn.dataset.invPreviewId;
                        const opt=[...mediaSelect.options].find(o=>o.value===mid);
                        if(opt){opt.selected=!opt.selected;syncPreviewHighlights();}
                    });
                    // Long-press / double-click opens lightbox read-only
                    btn.addEventListener('dblclick',()=>{
                        const mid=Number(btn.dataset.invPreviewId);
                        const mfile=det.media.find(m=>Number(m.id)===mid);if(!mfile)return;
                        openLightbox([mfile],0,true);
                    });
                });
                syncPreviewHighlights();
            }catch(e){toast(e.message,'error');}
        };
        personField.onchangePick=async item=>{form.elements.inv_media_person_name.value=item?.title||'';if(item&&!item.free&&item.id)await loadMediaForPerson(Number(item.id));else{mediaSelect.innerHTML='<option value="" disabled>— Choisis d’abord une personne —</option>';previewWrap.style.display='none';previewBox.innerHTML='';}};
        if(!personField.dataset.pkInvMedia){personField.dataset.pkInvMedia='1';personField.addEventListener('picker-change',event=>personField.onchangePick?.(event.detail.item));}
        // personne connue : pré-remplie
        if(personId){
            const known=Number(state.currentPerson?.person?.id)===Number(personId)?{id:Number(personId),title:personName(state.currentPerson.person),kind:'person'}:Number(personId);
            pkSet(personField,known);if(known.title)form.elements.inv_media_person_name.value=known.title;
            await loadMediaForPerson(personId);
        }
        $('#investigation-media-dialog').showModal();
    }
    function updateMediaCreateEventFields(){const form=$('#media-form'),creating=form.elements.create_event?.checked;$('#media-create-event-fields').hidden=!creating;form.elements.event_id.disabled=!!creating;if(creating)form.elements.census_id.value='';}
    function fillMediaEventTypes(selected=''){const select=$('#media-form').elements.create_event_type_id;if(!select)return;const types=state.bootstrap.eventTypes.filter(type=>type.scope==='person');select.innerHTML=types.map(type=>`<option value="${type.id}" ${Number(type.id)===Number(selected)?'selected':''}>${escapeHtml(type.label)}</option>`).join('');}
    function openMediaDialog(detail,options={}){
        const form=$('#media-form');
        form.reset();
        form.elements.person_id.value=detail.person.id;
        form.elements.investigation_id.value='';
        if(form.elements.battue_item_id)form.elements.battue_item_id.value='';
        $('#media-investigation-fields').hidden=true;
        form.elements.event_id.closest('label').hidden=false;
        $('#media-census-label').hidden=false;
        $('#media-create-event-toggle').hidden=false;
        fillMediaEventTypes();
        form.elements.event_id.disabled=false;
        form.elements.event_id.innerHTML='<option value="">La fiche entière</option><option value="__military">Dossier militaire</option><option value="__voter_card">Carte d’électeur</option><option value="__id_card">Carte d’identité</option><option value="__permit">Permis</option>'+detail.events.map(event=>`<option value="${event.id}">${escapeHtml(event.type_label)} — ${escapeHtml(event.date_text||'date inconnue')}</option>`).join('');
        const censusRecords=detail.census?.records||[];
        form.elements.census_id.innerHTML='<option value="">Aucun recensement</option>'+censusRecords.map(record=>`<option value="${record.id}" ${Number(options.censusId)===Number(record.id)?'selected':''}>Recensement ${record.year}${record.address?` — ${escapeHtml(record.address)}`:''}</option>`).join('');
        if(options.eventId)form.elements.event_id.value=options.eventId;
        if(options.censusId)form.elements.event_id.value='';
        updateMediaCreateEventFields();
        const correspondenceFields=$('#media-correspondence-fields');
        if(correspondenceFields){
            correspondenceFields.hidden=!options.correspondence;
            if(options.correspondence&&form.elements.correspondence_type)form.elements.correspondence_type.value='lettre';
            const replySelect=form.elements.correspondence_reply_to_media_id;
            if(replySelect){
                const rows=correspondenceMediaOnly(detail.media||[]);
                replySelect.innerHTML='<option value="">Aucune autre correspondance</option>'+rows.map(item=>`<option value="${item.id}">${escapeHtml([correspondenceTypeLabel(item.correspondence_type),item.date_text,item.title||item.attachment_label||item.filename].filter(Boolean).join(' · '))}</option>`).join('');
            }
        }
        const filesInput=$('#media-files-input'),folderInput=$('#media-folder-input');
        const accept=options.memory?'audio/*,video/*,.aif,.aiff,.aifc':'image/*,application/pdf,audio/*,video/*,.aif,.aiff,.aifc';
        if(filesInput)filesInput.setAttribute('accept',accept);
        if(folderInput)folderInput.setAttribute('accept',accept);
        const dialogTitle=$('#media-dialog-title');
        if(dialogTitle)dialogTitle.textContent=options.memory?'Ajouter un témoignage / souvenir':(options.correspondence?'Ajouter une correspondance':'Ajouter des médias');
        renderLabelPicker('#media-label-picker','media',0,[]);
        if(!form._correspondentPicker)form._correspondentPicker=setupCorrespondentPicker({chipsEl:$('#media-correspondent-chips'),searchInput:$('#media-correspondent-search'),suggestionsEl:$('#media-correspondent-suggestions'),hiddenInput:$('#media-correspondent-value')});
        form._correspondentPicker?.set([]);
        $('#media-dialog').showModal();
    }
    async function openInvestigationItemEventDialog(investigationId,itemId,personId,items){
        const form=$('#investigation-item-event-form');form.reset();
        form.elements.investigation_id.value=investigationId;
        form.elements.item_id.value=itemId||'';
        // la personne dont on montre les événements : menu de choix unique (champ person_id)
        const personField=$('#investigation-item-event-person-search');
        const select=$('#investigation-item-event-select');
        const submitButton=$('#investigation-item-event-submit');
        pkSet(personField,null);
        select.innerHTML='<option value="" disabled>— Choisis d’abord une personne —</option>';
        if(submitButton)submitButton.disabled=true;
        const loadEventsForPerson=async(pid)=>{
            try{
                const det=await api('person',{id:pid});
                const events=det.events||[];
                select.innerHTML=events.length?events.map(e=>`<option value="${e.id}" data-event-label="${escapeHtml(e.type_label+' — '+(e.date_text||e.year||'date inconnue'))}">${escapeHtml(e.type_label)} — ${escapeHtml(e.date_text||e.year||'date inconnue')}</option>`).join(''):'<option value="" disabled>Aucun événement pour cette personne</option>';
                if(submitButton)submitButton.disabled=!events.length;
            }catch(e){toast(e.message,'error');}
        };
        personField.onchangePick=async item=>{if(item&&!item.free&&item.id)await loadEventsForPerson(Number(item.id));else{select.innerHTML='<option value="" disabled>— Choisis d’abord une personne —</option>';if(submitButton)submitButton.disabled=true;}};
        if(!personField.dataset.pkItemEvent){personField.dataset.pkItemEvent='1';personField.addEventListener('picker-change',event=>personField.onchangePick?.(event.detail.item));}
        if(personId){pkSet(personField,Number(personId));await loadEventsForPerson(personId);}
        $('#investigation-item-event-dialog').showModal();
    }
    function openInvestigationUploadDialog(investigationId,personId,items=[],folders=[]){const form=$('#media-form');form.reset();form.elements.person_id.value=personId;form.elements.investigation_id.value=investigationId;if(form.elements.battue_item_id)form.elements.battue_item_id.value='';form.elements.event_id.value='';form.elements.census_id.value='';form.elements.event_id.closest('label').hidden=true;$('#media-census-label').hidden=true;$('#media-create-event-toggle').hidden=true;$('#media-create-event-fields').hidden=true;$('#media-correspondence-fields').hidden=true;$('#media-files-input')?.setAttribute('accept','image/*,application/pdf,audio/*,video/*,.aif,.aiff,.aifc');$('#media-folder-input')?.setAttribute('accept','image/*,application/pdf,audio/*,video/*,.aif,.aiff,.aifc');const mediaDialogTitleInv=$('#media-dialog-title');if(mediaDialogTitleInv)mediaDialogTitleInv.textContent='Ajouter des médias';form.querySelector('[name="investigation_item_ids[]"]').innerHTML=items.map(item=>`<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('');const folderSelect=form.querySelector('[name="investigation_folder_id"]');if(folderSelect)folderSelect.innerHTML=`<option value="">Racine de l’enquête</option>${folders.map(folder=>`<option value="${folder.id}" ${Number(state.investigationFolderId||0)===Number(folder.id)?'selected':''}>${'— '.repeat(Math.max(0,investigationFolderPath(folders,folder.id).length-1))}${escapeHtml(folder.name)}</option>`).join('')}`;$('#media-investigation-fields').hidden=false;renderLabelPicker('#media-label-picker','media',0,[]);$('#media-dialog').showModal();}
    function openBattueMediaDialog(item){
        const form=$('#media-form');
        form.reset();
        form.elements.person_id.value='';
        form.elements.investigation_id.value='';
        if(form.elements.battue_item_id)form.elements.battue_item_id.value=item?.id||'';
        form.elements.event_id.value='';
        form.elements.census_id.value='';
        form.elements.title.value=item?.title||battueTargetText(state.currentBattueDetail?.target_types,item?.record_type)||'';
        form.elements.event_id.closest('label').hidden=true;
        $('#media-census-label').hidden=true;
        $('#media-create-event-toggle').hidden=true;
        $('#media-create-event-fields').hidden=true;
        $('#media-investigation-fields').hidden=true;
        $('#media-correspondence-fields').hidden=true;
        {const mediaDialogTitleBattue=$('#media-dialog-title');if(mediaDialogTitleBattue)mediaDialogTitleBattue.textContent='Ajouter des médias';}
        renderLabelPicker('#media-label-picker','media',0,[]);
        $('#media-dialog').showModal();
    }
    function openCensusDialog(detail,year,record=null,options={}){const form=$('#census-form');form.reset();const isSpecial=Number(record?.is_special||0)===1||options.special;form.elements.id.value=record?.id||'';form.elements.person_id.value=detail.person.id;form.elements.year.value=year;form.elements.is_special.value=isSpecial?1:0;form.elements.place_id.value=record?.place_id||'';form.elements.status.innerHTML='<option value="todo">À chercher</option><option value="found">Trouvé</option><option value="not_found">Non trouvé</option><option value="not_born">Pas encore né</option><option value="not_in_france">Pas encore en France</option><option value="not_france">Pas en France</option><option value="left_france">Plus en France</option><option value="dead">Déjà décédé</option>';form.elements.status.value=record?.status||censusDefaultStatus(year,detail.person);form.elements.date_text.value=record?.date_text||'';form.elements.place_name.value=record?placeDisplay(record):(record?.place_name||'');form.elements.country.value=record?.country||'France';form.elements.address.value=record?.address||'';form.elements.precise_lat.value=record?.precise_lat!=null?record.precise_lat:'';form.elements.precise_lon.value=record?.precise_lon!=null?record.precise_lon:'';renderCensusPreciseBlock(form,record);const primary=(record?.members||[]).find(member=>Number(member.person_id)===Number(detail.person.id))||record||{};form.elements.display_name.value=primary.display_name||personName(detail.person);if(form.elements.census_first_name)form.elements.census_first_name.value=primary.first_name||'';['age_text','birth_place','occupation','employer','nationality','household_position','personal_status','extra_info'].forEach(field=>form.elements[field].value=primary[field]||'');form.elements.notes.value=record?.notes||'';setupPlaceAutocomplete(form);$('#census-dialog-title').textContent=`Recensement ${year}${isSpecial?' · spécial':''}`;$('#census-field-hint').innerHTML=`<strong>Champs relevés habituellement en ${year}</strong><span>${expectedCensusFields(year).map(escapeHtml).join(' · ')}</span>${isSpecial?'<small>Recensement ajouté manuellement : il sera marqué par ✦ dans la fiche.</small>':''}`;renderLabelPicker('#census-label-picker','census',record?.id||0,record?.labels||[]);const censusMediaBtn=$('#census-manage-media-btn');censusMediaBtn.disabled=false;censusMediaBtn.title=record?.id?'':'Crée le recensement puis ouvre les médias.';censusMediaBtn.onclick=async()=>{let censusId=Number(form.elements.id.value)||Number(record?.id)||0;if(!censusId){censusMediaBtn.disabled=true;try{const values=formObject(form);const result=await api('save_census_record',{}, {method:'POST',body:values});censusId=Number(result?.result?.id||0);if(!censusId)throw new Error('Recensement non créé.');form.elements.id.value=censusId;await applyLabelPickerAfterSave('#census-label-picker',censusId);toast('Recensement créé, tu peux ajouter le média.');}catch(error){toast(error.message,'error');censusMediaBtn.disabled=false;return;}}$('#census-dialog').close();openCensusMediaDialog(detail,censusId);};const householdBox=$('#census-dialog-household');const renderCensusDialogHousehold=()=>{const householdMembers=(record?.members||[]).filter(member=>Number(member.person_id)!==Number(detail.person.id));householdBox.innerHTML=householdMembers.length?householdMembers.map(member=>`<span class="census-household-member">${escapeHtml(member.person_name||member.display_name||'Personne non liée')}${member.household_position?` · ${escapeHtml(member.household_position)}`:''}${member.occupation?` · ${escapeHtml(member.occupation)}`:''}<span class="inline-actions">${actionButton('delete','Retirer du foyer',`data-dialog-delete-census-member="${member.id}"`)}</span></span>`).join(''):'<small class="label-field-empty">Aucun membre du foyer ajouté.</small>';};renderCensusDialogHousehold();householdBox.onclick=async event=>{const button=event.target.closest('[data-dialog-delete-census-member]');if(!button)return;if(!await confirmBox('Sa fiche n’est pas supprimée.',{title:'Retirer cette personne du foyer recensé ?',okLabel:'Retirer'}))return;try{await api('delete_census_member',{}, {method:'POST',body:{id:button.dataset.dialogDeleteCensusMember}});if(record)record.members=(record.members||[]).filter(member=>Number(member.id)!==Number(button.dataset.dialogDeleteCensusMember));renderCensusDialogHousehold();toast('Membre retiré du foyer.');}catch(error){toast(error.message,'error');}};const addMemberBtn=$('#census-dialog-add-member');if(record?.id){addMemberBtn.disabled=false;addMemberBtn.title='';addMemberBtn.onclick=()=>{$('#census-dialog').close();openCensusMemberDialog(record.id,detail.person.id);};}else{addMemberBtn.disabled=true;addMemberBtn.title='Enregistre d’abord ce recensement pour pouvoir ajouter des membres du foyer.';addMemberBtn.onclick=null;}$('#census-dialog').showModal();}
    function openCensusMediaDialog(detail,censusId){const form=$('#census-media-form');form.reset();form.elements.census_id.value=censusId;form.elements.person_id.value=detail.person.id;const already=new Set(mediaForCensus(detail.media,censusId).map(item=>Number(item.id)));const choices=detail.media.filter(item=>!already.has(Number(item.id)));const select=form.querySelector('[name="media_ids[]"]');select.innerHTML=choices.map(item=>`<option value="${item.id}">${escapeHtml([item.attachment_label,item.date_text,item.title||item.filename].filter(Boolean).join(' · '))}</option>`).join('');select.disabled=!choices.length;$('#census-media-existing-help').textContent=choices.length?'Maintiens ⌘ pour sélectionner plusieurs images ou documents déjà associés à cette personne.':'Aucun média existant disponible à lier : tu peux importer un nouveau fichier ci-dessous.';$('#census-media-dialog').showModal();}
    function eventCollectionKey(item,eventId){
        return String(item?.event_collections||'').split(',').map(part=>part.trim()).map(part=>{const split=part.indexOf(':');return split<0?null:{eventId:Number(part.slice(0,split)),key:part.slice(split+1)};}).find(entry=>entry&&entry.eventId===Number(eventId))?.key||'';
    }
    function eventLinkPosition(item,eventId){return Number(String(item?.event_positions||'').split(',').map(part=>part.trim()).map(part=>{const split=part.indexOf(':');return split<0?null:{eventId:Number(part.slice(0,split)),position:Number(part.slice(split+1))};}).find(entry=>entry&&entry.eventId===Number(eventId))?.position||0);}
    function eventMediaPanelItems(detail,eventId){return mediaForEvent(detail.media||[],eventId).slice().sort((a,b)=>eventLinkPosition(a,eventId)-eventLinkPosition(b,eventId)||Number(a.id)-Number(b.id));}
    function openEventMediaOrderDialog(detail,eventId,collectionKey,onSaved){
        const items=eventMediaPanelItems(detail,eventId).filter(item=>eventCollectionKey(item,eventId)===collectionKey);
        if(items.length<2){toast('Ce document doit contenir au moins deux images.','error');return;}
        $('#event-media-order-dialog')?.remove();
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal event-media-order-dialog" id="event-media-order-dialog"><div class="modal-head"><div><span class="eyebrow">DOCUMENT GROUPÉ</span><h2>Réorganiser les images</h2><p>Glisse les miniatures pour définir l’ordre de lecture du document.</p></div><button type="button" class="icon-button" data-close-event-media-order aria-label="Fermer">×</button></div><div class="event-media-order-layout"><section><h3>Ordre des images</h3><div class="event-media-order-list" id="event-media-order-list">${items.map((item,index)=>`<article class="event-media-order-item${index===0?' is-selected':''}" data-event-order-media-id="${item.id}"><button type="button" draggable="true" class="event-media-order-grip" data-event-order-grip aria-label="Déplacer l’image ${index+1}" title="Glisser pour déplacer">↕</button><button type="button" class="event-media-order-thumbnail" data-event-order-select="${item.id}">${mediaPreviewHtml(item,item.title||'Image '+(index+1))}</button><div><strong><span data-event-order-number>${index+1}</span>. ${escapeHtml(item.title||item.filename||'Image')}</strong><small>${escapeHtml(mediaTypeShortLabel(item))}</small></div></article>`).join('')}</div></section><aside class="event-media-order-preview" id="event-media-order-preview"></aside></div><div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-close-event-media-order>Annuler</button><button type="button" class="button" data-save-event-media-order>Enregistrer l’ordre</button></div></dialog>`);
        const dialog=$('#event-media-order-dialog'),list=$('#event-media-order-list',dialog),preview=$('#event-media-order-preview',dialog);
        let selectedId=Number(items[0].id),dragged=null;
        const byId=id=>items.find(item=>Number(item.id)===Number(id));
        const renderPreview=()=>{const item=byId(selectedId);if(!item)return;preview.innerHTML=`<span class="eyebrow">APERÇU</span><div class="event-media-order-preview-media">${mediaPreviewHtml(item,item.title||'Image')}</div><strong>${escapeHtml(item.title||item.filename||'Image')}</strong><small>Image ${$$('.event-media-order-item',list).findIndex(row=>Number(row.dataset.eventOrderMediaId)===Number(item.id))+1} sur ${items.length}</small>`;$$('.event-media-order-item',list).forEach(row=>row.classList.toggle('is-selected',Number(row.dataset.eventOrderMediaId)===selectedId));};
        renderPreview();
        list.addEventListener('click',event=>{const button=event.target.closest('[data-event-order-select]');if(!button)return;selectedId=Number(button.dataset.eventOrderSelect);renderPreview();});
        list.addEventListener('dragstart',event=>{const grip=event.target.closest('[data-event-order-grip]');if(!grip){event.preventDefault();return;}dragged=grip.closest('.event-media-order-item');if(!dragged)return;dragged.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';});
        list.addEventListener('dragover',event=>{if(!dragged)return;event.preventDefault();const after=getDragAfterElement(list,event.clientY,'.event-media-order-item');if(after===null)list.append(dragged);else list.insertBefore(dragged,after);$$('.event-media-order-item',list).forEach((row,index)=>$('[data-event-order-number]',row).textContent=String(index+1));renderPreview();});
        list.addEventListener('dragend',()=>{dragged?.classList.remove('is-dragging');dragged=null;});
        $$('[data-close-event-media-order]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
        $('[data-save-event-media-order]',dialog).addEventListener('click',async()=>{const ids=$$('.event-media-order-item',list).map(row=>Number(row.dataset.eventOrderMediaId));const button=$('[data-save-event-media-order]',dialog);button.disabled=true;try{const personId=Number($('#event-form')?.elements.person_id?.value)||state.currentPersonId;await api('reorder_entity_media',{},{method:'POST',body:{entity_type:'event',entity_id:eventId,person_id:personId,media_ids:ids}});dialog.close();toast('Ordre des images enregistré.');await onSaved?.();}catch(error){toast(error.message,'error');button.disabled=false;}});
        dialog.addEventListener('close',()=>dialog.remove());
        dialog.showModal();
    }
    function renderEventMediaPanel(detail,eventId,panel){
        const linkedItems=eventMediaPanelItems(detail,eventId);
        const already=new Set(linkedItems.map(item=>Number(item.id)));
        const choices=(detail.media||[]).filter(item=>!already.has(Number(item.id)));
        const optionsHtml=choices.map(item=>`<option value="${item.id}">${escapeHtml([item.attachment_label,item.date_text,item.title||item.filename].filter(Boolean).join(' · '))}</option>`).join('');
        panel.innerHTML=`${linkedItems.length?`<section class="event-media-existing"><strong>Médias de cet événement</strong><p class="form-help">Coche plusieurs fichiers pour les réunir. Pour un document déjà groupé, coche une image puis réorganise ses pages.</p><div class="event-media-linked-list">${linkedItems.map(item=>{const key=eventCollectionKey(item,eventId);return `<div class="event-media-linked-row" data-event-media-id="${item.id}"><label><input type="checkbox" data-event-group-media value="${item.id}"><span>${mediaTypeShortLabelWithIcon(item)} ${escapeHtml(item.title||item.filename||'Document')}</span>${key?'<em>Document groupé</em>':''}</label></div>`;}).join('')}</div><div class="event-media-set-actions"><button type="button" class="button small" data-event-group-create>Réunir en un document</button><button type="button" class="button small secondary" data-event-group-reorder>Réorganiser le document</button><button type="button" class="button small secondary" data-event-group-separate>Dissocier le document sélectionné</button></div></section>`:''}`
            +`<p class="form-help">${choices.length?'Sélectionne un ou plusieurs médias existants (maintiens ⌘ / Ctrl) ou importe un nouveau fichier.':'Aucun autre média existant — importe un nouveau fichier ci-dessous.'}</p>`
            +(choices.length?`<label>Médias existants<select id="event-media-select" multiple size="4">${optionsHtml}</select></label>`:'')
            +`<label style="margin-top:8px">Importer des fichiers<input type="file" id="event-media-file" multiple accept="image/*,.pdf,application/pdf,audio/*,video/*"></label><label class="check-row"><input type="checkbox" id="event-media-group-upload" checked> Réunir les fichiers importés en un même document</label>`
            +`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button type="button" class="button small secondary" id="event-media-cancel">Annuler</button><button type="button" class="button small" id="event-media-confirm">Enregistrer</button></div>`;
        const refresh=async()=>{const personId=Number($('#event-form').elements.person_id.value)||state.currentPersonId;const refreshed=await api('person',{id:personId});detail.media=refreshed.media||detail.media;renderEventMediaPanel(detail,eventId,panel);const confidenceMediaId=Number(pkValue($('#event-confidence-media'))||0);renderEventConfidenceMediaChoices(detail,confidenceMediaId);const list=$('#event-media-list');if(list){const items=mediaForEvent(detail.media||[],eventId);list.innerHTML=items.length?`<p class="form-help">${plural(items.length,'document lié','documents liés')} à cet événement.</p>`:'';}};
        panel.querySelector('#event-media-cancel')?.addEventListener('click',()=>panel.remove());
        panel.querySelector('[data-event-group-create]')?.addEventListener('click',async()=>{const ids=$$('[data-event-group-media]:checked',panel).map(input=>Number(input.value));if(ids.length<2){toast('Coche au moins deux médias.','error');return;}try{await api('group_entity_media',{},{method:'POST',body:{entity_type:'event',entity_id:eventId,person_id:state.currentPersonId,media_ids:ids}});toast('Document groupé créé.');await refresh();}catch(error){toast(error.message,'error');}});
        panel.querySelector('[data-event-group-separate]')?.addEventListener('click',async()=>{const ids=$$('[data-event-group-media]:checked',panel).map(input=>Number(input.value));const item=linkedItems.find(row=>Number(row.id)===ids[0]);const key=item&&eventCollectionKey(item,eventId);if(!key||!ids.length||ids.some(id=>eventCollectionKey(linkedItems.find(row=>Number(row.id)===id),eventId)!==key)){toast('Sélectionne les éléments d’un seul document groupé.','error');return;}try{await api('ungroup_entity_media',{},{method:'POST',body:{entity_type:'event',entity_id:eventId,person_id:state.currentPersonId,collection_key:key}});toast('Document dissocié.');await refresh();}catch(error){toast(error.message,'error');}});
        panel.querySelector('[data-event-group-reorder]')?.addEventListener('click',()=>{const selected=$$('[data-event-group-media]:checked',panel).map(input=>Number(input.value));const groupedKeys=[...new Set(selected.map(id=>eventCollectionKey(linkedItems.find(row=>Number(row.id)===id),eventId)).filter(Boolean))];const allGroupedKeys=[...new Set(linkedItems.map(item=>eventCollectionKey(item,eventId)).filter(Boolean))];const key=groupedKeys.length===1?groupedKeys[0]:(selected.length===0&&allGroupedKeys.length===1?allGroupedKeys[0]:'');if(!key||groupedKeys.length>1){toast('Coche une image du document que tu veux réorganiser.','error');return;}openEventMediaOrderDialog(detail,eventId,key,refresh);});
        panel.querySelector('#event-media-confirm')?.addEventListener('click',async()=>{
            const personId=Number($('#event-form').elements.person_id.value)||state.currentPersonId;
            const selectedIds=[...(panel.querySelectorAll('#event-media-select option:checked')||[])].map(o=>Number(o.value));
            const files=[...(panel.querySelector('#event-media-file')?.files||[])];
            if(!selectedIds.length&&!files.length){toast('Sélectionne ou importe au moins un fichier.','error');return;}
            const btn=panel.querySelector('#event-media-confirm');btn.disabled=true;
            try{
                let linked=0,imported=0,importedIds=[];
                if(selectedIds.length){const r=await api('link_entity_media',{},{method:'POST',body:{entity_type:'event',entity_id:eventId,person_id:personId,media_ids:selectedIds}});linked=Number(r.result?.added)||0;}
                if(files.length){const fd=new FormData();fd.append('person_id',personId);fd.append('csrf',state.csrf);files.forEach(f=>fd.append('files[]',f));const resp=await fetch('upload.php',{method:'POST',body:fd});const res=await resp.json();if(!resp.ok||res.error)throw new Error(res.error||'Import impossible');imported=(res.media||[]).length;importedIds=(res.media||[]).map(media=>Number(media?.id||media)).filter(Boolean);if(importedIds.length)await api('link_entity_media',{},{method:'POST',body:{entity_type:'event',entity_id:eventId,person_id:personId,media_ids:importedIds}});if(importedIds.length>1&&panel.querySelector('#event-media-group-upload')?.checked)await api('group_entity_media',{},{method:'POST',body:{entity_type:'event',entity_id:eventId,person_id:personId,media_ids:importedIds}});}
                toast([linked?`${plural(linked,'média lié','médias liés')}`:null,imported?`${plural(imported,'média importé','médias importés')}`:null].filter(Boolean).join(' · '));
                await refresh();
            }catch(err){toast(err.message,'error');}finally{btn.disabled=false;}
        });
    }
    function openEventMediaPanel(detail,eventId){
        const block=$('#event-media-block');if(!block)return;
        let panel=$('#event-media-panel');if(panel){panel.remove();return;}
        panel=document.createElement('div');panel.id='event-media-panel';panel.className='witness-search-panel event-media-panel';
        const addBtn=$('#event-manage-media-btn');if(addBtn)addBtn.after(panel);else block.appendChild(panel);
        renderEventMediaPanel(detail,eventId,panel);
    }
    function openEntityMediaDialog(detail,entityType,entityId,eyebrow,title){
        const form=$('#entity-media-form');form.reset();
        form.elements.entity_type.value=entityType;
        form.elements.entity_id.value=entityId;
        form.elements.person_id.value=detail.person.id;
        $('#entity-media-eyebrow').textContent=eyebrow;
        $('#entity-media-title').textContent=title;
        const idsField=entityType==='event'?'event_ids':(entityType==='grave'?'grave_ids':'military_ids');
        const already=new Set((detail.media||[]).filter(item=>csvIds(item[idsField]).includes(Number(entityId))).map(item=>Number(item.id)));
        const choices=(detail.media||[]).filter(item=>!already.has(Number(item.id)));
        const select=form.querySelector('[name="media_ids[]"]');
        select.innerHTML=choices.map(item=>`<option value="${item.id}">${escapeHtml([item.attachment_label,item.date_text,item.title||item.filename].filter(Boolean).join(' · '))}</option>`).join('');
        select.disabled=!choices.length;
        $('#entity-media-existing-help').textContent=choices.length?'Maintiens ⌘ pour sélectionner plusieurs images ou documents déjà associés à cette personne.':'Aucun média existant disponible à lier : tu peux importer un nouveau fichier ci-dessous.';
        $('#entity-media-dialog').showModal();
    }
    function clearCensusMemberPerson(){pkSet($('#census-member-search'),null);}
    function selectCensusMemberPerson(personId,name){const form=$('#census-member-form');pkSet($('#census-member-search'),Number(personId)?{id:Number(personId),title:name||'',kind:'person'}:null);if(name&&!form.elements.display_name.value.trim())form.elements.display_name.value=name;}
    function openCensusMemberDialog(censusId,returnPersonId,member=null){const form=$('#census-member-form');form.reset();form.elements.id.value=member?.id||'';form.elements.census_id.value=censusId;form.elements.return_person_id.value=returnPersonId;if(form.elements.member_first_name)form.elements.member_first_name.value=member?.first_name||'';['display_name','age_text','birth_place','occupation','employer','nationality','household_position','personal_status','extra_info'].forEach(field=>form.elements[field].value=member?.[field]||'');$('#census-member-dialog-title').textContent=member?'Modifier un membre':'Ajouter un membre';$('#census-member-submit').textContent=member?'Enregistrer':'Ajouter';const linkedName=member?.person_name||member?.display_name||'';if(member?.person_id)selectCensusMemberPerson(member.person_id,linkedName);else clearCensusMemberPerson();$('#census-member-dialog').showModal();setTimeout(()=>$('#census-member-search .pk-search:not([hidden]) .pk-input')?.focus(),30);}
    function onlineSheetCheckRowHtml(field,fieldLabel,check,custom=false){
        const status=check?.status||'';
        const comment=check?.comment||'';
        // champ libre : l'intitulé se tape, et la ligne peut être retirée
        return `<div class="online-sheet-check-row${custom?' is-custom':''}" data-check-field="${escapeHtml(field)}">
            ${custom?`<span class="online-sheet-check-row-label"><input type="text" data-check-label value="${escapeHtml(fieldLabel)}" placeholder="Intitulé (ex : Parrain, Cote de l’acte…)" maxlength="80"><button type="button" class="icon-button" data-check-remove title="Retirer ce champ" aria-label="Retirer ce champ">×</button></span>`:`<span class="online-sheet-check-row-label">${escapeHtml(fieldLabel)}</span>`}
            <select class="online-sheet-check-status" data-check-status>
                <option value="">— non vérifié —</option>
                ${onlineSheetStatuses.map(([value,text])=>`<option value="${value}" ${status===value?'selected':''}>${text}</option>`).join('')}
            </select>
            <input type="text" class="online-sheet-check-comment" data-check-comment placeholder="Commentaire (ex : date exacte 1892, pas 1898…)" value="${escapeHtml(comment)}">
        </div>`;
    }
    function openOnlineSheetDialog(personId,sheet=null){
        const form=$('#online-sheet-form');form.reset();
        form.elements.id.value=sheet?.id||'';
        form.elements.person_id.value=personId;
        form.elements.label.value=sheet?.label||'';
        form.elements.site.value=sheet?.site||'';
        form.elements.url.value=sheet?.url||'';
        form.elements.notes.value=sheet?.notes||'';
        const checksByField=new Map((sheet?.checks||[]).map(check=>[check.field,check]));
        const customChecks=(sheet?.checks||[]).filter(check=>String(check.field).startsWith('custom_'));
        $('#online-sheet-checks-list').innerHTML=onlineSheetFields.map(([field,label])=>onlineSheetCheckRowHtml(field,label,checksByField.get(field))).join('')+customChecks.map(check=>onlineSheetCheckRowHtml(check.field,check.field_label||'',check,true)).join('');
        form.elements.screenshot_media_id.value=sheet?.screenshot_media_id||'';
        form.dataset.openSeq=String((Number(form.dataset.openSeq)||0)+1);
        if(sheet?.screenshot_media_id&&!sheet.screenshot_filename)form.elements.screenshot_media_id.value=''; // média supprimé depuis
        renderOnlineSheetShot(sheet?.screenshot_media_id&&sheet.screenshot_filename?{id:sheet.screenshot_media_id,filename:sheet.screenshot_filename,thumbnail:sheet.screenshot_thumbnail}:null);
        renderOnlineSheetSearch(personId);
        $('#online-sheet-dialog-title').textContent=sheet?'Modifier une fiche en ligne':'Ajouter une fiche en ligne';
        $('#online-sheet-submit').textContent=sheet?'Enregistrer':'Ajouter';
        $('#online-sheet-dialog').showModal();
    }
    function collectOnlineSheetChecks(){
        return $$('#online-sheet-checks-list [data-check-field]').map(row=>{
            const field=row.dataset.checkField;
            const custom=row.querySelector('[data-check-label]');
            const fieldLabel=custom?custom.value.trim():(onlineSheetFields.find(item=>item[0]===field)||[,field])[1];
            if(custom&&!fieldLabel)return null; // champ libre sans intitulé : ignoré
            const status=row.querySelector('[data-check-status]')?.value||'';
            const comment=row.querySelector('[data-check-comment]')?.value||'';
            return {field,field_label:fieldLabel,status,comment};
        }).filter(check=>check&&(check.status||check.comment||String(check.field).startsWith('custom_')));
    }
    function renderOnlineSheetShot(media){
        const box=$('#online-sheet-shot');if(!box)return;
        box.innerHTML=media?.id?`<figure><img src="${media.src?escapeHtml(media.src):`media/${encodeURIComponent(media.thumbnail||media.filename||'')}`}" alt="Capture d’écran de l’arbre"><figcaption><button type="button" class="link-button" data-online-shot-remove>Retirer la capture</button> <small class="muted">(l’image reste dans les médias)</small></figcaption></figure>`:'<p class="muted">Aucune capture.</p>';
        box.querySelector('[data-online-shot-remove]')?.addEventListener('click',()=>{$('#online-sheet-form').elements.screenshot_media_id.value='';renderOnlineSheetShot(null);});
    }
    async function uploadOnlineSheetShot(file){
        const form=$('#online-sheet-form'),personId=form.elements.person_id.value,openSeq=form.dataset.openSeq;
        if(!file||!/^image\//.test(file.type)){toast('Choisis une image (capture d’écran).','error');return;}
        const box=$('#online-sheet-shot');if(box)box.innerHTML='<p class="muted">Envoi de la capture…</p>';
        try{
            const fd=new FormData();fd.append('person_id',personId);fd.append('csrf',state.csrf);
            fd.append('title',`Capture de l’arbre — ${form.elements.label.value.trim()||form.elements.site.value.trim()||'fiche en ligne'}`);
            fd.append('files[]',file,file.name||'capture.png');
            const response=await fetch('upload.php',{method:'POST',body:fd});const result=await response.json();
            if(!response.ok||result.error)throw new Error(result.error||'Envoi impossible');
            const id=Number(result.media?.[0]||0);if(!id)throw new Error('Envoi impossible');
            if(form.dataset.openSeq!==openSeq||!$('#online-sheet-dialog')?.open){toast('Capture rangée dans les médias de la fiche (la fenêtre avait été fermée).');return;} // fenêtre fermée ou rouverte pour une autre fiche
            form.elements.screenshot_media_id.value=id;
            renderOnlineSheetShot({id,src:URL.createObjectURL(file)}); // aperçu tiré du fichier lui-même
        }catch(error){toast(error.message,'error');renderOnlineSheetShot(null);}
    }
    // Chercher la personne sur les sites de généalogie, avec ce qu'on sait déjà d'elle
    function renderOnlineSheetSearch(personId){
        const box=$('#online-sheet-search');if(!box)return;
        const detail=state.currentPerson;
        if(!detail||Number(detail.person?.id)!==Number(personId)){box.hidden=true;box.innerHTML='';return;}
        const base=webSearchSettings(personId),sites=webSearchAllSites();
        const genealogy=key=>['Généalogie','Mes sites'].includes(sites.find(site=>site[0]===key)?.[2]);
        const settings={order:base.order,hidden:base.order.filter(key=>!genealogy(key)||(base.hidden.includes(key)&&!['geneanet','filae','familysearch','myheritage','ancestry'].includes(key)))};
        let side=true;try{side=localStorage.getItem('genealogie-online-sheet-side')!=='0';}catch(_){}
        box.hidden=false;
        box.innerHTML=`<span class="section-label">Chercher cette personne en ligne</span><label class="checkbox-line"><input type="checkbox" data-online-side ${side?'checked':''}> Ouvrir à côté, dans une fenêtre séparée (sinon dans le navigateur)</label>${webSearchPanelHtml(detail,settings,`online-sheet-${personId}`)}`;
        bindWebSearchPanels(box);
        box.querySelector('[data-online-side]').addEventListener('change',event=>{try{localStorage.setItem('genealogie-online-sheet-side',event.target.checked?'1':'0');}catch(_){}});
        box.onclick=event=>{ // la boîte reste d'une ouverture à l'autre : un seul gestionnaire
            const link=event.target.closest('[data-ws-site]');if(!link||!link.href||link.href.endsWith('#'))return;
            const form=$('#online-sheet-form'),site=sites.find(item=>item[0]===link.dataset.wsSite);
            if(site&&!form.elements.site.value.trim())form.elements.site.value=site[1]; // le site cherché devient celui de la fiche
            if(site&&!form.elements.label.value.trim())form.elements.label.value=`${site[1]} — ${personName(detail.person)}`;
            if(box.querySelector('[data-online-side]')?.checked){event.preventDefault();window.open(link.href,'lcnda-side','popup,width=1100,height=900,noopener');}
        };
    }
    function openNoteDialog(personId,note=null){const form=$('#note-form');form.reset();form.elements.person_id.value=personId;form.elements.id.value=note?.id||'';form.elements.title.value=note?.title||'';form.elements.body.value=note?.body||'';$('#note-dialog-title').textContent=note?'Modifier une note':'Ajouter une note';$('#note-submit').textContent=note?'Enregistrer':'Ajouter';renderLabelPicker('#note-label-picker','note',note?.id||0,note?.labels||[]);$('#note-dialog').showModal();}
    function updateSourceTargetFields(){const form=$('#source-form'),isEvent=form.elements.entity_type.value==='event';$('#source-event-label').hidden=!isEvent;form.elements.event_id.disabled=!isEvent;}
    function openSourceDialog(personId,source=null,eventId=0){const form=$('#source-form'),detail=state.currentPerson;form.reset();form.elements.person_id.value=personId;form.elements.id.value=source?.id||'';form.elements.link_id.value=source?.link_id||'';form.elements.source_type.value=source?.source_type||'internet';const targetEvent=eventId||((source?.entity_type==='event')?Number(source.entity_id):0);form.elements.entity_type.value=targetEvent?'event':'person';form.elements.event_id.innerHTML=(detail?.events||[]).map(event=>`<option value="${event.id}">${escapeHtml(event.type_label)} — ${escapeHtml(event.date_text||event.year||'date inconnue')}</option>`).join('');form.elements.event_id.value=targetEvent||'';form.elements.title.value=source?.title||'';form.elements.url.value=source?.url||'';form.elements.website.value=source?.agency||'';form.elements.author.value=source?.author||'';form.elements.accessed_at.value=source?.publication||'';form.elements.page.value=source?.page||'';form.elements.text.value=source?.text||'';form.elements.note.value=source?.note||'';updateSourceTargetFields();$('#source-dialog-title').textContent=source?'Modifier une source':targetEvent?'Ajouter une source à l’événement':'Ajouter une source';$('#source-submit').textContent=source?'Enregistrer':'Ajouter la source';renderLabelPicker('#source-label-picker','source',source?.id||0,source?.labels||[]);$('#source-dialog').showModal();}
    function openLightbox(media,index,readOnly=false){state.lightboxMedia=media.map(item=>({...item}));state.lightboxIndex=Math.max(0,Math.min(index,media.length-1));state.lightboxReadOnly=!!readOnly;renderLightboxItem();const lb=$('#lightbox');if(lb){lb.dataset.readonly=readOnly?'1':'';// Toggle action buttons visibility
        const deleteBtn=$('#delete-media'),saveTransBtn=$('#save-transcription'),saveMetaBtn=$('#save-media-meta'),assistBtn=$('#assist-transcription'),portraitBtn=$('#set-portrait'),removePortraitBtn=$('#remove-portrait'),ocrBtn=$('#ocr-transcription'),htrControls=$('#htr-controls'),rotateLeft=$('#rotate-media-left'),rotateRight=$('#rotate-media-right');if(readOnly){if(deleteBtn)deleteBtn.style.display='none';if(saveTransBtn)saveTransBtn.style.display='none';if(saveMetaBtn)saveMetaBtn.style.display='none';if(assistBtn)assistBtn.style.display='none';if(portraitBtn)portraitBtn.style.display='none';if(removePortraitBtn)removePortraitBtn.style.display='none';if(ocrBtn)ocrBtn.style.display='none';if(htrControls)htrControls.style.display='none';if(rotateLeft)rotateLeft.style.display='none';if(rotateRight)rotateRight.style.display='none';}else{const onPerson=state.module==='personnes'&&!!state.currentPersonId;if(portraitBtn)portraitBtn.style.display=onPerson?'':'none';if(removePortraitBtn)removePortraitBtn.style.display=onPerson?'':'none';if(deleteBtn)deleteBtn.style.display='';if(saveTransBtn)saveTransBtn.style.display='';if(saveMetaBtn)saveMetaBtn.style.display='';if(assistBtn)assistBtn.style.display='';if(ocrBtn)ocrBtn.style.display='';if(htrControls)htrControls.style.display='';if(rotateLeft)rotateLeft.style.display='';if(rotateRight)rotateRight.style.display='';}}if(!lb.open)lb.showModal();}
    function mediaCompareThumb(item){
        if(normalizedMediaType(item)!=='image')return `<span class="media-compare-thumb pdf-mark">${mediaTypeShortLabelWithIcon(item)}</span>`;
        return `<img class="media-compare-thumb" src="media/${encodeURIComponent(item.thumbnail||item.filename)}" alt="">`;
    }
    function mediaCompareLinkInfo(item){
        // Décrit à quoi (personne, événement, recensement, enquête, battue…) ce média est rattaché.
        const parts=[];
        const label=(item.attachment_label||'').split(',').map(s=>s.trim()).filter(Boolean).filter(s=>s&&s!=='Non rattaché');
        if(label.length)parts.push(label.join(' · '));
        const people=(item.people_links||item.people||[]).map(p=>p.name).filter(Boolean);
        if(people.length)parts.push(`${people.length<2?'Personne':'Personnes'} : ${people.join(', ')}`);
        if(!parts.length){
            // Repli pour les médias issus de la fiche en cours (pas de people_links fourni par l'API list).
            const fallbackName=state.currentPerson?personName(state.currentPerson.person):'';
            if(fallbackName)parts.push(`Personne : ${fallbackName}`);
        }
        return parts.length?parts.join(' — '):'Non rattaché à une fiche, un événement ou une enquête/battue.';
    }
    function mediaComparePane(item,label,slot){
        const changeBtn=`<button type="button" class="button small secondary" data-compare-pick="${slot}">${item?'Changer':'Choisir'}</button>`;
        const removeBtn=(item&&slot==='right')?`<button type="button" class="button small danger" data-compare-remove="${slot}">Retirer</button>`:'';
        if(!item)return `<section class="media-compare-pane is-empty" data-slot="${slot}"><header><div><span>${escapeHtml(label)}</span></div><div class="media-compare-pane-actions">${changeBtn}</div></header><p>Choisis un média ci-dessus pour ${slot==='left'?'Document A':'Document B'}.</p></section>`;
        const title=escapeHtml(item.title||item.attachment_label||item.filename||'Média');
        const body=normalizedMediaType(item)==='pdf'
            ? `<iframe src="media/${encodeURIComponent(item.filename)}" title="${title}"></iframe>`
            : `<div class="media-compare-zoom-wrap" data-compare-zoom="${slot}"><img class="media-compare-zoom-img" src="media/${encodeURIComponent(item.filename)}" alt="${title}" draggable="false"></div>`;
        return `<section class="media-compare-pane" data-slot="${slot}"><header><div><span>${escapeHtml(label)}</span><strong>${title}</strong><small class="media-compare-pane-link">${escapeHtml(mediaCompareLinkInfo(item))}</small></div><div class="media-compare-pane-actions">${changeBtn}${removeBtn}</div></header>${body}</section>`;
    }
    async function fetchMediaCompareInfo(item){
        // Les médias ouverts depuis la fiche (lightbox) n'ont pas les infos d'enquête/battue
        // ni la liste des personnes liées (people_links) : on va les chercher via l'API de liste,
        // qui calcule déjà tout ça (attachment_label + people_links) pour chaque média.
        if(item.people_links)return item;
        try{
            const data=await api('list',{type:'media',q:item.filename||item.title||'',limit:30});
            const found=(data.rows||[]).find(row=>Number(row.id)===Number(item.id));
            return found?{...item,attachment_label:found.attachment_label,people_links:found.people_links}:item;
        }catch(err){return item;}
    }
    function openMediaCompareDialog(){
        const initial=state.lightboxMedia[state.lightboxIndex];
        if(!initial)return;
        $('#media-compare-dialog')?.remove();
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal media-compare-dialog" id="media-compare-dialog"><div class="modal-head"><div><span class="eyebrow">MÉDIAS</span><h2>Comparer deux documents</h2></div><button class="icon-button" value="cancel" type="button" id="media-compare-close">×</button></div><div class="media-compare-body"><div class="media-compare-search"><div class="media-compare-search-col"><span class="pk-lab">Un autre document de tes médias</span><button type="button" class="pk-box media-compare-pickbtn" id="media-compare-search"><span class="pk-ico" aria-hidden="true">🖼</span><span>Chercher : titre, cote, personne, lieu, année…</span></button><small class="muted">La fenêtre des médias s’ouvre, filtrée sur la personne du document quand il y en a une.</small></div><div class="media-compare-results-col"><div class="media-compare-results-label" id="media-compare-results-label"></div><div id="media-compare-results"></div></div></div><div class="media-compare-grid" id="media-compare-grid"></div></div></dialog>`);
        const dialog=$('#media-compare-dialog'),search=$('#media-compare-search'),results=$('#media-compare-results'),resultsLabel=$('#media-compare-results-label'),grid=$('#media-compare-grid');
        let left=initial,right=null,pickTarget='right',baseCandidates=(state.lightboxMedia||[]).filter(item=>Number(item.id)!==Number(left.id));
        const setupCompareZoom=()=>setupComparisonImageZoom(grid);
        const renderGrid=()=>{
            grid.innerHTML=mediaComparePane(left,'Document A','left')+mediaComparePane(right,'Document B','right');
            $$('.media-compare-pane',grid).forEach(pane=>pane.classList.toggle('is-picking',pane.dataset.slot===pickTarget));
            setupCompareZoom();
        };
        const currentExcludedId=()=>pickTarget==='left'?Number(right?.id||0):Number(left?.id||0);
        const targetEntityName=()=>{
            const item=pickTarget==='left'?left:right;
            if(!item)return '';
            const people=(item.people_links||item.people||[]).map(p=>p.name).filter(Boolean);
            return people[0]||'';
        };
        // à droite : les documents du même endroit (la visionneuse d'où l'on vient) ; le reste passe par la fenêtre des médias
        const renderResults=list=>{
            const name=targetEntityName();
            resultsLabel.innerHTML=`Du même endroit, pour <span class="media-compare-target-tag">${pickTarget==='left'?'Document A':'Document B'}</span>${name?`<span class="media-compare-target-name">${escapeHtml(name)}</span>`:''}`;
            const filtered=list.filter(item=>Number(item.id)!==currentExcludedId());
            results.innerHTML=filtered.length?filtered.map(item=>`<button type="button" data-media-candidate="${item.id}">${mediaCompareThumb(item)}<span class="media-compare-info"><strong>${escapeHtml(item.title||item.attachment_label||item.filename)}</strong><small>${escapeHtml([item.date_text,item.document_reference,item.attachment_label].filter(Boolean).join(' · ')||'Même contexte')}</small></span></button>`).join(''):'<p>Pas d’autre document ici : cherche dans tes médias.</p>';
        };
        const choose=found=>{
            if(pickTarget==='left'){left=found;baseCandidates=(state.lightboxMedia||[]).filter(item=>Number(item.id)!==Number(left.id));}
            else right=found;
            pickTarget='right';
            renderGrid();
            renderResults(baseCandidates);
        };
        const setPickTarget=target=>{pickTarget=target;renderGrid();renderResults(baseCandidates);search.focus();};
        renderGrid();
        renderResults(baseCandidates);
        fetchMediaCompareInfo(initial).then(enriched=>{
            if(left===initial){left=enriched;renderGrid();}
        });
        // 🖼 la fenêtre unique des médias (par-dessus), filtrée sur la personne du document
        search.addEventListener('click',async()=>{
            const ref=pickTarget==='left'?(right||left):left;
            const pid=Number((ref?.people_links||[])[0]?.id||0)||null;
            const it=await window.LCNDA_PICKER?.openMediaPicker?.({types:['image','document'],person:pid,eyebrow:'COMPARER',title:pickTarget==='left'?'Le document A':'Le document B',okLabel:'Comparer'});
            if(!it)return;
            if(Number(it.id)===currentExcludedId()){toast('C’est déjà l’autre document.');return;}
            choose(await fetchMediaCompareInfo({...it,thumbnail:it.thumbnail||it.filename,document_reference:it.cote||'',date_text:it.date_text||''}));
        });
        results.addEventListener('click',event=>{
            const btn=event.target.closest('[data-media-candidate]');if(!btn)return;
            const found=baseCandidates.find(item=>Number(item.id)===Number(btn.dataset.mediaCandidate));
            if(found)choose(found);
        });
        grid.addEventListener('click',event=>{
            const pickBtn=event.target.closest('[data-compare-pick]');
            if(pickBtn){setPickTarget(pickBtn.dataset.comparePick);return;}
            const removeBtn=event.target.closest('[data-compare-remove]');
            if(removeBtn){right=null;pickTarget='right';renderGrid();renderResults(baseCandidates);}
        });
        $('#media-compare-close').addEventListener('click',()=>{dialog.close();dialog.remove();});
        dialog.addEventListener('close',()=>dialog.remove());
        dialog.showModal();
        setTimeout(()=>search.focus(),50);
    }
    function mediaDuplicateItemHtml(item){
        const title=item.title||item.document_title||item.filename||`Média #${item.id}`;
        const linkInfo=mediaCompareLinkInfo(item);
        const people=(item.people_links||[]).map(p=>`<button type="button" class="table-link" data-open-person="${p.id}">${escapeHtml(p.name)}</button>`).join(', ');
        return `<article class="media-duplicate-item" data-duplicate-media="${item.id}"><a class="media-duplicate-thumb-link" href="media/${encodeURIComponent(item.filename)}" target="_blank" rel="noopener" title="Ouvrir le fichier">${mediaCompareThumb(item)}</a><div class="media-duplicate-info"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(item.filename)}${item.date_text?` · ${escapeHtml(item.date_text)}`:''}</small><small class="media-duplicate-link-info">${escapeHtml(linkInfo)}</small>${people?`<small class="media-duplicate-people">${(item.people_links||[]).length<2?'Personne':'Personnes'} : ${people}</small>`:''}</div><div class="media-duplicate-actions"><button type="button" class="button small danger" data-delete-duplicate="${item.id}">Supprimer</button></div></article>`;
    }
    function mediaDuplicateGroupHtml(group){
        return `<section class="media-duplicate-group" data-duplicate-group="${escapeHtml(group.hash)}"><header class="media-duplicate-group-head"><strong>${group.items.length} fichiers identiques</strong><span>${formatFileSize(group.size_bytes)} chacun · même contenu</span></header><div class="media-duplicate-group-items">${group.items.map(mediaDuplicateItemHtml).join('')}</div></section>`;
    }
    async function openMediaDuplicatesDialog(){
        $('#media-duplicates-dialog')?.remove();
        document.body.insertAdjacentHTML('beforeend','<dialog class="modal media-duplicates-dialog" id="media-duplicates-dialog"><div class="modal-head"><div><span class="eyebrow">MÉDIAS</span><h2>Recherche de doublons</h2></div><button class="icon-button" value="cancel" type="button" id="media-duplicates-close">×</button></div><div class="media-duplicates-body" id="media-duplicates-body"><div class="loading-block">Analyse des fichiers en cours…</div></div></dialog>');
        const dialog=$('#media-duplicates-dialog'),body=$('#media-duplicates-body');
        $('#media-duplicates-close').addEventListener('click',()=>{dialog.close();dialog.remove();});
        dialog.addEventListener('close',()=>dialog.remove());
        dialog.showModal();
        let data;
        try{data=await api('media_duplicates');}
        catch(error){body.innerHTML=`<p>${escapeHtml(error.message||'Erreur pendant la recherche de doublons.')}</p>`;return;}
        if(!dialog.isConnected)return;
        let groups=data.groups||[];
        const paint=()=>{
            body.innerHTML=groups.length
                ?`<p class="media-duplicates-summary">${plural(groups.length,'groupe de doublons trouvé','groupes de doublons trouvés')} parmi ${plural(data.scanned||0,'fichier analysé','fichiers analysés')} (comparaison par empreinte de fichier).</p>${groups.map(mediaDuplicateGroupHtml).join('')}`
                :`<p class="media-duplicates-summary">Aucun doublon détecté parmi ${plural(data.scanned||0,'fichier analysé','fichiers analysés')}.</p>`;
            bindTableLinks();
        };
        paint();
        body.addEventListener('click',async event=>{
            const deleteBtn=event.target.closest('[data-delete-duplicate]');
            if(!deleteBtn)return;
            const mediaId=Number(deleteBtn.dataset.deleteDuplicate);
            const title=deleteBtn.closest('[data-duplicate-media]')?.querySelector('strong')?.textContent||`#${mediaId}`;
            if(!await confirmBox('Le fichier importé restera sur le disque.',{title:`Supprimer le média « ${title} » de la base ?`,okLabel:'Supprimer le média'}))return;
            deleteBtn.disabled=true;
            try{
                await api('delete_media',{}, {method:'POST',body:{media_id:mediaId}});
                toast('Média supprimé de la base.');
                groups=groups.map(group=>({...group,items:group.items.filter(item=>Number(item.id)!==mediaId)})).filter(group=>group.items.length>1);
                paint();
            }catch(error){toast(error.message,'error');deleteBtn.disabled=false;}
        });
    }
    function mediaFaceDetectionRows(){
        return (state.currentListRows||[]).filter(row=>row&&row.filename&&normalizedMediaType(row)==='image');
    }
    function mediaFaceDetectionThumb(item){
        const src=item.thumbnail||item.filename;
        return `<img class="media-compare-thumb" src="media/${encodeURIComponent(src)}" alt="">`;
    }
    async function detectFacesInMedia(item,detector){
        const image=new Image();
        image.decoding='async';
        image.src=`media/${encodeURIComponent(item.filename)}`;
        await new Promise((resolve,reject)=>{
            image.onload=resolve;
            image.onerror=()=>reject(new Error('Image illisible.'));
        });
        if(image.decode)try{await image.decode();}catch(_){}
        const faces=await detector.detect(image);
        const width=image.naturalWidth||image.width;
        const height=image.naturalHeight||image.height;
        return (faces||[]).map(face=>{
            const box=face.boundingBox||{};
            return {x:(box.x||0)/width*100,y:(box.y||0)/height*100,w:(box.width||0)/width*100,h:(box.height||0)/height*100};
        }).filter(face=>face.w>1&&face.h>1);
    }
    async function waitForLightboxImage(){
        const img=$('#lightbox-image');
        if(!img)return null;
        if(img.complete&&img.naturalWidth)return img;
        await new Promise(resolve=>img.addEventListener('load',resolve,{once:true}));
        return img;
    }
    async function showFaceSuggestionsOnLightbox(faces){
        const img=await waitForLightboxImage();
        const canvas=$('#lightbox-tag-canvas');
        if(!img||!canvas)return;
        state.lightboxTagsVisible=true;
        state.lightboxFaceSuggestions=faces;
        renderMediaTagOverlays();
        canvas.style.pointerEvents='auto';
        toast(`${faces.length} visage${faces.length>1?'s':''} détecté${faces.length>1?'s':''}. Clique sur une zone pour l’identifier.`);
    }
    async function openMediaFaceDetectionDialog(){
        $('#media-face-dialog')?.remove();
        const rows=mediaFaceDetectionRows();
        document.body.insertAdjacentHTML('beforeend',`<dialog class="modal media-duplicates-dialog media-face-dialog" id="media-face-dialog"><div class="modal-head"><div><span class="eyebrow">MÉDIAS</span><h2>Détection de visage</h2></div><button class="icon-button" value="cancel" type="button" id="media-face-close">×</button></div><div class="media-duplicates-body" id="media-face-body">${rows.length?`<p class="media-duplicates-summary">Analyse semi-automatique ${rows.length<2?`de l’image actuellement chargée`:`des ${plural(rows.length,'image')} actuellement chargées`}. Les zones proposées restent à valider manuellement.</p><div class="page-actions" style="justify-content:flex-start"><button type="button" class="button small" id="media-face-run">Analyser les images chargées</button></div>`:'<p class="media-duplicates-summary">Aucune image chargée dans cette liste. Charge ou filtre la liste Médias puis relance la détection.</p>'}</div></dialog>`);
        const dialog=$('#media-face-dialog'),body=$('#media-face-body');
        $('#media-face-close').addEventListener('click',()=>{dialog.close();dialog.remove();});
        dialog.addEventListener('close',()=>dialog.remove());
        dialog.showModal();
        $('#media-face-run')?.addEventListener('click',async()=>{
            const runButton=$('#media-face-run');
            if(!('FaceDetector' in window)){
                body.innerHTML='<p class="media-duplicates-summary">Détection de visage indisponible dans ce navigateur. L’identification manuelle reste disponible dans chaque média.</p>';
                return;
            }
            runButton.disabled=true;
            runButton.textContent='Analyse en cours…';
            const detector=new window.FaceDetector({fastMode:true,maxDetectedFaces:25});
            const results=[];
            for(let index=0;index<rows.length;index++){
                body.querySelector('.media-duplicates-summary').textContent=`Analyse ${index+1}/${rows.length} · ${rows[index].filename}`;
                try{
                    const faces=await detectFacesInMedia(rows[index],detector);
                    if(faces.length)results.push({item:rows[index],faces});
                }catch(_){}
            }
            if(!dialog.isConnected)return;
            body.innerHTML=results.length
                ?`<p class="media-duplicates-summary">${plural(results.length,'image')} avec un visage détecté. Ouvre une image pour valider les identifications.</p><div class="media-duplicate-group-items">${results.map((result,index)=>`<article class="media-duplicate-item"><a class="media-duplicate-thumb-link" href="media/${encodeURIComponent(result.item.filename)}" target="_blank" rel="noopener">${mediaFaceDetectionThumb(result.item)}</a><div class="media-duplicate-info"><strong>${escapeHtml(result.item.title||result.item.document_title||result.item.filename)}</strong><small>${result.faces.length} visage${result.faces.length>1?'s':''} proposé${result.faces.length>1?'s':''}</small><small>${escapeHtml(result.item.attachment_label||'Non rattaché')}</small></div><div class="media-duplicate-actions"><button type="button" class="button small" data-open-face-result="${index}">Ouvrir et taguer</button></div></article>`).join('')}</div>`
                :'<p class="media-duplicates-summary">Aucun visage détecté dans les images chargées.</p>';
            body.querySelectorAll('[data-open-face-result]').forEach(button=>button.addEventListener('click',async()=>{
                const result=results[Number(button.dataset.openFaceResult)];
                if(!result)return;
                const media=mediaFaceDetectionRows();
                const mediaIndex=media.findIndex(item=>Number(item.id)===Number(result.item.id));
                dialog.close();
                openLightbox(media,mediaIndex>=0?mediaIndex:0,true);
                await showFaceSuggestionsOnLightbox(result.faces);
            }));
        });
    }
    function captureLightboxDraft(){const item=state.lightboxMedia[state.lightboxIndex];if(item&&$('#lightbox-transcription')){item.title=$('#lightbox-title').value;item.date_text=$('#lightbox-date').value;item.document_reference=$('#lightbox-doc-reference').value;item.document_title=$('#lightbox-doc-title').value;item.document_url=$('#lightbox-doc-url').value;item.document_pages=$('#lightbox-doc-pages').value;item.description=$('#lightbox-description').value;item.transcription=$('#lightbox-transcription').value;item.is_person_photo=$('#lightbox-person-photo')?.checked?1:0;item.correspondence_type=$('#lightbox-correspondence-type')?.value||'';item.date_calendar=$('#lightbox-date-calendar')?.value||'gregorian';item.correspondent_json=$('#lightbox-correspondent-value')?.value||'[]';item.correspondence_reply_to_media_id=$('#lightbox-correspondence-reply')?.value||0;item.media_subject_type=$('#lightbox-media-subject-type')?.value||'';}}
    function moveLightbox(direction){if(!state.lightboxMedia.length)return;captureLightboxDraft();state.lightboxIndex=(state.lightboxIndex+direction+state.lightboxMedia.length)%state.lightboxMedia.length;renderLightboxItem();}
    function lightboxLinkLabel(entityType, entityId, detail) {
        if (entityType === 'person') return 'Fiche individuelle';
        if (entityType === 'military') return 'Dossier militaire';
        if (entityType === 'family') return 'Famille';
        if (entityType === 'event') {
            const ev = (detail?.events || []).find(e => Number(e.id) === Number(entityId));
            return ev ? `${ev.type_label}${ev.date_text ? ' — ' + ev.date_text : ''}` : `Événement #${entityId}`;
        }
        if (entityType === 'census') {
            const cr = (detail?.census?.records || []).find(r => Number(r.id) === Number(entityId));
            return cr ? `Recensement ${cr.year}${cr.address ? ' — ' + cr.address : ''}` : `Recensement #${entityId}`;
        }
        return `${entityType} #${entityId}`;
    }

    function parseLightboxLinks(item) {
        // Reconstruit la liste des liens [{entityType, entityId, label}] depuis les champs group_concat
        const links = [];
        const personId = state.currentPersonId;
        const detail = state.currentPerson;
        const battueItemIds = csvIds(item.battue_item_ids || '');
        if (battueItemIds.length) {
            battueItemIds.forEach(id => links.push({ entityType: 'battue_item', entityId: id, label: item.attachment_label || `Annotation de battue #${id}` }));
            return links;
        }
        if (!personId) {
            links.push({ entityType: 'media', entityId: item.id, label: item.attachment_label || 'Média' });
            return links;
        }
        // person link
        if (String(item.event_ids || '').trim() === '' && String(item.census_ids || '').trim() === '' && String(item.military_ids || '').trim() === '') {
            // rattaché à la fiche individuelle (entity_type=person) — check via attachment_label
        }
        // We rebuild from what we know: parse attachment_label labels and cross with ids
        // Best approach: fetch media_links directly or use the grouped ids we have
        const eventIds = csvIds(item.event_ids || '');
        const censusIds = csvIds(item.census_ids || '');
        const militaryIds = csvIds(item.military_ids || '');
        const hasPerson = !eventIds.length && !censusIds.length && !militaryIds.length
            ? true
            : (item.attachment_label || '').split(',').map(s => s.trim()).includes('Fiche individuelle');
        if (hasPerson) links.push({ entityType: 'person', entityId: personId, label: 'Fiche individuelle' });
        eventIds.forEach(id => links.push({ entityType: 'event', entityId: id, label: lightboxLinkLabel('event', id, detail) }));
        censusIds.forEach(id => links.push({ entityType: 'census', entityId: id, label: lightboxLinkLabel('census', id, detail) }));
        militaryIds.forEach(id => links.push({ entityType: 'military', entityId: id, label: 'Dossier militaire' }));
        return links;
    }

    function renderLightboxAttachments(item) {
        const list = $('#lightbox-attachment-list');
        if (!list) return;
        const links = parseLightboxLinks(item);
        const canManageLinks = !!state.currentPersonId && !csvIds(item.battue_item_ids || '').length;
        list.innerHTML = links.map(lk =>
            `<div class="lightbox-link-row"><span>${escapeHtml(lk.label)}</span>`
            + (canManageLinks && links.length > 1 ? `<button type="button" class="icon-button lightbox-unlink-btn" data-unlink-type="${escapeHtml(lk.entityType)}" data-unlink-id="${lk.entityId}" title="Retirer ce rattachement">×</button>` : '')
            + `</div>`
        ).join('') || '<div class="lightbox-link-row"><span>Fiche individuelle</span></div>';
        list.querySelectorAll('.lightbox-unlink-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!await confirmBox('Le média et la fiche ne sont pas supprimés.', {title: 'Retirer ce rattachement ?', okLabel: 'Retirer'})) return;
                const personId = state.currentPersonId;
                try {
                    await api('remove_media_link', {}, { method: 'POST', body: { media_id: item.id, person_id: personId, entity_type: btn.dataset.unlinkType, entity_id: btn.dataset.unlinkId } });
                    // Mettre à jour item localement
                    if (btn.dataset.unlinkType === 'event') item.event_ids = csvIds(item.event_ids || '').filter(id => id !== Number(btn.dataset.unlinkId)).join(',');
                    else if (btn.dataset.unlinkType === 'census') item.census_ids = csvIds(item.census_ids || '').filter(id => id !== Number(btn.dataset.unlinkId)).join(',');
                    else if (btn.dataset.unlinkType === 'military') item.military_ids = csvIds(item.military_ids || '').filter(id => id !== Number(btn.dataset.unlinkId)).join(',');
                    // Rebuild label
                    const remaining = parseLightboxLinks(item);
                    item.attachment_label = remaining.map(l => l.label).join(',');
                    renderLightboxAttachments(item);
                    // Sync state
                    const orig = state.currentPerson?.media?.find(m => Number(m.id) === Number(item.id));
                    if (orig) { orig.event_ids = item.event_ids; orig.census_ids = item.census_ids; orig.military_ids = item.military_ids; orig.attachment_label = item.attachment_label; }
                    toast('Rattachement retiré.');
                } catch (err) { toast(err.message, 'error'); }
            });
        });
        // Bouton "+" pour ajouter un rattachement
        const addBtn = $('#lightbox-add-link');
        if (addBtn) {
            addBtn.hidden = !canManageLinks;
            addBtn.onclick = canManageLinks ? () => openLightboxAddLinkPanel(item, links) : null;
        }
    }

    function openLightboxAddLinkPanel(item, currentLinks) {
        const addBtn = $('#lightbox-add-link');
        let panel = $('#lightbox-add-link-panel');
        if (panel) { panel.remove(); return; }
        const detail = state.currentPerson;
        const personId = state.currentPersonId;
        const currentKeys = new Set(currentLinks.map(l => l.entityType + ':' + l.entityId));
        // Build choices
        const choices = [];
        if (!currentKeys.has('person:' + personId)) choices.push({ entityType: 'person', entityId: personId, label: 'Fiche individuelle' });
        if (!currentKeys.has('military:' + personId)) choices.push({ entityType: 'military', entityId: personId, label: 'Dossier militaire' });
        (detail?.events || []).forEach(ev => {
            if (!currentKeys.has('event:' + ev.id)) choices.push({ entityType: 'event', entityId: ev.id, label: `${ev.type_label}${ev.date_text ? ' — ' + ev.date_text : ''}` });
        });
        (detail?.census?.records || []).forEach(cr => {
            if (!currentKeys.has('census:' + cr.id)) choices.push({ entityType: 'census', entityId: cr.id, label: `Recensement ${cr.year}${cr.address ? ' — ' + cr.address : ''}` });
        });
        if (!choices.length) { toast('Tous les éléments disponibles sont déjà rattachés.', 'error'); return; }
        panel = document.createElement('div');
        panel.id = 'lightbox-add-link-panel';
        panel.className = 'witness-search-panel';
        panel.innerHTML = `<label style="margin-top:0">Rattacher aussi à<select id="lightbox-link-select" style="width:100%;margin-top:4px"><option value="">— choisir —</option>${choices.map(c => `<option value="${c.entityType}:${c.entityId}">${escapeHtml(c.label)}</option>`).join('')}</select></label><div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="button small" id="lightbox-link-confirm">Rattacher</button><button type="button" class="button small secondary" id="lightbox-link-cancel">Annuler</button></div>`;
        addBtn.after(panel);
        $('#lightbox-link-cancel').onclick = () => panel.remove();
        $('#lightbox-link-confirm').onclick = async () => {
            const val = $('#lightbox-link-select').value;
            if (!val) { toast('Choisis un élément.', 'error'); return; }
            const [entityType, entityId] = val.split(':');
            try {
                await api('add_media_link', {}, { method: 'POST', body: { media_id: item.id, person_id: personId, entity_type: entityType, entity_id: entityId } });
                // Update item locally
                if (entityType === 'event') item.event_ids = [...csvIds(item.event_ids || ''), Number(entityId)].join(',');
                else if (entityType === 'census') item.census_ids = [...csvIds(item.census_ids || ''), Number(entityId)].join(',');
                else if (entityType === 'military') item.military_ids = [...csvIds(item.military_ids || ''), Number(entityId)].join(',');
                const remaining = parseLightboxLinks(item);
                item.attachment_label = remaining.map(l => l.label).join(',');
                panel.remove();
                renderLightboxAttachments(item);
                const orig = state.currentPerson?.media?.find(m => Number(m.id) === Number(item.id));
                if (orig) { orig.event_ids = item.event_ids; orig.census_ids = item.census_ids; orig.military_ids = item.military_ids; orig.attachment_label = item.attachment_label; }
                toast('Rattachement ajouté.');
            } catch (err) { toast(err.message, 'error'); }
        };
    }

    function lightboxPostcardPeers(item){
        const group=(item?.postcard_group||'').trim();
        if(!group)return [];
        return (state.lightboxMedia||[]).filter(row=>(row.postcard_group||'').trim()===group).sort((a,b)=>{
            const rank=side=>side==='recto'?0:side==='verso'?1:(Number(String(side||'').match(/\d+/)?.[0]||999));
            return rank(a.postcard_side)-rank(b.postcard_side)||Number(a.id)-Number(b.id);
        });
    }
    function lightboxEventSetPeers(item){
        const eventKeys=String(item?.event_collections||'').split(',').map(part=>part.trim()).filter(Boolean);
        if(!eventKeys.length)return [];
        const current=eventKeys[0].split(':');const eventId=Number(current[0]);
        return (state.lightboxMedia||[]).filter(row=>String(row?.event_collections||'').split(',').map(part=>part.trim()).some(key=>eventKeys.includes(key))).sort((a,b)=>eventLinkPosition(a,eventId)-eventLinkPosition(b,eventId)||Number(a.id)-Number(b.id));
    }
    function renderLightboxPostcardStack(item){
        const stack=$('#lightbox-postcard-stack');
        if(!stack)return false;
        const eventPeers=lightboxEventSetPeers(item);
        const peers=eventPeers.length>=2?eventPeers:lightboxPostcardPeers(item);
        if(peers.length<2){
            stack.hidden=true;stack.innerHTML='';
            return false;
        }
        stack.hidden=false;
        stack.innerHTML=peers.map((face,index)=>{
            const side=eventPeers.length>=2?`Image ${index+1}`:(face.postcard_side==='verso'?'Verso':face.postcard_side==='recto'?'Recto':(face.postcard_side||`Image ${index+1}`));
            const current=Number(face.id)===Number(item.id);
            return `<button type="button" class="lightbox-postcard-face${current?' is-current':''}" data-postcard-face="${face.id}" title="${escapeHtml(side)}"><strong>${index+1}</strong><span>${escapeHtml(side)}</span></button>`;
        }).join('');
        stack.querySelectorAll('[data-postcard-face]').forEach(button=>button.addEventListener('click',()=>{
            const id=Number(button.dataset.postcardFace);
            const index=(state.lightboxMedia||[]).findIndex(row=>Number(row.id)===id);
            if(index>=0&&index!==state.lightboxIndex){captureLightboxDraft();state.lightboxIndex=index;renderLightboxItem();}
        }));
        return true;
    }
    function renderLightboxItem(){
        const item=state.lightboxMedia[state.lightboxIndex];
        if(!item)return;
        state.lightboxFaceSuggestions=[];
        const kind=normalizedMediaType(item);
        const canTag=kind==='image';
        resetLightboxZoom();
        exitTagMode();
        renderLightboxPostcardStack(item);
        const img=$('#lightbox-image'),pdf=$('#lightbox-pdf'),video=$('#lightbox-video'),audio=$('#lightbox-audio'),canvas=$('#lightbox-tag-canvas');
        [img,pdf,video,audio].forEach(el=>{if(el)el.hidden=true;});
        if(video){video.pause();video.removeAttribute('src');video.load();}
        if(audio){audio.pause();audio.removeAttribute('src');audio.load();}
        if(pdf)pdf.removeAttribute('src');
        const mediaUrl=`media/${encodeURIComponent(item.filename)}${item._cacheBust?`?v=${encodeURIComponent(item._cacheBust)}`:''}`;
        if(kind==='pdf'&&pdf){pdf.hidden=false;pdf.src=mediaUrl;}
        else if(kind==='video'&&video){video.hidden=false;video.src=mediaUrl;}
        else if(kind==='audio'&&audio){audio.hidden=false;audio.src=mediaUrl;}
        else if(img){img.hidden=false;img.src=mediaUrl;img.alt=item.title||'Document généalogique';}
        if(canvas){canvas.hidden=!canTag;if(!canTag)canvas.innerHTML='';}
        $('#lightbox-counter').textContent=`DOCUMENT ${state.lightboxIndex+1} / ${state.lightboxMedia.length}`;
        $('#lightbox-caption').textContent=item.title||item.attachment_label||'Document sans titre';
        renderLightboxAttachments(item);
        $('#lightbox-title').value=item.title||'';
        $('#lightbox-date').value=item.date_text||'';
        if($('#lightbox-date-calendar'))$('#lightbox-date-calendar').value=item.date_calendar||'gregorian';
        $('#lightbox-doc-reference').value=item.document_reference||'';
        $('#lightbox-doc-title').value=item.document_title||'';
        $('#lightbox-doc-url').value=item.document_url||'';
        $('#lightbox-doc-pages').value=item.document_pages||'';
	        const correspondenceSelect=$('#lightbox-correspondence-type');
	        if(correspondenceSelect){const ctype=item.correspondence_type||'';if(ctype.startsWith('custom:')&&![...correspondenceSelect.options].some(option=>option.value===ctype)){const option=document.createElement('option');option.value=ctype;option.textContent=correspondenceTypeLabel(ctype);correspondenceSelect.appendChild(option);}correspondenceSelect.value=ctype;}
	        const replySelect=$('#lightbox-correspondence-reply');
	        if(replySelect){
	            const rows=correspondenceMediaOnly(state.lightboxMedia||state.currentPerson?.media||[]).filter(row=>Number(row.id)!==Number(item.id));
	            replySelect.innerHTML='<option value="">Aucune autre correspondance</option>'+rows.map(row=>`<option value="${row.id}">${escapeHtml([correspondenceTypeLabel(row.correspondence_type),row.date_text,row.title||row.attachment_label||row.filename].filter(Boolean).join(' · '))}</option>`).join('');
	            replySelect.value=String(item.correspondence_reply_to_media_id||'');
	        }
	        const lightboxCorrespondentValue=$('#lightbox-correspondent-value');
        if(lightboxCorrespondentValue){lightboxCorrespondentValue.value=item.correspondent_json||JSON.stringify(correspondentListFromValue(item.correspondent_name||''));if(!state._lightboxCorrespondentPicker)state._lightboxCorrespondentPicker=setupCorrespondentPicker({chipsEl:$('#lightbox-correspondent-chips'),searchInput:$('#lightbox-correspondent-search'),suggestionsEl:$('#lightbox-correspondent-suggestions'),hiddenInput:lightboxCorrespondentValue});else state._lightboxCorrespondentPicker.set(correspondentListFromValue(lightboxCorrespondentValue.value));}
	        $('#lightbox-description').value=item.description||'';
	        $('#lightbox-transcription').value=item.transcription||'';
	        if($('#lightbox-media-subject-type'))$('#lightbox-media-subject-type').value=item.media_subject_type||'';
        renderLabelPicker('#lightbox-label-picker','media',item.id,item.labels||[]);
        const photoToggle=$('#lightbox-person-photo');if(photoToggle)photoToggle.checked=Number(item.is_person_photo||0)===1;
        const hasPersonContext=!!state.currentPersonId&&!!state.currentPerson?.person;
        const isCurrentPortrait=hasPersonContext&&canTag&&Number(state.currentPerson?.person?.portrait_media_id||0)===Number(item.id);
        const rotateLeft=$('#rotate-media-left'),rotateRight=$('#rotate-media-right');
        if(rotateLeft)rotateLeft.hidden=!canTag||state.lightboxReadOnly;
        if(rotateRight)rotateRight.hidden=!canTag||state.lightboxReadOnly;
        const retouchButton=$('#retouch-media');if(retouchButton)retouchButton.hidden=!canTag||state.lightboxReadOnly;const assembleButton=$('#assemble-media');if(assembleButton)assembleButton.hidden=!canTag||state.lightboxReadOnly||!window.LCNDA_EXT?.openAssembler;const avEditButton=$('#edit-av-media');if(avEditButton)avEditButton.hidden=!['audio','video'].includes(kind)||state.lightboxReadOnly||!window.LCNDA_EXT?.openAvEditor;
        $('#set-portrait').hidden=!hasPersonContext||!canTag||isCurrentPortrait;
        let removePortraitButton=$('#remove-portrait');
        if(!removePortraitButton){removePortraitButton=document.createElement('button');removePortraitButton.type='button';removePortraitButton.id='remove-portrait';removePortraitButton.className='button small secondary';removePortraitButton.textContent='Retirer comme portrait';removePortraitButton.addEventListener('click',removeCurrentPortrait);$('#set-portrait').insertAdjacentElement('afterend',removePortraitButton);}
        removePortraitButton.hidden=!hasPersonContext||!canTag||!isCurrentPortrait;
        $('#lightbox-prev').disabled=state.lightboxMedia.length<2;
        $('#lightbox-next').disabled=state.lightboxMedia.length<2;
        const tagsBlock=$('#lightbox-tags-block'),signaturesBlock=$('#lightbox-signatures-block');
        if(tagsBlock)tagsBlock.hidden=!canTag;
        if(signaturesBlock)signaturesBlock.hidden=!canTag;
        const personTagsToggle=$('#lightbox-tags-visible-toggle'),signatureTagsToggle=$('#lightbox-signatures-visible-toggle');
        if(personTagsToggle)personTagsToggle.checked=state.lightboxTagsVisible;
        if(signatureTagsToggle)signatureTagsToggle.checked=state.lightboxTagsVisible;
        if(canTag)loadMediaTags(item.id);else{state.lightboxTags=[];renderMediaTagList();}
    }
    async function saveCurrentTranscription(){const item=state.lightboxMedia[state.lightboxIndex];if(!item)return;const transcription=$('#lightbox-transcription').value;try{await api('save_media_transcription',{}, {method:'POST',body:{media_id:item.id,transcription}});item.transcription=transcription;const original=state.currentPerson?.media?.find(media=>Number(media.id)===Number(item.id));if(original)original.transcription=transcription;for(const commune of (state.currentBattueDetail?.communes||[])){for(const searchItem of (commune.items||[])){const media=(searchItem.media||[]).find(row=>Number(row.id)===Number(item.id));if(media)media.transcription=transcription;}}toast('Transcription enregistrée.');}catch(error){toast(error.message,'error');}}
    function structureCurrentTranscription(){const area=$('#lightbox-transcription');const current=area.value.trim();if(current.startsWith('Type de document :')){toast('La transcription est déjà structurée.');return;}const title=$('#lightbox-title').value||$('#lightbox-caption').textContent||'Document';const date=$('#lightbox-date').value||'';area.value=`Type de document : ${title}\nDate : ${date}\nLieu : \nPersonnes citées : \n\nTranscription fidèle :\n${current||'[à transcrire]'}\n\nRésumé utile :\n\nInformations extraites :\n- Événement : \n- Personne(s) concernée(s) : \n- Parents / conjoints / témoins : \n- Âges / métiers / adresses : \n\nPoints à vérifier :\n- `;toast('Gabarit de transcription ajouté.');}
    // ── Reconnaissance de texte sur le média affiché dans la visionneuse ──
    // OCR tapuscrit : Tesseract dans le navigateur.
    // HTR manuscrit : service local côté serveur, branchable sur Kraken + modèles .mlmodel.
    // Le texte détecté est toujours AJOUTÉ À LA FIN de la transcription existante, jamais en remplacement.
    // Le lecteur (Tesseract.js) est livré avec l'app (assets/vendor/tesseract) ; seul son moteur, trop lourd, vient
    // d'internet : il n'est exécuté que si son empreinte est exactement celle attendue (sinon refusé).
    const OCR_CORE={url:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js',integrity:'sha384-EKWY5JDwphQoyxhvYU7eaCcyQ0EdV6fZK3L2vzfZcv2ichRdNd6pSnyWPNv6fMuR'};
    let ocrEnginePromise=null;
    function loadOcrEngine(){
        if(ocrEnginePromise)return ocrEnginePromise;
        const script=new Promise((resolve,reject)=>{
            if(window.Tesseract)return resolve(window.Tesseract);
            const el=document.createElement('script');
            el.src='assets/vendor/tesseract/tesseract.min.js';
            el.async=true;
            el.onload=()=>{window.Tesseract?resolve(window.Tesseract):reject(new Error('Moteur OCR indisponible après chargement.'));};
            el.onerror=()=>reject(new Error('Impossible de charger le lecteur de texte.'));
            document.head.appendChild(el);
        });
        const core=fetch(OCR_CORE.url,{integrity:OCR_CORE.integrity,credentials:'omit'}).then(r=>{if(!r.ok)throw new Error();return r.blob();})
            // « #.js » : Tesseract n'utilise tel quel qu'un chemin finissant par .js
            .then(b=>URL.createObjectURL(new Blob([b],{type:'application/javascript'}))+'#.js')
            .catch(()=>{throw new Error('Impossible de charger le moteur OCR (connexion internet requise, ou fichier modifié refusé).');});
        ocrEnginePromise=Promise.all([script,core]).then(([T,corePath])=>{
            const base={workerPath:'assets/vendor/tesseract/worker.min.js',workerBlobURL:false,corePath};
            return {...T,recognize:(image,langs,options={})=>T.recognize(image,langs,{...options,...base}),createWorker:(langs,oem,options={},config)=>T.createWorker(langs,oem,{...options,...base},config)};
        }).catch(error=>{ocrEnginePromise=null;throw error;});
        return ocrEnginePromise;
    }
    /** La visionneuse montre-t-elle encore ce média ? (une réponse lente ne doit pas toucher la page suivante) */
    function lightboxShows(item){return Boolean(item&&$('#lightbox')?.open&&Number(state.lightboxMedia?.[state.lightboxIndex]?.id)===Number(item.id));}
    async function runOcrTranscription(){
        const item=state.lightboxMedia[state.lightboxIndex];
        if(!item)return;
        if(normalizedMediaType(item)!=='image'){toast('OCR disponible uniquement pour les images.','error');return;}
        const btn=$('#ocr-transcription'),otherBtn=$('#handwriting-transcription'),statusEl=$('#ocr-transcription-status'),area=$('#lightbox-transcription');
        if(!area)return;
        const originalLabel=btn?btn.textContent:'';
        if(btn){btn.disabled=true;btn.textContent='Analyse OCR…';}
        if(otherBtn)otherBtn.disabled=true;
        if(statusEl){statusEl.hidden=false;statusEl.textContent='Chargement du moteur OCR…';}
        try{
            const Tesseract=await loadOcrEngine();
            if(statusEl)statusEl.textContent='Analyse de l’image en cours…';
            const imgSrc=`media/${encodeURIComponent(item.filename)}`;
            const language=$('#ocr-language')?.value||'fra';
            const result=await Tesseract.recognize(imgSrc,language);
            const recognized=(result?.data?.text||'').trim();
            if(!recognized){
                toast('Aucun texte détecté par l’OCR sur ce document.','error');
                if(statusEl){statusEl.textContent='Aucun texte détecté.';}
                return;
            }
            // Pendant la lecture, on a pu passer à une autre page : le texte va au document lu, pas à celui affiché
            if(!lightboxShows(item)){item.transcription=(item.transcription||'')+((item.transcription||'').trim()?`\n\n— Texte détecté par OCR (à relire) —\n`:'')+recognized;toast(`Texte ajouté à « ${item.title||'document'} » : ouvre-le pour le relire et l’enregistrer.`);return;}
            const current=area.value;
            const separator=current.trim()?`\n\n— Texte détecté par OCR (à relire) —\n`:'';
            area.value=current+separator+recognized;
            toast('Texte OCR ajouté à la fin de la transcription — pense à le relire avant d’enregistrer.');
            if(statusEl)statusEl.textContent='Texte ajouté à la fin. Pense à relire avant d’enregistrer.';
        }catch(error){
            toast(error.message||'Échec de l’OCR.','error');
            if(statusEl)statusEl.textContent=error.message||'Échec de l’OCR.';
        }finally{
            if(btn){btn.disabled=false;btn.textContent=originalLabel||'🔎 OCR (texte tapuscrit)';}
            if(otherBtn)otherBtn.disabled=false;
        }
    }
    async function runHandwritingTranscription(){
        const item=state.lightboxMedia[state.lightboxIndex];
        if(!item)return;
        if(normalizedMediaType(item)!=='image'){toast('HTR disponible uniquement pour les images.','error');return;}
        const btn=$('#handwriting-transcription'),otherBtn=$('#ocr-transcription'),statusEl=$('#ocr-transcription-status'),area=$('#lightbox-transcription');
        if(!area)return;
        const originalLabel=btn?btn.textContent:'';
        if(btn){btn.disabled=true;btn.textContent='Analyse HTR…';}
        if(otherBtn)otherBtn.disabled=true;
        if(statusEl){statusEl.hidden=false;statusEl.textContent='Lecture manuscrite locale…';}
        try{
            const model=$('#htr-model')?.value||'fr-actes';
            const language=htrLanguageForModel(model);
            const data=await api('htr_recognize',{}, {method:'POST',body:{media_id:item.id,model,language}});
            const recognized=(data?.result?.text||'').trim();
            if(!recognized){
                toast('Aucun texte manuscrit reconnu sur ce document.','error');
                if(statusEl)statusEl.textContent='Aucun texte reconnu.';
                return;
            }
            const modelLabel=$('#htr-model')?.selectedOptions?.[0]?.textContent||data?.result?.model_label||'modèle local';
            if(!lightboxShows(item)){item.transcription=(item.transcription||'')+((item.transcription||'').trim()?`\n\n— Texte manuscrit reconnu par HTR (${modelLabel}, à relire) —\n`:'')+recognized;toast(`Texte ajouté à « ${item.title||'document'} » : ouvre-le pour le relire et l’enregistrer.`);return;}
            const current=area.value;
            const separator=current.trim()?`\n\n— Texte manuscrit reconnu par HTR (${modelLabel}, à relire) —\n`:'';
            area.value=current+separator+recognized;
            toast('Texte manuscrit ajouté à la fin — à relire attentivement.');
            if(statusEl)statusEl.textContent='Texte HTR ajouté à la fin. Pense à relire avant d’enregistrer.';
        }catch(error){
            toast(error.message||'Échec de la reconnaissance manuscrite.','error');
            if(statusEl)statusEl.textContent=error.message||'Échec de la reconnaissance manuscrite.';
        }finally{
            if(btn){btn.disabled=false;btn.textContent=originalLabel||'✍ HTR manuscrit';}
            if(otherBtn)otherBtn.disabled=false;
        }
    }
    async function saveCurrentMediaMeta(){const item=state.lightboxMedia[state.lightboxIndex];if(!item)return;captureLightboxDraft();const labelIds=($('#lightbox-label-picker input[type=hidden]')?.value||'').split(',').filter(Boolean).map(Number);/* lues avant d'attendre : on a pu passer au média suivant */try{const result=await api('save_media',{}, {method:'POST',body:{media_id:item.id,title:item.title,date_text:item.date_text,document_reference:item.document_reference,document_title:item.document_title,document_url:item.document_url,document_pages:item.document_pages,description:item.description,transcription:item.transcription,is_person_photo:item.is_person_photo?1:0,media_subject_type:item.media_subject_type||'',correspondence_type:item.correspondence_type||'',date_calendar:item.date_calendar||'gregorian',correspondent_names:item.correspondent_json||'[]',correspondence_reply_to_media_id:item.correspondence_reply_to_media_id||0}});Object.assign(item,result.result);const labels=await applyLabelPickerAfterSave('#lightbox-label-picker',item.id,labelIds);if(labels)item.labels=labels;const original=state.currentPerson?.media?.find(media=>Number(media.id)===Number(item.id));if(original){Object.assign(original,result.result);if(labels)original.labels=labels;}for(const commune of (state.currentBattueDetail?.communes||[])){for(const searchItem of (commune.items||[])){const media=(searchItem.media||[]).find(row=>Number(row.id)===Number(item.id));if(media){Object.assign(media,result.result);if(labels)media.labels=labels;}}}if(lightboxShows(item))$('#lightbox-caption').textContent=item.title||item.attachment_label||'Document sans titre';toast('Média enregistré.');}catch(error){toast(error.message,'error');}}
    async function rotateCurrentMedia(direction){
        const item=state.lightboxMedia[state.lightboxIndex];
        if(!item||normalizedMediaType(item)!=='image')return;
        const btn=direction==='left'?$('#rotate-media-left'):$('#rotate-media-right');
        const originalLabel=btn?.textContent||'';
        try{
            if(btn){btn.disabled=true;btn.textContent='Rotation…';}
            const result=await api('rotate_media_image',{}, {method:'POST',body:{media_id:item.id,direction}});
            if(result.result)Object.assign(item,result.result);
            item._cacheBust=Date.now();
            const original=state.currentPerson?.media?.find(media=>Number(media.id)===Number(item.id));
            if(original){Object.assign(original,result.result||{});original._cacheBust=item._cacheBust;}
            renderLightboxItem();
            toast('Image tournée.');
        }catch(error){
            toast(error.message||'Rotation impossible.','error');
        }finally{
            if(btn){btn.disabled=false;btn.textContent=originalLabel;}
        }
    }
    async function deleteCurrentMedia(){
        const item=state.lightboxMedia[state.lightboxIndex];
        if(!item)return;
        if(!await confirmBox('Le fichier importé restera sur le disque.',{title:`Supprimer le média « ${item.title || item.attachment_label || item.filename} » de la base ?`,okLabel:'Supprimer le média'}))return;
        const deletedId=Number(item.id);
        try{
            await api('delete_media',{}, {method:'POST',body:{media_id:item.id}});
            toast('Média supprimé de la base.');
            $('#lightbox').close();
            state.lightboxMedia=(state.lightboxMedia||[]).filter(media=>Number(media.id)!==deletedId);
            if(state.currentPerson?.media){
                state.currentPerson.media=state.currentPerson.media.filter(media=>Number(media.id)!==deletedId);
                if(Number(state.currentPerson.person?.portrait_media_id||0)===deletedId){
                    state.currentPerson.person.portrait_media_id=null;
                    state.currentPerson.person.portrait='';
                }
                if(state.module==='personnes')renderPerson(state.currentPerson);
            }
            // on rafraîchit ce qui est à l'écran (une enquête ou une liste ouverte gardait la vignette du média supprimé)
            if(state.module==='enquetes'&&state.currentInvestigationId)await renderInvestigationDetail(state.currentInvestigationId);
            else if(state.currentBattueId)await renderBattueDetail(state.currentBattueId);
            else if(state.module==='listes'||state.module==='dashboard')await setModule(state.module,false);
            else if(state.currentPersonId)await selectPerson(state.currentPersonId,false);
        }catch(error){toast(error.message,'error');}
    }
    async function setCurrentPortrait(){const item=state.lightboxMedia[state.lightboxIndex];if(!state.currentPersonId){toast('Ouvre une fiche personne pour définir un portrait.','error');return;}if(!item||normalizedMediaType(item)!=='image')return;try{await api('set_portrait',{}, {method:'POST',body:{person_id:state.currentPersonId,media_id:item.id}});toast('Photo principale mise à jour.');$('#lightbox').close();await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}}
    async function removeCurrentPortrait(){const item=state.lightboxMedia[state.lightboxIndex];if(!item)return;try{await api('set_portrait',{}, {method:'POST',body:{person_id:state.currentPersonId,media_id:''}});toast('Photo principale retirée.');$('#lightbox').close();await selectPerson(state.currentPersonId);}catch(error){toast(error.message,'error');}}

    // ── Identification de personnes sur les médias ──────────────────────────────
    function getImageContentRect(img){const nw=img.naturalWidth,nh=img.naturalHeight,ew=img.offsetWidth,eh=img.offsetHeight;if(!nw||!nh)return{left:0,top:0,width:ew,height:eh};const scale=Math.min(ew/nw,eh/nh);const w=nw*scale,h=nh*scale;return{left:(ew-w)/2,top:(eh-h)/2,width:w,height:h};}

    async function loadMediaTags(mediaId){try{const data=await api('media_tags',{media_id:mediaId});if(Number(state.lightboxMedia?.[state.lightboxIndex]?.id)!==Number(mediaId))return;state.lightboxTags=data.tags||[];renderMediaTagOverlays();renderMediaTagList();}catch(e){state.lightboxTags=[];renderMediaTagList();}}

    function tagType(tag){return (tag?.tag_type||'person')==='signature'?'signature':'person';}
    function tagTypeLabel(type){return type==='signature'?'signature':'identification';}
    function appendFaceSuggestionBox(canvas,rect,pct,index){
        const button=document.createElement('button');
        button.type='button';
        button.className='face-suggestion-box';
        button.textContent='Identifier';
        button.title='Identifier ce visage';
        button.style.left=(rect.left+pct.x*rect.width/100)+'px';
        button.style.top=(rect.top+pct.y*rect.height/100)+'px';
        button.style.width=(pct.w*rect.width/100)+'px';
        button.style.height=(pct.h*rect.height/100)+'px';
        button.dataset.faceIndex=String(index);
        button.addEventListener('click',event=>{
            event.preventDefault();
            event.stopPropagation();
            showTagPersonForm(pct,button,null,'person');
        });
        canvas.appendChild(button);
    }

    function renderMediaTagOverlays(){
        const canvas=$('#lightbox-tag-canvas'),img=$('#lightbox-image');
        if(!canvas||!img||img.hidden){if(canvas)canvas.innerHTML='';return;}
        canvas.classList.toggle('tags-hidden',!state.lightboxTagsVisible);
        const PAD=6;
        const updateBoxes=()=>{
            const rect=getImageContentRect(img);
            canvas.innerHTML='';
            state.lightboxTags.forEach(tag=>{
                const box=document.createElement('div');
                box.dataset.tagId=String(tag.id);
                box.dataset.personId=String(tag.person_id||'');
                const left=rect.left+tag.x*rect.width/100,top=rect.top+tag.y*rect.height/100,width=tag.w*rect.width/100,height=tag.h*rect.height/100;
                box.className='tag-box';
                box.style.left=(left-PAD)+'px';box.style.top=(top-PAD)+'px';box.style.width=(width+PAD*2)+'px';box.style.height=(height+PAD*2)+'px';
                const confClass={'certain':'tag-conf-certain','probable':'tag-conf-probable','possible':'tag-conf-possible','uncertain':'tag-conf-uncertain'}[tag.confidence]||'tag-conf-certain';
                box.classList.add(confClass,`tag-type-${tagType(tag)}`);
                const label=document.createElement('span');
                label.className='tag-label';
                label.textContent=(tag.first_name+' '+tag.last_name).trim()+(tag.confidence!=='certain'?' ('+confidenceLabel(tag.confidence)+')':'');
                box.appendChild(label);canvas.appendChild(box);
            });
            (state.lightboxFaceSuggestions||[]).forEach((pct,index)=>appendFaceSuggestionBox(canvas,rect,pct,index));
        };
        if(img.complete&&img.naturalWidth)updateBoxes();else img.addEventListener('load',updateBoxes,{once:true});
    }

    function renderTagListInto(selector,tags,emptyText){
        const list=$(selector);if(!list)return;
        if(!tags.length){list.innerHTML=`<p class="tag-list-empty">${emptyText}</p>`;return;}
        const personIconSvg='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>';
        list.innerHTML=tags.map(tag=>`<div class="tag-list-item${state.lightboxTagEditId===tag.id?' tag-list-item-editing':''}" data-tag-id="${tag.id}"><div class="tag-list-main"><span class="tag-list-name">${escapeHtml((tag.first_name+' '+tag.last_name).trim())}</span><span class="tag-conf-badge tag-conf-${tag.confidence}">${confidenceLabel(tag.confidence)}</span></div>${tag.note?`<div class="tag-list-note">${escapeHtml(tag.note)}</div>`:''}<button type="button" class="icon-button tag-view-btn" data-person-id="${tag.person_id}" title="Voir la fiche">${personIconSvg}</button><button type="button" class="icon-button tag-edit-btn" data-tag-id="${tag.id}" title="Modifier cette ${tagTypeLabel(tagType(tag))}">✎</button><button type="button" class="icon-button tag-delete-btn" data-tag-id="${tag.id}" title="Supprimer cette ${tagTypeLabel(tagType(tag))}">×</button></div>`).join('');
        list.querySelectorAll('.tag-delete-btn').forEach(btn=>btn.addEventListener('click',async(e)=>{e.stopPropagation();await deleteMediaTag(Number(btn.dataset.tagId));}));
        list.querySelectorAll('.tag-view-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const pid=Number(btn.dataset.personId);if(!pid)return;const lb=$('#lightbox');if(lb?.open)lb.close();state.currentPersonId=pid;setModule('personnes');}));
        const openEdit=tagId=>{const tag=state.lightboxTags.find(t=>Number(t.id)===Number(tagId));if(tag)showTagPersonForm(null,null,tag,tagType(tag));};
        list.querySelectorAll('.tag-edit-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openEdit(Number(btn.dataset.tagId));}));
        list.querySelectorAll('.tag-list-item').forEach(itemEl=>itemEl.addEventListener('click',()=>openEdit(Number(itemEl.dataset.tagId))));
    }

    function renderMediaTagList(){
        const persons=state.lightboxTags.filter(tag=>tagType(tag)==='person');
        const signatures=state.lightboxTags.filter(tag=>tagType(tag)==='signature');
        renderTagListInto('#lightbox-tags-list',persons,'Aucune identification.');
        renderTagListInto('#lightbox-signatures-list',signatures,'Aucune signature identifiée.');
    }

    function confidenceLabel(c){return{'certain':'Certain','probable':'Probable','possible':'Peut-être','uncertain':'Incertain'}[c]||c;}

    function enterTagMode(type='person'){const item=state.lightboxMedia[state.lightboxIndex];if(!item||normalizedMediaType(item)!=='image')return;resetLightboxZoom();state.lightboxTagMode=true;state.lightboxTagType=type==='signature'?'signature':'person';const figure=$('#lightbox figure');figure.classList.add('tag-mode');const canvas=$('#lightbox-tag-canvas');canvas.style.pointerEvents='all';canvas.style.cursor='crosshair';const personBtn=$('#lightbox-tag-toggle'),signatureBtn=$('#lightbox-signature-toggle');if(personBtn){personBtn.textContent=state.lightboxTagType==='person'?'✕ Annuler':'+ Identifier quelqu\'un';personBtn.classList.toggle('active',state.lightboxTagType==='person');}if(signatureBtn){signatureBtn.textContent=state.lightboxTagType==='signature'?'✕ Annuler':'+ Identifier une signature';signatureBtn.classList.toggle('active',state.lightboxTagType==='signature');}$('#lightbox-tag-hint')?.toggleAttribute('hidden',state.lightboxTagType!=='person');$('#lightbox-signature-hint')?.toggleAttribute('hidden',state.lightboxTagType!=='signature');const form=$('#lightbox-tag-form'),signatureForm=$('#lightbox-signature-form');if(form)form.hidden=true;if(signatureForm)signatureForm.hidden=true;bindTagCanvasDraw();}

    function exitTagMode(){state.lightboxTagMode=false;state.lightboxTagType='person';const figure=$('#lightbox figure');if(figure)figure.classList.remove('tag-mode');const canvas=$('#lightbox-tag-canvas');if(canvas){canvas.style.pointerEvents='none';canvas.style.cursor='';const drawing=canvas.querySelector('.tag-drawing');if(drawing)drawing.remove();}const personBtn=$('#lightbox-tag-toggle'),signatureBtn=$('#lightbox-signature-toggle');if(personBtn){personBtn.textContent='+ Identifier quelqu\'un';personBtn.classList.remove('active');}if(signatureBtn){signatureBtn.textContent='+ Identifier une signature';signatureBtn.classList.remove('active');}const form=$('#lightbox-tag-form'),signatureForm=$('#lightbox-signature-form');if(form)form.hidden=true;if(signatureForm)signatureForm.hidden=true;const hint=$('#lightbox-tag-hint'),signatureHint=$('#lightbox-signature-hint');if(hint)hint.hidden=true;if(signatureHint)signatureHint.hidden=true;}

    function bindTagCanvasDraw(){
        const canvas=$('#lightbox-tag-canvas');
        const img=$('#lightbox-image');
        if(!canvas||!img)return;
        if(canvas.dataset.tagDrawBound)return;
        canvas.dataset.tagDrawBound='1';
        let draw=null,drawEl=null;
        const onDown=event=>{
            if(!state.lightboxTagMode||event.button!==0)return;
            event.preventDefault();
            event.stopPropagation();
            const rect=getImageContentRect(img);
            const cr=canvas.getBoundingClientRect();
            const px=event.clientX-cr.left,py=event.clientY-cr.top;
            if(px<rect.left||py<rect.top||px>rect.left+rect.width||py>rect.top+rect.height)return;
            canvas.querySelectorAll('.tag-drawing').forEach(el=>el.remove());
            const form=$('#lightbox-tag-form'),signatureForm=$('#lightbox-signature-form');
            if(form)form.hidden=true;
            if(signatureForm)signatureForm.hidden=true;
            state.lightboxTagEditId=null;
            renderMediaTagList();
            draw={sx:px,sy:py,rect};
            drawEl=document.createElement('div');
            drawEl.className='tag-drawing';
            drawEl.style.cssText=`left:${px}px;top:${py}px;width:0;height:0`;
            canvas.appendChild(drawEl);
            canvas.setPointerCapture(event.pointerId);
        };
        const onMove=event=>{
            if(!draw||!drawEl)return;
            event.stopPropagation();
            const cr=canvas.getBoundingClientRect();
            const px=Math.min(Math.max(event.clientX-cr.left,draw.rect.left),draw.rect.left+draw.rect.width);
            const py=Math.min(Math.max(event.clientY-cr.top,draw.rect.top),draw.rect.top+draw.rect.height);
            const x=Math.min(draw.sx,px),y=Math.min(draw.sy,py);
            const w=Math.abs(px-draw.sx),h=Math.abs(py-draw.sy);
            drawEl.style.left=x+'px';
            drawEl.style.top=y+'px';
            drawEl.style.width=w+'px';
            drawEl.style.height=h+'px';
        };
        const onUp=event=>{
            if(!draw||!drawEl)return;
            event.stopPropagation();
            const cr=canvas.getBoundingClientRect();
            const px=Math.min(Math.max(event.clientX-cr.left,draw.rect.left),draw.rect.left+draw.rect.width);
            const py=Math.min(Math.max(event.clientY-cr.top,draw.rect.top),draw.rect.top+draw.rect.height);
            const w=Math.abs(px-draw.sx),h=Math.abs(py-draw.sy);
            const saved={draw,drawEl};
            draw=null;drawEl=null;
            if(w<8||h<8){saved.drawEl.remove();return;}
            const pct={x:(saved.draw.sx-saved.draw.rect.left)/saved.draw.rect.width*100,y:(saved.draw.sy-saved.draw.rect.top)/saved.draw.rect.height*100,w:w/saved.draw.rect.width*100,h:h/saved.draw.rect.height*100};
            showTagPersonForm(pct,saved.drawEl,null,state.lightboxTagType);
        };
        canvas.addEventListener('pointerdown',onDown);
        canvas.addEventListener('pointermove',onMove);
        canvas.addEventListener('pointerup',onUp);
    }

    function showTagPersonForm(pct,drawEl,existingTag=null,type='person'){type=existingTag?tagType(existingTag):(type==='signature'?'signature':'person');const form=$(type==='signature'?'#lightbox-signature-form':'#lightbox-tag-form');const otherForm=$(type==='signature'?'#lightbox-tag-form':'#lightbox-signature-form');if(!form)return;if(existingTag){exitTagMode();}if(otherForm){otherForm.hidden=true;otherForm.innerHTML='';}state.lightboxTagEditId=existingTag?existingTag.id:null;renderMediaTagList();if(existingTag){document.querySelectorAll('#lightbox-tag-canvas .tag-box').forEach(box=>{box.classList.toggle('tag-box-hover',Number(box.dataset.tagId)===existingTag.id);});}let searchCtrl=null;const initialName=existingTag?(existingTag.first_name+' '+existingTag.last_name).trim():'';const initialConf=existingTag?existingTag.confidence:'certain';const initialNote=existingTag?(existingTag.note||''):'';const title=type==='signature'?(existingTag?'Modifier cette signature':'À qui appartient cette signature ?'):(existingTag?'Modifier cette identification':'Qui apparaît dans la zone sélectionnée ?');const notePlaceholder=type==='signature'?'Ex : signature en bas à droite de l’acte':'Ex : 3e personne en partant de la gauche';form.innerHTML=`<div class="tag-form-inner"><div class="tag-form-hint">${title}</div><div class="tag-form-search-wrap" id="tag-person-search">${pkField({name:'tag_person_pick',kind:'person',value:existingTag?.person_id?{id:Number(existingTag.person_id),title:initialName,kind:'person'}:null})}</div><input type="hidden" id="tag-person-id" value="${existingTag?existingTag.person_id:''}"><label for="tag-confidence" style="margin-top:8px">Niveau de certitude</label><select id="tag-confidence" class="lightbox-input"><option value="certain">✓ Certain à 100 %</option><option value="probable">Certainement elle / lui</option><option value="possible">Peut-être elle / lui</option><option value="uncertain">Incertain</option></select><label for="tag-note" style="margin-top:8px">Note (optionnel)</label><input type="text" id="tag-note" class="lightbox-input" placeholder="${escapeHtml(notePlaceholder)}" value="${escapeHtml(initialNote)}"><div class="tag-form-actions"><button type="button" class="button small secondary" id="tag-form-cancel">Annuler</button><button type="button" class="button small" id="tag-form-confirm">Enregistrer</button></div></div>`;form.hidden=false;$('#tag-confidence').value=initialConf;const personIdInput=$('#tag-person-id');const tagPicker=$('#tag-person-search');pkBindQuickCreate(tagPicker);/* la personne : menu de choix unique */tagPicker.addEventListener('picker-change',event=>{const it=event.detail.item;personIdInput.value=it&&!it.free?it.id:'';});setTimeout(()=>tagPicker.querySelector('.pk-search:not([hidden]) .pk-input')?.focus(),30);function closeForm(){if(drawEl)drawEl.remove();form.hidden=true;state.lightboxTagEditId=null;document.querySelectorAll('#lightbox-tag-canvas .tag-box-hover').forEach(box=>box.classList.remove('tag-box-hover'));renderMediaTagList();}$('#tag-form-cancel').addEventListener('click',closeForm);$('#tag-form-confirm').addEventListener('click',async()=>{const personId=Number(personIdInput.value);if(!personId){toast('Choisis une personne.','error');return;}const confidence=$('#tag-confidence').value;const note=$('#tag-note').value.trim();if(existingTag){await updateMediaTag(existingTag.id,{personId,confidence,note,tag_type:type});}else{if(drawEl?.classList?.contains("face-suggestion-box")){const faceIndex=Number(drawEl.dataset.faceIndex);if(Number.isFinite(faceIndex))state.lightboxFaceSuggestions=(state.lightboxFaceSuggestions||[]).filter((_,index)=>index!==faceIndex);}await saveMediaTag({pct,personId,confidence,note,tag_type:type});}closeForm();if(!existingTag)exitTagMode();});}

    async function saveMediaTag({pct,personId,confidence,note,tag_type='person'}){const item=state.lightboxMedia[state.lightboxIndex];if(!item)return;try{await api('save_media_tag',{},{method:'POST',body:{media_id:item.id,person_id:personId,tag_type,x:pct.x,y:pct.y,w:pct.w,h:pct.h,confidence,note}});await loadMediaTags(item.id);toast(tag_type==='signature'?'Signature enregistrée.':'Identification enregistrée.');}catch(error){toast(error.message,'error');}}

    async function updateMediaTag(tagId,{personId,confidence,note,tag_type='person'}){const item=state.lightboxMedia[state.lightboxIndex];if(!item)return;try{await api('update_media_tag',{},{method:'POST',body:{tag_id:tagId,person_id:personId,tag_type,confidence,note}});await loadMediaTags(item.id);toast(tag_type==='signature'?'Signature modifiée.':'Identification modifiée.');}catch(error){toast(error.message,'error');}}

    async function deleteMediaTag(tagId){const tag=state.lightboxTags.find(item=>Number(item.id)===Number(tagId));const isSignature=tagType(tag)==='signature';if(!await confirmBox('',{title:`Supprimer cette ${isSignature?'signature':'identification'} ?`,okLabel:isSignature?'Supprimer la signature':'Supprimer l’identification'}))return;const item=state.lightboxMedia[state.lightboxIndex];if(!item)return;try{await api('delete_media_tag',{},{method:'POST',body:{tag_id:tagId}});await loadMediaTags(item.id);toast(isSignature?'Signature supprimée.':'Identification supprimée.');}catch(error){toast(error.message,'error');}}
    // ── Fin identification ──────────────────────────────────────────────────────

    function bindLightboxZoom(){const figure=$('#lightbox figure'),image=$('#lightbox-image');let drag=null;figure.addEventListener('wheel',event=>{if(image.hidden||state.lightboxTagMode)return;event.preventDefault();const previous=state.lightboxZoom;const factor=event.deltaY<0?1.16:.86;state.lightboxZoom=Math.max(1,Math.min(8,state.lightboxZoom*factor));if(state.lightboxZoom===1)state.lightboxPan={x:0,y:0};else if(previous===1){state.lightboxPan={x:0,y:0};}applyLightboxTransform();},{passive:false});figure.addEventListener('dblclick',()=>resetLightboxZoom());figure.addEventListener('pointerdown',event=>{if(image.hidden||state.lightboxTagMode||state.lightboxZoom<=1||event.target.closest('button,a,input,textarea,select'))return;drag={x:event.clientX,y:event.clientY,pan:{...state.lightboxPan}};figure.classList.add('is-panning');figure.setPointerCapture(event.pointerId);});figure.addEventListener('pointermove',event=>{if(!drag)return;state.lightboxPan={x:drag.pan.x+event.clientX-drag.x,y:drag.pan.y+event.clientY-drag.y};applyLightboxTransform();});figure.addEventListener('pointerup',()=>{drag=null;figure.classList.remove('is-panning');});figure.addEventListener('pointercancel',()=>{drag=null;figure.classList.remove('is-panning');});}
    function resetLightboxZoom(){state.lightboxZoom=1;state.lightboxPan={x:0,y:0};applyLightboxTransform();}
    function applyLightboxTransform(){const image=$('#lightbox-image');if(!image)return;image.style.transform=`translate(${state.lightboxPan.x}px,${state.lightboxPan.y}px) scale(${state.lightboxZoom})`;image.style.cursor=state.lightboxZoom>1?'grab':'zoom-in';const canvas=$('#lightbox-tag-canvas');if(canvas){canvas.style.transform=image.style.transform;}}
    function openStatsColorsDialog(){
        const colors=getStatsColors();
        const form=$('#stats-colors-form');
        for(let i=0;i<40;i++){const input=form.querySelector(`[name="color_${i}"]`);if(input)input.value=colors[i]||DEFAULT_STATS_COLORS[i%DEFAULT_STATS_COLORS.length];}
        const genderColors=getGenderColors();
        ['male','female','unknown'].forEach(key=>{
            const bgInput=form.querySelector(`[name="gender_${key}_bg"]`);if(bgInput)bgInput.value=genderColors[key].bg;
            const textInput=form.querySelector(`[name="gender_${key}_text"]`);if(textInput)textInput.value=genderColors[key].text;
        });
        const treeFields=getTreeCardFields();
        ['occupation','partners','living_status','marr','buri','bapt','id'].forEach(field=>{
            const input=form.querySelector(`[name="tree_field_${field}"]`);if(input)input.checked=!!treeFields[field];
        });
        const nameVariantsSelect=form.querySelector('[name="identity_name_variants_display"]');if(nameVariantsSelect)nameVariantsSelect.value=getIdentityNameVariantsDisplay();
        renderStatsColorPresetsList();
        $('#stats-colors-dialog').showModal();
    }
    function renderStatsColorPresetsList(){
        const presets=getStatsColorPresets();
        const container=$('#stats-colors-presets-list');
        if(!container)return;
        const rows=Object.entries(presets).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||'','fr'));
        if(!rows.length){container.innerHTML='<p class="muted" style="font-size:.85em;margin:.25rem 0 .5rem">Aucun design enregistré.</p>';return;}
        container.innerHTML=rows.map(([id,preset])=>{
            const swatches=(preset.colors||[]).slice(0,20).map(c=>`<span style="display:inline-block;width:13px;height:13px;border-radius:2px;background:${escapeHtml(c)};margin-right:2px;vertical-align:middle"></span>`).join('');
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.08)">
                <div style="flex:1;min-width:0"><strong style="font-size:.88em;display:block;margin-bottom:4px">${escapeHtml(preset.name||'Sans nom')}</strong><div>${swatches}</div></div>
                <button type="button" class="button small" data-apply-color-preset="${id}">Appliquer</button>
                <button type="button" class="button small secondary" data-delete-color-preset="${id}">Suppr.</button>
            </div>`;
        }).join('');
        $$('[data-apply-color-preset]',container).forEach(btn=>btn.addEventListener('click',()=>{
            const preset=getStatsColorPresets()[btn.dataset.applyColorPreset];
            if(!preset)return;
            const form=$('#stats-colors-form');
            (preset.colors||[]).forEach((c,i)=>{const input=form.querySelector(`[name="color_${i}"]`);if(input)input.value=c;});
            toast(`Palette « ${preset.name||'Sans nom'} » appliquée. Clique sur Enregistrer pour confirmer.`);
        }));
        $$('[data-delete-color-preset]',container).forEach(btn=>btn.addEventListener('click',async()=>{
            const presets=getStatsColorPresets();
            const preset=presets[btn.dataset.deleteColorPreset];
            if(!preset||!await confirmBox('',{title:`Supprimer la palette « ${preset.name||'Sans nom'} » ?`,okLabel:'Supprimer la palette'}))return;
            delete presets[btn.dataset.deleteColorPreset];
            saveStatsColorPresets(presets);
            renderStatsColorPresetsList();
            toast('Palette supprimée.');
        }));
    }
    function openBattueLevelColorsDialog(){
        const form=$('#battue-level-colors-form');
        if(!form)return;
        const colors=getBattueLevelColors();
        colors.forEach((color,index)=>{const input=form.querySelector(`[name="battue_level_${index}"]`);if(input)input.value=color;});
        renderBattueLevelColorPresetsList();
        $('#battue-level-colors-dialog')?.showModal();
    }
    function renderBattueLevelColorPresetsList(){
        const container=$('#battue-level-colors-presets-list');
        if(!container)return;
        const rows=Object.entries(getBattueLevelColorPresets()).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||'','fr'));
        if(!rows.length){container.innerHTML='<p class="muted" style="font-size:.85em;margin:.25rem 0 .5rem">Aucune palette enregistrée.</p>';return;}
        container.innerHTML=rows.map(([id,preset])=>{
            const swatches=(preset.colors||[]).slice(0,11).map(c=>`<span style="display:inline-block;width:14px;height:14px;border-radius:2px;background:${escapeHtml(c)};margin-right:3px;vertical-align:middle"></span>`).join('');
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.08)"><div style="flex:1;min-width:0"><strong style="font-size:.88em;display:block;margin-bottom:4px">${escapeHtml(preset.name||'Sans nom')}</strong><div>${swatches}</div></div><button type="button" class="button small" data-apply-battue-color-preset="${id}">Appliquer</button><button type="button" class="button small secondary" data-delete-battue-color-preset="${id}">Suppr.</button></div>`;
        }).join('');
        $$('[data-apply-battue-color-preset]',container).forEach(btn=>btn.addEventListener('click',()=>{
            const preset=getBattueLevelColorPresets()[btn.dataset.applyBattueColorPreset];
            if(!preset)return;
            const form=$('#battue-level-colors-form');
            (preset.colors||[]).forEach((color,index)=>{const input=form.querySelector(`[name="battue_level_${index}"]`);if(input)input.value=color;});
            toast(`Palette « ${preset.name||'Sans nom'} » appliquée. Clique sur Enregistrer pour confirmer.`);
        }));
        $$('[data-delete-battue-color-preset]',container).forEach(btn=>btn.addEventListener('click',async()=>{
            const presets=getBattueLevelColorPresets();
            const preset=presets[btn.dataset.deleteBattueColorPreset];
            if(!preset||!await confirmBox('',{title:`Supprimer la palette « ${preset.name||'Sans nom'} » ?`,okLabel:'Supprimer la palette'}))return;
            delete presets[btn.dataset.deleteBattueColorPreset];
            saveBattueLevelColorPresets(presets);
            renderBattueLevelColorPresetsList();
            toast('Palette supprimée.');
        }));
    }
    function openViewDialog(module,config,id=0,editName=''){
        const form=$('#view-form');
        form.reset();
        form.elements.module.value=module;
        form.elements.config.value=JSON.stringify(config);
        form.elements.view_id.value=id||'';
        if(editName)form.elements.name.value=editName;
        const isEdit=!!id;
        const saved=(state.bootstrap?.savedViews||[]).find(view=>Number(view.id)===Number(id));
        $('#view-dialog-title').textContent=isEdit?'Modifier cette vue':'Conserver cette vue';
        const colorsEl=$('#view-dialog-colors');
        const dialog=$('#view-dialog');
        if(isEdit&&module==='graph'){
            const isStats=config.mode==='stats'||config.mode==='distribution';
            if(isStats){
                const current=Array.isArray(config.statsColors)&&config.statsColors.length?config.statsColors:getStatsColors();
                colorsEl.innerHTML=`<hr style="border:none;border-top:1px solid var(--line-color);margin:1rem 20px 0"><div style="padding:0 20px 4px"><span class="eyebrow">PALETTE DES STATISTIQUES</span><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px 10px;margin-top:10px">${Array.from({length:40},(_,i)=>`<label style="display:flex;align-items:center;gap:4px;font-size:.78em"><span style="width:16px;text-align:right;color:var(--muted);flex-shrink:0">${i+1}</span><input type="color" name="vc_stats_${i}" value="${escapeHtml(current[i]||DEFAULT_STATS_COLORS[i%DEFAULT_STATS_COLORS.length])}" style="width:32px;height:26px;padding:1px 2px;border:2px solid var(--line-color);border-radius:3px;cursor:pointer;flex-shrink:0"></label>`).join('')}</div></div>`;
                dialog.classList.add('has-colors');
            }else{
                const gc=config.genderColors||getGenderColors();
                colorsEl.innerHTML=`<hr style="border:none;border-top:1px solid var(--line-color);margin:1rem 20px 0"><div style="padding:0 20px 4px"><span class="eyebrow">COULEURS DES FICHES</span><div style="display:grid;gap:8px;margin-top:10px"><div style="display:grid;grid-template-columns:110px 1fr 1fr;gap:8px;align-items:center"><span></span><span style="font-size:.78em;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Fond</span><span style="font-size:.78em;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Texte</span></div>${['male','female','unknown'].map((key,i)=>{const label=['Hommes','Femmes','Sexe inconnu'][i];return `<div style="display:grid;grid-template-columns:110px 1fr 1fr;gap:8px;align-items:center"><strong style="font-size:.84em">${label}</strong><input type="color" name="vc_gender_${key}_bg" value="${escapeHtml(gc[key]?.bg||DEFAULT_GENDER_COLORS[key].bg)}" style="width:100%;height:30px;padding:1px 2px;border:2px solid var(--line-color);border-radius:4px;cursor:pointer"><input type="color" name="vc_gender_${key}_text" value="${escapeHtml(gc[key]?.text||DEFAULT_GENDER_COLORS[key].text)}" style="width:100%;height:30px;padding:1px 2px;border:2px solid var(--line-color);border-radius:4px;cursor:pointer"></div>`;}).join('')}</div></div>`;
                dialog.classList.add('has-colors');
            }
        }else{
            colorsEl.innerHTML='';
            dialog.classList.remove('has-colors');
        }
        renderLabelPicker('#view-label-picker','view',id||0,saved?.labels||[]);
        dialog.showModal();
    }
    async function reloadBootstrap(){state.bootstrap=await api('bootstrap');state.csrf=state.bootstrap.csrf;}
    function errorState(message){return `<section class="empty-state"><span class="eyebrow">ERREUR</span><h2>${escapeHtml(message)}</h2><button class="button" onclick="location.reload()">Recharger</button></section>`;}

    function renderLabelPicker(containerSelector,entityType,entityId,currentLabels=[]){
        let container=$(containerSelector);
        if(!container){
            const pickerId=containerSelector.replace(/^#/,'');
            const dialogId=pickerId.replace('-label-picker','-dialog');
            const dialog=$(`#${dialogId}`);
            if(!dialog)return;
            const form=dialog.querySelector('form');
            if(!form)return;
            container=document.createElement('div');
            container.id=pickerId;
            const actions=form.querySelector('.modal-actions');
            if(actions)actions.parentNode.insertBefore(container,actions);
            else form.appendChild(container);
        }
        if(state.currentLabelsCache===null||state.currentLabelsCache===undefined){
            container.innerHTML='<p style="font-size:.85em;color:var(--muted)">Chargement des étiquettes…</p>';
            state.currentLabelsCache=false;
            api('labels').then(data=>{
                state.currentLabelsCache=data.labels||[];
                renderLabelPicker(containerSelector,entityType,entityId,currentLabels);
            }).catch(err=>{
                state.currentLabelsCache=null; // allow retry
                container.innerHTML=`<p style="font-size:.85em;color:var(--muted)">Erreur : ${escapeHtml(err.message)}</p>`;
            });
            return;
        }
        if(state.currentLabelsCache===false){
            return;
        }
        const allLabels=state.currentLabelsCache;
        const currentIds=new Set((currentLabels||[]).map(l=>Number(l.id)));
        container.innerHTML=labelPickerHtml(entityType,allLabels,currentIds);
        container.dataset.entityType=entityType;
        container.dataset.entityId=String(entityId||0);
        bindLabelPickerControls(container,containerSelector,entityType,entityId);
    }

    function labelPickerHtml(entityType,allLabels,currentIds){
        const labelsById=new Map((allLabels||[]).map(label=>[Number(label.id),label]));
        const selectedLabels=[...currentIds].map(id=>labelsById.get(Number(id))).filter(Boolean);
        const chips=selectedLabels.map(label=>{
            const color=label.color||'#0066cc';
            return `<span class="label-chip removable" data-label-picker-chip="${label.id}" style="--label-bg:${escapeHtml(color)};--label-fg:${escapeHtml(labelTextColor(color))}"><span>${escapeHtml(label.name||'Étiquette')}</span><button type="button" class="label-chip-remove" data-label-picker-remove="${label.id}" aria-label="Retirer l’étiquette ${escapeHtml(label.name||'')}" title="Retirer cette étiquette">&times;</button></span>`;
        }).join('');
        const search=allLabels?.length?`<div class="label-picker-search"><input type="text" class="labels-autocomplete-input" data-label-picker-search placeholder="Tape pour chercher une étiquette..." autocomplete="off"><div class="labels-suggestions" data-label-picker-suggestions hidden></div></div>`:'<p class="label-picker-empty">Aucune étiquette créée. Crée-la d’abord dans Maintenance → Étiquettes.</p>';
        return `<div class="label-picker-wrap"><div class="label-picker-selected">${chips||'<small class="label-field-empty">Aucune étiquette ajoutée.</small>'}</div>${search}<input type="hidden" name="label_ids_${escapeHtml(entityType)}" value="${[...currentIds].join(',')}"></div>`;
    }

    function selectedLabelIdsFromPicker(container){
        const input=container.querySelector('input[type=hidden]');
        return new Set((input?.value||'').split(',').filter(Boolean).map(Number));
    }

    function bindLabelPickerControls(container,containerSelector,entityType,entityId){
        const input=$('[data-label-picker-search]',container);
        if(input){
            const update=debounce(()=>renderLabelPickerSuggestions(container,containerSelector,entityType,entityId,input.value),150);
            input.addEventListener('input',update);
            input.addEventListener('focus',()=>renderLabelPickerSuggestions(container,containerSelector,entityType,entityId,input.value));
            input.addEventListener('keydown',event=>{
                if(event.key==='Escape')hideLabelPickerSuggestions(container);
            });
        }
        $$('[data-label-picker-remove]',container).forEach(button=>button.addEventListener('click',()=>{
            const selected=selectedLabelIdsFromPicker(container);
            selected.delete(Number(button.dataset.labelPickerRemove));
            renderLabelPicker(containerSelector,entityType,entityId,[...selected].map(id=>({id})));
        }));
    }

    function hideLabelPickerSuggestions(container){
        const box=$('[data-label-picker-suggestions]',container);
        if(box){box.hidden=true;box.innerHTML='';}
    }

    function renderLabelPickerSuggestions(container,containerSelector,entityType,entityId,query=''){
        const box=$('[data-label-picker-suggestions]',container);
        if(!box)return;
        const q=(query||'').trim().toLowerCase();
        const selected=selectedLabelIdsFromPicker(container);
        const matches=(state.currentLabelsCache||[])
            .filter(label=>!selected.has(Number(label.id))&&(!q||String(label.name||'').toLowerCase().includes(q)))
            .slice(0,8);
        box.innerHTML=matches.length?matches.map(label=>`<button type="button" class="labels-suggestion" data-label-picker-pick="${label.id}">${labelChip(label)}</button>`).join(''):'<div class="labels-suggestion-empty">Aucune étiquette existante trouvée.</div>';
        box.hidden=false;
        $$('[data-label-picker-pick]',box).forEach(button=>button.addEventListener('click',()=>{
            selected.add(Number(button.dataset.labelPickerPick));
            renderLabelPicker(containerSelector,entityType,entityId,[...selected].map(id=>({id})));
        }));
    }

    async function applyLabelPickerAfterSave(containerSelector,entityId,presetIds=null){
        const container=$(containerSelector);if(!container||!entityId)return;
        const entityType=container.dataset.entityType;if(!entityType)return;
        const input=container.querySelector('input[type=hidden]');if(!input)return;
        const ids=presetIds||(input.value||'').split(',').filter(Boolean).map(Number);
        try{const result=await api('set_label_links',{},{method:'POST',body:{entity_type:entityType,entity_id:entityId,label_ids:ids}});return result.result.labels||[];}catch(e){toast(e.message,'error');return null;}
    }

    // Outils partagés avec assets/js/heritage.js (chargé juste après ce fichier)
    // type de base changé (Listes → Animaux) : compteur, liste de gauche
    function refreshBaseMode(){loadPeople.modeSet=false;state.personTab='all';setCountStatus($('#database-status'),personCountLabel(state.bootstrap.stats.personnes));if(state.module==='personnes'){renderSidebar();loadPeople();}}
    window.LCNDA_APP={defaultListTypes,mapTileUrl,offlineTileUrl,openPersonById,battueTargetText,bindReminderButtons,investigationFolderPath,openBattueAliasDialog,openBattueDialog,openBattueLevelColorsDialog,openBattueMediaDialog,openBattueSearchDialog,openInvestigationDialog,openInvestigationItemDialog,openInvestigationItemEventDialog,openInvestigationMediaDialog,openInvestigationUploadDialog,bindWebSearchPanels,bindWebSearchSitesEditors,currentCustomTab,currentDashboardPage,dabovilleNumberFor,dashboardBaseType,dashboardGroupItem,dashboardLineageCard,dashboardNormalizeWidget,dashboardPages,dashboardRecentPeople,dashboardSaintCard,defaultDashboardBlockLimits,defaultDashboardBlockSpans,defaultDashboardBlocks,familyMemoryCardHtml,familyObjectCardHtml,fillLineageWidgets,generationLabel,mediaPreviewHtml,personBlockWidthChoices,personEventMap,readWebSearchSitesEditor,saveDashboardPages,sosaNumberFor,sosaNumbersText,webSearchPanelHtml,webSearchSitesEditor,archiveDigestOptionLabel,budgetCategories,budgetCategoryLabel,censusStatusText,confidenceLabel,courrierCopyFormatLabel,courrierCopyFormats,courrierFilters,courrierOrganismeLabel,courrierOrganismes,courrierStatutLabel,courrierStatuts,externalLinks,keepSosaOutsideClick,labelTextColor,lifeText,listControllerSignal,mediaChronologyKey,openListReorderDialog,openMediaDuplicatesDialog,openMediaFaceDetectionDialog,orderedListTypes,reminderCategories,reminderCategoryLabel,reminderIsPast,renderClosedBranchesList,renderFamilyMemoriesList,renderFamilyObjectsList,renderPrecisePlacesList,renewListController,renewSosaSearchController,saveExternalLinks,sosaRootId,sosaSearchSignal,syncCourrierCopyOrder,EVENT_ICON_GLYPHS,bengaliMonthDays,bengaliMonths,bengaliToJdn,bindLabelListToggles,bindReadingAids,burmeseYear,byzantineYear,calendarLabel,calendarYmdToJdn,confidenceText,copticMonths,copticToJdn,easterStyle,englishOldStyle,ethiopicMonths,ethiopicToJdn,eventIconOptionsHtml,formatCalendarDate,formatChineseLunar,formatFileSize,formatKoreanLunar,formatRepublicanDate,formatUmmAlQura,frenchMonthNames,hebrewDateFromJdn,hebrewLeap,hebrewMonthName,hebrewMonthNames,htrLanguageForModel,hypothesisStatus,indianMonthDays,indianMonths,indianToJdn,japaneseEras,jdnToBengali,jdnToCoptic,jdnToEthiopic,jdnToHebrew,jdnToIndian,jdnToIslamic,jdnToJapanese,jdnToJulian,jdnToPersian,jdnToRepublican,koreanLunarParts,labelChip,labelEntityTypesText,mayaLongCount,moduleHash,openSideReorderDialog,orderedMaintenanceTabs,persianMonthDays,persianMonths,persianToJdn,readingAidsHtml,renderDesignTools,renderExportTools,renderMergeTool,renderShortcutSettings,renderUpkeep,republicanLeap,republicanMonths,republicanToJdn,restoreDoneText,romanDate,saveLastRoute,sexagenaryName,thaiMonths,thaiYear,updateBrowserRoute,importUpload,inseeAuto,inseeImportRemote,inseeSize,mediaTypeShortLabel,mediaTypeShortLabelWithIcon,onOutsideClick,researchProximityFieldsHtml,setupDragOrder,typeGlyph,webSearchAllSites,webSearchContext,webSearchGroups,webSearchLifeRange,webSearchParams,webSearchSettings,DEFAULT_GENDER_COLORS,applyGenderColorsToDocument,ascendantsTreeHtml,bindGraphExportControls,defaultGraphStatsItems,descendantsTreeHtml,getStatsColors,getTreeCardFields,graphExportToolbarHtml,loadLineage,openStatsColorsDialog,relationYears,renderGraphStats,safeUrl,saveGenderColors,sosaMap,orderedMapTypes,applyDesign,mapBackgroundSelectHtml,mapRouteColor,isUsableMapCoord,routePeopleSelection,openViewDialog,readDesignSettings,reloadBootstrap,savedView,setupMapRoutePersonControls,setupMapSurnameAutocomplete,setupSavedViewsDrag,sideButton,bindTableLinks,summaryFromState,dataRow,genderText,placeDisplay,debounce,setModule,renderSidebar,normalizedMediaType,mediaCompareThumb,mediaCompareLinkInfo,fetchMediaCompareInfo,persistUiState,sidebarSignal:()=>sidebarController?.signal,loadOcrEngine,refreshBaseMode,baseMode,graphExportCss,safeExportFilename,customTabs,saveCustomTabs,openCustomScreen,orderedGraphDiagramItems,orderedGraphStatsItems,dashboardWidgetLabel,defaultPersonBlocks,formatCalendarByType,gregorianToJdn,jdnToGregorian,converterCalendarOptions,defaultCalendarValue,readDesignSettings,api,$,$$,escapeHtml,formObject,card,empty,toast,confirmBox,plural,emptyState,state,personName,years,personChip,mediaThumbHtml,parsedGenealogyDate,collectionPersonField,bindCollectionPersonFields,
        uploadCollectionFiles,bindTableLinks,actionButton,openLightbox,selectPerson,setModule,renderList,renderSidebar,lngToX,latToY,xToLng,yToLat,mapTileUrl,mapBackgroundValue,
        drawMap,renderMaintenance,renderLightboxItem,openArchiveRoom,journalierWageSols,entityLabelsField,bindEntityLabelsFields,renderFairsList,askText,appModules:modules,defaultListTypes,defaultMaintenanceTabs,syncCustomDashboardWidgets,renderDashboard,dashboardBlockSettings,saveDashboardBlockSettings,dashboardNewWidget,orderedDashboardWidgetTypes,dashboardWidgetInfo,tileLayerCategories:TILE_LAYER_CATEGORIES};

    // pour les raccourcis à soi des outils de modification (montage, son, retouche, mise en page) : même lecture des touches
    // et mêmes conflits (système, menu de l'application) que l'onglet Raccourcis clavier
    window.LCNDA_APP.shortcutKit={IS_MAC,platform:SHORTCUT_PLATFORM,platformName:IS_MAC?'macOS':SHORTCUT_PLATFORM==='win'?'Windows':'Linux',eventCombo,comboLabel,kbd,
        osConflict:shortcutOsConflict,osNote:c=>(OS_SHORTCUT_NOTES[SHORTCUT_PLATFORM]||{})[c]||'',hasMod:shortcutHasMod,isFKey:shortcutIsFKey,isTyping:isTypingTarget,
        // ce que l'app prend même quand un outil est ouvert : les raccourcis du menu de l'application (⌘/Ctrl ou F…) et ceux qui marchent partout
        appConflict:c=>SHORTCUT_DEFS.filter(d=>{const k=shortcutFor(d);return k&&k===c&&((d.menu&&!d.noTyping&&(shortcutHasMod(k)||shortcutIsFKey(k)))||d.ctx==='any');}).map(d=>d.label)};
    init();
})();
