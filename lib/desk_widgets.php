<?php
declare(strict_types=1);

/**
 * 🪟 Widgets sur le bureau (PC, Mac, Linux) : quelques widgets du tableau de bord dans une petite fenêtre à part, en lecture
 * seule. Dans l'application de bureau, electron/main.js ouvre la fenêtre (sans cadre, toujours au-dessus ou non, position
 * retenue, au démarrage de l'ordinateur si on le coche) sur GET api.php?action=desk_widget_page&kind=… ; dans un navigateur,
 * GET api.php?action=desk_widget_file&kind=… donne un fichier .html autonome (données figées, à ouvrir d'un double-clic).
 * Interface : assets/js/heritage-desk-widgets.js. Électron : electron/desk-widgets.js.
 *
 * Sortes : today (🎂 Ce jour-là : anniversaires du jour et des 7 jours qui viennent, et ce qui s'est passé ce jour-là),
 * ancestor (🌳 un ancêtre, un nouveau chaque jour), photo (📷 photo du jour), countdown (⏳ compte à rebours vers une date).
 * Le fichier autonome suit la règle du partage F11 (aucune personne vivante, aucune fiche confidentielle, photos sans
 * personne cachée) ; la fenêtre de l'application de bureau, sur ton ordinateur, montre comme le tableau de bord (sauf les
 * fiches confidentielles).
 */

const DESK_KINDS = ['today' => ['🎂', 'Ce jour-là'], 'ancestor' => ['🌳', 'Un ancêtre'], 'photo' => ['📷', 'Photo du jour'], 'countdown' => ['⏳', 'Compte à rebours'], 'calc' => ['🧮', 'Calculette']];

function desk_widget_opts(array $q): array
{
    $kind = (string) ($q['kind'] ?? '');
    if (!isset(DESK_KINDS[$kind])) { throw new LcndaBadInput('Widget inconnu.'); }
    $label = mb_substr(trim((string) preg_replace('/[\x00-\x1f\x7f]+/u', ' ', is_scalar($q['label'] ?? '') ? (string) ($q['label'] ?? '') : '')), 0, 60);
    $date = is_string($q['date'] ?? null) && preg_match('/^(\d{4})-(\d\d)-(\d\d)$/', $q['date'], $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? $q['date'] : '';
    return ['kind' => $kind, 'label' => $label, 'date' => $date];
}

/** Les données du widget. $file = le fichier autonome (règle F11) ; sinon la fenêtre de bureau. */
function desk_widget_data(PDO $pdo, array $o, bool $file): array
{
    require_once __DIR__ . '/website.php';
    $pv = website_privacy($pdo);
    $show = static fn(int $id) => $id > 0 && isset($pv['persons'][$id]) && ($file ? !isset($pv['hidden'][$id]) : ($pv['hidden'][$id] ?? '') !== 'private');
    $name = static fn(int $id) => website_name($pv['persons'][$id]);
    $img = static function (string $filename, int $max) use ($file): string {
        if (!$file) { return 'media/' . rawurlencode($filename); }
        $path = website_media_path($filename); $b = $path ? website_image_bytes($path, $max) : null;
        return $b ? 'data:image/' . ($b[1] === 'png' ? 'png' : 'jpeg') . ';base64,' . base64_encode($b[0]) : '';
    };
    switch ($o['kind']) {
        case 'today':
            $items = [];
            $s = $pdo->query("SELECT e.date_text, e.year, t.label, t.gedcom_tag, e.person_id, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id WHERE COALESCE(e.date_text,'')<>''");
            foreach ($s as $r) {
                $md = function_exists('dashboard_month_day') ? dashboard_month_day((string) $r['date_text']) : null;
                if (!$md || !checkdate($md[0], $md[1], 2000)) { continue; }
                $who = (int) $r['person_id'] ? [(int) $r['person_id']] : array_values(array_filter([(int) $r['partner1_id'], (int) $r['partner2_id']]));
                if (!$who || array_filter($who, static fn($id) => !$show($id))) { continue; }
                $items[] = ['m' => $md[0], 'd' => $md[1], 'y' => $r['year'] !== null ? (int) $r['year'] : null, 't' => (string) ($r['label'] ?: 'Événement'), 'k' => (string) $r['gedcom_tag'], 'n' => implode(' et ', array_map($name, $who))];
                if (count($items) >= 8000) { break; }
            }
            return ['items' => $items];
        case 'ancestor':
            $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
            $ids = $root ? array_keys(h_ancestors($pdo, $root, 30)) : [];
            $ids = array_values(array_filter($ids, static fn($id) => (int) $id !== $root && $show((int) $id) && !isset($pv['hidden'][(int) $id])));
            if (!$ids) { $ids = array_values(array_filter(array_keys($pv['persons']), static fn($id) => !isset($pv['hidden'][$id]))); }
            sort($ids);
            $list = []; $photos = 0;
            foreach (array_slice($ids, 0, 366) as $id) {
                $p = $pv['persons'][$id];
                $ev = website_events($pdo, (int) $id);
                $b = ''; $d = '';
                foreach ($ev as $e) { if ($b === '' && in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true)) { $b = trim($e['d'] . ($e['p'] !== '' ? ', ' . $e['p'] : '')); } if ($d === '' && in_array($e['tag'], ['DEAT', 'BURI'], true)) { $d = trim($e['d'] . ($e['p'] !== '' ? ', ' . $e['p'] : '')); } }
                $row = ['n' => website_name($p), 'y' => website_years($p), 'b' => $b, 'd' => $d, 'g' => (string) $p['gender']];
                $mid = (int) ($p['portrait_media_id'] ?? 0);
                if ($mid && ($photos < 80 || !$file) && website_media_ok($pdo, $mid)) {
                    $f = $pdo->prepare("SELECT COALESCE(NULLIF(thumbnail,''), filename) FROM media WHERE id=?"); $f->execute([$mid]); $fn = (string) $f->fetchColumn();
                    if ($fn !== '' && website_media_path($fn)) { $u = $img($fn, 240); if ($u !== '') { $row['ph'] = $u; $photos++; } }
                }
                $list[] = $row;
            }
            return ['people' => $list];
        case 'photo':
            $out = [];
            foreach ($pdo->query("SELECT id, title, filename, date_text FROM media WHERE media_type='image' AND COALESCE(filename,'')<>'' ORDER BY id") as $m) {
                if (count($out) >= ($file ? 31 : 366)) { break; }
                if ($file && !website_media_ok($pdo, (int) $m['id'])) { continue; }
                if (!preg_match('/\.(jpe?g|png|webp|gif)$/i', (string) $m['filename']) || !website_media_path((string) $m['filename'])) { continue; }
                $u = $img((string) $m['filename'], 720); if ($u === '') { continue; }
                $out[] = ['t' => (string) ($m['title'] ?: 'Photo'), 'y' => trim((string) $m['date_text']), 'src' => $u];
            }
            return ['photos' => $out];
        case 'calc':
            return []; // le moteur de la Calculette (assets/js/app-calculette-engine.js) est mis dans la page : tout se calcule sur place
        case 'countdown':
            return ['label' => $o['label'] !== '' ? $o['label'] : 'La cousinade', 'date' => $o['date'] !== '' ? $o['date'] : date('Y-m-d', strtotime('+30 days'))];
    }
    return [];
}

