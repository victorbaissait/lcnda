/* LCNDA — 🛠️ Réglages (sorti d'app.js, sans changement : app.js garde de petits relais qui l'appellent).
 * Pages des Réglages : branches, types d’événements, export, sauvegardes, convertisseur de calendriers… Les outils partagés (calendriers, raccourcis, apparence) restent dans app.js.
 */
(() => {
    'use strict';
    const {$, $$, actionButton, api, confirmBox, emptyState, plural, bengaliMonthDays, bengaliMonths, bengaliToJdn, bindLabelListToggles, bindReadingAids, bindTableLinks, burmeseYear, byzantineYear, calendarLabel, calendarYmdToJdn, confidenceText, converterCalendarOptions, copticMonths, copticToJdn, defaultCalendarValue, defaultMaintenanceTabs, easterStyle, empty, englishOldStyle, escapeHtml, ethiopicMonths, ethiopicToJdn, EVENT_ICON_GLYPHS, eventIconOptionsHtml, formatCalendarDate, formatChineseLunar, formatFileSize, formatKoreanLunar, formatRepublicanDate, formatUmmAlQura, formObject, frenchMonthNames, hebrewDateFromJdn, hebrewLeap, hebrewMonthName, hebrewMonthNames, htrLanguageForModel, hypothesisStatus, importUpload, indianMonthDays, indianMonths, indianToJdn, japaneseEras, jdnToBengali, jdnToCoptic, jdnToEthiopic, jdnToGregorian, jdnToHebrew, jdnToIndian, jdnToIslamic, jdnToJapanese, jdnToJulian, jdnToPersian, jdnToRepublican, journalierWageSols, koreanLunarParts, labelChip, labelEntityTypesText, loadOcrEngine, mayaLongCount, moduleHash, normalizedMediaType, openArchiveRoom, openSideReorderDialog, orderedMaintenanceTabs, persianMonthDays, persianMonths, persianToJdn, persistUiState, readDesignSettings, readingAidsHtml, reloadBootstrap, renderDesignTools, renderExportTools, renderMergeTool, renderShortcutSettings, renderSidebar, renderUpkeep, republicanLeap, republicanMonths, republicanToJdn, restoreDoneText, romanDate, saveLastRoute, setModule, sexagenaryName, sidebarSignal, sideButton, state, thaiMonths, thaiYear, toast, typeGlyph, updateBrowserRoute} = window.LCNDA_APP;
    /* ═════════ Les pages des Réglages rangées en groupes (Réordonner : groupes, ordre, ouverture) ═════════ */
    const MG_KEY = 'genealogie-maintenance-groups';
    const MG_DEFAULT = [['g_look', '🎨', 'Apparence et affichage', ['design', 'designs', 'design_board', 'design_sheets', 'design_maps', 'viewer_prefs', 'dna_prefs', 'diagram_kinds', 'raccourcis', 'accessibilite']], ['g_tools', '🛠️', 'Outils', ['montage_prefs', 'board_prefs', 'pet_prefs', 'atelier', 'htr']],
        ['g_build', '🧱', 'Construire (éditeurs)', ['block_editor', 'widget_editor', 'stats_editor', 'tabs_editor', 'my_lists']], ['g_quality', '🧹', 'Qualité des données', ['controle', 'duplicates', 'harmonize', 'controle_seuils', 'bulk', 'branches']],
        ['g_data', '📦', 'Données : import, export, sauvegarde', ['export', 'import', 'fusion', 'cousin_vault', 'scan_inbox', 'sync', 'safety', 'entretien', 'changes', 'meteo']], ['g_ref', '📚', 'Référentiels', ['labels', 'event_types', 'calendar_measures', 'help']], ['g_help', '❓', 'Aide', ['faq', 'infos']]];
    /* même rangement que Listes (app-sidegroups.js) : en groupes ou en une seule liste, chaque façon garde ses réglages */
    /* « Chercher un réglage… » trouve aussi une page par ce qu'elle contient (préférences, types de recherche, fonds de carte…) */
    const MAINT_KEYWORDS = {design: 'préférences réglages boutons en haut à droite barre du haut calculette mode consultation nouvelle fenêtre écran en deux mes généalogies types de recherche type de recherche ordre du menu onglets ordre des listes couleurs des badges messages après une action police couleur principale réglages enregistrés',
        design_maps: 'préférences fonds de carte fonds de cartes ordre des fonds boutons plan des adresses village carte par défaut ordre des cartes',
        design_board: 'préférences widgets bibliothèque', design_sheets: 'préférences blocs de la fiche en-tête boutons profils', raccourcis: 'touches clavier préférences',
        diagram_kinds: 'diagrammes graphiques types', accessibilite: 'préférences mode simple contraste animations', board_prefs: 'réglages des tableaux formes pointes couleurs', pet_prefs: 'réglages des animaux espèces formulaire', meteo: 'météo temps pluie température neige climat ciel normale stations pack'};
    const MO_KEY = 'genealogie-maintenance-order', mKeys = () => defaultMaintenanceTabs.map(t => t[0]);
    const MG = window.LCNDA_SIDEGROUPS({name: 'maintenance', panelTitle: 'Ordre des pages des Réglages', key: MG_KEY, defaults: MG_DEFAULT, allKeys: mKeys, label: k => defaultMaintenanceTabs.find(t => t[0] === k)?.[2] || k, defaultEnabled: true,
        flatOrder: () => { let o = []; try { o = JSON.parse(localStorage.getItem(MO_KEY) || '[]'); } catch (_) {} const d = mKeys(); o = Array.isArray(o) ? o.filter(k => d.includes(k)) : []; return [...o, ...d.filter(k => !o.includes(k))]; },
        setFlatOrder: keys => { try { localStorage.setItem(MO_KEY, JSON.stringify(keys)); } catch (_) {} }, flatDefaults: mKeys,
        current: () => state.maintenanceTab, eyebrow: 'RÉGLAGES', what: 'pages', searchPh: 'Chercher un réglage…', keywords: MAINT_KEYWORDS});
    function renderMaintenanceSidebar(content,footer){
        MG.render(content, sidebarSignal());
        content.addEventListener('click',async event=>{const item=event.target.closest('[data-side-value]');if(item){state.maintenanceTab=item.dataset.sideValue;persistUiState();const hash=moduleHash('maintenance');saveLastRoute(hash);updateBrowserRoute(hash,true,'maintenance');renderSidebar();await renderMaintenance();}},{signal:sidebarSignal()});
        footer.innerHTML=`<div class="dashboard-footer-actions"><button class="button small secondary" type="button" id="open-archive-room">Pièce d’archives</button><button class="button small secondary" type="button" id="maintenance-reorder" title="En groupes ou en une seule liste, l’ordre des pages, l’ouverture des groupes">Réordonner</button></div><span style="display:block;margin-top:9px">Les exceptions restent mémorisées.</span>`;
        $('#open-archive-room')?.addEventListener('click',openArchiveRoom,{signal:sidebarSignal()});
        $('#maintenance-reorder')?.addEventListener('click',openMaintenanceReorderDialog,{signal:sidebarSignal()});
    }
    /** Réglages → « Réordonner » : groupes ou une seule liste (case à cocher), les groupes (ranger, renommer, créer, effacer), l'ordre, l'ouverture. */
    function openMaintenanceReorderDialog(){ MG.openDialog(); }
    function hebrewMonthOrder(year){return [7,8,9,10,11,12,...(year&&!hebrewLeap(year)?[]:[13]),1,2,3,4,5,6];}
    const shortMonthsFr=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    function republicanMonthRange(year,month){
        const start=republicanToJdn(year,month,1),len=month===13?(republicanLeap(year)?6:5):30,end=start+len-1;
        return {start:jdnToGregorian(start),end:jdnToGregorian(end),len};
    }
    function rangeText(startJdn,len){return `du ${shortGregorian(jdnToGregorian(startJdn))} au ${shortGregorian(jdnToGregorian(startJdn+len-1))}`;}
    function shortGregorian(d,withYear=true){return `${d.day}${d.day===1?'er':''} ${shortMonthsFr[d.month-1]}${withYear?' '+d.year:''}`;}
    // Une date impossible (31 avril, 29 février d'une année ordinaire, Heisei 40…) ne doit pas glisser en silence au jour d'après
    function calendarRoundTrip(type,jdn,year,month,day,form){
        if(!jdn)return null;
        const same=d=>d&&d.year===year&&d.month===month&&d.day===day;
        const g=jdnToGregorian(jdn),j=jdnToJulian(jdn);
        const back={gregorian:()=>same(g),julian:()=>same(j),islamic:()=>same(jdnToIslamic(jdn)),republican:()=>same(jdnToRepublican(jdn)),hebrew:()=>same(jdnToHebrew(jdn)),
            ethiopic:()=>same(jdnToEthiopic(jdn)),indian:()=>same(jdnToIndian(jdn)),coptic:()=>same(jdnToCoptic(jdn)),bengali:()=>same(jdnToBengali(jdn)),persian:()=>same(jdnToPersian(jdn)),
            juche:()=>same({year:g.year-1911,month:g.month,day:g.day}),minguo:()=>same({year:g.year-1911,month:g.month,day:g.day}),korean:()=>same({year:g.year+2333,month:g.month,day:g.day}),
            thai:()=>same({year:thaiYear(g),month:g.month,day:g.day}),byzantine:()=>same({year:byzantineYear(j),month:j.month,day:j.day}),
            japanese:()=>{const jp=jdnToJapanese(jdn);return !!jp&&jp.era[0]===(form.elements.era?.value||'')&&same({year:jp.year,month:jp.month,day:jp.day});}}[type];
        return !back||back()?jdn:null;
    }
    function readCalendarJdn(form){
        const jdn=readCalendarJdnRaw(form),type=form.elements.calendar_type.value;
        if(!jdn||['korean_lunar','chinese'].includes(type))return jdn;
        return calendarRoundTrip(type,jdn,Number(form.elements.year.value),Number(form.elements.month.value),Number(form.elements.day.value),form);
    }
    function readCalendarJdnRaw(form){
        const type=form.elements.calendar_type.value;
        const year=Number(form.elements.year.value),month=Number(form.elements.month.value),day=Number(form.elements.day.value);
        return calendarYmdToJdn(type,year,month,day,{era:form.elements.era?.value||'',leap:!!form.elements.leap_month?.checked});
    }
    function calendarConversionCards(jdn){
        if(!jdn)return '<p class="muted">Entre une date complète pour convertir.</p>';
        const gregorian=jdnToGregorian(jdn),julian=jdnToJulian(jdn),islamic=jdnToIslamic(jdn),republican=jdnToRepublican(jdn);
        return `<div class="calendar-result-grid"><div class="calendar-result-card"><strong>Grégorien</strong>${formatCalendarDate(gregorian)}</div><div class="calendar-result-card"><strong>Julien</strong>${formatCalendarDate(julian)}</div><div class="calendar-result-card"><strong>Musulman civil</strong>${formatCalendarDate(islamic)}</div><div class="calendar-result-card"><strong>Républicain</strong>${formatRepublicanDate(republican)}${republican?(()=>{const r=republicanMonthRange(republican.year,republican.month);return `<small class="muted" style="display:block">${escapeHtml(republicanMonths[republican.month-1])} an ${republican.year} : du ${shortGregorian(r.start)} au ${shortGregorian(r.end)}</small>`;})():''}</div><div class="calendar-result-card"><strong>Juif</strong>${escapeHtml(hebrewDateFromJdn(jdn)||'Avant le début du calendrier')}</div>${otherCalendarCards(jdn)}</div>`;
    }
    function otherCalendarCards(jdn){
        const card=(title,main,small='')=>`<div class="calendar-result-card"><strong>${escapeHtml(title)}</strong>${escapeHtml(main)}${small?`<small class="muted" style="display:block">${escapeHtml(small)}</small>`:''}</div>`;
        const et=jdnToEthiopic(jdn),etStart=ethiopicToJdn(et.year,et.month,1),etLen=et.month===13?(et.year%4===3?6:5):30;
        const ind=jdnToIndian(jdn),indStart=indianToJdn(ind.year,ind.month,1);
        const jp=jdnToJapanese(jdn),g=jdnToGregorian(jdn);
        return card('Éthiopien',`${et.day} ${ethiopicMonths[et.month-1]} ${et.year}`,`${ethiopicMonths[et.month-1]} ${et.year} : ${rangeText(etStart,etLen)}`)
            +card('Indien (Saka)',`${ind.day} ${indianMonths[ind.month-1]} ${ind.year}`,`${indianMonths[ind.month-1]} ${ind.year} : ${rangeText(indStart,indianMonthDays(ind.year,ind.month))}`)
            +card('Japonais',jp?`${jp.day}${jp.day===1?'er':''} ${['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][jp.month-1]} de l’an ${jp.year===1?'1 (gannen)':jp.year} de l’ère ${jp.era[1]}`:'Avant 1873 : calendrier luni-solaire japonais (non calculé)',jp?`Même jour et même mois que le grégorien ; seule l’année change`:'')
            +card('Coréen',`Dangi ${g.year+2333} (année)`,formatKoreanLunar(jdn))
            +card('Chinois',formatChineseLunar(jdn))
            +(()=>{const b=jdnToBengali(jdn);return card('Bengali',`${b.day} ${bengaliMonths[b.month-1]} ${b.year}`,`${bengaliMonths[b.month-1]} ${b.year} : ${rangeText(bengaliToJdn(b.year,b.month,1),bengaliMonthDays(b.year,b.month))} (calendrier du Bangladesh)`);})()
            +(()=>{const pe=jdnToPersian(jdn);return card('Persan (hégirien solaire)',`${pe.day} ${persianMonths[pe.month-1]} ${pe.year}`,`${persianMonths[pe.month-1]} ${pe.year} : ${rangeText(persianToJdn(pe.year,pe.month,1),persianMonthDays(pe.year,pe.month))}`);})()
            +card('Juche',g.year>=1912?`Juche ${g.year-1911}`:'Avant l’an 1 (1912)',g.year>=1912?'Mois et jours grégoriens':'')
            +card('Thaï',`${g.day} ${thaiMonths[g.month-1]} ${thaiYear(g)} (ère bouddhiste)`,g.year<1889?'Avant 1889, la Thaïlande suivait un calendrier lunaire (seule l’année est donnée)':g.year<1941?'L’année commençait alors le 1er avril':'')
            +card('Birman',`Ère birmane ${burmeseYear(g)}`,'Calendrier luni-solaire : seule l’année est donnée ; le Nouvel An tombe vers le 17 avril, après Thingyan')
            +(()=>{const c=jdnToCoptic(jdn);return card('Copte',`${c.day} ${copticMonths[c.month-1]} ${c.year}`,`${copticMonths[c.month-1]} ${c.year} : ${rangeText(copticToJdn(c.year,c.month,1),c.month===13?(c.year%4===3?6:5):30)}`);})()
            +card('Hégirien Umm al-Qura',formatUmmAlQura(jdn),'Calendrier officiel saoudien (peut différer d’un jour du musulman civil)')
            +(()=>{const j=jdnToJulian(jdn);return card('Byzantin',`${j.day===1?"1er":j.day} ${frenchMonthNames[j.month-1]} ${byzantineYear(j)} (Anno Mundi)`,'Jours et mois juliens, année au 1er septembre (Russie jusqu’en 1700)');})()
            +card('Minguo (Taïwan)',g.year>=1912?`Minguo ${g.year-1911}`:'Avant l’an 1 (1912)',g.year>=1912?'Mois et jours grégoriens':'')
            +(()=>{const r=romanDate(jdn);return card('Romain',r.text,`${r.julianPeriod?'Date julienne':'Date grégorienne'} · Kal. = calendes, Non. = nones, Id. = ides, a.d. = « ante diem » (jour avant), prid. = la veille`);})()
            +(()=>{const e=englishOldStyle(jdn);return card('Angleterre, ancien style',e?e.text:'Nouveau style depuis le 14 septembre 1752',e?'Julien ; l’année commençait le 25 mars, d’où la double année de janvier au 24 mars':'');})()
            +(()=>{const e=easterStyle(jdn);return card('France, style de Pâques',e?e.text:'Année au 1er janvier depuis 1567',e?`Julien ; l’année commençait à Pâques (cette année-là : ${e.easter})`:'');})()
            +(()=>{const j=jdnToJulian(jdn);return card('Ère d’Espagne',`Ère ${j.year+38}`,'Espagne et Portugal médiévaux (jusqu’aux XIVe–XVe siècles)');})()
            +card('Compte long maya',mayaLongCount(jdn)||'—','Corrélation GMT (584283)')
            +(()=>{const k=koreanLunarParts(jdn,'chinese');return card('Bhoutanais (drukpa)',k?.year?`Année ${sexagenaryName(k.year)}`:'—','Calendrier luni-solaire : seule l’année est donnée (le Losar tombe près du Nouvel An chinois, parfois un mois plus tard)');})();
    }
    function convertUnitValue(value,from,to){
        const units={toise:{kind:'length',factor:1.949},pied:{kind:'length',factor:.32484},pouce:{kind:'length',factor:.02707},ligne:{kind:'length',factor:.002256},lieue:{kind:'length',factor:3898},arpent_area:{kind:'area',factor:3418.89},livre_weight:{kind:'weight',factor:.4895},once:{kind:'weight',factor:.03059},marc:{kind:'weight',factor:.24475}};
        if(!Number.isFinite(value)||!units[from]||!units[to]||units[from].kind!==units[to].kind)return null;
        return value*units[from].factor/units[to].factor;
    }
    function oldCurrencyTotalDeniers(values){
        const livres=Number(values.livres)||0,sols=Number(values.sols)||0,deniers=Number(values.deniers)||0,francs=Number(values.francs)||0;
        return Math.round((livres+francs)*240+sols*12+deniers);
    }
    function oldCurrencyBreakdown(total){
        const sign=total<0?'-':'';
        total=Math.abs(Number(total)||0);
        const livres=Math.floor(total/240);
        const sols=Math.floor((total%240)/12);
        const deniers=total%12;
        return `${sign}${livres} livre${livres>1?'s':''}, ${sols} sol${sols>1?'s':''}, ${deniers} denier${deniers>1?'s':''}`;
    }
    function purchasingPowerPanelHtml(){
        return `<section class="maintenance-panel purchasing-power"><h3>Pouvoir d’achat d’une somme ancienne</h3><form id="purchasing-power-form" class="form-grid" style="padding:0">
            <label>Montant<input name="amount" type="number" step="any" min="0" placeholder="300" required></label>
            <label>Monnaie<select name="unit"><option value="livre">livres tournois (ou francs)</option><option value="sol">sols / sous</option><option value="denier">deniers</option><option value="ecu">écus de 3 livres</option><option value="ecu6">écus de 6 livres</option><option value="louis">louis d’or (24 livres)</option><option value="nf">nouveaux francs (1960-2001)</option></select></label>
            <label>Année<input name="year" type="number" min="1550" max="2001" placeholder="1780" required></label>
            <label>Salaire d’une journée aujourd’hui<input data-unit="€" name="today" type="number" step="1" min="1" value="84"></label>
            <div class="page-actions" style="grid-column:1/-1"><button class="button small" type="submit">Calculer</button></div></form>
            <div id="purchasing-power-result" class="purchasing-power-result"></div>
            <p class="muted">Ordre de grandeur seulement. La somme est convertie en journées de travail d’un journalier de province (Paris : salaires plus élevés), puis en euros au salaire d’une journée d’aujourd’hui (84 € ≈ salaire minimum brut de 7 heures : à ajuster). Entre 1791 et 1797, les assignats perdent vite leur valeur. 1 franc de 1795 vaut à peu près 1 livre.</p></section>`;
    }
    function bindPurchasingPower(){
        $('#purchasing-power-form')?.addEventListener('submit',event=>{
            event.preventDefault();
            const v=formObject(event.currentTarget);const year=Math.round(Number(v.year));const amount=Number(v.amount);const today=Number(v.today)||84;
            if(!year||!(amount>=0))return;
            const perUnit={livre:20,sol:1,denier:1/12,ecu:60,ecu6:120,louis:480,nf:20*100}[v.unit]||20;
            let sols=amount*perUnit;
            // À partir de 1960, « francs » veut dire nouveaux francs (1 NF = 100 anciens francs)
            if(v.unit==='livre'&&year>=1960)sols*=100;
            const wage=journalierWageSols(year);const days=sols/wage;const workYears=days/250;
            const fmt=(n,d=0)=>Number(n).toLocaleString('fr-FR',{maximumFractionDigits:d});
            const wageText=year<1795?`${fmt(wage,1)} sols par jour`:(year<1960?`${fmt(wage/20,2)} francs par jour`:`${fmt(wage/2000,2)} nouveaux francs par jour`);
            const span=workYears>=1?`soit environ ${fmt(workYears,1)} année${workYears>=2?'s':''} de travail (250 jours par an)`:`soit environ ${fmt(days/25,1)} mois de travail`;
            $('#purchasing-power-result').innerHTML=`<strong>≈ ${fmt(days,days<10?1:0)} journées de travail d’un journalier</strong><span>${span}</span><span>≈ ${fmt(days*today)} € d’aujourd’hui au salaire d’une journée de ${fmt(today)} €</span><small>Salaire retenu en ${year} : ${wageText}${year>=1791&&year<=1797?' — attention : période des assignats':''}.</small>`;
        });
    }
    function renderCalendarMeasureTools(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='calendar_measures')return;
        const design=readDesignSettings();
        const defaultCalendar=defaultCalendarValue(design);
        const unitOptions=`<optgroup label="Longueurs"><option value="toise">Toise</option><option value="pied">Pied du roi</option><option value="pouce">Pouce</option><option value="ligne">Ligne</option><option value="lieue">Lieue de Paris</option></optgroup><optgroup label="Surfaces"><option value="arpent_area">Arpent carré</option></optgroup><optgroup label="Poids"><option value="livre_weight">Livre poids de marc</option><option value="once">Once</option><option value="marc">Marc</option></optgroup>`;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">CALENDRIER / MESURES</span><h2>Convertisseurs de recherche</h2><p>Conversions utiles pour les actes anciens, les pays passés tardivement au grégorien et les notes de transcription.</p></div></header>
        <div class="calendar-tools-grid">
            <section class="maintenance-panel"><h3>Calendrier par défaut</h3><div class="form-grid" style="padding:0;grid-template-columns:minmax(0,1fr)"><label>Calendrier utilisé par défaut dans les champs de date<select id="default-calendar-select">${converterCalendarOptions.map(([key,label])=>`<option value="${key}" ${defaultCalendar===key?'selected':''}>${label}</option>`).join('')}</select></label></div><p class="muted">Grégorien reste le plus courant en France. Julien est utile pour certains pays orthodoxes et certaines sources anciennes.</p></section>
            <section class="maintenance-panel"><h3>Convertir une date</h3><form id="calendar-converter-form" class="form-grid" style="padding:0"><label>Calendrier source<select name="calendar_type">${converterCalendarOptions.filter(([k])=>!['burmese','druk','umalqura','roman','english_os','easter_style','spanish_era','maya'].includes(k)).map(([key,label])=>`<option value="${key}" ${defaultCalendar===key?'selected':''}>${label}</option>`).join('')}</select></label><label data-calendar-era hidden>Ère<select name="era">${japaneseEras.map(([k,l,start])=>`<option value="${k}" ${k==='showa'?'selected':''}>${escapeHtml(l)} (depuis ${start[0]})</option>`).join('')}</select></label><label>Année<input name="year" type="number" placeholder="1793"></label><label class="checkbox-line" data-calendar-leap hidden><input type="checkbox" name="leap_month"> Mois intercalaire (lunaire)</label><label>Mois<span data-calendar-month-field></span></label><label>Jour<input name="day" type="number" min="1" max="31" placeholder="1"></label><button class="button span-2" type="submit">Convertir</button></form><div id="calendar-converter-result">${calendarConversionCards(null)}</div></section>
            <section class="maintenance-panel"><h3>Calendrier républicain</h3><ul class="calendar-info-list">${republicanMonths.map((month,index)=>{const r=republicanMonthRange(2,index+1);return `<li><strong>${escapeHtml(month)}</strong>${index<12?' · 30 jours':' · 5 ou 6 jours'} · ${r.start.month===r.end.month?shortMonthsFr[r.start.month-1]:`${shortMonthsFr[r.start.month-1]} à ${shortMonthsFr[r.end.month-1]}`} <small class="muted">(du ${shortGregorian(r.start,false)} au ${shortGregorian(r.end,false)})</small></li>`;}).join('')}</ul><p class="muted" style="font-size:.85em">Dates de l’an II (1793-1794) : selon l’année, le début et la fin peuvent glisser d’un jour (le convertisseur donne les dates exactes).</p><p>Le calendrier républicain commence le 22 septembre 1792 et cesse officiellement le 1er janvier 1806. Les douze mois font 30 jours. Les 5 jours complémentaires, ou 6 en année sextile, terminent l’année.</p></section>
            <section class="maintenance-panel"><h3>Unités anciennes</h3><form id="unit-converter-form" class="form-grid" style="padding:0"><label>Valeur<input name="value" type="number" step="any" placeholder="3"></label><label>De<select name="from">${unitOptions}</select></label><label>Vers<select name="to">${unitOptions}</select></label><button class="button" type="submit">Convertir</button></form><div id="unit-converter-result" class="unit-result">Entre une valeur et deux unités compatibles.</div></section>
            <section class="maintenance-panel"><h3>Monnaies anciennes</h3><form id="currency-converter-form" class="form-grid" style="padding:0"><label>Livres<input name="livres" type="number" step="1" placeholder="12"></label><label>Sols / sous<input name="sols" type="number" step="1" placeholder="10"></label><label>Deniers<input name="deniers" type="number" step="1" placeholder="6"></label><label>Francs germinal indicatifs<input name="francs" type="number" step="any" placeholder="0"></label><button class="button span-2" type="submit">Convertir</button></form><div id="currency-converter-result" class="unit-result">1 livre = 20 sols = 240 deniers. Le franc indiqué ici est une équivalence pratique, pas une valeur historique absolue.</div></section>
            ${purchasingPowerPanelHtml()}
            ${(window.LCNDA_EXT?.calendarPanels||[]).map(fn=>{try{return fn();}catch(error){console.error(error);return '';}}).join('')}
        </div></section>`;
        bindPurchasingPower();
        (window.LCNDA_EXT?.afterCalendar||[]).forEach(fn=>{try{fn();}catch(error){console.error(error);}});
        $('#default-calendar-select')?.addEventListener('change',event=>{const current=readDesignSettings();current.defaultCalendar=event.target.value;localStorage.setItem('genealogie-design',JSON.stringify(current));toast(`Calendrier par défaut : ${calendarLabel(event.target.value)}.`);});
        $('#calendar-converter-form')?.addEventListener('submit',event=>{event.preventDefault();const f=event.currentTarget,jdn=readCalendarJdn(f),filled=f.elements.year.value&&f.elements.month.value&&f.elements.day.value;$('#calendar-converter-result').innerHTML=!jdn&&filled?'<p class="h-offsite-sentence is-warn">Cette date n’existe pas dans ce calendrier (jour trop grand pour ce mois, année hors de l’ère choisie…).</p>':calendarConversionCards(jdn);});
        const converterForm=$('#calendar-converter-form');
        if(converterForm){
            // Mois : liste des noms pour les calendriers républicain et juif (avec la période grégorienne pour le républicain)
            const monthField=()=>{
                const holder=$('[data-calendar-month-field]',converterForm);if(!holder)return;
                const type=converterForm.elements.calendar_type.value,year=Number(converterForm.elements.year.value)||0,previous=converterForm.elements.month?.value||'';
                if(type==='republican'){
                    const y=year>=1&&year<=20?year:0;
                    holder.innerHTML=`<select name="month"><option value="">—</option>${republicanMonths.map((name,i)=>{const r=y?republicanMonthRange(y,i+1):null;return `<option value="${i+1}">${escapeHtml(name)}${r?` (${shortGregorian(r.start)} → ${shortGregorian(r.end)})`:''}</option>`;}).join('')}</select>`;
                }else if(type==='hebrew'){
                    holder.innerHTML=`<select name="month"><option value="">—</option>${hebrewMonthOrder(year).map(m=>`<option value="${m}">${escapeHtml(year?hebrewMonthName(m,year):(m===12?'Adar (Adar I)':hebrewMonthNames[m-1]))}</option>`).join('')}</select>`;
                }else if(type==='ethiopic'){
                    const y=year>0?year:0;
                    holder.innerHTML=`<select name="month"><option value="">—</option>${ethiopicMonths.map((name,i)=>{const len=i===12?(y%4===3?6:5):30;return `<option value="${i+1}">${escapeHtml(name)}${y?` (${rangeText(ethiopicToJdn(y,i+1,1),len).replace(/^du /,'').replace(' au ',' → ')})`:''}</option>`;}).join('')}</select>`;
                }else if(type==='indian'){
                    const y=year>0?year:0;
                    holder.innerHTML=`<select name="month"><option value="">—</option>${indianMonths.map((name,i)=>`<option value="${i+1}">${escapeHtml(name)}${y?` (${rangeText(indianToJdn(y,i+1,1),indianMonthDays(y,i+1)).replace(/^du /,'').replace(' au ',' → ')})`:''}</option>`).join('')}</select>`;
                }else if(type==='coptic'){
                    const y=year>0?year:0;
                    holder.innerHTML=`<select name="month"><option value="">—</option>${copticMonths.map((name,i)=>`<option value="${i+1}">${escapeHtml(name)}${y?` (${rangeText(copticToJdn(y,i+1,1),i===12?(y%4===3?6:5):30).replace(/^du /,'').replace(' au ',' → ')})`:''}</option>`).join('')}</select>`;
                }else if(type==='byzantine'){
                    holder.innerHTML=`<select name="month"><option value="">—</option>${frenchMonthNames.map((name,i)=>`<option value="${i+1}">${name} (julien)</option>`).join('')}</select>`;
                }else if(['bengali','persian','thai'].includes(type)){
                    const names={bengali:bengaliMonths,persian:persianMonths,thai:thaiMonths}[type],y=year>0?year:0;
                    const span=i=>type==='bengali'?rangeText(bengaliToJdn(y,i+1,1),bengaliMonthDays(y,i+1)):type==='persian'?rangeText(persianToJdn(y,i+1,1),persianMonthDays(y,i+1)):'';
                    holder.innerHTML=`<select name="month"><option value="">—</option>${names.map((name,i)=>{const r=y&&type!=='thai'?span(i):'';return `<option value="${i+1}">${escapeHtml(name)}${type==='thai'?` (${['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][i]})`:''}${r?` (${r.replace(/^du /,'').replace(' au ',' → ')})`:''}</option>`;}).join('')}</select>`;
                }else holder.innerHTML='<input name="month" type="number" min="1" max="12" placeholder="1">';
                $('[data-calendar-era]',converterForm).hidden=type!=='japanese';
                $('[data-calendar-leap]',converterForm).hidden=!['korean_lunar','chinese'].includes(type);
                const field=converterForm.elements.month;
                if(previous&&[...(field.options||[])].some(o=>o.value===previous))field.value=previous;else if(!field.options)field.value=previous;
            };
            converterForm.elements.calendar_type.addEventListener('change',()=>{converterForm.elements.month.value='';monthField();});
            converterForm.elements.year.addEventListener('change',monthField);
            monthField();
            converterForm.elements.year.placeholder=converterForm.elements.calendar_type.value==='hebrew'?'5600':converterForm.elements.calendar_type.value==='republican'?'2':'1793';
            converterForm.elements.calendar_type.addEventListener('change',()=>{const t=converterForm.elements.calendar_type.value;converterForm.elements.year.placeholder={hebrew:'5600',republican:'2',islamic:'1200',ethiopic:'1900',indian:'1800',japanese:'20',korean:'4280',korean_lunar:'1900',chinese:'1900',bengali:'1300',persian:'1300',juche:'30',thai:'2480',coptic:'1600',byzantine:'7200',minguo:'30'}[t]||'1793';});
        }
        $('#unit-converter-form')?.addEventListener('submit',event=>{event.preventDefault();const values=formObject(event.currentTarget),result=convertUnitValue(Number(values.value),values.from,values.to);$('#unit-converter-result').textContent=result===null?'Unités incompatibles ou valeur invalide.':`${Number(values.value).toLocaleString('fr-FR')} → ${result.toLocaleString('fr-FR',{maximumFractionDigits:4})}`;});
        $('#currency-converter-form')?.addEventListener('submit',event=>{event.preventDefault();const values=formObject(event.currentTarget),total=oldCurrencyTotalDeniers(values),francs=total/240;$('#currency-converter-result').textContent=`${oldCurrencyBreakdown(total)} · ${plural(total,'denier')} · environ ${francs.toLocaleString('fr-FR',{maximumFractionDigits:2})} ${francs<2?'franc germinal indicatif':'francs germinal indicatifs'}.`;});
    }
    function renderSoftwareInfos(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='infos')return;
        $('#workspace').innerHTML=`<section class="page software-info-page"><header class="page-header"><div><span class="eyebrow">INFOS</span><h2>À propos du logiciel</h2><p class="software-credit">Pensé et designé par Victor Baissait. Codé par Codex (ChatGPT) et Claude, sous la supervision de Victor Baissait.</p></div></header>
        <div class="software-info-grid">
            <article class="maintenance-panel"><h3>Objectif</h3><p>Ce logiciel sert à construire une généalogie locale, documentée et exploitable : fiches personnes, événements, médias, sources, notes, enquêtes, battues, cartes et statistiques sont regroupés dans un même outil.</p></article>
            <article class="maintenance-panel"><h3>Fiches personnes</h3><p>Chaque fiche rassemble l’identité, les relations familiales, les événements, les médias, les recensements, les sources, les notes, les signatures, les enquêtes liées et les exports. Les blocs peuvent être réorganisés, masqués et adaptés en largeur.</p></article>
            <article class="maintenance-panel"><h3>Recherche et enquêtes</h3><p>Les modules de recherche aident à retrouver des personnes, des dates, des lieux, des transcriptions OCR/HTR, des pistes et des noms de lieux partiellement lisibles. Les enquêtes et battues permettent de suivre le travail commune par commune, source par source.</p></article>
            <article class="maintenance-panel"><h3>Médias et transcriptions</h3><p>Les images, actes, cartes postales et documents peuvent être rattachés aux personnes, événements, enquêtes ou battues. Les zones de personnes et de signatures peuvent être identifiées, comparées et enrichies par OCR ou reconnaissance manuscrite si les modèles sont installés.</p></article>
            <article class="maintenance-panel"><h3>Cartes, chronologie et statistiques</h3><p>Le logiciel affiche les lieux, les migrations, les itinéraires, les cartes de battue et les frises personnelles. Les graphiques et statistiques aident à lire les âges, métiers, prénoms, décès, SOSA, branches et tendances de la base.</p></article>
            <article class="maintenance-panel"><h3>Données géographiques</h3><p>Les communes françaises, leurs contours et leurs voisinages, ainsi que les villes du monde proposées à la saisie d’un lieu, sont livrés avec le logiciel :</p><ul><li>Communes, lieux-dits et villes du monde : <a href="https://www.geonames.org" target="_blank" rel="noopener">GeoNames</a>, licence <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener">Creative Commons Attribution 4.0 (CC BY 4.0)</a>.</li><li>Contours des communes : IGN, Admin Express, via <a href="https://github.com/gregoiredavid/france-geojson" target="_blank" rel="noopener">france-geojson</a>, <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noopener">Licence Ouverte 2.0 (Etalab)</a>.</li><li>Communes de Belgique : IGN-NGI (Institut géographique national belge), licence ouverte, via <a href="https://www.odwb.be/" target="_blank" rel="noopener">ODWB</a>.</li><li>Communes de Suisse et du Liechtenstein : swissBOUNDARIES3D © <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">swisstopo</a> (Opendata BY).</li><li>Communes du Luxembourg : Administration du cadastre et de la topographie, <a href="https://data.public.lu/" target="_blank" rel="noopener">data.public.lu</a> (CC0).</li><li>Communes d’Allemagne : VG250 © <a href="https://gdz.bkg.bund.de/" target="_blank" rel="noopener">GeoBasis-DE / BKG</a> (dl-de/by-2-0).</li><li>Communes d’Italie : confini amministrativi © <a href="https://www.istat.it/" target="_blank" rel="noopener">ISTAT</a> (CC BY 4.0).</li><li>Communes d’Autriche : © <a href="https://data.statistik.gv.at/" target="_blank" rel="noopener">Statistik Austria</a> (CC BY 4.0).</li><li>Communes d’Espagne : © <a href="https://www.ign.es/" target="_blank" rel="noopener">Instituto Geográfico Nacional</a> – CNIG (CC BY 4.0).</li><li>Communes de Tchéquie : RÚIAN © <a href="https://cuzk.gov.cz/" target="_blank" rel="noopener">ČÚZK</a> (CC BY 4.0) ; de Slovaquie : ZBGIS © <a href="https://www.geoportal.sk/" target="_blank" rel="noopener">ÚGKK SR</a> (CC BY 4.0) ; de Pologne : PRG © <a href="https://www.geoportal.gov.pl/" target="_blank" rel="noopener">GUGiK</a> ; des Pays-Bas : © <a href="https://www.pdok.nl/" target="_blank" rel="noopener">Kadaster / PDOK</a> (CC BY 4.0) ; de Slovénie : © <a href="https://www.e-prostor.gov.si/" target="_blank" rel="noopener">GURS</a> (CC BY 4.0) ; de Hongrie : © <a href="https://lechnerkozpont.hu/" target="_blank" rel="noopener">Lechner Tudásközpont</a> ; du Québec : © <a href="https://www.donneesquebec.ca/" target="_blank" rel="noopener">Gouvernement du Québec</a> (CC BY 4.0).</li><li>Comtés des États-Unis : <a href="https://www.census.gov/" target="_blank" rel="noopener">U.S. Census Bureau</a> (domaine public) ; paroisses d’Angleterre et du pays de Galles : © <a href="https://geoportal.statistics.gov.uk/" target="_blank" rel="noopener">ONS</a>, contient des données OS © Crown copyright (OGL v3) ; paroisses civiles d’Écosse : © <a href="https://www.nrscotland.gov.uk/" target="_blank" rel="noopener">National Records of Scotland</a> (OGL v3) ; paroisses civiles d’Irlande : © <a href="https://tailte.ie/" target="_blank" rel="noopener">Tailte Éireann</a> (CC BY 4.0) ; communes de Finlande : © <a href="https://stat.fi/" target="_blank" rel="noopener">Statistics Finland</a> (CC BY 4.0) ; collectivités locales d’Australie : © <a href="https://www.abs.gov.au/" target="_blank" rel="noopener">Australian Bureau of Statistics</a> (CC BY 4.0).</li><li>Communes des autres pays (Portugal, Croatie, Bosnie-Herzégovine, micro-États, pays baltes et nordiques, Balkans, Roumanie, Bulgarie, Grèce, Turquie, Caucase, Ukraine, Biélorussie, Maghreb, Liban, Jordanie, reste du Canada, Mexique, Amérique centrale, Nouvelle-Zélande, Nouvelle-Calédonie, Polynésie…) : © les contributeurs d’<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, données sous licence <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener">ODbL 1.0</a>. Même licence pour les communes d’Amérique du Sud, du Moyen-Orient, d’Asie et d’une partie de l’Afrique.</li><li>Communes d’une partie de l’Afrique (Sénégal, Burkina Faso, Côte d’Ivoire, Nigeria, Madagascar, Tanzanie, Afrique du Sud…), de Taïwan, des Caraïbes et du Pacifique (Cuba, Haïti, République dominicaine, Jamaïque, Fidji, Samoa, Tonga…) et contours des petits territoires (Aruba, Curaçao, Bermudes, Gibraltar, Jersey, Guernesey, île de Man, Féroé, Malouines…) : <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a> (William &amp; Mary geoLab), d’après leurs sources (gouvernements, OCHA, Banque mondiale, GRID3…), licences ouvertes indiquées pays par pays dans le fichier de chaque pays (domaine public, CC BY, CC BY IGO, ODbL, CC BY-SA pour le Togo et Taïwan).</li></ul><p>N’importe quel autre lieu peut être saisi librement.</p></article>
                        <article class="maintenance-panel"><h3>Pictogrammes des tableaux</h3><p>Une grande partie des formes des tableaux (animaux, métiers, maison, transports, météo, santé…) vient de <a href="https://pictogrammers.com/library/mdi/" target="_blank" rel="noopener">Material Design Icons</a> (Pictogrammers), licence <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener">Apache 2.0</a> ; noms traduits en français. Les autres formes sont dessinées pour l’application.</p></article>
                        <article class="maintenance-panel"><h3>Réglages et export</h3><p>Les Réglages regroupent les imports, exports, sauvegardes, réglages d’apparence, listes, calendriers, mesures anciennes, journal des modifications, restauration de suppressions et outils de contrôle. Le travail reste pensé pour une utilisation locale, sans service distant obligatoire.</p></article>
        </div></section>`;
    }
    async function renderMaintenance(token=++state.workspaceToken){
        if(window.LCNDA_EXT?.maintenance?.[state.maintenanceTab])return window.LCNDA_EXT.maintenance[state.maintenanceTab](token);
        if(state.maintenanceTab==='entretien')return renderUpkeep(token);
        if(state.maintenanceTab==='fusion')return renderMergeTool(token);
        if(state.maintenanceTab==='raccourcis')return renderShortcutSettings(token);
        if(state.maintenanceTab==='duplicates')return renderDuplicates(token);if(state.maintenanceTab==='branches')return renderBranches(token);if(state.maintenanceTab==='bulk')return renderBulk(token);if(state.maintenanceTab==='changes')return renderChanges(token);if(state.maintenanceTab==='repair'){state.maintenanceTab='import';return renderImportTools(token);}if(state.maintenanceTab==='export')return renderExportTools(token);if(state.maintenanceTab==='import')return renderImportTools(token);if(state.maintenanceTab==='safety')return renderDataSafetyTools(token);if(state.maintenanceTab==='labels')return renderLabelTools(token);if(state.maintenanceTab==='event_types')return renderEventTypes(token);if(state.maintenanceTab==='calendar_measures')return renderCalendarMeasureTools(token);if(state.maintenanceTab==='help'||state.maintenanceTab==='faq')return renderHelpGlossary(token);if(state.maintenanceTab==='infos')return renderSoftwareInfos(token);return renderDesignTools(token);
    }
    // « Incohérences avancées » : fondu dans « ✅ Contrôle de la base » (heritage-controle.js, lib/controle.php) ; « Supprimer les familles vides » est dans Entretien.
    async function renderDuplicates(token=++state.workspaceToken){const data=await api('duplicate_candidates');if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='duplicates')return;$('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow"></span><h2>Fusion de doublons</h2><p><b class="ui-ph-count">${plural(data.candidates.length,'doublon possible','doublons possibles')}</b> · Le site propose seulement des candidats. La fusion déplace les données vers la fiche gardée puis supprime l’autre fiche.</p></div></header><div class="issue-list">${data.candidates.map(row=>`<article class="issue warning"><span class="issue-mark">≈</span><div><h3>${escapeHtml(row.first1+' '+row.last1)} ↔ ${escapeHtml(row.first2+' '+row.last2)}</h3><p>Score ${row.score}/110 · Naissances : ${row.birth1||'?'} / ${row.birth2||'?'} · Décès : ${row.death1||'?'} / ${row.death2||'?'}</p></div><div class="page-actions"><button class="button small secondary" data-open-person="${row.id1}">Voir A</button><button class="button small secondary" data-open-person="${row.id2}">Voir B</button><button class="button small" data-merge-target="${row.id1}" data-merge-source="${row.id2}">Fusionner B → A</button><button class="button small" data-merge-target="${row.id2}" data-merge-source="${row.id1}">Fusionner A → B</button></div></article>`).join('')||empty('Aucun doublon évident trouvé.',{icon:'✅'})}</div></section>`;bindTableLinks();$$('[data-merge-target]').forEach(button=>button.addEventListener('click',async()=>{if(!await confirmBox('La fiche source sera supprimée après déplacement des événements, médias, sources, notes, enquêtes, preuves, hypothèses et relations.',{title:`Fusionner la fiche #${button.dataset.mergeSource} dans la fiche #${button.dataset.mergeTarget} ?`,okLabel:'Fusionner',danger:true}))return;await api('merge_people',{}, {method:'POST',body:{target_id:button.dataset.mergeTarget,source_id:button.dataset.mergeSource}});toast('Fusion effectuée.');await renderDuplicates();}));(window.LCNDA_EXT?.afterDuplicates||[]).forEach(fn=>{try{fn(data);}catch(error){console.error(error);}});}
    async function renderHypothesesMaintenance(token=++state.workspaceToken){const data=await api('hypotheses');if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='hypotheses')return;$('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow"></span><h2>Hypothèses</h2><p><b class="ui-ph-count">${plural(data.hypotheses.length,'hypothèse')}</b> · Identités incertaines, filiations supposées, lieux ou dates à confirmer. « ⚖️ Comparer » met les réponses côte à côte, avec les preuves pour et contre, puis la conclusion met la fiche à jour.</p></div></header><div class="investigation-grid">${data.hypotheses.map(item=>`<article class="investigation-card"><div><span class="ui-badge investigation-status ${item.status}">${hypothesisStatus(item.status)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.statement||'Sans argument détaillé.')}</p><small>${escapeHtml(item.person_name)}${item.related_name?` · lié à ${escapeHtml(item.related_name)}`:''} · confiance ${confidenceText(item.confidence)}</small><small class="h-hc-sumline"><span data-hcomp-sum="${item.id}" data-hcomp-pid="all"></span></small></div><div class="page-actions"><button class="button small" data-hcomp-open="${item.id}">⚖️ Comparer</button><button class="button small secondary" data-open-person="${item.person_id}">Ouvrir</button></div></article>`).join('')||emptyState({text: 'Aucune hypothèse pour l’instant', icon:'💡',hint:'Les hypothèses s’ajoutent depuis la fiche d’une personne.'})}</div></section>`;bindTableLinks();}
    async function renderBranches(token=++state.workspaceToken){
        const data=await api('branches');if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='branches')return;
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow"></span><h2>Branches</h2><p><b class="ui-ph-count">${plural(data.branches.length,'branche')}</b> · Une branche sert à isoler une lignée ou un dossier de travail : Dupont du Cher, branche Martin, piste incertaine, etc.</p></div></header>
        <form class="maintenance-panel" id="branch-form"><h3>Créer / modifier une branche</h3><input type="hidden" name="id"><div class="form-grid" style="padding:0"><label>Nom<input name="name" required placeholder="Branche Dupont — Saint-Amand"></label><label>Personne racine ID<input name="root_person_id" inputmode="numeric" placeholder="${state.currentPersonId||''}"></label><label>Couleur<input type="color" name="color" value="#0066cc"></label><label class="span-2">Description<textarea name="description" rows="3" placeholder="Pourquoi cette branche existe, ce qu’elle contient, ce qui reste à vérifier…"></textarea></label></div><div class="page-actions"><button class="button" type="submit">Enregistrer la branche</button><button class="button secondary" type="button" id="branch-current">Utiliser la personne affichée</button><button class="button secondary" type="reset">Vider</button></div></form>
        <div class="branch-grid">${data.branches.map(branch=>`<article class="branch-card" style="--branch-color:${escapeHtml(branch.color||'#0066cc')}"><span></span><div><h3>${escapeHtml(branch.name)}</h3><p>${escapeHtml(branch.description||'Aucune description.')}</p><small>Racine : ${escapeHtml(branch.root_name||'non définie')} · ${plural(Number(branch.people_count||0),'personne')}</small></div><div class="page-actions"><button class="button small secondary" data-edit-branch="${branch.id}">Modifier</button>${branch.root_person_id?`<button class="button small secondary" data-open-person="${branch.root_person_id}">Ouvrir racine</button>`:''}${actionButton('delete','Supprimer',`data-delete-branch="${branch.id}"`)}</div></article>`).join('')||emptyState({text: 'Aucune branche pour l’instant', icon:'🌿',action:{label:'＋ Nouvelle branche',attrs:'data-empty-focus="#branch-form [name=name]"'}})}</div></section>`;
        const form=$('#branch-form');$('#branch-current').addEventListener('click',()=>{form.elements.root_person_id.value=state.currentPersonId||'';});
        form.addEventListener('submit',async event=>{event.preventDefault();await api('save_branch',{}, {method:'POST',body:formObject(form)});toast('Branche enregistrée.');await renderBranches();});
        $$('[data-edit-branch]').forEach(button=>button.addEventListener('click',()=>{const branch=data.branches.find(item=>Number(item.id)===Number(button.dataset.editBranch));if(!branch)return;form.elements.id.value=branch.id;form.elements.name.value=branch.name||'';form.elements.root_person_id.value=branch.root_person_id||'';form.elements.color.value=branch.color||'#0066cc';form.elements.description.value=branch.description||'';form.scrollIntoView({behavior:'smooth',block:'start'});}));
        $$('[data-delete-branch]').forEach(button=>button.addEventListener('click',async()=>{/* H7 : supprimée tout de suite (les personnes restent), « ↶ Annuler » la remet avec ses membres */const id=Number(button.dataset.deleteBranch);await window.LCNDA_APP.deleteWithUndo({action:'delete_branch',body:{id},type:'branch',id,message:'Branche supprimée',after:async()=>{if(state.module!=='maintenance'||state.maintenanceTab!=='branches')return;try{await renderBranches();}catch(error){console.error(error);}}});}));
        bindTableLinks();
    }
    function renderBulk(token=++state.workspaceToken){if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='bulk')return;$('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">CORRECTION EN MASSE</span><h2>Patronymes</h2><p>Rattache un nom à une famille normalisée ou corrige réellement plusieurs fiches. En cas de correction, l’ancien nom est automatiquement conservé comme variante historique.</p></div></header><form class="maintenance-panel" id="bulk-form"><h3>Traiter un patronyme</h3><div class="form-grid" style="padding:0"><label>Nom exact à trouver<input name="match" required placeholder="Dupond"></label><label>Groupe ou nom corrigé<input name="group" required placeholder="Dupont"></label><label class="span-2" style="display:flex;grid-template-columns:auto 1fr;align-items:center"><input type="checkbox" name="replace_written"> Corriger aussi le nom inscrit sur toutes les fiches concernées</label></div><p>Sans cette option, « Dupond » reste affiché mais rejoint le groupe « Dupont ». Avec l’option, le nom devient « Dupont » et « Dupond » est archivé comme ancienne variante.</p><button class="button" type="submit">Prévisualiser puis appliquer</button></form></section><section class="page" style="margin-top:1.5rem"><header class="page-header"><div><span class="eyebrow">RECONNAISSANCE PAR LOT</span><h2>OCR / HTR sur plusieurs documents</h2><p>Sélectionne plusieurs documents images et lance la reconnaissance de texte en une seule fois, plutôt que d’ouvrir chaque document un par un. Comme pour la reconnaissance individuelle, le texte détecté est toujours <strong>ajouté à la fin</strong> de la transcription existante de chaque document, jamais en remplacement, puis enregistré automatiquement. Uniquement disponible pour les images (pas pour les PDF).</p></div></header><div class="maintenance-panel" id="ocr-batch-panel"><h3>1. Choisir les documents</h3><div class="form-grid" style="padding:0"><label>Recherche (titre, nom de fichier, cote…)<input type="text" id="ocr-batch-search" placeholder="Ex : acte, Dupont, 1875…"></label><label class="ui-toggle span-2" style="display:flex;grid-template-columns:auto 1fr;align-items:center"><input type="checkbox" id="ocr-batch-only-empty" checked><i></i>Afficher seulement les documents sans transcription</label></div><div class="page-actions" style="padding:0 0 .8rem;flex-wrap:wrap"><button class="button small secondary" type="button" id="ocr-batch-load">Charger les documents</button><button class="button small secondary" type="button" id="ocr-batch-select-all" disabled>Tout sélectionner</button><button class="button small secondary" type="button" id="ocr-batch-select-none" disabled>Tout désélectionner</button></div><div id="ocr-batch-list" style="max-height:420px;overflow:auto;border:1px solid var(--border,#ddd);border-radius:8px;padding:.4rem"></div><h3>2. Choisir le moteur</h3><div class="form-grid" style="padding:0"><label class="span-2" style="display:flex;gap:1.5rem;align-items:center;grid-template-columns:none"><span class="checkbox-line"><input type="radio" name="ocr-batch-engine" value="ocr" id="ocr-batch-engine-ocr" checked> 🔎 OCR (texte tapuscrit, dans le navigateur)</span><span class="checkbox-line"><input type="radio" name="ocr-batch-engine" value="htr" id="ocr-batch-engine-htr"> ✍ HTR (texte manuscrit, service local)</span></label><label>Langue (HTR)<select id="ocr-batch-language" class="lightbox-input compact"><option value="fra">Français</option><option value="eng">Anglais</option><option value="lat">Latin</option><option value="spa">Espagnol</option><option value="deu">Allemand</option><option value="nld">Néerlandais</option><option value="por">Portugais</option><option value="pol">Polonais</option><option value="rus">Russe</option><option value="dan">Danois</option><option value="swe">Suédois</option><option value="fin">Finlandais</option><option value="nor">Norvégien</option><option value="srp">Serbe</option><option value="hrv">Croate</option><option value="ces">Tchèque</option><option value="slk">Slovaque</option><option value="ron">Roumain</option><option value="ukr">Ukrainien</option><option value="yid">Yiddish</option></select></label><label>Modèle (HTR)<select id="ocr-batch-model" class="lightbox-input compact"><option value="fr-actes">Français · manuscrit généalogique</option><option value="en-handwritten">Anglais · handwritten</option><option value="latin-medieval">Latin / médiéval · ancien</option><option value="spanish-historical">Espagnol · historique</option><option value="german-19">Allemand · registres XIXe</option><option value="dutch-experimental">Néerlandais · expérimental</option><option value="portuguese-16-19">Portugais · XVIe-XIXe</option><option value="polish-experimental">Polonais · expérimental</option><option value="russian-cyrillic">Russe / cyrillique · ancien</option><option value="danish-old-norse">Danois · nordique ancien</option><option value="swedish-old-norse">Suédois · nordique ancien</option><option value="finnish-experimental">Finlandais · expérimental</option><option value="norwegian-old-norse">Norvégien · nordique ancien</option><option value="serbian-cyrillic-old">Serbe · cyrillique ancien</option><option value="croatian-experimental">Croate · expérimental</option><option value="czech-bohemia-19">Tchèque · Bohême XIXe</option><option value="slovak-experimental">Slovaque · expérimental</option><option value="romanian-experimental">Roumain · expérimental</option><option value="ukrainian-cyrillic-old">Ukrainien · cyrillique ancien</option><option value="yiddish-hebrew-script">Yiddish · alphabet hébreu à installer</option></select></label></div><div class="page-actions" style="padding:0 0 .8rem"><button class="button" type="button" id="ocr-batch-run" disabled>Lancer sur 0 document sélectionné</button></div><div id="ocr-batch-progress" hidden><p id="ocr-batch-progress-text"></p><div id="ocr-batch-log" style="max-height:260px;overflow:auto;font-size:.85rem"></div></div></div></section>`;initOcrBatchPanel();$('#bulk-form').addEventListener('submit',async event=>{event.preventDefault();const values=formObject(event.currentTarget);const preview=await api('bulk_preview',{match:values.match});if(!preview.count){toast('Aucune personne ne porte exactement ce nom.','error');return;}const action=values.replace_written?'corriger le nom inscrit en conservant une variante':'rattacher au groupe';if(!await confirmBox(`${Number(preview.count)<2?`${plural(preview.count,'personne')} sera concernée`:`${plural(preview.count,'personne')} seront concernées`}. Confirmer pour ${action} ?`,{title:'Corriger en masse ?',okLabel:'Confirmer',danger:false}))return;const result=await api('bulk_group',{}, {method:'POST',body:values});toast(result.result.renamed?`${plural(result.result.count,'nom corrigé','noms corrigés')} et ${Number(result.result.count)<2?'ancien nom conservé':'anciens noms conservés'}.`:`${Number(result.result.count)<2?`${plural(result.result.count,'personne')} rattachée`:`${plural(result.result.count,'personne')} rattachées`} au groupe.`);});}
    function initOcrBatchPanel(){
        const list=$('#ocr-batch-list'),loadBtn=$('#ocr-batch-load'),selectAllBtn=$('#ocr-batch-select-all'),selectNoneBtn=$('#ocr-batch-select-none'),runBtn=$('#ocr-batch-run'),searchInput=$('#ocr-batch-search'),onlyEmptyInput=$('#ocr-batch-only-empty'),progressWrap=$('#ocr-batch-progress'),progressText=$('#ocr-batch-progress-text'),logEl=$('#ocr-batch-log');
        if(!list||!loadBtn||!runBtn)return;
        const ensureSelectOptions=(select,options)=>{
            if(!select)return;
            const existing=new Set([...select.options].map(option=>option.value));
            options.forEach(([value,label])=>{
                if(existing.has(value))return;
                const option=document.createElement('option');
                option.value=value;
                option.textContent=label;
                select.append(option);
            });
        };
        const ocrLanguageOptions=[['fra','Français'],['eng','Anglais'],['spa','Espagnol'],['deu','Allemand'],['ita','Italien'],['nld','Néerlandais'],['por','Portugais'],['pol','Polonais'],['dan','Danois'],['nor','Norvégien'],['swe','Suédois'],['fin','Finlandais'],['ces','Tchèque'],['hun','Hongrois'],['slk','Slovaque'],['est','Estonien'],['lav','Letton'],['lit','Lituanien'],['gle','Irlandais'],['hrv','Croate'],['ell','Grec'],['yid','Yiddish']];
        const htrLanguageOptions=[['ita','Italien'],['hun','Hongrois'],['est','Estonien'],['lav','Letton'],['lit','Lituanien'],['gle','Irlandais'],['ell','Grec']];
        const htrModelOptions=[['italian-medieval','Italien · médiéval / ancien'],['hungarian-experimental','Hongrois · expérimental'],['estonian-experimental','Estonien · expérimental'],['latvian-experimental','Letton · expérimental'],['lithuanian-experimental','Lituanien · expérimental'],['irish-experimental','Irlandais · expérimental'],['greek-historical','Grec · modèle à installer']];
        const htrLanguageSelect=$('#ocr-batch-language');
        if(htrLanguageSelect&&!$('#ocr-batch-ocr-language')){
            htrLanguageSelect.closest('label')?.insertAdjacentHTML('beforebegin',`<label>Langue (OCR)<select id="ocr-batch-ocr-language" class="lightbox-input compact">${ocrLanguageOptions.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>`);
        }
        if(htrLanguageSelect?.closest('label'))htrLanguageSelect.closest('label').hidden=true;
        ensureSelectOptions(htrLanguageSelect,htrLanguageOptions);
        ensureSelectOptions($('#ocr-batch-model'),htrModelOptions);
        let batchItems=[];
        const itemLabel=item=>item.title||item.filename||('Document #'+item.id);
        function selectedItems(){return batchItems.filter(item=>item.__checked);}
        function updateRunButton(){const count=selectedItems().length;runBtn.disabled=count===0;runBtn.textContent=`Lancer sur ${plural(count,'document sélectionné','documents sélectionnés')}`;}
        function renderList(){
            if(!batchItems.length){list.innerHTML=empty('Aucun document trouvé pour ces critères.',{icon:'📄'});selectAllBtn.disabled=true;selectNoneBtn.disabled=true;updateRunButton();return;}
            selectAllBtn.disabled=false;selectNoneBtn.disabled=false;
            list.innerHTML=batchItems.map(item=>`<label class="checkbox-line" style="align-items:flex-start;padding:.35rem 0;border-bottom:1px solid var(--border,#eee)"><input type="checkbox" data-ocr-batch-check="${item.id}" ${item.__checked?'checked':''}><span style="display:flex;gap:.6rem;align-items:center;flex:1"><span style="width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:#f2f2f2">${item.thumbnail?`<img src="media/${encodeURIComponent(item.thumbnail)}" alt="" style="width:100%;height:100%;object-fit:cover">`:'▣'}</span><span><strong>${escapeHtml(itemLabel(item))}</strong><br><small>${item.transcription?'Transcription existante — le texte sera ajouté à la suite':'Aucune transcription pour l’instant'}</small></span></span></label>`).join('');
            $$('[data-ocr-batch-check]',list).forEach(input=>input.addEventListener('change',event=>{
                const id=Number(event.currentTarget.dataset.ocrBatchCheck);
                const item=batchItems.find(row=>Number(row.id)===id);
                if(item)item.__checked=event.currentTarget.checked;
                updateRunButton();
            }));
            updateRunButton();
        }
        async function loadItems(){
            loadBtn.disabled=true;loadBtn.textContent='Chargement…';
            try{
                const q=searchInput.value.trim();
                const data=await api('list',{type:'media',q,limit:150});
                const onlyEmpty=onlyEmptyInput.checked;
                const previousChecked=new Set(selectedItems().map(item=>Number(item.id)));
                batchItems=(data.rows||[]).filter(row=>normalizedMediaType(row)==='image').filter(row=>!onlyEmpty||!row.transcription).map(row=>({...row,__checked:previousChecked.has(Number(row.id))}));
                renderList();
            }catch(error){
                toast(error.message,'error');
            }finally{
                loadBtn.disabled=false;loadBtn.textContent='Charger les documents';
            }
        }
        loadBtn.addEventListener('click',loadItems);
        selectAllBtn.addEventListener('click',()=>{batchItems.forEach(item=>item.__checked=true);renderList();});
        selectNoneBtn.addEventListener('click',()=>{batchItems.forEach(item=>item.__checked=false);renderList();});
        runBtn.addEventListener('click',async()=>{
            const items=selectedItems();
            if(!items.length)return;
            const engine=$('input[name="ocr-batch-engine"]:checked')?.value||'ocr';
            const ocrLanguage=$('#ocr-batch-ocr-language')?.value||'fra';
            const model=$('#ocr-batch-model')?.value||'fr-actes';
            const language=htrLanguageForModel(model);
            const modelLabel=$('#ocr-batch-model')?.selectedOptions?.[0]?.textContent||model;
            if(!await confirmBox('Le texte détecté sera ajouté à la fin de chaque transcription existante, puis chaque document sera enregistré automatiquement au fur et à mesure.',{title:`Lancer la reconnaissance ${engine==='htr'?'HTR (manuscrit)':'OCR (tapuscrit)'} sur ${plural(items.length,'document')} ?`,okLabel:'Lancer la reconnaissance',danger:false}))return;
            runBtn.disabled=true;loadBtn.disabled=true;selectAllBtn.disabled=true;selectNoneBtn.disabled=true;
            progressWrap.hidden=false;logEl.innerHTML='';
            let done=0,errors=0,Tesseract=null;
            if(engine==='ocr'){
                progressText.textContent='Chargement du moteur OCR…';
                try{Tesseract=await loadOcrEngine();}catch(error){
                    toast(error.message||'Échec du chargement du moteur OCR.','error');
                    progressText.textContent=error.message||'Échec du chargement du moteur OCR.';
                    runBtn.disabled=false;loadBtn.disabled=false;selectAllBtn.disabled=false;selectNoneBtn.disabled=false;
                    return;
                }
            }
            for(const item of items){
                progressText.textContent=`Traitement ${done+1} / ${items.length} — ${itemLabel(item)}`;
                const logLine=document.createElement('div');
                logLine.textContent=`⏳ ${itemLabel(item)}…`;
                logEl.append(logLine);
                logEl.scrollTop=logEl.scrollHeight;
                try{
                    if(normalizedMediaType(item)!=='image')throw new Error('reconnaissance disponible uniquement sur les images');
                    let recognized='';
                    if(engine==='ocr'){
                        const imgSrc=`media/${encodeURIComponent(item.filename)}`;
                        const result=await Tesseract.recognize(imgSrc,ocrLanguage);
                        recognized=(result?.data?.text||'').trim();
                    }else{
                        const data=await api('htr_recognize',{}, {method:'POST',body:{media_id:item.id,model,language}});
                        recognized=(data?.result?.text||'').trim();
                    }
                    if(!recognized){
                        logLine.textContent=`— ${itemLabel(item)} : aucun texte détecté.`;
                    }else{
                        const current=item.transcription||'';
                        const separator=current.trim()?`\n\n— Texte détecté par ${engine==='htr'?`HTR (${modelLabel}, à relire)`:'OCR (à relire)'} —\n`:'';
                        const transcription=current+separator+recognized;
                        await api('save_media_transcription',{}, {method:'POST',body:{media_id:item.id,transcription}});
                        item.transcription=transcription;
                        logLine.textContent=`✓ ${itemLabel(item)} : texte ajouté (${plural(recognized.length,'caractère')}), enregistré.`;
                    }
                }catch(error){
                    errors++;
                    logLine.textContent=`✗ ${itemLabel(item)} : ${error.message||'échec de la reconnaissance'}.`;
                }
                done++;
                logEl.scrollTop=logEl.scrollHeight;
            }
            progressText.textContent=`Terminé : ${plural(done,'document traité','documents traités')}${errors?`, ${plural(errors,'erreur')}`:''}.`;
            toast(errors?`${plural(done-errors,'document traité','documents traités')}, ${plural(errors,'erreur')}.`:`${plural(done,'document traité','documents traités')} avec succès.`, errors?'error':'');
            runBtn.disabled=false;loadBtn.disabled=false;selectAllBtn.disabled=false;selectNoneBtn.disabled=false;
            renderList();
        });
        updateRunButton();
    }
    async function renderChanges(token=++state.workspaceToken){
        const data=await api('changes');
        if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='changes')return;
        const allActions=[...new Set(data.changes.map(row=>row.action).filter(Boolean))];
        let activeFilter=state.changesFilter||'all';
        const bindRestoreButtons=()=>{
            $$('[data-restore-change]').forEach(button=>button.addEventListener('click',async()=>{
                if(!await confirmBox('L’élément supprimé sera remis dans la base.',{title:'Restaurer cette suppression ?',okLabel:'Restaurer',danger:false}))return;
                button.disabled=true;
                try{
                    const restored=await api('restore_change',{}, {method:'POST',body:{id:button.dataset.restoreChange}});
                    toast(restoreDoneText(restored));
                    await renderChanges();
                }catch(error){
                    button.disabled=false;
                    toast(error.message,'error');
                }
            }));
        };
        // C6 : « N modifications · Trier : [menu] » et « Voir les 50 suivantes ↓ »
        let changeSort='recent',changeShown=50,changeBar=null,changeMore=null;
        const renderList=()=>{
            let filtered=activeFilter==='all'?data.changes:data.changes.filter(row=>row.action===activeFilter);
            if(changeSort==='old')filtered=[...filtered].reverse();
            const UI=window.LCNDA_UI,list=$('#change-list');
            if(UI?.sortBar&&!changeBar){changeBar=UI.sortBar({count:filtered.length,label:'modification',feminine:true,value:changeSort,options:[['recent','Les plus récentes'],['old','Les plus anciennes']],onChange:v=>{changeSort=v;changeShown=50;renderList();}});list.before(changeBar);}
            if(UI?.moreButton&&!changeMore){changeMore=UI.moreButton({remaining:0,step:50,feminine:true,onClick:()=>{changeShown+=50;renderList();}});list.after(changeMore);}
            changeBar?.setCount(filtered.length);changeMore?.update(filtered.length-changeShown);
            if(changeMore)filtered=filtered.slice(0,changeShown);
            list.innerHTML=filtered.map(row=>{
                const label=row.entity_label||`${row.entity_type} #${row.entity_id||'—'}`;
                const technical=`${row.entity_type} #${row.entity_id||'—'} · ${row.action}`;
                const restoreButton=row.restore_available
                    ? `<button class="button small secondary" data-restore-change="${row.id}">Restaurer</button>`
                    : row.restore_blocked
                        ? `<button class="button small secondary is-disabled" disabled title="${escapeHtml(row.restore_block_reason||'Restauration bloquée')}">Restaurer</button>`
                        : '';
                return `<article class="change-card change-card-framed">${window.LCNDA_UI?.when?.(row.created_at)||`<time>${escapeHtml(row.created_at)}</time>`}<div class="item-title-row"><div><h3>${escapeHtml(row.summary||row.action)}</h3><p><strong>${escapeHtml(label)}</strong> · ${escapeHtml(technical)}</p>${row.changed_fields?.length?`<small>Champs modifiés : ${escapeHtml(row.changed_fields.slice(0,8).join(', '))}${row.changed_fields.length>8?'…':''}</small>`:''}${row.restore_blocked?`<small class="cell-muted">${escapeHtml(row.restore_block_reason||'Restauration bloquée')}</small>`:''}</div>${restoreButton}</div></article>`;
            }).join('')||empty('Aucune modification pour ce filtre.',{icon:'🕘'});
            bindRestoreButtons();
        };
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">TRAÇABILITÉ</span><h2>Modifications</h2><p>Les modifications effectuées depuis ce site sont enregistrées ici.</p></div></header><div class="change-filter-bar"><button class="button small${activeFilter==='all'?' is-active':''}" data-change-filter="all">Tous</button>${allActions.map(action=>`<button class="button small${activeFilter===action?' is-active':''}" data-change-filter="${escapeHtml(action)}">${escapeHtml(action)}</button>`).join('')}</div><div class="change-timeline" id="change-list"></div></section>`;
        renderList();
        bindTableLinks();
        $$('[data-change-filter]').forEach(btn=>btn.addEventListener('click',()=>{
            activeFilter=btn.dataset.changeFilter;changeShown=50;
            state.changesFilter=activeFilter;
            $$('[data-change-filter]').forEach(b=>b.classList.toggle('is-active',b===btn));
            renderList();
        }));
    }

    async function renderEventTypes(token=++state.workspaceToken){
        const data=await api('event_types_admin');
        if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='event_types')return;

        // Trier alphabétiquement (déjà fait côté serveur, on garde l'ordre)
        const types=data.event_types||[];

        const scopeLabel=s=>s==='family'?'Famille':'Personne';
        const usageBadge=n=>n>0?`<span class="event-type-usage">${Number(n).toLocaleString('fr-FR')} evt</span>`:`<span class="event-type-usage is-zero">0 evt</span>`;

        const rows=types.map(t=>`<tr class="event-type-row">
          <td><span class="event-icon" style="--event-color:${escapeHtml(t.color||'#0066cc')}">${typeGlyph(t.icon,t.gedcom_tag)}</span></td>
          <td><strong class="event-type-label">${escapeHtml(t.label)}</strong></td>
          <td>${escapeHtml(scopeLabel(t.scope))}</td>
          <td>${escapeHtml(t.gedcom_tag||'—')}</td>
          <td><input type="color" class="event-type-color-input" data-color-event-type="${t.id}" value="${escapeHtml(t.color||'#0066cc')}" title="Changer la couleur" aria-label="Couleur de « ${escapeHtml(t.label)} »"></td>
          <td><select class="event-type-icon-select" data-icon-event-type="${t.id}" title="Changer le pictogramme" aria-label="Pictogramme de « ${escapeHtml(t.label)} »">${eventIconOptionsHtml(t.icon)}</select></td>
          <td><label class="event-type-artistic-check" title="Lier au mode Artiste : masqué pour les personnes non artistes"><input type="checkbox" class="event-type-artistic-cb" data-artistic-event-type="${t.id}" ${Number(t.is_artistic)?'checked':''} aria-label="Artistique"> Artiste</label></td>
          <td>${Number(t.is_artistic)?`<input type="text" class="event-type-fields-input" data-fields-event-type="${t.id}" value="${escapeHtml((()=>{try{return (JSON.parse(t.custom_fields||'[]')||[]).join(', ');}catch(_){return '';}})())}" placeholder="Dimensions, Technique…" title="Champs spécifiques à l'œuvre, séparés par des virgules">`:'<span class="muted" style="font-size:.8em">—</span>'}</td>
          <td>${usageBadge(t.usage_count)}</td>
          <td class="event-type-actions">
            <button class="button small secondary" data-edit-event-type="${t.id}">Renommer</button>
            ${Number(t.usage_count)===0?`<button class="button small danger" data-delete-event-type="${t.id}" data-label="${escapeHtml(t.label)}">Supprimer</button>`:`<span class="muted" style="font-size:.8em">En usage</span>`}
          </td>
        </tr>`).join('');

        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow"></span><h2>Types d’événements</h2><p><b class="ui-ph-count">${plural(types.length,'type')}</b> · Modifier les noms, couleurs et pictogrammes, ajouter de nouveaux types ou supprimer ceux qui ne sont rattachés à aucun événement. Classés par ordre alphabétique. Les types « Artiste » peuvent avoir des champs spécifiques (dimensions, durée…) qui n'apparaissent que pour ce type d'œuvre.</p></div></header>

<section class="create-type-panel">
  <h3>Créer un type</h3>
  <form id="event-type-admin-form" class="create-type-form">
    <label class="name-field">Nom<input name="label" required placeholder="Jugement de naissance…" autocomplete="off"></label>
    <label>Portée<select name="scope"><option value="person">Personne</option><option value="family">Famille</option></select></label>
    <label>Couleur<input type="color" name="color" value="#0066cc"></label>
    <div class="create-type-last-group"><span class="create-type-field-label">Pictogramme</span><div style="display:flex;align-items:center;gap:10px"><select name="icon" style="flex:1;min-width:0">${eventIconOptionsHtml('diamond')}</select><label class="checkbox-line create-type-artistic-inline" style="margin:0;white-space:nowrap;flex-shrink:0"><input type="checkbox" name="is_artistic" value="1" id="create-type-is-artistic"> Artiste</label><button class="button" type="submit" style="padding:9px 22px;flex-shrink:0">Créer le type</button></div></div>
    <label class="span-2" id="create-type-fields-wrap" hidden>Champs spécifiques à l'œuvre (séparés par des virgules)<input name="custom_fields" placeholder="ex. Dimensions, Technique, Lieu de conservation" autocomplete="off"></label>
  </form>
</section>

<section class="maintenance-panel full-width" style="padding:0;overflow:hidden;margin-top:1.5rem">
  <div class="data-table-wrap"><table class="data-table" id="event-types-table">
    <colgroup><col style="width:48px"><col style="min-width:160px;width:auto"><col style="width:90px"><col style="width:100px"><col style="width:60px"><col style="width:220px"><col style="width:90px"><col style="width:200px"><col style="width:80px"><col style="width:210px"></colgroup>
    <thead><tr><th></th><th>Nom</th><th>Portée</th><th>Tag GEDCOM</th><th>Couleur</th><th>Pictogramme</th><th>Artiste</th><th>Champs œuvre</th><th>Utilisation</th><th></th></tr></thead>
    <tbody id="event-types-body">${rows}</tbody>
  </table></div>
</section>

</section>`;

        // Afficher le champ "champs spécifiques" seulement si Artiste est cochée
        const createIsArtistic=$('#create-type-is-artistic');const createFieldsWrap=$('#create-type-fields-wrap');
        if(createIsArtistic&&createFieldsWrap){createIsArtistic.addEventListener('change',()=>{createFieldsWrap.hidden=!createIsArtistic.checked;});}

        // Champs spécifiques (édition directe)
        $$('[data-fields-event-type]').forEach(input=>{
            input.addEventListener('change',async()=>{
                try{
                    await api('save_event_type',{},{method:'POST',body:{id:input.dataset.fieldsEventType,custom_fields:input.value}});
                    toast('Champs mis à jour.');
                    await reloadBootstrap();
                }catch(err){toast(err.message,'error');await renderEventTypes();}
            });
        });

        // Formulaire de création
        $('#event-type-admin-form').addEventListener('submit',async event=>{
            event.preventDefault();
            const body=formObject(event.currentTarget);
            try{
                await api('save_event_type',{},{method:'POST',body});
                toast('Type créé.');
                await reloadBootstrap();
                await renderEventTypes();
            }catch(err){toast(err.message,'error');}
        });

        // Couleur (édition directe)
        $$('[data-color-event-type]').forEach(input=>{
            input.addEventListener('change',async()=>{
                const row=input.closest('tr');const swatch=row.querySelector('.event-icon');
                if(swatch)swatch.style.setProperty('--event-color',input.value);
                try{
                    await api('save_event_type',{},{method:'POST',body:{id:input.dataset.colorEventType,color:input.value}});
                    toast('Couleur mise à jour.');
                    await reloadBootstrap();
                }catch(err){toast(err.message,'error');await renderEventTypes();}
            });
        });

        // Pictogramme (édition directe)
        $$('[data-icon-event-type]').forEach(select=>{
            select.addEventListener('change',async()=>{
                const row=select.closest('tr');const swatch=row.querySelector('.event-icon');
                try{
                    await api('save_event_type',{},{method:'POST',body:{id:select.dataset.iconEventType,icon:select.value}});
                    if(swatch)swatch.textContent=EVENT_ICON_GLYPHS[select.value]||swatch.textContent;
                    toast('Pictogramme mis à jour.');
                    await reloadBootstrap();
                }catch(err){toast(err.message,'error');await renderEventTypes();}
            });
        });

        // Renommer (inline edit)
        $$('[data-edit-event-type]').forEach(btn=>{
            btn.addEventListener('click',()=>{
                const row=btn.closest('tr');
                const labelCell=row.querySelector('.event-type-label');
                const currentLabel=labelCell.textContent;
                const typeId=btn.dataset.editEventType;
                const input=document.createElement('input');
                input.value=currentLabel;input.className='inline-edit-input';
                labelCell.replaceWith(input);input.select();
                btn.textContent='Valider';btn.dataset.validatingEventType=typeId;delete btn.dataset.editEventType;

                const save=async()=>{
                    const newLabel=input.value.trim();
                    if(!newLabel){toast('Le nom ne peut pas être vide.','error');return;}
                    if(newLabel===currentLabel){await renderEventTypes();return;}
                    try{
                        await api('save_event_type',{},{method:'POST',body:{id:typeId,label:newLabel}});
                        toast('Type renommé.');
                        await reloadBootstrap();
                        await renderEventTypes();
                    }catch(err){toast(err.message,'error');}
                };
                btn.addEventListener('click',save,{once:true});
                input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save();}if(e.key==='Escape')renderEventTypes();});
            });
        });

        // Artistique (toggle inline)
        $$('[data-artistic-event-type]').forEach(cb=>{
            cb.addEventListener('change',async()=>{
                try{
                    await api('save_event_type',{},{method:'POST',body:{id:cb.dataset.artisticEventType,is_artistic:cb.checked?1:0}});
                    await reloadBootstrap();
                }catch(err){toast(err.message,'error');await renderEventTypes();}
            });
        });

        // Supprimer
        $$('[data-delete-event-type]').forEach(btn=>{
            btn.addEventListener('click',async()=>{
                const label=btn.dataset.label||'ce type';
                if(!await confirmBox('Cette action est définitive.',{title:`Supprimer le type « ${label} » ?`,okLabel:'Supprimer le type'}))return;
                try{
                    await api('delete_event_type',{},{method:'POST',body:{id:btn.dataset.deleteEventType}});
                    toast('Type supprimé.');
                    await reloadBootstrap();
                    await renderEventTypes();
                }catch(err){toast(err.message,'error');}
            });
        });
    }
    function renderAnalyseResult(data){
        const existingPersons=data.existing_persons||0;
        const fusionWarning=data.fusion_needed?`<div class="import-fusion-warning"><strong>⚠️ Fusion requise</strong> — La base contient déjà ${plural(existingPersons,'personne')}. Veux-tu <strong>remplacer</strong> la base ou <strong>fusionner</strong> avec l'existant ? L'écran de dédoublonnage est disponible dans l'onglet <em>Fusion de doublons</em> après import.</div>`:'';
        if(data.format==='sqlite'){
            const missing=data.missing_expected_tables?.length?`<p class="muted" style="color:var(--red)">Tables manquantes : ${data.missing_expected_tables.join(', ')}</p>`:'';
            const compat=data.compatible?'✅ Structure compatible':'⚠️ Structure incomplète ou différente';
            const rows=Object.entries(data.counts).map(([t,n])=>`<tr><td>${escapeHtml(t)}</td><td>${Number(n).toLocaleString('fr-FR')}</td></tr>`).join('');
            return `<div class="data-table-wrap" style="margin-top:.75rem"><p><strong>Base SQLite</strong> — ${compat}</p>${missing}<table class="data-table"><thead><tr><th>Table</th><th>Lignes</th></tr></thead><tbody>${rows}</tbody></table>${fusionWarning}<p class="muted" style="font-size:.85em">Import réel à câbler côté serveur.</p></div>`;
        }
        if(data.format==='json'){
            const rows=Object.entries(data.summary||{}).map(([k,n])=>`<tr><td>${escapeHtml(k)}</td><td>${Number(n).toLocaleString('fr-FR')}</td></tr>`).join('');
            return `<div class="data-table-wrap" style="margin-top:.75rem"><p><strong>JSON</strong> — Clés : ${(data.keys||[]).map(k=>escapeHtml(String(k))).join(', ')}</p><table class="data-table"><thead><tr><th>Section</th><th>Entrées</th></tr></thead><tbody>${rows}</tbody></table>${fusionWarning}<p class="muted" style="font-size:.85em">Import réel à câbler côté serveur.</p></div>`;
        }
        if(data.format==='csv'){
            return `<div class="data-table-wrap" style="margin-top:.75rem"><p><strong>CSV</strong> — ${plural(data.row_count||0,'ligne')}</p><p class="muted">Colonnes : ${(data.headers||[]).map(k=>escapeHtml(String(k))).join(', ')}</p>${fusionWarning}<p class="muted" style="font-size:.85em">Import réel à câbler côté serveur.</p></div>`;
        }
        if(data.format==='mftpkg'){
            const sqliteNote=data.has_sqlite?'✅ Base SQLite détectée dans le paquet':'⚠️ Aucune base SQLite repérée dans le paquet';
            const entries=(data.entries||[]).slice(0,20).map(name=>`<tr><td>${escapeHtml(name)}</td></tr>`).join('');
            const more=data.entry_count>20?`<p class="muted" style="font-size:.85em">… et ${plural(data.entry_count-20,'autre élément','autres éléments')}.</p>`:'';
            return `<div class="data-table-wrap" style="margin-top:.75rem"><p><strong>Mac Family Tree (.mftpkg)</strong> — ${plural(data.entry_count||0,'élément')} dans le paquet · ${sqliteNote}</p><table class="data-table"><thead><tr><th>Contenu du paquet</th></tr></thead><tbody>${entries}</tbody></table>${more}${fusionWarning}<p class="muted" style="font-size:.85em">Import réel à câbler côté serveur.</p></div>`;
        }
        return `<p class="muted">Format non reconnu.</p>`;
    }
    function renderGedcomVerifyResult(data){
        const statusIcon=data.valid?'✅':'❌';
        const versionWarn=!data.version?.startsWith('7')?`<p class="muted" style="font-size:.85em;color:var(--orange)">⚠️ GEDCOM ${escapeHtml(data.version||'?')} — version ancienne. GEDCOM 7.0 est recommandé.</p>`:'';
        const errHtml=(data.errors||[]).length?`<h4 style="color:var(--red);margin:.5rem 0 .25rem">Erreurs (${data.errors.length})</h4><ul>${data.errors.map(e=>`<li>${escapeHtml(e)}</li>`).join('')}</ul>`:'';
        const warnHtml=(data.warnings||[]).length?`<h4 style="color:var(--orange);margin:.5rem 0 .25rem">Avertissements (${data.warnings.length})</h4><ul>${data.warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul>`:'';
        const preview=data.import_preview||{};
        const previewHtml=preview.rows?`<h4 style="margin:1rem 0 .35rem">Prévisualisation d'import</h4><p class="muted">Analyse sans modifier la base : ${plural(Number(preview.create||0),'création')}, ${plural(Number(preview.possible_merge||0),'fusion possible','fusions possibles')}, ${plural(Number(preview.ignored||0),'ignorée')}.</p><table class="data-table"><thead><tr><th>Personne</th><th>Naissance</th><th>Action proposée</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><td>${escapeHtml(row.name||'Sans nom')}</td><td>${escapeHtml(row.birth_year||'—')}</td><td>${row.status==='create'?'Créer':row.status==='possible_merge'?'Fusion possible':'Ignorer'}${row.detail?` · ${escapeHtml(row.detail)}`:''}</td></tr>`).join('')}</tbody></table>`:'';
        return `<div class="data-table-wrap" style="margin-top:.75rem"><p><strong>${statusIcon} GEDCOM ${escapeHtml(data.version||'?')}</strong> · Encodage : ${escapeHtml(data.encoding||'?')} · ${plural(data.lines_total||0,'ligne')}</p>${versionWarn}<table class="data-table"><thead><tr><th>Type</th><th>Quantité</th></tr></thead><tbody>${Object.entries(data.counts||{}).map(([k,n])=>`<tr><td>${escapeHtml(k)}</td><td>${Number(n).toLocaleString('fr-FR')}</td></tr>`).join('')}</tbody></table>${previewHtml}${errHtml}${warnHtml}</div>`;
    }

    function safetyComparisonHtml(data){if(!data)return '';const s=data.summary||{};const names=rows=>rows?.length?`<ul>${rows.slice(0,12).map(row=>`<li>${escapeHtml(row.name||row)}</li>`).join('')}</ul>`:'';return `<section class="maintenance-panel"><h3>Résultat de comparaison</h3><p><strong>${Number(s.persons_added||0)}</strong> ${Number(s.persons_added||0)<2?'personne ajoutée':'personnes ajoutées'} · <strong>${Number(s.persons_removed||0)}</strong> ${Number(s.persons_removed||0)<2?'retirée':'retirées'} · <strong>${Number(s.dates_changed||0)}</strong> ${Number(s.dates_changed||0)<2?'date modifiée':'dates modifiées'} · <strong>${Number(s.sources_new||0)}</strong> ${Number(s.sources_new||0)<2?'source nouvelle':'sources nouvelles'}${s.conflicts!==undefined?` · <strong>${Number(s.conflicts||0)}</strong> ${Number(s.conflicts||0)<2?'conflit':'conflits'}`:''}.</p>${names(data.persons_added)}${names(data.dates_changed)}${names(data.conflicts)}${names(data.sources_new)}</section>`;}
    async function renderDataSafetyTools(token=++state.workspaceToken){
        const [health,profiles]=await Promise.all([api('data_health_report'),api('database_profiles')]);if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='safety')return;
        const db=health.database||{},media=health.media||{},backups=health.backups||{};const files=media.orphan_files||[];const backupOptions=(backups.files||[]).map(file=>`<option value="${escapeHtml(file.name)}">${escapeHtml(file.name)} · ${formatFileSize(file.size)}</option>`).join('');const compareOptions=[...(profiles.databases||[]).filter(item=>!item.active).map(item=>`<option value="${escapeHtml(item.key)}">Base : ${escapeHtml(item.name)}</option>`),...(backups.files||[]).map(file=>`<option value="backup:${escapeHtml(file.name)}">Sauvegarde : ${escapeHtml(file.name)}</option>`)].join('');const history=(health.comparisons||[]).map(item=>`<li>${window.LCNDA_UI?.when?.(item.created_at)||escapeHtml(item.created_at)} · ${escapeHtml(item.source_name)} · ${plural(item.summary?.persons_added||0,'ajout')}, ${plural(item.summary?.dates_changed||0,'date modifiée','dates modifiées')}</li>`).join('');
        $('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">PRÉVENTION · LECTURE SEULE</span><h2>Sécurité & comparaison</h2><p>Vérifie la santé de la base, les fichiers médias, les sauvegardes et les différences avant une fusion ou un import.</p></div></header>
<section class="maintenance-panel"><h3>Rapport de sauvegarde</h3><div class="form-grid"><p><strong>Base :</strong> ${escapeHtml(db.key||'')} · ${formatFileSize(db.size||0)}</p><p><strong>Intégrité SQLite :</strong> ${escapeHtml(db.integrity||'inconnue')}</p><p><strong>Données :</strong> ${plural(db.counts?.persons||0,'personne')} · ${plural(db.counts?.media||0,'média')}</p><p><strong>Dernier test de restauration :</strong> ${backups.last_restore_test?`${escapeHtml(backups.last_restore_test.backup_name)} · ${escapeHtml(backups.last_restore_test.integrity)} · ${escapeHtml(backups.last_restore_test.tested_at)}`:'Jamais testé'}</p></div>${backupOptions?`<div class="page-actions"><select id="safety-backup-test">${backupOptions}</select><button class="button secondary" id="safety-test-backup">Tester cette sauvegarde</button></div>`:emptyState({icon:'💾',text:'Aucune sauvegarde locale pour l’instant',hint:'Les sauvegardes se rangent dans data/backups.'})}</section>
<section class="maintenance-panel"><h3>Fichiers médias</h3><p>${plural(Number(media.registered||0),'média enregistré','médias enregistrés')} · <strong>${(media.missing||[]).length}</strong> ${(media.missing||[]).length<2?'fichier manquant':'fichiers manquants'} · ${plural(media.orphan_count||0,'fichier présent','fichiers présents')} mais non ${Number(media.orphan_count||0)<2?'rattaché':'rattachés'}.</p>${(media.missing||[]).length?`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Média</th><th>Fichier attendu</th><th>Réparer</th></tr></thead><tbody>${media.missing.map(item=>`<tr><td>${escapeHtml(item.title||`Média #${item.id}`)}</td><td><code>${escapeHtml(item.filename)}</code></td><td><input id="repair-media-${item.id}" list="safety-media-files" placeholder="Nom du fichier retrouvé"><button class="button small secondary" data-repair-media="${item.id}">Réparer</button></td></tr>`).join('')}</tbody></table></div><datalist id="safety-media-files">${files.map(file=>`<option value="${escapeHtml(file.name)}">`).join('')}</datalist>`:empty('Aucun fichier média manquant.',{icon:'✅'})}${files.length?`<p class="muted">Fichiers non rattachés détectés : ${files.slice(0,12).map(file=>escapeHtml(file.name)).join(' · ')}${(media.orphan_count||0)>12?'…':''}</p>`:''}</section>
<section class="maintenance-panel"><h3>Base de test</h3><p>Duplique la base ouverte pour essayer un import ou une fusion sans modifier l’original. Les médias restent partagés : ne les supprime pas depuis la copie si tu veux préserver l’original.</p><form id="safety-clone-form" class="page-actions"><input name="name" required placeholder="Ex. essai-import-juillet"><button class="button" type="submit">Créer une copie de test</button></form><p id="safety-clone-result" class="muted"></p></section>
<section class="maintenance-panel"><h3>Comparer la base actuelle à une sauvegarde ou une autre base</h3><p>Rapport : personnes ajoutées ou retirées, dates modifiées et nouvelles sources. La comparaison ne modifie rien.</p>${compareOptions?`<div class="page-actions"><select id="safety-database-source">${compareOptions}</select><button class="button secondary" id="safety-compare-database">Comparer</button></div>`:'<p class="muted">Crée une copie de test ou une sauvegarde pour lancer une comparaison.</p>'}${history?`<details><summary>Journal des comparaisons récentes</summary><ul>${history}</ul></details>`:''}<div id="safety-database-result"></div></section>
<section class="maintenance-panel"><h3>Comparer deux GEDCOM</h3><p>Compare deux versions avant import : personnes ajoutées ou retirées, dates modifiées, nouvelles sources et conflits simples de chronologie.</p><form id="safety-gedcom-compare" class="form-grid"><label>GEDCOM de référence<input type="file" name="file_a" accept=".ged,.gedcom" required></label><label>Nouveau GEDCOM<input type="file" name="file_b" accept=".ged,.gedcom" required></label><div class="page-actions"><button class="button secondary" type="submit">Comparer les GEDCOM</button></div></form><div id="safety-gedcom-result"></div></section></section>`;
        $('#safety-test-backup')?.addEventListener('click',async()=>{try{const result=await api('test_backup_restore',{}, {method:'POST',body:{backup_name:$('#safety-backup-test').value}});toast(result.result.integrity==='ok'?'Sauvegarde lisible et intègre.':'Sauvegarde testée avec avertissement.');await renderDataSafetyTools();}catch(error){toast(error.message,'error');}});
        $$('[data-repair-media]').forEach(button=>button.addEventListener('click',async()=>{const filename=$(`#repair-media-${button.dataset.repairMedia}`)?.value.trim();if(!filename)return window.LCNDA_UI.fail($(`#repair-media-${button.dataset.repairMedia}`),'Indique le fichier retrouvé dans le dossier media.');try{await api('repair_media_path',{}, {method:'POST',body:{media_id:button.dataset.repairMedia,filename}});toast('Chemin du média réparé.');await renderDataSafetyTools();}catch(error){toast(error.message,'error');}}));
        $('#safety-clone-form')?.addEventListener('submit',async event=>{event.preventDefault();try{const result=await api('clone_database',{}, {method:'POST',body:formObject(event.currentTarget)});const copy=result;$('#safety-clone-result').innerHTML=`Copie créée : <strong>${escapeHtml(copy.name)}</strong>. <button class="button small secondary" id="safety-open-clone">Ouvrir cette copie</button>`;$('#safety-open-clone')?.addEventListener('click',async()=>{await api('switch_database',{}, {method:'POST',body:{key:copy.key}});location.reload();});}catch(error){toast(error.message,'error');}});
        $('#safety-compare-database')?.addEventListener('click',async()=>{const target=$('#safety-database-result');target.innerHTML='<p class="muted">Comparaison en cours…</p>';try{const comparison=await api('compare_database',{source:$('#safety-database-source').value});await api('save_database_comparison_report',{}, {method:'POST',body:{source_name:comparison.source,summary:comparison.summary}});target.innerHTML=safetyComparisonHtml(comparison);}catch(error){target.innerHTML='';toast(error.message,'error');}});
        $('#safety-gedcom-compare')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,a=form.elements.file_a.files[0],b=form.elements.file_b.files[0],target=$('#safety-gedcom-result');if(!a||!b)return;target.innerHTML='<p class="muted">Comparaison en cours…</p>';const fd=new FormData();fd.append('file_a',a);fd.append('file_b',b);fd.append('csrf',state.csrf);try{const response=await fetch('api.php?action=compare_gedcom',{method:'POST',headers:{'X-CSRF-Token':state.csrf},body:fd});const data=await response.json();if(!response.ok||data.error)throw new Error(data.error||'Comparaison impossible');target.innerHTML=safetyComparisonHtml(data);}catch(error){target.innerHTML='';toast(error.message,'error');}});
    }
    async function renderImportTools(token=++state.workspaceToken){const [data,dbProfiles]=await Promise.all([api('deed_preview'),api('database_profiles')]);if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='import')return;$('#workspace').innerHTML=`<section class="page"><header class="page-header"><div><span class="eyebrow">IMPORT</span><h2>Importer des données</h2><p>Analyse et import depuis GEDCOM, JSON, CSV, SQLite. Chaque format est analysé avant toute modification de la base.</p></div></header>

<section class="maintenance-panel">
  <h3 data-help="Une « base » est un fichier qui contient toute une généalogie. Tu peux en avoir plusieurs (la tienne, celle d’un ami) et passer de l’une à l’autre ; rien n’est mélangé." data-help-faq="base">Changer de base SQLite</h3>
  <p>Permet d’ouvrir une autre généalogie locale sans réinstaller. Place les bases dans <code>data/</code> ou <code>data/bases/</code>, puis recharge après sélection.</p>
  <p class="muted">Sécurité : les imports sont analysés avant toute modification. Ajouter un GEDCOM ou un autre fichier ne doit pas remplacer la base ouverte sans confirmation explicite.</p>
  <form id="database-profile-form" class="import-form"><label>Base active<select name="key" id="database-profile-select">${(dbProfiles.databases||[]).map(db=>`<option value="${escapeHtml(db.key)}" data-active="${db.active?'1':'0'}" ${db.active?'selected':''}>${escapeHtml(db.name)}${db.active?' — active':''}</option>`).join('')}</select></label><button class="button secondary" type="submit" ${(dbProfiles.databases||[]).length?'':'disabled'}>Utiliser cette base</button><button class="button danger" type="button" id="delete-database-profile" ${(dbProfiles.databases||[]).length?'':'disabled'}>Supprimer cette base</button></form>
  <p class="muted">Base actuelle : ${escapeHtml(dbProfiles.current||'data/genealogy.sqlite')}</p>
</section>

<section class="maintenance-panel">
  <h3 data-help="Lit le fichier sans rien importer et liste ce qui cloche (liens cassés, encodage, version) : utile quand un import échoue ou paraît incomplet." data-help-faq="GEDCOM">🔍 Vérificateur GEDCOM</h3>
  <p>Analyse un fichier .ged sans l'importer : détecte les erreurs de format, les références cassées, l'encodage et la version.</p>
  <form id="verify-gedcom-form" class="import-form"><label>Fichier GEDCOM<input type="file" name="file" accept=".ged,.gedcom"></label><button class="button" type="submit">Vérifier le GEDCOM</button></form>
  <div id="verify-gedcom-result"></div>
</section>

<section class="maintenance-panel">
  <h3 data-help="Le fichier est d’abord analysé : tu vois combien de personnes, familles et sources il contient avant de confirmer. Pour ajouter l’arbre d’un cousin à ta base sans doublons, utilise plutôt « Fusionner un arbre »." data-help-faq="importer un GEDCOM">GEDCOM (.ged) — Import</h3>
  <p>Compatible GEDCOM 5.5.1 et 7.0. Version et encodage détectés automatiquement.</p>
  <form id="import-gedcom-form" class="import-form"><label>Fichier GEDCOM<input type="file" name="file" accept=".ged,.gedcom"></label><button class="button" type="submit">Analyser le GEDCOM</button></form>
  <div id="import-result"></div>
</section>

<section class="maintenance-panel">
  <h3>Mac Family Tree (.mftpkg)</h3>
  <p>Paquet natif Mac Family Tree. Contenu extrait et analysé avant tout import.</p>
  <form id="import-mftpkg-form" class="import-form"><label>Fichier .mftpkg<input type="file" name="file" accept=".mftpkg"></label><button class="button secondary" type="submit">Analyser le .mftpkg</button></form>
  <div id="import-mftpkg-result"></div>
</section>

<section class="maintenance-panel">
  <h3>Base SQLite (.db)</h3>
  <p>Analyse les tables, le nombre de lignes et la compatibilité avec le schéma actuel. Avertit si une fusion est nécessaire.</p>
  <form id="import-db-form" class="import-form"><label>Fichier .db ou .sqlite<input type="file" name="file" accept=".db,.sqlite"></label><button class="button secondary" type="submit">Analyser le .db</button></form>
  <div id="import-db-result"></div>
</section>

<section class="maintenance-panel">
  <h3>JSON</h3>
  <p>Import d'un fichier JSON exporté depuis cette application. La structure est vérifiée avant intégration.</p>
  <form id="import-json-form" class="import-form"><label>Fichier JSON<input type="file" name="file" accept=".json,application/json"></label><button class="button secondary" type="submit">Analyser le JSON</button></form>
  <div id="import-json-result"></div>
</section>

<section class="maintenance-panel">
  <h3>CSV</h3>
  <p>Import CSV pour corrections ou ajouts tabulaires. Colonnes détectées avant tout import.</p>
  <form id="import-csv-form" class="import-form"><label>Fichier CSV<input type="file" name="file" accept=".csv,text/csv"></label><button class="button secondary" type="submit">Analyser le CSV</button></form>
  <div id="import-csv-result"></div>
</section>

<section class="maintenance-panel">
  <h3>GEDZIP (.gdz)</h3>
  <p>Archive GEDCOM compressée. Contenu extrait et analysé avant tout import.</p>
  <form id="import-gedzip-form" class="import-form"><label>Fichier GEDZIP<input type="file" name="file" accept=".gdz,.zip"></label><button class="button secondary" type="submit">Analyser le GEDZIP</button></form>
</section>

<section class="maintenance-panel">
  <h3>Réparations d'import</h3>
  <p>Outils ponctuels pour corriger les libellés issus de l'import sans toucher au reste.</p>
  <h4 style="margin:.75rem 0 .25rem">Convertir Deed en Décès</h4>
  <p>${plural(data.events.length,'événement')} Deed ${data.events.length<2?'trouvé':'trouvés'}.</p>
  ${data.events.length?`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Personne</th><th>Lieu</th></tr></thead><tbody>${data.events.map(event=>`<tr><td>${escapeHtml(event.date_text||event.year||'—')}</td><td>${escapeHtml(event.person||'—')}</td><td>${escapeHtml(event.place||'—')}</td></tr>`).join('')}</tbody></table></div><button class="button danger" id="convert-deed">Convertir en Décès</button>`:empty('Rien à convertir.',{icon:'✅'})}
</section>

</section>`;

    // ── Vérificateur GEDCOM (serveur) ──
    $('#verify-gedcom-form').addEventListener('submit',async event=>{event.preventDefault();const file=event.currentTarget.elements.file.files[0];if(!file){toast('Sélectionne un fichier GEDCOM.','error');return;}const result=$('#verify-gedcom-result');result.innerHTML='<p class="muted">Vérification en cours…</p>';try{const d=await importUpload('verify_gedcom',file);result.innerHTML=renderGedcomVerifyResult(d);}catch(err){result.innerHTML='';toast('Vérification impossible : '+err.message,'error');}});

    // ── Prévisualisation GEDCOM (serveur, sans écrire dans la base) ──
    $('#import-gedcom-form').addEventListener('submit',async event=>{event.preventDefault();const file=event.currentTarget.elements.file.files[0];if(!file){toast('Sélectionne un fichier GEDCOM.','error');return;}const result=$('#import-result');result.innerHTML='<p class="muted">Prévisualisation en cours…</p>';try{const d=await importUpload('verify_gedcom',file);result.innerHTML=renderGedcomVerifyResult(d);}catch(err){result.innerHTML='';toast('Prévisualisation impossible : '+err.message,'error');}});

    // ── Analyse SQLite .db (serveur) ──
    $('#import-db-form').addEventListener('submit',async event=>{event.preventDefault();const file=event.currentTarget.elements.file.files[0];if(!file){toast('Sélectionne un fichier .db','error');return;}const result=$('#import-db-result');result.innerHTML='<p class="muted">Analyse en cours…</p>';try{const d=await importUpload('import_analyse',file);result.innerHTML=renderAnalyseResult(d);}catch(err){result.innerHTML='';toast('Analyse impossible : '+err.message,'error');}});
    $('#database-profile-form')?.addEventListener('submit',async event=>{event.preventDefault();const key=event.currentTarget.elements.key.value;if(!key)return;try{await api('switch_database',{}, {method:'POST',body:{key}});toast('Base active changée. Rechargement…');setTimeout(()=>location.reload(),350);}catch(err){toast(err.message,'error');}});
    $('#delete-database-profile')?.addEventListener('click',async()=>{
        const select=$('#database-profile-select'),option=select?.selectedOptions?.[0],key=select?.value;
        if(!key)return;
        if(option?.dataset.active==='1'){toast('Impossible de supprimer la base active. Ouvre une autre base avant.','error');return;}
        const label=option?.textContent?.replace(/\s+— active$/,'')||key;
        if(!await confirmBox('Cette action ne supprime que le fichier SQLite choisi, pas les médias.',{title:`Supprimer définitivement la base « ${label} » ?`,okLabel:'Supprimer la base'}))return;
        try{await api('delete_database',{}, {method:'POST',body:{key}});toast('Base supprimée.');await renderImportTools();}catch(err){toast(err.message,'error');}
    });

    // ── Analyse JSON (serveur) ──
    $('#import-json-form').addEventListener('submit',async event=>{event.preventDefault();const file=event.currentTarget.elements.file.files[0];if(!file){toast('Sélectionne un fichier JSON','error');return;}const result=$('#import-json-result');result.innerHTML='<p class="muted">Analyse en cours…</p>';try{const d=await importUpload('import_analyse',file);result.innerHTML=renderAnalyseResult(d);}catch(err){result.innerHTML='';toast('Analyse impossible : '+err.message,'error');}});

    // ── Analyse CSV (serveur) ──
    $('#import-csv-form').addEventListener('submit',async event=>{event.preventDefault();const file=event.currentTarget.elements.file.files[0];if(!file){toast('Sélectionne un fichier CSV','error');return;}const result=$('#import-csv-result');result.innerHTML='<p class="muted">Analyse en cours…</p>';try{const d=await importUpload('import_analyse',file);result.innerHTML=renderAnalyseResult(d);}catch(err){result.innerHTML='';toast('Analyse impossible : '+err.message,'error');}});

    // ── GEDZIP stub ──
    $('#import-gedzip-form').addEventListener('submit',event=>{event.preventDefault();toast('Analyse GEDZIP à câbler côté serveur.','error');});

    // ── Analyse Mac Family Tree .mftpkg (serveur) ──
    $('#import-mftpkg-form').addEventListener('submit',async event=>{event.preventDefault();const file=event.currentTarget.elements.file.files[0];if(!file){toast('Sélectionne un fichier .mftpkg','error');return;}const result=$('#import-mftpkg-result');result.innerHTML='<p class="muted">Analyse en cours…</p>';try{const d=await importUpload('import_analyse',file);result.innerHTML=renderAnalyseResult(d);}catch(err){result.innerHTML='';toast('Analyse impossible : '+err.message,'error');}});

    // ── Convertir Deed ──
    $('#convert-deed')?.addEventListener('click',async()=>{if(!await confirmBox('Les événements « Deed » deviendront des événements « Décès ».',{title:`Convertir ${plural(data.events.length,'événement')} Deed en Décès ?`,okLabel:'Convertir',danger:false}))return;await api('convert_deed_to_death',{},{method:'POST',body:{confirm:'yes'}});toast('Conversion effectuée.');await reloadBootstrap();await renderImportTools();});}
    async function renderHelpGlossary(token=++state.workspaceToken){
        if(token!==state.workspaceToken||state.module!=='maintenance'||!['help','faq'].includes(state.maintenanceTab))return;
        let dictionary={entries:[]};
        try{dictionary=await api('personal_dictionary');}catch(error){toast('Dictionnaire personnel indisponible : '+error.message,'error');}
        if(token!==state.workspaceToken||state.module!=='maintenance'||!['help','faq'].includes(state.maintenanceTab))return;
        const quickHelp=[
            ['Personnes','Une fiche personne rassemble identité, événements, médias, notes, sources, étiquettes, enquêtes et relations.'],
            ['Sources','Une information importante doit idéalement renvoyer vers une source et une citation précise : registre, vue, page, cote ou URL.'],
            ['Étiquettes','Les étiquettes servent à classer un élément sans changer la donnée généalogique elle-même. Elles peuvent être retirées à tout moment.'],
            ['Journal','Le journal garde une trace des créations, modifications et suppressions. Certaines suppressions peuvent être restaurées selon leur contexte.']
        ];
        const glossary=[
            {term:'Acte',definition:'Document officiel ou religieux qui constate un événement : naissance, baptême, mariage, décès, sépulture, reconnaissance, etc.'},
            {term:'Ascendant',definition:'Personne dont on descend directement : parent, grand-parent, arrière-grand-parent.'},
            {term:'Baptême',definition:'Acte religieux souvent utilisé avant l’état civil pour approcher une naissance. Il mentionne souvent les parents, le parrain et la marraine.'},
            {term:'Branche',definition:'Partie de l’arbre issue d’un couple, d’une lignée ou d’un patronyme.'},
            {term:'Cadastre',definition:'Ensemble de plans et matrices décrivant les propriétés. Utile pour situer une famille, une maison ou une parcelle.'},
            {term:'Citation',definition:'Référence précise à l’endroit où une information a été trouvée : registre, vue, page, cote, URL, date de consultation.'},
            {term:'Collatéral',definition:'Parent qui ne descend pas directement de soi : frère, sœur, oncle, tante, cousin, cousine.'},
            {term:'Commune',definition:'Unité administrative locale. Une commune peut changer de nom, fusionner ou être rattachée à une autre commune.'},
            {term:'Conjoint',definition:'Époux, épouse ou partenaire lié à une union. Dans l’outil, les conjoints servent aussi à construire les familles.'},
            {term:'Descendant',definition:'Personne qui descend directement d’un individu : enfant, petit-enfant, arrière-petit-enfant.'},
            {term:'État civil',definition:'Registres publics de naissance, mariage et décès, instaurés en France à partir de 1792.'},
            {term:'Filiation',definition:'Lien parent-enfant. Une filiation doit être appuyée par une source ou une preuve quand c’est possible.'},
            {term:'GEDCOM',definition:'Format d’échange standard pour transférer une généalogie entre logiciels.'},
            {term:'Homonyme',definition:'Personne portant le même nom, parfois le même prénom, qu’une autre. C’est une cause fréquente de confusion.'},
            {term:'Hypothèse',definition:'Piste non encore prouvée. Elle doit rester identifiable comme incertaine jusqu’à validation.'},
            {term:'Individu',definition:'Fiche personne de l’arbre : identité, événements, médias, notes, sources, étiquettes et relations.'},
            {term:'Lignée',definition:'Suite directe d’ascendants ou de descendants, souvent suivie par un patronyme ou une branche.'},
            {term:'Mariage',definition:'Union civile ou religieuse. L’acte peut donner âges, lieux d’origine, parents, témoins et parfois contrat.'},
            {term:'Matricule',definition:'Registre militaire donnant des informations sur un homme : état civil, signalement, parcours, adresses.'},
            {term:'Mention marginale',definition:'Note ajoutée en marge d’un acte, souvent pour signaler mariage, divorce, décès ou reconnaissance.'},
            {term:'Nom inscrit',definition:'Nom tel qu’il apparaît dans l’acte. Il peut différer du nom normalisé utilisé dans l’arbre.'},
            {term:'Parrain / Marraine',definition:'Personnes citées dans un baptême. Elles sont utiles pour repérer proches, voisins ou branches alliées.'},
            {term:'Patronyme',definition:'Nom de famille, parfois écrit avec de nombreuses variantes selon les actes et les périodes.'},
            {term:'Preuve',definition:'Élément argumenté qui confirme une information ou un lien : acte, faisceau d’indices, comparaison de signatures, etc.'},
            {term:'Recensement',definition:'Liste des habitants d’un lieu à une date donnée. Il aide à suivre une famille entre deux actes.'},
            {term:'Registre paroissial',definition:'Registre tenu par une paroisse avant l’état civil : baptêmes, mariages, sépultures.'},
            {term:'Sosa',definition:'Numérotation des ancêtres directs : 1 pour la personne racine, 2 pour le père, 3 pour la mère, puis doublement à chaque génération.'},
            {term:'Source',definition:'Document ou référence d’où vient une information : acte, registre, site d’archives, livre, photo, témoignage.'},
            {term:'Table décennale',definition:'Index alphabétique des naissances, mariages et décès d’une commune sur dix ans.'},
            {term:'Témoin',definition:'Personne citée dans un acte. Un témoin peut révéler une parenté, un voisinage ou une relation professionnelle.'},
            {term:'Transcription',definition:'Copie lisible du texte d’un document. Elle peut venir d’une saisie manuelle, d’un OCR ou d’un HTR.'},
            {term:'Variante de nom',definition:'Autre forme d’un prénom ou d’un nom repérée dans les actes : orthographe différente, surnom, nom d’usage.'}
        ].sort((a,b)=>a.term.localeCompare(b.term,'fr',{sensitivity:'base'}));
        const groups=glossary.reduce((acc,item)=>{
            const letter=item.term.normalize('NFD').replace(/[\u0300-\u036f]/g,'').charAt(0).toUpperCase();
            (acc[letter]??=[]).push(item);
            return acc;
        },{});
        const glossaryHtml=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fr')).map(letter=>`<section class="help-letter"><h3>${escapeHtml(letter)}</h3><dl>${groups[letter].map(item=>`<div class="help-term"><dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.definition)}</dd></div>`).join('')}</dl></section>`).join('');
        const oldOccupations=[
            {term:'Aubergiste',definition:'Personne tenant une auberge, fournissant repas, boisson et parfois logement aux voyageurs.'},
            {term:'Bordier',definition:'Petit exploitant agricole tenant une borderie, souvent avec peu de terres.'},
            {term:'Bottier',definition:'Artisan spécialisé dans la fabrication ou la réparation des bottes et chaussures.'},
            {term:'Bourrelier',definition:'Artisan qui fabrique et répare harnais, courroies et pièces de cuir pour les animaux de trait.'},
            {term:'Brassier',definition:'Travailleur manuel vivant de la force de ses bras, proche de journalier ou manouvrier selon les régions.'},
            {term:'Cabaretier',definition:'Tenancier d’un cabaret où l’on sert boissons et parfois repas.'},
            {term:'Charretier',definition:'Conducteur de charrette, chargé du transport de marchandises, bois, grains ou matériaux.'},
            {term:'Charron',definition:'Artisan qui fabrique et répare charrettes, roues et véhicules agricoles.'},
            {term:'Cloutier',definition:'Ouvrier ou artisan fabriquant des clous, souvent dans les régions métallurgiques.'},
            {term:'Cordier',definition:'Artisan qui fabrique des cordes, ficelles ou câbles à partir de chanvre, lin ou autres fibres.'},
            {term:'Cordonnier',definition:'Artisan qui fabrique ou répare les chaussures.'},
            {term:'Cultivateur',definition:'Personne qui exploite la terre. Le terme peut couvrir des situations sociales très différentes.'},
            {term:'Domestique',definition:'Personne employée au service d’une maison, d’une ferme ou d’un maître.'},
            {term:'Écuyer',definition:'Titre ou qualité sociale, parfois noble, dont le sens varie selon l’époque et le contexte local.'},
            {term:'Faiseur de bas',definition:'Ouvrier textile fabriquant des bas, souvent au métier.'},
            {term:'Fendeur',definition:'Ouvrier forestier ou du bois qui fend bûches, merrains ou pièces destinées à divers usages.'},
            {term:'Fermier',definition:'Exploitant tenant une ferme à bail ; peut être beaucoup plus aisé qu’un journalier.'},
            {term:'Fileuse',definition:'Femme travaillant au filage de la laine, du chanvre, du lin ou d’autres fibres.'},
            {term:'Forgeron',definition:'Artisan travaillant le fer, fabriquant et réparant outils, pièces métalliques et ferrures.'},
            {term:'Foulon',definition:'Ouvrier ou exploitant lié au foulage des draps pour les nettoyer et les épaissir.'},
            {term:'Garde champêtre',definition:'Agent communal chargé de surveiller les campagnes, chemins, récoltes et infractions rurales.'},
            {term:'Hostelier',definition:'Ancienne forme proche d’aubergiste ou hôtelier.'},
            {term:'Journalier',definition:'Travailleur payé à la journée, souvent agricole, sans propriété stable.'},
            {term:'Laboureur',definition:'Exploitant agricole possédant ou louant un attelage et des terres ; statut souvent supérieur au simple journalier.'},
            {term:'Lavandière',definition:'Femme qui lave le linge, pour une maison, une institution ou une clientèle.'},
            {term:'Maçon',definition:'Ouvrier du bâtiment travaillant pierre, brique, chaux ou mortier.'},
            {term:'Maréchal-ferrant',definition:'Artisan qui ferre les chevaux et soigne parfois les animaux de trait.'},
            {term:'Manouvrier',definition:'Ouvrier manuel vivant de travaux ponctuels, fréquemment agricoles.'},
            {term:'Marchand',definition:'Terme large désignant une personne faisant commerce ; la marchandise précise est souvent à chercher ailleurs dans l’acte.'},
            {term:'Marguillier',definition:'Laïc chargé de l’administration matérielle d’une paroisse.'},
            {term:'Mendiant',definition:'Personne vivant d’aumônes ; mention pouvant signaler une grande précarité.'},
            {term:'Métayer',definition:'Exploitant agricole qui travaille une terre contre une part des récoltes.'},
            {term:'Meunier',definition:'Personne qui exploite un moulin et transforme les grains en farine.'},
            {term:'Notaire royal',definition:'Officier public recevant actes et contrats sous l’Ancien Régime.'},
            {term:'Perruquier',definition:'Artisan fabriquant, vendant ou entretenant perruques et parfois cheveux postiches.'},
            {term:'Procureur',definition:'Profession juridique ou représentant dans certaines procédures ; sens variable selon l’époque.'},
            {term:'Sage-femme',definition:'Femme assistant les accouchements ; peut apparaître comme déclarante ou témoin.'},
            {term:'Sabotier',definition:'Artisan qui fabrique des sabots en bois.'},
            {term:'Scieur de long',definition:'Ouvrier débitant les troncs en planches avec une grande scie, souvent en équipe.'},
            {term:'Serger',definition:'Tisserand spécialisé dans la serge, étoffe de laine ou laine mêlée.'},
            {term:'Tanneur',definition:'Artisan transformant les peaux en cuir.'},
            {term:'Tailleur d’habits',definition:'Artisan spécialisé dans la confection et l’ajustement des vêtements.'},
            {term:'Tisserand',definition:'Artisan qui fabrique des étoffes sur métier à tisser.'},
            {term:'Tonnelier',definition:'Artisan fabriquant tonneaux, barriques, cuves et autres contenants en bois cerclé.'},
            {term:'Voiturier',definition:'Transporteur de personnes ou marchandises avec voiture, charrette ou attelage.'},
            {term:'Vigneron',definition:'Personne qui cultive la vigne, parfois propriétaire, fermier ou simple ouvrier viticole.'}
        ].sort((a,b)=>a.term.localeCompare(b.term,'fr',{sensitivity:'base'}));
        const oldOccupationsHtml=`<section class="help-letter"><h3>Métiers</h3><dl>${oldOccupations.map(item=>`<div class="help-term"><dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.definition)}</dd></div>`).join('')}</dl></section>`;
        const categoryLabels={abbreviation:'Abréviation',vocabulary:'Vocabulaire local',place:'Lieu-dit',nickname:'Surnom',variant:'Variante',other:'Autre'};
        const entries=Array.isArray(dictionary.entries)?dictionary.entries:[];
        const dictionaryHtml=`<section class="maintenance-panel full-width help-intro"><h3>Dictionnaire personnel</h3><p>Conserve les abréviations, mots locaux, lieux-dits, surnoms et variantes utiles dans tes recherches.</p><form id="personal-dictionary-form" class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;margin-top:1rem"><input type="hidden" name="id"><label>Terme<input name="term" required placeholder="Ex. Le Grand Chemin"></label><label>Catégorie<select name="category">${Object.entries(categoryLabels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label style="grid-column:1/-1">Définition<textarea name="definition" required placeholder="Sens local, source, contexte ou variante relevée..."></textarea></label><div class="page-actions" style="grid-column:1/-1"><button class="button" type="submit">Ajouter au dictionnaire</button><button class="button secondary" type="button" id="personal-dictionary-reset">↺ Remettre comme au départ</button></div></form>${entries.length?`<div class="data-table-wrap" style="margin-top:1rem"><table class="data-table"><thead><tr><th>Terme</th><th>Catégorie</th><th>Définition</th><th></th></tr></thead><tbody>${entries.map(entry=>`<tr><td>${escapeHtml(entry.term)}</td><td>${escapeHtml(categoryLabels[entry.category]||'Autre')}</td><td>${escapeHtml(entry.definition)}</td><td><button class="button small secondary" type="button" data-edit-personal-dictionary="${entry.id}">Modifier</button> <button class="button small danger" type="button" data-delete-personal-dictionary="${entry.id}">Supprimer</button></td></tr>`).join('')}</tbody></table></div>`:emptyState({text: 'Aucune définition personnelle pour l’instant', icon:'📖',action:{label:'＋ Ajouter une définition',attrs:'data-empty-focus="#personal-dictionary-form [name=term]"'}})}</section>`;
        // Deux pages : « FAQ / tuto » (repères et questions fréquentes) et « Glossaire » (vocabulaire, métiers anciens, aides à la lecture, dictionnaire personnel)
        if(state.maintenanceTab==='faq'){
            $('#workspace').innerHTML=`<section class="page help-page"><header class="page-header"><div><span class="eyebrow">FAQ / TUTO</span><h2>Comment faire ?</h2><p>Repères rapides pour utiliser l’outil, et les questions fréquentes : pose ta question dans la recherche.</p></div><div class="page-actions"><button type="button" class="button secondary" data-help-goto="help">📖 Glossaire</button></div></header>
            <div class="help-guide-grid">${quickHelp.map(([title,text])=>`<article class="help-guide-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join('')}</div>
            ${window.LCNDA_EXT?.faqHtml?.()||''}</section>`;
            $('[data-help-goto]')?.addEventListener('click',()=>{state.maintenanceTab='help';renderSidebar();renderHelpGlossary();});
            return;
        }
        $('#workspace').innerHTML=`<section class="page help-page"><header class="page-header"><div><span class="eyebrow">GLOSSAIRE</span><h2>Le vocabulaire</h2><p>Vocabulaire généalogique, métiers anciens, aides à la lecture des actes et ton dictionnaire personnel.</p></div><div class="page-actions"><button type="button" class="button secondary" data-help-goto="faq">❓ FAQ / tuto</button></div></header>
        <section class="maintenance-panel full-width help-intro"><h3>Glossaire de généalogie</h3><p>Les termes sont classés par ordre alphabétique. Cette base pourra ensuite recevoir les tutos propres aux modules : personnes, médias, battues, enquêtes, export et maintenance.</p></section>
        <div class="help-glossary">${glossaryHtml}</div>
        <section class="maintenance-panel full-width help-intro old-occupations-intro"><h3>Glossaire des métiers anciens</h3><p>Définitions courtes pour lire les actes et distinguer les statuts sociaux derrière les métiers. Le dictionnaire complet (plus de 500 métiers, outils, mots anciens, ancêtres) est dans Listes : <button type="button" class="table-link" data-trades-list>🛠️ Métiers anciens →</button></p></section>
        <div class="help-glossary">${oldOccupationsHtml}</div>
        ${readingAidsHtml()}
        ${dictionaryHtml}</section>`;
        $('[data-help-goto]')?.addEventListener('click',()=>{state.maintenanceTab='faq';renderSidebar();renderHelpGlossary();});
        bindReadingAids();
        const dictionaryForm=$('#personal-dictionary-form');
        const resetDictionaryForm=()=>{dictionaryForm?.reset();if(dictionaryForm)dictionaryForm.elements.id.value='';const submit=dictionaryForm?.querySelector('[type="submit"]');if(submit)submit.textContent='Ajouter au dictionnaire';};
        dictionaryForm?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;try{await api('save_personal_dictionary_entry',{}, {method:'POST',body:formObject(form)});toast(form.elements.id.value?'Définition modifiée.':'Définition ajoutée.');await renderHelpGlossary();}catch(error){toast(error.message,'error');}});
        $('#personal-dictionary-reset')?.addEventListener('click',resetDictionaryForm);
        $$('[data-edit-personal-dictionary]').forEach(button=>button.addEventListener('click',()=>{const entry=entries.find(item=>Number(item.id)===Number(button.dataset.editPersonalDictionary));if(!entry||!dictionaryForm)return;dictionaryForm.elements.id.value=entry.id;dictionaryForm.elements.term.value=entry.term||'';dictionaryForm.elements.category.value=entry.category||'other';dictionaryForm.elements.definition.value=entry.definition||'';dictionaryForm.querySelector('[type="submit"]').textContent='Enregistrer la modification';dictionaryForm.scrollIntoView({behavior:'smooth',block:'center'});}));
        $$('[data-delete-personal-dictionary]').forEach(button=>button.addEventListener('click',async()=>{const id=Number(button.dataset.deletePersonalDictionary);if(!id||!await confirmBox('',{title:'Supprimer cette définition ?',okLabel:'Supprimer la définition'}))return;try{await api('delete_personal_dictionary_entry',{}, {method:'POST',body:{id}});toast('Définition supprimée.');await renderHelpGlossary();}catch(error){toast(error.message,'error');}}));
    }
    async function renderLabelTools(token=++state.workspaceToken){
        const data=await api('labels');
        if(token!==state.workspaceToken||state.module!=='maintenance'||state.maintenanceTab!=='labels')return;
        const linkedItemsHtml=label=>{
            const linked=label.linked||{};
            const parts=[];
            if(linked.persons&&linked.persons.length){parts.push('<div class="label-linked-section"><h4>Personnes</h4><div class="label-linked-cards">'+linked.persons.map(p=>{const birth=p.birth_date||p.birth_year||'?';const death=p.death_date||(p.living_status==='living'?'aujourd\u2019hui':p.death_year||'?');return '<button type="button" class="label-linked-card" data-open-person="'+p.id+'"><span class="label-linked-icon gender-'+(p.gender||'unknown')+'">★</span><div><strong>'+escapeHtml([p.first_name,p.last_name].filter(Boolean).join(' ')||'Personne sans nom')+'</strong><small>'+escapeHtml(birth+' — '+death)+'</small></div></button>';}).join('')+'</div></div>');}
            if(linked.events&&linked.events.length){parts.push('<div class="label-linked-section"><h4>Événements</h4><div class="label-linked-cards">'+linked.events.map(e=>{const person=[e.first_name,e.last_name].filter(Boolean).join(' ')||'Personne non rattachée';return '<button type="button" class="label-linked-card"'+(e.person_id?' data-open-person="'+e.person_id+'"':'')+' ><span class="label-linked-icon" style="--event-color:'+escapeHtml(e.color||'#0066cc')+'">'+typeGlyph(e.icon,e.gedcom_tag)+'</span><div><small style="color:var(--blue)">'+escapeHtml(e.date_text||String(e.year||'Date inconnue'))+'</small><strong>'+escapeHtml(e.type_label)+'</strong><small>'+escapeHtml(person+(e.place_name?' · '+e.place_name:'')+(e.country?', '+e.country:''))+'</small></div></button>';}).join('')+'</div></div>');}
            if(linked.notes&&linked.notes.length){parts.push('<div class="label-linked-section"><h4>Notes</h4><div class="label-linked-cards">'+linked.notes.map(n=>'<button type="button" class="label-linked-card"'+(n.person_id?' data-open-person="'+n.person_id+'"':'')+' ><span class="label-linked-icon">\u{1F4DD}</span><div><strong>'+escapeHtml(n.title||'Note sans titre')+'</strong><small>'+escapeHtml(n.person_name||'')+'</small></div></button>').join('')+'</div></div>');}
            if(linked.sources&&linked.sources.length){parts.push('<div class="label-linked-section"><h4>Sources</h4><div class="label-linked-cards">'+linked.sources.map(s=>'<button type="button" class="label-linked-card"'+(s.person_id?' data-open-person="'+s.person_id+'"':'')+' ><span class="label-linked-icon">\u{1F4C4}</span><div><strong>'+escapeHtml(s.title||'Source sans titre')+'</strong><small>'+escapeHtml([s.agency,s.person_name].filter(Boolean).join(' · '))+'</small></div></button>').join('')+'</div></div>');}
            if(linked.census&&linked.census.length){parts.push('<div class="label-linked-section"><h4>Recensements</h4><div class="label-linked-cards">'+linked.census.map(c=>'<div class="label-linked-card is-static"><span class="label-linked-icon">#</span><div><strong>Recensement '+escapeHtml(String(c.year))+'</strong><small>'+escapeHtml([c.address,c.place_name].filter(Boolean).join(' · ')||'Lieu non renseigné')+'</small></div></div>').join('')+'</div></div>');}
            if(linked.views&&linked.views.length){parts.push('<div class="label-linked-section"><h4>Vues enregistrées</h4><div class="label-linked-cards">'+linked.views.map(v=>'<div class="label-linked-card is-static"><span class="label-linked-icon">▣</span><div><strong>'+escapeHtml(v.name||'Vue sans nom')+'</strong><small>'+escapeHtml(v.module==='map'?'Carte':v.module==='graph'?'Graphique':v.module)+'</small></div></div>').join('')+'</div></div>');}
            return parts.length?'<div class="label-linked-items">'+parts.join('')+'</div>':'';
        };
        $('#workspace').innerHTML='<section class="page"><header class="page-header"><div><span class="eyebrow">ÉTIQUETTES</span><h2>Catégoriser sans modifier les actes</h2><p>Une étiquette peut être attachée à une personne, un lieu, un média, un recensement, une note, une source, une enquête ou une vue enregistrée.</p></div></header><form class="maintenance-panel" id="label-form"><h3>Créer / modifier une étiquette</h3><input type="hidden" name="id"><div class="form-grid" style="padding:0"><label>Nom<input name="name" required placeholder="À vérifier, branche maternelle, acte illisible…"></label><label>Couleur<input type="color" name="color" value="#0066cc"></label><label class="span-2">Description<textarea name="description" rows="3" placeholder="Usage prévu, règle de classement, nuance…"></textarea></label></div><div class="page-actions"><button class="button" type="submit">Enregistrer</button><button class="button secondary" type="reset">Nouvelle étiquette</button></div></form>'+(data.labels.length?'<div class="page-actions"><button type="button" class="button small secondary" id="label-admin-show-all">Afficher tous les éléments</button><button type="button" class="button small secondary" id="label-admin-hide-all">Masquer tous les éléments</button></div>':'')+'<div class="label-admin-grid">'+(data.labels.map(label=>{const linked=linkedItemsHtml(label)||'<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucun élément rattaché.</span></p>';return '<article class="label-admin-card label-list-row"><header><div>'+labelChip(label)+'<small>'+plural(label.link_count||0,'utilisation')+(label.entity_types?' · '+escapeHtml(labelEntityTypesText(label.entity_types)):'')+' </small></div><div class="inline-actions">'+actionButton('edit','Modifier','data-edit-label="'+label.id+'"')+actionButton('delete','Supprimer','data-delete-label="'+label.id+'"')+'</div></header>'+(label.description?'<p>'+escapeHtml(label.description)+'</p>':'')+'<button type="button" class="button small secondary label-list-toggle" data-label-toggle="'+label.id+'">Masquer les éléments</button><div class="label-list-body">'+linked+'</div></article>';}).join('')||emptyState({text: 'Aucune étiquette pour l’instant', icon:'🏷️',action:{label:'＋ Nouvelle étiquette',attrs:'data-empty-focus="#label-form [name=name]"'}}))+'</div></section>';
        const form=$('#label-form');
        form.addEventListener('submit',async event=>{event.preventDefault();await api('save_label',{}, {method:'POST',body:formObject(form)});state.currentLabelsCache=null;toast('Étiquette enregistrée.');await renderLabelTools();});
        form.addEventListener('reset',()=>setTimeout(()=>{form.elements.id.value='';form.elements.color.value='#0066cc';},0));
        $$('[data-edit-label]').forEach(button=>button.addEventListener('click',()=>{const label=data.labels.find(item=>Number(item.id)===Number(button.dataset.editLabel));if(!label)return;form.elements.id.value=label.id;form.elements.name.value=label.name||'';form.elements.color.value=label.color||'#0066cc';form.elements.description.value=label.description||'';form.scrollIntoView({behavior:'smooth',block:'start'});}));
        $$('[data-delete-label]').forEach(button=>button.addEventListener('click',async()=>{/* H7 : supprimée tout de suite (les éléments restent), « ↶ Annuler » la remet, posée aux mêmes endroits */const id=Number(button.dataset.deleteLabel);await window.LCNDA_APP.deleteWithUndo({action:'delete_label',body:{id},type:'label',id,message:'Étiquette supprimée',after:async()=>{state.currentLabelsCache=null;if(state.module!=='maintenance'||state.maintenanceTab!=='labels')return;try{await renderLabelTools();}catch(error){console.error(error);}}});}));
        $$('.label-linked-card[data-open-person]').forEach(btn=>btn.addEventListener('click',()=>{const id=Number(btn.dataset.openPerson);if(id){state.currentPersonId=id;setModule('personnes');}}));
        bindLabelListToggles();
        $('#label-admin-show-all')?.addEventListener('click',()=>{$$('.label-list-body').forEach(body=>{body.hidden=false;});$$('.label-list-toggle').forEach(btn=>btn.textContent='Masquer les éléments');});
        $('#label-admin-hide-all')?.addEventListener('click',()=>{$$('.label-list-body').forEach(body=>{body.hidden=true;});$$('.label-list-toggle').forEach(btn=>btn.textContent='Afficher les éléments');});
    }

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderMaintenance, renderMaintenanceSidebar});
    if (state.module === 'maintenance' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
