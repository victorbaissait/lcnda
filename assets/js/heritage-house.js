/* LCNDA — 🏠 Plan de maison (comme un logiciel d'architecte, en plus simple) : des étages, des murs tracés au clic (aimantés à
 * la grille, aux coins et aux angles), des pièces dessinées d'un coup (murs compris) avec leur surface, des portes et des
 * fenêtres posées sur les murs, des cotes, du mobilier (plus de 450 objets d’hier et d’aujourd’hui : heritage-house-lib.js, et ses propres objets :
 * image vue de dessus, ou fichier 3D OBJ, STL, glTF, GLB), des textures de murs et de sols, un plan scanné à calquer,
 * et la vue en 3D (heritage-house3d.js) avec toit. La maison est reliée à un lieu, à ses habitants, à des recensements, et chaque
 * pièce peut garder ses souvenirs (« la chambre où est née… »). 🕰 Ses époques : une version du plan par année ou par date, à
 * faire défiler (▶), chacune rattachable à un recensement. Ailleurs : le bloc « 🏠 Maisons » de la fiche d'une personne, et
 * « 🏠 Maison » dans la fenêtre d'un recensement. Serveur : lib/houses.php.
 * Éléments communs (app-ui.js) : barre du haut E1 (« ✓ Enregistré »), sections E2, fenêtre d'export E3 (PNG, JPG, PDF, SVG, impression,
 * vue 3D, fichier .json de la maison), dépôt de fichier E4, police E5, bulles « ? » ; 💾 réglages enregistrés (🧲 Aimants) exportables.
 * 📐 Plan ancien (cadastre napoléonien) pris dans les médias : à l'échelle (mètres, toises, pieds…), redressé, tourné, verrouillé, à décalquer.
 * ✦ Souvenirs posés sur un meuble ou une pièce (photo, récit, personne, souvenir de famille), en 2D, en 3D et pendant la visite.
 * ☀️ Lumière du jour et 🚶 visite à la première personne : heritage-house3d.js.
 * Listes → « 🏠 Maisons de famille », ou Listes → Outils de modification → « 🏠 Plan de maison ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    // 🔍 menu de choix unique (assets/js/app-picker.js) ; pkItems : les choses choisies dans un champ (avec leur nom)
    const PK = () => window.LCNDA_PICKER || A();
    const pkItems = el => { let v = []; try { v = JSON.parse(el?.dataset.pkValue || '[]'); } catch (_) {} return (Array.isArray(v) ? v : []).filter(it => it && !it.free && it.id); };
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const r1 = v => Math.round(v * 10) / 10;
    const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
    const norm = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
    let seq = 0; const uid = p => p + Date.now().toString(36) + (++seq).toString(36);
    const fmtLen = cm => cm >= 100 ? `${(Math.round(cm) / 100).toFixed(2).replace('.', ',')} m` : `${String(r1(cm)).replace('.', ',')} cm`;
    /** « 350 », « 3,5 m », « 35 mm » → centimètres */
    const parseLen = s => { const m = String(s ?? '').trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(m|cm|mm)?$/); if (!m) return NaN; const v = Number(m[1]); return m[2] === 'm' ? v * 100 : m[2] === 'mm' ? v / 10 : v; };
    /* les aimants (gardés pour toutes les maisons) */
    const SNAP_KEY = 'genealogie-house-snap', SNAP0 = {grid: true, corner: true, mid: true, wall: true, angle: true, align: true, step: 45};
    const snapPrefs = () => { try { return {...SNAP0, ...(JSON.parse(localStorage.getItem(SNAP_KEY) || '{}') || {})}; } catch (_) { return {...SNAP0}; } };
    /* les éléments communs (assets/js/app-ui.js) : sections repliables, fenêtre d'export, dépôt de fichier, police, « ✓ Enregistré » */
    const UI = () => window.LCNDA_UI || A()?.ui || null;
    /** une police sûre pour le style (E5 : la police d'un texte posé sur le plan) */
    const cssFont = f => { const v = String(f || '').replace(/[^\w\s,'\-À-ÿ.]/g, '').trim(); return v ? (v.includes(',') || /^(serif|sans-serif|monospace|cursive|system-ui)$/.test(v) ? v : `'${v.replace(/'/g, '')}', Georgia, serif`) : 'inherit'; };
    const sec = (title, key, body, open = true) => UI()?.panelSection ? UI().panelSection({title, key: `hs-${key}`, open, body}) : `<details class="ui-section" ${open ? 'open' : ''}><summary>${esc(title)}</summary><div class="ui-section-body">${body}</div></details>`;
    const plural = (n, w) => A()?.plural ? A().plural(n, w) : `${n} ${w}${n > 1 ? 's' : ''}`;
    /* 💾 réglages enregistrés de l'outil (aimants, grille, murs, visite, lumière) : sous un nom, exportables et importables */
    const SETS_KEY = 'genealogie-house-sets', SETS_TOOL = 'maison';
    const setsList = () => { try { const v = JSON.parse(localStorage.getItem(SETS_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string' && x.v && typeof x.v === 'object') : []; } catch (_) { return []; } };
    const setsSave = l => { try { localStorage.setItem(SETS_KEY, JSON.stringify(l.slice(0, 60))); return true; } catch (_) { toast('Plus de place pour enregistrer ce réglage.', 'error'); return false; } };
    const downloadText = (text, fname2, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = fname2; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const slug = s => (A()?.safeExportFilename ? A().safeExportFilename(s, 'reglage') : String(s || 'reglage').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'reglage');
    const pickFile = accept => new Promise(res => { const inp = Object.assign(document.createElement('input'), {type: 'file', accept}); inp.onchange = () => res(inp.files?.[0] || null); inp.click(); });
    /* 📐 les mesures d'autrefois (cadastre napoléonien, plans anciens) → centimètres */
    const OLD_UNITS = [['m', 'mètres', 100], ['cm', 'centimètres', 1], ['toise', 'toises (1,949 m)', 194.9], ['pied', 'pieds du roi (32,48 cm)', 32.48], ['aune', 'aunes de Paris (1,188 m)', 118.8], ['perche', 'perches de Paris (18 pieds, 5,847 m)', 584.7], ['percheR', 'perches royales (22 pieds, 7,146 m)', 714.6], ['pas', 'pas (environ 75 cm)', 75]];
    /** ✦ les souvenirs posés : ce qu'on peut rattacher */
    const MEM_ICON = {media: '🖼', text: '✍', person: '👤', memory: '📜', object: '🏺'};
    /** 📄 un PDF d'une page avec une image JPEG (A4, à la française ou à l'italienne, image ajustée) */
    function jpegPdf(dataUrl, w, h, title) {
        const bin = atob(dataUrl.split(',')[1]), land = w > h, PW = land ? 842 : 595, PH = land ? 595 : 842, m = 28, k = Math.min((PW - 2 * m) / w, (PH - 2 * m) / h), dw = w * k, dh = h * k, dx = (PW - dw) / 2, dy = (PH - dh) / 2;
        const enc = new TextEncoder(), parts = [], offs = []; let len = 0; const push = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
        const img = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
        const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q`, safeTitle = String(title || 'Maison').replace(/[^\x20-\x7e]/g, '_').replace(/[()\\]/g, '');
        push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'); const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
        obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>')); obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
        obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
        obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); push(img); push('\nendstream'); });
        obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)); obj(6, () => push(`<< /Title (${safeTitle}) /Producer (LCNDA) >>`));
        const xref = len; push(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
        return new Blob(parts, {type: 'application/pdf'});
    }
    /* les styles des nouveautés (barre du haut, ✦ souvenirs, ☀️ lumière, 🚶 visite, 📐 cadastre), clair et sombre */
    const HS_CSS = `@media (min-width:1001px){.h-hs-dlg .h-hs-top{justify-content:flex-end;row-gap:6px}}.h-hs-hist{display:inline-flex;gap:3px}.h-hs-msg{font-size:12px;color:#667;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h-hs-memk{cursor:pointer}.h-hs-memk circle{fill:#c9962a;stroke:#fff}.h-hs-memk text{fill:#fff;font-weight:700;text-anchor:middle;dominant-baseline:central;pointer-events:none}.h-hs-memk:hover circle{fill:#a8781a}
.h-hs-compass{position:absolute;right:12px;bottom:34px;width:46px;height:46px;border-radius:50%;background:#ffffffe0;border:1px solid #d6dbe2;display:grid;place-items:center;cursor:pointer;z-index:2;padding:0}.h-hs-compass svg{width:40px;height:40px}
.h-hs-stage.is-tracing .h-hs-room path{fill-opacity:.18}.h-hs-stage.is-tracing .h-hs-wall{opacity:.8}
.h-hs-sunbox{position:absolute;right:10px;top:64px;z-index:4;width:300px;max-width:calc(100% - 20px);background:#fffffff4;border:1px solid #d6dbe2;border-radius:10px;padding:8px 10px;box-shadow:0 6px 20px rgba(0,0,0,.15);font-size:12px;display:grid;gap:7px}
.h-hs-sunhd{display:flex;justify-content:space-between;align-items:center}.h-hs-sxrow{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:6px;align-items:center}.h-hs-sxrow output{min-width:64px;text-align:right;font-weight:600}
.h-hs-sxbtns{display:flex;flex-wrap:wrap;gap:4px}.h-hs-sxinfo{color:#556;line-height:1.35}
.h-hs-walkhud{position:absolute;left:10px;top:64px;z-index:4;background:#fffffff2;border:1px solid #d6dbe2;border-radius:10px;padding:6px 10px;display:grid;gap:4px;font-size:12px;max-width:calc(100% - 20px);box-shadow:0 6px 20px rgba(0,0,0,.15)}
.h-hs-wkrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.h-hs-wkeye{display:inline-flex;gap:4px;align-items:center}.h-hs-wkeye input{width:64px;padding:2px 4px;border:1px solid #c9ced6;border-radius:5px;font:inherit}
.h-hs-wkstair{background:#fff4cc;border:1px solid #e6c65a;border-radius:7px;padding:4px 8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.h-hs-3d canvas.h-hs-minimap{position:absolute;right:10px;bottom:30px;width:170px;height:170px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25);z-index:3;cursor:pointer}
.h-hs-cross{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;pointer-events:none;z-index:2}.h-hs-cross::before,.h-hs-cross::after{content:"";position:absolute;background:#fff;box-shadow:0 0 2px #000}.h-hs-cross::before{left:7px;top:0;width:2px;height:16px}.h-hs-cross::after{top:7px;left:0;height:2px;width:16px}
.h-hs-joy{position:absolute;left:18px;bottom:36px;width:124px;height:124px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.85);z-index:4;touch-action:none;box-shadow:0 2px 10px rgba(0,0,0,.2)}.h-hs-joy i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(42,125,225,.88);pointer-events:none}
.h-hs-memlist{list-style:none;margin:4px 0 8px;padding:0;display:grid;gap:4px}.h-hs-memlist li{display:flex;gap:6px;align-items:center;border:1px solid #e3e3e8;border-radius:7px;padding:4px 6px;background:#fafafa}.h-hs-memlist li>button.link-button{flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.h-hs-memlist img{width:34px;height:34px;object-fit:cover;border-radius:4px}.h-hs-memlist small{color:#778}
.h-hs-memv{display:grid;gap:12px}.h-hs-memcard{border:1px solid #e3e3e8;border-radius:10px;padding:10px;display:grid;gap:6px}.h-hs-memcard img{max-width:100%;max-height:58vh;border-radius:6px;justify-self:center;background:#eee}.h-hs-memcard p{white-space:pre-wrap;margin:0;line-height:1.5}
.h-hs-memopts{display:grid;gap:6px}.h-hs-memopts button{text-align:left;padding:9px 11px}.h-hs-fmlist{max-height:46vh;overflow:auto;display:grid;gap:4px;margin-top:6px}.h-hs-fmlist button{text-align:left;border:1px solid #e3e3e8;background:#fff;border-radius:7px;padding:6px 9px;cursor:pointer;font:inherit;color:inherit}.h-hs-fmlist button:hover,.h-hs-fmlist button.is-active{border-color:#2a7de1;background:#eef4fd}
.h-hs-fmwrap,.h-hs-fmwrap .ui-search,.h-hs-fmwrap input{width:100%;box-sizing:border-box}.h-hs-fmwrap .ui-search{display:flex}
.h-hs-sets{border-top:1px solid #e3e3e8;margin-top:8px;padding-top:8px;display:grid;gap:6px}.h-hs-sets select{width:100%}.h-hs-sets .h-hs-row{display:flex;gap:4px;flex-wrap:wrap}
.h-hs-dlg .ui-num>input.ui-num-input.ui-num-input{width:48px!important;flex:none}.h-hs-form label>input[type=range]{width:calc(100% - 100px);vertical-align:middle;margin-right:8px}.h-hs-form label>.ui-range-pair input[type=range]{width:auto}
.h-hs-face{border:1px solid #e3e3e8;border-radius:8px;padding:4px 8px 6px;margin:0 0 8px}.h-hs-face legend{font-weight:600;font-size:12px;padding:0 4px}.h-hs-faceapply{gap:4px;align-items:center;margin-top:4px}:root[data-theme="dark"] .h-hs-face{border-color:#3a3f46}
.h-hs-refbar{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0}.h-hs-pane .ui-section{margin:0 0 6px}.h-hs-fontbtn{font-family:var(--hs-font,inherit)}
.h-hs-stage:has(.h-hs-3d.is-walking) .h-hs-hint{display:none}.h-hs-stage.is-drag-over{outline:3px dashed #2a7de1;outline-offset:-6px}
@media (max-width:700px){.h-hs-sunbox{left:8px;right:8px;width:auto;top:auto!important;bottom:8px}.h-hs-3d canvas.h-hs-minimap{width:110px;height:110px;bottom:8px;right:8px}.h-hs-walkhud{padding:5px 8px}.h-hs-wkrow>small,.h-hs-walkhud>small{font-size:11px}.h-hs-msg{display:none}}
:root[data-theme="dark"] .h-hs-msg,:root[data-theme="dark"] .h-hs-sxinfo,:root[data-theme="dark"] .h-hs-memlist small{color:#aab}
:root[data-theme="dark"] .h-hs-sunbox,:root[data-theme="dark"] .h-hs-walkhud,:root[data-theme="dark"] .h-hs-compass{background:#24272cf2;border-color:#3a3f46;color:#e6e6e6}
:root[data-theme="dark"] .h-hs-wkeye input{background:#1c1e22;border-color:#4a4a4f;color:#e6e6e6}:root[data-theme="dark"] .h-hs-wkstair{background:#3a3218;border-color:#7a6420;color:#f2e6c0}
:root[data-theme="dark"] .h-hs-memlist li,:root[data-theme="dark"] .h-hs-memcard,:root[data-theme="dark"] .h-hs-fmlist button{background:#24272c;border-color:#3a3f46;color:#e6e6e6}:root[data-theme="dark"] .h-hs-fmlist button:hover,:root[data-theme="dark"] .h-hs-fmlist button.is-active{background:#192333;border-color:#4a8be8}
:root[data-theme="dark"] .h-hs-sets{border-color:#3a3f46}:root[data-theme="dark"] .h-hs-sunbox .h-hs-chip{background:#2d3138;border-color:#4a4f57;color:#e6e6e6}:root[data-theme="dark"] .h-hs-sxrow output{color:#e6e6e6}`;
    const injectCss = () => { if (document.getElementById('h-hs-css2')) return; const st = document.createElement('style'); st.id = 'h-hs-css2'; st.textContent = HS_CSS; document.head.appendChild(st); };

    /* ═════════ Matériaux et mobilier ═════════ */
    const WALL_MATS = [['platre', 'Plâtre blanc', '#f2efe8'], ['chaux', 'Enduit à la chaux', '#e9e1cf'], ['pierre', 'Pierre apparente', '#b9ac97'], ['brique', 'Brique', '#a9583e'], ['colombage', 'Colombage (pans de bois)', '#efe6cf'],
        ['lambris', 'Lambris de bois', '#b88a5a'], ['papier', 'Papier peint', '#c9b6a0'], ['carrelage', 'Carrelage', '#e6e9ea'], ['beton', 'Béton', '#a7a7a7'], ['torchis', 'Torchis', '#c9ad84'],
        ['crepi', 'Enduit, crépi', '#e3dccb'], ['pierretaille', 'Pierre de taille', '#d8cfbd'], ['rayures', 'Papier peint à rayures', '#d9c9a8'], ['fleurs', 'Papier peint à fleurs', '#ece2cf'], ['jouy', 'Toile de Jouy', '#f1ebdd']];
    /** 🧱 le motif léger d'un revêtement sur le plan 2D (pointillés le long de la face) */
    const WALL_DASH = {pierre: '9 3 4 3', pierretaille: '14 3', brique: '6 2', colombage: '2 7', lambris: '12 2', papier: '3 3', rayures: '1.5 3', fleurs: '2 2 6 2', jouy: '4 2 1 2', carrelage: '7 1', crepi: '1 1.5', torchis: '5 4', beton: ''};
    const FLOOR_MATS = [['parquet', 'Parquet', '#b98b5c'], ['point', 'Parquet à bâtons rompus', '#a87b4d'], ['tomettes', 'Tomettes', '#b4553a'], ['carreaux', 'Carreaux de ciment', '#d9d2c4'], ['damier', 'Damier noir et blanc', '#dddddd'],
        ['dalles', 'Dalles de pierre', '#a9a296'], ['terre', 'Terre battue', '#8a6a4a'], ['tapis', 'Moquette, tapis', '#7a8fa6'], ['beton', 'Béton', '#9c9c9c'], ['herbe', 'Herbe (extérieur)', '#7aa35a'], ['gravier', 'Gravier, cour', '#c2b8a3']];
    // la matière d'un objet (vue 3D) : [clé, nom, couleur proposée, texture, brillance métallique, rugosité, opacité]
    const OBJ_MATS = [['', 'Couleur unie', '', '', 0, .85, 1], ['boisclair', 'Bois clair (hêtre, pin)', '#c9a77a', 'bois', 0, .8, 1], ['chene', 'Chêne', '#9a6a3a', 'bois', 0, .78, 1], ['noyer', 'Noyer', '#6a4026', 'bois', 0, .7, 1], ['merisier', 'Merisier', '#a0522d', 'bois', 0, .62, 1],
        ['boisfonce', 'Bois foncé (ébène, bois ciré)', '#4a2f1f', 'bois', 0, .55, 1], ['peint', 'Bois peint', '#7a8a6a', '', 0, .7, 1], ['metal', 'Métal, acier', '#9aa3a8', '', .45, .35, 1], ['fonte', 'Fonte, fer forgé', '#2f2f2f', '', .35, .6, 1], ['cuivre', 'Cuivre', '#c0703f', '', .45, .32, 1],
        ['laiton', 'Laiton, bronze, doré', '#c9a24a', '', .45, .32, 1], ['zinc', 'Zinc, fer-blanc', '#a7b0b5', '', .35, .45, 1], ['pierre', 'Pierre', '#a9a296', 'pierre', 0, .95, 1], ['marbre', 'Marbre', '#e8e4dc', 'marbre', 0, .3, 1], ['gres', 'Grès, terre cuite', '#a0704a', '', 0, .8, 1],
        ['faience', 'Faïence, porcelaine, émail', '#f2efe6', '', 0, .15, 1], ['tissu', 'Tissu', '#8b3a3a', 'tissu', 0, 1, 1], ['velours', 'Velours', '#6a2a3a', 'tissu', 0, 1, 1], ['cuir', 'Cuir', '#6a3a22', '', 0, .55, 1], ['osier', 'Osier, rotin', '#c9a26a', 'osier', 0, .9, 1],
        ['paille', 'Paille', '#d9b75a', 'osier', 0, 1, 1], ['verre', 'Verre', '#cfe6f3', '', .1, .05, .4]];
    const FEET_OPTS = [['', 'Sans pieds'], ['droits', 'Pieds droits'], ['tournes', 'Pieds tournés'], ['boules', 'Pieds boules (miches)'], ['patins', 'Patins'], ['roulettes', 'Roulettes']];
    // [clé, nom, catégorie, largeur, profondeur, hauteur (cm), couleur, forme vue de dessus]
    const LIB = [
        ['lit1', 'Lit d’une personne', 'Chambre', 90, 190, 50, '#d9cbb3', 'bed1'], ['lit2', 'Lit double', 'Chambre', 140, 190, 55, '#d9cbb3', 'bed2'], ['litclos', 'Lit clos (breton)', 'Chambre', 150, 180, 200, '#7a4f2a', 'litclos'],
        ['berceau', 'Berceau', 'Chambre', 50, 90, 90, '#c9a77a', 'bed1'], ['litenfant', 'Lit d’enfant', 'Chambre', 70, 140, 80, '#c9a77a', 'bed1'], ['chevet', 'Table de chevet', 'Chambre', 45, 40, 55, '#8a5a32', 'box'],
        ['commode', 'Commode', 'Chambre', 110, 50, 85, '#8a5a32', 'drawers'], ['coiffeuse', 'Coiffeuse', 'Chambre', 100, 45, 140, '#9a6a3a', 'box'], ['prieDieu', 'Prie-Dieu', 'Chambre', 50, 60, 85, '#6a4026', 'chair'],
        ['tablerect', 'Table', 'Séjour', 160, 90, 75, '#8a5a32', 'table'], ['tableronde', 'Table ronde', 'Séjour', 110, 110, 75, '#8a5a32', 'round'], ['chaise', 'Chaise', 'Séjour', 45, 45, 90, '#7a4f2a', 'chair'],
        ['fauteuil', 'Fauteuil', 'Séjour', 80, 80, 90, '#8b3a3a', 'armchair'], ['canape', 'Canapé', 'Séjour', 200, 90, 80, '#5f6f8a', 'sofa'], ['banc', 'Banc', 'Séjour', 150, 35, 45, '#7a4f2a', 'box'],
        ['buffet', 'Buffet', 'Séjour', 150, 50, 95, '#7a4f2a', 'cabinet'], ['vaisselier', 'Vaisselier', 'Séjour', 140, 50, 200, '#7a4f2a', 'cabinet'], ['horloge', 'Horloge comtoise', 'Séjour', 45, 30, 220, '#6a4026', 'clock'],
        ['piano', 'Piano droit', 'Séjour', 150, 60, 130, '#2b211b', 'piano'], ['bibli', 'Bibliothèque', 'Séjour', 100, 35, 200, '#7a4f2a', 'shelves'], ['bureau', 'Bureau', 'Séjour', 120, 60, 75, '#7a4f2a', 'desk'],
        ['cheminee', 'Cheminée', 'Séjour', 150, 50, 120, '#bfb4a3', 'fireplace'], ['poele', 'Poêle à bois', 'Séjour', 60, 60, 80, '#2f2f2f', 'stove'], ['tapis', 'Tapis', 'Séjour', 200, 140, 1, '#8a3a3a', 'rug'],
        ['lampe', 'Lampadaire', 'Séjour', 40, 40, 160, '#d9c27a', 'roundsmall'], ['plante', 'Plante', 'Séjour', 50, 50, 120, '#5f8a3a', 'plant'], ['radio', 'Poste de radio (TSF)', 'Séjour', 50, 30, 40, '#6a4026', 'box'],
        ['cuisiniere', 'Cuisinière à bois', 'Cuisine', 100, 65, 85, '#3a3a3a', 'range'], ['evier', 'Évier en pierre', 'Cuisine', 100, 55, 85, '#bdb5a6', 'sink'], ['petrin', 'Pétrin', 'Cuisine', 140, 60, 80, '#8a5a32', 'box'],
        ['garde', 'Garde-manger', 'Cuisine', 70, 45, 160, '#9a6a3a', 'cabinet'], ['frigo', 'Réfrigérateur', 'Cuisine', 60, 65, 180, '#eeeeee', 'box'], ['plan', 'Plan de travail', 'Cuisine', 180, 60, 90, '#cfc6b3', 'box'],
        ['baignoire', 'Baignoire', 'Salle d’eau', 170, 75, 55, '#f4f4f4', 'bath'], ['douche', 'Douche', 'Salle d’eau', 90, 90, 200, '#e6eef2', 'shower'], ['wc', 'WC', 'Salle d’eau', 40, 65, 80, '#f4f4f4', 'wc'],
        ['lavabo', 'Lavabo', 'Salle d’eau', 60, 45, 85, '#f4f4f4', 'basin'], ['broc', 'Table de toilette (broc et cuvette)', 'Salle d’eau', 80, 45, 80, '#9a6a3a', 'basin'],
        ['armoire', 'Armoire', 'Rangement', 120, 60, 200, '#7a4f2a', 'wardrobe'], ['coffre', 'Coffre', 'Rangement', 100, 50, 50, '#6a4026', 'chest'], ['etagere', 'Étagère', 'Rangement', 100, 30, 180, '#9a6a3a', 'shelves'],
        ['rouet', 'Rouet', 'Métiers, ferme', 70, 50, 90, '#8a5a32', 'wheel'], ['metier', 'Métier à tisser', 'Métiers, ferme', 180, 150, 180, '#7a4f2a', 'loom'], ['etabli', 'Établi', 'Métiers, ferme', 200, 70, 90, '#9a6a3a', 'desk'],
        ['tonneau', 'Tonneau', 'Métiers, ferme', 70, 70, 100, '#8a5a32', 'barrel'], ['machine', 'Machine à coudre', 'Métiers, ferme', 80, 45, 80, '#2b2b2b', 'desk'], ['enclume', 'Enclume', 'Métiers, ferme', 70, 30, 80, '#3a3a3a', 'box'],
        ['mangeoire', 'Mangeoire, crèche', 'Métiers, ferme', 200, 60, 80, '#8a6a4a', 'box'], ['charrette', 'Charrette', 'Métiers, ferme', 300, 150, 150, '#8a6a4a', 'cart'], ['puits', 'Puits', 'Extérieur', 120, 120, 100, '#a9a296', 'well'],
        ['arbre', 'Arbre', 'Extérieur', 300, 300, 600, '#4f7a2f', 'tree'], ['voiture', 'Voiture', 'Extérieur', 420, 180, 150, '#5f6f8a', 'car'], ['bancjardin', 'Banc de jardin', 'Extérieur', 150, 50, 80, '#6a8a4a', 'box'],
        ['escalier', 'Escalier droit', 'Structure', 90, 300, 280, '#9a7a5a', 'stairs'], ['escaliert', 'Escalier tournant', 'Structure', 200, 200, 280, '#9a7a5a', 'stairsL'], ['poteau', 'Poteau, pilier', 'Structure', 30, 30, 280, '#9a8a7a', 'box'],
        ['cloison', 'Placard', 'Structure', 120, 60, 240, '#d9d2c4', 'wardrobe']];
    const libOf = k => LIB.find(l => l[0] === k);
    ext.houseLib = {LIB, WALL_MATS, FLOOR_MATS, OBJ_MATS, FEET_OPTS, libOf};

    /** le dessin vu de dessus d'un meuble, centré en (0, 0), dans une boîte w × d */
    const ROUNDISH = new Set(['round', 'roundsmall', 'barrel', 'oval', 'rugR', 'plant', 'tree', 'stool', 'globe', 'candle', 'well', 'fountain', 'churn', 'petrole', 'urn', 'jug', 'cone', 'ball']);
    function sym2d(item) {
        let s = sym2dBase(item); const w = item.w, d = item.d, k = item.s2 || libOf(item.kind)?.[7] || 'box';
        // la deuxième couleur (pieds, poignées, filets) : un liseré à l'intérieur
        if (/^#[0-9a-f]{6}$/i.test(item.color2 || '') && !item.img && w > 10 && d > 10) s += ROUNDISH.has(k) ? `<ellipse rx="${w / 2 - 4}" ry="${d / 2 - 4}" fill="none" stroke="${item.color2}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>` : `<rect x="${-w / 2 + 4}" y="${-d / 2 + 4}" width="${w - 8}" height="${d - 8}" rx="${Math.min(w, d) * clamp(Number(item.rad) || 0, 0, 50) / 100}" fill="none" stroke="${item.color2}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
        return s;
    }
    function sym2dBase(item) {
        const L = libOf(item.kind), w = item.w, d = item.d, c = item.color || L?.[6] || '#9a8a7a', k = item.img ? 'img' : item.model ? 'model' : item.s2 || L?.[7] || 'box', S = 'stroke="#3a3530" stroke-width="1.6" vector-effect="non-scaling-stroke"';
        const x0 = -w / 2, y0 = -d / 2, rx = Number(item.rad) > 0 ? ` rx="${Math.min(w, d) * clamp(Number(item.rad), 0, 50) / 100}"` : '';
        const R = (x, y, ww, hh, f = c, ex = '') => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}"${rx && x === x0 && y === y0 && ww === w && hh === d ? rx : ''} fill="${f}" ${S} ${ex}/>`; // coins arrondis : le contour de l'objet
        switch (k) {
            case 'img': return `<image href="${esc(item.img)}" x="${x0}" y="${y0}" width="${w}" height="${d}" preserveAspectRatio="none"/>${R(x0, y0, w, d, 'none')}`;
            case 'bed1': case 'bed2': { const pw = k === 'bed2' ? w / 2 - 6 : w - 12; return R(x0, y0, w, d) + R(x0 + 6, y0 + 6, pw, 22, '#fff') + (k === 'bed2' ? R(6, y0 + 6, pw, 22, '#fff') : '') + `<path d="M${x0} ${y0 + d * .38}L${w / 2} ${y0 + d * .38}" ${S} fill="none"/>`; }
            case 'litclos': return R(x0, y0, w, d) + R(x0 + 8, y0 + d * .2, w - 16, d * .6, '#e9dcc3') + `<path d="M0 ${y0}V${y0 + d}" ${S}/>`;
            case 'table': case 'desk': return R(x0, y0, w, d) + (k === 'desk' ? R(x0 + w * .62, y0 + 4, w * .34, d - 8, 'none') : '');
            case 'round': case 'roundsmall': case 'barrel': return `<ellipse rx="${w / 2}" ry="${d / 2}" fill="${c}" ${S}/>` + (k === 'barrel' ? `<ellipse rx="${w * .35}" ry="${d * .35}" fill="none" ${S}/>` : '');
            case 'chair': return R(x0, y0 + d * .2, w, d * .8) + R(x0, y0, w, d * .2);
            case 'armchair': return R(x0, y0, w, d) + R(x0 + w * .18, y0 + d * .25, w * .64, d * .7, '#fff8') + R(x0, y0, w, d * .22);
            case 'sofa': return R(x0, y0, w, d) + R(x0 + 14, y0 + d * .3, w - 28, d * .65, '#fff6');
            case 'cabinet': case 'wardrobe': return R(x0, y0, w, d) + `<path d="M${x0} ${y0}L${w / 2} ${d / 2}M${w / 2} ${y0}L${x0} ${d / 2}" ${S} opacity=".5"/>`;
            case 'drawers': case 'chest': return R(x0, y0, w, d) + `<path d="M${x0} ${y0 + 6}H${w / 2}" ${S}/>`;
            case 'shelves': return R(x0, y0, w, d) + [1, 2, 3].map(i => `<path d="M${x0 + w * i / 4} ${y0}V${d / 2}" ${S} opacity=".5"/>`).join('');
            case 'clock': return R(x0, y0, w, d) + `<circle r="${Math.min(w, d) * .3}" fill="#fff" ${S}/>`;
            case 'piano': return R(x0, y0, w, d) + R(x0, y0 + d * .65, w, d * .35, '#fff') + Array.from({length: 14}, (_, i) => `<path d="M${x0 + w * (i + .5) / 14} ${y0 + d * .65}v${d * .2}" stroke="#222" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('');
            case 'fireplace': return R(x0, y0, w, d) + R(x0 + w * .2, y0 + d * .3, w * .6, d * .7, '#4a3a2a');
            case 'stove': case 'range': return R(x0, y0, w, d) + `<circle cx="${-w * .2}" cy="0" r="${Math.min(w, d) * .18}" fill="none" ${S}/><circle cx="${w * .2}" cy="0" r="${Math.min(w, d) * .18}" fill="none" ${S}/>`;
            case 'sink': case 'basin': return R(x0, y0, w, d) + `<rect x="${x0 + w * .15}" y="${y0 + d * .2}" width="${w * .7}" height="${d * .6}" rx="${d * .2}" fill="#fff" ${S}/>`;
            case 'bath': return R(x0, y0, w, d) + `<rect x="${x0 + 8}" y="${y0 + 8}" width="${w - 16}" height="${d - 16}" rx="${d * .35}" fill="#fff" ${S}/>`;
            case 'shower': return R(x0, y0, w, d) + `<path d="M${x0} ${y0}L${w / 2} ${d / 2}M${w / 2} ${y0}L${x0} ${d / 2}" ${S} opacity=".4"/><circle r="5" fill="#888"/>`;
            case 'wc': return R(x0 + w * .1, y0, w * .8, d * .3) + `<ellipse cy="${d * .15}" rx="${w / 2}" ry="${d * .35}" fill="${c}" ${S}/>`;
            case 'rug': return R(x0, y0, w, d, c, 'opacity=".55"') + R(x0 + 10, y0 + 10, w - 20, d - 20, 'none');
            case 'plant': case 'tree': return `<circle r="${Math.min(w, d) / 2}" fill="${c}" ${S} opacity=".85"/>` + [0, 1, 2, 3, 4].map(i => `<circle cx="${Math.cos(i * 1.256) * w * .22}" cy="${Math.sin(i * 1.256) * d * .22}" r="${Math.min(w, d) * .14}" fill="#0002"/>`).join('');
            case 'wheel': return `<circle cx="${-w * .1}" r="${Math.min(w, d) * .38}" fill="none" ${S}/>` + R(w * .1, -6, w * .35, 12);
            case 'loom': return R(x0, y0, w, d, 'none') + R(x0, y0, w, 12) + R(x0, d / 2 - 12, w, 12) + `<path d="M${x0 + 10} 0H${w / 2 - 10}" ${S}/>`;
            case 'cart': return R(x0 + w * .15, y0, w * .85, d) + `<path d="M${x0} 0H${x0 + w * .15}" ${S}/>` + R(x0 + w * .45, y0 - 8, w * .2, 8, '#3a3530') + R(x0 + w * .45, d / 2, w * .2, 8, '#3a3530');
            case 'well': return `<circle r="${Math.min(w, d) / 2}" fill="${c}" ${S}/><circle r="${Math.min(w, d) * .32}" fill="#2a3a4a" ${S}/>`;
            case 'car': return `<rect x="${x0}" y="${y0}" width="${w}" height="${d}" rx="${d * .3}" fill="${c}" ${S}/>` + R(x0 + w * .3, y0 + 10, w * .35, d - 20, '#cfe0ee');
            case 'stairs': { const n = Math.max(4, Math.round(d / 25)); return R(x0, y0, w, d, '#e8dccb') + Array.from({length: n - 1}, (_, i) => `<path d="M${x0} ${y0 + d * (i + 1) / n}H${w / 2}" ${S}/>`).join('') + `<path d="M0 ${d / 2 - 10}V${y0 + 14}M-8 ${y0 + 26}L0 ${y0 + 14}L8 ${y0 + 26}" fill="none" stroke="#c0392b" stroke-width="2" vector-effect="non-scaling-stroke"/>`; }
            case 'stairsL': return R(x0, y0, w, d, '#e8dccb') + Array.from({length: 6}, (_, i) => `<path d="M0 0L${Math.cos(Math.PI + i * Math.PI / 10) * w / 2} ${Math.sin(Math.PI + i * Math.PI / 10) * d / 2}" ${S}/>`).join('') + Array.from({length: 4}, (_, i) => `<path d="M${x0 + w * (i + 1) / 5} 0V${d / 2}" ${S}/>`).join('');
            case 'model': return R(x0, y0, w, d, '#c9d6e3') + `<path d="M${x0} ${y0}L${w / 2} ${d / 2}M${w / 2} ${y0}L${x0} ${d / 2}" ${S} opacity=".35"/>`;
            default: return ext.houseSym2dX?.(k, item, {R, S, c, w, d, x0, y0, esc}) ?? R(x0, y0, w, d); // les formes du catalogue étendu (heritage-house-lib.js)
        }
    }
    /** les motifs des sols (vus de dessus) */
    function floorPattern(key, color, id) {
        const c = color || FLOOR_MATS.find(f => f[0] === key)?.[2] || '#ddd', P = (w, h, body) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" fill="${c}"/>${body}</pattern>`, ln = 'stroke="#0003" stroke-width="1"';
        switch (key) {
            case 'parquet': return P(80, 20, `<path d="M0 20H80M40 0V20" ${ln}/>`);
            case 'point': return P(40, 40, `<path d="M0 0L20 20L0 40M20 0L40 20L20 40" fill="none" ${ln}/>`);
            case 'tomettes': return P(30, 26, `<path d="M8 0L22 0L30 13L22 26L8 26L0 13Z" fill="none" stroke="#7a3020" stroke-width="1.4"/>`);
            case 'carreaux': return P(40, 40, `<rect width="40" height="40" fill="none" ${ln}/><circle cx="20" cy="20" r="9" fill="#0001"/>`);
            case 'damier': return P(60, 60, '<rect width="30" height="30" fill="#2b2b2b"/><rect x="30" y="30" width="30" height="30" fill="#2b2b2b"/>');
            case 'dalles': return P(90, 60, `<path d="M0 0H90V60M0 30H50M50 0V30M30 30V60" fill="none" ${ln}/>`);
            case 'terre': return P(30, 30, '<circle cx="7" cy="9" r="1.4" fill="#0002"/><circle cx="21" cy="22" r="1.2" fill="#0002"/>');
            case 'herbe': return P(20, 20, '<path d="M5 15l2-6 2 6M14 8l2-6 2 6" stroke="#3f6a2a" fill="none"/>');
            case 'gravier': return P(14, 14, '<circle cx="3" cy="4" r="1.6" fill="#0002"/><circle cx="10" cy="10" r="1.3" fill="#0002"/>');
            default: return P(10, 10, '');
        }
    }
    const area = pts => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2); };
    const centroid = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
    const newFloor = (n = 0) => ({id: uid('f'), name: n === 0 ? 'Rez-de-chaussée' : n === -1 ? 'Cave' : n === 1 ? '1er étage' : `${n}e étage`, level: n, height: 270, wallT: 20, walls: [], openings: [], rooms: [], items: [], dims: [], labels: []});
    const newHouse = () => ({unit: 'cm', grid: 10, floors: [newFloor(0)], roof: {on: false, pitch: 40, color: '#8a4b3a', kind: 'tuiles'}, meta: {people: [], note: ''}, ref: null});

    /* un plan ouvert depuis la base (ou une base reçue d'ailleurs) : seuls des nombres, des couleurs, des images sûres et
       des mots-clés simples ; le texte libre (noms, notes) est toujours échappé à l'affichage */
    const H_FREE = new Set(['name', 'note', 'text', 'title', 'label', 'period', 'place', 'place_text', 'caption', 'date', 'short', 'font']);
    const H_WORD = new Set(['mtl', 'style', 'mat', 'floor', 'kind', 'type', 'id', 'unit', 'swing', 'role', 'wall', 'room', 'icon', 'ext', 'side', 'model', 'pid', 'key', 'cat', 'shape', 'axis', 's2', 's3', 'matl', 'feet', 'ver', 'lMat', 'rMat', 'ceil']);
    const H_COLOR = /^(color2?|.*Color)$/, H_IMG = /^(src|img|image|href|top|thumb|tex|texture)$/;
    const imgSafe = v => /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) || /^media\/[\w.%-]+$/.test(v) || /^api\.php\?action=house_model_file&id=\d+$/.test(v);
    function cleanHouse(v, key = '') {
        if (Array.isArray(v)) return v.slice(0, 20000).map(x => cleanHouse(x, key));
        if (v && typeof v === 'object') { const o = {}; Object.entries(v).slice(0, 200).forEach(([k, x]) => { if (/^[\w$-]{1,40}$/.test(k)) o[k] = cleanHouse(x, k); }); return o; }
        if (typeof v === 'string') {
            if (H_FREE.has(key)) return v.slice(0, 2000);
            if (H_COLOR.test(key)) return /^#[0-9a-f]{3,8}$/i.test(v) ? v : '#999999';
            if (H_IMG.test(key)) return imgSafe(v) ? v : '';
            if (H_WORD.has(key)) return /^[\w.:-]{0,60}$/.test(v) ? v : '';
            const n = Number(v); return Number.isFinite(n) ? n : 0;
        }
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        return typeof v === 'boolean' || v === null ? v : null;
    }

    /* ═════════ L'éditeur ═════════ */
    async function open(ctx = {}) {
        injectCss();
        let id = 0, name = ctx.preset?.name || 'Maison de famille', placeId = 0, placeText = ctx.preset?.placeText || '', period = ctx.preset?.period || '', H = newHouse(), geo = null; // geo : les coordonnées du lieu (☀️ lumière du jour)
        if (ctx.id) { try { const r = await api('house', {id: ctx.id}); id = r.id; name = r.name; placeId = r.place_id; placeText = r.place_text; period = r.period; if (r.place_lat != null && r.place_lon != null) geo = {lat: Number(r.place_lat), lon: Number(r.place_lon)}; H = {...newHouse(), ...cleanHouse(r.house || {})}; if (!Array.isArray(H.floors) || !H.floors.length) H.floors = [newFloor(0)]; } catch (e) { return toast(e.message, 'error'); } }
        if (Array.isArray(H.versions) && H.versions.length && !H.versions.some(v => v.id === H.ver)) { const v0 = {id: uid('v'), label: 'Époque sans nom', date: ''}; H.versions.push(v0); H.ver = v0.id; } // une époque perdue : le plan dessiné en devient une
        if (!H.meta || typeof H.meta !== 'object') H.meta = {people: [], note: ''};
        if (ctx.preset?.census && !ctx.id) H.meta.census = [ctx.preset.census]; // une nouvelle maison, depuis un recensement : déjà rattachée
        let fi = H.floors.findIndex(f => f.level === 0); if (fi < 0) fi = 0;
        let tracing = false, exporting = false, tool = 'select', zoom = .6, panX = 80, panY = 80, sel = null, drag = null, draft = null, hover = null, dirty = false, hist = [], hpos = -1, view3d = null, tab = 'props', libCat = 'Chambre', libQ = '', mine = [];
        const F = () => H.floors[fi];
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-hs-dlg'; dlg.dataset.ownClose = '1'; // Échap : la maison demande elle-même (une seule question)
        dlg.innerHTML = `<div class="h-hs">
            <header class="h-hs-top"><span class="h-hs-logo" aria-hidden="true">🏠</span><input class="h-hs-name" data-hs-name value="${esc(name)}" maxlength="200" aria-label="Nom de la maison">
                <nav class="h-hs-floors" data-hs-floors></nav><span class="h-hs-vers" data-hs-vers></span>
                <span class="segmented h-hs-mode"><button type="button" class="is-active" data-hs-mode="2d">Plan 2D</button><button type="button" data-hs-mode="3d">Vue 3D</button></span>
                <span class="h-hs-hist"><button type="button" class="icon-button small" data-hs-cmd="undo" title="Annuler" data-shortcut="⌘Z">↶</button><button type="button" class="icon-button small" data-hs-cmd="redo" title="Rétablir" data-shortcut="⇧⌘Z">↷</button></span>
                <span class="h-hs-acts" data-tbg="hs-top" data-tbg-label="Barre du haut">
                <details class="h-hs-menu h-hs-snapm"><summary class="button small secondary" title="Aimants, précision et 💾 réglages enregistrés">🧲 Aimants</summary><div data-hs-snapbox></div></details>
                <details class="h-hs-menu"><summary class="button small secondary">📥 Importer</summary><div><button type="button" data-hs-cmd="importplan">📐 Un plan ancien, un cadastre, à calquer…</button><button type="button" data-hs-cmd="importimg">🖼️ Un objet en image (vue de dessus)…</button><button type="button" data-hs-cmd="import3d">🧊 Un objet 3D (OBJ, STL, glTF, GLB)…</button><button type="button" data-hs-cmd="importhouse">🏠 Une maison (fichier .json)…</button></div></details></span>
                <span class="spacer"></span><span class="h-hs-msg" data-hs-msg></span><span class="ui-status" data-ui-status></span>
                ${ext.tbButton ? ext.tbButton('house') : ''}<button type="button" class="button small secondary" data-hs-cmd="export" title="Le plan (PNG, JPG, PDF, SVG, impression), la vue 3D, le fichier de la maison">⤓ Exporter</button><button type="button" class="button small" data-hs-cmd="save" data-shortcut="⌘S" title="Enregistrer">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('house') : ''}<button type="button" class="icon-button" data-hs-cmd="close" title="Fermer" aria-label="Fermer">×</button></header>
            <div class="h-hs-main">
                <nav class="h-hs-tools" data-tbg="hs-tools" data-tbg-label="Outils (colonne de gauche)">${[['select', '➤', 'Choisir, déplacer (V)'], ['pan', '✋', 'Déplacer la vue, ou barre d’espace (H)'], ['room', '⬚', 'Pièce rectangulaire, murs compris (R) : glisser'], ['wall', '▬', 'Mur (W) : un clic par coin, double-clic ou Entrée pour finir'], ['zone', '▱', 'Pièce de forme libre, sans murs (P) : un clic par coin'], ['door', '🚪', 'Porte (D) : clic sur un mur'], ['window', '🪟', 'Fenêtre (F) : clic sur un mur'], ['dim', '📏', 'Cote, mesure (M) : deux clics'], ['text', 'T', 'Texte (T)']].map(([k, i, l]) => { const sc = ({select: 'V', pan: 'H', wall: 'W', zone: 'P', door: 'D', window: 'F', dim: 'M', text: 'T', room: 'R'})[k] || ''; return `<button type="button" data-hs-tool="${k}" title="${esc(sc ? l.replace(` (${sc})`, '') : l)}" data-shortcut="${sc}">${i}</button>`; }).join('')}</nav>
                <section class="h-hs-stage" data-hs-stage tabindex="-1"><svg data-hs-svg><defs data-hs-defs></defs><g data-hs-world></g></svg><div class="h-hs-3d" data-hs-3d hidden></div><div class="h-hs-3dbar" data-h3bar data-tbg="hs-3d" data-tbg-label="Barre de la vue 3D" hidden><label class="checkbox-line" data-tb="h3-all"><input type="checkbox" data-h3="all" checked> Tous les étages</label><label class="checkbox-line" data-tb="h3-roof"><input type="checkbox" data-h3="roof"> Toit</label><label class="checkbox-line" data-tb="h3-cut"><input type="checkbox" data-h3="cut"> Murs coupés (voir dedans)</label><label class="checkbox-line" data-tb="h3-dims"><input type="checkbox" data-h3="dims"> Cotes</label><button type="button" class="button small secondary" data-h3="measure" title="Deux clics sur la maison : la distance (et la hauteur entre les deux points)">📏 Mesurer</button><span class="segmented" data-tb="h3-views" data-tb-label="Vues dessus / face / côté"><button type="button" data-h3="view" data-v="top" title="Vue de dessus">Dessus</button><button type="button" data-h3="view" data-v="front" title="Vue de face">Face</button><button type="button" data-h3="view" data-v="side" title="Vue de côté">Côté</button></span><button type="button" class="button small secondary" data-h3="sun" title="Le soleil selon l’heure, la date et le lieu ; la nuit, les lampes">☀️ Lumière</button><button type="button" class="button small secondary" data-h3="walk" title="Visiter la maison à hauteur d’yeux">🚶 Visiter</button><button type="button" class="button small secondary" data-h3="home">⌂ Vue d’ensemble</button></div><div class="h-hs-hint" data-hs-hint></div><div class="h-hs-verbadge" data-hs-verbadge hidden></div><div class="h-hs-pbar" data-hs-pbar><span data-hs-xy>X — · Y —</span><span data-hs-seg></span><input data-hs-num autocomplete="off" spellcheck="false" hidden></div></section>
                <aside class="h-hs-side"><nav class="segmented h-hs-tabs" data-tbg="hs-tabs" data-tbg-label="Onglets du panneau de droite">${[['props', 'Propriétés'], ['lib', 'Mobilier'], ['floor', 'Étage'], ['house', 'Maison']].map(([k, l]) => `<button type="button" data-hs-tab="${k}">${l}</button>`).join('')}</nav><div class="h-hs-pane" data-hs-pane></div></aside>
            </div></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'house', true); dlg.showModal(); // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        const $ = s => dlg.querySelector(s), svg = $('[data-hs-svg]'), world = $('[data-hs-world]'), stage = $('[data-hs-stage]'), pane = $('[data-hs-pane]');
        dlg.addEventListener('pointerdown', e => dlg.querySelectorAll('details.h-hs-menu[open]').forEach(d => { if (!d.contains(e.target)) d.removeAttribute('open'); })); // un menu ouvert se ferme quand on clique ailleurs
        // E1 : « ✓ Enregistré » (ou « • modifié ») toujours au même endroit, sans toast ; la dernière action en petit à côté
        let msgT = 0, shownSt = null, saving = false;
        const status = s => { const m = $('[data-hs-msg]'); if (!m) return; m.textContent = s || ''; clearTimeout(msgT); if (s) msgT = setTimeout(() => { m.textContent = ''; }, 6000); };
        const savedSt = st => { if (shownSt === st) return; shownSt = st; const el = $('[data-ui-status]'); if (!el) return; if (!st) { el.innerHTML = ''; return; } if (UI()?.savedStatus) UI().savedStatus(el, st); else el.textContent = {saved: '✓ Enregistré', dirty: '• modifié', saving: 'Enregistrement…', error: '⚠️ Pas enregistré'}[st] || ''; };
        const syncSt = () => { if (!saving) savedSt(dirty ? 'dirty' : id ? 'saved' : ''); };
        const hint = s => { $('[data-hs-hint]').textContent = s || ''; };
        /* ─── historique ─── */
        const snap0 = () => JSON.stringify(H);
        const commit = (label = '') => { hist = hist.slice(0, hpos + 1); hist.push(snap0()); if (hist.length > 120) hist.shift(); hpos = hist.length - 1; dirty = true; status(label); render(); };
        const restore = i => { if (i < 0 || i >= hist.length) return; hpos = i; H = JSON.parse(hist[hpos]); fi = clamp(fi, 0, H.floors.length - 1); sel = null; dirty = true; render(); };
        // H7 : une suppression faite sans question ; « ↶ Annuler » dans le message en bas à gauche (tant que rien d'autre n'a changé depuis)
        const undoable = message => { const at = hpos; A().undoToast?.(message, {undo: () => { if (!dlg.isConnected) throw new Error('la maison est fermée'); if (hpos !== at) throw new Error('d’autres changements ont suivi : utilise ↶ dans la barre de l’outil'); restore(at - 1); }, redo: () => { if (dlg.isConnected && hpos === at - 1) restore(at); }}); };
        /* ─── vue ─── */
        const toW = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left - panX) / zoom, (e.clientY - r.top - panY) / zoom]; };
        const applyView = () => world.setAttribute('transform', `translate(${panX} ${panY}) scale(${zoom})`);
        const fit = () => { const f = F(), pts = [...f.walls.flatMap(w => [w.a, w.b]), ...f.rooms.flatMap(r => r.pts), ...f.items.map(i => [i.x, i.y])]; const r = stage.getBoundingClientRect();
            if (!pts.length) { zoom = .6; panX = r.width / 2 - 500 * zoom; panY = r.height / 2 - 400 * zoom; applyView(); return; }
            const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
            zoom = clamp(Math.min((r.width - 120) / Math.max(100, x1 - x0), (r.height - 120) / Math.max(100, y1 - y0)), .05, 6); panX = r.width / 2 - (x0 + x1) / 2 * zoom; panY = r.height / 2 - (y0 + y1) / 2 * zoom; applyView(); };
        /* ─── aimants : grille, coins des murs, angles ─── */
        let snapO = snapPrefs(), guides = [], lastXY = null;
        const snapPt = (x, y, e, from = null) => {
            guides = [];
            if (e?.altKey) return [r1(x), r1(y)];
            const tol = 14 / zoom, f = F(), g = H.grid || 10, gr = v => snapO.grid ? Math.round(v / g) * g : Math.round(v); // sans grille : au centimètre
            const dp = draft?.kind === 'wall' || draft?.kind === 'zone' ? draft.pts || [] : [], closeP = rectClose(dp);
            if (closeP && Math.hypot(closeP[0] - x, closeP[1] - y) < tol) { guides.push({pt: closeP, close: true}); return [...closeP]; } // le 4e coin d'un rectangle
            if (dp.length > 2 && Math.hypot(dp[0][0] - x, dp[0][1] - y) < tol) { guides.push({pt: dp[0], close: true}); return [...dp[0]]; } // revenir au départ
            if (snapO.corner) { for (const w of f.walls) for (const p of [w.a, w.b]) if (Math.hypot(p[0] - x, p[1] - y) < tol) { guides.push({pt: p}); return [p[0], p[1]]; } // un coin existant
                for (const rm of f.rooms) for (const p of rm.pts) if (Math.hypot(p[0] - x, p[1] - y) < tol) { guides.push({pt: p}); return [p[0], p[1]]; } }
            if (snapO.mid) for (const w of f.walls) { const m = [r1((w.a[0] + w.b[0]) / 2), r1((w.a[1] + w.b[1]) / 2)]; if (Math.hypot(m[0] - x, m[1] - y) < tol) { guides.push({pt: m, mid: true}); return m; } } // le milieu d'un mur
            if (from && (snapO.angle || e?.shiftKey)) { const dx = x - from[0], dy = y - from[1], L = Math.hypot(dx, dy), a = Math.atan2(dy, dx), st = (e?.shiftKey ? 45 : snapO.step) * Math.PI / 180, s2 = Math.round(a / st) * st; // angles droits, 45°, 15°…
                if (L > 1 && (Math.abs(a - s2) < Math.min(.12, st / 2.5) || e?.shiftKey)) { const L2 = gr(L), p = [r1(from[0] + Math.cos(s2) * L2), r1(from[1] + Math.sin(s2) * L2)]; guides.push({a: from, b: p, ang: true}); return p; } }
            if (snapO.wall) { const nw = nearestWall(x, y); if (nw && nw.d < tol * .7) { const w = nw.w, L = wallLen(w) || 1, d0 = Math.round(nw.t * L); guides.push({pt: [nw.px, nw.py]}); return [r1(w.a[0] + (w.b[0] - w.a[0]) / L * d0), r1(w.a[1] + (w.b[1] - w.a[1]) / L * d0)]; } } // sur un mur, au cm
            let px = gr(x), py = gr(y);
            if (snapO.align) { let bx = null, by = null; // dans l'alignement d'un coin existant (lignes de rappel)
                for (const p of [...f.walls.flatMap(w => [w.a, w.b]), ...dp.slice(0, -1)]) { if (Math.abs(p[0] - x) < tol && (!bx || Math.abs(p[0] - x) < Math.abs(bx[0] - x))) bx = p; if (Math.abs(p[1] - y) < tol && (!by || Math.abs(p[1] - y) < Math.abs(by[1] - y))) by = p; }
                if (from) { if (Math.abs(from[0] - x) < tol) bx = from; if (Math.abs(from[1] - y) < tol) by = from; }
                if (bx) px = bx[0]; if (by) py = by[1]; if (bx) guides.push({a: bx, b: [px, py]}); if (by) guides.push({a: by, b: [px, py]}); }
            return [px, py];
        };
        /** le coin qui fermerait un rectangle (après deux murs à angle droit) : une aide, pas une obligation */
        const rectClose = pts => { if (pts.length !== 3) return null; const [A, B, C] = pts, u = [B[0] - A[0], B[1] - A[1]], v = [C[0] - B[0], C[1] - B[1]], lu = Math.hypot(...u), lv = Math.hypot(...v);
            if (lu < 1 || lv < 1 || Math.abs(u[0] * v[0] + u[1] * v[1]) / (lu * lv) > .02) return null; return [r1(A[0] + C[0] - B[0]), r1(A[1] + C[1] - B[1])]; };
        const wallLen = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        /* 🧱 les deux faces d'un mur : « l » (du côté de sa normale (−dy, dx)) et « r » ; la pièce qui est de chaque côté (sinon : l'extérieur) */
        const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; };
        const faceRooms = (f, w) => { const L = wallLen(w) || 1, nx = -(w.b[1] - w.a[1]) / L, ny = (w.b[0] - w.a[0]) / L, off = (w.t || f.wallT) / 2 + 12; // un mur long peut border plusieurs pièces : 3 points le long du mur
            const at = sg => [...new Set([.2, .5, .8].map(t => f.rooms.find(r => r.pts?.length > 2 && inPoly(w.a[0] + (w.b[0] - w.a[0]) * t + nx * off * sg, w.a[1] + (w.b[1] - w.a[1]) * t + ny * off * sg, r.pts))).filter(Boolean))];
            const l = at(1), r = at(-1); return {l: l[0] || null, r: r[0] || null, lAll: l, rAll: r, nx, ny}; };
        const faceOf = (w, side) => { const k = w[side + 'Mat'] || w.mat || 'platre', base = WALL_MATS.find(m => m[0] === k)?.[2] || '#eeeeee'; return [k, w[side + 'Color'] || (w[side + 'Mat'] ? base : w.color || base)]; };
        const setFace = (w, side, k, v) => { if (k === 'mat') { if (!WALL_MATS.some(m => m[0] === v)) return; w[side + 'Mat'] = v; delete w[side + 'Color']; } else if (/^#[0-9a-f]{6}$/i.test(v)) w[side + 'Color'] = v; };
        /** le même revêtement sur d'autres faces : la pièce, les pièces (ou les façades) de l'étage, de toute la maison */
        function applyFace(w, side, scope) {
            const f = F(), room = faceRooms(f, w)[side], inside = !!room, [k, c] = faceOf(w, side), out = [];
            (scope === 'house' ? H.floors : [f]).forEach(fl => fl.walls.forEach(q => { const fr = faceRooms(fl, q); ['l', 'r'].forEach(sd => { if (scope === 'room' ? fr[sd + 'All'].includes(room) : !!fr[sd] === inside) out.push([q, sd]); }); }));
            out.forEach(([q, sd]) => { q[sd + 'Mat'] = k; q[sd + 'Color'] = c; if (w.tsc) q.tsc = w.tsc; else delete q.tsc; });
            commit(`Revêtement sur ${plural(out.length, 'face')} de mur`);
        }
        const roomWalls = (f, rm) => f.walls.flatMap(q => { const fr = faceRooms(f, q); return [...(fr.lAll.includes(rm) ? [[q, 'l']] : []), ...(fr.rAll.includes(rm) ? [[q, 'r']] : [])]; });
        /** le point d'un mur le plus proche : {w, t (0..1), d (distance)} */
        const nearestWall = (x, y) => { let best = null; F().walls.forEach(w => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L2, 0, 1), px = w.a[0] + dx * t, py = w.a[1] + dy * t, d = Math.hypot(x - px, y - py); if (!best || d < best.d) best = {w, t, d, px, py}; }); return best; };
        /* ─── dessin du plan ─── */
        const defs = () => { const f = F(), pats = new Map(); f.rooms.forEach(r => { const k = `${r.floor || 'parquet'}|${r.color || ''}`; if (!pats.has(k)) pats.set(k, `hsp${pats.size}`); }); return {pats, html: [...pats].map(([k, idp]) => { const [key, color] = k.split('|'); return floorPattern(key, color, idp); }).join('') + '<marker id="hsarr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 2L5 5L0 8" fill="none" stroke="#2a5db0" stroke-width="1.5"/></marker>'}; };
        function openingSvg(o, w) {
            const L = wallLen(w), t = clamp(o.pos, 0, 1), dx = (w.b[0] - w.a[0]) / (L || 1), dy = (w.b[1] - w.a[1]) / (L || 1), cx = w.a[0] + dx * L * t, cy = w.a[1] + dy * L * t, ang = Math.atan2(dy, dx) * 180 / Math.PI, th = w.t || F().wallT, half = o.w / 2;
            const isSel = sel?.type === 'opening' && sel.id === o.id;
            let s = `<g transform="translate(${cx} ${cy}) rotate(${ang})" data-hs="opening:${o.id}" class="h-hs-op${isSel ? ' is-sel' : ''}"><rect x="${-half}" y="${-th / 2 - 1}" width="${o.w}" height="${th + 2}" fill="#fff" stroke="none"/>`;
            if (o.type === 'window') s += `<rect x="${-half}" y="${-th / 2}" width="${o.w}" height="${th}" fill="#dfeefa" stroke="#3a3530" stroke-width="1.4" vector-effect="non-scaling-stroke"/><path d="M${-half} 0H${half}" stroke="#3a3530" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
            else { const sg = o.flip ? -1 : 1, hx = o.swing === 'right' ? half : -half, ex = o.swing === 'right' ? -half : half; s += `<path d="M${hx} ${sg * th / 2}L${hx} ${sg * (th / 2 + o.w)}" stroke="#3a3530" stroke-width="1.6" vector-effect="non-scaling-stroke"/><path d="M${hx} ${sg * (th / 2 + o.w)}A${o.w} ${o.w} 0 0 ${(o.swing === 'right') === (sg > 0) ? 0 : 1} ${ex} ${sg * th / 2}" fill="none" stroke="#3a3530" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`; }
            return s + `<rect x="${-half}" y="${-th / 2 - 6}" width="${o.w}" height="${th + 12}" fill="transparent"/></g>`;
        }
        function render() {
            if (view3d && !exporting) { view3d.update?.(H, fi); paintSide(); paintFloors(); syncSt(); return; }
            const f = F(), d = defs(); $('[data-hs-defs]').innerHTML = d.html;
            const g = H.grid || 10, r = stage.getBoundingClientRect(); let step = g; while (step * zoom < 8) step *= step % 2 && step < 10 ? 2 : 5;
            const vx0 = -panX / zoom, vy0 = -panY / zoom, vx1 = vx0 + r.width / zoom, vy1 = vy0 + r.height / zoom;
            let h = '';
            if (!exporting) for (let x = Math.floor(vx0 / step) * step; x < vx1; x += step) h += `<path d="M${x} ${vy0}V${vy1}" class="${x % (step * 10) === 0 ? 'h-hs-g2' : 'h-hs-g'}"/>`;
            if (!exporting) for (let y = Math.floor(vy0 / step) * step; y < vy1; y += step) h += `<path d="M${vx0} ${y}H${vx1}" class="${y % (step * 10) === 0 ? 'h-hs-g2' : 'h-hs-g'}"/>`;
            // 📐 le plan ancien (cadastre) en fond : tourné, transparent ; pas dans les exports
            if (H.ref?.src && H.ref.show !== false && (H.ref.floor ?? f.id) === f.id && !exporting) { const R = H.ref, cx = R.x + R.w / 2, cy = R.y + R.h / 2;
                h += `<g transform="rotate(${Number(R.rot) || 0} ${cx} ${cy})" style="pointer-events:none"><image href="${esc(R.src)}" x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}" opacity="${R.op ?? .45}" preserveAspectRatio="none"/>${R.moving && !R.lock ? `<rect x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}" fill="none" stroke="#2a7de1" stroke-width="2" stroke-dasharray="10 6" vector-effect="non-scaling-stroke"/>` : ''}</g>`; }
            // 👻 calque : l'étage du dessous et/ou du dessus en transparence, pour caler celui-ci (murs et contours des pièces)
            const below = H.floors.filter(q => q.level < f.level).sort((a, b) => b.level - a.level)[0], above = H.floors.filter(q => q.level > f.level).sort((a, b) => a.level - b.level)[0];
            const gm = ghostOf(f), gop = clamp(Number(H.ghostOp ?? .3), .05, .9);
            const ghost = (q, col) => `<g opacity="${gop}" style="pointer-events:none">${q.rooms.map(rm => `<path d="M${rm.pts.map(p => p.join(' ')).join('L')}Z" fill="${col}" fill-opacity=".12" stroke="${col}" stroke-width="${2 / zoom}" stroke-dasharray="${8 / zoom} ${5 / zoom}"/>`).join('')}${q.walls.map(w => `<path d="M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}" stroke="${col}" stroke-width="${w.t || q.wallT}" stroke-linecap="square"/>`).join('')}</g>`;
            if (below && (gm === 'below' || gm === 'both')) h += ghost(below, '#7a4b1e');
            if (above && (gm === 'above' || gm === 'both')) h += ghost(above, '#1f6feb');
            f.rooms.forEach(rm => { const isSel = sel?.type === 'room' && sel.id === rm.id, [cx, cy] = centroid(rm.pts), fs = clamp(Math.sqrt(area(rm.pts)) / 9, 14, 60);
                h += `<g data-hs="room:${rm.id}" class="h-hs-room${isSel ? ' is-sel' : ''}"><path d="M${rm.pts.map(p => p.join(' ')).join('L')}Z" fill="url(#${d.pats.get(`${rm.floor || 'parquet'}|${rm.color || ''}`)})" stroke="${isSel ? '#2a7de1' : 'none'}" stroke-width="2" vector-effect="non-scaling-stroke"/>
                    <text x="${cx}" y="${cy}" font-size="${fs}" class="h-hs-rname">${esc(rm.name || 'Pièce')}</text><text x="${cx}" y="${cy + fs * 1.1}" font-size="${fs * .65}" class="h-hs-rarea">${String(r1(area(rm.pts) / 10000)).replace('.', ',')} m²${rm.people?.length || rm.note ? ' · 🕯' : ''}</text></g>`; });
            // les murs : un trait sombre, puis un plus clair par-dessus (les angles se raccordent)
            h += f.walls.map(w => `<path d="M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}" stroke="#2f2b27" stroke-width="${w.t || f.wallT}" stroke-linecap="square"/>`).join('');
            h += f.walls.map(w => { const isSel = sel?.type === 'wall' && sel.id === w.id, mc = WALL_MATS.find(m => m[0] === (w.mat || 'platre'))?.[2] || '#bbb'; return `<path data-hs="wall:${w.id}" class="h-hs-wall${isSel ? ' is-sel' : ''}" d="M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}" stroke="${isSel ? '#7fb2f0' : mc}" stroke-width="${Math.max(2, (w.t || f.wallT) - 6)}" stroke-linecap="square"/>`; }).join('');
            // 🧱 le revêtement de chaque face (s'il n'est pas le plâtre de départ) : un trait de sa couleur, en pointillés selon le motif
            h += f.walls.map(w => { const L = wallLen(w); if (L < 1) return ''; const t = w.t || f.wallT, nx = -(w.b[1] - w.a[1]) / L, ny = (w.b[0] - w.a[0]) / L;
                return ['l', 'r'].map((sd, i) => { if (!w[sd + 'Mat'] && !w[sd + 'Color'] && (!w.mat || w.mat === 'platre')) return ''; const [k, c] = faceOf(w, sd), o = (t / 2 - 3.5) * (i ? -1 : 1), d = (WALL_DASH[k] || '').split(' ').filter(Boolean).map(v => Number(v) * 3).join(' ');
                    return `<path d="M${w.a[0] + nx * o} ${w.a[1] + ny * o}L${w.b[0] + nx * o} ${w.b[1] + ny * o}" stroke="${esc(c)}" stroke-width="6" ${d ? `stroke-dasharray="${d}"` : ''} style="pointer-events:none" class="h-hs-wface"/>`; }).join(''); }).join('');
            h += f.openings.map(o => { const w = f.walls.find(q => q.id === o.wall); return w ? openingSvg(o, w) : ''; }).join('');
            f.items.forEach(it => { const isSel = sel?.type === 'item' && sel.id === it.id;
                h += `<g data-hs="item:${it.id}" class="h-hs-item${isSel ? ' is-sel' : ''}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})">${sym2d(it)}${isSel ? `<rect x="${-it.w / 2 - 4}" y="${-it.d / 2 - 4}" width="${it.w + 8}" height="${it.d + 8}" fill="none" stroke="#2a7de1" stroke-width="1.5" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/><circle cy="${-it.d / 2 - 26 / zoom}" r="${7 / zoom}" fill="#2a7de1" data-hs-rot="1"/><path d="M0 ${-it.d / 2 - 4}V${-it.d / 2 - 20 / zoom}" stroke="#2a7de1" vector-effect="non-scaling-stroke"/>` : ''}</g>`;
                if (zoom > .35 && it.name) h += `<text x="${it.x}" y="${it.y + it.d / 2 + 16 / zoom}" font-size="${11 / zoom}" class="h-hs-iname">${esc(it.name)}</text>`; });
            // cotes : chaque mur choisi, et les cotes posées
            const dim = (a, b, off, cls = '') => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) return ''; const nx = -(b[1] - a[1]) / L * off, ny = (b[0] - a[0]) / L * off, ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, flip = ang > 90 || ang < -90, mx = (a[0] + b[0]) / 2 + nx, my = (a[1] + b[1]) / 2 + ny;
                return `<g class="h-hs-dim ${cls}"><path d="M${a[0] + nx} ${a[1] + ny}L${b[0] + nx} ${b[1] + ny}" marker-start="url(#hsarr)" marker-end="url(#hsarr)"/><text x="${mx}" y="${my - 5 / zoom}" font-size="${12 / zoom}" transform="rotate(${flip ? ang + 180 : ang} ${mx} ${my})">${fmtLen(L)}</text></g>`; };
            f.dims.forEach(dm => { h += `<g data-hs="dim:${dm.id}">${dim(dm.a, dm.b, 0, sel?.type === 'dim' && sel.id === dm.id ? 'is-sel' : '')}</g>`; });
            if (f.showDims !== false) f.walls.forEach(w => { h += dim(w.a, w.b, (w.t || f.wallT) / 2 + 22 / zoom, 'is-auto'); });
            f.labels.forEach(lb => { h += `<text data-hs="label:${lb.id}" x="${lb.x}" y="${lb.y}" font-size="${lb.size || 24}" class="h-hs-label${sel?.type === 'label' && sel.id === lb.id ? ' is-sel' : ''}"${lb.font ? ` style="font-family:${esc(cssFont(lb.font))}"` : ''}>${esc(lb.text)}</text>`; });
            // ✦ les souvenirs posés (un clic : la photo, le récit)
            const mk = (x, y, ref, n) => `<g class="h-hs-memk" data-hs-memat="${ref}" transform="translate(${x} ${y})"><title>${n} souvenir${n > 1 ? 's' : ''} : clic pour voir</title><circle r="${12 / zoom}" stroke-width="${2 / zoom}"/><text font-size="${14 / zoom}">✦</text></g>`;
            f.items.forEach(it => { if (it.mem?.length) h += mk(it.x + it.w / 2 * .7, it.y - it.d / 2 * .7, `item:${it.id}`, it.mem.length); });
            f.rooms.forEach(rm => { if (!rm.mem?.length) return; const [cx, cy] = centroid(rm.pts), fs = clamp(Math.sqrt(area(rm.pts)) / 9, 14, 60); h += mk(cx, cy - fs * 1.5, `room:${rm.id}`, rm.mem.length); });
            // la sélection : poignées des murs et des pièces
            if (sel?.type === 'wall') { const w = f.walls.find(q => q.id === sel.id); if (w) h += [w.a, w.b].map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${7 / zoom}" class="h-hs-handle" data-hs-wp="${i}"/>`).join(''); }
            if (sel?.type === 'room') { const rm = f.rooms.find(q => q.id === sel.id); if (rm) h += rm.pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${6 / zoom}" class="h-hs-handle" data-hs-rp="${i}"/>`).join(''); }
            // ce qu'on est en train de tracer
            if (draft?.pts?.length) { const pts = [...draft.pts, ...(hover ? [hover] : [])], last = draft.pts[draft.pts.length - 1];
                if (draft.kind === 'wall') { h += `<path d="M${pts.map(p => p.join(' ')).join('L')}" stroke="#2a7de1" stroke-opacity=".55" stroke-width="${f.wallT}" fill="none" stroke-linecap="square"/>`; if (hover) h += dim(last, hover, f.wallT / 2 + 20 / zoom, 'is-live');
                    const st0 = draft.pts[0], D = rectClose(draft.pts); // le départ, et le rectangle qu'on pourrait fermer
                    if (D) h += `<path d="M${last.join(' ')}L${D.join(' ')}L${st0.join(' ')}" class="h-hs-ghost"/><circle cx="${D[0]}" cy="${D[1]}" r="${7 / zoom}" class="h-hs-closept"/><text x="${D[0]}" y="${D[1] - 12 / zoom}" font-size="${11 / zoom}" class="h-hs-closetxt">${fmtLen(Math.hypot(D[0] - last[0], D[1] - last[1]))} pour fermer en rectangle</text>`;
                    if (draft.pts.length > 1) h += `<circle cx="${st0[0]}" cy="${st0[1]}" r="${9 / zoom}" class="h-hs-startpt"/><text x="${st0[0]}" y="${st0[1] - 14 / zoom}" font-size="${11 / zoom}" class="h-hs-closetxt">départ${draft.pts.length > 2 ? ' (clic : fermer)' : ''}</text>`; }
                else if (draft.kind === 'zone') h += `<path d="M${pts.map(p => p.join(' ')).join('L')}Z" fill="#2a7de122" stroke="#2a7de1" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
                else if (draft.kind === 'dim' && hover) h += dim(last, hover, 0, 'is-live'); }
            if (draft?.kind === 'room' && draft.b) { const [a, b] = [draft.a, draft.b], x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), hh = Math.abs(b[1] - a[1]);
                h += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="#2a7de11a" stroke="#2a7de1" stroke-width="${f.wallT}" stroke-opacity=".5"/>` + dim([x, y], [x + w, y], -f.wallT / 2 - 20 / zoom, 'is-live') + dim([x + w, y], [x + w, y + hh], -f.wallT / 2 - 20 / zoom, 'is-live') + `<text x="${x + w / 2}" y="${y + hh / 2}" font-size="${14 / zoom}" class="h-hs-rarea">${String(r1(w * hh / 10000)).replace('.', ',')} m²</text>`; }
            if (hover && ['wall', 'zone', 'dim', 'room'].includes(tool)) { h += guides.map(q => q.pt && q.close ? `<circle cx="${q.pt[0]}" cy="${q.pt[1]}" r="${11 / zoom}" class="h-hs-snapclose"/>` : q.pt ? `<rect x="${q.pt[0] - 6 / zoom}" y="${q.pt[1] - 6 / zoom}" width="${12 / zoom}" height="${12 / zoom}" class="h-hs-snapmk${q.mid ? ' is-mid' : ''}" transform="${q.mid ? `rotate(45 ${q.pt[0]} ${q.pt[1]})` : ''}"/>` : `<path d="M${q.a[0]} ${q.a[1]}L${q.b[0]} ${q.b[1]}" class="h-hs-guide${q.ang ? ' is-ang' : ''}"/>`).join(''); h += `<circle cx="${hover[0]}" cy="${hover[1]}" r="${4 / zoom}" fill="#2a7de1"/>`; }
            world.innerHTML = h; applyView(); paintSide(); paintFloors(); if (lastXY) readout(...lastXY); syncSt(); paintCompass();
        }
        /* ─── étages ─── */
        const ghostOf = f => f.ghost || (f.showBelow === false ? 'none' : 'below');
        const ghostSel = f => `<select data-hs-ghost title="Voir un autre étage en transparence, pour caler celui-ci" aria-label="Calque d’un autre étage">${[['none', '👻 Calque : non'], ['below', '👻 Dessous'], ['above', '👻 Dessus'], ['both', '👻 Les deux']].map(([k, l]) => `<option value="${k}" ${ghostOf(f) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        function paintFloors() {
            $('[data-hs-floors]').innerHTML = [...H.floors].map((f, i) => [f, i]).sort((a, b) => b[0].level - a[0].level).map(([f, i]) => `<button type="button" class="${i === fi ? 'is-on' : ''}" data-hs-floor="${i}" title="Double-clic pour renommer">${esc(f.name)}</button>`).join('') + '<button type="button" data-hs-cmd="addfloor" title="Ajouter un étage ou une cave">＋</button><button type="button" data-hs-cmd="floors" title="Gérer les étages : renommer, hauteur, supprimer">⋯</button>' + (H.floors.length > 1 ? ghostSel(F()) : '');
            paintVers();
        }
        /* ─── panneau de droite ─── */
        const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
        function paintSide() {
            dlg.querySelectorAll('[data-hs-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.hsTab === tab));
            if (pane.contains(document.activeElement) && document.activeElement.matches('input:not([type=range]):not([type=color]):not([type=checkbox]):not([type=radio]), textarea')) return;
            const f = F();
            if (tab === 'lib' && ext.houseLibUI) { pane.innerHTML = ext.houseLibUI.pane({cat: libCat, q: libQ, mine, sym2d, setCat: c => { libCat = c; }}); return; } // catégories rangées, objets créés, bibliothèque en ligne (heritage-house-lib.js)
            if (tab === 'lib') {
                const cats = [...new Set(LIB.map(l => l[2]))], q = libQ.toLowerCase();
                const list = q ? LIB.filter(l => l[1].toLowerCase().includes(q)) : LIB.filter(l => l[2] === libCat);
                pane.innerHTML = `<input type="search" data-hs-libq placeholder="Chercher : lit, poêle, rouet…" value="${esc(libQ)}"><div class="h-hs-cats">${[...cats, 'Mes objets'].map(c => `<button type="button" class="${c === libCat && !q ? 'is-on' : ''}" data-hs-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
                    ${libCat === 'Mes objets' && !q ? `<div class="h-hs-lib">${mine.map(m => `<button type="button" data-hs-mine="${m.id}" title="${esc(m.name)} (${m.ext.toUpperCase()})">${m.thumb ? `<img src="${esc(m.thumb)}" alt="">` : '<span>🧊</span>'}<small>${esc(m.name)}</small></button>`).join('') || A().emptyState({icon: '🧊', text: 'Aucun objet importé pour l’instant', hint: '« 📥 Importer » (en haut) un fichier 3D (OBJ, STL, glTF, GLB) ou une image.'})}</div>`
                    : `<div class="h-hs-lib">${list.map(l => `<button type="button" data-hs-lib="${l[0]}" title="${esc(l[1])} — ${l[3]} × ${l[4]} cm"><svg viewBox="${-l[3] / 2 - 6} ${-l[4] / 2 - 6} ${l[3] + 12} ${l[4] + 12}" width="46" height="40">${sym2d({kind: l[0], w: l[3], d: l[4]})}</svg><small>${esc(l[1])}</small></button>`).join('')}</div>`}
                    <p class="muted h-hs-help">Clic sur un objet : il se pose au milieu de la vue ; glisse-le ensuite à sa place (R ou la poignée ronde pour tourner).</p>`;
                return;
            }
            if (tab === 'floor') {
                const R = H.ref, onThis = R?.src && (R.floor ?? f.id) === f.id, refFloor = R?.src && !onThis ? H.floors.find(q => q.id === R.floor) : null;
                pane.innerHTML = `<div class="h-hs-form">${sec('Position et taille', 'fl-pos', `<label>Nom de l’étage<input data-hs-f="name" value="${esc(f.name)}"></label><div class="h-hs-g2c"><label>Niveau<input type="number" data-hs-f="level" value="${f.level}" min="-3" max="9"></label><label>Hauteur sous plafond (cm)<input type="number" data-hs-f="height" value="${f.height}" min="150" max="800"></label></div>
                    <div class="h-hs-g2c"><label>Épaisseur des nouveaux murs (cm)<input type="number" data-hs-f="wallT" value="${f.wallT}" min="5" max="120"></label><label>Épaisseur des planchers (cm)<input type="number" data-hs-h="slab" value="${H.slab ?? 20}" min="0" max="120"></label></div>
                    <label>Pas de la grille (cm)<select data-hs-h="grid">${[1, 2, 5, 10, 25, 50, 100].map(v => `<option ${H.grid === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
                    <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="dupfloor">⧉ Dupliquer cet étage (murs)</button><button type="button" class="button small danger" data-hs-cmd="delfloor">Supprimer l’étage</button></div>`)}
                    ${sec('Affichage', 'fl-view', `<label class="checkbox-line"><input type="checkbox" data-hs-f="showDims" ${f.showDims !== false ? 'checked' : ''}> Cotes des murs</label>
                        <div class="h-hs-g2c"><label>Plafond (visite 3D)<select data-hs-f="ceil">${opt([['none', 'Aucun (ouvert)'], ['plafond', 'Plafond uni'], ['poutres', 'Poutres apparentes']], f.ceil || 'none')}</select></label><label>Couleur du plafond<input type="color" data-hs-f="ceilColor" value="${esc(/^#[0-9a-f]{6}$/i.test(f.ceilColor || '') ? f.ceilColor : '#f1ece2')}"></label></div>${H.floors.length > 1 ? `<label><span data-help="L’étage du dessous (ou du dessus) apparaît en transparence sous celui-ci : pratique pour poser les murs du 1er étage juste au-dessus de ceux du rez-de-chaussée." data-help-faq="plan de maison étages">Calque d’un autre étage</span>${ghostSel(f)}</label><label>Transparence du calque<input type="range" min="5" max="90" step="5" data-hs-ghostop data-unit="%" value="${Math.round(clamp(Number(H.ghostOp ?? .3), .05, .9) * 100)}"></label>` : ''}`)}
                    ${sec('📐 Plan ancien, cadastre', 'fl-ref', !R?.src ? `<p class="muted">Un cadastre napoléonien, un plan ancien, un croquis : pose-le en fond, mets-le à l’échelle, puis décalque les murs par-dessus.</p><div class="h-hs-refbar"><button type="button" class="button small secondary" data-hs-cmd="importplan">🖼 Choisir l’image…</button></div>`
                        : `${refFloor ? `<p class="muted">Posé sous l’étage « ${esc(refFloor.name)} ». <button type="button" class="link-button" data-hs-cmd="refhere">Le mettre sous cet étage</button></p>` : ''}
                        <label>Transparence<input type="range" min="5" max="100" data-unit="%" value="${Math.round((R.op ?? .45) * 100)}" data-hs-ref="op"></label>
                        <label>Rotation<input type="range" min="-180" max="180" step="0.5" data-unit="°" data-default="0" value="${Number(R.rot) || 0}" data-hs-ref="rot" ${R.lock ? 'disabled' : ''}></label>
                        <div class="h-hs-row"><label class="checkbox-line"><input type="checkbox" data-hs-ref="show" ${R.show !== false ? 'checked' : ''}> Visible</label><label class="checkbox-line"><input type="checkbox" data-hs-ref="lock" ${R.lock ? 'checked' : ''}> 🔒 Verrouillé</label></div>
                        <div class="h-hs-refbar"><button type="button" class="button small secondary" data-hs-cmd="calib" ${R.lock ? 'disabled' : ''} data-help="Clique les deux bouts d’une longueur connue sur l’image (un mur, l’échelle du plan), puis donne sa vraie longueur : en mètres, ou en toises et pieds anciens (convertis tout seuls)." data-help-faq="cadastre">📏 Mettre à l’échelle</button><button type="button" class="button small secondary" data-hs-cmd="refalign" ${R.lock ? 'disabled' : ''} title="Deux clics le long d’un mur de l’image : il devient droit (horizontal ou vertical)">↻ Redresser</button><button type="button" class="button small secondary${R.moving ? ' is-on' : ''}" data-hs-cmd="refmove" ${R.lock ? 'disabled' : ''}>✥ Déplacer</button></div>
                        <div class="h-hs-refbar"><button type="button" class="button small${tracing ? '' : ' secondary'}" data-hs-cmd="trace">${tracing ? '✓ Fin du décalque' : '✏️ Décalquer les murs'}</button><button type="button" class="button small secondary" data-hs-cmd="importplan">🖼 Changer d’image…</button><button type="button" class="button small danger" data-hs-cmd="refdel">Retirer</button></div>`)}
                    ${sec('🏠 Toit (vue 3D)', 'fl-roof', `<label class="checkbox-line"><input type="checkbox" data-hs-roof="on" ${H.roof?.on ? 'checked' : ''}> Un toit sur l’étage le plus haut</label>
                    ${H.roof?.on ? `<div class="h-hs-g2c"><label>Forme<select data-hs-roof="shape">${opt([['gable', 'Deux pans (pignons)'], ['hip', 'Quatre pans (croupes)'], ['pyramid', 'Pavillon (pointe)'], ['shed', 'Un pan (appentis)'], ['mansard', 'Mansardé'], ['flat', 'Plat (toit-terrasse)']], H.roof?.shape || 'gable')}</select></label><label>Faîtage<select data-hs-roof="axis">${opt([['long', 'Dans la longueur'], ['short', 'Dans la largeur'], ['x', 'Est – ouest'], ['z', 'Nord – sud']], H.roof?.axis || 'long')}</select></label>
                        <label>Pente (°)<input type="number" data-hs-roof="pitch" value="${H.roof?.pitch ?? 40}" min="2" max="75"></label><label>Débord (cm)<input type="number" data-hs-roof="over" value="${H.roof?.over ?? 35}" min="0" max="200"></label>
                        <label>Couverture<select data-hs-roof="kind">${opt([['tuiles', 'Tuiles canal'], ['tuilesplates', 'Tuiles plates'], ['vernies', 'Tuiles vernissées'], ['ardoises', 'Ardoises'], ['lauzes', 'Lauzes (pierre)'], ['chaume', 'Chaume'], ['zinc', 'Zinc'], ['bacacier', 'Bac acier']], H.roof?.kind || 'tuiles')}</select></label><label>Couleur<input type="color" data-hs-roof="color" value="${esc(/^#[0-9a-f]{6}$/i.test(H.roof?.color || '') ? H.roof.color : ({tuiles: '#8a4b3a', tuilesplates: '#9a4a32', ardoises: '#4a5058', chaume: '#b8995a', zinc: '#9aa3a8', lauzes: '#7d7a72', bacacier: '#5b6670', vernies: '#9a3b23'})[H.roof?.kind || 'tuiles'] || '#8a4b3a')}"></label>
                        <label>Pignons, acrotères<input type="color" data-hs-roof="gableColor" value="${esc(/^#[0-9a-f]{6}$/i.test(H.roof?.gableColor || '') ? H.roof.gableColor : '#e9e1cf')}"></label><label class="checkbox-line"><input type="checkbox" data-hs-roof="parapet" ${H.roof?.parapet !== false ? 'checked' : ''}> Acrotère (toit plat)</label>
                        <label class="checkbox-line"><input type="checkbox" data-hs-roof="chimney" ${H.roof?.chimney ? 'checked' : ''}> Une cheminée</label><label>Place de la cheminée<input type="range" data-hs-roof="chimneyPos" min="0" max="100" data-unit="%" value="${H.roof?.chimneyPos ?? 30}"></label></div>` : ''}`, false)}</div>`;
                return;
            }
            if (tab === 'house') {
                const m = H.meta, cs = m.census || [], vl = verList(), cur = verCur(), roomP = [], sn = sunOf(), mems = allMems();
                H.floors.forEach(fl => fl.rooms.forEach(rm => (rm.people || []).forEach(p => { if (!roomP.some(q => q.id === p.id) && !(m.people || []).some(q => q.id === p.id)) roomP.push({...p, room: rm.name || 'Pièce'}); })));
                const chips = [...(m.people || []).map(p => `<button type="button" class="h-hs-chip" data-hs-popen="${p.id}" title="Habitant${p.role ? ` : ${esc(p.role)}` : ''} — ouvrir la fiche">👤 ${esc(p.label)}</button>`), ...roomP.map(p => `<button type="button" class="h-hs-chip" data-hs-popen="${p.id}" title="Liée à la pièce « ${esc(p.room)} » — ouvrir la fiche">🕯 ${esc(p.label)}</button>`),
                    ...cs.map((c, i) => `<button type="button" class="h-hs-chip is-census" data-hs-copen="${i}" title="${esc(c.label)}${c.ver ? ` — époque : ${esc(verName((H.versions || []).find(v => v.id === c.ver) || {}))}` : ''} — ouvrir la fiche où il est">📋 ${esc(c.short || c.label)}</button>`)];
                pane.innerHTML = `<div class="h-hs-form">${sec('🔗 Rattachée à', 'h-links', `<div class="h-hs-links">${chips.join('') || '<span class="muted">Rien pour l’instant : ajoute des habitants et des recensements (plus bas).</span>'}</div>`)}
                    ${sec('📍 Lieu et époque', 'h-place', `<div data-hs-placepk><span class="pk-lab">Lieu</span>${PK().pickerField({name: 'hs_place', kind: 'place', allowFree: true, value: placeId ? {id: placeId, title: placeText || `#${placeId}`, name: String(placeText || '').split(',')[0] || `#${placeId}`} : placeText ? 'txt:' + placeText : null})}</div>
                        <label>Époque (en quelques mots)<input data-hs-m="period" value="${esc(period)}" placeholder="ex. 1850 – 1930"></label>`)}
                    ${sec(`🏷 Les souvenirs de la maison${mems.length ? ` (${mems.length})` : ''}`, 'h-mems', mems.length ? `<ul class="h-hs-memlist">${mems.map(x => `<li>${memThumb(x.m)}<button type="button" class="link-button" data-hs-memgo="${esc(x.ref)}" title="Aller à « ${esc(x.where)} » et voir le souvenir">${esc(memTitle(x.m))}<br><small>${esc(x.where)}</small></button></li>`).join('')}</ul>`
                        : A().emptyState({icon: '✦', text: 'Aucun souvenir posé pour l’instant', hint: 'Clic sur un meuble ou une pièce, puis « 🏷 Rattacher un souvenir » : une photo, un récit, une personne, un souvenir de famille.'}))}
                    ${sec('☀️ Orientation et lumière', 'h-sun', `<label><span data-help="Tourne le plan par rapport au nord : 0° = le haut du plan est au nord, 90° = le haut du plan regarde l’est. Le soleil et les ombres de la vue 3D suivent." data-help-faq="lumière du jour">Nord du plan</span><input type="range" min="0" max="359" step="1" data-unit="°" data-default="0" data-hs-sun="north" value="${sn.north}"></label>
                        <label>Heure (vue 3D)<input type="range" min="0" max="24" step="0.25" data-ui-off data-hs-sun="hour" value="${sn.hour}"><small class="muted" data-hs-sunout="hour">${esc(ext.house3d?.hourLabel?.(sn.hour) || sn.hour)}</small></label>
                        <label>Jour de l’année<input type="range" min="1" max="365" step="1" data-ui-off data-hs-sun="day" value="${sn.day}"><small class="muted" data-hs-sunout="day">${esc(ext.house3d?.dayLabel?.(sn.day) || sn.day)}</small></label>
                        <p class="muted small">${geo ? `Soleil calculé pour ${esc(placeText || 'le lieu de la maison')} (${String(Number(geo.lat).toFixed(2)).replace('.', ',')}° N).` : 'Le lieu de la maison n’a pas de coordonnées : soleil calculé pour le centre de la France.'} La nuit, les lampes posées s’allument (Vue 3D → ☀️ Lumière).</p>
                        <label><span data-help="La hauteur de tes yeux pendant la visite (🚶 Visiter, vue 3D) : 1,60 m pour un adulte, 1 m pour voir comme un enfant." data-help-faq="visiter la maison">Hauteur des yeux pour la visite (cm)</span><input type="number" min="80" max="220" step="5" data-hs-walk="eye" value="${clamp(Number(H.walk?.eye) || 160, 80, 220)}"></label>`, false)}
                    ${sec('👥 Les habitants', 'h-people', `<ul class="h-hs-people">${(m.people || []).map((p, i) => `<li><button type="button" class="link-button" data-hs-popen="${p.id}">${esc(p.label)}</button><input data-hs-prole="${i}" value="${esc(p.role || '')}" placeholder="rôle, années (né ici, 1880–1920…)"><button type="button" class="icon-button" data-hs-pdel="${i}" title="Retirer">×</button></li>`).join('') || '<li class="muted">Personne pour l’instant.</li>'}</ul>
                        <button type="button" class="button small secondary" data-hs-cmd="addpeople">＋ Ajouter un habitant…</button>`)}
                    ${sec('📋 Les recensements', 'h-census', `<ul class="h-hs-people h-hs-clist">${cs.map((c, i) => `<li><button type="button" class="link-button" data-hs-copen="${i}" title="Ouvrir la fiche où est ce recensement">📋 ${esc(c.label)}</button>${vl.length ? `<select data-hs-cver="${i}" title="L’époque de la maison qui correspond à ce recensement" aria-label="Époque"><option value="">— époque —</option>${vl.map(v => `<option value="${esc(v.id)}" ${c.ver === v.id ? 'selected' : ''}>🕰 ${esc(verName(v))}</option>`).join('')}</select>` : ''}<button type="button" class="icon-button" data-hs-cdel="${i}" title="Retirer">×</button></li>`).join('') || '<li class="muted">Aucun recensement rattaché.</li>'}</ul>
                        <button type="button" class="button small secondary" data-hs-cmd="addcensus">＋ Ajouter un recensement…</button>`)}
                    <div data-hs-versec>${sec('🕰 Les époques', 'h-vers', `${vl.length ? `<ul class="h-hs-vlist">${vl.map(v => `<li class="${v === cur ? 'is-on' : ''}"><button type="button" class="link-button" data-hs-vgo="${esc(v.id)}" title="Montrer la maison à cette époque">${v === cur ? '● ' : ''}${esc(verName(v))}</button><button type="button" class="icon-button" data-hs-vedit="${esc(v.id)}" title="Renommer, changer la date, rattacher à un recensement">✎</button><button type="button" class="icon-button" data-hs-vdel="${esc(v.id)}" title="Supprimer cette époque">×</button>${verCensus(v).length ? `<small class="muted">${verCensus(v).map(c => `📋 ${esc(c.short || c.label)}`).join(' · ')}</small>` : ''}</li>`).join('')}</ul>`
                        : '<p class="muted">La maison a changé avec le temps ? Crée une époque par année ou par date (1850, 1900, 1936…), chacune avec son plan : tu la verras évoluer, et chacune peut être rattachée à un recensement.</p>'}
                    <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="vernew">＋ Nouvelle époque (copie de celle-ci)</button>${vl.length > 1 ? `<button type="button" class="button small secondary" data-hs-cmd="verplay">${playT ? '⏹ Arrêter' : '▶ Voir évoluer'}</button>` : ''}</div>`)}</div>
                    ${sec('📖 Histoire de la maison', 'h-note', `<textarea data-hs-m="note" rows="6" aria-label="Histoire de la maison" placeholder="Construite par…, agrandie en…, vendue en…">${esc(m.note || '')}</textarea>`)}</div>`;
                return;
            }
            // Propriétés de ce qui est choisi (E2 : Position et taille · Couleur · Texte · Effets · propres à l'objet)
            const o = !sel ? null : sel.type === 'wall' ? f.walls.find(q => q.id === sel.id) : sel.type === 'room' ? f.rooms.find(q => q.id === sel.id) : sel.type === 'item' ? f.items.find(q => q.id === sel.id) : sel.type === 'opening' ? f.openings.find(q => q.id === sel.id) : sel.type === 'label' ? f.labels.find(q => q.id === sel.id) : sel.type === 'dim' ? f.dims.find(q => q.id === sel.id) : null;
            if (!o) { pane.innerHTML = `<div class="h-hs-form"><p class="muted">Pour commencer : ⬚ <b>glisse une pièce</b> (ses murs se font tout seuls), ou ▬ trace les murs un par un. Puis 🚪 portes et 🪟 fenêtres (un clic sur un mur), et le <b>mobilier</b> (onglet à côté).</p>
                <p class="muted">Clic sur un mur, une pièce, un meuble : ses réglages viennent ici (matériau, couleur, taille, nom, souvenirs). Molette : zoomer ; barre d’espace : déplacer la vue ; Alt : sans aimant.</p>
                <h4>Cet étage</h4><p>${plural(f.walls.length, 'mur')}, ${plural(f.rooms.length, 'pièce')}, ${plural(f.items.length, 'objet')} · ${String(r1(f.rooms.reduce((a, r) => a + area(r.pts), 0) / 10000)).replace('.', ',')} m² habitables</p></div>`; return; }
            const memSec = (title, extra = '') => sec(title, 'p-mem', `${extra}${memListHtml(o)}<button type="button" class="button small secondary" data-hs-cmd="memadd">🏷 Rattacher un souvenir…</button>`);
            let h = '<div class="h-hs-form">';
            if (sel.type === 'wall') h += `<h4>Mur · ${fmtLen(wallLen(o))}</h4>${sec('Position et taille', 'p-pos', `<div class="h-hs-g2c"><label>Longueur (cm)<input type="number" data-hs-p="len" value="${Math.round(wallLen(o))}" min="10"></label><label>Épaisseur (cm)<input type="number" data-hs-p="t" value="${o.t || f.wallT}" min="5" max="150"></label></div>
                <label>Angle (°, 0 = vers la droite, 90 = vers le haut)<input type="number" data-hs-p="ang" value="${degOf(o.a, o.b)}" step="0.5"></label><div class="h-hs-g4c"><label>Début X<input type="number" data-hs-p="ax" value="${r1(o.a[0])}" step="1"></label><label>Début Y<input type="number" data-hs-p="ay" value="${r1(o.a[1])}" step="1"></label><label>Fin X<input type="number" data-hs-p="bx" value="${r1(o.b[0])}" step="1"></label><label>Fin Y<input type="number" data-hs-p="by" value="${r1(o.b[1])}" step="1"></label></div>
                <label>Hauteur (cm, vide = celle de l’étage)<input type="number" data-hs-p="h" value="${o.h || ''}" min="20" max="900"></label><div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="split">✂ Couper en deux</button></div>`)}
                ${(() => { const fr = faceRooms(f, o), face = sd => { const [k, c] = faceOf(o, sd), rm = fr[sd];
                    const all = fr[sd + 'All']; return `<fieldset class="h-hs-face"><legend>${rm ? `Face côté ${all.map(x => `« ${esc(x.name || 'Pièce')} »`).join(' et ')}` : 'Face extérieure (façade)'}</legend><div class="h-hs-g2c"><label>Revêtement<select data-hs-face="${sd}:mat">${opt(WALL_MATS.map(m => [m[0], m[1]]), k)}</select></label><label>Couleur<input type="color" data-hs-face="${sd}:color" value="${esc(c)}"></label></div>
                        <div class="h-hs-row h-hs-faceapply"><small class="muted">Pareil pour :</small>${rm ? `<button type="button" class="button small secondary" data-hs-faceapply="${sd}:room" title="Les murs de « ${esc(rm.name || 'Pièce')} »">la pièce</button>` : ''}<button type="button" class="button small secondary" data-hs-faceapply="${sd}:floor" title="${rm ? 'Les murs de toutes les pièces' : 'Toutes les façades'} de cet étage">tout l’étage</button><button type="button" class="button small secondary" data-hs-faceapply="${sd}:house" title="${rm ? 'Les murs de toutes les pièces' : 'Toutes les façades'} de la maison (tous les étages)">toute la maison</button></div></fieldset>`; };
                    return sec('Couleur et texture', 'p-color', (fr.l || !fr.r ? ['l', 'r'] : ['r', 'l']).map(face).join('') + `<label><span data-help="Agrandit ou rapetisse le motif (briques, pierres, papier peint) sur ce mur : 100 % = taille réelle." data-help-faq="plan de maison">Taille du motif</span><input type="range" min="25" max="400" step="5" data-unit="%" data-default="100" data-hs-face="x:tsc" value="${o.tsc || 100}"></label>`); })()}`;
            if (sel.type === 'opening') { const w = f.walls.find(q => q.id === o.wall), L = w ? wallLen(w) : 0, s0 = r1(o.pos * L - o.w / 2);
                h += `<h4>${o.type === 'window' ? 'Fenêtre' : 'Porte'}</h4>${sec('Position et taille', 'p-pos', `<div class="h-hs-g2c"><label>Largeur (cm)<input type="number" data-hs-p="w" value="${o.w}" min="30" max="600"></label><label>Hauteur (cm)<input type="number" data-hs-p="h" value="${o.h}" min="30" max="400"></label></div>
                    ${o.type === 'window' ? `<label><span data-help="La hauteur du bas de la fenêtre au-dessus du plancher (souvent 90 cm)." data-help-faq="plan de maison">Allège (cm du sol)</span><input type="number" data-hs-p="sill" value="${o.sill ?? 90}" min="0" max="300"></label>` : ''}
                    <label>Position sur le mur<input type="range" min="0" max="1000" value="${Math.round(o.pos * 1000)}" data-hs-p="pos" data-ui-off></label>${w ? `<div class="h-hs-g2c"><label>Du début du mur (cm)<input type="number" data-hs-p="from" value="${s0}" min="0" step="1"></label><label>Jusqu’à la fin (cm)<input type="number" data-hs-p="to" value="${r1(L - s0 - o.w)}" min="0" step="1"></label></div>` : ''}`)}
                    ${o.type === 'window' ? '' : sec('🚪 Genre et ouverture', 'p-door', `<label>Genre<select data-hs-p="style">${opt([['porte', 'Porte'], ['double', 'Porte double'], ['entree', 'Porte d’entrée'], ['arche', 'Passage, arche'], ['grange', 'Porte de grange']], o.style || 'porte')}</select></label><div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="swing">↔ Sens d’ouverture</button><button type="button" class="button small secondary" data-hs-cmd="flip">⇅ Côté</button></div>`)}`; }
            if (sel.type === 'room') { const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]);
                h += `<h4>Pièce · ${(area(o.pts) / 10000).toFixed(2).replace('.', ',')} m²</h4>${sec('Position et taille', 'p-pos', `<p class="muted">${fmtLen(Math.max(...xs) - Math.min(...xs))} × ${fmtLen(Math.max(...ys) - Math.min(...ys))} hors tout · périmètre ${fmtLen(o.pts.reduce((a, p, i) => a + Math.hypot(o.pts[(i + 1) % o.pts.length][0] - p[0], o.pts[(i + 1) % o.pts.length][1] - p[1]), 0))}</p>
                    <label class="checkbox-line"><input type="checkbox" data-hs-p="follow" ${o.follow === false ? '' : 'checked'}> <span data-help="En déplaçant la pièce, ses murs (portes et fenêtres comprises), ses meubles et ses textes suivent. ⇧ en glissant : la pièce seule." data-help-faq="plan de maison">🔗 Les murs et les meubles suivent la pièce</span></label>`)}
                    ${sec('Couleur', 'p-color', `<div class="h-hs-g2c"><label>Sol<select data-hs-p="floor">${opt(FLOOR_MATS.map(m => [m[0], m[1]]), o.floor || 'parquet')}</select></label><label>Couleur<input type="color" data-hs-p="color" value="${esc(o.color || FLOOR_MATS.find(m => m[0] === (o.floor || 'parquet'))[2])}"></label></div>`)}
                    ${(() => { const rw = roomWalls(f, o); if (!rw.length) return ''; const [k, c] = faceOf(...rw[0]);
                        return sec('🧱 Murs de la pièce', 'p-rwalls', `<p class="muted small">La face de ${plural(rw.length, 'mur')} tournée vers la pièce.</p><div class="h-hs-g2c"><label>Revêtement<select data-hs-rwall="mat">${opt(WALL_MATS.map(m => [m[0], m[1]]), k)}</select></label><label>Couleur<input type="color" data-hs-rwall="color" value="${esc(c)}"></label></div>`); })()}
                    ${sec('Texte', 'p-text', `<label>Nom<input data-hs-p="name" value="${esc(o.name || '')}" list="hs-rooms"></label><datalist id="hs-rooms">${['Salle commune', 'Cuisine', 'Chambre', 'Chambre des parents', 'Chambre des enfants', 'Salon', 'Salle à manger', 'Bureau', 'Grenier', 'Cave', 'Cellier', 'Étable', 'Écurie', 'Grange', 'Fournil', 'Atelier', 'Boutique', 'Entrée', 'Couloir', 'Salle d’eau', 'Cour', 'Jardin', 'Potager', 'Basse-cour'].map(v => `<option value="${v}">`).join('')}</datalist>`)}
                    ${memSec('🕯 Souvenirs de la pièce', `<label>Ce qui s’y est passé<textarea data-hs-p="note" rows="3" placeholder="La chambre où est née Marie en 1890 ; la veillée…">${esc(o.note || '')}</textarea></label><label>Époque<input data-hs-p="period" value="${esc(o.period || '')}" placeholder="ex. 1890 – 1920"></label>
                        <ul class="h-hs-people">${(o.people || []).map((p, i) => `<li><button type="button" class="link-button" data-hs-popen="${p.id}">${esc(p.label)}</button><button type="button" class="icon-button" data-hs-rpdel="${i}" title="Retirer">×</button></li>`).join('')}</ul><button type="button" class="button small secondary" data-hs-cmd="roompeople">＋ Ajouter une personne liée à la pièce…</button>`)}`; }
            if (sel.type === 'item') { const L = libOf(o.kind), s3 = o.s3 || (o.img ? 'img' : L?.[8] || L?.[7] || 'box'), doors = ['cabinet', 'wardrobe', 'hutch', 'drawers'].includes(s3);
                h += `<h4>${esc(o.name || L?.[1] || 'Objet')}</h4>${sec('Position et taille', 'p-pos', `<div class="h-hs-g3c"><label>Largeur<input type="number" data-hs-p="w" value="${Math.round(o.w)}" min="5"></label><label>Profondeur<input type="number" data-hs-p="d" value="${Math.round(o.d)}" min="1"></label><label>Hauteur<input type="number" data-hs-p="hgt" value="${Math.round(o.h ?? L?.[5] ?? 80)}" min="1"></label></div>
                    <div class="h-hs-g3c"><label>X (cm)<input type="number" data-hs-p="x" value="${r1(o.x)}" step="1"></label><label>Y (cm)<input type="number" data-hs-p="y" value="${r1(o.y)}" step="1"></label><label><span data-help="La hauteur du dessous de l’objet au-dessus du plancher : 0 pour un meuble posé au sol, 140 pour une horloge accrochée au mur." data-help-faq="plan de maison">Du sol (cm)</span><input type="number" data-hs-p="elev" value="${o.elev || 0}" min="0" max="400"></label></div>
                    <label>Rotation (°)<input type="number" data-hs-p="rot" value="${Math.round(o.rot || 0)}" step="15"></label><div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="rot90" data-shortcut="R">⟳ 90°</button><button type="button" class="button small secondary" data-hs-cmd="dup">⧉ Dupliquer</button></div>`)}
                    ${sec('Couleur', 'p-color', `<div class="h-hs-g2c"><label>Couleur<input type="color" data-hs-p="color" value="${esc(o.color || L?.[6] || '#9a8a7a')}"></label><label>Matière<select data-hs-p="matl">${opt(OBJ_MATS.map(m => [m[0], m[1]]), o.matl || '')}</select></label></div>
                        <label title="Pieds, poignées, filets, ferrures">2ᵉ couleur<span class="h-hs-c2"><input type="color" data-hs-p="color2" value="${esc(o.color2 || '#c9a24a')}">${o.color2 ? '<button type="button" class="h-hs-vstep" data-hs-cmd="nocolor2" title="Sans deuxième couleur">×</button>' : '<small class="muted">aucune</small>'}</span></label>`)}
                    ${sec('Texte', 'p-text', `<label>Nom<input data-hs-p="name" value="${esc(o.name || '')}" placeholder="${esc(L?.[1] || '')}"></label><label>Époque, style<input data-hs-p="period" value="${esc(o.period || '')}" placeholder="ex. vers 1880, Louis-Philippe"></label>`)}
                    ${sec('Effets : pieds et détails', 'p-fx', `<div class="h-hs-g2c"><label>Pieds<select data-hs-p="feet">${opt(FEET_OPTS, o.feet || '')}</select></label><label>Coins arrondis (%)<input type="number" data-hs-p="rad" value="${o.rad || 0}" min="0" max="50" step="5"></label></div>
                        ${doors ? `<div class="h-hs-g2c"><label>Portes<input type="number" data-hs-p="doors" value="${o.doors || ''}" min="0" max="8" placeholder="auto"></label><label>Tiroirs<input type="number" data-hs-p="drawers" value="${o.drawers || ''}" min="0" max="12" placeholder="auto"></label></div>` : ''}`, !!(o.feet || o.rad || o.doors || o.drawers))}
                    ${memSec('🏷 Souvenirs de cet objet', `<label>Son histoire (objet de famille)<textarea data-hs-p="note" rows="2">${esc(o.note || '')}</textarea></label>`)}`; }
            if (sel.type === 'label') h += `<h4>Texte</h4>${sec('Position et taille', 'p-pos', `<label>Taille<input type="number" data-hs-p="size" value="${o.size || 24}" min="6" max="300"></label>`)}
                ${sec('Texte', 'p-text', `<label>Texte<input data-hs-p="text" value="${esc(o.text)}"></label><label>Police</label><div class="h-hs-row"><button type="button" class="button small secondary h-hs-fontbtn" data-hs-cmd="font" style="font-family:${esc(cssFont(o.font || 'Georgia'))}">${esc(o.font || 'Georgia (de départ)')} ▾</button>${o.font ? '<button type="button" class="icon-button small" data-hs-cmd="nofont" title="Police de départ">×</button>' : ''}</div>`)}`;
            if (sel.type === 'dim') h += `<h4>Cote · ${fmtLen(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]))}</h4>`;
            h += '<div class="h-hs-row"><button type="button" class="button small danger" data-hs-cmd="del" data-shortcut="⌫">🗑 Supprimer</button></div></div>';
            pane.innerHTML = h;
        }
        /* ─── 🕰 les époques : la maison selon les années ; chacune garde ses étages et son toit (celle qu'on dessine est dans H.floors et H.roof) ─── */
        const VKEYS = ['floors', 'roof'];
        const verKey = v => { const t = String(v.date || ''), iso = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/), fr = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/), y = t.match(/\d{4}/); return iso ? +iso[1] * 1e4 + +iso[2] * 100 + +iso[3] : fr ? +fr[3] * 1e4 + +fr[2] * 100 + +fr[1] : y ? +y[0] * 1e4 : 9e8; }; // sans date : à la fin
        const verList = () => (H.versions || []).map((v, i) => [v, i]).sort((a, b) => verKey(a[0]) - verKey(b[0]) || a[1] - b[1]).map(x => x[0]);
        const verCur = () => (H.versions || []).find(v => v.id === H.ver) || null;
        const verName = v => [v.date, v.label].filter(Boolean).join(' · ') || 'Époque';
        const verCensus = v => (H.meta?.census || []).filter(c => c.ver === v.id);
        let playT = 0;
        function switchVer(vid, quiet = false) {
            const cur = verCur(), nx = (H.versions || []).find(v => v.id === vid); if (!nx || nx === cur) return false;
            const lvl = F()?.level ?? 0;
            if (cur) VKEYS.forEach(k => { cur[k] = H[k]; });
            VKEYS.forEach(k => { H[k] = nx[k] != null ? nx[k] : clone(H[k]); delete nx[k]; });
            if (!Array.isArray(H.floors) || !H.floors.length) H.floors = [newFloor(0)];
            H.ver = nx.id; fi = H.floors.findIndex(f => f.level === lvl); if (fi < 0) fi = Math.max(0, H.floors.findIndex(f => f.level === 0));
            sel = null; draft = null; if (!quiet) { status(`🕰 ${verName(nx)}`); render(); } badge(); return true;
        }
        function badge(big = false) { const b = $('[data-hs-verbadge]'), v = verCur(); if (!b) return; b.hidden = !v; b.classList.toggle('is-big', big); if (v) b.innerHTML = `🕰 ${esc(verName(v))}${verCensus(v).length ? ` <small>📋 ${verCensus(v).map(c => esc(c.short || c.label)).join(' · ')}</small>` : ''}`; }
        function paintVers() {
            const box = $('[data-hs-vers]'); if (!box) return; const l = verList(), cur = verCur(), i = l.indexOf(cur);
            box.innerHTML = !l.length ? '<button type="button" class="button small secondary" data-hs-cmd="vernew" title="Des versions de la maison selon les années ou des dates : la voir évoluer, rattacher une époque à un recensement">🕰 Époques</button>'
                : `<button type="button" class="h-hs-vstep" data-hs-cmd="verprev" title="L’époque d’avant" ${i <= 0 ? 'disabled' : ''}>‹</button><select data-hs-ver title="L’époque montrée (plan 2D et vue 3D)" aria-label="Époque">${l.map(v => `<option value="${esc(v.id)}" ${v === cur ? 'selected' : ''}>🕰 ${esc(verName(v))}${verCensus(v).length ? ' · 📋' : ''}</option>`).join('')}<option value="__new">＋ Nouvelle époque (copie de celle-ci)…</option><option value="__manage">⋯ Gérer les époques…</option></select><button type="button" class="h-hs-vstep" data-hs-cmd="vernext" title="L’époque d’après" ${i >= l.length - 1 ? 'disabled' : ''}>›</button>`
                + `<button type="button" class="h-hs-vstep${playT ? ' is-on' : ''}" data-hs-cmd="verplay" title="${playT ? 'Arrêter' : '▶ Voir évoluer : les époques l’une après l’autre'}">${playT ? '⏹' : '▶'}</button>`;
            badge(!!playT);
        }
        function verDialog(v = null) {
            const first = !H.versions?.length, cs = H.meta.census || [];
            ext.openDialog({eyebrow: 'MAISON · ÉPOQUES', title: v ? `✎ ${verName(v)}` : '＋ Nouvelle époque (copie de celle-ci)', submitLabel: v ? 'Enregistrer' : 'Créer l’époque',
                body: `${first && !v ? `<p class="muted">La maison telle qu’elle est dessinée maintenant devient la première époque : donne-lui un nom et une date. La nouvelle époque part d’une copie, que tu changes ensuite (une pièce ajoutée, un mur abattu, d’autres meubles…).</p><fieldset class="h-hs-where"><legend>La maison dessinée maintenant</legend><div class="form-grid"><label>Nom<input name="l0" maxlength="120" value="${esc(period || 'État d’origine')}"></label><label>Année ou date<input name="d0" maxlength="40" placeholder="ex. 1850" value="${esc((String(period).match(/\d{4}/) || [''])[0])}"></label></div></fieldset><h4>La nouvelle époque</h4>` : ''}
                    <div class="form-grid"><label>Nom<input name="label" maxlength="120" value="${esc(v?.label || '')}" placeholder="ex. Après l’agrandissement"></label><label>Année ou date<input name="date" maxlength="40" value="${esc(v?.date || '')}" placeholder="1900, vers 1850, 15/03/1906"></label></div>
                    ${cs.length ? `<div class="form-grid"><label class="span-2">Rattachée au recensement<select name="census"><option value="">— aucun —</option>${cs.map((c, i) => `<option value="${i}" ${v && c.ver === v.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label></div>` : '<p class="muted">Pour la rattacher à un recensement : onglet Maison → « 📋 Les recensements » → ＋ Un recensement.</p>'}`,
                onOpen: dg => setTimeout(() => dg.querySelector('[name=label]')?.focus(), 30),
                onSubmit: f => { const lab = f.elements.label.value.trim().slice(0, 120), dat = f.elements.date.value.trim().slice(0, 40); if (!lab && !dat) { toast('Donne un nom ou une date à cette époque.', 'error'); return false; }
                    let tgt = v;
                    if (!v) { if (first) { H.versions = [{id: uid('v'), label: (f.elements.l0?.value.trim() || 'État d’origine').slice(0, 120), date: (f.elements.d0?.value.trim() || '').slice(0, 40)}]; H.ver = H.versions[0].id; }
                        const c = verCur(); tgt = {id: uid('v'), label: lab, date: dat}; VKEYS.forEach(k => { c[k] = H[k]; H[k] = clone(H[k]); }); H.versions.push(tgt); H.ver = tgt.id; }
                    else Object.assign(v, {label: lab, date: dat});
                    const ci = f.elements.census?.value; if (ci !== undefined) { cs.forEach(c => { if (c.ver === tgt.id) delete c.ver; }); if (ci !== '') cs[Number(ci)].ver = tgt.id; }
                    sel = null; commit(v ? 'Époque modifiée' : `Nouvelle époque : ${verName(tgt)}`); badge();
                    if (!v) toast('Nouvelle époque créée (copie) : change ce qui était différent. « ‹ › » en haut pour passer d’une époque à l’autre.'); }});
        }
        async function delVer(vid) {
            const v = (H.versions || []).find(q => q.id === vid); if (!v) return;
            const onlyOne = H.versions.length === 1, vName = verName(v); // H7 : sans question ; « ↶ Annuler » dans le message
            if (H.versions.length === 1) { H.versions = []; delete H.ver; } else { if (v.id === H.ver) { const l = verList(), i = l.indexOf(v); switchVer((l[i + 1] || l[i - 1]).id, true); } H.versions = H.versions.filter(q => q !== v); }
            (H.meta.census || []).forEach(c => { if (c.ver === vid) delete c.ver; }); sel = null; commit('Époque supprimée'); badge(); undoable(onlyOne ? `Époques retirées (le plan « ${vName} » reste, sans date)` : `Époque « ${vName} » supprimée avec son plan`);
        }
        function play() {
            if (playT) return stopPlay(); const l = verList(); if (l.length < 2) return toast('Crée au moins deux époques (＋ Nouvelle époque) pour voir la maison évoluer.', 'error');
            let i = 0; stage.classList.add('is-playing');
            const step = () => { if (!dlg.isConnected || !playT) return; if (i >= l.length) return stopPlay(); switchVer(l[i].id, true); render(); badge(true); i++; playT = setTimeout(step, 2600); };
            playT = -1; paintVers(); step();
        }
        function stopPlay() { if (playT > 0) clearTimeout(playT); playT = 0; stage.classList.remove('is-playing'); badge(); paintVers(); if (tab === 'house') paintSide(); }
        /** ＋ des recensements rattachés à la maison (et leurs personnes comme habitants) */
        function addCensus() {
            const m = H.meta; m.census = m.census || []; let rows = [];
            const pids = new Set([...(m.people || []).map(p => +p.id), ...H.floors.flatMap(f => f.rooms.flatMap(r => (r.people || []).map(p => +p.id)))]);
            const lab = r => ({label: `Recensement ${r.year}${r.place ? ` · ${r.place}` : ''}${r.address ? ` · ${r.address}` : ''}`.slice(0, 200), short: `${r.year}${r.place || r.address ? ` · ${r.place || r.address}` : ''}`.slice(0, 120)});
            const who = r => (r.members || []).map(x => [x.first_name, x.last_name].filter(Boolean).join(' ') || x.display_name).filter(Boolean);
            const mineR = r => (r.members || []).some(x => pids.has(+x.person_id)), vl = verList(), picked = new Set();
            ext.openDialog({eyebrow: 'MAISON', title: '＋ Un recensement', submitLabel: 'Rattacher', wide: true,
                body: `<span class="pk-lab">Recensements à rattacher</span><div class="h-pk-solo">${PK().pickerField({name: 'hs_census', kind: 'census', multiple: true})}</div><p class="muted small" data-hs-chint></p>
                    <div class="form-grid"><label class="checkbox-line"><input type="checkbox" name="addp" checked> Ajouter aussi les personnes du foyer comme habitants</label>${vl.length ? `<label>À l’époque<select name="ver"><option value="">— aucune —</option>${vl.map(v => `<option value="${esc(v.id)}" ${v === verCur() ? 'selected' : ''}>🕰 ${esc(verName(v))}</option>`).join('')}</select></label>` : ''}</div>`,
                onOpen: async dg => {
                    // le menu de choix unique (sorte census) ; les foyers (habitants) viennent de census_households
                    const field = dg.querySelector('.pk'), hint = dg.querySelector('[data-hs-chint]');
                    setTimeout(() => field.querySelector('.pk-input')?.focus(), 30);
                    field.addEventListener('picker-change', e => { picked.clear(); (e.detail.items || []).forEach(it => { if (it.id && !m.census.some(c => +c.id === +it.id)) picked.add(+it.id); else if (it.id) toast(`${it.title} est déjà rattaché.`); });
                        hint.textContent = [...picked].map(cid => { const r = rows.find(x => +x.id === cid); return r ? who(r).slice(0, 6).join(', ') + (mineR(r) ? ' · 🏠 un habitant y est' : '') : ''; }).filter(Boolean).join(' — '); });
                    try { rows = (await api('census_households', {})).records || []; } catch (e) { hint.textContent = e.message; } },
                onSubmit: f => { if (!picked.size) { toast('Choisis au moins un recensement.', 'error'); return false; }
                    const ver = f.elements.ver?.value || '', addp = f.elements.addp.checked; let np = 0;
                    picked.forEach(cid => { const r = rows.find(x => +x.id === cid) || {id: cid, year: '', members: []}; if (!r.year) { const it = pkItems(f.querySelector('.pk')).find(x => +x.id === cid); if (it) { m.census.push({id: cid, label: String(it.title).slice(0, 200), short: String(it.title).replace(/^Recensement /, '').slice(0, 120), pid: 0, ...(ver ? {ver} : {})}); return; } } const pr = (r.members || []).find(x => +x.is_primary && +x.person_id) || (r.members || []).find(x => +x.person_id);
                        m.census.push({id: cid, ...lab(r), pid: pr ? +pr.person_id : 0, ...(ver ? {ver} : {})});
                        if (addp) (r.members || []).forEach(x => { const pid = +x.person_id; if (!pid || (m.people || []).some(p => +p.id === pid)) return; m.people = [...(m.people || []), {id: pid, label: [x.first_name, x.last_name].filter(Boolean).join(' ') || x.display_name || 'Personne', role: [x.household_position, r.year].filter(Boolean).join(', ').slice(0, 200)}]; np++; }); });
                    tab = 'house'; commit(`${picked.size} recensement${picked.size > 1 ? 's' : ''} rattaché${picked.size > 1 ? 's' : ''}`); badge(); if (np) toast(`${np} habitant${np > 1 ? 's' : ''} ajouté${np > 1 ? 's' : ''} depuis le recensement.`); }});
        }
        /* ─── la souris sur le plan ─── */
        const hitOf = e => { const el = e.target.closest?.('[data-hs]'); if (!el) return null; const [type, idv] = el.dataset.hs.split(':'); return {type, id: idv}; };
        let space = false;
        svg.addEventListener('pointerdown', e => {
            stage.focus({preventScroll: true});
            const [x, y] = toW(e); svg.setPointerCapture(e.pointerId);
            if (e.button === 1 || space || tool === 'pan') { drag = {pan: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY}; return; }
            if (e.button !== 0) return;
            const mk = !draft && e.target.closest?.('[data-hs-memat]'); if (mk) { openMemView(mk.dataset.hsMemat); return; } // ✦ un souvenir posé
            const f = F();
            if (tool === 'select') {
                const wp = e.target.closest('[data-hs-wp]'), rp = e.target.closest('[data-hs-rp]'), rot = e.target.closest('[data-hs-rot]');
                if (wp && sel?.type === 'wall') { const w = f.walls.find(q => q.id === sel.id), i = Number(wp.dataset.hsWp), p = [w.a, w.b][i]; drag = {wallEnd: true, w, i, orig: [...p], linked: f.walls.flatMap(q => q === w ? [] : [[q, 'a'], [q, 'b']]).filter(([q, k]) => q[k][0] === p[0] && q[k][1] === p[1])}; return; }
                if (rp && sel?.type === 'room') { drag = {roomPt: true, rm: f.rooms.find(q => q.id === sel.id), i: Number(rp.dataset.hsRp)}; return; }
                if (rot && sel?.type === 'item') { drag = {rot: true, it: f.items.find(q => q.id === sel.id)}; return; }
                if (e.target.closest('[data-hs-ref]')) return;
                const hit = hitOf(e); sel = hit;
                if (hit?.type === 'item') { const it = f.items.find(q => q.id === hit.id); drag = {move: 'item', it, x, y, ox: it.x, oy: it.y}; }
                else if (hit?.type === 'opening') { drag = {move: 'opening', o: f.openings.find(q => q.id === hit.id)}; }
                else if (hit?.type === 'wall') { const w = f.walls.find(q => q.id === hit.id); drag = {move: 'wall', w, x, y, a: [...w.a], b: [...w.b], linked: f.walls.flatMap(q => q === w ? [] : [[q, 'a'], [q, 'b']]).flatMap(([q, k]) => [[w.a, 'a'], [w.b, 'b']].filter(([p]) => q[k][0] === p[0] && q[k][1] === p[1]).map(([, which]) => [q, k, which])), ops: f.openings.filter(o => o.wall === w.id)}; }
                else if (hit?.type === 'room') { const rm = f.rooms.find(q => q.id === hit.id); drag = {move: 'room', rm, x, y, orig: rm.pts.map(p => [...p]), grp: roomGroup(f, rm)}; }
                else if (hit?.type === 'label') { const lb = f.labels.find(q => q.id === hit.id); drag = {move: 'label', lb, x, y, ox: lb.x, oy: lb.y}; }
                else if (H.ref?.moving && !H.ref.lock) { drag = {refMove: true, x, y, ox: H.ref.x, oy: H.ref.y}; }
                render(); return;
            }
            const p = snapPt(x, y, e, draft?.pts?.[draft.pts.length - 1]);
            if (tool === 'room') { draft = {kind: 'room', a: snapPt(x, y, e), b: null}; return; }
            if (tool === 'wall' || tool === 'zone' || tool === 'dim') {
                if (!draft) { draft = {kind: tool, pts: [p]}; render(); return; }
                const first = draft.pts[0];
                if (tool !== 'dim' && draft.pts.length > 2 && Math.hypot(p[0] - first[0], p[1] - first[1]) < 14 / zoom) { draft.pts.push([...first]); finishDraft(true); return; }
                const last = draft.pts[draft.pts.length - 1]; if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) { finishDraft(); return; } // double-clic
                draft.pts.push(p); if (tool === 'dim' && draft.pts.length === 2) finishDraft(); else render(); return;
            }
            if (tool === 'door' || tool === 'window') {
                const nw = nearestWall(x, y); if (!nw || nw.d > 60) return toast('Clique sur un mur.', 'error');
                const L = wallLen(nw.w), w = tool === 'window' ? 100 : 90, pos = clamp(nw.t, (w / 2 + 5) / L, 1 - (w / 2 + 5) / L);
                const o = {id: uid('o'), wall: nw.w.id, type: tool, pos, w: Math.min(w, L - 10), h: tool === 'window' ? 120 : 210, sill: tool === 'window' ? 90 : 0, swing: 'left', flip: false, style: 'porte'};
                f.openings.push(o); sel = {type: 'opening', id: o.id}; setTool('select'); commit(tool === 'window' ? 'Fenêtre' : 'Porte'); return;
            }
            if (tool === 'text') { A().askText({title: 'Un texte sur le plan', message: 'Le texte à écrire (nom d’une pièce, d’un lieu, une remarque…)', value: '', okLabel: 'Poser'}).then(t2 => { if (t2) { const lb = {id: uid('t'), x: p[0], y: p[1], text: t2.slice(0, 200), size: 28}; f.labels.push(lb); sel = {type: 'label', id: lb.id}; setTool('select'); commit('Texte'); } }); return; }
        });
        svg.addEventListener('pointermove', e => {
            const [x, y] = toW(e), f = F(); lastXY = [x, y];
            if (drag?.pan) { panX = drag.px + e.clientX - drag.sx; panY = drag.py + e.clientY - drag.sy; applyView(); render(); return; }
            if (draft?.kind === 'room' && tool === 'room') { draft.b = snapPt(x, y, e); render(); return; } // une pièce qu'on glisse
            if (!drag) { if (['wall', 'zone', 'dim', 'room'].includes(tool)) { hover = snapPt(x, y, e, draft?.pts?.[draft.pts.length - 1]); render(); } return; }
            if (drag.wallEnd) { const p = snapPt(x, y, e, drag.i ? drag.w.a : drag.w.b); drag.w[drag.i ? 'b' : 'a'] = p; drag.linked.forEach(([q, k]) => { q[k] = [...p]; }); drag.moved = true; render(); return; }
            if (drag.roomPt) { drag.rm.pts[drag.i] = snapPt(x, y, e); drag.moved = true; render(); return; }
            if (drag.rot) { const it = drag.it, a = Math.atan2(y - it.y, x - it.x) * 180 / Math.PI + 90; it.rot = e.shiftKey ? a : Math.round(a / 15) * 15; drag.moved = true; render(); return; }
            if (drag.refMove) { H.ref.x = drag.ox + x - drag.x; H.ref.y = drag.oy + y - drag.y; drag.moved = true; render(); return; }
            if (drag.move === 'item') { const g = e.altKey ? 1 : (H.grid || 10); drag.it.x = Math.round((drag.ox + x - drag.x) / g) * g; drag.it.y = Math.round((drag.oy + y - drag.y) / g) * g; drag.moved = true; render(); return; }
            if (drag.move === 'label') { drag.lb.x = drag.ox + x - drag.x; drag.lb.y = drag.oy + y - drag.y; drag.moved = true; render(); return; }
            if (drag.move === 'opening') { const o = drag.o, w = f.walls.find(q => q.id === o.wall); if (!w) return; const L = wallLen(w), dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], t = ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / (L * L || 1); o.pos = clamp(t, (o.w / 2 + 2) / L, 1 - (o.w / 2 + 2) / L); drag.moved = true; render(); return; }
            if (drag.move === 'wall') { const g = e.altKey ? 1 : (H.grid || 10), dx = Math.round((x - drag.x) / g) * g, dy = Math.round((y - drag.y) / g) * g; drag.w.a = [drag.a[0] + dx, drag.a[1] + dy]; drag.w.b = [drag.b[0] + dx, drag.b[1] + dy]; drag.linked.forEach(([q, k, which]) => { q[k] = [...drag.w[which]]; }); drag.moved = true; render(); return; }
            if (drag.move === 'room') { const g = e.altKey ? 1 : (H.grid || 10), dx = Math.round((x - drag.x) / g) * g, dy = Math.round((y - drag.y) / g) * g; drag.rm.pts = drag.orig.map(p => [p[0] + dx, p[1] + dy]); if (!e.shiftKey) moveGroup(drag.grp, dx, dy); else moveGroup(drag.grp, 0, 0); drag.moved = true; render(); return; } // ⇧ : la pièce seule
        });
        svg.addEventListener('pointerup', e => {
            const d = drag; drag = null;
            if (draft?.kind === 'room' && tool === 'room') { const a = draft.a, b = draft.b || snapPt(...toW(e), e); draft = null; makeRoomRect(a, b); return; }
            if (!d || d.pan) return;
            if (d.moved) commit({wallEnd: 'Mur modifié', roomPt: 'Pièce modifiée', rot: 'Objet tourné', refMove: 'Plan ancien déplacé'}[Object.keys(d).find(k => ['wallEnd', 'roomPt', 'rot', 'refMove'].includes(k))] || 'Déplacé');
        });
        svg.addEventListener('dblclick', e => { if (draft) finishDraft(); else { const hit = hitOf(e); if (hit?.type === 'room') { tab = 'props'; sel = hit; render(); pane.querySelector('[data-hs-p="name"]')?.focus(); } } });
        try { window.LCNDA_UI?.pinchAsWheel?.(stage, .0018); } catch (_) {} // 🤏 téléphone : zoom à deux doigts sur le plan (pas sur la page)
        stage.addEventListener('wheel', e => { if (view3d) return; e.preventDefault(); const r = svg.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top; if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) { const z = clamp(zoom * Math.exp(-e.deltaY * .0018), .03, 8); panX = cx - (cx - panX) * z / zoom; panY = cy - (cy - panY) * z / zoom; zoom = z; } else { panX -= e.deltaX; panY -= e.deltaY; } render(); }, {passive: false});
        /** une pièce rectangulaire : 4 murs (ceux qui existent déjà ne sont pas doublés) et la pièce elle-même */
        function makeRoomRect(a, b) {
            const f = F(), x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
            if (x1 - x0 < 50 || y1 - y0 < 50) { render(); return toast('Une pièce d’au moins 50 cm de côté.', 'error'); }
            const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
            const exists = (p, q) => f.walls.some(w => (w.a[0] === p[0] && w.a[1] === p[1] && w.b[0] === q[0] && w.b[1] === q[1]) || (w.a[0] === q[0] && w.a[1] === q[1] && w.b[0] === p[0] && w.b[1] === p[1]));
            // un côté posé sur un mur existant plus long ne crée pas de mur en double
            const covered = (p, q) => f.walls.some(w => { const onLine = (P) => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy) || 1; return Math.abs((P[0] - w.a[0]) * dy - (P[1] - w.a[1]) * dx) / L < 1 && (P[0] - w.a[0]) * dx + (P[1] - w.a[1]) * dy >= -1 && (P[0] - w.b[0]) * -dx + (P[1] - w.b[1]) * -dy >= -1; }; return onLine(p) && onLine(q); });
            C.forEach((p, i) => { const q = C[(i + 1) % 4]; if (!exists(p, q) && !covered(p, q)) f.walls.push({id: uid('w'), a: [...p], b: [...q], t: f.wallT, mat: 'platre'}); });
            const n = f.rooms.length + 1, rm = {id: uid('r'), name: `Pièce ${n}`, pts: C, floor: 'parquet'}; f.rooms.push(rm); sel = {type: 'room', id: rm.id}; tab = 'props';
            commit(`Pièce de ${String(r1((x1 - x0) * (y1 - y0) / 10000)).replace('.', ',')} m²`);
            setTimeout(() => { const i = pane.querySelector('[data-hs-p="name"]'); i?.focus(); i?.select(); }, 30);
        }
        function finishDraft(closed = false) {
            const d = draft; draft = null; hover = null; const f = F(); if (!d) return render();
            if (d.kind === 'wall' && d.pts.length > 1) { for (let i = 0; i < d.pts.length - 1; i++) { const a = d.pts[i], b = d.pts[i + 1]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 5) f.walls.push({id: uid('w'), a: [...a], b: [...b], t: f.wallT, mat: 'platre'}); }
                if (closed && d.pts.length > 3) f.rooms.push({id: uid('r'), name: `Pièce ${f.rooms.length + 1}`, pts: d.pts.slice(0, -1).map(p => [...p]), floor: 'parquet'}); return commit(`${d.pts.length - 1} mur${d.pts.length > 2 ? 's' : ''}`); }
            if (d.kind === 'zone' && d.pts.length > 2) { const pts = closed ? d.pts.slice(0, -1) : d.pts; const rm = {id: uid('r'), name: `Pièce ${f.rooms.length + 1}`, pts, floor: 'parquet'}; f.rooms.push(rm); sel = {type: 'room', id: rm.id}; tab = 'props'; return commit('Pièce'); }
            if (d.kind === 'dim' && d.pts.length === 2) { f.dims.push({id: uid('m'), a: d.pts[0], b: d.pts[1]}); return commit('Cote'); }
            render();
        }
        const HINTS = {select: 'Clic : choisir · glisser : déplacer · poignées : allonger un mur, déformer une pièce · ⌫ : supprimer', pan: 'Glisser pour déplacer la vue', room: 'Glisse en diagonale : une pièce rectangulaire avec ses quatre murs (la surface s’affiche)', wall: 'Un clic par coin (aimant : grille, coins, angles droits ; Alt : libre) · double-clic ou Entrée : finir · clic sur le 1er point : fermer (et créer la pièce)', zone: 'Une pièce de forme libre (sans murs) : un clic par coin, double-clic pour finir', door: 'Clic sur un mur : une porte (glisse-la ensuite le long du mur)', window: 'Clic sur un mur : une fenêtre', dim: 'Deux clics : une cote (la distance s’affiche)', text: 'Clic : écrire un texte sur le plan'};
        function setTool(t) { if (draft && t !== tool) finishDraft(); tool = t; dlg.querySelectorAll('[data-hs-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.hsTool === t)); stage.dataset.tool = t; hint(HINTS[t] || ''); numField(); }
        /* ─── précision : coordonnées, longueur et angle en direct, saisie au clavier ─── */
        const num = $('[data-hs-num]'), degOf = (a, b) => { const d = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI; return r1((d + 360) % 360); }; // 0° vers la droite, 90° vers le haut
        function numField() { const on = ['wall', 'zone', 'dim', 'room'].includes(tool); num.hidden = !on; num.placeholder = tool === 'room' ? 'largeur x profondeur (ex. 420 x 350, 4,2 x 3,5 m) ↵' : 'longueur (cm, ou 3,5 m) puis @angle ↵'; if (!on) num.value = ''; }
        function readout(x, y) {
            const p = hover && ['wall', 'zone', 'dim', 'room'].includes(tool) ? hover : [x, y], fmt = v => String(r1(v)).replace('.', ',');
            $('[data-hs-xy]').textContent = `X ${fmt(p[0])} · Y ${fmt(p[1])} cm`;
            const last = draft?.pts?.[draft.pts.length - 1] || (draft?.kind === 'room' ? draft.a : null), q = draft?.kind === 'room' ? draft.b : hover;
            $('[data-hs-seg]').textContent = last && q ? (draft.kind === 'room' ? `${fmt(Math.abs(q[0] - last[0]))} × ${fmt(Math.abs(q[1] - last[1]))} cm` : `↦ ${fmtLen(Math.hypot(q[0] - last[0], q[1] - last[1]))} · ∠ ${String(degOf(last, q)).replace('.', ',')}°`) : '';
        }
        /** ce qu'on tape : « 350 », « 3,5 m », « 350 @ 90 » (angle en degrés, 90 = vers le haut) ; une pièce : « 420 x 350 » */
        function applyNum(raw) {
            const s2 = String(raw || '').trim().toLowerCase(); if (!s2) { if (draft) finishDraft(); return; }
            if (tool === 'room') { const [a, b0] = s2.split(/\s*[x×*]\s*/), b = b0 ?? a, u = (b.match(/(mm|cm|m)\s*$/) || [])[1], W = parseLen(u && !/(mm|cm|m)\s*$/.test(a) && parseLen(a) < 50 ? `${a} ${u}` : a), D = parseLen(b); // « 4,2 x 3,5 m » : l'unité vaut pour les deux (« 420 x 3,5 m » : 420 cm) if (!(W >= 50 && D >= 50)) return toast('Écris largeur x profondeur : 420 x 350 (cm) ou 4,2 x 3,5 m (50 cm au moins).', 'error');
                const r = stage.getBoundingClientRect(), o = draft?.a || hover || snapPt((r.width / 2 - panX) / zoom - W / 2, (r.height / 2 - panY) / zoom - D / 2, null); draft = null; makeRoomRect(o, [o[0] + W, o[1] + D]); num.value = ''; return; }
            if (!draft?.pts?.length) return toast('Clique d’abord le point de départ sur le plan, puis tape la longueur.', 'error');
            const [ls, as] = s2.split(/\s*[@<;]\s*/), L = parseLen(ls); if (!(L > 0)) return toast('Longueur incomprise : 350, 3,5 m, ou 350 @ 90 pour l’angle.', 'error');
            if (L <= 5) return toast(`${String(L).replace('.', ',')} cm, c’est trop court : pour des mètres, écris « ${ls} m ».`, 'error');
            const last = draft.pts[draft.pts.length - 1], prev = draft.pts[draft.pts.length - 2]; let ang;
            if (as !== undefined && as !== '') { const deg = Number(as.replace(',', '.').replace('°', '')); if (!Number.isFinite(deg)) return toast('Angle incompris (en degrés : 0 à droite, 90 en haut).', 'error'); ang = -deg * Math.PI / 180; }
            else if (hover && Math.hypot(hover[0] - last[0], hover[1] - last[1]) > 1) ang = Math.atan2(hover[1] - last[1], hover[0] - last[0]); // dans la direction de la souris
            else ang = prev ? Math.atan2(last[1] - prev[1], last[0] - prev[0]) : 0;
            const p = [r1(last[0] + Math.cos(ang) * L), r1(last[1] + Math.sin(ang) * L)]; draft.pts.push(p); hover = null; num.value = '';
            if (tool === 'dim' && draft.pts.length === 2) finishDraft(); else render(); readout(...p);
        }
        num.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); applyNum(num.value); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); num.value = ''; num.blur(); stage.focus({preventScroll: true}); } });
        /* ─── 🧲 aimants ─── */
        function paintSnap() {
            const box = $('[data-hs-snapbox]'), c = (k, l) => `<label class="checkbox-line"><input type="checkbox" data-hs-snap="${k}" ${snapO[k] ? 'checked' : ''}> ${l}</label>`;
            const l = setsList(); setsSel = clamp(setsSel, 0, Math.max(0, l.length - 1));
            box.innerHTML = c('grid', 'Grille') + c('corner', 'Coins des murs et des pièces') + c('mid', 'Milieu des murs') + c('wall', 'Le long des murs (au cm)') + c('align', 'Alignements (lignes de rappel)') + c('angle', 'Angles')
                + `<label><span data-help="Quand l’aimant des angles est mis, un mur tracé se cale sur des angles de ce pas : 90° = seulement des angles droits, 45° = aussi les diagonales, 15° = plus fin." data-help-faq="plan de maison">Pas des angles</span><select data-hs-snap="step">${[90, 45, 30, 15, 5, 1].map(v => `<option value="${v}" ${snapO.step === v ? 'selected' : ''}>${v}°</option>`).join('')}</select></label><label>Pas de la grille<select data-hs-snapgrid>${[1, 2, 5, 10, 25, 50, 100].map(v => `<option value="${v}" ${H.grid === v ? 'selected' : ''}>${v} cm</option>`).join('')}</select></label>`
                + '<p class="muted">Alt : aucun aimant (au mm près) · ⇧ : angles à 45° · flèches : décaler ce qui est choisi de 1 cm (⇧ : d’un pas de grille) · en traçant, tape la longueur au clavier.</p>'
                + `<div class="h-hs-sets"><b>💾 Réglages enregistrés</b><small class="muted">Les aimants, la grille, l’épaisseur des murs, la hauteur des yeux et la lumière, gardés sous un nom.</small>${l.length ? `<select data-hs-set aria-label="Réglages enregistrés">${l.map((x, i) => `<option value="${i}" ${i === setsSel ? 'selected' : ''}>${esc(x.name)}${x.date ? ` · ${esc(x.date)}` : ''}</option>`).join('')}</select><div class="h-hs-row"><button type="button" class="button small" data-hs-setcmd="apply">✓ Appliquer</button><button type="button" class="button small secondary" data-hs-setcmd="export" title="Un fichier .json, pour un autre ordinateur">⤓ Exporter</button><button type="button" class="icon-button small" data-hs-setcmd="del" title="Supprimer ce réglage">🗑</button></div>` : '<small class="muted">Aucun réglage enregistré pour l’instant.</small>'}
                    <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-setcmd="save">💾 Enregistrer sous ce nom…</button><button type="button" class="button small secondary" data-hs-setcmd="import">⤒ Importer un réglage</button></div></div>`;
        }
        $('[data-hs-snapbox]').addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-hs-setcmd]'); if (b) setsCmd(b.dataset.hsSetcmd, setsSel); });
        $('[data-hs-snapbox]').addEventListener('change', e => { const el = e.target; if (el.matches('[data-hs-set]')) { setsSel = Number(el.value) || 0; return; }
            if (el.matches('[data-hs-snapgrid]')) { H.grid = Number(el.value); commit('Grille'); return; }
            const k = el.dataset.hsSnap; if (!k) return; snapO[k] = k === 'step' ? Number(el.value) : el.checked; try { localStorage.setItem(SNAP_KEY, JSON.stringify(snapO)); } catch (_) {} });
        /** décaler au clavier ce qui est choisi */
        /** 🔗 ce qui suit une pièce qu'on déplace : les murs posés sur son contour (pas ceux qu'elle partage avec une
         *  autre pièce), les meubles et textes qui sont dedans ; les murs voisins accrochés à un coin qui bouge s'allongent */
        function roomGroup(f, rm) {
            if (rm.follow === false) return {walls: [], items: [], dims: [], linked: []};
            const onEdge = (P, pts) => pts.some((a, i) => { const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, t = ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / (L * L); return t >= -.01 && t <= 1.01 && Math.abs((P[0] - a[0]) * dy - (P[1] - a[1]) * dx) / L < 2; });
            const onRoom = (w, pts) => onEdge(w.a, pts) && onEdge(w.b, pts) && onEdge([(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], pts);
            const inside = (x, y) => { let c = false; const p = rm.pts; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c || onEdge([x, y], p); };
            const others = f.rooms.filter(q => q !== rm), walls = f.walls.filter(w => onRoom(w, rm.pts) && !others.some(q => onRoom(w, q.pts)));
            const ends = walls.flatMap(w => [w.a, w.b]), same = (p, q) => p[0] === q[0] && p[1] === q[1];
            return {walls: walls.map(w => [w, [...w.a], [...w.b]]), items: [...f.items, ...(f.labels || [])].filter(o => inside(o.x, o.y)).map(o => [o, o.x, o.y]),
                dims: (f.dims || []).filter(d => inside(...d.a) && inside(...d.b)).map(d => [d, [...d.a], [...d.b]]),
                linked: f.walls.filter(q => !walls.includes(q)).flatMap(q => ['a', 'b'].filter(k => ends.some(p => same(p, q[k]))).map(k => [q, k, [...q[k]]]))};
        }
        const moveGroup = (g, dx, dy) => { const m = p => [r1(p[0] + dx), r1(p[1] + dy)];
            g.walls.forEach(([w, a, b]) => { w.a = m(a); w.b = m(b); }); g.linked.forEach(([q, k, p]) => { q[k] = m(p); });
            g.items.forEach(([o, x, y]) => { o.x = r1(x + dx); o.y = r1(y + dy); }); g.dims.forEach(([d, a, b]) => { d.a = m(a); d.b = m(b); }); };
        function nudge(dx, dy) {
            const f = F(); if (!sel) return;
            const moveCorner = (p, q) => f.walls.forEach(w => ['a', 'b'].forEach(k => { if (w[k][0] === p[0] && w[k][1] === p[1]) w[k] = [...q]; }));
            if (sel.type === 'item' || sel.type === 'label') { const o = f[sel.type === 'item' ? 'items' : 'labels'].find(q => q.id === sel.id); if (o) { o.x = r1(o.x + dx); o.y = r1(o.y + dy); } }
            else if (sel.type === 'wall') { const w = f.walls.find(q => q.id === sel.id); if (!w) return; const a = [...w.a], b = [...w.b], na = [r1(a[0] + dx), r1(a[1] + dy)], nb = [r1(b[0] + dx), r1(b[1] + dy)]; moveCorner(a, na); moveCorner(b, nb); w.a = na; w.b = nb; }
            else if (sel.type === 'room') { const rm = f.rooms.find(q => q.id === sel.id); if (rm) { moveGroup(roomGroup(f, rm), dx, dy); rm.pts = rm.pts.map(p => [r1(p[0] + dx), r1(p[1] + dy)]); } }
            else if (sel.type === 'dim') { const dm = f.dims.find(q => q.id === sel.id); if (dm) { dm.a = [dm.a[0] + dx, dm.a[1] + dy]; dm.b = [dm.b[0] + dx, dm.b[1] + dy]; } }
            else if (sel.type === 'opening') { const o = f.openings.find(q => q.id === sel.id), w = o && f.walls.find(q => q.id === o.wall); if (!w) return; const L = wallLen(w) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, d = (dx * ux + dy * uy) || dx || dy; o.pos = clamp(o.pos + d / L, (o.w / 2 + 2) / L, 1 - (o.w / 2 + 2) / L); }
            later('Décalé');
        }
        /* ─── les commandes ─── */
        const placeItem = (base) => { const f = F(), r = stage.getBoundingClientRect(), x = (r.width / 2 - panX) / zoom, y = (r.height / 2 - panY) / zoom, g = H.grid || 10; const it = {id: uid('i'), x: Math.round(x / g) * g, y: Math.round(y / g) * g, rot: 0, ...base}; f.items.push(it); sel = {type: 'item', id: it.id}; setTool('select'); tab = 'props'; commit(`${it.name || libOf(it.kind)?.[1] || 'Objet'} posé`); };
        const pickPerson = title => new Promise(res => { let done = false;
            ext.openDialog({eyebrow: 'MAISON', title, submitLabel: 'Ajouter', body: `<div class="h-pk-solo"><span class="pk-lab">Personne</span>${PK().pickerField({name: 'hs_pick', kind: 'person'})}</div>`,
                onOpen: dg => { setTimeout(() => dg.querySelector('.pk-input')?.focus(), 30); dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); },
                onSubmit: f => { const it = pkItems(f.querySelector('.pk'))[0]; if (!it) { toast('Choisis une personne.', 'error'); return false; } done = true; res({id: Number(it.id), label: it.title || ''}); }}); });
        /* ─── 📥 importer : objets 3D, objets en image, plan ancien (le fichier entre aussi dans les médias) ─── */
        async function import3d(given = null) {
            const files = given || [...((await new Promise(res => { const inp = Object.assign(document.createElement('input'), {type: 'file', accept: '.obj,.stl,.glb,.gltf,.mtl', multiple: true}); inp.onchange = () => res(inp.files); inp.click(); })) || [])];
            if (!files.length) return; const main = files.find(f => /\.(obj|stl|glb|gltf)$/i.test(f.name)); if (!main) return toast('Il faut un fichier OBJ, STL, GLB ou glTF.', 'error');
            status('Lecture du modèle…');
            try {
                // mesurer le modèle (et une vignette) avant de l'envoyer
                const info = await ext.house3d?.inspect(main, files.find(f => /\.mtl$/i.test(f.name)));
                const fd = new FormData(); fd.append('file', main); fd.append('name', main.name.replace(/\.[^.]+$/, '')); fd.append('dims', JSON.stringify(info?.dims || {})); fd.append('thumb', info?.thumb || ''); fd.append('csrf', A().state.csrf);
                const r = await fetch('api.php?action=house_model_upload', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}); const j = await r.json().catch(() => ({}));
                if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
                let mtl = 0; const mf = files.find(f => /\.mtl$/i.test(f.name)); if (mf) { const fd2 = new FormData(); fd2.append('file', mf); fd2.append('name', main.name.replace(/\.[^.]+$/, '') + ' (couleurs)'); fd2.append('csrf', A().state.csrf); const r2 = await fetch('api.php?action=house_model_upload', {method: 'POST', body: fd2, headers: {'X-CSRF-Token': A().state.csrf}}); const j2 = await r2.json().catch(() => ({})); mtl = j2.result?.id || 0; }
                const dims = info?.dims || {w: 100, d: 100, h: 100};
                await loadMine(); status('Objet importé'); if (view3d) await toggle3d(false);
                placeItem({kind: 'model', name: j.result.name, w: Math.max(5, Math.round(dims.w)), d: Math.max(5, Math.round(dims.d)), h: Math.max(5, Math.round(dims.h)), model: {id: j.result.id, ext: j.result.ext, ...(mtl ? {mtl} : {})}});
                toast('Objet 3D importé : il est aussi dans Mobilier → « Mes objets », pour toutes les maisons.');
            } catch (e) { status(''); toast(e.message, 'error'); }
        }
        async function importImg(given = null) {
            const f = given || await pickFile('image/*'); if (!f) return;
            try { const src = await shrink(f, 600), im = await loadImg(src), k = 100 / Math.max(im.naturalWidth, im.naturalHeight); if (view3d) await toggle3d(false);
                placeItem({kind: 'image', name: f.name.replace(/\.[^.]+$/, '') || 'Objet', img: src, w: Math.round(im.naturalWidth * k), d: Math.round(im.naturalHeight * k), h: 80}); toast('Objet posé (vue de dessus) : règle sa taille réelle dans Propriétés.');
                if (given) PK().importMediaFile?.(f, ['image']).catch(() => {}); // déposé : il entre aussi dans les médias
            } catch (e) { toast(e.message, 'error'); }
        }
        /** l'adresse d'une image des médias, utilisable dans le plan (« media/… ») */
        const mediaSrc = it => { const full = it?.filename && /^(image|photo)/.test(String(it.media_type || it.sort || 'image')) ? `media/${encodeURIComponent(it.filename)}` : ''; return [full, it?.thumb, it?.thumbnail ? `media/${encodeURIComponent(it.thumbnail)}` : ''].find(v => v && imgSafe(v)) || ''; };
        /** 📐 O18 : un plan ancien (cadastre napoléonien…) en fond : choisi dans les médias (ou importé : il y entre), puis mis à l'échelle */
        async function importPlan(file = null) {
            let it = null;
            if (file) { try { status('Envoi de l’image dans les médias…'); it = await PK().importMediaFile(file, ['image']); status(''); } catch (e) { status(''); return toast(e.message, 'error'); } }
            else it = await PK().openMediaPicker?.({types: ['image'], eyebrow: 'MAISON · PLAN ANCIEN', title: 'Le plan à calquer', intro: 'Un cadastre napoléonien, un plan ancien, un croquis… « 📁 Importer » en prend un sur l’ordinateur (il entre dans les médias).', okLabel: 'Poser ce plan'});
            if (!it) return; const src = mediaSrc(it); if (!src) return toast('Cette image ne peut pas servir de plan.', 'error');
            let im; try { im = await loadImg(src); } catch (e) { return toast(e.message, 'error'); }
            if (view3d) await toggle3d(false);
            const r = stage.getBoundingClientRect(), k = 1500 / Math.max(im.naturalWidth, im.naturalHeight), w = r1(im.naturalWidth * k), h = r1(im.naturalHeight * k), cx = (r.width / 2 - panX) / zoom, cy = (r.height / 2 - panY) / zoom;
            H.ref = {src, mid: Number(it.id) || 0, x: r1(cx - w / 2), y: r1(cy - h / 2), w, h, op: .5, rot: 0, show: true, lock: false, floor: F().id}; tab = 'floor'; commit('Plan ancien posé'); fitRef();
            calibrate();
        }
        /** le plan ancien entier à l'écran */
        function fitRef() { const R = H.ref; if (!R) return; const r = stage.getBoundingClientRect(); zoom = clamp(Math.min((r.width - 80) / R.w, (r.height - 80) / R.h), .03, 6); panX = r.width / 2 - (R.x + R.w / 2) * zoom; panY = r.height / 2 - (R.y + R.h / 2) * zoom; render(); }
        /** deux clics sur le plan (un petit rond marque le premier) ; Échap : abandon */
        function twoClicks(msg) {
            return new Promise(res => { const pts = []; hint(msg); setTool('select'); let dot = null;
                const end = v => { svg.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onEsc, true); dot?.remove(); hint(HINTS[tool]); res(v); };
                const onEsc = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(null); } };
                const onDown = e => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); const p = toW(e); pts.push(p);
                    if (pts.length === 1) { dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.setAttribute('r', 7 / zoom); dot.setAttribute('fill', '#e0457b'); svg.appendChild(dot); dot.setAttribute('transform', `translate(${panX} ${panY}) scale(${zoom})`); hint(`${msg} — et maintenant le deuxième point.`); return; }
                    end(pts); };
                svg.addEventListener('pointerdown', onDown, true); document.addEventListener('keydown', onEsc, true); });
        }
        async function calibrate() {
            if (!H.ref || H.ref.lock) return; if (view3d) await toggle3d(false);
            const pts = await twoClicks('📏 Clique les deux bouts d’une longueur connue sur le plan ancien (un mur, l’échelle dessinée)'); if (!pts) return;
            const L = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); if (L < 1) return toast('Les deux points sont trop proches.', 'error');
            const real = await new Promise(res => { let done = false;
                ext.openDialog({eyebrow: 'MAISON · PLAN ANCIEN', title: '📏 Mettre le plan à l’échelle', submitLabel: 'Mettre à l’échelle',
                    body: `<p>Quelle est la vraie longueur entre ces deux points ?</p><div class="form-grid"><label>Longueur<input name="len" value="10" inputmode="decimal" autocomplete="off"></label><label>Unité<select name="unit">${OLD_UNITS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label></div>
                        <p class="muted small">Le cadastre napoléonien est souvent au 1/2500 ou au 1/1250 ; les plans anciens comptent en toises (6 pieds, 1,949 m) et en pieds du roi (32,48 cm) : écris le nombre, la conversion se fait toute seule.</p>`,
                    onOpen: dg => { setTimeout(() => { const i = dg.querySelector('[name=len]'); i.focus(); i.select(); }, 30); dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); },
                    onSubmit: f => { const v = Number(String(f.elements.len.value).trim().replace(',', '.')), u = OLD_UNITS.find(x => x[0] === f.elements.unit.value); if (!(v > 0) || !u) { toast('Écris une longueur, par exemple 12 ou 3,5.', 'error'); return false; } done = true; res(v * u[2]); }}); });
            if (!real) return; const R = H.ref, k = real / L, [ox, oy] = pts[0], cx = R.x + R.w / 2, cy = R.y + R.h / 2, nx = ox + (cx - ox) * k, ny = oy + (cy - oy) * k;
            R.w = r1(R.w * k); R.h = r1(R.h * k); R.x = r1(nx - R.w / 2); R.y = r1(ny - R.h / 2); commit('Plan ancien mis à l’échelle'); fitRef();
            toast(`À l’échelle : la longueur choisie mesure ${fmtLen(real)}. Puis « ✏️ Décalquer les murs » (onglet Étage).`);
        }
        /** ↻ deux clics le long d'un mur de l'image : il devient horizontal ou vertical */
        async function refAlign() {
            if (!H.ref || H.ref.lock) return; if (view3d) await toggle3d(false);
            const pts = await twoClicks('↻ Clique deux points le long d’un mur du plan ancien : il deviendra droit'); if (!pts) return;
            const ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) * 180 / Math.PI, delta = Math.round(ang / 90) * 90 - ang; if (Math.abs(delta) < .05) return toast('Ce mur est déjà droit.');
            const R = H.ref, [ox, oy] = pts[0], a = delta * Math.PI / 180, cx = R.x + R.w / 2 - ox, cy = R.y + R.h / 2 - oy, ncx = ox + cx * Math.cos(a) - cy * Math.sin(a), ncy = oy + cx * Math.sin(a) + cy * Math.cos(a);
            R.rot = r1(((Number(R.rot) || 0) + delta + 540) % 360 - 180); R.x = r1(ncx - R.w / 2); R.y = r1(ncy - R.h / 2); commit(`Plan ancien redressé (${String(r1(delta)).replace('.', ',')}°)`);
        }
        function toggleTrace(on = !tracing) {
            tracing = !!on && !!H.ref?.src; stage.classList.toggle('is-tracing', tracing);
            if (tracing) { H.ref.show = true; if ((H.ref.op ?? .45) < .55) H.ref.op = .6; H.ref.moving = false; if ((H.ref.floor ?? F().id) !== F().id) H.ref.floor = F().id; setTool('wall'); hint('✏️ Décalque : un clic par coin de mur, en suivant le plan ancien · double-clic ou Entrée pour finir un mur · ⬚ pour une pièce entière'); }
            else setTool('select');
            render();
        }

        /* ─── ✦ O19 : les souvenirs posés sur un meuble, un objet ou une pièce (photo, récit, personne, souvenir de famille) ─── */
        const holderOf = ref => { const [type, hid] = String(ref || '').split(':'); for (const [i, fl] of H.floors.entries()) { const o = (type === 'room' ? fl.rooms : type === 'item' ? fl.items : []).find(q => q.id === hid); if (o) return {o, type, fi: i, floor: fl}; } return null; };
        const holderName = hd => hd.type === 'room' ? (hd.o.name || 'Pièce') : (hd.o.name || libOf(hd.o.kind)?.[1] || 'Objet');
        const memTitle = m => String(m.title || m.label || (m.type === 'text' ? String(m.text || '').slice(0, 60) : '') || 'Souvenir');
        const memThumb = m => m.type === 'media' && m.src ? `<img src="${esc(m.src)}" alt="">` : `<span aria-hidden="true">${MEM_ICON[m.type] || '✦'}</span>`;
        const MEM_KIND = {media: 'Photo, document', text: 'Récit', person: 'Personne', memory: 'Souvenir de famille', object: 'Objet de famille'};
        function allMems() { return H.floors.flatMap(fl => [...fl.rooms.map(o => ['room', o]), ...fl.items.map(o => ['item', o])].flatMap(([type, o]) => (o.mem || []).map(m => ({m, ref: `${type}:${o.id}`, where: `${holderName({type, o})} · ${fl.name}`})))); }
        const memListHtml = o => (o.mem || []).length ? `<ul class="h-hs-memlist">${o.mem.map((m, i) => `<li>${memThumb(m)}<button type="button" class="link-button" data-hs-memview="${i}" title="Voir ce souvenir">${esc(memTitle(m))}<br><small>${esc(MEM_KIND[m.type] || '')}</small></button><button type="button" class="icon-button small" data-hs-memdel="${i}" title="Retirer ce souvenir (sans le supprimer de la base)">✕</button></li>`).join('')}</ul>` : '<p class="muted small">Aucun souvenir rattaché : une photo, un récit, une personne…</p>';
        /** une question à choix (boutons) → la clé choisie, ou null */
        const choose = (title, eyebrow, items) => new Promise(res => { let done = false;
            ext.openDialog({eyebrow, title, body: `<div class="h-hs-memopts">${items.map(([k, l, hint2]) => `<button type="button" class="button secondary" data-ch="${esc(k)}">${esc(l)}${hint2 ? `<br><small class="muted">${esc(hint2)}</small>` : ''}</button>`).join('')}</div>`,
                onOpen: dg => { dg.addEventListener('click', e => { const b = e.target.closest('[data-ch]'); if (!b) return; done = true; res(b.dataset.ch); dg.close(); }); dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); setTimeout(() => dg.querySelector('[data-ch]')?.focus(), 30); }}); });
        let famCache = null;
        /** les souvenirs et objets de famille de la base (si ces listes existent) */
        async function famLoad() {
            if (famCache) return famCache; const out = [];
            const [mm, oo] = await Promise.all([api('family_memories', {}).catch(() => null), api('family_objects', {}).catch(() => null)]);
            if (!mm && !oo) return (famCache = null);
            (mm?.memories || []).forEach(m => out.push({kind: 'memory', id: Number(m.id), title: m.title || 'Souvenir', sub: m.kind_label || 'Souvenir de famille', text: m.content || ''}));
            (oo?.objects || []).forEach(o => out.push({kind: 'object', id: Number(o.id), title: o.title || 'Objet', sub: ['Objet de famille', o.kind].filter(Boolean).join(' · '), text: [o.description, o.origin_text].filter(Boolean).join('\n')}));
            return (famCache = out);
        }
        function famPick(list) {
            return new Promise(res => { let done = false, q = '';
                const draw = dg => { const box = dg.querySelector('[data-fm-list]'), l = list.filter(x => norm(`${x.title} ${x.sub} ${x.text}`).includes(norm(q)));
                    box.innerHTML = l.length ? l.map(x => `<button type="button" data-fm="${x.kind}:${x.id}">${x.kind === 'object' ? '🏺' : '📜'} <b>${esc(x.title)}</b><br><small class="muted">${esc(x.sub)}${x.text ? ` · ${esc(String(x.text).slice(0, 90))}` : ''}</small></button>`).join('')
                        : A().emptyState({icon: '📜', text: list.length ? 'Aucun souvenir ne correspond.' : 'Aucun souvenir de famille pour l’instant', hint: list.length ? 'Essaie un autre mot.' : 'Listes → Mémoire familiale (recettes, expressions, chansons…) ou Objets de famille.'}); };
                ext.openDialog({eyebrow: 'MAISON · SOUVENIRS', title: '📜 Un souvenir de famille', body: `<div class="h-hs-fmwrap"><input type="search" data-fm-q placeholder="Chercher… (recette, montre, surnom)" aria-label="Chercher un souvenir"></div><div class="h-hs-fmlist" data-fm-list></div>`,
                    onOpen: dg => { draw(dg); dg.querySelector('[data-fm-q]').addEventListener('input', e => { q = e.target.value; draw(dg); }); setTimeout(() => dg.querySelector('[data-fm-q]')?.focus(), 30);
                        dg.addEventListener('click', e => { const b = e.target.closest('[data-fm]'); if (!b) return; const [k, i] = b.dataset.fm.split(':'); done = true; res(list.find(x => x.kind === k && x.id === Number(i)) || null); dg.close(); });
                        dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); }}); });
        }
        async function memAdd(given = null) {
            const f = F(), o = sel?.type === 'item' ? f.items.find(q => q.id === sel.id) : sel?.type === 'room' ? f.rooms.find(q => q.id === sel.id) : null;
            if (!o) return toast('Choisis d’abord un meuble, un objet ou une pièce.', 'error');
            const fam = given ? null : await famLoad(), nm = holderName({type: sel.type, o});
            const kind = given ? 'media' : await choose(`🏷 Rattacher un souvenir à « ${nm} »`, 'MAISON · SOUVENIRS', [['media', '🖼 Une photo, un document', 'pris dans les médias (ou importé depuis l’ordinateur)'], ['text', '✍ Un récit', 'ce qui s’est passé ici, ce qu’on en raconte'], ['person', '👤 Une personne', 'qui a vécu ici, qui s’en servait'], ...(fam ? [['family', '📜 Un souvenir de famille', 'une recette, une expression, un objet de famille…']] : [])]);
            if (!kind) return; let m = null;
            if (kind === 'media') { const it = given || await PK().openMediaPicker?.({types: ['image', 'document'], eyebrow: 'MAISON · SOUVENIRS', title: `Un souvenir pour « ${nm} »`, okLabel: 'Rattacher'}); if (!it) return;
                m = {id: uid('s'), type: 'media', mid: Number(it.id) || 0, title: String(it.title || 'Photo').slice(0, 200), src: mediaSrc(it), kind: /^[\w-]{1,20}$/.test(it.media_type || '') ? it.media_type : '', date: String(it.year || it.date_text || '').slice(0, 40)}; }
            if (kind === 'text') { m = await new Promise(res => { let done = false;
                ext.openDialog({eyebrow: 'MAISON · SOUVENIRS', title: `✍ Un récit pour « ${nm} »`, submitLabel: 'Rattacher', body: `<label>Titre<input name="title" maxlength="200" placeholder="ex. La veillée de Noël 1912"></label><label>Le récit<textarea name="text" rows="8" maxlength="2000" placeholder="Ce qui s’est passé ici, ce qu’on en raconte…"></textarea></label>`,
                    onOpen: dg => { setTimeout(() => dg.querySelector('[name=title]')?.focus(), 30); dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); },
                    onSubmit: fm => { const t = fm.elements.title.value.trim(), x = fm.elements.text.value.trim(); if (!t && !x) { toast('Écris un titre ou un récit.', 'error'); return false; } done = true; res({id: uid('s'), type: 'text', title: (t || x.slice(0, 60)).slice(0, 200), text: x.slice(0, 2000)}); }}); }); }
            if (kind === 'person') { const p = await pickPerson(`👤 Une personne liée à « ${nm} »`); if (p) m = {id: uid('s'), type: 'person', pid: p.id, label: String(p.label || '').slice(0, 200), title: String(p.label || 'Personne').slice(0, 200)}; }
            if (kind === 'family') { const x = await famPick(fam || []); if (x) m = {id: uid('s'), type: x.kind, mid: x.id, title: String(x.title).slice(0, 200), text: String(x.text || '').slice(0, 2000), label: String(x.sub || '').slice(0, 200)}; }
            if (!m) return; o.mem = [...(o.mem || []), m]; tab = 'props'; commit('Souvenir rattaché');
        }
        /** ✦ voir les souvenirs d'un meuble ou d'une pièce (clic sur le repère, en 2D, en 3D, pendant la visite) */
        function openMemView(ref, focus = -1) {
            const hd = holderOf(ref); if (!hd) return; const list = hd.o.mem || []; if (!list.length) return;
            const dg = document.createElement('dialog'); dg.className = 'modal h-modal h-hs-memdlg';
            const card = (m, i) => `<article class="h-hs-memcard" data-mi="${i}">${m.type === 'media' ? `${m.src ? `<img src="${esc(m.src)}" alt="${esc(memTitle(m))}">` : ''}<b>🖼 ${esc(memTitle(m))}</b>${m.date ? `<small class="muted">${esc(m.date)}</small>` : ''}${m.mid ? `<div><button type="button" class="button small secondary" data-mv-media="${m.mid}">↗ Ouvrir le média</button></div>` : ''}`
                : m.type === 'person' ? `<b>👤 ${esc(m.label || m.title)}</b><div><button type="button" class="button small secondary" data-mv-person="${Number(m.pid) || 0}">↗ Fiche</button></div>`
                : `<b>${MEM_ICON[m.type] || '✦'} ${esc(memTitle(m))}</b>${m.label ? `<small class="muted">${esc(m.label)}</small>` : ''}${m.text ? `<p>${esc(m.text)}</p>` : ''}`}</article>`;
            const extra = hd.type === 'room' && (hd.o.note || hd.o.period) ? `<article class="h-hs-memcard"><b>🕯 ${esc(hd.o.period || 'Ce qui s’y est passé')}</b>${hd.o.note ? `<p>${esc(hd.o.note)}</p>` : ''}</article>` : hd.type === 'item' && hd.o.note ? `<article class="h-hs-memcard"><b>🏺 Son histoire</b><p>${esc(hd.o.note)}</p></article>` : '';
            dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">✦ ${esc(plural(list.length, 'souvenir'))} · ${esc(hd.floor.name)}</span><h2>${esc(holderName(hd))}</h2></div><button type="button" class="icon-button" data-mv-x aria-label="Fermer">×</button></div>
                <div class="h-dialog-body h-hs-memv">${list.map(card).join('')}${extra}</div><div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-mv-x>Fermer</button></div></form>`;
            document.body.appendChild(dg); dg.addEventListener('close', () => dg.remove());
            dg.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return;
                if (b.hasAttribute('data-mv-x')) return dg.close();
                if (b.dataset.mvMedia) { try { const [it] = await PK().loadMedia([Number(b.dataset.mvMedia)]); if (it) PK().openMedia(it); else toast('Ce média n’existe plus.', 'error'); } catch (err) { toast(err.message, 'error'); } return; }
                if (b.dataset.mvPerson) { const pid = Number(b.dataset.mvPerson); if (!pid) return; if (dirty && !await A().confirmBox('La maison non enregistrée sera perdue (💾 d’abord).', {title: 'Ouvrir la fiche ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return; dg.close(); dirty = false; close(); A().openPersonById?.(pid); } });
            dg.showModal(); if (focus >= 0) dg.querySelector(`[data-mi="${focus}"]`)?.scrollIntoView({block: 'center'});
        }

        /* ─── ☀️ O17 : orientation et lumière (gardées avec la maison) ; 🧭 la boussole du plan ─── */
        const sunOf = () => ({north: 0, hour: 15, day: 172, shadows: true, ...(H.sun && typeof H.sun === 'object' ? H.sun : {})});
        let quietT = 0;
        /** un réglage qui ne change pas le dessin (lumière, hauteur des yeux) : gardé dans l'historique sans tout redessiner */
        const quietCommit = label => { dirty = true; syncSt(); clearTimeout(quietT); quietT = setTimeout(() => { hist = hist.slice(0, hpos + 1); hist.push(snap0()); if (hist.length > 120) hist.shift(); hpos = hist.length - 1; status(label); }, 600); };
        function paintCompass() { const c = $('[data-hs-compass]'); if (!c) return; c.hidden = !!view3d; c.querySelector('svg').style.transform = `rotate(${Number(sunOf().north) || 0}deg)`; }

        /* ─── 💾 réglages enregistrés : aimants, grille, murs, visite, lumière ─── */
        const setsData = () => ({snap: {...snapO}, grid: H.grid || 10, wallT: F().wallT, slab: H.slab ?? 20, ghostOp: Number(H.ghostOp ?? .3), eye: clamp(Number(H.walk?.eye) || 160, 80, 220), sun: sunOf()});
        function applySet(d) {
            if (!d || typeof d !== 'object') return false;
            if (d.snap && typeof d.snap === 'object') { Object.keys(SNAP0).forEach(k => { if (k in d.snap) snapO[k] = k === 'step' ? ([90, 45, 30, 15, 5, 1].includes(Number(d.snap.step)) ? Number(d.snap.step) : 45) : !!d.snap[k]; }); try { localStorage.setItem(SNAP_KEY, JSON.stringify(snapO)); } catch (_) {} }
            if ([1, 2, 5, 10, 25, 50, 100].includes(Number(d.grid))) H.grid = Number(d.grid);
            if (Number(d.wallT) >= 5 && Number(d.wallT) <= 120) F().wallT = Number(d.wallT);
            if (Number(d.slab) >= 0 && Number(d.slab) <= 120) H.slab = Number(d.slab);
            if (Number(d.ghostOp) >= .05 && Number(d.ghostOp) <= .9) H.ghostOp = Number(d.ghostOp);
            if (Number(d.eye) >= 80 && Number(d.eye) <= 220) H.walk = {...(H.walk || {}), eye: Number(d.eye)};
            if (d.sun && typeof d.sun === 'object') { const s = {}; if (Number.isFinite(+d.sun.north)) s.north = clamp(+d.sun.north, 0, 359); if (Number.isFinite(+d.sun.hour)) s.hour = clamp(+d.sun.hour, 0, 24); if (Number.isFinite(+d.sun.day)) s.day = clamp(Math.round(+d.sun.day), 1, 365); if (typeof d.sun.shadows === 'boolean') s.shadows = d.sun.shadows; H.sun = {...sunOf(), ...s}; }
            view3d?.setSun?.(); return true;
        }
        async function setsCmd(k, idx) {
            const l = setsList(), cur = l[idx];
            if (k === 'apply' && cur) { applySet(cur.v); paintSnap(); commit(`Réglage « ${cur.name} » appliqué`); return; }
            if (k === 'del' && cur) { A().undoLocalChange(`Réglage « ${cur.name} » supprimé`, [SETS_KEY], () => { l.splice(idx, 1); setsSave(l); }, () => { if (dlg.isConnected) paintSnap(); }); paintSnap(); return; }
            if (k === 'export' && cur) { downloadText(JSON.stringify({lcnda: 'reglage', outil: SETS_TOOL, nom: cur.name, version: 1, donnees: cur.v}, null, 1), `lcnda-reglage-${SETS_TOOL}-${slug(cur.name)}.json`); toast('Fichier prêt : il s’importe dans 🧲 Aimants → « ⤒ Importer un réglage ».'); return; }
            if (k === 'save') { const n = String(await A().askText({title: '💾 Enregistrer ces réglages', message: 'Nom de ces réglages (aimants, grille, épaisseur des murs, hauteur des yeux, lumière) :', value: cur?.name || 'Mes réglages', okLabel: 'Enregistrer'}) || '').trim().slice(0, 80); if (!n) return;
                const at = l.findIndex(x => x.name === n); if (at >= 0 && !await A().confirmBox('', {title: `Remplacer le réglage « ${n} » ?`, okLabel: 'Remplacer'})) return;
                const row = {name: n, date: new Date().toISOString().slice(0, 10), v: setsData()}; if (at >= 0) l[at] = row; else l.push(row); if (setsSave(l)) { setsSel = at >= 0 ? at : l.length - 1; paintSnap(); toast(`Réglages enregistrés sous « ${n} ».`); } return; }
            if (k === 'import') return importSet();
        }
        let setsSel = 0;
        async function importSet(file = null) {
            file = file || await pickFile('.json,application/json'); if (!file) return; let d;
            try { d = JSON.parse(await file.text()); } catch (_) { return toast('Ce fichier n’est pas lisible (il faut un fichier .json de réglage).', 'error'); }
            if (d?.lcnda !== 'reglage' || !d.donnees || typeof d.donnees !== 'object') return toast('Ce fichier n’est pas un réglage LCNDA (⤓ Exporter un réglage, dans un outil).', 'error');
            if (d.outil !== SETS_TOOL) return toast(`Ce réglage est celui d’un autre outil (« ${String(d.outil || '?').slice(0, 40)} ») : importe-le dans cet outil-là, pas dans la Maison.`, 'error');
            const l = setsList(); let n = String(d.nom || 'Réglage importé').trim().slice(0, 80) || 'Réglage importé';
            while (l.some(x => x.name === n)) { const n2 = String(await A().askText({title: 'Ce nom est déjà pris', message: `Un réglage s’appelle déjà « ${n} ». Nom du réglage importé :`, value: `${n} (importé)`, okLabel: 'Importer'}) || '').trim().slice(0, 80); if (!n2) return; n = n2; }
            l.push({name: n, date: new Date().toISOString().slice(0, 10), v: d.donnees}); if (!setsSave(l)) return; setsSel = l.length - 1; paintSnap(); toast(`Réglage « ${n} » importé : « ✓ Appliquer » pour t’en servir.`);
        }

        /* ─── ⤓ E3 : la fenêtre d'export unique ; 🏠 le fichier de la maison ─── */
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const blobToDataUrl = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
        async function toMedia(blob, filename) { try { await PK().importMediaFile(new File([blob], filename, {type: blob.type}), ['image']); toast('Une copie est rangée dans les médias.'); } catch (e) { toast(`Copie dans les médias impossible : ${e.message}`, 'error'); } }
        async function exportDlg() {
            const U = UI(); if (!U?.openExportDialog) return CMD.png();
            const planBlob = async (q, type) => { const s = planSvg(); if (!s) throw new Error('Le plan de cet étage est vide.'); return svgToBlob(s, (q || 300) / 150, type); };
            await U.openExportDialog({title: name, defaultName: `${name} ${F().name}`, quality: 300, saveCopy: true, info: `${F().name}${verCur() ? ` · ${verName(verCur())}` : ''} · ${plural(H.floors.length, 'étage')}`,
                preview: async () => (await thumb(F())) || null,
                formats: [
                    {id: 'png', hint: 'le plan de l’étage', run: async o => { const b = await planBlob(o.quality, 'image/png'); download(b, o.filename); if (o.saveCopy) await toMedia(b, o.filename); }},
                    {id: 'jpg', hint: 'le plan, plus léger', run: async o => { const b = await planBlob(o.quality, 'image/jpeg'); download(b, o.filename); if (o.saveCopy) await toMedia(b, o.filename); }},
                    {id: 'pdf', hint: 'le plan sur une page A4', run: async o => { const b = await planBlob(o.quality, 'image/jpeg'), url = await blobToDataUrl(b), im = await loadImg(url); download(jpegPdf(url, im.naturalWidth, im.naturalHeight, name), o.filename); }},
                    {id: 'svg', hint: 'le plan, en dessin', run: async o => { const s = planSvg(); if (!s) throw new Error('Le plan de cet étage est vide.'); download(new Blob([s], {type: 'image/svg+xml'}), o.filename); }},
                    {id: 'print', hint: 'le plan, tout de suite', run: async () => CMD.print()},
                    {id: 'shot3d', label: '🧊 Vue 3D', hint: 'image de la vue 3D', ext: 'png', quality: false, run: async o => { if (!view3d) { await toggle3d(true); await sleep(600); } const b = await view3d?.shot(); if (!b) throw new Error('Vue 3D indisponible.'); download(b, o.filename); if (o.saveCopy) await toMedia(b, o.filename); }},
                    {id: 'file', label: '💾 Fichier de la maison', hint: 'à réimporter (📥 Importer)', ext: 'json', run: async o => downloadText(JSON.stringify({lcnda: 'maison', version: 1, name, period, place_text: placeText, house: H}), o.filename)},
                ]});
        }
        async function importHouseFile(file = null) {
            file = file || await pickFile('.json,application/json'); if (!file) return; let d;
            try { d = JSON.parse(await file.text()); } catch (_) { return toast('Ce fichier n’est pas lisible.', 'error'); }
            if (d?.lcnda === 'reglage') return importSet(file);
            if (d?.lcnda !== 'maison' || !d.house || typeof d.house !== 'object') return toast('Ce fichier n’est pas une maison LCNDA (⤓ Exporter → 💾 Fichier de la maison).', 'error');
            if (H.floors.some(f => f.walls.length || f.rooms.length || f.items.length) && !await A().confirmBox('Le plan dessiné ici sera remplacé par celui du fichier (↶ pour revenir en arrière).', {title: 'Remplacer le plan par celui du fichier ?', okLabel: 'Remplacer le plan'})) return;
            const nh = {...newHouse(), ...cleanHouse(d.house)}; if (!Array.isArray(nh.floors) || !nh.floors.length) nh.floors = [newFloor(0)]; if (!nh.meta || typeof nh.meta !== 'object') nh.meta = {people: [], note: ''};
            if (Array.isArray(nh.versions) && nh.versions.length && !nh.versions.some(v => v.id === nh.ver)) { const v0 = {id: uid('v'), label: 'Époque sans nom', date: ''}; nh.versions.push(v0); nh.ver = v0.id; }
            if (view3d) await toggle3d(false); stopPlay(); toggleTrace(false); H = nh; fi = Math.max(0, H.floors.findIndex(f => f.level === 0)); sel = null; draft = null;
            if (!id && d.name) { name = String(d.name).slice(0, 200); $('[data-hs-name]').value = name; } if (!period && d.period) period = String(d.period).slice(0, 120);
            badge(); commit('Maison importée'); fit(); render();
        }
        /* ─── 📁 E4 : un fichier déposé ou collé sur le plan ─── */
        async function onDropFiles(files) {
            const f3 = files.filter(f => /\.(obj|stl|glb|gltf|mtl)$/i.test(f.name)); if (f3.length) return import3d(f3);
            const js = files.find(f => /\.json$/i.test(f.name)); if (js) return importHouseFile(js);
            const img = files.find(f => /^image\//.test(f.type)); if (!img) return toast('Dépose une image, un objet 3D (OBJ, STL, glTF, GLB) ou un fichier de maison.', 'error');
            const canMem = sel?.type === 'item' || sel?.type === 'room';
            const what = await choose('📁 Que faire de cette image ?', 'MAISON', [['plan', '📐 Un plan ancien, un cadastre, à calquer', 'posé en fond, à mettre à l’échelle'], ['item', '🖼 Un objet vu de dessus', 'posé sur le plan comme un meuble'], ...(canMem ? [['mem', '🏷 Un souvenir pour ce qui est choisi', 'rattaché au meuble ou à la pièce']] : [])]);
            if (what === 'plan') return importPlan(img);
            if (what === 'item') return importImg(img);
            if (what === 'mem') { try { const it = await PK().importMediaFile(img, ['image']); return memAdd(it); } catch (e) { return toast(e.message, 'error'); } }
        }
        const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible.')); i.src = src; });
        const shrink = async (file, max) => { const src = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); }); const im = await loadImg(src), k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL(/png/i.test(file.type) ? 'image/png' : 'image/jpeg', .85); };
        async function loadMine() { try { mine = ((await api('house_models')).items || []).filter(m => m.ext !== 'mtl'); } catch (_) { mine = []; } }
        function planSvg(f = F()) {
            const pts = [...f.walls.flatMap(w => [w.a, w.b]), ...f.rooms.flatMap(r => r.pts), ...f.items.flatMap(i => [[i.x - i.w / 2, i.y - i.d / 2], [i.x + i.w / 2, i.y + i.d / 2]])]; if (!pts.length) return null;
            const m = 80, x0 = Math.min(...pts.map(p => p[0])) - m, y0 = Math.min(...pts.map(p => p[1])) - m, x1 = Math.max(...pts.map(p => p[0])) + m, y1 = Math.max(...pts.map(p => p[1])) + m;
            // l'étage demandé, sans la grille ni la sélection, même depuis la vue 3D ; puis on remet tout
            const z0 = zoom, px = panX, py = panY, s0 = sel, f0 = fi, want = H.floors.indexOf(f); zoom = 1; panX = -x0; panY = -y0; sel = null; if (want >= 0) fi = want; exporting = true;
            let body = '', dfs = ''; try { render(); body = world.innerHTML; dfs = $('[data-hs-defs]').innerHTML; } finally { exporting = false; zoom = z0; panX = px; panY = py; sel = s0; fi = f0; render(); }
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" width="${Math.round(x1 - x0)}" height="${Math.round(y1 - y0)}"><style>.h-hs-rname{font-family:Georgia,serif;text-anchor:middle;fill:#3a3530;font-weight:700}.h-hs-rarea{font-family:Georgia,serif;text-anchor:middle;fill:#6a6560}.h-hs-iname{font-family:Helvetica,sans-serif;text-anchor:middle;fill:#555}.h-hs-label{font-family:Georgia,serif;fill:#3a3530}.h-hs-dim path{stroke:#2a5db0;stroke-width:1;fill:none}.h-hs-dim text{fill:#2a5db0;text-anchor:middle;font-family:Helvetica,sans-serif}</style><defs>${dfs}</defs><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#fff"/>${body}<text x="${x0 + 30}" y="${y1 - 30}" font-family="Georgia,serif" font-size="36" fill="#3a3530">${esc(name)} — ${esc(f.name)}${verCur() ? ` — ${esc(verName(verCur()))}` : ''}</text></svg>`;
        }
        /** le dessin (SVG) en image : « scale » pixels par centimètre (2 = 300 ppp), 8000 px au plus */
        const svgToBlob = (svgText, scale = 2, type = 'image/png') => new Promise((ok, ko) => { const m = svgText.match(/width="(\d+)" height="(\d+)"/), k0 = Math.min(scale, 8000 / Math.max(+m[1], +m[2])), W = Math.max(1, Math.round(+m[1] * k0)), Hh = Math.max(1, Math.round(+m[2] * k0)), url = URL.createObjectURL(new Blob([svgText], {type: 'image/svg+xml'})), i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, Hh); g.drawImage(i, 0, 0, W, Hh); URL.revokeObjectURL(url); c.toBlob(ok, type, .92); }; i.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image impossible.')); }; i.src = url; });
        const svgToPng = svgText => svgToBlob(svgText, 2, 'image/png');
        const download = (blob, fname) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
        const fname = ext2 => `${A().safeExportFilename ? A().safeExportFilename(name, 'maison') : 'maison'}.${ext2}`;
        async function thumb(fl = null) { const s = planSvg(fl || H.floors.find(f => f.level === 0) || F()); if (!s) return ''; try { const b = await svgToPng(s.replace(/width="(\d+)" height="(\d+)"/, (m0, w, h) => { const k = 240 / Math.max(+w, +h); return `width="${Math.round(w * k)}" height="${Math.round(h * k)}"`; })); return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); } catch (_) { return ''; } }
        async function save() {
            name = $('[data-hs-name]').value.trim() || 'Maison de famille'; saving = true; savedSt('saving');
            try { const r = await post('save_house', {id, name, place_id: placeId, place_text: placeText, period, house: H, thumb: await thumb()}); id = r.result.id; dirty = false; saving = false; savedSt('saved'); status(''); ctx.onSaved?.(id); } catch (e) { saving = false; savedSt('error'); toast(e.message, 'error'); }
        }
        async function toggle3d(on) {
            dlg.querySelectorAll('[data-hs-mode]').forEach(b => b.classList.toggle('is-active', b.dataset.hsMode === (on ? '3d' : '2d'))); $('[data-hs-pbar]').hidden = !!on;
            if (on && !view3d) { if (!ext.house3d) return toast('Vue 3D indisponible.', 'error'); status('Construction de la maison en 3D…'); const box = $('[data-hs-3d]'); box.hidden = false; svg.style.display = 'none';
                try { if (tracing) toggleTrace(false); view3d = await ext.house3d.mount(box, H, fi, {geo, onMemory: r => openMemView(`${r.type}:${r.id}`)}); status(''); paintCompass(); hint('Glisser : tourner · clic droit ou ⇧ glisser : déplacer · molette : approcher · ☀️ Lumière : l’heure et la saison · 🚶 Visiter : Z Q S D ou flèches · ✦ : un souvenir'); } catch (e) { box.hidden = true; svg.style.display = ''; status(''); return toast(e.message, 'error'); } }
            if (!on && view3d) { view3d.destroy(); view3d = null; $('[data-hs-3d]').hidden = true; svg.style.display = ''; hint(HINTS[tool]); render(); }
            paintCompass();
        }
        async function close() { if (dirty && !await A().confirmBox('Les dernières modifications de la maison seront perdues.', {title: 'Fermer sans enregistrer la maison ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; stopPlay(); view3d?.destroy(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); dlg.close(); dlg.remove(); ctx.onClose?.(); }
        const CMD = {
            close, save, undo: () => restore(hpos - 1), redo: () => restore(hpos + 1),
            del: () => { const f = F(); if (!sel) return; if (sel.type === 'wall') { f.openings = f.openings.filter(o => o.wall !== sel.id); f.walls = f.walls.filter(w => w.id !== sel.id); } else { const k = {room: 'rooms', item: 'items', opening: 'openings', label: 'labels', dim: 'dims'}[sel.type]; f[k] = f[k].filter(q => q.id !== sel.id); } sel = null; commit('Supprimé'); },
            dup: () => { const it = F().items.find(q => q.id === sel?.id); if (!it) return; const c = {...JSON.parse(JSON.stringify(it)), id: uid('i'), x: it.x + 30, y: it.y + 30}; F().items.push(c); sel = {type: 'item', id: c.id}; commit('Dupliqué'); },
            rot90: () => { const it = F().items.find(q => q.id === sel?.id); if (!it) return; it.rot = ((it.rot || 0) + 90) % 360; commit('Tourné'); },
            swing: () => { const o = F().openings.find(q => q.id === sel?.id); if (!o) return; o.swing = o.swing === 'right' ? 'left' : 'right'; commit('Sens d’ouverture'); }, flip: () => { const o = F().openings.find(q => q.id === sel?.id); if (!o) return; o.flip = !o.flip; commit('Côté d’ouverture'); },
            split: () => { const f = F(), w = f.walls.find(q => q.id === sel?.id); if (!w) return; const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], w2 = {...JSON.parse(JSON.stringify(w)), id: uid('w'), a: [...m]}; w.b = [...m]; f.walls.push(w2); f.openings.filter(o => o.wall === w.id).forEach(o => { if (o.pos > .5) { o.wall = w2.id; o.pos = (o.pos - .5) * 2; } else o.pos *= 2; }); commit('Mur coupé'); },
            addfloor: () => { const top = Math.max(...H.floors.map(f => f.level)), low = Math.min(...H.floors.map(f => f.level)), up = newFloor(top + 1).name, down = newFloor(low - 1).name;
                ext.openDialog({eyebrow: 'MAISON', title: '＋ Un étage', submitLabel: 'Ajouter',
                    body: `<fieldset class="h-hs-where"><legend>Où ?</legend><label class="checkbox-line"><input type="radio" name="where" value="up" checked> Au-dessus : <b>${esc(up)}</b></label><label class="checkbox-line"><input type="radio" name="where" value="down"> En dessous : <b>${esc(down)}</b> (cave, sous-sol)</label></fieldset>
                        <div class="form-grid"><label>Nom<input name="name" maxlength="60" placeholder="${esc(up)}"></label><label>Hauteur sous plafond (cm)<input name="height" type="number" min="150" max="800" value="${F().height || 270}"></label></div>
                        <label class="checkbox-line"><input type="checkbox" name="copy"> Reprendre les murs de « ${esc(F().name)} » (et ses fenêtres)</label>`,
                    onOpen: dg => dg.addEventListener('change', e => { if (e.target.name === 'where') dg.querySelector('[name=name]').placeholder = e.target.value === 'up' ? up : down; }),
                    onSubmit: form => { const isUp = form.querySelector('[name=where]:checked').value === 'up', src = F(), f = newFloor(isUp ? top + 1 : low - 1), nm = form.querySelector('[name=name]').value.trim(), hgt = Number(form.querySelector('[name=height]').value);
                        if (nm) f.name = nm.slice(0, 60); if (hgt >= 150 && hgt <= 800) f.height = hgt;
                        if (form.querySelector('[name=copy]').checked) { const map = new Map(); f.walls = src.walls.map(w => { const n = {...JSON.parse(JSON.stringify(w)), id: uid('w')}; map.set(w.id, n.id); return n; }); f.openings = src.openings.filter(o => o.type === 'window').map(o => ({...o, id: uid('o'), wall: map.get(o.wall)})); f.wallT = src.wallT; }
                        H.floors.push(f); fi = H.floors.length - 1; sel = null; commit(`${f.name} ajouté`); }}); },
            floors: () => { const rows = () => [...H.floors].map((f, i) => [f, i]).sort((a, b) => b[0].level - a[0].level);
                ext.openDialog({eyebrow: 'MAISON', title: '⋯ Les étages', submitLabel: 'Enregistrer', wide: true,
                    body: `<p class="muted">Du plus haut au plus bas. Renomme, change la hauteur, ou supprime un étage (avec tout ce qu’il contient).</p><table class="h-hs-floortab"><thead><tr><th>Nom</th><th>Hauteur (cm)</th><th>Contenu</th><th></th></tr></thead><tbody>${rows().map(([f, i]) => `<tr data-fl="${i}"><td><input data-fn value="${esc(f.name)}" maxlength="60"></td><td><input data-fh type="number" min="150" max="800" value="${f.height}"></td><td class="muted">${f.walls.length} mur${f.walls.length > 1 ? 's' : ''}, ${f.rooms.length} pièce${f.rooms.length > 1 ? 's' : ''}, ${f.items.length} objet${f.items.length > 1 ? 's' : ''}</td><td><button type="button" class="button small danger" data-fdel>🗑 Supprimer</button></td></tr>`).join('')}</tbody></table>`,
                    onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-fdel]'); if (!b) return; const tr = b.closest('tr'); if (dg.querySelectorAll('tr[data-fl]:not(.is-del)').length < 2) return toast('Il faut au moins un étage.', 'error'); tr.classList.toggle('is-del'); b.textContent = tr.classList.contains('is-del') ? '↺ Garder' : '🗑 Supprimer'; }),
                    onSubmit: async form => { const del = []; form.querySelectorAll('tr[data-fl]').forEach(tr => { const f = H.floors[Number(tr.dataset.fl)]; if (tr.classList.contains('is-del')) { del.push(f); return; } f.name = tr.querySelector('[data-fn]').value.trim().slice(0, 60) || f.name; const h = Number(tr.querySelector('[data-fh]').value); if (h >= 150 && h <= 800) f.height = h; });
                        const cur = F(); H.floors = H.floors.filter(f => !del.includes(f)); fi = Math.max(0, H.floors.indexOf(cur)); if (!H.floors.includes(cur)) fi = Math.max(0, H.floors.findIndex(f => f.level === 0)); sel = null; commit(del.length ? `${del.length} étage${del.length > 1 ? 's' : ''} supprimé${del.length > 1 ? 's' : ''}` : 'Étages');
                        if (del.length) undoable(`${del.map(f => `« ${f.name} »`).join(', ')} supprimé${del.length > 1 ? 's' : ''} avec ce qu’${del.length > 1 ? 'ils contenaient' : 'il contenait'}`); }}); },
            dupfloor: () => { const src = F(), f = newFloor(Math.max(...H.floors.map(q => q.level)) + 1), map = new Map(); f.walls = src.walls.map(w => { const n = {...JSON.parse(JSON.stringify(w)), id: uid('w')}; map.set(w.id, n.id); return n; }); f.openings = src.openings.filter(o => o.type === 'window').map(o => ({...o, id: uid('o'), wall: map.get(o.wall)})); f.wallT = src.wallT; f.height = src.height; H.floors.push(f); fi = H.floors.length - 1; commit(`${f.name} (murs repris)`); },
            delfloor: async () => { if (H.floors.length < 2) return toast('Il faut au moins un étage.', 'error'); const nm = F().name; H.floors.splice(fi, 1); fi = 0; sel = null; commit('Étage supprimé'); undoable(`Étage « ${nm} » supprimé`); },
            import3d: () => import3d(), importimg: () => importImg(), importplan: () => importPlan(), calib: calibrate, refalign: refAlign, importhouse: () => importHouseFile(),
            refmove: () => { if (!H.ref || H.ref.lock) return; H.ref.moving = !H.ref.moving; if (H.ref.moving) setTool('select'); hint(H.ref.moving ? '✥ Glisse le plan ancien (sur un endroit vide du plan) ; reclique « ✥ Déplacer » pour finir.' : HINTS[tool]); render(); },
            refdel: async () => { toggleTrace(false); H.ref = null; commit('Plan ancien retiré'); undoable('Plan ancien retiré du fond (l’image reste dans les médias)'); },
            refhere: () => { if (!H.ref) return; H.ref.floor = F().id; commit('Plan ancien sous cet étage'); }, trace: () => toggleTrace(),
            export: exportDlg, memadd: () => memAdd(),
            font: async () => { const lb = F().labels.find(q => q.id === sel?.id); if (!lb) return; const fnt = await UI()?.openFontPicker?.({value: lb.font || 'Georgia', sample: lb.text || 'Maison de famille'}); if (fnt) { lb.font = String(fnt).slice(0, 80); commit('Police'); } },
            nofont: () => { const lb = F().labels.find(q => q.id === sel?.id); if (!lb) return; delete lb.font; commit('Police de départ'); },
            sunpanel: () => { tab = 'house'; paintSide(); const d = pane.querySelector('[data-ui-section="hs-h-sun"]'); if (d) { d.open = true; d.scrollIntoView({block: 'start'}); } },
            addpeople: async () => { const p = await pickPerson('Un habitant de la maison'); if (!p) return; H.meta.people = [...(H.meta.people || []), {...p, role: ''}]; tab = 'house'; commit('Habitant ajouté'); },
            roompeople: async () => { const rm = F().rooms.find(q => q.id === sel?.id); if (!rm) return; const p = await pickPerson('Une personne liée à cette pièce'); if (!p) return; rm.people = [...(rm.people || []), p]; commit('Personne liée à la pièce'); },
            png: async () => { const s = planSvg(); if (!s) return toast('Le plan est vide.', 'error'); download(await svgToPng(s), fname('png')); }, svg: () => { const s = planSvg(); if (!s) return toast('Le plan est vide.', 'error'); download(new Blob([s], {type: 'image/svg+xml'}), fname('svg')); },
            print: () => { const s = planSvg(); if (!s) return toast('Le plan est vide.', 'error'); const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée.', 'error'); w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(name)}</title><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}svg{max-width:100%;height:auto;max-height:97vh}</style>${s}<script>onload=()=>setTimeout(()=>print(),250)<\/script>`); w.document.close(); },
            vernew: () => { stopPlay(); verDialog(); }, verplay: play, vers: () => { tab = 'house'; paintSide(); pane.querySelector('[data-hs-versec]')?.scrollIntoView({block: 'start'}); },
            verprev: () => { stopPlay(); const l = verList(), i = l.indexOf(verCur()); if (i > 0) switchVer(l[i - 1].id); }, vernext: () => { stopPlay(); const l = verList(), i = l.indexOf(verCur()); if (i >= 0 && i < l.length - 1) switchVer(l[i + 1].id); },
            addcensus: addCensus, nocolor2: () => { const it = F().items.find(q => q.id === sel?.id); if (!it) return; delete it.color2; commit('Sans deuxième couleur'); },
            shot3d: async () => { if (!view3d) { await toggle3d(true); await new Promise(r => setTimeout(r, 400)); } const b = await view3d?.shot(); if (b) download(b, fname('png')); },
        };
        /* ─── événements ─── */
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset; b.closest('details.h-hs-menu')?.removeAttribute('open');
            if (d.hsCmd) return CMD[d.hsCmd]?.();
            if (d.hsTool) { if (view3d) await toggle3d(false); return setTool(d.hsTool); }
            if (d.hsTab) { tab = d.hsTab; if (tab === 'lib' && !mine.length) await loadMine(); return paintSide(); }
            if (d.hsMode) return toggle3d(d.hsMode === '3d');
            if (d.hsFloor !== undefined) { fi = Number(d.hsFloor); sel = null; draft = null; if (view3d) view3d.update(H, fi); render(); return; }
            if (d.hsCat) { libCat = d.hsCat; libQ = ''; if (libCat === 'Mes objets') await loadMine(); return paintSide(); }
            if (d.hsLibcmd && ext.houseLibUI) return ext.houseLibUI.cmd(d.hsLibcmd, d, {mine, loadMine, paint: paintSide, place: async base => { if (view3d) await toggle3d(false); placeItem(base); }});
            if (d.hsLib) { const L = libOf(d.hsLib); if (!L) return; if (view3d) await toggle3d(false); return placeItem(ext.houseLibUI?.itemOf(L) || {kind: L[0], w: L[3], d: L[4], h: L[5], color: L[6]}); }
            if (d.hsMine) { const m = mine.find(q => q.id === Number(d.hsMine)); if (!m) return; if (view3d) await toggle3d(false); return placeItem({kind: 'model', name: m.name, w: Math.round(m.dims?.w || 100), d: Math.round(m.dims?.d || 100), h: Math.round(m.dims?.h || 100), model: {id: m.id, ext: m.ext, ...(m.mtl ? {mtl: m.mtl} : {})}}); }
            if (d.hsPopen) { if (dirty && !await A().confirmBox('La maison non enregistrée sera perdue (💾 d’abord).', {title: 'Ouvrir la fiche ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return; dirty = false; close(); A().openPersonById?.(Number(d.hsPopen)); return; }
            if (d.hsPdel !== undefined) { H.meta.people.splice(Number(d.hsPdel), 1); return commit('Habitant retiré'); }
            if (d.hsCopen !== undefined) { const c = H.meta.census?.[Number(d.hsCopen)]; if (!c?.pid) return toast('Ce recensement n’est relié à aucune fiche.', 'error'); if (dirty && !await A().confirmBox('La maison non enregistrée sera perdue (💾 d’abord).', {title: 'Ouvrir la fiche ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return; dirty = false; close(); A().openPersonById?.(Number(c.pid)); return; }
            if (d.hsCdel !== undefined) { H.meta.census.splice(Number(d.hsCdel), 1); badge(); return commit('Recensement retiré'); }
            if (d.hsVgo) { stopPlay(); switchVer(d.hsVgo); return; }
            if (d.hsVedit) { const v = (H.versions || []).find(q => q.id === d.hsVedit); if (v) verDialog(v); return; }
            if (d.hsVdel) { stopPlay(); delVer(d.hsVdel); return; }
            if (d.hsRpdel !== undefined) { const rm = F().rooms.find(q => q.id === sel?.id); rm?.people?.splice(Number(d.hsRpdel), 1); return commit('Personne retirée'); }
            if (d.hsFaceapply && sel?.type === 'wall') { const w = F().walls.find(q => q.id === sel.id), [sd, scope] = d.hsFaceapply.split(':'); if (w) applyFace(w, sd, scope); return; }
            if (d.hsMemview !== undefined && sel) return openMemView(`${sel.type}:${sel.id}`, Number(d.hsMemview));
            if (d.hsMemdel !== undefined && sel) { const o = (sel.type === 'room' ? F().rooms : F().items).find(q => q.id === sel.id); if (!o?.mem) return; o.mem.splice(Number(d.hsMemdel), 1); if (!o.mem.length) delete o.mem; return commit('Souvenir retiré'); }
            if (d.hsMemgo) { const hd = holderOf(d.hsMemgo); if (!hd) return; if (view3d) await toggle3d(false); fi = hd.fi; sel = {type: hd.type, id: hd.o.id}; tab = 'props'; const [cx, cy] = hd.type === 'room' ? centroid(hd.o.pts) : [hd.o.x, hd.o.y], r = stage.getBoundingClientRect(); panX = r.width / 2 - cx * zoom; panY = r.height / 2 - cy * zoom; render(); return openMemView(d.hsMemgo); }
        });
        dlg.addEventListener('dblclick', e => { const b = e.target.closest('[data-hs-floor]'); if (!b) return; const f = H.floors[Number(b.dataset.hsFloor)]; A().askText({title: 'Renommer l’étage', value: f.name, okLabel: 'Renommer'}).then(n => { if (n?.trim()) { f.name = n.trim().slice(0, 60); commit('Étage renommé'); } }); });
        let tmr = 0;
        // 👻 calque d'un autre étage : la liste (en haut ou dans l'onglet Étage) et sa transparence
        dlg.addEventListener('change', e => { const el = e.target; if (el.matches?.('[data-hs-ver]')) { stopPlay(); const v0 = el.value; if (v0 === '__new' || v0 === '__manage') { paintVers(); CMD[v0 === '__new' ? 'vernew' : 'vers'](); } else switchVer(v0); return; } if (!el.matches?.('[data-hs-ghost]')) return; F().ghost = el.value; delete F().showBelow; later('Calque'); render(); });
        dlg.addEventListener('input', e => { if (e.target.matches?.('[data-hs-name]')) { dirty = true; syncSt(); } }); // renommer = une modification (× demande avant de la perdre)
        dlg.addEventListener('input', e => { const el = e.target; if (!el.matches?.('[data-hs-ghostop]')) return; H.ghostOp = Number(el.value) / 100; dirty = true; render(); });
        // le lieu de la maison : le menu de choix unique (un lieu de la base, ou un texte gardé tel quel) → place_id + place_text
        pane.addEventListener('picker-change', async e => {
            if (!e.target.closest('[data-hs-placepk]')) return;
            const it = e.detail.item; dirty = true; syncSt();
            if (!it) { placeId = 0; placeText = ''; geo = null; view3d?.setGeo?.(null); return; }
            if (it.free) { placeId = 0; placeText = it.title; geo = null; view3d?.setGeo?.(null); return; }
            geo = null; if (Number.isFinite(Number(it.lat)) && Number.isFinite(Number(it.lon)) && it.lat !== '' && it.lat != null) { geo = {lat: Number(it.lat), lon: Number(it.lon)}; view3d?.setGeo?.(geo); }
            const nm = String(it.name || it.title).replace(/\s*\(.*\)$/, '');
            placeId = Number(it.id) || 0; placeText = [nm, it.short].filter(Boolean).join(', ');
            try { const c = await ext.placeCoords?.(it); if (c?.text) placeText = c.text; if (!geo && c && c.lat !== '' && c.lat != null && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon))) { geo = {lat: Number(c.lat), lon: Number(c.lon)}; view3d?.setGeo?.(geo); } } catch (_) {} // « Tulle, Corrèze, France », comme avant
            if (name === 'Maison de famille') { name = `Maison de ${nm}`; $('[data-hs-name]').value = name; }
        });
        pane.addEventListener('input', e => {
            const el = e.target, f = F(), v = el.type === 'checkbox' ? el.checked : el.value;
            if (el.matches('[data-hs-libq]')) { libQ = el.value; clearTimeout(tmr); tmr = setTimeout(() => { const p0 = el.selectionStart; el.blur(); paintSide(); /* le champ quitté le temps de redessiner (sinon le panneau ne bouge pas pendant la frappe) */ const i = pane.querySelector('[data-hs-libq]'); i.focus(); i.setSelectionRange(p0, p0); }, 200); return; }
            if (el.dataset.hsF) { const k = el.dataset.hsF; f[k] = ['level', 'height', 'wallT'].includes(k) ? Number(v) : v; later('Étage'); return; }
            if (el.dataset.hsH) { H[el.dataset.hsH] = Number(v); later('Grille'); return; }
            if (el.dataset.hsRoof) { const k = el.dataset.hsRoof; H.roof = H.roof || {}; H.roof[k] = ['pitch', 'over', 'chimneyPos'].includes(k) ? Number(v) : v; if (k === 'kind') delete H.roof.color; later('Toit'); if (k === 'on' || k === 'kind') setTimeout(paintSide, 0); return; } // la couverture choisie reprend sa couleur
            if (el.dataset.hsRef && H.ref) { const k = el.dataset.hsRef; if (k === 'op') H.ref.op = Number(v) / 100; else if (k === 'rot') { if (H.ref.lock) return; H.ref.rot = clamp(Number(v) || 0, -180, 180); } else if (k === 'lock') { H.ref.lock = !!v; if (v) H.ref.moving = false; setTimeout(paintSide, 0); } else H.ref.show = v; later(k === 'lock' ? (v ? 'Plan ancien verrouillé' : 'Plan ancien déverrouillé') : 'Plan ancien'); return; }
            if (el.dataset.hsSun) { const k = el.dataset.hsSun; H.sun = {...sunOf(), [k]: Number(v)}; const out = pane.querySelector(`[data-hs-sunout="${k}"]`); if (out) out.textContent = k === 'hour' ? ext.house3d?.hourLabel?.(Number(v)) || v : ext.house3d?.dayLabel?.(Number(v)) || v; view3d?.setSun?.(); paintCompass(); quietCommit('Lumière'); return; }
            if (el.dataset.hsWalk) { const n = Number(v); if (!(n >= 80 && n <= 220)) return; H.walk = {...(H.walk || {}), eye: n}; quietCommit('Hauteur des yeux'); return; }
            if (el.dataset.hsM) { if (el.dataset.hsM === 'period') period = v; else H.meta[el.dataset.hsM] = v; dirty = true; syncSt(); return; }
            if (el.dataset.hsProle !== undefined) { H.meta.people[Number(el.dataset.hsProle)].role = v; dirty = true; syncSt(); return; }
            if (el.dataset.hsCver !== undefined) { const c = H.meta.census[Number(el.dataset.hsCver)]; if (v) c.ver = v; else delete c.ver; badge(); later('Recensement rattaché à l’époque'); return; }
            if (el.dataset.hsFace && sel?.type === 'wall') { const w = f.walls.find(q => q.id === sel.id); if (!w) return; const [sd, k] = el.dataset.hsFace.split(':');
                if (k === 'tsc') { const n = Number(v); if (n === 100 || !(n >= 25 && n <= 400)) delete w.tsc; else w.tsc = n; } else setFace(w, sd, k, v); later('Revêtement du mur'); if (k === 'mat') setTimeout(paintSide, 0); return; }
            if (el.dataset.hsRwall && sel?.type === 'room') { const rm = f.rooms.find(q => q.id === sel.id); if (!rm) return; roomWalls(f, rm).forEach(([q, sd]) => setFace(q, sd, el.dataset.hsRwall, v)); later('Murs de la pièce'); if (el.dataset.hsRwall === 'mat') setTimeout(paintSide, 0); return; }
            if (el.dataset.hsP && sel) {
                if (sel.type === 'wall' && ['len', 'ang', 'ax', 'ay', 'bx', 'by'].includes(el.dataset.hsP) && !el._geo) return; // la géométrie d'un mur : appliquée une fois la valeur finie (sinon les coins voisins se décrochent en cours de frappe)
                const k = el.dataset.hsP, o = sel.type === 'wall' ? f.walls.find(q => q.id === sel.id) : sel.type === 'room' ? f.rooms.find(q => q.id === sel.id) : sel.type === 'item' ? f.items.find(q => q.id === sel.id) : sel.type === 'opening' ? f.openings.find(q => q.id === sel.id) : sel.type === 'label' ? f.labels.find(q => q.id === sel.id) : null; if (!o) return;
                if (sel.type === 'wall' && k === 'len') { const L = wallLen(o), n = Number(v); if (n > 5 && L) { const nb = [o.a[0] + (o.b[0] - o.a[0]) / L * n, o.a[1] + (o.b[1] - o.a[1]) / L * n]; f.walls.forEach(q => { if (q !== o) ['a', 'b'].forEach(kk => { if (q[kk][0] === o.b[0] && q[kk][1] === o.b[1]) q[kk] = [...nb]; }); }); o.b = nb; } }
                else if (sel.type === 'wall' && ['ang', 'ax', 'ay', 'bx', 'by'].includes(k)) { const n = Number(v); if (v === '' || !Number.isFinite(n)) return; const oa = [...o.a], ob = [...o.b];
                    if (k === 'ang') { const L = wallLen(o); o.b = [r1(o.a[0] + Math.cos(-n * Math.PI / 180) * L), r1(o.a[1] + Math.sin(-n * Math.PI / 180) * L)]; } else { const e2 = k[0] === 'a' ? 'a' : 'b'; o[e2] = k[1] === 'x' ? [n, o[e2][1]] : [o[e2][0], n]; }
                    f.walls.forEach(q => { if (q !== o) ['a', 'b'].forEach(kk => { if (q[kk][0] === oa[0] && q[kk][1] === oa[1]) q[kk] = [...o.a]; else if (q[kk][0] === ob[0] && q[kk][1] === ob[1]) q[kk] = [...o.b]; }); }); }
                else if (sel.type === 'opening' && (k === 'from' || k === 'to')) { const w = f.walls.find(q => q.id === o.wall), L = w ? wallLen(w) : 0, n = Number(v); if (!L || v === '' || !Number.isFinite(n)) return; const s0 = k === 'from' ? n : L - n - o.w; o.pos = clamp((s0 + o.w / 2) / L, (o.w / 2) / L, 1 - (o.w / 2) / L); }
                else if (k === 'pos') o.pos = Number(v) / 1000;
                else if (k === 'hgt') o.h = Number(v);
                else if (['t', 'w', 'd', 'h', 'rot', 'sill', 'size', 'elev', 'rad', 'doors', 'drawers'].includes(k)) o[k] = v === '' || (['rad', 'doors', 'drawers'].includes(k) && !Number(v)) ? undefined : Number(v);
                else if (k === 'matl') { if (v) { o.matl = v; const mc = OBJ_MATS.find(m => m[0] === v)?.[2]; if (mc) o.color = mc; } else delete o.matl; setTimeout(paintSide, 0); } // la matière propose sa couleur
                else if (k === 'feet' && !v) delete o.feet;
                else if ((k === 'x' || k === 'y') && v !== '' && Number.isFinite(Number(v))) o[k] = Number(v);
                else o[k] = v;
                later('Réglage'); return;
            }
        });
        pane.addEventListener('change', e => { if (tmr) { clearTimeout(tmr); tmr = 0; } const el = e.target; if (sel?.type === 'wall' && ['len', 'ang', 'ax', 'ay', 'bx', 'by'].includes(el.dataset?.hsP)) { el._geo = true; el.dispatchEvent(new Event('input', {bubbles: true})); el._geo = false; } });
        stage.addEventListener('h3-roof', () => { hist = hist.slice(0, hpos + 1); hist.push(snap0()); hpos = hist.length - 1; dirty = true; status(H.roof?.on ? '✓ Toit ajouté' : '✓ Toit retiré'); }); // la case Toit de la vue 3D est gardée avec la maison
        stage.addEventListener('h3-change', e => { quietCommit(e.detail?.what === 'walk' ? 'Hauteur des yeux' : 'Lumière'); paintCompass(); if (tab === 'house') paintSide(); }); // ☀️ la lumière et 🚶 la hauteur des yeux, réglées dans la vue 3D
        stage.addEventListener('h3-floor', e => { const n = Number(e.detail?.fi); if (!H.floors[n]) return; fi = n; sel = null; draft = null; paintFloors(); paintSide(); }); // 🚶 un escalier pris pendant la visite
        let laterT = 0; const later = label => { render(); clearTimeout(laterT); laterT = setTimeout(() => commit(label), 500); };
        const onKey = e => {
            if (!dlg.open || document.querySelector('dialog[open]:not(.h-hs-dlg)')) return;
            const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
            if (mod && k === 's') { e.preventDefault(); save(); return; }
            if (e.target.closest?.('input, textarea, select')) return;
            if (view3d?.walking?.()) { if (k === 'escape') { e.preventDefault(); if (!view3d.justUnlocked()) view3d.stopWalk(); } return; } // 🚶 en visite : les lettres servent à marcher
            if (mod && k === 'z') { e.preventDefault(); restore(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (k === ' ' && !space) { space = true; stage.dataset.tool = 'pan'; e.preventDefault(); return; }
            if (k === 'escape') { e.preventDefault(); if (draft) { draft = null; hover = null; render(); } else if (sel) { sel = null; render(); } else if (tool !== 'select') setTool('select'); else close(); return; } // rien en cours : Échap ferme (avec la question s'il reste des modifications)
            if (k === 'enter' && draft) { finishDraft(); return; }
            if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); CMD.del(); return; }
            if (k === 'r' && sel?.type === 'item') { CMD.rot90(); return; }
            const arr = {arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1]}[k]; if (arr && sel && !view3d && !mod) { e.preventDefault(); const st = e.shiftKey ? (H.grid || 10) : 1; nudge(arr[0] * st, arr[1] * st); return; }
            if (/^[0-9]$/.test(e.key) && !mod && !view3d && !num.hidden && (draft?.pts?.length || tool === 'room')) { e.preventDefault(); num.value = e.key; num.focus(); return; } // taper une longueur
            const t = {v: 'select', h: 'pan', w: 'wall', p: 'zone', d: 'door', f: 'window', m: 'dim', t: 'text', r: 'room'}[k]; if (t && !mod) setTool(t);
        };
        const onKeyUp = e => { if (e.key === ' ') { space = false; stage.dataset.tool = tool; } };
        document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (view3d?.walking?.()) { if (!view3d.justUnlocked()) view3d.stopWalk(); return; } const ae = document.activeElement; if (ae && dlg.contains(ae) && ae.matches('input, textarea, select')) { ae.blur(); stage.focus({preventScroll: true}); return; } if (draft) { draft = null; render(); return; } if (sel) { sel = null; render(); return; } close(); }); // Échap : quitter le champ, le tracé, la sélection, puis fermer
        new ResizeObserver(() => { if (dlg.isConnected && !view3d) render(); }).observe(stage);
        $('.h-hs-snapm').addEventListener('toggle', e => { if (e.target.open) paintSnap(); }); paintSnap(); ext.tbApply?.(dlg, 'house'); ext.editorKeysAttach?.(dlg, 'house'); // boutons rangés à sa façon (⚙️ Personnaliser), raccourcis à soi
        try { UI()?.harmonizeTopbar?.($('.h-hs-top')); } catch (_) {} // E1 : ✓ Enregistré · ⚙️ · ⤓ · 💾 · ⛶ · × toujours dans cet ordre
        // 🧭 la boussole (le nord du plan, réglé dans Maison → ☀️ Orientation et lumière) ; 📁 E4 : déposer ou coller un fichier sur le plan
        stage.insertAdjacentHTML('beforeend', '<button type="button" class="h-hs-compass" data-hs-compass data-hs-cmd="sunpanel" title="Le nord du plan : clic pour le régler (☀️ Orientation et lumière)" aria-label="Nord du plan"><svg viewBox="-20 -20 40 40" aria-hidden="true"><path d="M0 -17L5.5 0L-5.5 0Z" fill="#c0392b"/><path d="M0 17L5.5 0L-5.5 0Z" fill="#9aa3ad"/><circle r="2.2" fill="#fff"/><text x="9" y="-9" font-size="9" font-weight="700" fill="#c0392b" font-family="system-ui,sans-serif">N</text></svg></button>');
        UI()?.bindFileDrop?.(stage, files => onDropFiles(files), {accept: 'image/*,.obj,.stl,.glb,.gltf,.mtl,.json'});
        if (ctx.ver) switchVer(String(ctx.ver), true); // ouverte depuis un recensement : à l'époque qui lui est rattachée
        setTool(H.floors.some(f => f.walls.length) ? 'select' : 'room'); badge(); hist = [snap0()]; hpos = 0; fit(); render(); paintCompass(); syncSt(); stage.focus({preventScroll: true});
        return {get house() { return H; }, get view3d() { return view3d; }, get dirty() { return dirty; }, setTool, commit, render, toggle3d, save, cmd: k => CMD[k]?.(), switchVer, verList, openMemView, select: (type, sid) => { sel = {type, id: sid}; tab = 'props'; render(); }, setTab: t => { tab = t; paintSide(); }};
    }

    /* ═════════ La liste « Maisons de famille » ═════════ */
    const VIEW_KEY = 'genealogie-houses-view';
    /** « Rattachée à » : les personnes et les recensements d'une maison, en petites pastilles (clic : la fiche) */
    const linkChips = (h, max = 8) => { const l = h.links || {}, all = [...(l.people || []).map(p => `<button type="button" class="h-hs-chip" data-hs-gop="${p.id}" title="${esc((p.how || []).join(' · ') || 'Habitant')} — ouvrir la fiche">${(p.how || []).some(x => /^habitant/.test(x)) ? '👤' : '🕯'} ${esc(p.label)}</button>`),
        ...(l.census || []).map(c => `<button type="button" class="h-hs-chip is-census" data-hs-gop="${c.pid || ''}" data-hs-gover="${esc(c.ver || '')}" title="${esc(c.label)}${c.ver ? ` — époque : ${esc(((l.versions || []).find(v => v.id === c.ver) || {}).date || '')} ${esc(((l.versions || []).find(v => v.id === c.ver) || {}).label || '')}` : ''}">📋 ${esc(c.short || c.label)}</button>`)];
        return all.length ? all.slice(0, max).join('') + (all.length > max ? `<span class="muted">+${all.length - max}</span>` : '') : '<span class="muted">—</span>'; };
    const versText = h => { const v = h.links?.versions || []; return v.length ? `🕰 ${v.length} époque${v.length > 1 ? 's' : ''} (${[...new Set(v.map(x => (String(x.date).match(/\d{4}/) || [x.label])[0]).filter(Boolean))].slice(0, 5).join(', ')})` : ''; };
    async function listPage(token) {
        const S = A().state, ws = A().$('#workspace');
        let items = []; try { items = (await api('houses')).items || []; } catch (e) { toast(e.message, 'error'); }
        if (token !== S.workspaceToken || S.module !== 'listes') return;
        // H10 : « N maisons · [Liste | Fiches] · Trier : … », retenus pour cette liste (l'ancien réglage ▦ Cartes / ☰ Tableau sert de départ)
        const UI = window.LCNDA_UI, KEY = 'listes:houses';
        let q = '', old = 'cards'; try { old = localStorage.getItem(VIEW_KEY) === 'table' ? 'list' : 'cards'; } catch (_) {}
        let view = UI?.viewOf ? (UI.viewOf(KEY, old) === 'list' ? 'table' : 'cards') : (old === 'list' ? 'table' : 'cards'), sort = UI?.sortOf ? UI.sortOf(KEY) : 'recent';
        const linkText = h => [...(h.links?.people || []).map(p => p.label), ...(h.links?.census || []).map(c => c.label)].join(' ');
        const draw = () => { let list = items.filter(h => norm(`${h.name} ${h.place} ${h.period} ${linkText(h)}`).includes(norm(q)));
            if (UI?.sortItems) list = UI.sortItems(list, sort, {name: h => h.name, date: h => h.updated_at});
            ws.querySelector('.ui-listbar')?.setCount?.(`${A().plural(list.length, 'maison')}${list.length !== items.length ? ` sur ${items.length}` : ''}`);
            const acts = h => `<button type="button" class="button small" data-hs-open="${h.id}">Ouvrir</button><button type="button" class="button small secondary" data-hs-ren="${h.id}" title="Renommer">✎</button><button type="button" class="button small secondary" data-hs-del="${h.id}" title="Supprimer">🗑</button>`;
            const none = A().empty(items.length ? 'Aucune maison ne correspond.' : 'Aucune maison pour l’instant : « ＋ Nouvelle maison ».');
            ws.querySelector('[data-hs-grid]').innerHTML = !list.length ? none : view === 'table'
                ? `<div class="data-table-wrap"><table class="data-table h-hs-table"><thead><tr><th></th><th>Maison</th><th>Lieu</th><th>Époques</th><th>Rattachée à</th><th></th></tr></thead><tbody>${list.map(h => `<tr><td><button type="button" class="h-hs-tthumb" data-hs-open="${h.id}">${h.thumb ? `<img src="${esc(h.thumb)}" alt="">` : '🏠'}</button></td><td><button type="button" class="table-link" data-hs-open="${h.id}">${esc(h.name)}</button><br><small class="muted">${h.floors} étage${h.floors > 1 ? 's' : ''} · ${h.rooms} pièce${h.rooms > 1 ? 's' : ''}</small></td><td>${esc(h.place || '')}</td><td>${esc([h.period, versText(h)].filter(Boolean).join(' · '))}</td><td><div class="h-hs-links">${linkChips(h, 12)}</div></td><td><div class="h-hs-cact">${acts(h)}</div></td></tr>`).join('')}</tbody></table></div>`
                : `<div class="h-hs-cards">${list.map(h => `<article class="h-hs-card"><button type="button" class="h-hs-cimg" data-hs-open="${h.id}">${h.thumb ? `<img src="${esc(h.thumb)}" alt="">` : '<span>🏠</span>'}</button><div><h3><button type="button" class="table-link" data-hs-open="${h.id}">${esc(h.name)}</button></h3><p class="muted">${esc([h.place, h.period].filter(Boolean).join(' · ') || 'Lieu à préciser')}</p><p class="muted">${h.floors} étage${h.floors > 1 ? 's' : ''} · ${h.rooms} pièce${h.rooms > 1 ? 's' : ''}${h.people ? ` · ${h.people} habitant${h.people > 1 ? 's' : ''}` : ''}${versText(h) ? ` · ${esc(versText(h))}` : ''}</p>
                    <div class="h-hs-linked"><small class="muted">Rattachée à :</small><div class="h-hs-links">${linkChips(h)}</div></div><div class="h-hs-cact">${acts(h)}</div></div></article>`).join('')}</div>`; };
        ws.innerHTML = `<section class="page collection-page" data-dnd-off><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>🏠 Maisons de famille</h2><p>Les plans des maisons de la famille, en 2D et en 3D : leurs pièces, leurs meubles, leurs habitants, leurs recensements, leurs époques et leurs souvenirs.</p></div><button type="button" class="button" data-hs-new>＋ Nouvelle maison</button></header>
            <div data-hs-bar></div><div data-hs-grid></div></section>`;
        // H10 : la barre commune (🔍 Chercher · Liste | Fiches · Trier), retenue pour cette liste
        { const slot = ws.querySelector('[data-hs-bar]');
            const bar = UI.listBar({key: KEY, search: {placeholder: 'Chercher une maison… (nom, lieu, époque, personne, recensement)'}, view: {dflt: old, what: 'maisons', onChange: v => { view = v === 'list' ? 'table' : 'cards'; draw(); }},
                sort: {options: [['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['az', 'A → Z'], ['za', 'Z → A']], value: sort},
                onChange: (b, {what}) => { q = b.q; sort = b.sort; UI.setSort(KEY, sort); if (what !== 'view') draw(); }});
            q = bar.state.q; sort = bar.state.sort; view = bar.state.view === 'list' ? 'table' : 'cards';
            slot.replaceWith(bar); }
        draw();
        const again = () => { if (S.module === 'listes' && S.listType === 'houses') listPage(++S.workspaceToken); };
        ws.onclick = async e => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            try { if (d.hsNew !== undefined) return open({onSaved: again, onClose: again}); if (d.hsOpen) return open({id: Number(d.hsOpen), onSaved: again, onClose: again});
                if (d.hsGop !== undefined) { if (!Number(d.hsGop)) return toast('Ce recensement n’est relié à aucune fiche.', 'error'); return A().openPersonById?.(Number(d.hsGop)); }
                if (d.hsRen) { const h = items.find(x => x.id === Number(d.hsRen)), n = await A().askText({title: 'Renommer la maison', message: 'Nouveau nom :', value: h.name, okLabel: 'Renommer'}); if (!n?.trim()) return; await post('rename_house', {id: h.id, name: n.trim()}); return again(); }
                if (d.hsDel) { const h = items.find(x => x.id === Number(d.hsDel)); if (!await A().confirmBox('', {title: `Supprimer la maison « ${h.name} » ?`, okLabel: 'Supprimer la maison'})) return; await post('delete_house', {id: h.id}); return again(); } } catch (err) { toast(err.message, 'error'); } };
        ws.oninput = null;
    }

    /* ═════════ 🏠 Le bloc « Maisons » de la fiche d'une personne ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.houses = (index, detail) => {
        const list = detail.heritage?.houses || [], pid = Number(detail.person?.id) || 0; if (!list.length || !pid) return '';
        return A().card(index, '🏠 Maisons', list.length, `<div class="h-hs-pblock">${list.map(h => `<article class="h-hs-pcard"><button type="button" class="h-hs-pthumb" data-hsp-open="${h.id}" data-hsp-ver="${esc(h.ver || '')}" title="Ouvrir la maison">${h.thumb ? `<img src="${esc(h.thumb)}" alt="">` : '<span>🏠</span>'}</button><div><b>${esc(h.name)}</b><small class="muted">${esc([h.place, h.period].filter(Boolean).join(' · '))}</small><small>${esc((h.why || []).join(' · '))}</small>${h.ver_label ? `<small>🕰 ${esc(h.ver_label)}</small>` : ''}<button type="button" class="button small" data-hsp-open="${h.id}" data-hsp-ver="${esc(h.ver || '')}">🏠 Ouvrir</button></div></article>`).join('')}</div>`, 'span-12');
    };
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-hsp-open]'); if (!b || b.closest('dialog')) return; e.preventDefault(); open({id: Number(b.dataset.hspOpen), ver: b.dataset.hspVer || '', onClose: () => ext.refreshView?.()}); });
    // le bloc se range avec les autres (Maintenance → Apparence → blocs des fiches) : juste après « Recensements »
    const addBlock = () => { const L = A()?.defaultPersonBlocks; if (!Array.isArray(L) || L.some(b => b[0] === 'houses')) return; const i = L.findIndex(b => b[0] === 'census'); L.splice(i < 0 ? L.length : i + 1, 0, ['houses', '🏠 Maisons de famille']); };
    addBlock(); document.addEventListener('DOMContentLoaded', addBlock, {once: true});

    /* ═════════ 🏠 Dans la fenêtre d'un recensement : la maison où vivait le foyer (et son époque) ═════════ */
    let censusDirty = false;
    async function censusHouseBox(dlg2) {
        const form = dlg2.querySelector('#census-form'); if (!form) return;
        let box = dlg2.querySelector('[data-hs-cbox]');
        if (!box) { box = document.createElement('div'); box.className = 'dialog-labels-block h-hs-cbox'; box.dataset.hsCbox = '1'; (dlg2.querySelector('#census-dialog-household-block') || form.querySelector('.modal-actions'))?.after(box);
            box.addEventListener('click', e => censusBoxClick(e, box)); box.addEventListener('picker-change', e => { if (!e.target.closest('[data-hs-cbh]')) return; const it = e.detail.item; box._hid = it && !(box._linked || []).some(l => l.id === Number(it.id)) ? Number(it.id) : 0; if (it && !box._hid) toast('Cette maison est déjà rattachée.'); censusVerSel(box); }); }
        const cid = Number(form.elements.id?.value) || 0; box.dataset.cid = String(cid);
        if (!cid) { box.innerHTML = '<span class="section-label">🏠 Maison</span><p class="muted">Enregistre d’abord le recensement : tu pourras ensuite lui rattacher la maison où vivait le foyer (et l’époque de la maison).</p>'; return; }
        box.innerHTML = '<span class="section-label">🏠 Maison</span><p class="muted">…</p>';
        let linked = [], all = []; try { [linked, all] = await Promise.all([api('house_links', {census_id: cid}).then(r => r.items || []), api('houses').then(r => r.items || [])]); } catch (e) { box.innerHTML = `<span class="section-label">🏠 Maison</span><p class="muted">${esc(e.message)}</p>`; return; }
        if (Number(box.dataset.cid) !== cid) return; box._all = all; box._linked = linked; box._hid = 0;
        const free = all.filter(h => !linked.some(l => l.id === h.id));
        box.innerHTML = `<span class="section-label">🏠 Maison</span>${linked.map(h => `<div class="h-hs-cbrow">${h.thumb ? `<img src="${esc(h.thumb)}" alt="">` : '<span class="h-hs-cbico">🏠</span>'}<div><b>${esc(h.name)}</b><small class="muted">${esc([h.place, h.ver_label ? `🕰 époque : ${h.ver_label}` : (h.versions ? 'aucune époque choisie' : '')].filter(Boolean).join(' · '))}</small></div><button type="button" class="button small" data-hs-cbopen="${h.id}" data-ver="${esc(h.ver || '')}">🏠 Ouvrir la maison</button><button type="button" class="icon-button" data-hs-cbdel="${h.id}" title="Détacher la maison de ce recensement">×</button></div>`).join('')}
            <div class="h-hs-cbadd">${free.length ? `<div class="h-hs-cbpick" data-hs-cbh>${PK().pickerField({name: 'hs_cb_house', kind: 'house', placeholder: 'Rattacher une maison : nom, lieu…'}).replace(' name="hs_cb_house"', '')}</div><select data-hs-cbv aria-label="Époque de la maison" hidden></select><button type="button" class="button small secondary" data-hs-cbadd>＋ Rattacher</button>` : ''}<button type="button" class="button small secondary" data-hs-cbnew title="Dessiner la maison de ce foyer">＋ Nouvelle maison</button></div>
            <small class="muted">Rattachée tout de suite (sans attendre « Enregistrer »). Dans la maison : onglet Maison → « 📋 Les recensements ».</small>`;
    }
    function censusVerSel(box) { const h = (box._all || []).find(x => x.id === Number(box._hid)), sel2 = box.querySelector('[data-hs-cbv]'), v = h?.links?.versions || []; if (!sel2) return; sel2.hidden = !v.length; sel2.innerHTML = `<option value="">— époque de la maison —</option>${v.map(x => `<option value="${esc(x.id)}">🕰 ${esc([x.date, x.label].filter(Boolean).join(' · '))}</option>`).join('')}`; }
    async function censusBoxClick(e, box) {
        const b = e.target.closest('button'); if (!b) return; const cid = Number(box.dataset.cid), dlg2 = box.closest('dialog');
        const leave = async () => { if (censusDirty && !await A().confirmBox('Le recensement a des changements non enregistrés.', {title: 'Ouvrir la maison quand même ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return false; dlg2.close(); return true; };
        try {
            if (b.dataset.hsCbopen) { if (!await leave()) return; return open({id: Number(b.dataset.hsCbopen), ver: b.dataset.ver || '', onClose: () => ext.refreshView?.()}); }
            if (b.dataset.hsCbdel) { await post('house_link', {house_id: Number(b.dataset.hsCbdel), census_id: cid, on: false}); toast('Maison détachée du recensement.'); return censusHouseBox(dlg2); }
            if (b.hasAttribute('data-hs-cbadd')) { const hid = Number(box._hid) || 0; if (!hid) return toast('Choisis une maison.', 'error'); await post('house_link', {house_id: hid, census_id: cid, ver: box.querySelector('[data-hs-cbv]')?.value || '', on: true}); toast('Maison rattachée au recensement.'); return censusHouseBox(dlg2); }
            if (b.hasAttribute('data-hs-cbnew')) { if (!await leave()) return; const f = dlg2.querySelector('#census-form'), yr = f?.elements.year?.value || '', place = f?.elements.place_name?.value || '';
                const addr = f?.elements.address?.value || '', pl0 = place.split(',')[0].trim(), census = {id: cid, label: `Recensement ${yr}${pl0 ? ` · ${pl0}` : ''}${addr ? ` · ${addr}` : ''}`.slice(0, 200), short: `${yr}${pl0 || addr ? ` · ${pl0 || addr}` : ''}`.slice(0, 120), pid: Number(f?.elements.person_id?.value) || 0};
                return open({onClose: () => ext.refreshView?.(), preset: {name: pl0 ? `Maison de ${pl0}` : 'Maison de famille', placeText: place, period: yr, census}}); }
        } catch (err) { toast(err.message, 'error'); }
    }
    const watchCensus = () => { const dlg2 = document.getElementById('census-dialog'); if (!dlg2 || dlg2._hsWatch) return; dlg2._hsWatch = true;
        new MutationObserver(() => { if (dlg2.open) { censusDirty = false; setTimeout(() => censusHouseBox(dlg2), 0); } }).observe(dlg2, {attributes: true, attributeFilter: ['open']});
        dlg2.addEventListener('input', e => { if (!e.target.closest('[data-hs-cbox]')) censusDirty = true; }); };
    watchCensus(); document.addEventListener('DOMContentLoaded', watchCensus, {once: true});

    ext.lists = ext.lists || {}; ext.lists.houses = listPage;
    ext.openHouse = open;
    ext.houseInternals = {sym2d, area, LIB};
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'house', icon: '🏠', label: 'Maison (plan et 3D)', what: 'maison',
        load: async () => ((await api('houses')).items || []).map(h => ({id: h.id, name: h.name, date: h.updated_at, thumb: h.thumb ? `<img src="${esc(h.thumb)}" alt="">` : '<span class="h-et-ico">🏠</span>', info: [h.place, h.period, `${h.rooms} pièce${h.rooms > 1 ? 's' : ''}`].filter(Boolean).join(' · ')})),
        open: (id, again) => open({id, onSaved: again, onClose: again}), create: again => open({onSaved: again, onClose: again}),
        rename: (id, name) => post('rename_house', {id, name}), remove: id => post('delete_house', {id}), createLabel: '＋ Nouvelle maison'});
})();