function desk_widget_html(array $o, array $data, bool $file, string $nonce = ''): string
{
    [$icon, $label] = DESK_KINDS[$o['kind']];
    $title = $o['kind'] === 'countdown' ? ($data['label'] ?? $label) : $label;
    $json = json_encode(['kind' => $o['kind'], 'file' => $file, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE);
    $n = $nonce !== '' ? ' nonce="' . htmlspecialchars($nonce, ENT_QUOTES) . '"' : '';
    $csp = $file ? "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" : '';
    $e = static fn($s) => htmlspecialchars((string) $s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $css = <<<'CSS'
:root{color-scheme:light dark;--bg:#fffdf8;--ink:#2b2420;--muted:#7a6f66;--line:#e6ddd2;--accent:#7a2a2a;--soft:#f6efe6}
@media (prefers-color-scheme:dark){:root{--bg:#1f1d1b;--ink:#efe9e2;--muted:#a59a8f;--line:#3a3530;--accent:#e0a2a2;--soft:#2a2724}}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif;background:var(--bg);color:var(--ink);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--line);border-radius:10px}
header{display:flex;align-items:center;gap:6px;padding:7px 8px 6px 12px;border-bottom:1px solid var(--line);-webkit-app-region:drag;user-select:none;cursor:move}
header b{flex:1;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header button{-webkit-app-region:no-drag;border:0;background:none;color:var(--muted);font-size:16px;width:26px;height:26px;border-radius:6px;cursor:pointer}
header button:hover{background:var(--soft);color:var(--ink)}
main{flex:1;overflow:auto;padding:10px 12px}
.big{font-size:18px;font-weight:700;margin:2px 0}.muted{color:var(--muted);font-size:12.5px}
ul{list-style:none;margin:0;padding:0}li{padding:5px 0;border-bottom:1px solid var(--line)}li:last-child{border-bottom:0}
li small{display:block;color:var(--muted)}h4{margin:8px 0 2px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.anc{display:flex;gap:12px;align-items:flex-start}.anc img{width:84px;height:104px;object-fit:cover;border-radius:8px;flex:none}
.anc .ph{width:84px;height:104px;border-radius:8px;background:var(--soft);display:grid;place-items:center;font-size:34px;flex:none}
.photo{position:absolute;inset:39px 0 0 0;display:flex;flex-direction:column}.photo img{flex:1;min-height:0;width:100%;object-fit:cover;display:block}
.photo p{margin:0;padding:6px 12px;font-size:12.5px;background:var(--bg)}
.count{display:flex;gap:8px;justify-content:center;margin:12px 0}.count div{text-align:center;min-width:52px}.count b{display:block;font-size:30px;line-height:1.1;color:var(--accent);font-variant-numeric:tabular-nums}
.empty{color:var(--muted);text-align:center;padding:24px 8px}.c{text-align:center}
.calc input{width:100%;font:16px/1.3 ui-monospace,Menlo,Consolas,monospace;padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);-webkit-app-region:no-drag}
.calc output{display:block;font:700 22px/1.3 ui-monospace,Menlo,Consolas,monospace;margin:8px 2px;word-break:break-all;min-height:1.3em}.calc output.err{font:13px/1.4 inherit;color:#b3261e}
.calc li{cursor:pointer;font:13px/1.3 ui-monospace,Menlo,Consolas,monospace}.calc li:hover{background:var(--soft)}
CSS;
    $js = <<<'JS'
(()=>{const C=JSON.parse(document.getElementById('dw-data').textContent);const D=C.data||{};const m=document.querySelector('main');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=new Date();const doy=Math.floor((now-new Date(now.getFullYear(),0,0))/864e5);let shift=0;
const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const rnd=document.querySelector('[data-next]');
function draw(){
 if(C.kind==='today'){const it=D.items||[];const md=(d)=>[d.getMonth()+1,d.getDate()];const [tm,td]=md(now);
  const day=it.filter(x=>x.m===tm&&x.d===td).sort((a,b)=>(a.y||0)-(b.y||0));
  const next=[];for(let i=1;i<=7;i++){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i);const [a,b]=md(d);it.filter(x=>x.m===a&&x.d===b&&/BIRT|MARR/.test(x.k)).forEach(x=>next.push({...x,i,dd:d}));}
  const row=x=>`<li>${esc(x.t)} · <b>${esc(x.n)}</b><small>${x.y?`${esc(x.y)}${now.getFullYear()-x.y>0?` · il y a ${now.getFullYear()-x.y} ans`:''}`:''}</small></li>`;
  m.innerHTML=`<p class="big">${now.getDate()} ${MOIS[now.getMonth()]}</p>${day.length?`<h4>Ce jour-là</h4><ul>${day.slice(0,30).map(row).join('')}</ul>`:'<p class="muted">Rien ce jour-là dans ta généalogie.</p>'}${next.length?`<h4>Les 7 jours qui viennent</h4><ul>${next.slice(0,20).map(x=>`<li>${x.i===1?'Demain':esc(x.dd.getDate()+' '+MOIS[x.dd.getMonth()])} · ${esc(x.t)} · <b>${esc(x.n)}</b>${x.y?`<small>${now.getFullYear()-x.y} ans</small>`:''}</li>`).join('')}</ul>`:''}`;}
 else if(C.kind==='ancestor'){const L=D.people||[];if(!L.length){m.innerHTML='<p class="empty">Pas encore d’ancêtre à montrer.</p>';return;}const p=L[(doy+shift)%L.length];
  m.innerHTML=`<div class="anc">${p.ph?`<img src="${esc(p.ph)}" alt="">`:`<div class="ph">${p.g==='female'?'👩':p.g==='male'?'👨':'🌳'}</div>`}<div><p class="big">${esc(p.n)}</p><p class="muted">${esc(p.y)}</p>${p.b?`<p>° ${esc(p.b)}</p>`:''}${p.d?`<p>† ${esc(p.d)}</p>`:''}</div></div>`;}
 else if(C.kind==='photo'){const L=D.photos||[];if(!L.length){m.innerHTML='<p class="empty">Pas encore de photo à montrer.</p>';return;}const p=L[(doy+shift)%L.length];
  m.innerHTML=`<div class="photo"><img src="${esc(p.src)}" alt="${esc(p.t)}"><p><b>${esc(p.t)}</b>${p.y?` · ${esc(p.y)}`:''}</p></div>`;}
 else if(C.kind==='calc'){if(m.querySelector('.calc'))return;
  m.innerHTML='<form class="calc" autocomplete="off"><input name="q" aria-label="Calcul" placeholder="2 × (3 + 4), 15 % × 80, 2/3 + 1/6…" spellcheck="false"><output aria-live="polite"></output><ul class="hist"></ul><p class="muted">Entrée : calculer · ↑ : reprendre le dernier calcul</p></form>';
  var f=m.querySelector('form'),q=f.q,out=f.querySelector('output'),hist=f.querySelector('.hist'),H=[];
  f.addEventListener('submit',function(e){e.preventDefault();var s=q.value.trim();if(!s)return;var r;try{r=window.LCNDA_CALC.evaluate(s);}catch(x){r={ok:false,error:String(x&&x.message||x)};}
   if(r&&r.ok){out.className='';out.textContent='= '+r.text;H.unshift([s,r.text]);H=H.slice(0,8);hist.innerHTML=H.map(function(h,i){return '<li data-i="'+i+'">'+esc(h[0])+' = <b>'+esc(h[1])+'</b></li>';}).join('');}
   else{out.className='err';out.textContent='⚠️ '+(r&&r.error||'Je ne comprends pas ce calcul.');}});
  hist.addEventListener('click',function(e){var li=e.target.closest('li');if(!li)return;q.value=H[+li.dataset.i][0];q.focus();});
  q.addEventListener('keydown',function(e){if(e.key==='ArrowUp'&&H.length&&!q.value){e.preventDefault();q.value=H[0][0];}});
  setTimeout(function(){q.focus();},50);}
 else if(C.kind==='countdown'){const t=new Date(D.date+'T00:00:00');let s=Math.round((t-new Date())/1000);const past=s<0;s=Math.abs(s);
  const j=Math.floor(s/86400),h=Math.floor(s%86400/3600),mi=Math.floor(s%3600/60);
  m.innerHTML=`<p class="muted c">${past?'C’était le':'Le'} ${esc(t.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</p><div class="count"><div><b>${j}</b>${j>1?'jours':'jour'}</div><div><b>${h}</b>h</div><div><b>${mi}</b>min</div></div><p class="muted c">${past?'Déjà passé.':'Encore un peu de patience !'}</p>`;}
}
draw();if(C.kind==='countdown')setInterval(draw,30000);
if(rnd)rnd.addEventListener('click',()=>{shift++;draw();});
const x=document.querySelector('[data-close]');if(x)x.addEventListener('click',()=>window.close());
// minuit : le jour change ; la fenêtre de bureau relit aussi la base toutes les 6 heures
const mid=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,5)-now;setTimeout(()=>{if(C.file)location.reload();else location.reload();},mid);
if(!C.file)setTimeout(()=>location.reload(),6*3600e3);
})();
JS;
    $hasNext = in_array($o['kind'], ['ancestor', 'photo'], true);
    return "<!doctype html>\n<html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        . ($csp !== '' ? '<meta http-equiv="Content-Security-Policy" content="' . htmlspecialchars($csp, ENT_COMPAT) . '">' : '')
        . '<meta name="referrer" content="no-referrer"><title>' . $e($icon . ' ' . $title) . '</title><style' . $n . '>' . $css . '</style></head><body>'
        . '<header><span aria-hidden="true">' . $e($icon) . '</span><b>' . $e($title) . '</b>'
        . ($hasNext ? '<button type="button" data-next title="Un autre" aria-label="Un autre">↻</button>' : '')
        . ($file ? '' : '<button type="button" data-close title="Fermer le widget" aria-label="Fermer le widget">×</button>') . '</header><main></main>'
        . '<script id="dw-data" type="application/json">' . $json . '</script>'
        . ($o['kind'] === 'calc' ? '<script' . $n . '>' . str_ireplace('</script', '<\/script', (string) @file_get_contents(APP_ROOT . '/assets/js/app-calculette-engine.js')) . '</script>' : '')
        . '<script' . $n . '>' . $js . '</script></body></html>';
}

/** GET desk_widget_page (fenêtre de bureau) et desk_widget_file (fichier autonome) */
function desk_widget_dispatch(PDO $pdo, string $action, array $q): never
{
    try {
        $o = desk_widget_opts($q);
        $file = $action === 'desk_widget_file';
        $data = desk_widget_data($pdo, $o, $file);
        $nonce = $file ? '' : rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=');
        $html = desk_widget_html($o, $data, $file, $nonce);
        header('Content-Type: text/html; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store, private');
        header('Referrer-Policy: no-referrer');
        if ($file) {
            header('Content-Disposition: attachment; filename="widget-' . $o['kind'] . '.html"');
        } else {
            header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'nonce-{$nonce}'; script-src 'nonce-{$nonce}'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'");
        }
        echo $html;
        exit;
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}
