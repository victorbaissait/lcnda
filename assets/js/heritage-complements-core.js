/* LCNDA — 🧩 Compléter quatre outils existants : ce qui se calcule sans écran (aussi require() dans Node, pour les essais).
 * Maquette validée : docs/design/complements-existants.html. Serveur : lib/complements.php (+ etudes_notaire, homonymes_contact,
 * doutes, visite_mobile). Écrans : heritage-complements.js (🏛 études, ⚠️ homonymes, ⚙️ réglages) et heritage-complements-2.js
 * (📋 doutes, 📱 visite aux archives).
 *  - SPEC : chaque choix de la maquette est un réglage, l'option conseillée d'abord (c'est elle qui est réglée au départ) ;
 *  - délai constaté (moyenne ou médiane, jamais un délai légal), branche d'un Sosa, photos du jour rangées par l'heure ;
 *  - la page .html de la visite (un seul fichier, aucune requête, texte posé avec textContent, photos dans IndexedDB) et son .zip
 *    (results.json + photos/, sans compression, CRC32), la somme FNV-1a que le serveur recalcule (lib/visite_mobile.php vm_fnv).
 */
(function (root) {
    'use strict';
    const SPEC = [
        {part: 'A', title: '🏛 Études de notaire', items: [
            {key: 'etude_where', label: 'Où ranger les études', options: [['services', 'Dans 🏛 Services d’archives, sorte « Étude de notaire »'], ['separate', 'Une liste « Études de notaire » à part']]},
            {key: 'delay_stat', label: 'Délai constaté', options: [['mean', 'Moyenne, avec le plus court et le plus long'], ['median', 'Médiane (moins sensible à une réponse très lente)'], ['none', 'Ne pas l’afficher']]},
            {key: 'delay_min', label: 'Nombre de réponses avant d’afficher un délai', options: [[3, '3'], [5, '5'], [1, '1']]},
            {key: 'delay_scope', label: 'Les courriers comptés', options: [['3y', 'Ceux des 3 dernières années'], ['all', 'Tous']]},
            {key: 'picker_typed', label: 'Ce que propose le menu de choix', options: [['with', 'Les études, puis les noms déjà tapés'], ['offices', 'Les études seulement']]},
            {key: 'notary_pick', label: 'Le notaire chargé du dossier', options: [['optional', 'Un notaire de l’étude, facultatif'], ['office', 'Seulement l’étude']]},
            {key: 'group_check', label: 'Les propositions de regroupement', options: [['agree', 'Cochées quand le nom et la ville concordent'], ['none', 'Toutes décochées']]},
            {key: 'group_banner', label: 'Le bandeau « notaires sans fiche »', options: [['show', 'Montré dans la liste des études'], ['never', 'Jamais (on passe par ⋯)']]}]},
        {part: 'B', title: '⚠️ Homonymes', items: [
            {key: 'hom_years', label: 'Écart d’années de naissance', options: [[2, '2 ans'], [5, '5 ans'], [10, '10 ans']]},
            {key: 'hom_place', label: 'Lieu de naissance', options: [['dept', 'Même département, ou lieu inconnu'], ['commune', 'Même commune seulement'], ['any', 'Peu importe le lieu']]},
            {key: 'hom_when', label: 'Quand l’afficher', options: [['each', 'À chaque courrier, appel et questionnaire'], ['first', 'Au premier contact d’un héritier seulement'], ['never', 'Jamais']]},
            {key: 'hom_after_ok', label: 'Après « ✓ C’est bien lui »', options: [['again', 'L’alerte revient au prochain contact'], ['case', 'Elle ne revient plus dans ce dossier']]},
            {key: 'hom_scope', label: 'Où chercher l’homonyme', options: [['base', 'Toute la base'], ['cases', 'Seulement les autres dossiers']]}]},
        {part: 'C', title: '📋 Tous les doutes', items: [
            {key: 'doutes_name', label: 'Nom de la liste', options: [['all', '📋 Tous les doutes'], ['verify', 'À vérifier'], ['review', 'Points à revoir']]},
            {key: 'doutes_nosource', label: '« Sans source »', options: [['sosa', 'Seulement les ancêtres Sosa'], ['all', 'Toute la base'], ['none', 'Pas du tout']]},
            {key: 'doutes_seen_back', label: 'Une ligne marquée vue', options: [['again', 'Revient si la chose change'], ['never', 'Ne revient jamais']]},
            {key: 'doutes_seen_show', label: 'Les lignes vues', options: [['hide', 'Cachées par le filtre de départ « Pas encore vus »'], ['pale', 'Montrées en pâle']]},
            {key: 'doutes_succ', label: 'Pistes du successoral', options: [['apart', 'À part, dans les dossiers'], ['with', 'Aussi dans cette liste']]},
            {key: 'doutes_widget', label: 'Le widget', options: [['numbers', 'Les trois nombres et le plus grave'], ['top5', 'Les 5 premières lignes']]}]},
        {part: 'D', title: '📱 Visite aux archives', items: [
            {key: 'visite_mode', label: 'Comment emporter la visite', options: [['page', 'Une page .html à ouvrir sur le téléphone'], ['paper', 'La feuille imprimée et les photos du téléphone']]},
            {key: 'visite_living', label: 'Ce qui part dans la page', options: [['no', 'Sans les vivants'], ['yes', 'Avec les vivants']]},
            {key: 'visite_photo_px', label: 'Les photos', options: [[2000, 'Réduites à 2000 px'], [0, 'Taille d’origine']]},
            {key: 'visite_found', label: 'Une naissance trouvée', options: [['digest', 'Reste un dépouillement, tu la reportes'], ['propose', 'Proposer « → Reporter sur la fiche » dans la revue']]},
            {key: 'visite_done', label: 'Après le rangement', options: [['auto', 'Visite marquée « faite »'], ['manual', 'À la main']]}]},
    ];
    const DEFAULTS = Object.fromEntries(SPEC.flatMap(g => g.items.map(i => [i.key, i.options[0][0]])));
    const settings = raw => { const o = {...DEFAULTS}; for (const g of SPEC) for (const it of g.items) { const v = raw?.[it.key]; const hit = it.options.find(x => String(x[0]) === String(v)); if (hit) o[it.key] = hit[0]; } return o; };
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /** ⏳ le délai constaté : {n, enough, days, min, max} — seulement les courriers dont la date de réponse est notée */
    function delay(rows, set = DEFAULTS, today = new Date()) {
        const cut = set.delay_scope === '3y' ? new Date(today.getFullYear() - 3, today.getMonth(), today.getDate()).toISOString().slice(0, 10) : '0000-00-00';
        const ok = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
        const vals = rows.map(r => { const e = String(r.date_envoi || '').slice(0, 10), x = String(r.recu_le || r.reponse_le || '').slice(0, 10); if (!ok(e) || !ok(x) || e < cut) return null; const d = Math.round((Date.parse(x) - Date.parse(e)) / 864e5); return d >= 0 ? d : null; }).filter(v => v !== null).sort((a, b) => a - b);
        const n = vals.length, enough = n > 0 && n >= Number(set.delay_min);
        let days = null;
        if (enough && set.delay_stat !== 'none') days = set.delay_stat === 'median' ? (n % 2 ? vals[(n - 1) / 2] : Math.round((vals[n / 2 - 1] + vals[n / 2]) / 2)) : Math.round(vals.reduce((a, b) => a + b, 0) / n);
        return {n, enough, days, min: n ? vals[0] : null, max: n ? vals[n - 1] : null};
    }
    /** la pastille d'un courrier en attente : jaune au-delà de l'habitude, rouge au-delà du double */
    const waitLevel = (wait, usual) => (!usual ? '' : wait > 2 * usual ? 'red' : wait > usual ? 'yellow' : '');
    /** 2 et ses ancêtres : branche paternelle ; 3 et ses ancêtres : maternelle */
    const branchOf = sosa => (sosa < 2 ? '' : sosa.toString(2)[1] === '0' ? 'p' : 'm');

    /** ⤒ Photos du jour : rangées par l'heure de prise de vue, coupées aux plus grands écarts, une part par cote (dans l'ordre des cotes) */
    function assignPhotos(photos, itemIds) {
        const list = [...photos].map((p, i) => ({...p, i})).sort((a, b) => (a.time || 0) - (b.time || 0) || a.i - b.i);
        const out = {};
        if (!list.length || !itemIds.length) return out;
        const k = Math.min(itemIds.length, list.length);
        const gaps = list.slice(1).map((p, i) => ({at: i + 1, gap: (p.time || 0) - (list[i].time || 0)})).sort((a, b) => b.gap - a.gap || a.at - b.at).slice(0, k - 1).map(g => g.at).sort((a, b) => a - b);
        let part = 0;
        list.forEach((p, i) => { if (gaps.includes(i)) part++; out[p.i] = itemIds[Math.min(part, itemIds.length - 1)]; });
        return out;
    }
    /** l'heure de prise de vue d'une photo JPEG (EXIF DateTimeOriginal), sinon null */
    function exifTime(buf) {
        try {
            const v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return null;
            let o = 2;
            while (o < v.byteLength - 4) {
                const m = v.getUint16(o), len = v.getUint16(o + 2);
                if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {
                    const t = o + 10, le = v.getUint16(t) === 0x4949, u16 = x => v.getUint16(x, le), u32 = x => v.getUint32(x, le);
                    const find = (ifd, tag) => { const n = u16(t + ifd); for (let i = 0; i < n; i++) { const e = t + ifd + 2 + i * 12; if (u16(e) === tag) return u32(e + 8); } return null; };
                    const exif = find(u32(t + 4), 0x8769); const at = exif !== null ? find(exif, 0x9003) : find(u32(t + 4), 0x0132);
                    if (at === null) return null;
                    const s = String.fromCharCode(...new Uint8Array(buf, t + at, 19)); const m2 = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
                    return m2 ? new Date(+m2[1], +m2[2] - 1, +m2[3], +m2[4], +m2[5], +m2[6]).getTime() : null;
                }
                o += 2 + len;
            }
        } catch (_) {}
        return null;
    }

    /* ═════ la somme et le .zip (mêmes calculs dans la page du téléphone) ═════ */
    const FNV_SRC = "function fnv(s){var h=0x811c9dc5;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return ('0000000'+h.toString(16)).slice(-8);}";
    const ZIP_SRC = "var CRC=(function(){var t=[],c,n,k;for(n=0;n<256;n++){c=n;for(k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();"
        + "function crc32(b){var c=0xFFFFFFFF;for(var i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}"
        + "function zip(files){var parts=[],dir=[],off=0,d=new Date(),dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&65535,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&65535;"
        + "function u16(a,v){a.push(v&255,(v>>>8)&255);}function u32(a,v){a.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255);}"
        + "files.forEach(function(f){var name=[],i;for(i=0;i<f.name.length;i++)name.push(f.name.charCodeAt(i)&127);var c=crc32(f.data),h=[];u32(h,0x04034b50);u16(h,20);u16(h,0);u16(h,0);u16(h,dt);u16(h,dd);u32(h,c);u32(h,f.data.length);u32(h,f.data.length);u16(h,name.length);u16(h,0);"
        + "var hd=new Uint8Array(h.concat(name));parts.push(hd,f.data);var e=[];u32(e,0x02014b50);u16(e,20);u16(e,20);u16(e,0);u16(e,0);u16(e,dt);u16(e,dd);u32(e,c);u32(e,f.data.length);u32(e,f.data.length);u16(e,name.length);u16(e,0);u16(e,0);u16(e,0);u16(e,0);u32(e,0);u32(e,off);dir.push(new Uint8Array(e.concat(name)));off+=hd.length+f.data.length;});"
        + "var size=0;dir.forEach(function(x){size+=x.length;});var end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,files.length);u16(end,files.length);u32(end,size);u32(end,off);u16(end,0);return parts.concat(dir,[new Uint8Array(end)]);}";
    // eslint-disable-next-line no-new-func
    const lib = new Function(`${FNV_SRC}${ZIP_SRC}return {fnv:fnv,crc32:crc32,zip:zip};`)();

    /* ═════ 📱 la page à emporter ═════ */
    const PAGE_CSS = `:root{color-scheme:light dark;--ink:#1d1d1f;--paper:#f7f6f2;--card:#fff;--line:#d3cfc6;--muted:#5f5b55;--blue:#0a5bd8;--ok:#1f7a3a;--warn:#8a5a00;--soft:#e8f0ff}
@media (prefers-color-scheme:dark){:root{--ink:#f2f0ec;--paper:#18181a;--card:#242427;--line:#4d4b47;--muted:#bdb7ad;--blue:#77aeff;--ok:#6fd08c;--warn:#f0c060;--soft:#1d2a40}}
*{box-sizing:border-box}html,body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.45 -apple-system,system-ui,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:14px 14px 120px}h1{font-size:1.25rem;margin:.2rem 0}.vm-sub{color:var(--muted);margin:0 0 .6rem}.vm-count{float:right;font-weight:700;color:var(--blue)}
.vm-off{background:var(--soft);border-radius:10px;padding:8px 12px;margin:0 0 12px;font-size:.95rem}.vm-warn{color:var(--warn);font-weight:600}
.vm-c{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:0 0 12px}.vm-c.is-done{border-color:var(--ok)}
.vm-cote{font-weight:800}.vm-what{margin:.15rem 0}.vm-known{color:var(--muted);font-size:.9rem;margin:.2rem 0 .5rem;padding-left:1rem}
.vm-res{display:flex;flex-wrap:wrap;gap:6px;margin:.4rem 0}.vm-res button,.vm-btn{font:inherit;font-size:.95rem;min-height:44px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.vm-res button[aria-pressed=true]{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:700}textarea,input[type=text]{width:100%;font:inherit;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--paper);color:var(--ink)}
.vm-ph{display:flex;flex-wrap:wrap;gap:6px;margin:.4rem 0}.vm-ph figure{margin:0;position:relative}.vm-ph img{width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
.vm-ph button{position:absolute;top:2px;right:2px;min-height:28px;width:28px;padding:0;border-radius:50%}.vm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.vm-bar{position:fixed;left:0;right:0;bottom:0;background:var(--paper);border-top:1px solid var(--line);padding:10px 14px;display:flex;flex-direction:column;gap:6px;align-items:stretch}
.vm-main{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:800;min-height:52px}.vm-state{font-size:.9rem;color:var(--ok);min-height:1.2em}.vm-state.is-warn{color:var(--warn)}
@media (min-width:700px){.vm-bar{flex-direction:row;justify-content:center}.vm-main{min-width:320px}}`;
    /** le script de la page : aucune requête, tout texte posé par textContent ; résultats dans localStorage, photos dans IndexedDB */
    const PAGE_JS = `(function(){'use strict';var D,T;try{D=JSON.parse(document.getElementById('vm-data').textContent);T=JSON.parse(document.getElementById('vm-t').textContent);}catch(e){return;}
${FNV_SRC}${ZIP_SRC}
var KEY='lcnda-visite-'+D.visit,S={items:{},extra:[]},db=null,urls={},box=document.getElementById('vm-list'),st=document.getElementById('vm-state'),cnt=document.getElementById('vm-count');
function $(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e;}
function say(t,w){st.textContent=t;st.className='vm-state'+(w?' is-warn':'');}
function ls(){try{return window.localStorage;}catch(e){return null;}}
function load(){var s=ls();if(!s)return;try{var o=JSON.parse(s.getItem(KEY)||'null');if(o&&typeof o==='object'){if(o.items&&typeof o.items==='object')S.items=o.items;if(Array.isArray(o.extra))S.extra=o.extra.slice(0,60);}}catch(e){}}
function keep(){var s=ls();if(!s){say(T.nostore,true);return;}try{s.setItem(KEY,JSON.stringify(S));var d=new Date();say(T.kept.replace('{time}',d.getHours()+':'+String(d.getMinutes()).padStart(2,'0')));}catch(e){say(T.nostore,true);}}
function idb(cb){try{var r=indexedDB.open('lcnda-visite',1);r.onupgradeneeded=function(){r.result.createObjectStore('p');};r.onsuccess=function(){db=r.result;cb(true);};r.onerror=function(){cb(false);};}catch(e){cb(false);}}
function put(name,blob,cb){if(!db)return cb(false);try{var tx=db.transaction('p','readwrite');tx.objectStore('p').put(blob,D.visit+'/'+name);tx.oncomplete=function(){cb(true);};tx.onerror=function(){cb(false);};}catch(e){cb(false);}}
function get(name,cb){if(!db)return cb(null);try{var r=db.transaction('p').objectStore('p').get(D.visit+'/'+name);r.onsuccess=function(){cb(r.result||null);};r.onerror=function(){cb(null);};}catch(e){cb(null);}}
function del(name){try{db.transaction('p','readwrite').objectStore('p').delete(D.visit+'/'+name);}catch(e){}}
function shrink(file,cb){var max=D.photo_px||0;var u=URL.createObjectURL(file),im=new Image();im.onload=function(){var w=im.naturalWidth,h=im.naturalHeight,k=max&&Math.max(w,h)>max?max/Math.max(w,h):1;
if(k===1&&/jpe?g$/i.test(file.type||'')){URL.revokeObjectURL(u);cb(file);return;}var c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);c.toBlob(function(b){cb(b||file);},'image/jpeg',0.86);};
im.onerror=function(){URL.revokeObjectURL(u);cb(null);};im.src=u;}
function rec(k){return S.items[k]||(S.items[k]={result:'',note:'',photos:[]});}
function done(){var n=0;D.items.forEach(function(it){var r=S.items[it.id];if(r&&r.result)n++;});cnt.textContent=n+' / '+D.items.length;}
function photos(wrap,r){wrap.textContent='';(r.photos||[]).forEach(function(name){var f=$('figure'),im=$('img'),x=$('button',null,'×');im.alt=name;x.type='button';x.setAttribute('aria-label',T.remove);
get(name,function(b){if(b){urls[name]=urls[name]||URL.createObjectURL(b);im.src=urls[name];}});x.addEventListener('click',function(){r.photos=r.photos.filter(function(p){return p!==name;});del(name);keep();photos(wrap,r);});f.appendChild(im);f.appendChild(x);wrap.appendChild(f);});}
function card(r,head,sub,known,isExtra){var c=$('section','vm-c'),h=$('div','vm-cote',head);c.appendChild(h);if(sub)c.appendChild($('div','vm-what',sub));
if(known&&known.length){var ul=$('ul','vm-known');known.forEach(function(k){ul.appendChild($('li',null,k));});c.appendChild(ul);}
if(isExtra){var a=$('input');a.type='text';a.placeholder=T.cote;a.value=r.cote||'';a.addEventListener('input',function(){r.cote=a.value.slice(0,200);keep();});var b=$('input');b.type='text';b.placeholder=T.what;b.value=r.title||'';b.addEventListener('input',function(){r.title=b.value.slice(0,300);keep();});c.appendChild(a);c.appendChild(b);}
var rs=$('div','vm-res');[['found',T.found],['none',T.none],['partial',T.partial],['not_consulted',T.not_consulted]].forEach(function(o){var bt=$('button',null,o[1]);bt.type='button';bt.setAttribute('aria-pressed',String(r.result===o[0]));
bt.addEventListener('click',function(){r.result=r.result===o[0]?'':o[0];[].forEach.call(rs.children,function(x){x.setAttribute('aria-pressed','false');});bt.setAttribute('aria-pressed',String(r.result===o[0]));c.classList.toggle('is-done',!!r.result);keep();done();});rs.appendChild(bt);});c.appendChild(rs);
var n=$('textarea');n.rows=2;n.placeholder=T.note;n.value=r.note||'';n.addEventListener('input',function(){r.note=n.value.slice(0,4000);keep();});c.appendChild(n);
var ph=$('div','vm-ph');c.appendChild(ph);photos(ph,r);
if(!D.photos_off){var row=$('div','vm-row'),lab=$('label','vm-btn',T.photo),inp=$('input');inp.type='file';inp.accept='image/*';inp.setAttribute('capture','environment');inp.hidden=true;lab.appendChild(inp);
inp.addEventListener('change',function(){var f=inp.files&&inp.files[0];inp.value='';if(!f)return;shrink(f,function(b){if(!b){say(T.notimage,true);return;}var name='p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)+'.jpg';
put(name,b,function(ok){if(!ok){say(T.nophoto,true);return;}r.photos=(r.photos||[]).concat(name).slice(0,40);keep();photos(ph,r);});});});row.appendChild(lab);c.appendChild(row);}
c.classList.toggle('is-done',!!r.result);return c;}
function draw(){box.textContent='';D.items.forEach(function(it){var r=rec(it.id);var sub=[it.title,it.place].filter(Boolean).join(' · ');box.appendChild(card(r,it.cote,sub,(it.who?[it.who]:[]).concat(it.known||[]),false));});
S.extra.forEach(function(r){box.appendChild(card(r,T.extra_head,'',[],true));});done();}
document.getElementById('vm-add').addEventListener('click',function(){S.extra.push({cote:'',title:'',result:'',note:'',photos:[]});keep();draw();});
function read(b){return new Promise(function(ok){var fr=new FileReader();fr.onload=function(){ok(new Uint8Array(fr.result));};fr.onerror=function(){ok(null);};fr.readAsArrayBuffer(b);});}
document.getElementById('vm-save').addEventListener('click',function(){
var items=D.items.map(function(it){var r=S.items[it.id]||{};return {id:it.id,result:r.result||'',note:(r.note||'').trim(),photos:(r.photos||[]).slice(),at:r.at||''};}).filter(function(x){return x.result||x.note||x.photos.length;});
var extra=S.extra.map(function(r){return {cote:(r.cote||'').trim(),title:(r.title||'').trim(),note:(r.note||'').trim(),result:r.result||'',photos:(r.photos||[]).slice(),at:''};}).filter(function(x){return x.cote||x.result||x.note||x.photos.length;});
if(!items.length&&!extra.length){say(T.empty,true);return;}
var names=[];items.concat(extra).forEach(function(x){names=names.concat(x.photos);});
Promise.all(names.map(function(n){return new Promise(function(ok){get(n,function(b){ok(b?read(b):null);});});})).then(function(bufs){var files=[],miss=0;
bufs.forEach(function(b,i){if(b)files.push({name:'photos/'+names[i],data:b});else miss++;});var keepN={};files.forEach(function(f){keepN[f.name.slice(7)]=1;});
items.forEach(function(x){x.photos=x.photos.filter(function(n){return keepN[n];});});extra.forEach(function(x){x.photos=x.photos.filter(function(n){return keepN[n];});});
var out={format:D.format,version:1,visit:D.visit,checksum:D.checksum,saved_at:new Date().toISOString(),items:items,extra:extra,sum:fnv(JSON.stringify([items,extra]))};
var js=new TextEncoder().encode(JSON.stringify(out,null,1));files.unshift({name:'results.json',data:js});
var blob=new Blob(zip(files),{type:'application/zip'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=D.file+'.lcnda-visite.zip';document.body.appendChild(a);a.click();
setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},3000);say(T.saved.replace('{name}',a.download)+(miss?' '+T.missing:''),!!miss);});});
load();idb(function(ok){if(!ok&&!D.photos_off)say(T.nophoto,true);draw();});})();`;
    /** la page entière (data : la réponse de visite_render ; T : les textes déjà traduits) */
    function visitPageHtml(data, T, lang = 'fr') {
        const d = {...data, file: data.file || 'visite'};
        const json = s => JSON.stringify(s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        const head = [d.center, d.date].filter(Boolean).join(' · ');
        return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
            + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">`
            + `<meta name="referrer" content="no-referrer"><title>${esc(T.page_title.replace('{what}', head))}</title><style>${PAGE_CSS}</style></head><body><main>`
            + `<span class="vm-count" id="vm-count" aria-live="polite"></span><h1>🗄 ${esc(head)}</h1>${d.hours ? `<p class="vm-sub">${esc(d.hours)}</p>` : ''}${d.room ? `<p class="vm-sub">${esc(d.room)}</p>` : ''}`
            + `<p class="vm-off">✈️ ${esc(T.offline)}</p>${d.photos_off ? `<p class="vm-sub">🚫📷 ${esc(T.photos_off)}</p>` : ''}<div id="vm-list"></div>`
            + `<button type="button" class="vm-btn" id="vm-add">${esc(T.add)}</button></main>`
            + `<div class="vm-bar"><button type="button" class="vm-btn vm-main" id="vm-save">${esc(T.save)}</button><span class="vm-state" id="vm-state" role="status" aria-live="polite"></span></div>`
            + `<script id="vm-data" type="application/json">${json(d)}</script><script id="vm-t" type="application/json">${json(T)}</script><script>${PAGE_JS}</script></body></html>`;
    }
    const PAGE_TEXTS = ['page_title', 'offline', 'photos_off', 'add', 'save', 'found', 'none', 'partial', 'not_consulted', 'note', 'photo', 'remove', 'cote', 'what', 'extra_head', 'kept', 'nostore', 'nophoto', 'notimage', 'empty', 'saved', 'missing'];

    const api = {SPEC, DEFAULTS, settings, esc, delay, waitLevel, branchOf, assignPhotos, exifTime, fnv: lib.fnv, crc32: lib.crc32, zip: lib.zip, visitPageHtml, PAGE_TEXTS, PAGE_JS, PAGE_CSS};
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_COMPL_CORE = api;
})(typeof window !== 'undefined' ? window : null);
