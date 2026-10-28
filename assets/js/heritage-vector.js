/* LCNDA — ✒️ Dessin vectoriel (façon Illustrator) : plan de travail, sélection, sélection directe (points et poignées),
 * plume, crayon, rectangle, ellipse, polygone, étoile, ligne, texte, pipette, main, loupe ; calques, groupes, masques
 * d'écrêtage, alignement, Pathfinder (union, soustraction, intersection, exclusion), dégradés, vectorisation d'une image
 * (noir et blanc ou en couleurs) ; blasons (écus, partitions, pièces, émaux, meubles, blasonnement) ;
 * import SVG / PNG / JPG / WEBP / GIF / BMP, export SVG / PNG / JPG / WEBP / PDF ; enregistrement comme forme
 * (« Mes formes » des tableaux), dans les médias d'une fiche ou comme image d'armoiries.
 * Serveur : lib/vector.php. Listes → Outils de modification → « Dessin vectoriel ».
 * Rien d'un SVG importé n'est recopié tel quel : seules la géométrie et des couleurs vérifiées sont lues.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const K = () => ext.boardKit;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const n2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const num = (v, d = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
    const uid = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const clone = v => JSON.parse(JSON.stringify(v));
    /** une couleur sûre ; 'none' permis */
    const col = (c, fb = '#000000') => { const t = String(c ?? '').trim(); return t === 'none' || /^#[0-9a-f]{3,8}$/i.test(t) || /^[a-z]{3,20}$/i.test(t) || /^(rgb|hsl)a?\([\d\s.,%]+\)$/i.test(t) ? t : fb; };
    const font = f => String(f || '').replace(/[^\w\s,\-'À-ÿ]/g, '').replace(/'/g, '').slice(0, 80) || 'Georgia';
    const imgOk = s => /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(s || '')) || /^media\/[A-Za-z0-9._%\-]{1,240}$/.test(String(s || ''));
    const UI = () => window.LCNDA_UI || A()?.ui || null;
    const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'reglage';
    const downloadBlob = (blob, n) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    /** choisir un fichier de l'ordinateur sans champ visible (un seul) */
    const askFile = accept => new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.addEventListener('change', () => ok(i.files?.[0] || null), {once: true}); i.click(); });

    /* ═════════ 💾 Réglages enregistrés (commun aux outils du dessin) : enregistrer sous un nom, appliquer, ⤓ exporter, ⤒ importer ═════════ */
    /**
     * presetBox({tool, label, get, set}) → un élément « 💾 Réglages enregistrés » ; get() rend les réglages actuels (objet),
     * set(données) les applique. Fichier exporté : lcnda-reglage-<outil>-<nom>.json = {lcnda:'reglage', outil, nom, version:1, donnees}.
     */
    function presetBox({tool, label = 'ces réglages', get, set, toolName = ''}) {
        // « genealogie-… » : la clé suit la base (synchro des réglages, app.js) ; l'ancienne clé « lcnda-reglages-… » est reprise une fois
        const KEY = `genealogie-reglages-${String(tool).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60)}`, OLD = `lcnda-reglages-${tool}`;
        try { const old = localStorage.getItem(OLD); if (old !== null) { if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, old); localStorage.removeItem(OLD); } } catch (_) {}
        const list = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x.name === 'string' && x.data && typeof x.data === 'object') : []; } catch (_) { return []; } };
        const keep = a => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 60))); return true; } catch (_) { toast('Plus de place pour enregistrer ce réglage.', 'error'); return false; } };
        const today = () => new Date().toLocaleDateString('fr-FR');
        const put = (name, data, at = -1) => { const l = list(), i = l.findIndex(x => x.name === name); const item = {name, date: today(), data}; if (i >= 0) l[i] = item; else if (at >= 0) l.splice(at, 0, item); else l.push(item); return keep(l); };
        const box = window.LCNDA_UI.presetsFrame({id: tool, what: label, list,
            apply: async i => { const it = list()[i]; if (it) await set(JSON.parse(JSON.stringify(it.data))); },
            save: name => put(name, get()),
            replace: i => put(list()[i].name, get()),
            rename: (i, name) => { const l = list(); l[i].name = name; return keep(l); },
            duplicate: i => { const l = list(), it = l[i], nm = window.LCNDA_UI.freeName(it.name, l.map(x => x.name)); put(nm, JSON.parse(JSON.stringify(it.data)), i + 1); toast(`Copie « ${nm} » créée.`); },
            exportOne: i => { const it = list()[i], fn = `lcnda-reglage-${tool}-${slug(it.name)}.json`; downloadBlob(new Blob([JSON.stringify({lcnda: 'reglage', outil: tool, nom: it.name, version: 1, donnees: it.data}, null, 2)], {type: 'application/json'}), fn); toast(`⤓ ${fn} enregistré dans Téléchargements.`); return false; },
            remove: i => { const l = list(), it = l[i]; A().undoLocalChange(`Réglage « ${it.name} » supprimé`, [KEY], () => { l.splice(i, 1); keep(l); }, () => { if (box.isConnected) box.refresh(); }); },
            importOne: async () => {
                const f = await askFile('.json,application/json'); if (!f) return false;
                let j = null; try { j = JSON.parse(await f.text()); } catch (_) { j = null; }
                if (!j || j.lcnda !== 'reglage' || !j.donnees || typeof j.donnees !== 'object') { toast('Ce fichier n’est pas un réglage de LCNDA.', 'error'); return false; }
                if (j.outil !== tool) { toast(`Ce fichier est un réglage d’un autre outil (« ${String(j.outil || '?').slice(0, 40)} ») : il ne va pas dans ${toolName || 'cet outil'}.`, 'error'); return false; }
                let name = String(j.nom || 'Réglage importé').trim().slice(0, 60) || 'Réglage importé';
                if (list().some(x => x.name === name)) { const n2b = await A().askText({title: 'Ce nom est déjà pris', message: `Un réglage « ${name} » existe déjà. Quel nom donner à celui-ci ?`, value: window.LCNDA_UI.freeName(name, list().map(x => x.name)), okLabel: 'Importer'}); if (n2b === null || !String(n2b).trim()) return false; name = String(n2b).trim().slice(0, 60); if (list().some(x => x.name === name)) { toast('Ce nom est aussi pris : recommence avec un autre.', 'error'); return false; } }
                put(name, j.donnees); toast(`Réglage « ${name} » importé.`); }});
        box.dataset.vxPresets = tool;
        return box;
    }
    ext.vectorPresets = presetBox;

    /* les styles propres aux nouveautés (injectés une fois ; le reste est dans heritage.css) */
    const VX_CSS = `
.vx-presets{margin:6px 0 10px;align-items:flex-start}.vx-preset-list{list-style:none;margin:0;padding:0;display:grid;gap:4px;width:100%}.vx-preset-list li{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.vx-preset-list li>span{flex:1;min-width:80px;font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis}
.vx-preset-new{display:flex;flex-wrap:wrap;gap:4px;width:100%}.vx-preset-new input{flex:1;min-width:120px;padding:4px 6px}
.vx-export{position:relative}.vx-export>summary{list-style:none;cursor:pointer}.vx-export>summary::-webkit-details-marker{display:none}.vx-export .vx-menu-list{left:auto;right:0}
.vx-last{color:#2a7a2a}.vx-stage.is-drag-over{outline:3px solid #1473e6;outline-offset:-3px;background:#dbe8fa}
.vx-dlg .vx-tabs{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(38px,1fr))!important;container-type:inline-size}.vx-tabs button{min-width:0;padding:6px 2px;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:2px;line-height:1.15}.vx-tabs button[hidden],.vx-tabs button.is-tb-off{display:none!important}.vx-tabs .vx-ti{font-size:15px;line-height:1}.vx-tabs .vx-tl{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;letter-spacing:-.1px}@container (max-width: 440px){.vx-tabs .vx-tl{display:none}.vx-tabs .vx-ti{font-size:19px}.vx-tabs button{padding:8px 2px}}.vx-pane .ui-section{padding:8px 0}.vx-pane .ui-section-body{gap:7px}
.vx-albar{display:flex;flex-wrap:wrap;gap:3px;align-items:center}.vx-albar button{width:30px;height:28px;border:1px solid #c9c9d0;background:#fff;border-radius:4px;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;color:#1d1d1f}.vx-albar button:hover{border-color:#1473e6;background:#eef4ff}.vx-albar svg{width:18px;height:18px}
.vx-alto{display:inline-flex;border:1px solid #c9c9d0;border-radius:4px;overflow:hidden}.vx-albar .vx-alto button{width:auto;height:26px;border:0;border-radius:0;background:#fff;padding:0 8px;font-size:11.5px;cursor:pointer;color:inherit}.vx-albar .vx-alto button+button{border-left:1px solid #c9c9d0}
.vx-top .vx-name{width:180px}.vx-top{flex-wrap:nowrap}.vx-top .vx-menus{flex-wrap:nowrap;min-width:0;overflow:visible}.vx-alto button.is-active{background:#1473e6;color:#fff}
.vx-fontbtn{display:flex;justify-content:space-between;align-items:center;gap:6px;border:1px solid #c9c9d0;background:#fff;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:14px;text-align:left;width:100%;color:#1d1d1f}.vx-fontbtn small{font-family:system-ui,sans-serif;color:#888;font-size:11px}
.vx-stops{display:grid;gap:4px}.vx-stop{display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center}.vx-gbar{height:16px;border:1px solid #bbb;border-radius:3px}
.vx-patprev{width:100%;height:26px;border:1px solid #bbb;border-radius:3px;display:block}
.vx-orn-cats{margin:6px 0}.vx-orn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:4px}.vx-orn-grid button{display:flex;flex-direction:column;align-items:center;gap:2px;border:1px solid #d6d6db;background:#fff;border-radius:5px;padding:4px 2px;cursor:grab;font-size:10px;line-height:1.15;color:inherit;min-height:66px}.vx-orn-grid button:hover{border-color:#1473e6;background:#f3f8ff}.vx-orn-grid svg{width:44px;height:40px;color:#5a4a2a}.vx-orn-grid span{text-align:center;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.vx-orn-top{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.vx-hatchleg{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;font-size:11.5px}.vx-hatchleg span{display:flex;align-items:center;gap:5px}.vx-hatchleg svg{width:22px;height:16px;border:1px solid #999;flex:none}
.vx-pagelist{display:grid;gap:3px;font-size:12px}.vx-pagelist li{display:flex;justify-content:space-between;gap:6px}
:root[data-theme="dark"] .vx-albar button,:root[data-theme="dark"] .vx-alto button,:root[data-theme="dark"] .vx-fontbtn,:root[data-theme="dark"] .vx-orn-grid button{background:#24272c;border-color:#3a3f46;color:#e6e6e6}
:root[data-theme="dark"] .vx-albar .vx-alto button.is-active,.vx-albar .vx-alto button.is-active{background:#1473e6;color:#fff}:root[data-theme="dark"] .vx-orn-grid svg{color:#e3cf9a}:root[data-theme="dark"] .vx-stage.is-drag-over{background:#1d2a3d}
:root[data-theme="dark"] .vx-albar button:hover,:root[data-theme="dark"] .vx-orn-grid button:hover{background:#2c3440;border-color:#1473e6}`;
    const injectCss = () => { if (document.getElementById('vx-extra-css')) return; const s = document.createElement('style'); s.id = 'vx-extra-css'; s.textContent = VX_CSS; document.head.appendChild(s); };

    /* ═════════ Émaux, écus, partitions, pièces : les blasons ═════════ */
    const TINCTURES = [['or', 'Or', '#f4c430'], ['argent', 'Argent', '#ffffff'], ['gueules', 'Gueules', '#d81e1e'], ['azur', 'Azur', '#1f4fa3'], ['sinople', 'Sinople', '#1a8a3a'],
        ['sable', 'Sable', '#151515'], ['pourpre', 'Pourpre', '#7b3f8c'], ['orange', 'Orangé', '#e6862a'], ['sanguine', 'Sanguine', '#8e1b1b'], ['carnation', 'Carnation', '#f2c9a8'], ['naturel', 'Au naturel (brun)', '#8b5a2b']];
    const tinctureName = hex => TINCTURES.find(t => t[2].toLowerCase() === String(hex).toLowerCase())?.[0];
    // écus dans une boîte 100 × 120
    const ESCUTCHEONS = [['francais', 'Écu français moderne', 'M0 0H100V92Q100 106 86 106H62Q53 106 50 120Q47 106 38 106H14Q0 106 0 92Z'],
        ['ancien', 'Écu ancien (triangulaire)', 'M0 0H100V44C100 84 76 106 50 120C24 106 0 84 0 44Z'],
        ['espagnol', 'Écu espagnol (arrondi)', 'M0 0H100V70C100 98 78 120 50 120C22 120 0 98 0 70Z'],
        ['suisse', 'Écu suisse', 'M0 10Q25 -2 50 8Q75 -2 100 10V68C100 96 76 112 50 120C24 112 0 96 0 68Z'],
        ['anglais', 'Écu à pointes (anglais)', 'M0 0Q12 9 25 2Q37 9 50 2Q62 9 75 2Q87 9 100 0V62C100 94 76 112 50 120C24 112 0 94 0 62Z'],
        ['allemand', 'Écu allemand (à encoche)', 'M0 4Q30 0 60 4Q58 16 72 18Q86 18 92 6L100 4V66C100 96 76 112 50 120C24 112 0 96 0 66Z'],
        ['losange', 'Losange (dames)', 'M50 0L100 60L50 120L0 60Z'], ['ovale', 'Ovale (ecclésiastiques)', 'M50 0C78 0 100 27 100 60C100 93 78 120 50 120C22 120 0 93 0 60C0 27 22 0 50 0Z'],
        ['rond', 'Rond (cartouche)', 'M50 10C78 10 100 32 100 60C100 88 78 110 50 110C22 110 0 88 0 60C0 32 22 10 50 10Z'],
        ['banniere', 'Bannière (carrée)', 'M0 0H100V120H0Z']];
    // partitions et pièces : des polygones dans la même boîte (l'écu les découpe)
    const DIVISIONS = [['plein', 'Plein (un seul émail)', [], '%a'], ['parti', 'Parti', [[50, 0, 100, 0, 100, 120, 50, 120]], 'Parti %a et %b'], ['coupe', 'Coupé', [[0, 60, 100, 60, 100, 120, 0, 120]], 'Coupé %a et %b'],
        ['tranche', 'Tranché', [[0, 0, 100, 120, 0, 120]], 'Tranché %a et %b'], ['taille', 'Taillé', [[100, 0, 100, 120, 0, 120]], 'Taillé %a et %b'],
        ['ecartele', 'Écartelé', [[50, 0, 100, 0, 100, 60, 50, 60], [0, 60, 50, 60, 50, 120, 0, 120]], 'Écartelé %a et %b'],
        ['sautoir_e', 'Écartelé en sautoir', [[0, 0, 50, 60, 0, 120], [100, 0, 50, 60, 100, 120]], 'Écartelé en sautoir %a et %b'],
        ['tierce_f', 'Tiercé en fasce', [[0, 40, 100, 40, 100, 80, 0, 80]], 'Tiercé en fasce %a, %b et %a'], ['tierce_p', 'Tiercé en pal', [[33.3, 0, 66.6, 0, 66.6, 120, 33.3, 120]], 'Tiercé en pal %a, %b et %a'],
        ['gironne', 'Gironné', [[50, 60, 50, 0, 100, 0], [50, 60, 100, 60, 100, 120], [50, 60, 50, 120, 0, 120], [50, 60, 0, 60, 0, 0]], 'Gironné %a et %b'],
        ['echiquete', 'Échiqueté', Array.from({length: 30}, (_, i) => { const r = Math.floor(i / 5), c = i % 5; return (r + c) % 2 ? [c * 20, r * 20, c * 20 + 20, r * 20, c * 20 + 20, r * 20 + 20, c * 20, r * 20 + 20] : null; }).filter(Boolean), 'Échiqueté %a et %b'],
        ['fasce_x', 'Fascé (6 pièces)', [1, 3, 5].map(i => [0, i * 20, 100, i * 20, 100, i * 20 + 20, 0, i * 20 + 20]), 'Fascé %a et %b'], ['pale_x', 'Palé (6 pièces)', [1, 3, 5].map(i => [i * 16.67, 0, i * 16.67 + 16.67, 0, i * 16.67 + 16.67, 120, i * 16.67, 120]), 'Palé %a et %b']];
    const ORDINARIES = [['aucune', 'Aucune', [], ''], ['chef', 'Chef', [[0, 0, 100, 0, 100, 34, 0, 34]], 'au chef %c'], ['fasce', 'Fasce', [[0, 42, 100, 42, 100, 78, 0, 78]], 'à la fasce %c'],
        ['pal', 'Pal', [[35, 0, 65, 0, 65, 120, 35, 120]], 'au pal %c'], ['bande', 'Bande', [[-12, 10, 10, -12, 112, 110, 90, 132]], 'à la bande %c'], ['barre', 'Barre', [[112, 10, 90, -12, -12, 110, 10, 132]], 'à la barre %c'],
        ['croix', 'Croix', [[38, 0, 62, 0, 62, 120, 38, 120], [0, 40, 100, 40, 100, 64, 0, 64]], 'à la croix %c'], ['sautoir', 'Sautoir', [[-12, 10, 10, -12, 112, 110, 90, 132], [112, 10, 90, -12, -12, 110, 10, 132]], 'au sautoir %c'],
        ['chevron', 'Chevron', [[0, 88, 50, 36, 100, 88, 100, 114, 50, 62, 0, 114]], 'au chevron %c'], ['canton', 'Canton', [[0, 0, 36, 0, 36, 40, 0, 40]], 'au canton %c'],
        ['champagne', 'Champagne', [[0, 92, 100, 92, 100, 120, 0, 120]], 'à la champagne %c'], ['bordure', 'Bordure', 'border', 'à la bordure %c'], ['franc_quartier', 'Franc-quartier', [[0, 0, 50, 0, 50, 60, 0, 60]], 'au franc-quartier %c']];
    const CHARGE_KEYS = ['mdi_fleur_de_lis', 'mdi_crown', 'mdi_chess_rook', 'mdi_castle', 'mdi_star', 'mdi_moon_waxing_crescent', 'mdi_weather_sunny', 'mdi_sword', 'mdi_sword_cross', 'mdi_key_variant', 'mdi_anchor', 'mdi_bee', 'mdi_tree', 'mdi_barley',
        'mdi_heart', 'mdi_cross', 'mdi_cross_celtic', 'mdi_horse', 'mdi_dog_side', 'mdi_bird', 'mdi_fish', 'mdi_zodiac_leo', 'mdi_leaf', 'mdi_flower', 'mdi_hammer', 'mdi_tower_fire', 'mdi_star_david', 'mdi_shield'];

    /* ═════════ Géométrie ═════════ */
    const KAPPA = 0.5522847498;
    const P = (x, y, i = null, o = null) => ({x, y, i, o});
    /** les points (avec poignées) d'une forme simple, pour la convertir en tracé */
    function boxPts(o) {
        const {x, y, w, h} = o;
        if (o.type === 'ellipse') { const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry, kx = rx * KAPPA, ky = ry * KAPPA;
            return [P(cx, y, [cx - kx, y], [cx + kx, y]), P(x + w, cy, [x + w, cy - ky], [x + w, cy + ky]), P(cx, y + h, [cx + kx, y + h], [cx - kx, y + h]), P(x, cy, [x, cy + ky], [x, cy - ky])]; }
        if (o.type === 'rect') { const r = clamp(num(o.r), 0, Math.min(w, h) / 2);
            if (!r) return [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
            const k = r * (1 - KAPPA);
            return [P(x + r, y, [x + k, y], null), P(x + w - r, y, null, [x + w - k, y]), P(x + w, y + r, [x + w, y + k], null), P(x + w, y + h - r, null, [x + w, y + h - k]),
                P(x + w - r, y + h, [x + w - k, y + h], null), P(x + r, y + h, null, [x + k, y + h]), P(x, y + h - r, [x, y + h - k], null), P(x, y + r, null, [x, y + k])]; }
        if (o.type === 'polygon' || o.type === 'star') {
            const n = clamp(Math.round(num(o.n, o.type === 'star' ? 5 : 6)), 3, 60), cx = x + w / 2, cy = y + h / 2, out = [];
            const steps = o.type === 'star' ? n * 2 : n, inner = clamp(num(o.inner, 45), 5, 100) / 100;
            for (let k = 0; k < steps; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / steps, f = o.type === 'star' && k % 2 ? inner : 1; out.push(P(cx + Math.cos(a) * w / 2 * f, cy + Math.sin(a) * h / 2 * f)); }
            return out;
        }
        return [];
    }
    const ptsD = (pts, closed) => {
        if (!pts.length) return '';
        let d = `M${n2(pts[0].x)} ${n2(pts[0].y)}`;
        const seg = (a, b) => (a.o || b.i) ? `C${n2((a.o || [a.x, a.y])[0])} ${n2((a.o || [a.x, a.y])[1])} ${n2((b.i || [b.x, b.y])[0])} ${n2((b.i || [b.x, b.y])[1])} ${n2(b.x)} ${n2(b.y)}` : `L${n2(b.x)} ${n2(b.y)}`;
        for (let k = 1; k < pts.length; k++) d += seg(pts[k - 1], pts[k]);
        if (closed && pts.length > 1) d += seg(pts[pts.length - 1], pts[0]) + 'Z';
        return d;
    };
    /** le même tracé parcouru dans l'autre sens (les poignées s'échangent) */
    const revPts = pts => pts.slice().reverse().map(p => P(p.x, p.y, p.o ? [...p.o] : null, p.i ? [...p.i] : null));
    /** un cercle (ou une ellipse) qui part de la gauche et tourne dans le sens des aiguilles : le haut est au quart du chemin */
    function ringPts(cx, cy, rx, ry = rx) { const kx = rx * KAPPA, ky = ry * KAPPA;
        return [P(cx - rx, cy, [cx - rx, cy + ky], [cx - rx, cy - ky]), P(cx, cy - ry, [cx - kx, cy - ry], [cx + kx, cy - ry]), P(cx + rx, cy, [cx + rx, cy - ky], [cx + rx, cy + ky]), P(cx, cy + ry, [cx + kx, cy + ry], [cx - kx, cy + ry])]; }
    /** le tracé que suit un texte sur une courbe (retourné quand le texte est « dessous ») */
    // un tracé fermé retourné garde son point de départ (le cercle part toujours de la gauche : le bas est alors au quart)
    const guideD = o => { const pts = o.pts || []; if (o.side !== 'bottom') return ptsD(pts, !!o.closed); const r = revPts(pts); return ptsD(o.closed && r.length > 1 ? [r[r.length - 1], ...r.slice(0, -1)] : r, !!o.closed); };
    /** la longueur d'un tracé à points (les courbes sont échantillonnées) */
    function pathLen(o) {
        const pts = o.pts || [], segs = []; let L = 0; for (let k = 1; k < pts.length; k++) segs.push([pts[k - 1], pts[k]]); if (o.closed && pts.length > 1) segs.push([pts[pts.length - 1], pts[0]]);
        segs.forEach(([a, b]) => { const c1 = a.o || [a.x, a.y], c2 = b.i || [b.x, b.y]; let px = a.x, py = a.y; for (let t = 1; t <= 24; t++) { const u = t / 24, v = 1 - u, x = v * v * v * a.x + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b.x, y = v * v * v * a.y + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b.y; L += Math.hypot(x - px, y - py); px = x; py = y; } });
        return L;
    }
    /** le tracé (attribut d) d'un objet, dans les coordonnées du dessin (sans la rotation) */
    function shapeD(o) {
        if (o.type === 'path') return ptsD(o.pts || [], !!o.closed);
        if (o.type === 'svgpath') return String(o.d || '');
        if (['rect', 'ellipse', 'polygon', 'star'].includes(o.type)) return ptsD(boxPts(o), true);
        return '';
    }
    const segsBox = segs => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [, ...a] of segs) for (let k = 0; k < a.length; k += 2) { x0 = Math.min(x0, a[k]); x1 = Math.max(x1, a[k]); y0 = Math.min(y0, a[k + 1]); y1 = Math.max(y1, a[k + 1]); } return isFinite(x0) ? {x: x0, y: y0, w: x1 - x0, h: y1 - y0} : null; };
    const measure = (() => { let c = null; return (text, o) => { c = c || document.createElement('canvas').getContext('2d'); c.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${num(o.size, 24)}px ${font(o.font)}`; return Math.max(...String(text || ' ').split('\n').map(l => c.measureText(l || ' ').width)); }; })();
    /** la boîte d'un objet (sans sa rotation) */
    function box(o) {
        if (['rect', 'ellipse', 'polygon', 'star', 'image', 'msym', 'mdeco'].includes(o.type)) return {x: o.x, y: o.y, w: o.w, h: o.h};
        if (o.type === 'text') { const lines = String(o.text || '').split('\n').length, w = measure(o.text, o), h = num(o.size, 24) * 1.2 * lines, ax = o.align === 'middle' ? w / 2 : o.align === 'end' ? w : 0; return {x: o.x - ax, y: o.y - num(o.size, 24), w, h}; }
        if (o.type === 'textpath') { const b = box({type: 'path', pts: o.pts}), m = num(o.size, 24) * 1.1 + Math.abs(num(o.offset)); return {x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m}; }
        if (o.type === 'path') { const xs = [], ys = []; (o.pts || []).forEach(p => { xs.push(p.x); ys.push(p.y); if (p.i) { xs.push(p.i[0]); ys.push(p.i[1]); } if (p.o) { xs.push(p.o[0]); ys.push(p.o[1]); } }); return xs.length ? {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)} : {x: 0, y: 0, w: 0, h: 0}; }
        if (o.type === 'svgpath') return (K() && segsBox(K().absPath(o.d))) || {x: 0, y: 0, w: 0, h: 0};
        if (o.type === 'group') { const bs = (o.clip ? [o.clip] : o.children || []).map(rbox).filter(b => b.w || b.h); if (!bs.length) return {x: 0, y: 0, w: 0, h: 0}; const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)); return {x: x0, y: y0, w: Math.max(...bs.map(b => b.x + b.w)) - x0, h: Math.max(...bs.map(b => b.y + b.h)) - y0}; }
        return {x: 0, y: 0, w: 0, h: 0};
    }
    /** la boîte d'un objet tourné (alignée sur les axes) */
    function rbox(o) {
        const b = box(o), r = num(o.rot) * Math.PI / 180; if (!r) return b;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2, c = Math.cos(r), s = Math.sin(r);
        const xs = [], ys = []; [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].forEach(([x, y]) => { xs.push(cx + (x - cx) * c - (y - cy) * s); ys.push(cy + (x - cx) * s + (y - cy) * c); });
        return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
    }
    const unionBox = list => { const bs = list.map(rbox); if (!bs.length) return null; const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)); return {x: x0, y: y0, w: Math.max(...bs.map(b => b.x + b.w)) - x0, h: Math.max(...bs.map(b => b.y + b.h)) - y0}; };
    /** applique f(x, y) → [x, y] à toute la géométrie d'un objet (déplacer, étirer, retourner) */
    function mapObj(o, f, fs = 1) {
        if (['rect', 'ellipse', 'polygon', 'star', 'image', 'msym', 'mdeco'].includes(o.type)) { const [x1, y1] = f(o.x, o.y), [x2, y2] = f(o.x + o.w, o.y + o.h); o.x = Math.min(x1, x2); o.y = Math.min(y1, y2); o.w = Math.abs(x2 - x1); o.h = Math.abs(y2 - y1); if (o.type === 'rect' && o.r) o.r = num(o.r) * fs; }
        else if (o.type === 'text') { const [x, y] = f(o.x, o.y); o.x = x; o.y = y; o.size = clamp(num(o.size, 24) * fs, 2, 2000); }
        else if (o.type === 'path' || o.type === 'textpath') { if (o.type === 'textpath') { o.size = clamp(num(o.size, 24) * fs, 2, 2000); if (num(o.offset)) o.offset = num(o.offset) * fs; } o.pts = (o.pts || []).map(p => { const [x, y] = f(p.x, p.y); return P(x, y, p.i ? f(p.i[0], p.i[1]) : null, p.o ? f(p.o[0], p.o[1]) : null); }); }
        else if (o.type === 'svgpath' && K()) o.d = K().pathStr(K().absPath(o.d).map(([c, ...a]) => { const out = [c]; for (let k = 0; k < a.length; k += 2) out.push(...f(a[k], a[k + 1])); return out; }));
        else if (o.type === 'group') { (o.children || []).forEach(c => mapObj(c, f, fs)); if (o.clip) mapObj(o.clip, f, fs); }
        if (num(o.sw) && fs !== 1 && o.scaleStroke !== false) o.sw = clamp(num(o.sw) * fs, 0, 500);
        return o;
    }
    const moveObj = (o, dx, dy) => mapObj(o, (x, y) => [x + dx, y + dy]);
    /** une forme simple → tracé modifiable point par point */
    function toPath(o) {
        if (['rect', 'ellipse', 'polygon', 'star'].includes(o.type)) { const n = {...o, type: 'path', pts: boxPts(o), closed: true}; ['x', 'y', 'w', 'h', 'r', 'n', 'inner'].forEach(k => delete n[k]); return n; }
        return o;
    }
    /** un tracé quelconque (attribut d) → points modifiables, s'il n'a qu'un seul sous-tracé */
    function dToPts(d) {
        if (!K()) return null; const segs = K().absPath(d), subs = segs.filter(s => s[0] === 'M').length; if (subs !== 1) return null;
        const pts = []; let closed = false;
        for (const [c, ...a] of segs) {
            if (c === 'M') pts.push(P(a[0], a[1]));
            else if (c === 'L') pts.push(P(a[0], a[1]));
            else if (c === 'C') { pts[pts.length - 1].o = [a[0], a[1]]; pts.push(P(a[4], a[5], [a[2], a[3]], null)); }
            else if (c === 'Z') closed = true;
        }
        if (closed && pts.length > 1) { const f = pts[0], l = pts[pts.length - 1]; if (Math.hypot(f.x - l.x, f.y - l.y) < 0.01) { f.i = l.i; pts.pop(); } }
        return {pts, closed};
    }

    /* ═════════ Dessin (SVG) ═════════ */
    /** les arrêts d'un dégradé : plusieurs couleurs (anciens dessins : c1 → c2) */
    const gradStops = g => { const s = Array.isArray(g?.stops) && g.stops.length >= 2 ? g.stops : [{o: 0, c: g?.c1 || '#ffffff'}, {o: 1, c: g?.c2 || '#000000'}];
        return s.slice(0, 16).map(x => ({o: clamp(num(x.o), 0, 1), c: col(x.c, '#000000'), a: clamp(num(x.a, 1), 0, 1)})).sort((a, b) => a.o - b.o); };
    const gradDef = (o, id) => { const g = o.grad; if (!g) return ''; const a = num(g.angle) * Math.PI / 180, x1 = 50 - Math.cos(a) * 50, y1 = 50 - Math.sin(a) * 50;
        const stops = gradStops(g).map(s => `<stop offset="${n2(s.o)}" stop-color="${s.c}"${s.a < 1 ? ` stop-opacity="${n2(s.a)}"` : ''}/>`).join('');
        return g.type === 'radial' ? `<radialGradient id="${id}" cx="${n2(clamp(num(g.cx, 50), 0, 100))}%" cy="${n2(clamp(num(g.cy, 50), 0, 100))}%" r="${n2(clamp(num(g.r, 50), 1, 150))}%">${stops}</radialGradient>`
            : `<linearGradient id="${id}" x1="${n2(x1)}%" y1="${n2(y1)}%" x2="${n2(100 - x1 + 0)}%" y2="${n2(100 - y1)}%">${stops}</linearGradient>`; };
    /* motifs : hachures, points, quadrillage… et les hachures héraldiques (système de Pietra Santa) */
    const PATTERNS = [['lines', 'Hachures'], ['dots', 'Points'], ['grid', 'Quadrillage'], ['cross', 'Croisillons en biais'], ['checker', 'Damier']];
    const HATCH = {or: ['h_or', 'Or : points'], argent: ['h_argent', 'Argent : uni (blanc)'], gueules: ['h_gueules', 'Gueules : traits verticaux'], azur: ['h_azur', 'Azur : traits horizontaux'],
        sinople: ['h_sinople', 'Sinople : diagonales de dextre (\\)'], sable: ['h_sable', 'Sable : croisillons'], pourpre: ['h_pourpre', 'Pourpre : diagonales de senestre (/)']};
    /** le contenu d'un motif dans un carré s × s */
    function patBody(k, s, w, c) {
        const L = d => `<path d="${d}" stroke="${c}" stroke-width="${n2(w)}" fill="none" stroke-linecap="square"/>`;
        if (k === 'dots' || k === 'h_or') return `<circle cx="${n2(s / 2)}" cy="${n2(s / 2)}" r="${n2(Math.max(.4, w * (k === 'h_or' ? .75 : 1)))}" fill="${c}"/>`;
        if (k === 'grid' || k === 'h_sable') return L(`M0 ${n2(s / 2)}H${n2(s)}M${n2(s / 2)} 0V${n2(s)}`);
        if (k === 'cross') return L(`M0 0L${n2(s)} ${n2(s)}M${n2(s)} 0L0 ${n2(s)}`);
        if (k === 'checker') return `<rect width="${n2(s / 2)}" height="${n2(s / 2)}" fill="${c}"/><rect x="${n2(s / 2)}" y="${n2(s / 2)}" width="${n2(s / 2)}" height="${n2(s / 2)}" fill="${c}"/>`;
        if (k === 'h_gueules') return L(`M${n2(s / 2)} 0V${n2(s)}`);
        if (k === 'h_azur') return L(`M0 ${n2(s / 2)}H${n2(s)}`);
        if (k === 'h_sinople') return L(`M0 0L${n2(s)} ${n2(s)}M${n2(-s / 2)} ${n2(s / 2)}L${n2(s / 2)} ${n2(s * 1.5)}M${n2(s / 2)} ${n2(-s / 2)}L${n2(s * 1.5)} ${n2(s / 2)}`);
        if (k === 'h_pourpre') return L(`M${n2(s)} 0L0 ${n2(s)}M${n2(s * 1.5)} ${n2(s / 2)}L${n2(s / 2)} ${n2(s * 1.5)}M${n2(s / 2)} ${n2(-s / 2)}L${n2(-s / 2)} ${n2(s / 2)}`);
        if (k === 'h_argent') return '';
        return L(`M${n2(s / 2)} 0V${n2(s)}`); // lines : traits, tournés par l'angle
    }
    const patDef = (o, id) => { const p = o.pat; if (!p) return ''; const k = /^(lines|dots|grid|cross|checker|h_(or|argent|gueules|azur|sinople|sable|pourpre))$/.test(p.kind || '') ? p.kind : 'lines', s = clamp(num(p.size, 10), 2, 400), w = clamp(num(p.width, s / 8), .2, s), a = k === 'lines' ? num(p.angle, 45) : 0;
        return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n2(s)}" height="${n2(s)}"${a ? ` patternTransform="rotate(${n2(a)})"` : ''}><rect width="${n2(s)}" height="${n2(s)}" fill="${col(p.bg, '#ffffff')}"/>${patBody(k, s, w, col(p.color, '#000000'))}</pattern>`; };
    const DASH = {'': '', dash: '8 6', dot: '1 5', long: '16 8', dashdot: '10 5 2 5'};
    function styleAttrs(o, defs, pre) {
        let fill = col(o.fill, 'none');
        if (o.pat && o.fill !== 'none') { const id = `${pre}p${String(o.id).replace(/\W/g, '')}`; defs.push(patDef(o, id)); fill = `url(#${id})`; }
        else if (o.grad && o.fill !== 'none') { const id = `${pre}g${String(o.id).replace(/\W/g, '')}`; defs.push(gradDef(o, id)); fill = `url(#${id})`; }
        const sw = clamp(num(o.sw), 0, 500);
        return `fill="${fill}"${o.evenodd ? ' fill-rule="evenodd"' : ''} stroke="${sw ? col(o.stroke, 'none') : 'none'}" stroke-width="${n2(sw)}"${DASH[o.dash] ? ` stroke-dasharray="${DASH[o.dash]}"` : ''} stroke-linecap="${['butt', 'round', 'square'].includes(o.cap) ? o.cap : 'round'}" stroke-linejoin="${['miter', 'round', 'bevel'].includes(o.join) ? o.join : 'round'}"${num(o.op, 1) < 1 ? ` opacity="${n2(clamp(num(o.op, 1), 0, 1))}"` : ''}`;
    }
    const rotAttr = o => { if (!num(o.rot)) return ''; const b = box(o); return ` transform="rotate(${n2(o.rot)} ${n2(b.x + b.w / 2)} ${n2(b.y + b.h / 2)})"`; };
    /* 🗺️ mode Plan (heritage-vector-map.js) : les objets de carte se dessinent là-bas ; contexte = le document en cours */
    const VM = () => ext.vectorMap;
    const mapCtx = (doc, editor) => { const v = VM(); if (!v) return null; const old = {doc: v.ctx.doc, editor: v.ctx.editor}; v.ctx.doc = doc; v.ctx.editor = editor; return old; };
    let MAPPASS = 'all';
    /** une liste d'objets : les traits de plan qui se suivent sont dessinés en deux temps (toutes les bordures, puis tous les dessus) pour que les routes se raccordent */
    function listSvg(arr, one) {
        let out = '', run = [];
        const flush = () => { if (run.length > 1) { MAPPASS = 'casing'; out += run.map(one).join(''); MAPPASS = 'fill'; out += run.map(one).join(''); MAPPASS = 'all'; } else if (run.length) out += one(run[0]); run = []; };
        for (const o of arr || []) { if (!o.hidden && VM()?.isLine(o)) run.push(o); else { flush(); out += one(o); } }
        flush(); return out;
    }
    function objSvg(o, defs, pre = '', ui = false) {
        if (o.hidden && !ui) return '';
        if (o.hidden) return '';
        const vm = VM();
        if (vm && !o._ghost && !vm.inTime(o)) return vm.ctx.editor ? `<g class="vx-ghost" opacity=".13">${objSvg({...o, _ghost: 1}, defs, pre, ui)}</g>` : ''; // hors de l'année choisie
        const id = ui === 'out' ? ` data-vx-out="${esc(o.id)}"` : ui ? ` data-vx="${esc(o.id)}"` : '';
        if (o.map && vm) { const r = vm.svg(o, defs, pre, id, MAPPASS); if (r !== null) return r; }
        if (o.type === 'msym' || o.type === 'mdeco') return '';
        if (o.type === 'group') {
            let clip = '';
            if (o.clip) { const cid = `${pre}c${String(o.id).replace(/\W/g, '')}`; defs.push(`<clipPath id="${cid}"><path d="${esc(shapeD(o.clip))}"${rotAttr(o.clip)}/></clipPath>`); clip = ` clip-path="url(#${cid})"`; }
            return `<g${id}${rotAttr(o)}${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}><g${clip}>${listSvg(o.children, c => objSvg(c, defs, pre, false))}</g></g>`;
        }
        if (o.type === 'text') {
            const lines = String(o.text || '').split('\n'), size = clamp(num(o.size, 24), 2, 2000);
            return `<text${id} x="${n2(o.x)}" y="${n2(o.y)}" font-family="${esc(font(o.font))}" font-size="${n2(size)}"${o.bold ? ' font-weight="700"' : ''}${o.italic ? ' font-style="italic"' : ''} text-anchor="${['start', 'middle', 'end'].includes(o.align) ? o.align : 'start'}"${num(o.ls) ? ` letter-spacing="${n2(o.ls)}"` : ''} ${o.halo ? `${styleAttrs({...o, fill: o.fill ?? '#000', stroke: o.halo, sw: size / 4}, defs, pre)} paint-order="stroke"` : styleAttrs({...o, fill: o.fill ?? '#000'}, defs, pre)}${rotAttr(o)}>${lines.map((l, k) => `<tspan x="${n2(o.x)}" dy="${k ? n2(size * 1.2) : 0}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
        }
        if (o.type === 'textpath') { // ➰ un texte qui suit une courbe
            const size = clamp(num(o.size, 24), 2, 2000), gid = `${pre}t${String(o.id).replace(/\W/g, '')}`, al = ['start', 'middle', 'end'].includes(o.align) ? o.align : 'middle';
            defs.push(`<path id="${gid}" d="${esc(guideD(o))}"/>`);
            const guide = o.showGuide && num(o.gsw, 1) ? `<path d="${esc(guideD(o))}" fill="none" stroke="${col(o.gstroke, '#888888')}" stroke-width="${n2(clamp(num(o.gsw, 1), 0, 200))}"/>` : '';
            const fit = o.fit ? ` textLength="${n2(Math.max(1, pathLen(o) * clamp(num(o.fitPct, 100), 5, 100) / 100))}" lengthAdjust="spacing"` : '';
            return `<g${id}${rotAttr(o)}>${guide}<text font-family="${esc(font(o.font))}" font-size="${n2(size)}"${o.bold ? ' font-weight="700"' : ''}${o.italic ? ' font-style="italic"' : ''} text-anchor="${al}"${num(o.ls) ? ` letter-spacing="${n2(o.ls)}"` : ''} ${o.halo ? `${styleAttrs({...o, fill: o.fill ?? '#000', stroke: o.halo, sw: size / 4}, defs, pre)} paint-order="stroke"` : styleAttrs({...o, fill: o.fill ?? '#000'}, defs, pre)}><textPath href="#${gid}" startOffset="${n2(clamp(num(o.start, 50), -100, 200))}%"${fit}><tspan dy="${n2(-num(o.offset))}">${esc(String(o.text || '').replace(/\n/g, ' ')) || ' '}</tspan></textPath></text></g>`;
        }
        if (o.type === 'image') return imgOk(o.src) ? `<image${id} href="${esc(o.src)}" x="${n2(o.x)}" y="${n2(o.y)}" width="${n2(o.w)}" height="${n2(o.h)}" preserveAspectRatio="none"${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}${rotAttr(o)}/>` : '';
        if (o.wp) { const v = ext.vectorPlus?.vary(o); if (v) return objSvg(v, defs, pre, ui); } // 〰 largeur variable (heritage-vector-plus.js)
        return `<path${id} d="${esc(shapeD(o))}" ${styleAttrs(o, defs, pre)}${rotAttr(o)}/>`;
    }
    /** le dessin complet, prêt à exporter */
    function docSvg(doc, {only = null, pad = 0, page = null, bleed = 0} = {}) {
        const defs = [], objs = only || doc.objs, old = mapCtx(doc, false);
        const body = listSvg(objs, o => objSvg(o, defs, 'x'));
        if (old) Object.assign(VM().ctx, old);
        const ref = !only && doc.ref?.print && doc.ref.show !== false && imgOk(doc.ref.src) ? `<image href="${esc(doc.ref.src)}" x="${n2(doc.ref.x)}" y="${n2(doc.ref.y)}" width="${n2(doc.ref.w)}" height="${n2(doc.ref.h)}" preserveAspectRatio="none" opacity="${n2(clamp(num(doc.ref.op, .5), .05, 1))}"${doc.ref.gray ? ' style="filter:grayscale(1)"' : ''}/>` : '';
        let vb = `0 0 ${n2(doc.w)} ${n2(doc.h)}`, W = doc.w, H = doc.h;
        if (only) { const b = unionBox(only) || {x: 0, y: 0, w: 1, h: 1}; vb = `${n2(b.x - pad)} ${n2(b.y - pad)} ${n2(b.w + 2 * pad)} ${n2(b.h + 2 * pad)}`; W = b.w + 2 * pad; H = b.h + 2 * pad; }
        else if (page || bleed) { const pg = page || {x: 0, y: 0, w: doc.w, h: doc.h}; vb = `${n2(pg.x - bleed)} ${n2(pg.y - bleed)} ${n2(pg.w + 2 * bleed)} ${n2(pg.h + 2 * bleed)}`; W = pg.w + 2 * bleed; H = pg.h + 2 * bleed; }
        const bg = !only && doc.bg && doc.bg !== 'transparent' ? `<rect x="${n2(-bleed)}" y="${n2(-bleed)}" width="${n2(doc.w + 2 * bleed)}" height="${n2(doc.h + 2 * bleed)}" fill="${col(doc.bg, '#fff')}"/>` : '';
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${n2(W)}" height="${n2(H)}">${only ? '' : infoSvg(doc.info)}<defs>${defs.join('')}</defs>${bg}${ref}${body}</svg>`;
    }
    /** ℹ️ les informations du document dans le SVG : <title>, <desc> et <metadata> (Dublin Core, comme Illustrator / Inkscape) */
    function infoSvg(info) {
        const i = cleanInfo(info); if (!Object.keys(i).length) return '';
        const dc = [['title', i.title], ['creator', i.author], ['subject', i.subject], ['description', i.desc], ['rights', i.rights], ['language', i.lang], ['date', i.date]].filter(([, v]) => v).map(([k, v]) => `<dc:${k}>${esc(v)}</dc:${k}>`).join('')
            + (i.keywords ? `<dc:subject><rdf:Bag>${i.keywords.split(/[,;]/).map(k => k.trim()).filter(Boolean).map(k => `<rdf:li>${esc(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>` : '');
        return `${i.title ? `<title>${esc(i.title)}</title>` : ''}${i.desc || i.subject ? `<desc>${esc(i.desc || i.subject)}</desc>` : ''}<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><rdf:Description rdf:about="">${dc}</rdf:Description></rdf:RDF></metadata>`;
    }

    /* ═════════ Image → tracés (Pathfinder, vectorisation) ═════════ */
    /** contours d'un masque (1 = dedans) : boucles d'arêtes entre pixels, puis simplifiées */
    function traceMask(mask, W, H, {eps = 1, smooth = true} = {}) {
        const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
        const next = new Map(), key = (x, y) => y * (W + 1) + x;
        const add = (x1, y1, x2, y2) => { const k = key(x1, y1); const l = next.get(k); if (l) l.push(key(x2, y2)); else next.set(k, [key(x2, y2)]); };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!mask[y * W + x]) continue;
            if (!at(x, y - 1)) add(x, y, x + 1, y); if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
            if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); if (!at(x - 1, y)) add(x, y + 1, x, y);
        }
        const loops = [];
        for (const start of [...next.keys()]) {
            while (next.get(start)?.length) { // un même coin peut ouvrir plusieurs boucles (pixels en diagonale)
                const loop = []; let k = start, guard = 0;
                while (guard++ < 4e6) { const l = next.get(k); if (!l?.length) break; const nk = l.pop(); if (!l.length) next.delete(k); loop.push([k % (W + 1), Math.floor(k / (W + 1))]); k = nk; if (k === start) break; }
                if (loop.length >= 4) loops.push(loop);
            }
        }
        const rdp = (pts, e) => { if (pts.length < 3) return pts; let dmax = 0, idx = 0; const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1], L = Math.hypot(bx - ax, by - ay) || 1;
            for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / L; if (d > dmax) { dmax = d; idx = i; } }
            return dmax > e ? [...rdp(pts.slice(0, idx + 1), e).slice(0, -1), ...rdp(pts.slice(idx), e)] : [pts[0], pts[pts.length - 1]]; };
        return loops.map(loop => {
            // les milieux des marches d'escalier, puis simplifiés (boucle coupée en deux pour garder sa forme)
            const mid = loop.map((p, i) => { const q = loop[(i + 1) % loop.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
            const h = Math.floor(mid.length / 2); let pts = [...rdp(mid.slice(0, h + 1), eps).slice(0, -1), ...rdp([...mid.slice(h), mid[0]], eps).slice(0, -1)];
            if (pts.length < 3) return null;
            if (!smooth) return {pts: pts.map(([x, y]) => P(x, y)), closed: true};
            // lissage : poignées de Catmull-Rom, sauf aux angles marqués
            const n = pts.length;
            return {closed: true, pts: pts.map((p, i) => { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
                const v1 = [p[0] - a[0], p[1] - a[1]], v2 = [b[0] - p[0], b[1] - p[1]], cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1);
                if (cos < 0.72) return P(p[0], p[1]);
                // poignées dans l'axe, jamais plus longues que le tiers de leur segment (pas de débordement)
                const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / tl, uy = (b[1] - a[1]) / tl, li = Math.min(tl / 6, Math.hypot(...v1) / 3), lo = Math.min(tl / 6, Math.hypot(...v2) / 3);
                return P(p[0], p[1], [p[0] - ux * li, p[1] - uy * li], [p[0] + ux * lo, p[1] + uy * lo]); })};
        }).filter(Boolean);
    }
    const loopsD = loops => loops.map(l => ptsD(l.pts, true)).join('');


    /** dessine des objets dans un canevas (pour le Pathfinder et « contour en forme ») */
    function paintObj(g, o, mode = 'fill') {
        if (o.hidden) return;
        if (o.wp) { const v = ext.vectorPlus?.vary(o); if (v) o = v; } // 〰 largeur variable
        const b = box(o), r = num(o.rot) * Math.PI / 180;
        g.save();
        if (r) { g.translate(b.x + b.w / 2, b.y + b.h / 2); g.rotate(r); g.translate(-b.x - b.w / 2, -b.y - b.h / 2); }
        if (o.type === 'group') { if (o.clip) g.clip(new Path2D(shapeD(o.clip))); (o.children || []).forEach(c => paintObj(g, c, mode)); }
        else if (o.type === 'text') { g.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${num(o.size, 24)}px ${font(o.font)}`; g.textAlign = o.align === 'middle' ? 'center' : o.align === 'end' ? 'right' : 'left'; String(o.text || '').split('\n').forEach((l, k) => { if (mode === 'stroke') { g.lineWidth = num(o.sw); g.strokeText(l, o.x, o.y + k * num(o.size, 24) * 1.2); } else g.fillText(l, o.x, o.y + k * num(o.size, 24) * 1.2); }); }
        else if (o.type !== 'image') {
            const p = new Path2D(shapeD(o));
            if (mode === 'stroke') { g.lineWidth = num(o.sw); g.lineCap = o.cap || 'round'; g.lineJoin = o.join || 'round'; if (num(o.sw)) g.stroke(p); }
            else { if (o.fill !== 'none' || !num(o.sw)) g.fill(p, o.evenodd ? 'evenodd' : 'nonzero'); if (num(o.sw) && o.stroke !== 'none' && mode === 'all') { g.lineWidth = num(o.sw); g.stroke(p); } }
        }
        g.restore();
    }
    /** des objets → un masque en pixels (opération entre eux), puis retour en tracés, dans les coordonnées du dessin */
    function rasterOp(objs, op, {res = 1100, mode = 'all'} = {}) {
        const b = unionBox(objs); if (!b || !b.w || !b.h) return null;
        const pad = 4, s = res / Math.max(b.w, b.h), W = Math.ceil(b.w * s) + pad * 2, H = Math.ceil(b.h * s) + pad * 2;
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.setTransform(s, 0, 0, s, pad - b.x * s, pad - b.y * s); g.fillStyle = '#000'; g.strokeStyle = '#000';
        // chaque forme est dessinée entière (fond, contour, enfants d'un groupe) sur sa propre feuille, puis combinée d'un coup
        const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d');
        objs.forEach((o, i) => {
            const blend = i === 0 || op === 'union' || op === 'outline' ? 'source-over' : op === 'intersect' ? 'destination-in' : op === 'subtract' ? 'destination-out' : 'xor';
            if (blend === 'source-over') { paintObj(g, o, op === 'outline' ? 'stroke' : mode); return; }
            tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, W, H); tg.setTransform(s, 0, 0, s, pad - b.x * s, pad - b.y * s); tg.fillStyle = '#000'; tg.strokeStyle = '#000';
            paintObj(tg, o, mode);
            g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = blend; g.drawImage(t, 0, 0); g.restore();
        });
        const data = g.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
        const loops = traceMask(mask, W, H, {eps: 0.9});
        if (!loops.length) return '';
        return loops.map(l => ptsD(l.pts.map(p => P((p.x - pad) / s + b.x, (p.y - pad) / s + b.y, p.i ? [(p.i[0] - pad) / s + b.x, (p.i[1] - pad) / s + b.y] : null, p.o ? [(p.o[0] - pad) / s + b.x, (p.o[1] - pad) / s + b.y] : null)), true)).join('');
    }
    /** une image → des tracés : noir et blanc (seuil) ou en couleurs (k couleurs) */
    async function vectorizeImage(src, {colors = 0, threshold = 128, invert = false, maxSize = 900, eps = 1, smooth = true, skipLight = true} = {}) {
        const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible.')); i.src = src; });
        const k = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight)), W = Math.max(2, Math.round(img.naturalWidth * k)), H = Math.max(2, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true});
        g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
        const px = g.getImageData(0, 0, W, H).data, out = [];
        if (!colors) {
            const mask = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) { const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; mask[i] = (l < threshold) !== invert ? 1 : 0; }
            out.push({color: '#111111', loops: traceMask(mask, W, H, {eps, smooth})});
        } else {
            // k-moyennes sur un échantillon de pixels
            const n = W * H, sample = [], step = Math.max(1, Math.floor(n / 6000));
            for (let i = 0; i < n; i += step) sample.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
            // départ : les couleurs les plus éloignées les unes des autres (sinon une petite tache rouge se fond dans le reste)
            let cent = [sample[0].slice()];
            while (cent.length < colors) { let best = null, bd = -1; for (const q of sample) { const d = Math.min(...cent.map(c => (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2)); if (d > bd) { bd = d; best = q; } } if (!best || bd < 300) break; cent.push(best.slice()); }
            const near = (r, gg, bb) => { let best = 0, bd = Infinity; cent.forEach((q, j) => { const d = (r - q[0]) ** 2 + (gg - q[1]) ** 2 + (bb - q[2]) ** 2; if (d < bd) { bd = d; best = j; } }); return best; };
            for (let it = 0; it < 10; it++) { const acc = cent.map(() => [0, 0, 0, 0]); sample.forEach(p => { const j = near(...p); acc[j][0] += p[0]; acc[j][1] += p[1]; acc[j][2] += p[2]; acc[j][3]++; }); cent = cent.map((q, j) => acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : q); }
            const lab = new Uint8Array(n); for (let i = 0; i < n; i++) lab[i] = near(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
            const counts = cent.map((_, j) => lab.reduce((a, v) => a + (v === j), 0));
            cent.map((q, j) => [q, j]).sort((a, b) => counts[b[1]] - counts[a[1]]).forEach(([q, j]) => {
                if (skipLight && q[0] > 232 && q[1] > 232 && q[2] > 232) return;
                const mask = new Uint8Array(n); let any = 0; for (let i = 0; i < n; i++) if (lab[i] === j) { mask[i] = 1; any++; }
                if (any < 6) return;
                out.push({color: '#' + q.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), loops: traceMask(mask, W, H, {eps, smooth})});
            });
        }
        return {W, H, layers: out.filter(l => l.loops.length)};
    }

    /* ═════════ Import SVG : seulement la géométrie et des couleurs vérifiées ═════════ */
    const M_ID = [1, 0, 0, 1, 0, 0];
    const mmul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    function parseTransform(t) {
        let m = M_ID.slice(); const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let x;
        while ((x = re.exec(String(t || '')))) {
            const v = x[2].split(/[\s,]+/).filter(Boolean).map(Number); let q = M_ID;
            if (x[1] === 'matrix' && v.length === 6) q = v;
            else if (x[1] === 'translate') q = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
            else if (x[1] === 'scale') q = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
            else if (x[1] === 'rotate') { const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); q = [c, s, -s, c, 0, 0]; if (v.length >= 3) q = mmul(mmul([1, 0, 0, 1, v[1], v[2]], q), [1, 0, 0, 1, -v[1], -v[2]]); }
            else if (x[1] === 'skewX') q = [1, 0, Math.tan((v[0] || 0) * Math.PI / 180), 1, 0, 0];
            else if (x[1] === 'skewY') q = [1, Math.tan((v[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
            if (q.every(Number.isFinite)) m = mmul(m, q);
        }
        return m;
    }
    function importSvgText(text) {
        if (String(text).length > 6e6) throw new Error('SVG trop gros.');
        const docx = new DOMParser().parseFromString(String(text), 'image/svg+xml'), root = docx.documentElement;
        if (!root || root.nodeName.toLowerCase() !== 'svg' || docx.querySelector('parsererror')) throw new Error('Ce fichier n’est pas un SVG lisible.');
        // couleurs des classes (<style> .cls-1{fill:#…}) et des dégradés (première couleur)
        const cls = {}; docx.querySelectorAll('style').forEach(st => { for (const m of String(st.textContent).matchAll(/((?:\.[\w-]+\s*,?\s*)+)\{([^}]*)\}/g)) m[1].split(',').map(s => s.trim().slice(1)).filter(Boolean).forEach(c => { cls[c] = {...(cls[c] || {}), ...styleMap(m[2])}; }); });
        const grads = {}; docx.querySelectorAll('linearGradient, radialGradient').forEach(g => { const s = g.querySelector('stop'); if (g.id && s) grads[g.id] = s.getAttribute('stop-color') || styleMap(s.getAttribute('style') || '')['stop-color']; });
        function styleMap(css) { const o = {}; String(css || '').split(';').forEach(kv => { const i = kv.indexOf(':'); if (i > 0) o[kv.slice(0, i).trim().toLowerCase()] = kv.slice(i + 1).trim(); }); return o; }
        const paint = v => { if (v === undefined || v === null || v === '') return undefined; const t = String(v).trim(); if (t === 'none' || t === 'transparent') return 'none'; if (t === 'currentColor') return '#000000'; const u = t.match(/^url\(\s*#([^)]+)\)/); if (u) return col(grads[u[1]], '#888888'); return col(t, '#000000'); };
        const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
        let base = M_ID.slice();
        const W0 = parseFloat(root.getAttribute('width')), H0 = parseFloat(root.getAttribute('height'));
        if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) base = mmul([W0 > 0 ? W0 / vb[2] : 1, 0, 0, H0 > 0 ? H0 / vb[3] : 1, 0, 0], [1, 0, 0, 1, -vb[0], -vb[1]]);
        const out = []; let count = 0;
        const elD = el => {
            const a = k => parseFloat(el.getAttribute(k)) || 0, tag = el.nodeName.toLowerCase();
            if (tag === 'path') return el.getAttribute('d') || '';
            if (tag === 'rect') { const o = {type: 'rect', x: a('x'), y: a('y'), w: a('width'), h: a('height'), r: a('rx') || a('ry')}; return o.w > 0 && o.h > 0 ? shapeD(o) : ''; }
            if (tag === 'circle') { const r = a('r'); return r > 0 ? shapeD({type: 'ellipse', x: a('cx') - r, y: a('cy') - r, w: 2 * r, h: 2 * r}) : ''; }
            if (tag === 'ellipse') { const rx = a('rx'), ry = a('ry'); return rx > 0 && ry > 0 ? shapeD({type: 'ellipse', x: a('cx') - rx, y: a('cy') - ry, w: 2 * rx, h: 2 * ry}) : ''; }
            if (tag === 'line') return `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`;
            if (tag === 'polyline' || tag === 'polygon') { const v = String(el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite); if (v.length < 4) return ''; let d = `M${v[0]} ${v[1]}`; for (let k = 2; k + 1 < v.length; k += 2) d += `L${v[k]} ${v[k + 1]}`; return d + (tag === 'polygon' ? 'Z' : ''); }
            return '';
        };
        function walk(el, m, inh, into) {
            if (++count > 20000) return;
            const tag = el.nodeName.toLowerCase();
            if (['defs', 'style', 'script', 'clippath', 'mask', 'symbol', 'metadata', 'title', 'desc', 'lineargradient', 'radialgradient', 'pattern', 'filter', 'foreignobject'].includes(tag)) return;
            const own = {...(el.getAttribute('class') || '').split(/\s+/).filter(Boolean).reduce((o, c) => ({...o, ...(cls[c] || {})}), {}), ...Object.fromEntries(['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'fill-rule', 'display', 'visibility', 'font-size', 'font-family', 'font-weight'].filter(k => el.hasAttribute(k)).map(k => [k, el.getAttribute(k)])), ...styleMap(el.getAttribute('style'))};
            const st = {...inh, ...own}; if (st.display === 'none' || st.visibility === 'hidden') return;
            const mm = mmul(m, parseTransform(el.getAttribute('transform')));
            if (tag === 'g' || tag === 'svg' || tag === 'a') { const kids = []; [...el.children].forEach(c => walk(c, mm, st, kids)); if (kids.length > 1 && tag === 'g') into.push({id: uid(), type: 'group', name: el.getAttribute('id')?.slice(0, 40) || 'Groupe', children: kids}); else into.push(...kids); return; }
            const det = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2])) || 1;
            if (tag === 'text') { const t = (el.textContent || '').trim().slice(0, 2000); if (!t) return; const x = parseFloat(el.getAttribute('x')) || 0, y = parseFloat(el.getAttribute('y')) || 0;
                into.push({id: uid(), type: 'text', name: t.slice(0, 30), text: t, x: mm[0] * x + mm[2] * y + mm[4], y: mm[1] * x + mm[3] * y + mm[5], size: clamp((parseFloat(st['font-size']) || 16) * det, 2, 2000), font: font(st['font-family'] || 'Georgia'), bold: /bold|[6-9]00/.test(st['font-weight'] || ''), fill: paint(st.fill) ?? '#000000', sw: 0}); return; }
            if (tag === 'image') { const href = el.getAttribute('href') || el.getAttribute('xlink:href') || ''; if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(href) || !imgOk(href)) return;
                const x = parseFloat(el.getAttribute('x')) || 0, y = parseFloat(el.getAttribute('y')) || 0, w = parseFloat(el.getAttribute('width')) || 0, h = parseFloat(el.getAttribute('height')) || 0;
                into.push({id: uid(), type: 'image', name: 'Image', src: href, x: mm[0] * x + mm[4], y: mm[3] * y + mm[5], w: w * Math.abs(mm[0]), h: h * Math.abs(mm[3])}); return; }
            const d = elD(el); if (!d || !K()) return;
            const tx = K().pathStr(K().absPath(d).map(([c, ...v]) => { const o = [c]; for (let k = 0; k < v.length; k += 2) o.push(mm[0] * v[k] + mm[2] * v[k + 1] + mm[4], mm[1] * v[k] + mm[3] * v[k + 1] + mm[5]); return o; }));
            if (!tx) return;
            const fill = paint(st.fill) ?? '#000000', op = clamp(num(st.opacity, 1) * num(st['fill-opacity'], 1), 0, 1);
            const o = {id: uid(), type: 'svgpath', name: tag === 'path' ? 'Tracé' : tag, d: tx, fill, stroke: paint(st.stroke) ?? 'none', sw: paint(st.stroke) && paint(st.stroke) !== 'none' ? clamp(num(st['stroke-width'], 1) * det, 0, 500) : 0, evenodd: st['fill-rule'] === 'evenodd', op};
            const one = dToPts(tx); if (one) { o.type = 'path'; o.pts = one.pts; o.closed = one.closed; delete o.d; }
            into.push(o);
        }
        walk(root, base, {}, out);
        return out;
    }

    /* ═════════ Blasons ═════════ */
    const deT = t => { const n = (TINCTURES.find(x => x[0] === t) || TINCTURES[0])[1].toLowerCase(); return /^[aeiouéo]/i.test(n) ? `d’${n}` : `de ${n}`; };
    const NUMS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six'];
    const CHARGE_POS = {1: [[50, 58, 46]], 2: [[30, 55, 30], [70, 55, 30]], 3: [[29, 40, 27], [71, 40, 27], [50, 84, 27]], 4: [[30, 38, 25], [70, 38, 25], [30, 78, 25], [70, 78, 25]], 5: [[26, 30, 22], [74, 30, 22], [50, 56, 22], [26, 82, 22], [74, 82, 22]], 6: [[22, 30, 20], [50, 30, 20], [78, 30, 20], [34, 60, 20], [66, 60, 20], [50, 88, 20]]};
    const tHex = t => (TINCTURES.find(x => x[0] === t) || TINCTURES[0])[2];
    const polyD = (p, s, ox, oy) => { let d = ''; for (let k = 0; k < p.length; k += 2) d += (k ? 'L' : 'M') + n2(ox + p[k] * s) + ' ' + n2(oy + p[k + 1] * s); return d + 'Z'; };
    function chargeD(key, cx, cy, size) {
        const sh = K()?.shapeByKey?.(key); if (!sh?.d) return '';
        const segs = K().absPath(sh.d), b = segsBox(segs); if (!b) return '';
        const k = size / Math.max(b.w, b.h);
        return K().pathStr(segs.map(([c, ...a]) => { const o = [c]; for (let j = 0; j < a.length; j += 2) o.push(cx + (a[j] - b.x - b.w / 2) * k, cy + (a[j + 1] - b.y - b.h / 2) * k); return o; }));
    }
    /** un blason complet : écu, partition, pièce, meubles, contour — et son blasonnement */
    function makeBlason(o, {x = 0, y = 0, width = 300} = {}) {
        const s = width / 100, esc0 = ESCUTCHEONS.find(e => e[0] === o.shield) || ESCUTCHEONS[0];
        const shieldD = K() ? K().pathStr(K().absPath(esc0[2]).map(([c, ...a]) => { const r = [c]; for (let j = 0; j < a.length; j += 2) r.push(x + a[j] * s, y + a[j + 1] * s); return r; })) : '';
        const kids = [{id: uid(), type: 'rect', name: 'Champ', x, y, w: 100 * s, h: 120 * s, fill: tHex(o.a), sw: 0}];
        const div = DIVISIONS.find(d => d[0] === o.division) || DIVISIONS[0];
        if (div[2].length) kids.push({id: uid(), type: 'svgpath', name: div[1], d: div[2].map(p => polyD(p, s, x, y)).join(''), fill: tHex(o.b), sw: 0});
        const ord = ORDINARIES.find(d => d[0] === o.ordinary) || ORDINARIES[0];
        if (ord[2] === 'border') kids.push({id: uid(), type: 'svgpath', name: ord[1], d: shieldD, fill: 'none', stroke: tHex(o.c), sw: 24 * s, join: 'miter'});
        else if (ord[2].length) kids.push({id: uid(), type: 'svgpath', name: ord[1], d: ord[2].map(p => polyD(p, s, x, y)).join(''), fill: tHex(o.c), sw: 0});
        const n = clamp(Math.round(num(o.count)), 0, 6), sh = K()?.shapeByKey?.(o.charge);
        if (n && sh) (CHARGE_POS[n] || []).forEach(([cx, cy, sz], i) => { const d = chargeD(o.charge, x + cx * s, y + cy * s, sz * s * (num(o.chargeSize, 100) / 100)); if (d) kids.push({id: uid(), type: 'svgpath', name: `${sh.n} ${i + 1}`, d, fill: tHex(o.d), sw: 0, evenodd: !!sh.eo}); });
        const blason = {id: uid(), type: 'group', name: 'Blason', children: [
            {id: uid(), type: 'group', name: 'Écu', clip: {id: uid(), type: 'svgpath', d: shieldD}, children: kids},
            {id: uid(), type: 'svgpath', name: 'Contour de l’écu', d: shieldD, fill: 'none', stroke: '#222222', sw: Math.max(1, 1.6 * s), join: 'round'}]};
        // blasonnement
        let txt = div[3].replace('%a', deT(o.a)).replace('%b', deT(o.b));
        txt = div[0] === 'plein' ? `D${deT(o.a).slice(1)}` : txt;
        if (ord[3]) txt += (div[0] === 'plein' ? ' ' : ', ') + ord[3].replace('%c', deT(o.c));
        if (n && sh) txt += `${ord[3] ? ', accompagné' + (/^à la/.test(ord[3]) ? 'e' : '') + ' de' : div[0] === 'plein' ? ' à' : ', à'} ${NUMS[n]} ${n > 1 ? sh.n.toLowerCase().replace(/^(\S+?)([sx]?)(\s|$)/, (m, w, e, sp) => w + (e || 's') + sp) : sh.n.toLowerCase()} ${deT(o.d)}${n === 3 ? ', 2 et 1' : n === 6 ? ', 3, 2 et 1' : ''}`;
        return {obj: blason, blazon: txt.replace(/\s+/g, ' ').trim() + '.'};
    }

    ext.vectorInternals = {boxPts, ptsD, shapeD, box, rbox, mapObj, toPath, dToPts, objSvg, docSvg, traceMask, rasterOp, vectorizeImage, importSvgText, parseTransform, makeBlason, TINCTURES, ESCUTCHEONS, DIVISIONS, ORDINARIES, CHARGE_KEYS, col, imgOk, unionBox, loopsD};

    /* ═════════ L'éditeur ═════════ */
    const TOOLS = [['select', '➤', 'Sélection', 'V'], ['direct', '⌖', 'Sélection directe (points et poignées)', 'A'], ['pen', '✒️', 'Plume (clic : point, glisser : courbe)', 'P'], ['pencil', '✏️', 'Crayon (à main levée)', 'N'],
        ['rect', '▭', 'Rectangle', 'M'], ['ellipse', '◯', 'Ellipse', 'L'], ['polygon', '⬡', 'Polygone', 'Y'], ['star', '☆', 'Étoile', 'S'], ['spiral', '🌀', 'Spirale (glisser depuis le centre)', 'O'], ['line', '╱', 'Ligne', '\\'], ['dim', '📏', 'Cote (mesure entre deux points)', 'D'], ['text', 'T', 'Texte', 'T'],
        ['eyedrop', '💧', 'Pipette (prend la couleur d’un objet)', 'I'], ['hand', '✋', 'Main (déplacer la vue)', 'H'], ['zoom', '🔍', 'Loupe (⌥ : dézoomer)', 'Z']];
    const SWATCHES = ['#000000', '#ffffff', '#7f7f7f', '#d81e1e', '#e6862a', '#f4c430', '#1a8a3a', '#1f4fa3', '#7b3f8c', '#8b5a2b', '#f2c9a8', 'none'];
    const newDoc = () => ({w: 800, h: 600, bg: '#ffffff', grid: 0, snap: false, objs: []});
    /** 📐 Format du document : l'unité montrée, la résolution de l'export image, le format choisi (liste commune) et les informations (titre, auteur…) */
    const INFO_KEYS = [['title', 200], ['author', 200], ['subject', 300], ['desc', 2000], ['keywords', 400], ['rights', 300], ['lang', 12], ['date', 40]];
    const cleanInfo = v => { const out = {}; if (v && typeof v === 'object') INFO_KEYS.forEach(([k, n]) => { const t = typeof v[k] === 'string' ? v[k].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n) : ''; if (t) out[k] = t; }); return out; };
    const cleanFmt = o => { const out = {}; if (['mm', 'cm', 'px', 'in'].includes(o.unit)) out.unit = o.unit; if (Number(o.dpi) >= 36 && Number(o.dpi) <= 1200) out.dpi = Math.round(Number(o.dpi)); if (/^[A-Za-z0-9_:-]{1,40}$/.test(String(o.fmt || ''))) out.fmt = String(o.fmt); if (o.bleed !== undefined && o.bleed !== null && o.bleed !== '' && Number.isFinite(Number(o.bleed))) out.bleed = Math.round(clamp(Number(o.bleed), 0, 20) * 10) / 10; const info = cleanInfo(o.info); if (Object.keys(info).length) out.info = info; return out; };
    const cleanDoc = d => { const o = d && typeof d === 'object' ? d : {}; return {w: clamp(num(o.w, 800), 10, 20000), h: clamp(num(o.h, 600), 10, 20000), bg: o.bg === 'transparent' ? 'transparent' : col(o.bg, '#ffffff'), grid: clamp(num(o.grid), 0, 500), snap: !!o.snap, objs: Array.isArray(o.objs) ? o.objs.filter(x => x && typeof x === 'object').slice(0, 20000) : [], ...cleanMap(o), ...cleanPages(o), ...(/^[a-z]{2,20}$/.test(o.kind || '') ? {kind: o.kind} : {}), ...(typeof o.blasonOn === 'boolean' ? {blasonOn: o.blasonOn} : {}), ...(o.persp && typeof o.persp === 'object' && ext.vectorPlus ? {persp: ext.vectorPlus.cleanPersp(o.persp)} : {}), ...cleanFmt(o)}; }; // kind : « tree » pour un arbre décoratif, etc.
    /** 📄 les pages d'un document à plusieurs faces (faire-part recto-verso, carte pliée, enveloppe) : des rectangles du plan de travail,
     *  chacun imprimé sur sa propre feuille ; panels = les volets (plis entre eux) ; back = le dos de la page d'avant (impression recto-verso) */
    function cleanPages(o) {
        if (!Array.isArray(o.pages) || !o.pages.length) return {};
        const pages = o.pages.filter(p => p && typeof p === 'object').slice(0, 12).map(p => { const w = clamp(num(p.w, 100), 10, 20000), h = clamp(num(p.h, 100), 10, 20000);
            return {name: String(p.name || 'Page').replace(/[<>]/g, '').slice(0, 60), x: num(p.x), y: num(p.y), w, h, role: p.role === 'env' ? 'env' : 'face', ...(p.back ? {back: true} : {}),
                panels: (Array.isArray(p.panels) ? p.panels : []).filter(q => q && typeof q === 'object').slice(0, 8).map(q => ({name: String(q.name || '').replace(/[<>]/g, '').slice(0, 60), x: clamp(num(q.x), 0, w), w: clamp(num(q.w, w), 1, w)}))}; });
        const f = o.fold && typeof o.fold === 'object' ? {mode: /^(duplex|fold2|fold3|fold4|single)$/.test(o.fold.mode || '') ? o.fold.mode : 'single', pw: clamp(num(o.fold.pw, 100), 10, 20000), ph: clamp(num(o.fold.ph, 100), 10, 20000), ...(o.fold.env ? {env: String(o.fold.env).replace(/[^a-z0-9]/gi, '').slice(0, 10)} : {})} : null;
        return {pages, ...(f ? {fold: f} : {})};
    }
    /** les réglages du mode Plan et l'image de référence (vérifiés : nombres, style connu, image sûre) */
    function cleanMap(o) {
        const out = {}, m = o.map;
        if (m && typeof m === 'object') {
            const g = m.geo && typeof m.geo === 'object' && ['n', 's', 'w', 'e'].every(k => Number.isFinite(Number(m.geo[k]))) ? {n: num(m.geo.n), s: num(m.geo.s), w: num(m.geo.w), e: num(m.geo.e), lat: num(m.geo.lat), lon: num(m.geo.lon), name: String(m.geo.name || '').slice(0, 120), place_id: Math.max(0, Math.round(num(m.geo.place_id)))} : null;
            out.map = {on: !!m.on, style: VM()?.STYLES?.[m.style] ? m.style : (/^[a-z]{2,20}$/.test(m.style || '') ? m.style : 'modern'), auto: m.auto !== false, year: num(m.year) ? Math.round(clamp(num(m.year), -3000, 3000)) : null, scale: clamp(num(m.scale, 1), 0.001, 1e6), ...(m.kmgrid ? {kmgrid: true} : {}), ...(m.bm && typeof m.bm === 'object' && Number.isFinite(Number(m.bm.lat)) && Number.isFinite(Number(m.bm.lon)) ? {bm: {lat: clamp(num(m.bm.lat), -85, 85), lon: clamp(num(m.bm.lon), -360, 360), km: clamp(num(m.bm.km, 2), 0.05, 2000), bg: /^[a-z0-9_-]{1,30}$/i.test(m.bm.bg || '') ? m.bm.bg : 'osm', name: String(m.bm.name || '').slice(0, 120), place_id: Math.max(0, Math.round(num(m.bm.place_id)))}} : {}), ...(m.askGeo ? {askGeo: true} : {}), ...(g ? {geo: g} : {})};
        }
        const r = o.ref;
        if (r && typeof r === 'object' && imgOk(r.src)) out.ref = {src: r.src, x: num(r.x), y: num(r.y), w: clamp(num(r.w, 100), 1, 100000), h: clamp(num(r.h, 100), 1, 100000), k: clamp(num(r.k, 1), .1, 4), op: clamp(num(r.op, .5), .05, 1), show: r.show !== false, print: !!r.print, gray: !!r.gray};
        return out;
    }

    /**
     * Ouvre l'éditeur. ctx : {id} un dessin enregistré, {shape} une forme des tableaux à reprendre (et onShape(k) après),
     * {coat: {id, title, media}} des armoiries à dessiner (onBlazon(texte), onCoatSaved()), {svg}/{imageSrc} à importer.
     */
    async function openEditor(ctx = {}) {
        let docId = 0, name = 'Mon dessin', doc = newDoc();
        if (ctx.id) { try { const r = await api('vector_doc', {id: ctx.id}); docId = r.id; name = r.name; doc = cleanDoc(r.doc); } catch (e) { return toast(e.message, 'error'); } }
        else if (ctx.doc) { doc = cleanDoc(ctx.doc); name = String(ctx.name || name).slice(0, 200); } // un dessin tout fait (arbre décoratif, faire-part…)
        let MP = null; const isPen = t => t === 'pen' || t === 'mline' || t === 'mzone';
        let sel = [], tool = 'select', zoom = 1, panX = 0, panY = 0, dirty = false, hist = [], hi = -1, clip = null, penPath = null, nodeSel = null, lastBlazon = '';
        const dlg = document.createElement('dialog'); dlg.className = 'modal vx-dlg'; dlg.dataset.ownClose = '1';
        const menu = (label, items) => `<details class="vx-menu" data-tb="menu-${label}" data-tb-label="Menu ${label}"><summary>${label}</summary><div class="vx-menu-list">${items.map(([k, l, sc]) => k === '-' ? '<hr>' : `<button type="button" data-vx-cmd="${k}"><span>${l}</span>${sc ? `<kbd>${sc}</kbd>` : ''}</button>`).join('')}</div></details>`;
        dlg.innerHTML = `<div class="vx-shell">
            <header class="vx-top"><span class="vx-logo">✒️</span><input class="vx-name" data-vx-name value="${esc(name)}" maxlength="200" aria-label="Nom du dessin">
                <nav class="vx-menus" data-tbg="vx-menus" data-tbg-label="Menus du haut">${menu('Fichier', [['new', 'Nouveau dessin'], ['open', 'Ouvrir un dessin…'], ['save', 'Enregistrer', '⌘S'], ['-'], ['docformat', '📐 Format du document / plans de travail…'], ['docinfo', 'ℹ️ Informations du document…'], ['-'], ['import', '⤒ Importer de l’ordinateur (SVG, PNG, JPG, WEBP, GIF, BMP, fichier du dessin…)', '⌘I'], ['importmedia', '🖼 Une image de la base…'], ['-'], ['toshape', '🔷 Enregistrer comme forme (Mes formes)…'], ['tomedia', '🖼️ Enregistrer dans les médias d’une fiche…'], ['tocoat', '🛡️ Enregistrer comme image d’armoiries…']])}
                    ${menu('Édition', [['undo', 'Annuler', '⌘Z'], ['redo', 'Rétablir', '⇧⌘Z'], ['-'], ['cut', 'Couper', '⌘X'], ['copy', 'Copier', '⌘C'], ['paste', 'Coller', '⌘V'], ['dup', 'Dupliquer', '⌘D'], ['del', 'Supprimer', '⌫'], ['-'], ['all', 'Tout sélectionner', '⌘A'], ['none', 'Ne rien sélectionner', 'Échap']])}
                    ${menu('Objet', [['blend', '⧉ Mélange de deux formes (étapes)…'], ['-'], ['group', 'Grouper', '⌘G'], ['ungroup', 'Dissocier', '⇧⌘G'], ['clipmask', 'Masque d’écrêtage (l’objet du dessus découpe les autres)', '⌘7'], ['unclip', 'Retirer le masque'], ['-'], ['front', 'Premier plan', '⇧⌘]'], ['fwd', 'Avancer', '⌘]'], ['back', 'Reculer', '⌘['], ['bottom', 'Arrière-plan', '⇧⌘['], ['-'], ['flipH', 'Retourner horizontalement'], ['flipV', 'Retourner verticalement'], ['rot90', 'Tourner de 90°'], ['-'], ['textpath', '➰ Texte sur une courbe…'], ['ornaments', '❦ Ornements anciens (fleurons, cadres, lettrines…)'], ['-'], ['topath', 'Convertir en tracé (points modifiables)'], ['outline', 'Contour du trait → forme'], ['simplify', 'Simplifier le tracé…'], ['-'], ['transform', 'Transformer… (échelle, inclinaison, copies)'], ['repeat_circle', 'Répétition en cercle…'], ['repeat_grid', 'Répétition en grille…'], ['-'], ['lock', '🔒 Verrouiller / déverrouiller'], ['hide', '🙈 Masquer'], ['showall', '👁 Tout afficher']])}
                    ${menu('Aligner', [['al_l', 'À gauche'], ['al_c', 'Au centre (horizontal)'], ['al_r', 'À droite'], ['al_t', 'En haut'], ['al_m', 'Au milieu (vertical)'], ['al_b', 'En bas'], ['-'], ['di_h', 'Répartir horizontalement'], ['di_v', 'Répartir verticalement'], ['-'], ['al_art', 'Centrer sur le plan de travail'], ['alto_sel', 'Aligner par rapport à la sélection'], ['alto_art', 'Aligner par rapport au plan de travail']])}
                    ${menu('Pathfinder', [['pf_union', '⬤ Réunir'], ['pf_subtract', '◐ Soustraire (le dessous moins le reste)'], ['pf_intersect', '◑ Intersection'], ['pf_exclude', '◎ Exclure (là où ils se croisent)']])}
                    ${menu('Blason', [['blason', '🛡️ Créer un blason…'], ['charge', '⚜️ Ajouter un meuble (fleur de lys, lion, étoile…)…'], ['-'], ['hatch', '🖨 Hachures héraldiques (noir et blanc)'], ['unhatch', '🎨 Remettre les émaux en couleur'], ['-'], ['vectorize', '🪄 Vectoriser une image (refaire un blason scanné)…']])}
                    ${menu('Plan', [['map_on', '🗺️ Mode Plan (cartes) : oui / non'], ['map_tab', 'Palette du plan (routes, rivières, bâtiments…)'], ['-'], ['map_base', '🗺️ Fond de carte d’un lieu…'], ['map_ref', '🖼️ Image de référence (en transparence)…'], ['-'], ['map_layers', '🗂 Créer les calques d’un plan'], ['map_places', '📍 Lieux de la base sur le plan…'], ['map_links', '🔗 Objets reliés à la famille…']])}
                    ${menu('Affichage', [['zin', 'Zoom avant', '⌘+'], ['zout', 'Zoom arrière', '⌘−'], ['zfit', '⤢ Ajuster à la fenêtre', '⌘0'], ['z100', '100 % (taille réelle)', '⌘1'], ['-'], ['grid', '▦ Grille…'], ['persp', '📐 Grille de perspective…'], ['smart', '🧲 Aimanter (bords et centres des objets) : oui / non'], ['folds', 'Repères de pli et noms des pages : oui / non']])}</nav>
                <div class="vx-hist" data-tbg="vx-hist" data-tbg-label="Annuler / rétablir (en haut)"><button type="button" data-vx-cmd="undo" title="Annuler (⌘Z)" data-shortcut="⌘Z">↶</button><button type="button" data-vx-cmd="redo" title="Rétablir (⇧⌘Z)" data-shortcut="⇧⌘Z">↷</button></div>
                <span class="vx-modes" data-tbg="vx-modes" data-tbg-label="Modes (en haut)"><label class="vx-mode" data-tb="vx-mode-blason" title="Montre l’onglet et le menu Blason"><input type="checkbox" data-vx-mode="blason"> 🛡️ Blason</label><label class="vx-mode" data-tb="vx-mode-map" title="Montre l’onglet Plan et ses outils (routes, rivières…)"><input type="checkbox" data-vx-mode="map"> 🗺️ Carte</label></span>${ctx.coat ? '<button type="button" class="button small secondary" data-vx-cmd="tocoat">🛡️ Dans ces armoiries</button>' : ''}${ctx.shape || ctx.onShape ? '<button type="button" class="button small secondary" data-vx-cmd="toshape">🔷 Enregistrer la forme</button>' : ''}
                <span class="vx-spacer"></span><span class="vx-status" data-vx-status data-ui-status></span>${ext.tbButton ? ext.tbButton('vector') : ''}
                <details class="vx-menu vx-export" data-tb="vx-export" data-tb-label="⤓ Exporter (menu)"><summary class="button small secondary" title="Exporter : PDF, images, SVG, impression, fichier du dessin">⤓ Exporter ▾</summary><div class="vx-menu-list">${[['xd_pdf', '📄 PDF…'], ['xd_png', '🖼 PNG…'], ['xd_jpg', '📷 JPG…'], ['xd_svg', '✒ SVG…'], ['xd_webp', '🖼 WEBP…'], ['xd_print', '🖨 Imprimer…'], ['xd_file', '💾 Fichier du dessin…'], ['-'], ['exp_sel', '✒ La sélection seule en SVG'], ['copysvg', '📋 Copier le code SVG'], ['copypng', '📋 Copier l’image']].map(([k, l]) => k === '-' ? '<hr>' : `<button type="button" data-vx-cmd="${k}"><span>${l}</span></button>`).join('')}</div></details>
                <button type="button" class="button small" data-vx-cmd="save" data-shortcut="⌘S" title="Enregistrer le dessin">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('vector') : ''}<button type="button" class="icon-button" data-vx-close title="Fermer" aria-label="Fermer">×</button></header>
            <div class="vx-main"><aside class="vx-tools" data-tbg="vx-tools" data-tbg-label="Outils (colonne de gauche)">${TOOLS.map(([k, ic, l, sc]) => `<button type="button" data-vx-tool="${k}" title="${esc(l)} (${sc})" data-shortcut="${esc(sc)}">${ic}</button>`).join('')}
                    <div class="vx-maptools" data-vx-maptools hidden title="Outils du mode Plan"><button type="button" data-vx-tab-go="map" title="🗺️ Plan : la palette des routes, rivières, bâtiments…">🗺️</button>${[['mline', '🛣️', 'Voie, rivière, limite (un clic par point)'], ['mzone', '▱', 'Zone : forêt, champ, lac, bourg…'], ['msym', '🏠', 'Bâtiment ou symbole'], ['mlabel', '📍', 'Nom de lieu (ville, village, rivière… déjà mis en forme pour une carte ; T = texte libre)'], ['mdeco', '🧭', 'Échelle, rose des vents, cartouche, légende']].map(([k, ic, l]) => `<button type="button" data-vx-tool="${k}" title="${esc(l)}">${ic}</button>`).join('')}</div>
                    <div class="vx-fs"><button type="button" class="vx-fsfill" data-vx-fsfill title="Remplissage : clic pour choisir la couleur" aria-label="Couleur de remplissage"></button><button type="button" class="vx-fsstroke" data-vx-fsstroke title="Contour : clic pour choisir la couleur" aria-label="Couleur du contour"></button><button type="button" class="vx-fsswap" data-vx-fsswap title="Intervertir remplissage et contour (⇧X)" aria-label="Intervertir">⤾</button></div></aside>
                <div class="vx-stage" data-vx-stage tabindex="-1"><div class="vx-crumbs" data-vx-crumbs hidden></div><svg class="vx-svg" data-vx-svg xmlns="http://www.w3.org/2000/svg"><defs data-vx-defs></defs><g data-vx-world><rect data-vx-board class="vx-board"/><g data-vx-ref></g><g data-vx-grid></g><g data-vx-content></g><g data-vx-pages style="pointer-events:none"></g><g data-vx-ui></g></g></svg></div>
                <aside class="vx-panel"><div class="vx-psize" data-vx-psize title="Glisser pour élargir ou rétrécir le panneau (double-clic : taille d’origine)"></div><nav class="segmented vx-tabs" data-tbg="vx-tabs" data-tbg-label="Onglets du panneau de droite"><button type="button" data-vx-tab="props" class="is-active" title="Propriétés de l’élément choisi" data-tb-label="ⓘ Propriétés"><span class="vx-ti" aria-hidden="true">ⓘ</span><span class="vx-tl">Propriétés</span></button><button type="button" data-vx-tab="layers" title="Calques" data-tb-label="🗂 Calques"><span class="vx-ti" aria-hidden="true">🗂</span><span class="vx-tl">Calques</span></button><button type="button" data-vx-tab="map" title="Mode Plan (cartes), fond de carte, image de référence" data-tb-label="🗺️ Plan"><span class="vx-ti" aria-hidden="true">🗺️</span><span class="vx-tl">Plan</span></button><button type="button" data-vx-tab="blason" title="Blason" data-tb-label="🛡️ Blason"><span class="vx-ti" aria-hidden="true">🛡️</span><span class="vx-tl">Blason</span></button><button type="button" data-vx-tab="orn" title="❦ Ornements anciens : fleurons, cadres, coins, filets, culs-de-lampe, lettrines" data-tb-label="❦ Ornements"><span class="vx-ti" aria-hidden="true">❦</span><span class="vx-tl">Ornements</span></button><button type="button" data-vx-tab="doc" title="Document : plan de travail, taille, fond" data-tb-label="📄 Document"><span class="vx-ti" aria-hidden="true">📄</span><span class="vx-tl">Document</span></button></nav><div class="vx-pane" data-vx-pane></div></aside></div>
            <footer class="vx-foot" data-vx-foot><span data-vx-pos></span><span class="vx-last" data-vx-last></span></footer>
            <input type="file" data-vx-file hidden accept="image/*,.svg,image/svg+xml,.bmp,.tif,.tiff,.ico,.avif,.json,application/json">
        </div>`;
        injectCss(); document.body.appendChild(dlg); ext.fullInit?.(dlg, 'vector', true); // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        try { ext.tbApply?.(dlg, 'vector'); } catch (_) {} // boutons rangés ou cachés (⚙️ Personnaliser, ou Réglages → Montage, retouche, mise en page et son)
        try { UI()?.harmonizeTopbar?.(dlg.querySelector('.vx-top')); } catch (_) {} // E1 : ✓ Enregistré · ⚙️ · ⤓ Exporter · 💾 · ⛶ · × dans l'ordre validé
        UI()?.editorRail?.(dlg.querySelector('.vx-tools'), {breaks: ['[data-vx-tool=pen]', '[data-vx-tool=text]', '[data-vx-tool=eyedrop]', '[data-vx-tool=hand]', '.vx-fs']}); // K19 : colonne de 36 px, groupes séparés
        ext.editorKeysAttach?.(dlg, 'vector'); // ⌨️ raccourcis à soi
        const $ = s => dlg.querySelector(s);
        const svgEl = $('[data-vx-svg]'), world = $('[data-vx-world]'), content = $('[data-vx-content]'), ui = $('[data-vx-ui]'), defsEl = $('[data-vx-defs]'), stage = $('[data-vx-stage]'), pane = $('[data-vx-pane]');
        let tab = ctx.tab === 'map' ? 'map' : 'props';
        /* « ✓ Enregistré » toujours au même endroit (E1) ; ce qui vient de se faire s'écrit en bas, à côté de la position */
        const note = t => { const e = $('[data-vx-last]'); if (e) e.textContent = t || ''; };
        const saved = st => { const e = $('[data-vx-status]'); if (!e) return; if (!st) { e.innerHTML = ''; return; } if (UI()?.savedStatus) UI().savedStatus(e, st); else e.textContent = {saved: '✓ Enregistré', dirty: '• modifié', saving: 'Enregistrement…', error: '⚠️ Pas enregistré'}[st] || ''; };
        const markDirty = () => { if (!dirty) { dirty = true; saved('dirty'); } };
        const status = t => note(t);
        let sbar = null; // K18 : la barre du bas commune (où l'on est · aide de l'outil · 🧲 · zoom)
        const hint = t => { sbar?.setHelp(t || ''); };
        /* calques et groupes : on travaille « dans » un calque ou un groupe (mode isolé, comme Illustrator) ;
           scope = le chemin des groupes ouverts ; les nouveaux dessins, la sélection, l'ordre se font dans ce conteneur */
        let scope = [];
        const isLayerGroup = o => o?.type === 'group';
        function cur() {
            let a = doc.objs;
            for (let k = 0; k < scope.length; k++) { const g = a.find(o => o.id === scope[k] && isLayerGroup(o)); if (!g) { scope = scope.slice(0, k); break; } if (!Array.isArray(g.children)) g.children = []; a = g.children; }
            return a;
        }
        const scopeGroup = () => { let a = doc.objs, g = null; for (const gid of scope) { g = a.find(o => o.id === gid); if (!g) return null; a = g.children || []; } return g; };
        const setCur = arr => { const g = scope.length ? scopeGroup() : null; if (g) g.children = arr; else doc.objs = arr; };
        /** un objet n'importe où dans l'arbre : {o, arr (son conteneur), path (les groupes au-dessus)} */
        const findAny = (id, arr = doc.objs, path = []) => { for (const o of arr) { if (o.id === id) return {o, arr, path}; if (isLayerGroup(o)) { const r = findAny(id, o.children || [], [...path, o.id]); if (r) return r; } } return null; };
        const pathName = path => { let a = doc.objs; return path.map(gid => { const g = a.find(o => o.id === gid); a = g?.children || []; return g?.name || 'Groupe'; }); };
        /** entrer dans un groupe : refusé s'il est tourné (les points ne tomberaient plus sous la souris) */
        function enterScope(path) {
            let a = doc.objs; for (const gid of path) { const g = a.find(o => o.id === gid); if (!g) return false; if (num(g.rot)) { toast(`« ${g.name || 'Ce groupe'} » est tourné : remets sa rotation à 0, ou dissocie-le, pour travailler dedans.`, 'error'); return false; } a = g.children || []; }
            if (penPath) finishPen(); scope = path.slice(); sel = []; nodeSel = null; return true;
        }
        /** le dessin : ce qui est hors du calque où l'on travaille est pâli et ne se clique pas */
        function treeSvg(defs) {
            // dans un calque (pas dans un groupe isolé) : les autres calques restent nets et un clic dessus y passe, comme dans Illustrator
            const isolate = scope.some(id => !findAny(id)?.o?.layer);
            const walk = (arr, depth) => listSvg(arr, o => {
                if (!isolate && depth === 0 && o.layer && scope[0] !== o.id && isLayerGroup(o)) { if (o.hidden) return '';
                    let clip = ''; if (o.clip) { const cid = `ec${String(o.id).replace(/\W/g, '')}`; defs.push(`<clipPath id="${cid}"><path d="${esc(shapeD(o.clip))}"${rotAttr(o.clip)}/></clipPath>`); clip = ` clip-path="url(#${cid})"`; } // ✂️ calque masqué
                    return `<g${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}><g${clip}>${listSvg(o.children || [], c => objSvg(c, defs, 'e', c.locked ? false : 'out'))}</g></g>`; }
                if (depth < scope.length && o.id === scope[depth] && isLayerGroup(o)) {
                    if (o.hidden) return '';
                    let clip = ''; if (o.clip) { const cid = `ec${String(o.id).replace(/\W/g, '')}`; defs.push(`<clipPath id="${cid}"><path d="${esc(shapeD(o.clip))}"${rotAttr(o.clip)}/></clipPath>`); clip = ` clip-path="url(#${cid})"`; }
                    return `<g${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}><g${clip}>${walk(o.children || [], depth + 1)}</g></g>`;
                }
                const live = depth === scope.length, svg = objSvg(o, defs, 'e', live || (!isolate && !o.locked ? 'out' : false));
                return live || !isolate ? svg : `<g class="vx-dim">${svg}</g>`;
            });
            return walk(doc.objs, 0);
        }
        const byId = id => cur().find(o => o.id === id);
        const selObjs = () => sel.map(byId).filter(Boolean);
        const editable = o => o && !o.locked && !o.hidden;
        /* historique */
        // l'historique garde les images importées une seule fois (sinon chaque étape recopierait des Mo)
        const imgStore = new Map(), imgKey = new Map();
        const snapshot = () => JSON.stringify(doc, (k, v) => { if (k === 'src' && typeof v === 'string' && v.length > 2000) { let id = imgKey.get(v); if (!id) { id = '@img:' + imgKey.size; imgKey.set(v, id); imgStore.set(id, v); } return id; } return v; });
        const unsnap = t => JSON.parse(t, (k, v) => k === 'src' && typeof v === 'string' && v.startsWith('@img:') ? imgStore.get(v) || '' : v);
        const commit = (label = '') => { hist = hist.slice(0, hi + 1); hist.push(snapshot()); if (hist.length > 150) hist.shift(); hi = hist.length - 1; dirty = false; markDirty(); status(label ? `✓ ${label}` : ''); render(); };
        const restore = i => { if (i < 0 || i >= hist.length) return; hi = i; doc = cleanDoc(unsnap(hist[hi])); sel = sel.filter(id => byId(id)); nodeSel = null; dirty = false; markDirty(); render(); };
        // H7 : une suppression faite sans question ; « ↶ Annuler » dans le message en bas à gauche (tant que rien d'autre n'a changé depuis)
        const undoable = message => { const at = hi; A().undoToast?.(message, {undo: () => { if (!dlg.isConnected) throw new Error('le dessin est fermé'); if (hi !== at) throw new Error('d’autres changements ont suivi : utilise ↶ dans la barre de l’outil'); restore(at - 1); }, redo: () => { if (dlg.isConnected && hi === at - 1) restore(at); }}); };
        /* vue */
        const applyView = () => { world.setAttribute('transform', `translate(${n2(panX)} ${n2(panY)}) scale(${zoom})`); sbar?.sync(); drawPages(); drawUi(); drawGrid(); };
        const fit = () => { const r = stage.getBoundingClientRect(); zoom = clamp(Math.min((r.width - 60) / doc.w, (r.height - 60) / doc.h), 0.02, 40); panX = (r.width - doc.w * zoom) / 2; panY = (r.height - doc.h * zoom) / 2; applyView(); };
        const zoomAt = (f, cx, cy) => { const z = clamp(zoom * f, 0.02, 40); panX = cx - (cx - panX) * z / zoom; panY = cy - (cy - panY) * z / zoom; zoom = z; applyView(); };
        const toDoc = e => { const r = svgEl.getBoundingClientRect(); return [(e.clientX - r.left - panX) / zoom, (e.clientY - r.top - panY) / zoom]; };
        const snap = v => doc.snap && doc.grid > 0 ? Math.round(v / doc.grid) * doc.grid : v;
        function drawGrid() {
            const g = $('[data-vx-grid]'), pp = doc.persp?.on && ext.vectorPlus ? ext.vectorPlus.perspPath(doc, doc.persp) : ''; // 📐 la grille de perspective (heritage-vector-plus.js)
            const persp = pp ? `<path d="${pp}" stroke="#e0662a" stroke-opacity=".45" stroke-width="${n2(1 / zoom)}" fill="none" data-vx-persp/>` : '';
            if (!doc.grid || doc.grid * zoom < 4) { g.innerHTML = persp; return; }
            let h = ''; for (let x = doc.grid; x < doc.w; x += doc.grid) h += `M${x} 0V${doc.h}`; for (let y = doc.grid; y < doc.h; y += doc.grid) h += `M0 ${y}H${doc.w}`;
            g.innerHTML = `<path d="${h}" stroke="#4a90e2" stroke-opacity=".18" stroke-width="${n2(1 / zoom)}" fill="none"/>${persp}`;
        }
        /* dessin */
        function drawRef() {
            const g = $('[data-vx-ref]'), r = doc.ref; if (!g) return;
            g.innerHTML = r && r.show !== false && imgOk(r.src) ? `<image href="${esc(r.src)}" x="${n2(r.x)}" y="${n2(r.y)}" width="${n2(r.w)}" height="${n2(r.h)}" preserveAspectRatio="none" opacity="${n2(clamp(num(r.op, .5), .05, 1))}" style="pointer-events:none${r.gray ? ';filter:grayscale(1)' : ''}"/>` : '';
            g.innerHTML += ext.vectorMap?.scaleGridSvg?.(doc) || ''; // la grille d'échelle d'une carte (jamais imprimée)
        }
        /* 📄 pages et volets : contours, plis (traits roses), noms ; l'espace entre les pages est grisé (il ne s'imprime pas) */
        const FOLD_KEY = 'lcnda-vx-folds'; let showFolds = (() => { try { return localStorage.getItem(FOLD_KEY) !== '0'; } catch (_) { return true; } })();
        function drawPages() {
            const g = $('[data-vx-pages]'); if (!g) return; const pg = doc.pages || []; if (!pg.length) { g.innerHTML = ''; return; }
            const sw = n2(1 / zoom), fs = n2(11 / zoom); let h = '';
            // les bandes hors page : tout le plan de travail moins les pages (règle pair-impair)
            h += `<path d="M0 0H${n2(doc.w)}V${n2(doc.h)}H0Z${pg.map(p => `M${n2(p.x)} ${n2(p.y)}H${n2(p.x + p.w)}V${n2(p.y + p.h)}H${n2(p.x)}Z`).join('')}" fill="#d9d9de" fill-opacity=".92" fill-rule="evenodd"/>`;
            if (showFolds) pg.forEach((p, i) => {
                h += `<rect x="${n2(p.x)}" y="${n2(p.y)}" width="${n2(p.w)}" height="${n2(p.h)}" fill="none" stroke="#1473e6" stroke-opacity=".55" stroke-width="${sw}"/>`;
                h += `<text x="${n2(p.x)}" y="${n2(p.y - 5 / zoom)}" font-size="${fs}" font-family="system-ui,sans-serif" font-weight="700" fill="#1473e6">${i + 1}. ${esc(p.name)}</text>`;
                // les noms des volets : sous la page s'il y a la place avant la suivante, sinon en haut, dans la page
                const below = (pg.filter(o2 => o2.y > p.y).map(o2 => o2.y).sort((a, b2) => a - b2)[0] ?? Infinity) - (p.y + p.h) > 34 / zoom;
                (p.panels || []).forEach((q, k) => { if (k) h += `<line x1="${n2(p.x + q.x)}" y1="${n2(p.y - 8 / zoom)}" x2="${n2(p.x + q.x)}" y2="${n2(p.y + p.h + 8 / zoom)}" stroke="#e0219b" stroke-width="${n2(1.4 / zoom)}" stroke-dasharray="${n2(7 / zoom)} ${n2(4 / zoom)}"/>`;
                    if (q.name && p.panels.length > 1) { const tx = p.x + q.x + q.w / 2, ty = below ? p.y + p.h + 13 / zoom : p.y + 14 / zoom;
                        if (!below) h += `<rect x="${n2(tx - q.name.length * 3 / zoom)}" y="${n2(p.y + 3 / zoom)}" width="${n2(q.name.length * 6 / zoom)}" height="${n2(14 / zoom)}" rx="${n2(3 / zoom)}" fill="#fff" fill-opacity=".85"/>`;
                        h += `<text x="${n2(tx)}" y="${n2(ty)}" font-size="${n2(10 / zoom)}" font-family="system-ui,sans-serif" font-style="italic" text-anchor="middle" fill="#7a2a5a">${esc(q.name)}</text>`; } });
            });
            g.innerHTML = h;
        }
        /** la page (ou le volet) où se trouve un point, pour aligner « sur le plan de travail » */
        const pageAt = (x, y) => { for (const p of doc.pages || []) if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) { const q = (p.panels || []).find(q2 => x >= p.x + q2.x && x <= p.x + q2.x + q2.w); return q ? {x: p.x + q.x, y: p.y, w: q.w, h: p.h} : {x: p.x, y: p.y, w: p.w, h: p.h}; } return {x: 0, y: 0, w: doc.w, h: doc.h}; };
        /** les rectangles où s'aimanter : les pages et leurs volets */
        const pageRects = () => (doc.pages || []).flatMap(p => [{x: p.x, y: p.y, w: p.w, h: p.h}, ...(p.panels || []).map(q => ({x: p.x + q.x, y: p.y, w: q.w, h: p.h}))]);
        function render() {
            mapCtx(doc, true); drawRef(); drawPages();
            const mt = $('[data-vx-maptools]'); if (mt) mt.hidden = !doc.map?.on;
            const b = $('[data-vx-board]'); b.setAttribute('width', doc.w); b.setAttribute('height', doc.h); b.setAttribute('fill', doc.bg === 'transparent' ? 'url(#vxchk)' : col(doc.bg, '#fff'));
            const defs = ['<pattern id="vxchk" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#e8e8e8"/><rect x="8" y="8" width="8" height="8" fill="#e8e8e8"/></pattern>'];
            content.innerHTML = treeSvg(defs) + (penPath ? `<path d="${ptsD(penPath.pts, false)}" fill="none" stroke="#1473e6" stroke-width="${n2(1.5 / zoom)}"/>` : '');
            defsEl.innerHTML = defs.join('');
            drawUi(); drawGrid(); paintPanel(); paintFs(); paintCrumbs();
            $('[data-vx-tool="' + tool + '"]')?.classList.add('is-active');
        }
        function paintCrumbs() {
            const c = $('[data-vx-crumbs]'); if (!c) return; c.hidden = !scope.length; if (!scope.length) { c.innerHTML = ''; return; }
            const names = pathName(scope); c.innerHTML = `<button type="button" data-vx-crumb="${scope.length - 1}" title="Sortir d’un niveau (Échap)">⤴</button><button type="button" data-vx-crumb="0">Dessin</button>${names.map((n, i) => `<span>›</span><button type="button" data-vx-crumb="${i + 1}" class="${i === names.length - 1 ? 'is-on' : ''}">${esc(n)}</button>`).join('')}`;
        }
        /* repères commentés : en déplaçant, les bords et centres s'aimantent à ceux des autres objets et du plan de travail (⌘ : sans) */
        const SMART_KEY = 'lcnda-vx-smart'; let smart = (() => { try { return localStorage.getItem(SMART_KEY) !== '0'; } catch (_) { return true; } })();
        if (UI()?.editorStatus) { // K18 : position et dernière action à gauche, aide au milieu, 🧲 et zoom à droite
            sbar = UI().editorStatus({magnetTitle: 'Aimanter : en glissant, les objets se collent aux bords et aux centres des autres (⌘ pour s’en passer)',
                magnet: {get: () => smart, set: v => { smart = !!v; try { localStorage.setItem(SMART_KEY, smart ? '1' : '0'); } catch (_) {} }},
                zoom: {get: () => zoom, set: k => { const r = svgEl.getBoundingClientRect(); zoomAt(k / zoom, r.width / 2, r.height / 2); }, fit: () => fit(), min: 0.02, max: 40}});
            const old = $('[data-vx-foot]'), wh = document.createDocumentFragment(); wh.append(...old.children); sbar.setWhere(wh); old.replaceWith(sbar);
        }
        function smartSnap(b, dx, dy, ids) {
            if (!b) return {dx, dy, g: null}; const th = 6 / zoom, others = snapTargets(ids);
            const best = (mine, targets) => { let d = null, v = null; mine.forEach(m => targets.forEach(t => { const dd = t - m; if (Math.abs(dd) < th && (d === null || Math.abs(dd) < Math.abs(d))) { d = dd; v = t; } })); return [d, v]; };
            const [ddx, vx] = best([b.x + dx, b.x + dx + b.w / 2, b.x + dx + b.w], others.flatMap(r => [r.x, r.x + r.w / 2, r.x + r.w]));
            const [ddy, vy] = best([b.y + dy, b.y + dy + b.h / 2, b.y + dy + b.h], others.flatMap(r => [r.y, r.y + r.h / 2, r.y + r.h]));
            const g = []; const nx = dx + (ddx || 0), ny = dy + (ddy || 0);
            if (vx !== null) { const ys = others.filter(r => [r.x, r.x + r.w / 2, r.x + r.w].some(t => Math.abs(t - vx) < .01)).flatMap(r => [r.y, r.y + r.h]); g.push(['x', vx, Math.min(b.y + ny, ...ys), Math.max(b.y + ny + b.h, ...ys)]); }
            if (vy !== null) { const xs = others.filter(r => [r.y, r.y + r.h / 2, r.y + r.h].some(t => Math.abs(t - vy) < .01)).flatMap(r => [r.x, r.x + r.w]); g.push(['y', vy, Math.min(b.x + nx, ...xs), Math.max(b.x + nx + b.w, ...xs)]); }
            return {dx: nx, dy: ny, g: g.length ? g : null};
        }
        /** ce sur quoi on s'aimante : les autres objets, le plan de travail, les pages et leurs volets */
        const snapTargets = ids => cur().filter(o => !ids.includes(o.id) && !o.hidden).map(rbox).filter(r => r.w || r.h).concat([{x: 0, y: 0, w: doc.w, h: doc.h}], pageRects());
        /** un bord qu'on tire (agrandir, dessiner) : aimanté au bord ou au centre le plus proche → [valeur, repère rose] */
        function snapEdge(v, axis, targets, span) {
            const th = 6 / zoom; let best = null;
            targets.forEach(r => { const vals = axis === 'x' ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h]; vals.forEach(t => { if (Math.abs(t - v) < th && (!best || Math.abs(t - v) < Math.abs(best.t - v))) best = {t, r}; }); });
            if (!best) return [v, null];
            const a = axis === 'x' ? Math.min(span[0], best.r.y) : Math.min(span[0], best.r.x), b = axis === 'x' ? Math.max(span[1], best.r.y + best.r.h) : Math.max(span[1], best.r.x + best.r.w);
            return [best.t, [axis, best.t, a, b]];
        }
        const snapOn = e => smart && !(e.metaKey || e.ctrlKey) && !(doc.snap && doc.grid);
        const guidesSvg = gs => (gs || []).map(([k, v, a, b2]) => k === 'x' ? `<line x1="${n2(v)}" y1="${n2(a)}" x2="${n2(v)}" y2="${n2(b2)}" class="vx-guide" stroke-width="${n2(1 / zoom)}"/>` : `<line x1="${n2(a)}" y1="${n2(v)}" x2="${n2(b2)}" y2="${n2(v)}" class="vx-guide" stroke-width="${n2(1 / zoom)}"/>`).join('');
        const H = () => 9 / zoom;
        function drawUi() {
            let h = '';
            const list = selObjs();
            if (tool === 'direct') {
                list.forEach(o => { const pts = o.type === 'path' || o.type === 'textpath' ? o.pts : null; if (!pts) { const b = rbox(o); h += `<rect x="${n2(b.x)}" y="${n2(b.y)}" width="${n2(b.w)}" height="${n2(b.h)}" class="vx-selbox" stroke-width="${n2(1 / zoom)}"/>`; return; }
                    const tr = rotAttr(o);
                    h += `<g${tr}>`;
                    pts.forEach((p, i) => {
                        const on = nodeSel && nodeSel.id === o.id && nodeSel.i === i;
                        [['i', p.i], ['o', p.o]].forEach(([w, q]) => { if (q && (on || (nodeSel?.id === o.id && Math.abs(nodeSel.i - i) <= 1))) h += `<line x1="${n2(p.x)}" y1="${n2(p.y)}" x2="${n2(q[0])}" y2="${n2(q[1])}" class="vx-hline" stroke-width="${n2(1 / zoom)}"/><circle cx="${n2(q[0])}" cy="${n2(q[1])}" r="${n2(H() / 2)}" class="vx-hand" data-vx-hand="${esc(o.id)}:${i}:${w}"/>`; });
                        h += `<rect x="${n2(p.x - H() / 2)}" y="${n2(p.y - H() / 2)}" width="${n2(H())}" height="${n2(H())}" class="vx-node${on ? ' is-on' : ''}" data-vx-node="${esc(o.id)}:${i}"/>`;
                    });
                    h += '</g>'; });
            } else if (list.length) {
                const one = list.length === 1 ? list[0] : null, b = one ? box(one) : unionBox(list), tr = one ? rotAttr(one) : '';
                h += `<g${tr}><rect x="${n2(b.x)}" y="${n2(b.y)}" width="${n2(b.w)}" height="${n2(b.h)}" class="vx-selbox" stroke-width="${n2(1 / zoom)}"/>`;
                list.filter(o => o.type === 'textpath').forEach(o => { h += `<path d="${esc(guideD(o))}" fill="none" stroke="#1473e6" stroke-opacity=".6" stroke-dasharray="${n2(5 / zoom)} ${n2(3 / zoom)}" stroke-width="${n2(1 / zoom)}"${one ? '' : rotAttr(o)}/>`; }); // le tracé suivi par le texte
                if (!list.some(o => o.locked)) {
                    [['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5]].forEach(([k, fx, fy]) => { h += `<rect x="${n2(b.x + b.w * fx - H() / 2)}" y="${n2(b.y + b.h * fy - H() / 2)}" width="${n2(H())}" height="${n2(H())}" class="vx-handle" data-vx-h="${k}"/>`; });
                    h += `<line x1="${n2(b.x + b.w / 2)}" y1="${n2(b.y)}" x2="${n2(b.x + b.w / 2)}" y2="${n2(b.y - 26 / zoom)}" class="vx-hline" stroke-width="${n2(1 / zoom)}"/><circle cx="${n2(b.x + b.w / 2)}" cy="${n2(b.y - 26 / zoom)}" r="${n2(H() / 1.6)}" class="vx-rot" data-vx-h="rot"/>`;
                }
                h += '</g>';
            }
            if (drag?.guides) drag.guides.forEach(([k, v, a, b2]) => { h += k === 'x' ? `<line x1="${n2(v)}" y1="${n2(a)}" x2="${n2(v)}" y2="${n2(b2)}" class="vx-guide" stroke-width="${n2(1 / zoom)}"/>` : `<line x1="${n2(a)}" y1="${n2(v)}" x2="${n2(b2)}" y2="${n2(v)}" class="vx-guide" stroke-width="${n2(1 / zoom)}"/>`; });
            if (drag?.marquee) { const m = drag.marquee; h += `<rect x="${n2(Math.min(m[0], m[2]))}" y="${n2(Math.min(m[1], m[3]))}" width="${n2(Math.abs(m[2] - m[0]))}" height="${n2(Math.abs(m[3] - m[1]))}" class="vx-marquee" stroke-width="${n2(1 / zoom)}"/>`; }
            if (penPath?.pts.length) { const p0 = penPath.pts[0], last = penPath.pts.at(-1);
                if (penHover && isPen(tool)) { let [hx, hy, sh] = penHover; if (sh) { const a = Math.round(Math.atan2(hy - last.y, hx - last.x) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(hx - last.x, hy - last.y); hx = last.x + Math.cos(a) * L; hy = last.y + Math.sin(a) * L; }
                    const near = penPath.pts.length > 2 && Math.hypot(p0.x - hx, p0.y - hy) < 10 / zoom; if (near) { hx = p0.x; hy = p0.y; }
                    h += `<path d="M${n2(last.x)} ${n2(last.y)}${last.o ? `C${n2(last.o[0])} ${n2(last.o[1])} ${n2(hx)} ${n2(hy)} ${n2(hx)} ${n2(hy)}` : `L${n2(hx)} ${n2(hy)}`}" class="vx-penprev" stroke-width="${n2(1 / zoom)}"/>`;
                    if (near) h += `<circle cx="${n2(p0.x)}" cy="${n2(p0.y)}" r="${n2(H())}" class="vx-penclose"/>`; }
                penPath.pts.forEach((q, i) => { if (q.o && i === penPath.pts.length - 1) h += `<line x1="${n2(q.x)}" y1="${n2(q.y)}" x2="${n2(q.o[0])}" y2="${n2(q.o[1])}" class="vx-hline" stroke-width="${n2(1 / zoom)}"/><circle cx="${n2(q.o[0])}" cy="${n2(q.o[1])}" r="${n2(H() / 2.4)}" class="vx-hand"/>`; h += `<rect x="${n2(q.x - H() / 2.6)}" y="${n2(q.y - H() / 2.6)}" width="${n2(H() / 1.3)}" height="${n2(H() / 1.3)}" class="vx-node"/>`; });
                h += `<circle cx="${n2(p0.x)}" cy="${n2(p0.y)}" r="${n2(H() / 1.4)}" class="vx-penstart"/>`; }
            ui.innerHTML = h;
        }
        function paintFs() {
            const o = selObjs()[0]; const f = o ? o.fill : defaults.fill, s = o ? (num(o.sw) ? o.stroke : 'none') : defaults.stroke;
            const fe = $('[data-vx-fsfill]'), se = $('[data-vx-fsstroke]'); fe.style.background = f === 'none' || !f ? 'repeating-linear-gradient(45deg,#fff 0 4px,#e33 4px 5px)' : col(f, '#000'); se.style.borderColor = s === 'none' || !s ? '#ccc' : col(s, '#000');
        }
        const defaults = {fill: '#f4c430', stroke: '#222222', sw: 2};
        /** les deux carrés de la colonne d'outils : la couleur de la sélection, ou celle des prochaines formes s'il n'y a rien de choisi */
        const fsGet = k => { const o = selObjs()[0]; if (!o) return k === 'fill' ? defaults.fill : defaults.stroke; return k === 'fill' ? o.fill : (num(o.sw) ? o.stroke : 'none'); };
        const fsSet = (k, v, quiet = false) => { const objs = selObjs().filter(o => !o.locked); v = v ? String(v).slice(0, 7) : 'none';
            if (!objs.length) { defaults[k] = v; paintPanel(); paintFs(); return; }
            objs.forEach(o => { if (o.type === 'group') { if (v !== 'none') recolor(o, k, v); } else if (k === 'fill') { o.fill = v; delete o.grad; delete o.pat; } else if (v === 'none') o.sw = 0; else { o.stroke = v; if (!num(o.sw)) o.sw = 2; } });
            if (!quiet) commit(k === 'fill' ? 'Remplissage' : 'Contour'); };
        /** ⤾ (ou ⇧X) : remplissage et contour échangés, en une seule étape de l'historique */
        const fsSwap = () => { const f = fsGet('fill'), st = fsGet('stroke'); fsSet('fill', st === 'none' ? '' : st, true); fsSet('stroke', f === 'none' ? '' : f, true); if (selObjs().some(o => !o.locked)) commit('Remplissage ⇄ contour'); };
        dlg.querySelector('.vx-fs').addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-vx-fsswap]')) { fsSwap(); return; }
            const k = b.matches('[data-vx-fsfill]') ? 'fill' : 'stroke', ui = UI();
            if (!ui?.openColorBox) return toast('Le choix des couleurs n’est pas disponible.', 'error');
            ui.openColorBox(b, {get: () => { const v = fsGet(k); return v === 'none' ? '' : col(v, '#000'); }, set: v => fsSet(k, v), allowNone: true});
        });
        const styleNew = () => ({fill: defaults.fill, stroke: defaults.stroke, sw: defaults.sw});
        /* outils */
        function setTool(t) { if (penPath && (t !== tool || !isPen(t))) finishPen(); if (MP && /^m(line|zone|sym|label|deco)$/.test(t)) MP.choose(t); tool = t; dlg.querySelectorAll('[data-vx-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.vxTool === t)); stage.dataset.tool = t;
            hint({select: 'Clic : choisir (⇧ : en plus) · glisser : déplacer · poignées : agrandir, ⇧ garde les proportions · rond du haut : tourner (⇧ : par 15°)', direct: 'Glisse les points et leurs poignées · ⌥ clic sur un point : angle ↔ courbe · ⌫ : supprimer le point · double-clic sur un tracé : ajouter un point', pen: 'Clic : un point · glisser : une courbe (⌥ : casser la poignée) · ⇧ : angles de 45° · clic sur le 1er point : fermer · ⌫ : retirer le dernier point · Entrée, Échap ou double-clic : terminer · clic sur le bout d’un tracé ouvert choisi : le reprendre', pencil: 'Dessine à main levée : le trait est lissé', text: 'Clic : nouveau texte (écris-le dans « Propriétés »)', eyedrop: 'Clic sur un objet : sa couleur et son trait vont à la sélection', hand: 'Glisser : déplacer la vue (ou barre d’espace, ou la molette)', zoom: 'Clic : zoomer · ⌥ clic : dézoomer · ⌘ molette partout', spiral: 'Glisse depuis le centre : la taille et le départ de la spirale'}[t] || MP?.hint(t) || 'Glisse pour dessiner la forme · ⇧ : carré, cercle, angle droit');
            drawUi(); }
        function finishPen() {
            penHover = null; const zone = penPath?.map && VM()?.ZONES.some(z => z[0] === penPath.map.k);
            if (penPath && penPath.pts.length > (zone ? 2 : 1)) { if (zone) penPath.closed = true; const o = penPath; penPath = null; placeNew(o); commit(o.map ? o.name : 'Tracé à la plume'); } else { penPath = null; render(); }
        }
        /** un nouvel objet : dans le calque où l'on dessine ; en mode Plan (« ranger tout seul »), dans son calque (Routes, Eau, Bâti…) s'il existe */
        function placeNew(o) {
            const key = doc.map?.on && doc.map.auto !== false && MP ? MP.layerOf(o) : null, layer = key && doc.objs.find(l => l.layer && l.mapLayer === key && !l.locked && !l.hidden);
            if (layer && !(scope.length === 1 && scope[0] === layer.id)) { layer.children = layer.children || []; layer.children.push(o); scope = [layer.id]; openGroups.add(layer.id); nodeSel = null; }
            else cur().push(o);
            sel = [o.id];
        }
        /* glisser */
        let drag = null, space = false, penHover = null;
        const hitId = e => e.target.closest?.('[data-vx]')?.dataset.vx;
        svgEl.addEventListener('pointerdown', e => {
            if (document.activeElement?.matches?.('input, textarea, select')) document.activeElement.blur(); stage.focus({preventScroll: true});
            if (e.button === 1 || space || tool === 'hand') { drag = {pan: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY}; svgEl.setPointerCapture(e.pointerId); return; }
            if (e.button !== 0) return;
            { const now = Date.now(), dbl = lastDown && now - lastDown.t < 400 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6; lastDown = dbl ? null : {t: now, x: e.clientX, y: e.clientY}; if (dbl) { lastDblAt = now; handleDouble(e); return; } }
            const [x, y] = toDoc(e); svgEl.setPointerCapture(e.pointerId);
            const h = e.target.closest('[data-vx-h]')?.dataset.vxH;
            if (tool === 'zoom') { const r = svgEl.getBoundingClientRect(); zoomAt(e.altKey ? 1 / 1.5 : 1.5, e.clientX - r.left, e.clientY - r.top); return; }
            const out = (tool === 'select' || tool === 'direct' || tool === 'eyedrop') && !e.target.closest('[data-vx]') ? e.target.closest('[data-vx-out]')?.dataset.vxOut : null;
            if (out) { const f = findAny(out); if (f && enterScope(f.path)) { sel = [out]; render(); if (tool !== 'select') return; drag = {move: true, x, y, orig: selObjs().map(q => clone(q))}; return; } }
            if (tool === 'select') {
                if (h) { const list = selObjs(); const one = list.length === 1 ? list[0] : null; drag = {h, x, y, orig: list.map(o => clone(o)), ids: list.map(o => o.id), b: one ? box(one) : unionBox(list), one}; return; }
                const id = hitId(e), o = id && byId(id);
                if (o && !o.locked) { if (e.shiftKey) sel = sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id]; else if (!sel.includes(id)) sel = [id];
                    let dup = false; if (e.altKey) { const copies = selObjs().map(q => { const c = clone(q); reId(c); return c; }); cur().push(...copies); sel = copies.map(q => q.id); dup = true; }
                    drag = {move: true, dup, x, y, orig: selObjs().map(q => clone(q))}; render(); return; }
                if (!e.shiftKey) sel = []; drag = {marquee: [x, y, x, y], add: e.shiftKey ? sel.slice() : []}; render(); return;
            }
            if (tool === 'direct') {
                const nd = e.target.closest('[data-vx-node]')?.dataset.vxNode, hd = e.target.closest('[data-vx-hand]')?.dataset.vxHand;
                if (nd) { const [id, i] = nd.split(':'); const o = byId(id); nodeSel = {id, i: Number(i)}; if (e.altKey) { const p = o.pts[Number(i)]; if (p.i || p.o) { p.i = null; p.o = null; } else { const a = o.pts[(Number(i) - 1 + o.pts.length) % o.pts.length], b2 = o.pts[(Number(i) + 1) % o.pts.length], t = [(b2.x - a.x) / 6, (b2.y - a.y) / 6]; p.i = [p.x - t[0], p.y - t[1]]; p.o = [p.x + t[0], p.y + t[1]]; } commit('Point : angle ↔ courbe'); return; }
                    drag = {node: true, id, i: Number(i), x, y, orig: clone(o)}; drawUi(); return; }
                if (hd) { const [id, i, w] = hd.split(':'); drag = {hand: true, id, i: Number(i), w, orig: clone(byId(id))}; return; }
                const id = hitId(e), o = id && byId(id);
                if (o && !o.locked) { if (o.type !== 'path' && o.type !== 'textpath') { const conv = o.type === 'svgpath' ? dToPts(o.d) : null; const n = o.type === 'svgpath' ? (conv ? {...o, type: 'path', pts: conv.pts, closed: conv.closed} : null) : toPath(o); if (n && n.type === 'path') { if (n.d) delete n.d; cur()[cur().indexOf(o)] = n; commit('Converti en tracé'); } else if (o.type === 'svgpath') hint('Ce tracé a plusieurs morceaux : Objet → Dissocier n’y peut rien ; utilise la Sélection pour le transformer.'); }
                    sel = [id]; nodeSel = null; render(); return; }
                sel = []; nodeSel = null; render(); return;
            }
            if (tool === 'mref') { if (doc.ref) drag = {ref: true, x, y, rx: doc.ref.x, ry: doc.ref.y}; return; }
            if (tool === 'msym' && MP?.pick().kind === 'building') { drag = {create: 'mbuild', x0: snap(x), y0: snap(y), x, y}; return; }
            if (['msym', 'mlabel', 'mdeco'].includes(tool) && MP) { const o = MP.newObj(tool, snap(x), snap(y)); if (!o) return; placeNew(o); if (tool === 'mlabel') { tab = 'props'; setTool('select'); commit(o.name); setTimeout(() => { const t = pane.querySelector('[data-vx-p="text"]'); t?.focus(); t?.select(); }, 30); return; } commit(o.name); return; }
            if (isPen(tool)) {
                if (penPath && penPath.pts.length > 2) { const p0 = penPath.pts[0]; if (Math.hypot(p0.x - x, p0.y - y) < 10 / zoom) { if (tool !== 'mline') penPath.closed = true; finishPen(); return; } }
                if (!penPath && tool !== 'pen') penPath = MP.newPen(tool);
                if (!penPath) {
                    // reprendre un tracé ouvert déjà choisi, en cliquant sur l'un de ses bouts
                    const o = selObjs()[0], tol = 10 / zoom;
                    if (o && o.type === 'path' && !o.closed && !o.locked && (o.pts || []).length > 1 && !num(o.rot)) { const a = o.pts[0], z = o.pts.at(-1), nearA = Math.hypot(a.x - x, a.y - y) < tol, nearZ = Math.hypot(z.x - x, z.y - y) < tol;
                        if (nearA || nearZ) { if (nearA && !nearZ) o.pts.reverse().forEach(q => { const t = q.i; q.i = q.o; q.o = t; }); penPath = o; setCur(cur().filter(q => q !== o)); sel = []; hint('Tracé repris : continue à cliquer · Entrée ou double-clic : terminer'); render(); return; } }
                    penPath = {id: uid(), type: 'path', name: 'Tracé', pts: [], closed: false, ...styleNew(), fill: 'none'};
                }
                let px = snap(x), py = snap(y); const last = penPath.pts.at(-1);
                if (e.shiftKey && last) { const a = Math.round(Math.atan2(py - last.y, px - last.x) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(px - last.x, py - last.y); px = last.x + Math.cos(a) * L; py = last.y + Math.sin(a) * L; }
                if (last && Math.hypot(px - last.x, py - last.y) < 1.5 / zoom) { drag = {pen: true}; return; } // le 2e clic d'un double-clic n'ajoute pas de point
                penPath.pts.push(P(px, py)); drag = {pen: true}; render(); return;
            }
            if (tool === 'eyedrop') { const o = byId(hitId(e) || ''); if (!o) return; selObjs().forEach(q => { if (q === o) return; ['fill', 'stroke', 'sw', 'dash', 'grad', 'pat', 'op'].forEach(k => { if (o[k] !== undefined) q[k] = clone(o[k]); else delete q[k]; }); }); defaults.fill = o.fill ?? defaults.fill; defaults.stroke = o.stroke ?? defaults.stroke; commit('Couleur prise'); return; }
            if (tool === 'text') { const o = {id: uid(), type: 'text', name: 'Texte', text: 'Texte', x: snap(x), y: snap(y), size: 36, font: 'Georgia', fill: defaults.fill === 'none' ? '#000000' : defaults.fill, sw: 0}; cur().push(o); sel = [o.id]; setTool('select'); tab = 'props'; commit('Texte'); setTimeout(() => { const t = pane.querySelector('[data-vx-p="text"]'); t?.focus(); t?.select(); }, 30); return; }
            if (tool === 'pencil') { drag = {pencil: [[x, y]]}; return; }
            drag = {create: tool, x0: snap(x), y0: snap(y), x, y};
        });
        svgEl.addEventListener('pointermove', e => {
            const [x, y] = toDoc(e); $('[data-vx-pos]').textContent = `x ${Math.round(x)} · y ${Math.round(y)}`;
            if (!drag && isPen(tool) && penPath) { penHover = [x, y, e.shiftKey]; drawUi(); return; }
            if (drag?.ref && doc.ref) { doc.ref.x = drag.rx + x - drag.x; doc.ref.y = drag.ry + y - drag.y; drag.moved = true; drawRef(); return; }
            if (!drag) return;
            if (drag.pan) { panX = drag.px + e.clientX - drag.sx; panY = drag.py + e.clientY - drag.sy; applyView(); return; }
            if (drag.move) { let dx = x - drag.x, dy = y - drag.y; if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } if (doc.snap && doc.grid) { const b = unionBox(drag.orig); dx = snap(b.x + dx) - b.x; dy = snap(b.y + dy) - b.y; }
                drag.guides = null; if (smart && !(e.metaKey || e.ctrlKey) && !(doc.snap && doc.grid)) { const r = smartSnap(unionBox(drag.orig), dx, dy, drag.orig.map(o => o.id)); dx = r.dx; dy = r.dy; drag.guides = r.g; }
                drag.orig.forEach(o0 => { const i = cur().findIndex(o => o.id === o0.id); if (i >= 0) cur()[i] = moveObj(clone(o0), dx, dy); }); drag.moved = true; render(); return; }
            if (drag.marquee) { drag.marquee[2] = x; drag.marquee[3] = y; const m = drag.marquee, x0 = Math.min(m[0], m[2]), x1 = Math.max(m[0], m[2]), y0 = Math.min(m[1], m[3]), y1 = Math.max(m[1], m[3]);
                sel = [...new Set([...drag.add, ...cur().filter(o => !o.locked && !o.hidden).filter(o => { const b = rbox(o); return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0; }).map(o => o.id)])]; drawUi(); return; }
            if (drag.h) { resizeOrRotate(x, y, e); return; }
            if (drag.node || drag.hand) { const o = byId(drag.id); if (!o) return; const [lx, ly] = unrot(o, x, y);
                if (drag.node) { const p = o.pts[drag.i], q = drag.orig.pts[drag.i], dx = snap(lx) - q.x, dy = snap(ly) - q.y; p.x = q.x + dx; p.y = q.y + dy; if (q.i) p.i = [q.i[0] + dx, q.i[1] + dy]; if (q.o) p.o = [q.o[0] + dx, q.o[1] + dy]; }
                else { const p = o.pts[drag.i]; p[drag.w] = [lx, ly]; if (!e.altKey) { const other = drag.w === 'i' ? 'o' : 'i'; if (p[other]) { const len = Math.hypot(p[other][0] - p.x, p[other][1] - p.y), a = Math.atan2(ly - p.y, lx - p.x) + Math.PI; p[other] = [p.x + Math.cos(a) * len, p.y + Math.sin(a) * len]; } } }
                drag.moved = true; render(); return; }
            if (drag.pen) { const p = penPath?.pts.at(-1); if (!p) return; if (Math.hypot(x - p.x, y - p.y) > 2 / zoom) { p.o = [x, y]; if (!e.altKey) p.i = [2 * p.x - x, 2 * p.y - y]; render(); } return; }
            if (drag.pencil) { drag.pencil.push([x, y]); const d = 'M' + drag.pencil.map(p => n2(p[0]) + ' ' + n2(p[1])).join('L'); ui.innerHTML = `<path d="${d}" fill="none" stroke="${col(defaults.stroke, '#222')}" stroke-width="${n2(defaults.sw || 2)}"/>`; return; }
            if (drag.create) { let x1 = snap(x), y1 = snap(y); const t = drag.create;
                if (e.shiftKey) { if (t === 'line' || t === 'dim') { const a = Math.round(Math.atan2(y1 - drag.y0, x1 - drag.x0) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(x1 - drag.x0, y1 - drag.y0); x1 = drag.x0 + Math.cos(a) * L; y1 = drag.y0 + Math.sin(a) * L; } else { const s = Math.max(Math.abs(x1 - drag.x0), Math.abs(y1 - drag.y0)); x1 = drag.x0 + Math.sign(x1 - drag.x0 || 1) * s; y1 = drag.y0 + Math.sign(y1 - drag.y0 || 1) * s; } }
                drag.guides = null;
                if ((t === 'line' || t === 'dim') && !e.shiftKey && !(e.metaKey || e.ctrlKey) && doc.persp?.on && ext.vectorPlus) [x1, y1] = ext.vectorPlus.perspSnap(doc, doc.persp, drag.x0, drag.y0, x1, y1); // 📐 sur la ligne de fuite la plus proche
                if (snapOn(e) && !['line', 'dim', 'spiral', 'mbuild'].includes(t)) { const tg = snapTargets([]), gs = []; let g;
                    [x1, g] = snapEdge(x1, 'x', tg, [Math.min(drag.y0, y1), Math.max(drag.y0, y1)]); if (g) gs.push(g); [y1, g] = snapEdge(y1, 'y', tg, [Math.min(drag.x0, x1), Math.max(drag.x0, x1)]); if (g) gs.push(g); drag.guides = gs.length ? gs : null; }
                drag.x1 = x1; drag.y1 = y1; const o = makeShape(t, drag.x0, drag.y0, x1, y1); const defs = []; ui.innerHTML = (o ? objSvg(o, defs, 'p') : '') + guidesSvg(drag.guides); }
        });
        /** un objet tourné tourne autour du centre de sa boîte : après un changement de taille, on le recale pour que le point (ax, ay) ne bouge pas à l'écran */
        const keepAnchor = (before, after, ax, ay) => { const r = num(after.rot) * Math.PI / 180; if (!r) return; const w = (o, x, y) => { const b = box(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2; return [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]; }; const p0 = w(before, ax, ay), p1 = w(after, ax, ay); moveObj(after, p0[0] - p1[0], p0[1] - p1[1]); };
        const unrot = (o, x, y) => { const r = -num(o.rot) * Math.PI / 180; if (!r) return [x, y]; const b = box(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2; return [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]; };
        function makeShape(t, x0, y0, x1, y1) {
            const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
            if (t === 'mbuild') return MP ? MP.newObj('msym', x0, y0, x1, y1) : null;
            if (t === 'spiral') { const R = Math.hypot(x1 - x0, y1 - y0); if (R < 3) return null; const turns = 3, steps = turns * 8, a0 = Math.atan2(y1 - y0, x1 - x0), dt = (turns * 2 * Math.PI) / steps;
                const pt = k => { const t = k * dt, r = R * k / steps, a = a0 - turns * 2 * Math.PI + t; return [x0 + r * Math.cos(a), y0 + r * Math.sin(a)]; };
                const pts = []; for (let k = 1; k <= steps; k++) { const [px, py] = pt(k), [ax, ay] = pt(k - .01), [bx, by] = pt(Math.min(steps, k + .01)), len = Math.hypot(bx - ax, by - ay) || 1, tl = (R * k / steps) * dt / 3 * Math.max(1, steps / k / 4), tx = (bx - ax) / len * tl, ty = (by - ay) / len * tl; pts.push(P(px, py, [px - tx, py - ty], [px + tx, py + ty])); }
                return {id: uid(), type: 'path', name: 'Spirale', pts, closed: false, fill: 'none', stroke: defaults.stroke === 'none' ? '#222222' : defaults.stroke, sw: defaults.sw || 2}; }
            if (t === 'dim') return ext.vectorPlus?.dimObj(x0, y0, x1, y1, {unit: doc.unit || 'cm', uid, color: defaults.stroke && defaults.stroke !== 'none' && defaults.stroke !== '#000000' ? defaults.stroke : '#c4161c'}) || null; // 📏 cote (heritage-vector-plus.js)
            if (t === 'line') return {id: uid(), type: 'path', name: 'Ligne', pts: [P(x0, y0), P(x1, y1)], closed: false, fill: 'none', stroke: defaults.stroke === 'none' ? '#222222' : defaults.stroke, sw: defaults.sw || 2};
            if (w < 1 || h < 1) return null;
            return {id: uid(), type: t, name: {rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygone', star: 'Étoile'}[t], x, y, w, h, ...styleNew(), ...(t === 'polygon' ? {n: 6} : t === 'star' ? {n: 5, inner: 45} : t === 'rect' ? {r: 0} : {})};
        }
        function resizeOrRotate(x, y, e) {
            const {h, b, orig, ids, one} = drag, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            if (h === 'rot') {
                let a = (Math.atan2(y - cy, x - cx) - Math.atan2(drag.y - cy, drag.x - cx)) * 180 / Math.PI; if (e.shiftKey) a = Math.round(a / 15) * 15;
                const r = a * Math.PI / 180;
                orig.forEach((o0, k) => { const o = clone(o0), ob = box(o0), ocx = ob.x + ob.w / 2, ocy = ob.y + ob.h / 2;
                    if (!one) { const nx = cx + (ocx - cx) * Math.cos(r) - (ocy - cy) * Math.sin(r), ny = cy + (ocx - cx) * Math.sin(r) + (ocy - cy) * Math.cos(r); moveObj(o, nx - ocx, ny - ocy); }
                    o.rot = ((num(o0.rot) + a) % 360 + 360) % 360; const i = cur().findIndex(q => q.id === ids[k]); if (i >= 0) cur()[i] = o; });
                drag.moved = true; render(); return;
            }
            const [lx, ly] = one ? unrot(one, x, y) : [x, y];
            let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
            if (h.includes('w')) x0 = snap(lx); if (h.includes('e')) x1 = snap(lx); if (h.includes('n')) y0 = snap(ly); if (h.includes('s')) y1 = snap(ly);
            drag.guides = null;
            if (snapOn(e) && !(one && num(one.rot))) { // repères aimantés en agrandissant aussi
                const tg = snapTargets(ids), gs = [], sy = [Math.min(y0, y1), Math.max(y0, y1)], sx = [Math.min(x0, x1), Math.max(x0, x1)]; let g;
                if (h.includes('w')) { [x0, g] = snapEdge(x0, 'x', tg, sy); if (g) gs.push(g); } if (h.includes('e')) { [x1, g] = snapEdge(x1, 'x', tg, sy); if (g) gs.push(g); }
                if (h.includes('n')) { [y0, g] = snapEdge(y0, 'y', tg, sx); if (g) gs.push(g); } if (h.includes('s')) { [y1, g] = snapEdge(y1, 'y', tg, sx); if (g) gs.push(g); }
                drag.guides = gs.length ? gs : null; }
            let fx = (x1 - x0) / (b.w || 1), fy = (y1 - y0) / (b.h || 1);
            if (e.shiftKey && h.length === 2) { const f = Math.max(Math.abs(fx), Math.abs(fy)); fx = Math.sign(fx || 1) * f; fy = Math.sign(fy || 1) * f; if (h.includes('w')) x0 = b.x + b.w - b.w * fx; else x1 = b.x + b.w * fx; if (h.includes('n')) y0 = b.y + b.h - b.h * fy; else y1 = b.y + b.h * fy; }
            const ax = h.includes('w') ? b.x + b.w : b.x, ay = h.includes('n') ? b.y + b.h : b.y;
            if (!h.includes('w') && !h.includes('e')) fx = 1; if (!h.includes('n') && !h.includes('s')) fy = 1;
            if (Math.abs(fx) < 0.001 || Math.abs(fy) < 0.001) return;
            const fs = Math.sqrt(Math.abs(fx * fy));
            orig.forEach((o0, k) => { const o = mapObj(clone(o0), (px, py) => [ax + (px - ax) * fx, ay + (py - ay) * fy], fs); if (one) keepAnchor(o0, o, ax, ay); const i = cur().findIndex(q => q.id === ids[k]); if (i >= 0) cur()[i] = o; });
            drag.moved = true; render();
        }
        svgEl.addEventListener('pointerup', e => {
            const d = drag; drag = null; if (!d) return;
            if (d.pan) return;
            if (d.ref) { if (d.moved) commit('Image de référence déplacée'); return; }
            if (d.marquee) { drawUi(); paintPanel(); return; }
            if (d.pen) { render(); return; }
            if (d.move && d.dup && !d.moved) { commit('Dupliqué'); return; }
            if ((d.move || d.h || d.node || d.hand) && d.moved) { commit(d.move ? 'Déplacé' : d.h === 'rot' ? 'Tourné' : d.h ? 'Redimensionné' : 'Point modifié'); return; }
            if (d.pencil) { const pts = d.pencil; if (pts.length < 3) { drawUi(); return; }
                const mask = null; void mask;
                const simp = (() => { const rdp = (p, eps) => { if (p.length < 3) return p; let dm = 0, ix = 0; const [ax, ay] = p[0], [bx, by] = p[p.length - 1], L = Math.hypot(bx - ax, by - ay) || 1; for (let i = 1; i < p.length - 1; i++) { const dd = Math.abs((by - ay) * p[i][0] - (bx - ax) * p[i][1] + bx * ay - by * ax) / L; if (dd > dm) { dm = dd; ix = i; } } return dm > eps ? [...rdp(p.slice(0, ix + 1), eps).slice(0, -1), ...rdp(p.slice(ix), eps)] : [p[0], p[p.length - 1]]; }; return rdp(pts, 1.5 / zoom); })();
                const closed = Math.hypot(simp[0][0] - simp.at(-1)[0], simp[0][1] - simp.at(-1)[1]) < 12 / zoom && simp.length > 3; if (closed) simp.pop();
                const n = simp.length, pp = simp.map((p, i) => { const a = simp[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b2 = simp[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], t = [(b2[0] - a[0]) / 6, (b2[1] - a[1]) / 6]; return P(p[0], p[1], [p[0] - t[0], p[1] - t[1]], [p[0] + t[0], p[1] + t[1]]); });
                const o = {id: uid(), type: 'path', name: 'Crayon', pts: pp, closed, fill: closed ? defaults.fill : 'none', stroke: defaults.stroke === 'none' ? '#222222' : defaults.stroke, sw: defaults.sw || 2}; cur().push(o); sel = [o.id]; commit('Trait au crayon'); return; }
            if (d.create) { const o = d.x1 !== undefined ? makeShape(d.create, d.x0, d.y0, d.x1, d.y1) : null; if (!o) { drawUi(); return; } placeNew(o); commit(o.name); }
        });
        let lastDown = null, lastDblAt = 0;
        svgEl.addEventListener('dblclick', e => { if (Date.now() - lastDblAt < 600) return; handleDouble(e); });
        /** double-clic (détecté à la main : le dessin est refait entre les deux clics, le navigateur n'envoie alors pas « dblclick ») */
        function handleDouble(e) {
            if (isPen(tool)) { if (penPath) finishPen(); return; }
            let id = hitId(e), o = id && byId(id);
            if (!o && tool === 'select') { const [x, y] = toDoc(e); o = selObjs().find(g => (() => { const r = rbox(g); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; })()); id = o?.id; } // le cadre de sélection est par-dessus
            if (!o) { if (scope.length && tool === 'select') { scope = scope.slice(0, -1); sel = []; render(); } return; }
            if (o.type === 'text' || (o.type === 'textpath' && tool !== 'direct')) { sel = [id]; tab = 'props'; render(); setTimeout(() => pane.querySelector('[data-vx-p="text"]')?.focus(), 30); return; } // (après le clic : sinon le plan de travail reprend la main)
            if (tool === 'direct' && (o.type === 'path' || o.type === 'textpath')) { // ajouter un point au plus près
                const [x, y] = unrot(o, ...toDoc(e)); let best = 0, bd = Infinity; o.pts.forEach((p, i) => { const q = o.pts[(i + 1) % o.pts.length]; if (!o.closed && i === o.pts.length - 1) return; const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, dd = Math.hypot(mx - x, my - y); if (dd < bd) { bd = dd; best = i; } });
                o.pts.splice(best + 1, 0, P(x, y)); nodeSel = {id, i: best + 1}; commit('Point ajouté'); return; }
            if (o.type === 'group') { if (enterScope([...scope, o.id])) { openGroups.add(o.id); render(); hint(`Tu es dans « ${o.name || 'le groupe'} » : le reste est pâli. Échap ou ⤴ pour en sortir.`); } }
        }
        try { window.LCNDA_UI?.pinchAsWheel?.(stage, 0.0022); } catch (_) {} // 🤏 téléphone : zoom à deux doigts sur le dessin
        stage.addEventListener('wheel', e => { e.preventDefault(); const r = svgEl.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top); else { panX -= e.deltaX; panY -= e.deltaY; applyView(); } }, {passive: false});
        /* panneau de droite */
        /* couleurs : les émaux et nuances de base, les dernières couleurs libres employées, et 🎨 pour n'importe quelle couleur */
        const RECENT_KEY = 'lcnda-vx-recent-colors';
        const recentColors = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 10) : []; } catch (_) { return []; } };
        const rememberColor = c => { if (!/^#[0-9a-f]{6}$/i.test(c || '')) return; try { localStorage.setItem(RECENT_KEY, JSON.stringify([c.toLowerCase(), ...recentColors().filter(x => x !== c.toLowerCase())].slice(0, 10))); } catch (_) {} };
        const hex6 = (c, d = '#000000') => /^#[0-9a-f]{6}$/i.test(c || '') ? c : d;
        const freeColor = (attr, cur, title = 'Couleur libre : n’importe quelle couleur') => `<label class="vx-swfree" title="${esc(title)}">🎨<input type="color" data-vx-free="${attr}" value="${esc(hex6(cur))}"></label>`;
        const swatchRow = (attr, cur) => { const base = [...SWATCHES, ...TINCTURES.map(t => t[2])].filter((c, i, a) => a.indexOf(c) === i), rec = recentColors().filter(c => !base.includes(c));
            const btn = c => `<button type="button" ${attr}="${c}" title="${esc(TINCTURES.find(t => t[2] === c)?.[1] || c)}" class="${c === cur ? 'is-on' : ''}" style="${c === 'none' ? 'background:repeating-linear-gradient(45deg,#fff 0 4px,#e33 4px 5px)' : `background:${c}`}"></button>`;
            return `<div class="vx-sw">${base.map(btn).join('')}${freeColor(attr, cur)}</div>${rec.length ? `<div class="vx-sw vx-recent"><small>Récentes</small>${rec.map(btn).join('')}</div>` : ''}`; };
        const fld = (k, label, v, {type = 'number', step = 1, min = '', max = '', unit = ''} = {}) => `<label>${esc(label)}<input data-vx-p="${k}" type="${type}" step="${step}" ${min !== '' ? `min="${min}"` : ''} ${max !== '' ? `max="${max}"` : ''}${unit ? ` data-unit="${esc(unit)}"` : ''} value="${esc(v ?? '')}"></label>`; // K17 : unit = l'unité dans la case
        /* ─── panneau Calques : l'arbre des calques et groupes (le haut de la liste = le dessus du dessin) ─── */
        const openGroups = new Set();
        const LIC = {group: '🗂', text: 'T', image: '🖼', path: '✒', svgpath: '✒', rect: '▭', ellipse: '◯', polygon: '⬡', star: '☆'};
        const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
        function layersPane() {
            const rows = [];
            const walk = (arr, path) => [...arr].reverse().forEach(o => {
                const g = isLayerGroup(o), here = samePath(path, scope), active = g && samePath([...path, o.id], scope), inside = g && scope.length > path.length && scope[path.length] === o.id && samePath(scope.slice(0, path.length), path);
                const open = g && (openGroups.has(o.id) || inside);
                rows.push(`<div class="vx-layer${sel.includes(o.id) && here ? ' is-sel' : ''}${active ? ' is-active' : ''}${here ? '' : ' is-out'}${o.layer ? ' is-layer' : ''}" data-vx-layer="${esc(o.id)}" draggable="true" style="--d:${path.length}">`
                    + (g ? `<button type="button" class="vx-ltw" data-vx-ltoggle title="Déplier / replier">${open ? '▾' : '▸'}</button>` : '<span class="vx-ltw"></span>')
                    + `<span class="vx-lic">${o.layer ? '📄' : LIC[o.type] || '•'}</span><input data-vx-lname readonly title="Double-clic pour renommer" value="${esc(o.name || '')}" placeholder="${esc(o.type)}">`
                    + (g ? `<button type="button" data-vx-lenter title="${active ? 'Sortir de ce ' + (o.layer ? 'calque' : 'groupe') : 'Travailler dans ce ' + (o.layer ? 'calque' : 'groupe') + ' : les nouveaux dessins y vont'}" class="vx-lenter${active ? ' is-on' : ''}">${active ? '●' : '○'}</button>` : '')
                    + (g ? `<button type="button" data-vx-lclip class="vx-lclip${o.clip ? ' is-on' : ''}" title="${o.clip ? 'Retirer le masque : la forme revient tout en haut, rien n’est perdu' : `Masquer avec la forme du dessus : la forme la plus haute de ce ${o.layer ? 'calque' : 'groupe'} le découpe (on ne voit que ce qui est dedans)`}">✂️</button>` : '')
                    + `<button type="button" data-vx-lvis title="Montrer / cacher">${o.hidden ? '🙈' : '👁'}</button><button type="button" data-vx-llock title="Verrouiller">${o.locked ? '🔒' : '🔓'}</button><button type="button" data-vx-lup title="Vers le haut">↑</button><button type="button" data-vx-ldown title="Vers le bas">↓</button><button type="button" data-vx-ldel title="Supprimer">🗑</button></div>`);
                if (open) walk(o.children || [], [...path, o.id]);
            });
            walk(doc.objs, []);
            const where = scope.length ? pathName(scope).map(esc).join(' › ') : 'le dessin (hors calque)';
            return `<div class="vx-ltools"><button type="button" class="button small" data-vx-lnew title="Un calque vide, au-dessus des autres : tu dessines dedans">＋ Calque</button><button type="button" class="button small secondary" data-vx-lgroup title="${sel.length ? 'Range la sélection dans un groupe' : 'Un groupe vide dans le calque actuel'}">🗂 ${sel.length ? 'Grouper la sélection' : 'Groupe'}</button>${(() => { const gs = []; const w = (arr, d) => arr.forEach(o => { if (isLayerGroup(o)) { if (!sel.includes(o.id)) gs.push([o.id, '\u2003'.repeat(d) + (o.layer ? '📄 ' : '🗂 ') + (o.name || (o.layer ? 'Calque' : 'Groupe'))]); w(o.children || [], d + 1); } }); w(doc.objs, 0);
                    return sel.length && gs.length ? `<select class="vx-lmoveto" data-vx-lmoveto title="Ranger la sélection dans un groupe ou un calque, sans glisser"><option value="">📁 Ranger dans…</option>${gs.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select>` : ''; })()}${scope.length ? '<button type="button" class="button small secondary" data-vx-lexit title="Revenir au niveau du dessus (Échap)">⤴ Sortir</button>' : ''}</div>
                <p class="vx-lwhere">Tu dessines dans : <strong>${where}</strong></p>
                <div class="vx-layers" data-vx-ltree data-dnd-off data-ord-off>${rows.join('') || A().emptyState({icon: '🗂️', text: 'Aucun calque pour l’instant', hint: 'Dessine avec les outils de gauche, ou Fichier → Importer.', action: {label: '＋ Calque', attrs: 'data-vx-lnew'}})}</div>
                <p class="muted vx-lhelp">Glisse une ligne sur un groupe pour l’y ranger (il devient bleu), entre deux lignes pour changer l’ordre ; ou sélectionne puis « 📁 Ranger dans… ». Double-clic sur un nom pour le renommer. ✂️ : la forme la plus haute du groupe ou du calque le découpe (masque), 2e clic pour le retirer. ○ : travailler dans ce calque ou ce groupe. Dans le dessin : double-clic sur un groupe pour y entrer, Échap pour en sortir.</p>`;
        }
        /** déplacer un objet (n'importe où) avant / après une ligne, ou dans un groupe */
        function moveInTree(id, targetId, where) {
            if (id === targetId) return false;
            const src = findAny(id), dst = findAny(targetId); if (!src || !dst) return false;
            if (dst.path.includes(id) || (where === 'into' && targetId === id)) return false; // pas dans lui-même
            if (where === 'into' && !isLayerGroup(dst.o)) return false;
            src.arr.splice(src.arr.indexOf(src.o), 1);
            if (where === 'into') { dst.o.children = dst.o.children || []; dst.o.children.push(src.o); openGroups.add(dst.o.id); }
            else { const i = dst.arr.indexOf(dst.o); dst.arr.splice(where === 'above' ? i + 1 : i, 0, src.o); } // au-dessus dans la liste = après dans le tableau
            if (!findAny(id) || !samePath(findAny(id).path, scope)) sel = sel.filter(s => s !== id);
            return true;
        }
        function newLayer() {
            const n = doc.objs.filter(o => o.layer).length + 1, g = {id: uid(), type: 'group', layer: true, name: `Calque ${n}`, children: []};
            doc.objs.push(g); enterScope([g.id]); openGroups.add(g.id); return g;
        }
        /** les modes Blason et Carte : cochés en haut, sinon leurs onglets et menus sont cachés */
        const blasonOn = () => doc.blasonOn ?? (doc.kind === 'blason' || /"name":"Blason"/.test(JSON.stringify(doc.objs || []).slice(0, 200000)));
        function paintModes() {
            const b = blasonOn(), m = !!doc.map?.on; if ((tab === 'blason' && !b) || (tab === 'map' && !m)) tab = 'props';
            dlg.querySelectorAll('[data-vx-tab="blason"]').forEach(x => { x.hidden = !b; }); dlg.querySelectorAll('[data-vx-tab="map"]').forEach(x => { x.hidden = !m; });
            const mb = dlg.querySelector('[data-vx-mode="blason"]'), mm = dlg.querySelector('[data-vx-mode="map"]'); if (mb) mb.checked = b; if (mm) mm.checked = m;
            dlg.querySelectorAll('.vx-menus details').forEach(d => { const t = d.querySelector('summary')?.textContent.trim(); if (t === 'Blason') d.hidden = !b; if (t === 'Plan') d.hidden = !m; });
        }
        /* E2 : les sections repliables du panneau de droite (ouvertes / fermées retenues) */
        const SEC = o2 => UI()?.panelSection ? UI().panelSection(o2) : `<h4>${esc(o2.title)}</h4>${o2.body}`;
        /** recolorer un groupe (ornement, blason…) : les formes pleines prennent la couleur, les traits seuls aussi */
        function recolor(g, what, c) { (g.children || []).forEach(ch => { if (ch.type === 'group') { recolor(ch, what, c); return; } if (ch.type === 'image') return;
            if (what === 'stroke') { if (num(ch.sw)) ch.stroke = c; return; }
            if (ch.fill && ch.fill !== 'none') { ch.fill = c; delete ch.grad; delete ch.pat; } else if (num(ch.sw) && ch.stroke && ch.stroke !== 'none') ch.stroke = c; }); }
        /* ⇤ aligner et répartir en un clic : par rapport à la sélection ou au plan de travail (la page ou le volet, s'il y en a) */
        const ALTO_KEY = 'lcnda-vx-alignto'; let alignTo = (() => { try { return localStorage.getItem(ALTO_KEY) === 'art' ? 'art' : 'sel'; } catch (_) { return 'sel'; } })();
        const AL_ICONS = {al_l: '<path d="M2.5 1v16" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="4" width="11" height="3.5" fill="currentColor"/><rect x="4" y="10.5" width="7" height="3.5" fill="currentColor"/>',
            al_c: '<path d="M9 1v16" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="4" width="12" height="3.5" fill="currentColor"/><rect x="5" y="10.5" width="8" height="3.5" fill="currentColor"/>',
            al_r: '<path d="M15.5 1v16" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="4" width="11" height="3.5" fill="currentColor"/><rect x="7" y="10.5" width="7" height="3.5" fill="currentColor"/>',
            al_t: '<path d="M1 2.5h16" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="4" width="3.5" height="11" fill="currentColor"/><rect x="10.5" y="4" width="3.5" height="7" fill="currentColor"/>',
            al_m: '<path d="M1 9h16" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="3" width="3.5" height="12" fill="currentColor"/><rect x="10.5" y="5" width="3.5" height="8" fill="currentColor"/>',
            al_b: '<path d="M1 15.5h16" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="3" width="3.5" height="11" fill="currentColor"/><rect x="10.5" y="7" width="3.5" height="7" fill="currentColor"/>',
            di_h: '<rect x="1.5" y="4" width="3" height="10" fill="currentColor"/><rect x="7.5" y="4" width="3" height="10" fill="currentColor"/><rect x="13.5" y="4" width="3" height="10" fill="currentColor"/><path d="M1 1.5h16M1 16.5h16" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>',
            di_v: '<rect x="4" y="1.5" width="10" height="3" fill="currentColor"/><rect x="4" y="7.5" width="10" height="3" fill="currentColor"/><rect x="4" y="13.5" width="10" height="3" fill="currentColor"/><path d="M1.5 1v16M16.5 1v16" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>'};
        const AL_NAMES = {al_l: 'Aligner à gauche', al_c: 'Centrer (horizontalement)', al_r: 'Aligner à droite', al_t: 'Aligner en haut', al_m: 'Centrer (verticalement)', al_b: 'Aligner en bas', di_h: 'Répartir horizontalement (même écart)', di_v: 'Répartir verticalement (même écart)'};
        const alignBar = n => `<div class="vx-albar" role="group" aria-label="Aligner et répartir">${Object.keys(AL_ICONS).map(k => `<button type="button" data-vx-cmd="${k}" title="${AL_NAMES[k]}${k.startsWith('di') ? ' — au moins 3 objets' : ''}" aria-label="${AL_NAMES[k]}"><svg viewBox="0 0 18 18" aria-hidden="true">${AL_ICONS[k]}</svg></button>`).join('')}
            <span class="vx-alto" role="group" aria-label="Par rapport à"><button type="button" data-vx-alto="sel" class="${alignTo === 'sel' && n > 1 ? 'is-active' : ''}" title="Les objets s’alignent entre eux" ${n > 1 ? '' : 'disabled'}>Sélection</button><button type="button" data-vx-alto="art" class="${alignTo === 'art' || n < 2 ? 'is-active' : ''}" title="Les objets s’alignent sur le plan de travail (ou la page, le volet où ils sont)">Plan de travail</button></span><span data-help="Un objet seul s’aligne sur le plan de travail (ou sur la page, le volet où il se trouve). Plusieurs : entre eux, ou sur le plan si « Plan de travail » est choisi. En déplaçant ou en agrandissant, des repères roses aimantent aux bords et aux centres des autres objets (⌘ ou Ctrl pour s’en passer)." data-help-faq="aligner"></span></div>`;
        /* l'onglet Document : plan de travail, pages et volets, grille et repères, réglages enregistrés */
        const FOLDN = {duplex: 'Recto-verso', fold2: 'Carte pliée en 2', fold3: 'Carte pliée en 3 volets', fold4: 'Carte pliée en 4 volets (accordéon)', single: 'Carte simple'};
        const cmTxt = px => (Math.round(px * 2.54 / 96 * 10) / 10).toString().replace('.', ',');
        function docPane() {
            const board = `${fld('dw', 'Largeur', doc.w, {min: 10, max: 20000, unit: 'px'})}${fld('dh', 'Hauteur', doc.h, {min: 10, max: 20000, unit: 'px'})}<p class="muted vx-mhelp">${cmTxt(doc.w)} × ${cmTxt(doc.h)} cm à l’impression (96 points par pouce).</p><div class="vx-row"><button type="button" class="button small secondary" data-vx-cmd="docformat">📐 Format du document…</button><button type="button" class="button small secondary" data-vx-cmd="docinfo">ℹ️ Informations…</button></div>
                <div class="vx-row">${[['A4 portrait', 794, 1123], ['A4 paysage', 1123, 794], ['Carré', 1000, 1000], ['Écu (5 × 6)', 500, 600], ['16:9', 1280, 720]].map(([l, w, h]) => `<button type="button" class="button small secondary" data-vx-size="${w}x${h}">${l}</button>`).join('')}</div>
                <label>Fond<select data-vx-p="dbg"><option value="#ffffff" ${doc.bg !== 'transparent' ? 'selected' : ''}>Couleur</option><option value="transparent" ${doc.bg === 'transparent' ? 'selected' : ''}>Transparent</option></select></label>${doc.bg !== 'transparent' ? `<label>Couleur du fond<input type="color" data-vx-p="dbgc" value="${esc(/^#[0-9a-f]{6}$/i.test(doc.bg) ? doc.bg : '#ffffff')}"></label>` : ''}`;
            const pg = doc.pages || [];
            const pages = pg.length ? `<p><b>${esc(FOLDN[doc.fold?.mode] || 'Plusieurs pages')}</b> · ${esc(A().plural(pg.length, 'page'))}</p><ol class="vx-pagelist">${pg.map(p => `<li><span>${esc(p.name)}${(p.panels || []).length > 1 ? ` · ${p.panels.length} volets` : ''}</span><small>${cmTxt(p.w)} × ${cmTxt(p.h)} cm</small></li>`).join('')}</ol>
                <label class="ui-toggle"><input type="checkbox" data-vx-p="dfolds" ${showFolds ? 'checked' : ''}><i></i><span data-help="Les traits roses en tirets sont les plis ; ni eux ni les noms des pages ne s’impriment. Ce qui dépasse d’une page (dans la bande grise) est coupé.">Montrer les plis et les noms des pages</span></label>
                <p class="muted vx-mhelp">Chaque page s’imprime sur sa propre feuille : ⤓ Exporter → PDF (une page par face) ou Imprimer. « 🗞 Recto-verso sur A4 » place les faces sur des feuilles A4, avec les traits de coupe et de pli.</p>` : '';
            const grid = `${fld('dgrid', 'Pas de la grille (0 = aucune)', doc.grid, {min: 0, max: 500})}<label class="ui-toggle"><input type="checkbox" data-vx-p="dsnap" ${doc.snap ? 'checked' : ''}><i></i>Aimanter à la grille</label>
                <label class="ui-toggle"><input type="checkbox" data-vx-p="dsmart" ${smart ? 'checked' : ''}><i></i><span data-help="En déplaçant, en agrandissant ou en dessinant, l’objet s’aimante aux bords et aux centres des autres objets, du plan de travail et des pages ; un trait rose le montre. ⌘ (ou Ctrl) maintenu : sans aimant.">🧲 Aimanter aux autres objets (traits roses)</span></label>`;
            const keys = '<p class="muted vx-keys">V sélection · A sélection directe · P plume · N crayon · M rectangle · L ellipse · Y polygone · S étoile · \\ ligne · T texte · I pipette · H main · Z loupe · ⇧X remplissage ⇄ contour · Espace : main · ⌘Z/⇧⌘Z · ⌘C/⌘V/⌘D · ⌘G/⇧⌘G · flèches : 1 px (⇧ : 10 px) · ⌘0 tout voir</p>';
            return `<div class="vx-form">${SEC({title: 'Plan de travail', key: 'vx-doc-board', open: true, body: board})}${pages ? SEC({title: 'Pages et volets', key: 'vx-doc-pages', open: true, body: pages}) : ''}${SEC({title: 'Grille et repères', key: 'vx-doc-grid', open: true, body: grid})}${SEC({title: '💾 Réglages enregistrés', key: 'vx-doc-presets', open: false, body: '<p class="muted vx-mhelp">La taille, le fond, la grille et les couleurs par défaut, gardés sous un nom.</p><div data-vx-presets-slot></div>'})}${SEC({title: 'Raccourcis', key: 'vx-doc-keys', open: false, body: keys})}</div>`;
        }
        function mountPresets() {
            const slot = pane.querySelector('[data-vx-presets-slot]'); if (!slot) return;
            slot.appendChild(presetBox({tool: 'dessin', label: 'les réglages du document', toolName: 'le dessin vectoriel',
                get: () => ({w: doc.w, h: doc.h, bg: doc.bg, grid: doc.grid, snap: doc.snap, fill: defaults.fill, stroke: defaults.stroke, sw: defaults.sw, smart}),
                set: d => { doc.w = clamp(num(d.w, doc.w), 10, 20000); doc.h = clamp(num(d.h, doc.h), 10, 20000); doc.bg = d.bg === 'transparent' ? 'transparent' : col(d.bg, doc.bg); doc.grid = clamp(num(d.grid), 0, 500); doc.snap = !!d.snap;
                    defaults.fill = col(d.fill, defaults.fill); defaults.stroke = col(d.stroke, defaults.stroke); defaults.sw = clamp(num(d.sw, defaults.sw), 0, 200); if (typeof d.smart === 'boolean') smart = d.smart; commit('Réglages appliqués'); fit(); }}));
        }
        /* ❦ l'onglet Ornements : recherche, catégories, vignettes ; clic = au centre, glisser = où on lâche */
        const ORNC_KEY = 'lcnda-vx-orncol'; let ornQ = '', ornCat = '';
        const ornColor = () => { try { const c = localStorage.getItem(ORNC_KEY); return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8a6a2a'; } catch (_) { return '#8a6a2a'; } };
        const fold2 = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const ornThumb = it => { const pad = Math.max(it.w, it.h) * .06; return `<svg viewBox="${n2(-pad)} ${n2(-pad)} ${n2(it.w + 2 * pad)} ${n2(it.h + 2 * pad)}" aria-hidden="true">${it.parts.map(p => `<path d="${esc(p.d)}" fill="${p.f ? 'currentColor' : 'none'}" stroke="${p.s ? 'currentColor' : 'none'}" stroke-width="${n2(p.s || 0)}" stroke-linecap="round" stroke-linejoin="round"${p.eo ? ' fill-rule="evenodd"' : ''}${p.op ? ` opacity="${p.op}"` : ''}/>`).join('')}${it.letter ? `<text x="${n2(it.letter.x)}" y="${n2(it.letter.y)}" font-size="${n2(it.letter.size)}" font-family="${esc(it.letter.font || 'Georgia, serif')}" text-anchor="middle" fill="currentColor">A</text>` : ''}</svg>`; };
        function ornLists() { const L = ext.vectorOrnaments, q = fold2(ornQ).trim(); const found = (L?.items || []).filter(it => !q || fold2(`${it.n} ${it.tags || ''} ${(L.CATS.find(c => c[0] === it.cat) || [])[1] || ''}`).includes(q));
            return {L, found, shown: found.filter(it => !ornCat || it.cat === ornCat)}; }
        const ornCatsHtml = () => { const {L, found} = ornLists(); return [['', 'Tout'], ...(L?.CATS || [])].map(([k, l]) => `<button type="button" data-vx-orncat="${k}" class="${ornCat === k ? 'is-active' : ''}">${esc(l)} (${k ? found.filter(it => it.cat === k).length : found.length})</button>`).join(''); };
        const ornGridHtml = () => { const {shown} = ornLists(); return shown.map(it => `<button type="button" draggable="true" data-vx-orn="${esc(it.k)}" title="${esc(it.n)} — clic : au centre ; glisser : où tu veux">${ornThumb(it)}<span>${esc(it.n)}</span></button>`).join('') || `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧱</span><span class="empty-line-text">Aucun ornement pour « ${esc(ornQ)} ».</span></p>`; };
        function ornPane() {
            if (!ext.vectorOrnaments) return '<p class="muted">La bibliothèque d’ornements n’est pas chargée.</p>';
            return `<div class="vx-form vx-orn"><p class="muted vx-mhelp">Fleurons, cadres Belle Époque, Art nouveau, Art déco, coins, filets, culs-de-lampe, lettrines. Clique pour poser au centre, ou glisse sur le dessin ; la palette « Couleur » les recolore ensuite.</p>
                <div class="vx-orn-top"><input type="search" data-vx-ornq value="${esc(ornQ)}" placeholder="Chercher… (fleuron, coin, déco)" aria-label="Chercher un ornement"><label class="checkbox-line">Couleur <input type="color" data-vx-orncol value="${esc(ornColor())}"></label></div>
                <div class="ui-filters vx-orn-cats" data-vx-orncats>${ornCatsHtml()}</div><div class="vx-orn-grid" data-vx-orngrid>${ornGridHtml()}</div></div>`;
        }
        /** un tracé du modèle (boîte w × h) mis à l'échelle s et posé en (ox, oy) */
        const placeD = (d, s, ox, oy) => K() ? K().pathStr(K().absPath(d).map(([c, ...a]) => { const r = [c]; for (let j = 0; j < a.length; j += 2) r.push(ox + a[j] * s, oy + a[j + 1] * s); return r; })) : '';
        async function insertOrnament(k, at = null) {
            const it = ext.vectorOrnaments?.items.find(x => x.k === k); if (!it || !K()) return;
            const center = at || [doc.w / 2, doc.h / 2], R = pageAt(center[0], center[1]), c = ornColor();
            const s = it.cat === 'cadres' ? Math.min(R.w * .92 / it.w, R.h * .92 / it.h) : it.cat === 'filets' ? R.w * .6 / it.w : it.cat === 'coins' ? Math.min(R.w, R.h) * .22 / Math.max(it.w, it.h) : it.cat === 'lettrines' ? Math.min(R.w, R.h) * .3 / Math.max(it.w, it.h) : Math.min(R.w, R.h) * .26 / Math.max(it.w, it.h);
            const cx = it.cat === 'cadres' && !at ? R.x + R.w / 2 : center[0], cy = it.cat === 'cadres' && !at ? R.y + R.h / 2 : center[1], ox = cx - it.w * s / 2, oy = cy - it.h * s / 2;
            const kids = it.parts.map(p => ({id: uid(), type: 'svgpath', name: it.n, d: placeD(p.d, s, ox, oy), fill: p.f ? c : 'none', stroke: p.s ? c : 'none', sw: p.s ? n2(p.s * s) : 0, cap: 'round', join: 'round', ...(p.eo ? {evenodd: true} : {}), ...(p.op ? {op: p.op} : {})})).filter(o => o.d);
            if (it.letter) { const l = await A().askText({title: 'La lettrine', message: 'Quelle lettre mettre dans le cadre ?', value: 'A', okLabel: 'Poser'}); if (l === null) return;
                const ch = [...String(l).trim()][0]?.toLocaleUpperCase('fr-FR') || 'A'; kids.push({id: uid(), type: 'text', name: `Lettre ${ch}`, text: ch, x: n2(ox + it.letter.x * s), y: n2(oy + it.letter.y * s), size: n2(it.letter.size * s), font: font(it.letter.font || 'Georgia'), align: 'middle', fill: c, sw: 0}); }
            const g = {id: uid(), type: 'group', name: it.n, children: kids}; cur().push(g); sel = [g.id]; if (tool !== 'select') setTool('select'); commit(`Ornement : ${it.n}`);
        }
        /* 🖨 hachures héraldiques : chaque émail devient son motif noir et blanc (Pietra Santa) ; « Remettre en couleur » les retire */
        function hatchHeraldic(on) {
            const roots = sel.length ? selObjs() : doc.objs, s = clamp(Math.min(doc.w, doc.h) / 60, 3, 40); let n = 0;
            const walk = arr => arr.forEach(o => { if (o.type === 'group') { walk(o.children || []); return; } if (['image', 'text', 'textpath'].includes(o.type) || o.locked) return;
                if (on) { const t = tinctureName(o.fill); if (!t || !HATCH[t] || o.pat) return; o.pat = {kind: HATCH[t][0], color: '#111111', bg: '#ffffff', size: n2(s), width: n2(Math.max(.5, s / 7)), hatch: 1};
                    if (!num(o.sw) || o.stroke === 'none') { o.pat.prevSw = num(o.sw); o.pat.prevStroke = o.stroke ?? 'none'; o.sw = n2(Math.max(.6, s / 6)); o.stroke = '#111111'; } n++; } // un meuble hachuré garde un contour, sinon il se perd
                else if (o.pat?.hatch) { if (o.pat.prevStroke !== undefined) { o.sw = o.pat.prevSw; o.stroke = o.pat.prevStroke; } delete o.pat; n++; } });
            walk(roots);
            if (!n) return toast(on ? 'Aucun émail à hachurer ici (or, argent, gueules, azur, sinople, sable, pourpre).' : 'Rien à remettre en couleur.', 'error');
            commit(on ? 'Hachures héraldiques' : 'Émaux en couleur'); toast(on ? `${A().plural(n, 'forme')} en hachures : prêt pour une impression en noir et blanc.` : 'Les émaux sont revenus en couleur.');
        }
        function addHatchLegend() {
            const s = clamp(Math.min(doc.w, doc.h) / 60, 3, 40), sz = s * 3.2, fs = s * 1.7, x0 = s * 2, rows = Object.entries(HATCH), y0 = doc.h - rows.length * (sz + s) - s * 2, kids = [];
            rows.forEach(([t, [k, l]], i) => { const y = y0 + i * (sz + s); kids.push({id: uid(), type: 'rect', name: l, x: x0, y, w: sz * 1.4, h: sz, r: 0, fill: tHex(t), pat: {kind: k, color: '#111111', bg: '#ffffff', size: n2(s), width: n2(Math.max(.5, s / 7)), hatch: 1}, stroke: '#111111', sw: n2(s / 6)}, {id: uid(), type: 'text', name: l, text: l.split(' :')[0], x: x0 + sz * 1.4 + s, y: y + sz * .72, size: n2(fs), font: 'Georgia', fill: '#111111', sw: 0}); });
            const g = {id: uid(), type: 'group', name: 'Légende des hachures', children: kids}; cur().push(g); sel = [g.id]; commit('Légende des hachures');
        }
        /* ➰ texte sur une courbe : sur le tracé choisi, ou une forme toute faite (cercle, arc, vague…) et deux modèles */
        function textPathFrom(o, text = 'Texte sur la courbe') {
            let pts = null, closed = false, start = 50; const b = box(o);
            if (o.type === 'ellipse') { pts = ringPts(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2); closed = true; start = 25; }
            else if (o.type === 'path') { pts = clone(o.pts || []); closed = !!o.closed; }
            else if (['rect', 'polygon', 'star'].includes(o.type)) { pts = toPath(o).pts; closed = true; start = 0; }
            else if (o.type === 'svgpath') { const c = dToPts(o.d); if (c) { pts = c.pts; closed = c.closed; } }
            if (!pts || pts.length < 2) return null;
            return {id: uid(), type: 'textpath', name: text.slice(0, 30), text, pts, closed, start, align: closed && start === 0 ? 'start' : 'middle', side: 'top', offset: 0, size: n2(clamp(Math.min(b.w, b.h) / 9, 10, 400)), font: 'Georgia', fill: o.stroke && o.stroke !== 'none' && num(o.sw) ? o.stroke : '#222222', sw: 0, ...(num(o.rot) ? {rot: o.rot} : {})};
        }
        function ribbon(cx, cy, W, t, A2, colors) { // 🎗 un ruban : la bande arquée et deux bouts fourchus (dessous)
            const x0 = cx - W / 2, x1 = cx + W / 2, top = cy - t / 2, bot = cy + t / 2;
            const band = `M${n2(x0)} ${n2(top)}C${n2(x0 + W / 3)} ${n2(top - A2)} ${n2(x1 - W / 3)} ${n2(top - A2)} ${n2(x1)} ${n2(top)}L${n2(x1)} ${n2(bot)}C${n2(x1 - W / 3)} ${n2(bot - A2)} ${n2(x0 + W / 3)} ${n2(bot - A2)} ${n2(x0)} ${n2(bot)}Z`;
            const d2 = t * .45, tail = sd => { const e = sd < 0 ? x0 : x1, k = sd; return `M${n2(e - k * t * .5)} ${n2(top + d2)}L${n2(e + k * t * 1.2)} ${n2(top + d2)}L${n2(e + k * t * .8)} ${n2(cy + d2)}L${n2(e + k * t * 1.2)} ${n2(bot + d2)}L${n2(e - k * t * .5)} ${n2(bot + d2)}Z`; };
            const fold = sd => { const e = sd < 0 ? x0 : x1; return `M${n2(e)} ${n2(bot)}L${n2(e - sd * t * .5)} ${n2(bot + d2)}L${n2(e - sd * t * .5)} ${n2(bot)}Z`; };
            return [{id: uid(), type: 'svgpath', name: 'Bout gauche', d: tail(-1), fill: colors[1], stroke: colors[2], sw: n2(t / 30), join: 'round'}, {id: uid(), type: 'svgpath', name: 'Bout droit', d: tail(1), fill: colors[1], stroke: colors[2], sw: n2(t / 30), join: 'round'},
                {id: uid(), type: 'svgpath', name: 'Repli gauche', d: fold(-1), fill: colors[2], sw: 0}, {id: uid(), type: 'svgpath', name: 'Repli droit', d: fold(1), fill: colors[2], sw: 0},
                {id: uid(), type: 'svgpath', name: 'Ruban', d: band, fill: colors[0], stroke: colors[2], sw: n2(t / 30), join: 'round'}];
        }
        function textPathDialog() {
            const one = selObjs().find(o => ['rect', 'ellipse', 'polygon', 'star', 'path', 'svgpath'].includes(o.type) && !o.map);
            ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: '➰ Un texte qui suit une courbe', submitLabel: 'Poser le texte',
                body: `<p class="muted">Le texte se pose le long d’un tracé ; il reste modifiable (texte, police, taille, position sur la courbe, côté). La forme du tracé se change avec la Sélection directe (A).</p>
                    <div class="h-fp-kinds">${[['circle', '◯ Cercle'], ['arcup', '⌒ Arc (en haut)'], ['arcdown', '◡ Arc (en bas)'], ['wave', '〰 Vague'], ...(one ? [['sel', `✒ Le tracé choisi (${esc(one.name || 'forme')})`]] : []), ['seal', '🔏 Modèle : devise autour d’un sceau'], ['ribbon', '🎗 Modèle : nom sur un ruban']].map(([k, l], i) => `<label class="h-fp-kind"><input type="radio" name="shape" value="${k}" ${(one ? k === 'sel' : i === 0) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
                    <label>Texte<input name="text" maxlength="300" value="Famille Martin · 1850" required></label><label data-only="seal">Texte du bas (modèle sceau)<input name="text2" maxlength="300" value="Fidèle et loyal"></label>`,
                onOpen: dg => { const sync = () => { const v = dg.querySelector('[name=shape]:checked')?.value; dg.querySelectorAll('[data-only]').forEach(x => { x.hidden = x.dataset.only !== v; }); }; sync(); dg.addEventListener('change', sync); },
                onSubmit: f => {
                    const v = f.querySelector('[name=shape]:checked')?.value || 'circle', text = String(f.querySelector('[name=text]').value || '').trim() || 'Texte', text2 = String(f.querySelector('[name=text2]').value || '').trim();
                    const R = sel.length ? (() => { const b = unionBox(selObjs()); return pageAt(b.x + b.w / 2, b.y + b.h / 2); })() : pageAt(doc.w / 2, doc.h / 2), cx = R.x + R.w / 2, cy = R.y + R.h / 2, S = Math.min(R.w, R.h) * .62;
                    const tp = (pts, closed, extra = {}) => ({id: uid(), type: 'textpath', name: text.slice(0, 30), text, pts, closed, start: 50, align: 'middle', side: 'top', offset: 0, size: n2(S / 10), font: 'Georgia', fill: '#222222', sw: 0, ...extra});
                    let made = null;
                    if (v === 'sel' && one) { made = textPathFrom(one, text); if (!made) { toast('Ce tracé a plusieurs morceaux : choisis-en un seul, ou une autre forme.', 'error'); return false; } }
                    else if (v === 'circle') made = tp(ringPts(cx, cy, S / 2), true, {start: 25});
                    else if (v === 'arcup') { const x0 = cx - S / 2, x1 = cx + S / 2, y = cy + S * .12; made = tp([P(x0, y, null, [x0 + S * .2, y - S * .45]), P(x1, y, [x1 - S * .2, y - S * .45], null)], false); }
                    else if (v === 'arcdown') { const x0 = cx - S / 2, x1 = cx + S / 2, y = cy - S * .12; made = tp([P(x0, y, null, [x0 + S * .2, y + S * .45]), P(x1, y, [x1 - S * .2, y + S * .45], null)], false); }
                    else if (v === 'wave') { const x0 = cx - S * .6, x1 = cx + S * .6, a = S * .16; made = tp([P(x0, cy, null, [x0 + S * .2, cy - a * 2]), P(cx, cy, [cx - S * .2, cy + a * 2], [cx + S * .2, cy - a * 2]), P(x1, cy, [x1 - S * .2, cy + a * 2], null)], false, {size: n2(S / 12)}); }
                    else if (v === 'seal') { const ro = S / 2, ri = ro * .7, rm = (ro + ri) / 2, fs = (ro - ri) * .5, ink = '#7a2a2a';
                        made = {id: uid(), type: 'group', name: 'Devise autour d’un sceau', children: [{id: uid(), type: 'ellipse', name: 'Cercle extérieur', x: cx - ro, y: cy - ro, w: 2 * ro, h: 2 * ro, fill: 'none', stroke: ink, sw: n2(fs / 6)}, {id: uid(), type: 'ellipse', name: 'Cercle intérieur', x: cx - ri, y: cy - ri, w: 2 * ri, h: 2 * ri, fill: 'none', stroke: ink, sw: n2(fs / 10)},
                            tp(ringPts(cx, cy, rm), true, {name: 'Devise du haut', text: text.toLocaleUpperCase('fr-FR'), start: 25, size: n2(fs), offset: n2(-fs * .36), ls: n2(fs * .12), fill: ink, font: 'Didot, Georgia, serif'}),
                            ...(text2 ? [tp(ringPts(cx, cy, rm), true, {name: 'Devise du bas', text: text2.toLocaleUpperCase('fr-FR'), start: 25, side: 'bottom', size: n2(fs), offset: n2(-fs * .36), ls: n2(fs * .12), fill: ink, font: 'Didot, Georgia, serif'})] : []),
                            {id: uid(), type: 'star', name: 'Étoile', x: cx - ro * .9 - fs * .25, y: cy - fs * .25, w: n2(fs * .5), h: n2(fs * .5), n: 5, inner: 45, fill: ink, stroke: 'none', sw: 0}, {id: uid(), type: 'star', name: 'Étoile', x: cx + ro * .85 - fs * .25, y: cy - fs * .25, w: n2(fs * .5), h: n2(fs * .5), n: 5, inner: 45, fill: ink, stroke: 'none', sw: 0}]}; }
                    else if (v === 'ribbon') { const W = S * 1.3, t = S * .2, A2 = S * .14, fs = t * .5;
                        made = {id: uid(), type: 'group', name: 'Nom sur un ruban', children: [...ribbon(cx, cy, W, t, A2, ['#a8322d', '#8c2a26', '#5e1a17']), tp([P(cx - W / 2, cy, null, [cx - W / 2 + W / 3, cy - A2]), P(cx + W / 2, cy, [cx + W / 2 - W / 3, cy - A2], null)], false, {name: 'Texte du ruban', size: n2(fs), offset: n2(-fs * .34), fill: '#fff6e0', font: 'Georgia', italic: true})]}; }
                    if (!made) return false;
                    cur().push(made); sel = [made.id]; tab = 'props'; setTool('select'); commit('Texte sur une courbe');
                }});
        }
        function paintPanel() {
            paintModes();
            dlg.querySelectorAll('[data-vx-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.vxTab === tab));
            if (document.activeElement && pane.contains(document.activeElement) && document.activeElement.matches('input:not([type=color]):not([type=range]), textarea, select') && tab === 'props') return; // on écrit : ne pas tout redessiner
            if (tab === 'layers') { pane.innerHTML = layersPane(); return; }
            if (tab === 'doc') { pane.innerHTML = docPane(); mountPresets(); return; }
            if (tab === 'blason') { pane.innerHTML = blasonPane(); return; }
            if (tab === 'map') { pane.innerHTML = MP ? MP.paneHtml() : '<p class="muted">Le mode Plan n’est pas chargé.</p>'; return; }
            if (tab === 'orn') { pane.innerHTML = ornPane(); return; }
            const list = selObjs(), o = list[0];
            if (!o) { pane.innerHTML = `<div class="vx-form"><p class="muted">Choisis un objet (outil Sélection) pour changer ses couleurs, son trait, sa taille. Les couleurs ci-dessous seront celles des prochaines formes.</p>${SEC({title: 'Couleur', key: 'vx-color', open: true, body: `<h4>Remplissage par défaut</h4>${swatchRow('data-vx-dfill', defaults.fill)}<h4>Contour par défaut</h4>${swatchRow('data-vx-dstroke', defaults.stroke)}${fld('dsw', 'Épaisseur du contour', defaults.sw, {min: 0, max: 200, step: .5})}`})}</div>`; return; }
            const b = rbox(o), many = list.length > 1, isText = o.type === 'text' || o.type === 'textpath', grp = o.type === 'group', paintable = o.type !== 'image' && !o.map && !['msym', 'mdeco'].includes(o.type);
            // Position et taille (+ aligner, répartir)
            const pos = `${!many ? `<div class="vx-grid4">${fld('x', 'X', n2(b.x))}${fld('y', 'Y', n2(b.y))}${fld('w', 'L', n2(b.w), {min: 0})}${fld('h', 'H', n2(b.h), {min: 0})}</div>` : ''}${fld('rot', 'Rotation', n2(o.rot || 0), {min: -360, max: 360, unit: '°'})}${alignBar(list.length)}`;
            // Couleur : remplissage (uni, dégradé à plusieurs couleurs, motif) et contour
            const ftype = o.pat ? 'pattern' : o.grad ? o.grad.type || 'linear' : '';
            let fill = `<h4>${grp ? 'Recolorer tout le groupe' : 'Remplissage'}</h4>${swatchRow('data-vx-fill', grp ? '' : o.fill)}`;
            if (!grp) {
                fill += `<label>Sorte de remplissage<select data-vx-p="ftype">${[['', 'Couleur unie'], ['linear', 'Dégradé linéaire'], ['radial', 'Dégradé radial'], ['pattern', 'Motif (hachures, points…)']].map(([k, l]) => `<option value="${k}" ${ftype === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
                if (o.grad && !o.pat) { const st = gradStops(o.grad);
                    fill += `<div class="vx-gbar" style="background:${o.grad.type === 'radial' ? 'radial-gradient(circle' : 'linear-gradient(90deg'},${st.map(x => `${x.c} ${n2(x.o * 100)}%`).join(',')})"></div><div class="vx-stops">${st.map((x, i) => `<div class="vx-stop"><input type="color" data-vx-p="stopc:${i}" value="${esc(hex6(x.c, '#000000'))}" data-ui-compact aria-label="Couleur ${i + 1}"><label>Position <input type="range" data-vx-p="stopo:${i}" min="0" max="100" value="${Math.round(x.o * 100)}" data-unit="%"></label><button type="button" class="icon-button small" data-vx-stopdel="${i}" title="Retirer cette couleur" ${st.length <= 2 ? 'disabled' : ''}>🗑</button></div>`).join('')}</div>
                        <button type="button" class="button small secondary" data-vx-stopadd>＋ Ajouter une couleur</button>
                        ${o.grad.type === 'radial' ? `<label>Centre horizontal <input type="range" data-vx-p="gcx" min="0" max="100" value="${n2(num(o.grad.cx, 50))}" data-unit="%"></label><label>Centre vertical <input type="range" data-vx-p="gcy" min="0" max="100" value="${n2(num(o.grad.cy, 50))}" data-unit="%"></label><label>Étendue <input type="range" data-vx-p="gr" min="5" max="150" value="${n2(num(o.grad.r, 50))}" data-unit="%"></label>` : `<label>Angle <input type="range" data-vx-p="gangle" min="0" max="360" value="${n2(((num(o.grad.angle) % 360) + 360) % 360)}" data-unit="°"></label>`}`; }
                if (o.pat) { const p = o.pat, isH = /^h_/.test(p.kind || '');
                    fill += `<svg class="vx-patprev" viewBox="0 0 120 26" preserveAspectRatio="none"><defs>${patDef({pat: {...p, size: clamp(num(p.size, 10), 4, 30)}}, 'vxpp')}</defs><rect width="120" height="26" fill="url(#vxpp)"/></svg>
                        <label><span data-help="Hachures, points ou quadrillage remplissent la forme ; les « hachures héraldiques » sont la façon de dessiner les émaux en noir et blanc (or = points, gueules = traits verticaux…).">Motif</span><select data-vx-p="pkind">${PATTERNS.map(([k, l]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${l}</option>`).join('')}<optgroup label="Hachures héraldiques">${Object.values(HATCH).map(([k, l]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup></select></label>
                        <div class="vx-grid2"><label>Couleur des traits<input type="color" data-vx-p="pcolor" value="${esc(hex6(p.color, '#000000'))}"></label><label>Fond<input type="color" data-vx-p="pbg" value="${esc(hex6(p.bg, '#ffffff'))}"></label></div>
                        <label>Écart <input type="range" data-vx-p="psize" min="2" max="80" step="1" value="${n2(clamp(num(p.size, 10), 2, 80))}" data-unit="px"></label><label>Épaisseur <input type="range" data-vx-p="pwidth" min="0.2" max="20" step="0.1" value="${n2(clamp(num(p.width, num(p.size, 10) / 8), .2, 20))}" data-unit="px"></label>${p.kind === 'lines' && !isH ? `<label>Angle <input type="range" data-vx-p="pangle" min="0" max="180" value="${n2(num(p.angle, 45))}" data-unit="°"></label>` : ''}`; }
            }
            const stroke = grp ? `<h4>Contour (traits du groupe)</h4>${swatchRow('data-vx-stroke', '')}` : `<h4>Contour</h4>${swatchRow('data-vx-stroke', num(o.sw) ? o.stroke : 'none')}<div class="vx-row">${fld('sw', 'Épaisseur', o.sw || 0, {min: 0, max: 500, step: .5})}</div>${o.type === 'path' && !o.closed && ext.vectorPlus ? `<label>〰 Largeur du trait<select data-vx-p="wp">${ext.vectorPlus.PROFILES.map(([k, l]) => `<option value="${k}" ${(o.wp || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
                <div class="vx-grid2"><label>Pointillés<select data-vx-p="dash">${[['', 'plein'], ['dash', 'tirets'], ['dot', 'points'], ['long', 'longs tirets'], ['dashdot', 'tiret-point']].map(([k, l]) => `<option value="${k}" ${(o.dash || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Bouts<select data-vx-p="cap">${[['round', 'ronds'], ['butt', 'plats'], ['square', 'carrés']].map(([k, l]) => `<option value="${k}" ${(o.cap || 'round') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Angles<select data-vx-p="join">${[['round', 'ronds'], ['miter', 'pointus'], ['bevel', 'biseautés']].map(([k, l]) => `<option value="${k}" ${(o.join || 'round') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
            const color = paintable ? fill + stroke : '<p class="muted">Cet objet garde ses couleurs (image, élément de plan).</p>';
            // Texte (et texte sur une courbe)
            const fnt = font(o.font || 'Georgia');
            const text = !isText ? '' : `<label>Texte<textarea data-vx-p="text" rows="${o.type === 'textpath' ? 2 : 3}">${esc(o.text || '')}</textarea></label>
                <label>Police<button type="button" class="vx-fontbtn" data-vx-font style="font-family:'${esc(fnt.split(',')[0].replace(/"/g, ''))}', serif">${esc(fnt.split(',')[0].replace(/"/g, ''))}<small>Changer…</small></button></label>${fld('size', 'Taille', o.size, {min: 2, max: 2000})}
                <div class="vx-row"><label class="ui-toggle"><input type="checkbox" data-vx-p="bold" ${o.bold ? 'checked' : ''}><i></i>Gras</label><label class="ui-toggle"><input type="checkbox" data-vx-p="italic" ${o.italic ? 'checked' : ''}><i></i>Italique</label><select data-vx-p="align" aria-label="Alignement">${[['start', o.type === 'textpath' ? 'Depuis le début' : 'À gauche'], ['middle', 'Centré'], ['end', o.type === 'textpath' ? 'Jusqu’à la fin' : 'À droite']].map(([k, l]) => `<option value="${k}" ${(o.align || (o.type === 'textpath' ? 'middle' : 'start')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${fld('ls', 'Espacement des lettres', o.ls || 0, {min: -20, max: 200, step: .5})}
                ${o.type === 'textpath' ? `<h4>➰ Sur la courbe</h4>
                    <label><span data-help="Où le texte se pose le long du tracé : 50 % = au milieu (avec « Centré »), 0 % = au départ du tracé.">Position sur le tracé</span><input type="range" data-vx-p="tstart" min="-50" max="150" value="${n2(num(o.start, 50))}" data-unit="%"></label>
                    <label><span data-help="Écarte les lettres du tracé : positif = vers le haut des lettres, négatif = vers le bas. Pour une légende entre deux cercles, mets environ un tiers de la taille en négatif.">Décalage</span><input type="range" data-vx-p="toffset" min="${-Math.round(num(o.size, 24) * 2)}" max="${Math.round(num(o.size, 24) * 2)}" step="0.5" value="${n2(num(o.offset))}" data-unit="px"></label>
                    <label><span data-help="Dessus : les lettres sont debout sur le tracé (le haut d’un cercle). Dessous : le tracé est lu dans l’autre sens, pour écrire à l’endroit sur le bas d’un cercle.">Côté</span><select data-vx-p="tside"><option value="top" ${o.side !== 'bottom' ? 'selected' : ''}>Dessus (lettres debout sur la courbe)</option><option value="bottom" ${o.side === 'bottom' ? 'selected' : ''}>Dessous (lu à l’endroit en bas)</option></select></label>
                    <label class="ui-toggle"><input type="checkbox" data-vx-p="tfit" ${o.fit ? 'checked' : ''}><i></i>Étaler les lettres sur la longueur</label>${o.fit ? `<label>Part du tracé occupée <input type="range" data-vx-p="tfitpct" min="5" max="100" value="${n2(num(o.fitPct, 100))}" data-unit="%"></label>` : ''}
                    <label class="ui-toggle"><input type="checkbox" data-vx-p="tguide" ${o.showGuide ? 'checked' : ''}><i></i>Dessiner aussi le tracé</label>${o.showGuide ? `<div class="vx-grid2"><label>Couleur du tracé<input type="color" data-vx-p="tgstroke" value="${esc(hex6(o.gstroke, '#888888'))}"></label>${fld('tgsw', 'Épaisseur', num(o.gsw, 1), {min: 0, max: 200, step: .5})}</div>` : ''}
                    <p class="muted vx-mhelp">Pour changer la forme du tracé : outil Sélection directe (A), puis glisse ses points.</p>` : ''}`;
            const fx = `<label>Opacité <input type="range" data-vx-p="op" min="0" max="100" value="${Math.round(num(o.op, 1) * 100)}" data-unit="%"></label>`;
            // ce qui est propre à la forme
            const tpBtn = !many && ['rect', 'ellipse', 'polygon', 'star', 'path', 'svgpath'].includes(o.type) && !o.map ? '<button type="button" class="button small secondary" data-vx-cmd="textpath" title="Pose un texte qui suit ce tracé">➰ Un texte sur ce tracé</button>' : '';
            const shape = `${o.type === 'rect' ? fld('r', 'Arrondi des coins', o.r || 0, {min: 0, max: 5000}) : ''}${o.type === 'polygon' || o.type === 'star' ? fld('n', o.type === 'star' ? 'Branches' : 'Côtés', o.n, {min: 3, max: 60}) : ''}${o.type === 'star' ? fld('inner', 'Creux', o.inner, {min: 5, max: 100, unit: '%'}) : ''}
                ${o.type === 'path' ? `<label class="ui-toggle"><input type="checkbox" data-vx-p="closed" ${o.closed ? 'checked' : ''}><i></i>Tracé fermé</label>` : ''}${['path', 'svgpath'].includes(o.type) ? `<label class="checkbox-line"><input type="checkbox" data-vx-p="evenodd" ${o.evenodd ? 'checked' : ''}> <span data-help="Là où le tracé se recouvre lui-même, un trou apparaît (comme l’intérieur d’un « O ») au lieu d’être rempli.">Trous (pair-impair)</span></label>` : ''}
                ${o.type === 'image' ? '<p><button type="button" class="button small" data-vx-cmd="vectorize">🪄 Vectoriser cette image</button></p>' : ''}${tpBtn ? `<div class="vx-row">${tpBtn}</div>` : ''}
                ${!many && MP ? MP.propsHtml(o) : ''}`;
            const acts = `<div class="vx-row">${many ? '<button type="button" class="button small secondary" data-vx-cmd="group">Grouper</button>' : ''}${grp ? '<button type="button" class="button small secondary" data-vx-cmd="ungroup">Dissocier</button>' : ''}${['rect', 'ellipse', 'polygon', 'star'].includes(o.type) ? '<button type="button" class="button small secondary" data-vx-cmd="topath">Convertir en tracé</button>' : ''}<button type="button" class="button small secondary" data-vx-cmd="dup">Dupliquer</button><button type="button" class="button small danger" data-vx-cmd="del">Supprimer</button></div>`;
            const shapeTitle = {text: 'Texte', textpath: 'Courbe', image: 'Image', group: 'Groupe', path: 'Tracé', svgpath: 'Tracé'}[o.type] || 'Forme';
            pane.innerHTML = `<div class="vx-form"><h4>${many ? `${list.length} objets` : esc(o.name || o.type)}</h4>
                ${SEC({title: 'Position et taille', key: 'vx-pos', open: true, body: pos})}${SEC({title: 'Couleur', key: 'vx-color', open: true, body: color})}${isText ? SEC({title: 'Texte', key: 'vx-text', open: true, body: text}) : ''}${SEC({title: 'Effets', key: 'vx-fx', open: false, body: fx})}${shape.trim() ? SEC({title: shapeTitle, key: 'vx-shape', open: true, body: shape}) : ''}${acts}</div>`;
        }
        // une valeur du panneau → tous les objets choisis
        function setProp(k, v, el) {
            if (['dw', 'dh', 'dgrid', 'dbg', 'dbgc', 'dsnap', 'dsw'].includes(k)) {
                if (k === 'dw') doc.w = clamp(num(v, doc.w), 10, 20000); if (k === 'dh') doc.h = clamp(num(v, doc.h), 10, 20000); if (k === 'dgrid') doc.grid = clamp(num(v), 0, 500); if (k === 'dsnap') doc.snap = el.checked;
                if (k === 'dbg') { doc.bg = v === 'transparent' ? 'transparent' : '#ffffff'; tab = 'doc'; } if (k === 'dbgc') doc.bg = col(v, '#ffffff'); if (k === 'dsw') { defaults.sw = clamp(num(v), 0, 200); return; }
                return k === 'dbg' || k === 'dsnap' ? commit('Plan de travail') : later('Plan de travail', true);
            }
            if (k === 'dsmart') { smart = !!el.checked; try { localStorage.setItem(SMART_KEY, smart ? '1' : '0'); } catch (_) {} sbar?.sync(); return; }
            if (k === 'dfolds') { showFolds = !!el.checked; try { localStorage.setItem(FOLD_KEY, showFolds ? '1' : '0'); } catch (_) {} drawPages(); return; }
            const list = selObjs().filter(o => !o.locked); if (!list.length) return;
            const [kk, ki] = k.split(':'), si = Number(ki);
            list.forEach(o => {
                if (['x', 'y', 'w', 'h'].includes(k)) { const b = rbox(o), val = num(v); if (k === 'x') moveObj(o, val - b.x, 0); if (k === 'y') moveObj(o, 0, val - b.y); const ub = box(o), before = clone(o); if (k === 'w' && ub.w && val > 0) { const f = val / ub.w; mapObj(o, (px, py) => [ub.x + (px - ub.x) * f, py]); keepAnchor(before, o, ub.x, ub.y); } if (k === 'h' && ub.h && val > 0) { const f = val / ub.h; mapObj(o, (px, py) => [px, ub.y + (py - ub.y) * f]); keepAnchor(before, o, ub.x, ub.y); } return; }
                if (k === 'rot') { o.rot = ((num(v) % 360) + 360) % 360; return; }
                if (k === 'op') { o.op = clamp(num(v, 100) / 100, 0, 1); return; }
                if (k === 'wp') { if (ext.vectorPlus?.PROFILES.some(p => p[0] === v && v)) o.wp = v; else delete o.wp; return; } // 〰 largeur variable
                if (['bold', 'italic', 'closed', 'evenodd'].includes(k)) { o[k] = el.checked; return; }
                // remplissage : uni, dégradé (plusieurs couleurs), motif
                if (k === 'ftype' || k === 'gtype') { const base = o.fill && o.fill !== 'none' ? col(o.fill, '#000000') : '#000000';
                    if (!v) { delete o.grad; delete o.pat; }
                    else if (v === 'pattern') { delete o.grad; o.pat = o.pat || {kind: 'lines', color: base === '#ffffff' ? '#000000' : base, bg: '#ffffff', size: 10, width: 1.5, angle: 45}; }
                    else { delete o.pat; o.grad = {...(o.grad || {}), type: v, stops: o.grad ? gradStops(o.grad) : [{o: 0, c: '#ffffff'}, {o: 1, c: base}], angle: o.grad?.angle ?? 90}; delete o.grad.c1; delete o.grad.c2; }
                    if (o.fill === 'none' && v) o.fill = '#000000'; return; }
                if (kk === 'stopc' || kk === 'stopo') { if (!o.grad) return; const st = gradStops(o.grad); if (!st[si]) return; if (kk === 'stopc') st[si].c = col(v, '#000000'); else st[si].o = clamp(num(v) / 100, 0, 1); o.grad.stops = st; delete o.grad.c1; delete o.grad.c2; return; }
                if (k === 'gc1' || k === 'gc2') { if (o.grad) { const st = gradStops(o.grad); st[k === 'gc1' ? 0 : st.length - 1].c = col(v, '#000'); o.grad.stops = st; } return; }
                if (['gangle', 'gcx', 'gcy', 'gr'].includes(k)) { if (o.grad) o.grad[{gangle: 'angle', gcx: 'cx', gcy: 'cy', gr: 'r'}[k]] = num(v); return; }
                if (['pkind', 'pcolor', 'pbg', 'psize', 'pwidth', 'pangle'].includes(k)) { if (!o.pat) return; const f = k.slice(1);
                    o.pat[f === 'kind' ? 'kind' : f] = f === 'kind' ? String(v).replace(/[^a-z_]/g, '') : ['color', 'bg'].includes(f) ? col(v, '#000000') : num(v); return; }
                if (k === 'fill') { if (o.type === 'group') { recolor(o, 'fill', col(v, '#000')); return; } o.fill = col(v, '#000'); delete o.grad; delete o.pat; return; }
                if (k === 'stroke') { if (o.type === 'group') { recolor(o, 'stroke', col(v, '#000')); return; } o.stroke = col(v, '#000'); if (!num(o.sw)) o.sw = 2; return; }
                if (['sw', 'size', 'r', 'n', 'inner', 'ls'].includes(k)) { o[k] = clamp(num(v), k === 'n' ? 3 : 0, k === 'size' ? 2000 : 5000); return; }
                if (k === 'font') { o.font = font(v); return; }
                if (k === 'text') { o.text = String(v).slice(0, 20000); o.name = o.text.split('\n')[0].slice(0, 30) || 'Texte'; return; }
                // ➰ texte sur une courbe
                if (o.type === 'textpath') {
                    if (k === 'tstart') o.start = clamp(num(v, 50), -100, 200); if (k === 'toffset') o.offset = num(v); if (k === 'tside') o.side = v === 'bottom' ? 'bottom' : 'top';
                    if (k === 'tfit') o.fit = !!el.checked; if (k === 'tfitpct') o.fitPct = clamp(num(v, 100), 5, 100); if (k === 'tguide') { o.showGuide = !!el.checked; if (o.showGuide && !num(o.gsw)) o.gsw = 1; }
                    if (k === 'tgstroke') o.gstroke = col(v, '#888888'); if (k === 'tgsw') o.gsw = clamp(num(v), 0, 200);
                }
                if (['dash', 'cap', 'join', 'align'].includes(k)) o[k] = v;
            });
            later('Propriété changée', ['text', 'font', 'x', 'y', 'w', 'h', 'rot', 'size', 'sw', 'r', 'ls', 'gangle', 'gcx', 'gcy', 'gr', 'n', 'inner', 'fill', 'stroke', 'gc1', 'gc2', 'op', 'stopc', 'stopo', 'pcolor', 'pbg', 'psize', 'pwidth', 'pangle', 'tstart', 'toffset', 'tfitpct', 'tgstroke', 'tgsw'].includes(kk));
        }
        let laterT = 0;
        const later = (label, typing = false) => { if (typing) { renderNoPanel(); clearTimeout(laterT); laterT = setTimeout(() => { laterT = 0; commit(label); }, 600); } else commit(label); };
        const renderNoPanel = () => { mapCtx(doc, true); drawRef(); const defs = []; content.innerHTML = treeSvg(defs); defsEl.innerHTML = '<pattern id="vxchk" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#e8e8e8"/><rect x="8" y="8" width="8" height="8" fill="#e8e8e8"/></pattern>' + defs.join(''); drawPages(); drawUi(); markDirty(); };
        const applyFree = (attr, c, final) => {
            if (attr === 'data-vx-dfill' || attr === 'data-vx-dstroke') { defaults[attr === 'data-vx-dfill' ? 'fill' : 'stroke'] = c; paintFs(); if (final) { rememberColor(c); paintPanel(); } return; }
            const list = selObjs().filter(o => !o.locked); if (!list.length) return toast('Choisis d’abord un objet.', 'error');
            list.forEach(o => { if (o.type === 'group' && attr !== 'data-bl-tintfree') { recolor(o, attr === 'data-vx-stroke' ? 'stroke' : 'fill', c); return; } if (attr === 'data-vx-stroke') { o.stroke = c; if (!num(o.sw)) o.sw = 2; } else if (attr === 'data-bl-tintfree') { if (o.type === 'group') (o.children || []).forEach(ch => { if (ch.fill !== 'none') ch.fill = c; }); else if (o.type !== 'image') { o.fill = c; delete o.grad; delete o.pat; } } else { o.fill = c; delete o.grad; delete o.pat; } });
            if (final) { rememberColor(c); clearTimeout(laterT); laterT = 0; commit('Couleur libre'); } else later('Couleur libre', true);
        };
        // 🗺️ l'onglet Plan et les réglages de plan d'un objet (heritage-vector-map.js)
        ['click', 'input', 'change'].forEach(ev => pane.addEventListener(ev, e => { if (MP && e.target.closest?.('[data-vm],[data-vmp],[data-vm-pick],[data-vm-cmd],[data-vmp-link],[data-vmp-unlink],[data-vmp-open],[data-vmp-reset]')) { if (MP.onPaneEvent(e)) e.stopImmediatePropagation(); } }, true));
        pane.addEventListener('input', e => { if (e.target.dataset.vxFree) applyFree(e.target.dataset.vxFree, e.target.value, false); });
        pane.addEventListener('change', e => { if (e.target.dataset.vxFree) applyFree(e.target.dataset.vxFree, e.target.value, true); });
        pane.addEventListener('input', e => { const el = e.target; if (el.dataset.vxP) setProp(el.dataset.vxP, el.type === 'checkbox' ? el.checked : el.value, el); else if (el.matches('[data-vx-lname]')) { const o = findAny(el.closest('[data-vx-layer]').dataset.vxLayer)?.o; if (o) { o.name = el.value.slice(0, 60); dirty = true; } } else if (el.dataset.bl !== undefined) { blasonState[el.dataset.bl] = el.value; paintBlasonPreview(); } });
        pane.addEventListener('change', e => { const el = e.target; if (el.dataset.vxP && laterT) { clearTimeout(laterT); laterT = 0; commit('Propriété changée'); } if (el.matches('[data-vx-lname]')) commit('Calque renommé');
            if (el.matches('[data-vx-lmoveto]') && el.value) { const gid = el.value, ids = sel.slice(); let n = 0; ids.forEach(id => { if (moveInTree(id, gid, 'into')) n++; }); if (n) commit('Rangé dans un groupe'); else { toast('Impossible de ranger ici (un groupe ne va pas dans lui-même).', 'error'); paintPanel(); } } });
        const renameLayer = id => setTimeout(() => { const inp = [...pane.querySelectorAll('[data-vx-layer]')].find(r => r.dataset.vxLayer === id)?.querySelector('[data-vx-lname]'); if (!inp) return; inp.readOnly = false; inp.focus(); inp.select(); }, 30);
        pane.addEventListener('focusout', e => { if (e.target.matches?.('[data-vx-lname]')) e.target.readOnly = true; });
        pane.addEventListener('keydown', e => { if (e.target.matches?.('[data-vx-lname]') && e.key === 'Enter') e.target.blur(); });
        pane.addEventListener('focusout', () => { if (laterT) { clearTimeout(laterT); laterT = 0; setTimeout(() => commit('Propriété changée'), 0); } });
        pane.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            const sw = b.dataset.vxFill ?? b.dataset.vxStroke; if (sw !== undefined) { const k = b.dataset.vxFill !== undefined ? 'fill' : 'stroke'; selObjs().filter(o => !o.locked).forEach(o => { if (o.type === 'group') { if (sw !== 'none') recolor(o, k, sw); } else if (k === 'fill') { o.fill = sw; delete o.grad; delete o.pat; } else if (sw === 'none') o.sw = 0; else { o.stroke = sw; if (!num(o.sw)) o.sw = 2; } }); commit(k === 'fill' ? 'Remplissage' : 'Contour'); return; }
            if (b.matches('[data-vx-stopadd]') || b.dataset.vxStopdel !== undefined) { selObjs().filter(o => !o.locked && o.grad).forEach(o => { const st = gradStops(o.grad);
                    if (b.dataset.vxStopdel !== undefined) { if (st.length > 2) st.splice(Number(b.dataset.vxStopdel), 1); }
                    else { let gi = 0, gap = -1; for (let i = 1; i < st.length; i++) if (st[i].o - st[i - 1].o > gap) { gap = st[i].o - st[i - 1].o; gi = i; } st.splice(gi, 0, {o: (st[gi - 1].o + st[gi].o) / 2, c: st[gi - 1].c}); }
                    o.grad.stops = st; delete o.grad.c1; delete o.grad.c2; }); commit('Dégradé'); return; }
            if (b.matches('[data-vx-font]')) { const o = selObjs()[0]; if (!o) return; const pick = UI()?.openFontPicker ? await UI().openFontPicker({value: font(o.font).split(',')[0].replace(/"/g, ''), sample: String(o.text || 'Louise Borie').split('\n')[0].slice(0, 30) || 'Louise Borie'}) : await A().askText({title: 'Police', value: o.font || 'Georgia', okLabel: 'Choisir'});
                if (!pick) return; selObjs().filter(q => !q.locked && (q.type === 'text' || q.type === 'textpath')).forEach(q => { q.font = font(pick); }); commit('Police'); return; }
            if (b.dataset.vxAlto) { alignTo = b.dataset.vxAlto === 'art' ? 'art' : 'sel'; try { localStorage.setItem(ALTO_KEY, alignTo); } catch (_) {} paintPanel(); return; }
            if (b.dataset.vxOrn) { insertOrnament(b.dataset.vxOrn); return; }
            if (b.dataset.vxOrncat !== undefined) { ornCat = b.dataset.vxOrncat; paintPanel(); return; }
            if (b.matches('[data-vx-hatchleg]')) { addHatchLegend(); return; }
            if (b.dataset.vxDfill) { defaults.fill = b.dataset.vxDfill; paintPanel(); paintFs(); return; } if (b.dataset.vxDstroke) { defaults.stroke = b.dataset.vxDstroke; paintPanel(); paintFs(); return; }
            if (b.dataset.vxSize) { const [w, h] = b.dataset.vxSize.split('x').map(Number); doc.w = w; doc.h = h; commit('Plan de travail'); fit(); return; }
            if (b.matches('[data-vx-lnew]')) { newLayer(); commit('Nouveau calque'); return; }
            if (b.matches('[data-vx-lgroup]')) { if (sel.length) { CMDS.group(); return; } const g = {id: uid(), type: 'group', name: 'Groupe', children: []}; cur().push(g); const path = [...scope, g.id]; enterScope(path); openGroups.add(g.id); commit('Nouveau groupe'); return; }
            if (b.matches('[data-vx-lexit]')) { scope = scope.slice(0, -1); sel = []; nodeSel = null; render(); return; }
            const row = b.closest('[data-vx-layer]'); if (row) { const f = findAny(row.dataset.vxLayer); if (!f) return; const {o, arr, path} = f, i = arr.indexOf(o);
                if (b.matches('[data-vx-ltoggle]')) { if (openGroups.has(o.id)) openGroups.delete(o.id); else openGroups.add(o.id); paintPanel(); return; }
                if (b.matches('[data-vx-lenter]')) { if (samePath([...path, o.id], scope)) { scope = path.slice(); sel = []; nodeSel = null; render(); } else if (enterScope([...path, o.id])) { openGroups.add(o.id); render(); } return; }
                if (b.matches('[data-vx-lclip]')) { // ✂️ masque d'un groupe ou d'un calque : sa forme la plus haute le découpe ; un 2e clic la rend
                    const what = o.layer ? 'calque' : 'groupe';
                    if (o.clip) { const shape = {...clone(o.clip), id: uid(), name: o.clip.name || 'Forme du masque'}; delete o.clip; (o.children = o.children || []).push(shape); sel = []; commit('Masque retiré'); toast(`Masque retiré : la forme est revenue tout en haut du ${what}.`); return; }
                    const kids = o.children || [], k = kids.map((c, j) => [c, j]).reverse().find(([c]) => c.type !== 'group' && c.type !== 'image' && c.type !== 'text' && shapeD(c));
                    if (!k) return toast(`Pose d’abord une forme (rond, ovale, rectangle, tracé…) tout en haut de ce ${what} : elle servira de découpe.`, 'error');
                    if (kids.length < 2) return toast(`Il faut quelque chose à découper sous la forme, dans ce ${what}.`, 'error');
                    o.clip = clone(k[0]); kids.splice(k[1], 1); sel = sel.filter(x => x !== k[0].id); commit('Masque'); toast(`✂️ Masque posé : on ne voit plus que ce qui est dans « ${k[0].name || 'la forme'} ».`); return; }
                if (b.matches('[data-vx-lvis]')) { o.hidden = !o.hidden; if (o.hidden) sel = sel.filter(s => s !== o.id); commit(o.hidden ? 'Masqué' : 'Affiché'); return; }
                if (b.matches('[data-vx-llock]')) { o.locked = !o.locked; if (o.locked) sel = sel.filter(s => s !== o.id); commit(o.locked ? 'Verrouillé' : 'Déverrouillé'); return; }
                if (b.matches('[data-vx-lup]') && i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; commit('Calque monté'); return; }
                if (b.matches('[data-vx-ldown]') && i > 0) { [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; commit('Calque descendu'); return; }
                if (b.matches('[data-vx-ldel]')) { const big = isLayerGroup(o) && (o.children || []).length; arr.splice(i, 1); sel = sel.filter(s => s !== o.id); if (scope.includes(o.id)) scope = scope.slice(0, scope.indexOf(o.id)); commit('Supprimé'); if (big) undoable(`« ${o.name || 'Groupe'} » supprimé avec ce qu’il contient`); return; }
                return; }
            if (b.dataset.blCharge) { blasonState.charge = b.dataset.blCharge; paintPanel(); return; }
            if (b.matches('[data-bl-make]')) { const {obj, blazon} = makeBlason(blasonState, {x: (doc.w - Math.min(doc.w * .7, doc.h * .7 / 1.2)) / 2, y: (doc.h - Math.min(doc.w * .7, doc.h * .7 / 1.2) * 1.2) / 2, width: Math.min(doc.w * .7, doc.h * .7 / 1.2)}); cur().push(obj); sel = [obj.id]; lastBlazon = blazon; ctx.onBlazon?.(blazon); commit('Blason créé'); paintPanel(); return; }
            if (b.matches('[data-bl-copy]')) { navigator.clipboard?.writeText(lastBlazon || blasonText()).then(() => toast('Blasonnement copié.')).catch(() => {}); return; }
            if (b.matches('[data-bl-addcharge]')) { addCharge(blasonState.charge, tHex(blasonState.d)); return; }
            if (b.dataset.blTintc) { applyFree('data-bl-tintfree', b.dataset.blTintc, true); return; }
            if (b.dataset.blTint) { const hex = tHex(b.dataset.blTint); selObjs().filter(o => !o.locked && o.type !== 'image').forEach(o => { if (o.type === 'group') (o.children || []).forEach(c => { if (c.fill !== 'none') c.fill = hex; }); else { o.fill = hex; delete o.grad; } }); commit(`Émail : ${b.title}`); return; }
        });
        let lastLClick = {};
        pane.addEventListener('click', e => {
            if (tab !== 'layers' || e.target.closest('button, input')) return;
            // double-clic : renommer — le 1er clic peut redessiner la liste (sortir d'un calque fait disparaître une ligne) : le 2e clic, au même endroit, renomme la ligne du 1er
            const now = Date.now(); if (lastLClick.id && now - lastLClick.t < 450 && Math.hypot(e.clientX - lastLClick.x, e.clientY - lastLClick.y) < 8) { const id = lastLClick.id; lastLClick = {}; renameLayer(id); return; }
            const row = e.target.closest('[data-vx-layer]'); if (!row) return;
            lastLClick = {id: row.dataset.vxLayer, t: now, x: e.clientX, y: e.clientY};
            const f = findAny(row.dataset.vxLayer); if (!f || f.o.hidden) return;
            if (!samePath(f.path, scope) && !enterScope(f.path)) return;
            if (f.o.locked) { render(); return; }
            sel = e.shiftKey ? [...new Set([...sel, f.o.id])] : [f.o.id]; setTool(tool === 'direct' ? 'direct' : 'select'); render();
        });
        let lDrag = null;
        pane.addEventListener('dragstart', e => { const row = e.target.closest?.('[data-vx-layer]'); if (!row || tab !== 'layers') return; lDrag = row.dataset.vxLayer; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', lDrag); } catch (_) {} row.classList.add('is-drag'); });
        const dropWhere = (row, e) => { const r = row.getBoundingClientRect(), t = (e.clientY - r.top) / r.height, g = isLayerGroup(findAny(row.dataset.vxLayer)?.o); return g && t > .18 && t < .82 ? 'into' : t < .5 ? 'above' : 'below'; };
        pane.addEventListener('dragover', e => { if (!lDrag) return; const row = e.target.closest('[data-vx-layer]'); pane.querySelectorAll('.vx-drop-above,.vx-drop-below,.vx-drop-into').forEach(x => x.classList.remove('vx-drop-above', 'vx-drop-below', 'vx-drop-into')); if (!row || row.dataset.vxLayer === lDrag) return; e.preventDefault(); row.classList.add('vx-drop-' + dropWhere(row, e)); });
        pane.addEventListener('drop', e => { if (!lDrag) return; const row = e.target.closest('[data-vx-layer]'); const id = lDrag; lDrag = null; if (!row) return; e.preventDefault(); if (moveInTree(id, row.dataset.vxLayer, dropWhere(row, e))) commit('Rangé'); else paintPanel(); });
        pane.addEventListener('dragend', () => { lDrag = null; pane.querySelectorAll('.is-drag,.vx-drop-above,.vx-drop-below,.vx-drop-into').forEach(x => x.classList.remove('is-drag', 'vx-drop-above', 'vx-drop-below', 'vx-drop-into')); });
        /* l'onglet Blason */
        const blasonState = {shield: 'francais', division: 'plein', ordinary: 'aucune', a: 'azur', b: 'or', c: 'gueules', d: 'or', charge: 'mdi_fleur_de_lis', count: '3', chargeSize: '100'};
        const tSel = (k, label) => `<label>${esc(label)}<select data-bl="${k}">${TINCTURES.map(([t, l, h]) => `<option value="${t}" ${blasonState[k] === t ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
        const blasonText = () => makeBlason(blasonState).blazon;
        function blasonPane() {
            const sh = K()?.shapeByKey?.(blasonState.charge);
            return `<div class="vx-form vx-blason"><p class="muted">Compose un blason : l’écu, sa partition, une pièce, des meubles et leurs émaux. Tout reste modifiable ensuite (couleurs, formes, ajouts à la plume…). Pour refaire un blason scanné : Blason → Vectoriser une image.</p>
                <div class="vx-blprev" data-bl-prev></div><p class="vx-blazon" data-bl-text>${esc(blasonText())}</p>
                <label>Écu<select data-bl="shield">${ESCUTCHEONS.map(([k, l]) => `<option value="${k}" ${blasonState.shield === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="vx-grid2"><label>Partition<select data-bl="division">${DIVISIONS.map(([k, l]) => `<option value="${k}" ${blasonState.division === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${tSel('a', 'Émail du champ')}</div>
                <div class="vx-grid2"><span></span>${tSel('b', 'Second émail (partition)')}</div>
                <div class="vx-grid2"><label>Pièce honorable<select data-bl="ordinary">${ORDINARIES.map(([k, l]) => `<option value="${k}" ${blasonState.ordinary === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${tSel('c', 'Émail de la pièce')}</div>
                <h4>Meubles</h4><div class="vx-charges">${CHARGE_KEYS.map(k => K()?.shapeByKey?.(k)).filter(Boolean).map(s => `<button type="button" data-bl-charge="${esc(s.k)}" class="${blasonState.charge === s.k ? 'is-on' : ''}" title="${esc(s.n)}">${K().shapeSvg(s, 24)}</button>`).join('')}</div>
                <label>Autre meuble (toutes les formes)<input data-vx-chq type="search" placeholder="Chercher : lion, épée, tour, oiseau…" autocomplete="off"></label><div class="vx-charges" data-vx-chres></div>
                <div class="vx-grid2"><label>Nombre<select data-bl="count">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${String(blasonState.count) === String(n) ? 'selected' : ''}>${n ? n : 'aucun'}</option>`).join('')}</select></label>${tSel('d', 'Émail des meubles')}</div>
                <label>Taille des meubles<input data-unit="%" type="range" data-bl="chargeSize" min="40" max="160" value="${esc(blasonState.chargeSize)}"></label>
                <div class="vx-row"><button type="button" class="button small" data-bl-make>🛡️ Créer ce blason</button><button type="button" class="button small secondary" data-bl-addcharge title="Ajoute un meuble ${esc(sh?.n || '')} seul, à placer où tu veux">⚜️ Ajouter un meuble seul</button><button type="button" class="button small secondary" data-bl-copy>📋 Copier le blasonnement</button></div>
                <h4>Impression en noir et blanc</h4><div class="vx-row"><button type="button" class="button small secondary" data-vx-cmd="hatch">🖨 Hachures héraldiques</button><button type="button" class="button small secondary" data-vx-cmd="unhatch">🎨 Remettre en couleur</button><button type="button" class="button small secondary" data-vx-hatchleg title="Ajoute en bas du dessin les sept émaux et leurs hachures">＋ Légende</button><span data-help="Chaque émail devient son motif (système de Pietra Santa) : or = points, argent = uni, gueules = traits verticaux, azur = horizontaux, sinople = diagonales de dextre, sable = croisillons, pourpre = diagonales de senestre. Sur la sélection, ou sur tout le dessin si rien n’est choisi." data-help-faq="hachures héraldiques"></span></div>
                <div class="vx-hatchleg">${Object.entries(HATCH).map(([t, [k, l]]) => `<span><svg viewBox="0 0 22 16"><defs>${patDef({pat: {kind: k, color: '#111', bg: '#fff', size: 5, width: .8}}, `vxhl${t}`)}</defs><rect width="22" height="16" fill="url(#vxhl${t})"/></svg>${esc(l.split(' :')[0])}</span>`).join('')}</div>
                <h4>Émaux (sur la sélection)</h4><div class="vx-sw">${TINCTURES.map(([t, l, h]) => `<button type="button" data-bl-tint="${t}" title="${esc(l)}" style="background:${h}"></button>`).join('')}${freeColor('data-bl-tintfree', selObjs()[0]?.fill, 'Couleur libre (hors des émaux du blason)')}</div>${recentColors().length ? `<div class="vx-sw vx-recent"><small>Récentes</small>${recentColors().map(c => `<button type="button" data-bl-tintc="${c}" title="${c}" style="background:${c}"></button>`).join('')}</div>` : ''}</div>`;
        }
        function paintBlasonPreview() {
            const box2 = pane.querySelector('[data-bl-prev]'); if (!box2) return;
            const {obj, blazon} = makeBlason(blasonState, {x: 0, y: 0, width: 100}); const defs = [];
            box2.innerHTML = `<svg viewBox="-4 -4 108 128" width="120" height="144">${(() => { const b2 = objSvg(obj, defs, 'bp'); return `<defs>${defs.join('')}</defs>${b2}`; })()}</svg>`;
            const t = pane.querySelector('[data-bl-text]'); if (t) t.textContent = blazon;
        }
        const blObs = new MutationObserver(() => { if (tab === 'blason' && pane.querySelector('[data-bl-prev]') && !pane.querySelector('[data-bl-prev] svg')) paintBlasonPreview(); }); blObs.observe(pane, {childList: true});
        pane.addEventListener('input', e => { if (!e.target.matches('[data-vx-chq]')) return; const q = e.target.value.trim().toLowerCase(), out = pane.querySelector('[data-vx-chres]'); if (q.length < 2 || !K()) { out.innerHTML = ''; return; }
            out.innerHTML = K().allShapes().filter(s => s.d && !s.mask && (s.n || '').toLowerCase().includes(q)).slice(0, 40).map(s => `<button type="button" data-bl-charge="${esc(s.k)}" title="${esc(s.n)}">${K().shapeSvg(s, 24)}</button>`).join('') || '<small class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien trouvé.</span></small>'; });
        function addCharge(key, fill) {
            const s = Math.min(doc.w, doc.h) * .25, d = chargeD(key, doc.w / 2, doc.h / 2, s); if (!d) return toast('Forme introuvable.', 'error');
            const sh = K().shapeByKey(key), one = dToPts(d), o = {id: uid(), type: one ? 'path' : 'svgpath', name: sh?.n || 'Meuble', fill, stroke: '#222222', sw: 0, evenodd: !!sh?.eo, ...(one ? {pts: one.pts, closed: one.closed} : {d})};
            cur().push(o); sel = [o.id]; commit('Meuble ajouté');
        }
        /* commandes */
        const idx = o => cur().indexOf(o);
        const sorted = () => selObjs().sort((a, b) => idx(a) - idx(b));
        async function exportImg(fmt, scale = 2) {
            const svg = await inlineMedia(docSvg(doc, {page: doc.pages?.[0] || null}));
            const c = await svgCanvas(svg, scale, fmt === 'png' || fmt === 'webp' ? '' : '#ffffff');
            return new Promise(ok => c.toBlob(ok, {png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp'}[fmt], .92));
        }
        const fname = ext2 => `${(A().safeExportFilename ? A().safeExportFilename(name || 'dessin', 'dessin') : 'dessin')}.${ext2}`;
        const download = (blob, n) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
        const CMDS = {
            undo: () => { if (laterT) { clearTimeout(laterT); laterT = 0; commit(); } restore(hi - 1); }, redo: () => { if (laterT) { clearTimeout(laterT); laterT = 0; commit(); } restore(hi + 1); },
            new: async () => { if (dirty && !await A().confirmBox('Ce qui n’est pas enregistré sera perdu.', {title: 'Commencer un nouveau dessin ?', okLabel: 'Nouveau sans enregistrer', danger: true})) return; docId = 0; name = 'Mon dessin'; $('[data-vx-name]').value = name; doc = newDoc(); sel = []; scope = []; newLayer(); hist = []; hi = -1; commit(); dirty = false; saved(''); fit(); },
            open: async () => { if (dirty && !await A().confirmBox('Ce qui n’est pas enregistré sera perdu.', {title: 'Ouvrir un autre dessin ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return; const docs = (await api('vector_docs').catch(() => ({docs: []}))).docs || []; if (!docs.length) return toast('Aucun dessin enregistré.', 'error');
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Ouvrir un dessin', body: `<div class="vx-open">${docs.map(d => `<label class="vx-openitem"><input type="radio" name="pick" value="${d.id}">${d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : '<span>✒️</span>'}<span>${esc(d.name)}</span></label>`).join('')}</div>`, submitLabel: 'Ouvrir',
                    onSubmit: async f => { const id = Number(f.querySelector('[name=pick]:checked')?.value); if (!id) return false; const r = await api('vector_doc', {id}); docId = r.id; name = r.name; $('[data-vx-name]').value = name; doc = cleanDoc(r.doc); sel = []; scope = []; hist = []; hi = -1; commit(); dirty = false; saved('saved'); fit(); }}); },
            save: () => saveDoc(),
            import: () => $('[data-vx-file]').click(),
            exp_svg: () => exportDialog('svg'),
            exp_sel: () => { const l = sorted(); if (!l.length) return toast('Choisis d’abord des objets.', 'error'); download(new Blob([docSvg(doc, {only: l, pad: 2})], {type: 'image/svg+xml'}), fname('svg')); },
            exp_png: () => exportDialog('png'), exp_jpg: () => exportDialog('jpg'), exp_webp: () => exportDialog('webp'), exp_pdf: () => exportDialog('pdf'),
            copysvg: () => navigator.clipboard?.writeText(docSvg(doc)).then(() => toast('Code SVG copié.')).catch(() => toast('Copie impossible ici.', 'error')),
            copypng: async () => { try { const b = await exportImg('png'); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); toast('Image copiée.'); } catch (_) { toast('Copie impossible ici : exporte en PNG.', 'error'); } },
            toshape: () => saveAsShape(), tomedia: () => saveToMedia(), tocoat: () => saveToCoat(),
            cut: () => { CMDS.copy(); CMDS.del(); }, copy: () => { const l = sorted(); if (l.length) { clip = clone(l); status(`${l.length} copié${l.length > 1 ? 's' : ''}`); } },
            paste: () => { if (!clip?.length) return; const copies = clip.map(o => { const c = clone(o); reId(c); return moveObj(c, 12, 12); }); clip = clone(copies); cur().push(...copies); sel = copies.map(o => o.id); commit('Collé'); },
            dup: () => { const l = sorted(); if (!l.length) return; const copies = l.map(o => { const c = clone(o); reId(c); return moveObj(c, 12, 12); }); cur().push(...copies); sel = copies.map(o => o.id); commit('Dupliqué'); },
            del: () => { if (nodeSel && tool === 'direct') { const o = byId(nodeSel.id); if (o?.pts?.length > 2) { o.pts.splice(nodeSel.i, 1); nodeSel = null; commit('Point supprimé'); return; } } const ids = new Set(selObjs().filter(o => !o.locked).map(o => o.id)); if (!ids.size) return; setCur(cur().filter(o => !ids.has(o.id))); sel = []; commit('Supprimé'); },
            all: () => { sel = cur().filter(o => !o.locked && !o.hidden).map(o => o.id); render(); }, none: () => { sel = []; nodeSel = null; render(); },
            group: () => { const l = sorted(); if (l.length < 2) return toast('Choisis au moins deux objets.', 'error'); const at = idx(l[l.length - 1]); const g = {id: uid(), type: 'group', name: 'Groupe', children: l}; setCur(cur().filter(o => !l.includes(o))); cur().splice(at - l.length + 1, 0, g); sel = [g.id]; commit('Groupé'); },
            ungroup: () => { const gs = selObjs().filter(o => o.type === 'group'); if (!gs.length) return; const out = []; gs.forEach(g => { const at = idx(g), kids = (g.children || []).map(c => { const c2 = clone(c); if (num(g.rot)) { const gb = box(g), cb = box(c2), r = num(g.rot) * Math.PI / 180, gx = gb.x + gb.w / 2, gy = gb.y + gb.h / 2, cx = cb.x + cb.w / 2, cy = cb.y + cb.h / 2; moveObj(c2, gx + (cx - gx) * Math.cos(r) - (cy - gy) * Math.sin(r) - cx, gy + (cx - gx) * Math.sin(r) + (cy - gy) * Math.cos(r) - cy); c2.rot = (num(c2.rot) + num(g.rot)) % 360; } if (num(g.op, 1) < 1) c2.op = num(c2.op, 1) * num(g.op, 1); return c2; });
                    if (g.clip) toast('Le masque d’écrêtage est retiré en dissociant.'); cur().splice(at, 1, ...kids); out.push(...kids.map(k => k.id)); }); sel = out; commit('Dissocié'); },
            clipmask: () => { const l = sorted(); if (l.length < 2) return toast('Choisis la forme qui découpe (au-dessus) et ce qu’elle découpe.', 'error'); const top = l[l.length - 1]; if (!shapeD(top)) return toast('L’objet du dessus doit être une forme ou un tracé.', 'error'); const rest = l.slice(0, -1), at = idx(rest[rest.length - 1]) - (rest.length - 1); const g = {id: uid(), type: 'group', name: 'Masque', clip: clone(top), children: rest}; setCur(cur().filter(o => !l.includes(o))); cur().splice(clamp(at, 0, cur().length), 0, g); sel = [g.id]; commit('Masque d’écrêtage'); },
            unclip: () => { const g = selObjs().find(o => o.type === 'group' && o.clip); if (!g) return; const shape = {...clone(g.clip), id: uid(), fill: 'none', stroke: '#888888', sw: 1, name: 'Ancien masque'}; delete g.clip; cur().splice(idx(g) + 1, 0, shape); commit('Masque retiré'); },
            front: () => { const l = sorted(); setCur([...cur().filter(o => !l.includes(o)), ...l]); commit('Premier plan'); }, bottom: () => { const l = sorted(); setCur([...l, ...cur().filter(o => !l.includes(o))]); commit('Arrière-plan'); },
            fwd: () => { const l = sorted().reverse(); l.forEach(o => { const i = idx(o); if (i < cur().length - 1 && !l.includes(cur()[i + 1])) [cur()[i], cur()[i + 1]] = [cur()[i + 1], cur()[i]]; }); commit('Avancé'); },
            back: () => { const l = sorted(); l.forEach(o => { const i = idx(o); if (i > 0 && !l.includes(cur()[i - 1])) [cur()[i], cur()[i - 1]] = [cur()[i - 1], cur()[i]]; }); commit('Reculé'); },
            flipH: () => { const l = selObjs(), b = unionBox(l); if (!b) return; l.forEach(o => { mapObj(o, (x, y) => [2 * b.x + b.w - x, y]); if (num(o.rot)) o.rot = 360 - num(o.rot); }); commit('Retourné'); },
            flipV: () => { const l = selObjs(), b = unionBox(l); if (!b) return; l.forEach(o => { mapObj(o, (x, y) => [x, 2 * b.y + b.h - y]); if (num(o.rot)) o.rot = 360 - num(o.rot); }); commit('Retourné'); },
            rot90: () => { selObjs().forEach(o => { o.rot = (num(o.rot) + 90) % 360; }); commit('Tourné'); },
            topath: () => { let n = 0; sel.forEach(id => { const o = byId(id), i = idx(o); if (o && ['rect', 'ellipse', 'polygon', 'star'].includes(o.type)) { cur()[i] = toPath(o); n++; } else if (o?.type === 'svgpath') { const c = dToPts(o.d); if (c) { const p = {...o, type: 'path', pts: c.pts, closed: c.closed}; delete p.d; cur()[i] = p; n++; } } }); if (n) commit('Converti en tracé'); else toast('Rien à convertir.', 'error'); },
            outline: () => { const l = sorted().filter(o => num(o.sw)); if (!l.length) return toast('Choisis un objet qui a un contour.', 'error'); const d = rasterOp(l, 'outline'); if (!d) return; const o = {id: uid(), type: 'svgpath', name: 'Contour', d, fill: l[0].stroke || '#000', sw: 0, evenodd: true}; cur().splice(idx(l[l.length - 1]) + 1, 0, o); sel = [o.id]; commit('Contour → forme'); },
            lock: () => { const l = selObjs(); const v = !l.every(o => o.locked); l.forEach(o => { o.locked = v; }); commit(v ? 'Verrouillé' : 'Déverrouillé'); }, hide: () => { selObjs().forEach(o => { o.hidden = true; }); sel = []; commit('Masqué'); }, showall: () => { cur().forEach(o => { o.hidden = false; }); commit('Tout affiché'); },
            zin: () => { const r = stage.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); }, zout: () => { const r = stage.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); }, zfit: () => fit(), z100: () => { const r = stage.getBoundingClientRect(); zoomAt(1 / zoom, r.width / 2, r.height / 2); },
            grid: () => { tab = 'doc'; paintPanel(); },
            persp: () => ext.vectorPlus?.perspDialog(doc, {redraw: drawGrid, commit}),
            blason: () => { tab = 'blason'; paintPanel(); }, charge: () => { tab = 'blason'; paintPanel(); setTimeout(() => pane.querySelector('[data-vx-chq]')?.focus(), 30); },
            vectorize: () => vectorizeDialog(),
            map_on: () => { doc.map = {...(doc.map || {}), on: !doc.map?.on}; tab = 'map'; commit(doc.map.on ? 'Mode Plan' : 'Mode Plan désactivé'); },
            map_tab: () => { if (!doc.map?.on) { doc.map = {...(doc.map || {}), on: true}; commit('Mode Plan'); } tab = 'map'; paintPanel(); },
            map_base: () => { tab = 'map'; paintPanel(); MP?.basemap(); }, map_ref: () => { tab = 'map'; paintPanel(); MP?.refimg(); },
            map_layers: () => { tab = 'layers'; MP?.layers(); }, map_places: () => MP?.places(), map_links: () => MP?.links(),
            textpath: () => { const o = selObjs().length === 1 ? selObjs()[0] : null; if (o && ['rect', 'ellipse', 'polygon', 'star', 'path', 'svgpath'].includes(o.type) && !o.map && !o.locked) { const t = textPathFrom(o); if (t) { cur().splice(idx(o) + 1, 0, t); sel = [t.id]; tab = 'props'; commit('Texte sur une courbe'); setTimeout(() => { const ta = pane.querySelector('[data-vx-p="text"]'); ta?.focus(); ta?.select(); }, 40); return; } } textPathDialog(); },
            ornaments: () => { tab = 'orn'; paintPanel(); setTimeout(() => pane.querySelector('[data-vx-ornq]')?.focus(), 40); },
            hatch: () => hatchHeraldic(true), unhatch: () => hatchHeraldic(false),
            alto_sel: () => { alignTo = 'sel'; try { localStorage.setItem(ALTO_KEY, 'sel'); } catch (_) {} toast('Aligner : par rapport à la sélection.'); paintPanel(); },
            alto_art: () => { alignTo = 'art'; try { localStorage.setItem(ALTO_KEY, 'art'); } catch (_) {} toast('Aligner : par rapport au plan de travail (ou à la page, au volet).'); paintPanel(); },
            folds: () => { showFolds = !showFolds; try { localStorage.setItem(FOLD_KEY, showFolds ? '1' : '0'); } catch (_) {} drawPages(); if (!doc.pages) toast('Ce dessin n’a qu’une page : les repères de pli servent aux faire-part pliés.'); },
            importmedia: async () => { const P2 = window.LCNDA_PICKER || A(); if (!P2?.openMediaPicker) return toast('La fenêtre des images n’est pas chargée.', 'error'); const m = await P2.openMediaPicker({types: ['image'], eyebrow: 'DESSIN VECTORIEL', title: 'Une image dans le dessin', okLabel: 'Poser l’image'}); if (m?.filename) await placeMediaImage(m.filename, m.title || m.filename); },
            xd_pdf: () => exportDialog('pdf'), xd_png: () => exportDialog('png'), xd_jpg: () => exportDialog('jpg'), xd_svg: () => exportDialog('svg'), xd_webp: () => exportDialog('webp'), xd_print: () => exportDialog('print'), xd_file: () => exportDialog('file'),
            smart: () => { smart = !smart; try { localStorage.setItem(SMART_KEY, smart ? '1' : '0'); } catch (_) {} sbar?.sync(); toast(smart ? '🧲 Aimanter : en déplaçant, les objets se collent aux autres (⌘ pour s’en passer).' : '🧲 Aimanter : arrêté.'); },
            simplify: () => { const l = selObjs().filter(o => o.type === 'path' && !o.locked && (o.pts || []).length > 3); if (!l.length) return toast('Choisis un tracé (Objet → Convertir en tracé si besoin).', 'error');
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Simplifier le tracé', submitLabel: 'Simplifier', body: `<p class="muted">Retire les points en trop (un trait au crayon, un dessin vectorisé…) en gardant l’allure.</p><label>Force <input type="range" name="t" min="1" max="40" value="6"></label><label class="checkbox-line"><input type="checkbox" name="smooth" checked> Lisser les courbes</label>`,
                    onSubmit: f => { const tol = num(f.querySelector('[name=t]').value, 6) / zoom, smooth = f.querySelector('[name=smooth]').checked; let before = 0, after = 0;
                        l.forEach(o => { before += o.pts.length; const xy = o.pts.map(q => [q.x, q.y]); const rdp = (pp, eps) => { if (pp.length < 3) return pp; let dm = 0, ix = 0; const [ax, ay] = pp[0], [bx, by] = pp[pp.length - 1], L = Math.hypot(bx - ax, by - ay) || 1; for (let i = 1; i < pp.length - 1; i++) { const dd = Math.abs((by - ay) * pp[i][0] - (bx - ax) * pp[i][1] + bx * ay - by * ax) / L; if (dd > dm) { dm = dd; ix = i; } } return dm > eps ? [...rdp(pp.slice(0, ix + 1), eps).slice(0, -1), ...rdp(pp.slice(ix), eps)] : [pp[0], pp[pp.length - 1]]; };
                            const keep = rdp(o.closed ? [...xy, xy[0]] : xy, tol); if (o.closed) keep.pop(); if (keep.length < 2) return; const n = keep.length;
                            o.pts = keep.map((q, i) => { if (!smooth) return P(q[0], q[1]); const a = keep[o.closed ? (i - 1 + n) % n : Math.max(0, i - 1)], c = keep[o.closed ? (i + 1) % n : Math.min(n - 1, i + 1)], t = [(c[0] - a[0]) / 6, (c[1] - a[1]) / 6]; return P(q[0], q[1], [q[0] - t[0], q[1] - t[1]], [q[0] + t[0], q[1] + t[1]]); }); after += o.pts.length; });
                        commit('Tracé simplifié'); toast(`${before} → ${after} points.`); }}); },
            transform: () => { const l = selObjs().filter(o => !o.locked); if (!l.length) return toast('Choisis d’abord des objets.', 'error');
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Transformer', submitLabel: 'Appliquer', body: `<p class="muted">Autour du centre de la sélection. Avec des copies, chaque copie reprend la transformation de la précédente (une frise, un dégradé de tailles…).</p>
                    <div class="vx-grid2"><label>Échelle horizontale<input data-unit="%" name="sx" type="number" value="100" step="1"></label><label>Échelle verticale<input data-unit="%" name="sy" type="number" value="100" step="1"></label>
                    <label>Inclinaison horizontale<input data-unit="°" name="kx" type="number" value="0" min="-80" max="80"></label><label>Inclinaison verticale<input data-unit="°" name="ky" type="number" value="0" min="-80" max="80"></label>
                    <label>Rotation<input data-unit="°" name="r" type="number" value="0"></label><label>Copies<input name="n" type="number" value="0" min="0" max="200"></label>
                    <label>Décalage X<input name="dx" type="number" value="0"></label><label>Décalage Y<input name="dy" type="number" value="0"></label></div>`,
                    onSubmit: f => { const v = k => num(f.querySelector(`[name=${k}]`).value), sx = v('sx') / 100 || 1, sy = v('sy') / 100 || 1, kx = Math.tan(clamp(v('kx'), -80, 80) * Math.PI / 180), ky = Math.tan(clamp(v('ky'), -80, 80) * Math.PI / 180), r = v('r'), n = clamp(Math.round(v('n')), 0, 200), mx = v('dx'), my = v('dy');
                        const step = list => { const b = unionBox(list), cx = b.x + b.w / 2, cy = b.y + b.h / 2, ra = r * Math.PI / 180;
                            return list.map(o0 => { let o = (kx || ky) && ['rect', 'ellipse', 'polygon', 'star'].includes(o0.type) ? toPath(o0) : o0;
                                mapObj(o, (x, y) => { const X = (x - cx) * sx, Y = (y - cy) * sy; return [cx + X + kx * Y + mx, cy + Y + ky * X + my]; }, Math.sqrt(Math.abs(sx * sy)));
                                if (r) { const ob = box(o), ocx = ob.x + ob.w / 2, ocy = ob.y + ob.h / 2; if (list.length > 1 || n) moveObj(o, cx + mx + (ocx - cx - mx) * Math.cos(ra) - (ocy - cy - my) * Math.sin(ra) - ocx, cy + my + (ocx - cx - mx) * Math.sin(ra) + (ocy - cy - my) * Math.cos(ra) - ocy); o.rot = ((num(o.rot) + r) % 360 + 360) % 360; }
                                return o; }); };
                        if (!n) { const out = step(l); out.forEach((o, i) => { const at = cur().indexOf(l[i]); if (at >= 0) cur()[at] = o; }); commit('Transformé'); return; }
                        let prev = l, made = []; for (let k = 0; k < n; k++) { const copies = prev.map(o => { const c = clone(o); reId(c); return c; }); prev = step(copies); made.push(...prev); }
                        cur().push(...made); sel = made.map(o => o.id); commit(`${n} copie${n > 1 ? 's' : ''} transformée${n > 1 ? 's' : ''}`); }}); },
            repeat_circle: () => { const l = selObjs().filter(o => !o.locked); if (!l.length) return toast('Choisis d’abord des objets.', 'error'); const b = unionBox(l);
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Répétition en cercle', submitLabel: 'Répéter', body: `<p class="muted">Des copies tournent autour d’un centre (une rosace, une couronne de meubles autour d’un écu…). Le tout devient un groupe.</p>
                    <div class="vx-grid2"><label>Nombre (avec l’original)<input name="n" type="number" value="8" min="2" max="120"></label><label>Centre<select name="c"><option value="below">Sous la sélection (rosace)</option><option value="art">Centre du plan de travail</option><option value="self">Centre de la sélection</option></select></label>
                    <label>Distance au centre (si « sous la sélection »)<input name="d" type="number" value="${n2(Math.max(b.w, b.h))}"></label><label class="checkbox-line"><input type="checkbox" name="turn" checked> Tourner chaque copie</label></div>`,
                    onSubmit: f => { const n = clamp(Math.round(num(f.querySelector('[name=n]').value, 8)), 2, 120), mode = f.querySelector('[name=c]').value, dd = num(f.querySelector('[name=d]').value, b.h), turn = f.querySelector('[name=turn]').checked;
                        const c = mode === 'art' ? [doc.w / 2, doc.h / 2] : mode === 'self' ? [b.x + b.w / 2, b.y + b.h / 2] : [b.x + b.w / 2, b.y + b.h / 2 + dd];
                        const all = [...l]; for (let k = 1; k < n; k++) { const a = 2 * Math.PI * k / n, deg = 360 * k / n; l.forEach(o0 => { const o = clone(o0); reId(o); const ob = box(o), ocx = ob.x + ob.w / 2, ocy = ob.y + ob.h / 2; moveObj(o, c[0] + (ocx - c[0]) * Math.cos(a) - (ocy - c[1]) * Math.sin(a) - ocx, c[1] + (ocx - c[0]) * Math.sin(a) + (ocy - c[1]) * Math.cos(a) - ocy); if (turn) o.rot = ((num(o.rot) + deg) % 360 + 360) % 360; all.push(o); }); }
                        const at = Math.min(...l.map(o => cur().indexOf(o))), g = {id: uid(), type: 'group', name: 'Répétition en cercle', children: all}; setCur(cur().filter(o => !l.includes(o))); cur().splice(clamp(at, 0, cur().length), 0, g); sel = [g.id]; commit('Répétition en cercle'); }}); },
            blend: () => { const l = sorted().filter(o => !o.locked && !['group', 'text', 'textpath', 'image', 'msym', 'mdeco'].includes(o.type)); if (l.length !== 2 || !ext.vectorPlus) return toast('Choisis exactement deux formes (rectangle, ellipse, étoile, tracé…).', 'error'); // ⧉ heritage-vector-plus.js
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: '⧉ Mélange de deux formes', submitLabel: 'Mélanger', body: '<p class="muted">Des formes intermédiaires entre les deux choisies : la forme, les couleurs, l’épaisseur et l’opacité passent peu à peu de l’une à l’autre. Le tout devient un groupe.</p><label>Nombre d’étapes<input name="n" type="number" value="6" min="1" max="200"></label>',
                    onSubmit: f => { const n = clamp(Math.round(num(f.querySelector('[name=n]').value, 6)), 1, 200), mids = ext.vectorPlus.blend(toPath(clone(l[0])), toPath(clone(l[1])), n, uid); if (!mids.length) { toast('Ces formes ne se mélangent pas.', 'error'); return false; }
                        const at = Math.min(...l.map(o => cur().indexOf(o))), g = {id: uid(), type: 'group', name: 'Mélange', children: [l[0], ...mids, l[1]]}; setCur(cur().filter(o => !l.includes(o))); cur().splice(clamp(at, 0, cur().length), 0, g); sel = [g.id]; commit('Mélange de formes'); }}); },
            repeat_grid: () => { const l = selObjs().filter(o => !o.locked); if (!l.length) return toast('Choisis d’abord des objets.', 'error'); const b = unionBox(l);
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Répétition en grille', submitLabel: 'Répéter', body: `<p class="muted">Des copies en lignes et colonnes (un semé d’hermines, de fleurs de lys…). Le tout devient un groupe.</p><div class="vx-grid2"><label>Colonnes<input name="c" type="number" value="4" min="1" max="60"></label><label>Lignes<input name="r" type="number" value="3" min="1" max="60"></label><label>Écart horizontal<input name="gx" type="number" value="${n2(b.w * .5)}"></label><label>Écart vertical<input name="gy" type="number" value="${n2(b.h * .5)}"></label></div><label class="checkbox-line"><input type="checkbox" name="stag"> Une ligne sur deux décalée (en quinconce)</label>`,
                    onSubmit: f => { const v = k => num(f.querySelector(`[name=${k}]`).value), C = clamp(Math.round(v('c')), 1, 60), R = clamp(Math.round(v('r')), 1, 60), gx = v('gx'), gy = v('gy'), st = f.querySelector('[name=stag]').checked; if (C * R * l.length > 4000) { toast('Trop de copies (4 000 au plus).', 'error'); return false; }
                        const all = []; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { if (!r && !c) { all.push(...l); continue; } l.forEach(o0 => { const o = clone(o0); reId(o); moveObj(o, c * (b.w + gx) + (st && r % 2 ? (b.w + gx) / 2 : 0), r * (b.h + gy)); all.push(o); }); }
                        const at = Math.min(...l.map(o => cur().indexOf(o))), g = {id: uid(), type: 'group', name: 'Répétition en grille', children: all}; setCur(cur().filter(o => !l.includes(o))); cur().splice(clamp(at, 0, cur().length), 0, g); sel = [g.id]; commit('Répétition en grille'); }}); },
        };
        const pf = op => () => { const l = sorted().filter(o => o.type !== 'image'); if (l.length < 2) return toast('Choisis au moins deux formes.', 'error'); status('Calcul…'); setTimeout(() => { const d = rasterOp(l, op); if (d === null) return; if (!d) { status(''); return toast('Le résultat est vide (les formes ne se touchent pas ?).', 'error'); } const base = l[0], o = {id: uid(), type: 'svgpath', name: {union: 'Réunion', subtract: 'Soustraction', intersect: 'Intersection', exclude: 'Exclusion'}[op], d, fill: base.fill === 'none' ? '#000000' : base.fill, grad: base.grad, stroke: base.stroke, sw: base.sw, evenodd: true}; if (!o.grad) delete o.grad; const at = idx(l[0]); setCur(cur().filter(x => !l.includes(x))); cur().splice(Math.min(at, cur().length), 0, o); sel = [o.id]; commit(o.name); }, 20); };
        Object.assign(CMDS, {pf_union: pf('union'), pf_subtract: pf('subtract'), pf_intersect: pf('intersect'), pf_exclude: pf('exclude')});
        /* 📐 Fichier → Format du document / plans de travail (comme Illustrator) : taille (liste commune ou format libre), unité, sens, résolution, fond ;
           les objets restent en place ou sont remis à l'échelle ; une seule étape de l'historique (↶), enregistrée avec le dessin */
        const bleedMm = () => (Number.isFinite(Number(doc.bleed)) && doc.bleed !== null && doc.bleed !== '' ? clamp(Number(doc.bleed), 0, 20) : 3);
        const fmtOfDoc = () => window.LCNDA_FORMATS.fromSize(doc.w / MM, doc.h / MM, 'mm', doc.dpi || 300, doc.unit || 'cm');
        function docFormatDialog() {
            const F = window.LCNDA_FORMATS; if (!F) return toast('La liste des formats n’est pas chargée.', 'error');
            const pg = doc.pages || [], multi = pg.length > 0, transparent = doc.bg === 'transparent';
            const boards = multi ? `<fieldset><legend>Plans de travail (${pg.length})</legend><ol class="vx-pagelist">${pg.map(p => `<li><span>${esc(p.name)}</span><small>${cmTxt(p.w)} × ${cmTxt(p.h)} cm</small></li>`).join('')}</ol><p class="muted">Ce dessin a plusieurs pages (${esc(FOLDN[doc.fold?.mode] || 'pages')}) : leur taille vient du pliage choisi. Tu peux changer ici le fond, l’unité et la résolution.</p></fieldset>` : '';
            const dlg0 = ext.openDialog({eyebrow: 'DOCUMENT', title: '📐 Format du document', wide: true, submitLabel: 'Enregistrer',
                body: `<div class="fmt-dlg-grid"><div>${multi ? boards : `<fieldset><legend>Plan de travail</legend>${F.boxHtml({value: fmtOfDoc(), units: ['mm', 'cm', 'px', 'in'], dpi: true, hint: 'résolution proposée à l’export en image (PNG, JPG, PDF)'})}</fieldset>`}
                    ${multi ? `<fieldset><legend>Unité et résolution</legend><div class="fmt-row"><label><span>Unité montrée</span><select name="vx_unit">${Object.entries(F.UNITS).map(([k, l]) => `<option value="${k}"${(doc.unit || 'cm') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label><span>Résolution</span><input data-unit="ppp" type="number" name="vx_dpi" min="36" max="1200" value="${doc.dpi || 300}"></label></div></fieldset>` : ''}
                    <fieldset><legend>Fond</legend><label class="checkbox-line"><input type="checkbox" name="vx_transp"${transparent ? ' checked' : ''}> Transparent (PNG, SVG)</label><label data-vx-fbgc${transparent ? ' hidden' : ''}><span>Couleur du fond</span><input type="color" name="vx_bg" value="${esc(/^#[0-9a-f]{6}$/i.test(doc.bg) ? doc.bg : '#ffffff')}"></label></fieldset>
                    <fieldset><legend>Fond perdu</legend><label><span data-help="La marge ajoutée autour de chaque page à l’export « avec fond perdu et traits de coupe », pour que l’imprimeur coupe sans liseré blanc. 3 mm le plus souvent.">Fond perdu</span><input type="number" name="vx_bleed" data-unit="mm" min="0" max="20" step="0.5" value="${bleedMm()}"></label></fieldset></div>
                    <div>${multi ? '' : `<fieldset><legend>Les objets</legend><label class="checkbox-line"><input type="radio" name="vx_objs" value="keep" checked> Restent en place (le plan de travail s’agrandit ou rétrécit autour)</label><label class="checkbox-line"><input type="radio" name="vx_objs" value="scale"> Sont remis à l’échelle (agrandis ou réduits avec le plan, centrés)</label><label class="checkbox-line"><input type="radio" name="vx_objs" value="center"> Restent à leur taille, recentrés</label></fieldset>`}
                    <dl class="fmt-before-after"><dt>Maintenant</dt><dd>${cmTxt(doc.w)} × ${cmTxt(doc.h)} cm</dd><dt>Après</dt><dd data-vx-fafter>—</dd></dl><p class="muted">↶ Annuler (⌘Z) revient au format d’avant.</p></div></div>`,
                onOpen: d => {
                    const box = F.bindBox(d.querySelector('[data-fmt-box]'), {onChange: () => after()});
                    const after = () => { const o = d.querySelector('[data-vx-fafter]'); if (!o || !box) return; const [w, h] = F.inMm(box.get()); o.textContent = `${String(Math.round(w) / 10).replace('.', ',')} × ${String(Math.round(h) / 10).replace('.', ',')} cm`; };
                    after();
                    d.querySelector('[name=vx_transp]').addEventListener('change', e => { d.querySelector('[data-vx-fbgc]').hidden = e.target.checked; });
                },
                onSubmit: f => {
                    const transp = f.querySelector('[name=vx_transp]').checked, bg = transp ? 'transparent' : col(f.querySelector('[name=vx_bg]').value, '#ffffff');
                    doc.bleed = Math.round(clamp(num(f.querySelector('[name=vx_bleed]')?.value, 3), 0, 20) * 10) / 10; if (doc.bleed === 3) delete doc.bleed; // 3 mm : celui de départ
                    if (multi) { doc.unit = ['mm', 'cm', 'px', 'in'].includes(f.querySelector('[name=vx_unit]').value) ? f.querySelector('[name=vx_unit]').value : 'cm'; doc.dpi = clamp(Math.round(num(f.querySelector('[name=vx_dpi]').value, 300)), 36, 1200); doc.bg = bg; commit('Format du document'); return; }
                    const box = F.bindBox(f.querySelector('[data-fmt-box]')), v = box.get(), [mw, mh] = F.inMm(v), W = n2(mw * MM), H = n2(mh * MM);
                    if (W < 10 || H < 10 || W > 20000 || H > 20000) return UI()?.fail ? UI().fail(f.querySelector('[data-fmt-w]'), 'Choisis une taille entre 3 mm et 5 m de côté.') : false;
                    const how = f.querySelector('[name=vx_objs]:checked')?.value || 'keep', W0 = doc.w, H0 = doc.h;
                    if (how === 'scale' || how === 'center') { const k = how === 'scale' ? Math.min(W / W0, H / H0) : 1, dx = (W - W0 * k) / 2, dy = (H - H0 * k) / 2, fn = (x, y) => [x * k + dx, y * k + dy];
                        doc.objs.forEach(o => mapObj(o, fn, k));
                        if (doc.ref && Number.isFinite(Number(doc.ref.x))) { const [rx, ry] = fn(num(doc.ref.x), num(doc.ref.y)); doc.ref = {...doc.ref, x: rx, y: ry, w: num(doc.ref.w) * k, h: num(doc.ref.h) * k}; } }
                    const used = F.use('dessin', v);
                    doc.w = W; doc.h = H; doc.unit = v.unit; doc.dpi = v.dpi; doc.fmt = used?.id || v.id; doc.bg = bg;
                    commit(`Format du document : ${F.label(used || v)}`); fit();
                }});
            return dlg0;
        }
        async function docInfoDialog() {
            const F = window.LCNDA_FORMATS; if (!F) return;
            const v = await F.openInfoDialog({value: {title: name, ...(doc.info || {})}, keys: ['title', 'author', 'subject', 'desc', 'keywords', 'rights', 'lang', 'date'], what: 'Ces informations vont dans le SVG (title, desc, metadata) et le PDF exportés.'});
            if (!v) return;
            doc.info = cleanInfo(v); if (!Object.keys(doc.info).length) delete doc.info;
            commit('Informations du document');
        }
        Object.assign(CMDS, {docformat: docFormatDialog, docinfo: docInfoDialog});
        const align = k => () => { const l = selObjs().filter(o => !o.locked); if (!l.length) return toast('Choisis d’abord un ou plusieurs objets.', 'error'); const ub = unionBox(l), art = k === 'al_art' || l.length === 1 || alignTo === 'art', ref = art ? pageAt(ub.x + ub.w / 2, ub.y + ub.h / 2) : ub;
            if (k === 'di_h' || k === 'di_v') { if (l.length < 3) return toast('Il faut au moins trois objets.', 'error'); const h2 = k === 'di_h', s = [...l].sort((a, b) => h2 ? rbox(a).x - rbox(b).x : rbox(a).y - rbox(b).y), tot = s.reduce((a, o) => a + (h2 ? rbox(o).w : rbox(o).h), 0), gap = ((h2 ? ref.w : ref.h) - tot) / (s.length - 1); let p = h2 ? ref.x : ref.y; s.forEach(o => { const b = rbox(o); moveObj(o, h2 ? p - b.x : 0, h2 ? 0 : p - b.y); p += (h2 ? b.w : b.h) + gap; }); commit('Réparti'); return; }
            l.forEach(o => { const b = rbox(o); const dx = {al_l: ref.x - b.x, al_c: ref.x + ref.w / 2 - b.x - b.w / 2, al_r: ref.x + ref.w - b.x - b.w, al_art: ref.x + ref.w / 2 - b.x - b.w / 2}[k] || 0, dy = {al_t: ref.y - b.y, al_m: ref.y + ref.h / 2 - b.y - b.h / 2, al_b: ref.y + ref.h - b.y - b.h, al_art: ref.y + ref.h / 2 - b.y - b.h / 2}[k] || 0; moveObj(o, dx, dy); }); commit('Aligné'); };
        ['al_l', 'al_c', 'al_r', 'al_t', 'al_m', 'al_b', 'di_h', 'di_v', 'al_art'].forEach(k => { CMDS[k] = align(k); });
        const reId = o => { o.id = uid(); (o.children || []).forEach(reId); if (o.clip) o.clip.id = uid(); };
        dlg.addEventListener('click', e => {
            const c = e.target.closest('[data-vx-cmd]'); if (c) { c.closest('details')?.removeAttribute('open'); try { const r = CMDS[c.dataset.vxCmd]?.(); r?.catch?.(err => toast(err.message, 'error')); } catch (err) { toast(err.message, 'error'); } return; }
            const cr = e.target.closest('[data-vx-crumb]'); if (cr) { const n = clamp(Number(cr.dataset.vxCrumb) || 0, 0, scope.length); scope = scope.slice(0, n); sel = []; nodeSel = null; render(); return; }
            const t = e.target.closest('[data-vx-tool]'); if (t) { setTool(t.dataset.vxTool); return; }
            const tb = e.target.closest('[data-vx-tab],[data-vx-tab-go]'); if (tb) { tab = tb.dataset.vxTab || tb.dataset.vxTabGo; paintPanel(); return; }
            if (!e.target.closest('details.vx-menu')) dlg.querySelectorAll('details.vx-menu[open]').forEach(d => d.removeAttribute('open'));
        });
        dlg.addEventListener('toggle', e => { if (e.target.matches?.('details.vx-menu') && e.target.open) dlg.querySelectorAll('details.vx-menu[open]').forEach(d => { if (d !== e.target) d.removeAttribute('open'); }); }, true);
        /* clavier */
        const onKey = e => {
            if (!dlg.isConnected) { document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); return; }
            if (!dlg.open || document.querySelector('dialog[open]:not(.vx-dlg)') && document.activeElement?.closest('dialog') !== dlg) return;
            const typing = e.target.closest?.('input, textarea, select, [contenteditable]'), mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
            if (mod && k === 's') { e.preventDefault(); saveDoc(); return; }
            if (typing) { if (k === 'escape' && typing.closest('.vx-dlg, dialog') === dlg) { e.preventDefault(); e.stopPropagation(); typing.blur?.(); try { stage.focus({preventScroll: true}); } catch (_) {} } return; } // Échap pendant la saisie d'un texte : on quitte le champ (sans proposer de fermer)
            if (k === ' ' && !space) { space = true; stage.dataset.tool = 'hand'; e.preventDefault(); return; }
            const map = mod ? {z: e.shiftKey ? 'redo' : 'undo', y: 'redo', c: 'copy', x: 'cut', v: null, d: 'dup', a: 'all', g: e.shiftKey ? 'ungroup' : 'group', i: 'import', 0: 'zfit', 1: 'z100', '=': 'zin', '+': 'zin', '-': 'zout', 7: 'clipmask', ']': e.shiftKey ? 'front' : 'fwd', '[': e.shiftKey ? 'bottom' : 'back', '}': 'front', '{': 'bottom'} : {};
            if (mod && k in map) { if (map[k]) { e.preventDefault(); CMDS[map[k]](); } return; }
            if ((k === 'delete' || k === 'backspace') && penPath) { e.preventDefault(); penPath.pts.pop(); if (!penPath.pts.length) { penPath = null; penHover = null; } render(); return; }
            if (k === 'delete' || k === 'backspace') { e.preventDefault(); CMDS.del(); return; }
            if (k === 'escape') { e.preventDefault(); if (tool === 'mref') setTool('select'); else if (penPath) finishPen(); else if (sel.length) CMDS.none(); else if (scope.length) { scope = scope.slice(0, -1); render(); } else close(); return; } // rien à désélectionner : Échap ferme (avec la question s'il reste des modifications)
            if (k === 'enter' && penPath) { finishPen(); return; }
            if (k.startsWith('arrow') && sel.length) { e.preventDefault(); const s2 = e.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -s2 : k === 'arrowright' ? s2 : 0, dy = k === 'arrowup' ? -s2 : k === 'arrowdown' ? s2 : 0; selObjs().filter(o => !o.locked).forEach(o => moveObj(o, dx, dy)); clearTimeout(laterT); renderNoPanel(); laterT = setTimeout(() => { laterT = 0; commit('Déplacé'); }, 400); return; }
            if (!mod && !e.altKey && e.shiftKey && k === 'x') { e.preventDefault(); fsSwap(); return; } // ⇧X : intervertir remplissage et contour (comme Illustrator)
            if (!mod && !e.altKey) { const t = TOOLS.find(x => x[3].toLowerCase() === k); if (t) { setTool(t[0]); e.preventDefault(); } }
        };
        const onKeyUp = e => { if (e.key === ' ') { space = false; stage.dataset.tool = tool; } };
        document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
        /* coller : image, SVG, objets copiés */
        const onPaste = e => {
            if (!dlg.isConnected) { document.removeEventListener('paste', onPaste); return; }
            if (!dlg.open || e.target.closest?.('input, textarea')) return;
            const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); dropFiles([f]); return; }
            const t = e.clipboardData?.getData('text/plain') || ''; if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t)) { e.preventDefault(); addImported(importSvgText(t), 'SVG collé'); return; }
            if (clip?.length) { e.preventDefault(); CMDS.paste(); }
        };
        document.addEventListener('paste', onPaste);
        /* import */
        const fileToDataUrl = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(new Error('Lecture impossible.')); r.readAsDataURL(f); });
        /** une image de n'importe quel format lisible par le navigateur → PNG ou JPG en data URL (réduite à 2400 px au plus) */
        async function normImage(src, type = '') {
            const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Format d’image non lu par ce navigateur.')); i.src = src; });
            const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight)); if (k === 1 && /^data:image\/(png|jpeg|webp|gif);base64,/.test(src) && src.length < 6e6) return {src, w: img.naturalWidth, h: img.naturalHeight};
            const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            return {src: c.toDataURL(/jpe?g/i.test(type) ? 'image/jpeg' : 'image/png', .9), w: c.width, h: c.height};
        }
        function addImported(objs, label) {
            if (!objs.length) return toast('Rien de lisible dans ce fichier.', 'error');
            const b = unionBox(objs); if (b && (b.w > doc.w || b.h > doc.h)) { const f = Math.min(doc.w / b.w, doc.h / b.h) * .9; objs.forEach(o => mapObj(o, (x, y) => [(x - b.x) * f, (y - b.y) * f], f)); }
            const b2 = unionBox(objs); if (b2) objs.forEach(o => moveObj(o, (doc.w - b2.w) / 2 - b2.x, (doc.h - b2.h) / 2 - b2.y));
            cur().push(...objs); sel = objs.map(o => o.id); setTool('select'); commit(label);
        }
        async function importFile(f) {
            if (!f) return; if (f.size > 25e6) return toast('Fichier trop gros (25 Mo au plus).', 'error');
            try {
                if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) { addImported(importSvgText(await f.text()), `SVG importé : ${f.name}`); return; }
                if (/\.json$/i.test(f.name) || f.type === 'application/json') { await openDrawingFile(f); return; }
                const im = await normImage(await fileToDataUrl(f), f.type), k = Math.min(1, doc.w * .9 / im.w, doc.h * .9 / im.h);
                addImported([{id: uid(), type: 'image', name: f.name.slice(0, 40) || 'Image', src: im.src, x: 0, y: 0, w: im.w * k, h: im.h * k}], `Image importée : ${f.name}`);
                hint('Image importée : Blason → « Vectoriser une image » la transforme en tracés modifiables.');
            } catch (e) { toast(e.message, 'error'); }
        }
        $('[data-vx-file]').addEventListener('change', e => { importFile(e.target.files?.[0]); e.target.value = ''; });
        if (UI()?.bindFileDrop) UI().bindFileDrop(stage, files => dropFiles(files), {accept: 'image/*,.svg,image/svg+xml,.json,application/json,.bmp,.tif,.tiff,.ico,.avif', paste: false});
        else { stage.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); }); stage.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); dropFiles([f]); } }); }
        // ❦ un ornement glissé depuis le panneau : posé où on le lâche
        const ORN_MIME = 'application/x-lcnda-ornement';
        pane.addEventListener('dragstart', e => { const b = e.target.closest?.('[data-vx-orn]'); if (!b) return; e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData(ORN_MIME, b.dataset.vxOrn); e.dataTransfer.setData('text/plain', b.title); } catch (_) {} });
        stage.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes(ORN_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
        stage.addEventListener('drop', e => { const k = e.dataTransfer?.getData(ORN_MIME); if (!k) return; e.preventDefault(); insertOrnament(k, toDoc(e)); });
        pane.addEventListener('input', e => { if (e.target.matches?.('[data-vx-ornq]')) { ornQ = e.target.value; if (ornCat && !ornLists().shown.length) ornCat = ''; const c = pane.querySelector('[data-vx-orncats]'), g = pane.querySelector('[data-vx-orngrid]'); if (c) c.innerHTML = ornCatsHtml(); if (g) g.innerHTML = ornGridHtml(); } });
        pane.addEventListener('change', e => { if (e.target.matches?.('[data-vx-orncol]') && /^#[0-9a-f]{6}$/i.test(e.target.value)) { try { localStorage.setItem(ORNC_KEY, e.target.value.toLowerCase()); } catch (_) {} } });
        /* vectoriser */
        function vectorizeDialog() {
            const img = selObjs().find(o => o.type === 'image') || cur().find(o => o.type === 'image' && !o.hidden);
            if (!img) { toast('Importe d’abord une image (Fichier → Importer), puis choisis-la.', 'error'); $('[data-vx-file]').click(); return; }
            ext.openDialog({eyebrow: 'VECTORISER', title: 'Transformer l’image en tracés', submitLabel: 'Vectoriser',
                body: `<p class="muted">Pour refaire un blason, un sceau, un logo, une signature : l’image devient des formes nettes, modifiables, agrandissables sans flou. L’image d’origine reste dessous (masquée).</p>
                    <label>Mode<select name="mode"><option value="color">En couleurs (blason, logo)</option><option value="bw">Noir et blanc (signature, gravure, dessin au trait)</option></select></label>
                    <label>Nombre de couleurs (mode couleurs)<input name="colors" type="number" min="2" max="16" value="6"></label>
                    <label>Seuil (noir et blanc : plus haut = plus de noir)<input name="threshold" type="range" min="10" max="245" value="128"></label>
                    <label>Précision<select name="eps"><option value="0.6">Très fine</option><option value="1" selected>Normale</option><option value="2">Simplifiée</option><option value="3.5">Très simplifiée</option></select></label>
                    <label>Taille de travail<select name="max"><option value="600">Rapide (600 px)</option><option value="1000" selected>Normale (1000 px)</option><option value="1600">Détaillée (1600 px)</option></select></label>
                    <label class="checkbox-line"><input type="checkbox" name="smooth" checked> Courbes lissées</label><label class="checkbox-line"><input type="checkbox" name="skip" checked> Ignorer le fond blanc</label><label class="checkbox-line"><input type="checkbox" name="invert"> Inverser (noir et blanc)</label>`,
                onSubmit: async f => {
                    const v = Object.fromEntries(new FormData(f)); status('Vectorisation…');
                    try {
                        const src = /^media\//.test(img.src) ? await toDataUrl(img.src) : img.src;
                        const r = await vectorizeImage(src, {colors: v.mode === 'color' ? clamp(num(v.colors, 6), 2, 16) : 0, threshold: num(v.threshold, 128), invert: !!v.invert, eps: num(v.eps, 1), maxSize: num(v.max, 1000), smooth: !!v.smooth, skipLight: !!v.skip});
                        if (!r.layers.length) { status(''); toast('Rien trouvé à vectoriser (essaie un autre seuil).', 'error'); return; }
                        const kx = img.w / r.W, ky = img.h / r.H;
                        const layers = r.layers.map(l => { const o = {id: uid(), type: 'svgpath', name: `Couleur ${l.color}`, d: loopsD(l.loops), fill: l.color, stroke: l.color, sw: Math.max(0.4, 0.5 * kx), join: 'round', evenodd: true}; mapObj(o, (x, y) => [img.x + x * kx, img.y + y * ky]); o.sw = Math.max(0.3, 0.6 * kx); return o; });
                        const g = {id: uid(), type: 'group', name: 'Image vectorisée', children: layers, rot: img.rot || 0};
                        img.hidden = true; cur().splice(idx(img) + 1, 0, g); sel = [g.id]; commit(`Vectorisé : ${layers.length} couleur${layers.length > 1 ? 's' : ''}`);
                        hint('Fait : Objet → Dissocier pour reprendre chaque couleur ; Sélection directe pour les points.');
                    } catch (e) { status(''); toast(e.message, 'error'); return false; }
                }});
        }
        /* ⤓ E3 : une seule fenêtre d'export (PDF de plusieurs pages, PNG, JPG, WEBP, SVG, Imprimer, recto-verso sur A4, fichier du dessin) */
        const pagesOf = () => doc.pages?.length ? doc.pages : [{name: 'Dessin', x: 0, y: 0, w: doc.w, h: doc.h, panels: [], role: 'face'}];
        const BLEED_MM = () => bleedMm(); // 📐 Fichier → Format du document → Fond perdu (3 mm au départ)
        /** une page prête à imprimer (SVG d'une feuille, images de la base intégrées) */
        async function pageSheet(p, {bleed = false, marks = false, sheet = null, rot = false} = {}) {
            const b = bleed ? BLEED_MM() * MM : 0, art = await inlineMedia(docSvg(doc, {page: p, bleed: b}));
            return sheetSvg(art, {tw: p.w, th: p.h, bleed: b, marks, sw: sheet?.[0] || 0, sh: sheet?.[1] || 0, panels: p.panels || [], rot});
        }
        const scaleFor = (w, h, ppp) => Math.max(.05, Math.min((ppp || 300) / 96, 8000 / w, 8000 / h, Math.sqrt(48e6 / (w * h))));
        const fnamePage = (o, i, n, p, ext2) => n > 1 ? o.filename.replace(new RegExp(`\\.${ext2}$`), `-${i + 1}-${slug(p.name)}.${ext2}`) : o.filename;
        async function pngBlobOf(p, ppp = 150, type = 'image/png', bgw = '') { const svg = await pageSheet(p), m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), c = await svgCanvas(svg, scaleFor(Number(m[1]), Number(m[2]), ppp), bgw); return new Promise(ok => c.toBlob(ok, type, .92)); }
        async function saveCopyToMedia() { try { const b = await pngBlobOf(pagesOf()[0], 150), file = new File([b], `${A().safeExportFilename ? A().safeExportFilename(name || 'dessin', 'dessin') : 'dessin'}.png`, {type: 'image/png'});
            if (ctx.personId) await upload({person_id: ctx.personId, title: name}, file); else { const P2 = window.LCNDA_PICKER || A(); if (!P2?.importMediaFile) throw new Error('envoi indisponible'); await P2.importMediaFile(file, ['image']); }
            toast('Une copie est rangée dans les médias.'); } catch (e) { toast(`Copie non rangée dans les médias : ${e.message}`, 'error'); } }
        function askFlip() {
            return new Promise(res => { let done = false; ext.openDialog({eyebrow: 'IMPRESSION', title: '🗞 Recto-verso sur A4', submitLabel: 'Préparer l’impression',
                body: `<p class="muted">Chaque face est centrée sur une feuille A4 (A3 si elle est trop grande), avec les traits de coupe et de pli ; l’enveloppe s’imprime à sa taille. Dans la fenêtre d’impression : recto-verso, taille réelle (100 %).</p>
                    <fieldset class="h-fp-kinds"><legend><span data-help="Pour que l’intérieur soit à l’endroit : la plupart des imprimantes retournent la feuille sur le côté (bord long en portrait, bord court en paysage). Si l’intérieur sort à l’envers, choisis l’autre façon.">L’imprimante retourne la feuille</span></legend>
                    <label class="h-fp-kind"><input type="radio" name="flip" value="side" checked><span>Sur le côté, comme une page de livre</span></label><label class="h-fp-kind"><input type="radio" name="flip" value="top"><span>Par le haut, comme un bloc-notes</span></label></fieldset>
                    <label class="checkbox-line"><input type="checkbox" name="marks" checked> Traits de coupe et de pli</label>`,
                onSubmit: f => { done = true; res({flip: f.querySelector('[name=flip]:checked')?.value || 'side', marks: f.querySelector('[name=marks]').checked}); }}).addEventListener('close', () => { if (!done) res(null); }); });
        }
        /** L1 : la fenêtre « Imprimer » commune — feuilles toutes faites (recto-verso sur A4) ou chaque page : à la taille exacte, ou ajustée à la feuille choisie */
        function printSheets(sheets, title, {fixed = false, bleed = false} = {}) { // sheets : [{svg, w, h, env}] en px, ou (choix) => Promise<sheets>
            const U2 = UI(); if (!U2?.openPrintDialog) throw new Error('la fenêtre « Imprimer » n’est pas chargée');
            const hasEnv = !fixed && typeof sheets === 'function' && pagesOf().some(p => p.role === 'env');
            const mmOf = v => v / MM;
            U2.openPrintDialog({title: title || 'Dessin', key: 'dessin', zone: 'Dessin', photos: false, margin: 0, keepFormat: true, ...(typeof sheets !== 'function' && sheets[0] ? U2.printPaper(mmOf(sheets[0].w), mmOf(sheets[0].h)) : pagesOf()[0] ? U2.printPaper(mmOf(pagesOf()[0].w), mmOf(pagesOf()[0].h)) : {}),
                options: fixed ? [] : [{key: 'fit', type: 'radio', value: 'exact', choices: [['exact', 'À la taille exacte de la feuille'], ['page', 'Ajuster à la feuille choisie', '(A4, A5…)']]},
                    {key: 'marks', label: 'Traits de coupe et de pli', checked: !!bleed}, ...(hasEnv ? [{key: 'all', label: 'Toutes les feuilles (avec l’enveloppe)', checked: true}] : [])],
                html: async c => {
                    const list = typeof sheets === 'function' ? await sheets(c) : sheets;
                    const pages = list.map(s2 => (fixed || c.fit !== 'page' ? {w: mmOf(s2.w), h: mmOf(s2.h), html: `<div class="vx-ps">${s2.svg}</div>`} : {pad: 8, fit: {w: s2.w, h: s2.h, html: `<div class="vx-ps" style="width:${s2.w}px;height:${s2.h}px">${s2.svg}</div>`}}));
                    return U2.printSheets({title: title || 'Dessin', choix: c, pages, css: '.vx-ps{width:100%;height:100%}.vx-ps>svg{width:100%;height:100%;display:block}'});
                }});
        }
        const printAll = (bleed = false) => printSheets(async c => { const sheets = []; for (const p of pagesOf()) { const env = p.role === 'env'; if (env && c.all === false) continue; const svg = await pageSheet(p, {bleed: bleed && !env, marks: !!c.marks && !env}), m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); sheets.push({svg, w: Number(m[1]), h: Number(m[2])}); } return sheets; }, name, {bleed});
        UI()?.onPrintKey?.(dlg, () => printAll(false)); // L1 : ⌘P
        async function exportDialog(fmt = 'pdf') {
            if (!UI()?.openExportDialog) return toast('La fenêtre d’export n’est pas chargée.', 'error');
            if (laterT) { clearTimeout(laterT); laterT = 0; commit(); }
            const pgs = pagesOf(), np = pgs.length, multi = np > 1, p0 = pgs[0];
            const run = async o => {
                const ppp = o.quality || 300, ext2 = {png: 'png', jpg: 'jpg', webp: 'webp', svg: 'svg'}[o.format];
                if (o.format === 'pdf') { const out = [];
                    for (const p of pgs) { const env = p.role === 'env', svg = await pageSheet(p, {bleed: o.bleed && !env, marks: o.bleed && !env}), m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), W = Number(m[1]), Hh = Number(m[2]);
                        const c = await svgCanvas(svg, scaleFor(W, Hh, ppp), '#ffffff'), blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .92));
                        out.push({jpeg: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, pw: W * .75, ph: Hh * .75}); }
                    downloadBlob(makePdf(out, doc.info?.title || name, doc.info), o.filename); }
                else if (ext2 === 'svg') { for (const [i, p] of pgs.entries()) { const svg = await inlineMedia(docSvg(doc, {page: multi ? p : null})); downloadBlob(new Blob([svg], {type: 'image/svg+xml'}), fnamePage(o, i, np, p, 'svg')); if (multi) await new Promise(r => setTimeout(r, 350)); } }
                else if (ext2) { for (const [i, p] of pgs.entries()) { const svg = await pageSheet(p, {bleed: o.bleed, marks: o.bleed}), m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), W = Number(m[1]), Hh = Number(m[2]);
                        const c = await svgCanvas(svg, scaleFor(W, Hh, ppp), ext2 === 'jpg' || (doc.bg !== 'transparent') ? '#ffffff' : ''), blob = await new Promise(ok => c.toBlob(ok, {png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp'}[ext2], .92));
                        downloadBlob(blob, fnamePage(o, i, np, p, ext2)); if (multi) await new Promise(r => setTimeout(r, 350)); } }
                else if (o.format === 'print') printAll(o.bleed);
                else if (o.format === 'impose') { const ch = await askFlip(); if (!ch) return; const sheets = [];
                    for (const p of pgs) { const env = p.role === 'env'; if (env) { const svg = await pageSheet(p); sheets.push({svg, w: p.w, h: p.h}); continue; }
                        const b = o.bleed ? BLEED_MM() * MM : 0, need = [p.w + 2 * (b + (ch.marks ? 9 * MM : 0)), p.h + 2 * (b + (ch.marks ? 9 * MM : 0))], sh = sheetFor(need[0], need[1]);
                        sheets.push({svg: await pageSheet(p, {bleed: !!o.bleed, marks: ch.marks, sheet: sh, rot: !!p.back && ch.flip === 'top'}), w: sh[0], h: sh[1]}); }
                    printSheets(sheets, name, {fixed: true}); }
                else if (o.format === 'file') downloadBlob(new Blob([JSON.stringify({lcnda: 'dessin', version: 1, name, doc}, null, 1)], {type: 'application/json'}), o.filename);
                if (o.saveCopy && ['pdf', 'png', 'jpg', 'webp', 'svg', 'print', 'impose'].includes(o.format)) await saveCopyToMedia();
            };
            const formats = [{id: 'pdf', hint: multi ? `${np} pages, une par face` : 'à la taille exacte', run}, {id: 'png', hint: multi ? `${np} images` : 'net, fond transparent possible', run}, {id: 'jpg', run}, {id: 'webp', label: '🖼 WEBP', hint: 'léger', ext: 'webp', run}, {id: 'svg', hint: multi ? `${np} fichiers` : 'dessin agrandissable', run}, {id: 'print', hint: multi ? 'une face par feuille' : 'tout de suite', run},
                ...(multi ? [{id: 'impose', label: '🗞 Recto-verso sur A4', hint: 'faces placées, traits de coupe et de pli', ext: '', quality: false, run}] : []), {id: 'file', label: '💾 Fichier du dessin', hint: 'à rouvrir ici', ext: 'json', run}];
            await UI().openExportDialog({title: name || 'Dessin', defaultName: name || 'dessin', bleed: true, quality: doc.dpi || 300, saveCopy: true, value: fmt, formats,
                info: `${multi ? `${np} pages · ` : ''}${cmTxt(p0.w)} × ${cmTxt(p0.h)} cm${multi && doc.fold ? ` · ${FOLDN[doc.fold.mode] || ''}` : ''}`,
                preview: async () => { const c = await svgCanvas(await inlineMedia(docSvg(doc, {page: multi ? p0 : null})), Math.min(1, 320 / Math.max(p0.w, p0.h)), doc.bg === 'transparent' ? '' : '#ffffff'); return c.toDataURL('image/png'); }});
        }
        /** une image des médias posée dans le dessin (src « media/… » : elle reste liée à la base) */
        async function placeMediaImage(filename, title = 'Image', at = null) {
            const src = `media/${encodeURIComponent(filename)}`; if (!imgOk(src)) return toast('Image refusée.', 'error');
            const im = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); if (!im) return toast('Image illisible.', 'error');
            const k = Math.min(1, doc.w * .9 / im.naturalWidth, doc.h * .9 / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k, c = at || [doc.w / 2, doc.h / 2];
            const o = {id: uid(), type: 'image', name: String(title).slice(0, 40) || 'Image', src, x: c[0] - w / 2, y: c[1] - h / 2, w, h}; cur().push(o); sel = [o.id]; setTool('select'); commit(`Image : ${o.name}`);
        }
        /* E4 : déposer un fichier sur le plan de travail — une image entre dans les médias, un SVG devient des tracés, un fichier du dessin s'ouvre */
        async function dropFiles(files) {
            for (const f of files) {
                if (/\.json$/i.test(f.name) || f.type === 'application/json') { await openDrawingFile(f); continue; }
                if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) { await importFile(f); continue; }
                const P2 = window.LCNDA_PICKER || A();
                if (/^image\/(png|jpeg|webp|gif)$/.test(f.type) && P2?.importMediaFile) { note('Envoi dans les médias…'); try { const m = await P2.importMediaFile(f, ['image']); await placeMediaImage(m.filename, m.title || f.name); note(`✓ « ${f.name} » rangée dans les médias`); continue; } catch (e) { toast(`Pas rangée dans les médias (${e.message}) : l’image est posée dans le dessin seulement.`, 'error'); } }
                await importFile(f);
            }
        }
        async function openDrawingFile(f) {
            let j = null; try { j = JSON.parse(await f.text()); } catch (_) { j = null; }
            if (!j || j.lcnda !== 'dessin' || !j.doc) { if (j?.lcnda === 'reglage') return toast('C’est un réglage : importe-le dans Document → 💾 Réglages enregistrés.', 'error'); return toast('Ce fichier n’est pas un dessin de LCNDA.', 'error'); }
            if (dirty && !await A().confirmBox('Ce qui n’est pas enregistré sera perdu.', {title: `Ouvrir « ${String(j.name || f.name).slice(0, 60)} » à la place ?`, okLabel: 'Ouvrir sans enregistrer', danger: true})) return;
            docId = 0; name = String(j.name || 'Dessin importé').slice(0, 200); $('[data-vx-name]').value = name; doc = cleanDoc(j.doc); sel = []; scope = []; hist = []; hi = -1; commit('Dessin ouvert'); fit();
        }
        /* enregistrer */
        async function thumb() { try { const p = doc.pages?.[0], c = await svgCanvas(await inlineMedia(docSvg(doc, {page: p || null})), Math.min(1, 240 / Math.max(p ? p.w : doc.w, p ? p.h : doc.h)), '#ffffff'); return c.toDataURL('image/jpeg', .8); } catch (_) { return ''; } }
        async function saveDoc() {
            name = $('[data-vx-name]').value.trim() || 'Mon dessin'; saved('saving');
            try { const first = !docId, r = await post('save_vector_doc', {id: docId, name, doc, thumb: await thumb()}); docId = Number(r.result?.id || docId); dirty = false; saved('saved'); if (first) note('Rangé dans Listes → Outils de modification'); ctx.onSaved?.(docId); }
            catch (e) { saved('error'); toast(e.message, 'error'); }
        }
        /** la sélection (ou tout) → une forme des tableaux (« Mes formes »), dans une boîte 100 × 100 */
        function shapeFromSel() {
            const l = (sel.length ? sorted() : cur().filter(o => !o.hidden)).flatMap(function flat(o) { return o.type === 'group' ? (o.children || []).flatMap(flat) : [o]; }).filter(o => shapeD(o));
            if (!l.length || !K()) return null;
            const ds = l.map(o => { const c = clone(o); if (num(c.rot)) { const b = box(c), r = num(c.rot) * Math.PI / 180, cx = b.x + b.w / 2, cy = b.y + b.h / 2; const p = c.type === 'path' || c.type === 'svgpath' ? c : toPath(c); mapObj(p, (x, y) => [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]); p.rot = 0; return shapeD(p); } return shapeD(c); }).join('');
            return {d: K().pathStr(K().fitSegs(K().absPath(ds))), eo: l.length > 1 || l.some(o => o.evenodd)};
        }
        function saveAsShape() {
            const r = shapeFromSel(); if (!r?.d) return toast('Il faut des formes ou des tracés (pas seulement du texte ou des images).', 'error');
            if (r.d.length > 30000) return toast('Forme trop détaillée pour « Mes formes » (simplifie-la, ou vectorise en « Simplifiée »).', 'error');
            const p = K().prefs(), mine = ctx.shape && String(ctx.shape.k || '').startsWith('my_') ? p.customShapes.find(s => s.k === ctx.shape.k) : null;
            ext.openDialog({eyebrow: 'MES FORMES', title: 'Enregistrer comme forme', submitLabel: 'Enregistrer',
                body: `<div class="vx-shprev"><svg viewBox="-4 -4 108 108" width="96" height="96"><path d="${esc(r.d)}" ${r.eo ? 'fill-rule="evenodd"' : ''} fill="#333"/></svg></div><label>Nom<input name="n" maxlength="60" value="${esc(mine?.n || $('[data-vx-name]').value || 'Ma forme')}"></label>${mine ? `<label class="checkbox-line"><input type="checkbox" name="replace" checked> Remplacer « ${esc(mine.n)} »</label>` : ''}<p class="muted">Elle ira dans « Mes formes » des tableaux (outil Formes) et dans l’accès rapide.</p>`,
                onSubmit: f => { const n = String(f.querySelector('[name=n]').value || 'Ma forme').trim().slice(0, 60); const p2 = K().prefs();
                    let k = mine && f.querySelector('[name=replace]')?.checked ? mine.k : 'my_' + Date.now().toString(36);
                    const shape = {k, n, c: 'mine', d: r.d, eo: r.eo, mask: ''}, i = p2.customShapes.findIndex(s => s.k === k);
                    if (i >= 0) p2.customShapes[i] = shape; else p2.customShapes.push(shape); if (!p2.quickShapes.includes(k)) p2.quickShapes.push(k);
                    K().savePrefs(p2); k = K().prefs().customShapes.find(s => s.n === n && s.d === r.d)?.k || k;
                    toast(`Forme « ${n} » enregistrée : elle est dans « Mes formes ».`); ctx.onShape?.(k); }});
        }
        async function pngFile() { const b = await exportImg('png'); return new File([b], `${(A().safeExportFilename ? A().safeExportFilename(name || 'dessin', 'dessin') : 'dessin')}.png`, {type: 'image/png'}); }
        async function upload(fields, file) {
            const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, v)); fd.append('csrf', A().state.csrf); fd.append('files[]', file);
            const res = await fetch('upload.php', {method: 'POST', body: fd}); const j = await res.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!res.ok || j.error) throw new Error(j.error || 'Envoi impossible'); return j;
        }
        function pickPerson(title, onPick) {
            ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title, submitLabel: 'Envoyer',
                body: `<div class="h-pk-solo"><span class="pk-lab">Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'vx_pick', kind: 'person'})}</div><p class="muted">L’image (PNG, nette, fond ${doc.bg === 'transparent' ? 'transparent' : 'compris'}) y est ajoutée.</p>`,
                onOpen: dg => { setTimeout(() => dg.querySelector('.pk-input')?.focus(), 30); },
                onSubmit: async f => { const chosen = Number(f.elements.vx_pick?.value) || 0; if (!chosen) return window.LCNDA_UI.fail(f.querySelector('.pk'), 'Choisis une personne.'); try { await onPick(chosen); } catch (e) { toast(e.message, 'error'); return false; } }});
        }
        function saveToMedia() { pickPerson('Enregistrer dans les médias d’une fiche', async pid => { status('Envoi…'); await upload({person_id: pid}, await pngFile()); status('✓ Envoyé'); toast('Image ajoutée aux médias de la fiche.'); }); }
        async function saveToCoat() {
            if (ctx.coat?.id) { status('Envoi…'); try { await upload({collection_type: 'coat_of_arms', collection_id: ctx.coat.id, collection_role: ''}, await pngFile()); status('✓ Envoyé'); toast(`Image ajoutée aux armoiries « ${ctx.coat.title || ''} ».`); ctx.onCoatSaved?.(); } catch (e) { status(''); toast(e.message, 'error'); } return; }
            const coats = (await api('coats_of_arms').catch(() => ({coats: []}))).coats || [];
            ext.openDialog({eyebrow: 'ARMOIRIES', title: 'Enregistrer comme image d’armoiries', submitLabel: 'Enregistrer',
                body: `<div class="form-grid"><label>Armoiries<select name="coat"><option value="new">＋ Nouvelles armoiries…</option>${coats.map(c => `<option value="${Number(c.id)}">${esc(c.title)}</option>`).join('')}</select></label><label>Nom (si nouvelles)<input name="title" value="${esc($('[data-vx-name]').value || 'Armes de la famille')}"></label><label class="span-2">Blasonnement (si nouvelles)<textarea name="blazon" rows="2">${esc(lastBlazon)}</textarea></label></div>`,
                onSubmit: async f => { try { let id = f.querySelector('[name=coat]').value; if (id === 'new') { const t = f.querySelector('[name=title]').value.trim(); if (!t) return window.LCNDA_UI.fail(f.querySelector('[name=title]'), 'Donne un nom aux armoiries.'); const r = await post('save_coat_of_arms', {id: 0, title: t, blazon: f.querySelector('[name=blazon]').value}); id = r.result.id; }
                    await upload({collection_type: 'coat_of_arms', collection_id: Number(id), collection_role: ''}, await pngFile()); toast('Image enregistrée dans les armoiries (fiche d’une personne → bloc Blason, ou Listes → Armoiries).'); } catch (e) { toast(e.message, 'error'); return false; } }});
        }
        /* fermer */
        const close = async () => { if (dirty && !await A().confirmBox('Ce qui n’est pas enregistré sera perdu.', {title: 'Fermer sans enregistrer le dessin ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); document.removeEventListener('paste', onPaste); try { blObs.disconnect(); rsObs.disconnect(); } catch (_) {} dlg.close(); dlg.remove(); ctx.onClose?.(); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (penPath) { finishPen(); return; } close(); });
        $('[data-vx-close]').addEventListener('click', close);
        $('[data-vx-name]').addEventListener('input', () => { name = $('[data-vx-name]').value.trim() || 'Mon dessin'; markDirty(); }); // le nom tapé sert tout de suite (export, copie dans les médias…)
        /* largeur du panneau de droite : réglable en le tirant par son bord, comme dans Photoshop */
        const PW_KEY = 'lcnda-vx-panel-w', mainEl = $('.vx-main');
        const setPw = w => { if (w) mainEl.style.setProperty('--vx-pw', `${Math.round(w)}px`); else mainEl.style.removeProperty('--vx-pw'); };
        try { const w0 = Number(localStorage.getItem(PW_KEY)); if (w0 >= 220) setPw(w0); } catch (_) {}
        const ps = $('[data-vx-psize]');
        ps.addEventListener('pointerdown', e => { e.preventDefault(); ps.setPointerCapture(e.pointerId); ps.classList.add('is-on');
            const mv = ev => { const r = mainEl.getBoundingClientRect(); setPw(clamp(r.right - ev.clientX, 220, Math.min(900, r.width * .7))); applyView(); };
            const up = () => { ps.removeEventListener('pointermove', mv); ps.removeEventListener('pointerup', up); ps.classList.remove('is-on'); try { localStorage.setItem(PW_KEY, String(parseInt(getComputedStyle(mainEl).getPropertyValue('--vx-pw')) || '')); } catch (_) {} };
            ps.addEventListener('pointermove', mv); ps.addEventListener('pointerup', up); });
        ps.addEventListener('dblclick', () => { setPw(0); try { localStorage.removeItem(PW_KEY); } catch (_) {} applyView(); });
        dlg.addEventListener('change', e => { const md = e.target.dataset?.vxMode; if (!md) return; const on = e.target.checked;
            if (md === 'map') { doc.map = {...(doc.map || {}), on}; if (on && !doc.kind) doc.kind = 'map'; tab = on ? 'map' : tab; commit(on ? 'Mode Carte' : 'Mode Carte désactivé'); }
            else { doc.blasonOn = on; tab = on ? 'blason' : tab; commit(on ? 'Mode Blason' : 'Mode Blason désactivé'); } paintPanel(); });
        /* 🗺️ le mode Plan reçoit de quoi agir sur ce dessin */
        MP = ext.vectorMap?.attach({doc: () => doc, cur, selObjs, commit, render, uid, dlg, pane, fit, normImage: async (src, type) => (await normImage(src, type)).src, toDataUrl, name: () => $('[data-vx-name]').value,
            setTool: t => { if (penPath) finishPen(); setTool(t); }, paint: paintPanel, redraw: renderNoPanel, close: () => close(),
            reveal: id => { const f = findAny(id); if (!f) return; if (!samePath(f.path, scope) && !enterScope(f.path)) return; sel = [id]; setTool('select'); render(); },
            place: (objs, key) => { const layer = doc.objs.find(l => l.layer && l.mapLayer === key && !l.locked); if (layer) { layer.children = layer.children || []; layer.children.push(...objs); scope = [layer.id]; openGroups.add(layer.id); } else cur().push(...objs); sel = objs.map(o => o.id); }}) || null;
        /* départ */
        dlg.showModal(); stage.focus({preventScroll: true});
        if (!ctx.id && !doc.objs.length) newLayer(); // un nouveau dessin commence avec « Calque 1 »
        if (ctx.coat && !ctx.id) { doc.w = 500; doc.h = 600; name = ctx.coat.title || 'Blason'; $('[data-vx-name]').value = name; tab = 'blason'; }
        if (ctx.shape?.d && !ctx.id) { doc.w = 600; doc.h = 600; name = ctx.shape.n || 'Forme'; $('[data-vx-name]').value = name; const sh = ctx.shape, segs = K().absPath(sh.d), b = segsBox(segs) || {x: 0, y: 0, w: 100, h: 100}, k = 400 / Math.max(b.w, b.h);
            const d = K().pathStr(segs.map(([c, ...a]) => { const o = [c]; for (let j = 0; j < a.length; j += 2) o.push(100 + (a[j] - b.x) * k + (400 - b.w * k) / 2, 100 + (a[j + 1] - b.y) * k + (400 - b.h * k) / 2); return o; }));
            const one = dToPts(d); cur().push({id: uid(), type: one ? 'path' : 'svgpath', name: sh.n || 'Forme', fill: '#3a3a3a', stroke: '#222222', sw: 0, evenodd: !!sh.eo, ...(one ? {pts: one.pts, closed: one.closed} : {d})}); }
        commit(); dirty = false; saved(docId ? 'saved' : ''); status(''); setTool('select'); fit();
        if (ctx.doc?.objs?.length && !docId) markDirty(); // un dessin tout fait (faire-part, arbre, sceau…) n'est pas encore enregistré : fermer demande avant de le perdre
        if (ctx.svg) addImported(importSvgText(ctx.svg), 'SVG importé');
        if (ctx.imageSrc) { try { const im = await normImage(/^media\//.test(ctx.imageSrc) ? await toDataUrl(ctx.imageSrc) : ctx.imageSrc), k = Math.min(1, doc.w * .9 / im.w, doc.h * .9 / im.h); addImported([{id: uid(), type: 'image', name: 'Image d’origine', src: im.src, x: 0, y: 0, w: im.w * k, h: im.h * k}], 'Image importée'); dirty = false; saved(''); hint('L’image d’origine est là : Blason → « Vectoriser une image » pour la refaire en tracés, ou dessine par-dessus à la plume.'); } catch (e) { toast(e.message, 'error'); } }
        const rsObs = new ResizeObserver(() => { if (dlg.isConnected) applyView(); }); rsObs.observe(stage);
        return {get doc() { return doc; }, cmd: (k, ...a) => CMDS[k]?.(...a), setTool, select: ids => { sel = ids; render(); }, importSvgText: t => addImported(importSvgText(t), 'SVG'), close: () => { dirty = false; close(); }};
    }

    /* ─── images : SVG → canevas, médias de l'app intégrés ─── */
    function svgCanvas(svg, scale = 1, bg = '') {
        return new Promise((ok, ko) => {
            const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/), w = Number(m?.[3]) || 800, h = Number(m?.[4]) || 600;
            const W = Math.max(1, Math.min(8000, Math.round(w * scale))), Hh = Math.max(1, Math.min(8000, Math.round(h * scale)));
            const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
            img.onload = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, Hh); } g.drawImage(img, 0, 0, W, Hh); URL.revokeObjectURL(url); ok(c); };
            img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image impossible à fabriquer.')); };
            img.src = url;
        });
    }
    async function toDataUrl(src) { const b = await (await fetch(src)).blob(); return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); }
    async function inlineMedia(svg) {
        const refs = [...new Set([...svg.matchAll(/href="(media\/[^"]+)"/g)].map(m => m[1]))];
        for (const r of refs) { try { const d = await toDataUrl(r.replace(/&amp;/g, '&')); if (/^data:image\//.test(d)) svg = svg.split(`href="${r}"`).join(`href="${d}"`); } catch (_) {} }
        return svg;
    }


    /* ═════════ 📄 PDF de plusieurs pages (une image JPEG par page, à la taille exacte) ═════════ */
    /** pages : [{jpeg (Uint8Array), w, h (pixels de l'image), pw, ph (taille de la page en points, 1/72 de pouce)}] */
    function makePdf(pages, title = 'Dessin', info = null) {
        const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
        const push = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
        const f = v => (Math.round(v * 100) / 100).toString(), n = pages.length, safeTitle = String(title || 'Dessin').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/[()\\]/g, '').slice(0, 120);
        push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
        const obj = (k, body) => { offs[k] = len; push(`${k} 0 obj\n`); body(); push('\nendobj\n'); };
        obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
        obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${n} >>`));
        pages.forEach((p, i) => { const pk = 3 + i * 3, ik = pk + 1, ck = pk + 2, content = `q ${f(p.pw)} 0 0 ${f(p.ph)} 0 0 cm /Im0 Do Q`;
            obj(pk, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.pw)} ${f(p.ph)}] /Resources << /XObject << /Im0 ${ik} 0 R >> >> /Contents ${ck} 0 R >>`));
            obj(ik, () => { push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`); push(p.jpeg); push('\nendstream'); });
            obj(ck, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)); });
        // ℹ️ les informations du document (titre, auteur, sujet, mots-clés) : en UTF-16 pour garder les accents
        const meta = cleanInfo(info), u16 = t => `<FEFF${[...String(t)].map(ch => { const c = ch.codePointAt(0); if (c < 0x10000) return c.toString(16).padStart(4, '0'); const v = c - 0x10000; return ((v >> 10) + 0xd800).toString(16) + ((v & 0x3ff) + 0xdc00).toString(16); }).join('').toUpperCase()}>`;
        const pdfDate = (() => { const d = new Date(), z = x => String(x).padStart(2, '0'); return `(D:${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())})`; })();
        const infoK = 3 + n * 3; obj(infoK, () => push(`<< /Title ${meta.title ? u16(meta.title) : `(${safeTitle})`}${meta.author ? ` /Author ${u16(meta.author)}` : ''}${meta.subject || meta.desc ? ` /Subject ${u16(meta.subject || meta.desc)}` : ''}${meta.keywords ? ` /Keywords ${u16(meta.keywords)}` : ''} /Creator (LCNDA) /Producer (LCNDA) /CreationDate ${pdfDate} >>`));
        const info2 = infoK;
        const xref = len; push(`xref\n0 ${info2 + 1}\n0000000000 65535 f \n${Array.from({length: info2}, (_, i) => String(offs[i + 1]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${info2 + 1} /Root 1 0 R /Info ${info2} 0 R >>\nstartxref\n${xref}\n%%EOF`);
        return new Blob(parts, {type: 'application/pdf'});
    }
    const MM = 96 / 25.4; // pixels (96 ppp) par millimètre
    /**
     * une feuille à imprimer : la page (avec son fond perdu), centrée sur la feuille, avec ses traits de coupe et de pli ;
     * art = le SVG de la page (docSvg avec bleed), tw × th = la page finie (px), panels = les volets ; rot = tournée d'un demi-tour (verso)
     */
    function sheetSvg(art, {tw, th, bleed = 0, marks = false, sw = 0, sh = 0, panels = [], rot = false}) {
        const M = marks ? 9 * MM : 0, SW = sw || tw + 2 * (bleed + M), SH = sh || th + 2 * (bleed + M), X = (SW - tw) / 2, Y = (SH - th) / 2;
        let m = '';
        if (marks) { const g = bleed + 2 * MM, L = 5 * MM, ln = (x1, y1, x2, y2, dash) => `<line x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}" stroke="#000" stroke-width="0.6"${dash ? ' stroke-dasharray="3 2"' : ''}/>`;
            [[X, Y, -1, -1], [X + tw, Y, 1, -1], [X, Y + th, -1, 1], [X + tw, Y + th, 1, 1]].forEach(([x, y, sx, sy]) => { m += ln(x + sx * g, y, x + sx * (g + L), y) + ln(x, y + sy * g, x, y + sy * (g + L)); });
            panels.slice(1).forEach(q => { const x = X + q.x; m += ln(x, Y - g, x, Y - g - L, true) + ln(x, Y + th + g, x, Y + th + g + L, true); }); }
        const inner = art.replace(/^<svg /, `<svg x="${n2(X - bleed)}" y="${n2(Y - bleed)}" `);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(SW)} ${n2(SH)}" width="${n2(SW)}" height="${n2(SH)}"><rect width="${n2(SW)}" height="${n2(SH)}" fill="#ffffff"/><g${rot ? ` transform="rotate(180 ${n2(SW / 2)} ${n2(SH / 2)})"` : ''}>${inner}${m}</g></svg>`;
    }
    /** une feuille assez grande : A4 (dans le bon sens), sinon A3, sinon la taille juste */
    const sheetFor = (w, h) => { for (const [a, b] of [[794, 1123], [1123, 1587]]) { if (w <= a && h <= b) return [a, b]; if (w <= b && h <= a) return [b, a]; } return [w, h]; };

    ext.openVectorEditor = ctx => openEditor(ctx || {});
    ext.vectorInternals = {boxPts, ptsD, shapeD, box, rbox, mapObj, toPath, dToPts, objSvg, docSvg, traceMask, rasterOp, vectorizeImage, importSvgText, parseTransform, makeBlason, TINCTURES, ESCUTCHEONS, DIVISIONS, ORDINARIES, CHARGE_KEYS, col, imgOk, unionBox, loopsD, svgCanvas, ringPts, revPts, guideD, pathLen, gradStops, patDef, HATCH, makePdf, sheetSvg, presetBox};
})();
