/* LCNDA — 📊 Les types de diagrammes, communs aux diagrammes et aux statistiques :
 *  - un seul catalogue (ordre, types cachés, groupes à soi) : Maintenance → « Types de diagrammes », ou ⚙️ dans la galerie ;
 *  - une statistique (Éditeur de statistiques) peut se dessiner avec n'importe quel type : parts, chiffres, assemblées,
 *    nuage de mots… et, à partir des personnes, frise de vies, frise chronologique, flux de migrations ;
 *  - partout où l'on pose un diagramme (fiche, fiche d'une personne, enquête, Atelier, tableau de bord) : « D'une
 *    statistique » (tenue à jour) et « Importer » : fichier (diagramme ou statistique LCNDA, CSV), tableau collé, page
 *    Wikipédia (ses tableaux et ses images), image d'un graphique (PNG, JPG, SVG) convertie en chiffres à corriger.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A().toast(...a);
    const DI = () => ext.diagramsInternals, R = () => ext.diagramRender;
    const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const PALETTE = ['#4e79a7', '#e15759', '#59a14f', '#f28e2b', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#bab0ac', '#1f77b4', '#d62728'];

    /* ═════════ Le catalogue ═════════ */
    const KKEY = 'genealogie-diagram-kinds';
    const tplId = t => t.kind + (t.o?.layout ? ':' + t.o.layout : t.preset ? ':' + t.preset : '');
    const prefs = () => { const p = read(KKEY, {}); return {order: Array.isArray(p.order) ? p.order : [], hidden: Array.isArray(p.hidden) ? p.hidden : [], groupOf: p.groupOf && typeof p.groupOf === 'object' ? p.groupOf : {}, groups: Array.isArray(p.groups) ? p.groups : []}; };
    const ordered = (all, order) => { const out = order.filter(k => all.includes(k)); all.forEach((k, i) => { if (out.includes(k)) return; const prev = all.slice(0, i).reverse().find(x => out.includes(x)); out.splice(prev ? out.indexOf(prev) + 1 : out.length, 0, k); }); return out; };
    /** [[groupe, [modèles]]] dans l'ordre choisi ; sans les types cachés (sauf all) */
    function catalog(templates, {all = false} = {}) {
        const P = prefs(), ids = templates.map(tplId), byId = new Map(templates.map((t, i) => [ids[i], t]));
        const grp = id => String(P.groupOf[id] || byId.get(id).group || 'Autres');
        const order = ordered(ids, P.order).filter(id => all || !P.hidden.includes(id));
        const names = [...P.groups.filter(g => order.some(id => grp(id) === g)), ...order.map(grp)].filter((g, i, a) => a.indexOf(g) === i);
        return names.map(g => [g, order.filter(id => grp(id) === g).map(id => byId.get(id))]).filter(([, l]) => l.length);
    }
    ext.diagramCatalog = (templates, opts) => catalog(templates, opts);

    /* ── l'éditeur du catalogue (Maintenance ou ⚙️ de la galerie) ── */
    function kindsEditorHtml() {
        const T = DI().TEMPLATES(), P = prefs(), groups = catalog(T, {all: true}), names = groups.map(([g]) => g);
        const opts = cur => names.map(n => `<option value="${esc(n)}" ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('') + '<option value="__new">＋ Nouveau groupe…</option>';
        return `<div class="h-dk" data-dk>${groups.map(([g, items]) => `<section class="h-dk-group" data-dk-g="${esc(g)}"><header><b data-dk-gname>${esc(g)}</b><span><button type="button" class="icon-button small" data-dk-gup title="Monter le groupe">↑</button><button type="button" class="icon-button small" data-dk-gdown title="Descendre le groupe">↓</button><button type="button" class="icon-button small" data-dk-gren title="Renommer le groupe">✎</button></span></header>
            <ol>${items.map(t => `<li data-dk-id="${esc(tplId(t))}" data-dk-def="${esc(t.group)}"><span class="h-dk-mv"><button type="button" class="icon-button small" data-dk-up title="Monter">↑</button><button type="button" class="icon-button small" data-dk-down title="Descendre">↓</button></span><label class="checkbox-line"><input type="checkbox" ${P.hidden.includes(tplId(t)) ? '' : 'checked'}> ${esc(t.icon)} ${esc(t.label)}</label><select data-dk-move aria-label="Groupe">${opts(g)}</select></li>`).join('')}</ol></section>`).join('')}</div>`;
    }
    function bindKindsEditor(root, onSave) {
        const box = () => root.querySelector('[data-dk]');
        root.addEventListener('click', e => {
            const li = e.target.closest('li[data-dk-id]'), sec = e.target.closest('[data-dk-g]');
            if (e.target.closest('[data-dk-up]')) li.previousElementSibling?.before(li);
            if (e.target.closest('[data-dk-down]')) li.nextElementSibling?.after(li);
            if (e.target.closest('[data-dk-gup]')) sec.previousElementSibling?.before(sec);
            if (e.target.closest('[data-dk-gdown]')) sec.nextElementSibling?.after(sec);
            if (e.target.closest('[data-dk-gren]')) (async () => { const n = String((await A().askText({title: 'Renommer le groupe', message: 'Nouveau nom :', value: sec.dataset.dkG, okLabel: 'Renommer'})) ?? '').trim().slice(0, 40); if (!n) return; sec.dataset.dkG = n; sec.querySelector('[data-dk-gname]').textContent = n; root.querySelectorAll('[data-dk-move]').forEach(s => { [...s.options].forEach(o => { if (o.value !== '__new' && o.textContent === o.value && !root.querySelector(`[data-dk-g="${CSS.escape(o.value)}"]`)) { o.value = n; o.textContent = n; } }); }); })();
            if (e.target.closest('[data-dk-save]')) { save(); onSave?.(); }
            if (e.target.closest('[data-dk-reset]')) { try { localStorage.removeItem(KKEY); } catch (_) {} box().outerHTML = kindsEditorHtml(); toast('Types remis comme au départ.'); onSave?.(); }
        });
        root.addEventListener('change', async e => {
            const s = e.target.closest('[data-dk-move]'); if (!s) return;
            let g = s.value; const li = s.closest('li');
            if (g === '__new') { g = String((await A().askText({title: 'Nouveau groupe', message: 'Nom du groupe (ex. « Mes favoris », « Pour la famille ») :', value: '', okLabel: 'Créer'})) ?? '').trim().slice(0, 40); if (!g) { s.value = li.closest('[data-dk-g]').dataset.dkG; return; } }
            let sec = [...root.querySelectorAll('[data-dk-g]')].find(x => x.dataset.dkG === g);
            if (!sec) { sec = document.createElement('section'); sec.className = 'h-dk-group'; sec.dataset.dkG = g; sec.innerHTML = `<header><b data-dk-gname>${esc(g)}</b><span><button type="button" class="icon-button small" data-dk-gup>↑</button><button type="button" class="icon-button small" data-dk-gdown>↓</button><button type="button" class="icon-button small" data-dk-gren>✎</button></span></header><ol></ol>`; box().prepend(sec); root.querySelectorAll('[data-dk-move]').forEach(x => { if (![...x.options].some(o => o.value === g)) x.querySelector('option[value="__new"]').before(new Option(g, g)); }); }
            sec.querySelector('ol').appendChild(li); s.value = g;
            root.querySelectorAll('[data-dk-g]').forEach(x => { if (!x.querySelector('li')) x.remove(); });
        });
        function save() {
            const lis = [...root.querySelectorAll('li[data-dk-id]')], groupOf = {};
            lis.forEach(li => { const g = li.closest('[data-dk-g]').dataset.dkG; if (g !== li.dataset.dkDef) groupOf[li.dataset.dkId] = g; });
            write(KKEY, {order: lis.map(li => li.dataset.dkId), hidden: lis.filter(li => !li.querySelector('input[type=checkbox]').checked).map(li => li.dataset.dkId), groupOf, groups: [...root.querySelectorAll('[data-dk-g]')].map(x => x.dataset.dkG)});
            toast('Types de diagrammes enregistrés (galerie des diagrammes et éditeur de statistiques).');
        }
    }
    const kindsHelp = '<p class="muted">Les mêmes types pour <b>Mes diagrammes</b> et pour l’<b>Éditeur de statistiques</b> : ↑ ↓ pour l’ordre, décoche pour cacher un type, choisis un groupe (ou « ＋ Nouveau groupe… ») pour les regrouper à ta façon ; ✎ renomme un groupe, ↑ ↓ de l’en-tête range les groupes.</p>';
    ext.openDiagramKindsEditor = ({onSave} = {}) => {
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-dk-dlg';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">DIAGRAMMES</span><h2>⚙️ Ranger les types</h2></div><button type="button" class="icon-button" data-x>×</button></div><div class="h-dk-body">${kindsHelp}${kindsEditorHtml()}</div><div class="modal-actions"><button type="button" class="button secondary" data-dk-reset>↺ Remettre comme au départ</button><span class="spacer"></span><button type="button" class="button secondary" data-x>Fermer</button><button type="button" class="button" data-dk-save>Enregistrer</button></div>`;
        document.body.appendChild(dlg); // pas dans la galerie : son paint() remplace son contenu (« Tout remettre ») et ferait disparaître l'éditeur
        bindKindsEditor(dlg, () => { onSave?.(); });
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]') || e.target.closest('[data-dk-save]')) dlg.close(); });
        dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
    };
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.diagram_kinds = async token => {
        if (token !== A().state.workspaceToken) return;
        const ws = document.getElementById('workspace');
        ws.innerHTML = `<section class="page"><header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>📊 Types de diagrammes</h2><p>Ordre, types montrés ou cachés, et groupes à toi.</p></div></header><div class="maintenance-panel">${kindsHelp}${kindsEditorHtml()}<div class="page-actions action-zone"><button type="button" class="button" data-dk-save>Enregistrer</button><button type="button" class="button secondary" data-dk-reset>↺ Remettre comme au départ</button></div></div>
            <section class="maintenance-panel h-dk-howto"><h3>📥 Ma propre statistique à partir de données d’ailleurs</h3>${HOWTO}</section></section>`;
        bindKindsEditor(ws.querySelector('.page'));
    };
    const HOWTO = `<ol><li><b>Un tableau</b> (tableur, site, CSV) : copie-le, puis <b>Graphiques → Mes diagrammes → ＋ Nouveau</b> (ou « 📥 Importer » là où l’on pose un diagramme : fiche, personne, enquête, Atelier) → « Coller un tableau ». Première colonne = les noms, colonnes suivantes = les chiffres ; une première ligne de titres devient le nom des séries.</li>
        <li><b>Un fichier CSV</b> : « 📥 Importer » → « Fichier » (séparateur virgule, point-virgule ou tabulation).</li>
        <li><b>Une page Wikipédia</b> : « 📥 Importer » → « Page Wikipédia », colle son adresse : ses tableaux et ses images de graphiques s’affichent, choisis-en un.</li>
        <li><b>Une image de graphique</b> (camembert, barres, courbe, hémicycle) : « 📥 Importer » → « Image » : l’app repère les couleurs et propose les chiffres (parts, hauteurs, sièges) ; corrige les noms et les valeurs dans le tableau avant de créer le diagramme.</li>
        <li><b>Une statistique partagée</b> par quelqu’un (fichier <code>.lcnda-widget.json</code>) : « 📥 Importer » → « Fichier » : elle rejoint « Mes statistiques » et se dessine avec les données de ton arbre.</li>
        <li>Ensuite, le diagramme se choisit parmi tous les types (parts, chiffres, frises, liens…), se règle, s’exporte (PNG, SVG, PDF) et se pose partout.</li></ol>`;
    ext.diagramHowtoHtml = () => HOWTO;

    /* ═════════ Les statistiques dessinées avec les types de diagrammes ═════════ */
    const PAIR_KINDS = new Set(['columns', 'bars', 'stacked', 'stacked100', 'line', 'area', 'pie', 'donut', 'halfdonut', 'waffle', 'treemap', 'funnel', 'radar', 'pyramid', 'heatmap', 'parliament', 'wordcloud', 'pictogram', 'gauge']);
    const PEOPLE_TPL = new Set(['timeline:lives', 'chrono', 'sankey']);
    const usable = t => (PAIR_KINDS.has(t.kind) && !t.preset) || PEOPLE_TPL.has(tplId(t));
    ext.diagramStatStyles = () => { if (!DI()?.TEMPLATES || !R()) return []; return catalog(DI().TEMPLATES()).map(([g, items]) => [g, items.filter(usable).map(t => ['dg:' + tplId(t), `${t.icon} ${t.label}${PEOPLE_TPL.has(tplId(t)) ? ' (avec des personnes)' : ''}`])]).filter(([, l]) => l.length); };
    const yearOf = v => { const m = String(v || '').match(/(\d{3,4})(?!.*\d{3,4})/); return m ? Number(m[1]) : null; };
    const firstYear = v => { const m = String(v || '').match(/\d{3,4}/); return m ? Number(m[0]) : null; };
    const placeShort = v => String(v || '').split(',')[0].trim();
    ext.diagramStatHtml = (d, data, entries, cell) => {
        if (!DI()?.TEMPLATES || !R()) return '';
        const id = String(d.style).slice(3), t = DI().TEMPLATES().find(x => tplId(x) === id); if (!t) return '';
        let spec = DI().presetSpec(t); spec.o = {...(spec.o || {}), title: '', subtitle: '', source: ''};
        const people = Array.isArray(data?.shown) ? data.shown : null;
        if (PEOPLE_TPL.has(id)) {
            if (!people) return '<p class="muted">Ce dessin a besoin d’une liste de personnes (source « Personnes »).</p>';
            if (id === 'timeline:lives') {
                const rows = people.map(r => ({name: cell(r, 'name'), roles: cell(r, 'gender') || 'Personne', start: String(firstYear(cell(r, 'birth')) ?? ''), end: String(firstYear(cell(r, 'death')) ?? '')})).filter(r => r.start).map(r => r.end || Number(r.start) > new Date().getFullYear() - 100 ? r : {...r, end: r.start}).sort((a, b) => a.start - b.start).slice(0, 80); // décès inconnu et naissance ancienne : pas de barre jusqu'à aujourd'hui
                const roles = [...new Set(rows.map(r => r.roles))].map((role, i) => ({role, color: /femme|female/i.test(role) ? '#e15759' : /homme|male/i.test(role) ? '#4e79a7' : PALETTE[i % PALETTE.length]}));
                Object.assign(spec, {rows, roles, events: []}); spec.o.order = 'start';
            } else if (id === 'chrono') {
                spec.rows = people.map(r => ({date: cell(r, 'birth') || cell(r, 'date') || '', label: cell(r, 'name') || cell(r, 'label') || ''})).filter(r => firstYear(r.date)).sort((a, b) => firstYear(a.date) - firstYear(b.date)).slice(0, 40);
            } else if (id === 'sankey') {
                const m = new Map(); people.forEach(r => { const a = placeShort(cell(r, 'birthplace')), b = placeShort(cell(r, 'deathplace')); if (a && b) m.set(a + '\u0000' + b, (m.get(a + '\u0000' + b) || 0) + 1); });
                spec.rows = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, v]) => { const [from, to] = k.split('\u0000'); return {from, to: from === to ? to + ' ' : to, value: v}; });
                if (!spec.rows.length) return '<p class="muted">Aucune personne avec un lieu de naissance et un lieu de décès.</p>';
            }
        } else spec = DI().fillFrom(spec, entries.map(([v, n]) => [String(v), Number(n) || 0]), d.name || '');
        try { return R().svg(spec); } catch (_) { return ''; }
    };

    /* ═════════ Partout où l'on pose un diagramme ═════════ */
    const editWith = (spec, name, link) => new Promise(res => { DI().openEditor(null, {spec, name, link, onSave: id => res(id), onClose: () => res(null)}); });
    /** un type pour des chiffres déjà là (ou d'après la statistique) */
    function pickKind(title, filter = usable) {
        return new Promise(res => { let done = false;
            const groups = catalog(DI().TEMPLATES()).map(([g, items]) => [g, items.filter(filter)]).filter(([, l]) => l.length);
            ext.openDialog({eyebrow: 'DIAGRAMME', title, submitLabel: 'Continuer', body: `<div class="h-dk-form"><label>Dessin<select name="tpl">${groups.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(t => `<option value="${esc(tplId(t))}">${esc(t.icon)} ${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}</select></label></div>`,
                onOpen: dg => dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}),
                onSubmit: f => { done = true; res(DI().TEMPLATES().find(t => tplId(t) === f.querySelector('[name=tpl]').value) || null); }}); });
    }
    ext.diagramFromStat = ({link = null} = {}) => new Promise(async res => {
        const src = await ext.diagramStatSources?.().catch(() => []) || []; let done = false;
        if (!src.length) { toast('Aucune statistique disponible.', 'error'); return res(null); }
        const g = {}; src.forEach(([k, l, grp]) => { (g[grp] = g[grp] || []).push([k, l]); });
        const groups = catalog(DI().TEMPLATES()).map(([gn, items]) => [gn, items.filter(t => PAIR_KINDS.has(t.kind) && !t.preset)]).filter(([, l]) => l.length);
        ext.openDialog({eyebrow: 'DIAGRAMME', title: '📊 D’une statistique', submitLabel: 'Créer', body: `<div class="h-dk-form"><p class="muted">Une statistique de l’app (naissances par décennie, prénoms…), un exemple, ou une des tiennes (Maintenance → Éditeur de statistiques), dessinée avec le type de ton choix.</p>
            <label>Statistique<select name="src">${Object.entries(g).map(([grp, items]) => `<optgroup label="${esc(grp)}">${items.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></label>
            <label>Dessin<select name="tpl">${groups.map(([gn, items]) => `<optgroup label="${esc(gn)}">${items.map(t => `<option value="${esc(tplId(t))}">${esc(t.icon)} ${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
            <label class="checkbox-line"><input type="checkbox" name="live" checked> Chiffres tenus à jour (relus dans l’arbre à chaque affichage)</label>
            <p><button type="button" class="link-button" data-newstat>＋ Créer une nouvelle statistique (Éditeur de statistiques)…</button></p></div>`,
            onOpen: dg => { dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); dg.querySelector('[data-newstat]').addEventListener('click', () => { dg.close(); ext.newStatFor?.(); }); },
            onSubmit: async f => {
                const key = f.querySelector('[name=src]').value, label = f.querySelector('[name=src]').selectedOptions[0]?.textContent || '', t = DI().TEMPLATES().find(x => tplId(x) === f.querySelector('[name=tpl]').value);
                try { const pairs = await ext.diagramStatRows(key); let spec = DI().fillFrom(DI().presetSpec(t), pairs, label); spec.o = {...spec.o, title: label}; if (f.querySelector('[name=live]').checked) spec.live = {key, label};
                    done = true; setTimeout(async () => res(await editWith(spec, label, link)), 0); }
                catch (e) { toast(e.message, 'error'); return false; }
            }});
    });

    /* ── Importer ── */
    async function specFromTable(text, title = '') {
        const cells = DI().parseTable(text).filter(r => r.some(c => String(c).trim()));
        if (cells.length < 2 && !(cells[0]?.length > 1)) throw new Error('Tableau vide.');
        const t = await pickKind('Avec quel dessin ?', x => PAIR_KINDS.has(x.kind) && !x.preset || ['sankey', 'chrono', 'orgchart', 'timeline'].includes(x.kind)); if (!t) return null;
        const spec = DI().presetSpec(t), kind = R().KINDS[spec.kind], g = kind.grids?.[0];
        if (g) { spec[g.key] = []; DI().pasteInto(g, spec, cells); }
        spec.o = {...(spec.o || {}), title: title || spec.o?.title || ''};
        return spec;
    }
    ext.diagramImport = ({link = null} = {}) => new Promise(res => { let done = false;
        ext.openDialog({eyebrow: 'DIAGRAMME', title: '📥 Importer', wide: true, submitLabel: 'Continuer', body: `<div class="h-dgi"><nav class="h-dgi-tabs">${[['file', '📄 Fichier'], ['paste', '📋 Coller un tableau'], ['wiki', '🌐 Page Wikipédia'], ['image', '🖼️ Image d’un graphique']].map(([k, l], i) => `<button type="button" data-dgi-tab="${k}" class="${i ? '' : 'active'}">${l}</button>`).join('')}</nav>
            <section data-dgi="file"><p class="muted">Un diagramme LCNDA (.json), une statistique partagée (.lcnda-widget.json) ou un tableau CSV.</p><input type="file" name="file" accept=".json,.csv,.tsv,.txt,application/json,text/csv"></section>
            <section data-dgi="paste" hidden><p class="muted">Copie un tableau (tableur, site web…) et colle-le ici. Première colonne = les noms, colonnes suivantes = les chiffres.</p><textarea name="paste" rows="10" placeholder="Prénom;Nombre&#10;Marie;42&#10;Jean;37"></textarea></section>
            <section data-dgi="wiki" hidden><p class="muted">L’adresse d’une page Wikipédia (n’importe quelle langue) : ses tableaux et ses graphiques s’affichent, choisis-en un. Il faut Internet.</p><span class="h-fp-who"><input name="wiki" placeholder="https://fr.wikipedia.org/wiki/Démographie_de_la_France"><button type="button" class="button small" data-dgi-wiki>Lire la page</button></span><div data-dgi-wikires></div></section>
            <section data-dgi="image" hidden><p class="muted">Un camembert, des barres ou colonnes, une courbe ou un hémicycle en image : l’app regarde ses couleurs et propose des chiffres, à corriger ensuite.</p><input type="file" name="img" accept="image/*"></section></div>${ext.diagramHowtoHtml ? `<details class="h-dgi-howto"><summary>Comment faire ma propre statistique avec des données d’ailleurs ?</summary>${HOWTO}</details>` : ''}`,
            onOpen: dg => {
                let tab = 'file'; dg._tab = () => tab;
                dg.addEventListener('close', () => { if (!done) res(null); }, {once: true});
                dg.querySelectorAll('[data-dgi-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.dgiTab; dg.querySelectorAll('[data-dgi-tab]').forEach(x => x.classList.toggle('active', x === b)); dg.querySelectorAll('[data-dgi]').forEach(s => { s.hidden = s.dataset.dgi !== tab; }); }));
                dg.querySelector('[data-dgi-wiki]').addEventListener('click', () => wikiLoad(dg, async pick => { done = true; dg.close(); res(pick.kind === 'table' ? await (async () => { const spec = await specFromTable(pick.text, pick.title); return spec ? editWith(spec, pick.title, link) : null; })() : await digitize(pick.src, {link, title: pick.title})); }));
            },
            onSubmit: async f => {
                const tab = f.closest('dialog')._tab();
                try {
                    if (tab === 'file') { const file = f.querySelector('[name=file]').files?.[0]; if (!file) { toast('Choisis un fichier.', 'error'); return false; } if (file.size > 5e6) throw new Error('Fichier trop gros.');
                        const text = await file.text(), name = file.name.replace(/\.[^.]+$/, '');
                        if (/\.json$/i.test(file.name)) { const j = JSON.parse(text);
                            if (j?.lcnda_diagram && R().KINDS[j.kind]) { done = true; setTimeout(async () => res(await editWith({...(j.spec || {}), kind: j.kind}, String(j.name || name), link)), 0); return; }
                            if (j?.format === 'lcnda-widget') { const st = ext.importCustomStat(j); toast(`Statistique « ${st.name} » ajoutée à Mes statistiques.`); const t = await pickKind('Avec quel dessin ?', x => PAIR_KINDS.has(x.kind) && !x.preset); if (!t) return; const pairs = await ext.diagramStatRows(st.key); const spec = {...DI().fillFrom(DI().presetSpec(t), pairs, st.name), live: {key: st.key, label: st.name}}; spec.o = {...spec.o, title: st.name}; done = true; setTimeout(async () => res(await editWith(spec, st.name, link)), 0); return; }
                            throw new Error('Ce fichier JSON n’est ni un diagramme ni une statistique LCNDA.'); }
                        const spec = await specFromTable(text, name); if (!spec) return false; done = true; setTimeout(async () => res(await editWith(spec, name, link)), 0); return; }
                    if (tab === 'paste') { const text = f.querySelector('[name=paste]').value; if (!text.trim()) { toast('Colle un tableau.', 'error'); return false; } const spec = await specFromTable(text); if (!spec) return false; done = true; setTimeout(async () => res(await editWith(spec, spec.o?.title || 'Tableau collé', link)), 0); return; }
                    if (tab === 'image') { const file = f.querySelector('[name=img]').files?.[0]; if (!file) { toast('Choisis une image.', 'error'); return false; } const src = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); }); done = true; setTimeout(async () => res(await digitize(src, {link, title: file.name.replace(/\.[^.]+$/, '')})), 0); return; }
                    if (tab === 'wiki') { toast('Clique « Lire la page », puis choisis un tableau ou une image.'); return false; }
                } catch (e) { toast(e.message, 'error'); return false; }
            }});
    });

    /* ── Wikipédia : les tableaux et les images de la page ── */
    async function wikiLoad(dg, onPick) {
        const out = dg.querySelector('[data-dgi-wikires]'), url = dg.querySelector('[name=wiki]').value.trim();
        const m = url.match(/^https?:\/\/([a-z-]{2,12})\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i);
        if (!m) { out.innerHTML = '<p class="error">Colle l’adresse d’une page Wikipédia (https://xx.wikipedia.org/wiki/…).</p>'; return; }
        out.innerHTML = '<p class="muted">Lecture de la page…</p>';
        try {
            const api = `https://${m[1].toLowerCase()}.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=text|displaytitle&redirects=1&page=${encodeURIComponent(decodeURIComponent(m[2]))}`;
            const j = await (await fetch(api, {credentials: 'omit'})).json(); if (j.error) throw new Error(j.error.info || 'Page introuvable.');
            const doc = new DOMParser().parseFromString(j.parse.text['*'], 'text/html'), title = doc.createElement('div'); title.innerHTML = j.parse.displaytitle || ''; const pageTitle = title.textContent;
            const tables = [...doc.querySelectorAll('table.wikitable, table.sortable')].slice(0, 40).map((tb, i) => {
                const rows = [...tb.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(c => c.textContent.replace(/\[\d+\]|\[note \d+\]/g, '').replace(/\s+/g, ' ').trim())).filter(r => r.length);
                return {kind: 'table', title: (tb.querySelector('caption')?.textContent || `${pageTitle} — tableau ${i + 1}`).trim().slice(0, 120), text: rows.map(r => r.join('\t')).join('\n'), rows};
            }).filter(t => t.rows.length > 1);
            const imgs = [...doc.querySelectorAll('img')].map(im => ({src: im.getAttribute('src') || '', w: Number(im.getAttribute('width')) || 0, alt: im.getAttribute('alt') || ''})).filter(x => x.w >= 120 && /upload\.wikimedia\.org/.test(x.src)).slice(0, 24)
                .map(x => { let src = x.src.startsWith('//') ? 'https:' + x.src : x.src; src = src.replace(/\/(\d+)px-([^/]+)$/, (m0, w, f) => `/${Math.max(800, Number(w))}px-${f}`); return {kind: 'image', src, title: x.alt || pageTitle}; });
            dg._wiki = [...tables, ...imgs];
            out.innerHTML = `<h4>${esc(pageTitle)}</h4>${tables.length ? `<p><b>Tableaux</b></p><ul class="h-dgi-list">${tables.map((t, i) => `<li><button type="button" class="link-button" data-dgi-pick="${i}">📋 ${esc(t.title)}</button> <small class="muted">${t.rows.length} lignes · ${esc(t.rows[0].slice(0, 4).join(' | '))}</small></li>`).join('')}</ul>` : '<p class="muted">Aucun tableau.</p>'}
                ${imgs.length ? `<p><b>Images</b> (graphiques à convertir en chiffres)</p><div class="h-dgi-imgs">${imgs.map((x, i) => `<button type="button" data-dgi-pick="${tables.length + i}" title="${esc(x.title)}"><img src="${esc(x.src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`;
            out.querySelectorAll('[data-dgi-pick]').forEach(b => b.addEventListener('click', () => onPick(dg._wiki[Number(b.dataset.dgiPick)])));
        } catch (e) { out.innerHTML = `<p class="error">${esc(e.message || 'Lecture impossible (connexion internet ?)')}</p>`; }
    }

    /* ═════════ 🖼️ Image d'un graphique → chiffres (à corriger) ═════════ */
    const loadImage = src => new Promise((ok, ko) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible (ou refusée par le site).')); i.src = src; });
    const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    /** les couleurs franches de l'image (le blanc, le noir, les gris des textes et des axes sont mis de côté) */
    function colorsOf(px, W, H) {
        const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
        const bins = new Map();
        for (let i = 0; i < W * H; i++) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3]; if (a < 128 || sat(r, g, b) < .22 || Math.max(r, g, b) < 40) continue; const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4); const e = bins.get(k) || [0, 0, 0, 0]; e[0] += r; e[1] += g; e[2] += b; e[3]++; bins.set(k, e); }
        let cl = [...bins.values()].filter(e => e[3] > W * H * .0008).map(e => ({r: e[0] / e[3], g: e[1] / e[3], b: e[2] / e[3], n: e[3]})).sort((a, b) => b.n - a.n);
        const out = []; cl.forEach(c => { const near = out.find(o => (o.r - c.r) ** 2 + (o.g - c.g) ** 2 + (o.b - c.b) ** 2 < 42 ** 2); if (near) { const t = near.n + c.n; near.r = (near.r * near.n + c.r * c.n) / t; near.g = (near.g * near.n + c.g * c.n) / t; near.b = (near.b * near.n + c.b * c.n) / t; near.n = t; } else out.push({...c}); });
        return out.filter(c => c.n > W * H * .002).slice(0, 16);
    }
    function labelMap(px, W, H, cols) { const lab = new Int16Array(W * H).fill(-1); for (let i = 0; i < W * H; i++) { if (px[i * 4 + 3] < 128) continue; let best = -1, bd = 34 ** 2; cols.forEach((c, j) => { const d = (px[i * 4] - c.r) ** 2 + (px[i * 4 + 1] - c.g) ** 2 + (px[i * 4 + 2] - c.b) ** 2; if (d < bd) { bd = d; best = j; } }); lab[i] = best; } return lab; }
    /** les taches d'une couleur (composantes connexes) : boîte et nombre de points */
    function blobs(lab, W, H, j) { const seen = new Uint8Array(W * H), out = [], st = []; for (let i = 0; i < W * H; i++) { if (lab[i] !== j || seen[i]) continue; let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0; st.push(i); seen[i] = 1; while (st.length) { const p = st.pop(), x = p % W, y = (p - x) / W; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; for (const q of [p - 1, p + 1, p - W, p + W]) { if (q < 0 || q >= W * H || seen[q] || lab[q] !== j || Math.abs((q % W) - x) > 1) continue; seen[q] = 1; st.push(q); } } out.push({n, x0, y0, x1, y1}); } return out; }
    function analyse(img, mode) {
        const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight)), W = Math.max(1, Math.round(img.naturalWidth * k)), H = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(img, 0, 0, W, H);
        const px = g.getImageData(0, 0, W, H).data, cols = colorsOf(px, W, H); if (!cols.length) return {rows: [], W, H, note: 'Pas de couleur franche trouvée (graphique en noir et blanc ?) : remplis le tableau à la main.'};
        const lab = labelMap(px, W, H, cols);
        if (mode === 'pie') { const tot = cols.reduce((a, c) => a + c.n, 0); return {kind: 'pie', W, H, rows: cols.map((c, i) => ({label: `Part ${i + 1}`, value: Math.round(c.n / tot * 1000) / 10, color: hex(c.r, c.g, c.b)})), note: 'Parts en % de la surface colorée. Les textes ne sont pas lus : donne un nom à chaque part.'}; }
        if (mode === 'parliament') { const rows = cols.map((c, j) => { const bl = blobs(lab, W, H, j).filter(b => b.n >= 6); const med = bl.map(b => b.n).sort((a, b) => a - b)[Math.floor(bl.length / 2)] || 1; return {label: `Groupe ${j + 1}`, value: bl.reduce((a, b) => a + Math.max(1, Math.round(b.n / med)), 0), color: hex(c.r, c.g, c.b)}; }).filter(r => r.value); return {kind: 'parliament', W, H, rows, note: 'Sièges comptés (une tache = un siège ; deux sièges collés comptent pour deux). Nomme les groupes.'}; }
        if (mode === 'line') { const rows = []; const N = 12; cols.slice(0, 4).forEach((c, j) => { for (let s = 0; s < N; s++) { const x = Math.round((s + .5) * W / N); let y = -1; for (let yy = 0; yy < H; yy++) if (lab[yy * W + x] === j) { y = yy; break; } rows.push({label: `Point ${s + 1}`, value: y < 0 ? 0 : Math.round((1 - y / H) * 1000) / 10, color: hex(c.r, c.g, c.b), series: j}); } }); return {kind: 'line', W, H, rows: rows.filter(r => r.series === 0), note: 'Hauteur de la courbe (0 à 100 % de l’image) en 12 points : règle l’échelle avec « Valeur du haut ».'}; }
        // barres ou colonnes : chaque tache colorée assez grande ; sa hauteur (colonnes) ou sa largeur (barres)
        const all = []; cols.forEach((c, j) => blobs(lab, W, H, j).filter(b => b.n > W * H * .0015 && (b.x1 - b.x0) > 2 && (b.y1 - b.y0) > 2).forEach(b => all.push({...b, j, c})));
        const horiz = mode === 'bars' || (mode === 'auto' && all.filter(b => (b.x1 - b.x0) > (b.y1 - b.y0)).length > all.length / 2);
        all.sort((a, b) => horiz ? a.y0 - b.y0 : a.x0 - b.x0);
        const len = b => horiz ? b.x1 - b.x0 + 1 : b.y1 - b.y0 + 1, mx = Math.max(1, ...all.map(len));
        return {kind: horiz ? 'bars' : 'columns', W, H, boxes: all, rows: all.slice(0, 60).map((b, i) => ({label: `${horiz ? 'Barre' : 'Colonne'} ${i + 1}`, value: Math.round(len(b) / mx * 1000) / 10, color: hex(b.c.r, b.c.g, b.c.b)})), note: 'Longueur de chaque barre, la plus longue = 100 : indique sa vraie valeur dans « Valeur du haut », et nomme les barres.'};
    }
    function digitize(src, {link = null, title = 'Graphique'} = {}) {
        return new Promise(async res => {
            let img; try { img = await loadImage(src); } catch (e) { toast(e.message, 'error'); return res(null); }
            let mode = 'auto', A0 = analyse(img, mode), done = false, scale = 100;
            const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-dgz';
            const tableHtml = () => `<table class="data-table h-dgz-table"><thead><tr><th>Nom</th><th>Valeur</th><th>Couleur</th><th></th></tr></thead><tbody>${A0.rows.map((r, i) => `<tr data-i="${i}"><td><input data-f="label" value="${esc(r.label)}"></td><td><input data-f="value" type="number" step="any" value="${n2(r.value * scale / 100)}"></td><td><input data-f="color" type="color" value="${esc(r.color || '#888888')}"></td><td><button type="button" class="icon-button small" data-del title="Enlever">✕</button></td></tr>`).join('')}</tbody></table><button type="button" class="button small secondary" data-add>＋ Une ligne</button>`;
            const n2 = v => Math.round(v * 100) / 100;
            const paint = () => { dlg.querySelector('[data-dgz-table]').innerHTML = tableHtml(); dlg.querySelector('[data-dgz-note]').textContent = A0.note || ''; drawOverlay(); };
            dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">IMAGE → CHIFFRES</span><h2>🖼️ ${esc(title)}</h2></div><button type="button" class="icon-button" data-x>×</button></div>
                <div class="h-dgz-body"><div class="h-dgz-img"><canvas data-dgz-cv></canvas></div>
                <div class="h-dgz-side"><label>C’est un…<select data-dgz-mode>${[['auto', 'Je ne sais pas (barres ou colonnes)'], ['pie', 'Camembert / anneau'], ['columns', 'Colonnes'], ['bars', 'Barres horizontales'], ['line', 'Courbe'], ['parliament', 'Hémicycle (sièges)']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
                    <label>Valeur du haut (la plus grande barre, ou 100 %)<input type="number" step="any" value="100" data-dgz-scale></label>
                    <p class="muted" data-dgz-note></p><div data-dgz-table></div></div></div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="button" class="button" data-ok>Créer le diagramme</button></div>`;
            (document.querySelector('dialog[open]:last-of-type') || document.body).appendChild(dlg);
            const cv = dlg.querySelector('[data-dgz-cv]');
            function drawOverlay() { const k = Math.min(1, 520 / img.naturalWidth); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height); if (A0.boxes) { const s = cv.width / A0.W; g.lineWidth = 2; A0.boxes.slice(0, 60).forEach((b, i) => { g.strokeStyle = '#e02020'; g.strokeRect(b.x0 * s, b.y0 * s, (b.x1 - b.x0 + 1) * s, (b.y1 - b.y0 + 1) * s); g.fillStyle = '#e02020'; g.font = '12px sans-serif'; g.fillText(String(i + 1), b.x0 * s + 2, b.y0 * s + 12); }); } }
            const collect = () => [...dlg.querySelectorAll('tr[data-i]')].map(tr => ({label: tr.querySelector('[data-f=label]').value.trim() || '?', value: Number(tr.querySelector('[data-f=value]').value) || 0, color: tr.querySelector('[data-f=color]').value}));
            dlg.querySelector('[data-dgz-mode]').addEventListener('change', e => { mode = e.target.value; A0 = analyse(img, mode); paint(); });
            dlg.querySelector('[data-dgz-scale]').addEventListener('change', e => { const cur = collect(); A0.rows = cur.map(r => ({...r, value: r.value * 100 / scale})); scale = Number(e.target.value) || 100; paint(); /* les valeurs tapées sont gardées (ramenées à l'ancienne échelle), comme pour ＋ / × */ });
            dlg.addEventListener('click', async e => {
                if (e.target.closest('[data-x]')) { dlg.close(); return; }
                if (e.target.closest('[data-del]')) { const cur = collect(); const i = Number(e.target.closest('tr').dataset.i); A0.rows = cur.map(r => ({...r, value: r.value * 100 / scale})); A0.rows.splice(i, 1); A0.boxes?.splice(i, 1); paint(); return; }
                if (e.target.closest('[data-add]')) { A0.rows = [...collect().map(r => ({...r, value: r.value * 100 / scale})), {label: 'Nouvelle', value: 0, color: '#888888'}]; paint(); return; }
                if (e.target.closest('[data-ok]')) {
                    const rows = collect(); if (!rows.length) return toast('Le tableau est vide.', 'error');
                    const kind = A0.kind === 'parliament' ? 'parliament' : A0.kind === 'pie' ? 'pie' : A0.kind === 'line' ? 'line' : A0.kind === 'bars' ? 'bars' : 'columns';
                    const t = DI().TEMPLATES().find(x => x.kind === kind && !x.o && !x.preset); let spec = DI().fillFrom(DI().presetSpec(t), rows.map(r => [r.label, r.value]), title);
                    (spec.rows || []).forEach((r, i) => { if (rows[i]) r.color = rows[i].color; }); spec.o = {...(spec.o || {}), title, source: 'D’après une image'};
                    done = true; dlg.close(); res(await editWith(spec, title, link));
                }
            });
            dlg.addEventListener('close', () => { dlg.remove(); if (!done) res(null); });
            dlg.showModal(); paint();
        });
    }
    ext.diagramFromImage = digitize;
    ext.diagramKindsInternals = {catalog, tplId, analyse, colorsOf, PAIR_KINDS};
})();
