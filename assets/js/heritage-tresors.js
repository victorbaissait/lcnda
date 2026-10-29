/**
 * ✨ Trésors de famille — l'onglet qui réunit les nouveautés pour s'émerveiller, jouer, créer et garder la mémoire.
 * Chaque nouveauté s'inscrit dans ext.tresorFeatures (fichiers heritage-tresors-*.js) :
 *   {key, group, icon, title, desc, render(host, T)}  — host : l'élément où dessiner sa page ; T : les aides communes.
 * Les aides communes (T) : l'arbre en mémoire (lib/tresors.php, tresor_tree), les ancêtres et descendants, les noms, les
 * dates, le choix d'une personne (menu de choix unique), les éléments gardés (tresors / tresor_write), télécharger un fichier.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    ext.tresorFeatures = ext.tresorFeatures || [];
    const GROUPS = [['memoire', '🕯️ Garder la mémoire'], ['decouvrir', '🔭 Découvrir'], ['jouer', '🎲 Jouer en famille'], ['creer', '🎨 Créer et fabriquer'], ['lieux', '🗺️ Lieux et voyages'], ['outils', '🧰 Outils malins']];
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    /* ═════════ Les aides communes ═════════ */
    let treeP = null, treeAt = 0;
    const T = {
        esc, MONTHS,
        toast: (...a) => A().toast(...a),
        api: (...a) => A().api(...a),
        post: (action, body) => A().api(action, {}, {method: 'POST', body}),
        /** l'arbre, gardé en mémoire (force : relire) ; index : byId, kids (personne → enfants), fams (personne → couples) */
        async tree(force = false) {
            if (!treeP || force || Date.now() - treeAt > 20000) { treeAt = Date.now(); treeP = A().api('tresor_tree').then(d => {
                const byId = new Map(d.people.map(p => [p.id, p])), kids = new Map(), fams = new Map();
                d.families.forEach(f => { [f.a, f.b].filter(Boolean).forEach(x => { if (!fams.has(x)) fams.set(x, []); fams.get(x).push(f); if (!kids.has(x)) kids.set(x, []); kids.get(x).push(...f.children); }); });
                const evBy = new Map(); d.events.forEach(e => { const k = e.p ? 'p' + e.p : 'f' + e.f; if (!evBy.has(k)) evBy.set(k, []); evBy.get(k).push(e); });
                return {...d, byId, kids, fams, evBy};
            }).catch(err => { treeP = null; throw err; }); }
            return treeP;
        },
        name: p => (p ? p.name || [p.first, p.last].filter(Boolean).join(' ') || 'Sans nom' : '?'),
        life: p => (p ? (p.by || p.dy ? `${p.by || '?'} – ${p.dy || (p.living ? '' : '?')}` : '') : ''),
        place: (tr, id) => (id && tr.places[id] ? tr.places[id].name : ''),
        /** « 12 mars 1890 », « 1890 » */
        dateFr: (d, y) => { if (d) { const [yy, m, dd] = d.split('-').map(Number); return `${dd === 1 ? '1er' : dd} ${MONTHS[m - 1]} ${yy}`; } return y ? String(y) : ''; },
        /** l'âge à une date (années pleines, ou à l'année près) */
        ageAt(p, d, y) {
            if (!p?.by) return null;
            if (p.bd && d) { const [a, b, c] = p.bd.split('-').map(Number), [x, yy, z] = d.split('-').map(Number); return x - a - (yy < b || (yy === b && z < c) ? 1 : 0); }
            const yr = y || (d ? Number(d.slice(0, 4)) : null); return yr ? yr - p.by : null;
        },
        /** les ancêtres : [{id, gen}] (gen 1 = parents), un ancêtre présent deux fois n'est gardé qu'une fois (au plus proche) */
        ancestors(tr, id, max = 30) {
            const out = [], seen = new Set([id]); let cur = [id];
            for (let g = 1; g <= max && cur.length; g++) { const nx = []; cur.forEach(c => { const p = tr.byId.get(c); [p?.father, p?.mother].filter(Boolean).forEach(a => { if (seen.has(a)) return; seen.add(a); out.push({id: a, gen: g}); nx.push(a); }); }); cur = nx; }
            return out;
        },
        descendants(tr, ids, max = 40) {
            const out = [], seen = new Set(ids); let cur = [...ids];
            for (let g = 1; g <= max && cur.length; g++) { const nx = []; cur.forEach(c => (tr.kids.get(c) || []).forEach(k => { if (seen.has(k)) return; seen.add(k); out.push({id: k, gen: g}); nx.push(k); })); cur = nx; }
            return out;
        },
        /** la personne de départ (racine) : celle marquée « de départ », sinon la première */
        start: tr => (tr.people.find(p => p.start) || tr.people[0] || null),
        /** choisir une personne (le menu de choix unique) → numéro, ou null */
        pickPerson(title = 'Choisir une personne', value = null) {
            return new Promise(res => { let done = false;
                ext.openDialog({eyebrow: 'TRÉSORS', title, submitLabel: 'Choisir', body: `<div class="form-grid"><div class="span-2"><span class="pk-lab">Personne</span>${window.LCNDA_PICKER.pickerField({name: 'tr_pp', kind: 'person', value})}</div></div>`,
                    onOpen: d => d.addEventListener('close', () => { if (!done) res(null); }, {once: true}),
                    onSubmit: form => { const id = Number(form.elements.tr_pp?.value) || 0; if (!id) { window.LCNDA_UI?.fail?.(form.elements.tr_pp, 'Choisis la personne.'); return false; } done = true; res(id); }}); });
        },
        personField: (name, value = null) => window.LCNDA_PICKER.pickerField({name, kind: 'person', value}),
        items: (kind, personId = 0) => A().api('tresors', {kind, ...(personId ? {person_id: personId} : {})}).then(r => r.items || []),
        save: item => T.post('tresor_write', {op: 'save', item}),
        remove: id => T.post('tresor_write', {op: 'delete', id}),
        download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); },
        /** un nombre au hasard qui dépend d'une graine (le même tirage à chaque fois) */
        rng(seed) { let s = (Number(seed) || 1) % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; },
        /** quelques phrases sur une vie, tirées de l'arbre (naissance, métier, mariages, enfants, décès) */
        story(tr, p) {
            if (!p) return [];
            const f = p.gender === 'female', il = f ? 'Elle' : 'Il', x = s => s.replace(/·e/g, f ? 'e' : ''), out = [];
            if (p.by) out.push(x(`${il} est né·e ${p.bd ? 'le ' : 'en '}${T.dateFr(p.bd, p.by)}${p.bplace ? ` à ${T.place(tr, p.bplace)}` : ''}.`));
            if (p.occ) out.push(`${il} était ${p.occ}.`);
            (tr.fams.get(p.id) || []).forEach(fa => { const o = tr.byId.get(fa.a === p.id ? fa.b : fa.a); if (o) out.push(`${il} a épousé ${T.name(o)}${fa.my ? ` ${fa.md ? 'le' : 'en'} ${T.dateFr(fa.md, fa.my)}` : ''}${fa.mplace ? ` à ${T.place(tr, fa.mplace)}` : ''}.`); });
            const kids = [...new Set(tr.kids.get(p.id) || [])].map(k => tr.byId.get(k)).filter(Boolean);
            if (kids.length) out.push(`${il} a eu ${kids.length === 1 ? 'un enfant' : `${kids.length} enfants`} : ${kids.map(k => k.first || T.name(k)).join(', ')}.`);
            if (p.dy) { const a = T.ageAt(p, p.dd, p.dy); out.push(x(`${il} est mort·e ${p.dd ? 'le ' : 'en '}${T.dateFr(p.dd, p.dy)}${a != null ? `, à ${a} ans` : ''}${p.dplace ? `, à ${T.place(tr, p.dplace)}` : ''}.`)); }
            return out;
        },
        /** lire à voix haute (la voix française du système) → une promesse tenue à la fin de la lecture */
        say(text, {rate = 0.95} = {}) {
            return new Promise(res => { const s = window.speechSynthesis; if (!s || !text) return res(false);
                const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = rate; const v = s.getVoices().find(x => /^fr/i.test(x.lang)); if (v) u.voice = v;
                u.onend = () => res(true); u.onerror = () => res(false); s.speak(u); });
        },
        hush: () => { try { window.speechSynthesis?.cancel(); } catch (_) {} },
        /** envoyer un enregistrement (son, vidéo, image) dans les médias → {media_id, filename} */
        async upload(blob, kind, title, name = 'enregistrement.webm') {
            const fd = new FormData(); fd.append('file', blob, name); fd.append('media_id', '0'); fd.append('mode', 'new'); fd.append('kind', kind); fd.append('title', title);
            const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf || ''}, credentials: 'same-origin'}).then(x => x.json());
            if (!r?.result?.media_id) throw new Error(r?.error || 'envoi impossible'); return r.result;
        },
        open: key => openFeature(key),
        /** 📐 ouvrir une création (image PNG/SVG en data:) dans l'atelier de mise en page, façon InDesign : une page à son format,
         *  l'image dans un cadre modifiable, et un titre en texte (facultatif) ; on y ajoute ensuite ce qu'on veut, et on enregistre */
        async toLayout(name, src, {w = 210, h = 297, title = '', caption = ''} = {}) {
            const K = ext.layoutKit; if (!K?.openEditor) { T.toast('L’atelier de mise en page n’est pas disponible ici.', 'error'); return false; }
            if (src instanceof Blob) src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(src); });
            if (/^data:image\/svg\+xml;(charset=[^,;]+)?,/.test(src)) src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(decodeURIComponent(src.slice(src.indexOf(',') + 1)))));
            const d = K.defaults(), th = {titleFont: d.titleFont, bodyFont: d.bodyFont, bodySize: d.bodySize, lead: d.lead, accent: d.accent, paper: d.paper}, m = 10;
            const items = [K.shapeItem('frame', {x: 0, y: 0, w, h, src, fit: 'fit', fill: 'none', stroke: {c: 'none', w: 0}, name: 'Image'})];
            if (title) items.push(K.textItem({x: m, y: m, w: w - 2 * m, h: 16, html: `<p data-ps="ps-title">${esc(title)}</p>`, name: 'Titre'}));
            if (caption) items.push(K.textItem({x: m, y: h - m - 10, w: w - 2 * m, h: 10, html: `<p data-ps="ps-caption">${esc(caption)}</p>`, name: 'Légende'}));
            const doc = {type: 'lcnda-mise-en-page', version: 1, title: name,
                page: {w, h, facing: false, margin: {t: m, b: m, i: m, o: m}, columns: 1, gutter: 4, bleed: 3, slug: 0, paper: 'sw-paper', start: 1},
                swatches: K.baseSwatches(th), paraStyles: K.baseStyles(th), charStyles: [{id: 'cs-em', name: 'Accent', color: 'sw-accent', italic: true}],
                layers: [{id: 'L1', name: 'Calque 1', visible: true, locked: false, color: '#4a7dff'}],
                masters: [{id: 'B', name: 'B-Sans folio', items: []}], pages: [{id: 'p1', master: 'B', items}], uid: 'd' + Date.now().toString(36), fn: {place: 'block', restart: 'none'}, notes: {}, review: {comments: []}};
            await K.openEditor({id: 0, name: name.slice(0, 160), doc}); return true;
        },
        /** une image SVG (texte) → une image PNG (Blob), à la largeur voulue (en pixels) */
        svgPng(svg, width = 2000) {
            return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const k = width / (img.naturalWidth || img.width || width), c = document.createElement('canvas'); c.width = Math.round((img.naturalWidth || width) * k); c.height = Math.round((img.naturalHeight || width) * k);
                const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => (b ? res(b) : rej(new Error('image impossible'))), 'image/png'); };
                img.onerror = () => rej(new Error('image impossible')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
        },
        canvasPng: cv => new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('image impossible'))), 'image/png')),
        /** 🖨 imprimer ce qui est à l'écran dans un élément (sans les boutons) : la fenêtre « Imprimer » de l'app (K13) */
        printNode(title, el, css = '') {
            const c = el.cloneNode(true); c.querySelectorAll('.h-tr-noprint, script, style:not([data-keep])').forEach(x => x.remove());
            c.querySelectorAll('button').forEach(b => b.replaceWith(document.createTextNode(b.textContent)));
            return ext.tresorPrint(title, `.pg{max-width:190mm;margin:10mm auto;padding:8mm;background:#fff;color:#111;font-family:Georgia,serif;line-height:1.45}.pg ul{list-style:none;padding:0}.pg li{margin:0 0 3mm;break-inside:avoid}.pg small,.h-tr-muted{color:#555}.h-tr-big{font-size:18pt;font-weight:800}.h-tr-ic{margin-right:2mm}.h-tr-pill{display:inline-block;padding:0 2mm;border:1px solid #ccc;border-radius:3mm;font-size:9pt}${css}`, `<main class="pg"><h1>${esc(title)}</h1>${c.innerHTML}</main>`);
        },
        /** ⤓ Exporter ▾ · 🖨 Imprimer · le bouton bleu : toujours au même endroit, à droite de l'en-tête de la page (voir actions plus bas) */
        actions: (host, o) => pageActions(host, o),
        /** K10 : la petite ligne « rien ici » (avec le bouton pour commencer quand c'est possible) */
        empty: (text, o = {}) => A().empty(text, o),
        /** K4 : une date de création ou de modification (« hier à 10 h 22 ») */
        when: (d, o = {}) => (window.LCNDA_UI?.when ? window.LCNDA_UI.when(d, o) : esc(String(d || '').slice(0, 10))),
        /** K1 : l'erreur sous le champ fautif (et le curseur dedans) → false */
        fail: (field, msg) => { if (window.LCNDA_UI?.fail && field) return window.LCNDA_UI.fail(field, msg); A().toast(msg, 'error'); return false; },
        portraitUrl: p => (p?.portrait ? `media/${encodeURIComponent(p.portrait)}` : ''),
        openPerson: id => (A().openPersonById ? A().openPersonById(id) : A().selectPerson ? A().selectPerson(id) : (location.hash = `#personnes/${id}`)),
    };
    ext.tresors = {T, render, open: k => openFeature(k)};

    /* ═════════ Les boutons d'une page : un seul modèle pour les 44 pages ═════════
     * T.actions(host, {primary, exports, media, layout, print, more}) pose, à droite de l'en-tête (K5), dans cet ordre :
     *   le bouton bleu (primary : {label, run, attrs, title}) · « ⤓ Exporter ▾ » · « 🖨 Imprimer » · le reste (more) dans « ⋯ ».
     *   exports : [{icon, label, name, make, run}] — make() rend un Blob, un texte SVG ou {blob, name} : il est téléchargé sous name ;
     *   media : true (copie de la première image exportée) ou {title, make, person, kind} → « 📁 Ranger une copie dans les médias » ;
     *   layout : fonction → « 📐 Ouvrir dans la mise en page » ; print : fonction, {label, run, attrs} ou [{label, run}] (menu « 🖨 Imprimer ▾ »).
     * Rappeler T.actions remplace les boutons de la page (une page qui se redessine). */
    const blobOf = async (x, fallbackName) => {
        let r = await x.make(); if (r == null) return null;
        if (typeof r === 'string') r = new Blob([r], {type: /^\s*<svg/.test(r) ? 'image/svg+xml' : 'text/plain;charset=utf-8'});
        if (r instanceof Blob) r = {blob: r, name: typeof x.name === 'function' ? x.name() : x.name || fallbackName};
        return r;
    };
    async function pageActions(host, o = {}) {
        const page = host?.closest?.('.h-tr-page'), acts = page?.querySelector('.page-header .page-actions'); if (!acts) return null;
        page.querySelectorAll('.page-header [data-tr-act]').forEach(b => b.remove());
        const UI = window.LCNDA_UI || {}, toast = (m, k) => A().toast(m, k), title = page.querySelector('.page-header h2')?.textContent.trim() || 'Trésor';
        const btn = (cls, label, attrs = '', tip = '') => { const t = document.createElement('template'); t.innerHTML = `<button type="button" class="${cls}" data-tr-act ${attrs}${tip ? ` title="${esc(tip)}"` : ''}>${esc(label)}</button>`; return t.content.firstElementChild; };
        const safe = fn => async () => { try { await fn(); } catch (err) { toast(err?.message || String(err), 'error'); } };
        const out = [];
        if (o.primary) { const b = btn('button', o.primary.label, o.primary.attrs || '', o.primary.title || ''); if (o.primary.run) b.addEventListener('click', safe(o.primary.run)); out.push(b); }
        const exps = (o.exports || []).filter(Boolean), img = exps.find(x => x.make && x.media !== false);
        const media = o.media === true ? (img ? {make: () => blobOf(img, 'image.png'), title} : null) : o.media || null;
        const download = async x => { if (x.run) return x.run(); const r = await blobOf(x, 'tresor'); if (r) T.download(r.name, r.blob); };
        const toMedia = async () => {
            let r = media.make ? await (media.make.length ? media.make() : media.make()) : null; if (r && !r.blob && r instanceof Blob) r = {blob: r, name: 'tresor.png'}; if (!r?.blob) return;
            let {blob, name} = r; if (/svg/.test(blob.type)) { blob = await T.svgPng(await blob.text()); name = String(name || 'image').replace(/\.svg$/i, '') + '.png'; }
            const kind = media.kind || (/^video/.test(blob.type) ? 'video' : /^audio/.test(blob.type) ? 'audio' : 'image');
            const tt = typeof media.title === 'function' ? media.title() : media.title || title, m = await T.upload(blob, kind, tt, name || 'tresor.png');
            const pid = typeof media.person === 'function' ? media.person() : media.person; if (pid) await T.post('tresor_write', {op: 'link_media', media_id: m.media_id, person_id: pid}).catch(() => {});
            toast(`Une copie est rangée dans les médias${pid ? ' (et sur la fiche)' : ''} : « ${tt} ».`, 'success');
        };
        if (exps.length || o.layout || media) {
            const b = btn('button secondary h-tr-export', '⤓ Exporter ▾', 'data-tr-export aria-haspopup="menu"', 'Enregistrer un fichier sur l’ordinateur, ou ranger une copie dans les médias');
            b.addEventListener('click', () => {
                const items = [...exps.map(x => ({icon: x.icon || '⤓', label: x.label, help: x.help || '', run: safe(() => download(x))})),
                    ...(o.layout ? ['-', {icon: '📐', label: 'Ouvrir dans la mise en page', help: 'Pour tout retravailler (textes, cadres, pages)', run: safe(o.layout)}] : []),
                    ...(media ? ['-', {icon: '📁', label: 'Ranger une copie dans les médias', help: media.help || '', run: safe(toMedia)}] : [])];
                if (UI.menuAt) UI.menuAt(b, items, {title: '⤓ Exporter'}); else items.find(i => i && i.run)?.run();
            });
            out.push(b);
        }
        const prints = [].concat(o.print || []).filter(Boolean).map(p => (typeof p === 'function' ? {run: p} : p));
        if (prints.length === 1) { const p = prints[0], b = btn('button secondary h-tr-print', '🖨 Imprimer', `data-tr-print ${p.attrs || ''}`, p.title || p.label || 'Aperçu, A4 ou A5, ⤓ PDF'); b.addEventListener('click', safe(p.run)); out.push(b); }
        else if (prints.length > 1) { const b = btn('button secondary h-tr-print', '🖨 Imprimer ▾', 'data-tr-print aria-haspopup="menu"'); b.addEventListener('click', () => UI.menuAt?.(b, prints.map(p => ({icon: '🖨', label: p.label, help: p.help || '', run: safe(p.run)})), {title: '🖨 Imprimer'})); out.push(b); }
        (o.more || []).filter(Boolean).forEach(m => { const b = btn('button secondary', m.label, m.attrs || '', m.title || ''); if (m.run) b.addEventListener('click', safe(m.run)); out.push(b); });
        const star = acts.querySelector(':scope > [data-sc-star]');
        out.forEach(b => (star ? acts.insertBefore(b, star) : acts.appendChild(b)));
        acts.classList.toggle('is-empty', !acts.children.length);
        UI.harmonizePageHeader?.(page.querySelector('.page-header'));
        return out;
    }

    /* ═════════ L'onglet ═════════ */
    let pending = null; // une nouveauté demandée depuis un autre onglet (ext.tresors.open)
    /* Réordonner les trésors : l'ordre et les trésors cachés, retenus sur cet ordinateur */
    const PREF_KEY = 'lcnda-tresors-order';
    const prefs = () => { try { const o = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return {order: Array.isArray(o.order) ? o.order : [], hidden: Array.isArray(o.hidden) ? o.hidden : []}; } catch (_) { return {order: [], hidden: []}; } };
    /** tous les trésors, rangés : par partie (dans l'ordre des parties), puis dans l'ordre choisi (les nouveaux à la fin de leur partie) */
    function ordered() {
        const {order} = prefs(), rank = k => { const i = order.indexOf(k); return i < 0 ? 1e6 : i; };
        const gi = g => { const i = GROUPS.findIndex(x => x[0] === g); return i < 0 ? GROUPS.length : i; };
        return ext.tresorFeatures.map((f, i) => ({f, i})).sort((a, b) => gi(a.f.group) - gi(b.f.group) || rank(a.f.key) - rank(b.f.key) || a.i - b.i).map(x => x.f);
    }
    /* Les dossiers des trésors (« 🕯️ Garder la mémoire », « 🔭 Découvrir »…) : on les renomme, en crée, en efface, et on décide
       ce qui va dedans, comme dans Listes et Réglages (app-sidegroups.js) ; ou bien une seule liste. Les trésors cachés restent cachés. */
    let SG = null;
    const sg = () => {
        if (SG || !window.LCNDA_SIDEGROUPS || !ext.tresorFeatures?.length) return SG;
        const fOf = k => ext.tresorFeatures.find(f => f.key === k);
        SG = window.LCNDA_SIDEGROUPS({name: 'tresors', panelTitle: 'Les trésors et leurs dossiers', key: 'lcnda-tresors-groups', eyebrow: 'TRÉSORS', what: 'trésors', defaultEnabled: true,
            defaults: GROUPS.map(([g, label]) => { const [icon, ...rest] = label.split(' '); return ['g_' + g, icon, rest.join(' '), ordered().filter(f => f.group === g).map(f => f.key)]; }),
            allKeys: () => ext.tresorFeatures.map(f => f.key), label: k => { const f = fOf(k); return f ? `${f.icon} ${f.title}` : k; },
            flatOrder: () => ordered().map(f => f.key), flatDefaults: () => ext.tresorFeatures.map(f => f.key),
            setFlatOrder: keys => { try { localStorage.setItem(PREF_KEY, JSON.stringify({...prefs(), order: keys})); } catch (_) {} },
            canHide: true, hidden: () => prefs().hidden, setHidden: keys => { try { localStorage.setItem(PREF_KEY, JSON.stringify({...prefs(), hidden: keys})); } catch (_) {} },
            current: () => ''});
        return SG;
    };
    /** les dossiers à montrer : [[nom avec icône, [trésors]]] */
    function folders() {
        const {hidden} = prefs(), vis = f => f && !hidden.includes(f.key), S = sg();
        if (!S) return GROUPS.map(([g, label]) => [label, ordered().filter(f => f.group === g && vis(f))]);
        const p = S.prefs(), fOf = k => ext.tresorFeatures.find(f => f.key === k);
        if (!p.enabled) return [['', ordered().filter(vis)]];
        return p.groups.map(g => [`${g.icon} ${g.label}`, g.items.map(fOf).filter(vis)]);
    }
    function openSettings() {
        const S = sg();
        if (S) { S.openDialog(); const d = [...document.querySelectorAll('dialog.mt-reorder')].pop(); d?.addEventListener('close', () => { if (A().state.module === 'tresors' && A().$('#workspace .h-tr:not(.h-tr-page)')) A().$('#workspace').innerHTML = hub(); }); return; }
        openSettingsFlat();
    }
    function openSettingsFlat() {
        const hidden = prefs().hidden, glabel = g => (GROUPS.find(x => x[0] === g)?.[1] || '').replace(/^\S+\s/, '');
        const row = f => ({key: f.key, label: `${f.icon} ${f.title} — ${glabel(f.group)}`, hidden: hidden.includes(f.key)});
        A().openSideReorderDialog({eyebrow: 'TRÉSORS', title: 'Réordonner les trésors', canHide: true, rows: ordered().map(row),
            defaults: ext.tresorFeatures.map(f => ({...row(f), hidden: false})),
            save: rows => {
                if (rows.every(r => r.hidden)) { A().toast('Garde au moins un trésor affiché.', 'error'); return false; }
                try { localStorage.setItem(PREF_KEY, JSON.stringify({order: rows.map(r => r.key), hidden: rows.filter(r => r.hidden).map(r => r.key)})); } catch (_) {}
                if (A().state.module === 'tresors' && A().$('#workspace .h-tr:not(.h-tr-page)')) A().$('#workspace').innerHTML = hub();
                A().toast('Ordre et trésors affichés enregistrés.');
            }});
    }
    function hub() {
        const {hidden} = prefs(), list = ordered().filter(f => !hidden.includes(f.key)), nHid = ext.tresorFeatures.filter(f => hidden.includes(f.key)).length;
        return `<section class="page h-tr">
            ${window.LCNDA_UI?.pageHeader ? window.LCNDA_UI.pageHeader({where: 'Trésors', icon: '✨', title: 'Trésors de famille', help: 'Pour s’émerveiller, jouer, créer et garder la mémoire, à partir de ton arbre.', actions: [`<button type="button" class="button secondary" data-tr-settings title="Les dossiers des trésors (les renommer, en créer, en effacer, choisir ce qui va dedans), l’ordre, ce qui s’affiche${nHid ? ` (en ce moment : ${A().plural(nHid, 'trésor caché')})` : ''}">⚙️ Réglages</button>`]})
                : `<div class="page-header"><div><span class="eyebrow">Trésors</span><h2>✨ Trésors de famille</h2></div><div class="page-actions"><button type="button" class="button secondary" data-tr-settings>⚙️ Réglages</button></div></div>`}
            ${folders().map(([label, fs]) => { void list; return !fs.length ? (label ? `<h2 class="h-tr-group">${esc(label)}</h2>${A().empty('Dossier vide', {icon: '📂', hint: '⚙️ Réglages pour y ranger des trésors (ou l’effacer).'})}` : '') : `${label ? `<h2 class="h-tr-group">${esc(label)}</h2>` : ''}<div class="h-tr-grid">${fs.map(f => `<button type="button" class="h-tr-card" data-tr-open="${esc(f.key)}"><span class="h-tr-ic" aria-hidden="true">${esc(f.icon)}</span><b>${esc(f.title)}</b><small>${esc(f.desc)}</small></button>`).join('')}</div>`; }).join('')}
        </section>`;
    }
    async function render(token) {
        const ws = A().$('#workspace'); if (!ws) return;
        const key = (location.hash.match(/^#tresors\/([\w-]+)/) || [])[1] || pending; pending = null;
        if (key && ext.tresorFeatures.some(f => f.key === key)) return openFeature(key, !location.hash.startsWith(`#tresors/${key}`));
        ws.innerHTML = hub(); void token;
    }
    async function openFeature(key, push = true) {
        const f = ext.tresorFeatures.find(x => x.key === key), ws = A().$('#workspace'); if (!f || !ws) return;
        if (A().state.module !== 'tresors') { pending = key; return A().setModule('tresors'); }
        if (push && location.hash !== `#tresors/${key}`) history.pushState(null, '', `#tresors/${key}`);
        // K5 : un seul en-tête pour toutes les pages des Trésors — « ← Tous les trésors » (et la liste qui va avec) au-dessus,
        // sur-titre « Trésors · la famille du trésor », l'icône à part du nom, une phrase d'aide ; les boutons à droite (T.actions)
        const fam = GROUPS.find(g => g[0] === f.group)?.[1].replace(/^\S+\s/, '') || '';
        const back = `<nav class="h-tr-back" aria-label="Trésors"><button type="button" class="link-button" data-tr-home>← Tous les trésors</button>${(ext.tresorRelated?.[key] || []).map(([l], i) => `<button type="button" class="link-button" data-tr-rel="${esc(key)}:${i}">${esc(l)}</button>`).join('')}</nav>`;
        const head = window.LCNDA_UI?.pageHeader ? window.LCNDA_UI.pageHeader({where: fam ? `Trésors · ${fam}` : 'Trésors', icon: f.icon, title: f.title, help: esc(f.desc), back, cls: 'h-tr-head', attrs: `data-tr-head="${esc(key)}"`})
            : `<header class="page-header h-tr-head" data-tr-head="${esc(key)}"><div>${back}<span class="eyebrow">${esc(fam ? `Trésors · ${fam}` : 'Trésors')}</span><h2>${esc(f.icon)} ${esc(f.title)}</h2><p>${esc(f.desc)}</p></div><div class="page-actions"></div></header>`;
        ws.innerHTML = `<section class="page h-tr h-tr-page" data-tr-page="${esc(key)}">${head}<div class="h-tr-body" data-tr-body></div></section>`;
        const host = ws.querySelector('[data-tr-body]');
        // l'arbre relu à chaque ouverture : les fiches changées ailleurs y sont
        try { await T.tree(true); await f.render(host, T); } catch (err) { host.innerHTML = A().empty(`Impossible d’ouvrir : ${err.message || err}`, {icon: '⛔'}); console.error(err); }
    }
    document.addEventListener('click', e => {
        const o = e.target.closest('[data-tr-open]'); if (o && o.closest('.h-tr')) { e.preventDefault(); openFeature(o.dataset.trOpen); return; }
        if (e.target.closest('[data-tr-settings]')) { e.preventDefault(); openSettings(); return; }
        const rel = e.target.closest('[data-tr-rel]'); if (rel) { e.preventDefault(); const [k, i] = rel.dataset.trRel.split(':'); ext.tresorRelated?.[k]?.[Number(i)]?.[1](); return; }
        const h = e.target.closest('[data-tr-home]'); if (h) { e.preventDefault(); history.pushState(null, '', '#tresors'); A().$('#workspace').innerHTML = hub(); }
    });
    /* ═════════ Le bloc de la fiche : ✨ Trésors de cette personne ═════════ */
    const KIND_INFO = {letter: ['✉️', 'Lettres', 'lettres'], sense: ['👃', 'Souvenirs des sens', 'sens'], recipe: ['🥘', 'Recettes', 'recettes'], song: ['🎶', 'Chansons', 'chansons'], interview: ['🎙️', 'Entretiens', 'entretien'], candle: ['🕯️', 'Bougies', 'bougie'], passport: ['🛂', 'Passeports', 'passeports'], story: ['📖', 'Récits', ''], stamp: ['📍', 'Tampons', ''], hunt: ['🗝️', 'Chasses au trésor', ''], gazette: ['📰', 'Gazettes', ''], share: ['🔗', 'Partages', ''], reminder: ['⏰', 'Rappels', '']};
    ext.personBlocks = ext.personBlocks || {};
    const readOnly = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly'); // consultation, base en lecture seule
    ext.personBlocks.tresors = (index, detail, opts = {}) => {
        const pid = Number(detail?.person?.id); if (!pid || detail.person.kind === 'animal') return '';
        return A().card(index, '✨ Trésors', '', `<div class="h-tr-block" data-tr-block="${pid}">${window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner('Lecture…') : '<p class="muted">…</p>'}</div>`, 'span-12', readOnly() ? '' : `<button type="button" class="button small secondary" data-tr-open-k="sens">＋ Souvenir</button> <button type="button" class="button small secondary" data-tr-open-k="lettres">＋ Lettre</button>`);
    };
    async function fillBlock(detail) {
        const pid = Number(detail?.person?.id), el = document.querySelector(`#workspace [data-tr-block="${pid}"]`); if (!el) return;
        let items = []; try { const [a, b] = await Promise.all([T.items('', pid), T.api('tresor_memories', {person_id: pid}).then(r => r.items || []).catch(() => [])]); items = [...a, ...b]; } catch (_) { el.innerHTML = A().empty('Les trésors n’ont pas pu être lus.', {icon: '⚠️'}); return; }
        if (!items.length) { el.innerHTML = A().empty('Aucun trésor pour l’instant', {icon: '✨', hint: 'Un souvenir (une odeur, un bruit), une recette, une chanson, une lettre pour plus tard, un entretien enregistré… tout se garde dans l’onglet ✨ Trésors.'}); return; }
        const by = new Map(); items.forEach(x => { if (!by.has(x.kind)) by.set(x.kind, []); by.get(x.kind).push(x); });
        el.innerHTML = [...by].map(([k, l]) => { const [ic, label, key] = KIND_INFO[k] || ['✨', k, ''];
            return `<div class="h-tr-bk"><b>${ic} ${esc(label)}</b> ${l.map(x => `<span class="h-tr-pill">${x.sealed ? `🔒 ${esc(x.title)} — s’ouvre le ${esc(T.dateFr(x.open_at))}` : esc(x.title)}</span>`).join(' ')}${key ? ` <button type="button" class="h-tr-link" data-tr-open-k="${key}">Voir</button>` : ''}</div>`; }).join('');
    }
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => { fillBlock(detail); });
    document.addEventListener('click', e => { const b = e.target.closest('[data-tr-open-k]'); if (b && !b.closest('.h-tr-page')) { e.preventDefault(); openFeature(b.dataset.trOpenK); } });
})();
