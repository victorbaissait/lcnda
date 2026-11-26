/* LCNDA — 🧺 le panier et 📎 « Insérer une info » DANS LES OUTILS (audit : docs/audit-panier-inserer.md ; essai : tests/test-panier-inserer-outils.js).
 *
 *  Pour chaque outil ouvert qui sait recevoir (Traitement de texte, Présentation, Tableur, Dessin vectoriel, Mon site web, Livre de famille) :
 *   · « 📍 Mettre dans… », « 📥 Prendre depuis… » (⌥⌘O) et « 🧺 Vider le panier ici » le trouvent : « Ici : le document « … » » (LCNDA_EXT.dropTargets,
 *     en tête quand sa fenêtre est devant) ; chaque élément arrive à la façon de l'outil, AVEC SA SOURCE :
 *       📝 un paragraphe au curseur, la source en note de bas de page · 🎞️ une diapositive par élément, la source dans les notes de l'orateur
 *       🧾 une ligne par élément (un ensemble : son tableau), une colonne « Source » · ✒️ une étiquette (une image pour un média), sa source dessous
 *       🌐 un bloc « Document » sur la page, une ligne « Source : » · 📖 un paragraphe du « Mot de la fin », sa source
 *   · un petit groupe dans la barre de l'outil : 📎 « Insérer une info » (au curseur s'il est dans l'outil, sinon l'info arrive comme ci-dessus)
 *     et 📥 ▾ (Prendre depuis… · 🧺 Depuis le panier · 🧺 Prendre la sélection : un passage, la diapositive, les cellules, les objets choisis).
 *  📎 dans leurs textes : la source gardée à leur façon (LCNDA_EXT.insertInfo.hosts) — une note de bas de page (📝), les notes de la diapositive (🎞️),
 *    la case « Source / note en bas » d'un diagramme (📊 : ses titres comptent comme des champs) ; les autres textes : « [↗ source] » dans le texte.
 *  Sans fenêtre à soi : 🎞 Studio d'animation et 🎚️ Retouche reçoivent une image du panier (« 📤 Envoyer vers… » réutilisé, un nouveau film / la photo ouverte).
 *  Toujours : « ↶ Annuler » (A().undoToast, par l'historique de l'outil), rien en mode consultation, Réglages → 🧺 Panier et connexions décide de tout. */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const CX = () => ext.connexions || {};
    const QI = () => ext.insertInfo || {};
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const on = () => CX().enabled?.() !== false && !kiosk();
    const uid = () => `cx${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const refuse = () => { if (kiosk()) throw new Error(T('Mode consultation : rien ne peut être modifié.')); };
    const DT = ext.dropTargets = ext.dropTargets || [];
    /** la fenêtre de devant (sans « Prendre depuis… », « Mettre dans… » ni un menu) */
    const front = () => [...document.querySelectorAll('dialog[open]')].filter(d => !d.matches('.cx-modal, .ui-actmenu, .ui-menu-dlg')).pop() || null;
    const line = it => (CX().kit?.itemLine ? CX().kit.itemLine(it) : `${it.title || ''}${it.value && it.value !== it.title ? ` — ${it.value}` : ''}`);
    const srcOf = it => (it.kind === 'set' ? [it.data?.source, it.data?.url || it.origin?.url, it.data?.licence].filter(Boolean).join(' — ') : '') || [it.origin?.label, it.origin?.url].filter(Boolean).join(' — ');
    const explode = items => items.flatMap(it => (CX().explode ? CX().explode(it) : [it]));
    const fileOf = it => String(it.data?.filename || '').replace(/^media\//, '');
    const plain = s => String(s ?? '').replace(/[<>]/g, ''); // une note de bas de page ne garde pas de < > (le Traitement de texte les refuse)
    const textOf = html => { const d = document.createElement('div'); d.innerHTML = String(html || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
    /** les « [↗ source] » qu'« Insérer une info » met dans le texte : remplacés par ce que l'outil en fait (rep(libellé, lien) → HTML) */
    const MARK = /\s*(?:<a href="([^"]*)"[^>]*class="cx-qi-src"[^>]*>\[↗ ([^\]]*)\]<\/a>|\[↗ ([^\]<]*)\])/g;
    const swapMarks = (html, rep) => String(html || '').replace(MARK, (m, url, l1, l2) => rep((l1 ?? l2 ?? '').trim(), url || ''));

    /* ═════════ les outils ═════════ */
    const TOOLS = [];
    const tool = t => { TOOLS.push(t); return t; };

    /* 📝 Traitement de texte */
    const wp = () => { const ed = ext.textDocKit?.current; return ed && !ed.closed && ed.dlg?.isConnected ? ed : null; };
    const fnHtml = note => (note ? `<sup class="wp-fn" data-fn="${uid()}" data-kind="foot" data-note="${esc(plain(note))}" contenteditable="false">*</sup>` : '');
    tool({id: 'textdoc', icon: '📝', dlg: '.wp-dlg', bar: '.wp-dlg .ui-topbar', inst: wp, name: ed => T('le document « {n} »', {n: ed.name || T('Document')}),
        explain: () => T('au curseur, chacun avec sa source en note de bas de page'),
        receive: async (items, ed) => {
            const html = items.map(it => (it.kind === 'set'
                ? `<p data-st="normal"><b>${esc(it.title)}</b>${fnHtml(srcOf(it))}</p><table class="wp-table"><thead><tr>${(it.data?.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(it.data?.rows || []).slice(0, 500).map(r => `<tr>${(r || []).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
                : `<p data-st="normal">${esc(line(it))}${fnHtml(srcOf(it))}</p>`)).join('');
            ed.focusBack?.(); const lr = ed.lastRange;
            if (lr && lr.startContainer.isConnected && ed.secOf?.(lr.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(lr); } else ed.focusEnd?.(false);
            ed.commit(); const h0 = ed.hpos; ed.insertHtml(html); ed.commit(); ed.layout();
            if (ed.hpos === h0) throw new Error(T('Mets d’abord le curseur dans le document.'));
            return {message: T('📝 Dans « {n} » : {k}, les sources en notes de bas de page', {n: ed.name || T('Document'), k: A().plural ? A().plural(items.length, T('élément')) : nf(items.length)}),
                undo: async () => { if (ed.closed || !ed.dlg?.isConnected) throw new Error(T('Le document est fermé.')); while (ed.hpos > h0) ed.undo(); }};
        },
        takeSel: ed => { const r = ed.sel?.() || ed.lastRange, txt = String(r?.toString?.() || '').replace(/\s+/g, ' ').trim();
            return txt ? [{kind: 'text', ref_id: 0, title: txt.slice(0, 120), value: txt.slice(0, 20000), origin: {kind: 'textdoc', id: Number(ed.id) || 0, label: T('Document « {n} »', {n: ed.name || ''})}}] : []; },
        selHint: 'Choisis d’abord un passage du document.',
        host: {match: el => !!el.closest?.('.wp-dlg .wp-body'), said: items => (items.some(srcOf) ? '📎 Inséré ; la source est en note de bas de page' : ''),
            render: ({html}) => ({html: swapMarks(html, (l, u) => fnHtml([l, u].filter(Boolean).join(' — ')))}),
            cite: () => { wp()?.layout?.(); return null; }}});

    /* 🎞️ Présentation */
    const kn = () => { const k = ext.keynoteCurrent; return k && !k.closed && k.dlg?.isConnected ? k : null; };
    tool({id: 'keynote', icon: '🎞️', dlg: '.kn-dlg', bar: '.kn-dlg .kn-top', inst: kn, name: k => T('la présentation « {n} »', {n: k.name || T('Présentation')}),
        explain: () => T('une diapositive par élément (un ensemble : un tableau), la source dans les notes'),
        receive: async (items, k) => {
            const KI = ext.keynoteInternals; if (!KI?.slidesFromText) throw new Error(T('La présentation n’est pas chargée.'));
            const slides = items.flatMap(it => {
                const f = fileOf(it), body = it.kind === 'set'
                    ? `<table><tr>${(it.data?.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr>${(it.data?.rows || []).slice(0, 30).map(r => `<tr>${(r || []).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
                    : it.kind === 'media' && f ? `<img src="media/${esc(encodeURIComponent(f))}" data-media-id="${Number(it.ref_id) || 0}" alt="${esc(it.title)}">` : it.value && it.value !== it.title ? `<p>${esc(it.value)}</p>` : '';
                const s = KI.slidesFromText(`<h2>${esc(it.title || T('Élément'))}</h2>${body}`, k.show), src = srcOf(it);
                s.forEach(x => { x.notes = src ? `${T('Source :')} ${src}` : ''; }); return s;
            });
            if (!slides.length) throw new Error(T('Rien à mettre en diapositive.'));
            k.addSlides(slides);
            return {message: T('🎞️ {n} dans « {p} », les sources dans les notes', {n: A().plural ? A().plural(slides.length, T('diapositive')) : nf(slides.length), p: k.name}),
                undo: async () => { if (!kn()) throw new Error(T('La présentation est fermée.')); k.run('undo'); }};
        },
        takeSel: k => { const s = k.show?.slides?.[k.cur]; if (!s) return []; const txt = (s.objs || []).filter(o => o.t === 'text').map(o => textOf(o.html)).filter(Boolean);
            return [{kind: 'text', ref_id: 0, title: (txt[0] || T('Diapositive {i}', {i: k.cur + 1})).slice(0, 120), value: txt.slice(1).join(' · ').slice(0, 20000) || txt[0] || '', origin: {kind: 'keynote', label: T('Présentation « {n} », diapositive {i}', {n: k.name, i: k.cur + 1})}}]; },
        host: {match: el => !!(el.isContentEditable && el.closest?.('.kn-dlg') && !el.closest('[data-kn-notesbox]')), said: items => (items.some(srcOf) ? '📎 Inséré ; la source est dans les notes de la diapositive' : ''),
            render: ({text, html}) => ({text: text.replace(/\s*\[↗ [^\]]*\]/g, ''), html: swapMarks(html, () => '')}),
            cite: (el, items) => { const src = [...new Set(items.map(srcOf).filter(Boolean))]; return src.length ? kn()?.addNotes?.(src.map(s => `${T('Source :')} ${s}`).join('\n')) || null : null; }}});

    /* 🧾 Tableur */
    const xl = () => { const ed = ext.tableurInternals?.current; return ed && ed.dlg?.isConnected ? ed : null; };
    tool({id: 'sheet', icon: '🧾', dlg: '.xl-dlg', bar: '.xl-dlg .ui-topbar', inst: xl, name: ed => T('le classeur « {n} »', {n: ed.name || T('Tableau')}),
        explain: () => T('sous les données : une ligne par élément (un ensemble : son tableau), une colonne « Source »'),
        receive: async (items, ed) => {
            const S = window.LCNDA_SHEET; if (!S?.addr) throw new Error(T('Le tableur n’est pas chargé.'));
            const sh = ed.S(), u = ed.calc.used(ed.si), safe = v => (typeof v === 'string' && /^\s*=/.test(v) ? `'${v}` : v); // une case « =… » reste du texte
            const set = items.length === 1 && items[0].kind === 'set' ? items[0] : null;
            const rows = set ? [[...(set.data?.columns || []), T('Source')], ...(set.data?.rows || []).map(r => [...(r || []), srcOf(set)])]
                : [[T('Quoi'), T('Détail'), T('Source')], ...explode(items).map(x => [x.title || '', x.value || '', srcOf(x)])];
            let r0 = u.r ? u.r + 1 : 0; // une ligne vide entre ce qui était là et ce qui arrive
            ed.begin(T('Depuis le panier'));
            rows.forEach((row, i) => row.forEach((v, j) => { if (v != null && v !== '') ed.put(sh, S.addr(r0 + i, j), {v: safe(v)}); }));
            const tx = ed.commit(); ed.render?.();
            if (!tx) throw new Error(T('Rien à ajouter.'));
            return {message: T('🧾 {n} dans « {s} » (ligne {r})', {n: A().plural ? A().plural(rows.length - 1, T('ligne')) : nf(rows.length - 1), s: ed.name || T('Tableau'), r: r0 + 1}),
                undo: async () => { if (!xl()) throw new Error(T('Le classeur est fermé.')); if (ed.undoStack[ed.undoStack.length - 1] !== tx) throw new Error(T('d’autres changements ont suivi : utilise ↶ dans le tableur')); ed.undo(); }};
        },
        takeSel: ed => { const S = window.LCNDA_SHEET, s = ed.sel || {}; const g = {r0: Math.min(s.r0, s.r1), r1: Math.max(s.r0, s.r1), c0: Math.min(s.c0, s.c1), c1: Math.max(s.c0, s.c1)};
            const m = S?.matrix ? S.matrix(ed.wb, ed.calc, ed.si, g, {display: true}).map(r => r.map(v => String(v ?? ''))) : []; if (!m.length || !m.some(r => r.some(Boolean))) return [];
            const label = T('Tableur « {n} »', {n: ed.name || ''}); if (m.length === 1) return [{kind: 'row', ref_id: 0, title: m[0][0] || '', value: m[0].slice(1).filter(Boolean).join(' · '), data: {columns: [], row: m[0]}, origin: {kind: 'sheet', id: Number(ed.id) || 0, label}}];
            return [{kind: 'set', ref_id: 0, title: `${ed.name || T('Tableau')} — ${T('{n} lignes', {n: nf(m.length - 1)})}`, value: '', data: {columns: m[0], rows: m.slice(1), source: label}, origin: {kind: 'sheet', id: Number(ed.id) || 0, label}}]; },
        selHint: 'Choisis d’abord des cellules.'});

    /* ✒️ Dessin vectoriel */
    const vx = () => { const v = ext.vectorCurrent; return v && v.dlg?.isConnected ? v : null; };
    const vxName = v => v.dlg.querySelector('[data-vx-name]')?.value || T('Dessin');
    const imgSize = src => new Promise(ok => { const im = new Image(); im.onload = () => ok([im.naturalWidth || 400, im.naturalHeight || 300]); im.onerror = () => ok([400, 300]); im.src = src; setTimeout(() => ok([400, 300]), 4000); });
    tool({id: 'vector', icon: '✒️', dlg: '.vx-dlg', bar: '.vx-dlg .vx-top', inst: vx, name: v => T('le dessin « {n} »', {n: vxName(v)}),
        explain: () => T('une étiquette par élément (un média : son image), sa source dessous'),
        receive: async (items, v) => {
            const objs = []; let y = 40; const W = Number(v.doc?.w) || 800;
            for (const it of explode(items).slice(0, 60)) {
                const f = fileOf(it), src = srcOf(it);
                if (it.kind === 'media' && /^[A-Za-z0-9._%\-]{1,240}$/.test(encodeURIComponent(f))) { const [w0, h0] = await imgSize(`media/${encodeURIComponent(f)}`), k = Math.min(1, (W * .6) / w0, 360 / h0);
                    objs.push({id: uid(), type: 'image', name: it.title || T('Image'), src: `media/${encodeURIComponent(f)}`, x: 40, y, w: Math.round(w0 * k), h: Math.round(h0 * k)}); y += Math.round(h0 * k) + 12; }
                objs.push({id: uid(), type: 'text', name: String(it.title || T('Texte')).slice(0, 30), text: line(it).slice(0, 300), x: 40, y: y + 24, size: 24, font: 'Georgia', fill: '#222222', sw: 0}); y += 34;
                if (src) { objs.push({id: uid(), type: 'text', name: T('Source'), text: `${T('Source :')} ${src}`.slice(0, 300), x: 40, y: y + 16, size: 13, font: 'Georgia', fill: '#666666', sw: 0}); y += 24; }
                y += 16;
            }
            if (!objs.length) throw new Error(T('Rien à ajouter.'));
            const h0 = v.hi; v.addObjs(objs, T('Depuis le panier'));
            return {message: T('✒️ {n} dans « {d} »', {n: A().plural ? A().plural(items.length, T('élément')) : nf(items.length), d: vxName(v)}),
                undo: async () => { if (!vx()) throw new Error(T('Le dessin est fermé.')); if (v.hi !== h0 + 1) throw new Error(T('d’autres changements ont suivi : utilise ↶ dans le dessin')); v.cmd('undo'); }};
        },
        takeSel: v => { const ids = new Set(v.selected || []), all = []; const walk = l => (l || []).forEach(o => { if (o.kids) walk(o.kids); if (ids.has(o.id)) all.push(o); }); walk(v.doc?.objs);
            const origin = {kind: 'vector', label: T('Dessin « {n} »', {n: vxName(v)})};
            return all.map(o => (o.type === 'image' && /^media\//.test(o.src || '') ? {kind: 'media', ref_id: 0, title: o.name || T('Image'), value: '', data: {filename: decodeURIComponent(o.src.slice(6))}, origin}
                : o.text ? {kind: 'text', ref_id: 0, title: String(o.text).slice(0, 120), value: String(o.text).slice(0, 20000), origin} : null)).filter(Boolean); },
        selHint: 'Choisis d’abord un texte ou une image du dessin.'});

    /* 🌐 Mon site web */
    const sw = () => { const ed = ext.siteWeb?.current; return ed && !ed.closed && ed.dlg?.isConnected ? ed : null; };
    tool({id: 'site', icon: '🌐', dlg: '.sw-dlg', bar: '.sw-dlg .ui-topbar', inst: sw, name: ed => T('la page « {p} » du site « {n} »', {p: ed.page?.()?.name || '', n: ed.name || ''}),
        explain: () => T('un bloc « Document » sur la page ouverte, avec une ligne « Source : »'),
        receive: async (items, ed) => {
            const k = ext.siteKit, b = k?.BLOCKS?.find(x => x.key === 'document'); if (!b) throw new Error(T('Mon site web n’est pas chargé : recharge la page.'));
            const html = k.cleanDocHtml(items.map(it => `<p>${esc(line(it))}</p>${srcOf(it) ? `<p><small>${esc(T('Source :'))} ${esc(srcOf(it))}</small></p>` : ''}`).join(''));
            const name = items.length === 1 ? String(items[0].title || '').slice(0, 120) : '';
            const r = k.insertHtml(ed.page().html, b.html({title: ed.site.settings.title}, {html, name}), ed.sel?.path ? {path: ed.sel.path} : {});
            ed.page().html = r.html; ed.changed(true); if (ed.codeTab === 'html') ed.code.value = ed.page().html;
            ed.sel = r.path ? {path: r.path, tag: '', cls: '', id: '', name: b.label} : null; ed.pushHtml(); ed.hist.commit();
            return {message: T('🌐 Sur la page « {p} », avec la source', {p: ed.page().name}), undo: async () => { if (!sw()) throw new Error(T('Le site est fermé.')); ed.undo(); }};
        }});

    /* 📊 Diagrammes : les titres comptent ; la source va dans « Source / note en bas » */
    const dgSrc = el => el.closest('.h-dg-dlg')?.querySelector('[data-opt="source"]');
    tool({id: 'diagram', icon: '📊', dlg: '.h-dg-dlg', bar: '.h-dg-dlg .h-dg-top', inst: () => document.querySelector('dialog.h-dg-dlg[open]'), name: () => T('le diagramme'), noReceive: true,
        main: d => d.querySelector('[data-opt="title"]'),
        host: {field: el => !!el.closest?.('.h-dg-dlg') && el.matches('[data-opt="title"], [data-opt="subtitle"], [data-opt="source"]'), match: el => !!el.closest?.('.h-dg-dlg') && el.matches?.('[data-opt]'),
            said: (items, el) => (el?.matches?.('[data-opt="source"]') || !items.some(srcOf) ? '' : '📎 Inséré ; la source est dans « Source / note en bas »'),
            render: ({text}, el) => (el.matches('[data-opt="source"]') ? null : {text: text.replace(/\s*\[↗ [^\]]*\]/g, '')}),
            cite: (el, items) => { const s = dgSrc(el); if (!s || el === s) return null; const add = [...new Set(items.map(srcOf).filter(Boolean))].filter(x => !s.value.includes(x)); if (!add.length) return null;
                const before = s.value; s.value = [before, ...add].filter(Boolean).join(' · '); s.dispatchEvent(new Event('input', {bubbles: true}));
                return () => { s.value = before; s.dispatchEvent(new Event('input', {bubbles: true})); }; }}});

    /* 📖 Livre de famille : le « Mot de la fin » à l'écran (la destination existante, heritage-connexions.js, quand le livre n'est pas ouvert) */
    const bookForm = () => { const f = document.getElementById('family-book-form'); return f && f.getClientRects().length && f.elements.epilogue ? f : null; };
    tool({id: 'book', icon: '📖', bar: '#family-book-form', barIn: f => f.elements.epilogue?.closest('label'), inst: bookForm, name: () => T('le Livre de famille (« Mot de la fin »)'), screen: true,
        explain: () => T('un paragraphe du « Mot de la fin », avec sa source'),
        receive: async (items, f) => {
            const ta = f.elements.epilogue, before = ta.value, add = items.map(it => `${line(it)}${srcOf(it) ? `\n${T('Source :')} ${srcOf(it)}` : ''}`).join('\n\n');
            ta.value = `${before ? `${before}\n\n` : ''}${add}`.slice(0, Number(ta.maxLength) > 0 ? Number(ta.maxLength) : 8000);
            const sw = f.querySelector('[data-book-list="sections"] li[data-k="epilogue"] [data-book-on]'), wasOn = !sw || sw.checked; if (sw) sw.checked = true; // le « Mot de la fin » entre dans le livre
            const fire = () => { ta.dispatchEvent(new Event('input', {bubbles: true})); ta.dispatchEvent(new Event('change', {bubbles: true})); }; fire();
            return {message: T('📖 Dans le « Mot de la fin », avec les sources'), undo: async () => { if (!ta.isConnected) throw new Error(T('Le Livre de famille n’est plus à l’écran.')); ta.value = before; if (sw) sw.checked = wasOn; fire(); }};
        }});

    /* ═════════ « 📍 Mettre dans… », « 📥 Prendre depuis… », « 🧺 Vider le panier ici » : l'outil ouvert ═════════ */
    const isFront = (t, i) => (t.screen ? !front() : front() === i.dlg || front() === i);
    const dtOf = t => t._dt;
    TOOLS.filter(t => !t.noReceive).forEach(t => {
        t._dt = {id: `tool_${t.id}`, icon: t.icon, label: `${t.icon} ${T('L’outil ouvert')}`, group: 'Créer', kinds: t.kinds || null,
            enabled: () => on() && !!t.inst(),
            here: () => { if (!on()) return null; const i = t.inst(); return i && isFront(t, i) ? {inst: i, label: T('Ici : {w}', {w: t.name(i)})} : null; },
            choose: async () => { const i = t.inst(); return i ? {inst: i, label: t.name(i)} : null; },
            explain: () => t.explain(),
            receive: async (items, ctx) => { refuse(); const i = ctx?.inst && (ctx.inst.dlg?.isConnected || ctx.inst.isConnected) ? ctx.inst : t.inst(); if (!i) throw new Error(T('L’outil est fermé.')); return t.receive(items, i); }};
        Object.defineProperty(t._dt, 'label', {get: () => { const i = t.inst(); return i ? `${T('L’outil ouvert :')} ${t.name(i)}` : T('L’outil ouvert'); }});
        DT.unshift(t._dt); // devant : la fenêtre de l'outil passe avant l'écran qui est dessous
    });

    /* 🎞 Studio d'animation, 🎚️ Retouche : une image du panier, par « 📤 Envoyer vers… » (heritage-envoyer.js) */
    async function mediaOf(it) {
        let f = fileOf(it); if (!f && it.ref_id) { try { const r = await A().api('picker_search', {kind: 'media', ids: String(it.ref_id)}); const m = r.groups?.[0]?.items?.[0]; f = m?.filename || String(m?.thumb || '').replace(/^media\//, ''); } catch (_) {} }
        return f ? {id: Number(it.ref_id) || 0, filename: f, title: it.title || ''} : null;
    }
    [['anim-new', '🎞', 'Un nouveau film du Studio d’animation', 'l’image dans un nouveau film'], ['retouch', '🎚️', 'La Retouche des photos', 'la photo ouverte dans la Retouche']].forEach(([key, icon, label, what]) => {
        if (DT.some(t => t.id === `send_${key}`)) return;
        DT.push({id: `send_${key}`, icon, label, group: 'Créer', kinds: ['media'], enabled: () => on() && !!(ext.sendTargets || []).find(x => x.key === key)?.ready?.(), choose: async () => ({}), explain: () => T(what),
            receive: async items => { refuse(); const m = await mediaOf(items[0]); if (!m?.id) throw new Error(T('Cette image n’est pas dans les médias.')); await ext.sendTo('image', {media: m}, {to: key, title: m.title});
                return {message: T('{i} Ouvert dans {l}', {i: icon, l: T(label)}), left: items.slice(1)}; }});
    });

    /* ═════════ 📎 dans les textes des outils ═════════ */
    const hostsReady = setInterval(() => { const H = QI().hosts; if (!H) return; clearInterval(hostsReady); TOOLS.forEach(t => { if (t.host && !H.some(h => h.id === `tool_${t.id}`)) H.unshift({id: `tool_${t.id}`, ...t.host}); }); }, 50);
    setTimeout(() => clearInterval(hostsReady), 30000);

    /* ═════════ le petit groupe dans la barre de l'outil : 📎 · 📥 ▾ ═════════ */
    const keyHint = id => { try { return A().shortcutKit?.hint?.(id) || ''; } catch (_) { return ''; } };
    function groupHtml(t) {
        return `<span class="cx-tool-btns" data-cx-tool="${esc(t.id)}" role="group" aria-label="${esc(T('Insérer et prendre'))}">`
            + `<button type="button" class="cx-tool-b" data-cx-tool-ins title="${esc(T('📎 Insérer une info (une date, un lieu, une ligne de liste…) — {k}', {k: keyHint('insert_info') || '⌥⌘K'}))}" aria-label="${esc(T('Insérer une info'))}">📎</button>`
            + (t.noReceive ? '' : `<button type="button" class="cx-tool-b" data-cx-tool-add title="${esc(T('📥 Prendre depuis…, 🧺 le panier, prendre la sélection'))}" aria-label="${esc(T('Ajouter depuis le panier ou ailleurs'))}" aria-haspopup="menu">📥<span aria-hidden="true">▾</span></button>`) + '</span>';
    }
    function paintGroups() {
        TOOLS.forEach(t => document.querySelectorAll(t.bar).forEach(bar => {
            let g = bar.querySelector(':scope [data-cx-tool]');
            if (kiosk() || CX().enabled?.() === false) { g?.remove(); return; }
            if (!g) {
                const tpl = document.createElement('template'); tpl.innerHTML = groupHtml(t); g = tpl.content.firstChild;
                const at = t.barIn ? t.barIn(bar) : bar.querySelector(':scope > .ui-topbar-hist') || bar.querySelector(':scope > nav') || null;
                if (t.barIn && at) at.after(g); else if (at) at.after(g); else bar.appendChild(g);
                g.addEventListener('mousedown', e => { if (e.target.closest('[data-cx-tool-ins]')) e.preventDefault(); }); // le curseur reste où il était (📎 l'y retrouve)
                g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.matches('[data-cx-tool-ins]')) insHere(t, b); else addMenu(t, b); });
            }
            const ins = g.querySelector('[data-cx-tool-ins]'); if (ins) ins.hidden = QI().live?.() === false;
        }));
    }
    let raf = 0; const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintGroups(); }); };
    new MutationObserver(soon).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('change', e => { if (e.target.closest?.('[data-qi-set], .cx-settings, [data-cx-set]')) setTimeout(soon, 50); }, true);

    /** 📎 : au curseur s'il est dans l'outil ; sinon l'info choisie arrive dans l'outil à sa façon (comme du panier) */
    function insHere(t, btn) {
        if (kiosk()) return A().toast?.(T('Mode consultation : rien ne peut être écrit.'));
        if (QI().live?.() === false) return A().toast?.(T('« Insérer une info » est éteint (Réglages → 🧺 Panier et connexions).'));
        const i = t.inst(), box = btn.closest('dialog') || btn.closest('form') || document.body, f = QI().lastField?.();
        if (f && box.contains(f) && QI().isField?.(f) && f.getClientRects().length) { f.focus(); return QI().open(f); }
        const m = t.main?.(i || box); if (m && QI().isField?.(m)) { m.focus(); return QI().open(m); }
        if (t.noReceive || !i) return A().toast?.(T('Mets d’abord le curseur dans un texte de l’outil.'));
        QI().open(btn, {onPick: items => (items?.length ? CX().deliver(dtOf(t), items, {ctx: {inst: i}}) : null)});
    }
    /** 📥 ▾ : Prendre depuis… (vers l'outil), 🧺 Depuis le panier, 🧺 Prendre la sélection */
    function addMenu(t, btn) {
        if (!on()) return A().toast?.(kiosk() ? T('Mode consultation : rien ne peut être modifié.') : T('Le panier est éteint (Réglages → 🧺 Panier et connexions).'));
        const i = t.inst(); if (!i) return; const n = CX().count?.() || 0;
        const items = [{icon: '📥', label: T('Prendre depuis…'), shortcut: keyHint('take_from'), run: () => CX().openTake({dest: dtOf(t), ctx: {inst: i, label: t.name(i)}})},
            {icon: '🧺', label: n ? T('Depuis le panier ({n})', {n: nf(n)}) : T('Depuis le panier'), run: () => fromBasket(t, i)}];
        if (t.takeSel) items.push('-', {icon: '🧺', label: T('Prendre la sélection'), run: () => { const its = t.takeSel(i) || []; if (!its.length) return A().toast?.(T(t.selHint || 'Rien de choisi.')); return CX().take(its); }});
        UI().menuAt?.(btn, items, {title: T('Ajouter à {w}', {w: t.name(i)})});
    }
    async function fromBasket(t, i) {
        let b = null; try { b = await A().api('cx_basket', {basket_id: Number(JSON.parse(localStorage.getItem('genealogie-connexions-panier') || '0')) || 0}); } catch (_) {}
        const items = (b?.items || []).filter(it => !t.kinds || t.kinds.includes(it.kind));
        if (!items.length) return A().toast?.(T('Le panier est vide.'));
        return CX().deliver(dtOf(t), items, {ctx: {inst: i}, fromBasket: true});
    }
    ext.toolConnexions = {TOOLS, paint: paintGroups, front};
})();
