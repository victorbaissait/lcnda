/**
 * ⤒ Imports et exports « en plus » — les fenêtres (calcul : app-imports-plus-core.js ; serveur : lib/imports_plus.php) :
 *  - 📜 Relevés des cercles (Nimègue, CSV de dépouillements) → Dépouillements, avec « créer ou relier les fiches » ;
 *  - 👥 Tableau de personnes (Excel, LibreOffice, CSV) → fiches et familles ;
 *  - 📚 Références RIS / BibTeX ↔ sources (import ici, export dans Réglages → Export) ;
 *  - 📍 Lieux depuis KML / GeoJSON (coordonnées des lieux existants, lieux manquants).
 * Toujours la fenêtre K13 (UI.openImportDialog) : 1. déposer · 2. « Voilà ce qui va entrer » (colonnes à corriger, « c'est la
 * même personne ? ») · 3. importer, puis message H7 avec « ↶ Annuler ».
 * Entrées : Réglages → Import (cadre « ⤒ Relevés, tableaux, références, lieux »), Dépouillements, Recherche › Dépouillement
 * d'archive, Listes › Lieux ; tout bouton [data-import-plus="releves|people|sources|geo"].
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['exportPanels', 'afterExport']) ext[key] = ext[key] || [];
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const IM = () => window.LCNDA_IMPORTS;
    const SH = () => window.LCNDA_SHEET;
    const PK = () => window.LCNDA_PICKER;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, a, b) => A().plural ? A().plural(n, a, b) : `${n} ${n > 1 ? (b || a + 's') : a}`;
    const post = async (action, body) => (await A().api(action, {}, {method: 'POST', body})).result;
    const TABLE_ACCEPT = '.csv,.txt,.tsv,.xlsx,.ods,text/csv';
    const dlgOf = body => body.closest('dialog');
    const goBtn = body => dlgOf(body)?.querySelector('[data-k-go]');
    const setSummary = (body, html) => { const n = body.querySelector('.ui-notice'); const t = n?.querySelector('.ui-notice-t, span:last-child') || n; if (t) t.innerHTML = html; };
    const wide = body => dlgOf(body)?.classList.add('modal-l', 'ip-wide');
    const afterImport = async () => { try { A().clearLineageCache?.(); await A().reloadBootstrap?.(); A().refreshScreen?.(); } catch (_) {} };
    const decide = '<option value="?">⚠️ À décider</option>';
    /** La case « c'est la même personne ? » d'une ligne : rien / créer / une des fiches proches / une autre fiche (menu de choix). */
    function choiceCell(cands, dflt, name) {
        const opts = [cands.length ? decide : '', `<option value="none">Ne rien faire</option>`, `<option value="create">＋ Créer une fiche</option>`,
            ...cands.map(c => `<option value="c:${c.id}">= ${esc(c.title)}${c.years ? ` (${esc(c.years)})` : ''}</option>`), `<option value="other">Une autre fiche de la base…</option>`].join('');
        return `<select data-ip-choice aria-label="Que faire de cette personne">${opts}</select><span class="ip-other" data-ip-other hidden>${PK()?.pickerField ? PK().pickerField({name, kind: 'person', allowCreate: false}) : `<input name="${esc(name)}" inputmode="numeric" placeholder="N° de la fiche">`}</span>`
            .replace(`value="${dflt}"`, `value="${dflt}" selected`);
    }
    const choiceOf = tr => { const v = tr.querySelector('[data-ip-choice]')?.value || 'none'; if (v === 'other') { const id = Number(tr.querySelector('[data-ip-other] input[type=hidden], [data-ip-other] input')?.value || 0); return id ? {mode: 'link', id} : {mode: '?'}; } if (v.startsWith('c:')) return {mode: 'link', id: Number(v.slice(2))}; return {mode: v}; };
    function bindChoices(box, onChange) {
        box.addEventListener('change', e => { const s = e.target.closest('[data-ip-choice]'); if (!s) { onChange?.(); return; } const tr = s.closest('tr'); tr.querySelector('[data-ip-other]').hidden = s.value !== 'other'; tr.classList.toggle('is-undecided', s.value === '?'); onChange?.(); });
        box.querySelectorAll('[data-ip-choice]').forEach(s => s.closest('tr').classList.toggle('is-undecided', s.value === '?'));
    }
    const setAll = (box, pick) => { box.querySelectorAll('[data-ip-choice]').forEach(s => { const v = pick(s); if (v && [...s.options].some(o => o.value === v)) { s.value = v; s.closest('tr').classList.toggle('is-undecided', v === '?'); s.closest('tr').querySelector('[data-ip-other]').hidden = v !== 'other'; } }); };
    const mapTable = (head, rows, mapping, fields, pre) => `<table class="ip-map"><thead><tr><th>Colonne du fichier</th><th>Exemple</th><th>Ce que c’est</th></tr></thead><tbody>${head.map((h, i) => {
        const ex = rows.map(r => String(r[i] ?? '').trim()).find(Boolean) || '';
        return `<tr><td>${esc(h || `Colonne ${i + 1}`)}</td><td class="ip-ex">${esc(ex.slice(0, 60))}</td><td><select name="${pre}${i}" data-ip-col="${i}">${fields.map(([c, l]) => `<option value="${c}" ${mapping[i] === c ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`;
    }).join('')}</tbody></table>`;
    const readMapping = (body, n) => Array.from({length: n}, (_, i) => body.querySelector(`[data-ip-col="${i}"]`)?.value || '');
    const fileBytes = async f => { if (f.size > 40e6) throw new Error('fichier trop gros (40 Mo au plus)'); return f.arrayBuffer(); };

    /* ═════════ 📜 Relevés des cercles (Nimègue, CSV) → Dépouillements ═════════ */
    function openReleves({files, digestId = 0} = {}) {
        if (!UI().openImportDialog || !IM()) return;
        let undoToken = '';
        return UI().openImportDialog({title: 'Importer des relevés (Nimègue, cercle)', accept: TABLE_ACCEPT, what: 'Nimègue, CSV, Excel, LibreOffice', noun: 'acte', files,
            intro: 'Les relevés d’un cercle généalogique : un fichier Nimègue (v2 ou v3) ou un tableau de dépouillement (CSV, Excel, LibreOffice). Chaque acte devient une ligne du dépouillement de sa commune, avec ses personnes et leur rôle. Tu peux aussi créer ou relier les fiches.',
            analyze: async fs => {
                const t = await IM().readTable(SH(), fs[0].name, await fileBytes(fs[0]));
                const prep = IM().prepareReleves(t.rows);
                if (!prep.rows.length) throw new Error('aucune ligne de relevé dans ce fichier');
                const st = {prep, t, mapping: prep.mapping.slice(), acts: [], stats: {}, groups: [], check: null};
                const compute = () => { const r = IM().rowsToActs(prep, st.mapping, {type: st.type || prep.type || 'N', commune: st.commune || ''}); st.acts = r.acts; st.stats = r.stats; };
                st.type = prep.type || 'N'; compute();
                const modeText = prep.mode === 'positional' ? `Fichier <b>Nimègue</b> sans ligne de titres (${esc(IM().TYPES[prep.type] || '')}${prep.mixed ? ', plusieurs sortes d’actes' : ''})` : prep.mode === 'header' ? 'Fichier <b>Nimègue</b> avec sa ligne de titres' : 'Tableau d’un cercle : <b>les colonnes ont été reconnues par leur titre</b>, vérifie-les ci-dessous';
                const hasType = st.mapping.includes('TYPACT') || prep.mode === 'positional', hasCommune = st.mapping.includes('COMMUNE');
                const extra = `<div class="ip-grid">
                    <label>Sorte d’actes<select name="ip_type" ${hasType ? 'disabled title="Donnée par le fichier, acte par acte"' : ''}>${Object.entries(IM().TYPES).map(([k, l]) => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Commune${hasCommune ? ' <small>(donnée par le fichier)</small>' : ''}<input name="ip_commune" ${hasCommune ? 'disabled' : ''} placeholder="Naves"></label>
                    <div class="ip-span"><span class="pk-lab">Dans le dépouillement</span>${PK()?.pickerField ? PK().pickerField({name: 'ip_digest', kind: 'digest', allowCreate: false, value: digestId || null}) : ''}<p class="ui-hint">Vide : un nouveau dépouillement par commune et sorte d’actes.</p></div></div>
                    <details class="ip-cols" ${prep.mode === 'csv' && prep.head.some((h, i) => String(h).trim() && !st.mapping[i]) ? 'open' : ''}><summary>Colonnes reconnues (${prep.head.length}) — à corriger si besoin</summary>${mapTable(prep.head, prep.rows.slice(0, 30), st.mapping, IM().FIELDS, 'ipc')}</details>
                    <div class="ip-prev" data-ip-prev></div>
                    <label class="checkbox-line"><input type="checkbox" name="ip_links"> Créer ou relier les fiches (l’enfant, les époux, le défunt et leurs parents)</label>
                    <div data-ip-links hidden></div>`;
                const preview = body => {
                    const box = body.querySelector('[data-ip-prev]'); if (!box) return;
                    box.innerHTML = `<table><thead><tr><th>Acte</th><th>Personnes</th></tr></thead><tbody>${st.acts.slice(0, 8).map(a => `<tr><td>${esc(IM().actTitle(a))}${a.no ? ` · n° ${esc(a.no)}` : ''}</td><td>${a.people.map(p => `<span class="ip-who"><i>${esc(p.label)}</i> ${esc(IM().personText(p))}</span>`).join(' ')}</td></tr>`).join('')}</tbody></table>${st.acts.length > 8 ? `<p class="ui-hint">… et ${esc(plural(st.acts.length - 8, 'autre acte', 'autres actes'))}.</p>` : ''}`;
                };
                const people = st.acts.reduce((n, a) => n + a.people.length, 0);
                return {count: st.acts.length, noun: 'acte', data: st, preview: '',
                    summaryHtml: `<b>${esc(plural(st.acts.length, 'acte'))}</b>, ${esc(plural(people, 'personne citée', 'personnes citées'))}`,
                    notices: [{kind: 'info', text: ''}, ...(st.stats.formulas ? [{kind: 'warn', text: `${plural(st.stats.formulas, 'case contenait', 'cases contenaient')} une formule de tableur : laissée${st.stats.formulas > 1 ? 's' : ''} vide${st.stats.formulas > 1 ? 's' : ''} (jamais importée${st.stats.formulas > 1 ? 's' : ''}).`}] : [])],
                    extra, goLabel: `⤒ Importer ${plural(st.acts.length, 'acte')}`,
                    onShow: body => {
                        wide(body);
                        const n0 = body.querySelectorAll('.ui-notice')[1]; if (n0) { const t2 = n0.querySelector('.ui-notice-t, span:last-child') || n0; t2.innerHTML = modeText; }
                        preview(body);
                        const refresh = async () => {
                            compute(); preview(body);
                            const ppl = st.acts.reduce((n, a) => n + a.people.length, 0);
                            setSummary(body, `Voilà ce qui va entrer : <b>${esc(plural(st.acts.length, 'acte'))}</b>, ${esc(plural(ppl, 'personne citée', 'personnes citées'))}${st.check?.already ? ` — <b>${esc(plural(st.check.already, 'acte déjà importé', 'actes déjà importés'))}</b> (les mêmes lignes sont déjà dans un dépouillement)` : ''}.`);
                            const g = goBtn(body); if (g) { g.textContent = `⤒ Importer ${plural(st.acts.length, 'acte')}`; g.disabled = !st.acts.length; }
                            if (body.querySelector('[name=ip_links]').checked) await showLinks(body, st);
                        };
                        body.querySelectorAll('[data-ip-col]').forEach(s => s.addEventListener('change', () => { st.mapping = readMapping(body, prep.head.length); refresh(); }));
                        body.querySelector('[name=ip_type]')?.addEventListener('change', e => { st.type = e.target.value; refresh(); });
                        body.querySelector('[name=ip_commune]')?.addEventListener('change', e => { st.commune = e.target.value.trim(); refresh(); });
                        body.querySelector('[name=ip_links]').addEventListener('change', e => { const box = body.querySelector('[data-ip-links]'); box.hidden = !e.target.checked; if (e.target.checked) showLinks(body, st); });
                        // déjà importés ? (une lecture rapide, sans les fiches)
                        post('releves_check', {acts: st.acts}).then(c => { st.check = c; if (c.already) refresh(); }).catch(() => {});
                    }};
            },
            run: async (an, fs, body) => {
                const st = an.data;
                if (!st.acts.length) throw new Error('aucun acte à importer : vérifie le choix des colonnes');
                const links = {};
                if (body.querySelector('[name=ip_links]')?.checked) {
                    const rows = [...body.querySelectorAll('[data-ip-links] tr[data-g]')];
                    const undecided = rows.filter(tr => choiceOf(tr).mode === '?');
                    if (undecided.length) { undecided[0].querySelector('select')?.focus(); UI().fail?.(undecided[0].querySelector('select'), `⛔ ${plural(undecided.length, 'personne', 'personnes')} à décider : « c’est la même personne ? »`); return {keepOpen: true}; }
                    rows.forEach(tr => { const g = st.groups[Number(tr.dataset.g)], c = choiceOf(tr); if (!g || c.mode === 'none') return; g.members.forEach(([a, p]) => { links[`${a}:${p}`] = c.mode === 'create' ? {mode: 'create', g: g.key} : c; }); });
                }
                const digest = Number(body.querySelector('[name=ip_digest]')?.value || 0) || 0;
                const r = await post('releves_import', {acts: st.acts, links, digest_id: digest, label: fs[0].name, format: st.prep.mode === 'csv' ? 'CSV d’un cercle' : 'Nimègue'});
                undoToken = r.undo; await afterImport();
                const bits = [plural(r.acts, 'acte importé', 'actes importés'), r.created ? plural(r.created, 'fiche créée', 'fiches créées') : '', r.linked ? plural(r.linked, 'personne reliée', 'personnes reliées') : ''].filter(Boolean).join(', ');
                return {message: `${bits}.`, undo: async () => { await post('releves_undo', {token: undoToken}); await afterImport(); }};
            }});
    }
    /** « Créer ou relier les fiches » : une ligne par personne (regroupée si elle revient dans plusieurs actes), avec les fiches proches. */
    async function showLinks(body, st) {
        const box = body.querySelector('[data-ip-links]');
        box.innerHTML = UI().spinner ? UI().spinner('Je cherche les fiches qui leur ressemblent…') : '…';
        try {
            st.groups = IM().releveGroups(st.acts).slice(0, 1500);
            const c = await post('releves_check', {acts: st.acts, with_links: 1});
            st.check = c;
            const cand = new Map((c.links || []).map(l => [`${l.a}:${l.p}`, l.candidates || []]));
            const rows = st.groups.map((g, i) => { const cs = g.members.map(([a, p]) => cand.get(`${a}:${p}`) || []).find(x => x.length) || []; g.cands = cs; return {g, i, cs}; });
            const nDecide = rows.filter(r => r.cs.length).length;
            box.innerHTML = `<div class="ip-bar"><b>${esc(plural(rows.length, 'personne', 'personnes'))}</b>${nDecide ? ` · <span class="ip-warn">${esc(plural(nDecide, 'a', 'ont'))} peut-être déjà une fiche : « c’est la même personne ? »</span>` : ''}
                <span class="spacer"></span><button type="button" class="button small secondary" data-ip-all="same">Relier aux fiches proposées</button><button type="button" class="button small secondary" data-ip-all="create">Créer celles qui manquent</button><button type="button" class="button small secondary" data-ip-all="none">Ne rien relier</button></div>
                <div class="ip-links-wrap"><table class="ip-links ip-rel"><thead><tr><th>Personne</th><th>Dans le fichier</th><th>Que faire ?</th></tr></thead><tbody>${rows.map(({g, i, cs}) => `<tr data-g="${i}"><td><b>${esc(IM().personText(g))}</b></td><td>${esc(g.labels.join(', '))}${g.members.length > 1 ? ` · ${esc(plural(g.members.length, 'acte'))}` : ''}${g.year ? ` · ${g.year}` : ''}</td><td>${choiceCell(cs, cs.length ? '?' : 'create', `ip_other_${i}`)}</td></tr>`).join('')}</tbody></table></div>
                ${c.truncated ? UI().notice?.('warn', 'Beaucoup de personnes : seules les 3 000 premières sont proposées ; les autres restent des noms relevés.') || '' : ''}<p class="ui-hint">Une fiche créée reçoit l’acte (baptême, naissance, décès) ; une fiche existante n’est jamais modifiée, elle est seulement reliée au relevé (et à sa famille si tu relies aussi ses parents).</p>`;
            bindChoices(box);
            box.querySelector('.ip-bar').addEventListener('click', e => { const b = e.target.closest('[data-ip-all]'); if (!b) return; const k = b.dataset.ipAll; setAll(box, s => k === 'same' ? (s.querySelector('option[value^="c:"]')?.value || null) : k === 'create' ? (s.value === '?' || s.value === 'none' ? 'create' : null) : 'none'); });
        } catch (e) { box.innerHTML = UI().notice?.('error', `Impossible de chercher les fiches : ${e.message}`) || esc(e.message); }
    }

    /* ═════════ 👥 Tableau de personnes → fiches et familles ═════════ */
    function openPeople({files} = {}) {
        if (!UI().openImportDialog || !IM()) return;
        let undoToken = '';
        return UI().openImportDialog({title: 'Importer un tableau de personnes', accept: TABLE_ACCEPT, what: 'Excel, LibreOffice, CSV', noun: 'personne', feminine: true, files,
            intro: 'Une ligne par personne : prénom, nom, sexe, dates (comme dans un acte : « 7 mai 1925 », « vers 1784 »), lieux, profession, et les liens — père, mère, conjoint — par le n° de la ligne, par le nom ou par le n° Sosa.',
            analyze: async fs => {
                const t = await IM().readTable(SH(), fs[0].name, await fileBytes(fs[0]));
                const {head, rows} = IM().headAndRows(t.rows);
                if (!rows.length) throw new Error('aucune ligne sous les titres des colonnes');
                const st = {head, rows, mapping: IM().guessPeopleMapping(head), linkBy: 'auto', plan: null, check: null};
                const compute = () => { st.plan = IM().buildPeoplePlan(rows, st.mapping, {linkBy: st.linkBy}); };
                compute();
                const extra = `<details class="ip-cols" ${head.some((h, i) => String(h).trim() && !st.mapping[i]) || !st.mapping.some(c => c === 'last' || c === 'full') ? 'open' : ''}><summary>Colonnes reconnues (${head.length}) — à corriger si besoin</summary>${mapTable(head, rows.slice(0, 30), st.mapping, IM().PEOPLE_FIELDS, 'ipp')}</details>
                    <label class="ip-inline">Liens (père, mère, conjoint)<select name="ip_linkby"><option value="auto">par le n° de la ligne, sinon par le nom</option><option value="id">par le n° de la ligne seulement</option><option value="name">par le nom seulement (« Pierre MARTIN »)</option></select></label>
                    <div class="ip-prev" data-ip-prev></div><div data-ip-issues></div><div data-ip-dupes></div>`;
                return {count: st.plan.persons.length, noun: 'personne', feminine: true, data: st, extra,
                    summaryHtml: `<b>${esc(plural(st.plan.persons.length, 'personne'))}</b>`,
                    onShow: body => {
                        wide(body);
                        const paint = async () => {
                            compute();
                            const p = st.plan, byK = new Map(p.persons.map(x => [x.k, x]));
                            const couples = p.families.filter(f => f.a && f.b).length, kids = p.families.reduce((n, f) => n + f.children.length, 0), events = p.persons.reduce((n, x) => n + Object.keys(x.events).length, 0) + p.families.filter(f => f.a && f.b && (f.date || f.place)).length;
                            setSummary(body, `Voilà ce qui va entrer : <b>${esc(plural(p.persons.length, 'fiche'))}</b>, ${esc(plural(events, 'événement'))}, ${esc(plural(couples, 'couple'))}, ${esc(plural(kids, 'lien parent → enfant', 'liens parent → enfant'))}${p.stats.formulas ? ` — ${esc(plural(p.stats.formulas, 'formule ignorée', 'formules ignorées'))}` : ''}.`);
                            const name = k => { const x = byK.get(k); return x ? IM().personText(x) : '?'; };
                            const readD = d => { const r = d && UI().readDate ? UI().readDate(d) : null; return r && !r.ok ? ` <span class="ip-warn" title="${esc(r.label || '')}">⚠️</span>` : ''; };
                            body.querySelector('[data-ip-prev]').innerHTML = `<table><thead><tr><th>Ligne</th><th>Personne</th><th>Naissance</th><th>Décès</th><th>Famille</th></tr></thead><tbody>${p.persons.slice(0, 12).map(x => {
                                const par = p.families.find(f => f.children.includes(x.k)), sp = p.families.filter(f => f.a === x.k || f.b === x.k).map(f => name(f.a === x.k ? f.b : f.a)).filter(n => n !== '?');
                                const b = x.events.BIRT || x.events.CHR, d = x.events.DEAT || x.events.BURI;
                                return `<tr><td>${x.row}</td><td><b>${esc(IM().personText(x))}</b>${x.sosa ? ` <span class="ui-badge is-sosa">${x.sosa}</span>` : ''}</td><td>${esc([b?.date, b?.place].filter(Boolean).join(', '))}${readD(b?.date)}</td><td>${esc([d?.date, d?.place].filter(Boolean).join(', '))}${readD(d?.date)}</td><td>${par ? `enfant de ${esc([par.a, par.b].filter(Boolean).map(name).join(' et '))}` : ''}${sp.length ? `${par ? ' · ' : ''}conjoint de ${esc(sp.join(', '))}` : ''}</td></tr>`;
                            }).join('')}</tbody></table>${p.persons.length > 12 ? `<p class="ui-hint">… et ${esc(plural(p.persons.length - 12, 'autre personne', 'autres personnes'))}.</p>` : ''}`;
                            body.querySelector('[data-ip-issues]').innerHTML = p.issues.length ? `<details class="ip-issues"><summary>⚠️ ${esc(plural(p.issues.length, 'remarque', 'remarques'))} sur les liens</summary><ul>${p.issues.slice(0, 40).map(i => `<li>Ligne ${i.row} : ${esc(i.text)}</li>`).join('')}</ul></details>` : '';
                            const g = goBtn(body); if (g) { g.textContent = `⤒ Importer ${plural(p.persons.length, 'personne')}`; g.disabled = !p.persons.length; }
                            const box = body.querySelector('[data-ip-dupes]');
                            box.innerHTML = UI().spinner ? UI().spinner('Je cherche si ces personnes sont déjà dans ta base…') : '';
                            try {
                                const c = await post('people_table_check', {persons: p.persons, families: p.families}); st.check = c;
                                const ks = Object.keys(c.candidates || {});
                                box.innerHTML = ks.length ? `<div class="ip-bar"><span class="ip-warn"><b>${esc(plural(ks.length, 'personne a', 'personnes ont'))} peut-être déjà une fiche</b> : « c’est la même personne ? »</span><span class="spacer"></span><button type="button" class="button small secondary" data-ip-all="same">Oui pour toutes</button><button type="button" class="button small secondary" data-ip-all="create">Créer quand même</button></div>
                                    <div class="ip-links-wrap"><table class="ip-links"><thead><tr><th>Ligne du tableau</th><th>Que faire ?</th></tr></thead><tbody>${ks.map(k => { const x = byK.get(k); return `<tr data-k="${esc(k)}"><td><b>${esc(IM().personText(x))}</b> ${esc(IM().yearsText(x))} <small>(ligne ${x.row})</small></td><td>${choiceCell(c.candidates[k], '?', `ipd_${k}`).replace('<option value="none">Ne rien faire</option>', '')}</td></tr>`; }).join('')}</tbody></table></div>` : (UI().notice?.('ok', 'Aucune de ces personnes ne semble déjà dans ta base.') || '');
                                bindChoices(box);
                                box.querySelector('.ip-bar')?.addEventListener('click', e => { const b = e.target.closest('[data-ip-all]'); if (b) setAll(box, s => b.dataset.ipAll === 'same' ? (s.querySelector('option[value^="c:"]')?.value || null) : 'create'); });
                            } catch (e) { box.innerHTML = UI().notice?.('error', e.message) || ''; }
                        };
                        body.querySelectorAll('[data-ip-col]').forEach(s => s.addEventListener('change', () => { st.mapping = readMapping(body, head.length); paint(); }));
                        body.querySelector('[name=ip_linkby]').addEventListener('change', e => { st.linkBy = e.target.value; paint(); });
                        paint();
                    }};
            },
            run: async (an, fs, body) => {
                const st = an.data, p = st.plan;
                if (!p.persons.length) throw new Error('aucune personne : choisis au moins la colonne du nom ou du prénom');
                const same = {}; const rows = [...body.querySelectorAll('[data-ip-dupes] tr[data-k]')];
                const undecided = rows.filter(tr => choiceOf(tr).mode === '?');
                if (undecided.length) { UI().fail?.(undecided[0].querySelector('select'), `⛔ ${plural(undecided.length, 'ligne', 'lignes')} à décider : « c’est la même personne ? »`); return {keepOpen: true}; }
                rows.forEach(tr => { const c = choiceOf(tr); if (c.mode === 'link') same[tr.dataset.k] = c.id; });
                const r = await post('people_table_import', {persons: p.persons, families: p.families, same, label: fs[0].name});
                undoToken = r.undo; await afterImport();
                if (r.skipped?.length) A().toast?.(`⚠️ ${r.skipped[0]}${r.skipped.length > 1 ? ` (et ${r.skipped.length - 1} autre${r.skipped.length > 2 ? 's' : ''})` : ''}`, 'error');
                return {message: `${[plural(r.created, 'fiche créée', 'fiches créées'), r.linked ? plural(r.linked, 'déjà dans la base', 'déjà dans la base') : '', plural(r.families, 'famille')].filter(Boolean).join(', ')}.`,
                    undo: async () => { await post('import_undo', {token: undoToken}); await afterImport(); }};
            }});
    }

    /* ═════════ 📚 Références RIS / BibTeX → sources ═════════ */
    async function readText(f) { const SHx = SH(); const buf = await fileBytes(f); return SHx?.decodeBytes ? SHx.decodeBytes(new Uint8Array(buf)).text : new TextDecoder().decode(buf); }
    function openSources({files} = {}) {
        if (!UI().openImportDialog) return;
        let undoToken = '';
        return UI().openImportDialog({title: 'Importer des références (RIS, BibTeX)', accept: '.ris,.bib,.txt,application/x-research-info-systems', what: 'RIS ou BibTeX', noun: 'source', feminine: true, files,
            intro: 'Les références exportées par Zotero, EndNote, Mendeley, JabRef, Gallica, un catalogue de bibliothèque… Chacune devient une source de ta base, prête à être citée sur une fiche. Une source déjà là (même titre, même auteur) n’est pas reprise.',
            analyze: async fs => {
                const text = await readText(fs[0]);
                const c = await post('sources_refs_import', {text, mode: 'check'});
                return {count: c.new, noun: 'source', feminine: true, data: {text}, ok: c.new > 0 ? undefined : false,
                    summaryHtml: c.new ? `<b>${esc(plural(c.new, 'source'))}</b> (fichier ${esc(c.format)})${c.dupes ? ` — ${esc(plural(c.dupes, 'déjà dans ta base, laissée', 'déjà dans ta base, laissées'))} de côté` : ''}` : `Rien de nouveau : ${esc(plural(c.dupes, 'référence est', 'références sont'))} déjà dans ta base.`,
                    preview: `<table><thead><tr><th>Titre</th><th>Auteur</th><th>Sorte</th><th>Date</th></tr></thead><tbody>${(c.preview || []).map(r => `<tr><td>${esc(r.title)}</td><td>${esc(r.author)}</td><td>${esc(r.type)}</td><td>${esc(r.publication)}</td></tr>`).join('')}</tbody></table>`};
            },
            run: async an => {
                const r = await post('sources_refs_import', {text: an.data.text, mode: 'run'}); undoToken = r.undo;
                return {message: `${plural(r.count, 'source importée', 'sources importées')}.`, undo: undoToken ? async () => { await post('import_undo', {token: undoToken}); } : null};
            }});
    }

    /* ═════════ 📍 Lieux depuis KML / GeoJSON ═════════ */
    const KIND = {same: ['✓ Déjà juste', ''], add: ['＋ Ajouter les coordonnées', 'is-add'], differ: ['↔ Remplacer les coordonnées', 'is-differ'], choose: ['? Plusieurs lieux de ce nom', 'is-choose'], create: ['＋ Créer le lieu', 'is-create']};
    function openGeo({files} = {}) {
        if (!UI().openImportDialog) return;
        let undoToken = '';
        return UI().openImportDialog({title: 'Importer des coordonnées de lieux (KML, GeoJSON)', accept: '.kml,.kmz,.geojson,.json', what: 'KML, KMZ ou GeoJSON', noun: 'lieu', many: 'lieux', files,
            intro: 'Un fichier de Google Earth, de uMap, de QGIS ou de ton cercle : chaque point est rapproché d’un lieu de ta base par son nom (et son département). Tu coches ligne par ligne : compléter les coordonnées, les remplacer, ou créer le lieu.',
            analyze: async fs => {
                let text;
                const buf = await fileBytes(fs[0]), u8 = new Uint8Array(buf);
                if (u8[0] === 0x50 && u8[1] === 0x4b) { const z = await SH().unzip(buf, {maxTotal: 60 * 1048576}); const name = z.names.find(n => /\.kml$/i.test(n)); if (!name) throw new Error('ce fichier .kmz ne contient pas de .kml'); text = await z.text(name); }
                else text = SH()?.decodeBytes ? SH().decodeBytes(u8).text : new TextDecoder().decode(u8);
                const a = await post('places_geo_analyse', {text});
                const todo = a.points.filter(p => p.kind !== 'same').length;
                const rows = a.points.map(p => {
                    const [label, cls] = KIND[p.kind];
                    const choose = p.kind === 'choose' ? `<select data-ip-place><option value="">— lequel ? —</option>${p.candidates.map(c => `<option value="${c.id}">${esc(c.title)}${c.km != null ? ` (à ${c.km.toLocaleString('fr-FR')} km)` : ' (sans coordonnées)'}</option>`).join('')}<option value="new">＋ Créer un lieu à part</option></select>` : '';
                    const where = [p.county, p.state, p.country].filter(Boolean).join(', ');
                    const cur = p.place_id ? p.candidates.find(c => c.id === p.place_id) : null;
                    return `<tr data-i="${p.i}" class="${cls}"><td><input type="checkbox" data-ip-on ${p.kind === 'same' ? 'disabled' : ['add', 'create'].includes(p.kind) ? 'checked' : ''} aria-label="Prendre cette ligne"></td><td><b>${esc(p.name)}</b>${where ? `<br><small>${esc(where)}</small>` : ''}</td><td>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</td><td>${esc(label)}${cur && p.kind === 'differ' ? `<br><small>aujourd’hui à ${cur.km.toLocaleString('fr-FR')} km de là</small>` : ''}${cur && p.kind !== 'differ' ? `<br><small>${esc(cur.title)}</small>` : ''}${choose}</td></tr>`;
                }).join('');
                const c = a.counts;
                const notices = [];
                if (a.ignored) notices.push({kind: 'info', text: `${plural(a.ignored, 'élément qui n’est pas un point (trait, zone) laissé', 'éléments qui ne sont pas des points (traits, zones) laissés')} de côté.`});
                if (a.invalid) notices.push({kind: 'warn', text: `${plural(a.invalid, 'point sans nom ou aux coordonnées impossibles laissé', 'points sans nom ou aux coordonnées impossibles laissés')} de côté.`});
                return {count: todo, noun: 'lieu', many: 'lieux', data: a, allowEmpty: false, notices,
                    summaryHtml: `${[c.add ? `<b>${esc(plural(c.add, 'lieu à compléter', 'lieux à compléter'))}</b>` : '', c.create ? `<b>${c.create} à créer</b>` : '', c.differ ? `${c.differ} avec d’autres coordonnées` : '', c.choose ? `${c.choose} à choisir` : '', c.same ? `${c.same} déjà ${c.same > 1 ? 'justes' : 'juste'}` : ''].filter(Boolean).join(', ')} (${esc(plural(a.points.length, 'lieu', 'lieux'))} dans le fichier ${esc(a.format)})`,
                    extra: `<div class="ip-bar"><span data-ip-n></span><span class="spacer"></span><button type="button" class="button small secondary" data-ip-geo="all">Tout cocher</button><button type="button" class="button small secondary" data-ip-geo="none">Tout décocher</button></div><div class="ip-links-wrap"><table class="ip-links ip-geo"><thead><tr><th></th><th>Lieu du fichier</th><th>Latitude, longitude</th><th>Dans ta base</th></tr></thead><tbody>${rows}</tbody></table></div>`,
                    onShow: body => {
                        wide(body);
                        const count = () => { const n = body.querySelectorAll('[data-ip-on]:checked').length; body.querySelector('[data-ip-n]').textContent = `${plural(n, 'ligne cochée', 'lignes cochées')}`; const g = goBtn(body); if (g) { g.textContent = `⤒ Importer ${plural(n, 'lieu', 'lieux')}`; g.disabled = !n; } };
                        body.addEventListener('change', e => { if (e.target.matches('[data-ip-place]')) { const tr = e.target.closest('tr'); tr.querySelector('[data-ip-on]').checked = !!e.target.value; } count(); });
                        body.querySelector('.ip-bar').addEventListener('click', e => { const b = e.target.closest('[data-ip-geo]'); if (!b) return; body.querySelectorAll('[data-ip-on]:not(:disabled)').forEach(x => { x.checked = b.dataset.ipGeo === 'all' && (x.closest('tr').querySelector('[data-ip-place]')?.value ?? 'ok') !== ''; }); count(); });
                        count();
                    }};
            },
            run: async (an, fs, body) => {
                const items = [];
                body.querySelectorAll('tr[data-i]').forEach(tr => {
                    if (!tr.querySelector('[data-ip-on]')?.checked) return;
                    const p = an.data.points[Number(tr.dataset.i)]; if (!p) return;
                    const sel = tr.querySelector('[data-ip-place]')?.value;
                    const id = p.kind === 'choose' ? (sel && sel !== 'new' ? Number(sel) : 0) : p.place_id || 0;
                    if (p.kind === 'create' || sel === 'new') items.push({action: 'create', name: p.name, county: p.county, state: p.state, country: p.country, lat: p.lat, lon: p.lon});
                    else if (id) items.push({action: 'update', place_id: id, lat: p.lat, lon: p.lon});
                });
                if (!items.length) throw new Error('coche au moins une ligne');
                const r = await post('places_geo_apply', {items}); undoToken = r.undo; await afterImport();
                return {message: `${[r.updated ? plural(r.updated, 'lieu complété', 'lieux complétés') : '', r.created ? plural(r.created, 'lieu créé', 'lieux créés') : ''].filter(Boolean).join(', ')}.`,
                    undo: async () => { await post('places_geo_undo', {token: undoToken}); await afterImport(); }};
            }});
    }

    ext.importPlus = {releves: openReleves, people: openPeople, sources: openSources, geo: openGeo};
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-import-plus]'); if (!b) return;
        e.preventDefault();
        const f = ext.importPlus[b.dataset.importPlus]; if (f) f({digestId: Number(b.dataset.digestId || 0) || 0});
    });

    /* Réglages → Import : un cadre avec les quatre imports */
    ext.importPlusPanel = () => `<section class="maintenance-panel" id="import-plus-panel">
        <h3 data-help="Des fichiers qui ne sont pas des arbres : les relevés d’un cercle, un tableau Excel de ta famille, des références de bibliographie, des lieux de Google Earth. Chacun est lu d’abord : tu vois ce qui va entrer, tu corriges les colonnes, et juste après, « ↶ Annuler » retire tout." data-help-faq="Nimègue">⤒ Relevés, tableaux, références, lieux</h3>
        <p>Chaque bouton ouvre la même fenêtre : déposer le fichier, voir ce qui va entrer (et le corriger), importer.</p>
        <div class="page-actions ip-panel-actions">
            <button type="button" class="button secondary" data-import-plus="releves" title="Nimègue (v2, v3), CSV d’un cercle, Excel, LibreOffice">📜 Relevés d’un cercle (Nimègue…)</button>
            <button type="button" class="button secondary" data-import-plus="people" title="Excel (.xlsx), LibreOffice (.ods), CSV : une ligne par personne">👥 Tableau de personnes</button>
            <button type="button" class="button secondary" data-import-plus="sources" title="Zotero, EndNote, JabRef, Mendeley…">📚 Références (RIS, BibTeX)</button>
            <button type="button" class="button secondary" data-import-plus="geo" title="Google Earth, uMap, QGIS…">📍 Coordonnées de lieux (KML, GeoJSON)</button></div>
        <p class="ui-hint">Pour aller dans l’autre sens : Réglages → Export (sources en RIS ou BibTeX, lieux en KML ou GeoJSON).</p></section>`;

    /* Réglages → Export : les sources en RIS et en BibTeX */
    ext.exportPanels.push(() => `<section class="maintenance-panel" id="h-export-sources"><h3 data-help="Toutes les sources de ta base, pour Zotero, EndNote, JabRef ou un traitement de texte : titre, auteurs, éditeur ou service d’archives, date, adresse, cote, notes. Les accents restent des accents." data-help-faq="BibTeX">⤓ Sources (RIS, BibTeX)</h3>
        <p>Les sources de ta base dans un fichier de bibliographie, à ouvrir dans Zotero, EndNote ou JabRef.</p>
        <div class="page-actions"><button type="button" class="button secondary" data-export-sources="ris">⤓ Exporter en RIS</button><button type="button" class="button secondary" data-export-sources="bib">⤓ Exporter en BibTeX</button></div></section>`);
    ext.afterExport.push(() => { document.querySelectorAll('[data-export-sources]').forEach(b => b.addEventListener('click', async () => { try { await ext.exportDownload?.('sources_export', {format: b.dataset.exportSources}, {noun: 'source', feminine: true}); } catch (e) { A().toast?.(e.message, 'error'); } })); });
})();
