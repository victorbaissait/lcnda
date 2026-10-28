/* LCNDA — 📁 Dossiers (et sous-dossiers) dans la colonne de gauche de Graphiques : « Mes diagrammes » et « Mes graphiques » ;
 * aussi l'onglet « 📄 Documents » (kind 'document', les médias rangés en dossiers).
 * Rangement gardé dans la clé « genealogie-side-folders » (suit la base comme les autres réglages « genealogie-* ») :
 *   {diagram:{folders:[{id,name,parent}], of:{<id élément>:<id dossier>}, closed:[ids]}, graph:{…}}
 * Tout est nettoyé à la lecture (noms bornés, ids f_…, parents qui existent, pas de boucle, 3 niveaux, 200 dossiers).
 * Ranger : en glissant (seulement « Mes diagrammes ») ou par le bouton « 📁 Ranger » de la page d'un élément.
 * Chaque rangement se défait (« ↶ Annuler »). En mode consultation : on voit et on ouvre les dossiers, rien d'autre.
 */
(() => {
    'use strict';
    const KEY = 'genealogie-side-folders';
    const KINDS = ['diagram', 'graph', 'document']; // 📄 document : l'onglet « Documents » (heritage-onglets-documents.js)
    const MAX_FOLDERS = 200, MAX_DEPTH = 3, MAX_NAME = 60, MAX_ENTRIES = 5000;
    const FID = /^f_[a-z0-9]{1,16}$/;
    const ITEM_ID = {diagram: /^\d{1,12}$/, graph: /^[A-Za-z0-9_-]{1,64}$/, document: /^\d{1,12}$/};
    const WORD = {diagram: ['diagramme', 'diagrammes'], graph: ['graphique', 'graphiques'], document: ['document', 'documents']};
    const DRAG = new Set(['diagram', 'document']); // on range en glissant (Mes graphiques : par « 📁 Ranger » seulement)
    const A = () => window.LCNDA_APP;
    const esc = s => (A()?.escapeHtml || (x => String(x).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]))))(String(s ?? ''));
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const toast = (m, t) => A()?.toast?.(m, t);
    const newId = () => 'f_' + Math.random().toString(36).slice(2, 12);
    const cleanName = v => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

    /* ─── lecture nettoyée ─── */
    function cleanKind(raw, kind) {
        const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const folders = [], seen = new Set();
        for (const f of Array.isArray(r.folders) ? r.folders : []) {
            if (folders.length >= MAX_FOLDERS) break;
            if (!f || typeof f !== 'object') continue;
            const id = String(f.id ?? ''); if (!FID.test(id) || seen.has(id)) continue;
            seen.add(id);
            folders.push({id, name: (typeof f.name === 'string' ? cleanName(f.name) : '') || 'Dossier', parent: typeof f.parent === 'string' && FID.test(f.parent) && f.parent !== id ? f.parent : null});
        }
        const byId = new Map(folders.map(f => [f.id, f]));
        folders.forEach(f => { if (f.parent && !byId.has(f.parent)) f.parent = null; });
        // pas de boucle : en remontant, on ne repasse jamais par le même dossier
        folders.forEach(f => { const path = new Set([f.id]); let p = f.parent; while (p) { if (path.has(p)) { f.parent = null; break; } path.add(p); p = byId.get(p)?.parent || null; } });
        // 3 niveaux au plus : un dossier trop profond remonte sous l'ancêtre du 2e niveau
        const depth = new Map();
        const fix = f => {
            if (depth.has(f.id)) return depth.get(f.id);
            let d = 1;
            if (f.parent) {
                const pd = fix(byId.get(f.parent));
                if (pd >= MAX_DEPTH) { let p = byId.get(f.parent); while (p && depth.get(p.id) >= MAX_DEPTH) p = byId.get(p.parent); f.parent = p ? p.id : null; d = p ? depth.get(p.id) + 1 : 1; }
                else d = pd + 1;
            }
            depth.set(f.id, d); return d;
        };
        folders.forEach(fix);
        const of = {};
        const rawOf = r.of && typeof r.of === 'object' && !Array.isArray(r.of) ? r.of : {};
        let n = 0;
        for (const [k, v] of Object.entries(rawOf)) {
            if (n >= MAX_ENTRIES) break;
            if (!ITEM_ID[kind].test(k) || typeof v !== 'string' || !byId.has(v)) continue;
            of[k] = v; n++;
        }
        const closed = [...new Set((Array.isArray(r.closed) ? r.closed : []).filter(id => typeof id === 'string' && byId.has(id)))];
        return {folders, of, closed};
    }
    function readAll() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { raw = null; }
        const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        return Object.fromEntries(KINDS.map(k => [k, cleanKind(r[k], k)]));
    }
    const read = kind => readAll()[kind];
    function writeKind(kind, data) {
        const all = readAll(); all[kind] = cleanKind(data, kind);
        try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) {}
    }

    /* ─── outils sur l'arbre ─── */
    const childrenOf = (data, parent) => data.folders.filter(f => (f.parent || null) === (parent || null));
    const folderById = (data, id) => data.folders.find(f => f.id === id) || null;
    function depthOf(data, id) { let d = 0, f = folderById(data, id); while (f) { d++; f = f.parent ? folderById(data, f.parent) : null; } return d; }
    function heightOf(data, id) { const kids = childrenOf(data, id); return 1 + (kids.length ? Math.max(...kids.map(k => heightOf(data, k.id))) : 0); }
    function isInside(data, id, ancestor) { let f = folderById(data, id); while (f) { if (f.id === ancestor) return true; f = f.parent ? folderById(data, f.parent) : null; } return false; }
    const pathOf = (data, id) => { const out = []; let f = folderById(data, id); while (f) { out.unshift(f.id); f = f.parent ? folderById(data, f.parent) : null; } return out; };
    /** peut-on mettre le dossier id dans parent (null = premier niveau) ? renvoie un message si non */
    function moveFolderError(data, id, parent) {
        if (!parent) return '';
        if (parent === id) return 'Un dossier ne peut pas aller dans lui-même.';
        if (isInside(data, parent, id)) return 'Un dossier ne peut pas aller dans un de ses propres sous-dossiers.';
        if (depthOf(data, parent) + heightOf(data, id) > MAX_DEPTH) return 'Trois niveaux de dossiers au plus : choisis un dossier moins profond.';
        return '';
    }
    const clone = d => JSON.parse(JSON.stringify(d));

    /** ↶ chaque rangement se défait */
    function commit(kind, message, change) {
        const app = A(), after = () => app?.renderSidebar?.();
        const run = () => { const d = clone(read(kind)); change(d); writeKind(kind, d); };
        if (app?.undoLocalChange) app.undoLocalChange(message, [KEY], run, after);
        else run();
        after();
    }

    /* ─── la colonne ─── */
    const lastActive = {};
    /**
     * kind 'diagram' | 'graph' ; items [[id, libellé]] dans l'ordre de l'app ; isActive(id) ; itemHtml(id, libellé, index) → bouton
     * ([data-side-value], numéro D1/M1 d'aujourd'hui) ; footer : le bouton « Créer… ». Renvoie le titre et la liste.
     */
    function sectionHtml(kind, {label, items, isActive, itemHtml, footer = ''}) {
        const data = read(kind);
        const known = new Set(items.map(([id]) => String(id)));
        // une entrée vers un élément supprimé : ignorée, et retirée quand la liste est connue
        if (items.length && Object.keys(data.of).some(k => !known.has(k))) {
            Object.keys(data.of).forEach(k => { if (!known.has(k)) delete data.of[k]; });
            writeKind(kind, data);
        }
        // le dossier (et ses parents) de l'élément affiché s'ouvre tout seul, une fois par élément
        const active = items.find(([id]) => isActive(id));
        const activeKey = active ? String(active[0]) : '';
        if (activeKey && lastActive[kind] !== activeKey && data.of[activeKey]) {
            const path = pathOf(data, data.of[activeKey]);
            if (path.some(id => data.closed.includes(id))) { data.closed = data.closed.filter(id => !path.includes(id)); writeKind(kind, data); }
        }
        lastActive[kind] = activeKey;
        const rows = items.map(([id, lab], index) => ({key: String(id), html: itemHtml(id, lab, index)}));
        const inFolder = id => rows.filter(r => data.of[r.key] === id);
        const count = id => inFolder(id).length + childrenOf(data, id).reduce((n, c) => n + count(c.id), 0);
        const closed = new Set(data.closed);
        const item = r => r.html.replace(/^<button /, `<button data-sf-item="${esc(r.key)}" `);
        const word = WORD[kind];
        const folder = (f, depth) => {
            const open = !closed.has(f.id), n = count(f.id), kids = childrenOf(data, f.id), mine = inFolder(f.id);
            const inner = kids.map(k => folder(k, depth + 1)).join('') + mine.map(item).join('');
            return `<div class="sf" data-sf-folder="${esc(f.id)}" data-sf-depth="${depth}">
                <div class="sf-head" role="button" tabindex="0" aria-expanded="${open}" data-sf-toggle="${esc(f.id)}" title="${open ? 'Fermer' : 'Ouvrir'} le dossier">
                    <span class="sf-car" aria-hidden="true">${open ? '▾' : '▸'}</span><span class="sf-ic" aria-hidden="true">📁</span><span class="sf-name">${esc(f.name)}</span>
                    <small class="sf-count" title="${esc(A()?.plural ? A().plural(n, word[0], word[1]) : n)}">${n}</small>
                    <span class="sf-tools"><button type="button" class="sf-tool" data-sf-rename="${esc(f.id)}" title="Renommer le dossier" aria-label="Renommer le dossier">✎</button><button type="button" class="sf-tool" data-sf-del="${esc(f.id)}" title="Supprimer le dossier (son contenu remonte d’un niveau)" aria-label="Supprimer le dossier">🗑</button></span>
                </div>
                <div class="sf-body"${open ? '' : ' hidden'}>${inner || `<p class="sf-empty">Dossier vide${kind === 'diagram' ? ' : glisse un diagramme ici' : kind === 'document' ? ' : glisse un document ici' : ' : range un graphique ici avec « 📁 Ranger »'}.</p>`}</div>
            </div>`;
        };
        const loose = rows.filter(r => !data.of[r.key]).map(item).join('');
        return `<div class="sf-label"><div class="section-label">${esc(label)}</div><button type="button" class="sf-add" data-sf-add="${kind}" title="Nouveau dossier pour ranger tes ${word[1]}">＋ 📁 Dossier</button></div>
            <div class="side-menu sf-root${DRAG.has(kind) ? ' sf-can-drag' : ''}" data-sf-kind="${kind}">${childrenOf(data, null).map(f => folder(f, 1)).join('')}<div class="sf-loose" data-sf-loose>${loose}</div>${footer}</div>`;
    }

    async function createFolder(kind, parent = null) {
        if (kiosk()) return null;
        const data = read(kind);
        if (data.folders.length >= MAX_FOLDERS) { toast(`${MAX_FOLDERS} dossiers au plus.`, 'error'); return null; }
        if (parent && depthOf(data, parent) >= MAX_DEPTH) { toast('Trois niveaux de dossiers au plus : choisis un dossier moins profond.', 'error'); return null; }
        const name = cleanName(await A().askText({title: '＋ Nouveau dossier', message: `Le nom du dossier, pour ranger tes ${WORD[kind][1]}.`, placeholder: 'Ex. Assemblées', okLabel: 'Créer le dossier'}));
        if (!name) return null;
        return {id: newId(), name, parent: parent || null};
    }
    async function addFolder(kind) {
        const f = await createFolder(kind); if (!f) return;
        commit(kind, `Dossier « ${f.name} » créé`, d => { d.folders.push(f); });
    }
    async function renameFolder(kind, id) {
        const f = folderById(read(kind), id); if (!f || kiosk()) return;
        const name = cleanName(await A().askText({title: '✎ Renommer le dossier', value: f.name, okLabel: 'Renommer'}));
        if (!name || name === f.name) return;
        commit(kind, `Dossier renommé « ${name} »`, d => { const x = folderById(d, id); if (x) x.name = name; });
    }
    /** supprimer : ses éléments et ses sous-dossiers remontent d'un niveau, rien n'est supprimé */
    function deleteFolder(kind, id) {
        const f = folderById(read(kind), id); if (!f || kiosk()) return;
        commit(kind, `Dossier « ${f.name} » supprimé : son contenu remonte d’un niveau`, d => {
            const at = d.folders.findIndex(x => x.id === id); if (at < 0) return;
            const parent = d.folders[at].parent || null;
            const kids = d.folders.filter(x => x.parent === id);
            kids.forEach(k => { k.parent = parent; });
            d.folders = d.folders.filter(x => x.id !== id && !kids.includes(x));
            d.folders.splice(Math.min(at, d.folders.length), 0, ...kids); // les sous-dossiers prennent sa place
            Object.keys(d.of).forEach(k => { if (d.of[k] === id) { if (parent) d.of[k] = parent; else delete d.of[k]; } });
            d.closed = d.closed.filter(x => x !== id);
        });
    }
    function toggleFolder(kind, id) {
        const d = read(kind); if (!folderById(d, id)) return;
        d.closed = d.closed.includes(id) ? d.closed.filter(x => x !== id) : [...d.closed, id];
        writeKind(kind, d);
        A()?.renderSidebar?.();
        requestAnimationFrame(() => document.querySelector(`#sidebar-content [data-sf-kind="${kind}"] [data-sf-toggle="${CSS.escape(id)}"]`)?.focus());
    }
    /** un élément supprimé : son rangement part aussi */
    function forget(kind, id) { const d = read(kind), k = String(id); if (!(k in d.of)) return; delete d.of[k]; writeKind(kind, d); }

    /* ─── 📁 Ranger « Nom » (depuis la page) ─── */
    function openRange(kind, id, name) {
        if (kiosk()) { toast('Mode consultation : on ne peut rien ranger.', 'error'); return; }
        const key = String(id); if (!ITEM_ID[kind]?.test(key)) return;
        const work = clone(read(kind));
        let chosen = work.of[key] || '';
        const dialog = document.createElement('dialog');
        dialog.className = 'modal small-modal sf-range-dialog';
        const tree = () => { const out = []; const walk = (parent, depth) => childrenOf(work, parent).forEach(f => { out.push([f, depth]); walk(f.id, depth + 1); }); walk(null, 0); return out; };
        const opt = (value, label, depth) => `<label class="sf-opt${chosen === value ? ' is-on' : ''}" style="--sf-depth:${depth}"><input type="radio" name="sf-folder" value="${esc(value)}" ${chosen === value ? 'checked' : ''}><span>${label}</span></label>`;
        const draw = () => {
            dialog.querySelector('[data-sf-opts]').innerHTML = opt('', 'Sans dossier', 0) + tree().map(([f, depth]) => opt(f.id, `📁 ${esc(f.name)}`, depth)).join('');
        };
        dialog.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">MES ${esc(WORD[kind][1].toUpperCase())}</span><h2>📁 Ranger « ${esc(name || '')} »</h2></div><button class="icon-button" type="button" data-sf-cancel aria-label="Fermer">×</button></div>
            <div class="sf-range-body"><div class="sf-opts" data-sf-opts role="radiogroup" aria-label="Dossier"></div><button type="button" class="button small secondary sf-newbtn" data-sf-new>＋ Nouveau dossier…</button></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-sf-cancel>Annuler</button><button type="submit" class="button" data-sf-ok>Ranger</button></div></form>`;
        document.body.appendChild(dialog);
        draw();
        dialog.addEventListener('change', e => { if (e.target.name === 'sf-folder') { chosen = e.target.value; dialog.querySelectorAll('.sf-opt').forEach(l => l.classList.toggle('is-on', l.querySelector('input').checked)); } });
        dialog.querySelector('[data-sf-new]').addEventListener('click', async () => {
            if (work.folders.length >= MAX_FOLDERS) return toast(`${MAX_FOLDERS} dossiers au plus.`, 'error');
            if (chosen && depthOf(work, chosen) >= MAX_DEPTH) return toast('Trois niveaux de dossiers au plus : le nouveau dossier ne peut pas aller dans celui-ci.', 'error');
            const name = cleanName(await A().askText({title: '＋ Nouveau dossier', message: chosen ? `Il sera rangé dans « ${folderById(work, chosen)?.name || ''} ».` : 'Il sera au premier niveau.', placeholder: 'Ex. Assemblées', okLabel: 'Créer le dossier'}));
            if (!name) return;
            const f = {id: newId(), name, parent: chosen || null};
            work.folders.push(f); chosen = f.id; draw();
            dialog.querySelector(`input[value="${f.id}"]`)?.focus();
        });
        dialog.querySelectorAll('[data-sf-cancel]').forEach(b => b.addEventListener('click', () => dialog.close()));
        dialog.querySelector('form').addEventListener('submit', e => {
            e.preventDefault();
            const target = chosen && folderById(work, chosen) ? chosen : '';
            dialog.close();
            const fname = target ? folderById(work, target).name : '';
            const newOnes = work.folders.filter(f => !folderById(read(kind), f.id));
            commit(kind, target ? `« ${name} » rangé dans « ${fname} »` : `« ${name} » sorti des dossiers`, d => {
                newOnes.forEach(f => { if (!folderById(d, f.id)) d.folders.push(f); });
                if (target) d.of[key] = target; else delete d.of[key];
                if (target) d.closed = d.closed.filter(x => !pathOf(d, target).includes(x)); // on voit où il est rangé
            });
        });
        dialog.addEventListener('close', () => dialog.remove());
        dialog.showModal();
        dialog.querySelector('input[name="sf-folder"]:checked')?.focus();
    }
    const rangeButtonHtml = (kind, id, name) => `<button type="button" class="button secondary sf-range-btn" data-sf-range="${esc(kind)}" data-sf-id="${esc(id)}" data-sf-name="${esc(name || '')}" title="Le ranger dans un dossier de la colonne de gauche">📁 Ranger</button>`;
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-sf-range]'); if (!b) return;
        e.preventDefault();
        openRange(b.dataset.sfRange, b.dataset.sfId, b.dataset.sfName);
    });

    /* ─── clics et clavier dans la colonne ─── */
    function bind(content, {signal} = {}) {
        if (!content) return;
        const kindOf = el => el.closest('[data-sf-kind]')?.dataset.sfKind || el.closest('[data-sf-add]')?.dataset.sfAdd;
        content.addEventListener('click', e => {
            if (dragJustEnded) { e.preventDefault(); e.stopImmediatePropagation(); return; }
            const t = e.target;
            const add = t.closest('[data-sf-add]'); if (add) { e.stopImmediatePropagation(); if (kiosk()) return; addFolder(add.dataset.sfAdd); return; }
            const ren = t.closest('[data-sf-rename]'); if (ren) { e.stopImmediatePropagation(); renameFolder(kindOf(ren), ren.dataset.sfRename); return; }
            const del = t.closest('[data-sf-del]'); if (del) { e.stopImmediatePropagation(); deleteFolder(kindOf(del), del.dataset.sfDel); return; }
            const head = t.closest('[data-sf-toggle]'); if (head) { e.stopImmediatePropagation(); toggleFolder(kindOf(head), head.dataset.sfToggle); }
        }, {signal, capture: true});
        content.addEventListener('keydown', e => {
            const head = e.target.closest?.('[data-sf-toggle]');
            if (!head || e.target !== head || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault(); toggleFolder(kindOf(head), head.dataset.sfToggle);
        }, {signal});
        content.addEventListener('pointerdown', e => startDrag(e, content), {signal});
    }

    /* ─── ranger en glissant (seulement « Mes diagrammes ») ─── */
    let dragJustEnded = false;
    function startDrag(event, content) {
        if (event.button !== 0 || event.pointerType === 'touch' || kiosk()) return;
        const root0 = event.target.closest('.sf-root.sf-can-drag'); if (!root0) return;
        // la colonne peut être redessinée pendant le glisser (liste rechargée) : on suit la liste du moment
        const kindSel = `.sf-root.sf-can-drag[data-sf-kind="${root0.dataset.sfKind}"]`;
        const cur = () => content.querySelector(kindSel) || root0;
        if (event.target.closest('.sf-tool, [data-sf-add], input, select, textarea')) return;
        const itemEl = event.target.closest('[data-sf-item]'), headEl = itemEl ? null : event.target.closest('.sf-head');
        if (!itemEl && !headEl) return;
        const kind = root0.dataset.sfKind;
        const dragged = itemEl ? {type: 'item', id: itemEl.dataset.sfItem, el: itemEl} : {type: 'folder', id: headEl.dataset.sfToggle, el: headEl};
        const x0 = event.clientX, y0 = event.clientY;
        let ghost = null, marker = null, drop = null;
        const clear = () => { const root = cur(); root.querySelectorAll('.is-sf-drop').forEach(el => el.classList.remove('is-sf-drop')); root.classList.remove('is-sf-drop-out'); if (marker) marker.hidden = true; };
        const begin = () => {
            const r = dragged.el.getBoundingClientRect();
            ghost = dragged.el.cloneNode(true); ghost.classList.add('sf-ghost'); ghost.removeAttribute('id');
            Object.assign(ghost.style, {width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px`});
            ghost.dataset.dx = String(x0 - r.left); ghost.dataset.dy = String(y0 - r.top);
            document.body.appendChild(ghost);
            marker = document.createElement('div'); marker.className = 'sf-marker'; marker.hidden = true; document.body.appendChild(marker);
            dragged.el.classList.add('is-sf-dragging'); document.body.classList.add('is-sf-dragging-any');
        };
        const where = (x, y) => {
            const root = cur();
            // un message en bas à gauche peut passer par-dessus la colonne : on regarde ce qu'il y a dessous
            let el = null;
            for (const e of document.elementsFromPoint(x, y)) { if (root.contains(e)) { el = e; break; } if (!e.closest('.toast-region, .sf-ghost, .sf-marker')) break; }
            if (!el) return null; // hors de la liste : rien ne change
            const head = el.closest('.sf-head'), folderEl = el.closest('[data-sf-folder]');
            if (dragged.type === 'item') {
                if (folderEl) return {mode: 'into', folder: folderEl.dataset.sfFolder, el: folderEl.querySelector(':scope > .sf-head')};
                return {mode: 'out'};
            }
            if (head) {
                const fid = head.dataset.sfToggle, r = head.getBoundingClientRect(), rel = (y - r.top) / r.height;
                if (fid === dragged.id) return null;
                if (rel < .25) return {mode: 'before', folder: fid, el: head};
                if (rel > .75) return {mode: 'after', folder: fid, el: head};
                return {mode: 'into', folder: fid, el: head};
            }
            if (folderEl && folderEl.dataset.sfFolder !== dragged.id) return {mode: 'into', folder: folderEl.dataset.sfFolder, el: folderEl.querySelector(':scope > .sf-head')};
            if (folderEl) return null;
            return {mode: 'out'};
        };
        const show = d => {
            clear(); drop = d; if (!d) return;
            if (d.mode === 'out') { cur().classList.add('is-sf-drop-out'); return; }
            if (d.mode === 'into') { d.el?.classList.add('is-sf-drop'); return; }
            const r = d.el.getBoundingClientRect();
            Object.assign(marker.style, {left: `${r.left}px`, width: `${r.width}px`, top: `${(d.mode === 'before' ? r.top - 5 : r.bottom + 3)}px`}); marker.hidden = false;
        };
        const onMove = e => {
            if (!ghost) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; begin(); }
            e.preventDefault();
            ghost.style.left = `${e.clientX - Number(ghost.dataset.dx)}px`; ghost.style.top = `${e.clientY - Number(ghost.dataset.dy)}px`;
            show(where(e.clientX, e.clientY));
            const sc = content.closest('.sidebar-content') || content; const r = sc.getBoundingClientRect();
            // près du bord, la colonne défile (pas tout de suite : on a pu prendre un élément tout en bas)
            if (Math.abs(e.clientY - y0) > 40) { if (e.clientY < r.top + 30) sc.scrollTop -= 12; else if (e.clientY > r.bottom - 30) sc.scrollTop += 12; }
        };
        const end = cancel => {
            document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointercancel', onCancel);
            if (!ghost) return;
            dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 0);
            ghost.remove(); marker?.remove(); dragged.el.classList.remove('is-sf-dragging'); document.body.classList.remove('is-sf-dragging-any');
            const d = drop; clear();
            if (!cancel && d) applyDrop(kind, dragged, d);
        };
        const onUp = () => end(false);
        const onCancel = () => end(true);
        const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(true); } };
        document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onCancel); document.addEventListener('keydown', onKey, true);
    }
    function applyDrop(kind, dragged, d) {
        const data = read(kind);
        const items = kind === 'diagram' ? (window.LCNDA_EXT?.diagramItems?.() || []) : kind === 'document' ? (window.LCNDA_EXT?.documentItems?.() || []) : (window.LCNDA_EXT?.customStatItems?.() || []);
        const labelOf = id => String(items.find(([k]) => String(k) === String(id))?.[1] || '').replace(/^\S+\s/, '') || WORD[kind][0];
        if (dragged.type === 'item') {
            const cur = data.of[dragged.id] || '';
            const target = d.mode === 'into' ? d.folder : '';
            if (cur === target || !ITEM_ID[kind].test(dragged.id)) return;
            const fname = target ? folderById(data, target)?.name : '';
            commit(kind, target ? `« ${labelOf(dragged.id)} » rangé dans « ${fname} »` : `« ${labelOf(dragged.id)} » sorti des dossiers`, x => { if (target) x.of[dragged.id] = target; else delete x.of[dragged.id]; });
            return;
        }
        const f = folderById(data, dragged.id); if (!f) return;
        if (d.mode === 'into' || d.mode === 'out') {
            const parent = d.mode === 'into' ? d.folder : null;
            if ((f.parent || null) === parent) return;
            const err = moveFolderError(data, f.id, parent); if (err) { toast(err, 'error'); return; }
            const pname = parent ? folderById(data, parent)?.name : '';
            commit(kind, parent ? `Dossier « ${f.name} » rangé dans « ${pname} »` : `Dossier « ${f.name} » remis au premier niveau`, x => { const y = folderById(x, f.id); if (y) y.parent = parent; if (parent) x.closed = x.closed.filter(c => !pathOf(x, parent).includes(c)); });
            return;
        }
        // avant / après un autre dossier : même niveau que lui, et l'ordre change
        const ref = folderById(data, d.folder); if (!ref) return;
        const parent = ref.parent || null;
        const err = moveFolderError(data, f.id, parent); if (err) { toast(err, 'error'); return; }
        commit(kind, `Dossier « ${f.name} » déplacé`, x => {
            const at = x.folders.findIndex(y => y.id === f.id); if (at < 0) return;
            const [moved] = x.folders.splice(at, 1); moved.parent = parent;
            let to = x.folders.findIndex(y => y.id === ref.id); if (to < 0) to = x.folders.length - 1;
            x.folders.splice(d.mode === 'before' ? to : to + 1, 0, moved);
        });
    }

    window.LCNDA_SIDE_FOLDERS = {KEY, read, readAll, write: writeKind, clean: cleanKind, sectionHtml, bind, openRange, rangeButtonHtml, forget, moveFolderError, MAX_DEPTH, MAX_FOLDERS};
})();
