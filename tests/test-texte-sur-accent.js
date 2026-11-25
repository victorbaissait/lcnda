'use strict';
/**
 * Texte écrit SUR la couleur principale (bouton actif, onglet choisi, ligne sélectionnée…) : node tests/test-texte-sur-accent.js
 * --on-blue vaut blanc s'il se lit bien sur la couleur principale, sinon presque noir (bleu clair du thème sombre).
 * Thème sombre et thème clair : aucun texte sur le bleu sous 4,5:1 dans les pages principales ; en clair, le texte reste blanc.
 */
const path0=require('path');const root=path0.resolve(__dirname,'..');process.chdir(root);process.env.GENEALOGY_SKIP_REFERENCE='1';
const fs=require('fs'),os=require('os'),net=require('net'),path=require('path');const {spawn,spawnSync}=require('child_process');
let chromium;try{({chromium}=require('playwright'));}catch(_){console.log('Playwright absent : sauté');process.exit(0);}const {findPhp,devBundledPhp,phpRuntimeArgs}=require(root+'/electron/php-server');
(async()=>{const php=findPhp([devBundledPhp()]);const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acc-'));fs.mkdirSync(tmp+'/media');
const env={...process.env,GENEALOGY_DATA_DIR:tmp,GENEALOGY_MEDIA_DIR:tmp+'/media',GENEALOGY_SKIP_REFERENCE:'1'};
const r=spawnSync(php,[...phpRuntimeArgs(php),'-r',String.raw`require 'lib/paths.php';$p=new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite');$p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Pierre','MAZAUD','male','deceased'),('Marie','LACOMBE','female','deceased')");$p=null;require 'lib/bootstrap.php';db();echo 'ok';`],{cwd:root,env,encoding:'utf8'});if(r.status)throw r.stderr;
const port=await new Promise(res=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});});
const proc=spawn(php,[...phpRuntimeArgs(php),'-S','127.0.0.1:'+port,'-t',root,root+'/router.php'],{cwd:root,env,stdio:'ignore'});const base=`http://127.0.0.1:${port}/`;
for(let i=0;i<100;i++){try{await fetch(base+'api.php?action=kiosk_state');break;}catch(_){await new Promise(r=>setTimeout(r,100));}}
const b=await chromium.launch();const page=await b.newPage({viewport:{width:1440,height:900}});
await page.route(u=>!u.toString().startsWith(base),rt=>rt.abort());
await page.addInitScript(()=>{try{if(!localStorage.getItem('genealogie-design'))localStorage.setItem('genealogie-design',JSON.stringify({preset:'dark'}));}catch(_){}});
await page.goto(base);await page.waitForTimeout(1500);
const found={};
const mods=process.argv.slice(2).length?process.argv.slice(2):['dashboard','people','lists','sources','chronology','research','maintenance','map','charts','tresors'];
for(const m of mods){try{await page.evaluate(m=>window.LCNDA_APP.setModule(m),m);await page.waitForTimeout(1200);}catch(e){continue;}
 const res=await page.evaluate(()=>{const L=c=>{const m=c.match(/[\d.]+/g);if(!m)return null;const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return [.2126*f(+m[0])+.7152*f(+m[1])+.0722*f(+m[2]),m[3]===undefined?1:+m[3]];};
  const out=[];for(const el of document.querySelectorAll('body *')){if(!el.offsetParent&&el.tagName!=='BODY')continue;const cs=getComputedStyle(el);if(!/rgb\(77, 159, 255\)/.test(cs.backgroundColor))continue;
   const has=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.querySelector('*')&&el.innerText.trim();if(!has)continue;
   const a=L(cs.color);if(!a)continue;const bl=L('rgb(77,159,255)')[0];const cr=(Math.max(a[0],bl)+.05)/(Math.min(a[0],bl)+.05);
   if(cr<4.5)out.push((el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+'.'+[...el.classList].join('.'))+' color='+cs.color+' cr='+cr.toFixed(1));}
  return out;});
 res.forEach(x=>found[x]=(found[x]||m));}
const bad=Object.entries(found).map(([k,v])=>v+' | '+k);
const onDark=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--on-blue').trim());
const navDark=await page.evaluate(()=>{const n=document.querySelector('.nav-item.is-active');return n?getComputedStyle(n).color:null;});
await page.evaluate(()=>{localStorage.setItem('genealogie-design',JSON.stringify({preset:'portfolio'}));window.LCNDA_APP.applyDesign();});
const onLight=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--on-blue').trim());
const navLight=await page.evaluate(()=>{const n=document.querySelector('.nav-item.is-active');return n?getComputedStyle(n).color:null;});
await b.close();proc.kill();
let fail=0;const ok=(c,m)=>{console.log((c?'✓ ':'✗ ')+m);if(!c)fail++;};
ok(bad.length===0,'thème sombre : aucun texte sur le bleu sous 4,5:1'+(bad.length?'\n  '+bad.join('\n  '):''));
ok(onDark==='#111111'&&navDark==='rgb(17, 17, 17)','thème sombre : onglet actif écrit presque noir sur le bleu clair ('+onDark+', '+navDark+')');
ok(onLight==='#ffffff'&&navLight==='rgb(255, 255, 255)','thème clair : le texte sur le bleu reste blanc ('+onLight+', '+navLight+')');
console.log(fail?'\nÉCHEC':'\nTout est bon.');process.exit(fail?1:0);})();
