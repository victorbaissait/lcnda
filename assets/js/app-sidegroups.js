/* LCNDA — 🗂 Colonne de gauche rangée en groupes (Maintenance, Listes) : le même rangement partout.
 * Activable ou non : rangé en groupes (familles repliables) ou en une seule liste ; chaque façon garde ses propres réglages.
 * « Mes listes » (les listes créées) restent toujours en bas, à part : on les range seulement entre elles.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const esc = s => A().escapeHtml(String(s ?? ''));
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const fold = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const gid = () => 'g_' + Math.random().toString(36).slice(2, 9);
    const MINE = 'g__mine';

    /**
     * cfg : key (réglages), defaults [[id, icône, nom, [clés]]], allKeys(), label(k), defaultEnabled,
     *       flatOrder() / setFlatOrder(keys) / flatDefaults(), canHide + hidden() / setHidden(keys),
     *       mine() → [[valeur, icône, nom]] et mineKey (ordre de « Mes listes »), current(), eyebrow, what (« pages », « listes »), searchPh
     *       keywords {valeur: 'mots'} (facultatif) : la case de recherche trouve aussi une page par ce qu'elle contient
     */
    function make(cfg) {
        const defaults = () => cfg.defaults.map(([id, icon, label, items]) => ({id, icon, label, items: [...items]}));
        function prefs() {
            const p = readJ(cfg.key, {}) || {}, keys = cfg.allKeys(), seen = new Set();
            const groups = (Array.isArray(p.groups) && p.groups.length ? p.groups : defaults()).filter(g => g && typeof g === 'object').map(g => ({id: /^g_\w{1,24}$/.test(g.id || '') && g.id !== MINE ? g.id : gid(), icon: String(g.icon || '📁').slice(0, 4), label: String(g.label || 'Groupe').slice(0, 60),
                items: (Array.isArray(g.items) ? g.items : []).filter(k => keys.includes(k) && !seen.has(k) && seen.add(k))}));
            // une page ou une liste nouvelle (ou sortie d'un groupe effacé) : dans son groupe prévu, sinon dans le dernier
            // un groupe de départ nouveau (ex. « 🎨 Créations et carrières ») : il apparaît à sa place, même avec un rangement déjà enregistré
            keys.filter(k => !seen.has(k)).forEach(k => { const home = cfg.defaults.find(g => g[3].includes(k)); if (!home || groups.some(x => x.id === home[0])) return;
                const at = cfg.defaults.indexOf(home), prev = cfg.defaults.slice(0, at).reverse().map(d => groups.findIndex(x => x.id === d[0])).find(i => i >= 0);
                groups.splice(prev == null ? groups.length : prev + 1, 0, {id: home[0], icon: home[1], label: home[2], items: []}); });
            keys.filter(k => !seen.has(k)).forEach(k => { const home = cfg.defaults.find(g => g[3].includes(k)), g = groups.find(x => x.id === home?.[0]) || groups.at(-1);
                if (!g) { groups.push({id: 'g_misc', icon: '📁', label: 'Autres', items: [k]}); return; }
                const before = home ? home[3].slice(0, home[3].indexOf(k)).reverse().find(x => g.items.includes(x)) : null; // juste après sa voisine de départ
                if (before) g.items.splice(g.items.indexOf(before) + 1, 0, k); else g.items.push(k); });
            return {enabled: typeof p.enabled === 'boolean' ? p.enabled : cfg.defaultEnabled !== false, groups, open: p.open === 'closed' ? 'closed' : 'open', closedMode: p.closedMode === 'remember' ? 'remember' : 'always', openState: p.openState && typeof p.openState === 'object' ? p.openState : {}};
        }
        const save = p => writeJ(cfg.key, {enabled: p.enabled, groups: p.groups, open: p.open, closedMode: p.closedMode, openState: p.openState});
        const hiddenSet = () => new Set(cfg.canHide ? (cfg.hidden?.() || []) : []);
        /** « Mes listes », dans l'ordre choisi (les nouvelles à la fin) */
        function mineOrdered() {
            const all = cfg.mine?.() || [], order = cfg.mineKey ? readJ(cfg.mineKey, []) : [];
            const o = Array.isArray(order) ? order : [];
            return [...all].sort((a, b) => { const i = o.indexOf(a[0]), j = o.indexOf(b[0]); return (i < 0 ? 1e6 : i) - (j < 0 ? 1e6 : j); });
        }
        /** la colonne de gauche ; les clics sur [data-side-value] restent à la page qui l'appelle */
        function render(content, signal) {
            const p = prefs(), hid = hiddenSet(), cur = cfg.current(), sb = A().sideButton, mine = mineOrdered(); let n = 0;
            const btn = k => sb(esc(k), String(++n).padStart(2, '0'), esc(cfg.label(k)), cur);
            const mineBtns = () => mine.map(([v, i, l]) => sb(esc(v), esc(i), esc(l), cur)).join('');
            const isOpen = (id, items) => items.includes(cur) || p.open === 'open' || (p.closedMode === 'remember' && p.openState[id]);
            const group = (id, icon, label, inner, count, items) => `<details class="mt-group" data-mt-group="${esc(id)}" ${isOpen(id, items) ? 'open' : ''}><summary><span class="mt-gicon">${esc(icon)}</span><span class="mt-glabel">${esc(label)}</span><small>${count}</small></summary><div class="mt-gitems">${inner}</div></details>`;
            const search = `<input type="search" class="mt-search" data-mt-search placeholder="${esc(cfg.searchPh || 'Chercher…')}" aria-label="${esc(cfg.searchPh || 'Chercher')}">`;
            if (p.enabled) {
                content.innerHTML = `<div class="side-menu mt-groups">${search}${p.groups.map(g => { const vis = g.items.filter(k => !hid.has(k)); return vis.length ? group(g.id, g.icon, g.label, vis.map(btn).join(''), vis.length, vis) : ''; }).join('')}${mine.length ? group(MINE, '⭐', 'Mes listes', mineBtns(), mine.length, mine.map(m => m[0])) : ''}</div>`;
            } else {
                const flat = cfg.flatOrder().filter(k => !hid.has(k));
                content.innerHTML = `<div class="side-menu mt-groups mt-flat">${search}<div data-mt-flat>${flat.map(btn).join('')}</div>${mine.length ? `<span class="side-menu-sep" data-mt-minesep>Mes listes</span><div data-mt-flat>${mineBtns()}</div>` : ''}</div>`;
            }
            content.querySelectorAll('[data-mt-group]').forEach(d => d.addEventListener('toggle', () => { const q = prefs(); if (q.open === 'closed' && q.closedMode === 'remember') { q.openState[d.dataset.mtGroup] = d.open; save(q); } }, {signal}));
            const q = content.querySelector('[data-mt-search]');
            q?.addEventListener('input', () => { const v = fold(q.value.trim());
                content.querySelectorAll('[data-mt-group], [data-mt-flat]').forEach(d => { let any = false; d.querySelectorAll('[data-side-value]').forEach(b => { const hit = !v || fold(`${b.textContent} ${cfg.keywords?.[b.dataset.sideValue] || ''}`).includes(v); b.hidden = !hit; any = any || hit; }); d.hidden = !any; if (v && any && d.tagName === 'DETAILS') d.open = true; });
                const sep = content.querySelector('[data-mt-minesep]'); if (sep) sep.hidden = !!sep.nextElementSibling?.hidden; }, {signal});
        }
        /** « Réordonner » : activer ou non les groupes, puis ranger (groupes ou liste simple) ; « Mes listes » à part, en bas */
        function openDialog() {
            let p = prefs(); const hid = hiddenSet(); let flat = cfg.flatOrder(), mine = mineOrdered().map(m => ({v: m[0], label: m[2], icon: m[1]}));
            const what = cfg.what || 'pages', dialog = document.createElement('dialog'); dialog.className = 'modal dashboard-reorder-dialog mt-reorder';
            const vis = k => cfg.canHide ? `<label class="mt-vis" title="Afficher dans la colonne"><input type="checkbox" data-vis="${esc(k)}" ${hid.has(k) ? '' : 'checked'}></label>` : '';
            const arrows = (i, len) => `<button type="button" class="button small secondary" data-move="-1" aria-label="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" class="button small secondary" data-move="1" aria-label="Descendre" ${i < len - 1 ? '' : 'disabled'}>↓</button>`;
            const row = (k, num, i, len, extra = '') => `<li class="dashboard-reorder-row${hid.has(k) ? ' is-hidden-row' : ''}" data-ii="${i}">${vis(k)}<span class="order-number">${String(num).padStart(2, '0')}</span><b style="flex:1">${esc(cfg.label(k))}</b><span class="order-actions">${extra}${arrows(i, len)}</span></li>`;
            const draw = () => { let n = 0;
                dialog.querySelector('[data-mt-tools]').innerHTML = p.enabled ? `<button type="button" class="button small secondary" data-gadd>＋ Nouveau groupe</button><button type="button" class="button small secondary" data-reset-groups title="Les groupes de départ ; l’ordre à l’intérieur est gardé">↺ Remettre seulement les groupes</button><button type="button" class="button small secondary" data-reset-all>↺ Remettre comme au départ</button>` : `<button type="button" class="button small secondary" data-reset-all>↺ Remettre comme au départ</button>`;
                dialog.querySelector('[data-mt-body]').innerHTML = `
                    <label class="checkbox-line mt-enable"><input type="checkbox" data-mt-enabled ${p.enabled ? 'checked' : ''}> <span><b>Ranger en groupes</b> (familles qu’on ouvre et referme)<small class="muted">Décoché : une seule liste. Chaque façon garde ses propres réglages : tu les retrouves en recochant ou en décochant.</small></span></label>
                    ${p.enabled ? `<fieldset class="mt-openmode"><legend>Les groupes, dans la colonne</legend><label class="checkbox-line"><input type="radio" name="mt-open" value="open" ${p.open === 'open' ? 'checked' : ''}> Tous ouverts</label><label class="checkbox-line"><input type="radio" name="mt-open" value="closed" ${p.open === 'closed' ? 'checked' : ''}> Tous fermés (sauf celui de la page affichée)</label>
                        <div class="mt-closedmode" ${p.open === 'closed' ? '' : 'hidden'}><label class="checkbox-line"><input type="radio" name="mt-closed" value="always" ${p.closedMode === 'always' ? 'checked' : ''}> Toujours tout refermer</label><label class="checkbox-line"><input type="radio" name="mt-closed" value="remember" ${p.closedMode === 'remember' ? 'checked' : ''}> Garder ouvert ce que j’ai ouvert</label></div></fieldset>
                    ${p.groups.map((g, gi) => `<section class="mt-rgroup" data-gi="${gi}"><div class="mt-rghead"><input class="mt-ricon" data-gicon value="${esc(g.icon)}" maxlength="4" aria-label="Icône du groupe"><input class="mt-rlabel" data-glabel value="${esc(g.label)}" maxlength="60" aria-label="Nom du groupe">
                        <button type="button" class="button small secondary" data-gmove="-1" title="Monter le groupe" ${gi ? '' : 'disabled'}>↑</button><button type="button" class="button small secondary" data-gmove="1" title="Descendre le groupe" ${gi < p.groups.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="button small secondary is-danger" data-gdel title="Effacer le groupe (son contenu va dans le groupe d’à côté)">🗑</button></div>
                        <ol class="dashboard-reorder-list">${g.items.map((k, ii) => row(k, ++n, ii, g.items.length, `<select data-imove aria-label="Changer de groupe">${p.groups.map((x, xi) => `<option value="${xi}" ${xi === gi ? 'selected' : ''}>${esc(x.icon)} ${esc(x.label)}</option>`).join('')}</select>`)).join('') || '<li class="muted mt-empty">Groupe vide</li>'}</ol></section>`).join('')}`
                    : `<section class="mt-rgroup" data-flat><ol class="dashboard-reorder-list">${flat.map((k, i) => row(k, i + 1, i, flat.length)).join('')}</ol></section>`}
                    ${mine.length ? `<section class="mt-rgroup mt-rmine" data-mine><div class="mt-rghead"><span class="mt-ricon">⭐</span><b class="mt-rlabel">Mes listes</b><small class="muted">toujours en bas, à part : range-les entre elles</small></div><ol class="dashboard-reorder-list">${mine.map((m, i) => `<li class="dashboard-reorder-row" data-ii="${i}"><span class="order-number">${esc(m.icon)}</span><b style="flex:1">${esc(m.label)}</b><span class="order-actions">${arrows(i, mine.length)}</span></li>`).join('')}</ol></section>` : ''}`; };
            dialog.innerHTML = `<div class="modal-head"><div><span class="eyebrow">${esc(cfg.eyebrow)}</span><h2>Réordonner les ${esc(what)}</h2><p>Range avec ↑ ↓${cfg.canHide ? ', coche ce qui s’affiche' : ''}, en groupes ou en une seule liste. Puis Enregistrer.</p></div><button class="icon-button" type="button" data-close aria-label="Fermer">×</button></div>
                <div class="dash-reorder-tools" data-mt-tools></div><div class="mt-rbody" data-mt-body></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close>Annuler</button><button class="button" type="button" data-save>Enregistrer</button></div>`;
            document.body.append(dialog); draw();
            const sync = () => dialog.querySelectorAll('[data-gi]').forEach(s => { const g = p.groups[Number(s.dataset.gi)]; g.icon = s.querySelector('[data-gicon]').value.trim() || '📁'; g.label = s.querySelector('[data-glabel]').value.trim() || 'Groupe'; });
            const close = () => { dialog.close(); dialog.remove(); };
            dialog.addEventListener('change', e => { const t = e.target;
                if (t.matches('[data-mt-enabled]')) { sync(); p.enabled = t.checked; draw(); return; }
                if (t.name === 'mt-open') { p.open = t.value; dialog.querySelector('.mt-closedmode').hidden = p.open !== 'closed'; return; }
                if (t.name === 'mt-closed') { p.closedMode = t.value; return; }
                if (t.dataset.vis) { if (t.checked) hid.delete(t.dataset.vis); else hid.add(t.dataset.vis); t.closest('li')?.classList.toggle('is-hidden-row', !t.checked); return; }
                if (t.matches('[data-imove]')) { sync(); const gi = Number(t.closest('[data-gi]').dataset.gi), ii = Number(t.closest('[data-ii]').dataset.ii), to = Number(t.value); const [k] = p.groups[gi].items.splice(ii, 1); p.groups[to].items.push(k); draw(); } });
            dialog.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const sec = b.closest('[data-gi]'), gi = sec ? Number(sec.dataset.gi) : -1;
                if (b.hasAttribute('data-close')) { close(); return; }
                sync();
                if (b.dataset.gmove) { const j = gi + Number(b.dataset.gmove); if (j < 0 || j >= p.groups.length) return; [p.groups[gi], p.groups[j]] = [p.groups[j], p.groups[gi]]; draw(); return; }
                if (b.hasAttribute('data-gdel')) { if (p.groups.length < 2) return A().toast('Il faut au moins un groupe.', 'error'); const [g] = p.groups.splice(gi, 1); p.groups[Math.max(0, gi - 1)].items.push(...g.items); draw(); return; }
                if (b.dataset.move) { const ii = Number(b.closest('[data-ii]').dataset.ii), j = ii + Number(b.dataset.move), it = b.closest('[data-mine]') ? mine : b.closest('[data-flat]') ? flat : p.groups[gi]?.items; if (!it || j < 0 || j >= it.length) return; [it[ii], it[j]] = [it[j], it[ii]]; draw(); return; }
                if (b.hasAttribute('data-gadd')) { p.groups.push({id: gid(), icon: '📁', label: 'Nouveau groupe', items: []}); draw(); dialog.querySelector('[data-gi]:last-of-type [data-glabel]')?.select(); return; }
                if (b.hasAttribute('data-reset-groups')) { const order = p.groups.flatMap(g => g.items); p.groups = defaults().map(g => ({...g, items: g.items.filter(k => order.includes(k)).sort((a, c) => order.indexOf(a) - order.indexOf(c))})); const keep = new Set(p.groups.flatMap(g => g.items)); order.filter(k => !keep.has(k)).forEach(k => p.groups.at(-1).items.push(k)); draw(); return; } // l'ordre à l'intérieur est gardé
                if (b.hasAttribute('data-reset-all')) { if (p.enabled) p = {...p, groups: defaults(), open: 'open', closedMode: 'always', openState: {}}; else flat = cfg.flatDefaults(); hid.clear(); mine = (cfg.mine?.() || []).map(m => ({v: m[0], label: m[2], icon: m[1]})); draw(); return; }
                if (b.hasAttribute('data-save')) {
                    const all = cfg.allKeys(); if (cfg.canHide && all.every(k => hid.has(k))) return A().toast(`Garde au moins une ${what === 'listes' ? 'liste' : 'page'} visible.`, 'error');
                    // les deux façons gardent leurs réglages : on enregistre l'une et l'autre
                    save(p); cfg.setFlatOrder(flat); if (cfg.canHide) cfg.setHidden([...hid]); if (cfg.mineKey) writeJ(cfg.mineKey, mine.map(m => m.v));
                    close(); A().renderSidebar(); refreshPanels(); A().toast(p.enabled ? 'Rangement en groupes enregistré.' : 'Rangement en une liste enregistré.'); } });
            dialog.addEventListener('cancel', e => { if (e.target !== dialog) return; e.preventDefault(); close(); });
            dialog.showModal();
        }
        /** Maintenance → Apparence : le même rangement, en résumé (case « Ranger en groupes » + « Réordonner… ») */
        function panel(title) {
            const p = prefs(), hid = hiddenSet(), mine = mineOrdered(), word = cfg.what === 'listes' ? 'liste' : 'page';
            const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
            const body = p.enabled ? `<ol class="sg-sum">${p.groups.map(g => `<li><span>${esc(g.icon)}</span> ${esc(g.label)} <small class="muted">${g.items.filter(k => !hid.has(k)).length}</small></li>`).join('')}${mine.length ? `<li><span>⭐</span> Mes listes <small class="muted">${mine.length}, toujours en bas</small></li>` : ''}</ol>`
                : `<p class="muted sg-sum">Une seule liste : ${plural(cfg.allKeys().length - hid.size, word)}${hid.size ? `, ${hid.size} cachée${hid.size > 1 ? 's' : ''}` : ''}${mine.length ? ` ; puis Mes listes (${mine.length}), toujours en bas` : ''}.</p>`;
            return `<section class="maintenance-panel order-editor compact sg-panel" data-sg-panel="${esc(cfg.name)}"><h3>${esc(title)}</h3><label class="ui-toggle"><input type="checkbox" data-sg-enable ${p.enabled ? 'checked' : ''}><i></i>Ranger en groupes</label><small class="muted">Chaque façon garde ses réglages.</small>${body}<div class="page-actions action-zone"><button class="button small" type="button" data-sg-open>Réordonner…</button></div></section>`;
        }
        function setEnabled(on) { const p = prefs(); p.enabled = !!on; save(p); }
        const api = {prefs, render, openDialog, panel, setEnabled, title: cfg.panelTitle || 'Ordre'};
        if (cfg.name) inst[cfg.name] = api;
        return api;
    }
    const inst = {};
    /** les résumés d'Apparence se mettent à jour d'eux-mêmes */
    const refreshPanels = () => document.querySelectorAll('[data-sg-panel]').forEach(el => { const i = inst[el.dataset.sgPanel]; if (i) el.outerHTML = i.panel(el.querySelector('h3')?.textContent || i.title); });
    document.addEventListener('change', e => { const t = e.target; if (!t.matches?.('[data-sg-enable]')) return; const i = inst[t.closest('[data-sg-panel]')?.dataset.sgPanel]; if (!i) return; i.setEnabled(t.checked); A().renderSidebar(); refreshPanels(); A().toast(t.checked ? 'Rangé en groupes.' : 'Rangé en une seule liste.'); });
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-sg-open]'); if (!b) return; inst[b.closest('[data-sg-panel]')?.dataset.sgPanel]?.openDialog(); });
    make.instances = inst; make.refreshPanels = refreshPanels;
    window.LCNDA_SIDEGROUPS = make;
})();
