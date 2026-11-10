/* LCNDA — 📚 Archives en ligne, 6e lot : bibliothèques numériques régionales, auteurs (IdRef, data.bnf.fr), Wikisource, gens de
 * mer, notaires de Paris, HisKi (Finlande), Old Bailey (Londres), et les sites PAYANTS (jamais mis en avant). Les écrans.
 * La recherche est la fenêtre commune de tous les lots (heritage-archives-en-ligne.js) : openSearch / openSettings / openPasteText
 * l’ouvrent déjà sur une rubrique de ce lot ; archives.extra y ajoute le quartier maritime d’un port et la lecture d’une cote.
 * L’app n’interroge jamais ces sites.
 *  - « Gratuites seulement » (coché au départ, partagé par la fenêtre commune et « Chercher sur internet ») : les payants sont cachés ; décoché, ils
 *    viennent à la fin, toujours avec la pastille « PAYANT » et une phrase claire.
 *  - « ⤒ Importer ce que tu as trouvé » (K13) : notice d’auteur (texte, page, .xml UNIMARC, .json), lignes HisKi, procès de
 *    l’Old Bailey, document d’une bibliothèque → média, source avec lien, événements proposés (cochés ou non), notice dans
 *    « Fiches en ligne » ; « c’est la même personne ? », rien d’écrasé, « ↶ Annuler » (H7), « À vérifier ».
 *    Notaires et marins : la fenêtre d’import du lot « Archives nationales, SHD » (heritage-sources-ouvertes-2.js) quand elle est là.
 * Entrées : blocs des profils (artiste, savant…) → IdRef / data.bnf, fiche d’un village et monographie (bibliothèque de la
 * région), « Chercher sur internet » (pastille PAYANT, « Gratuites seulement »), Réglages → Apparence.
 * Calculs purs : app-sources-ouvertes-6-core.js (LCNDA_SOURCES_OUVERTES_6). Serveur : lib/sources_ouvertes_6.php.
 * Mode d’emploi : docs/UI.md (« 🔍 Archives en ligne »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const S6 = () => window.LCNDA_SOURCES_OUVERTES_6;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const KEY = 'genealogie-sources-ouvertes-6-sites';
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} };
    const custom = () => { try { const o = JSON.parse(lsGet(KEY, '{}')); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    /** « Gratuites seulement » : un seul réglage pour toute l'app (coché au départ) */
    const freeOnly = () => lsGet(S6()?.FREE_KEY || 'genealogie-sources-gratuites', '1') !== '0';
    const setFreeOnly = on => { lsSet(S6().FREE_KEY, on ? '1' : '0'); document.querySelectorAll('[data-so6-free]').forEach(i => { i.checked = on; }); applyFree(document); };
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };
    const badge = (t, k, o) => UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${esc(k)}">${esc(t)}</span>`;
    const paidBadge = (partly = false, title = '') => partly ? badge('En partie payant', 'yellow', {title: title || 'Gratuit, sauf une partie qui demande un abonnement', cls: 'so6-paid'}) : badge('Payant', 'yellow', {title: title || 'Ce site demande un abonnement ou des crédits pour voir les documents', cls: 'so6-paid'});
    const ctxCache = new Map();
    const context = pid => { const k = Number(pid) || 0; if (!ctxCache.has(k)) ctxCache.set(k, api('so6_context', {person_id: k}).catch(e => { ctxCache.delete(k); throw e; })); return ctxCache.get(k); };
    const forget = pid => ctxCache.delete(Number(pid) || 0);
    const freeToggle = () => `<label class="ui-toggle so6-free"><input type="checkbox" data-so6-free ${freeOnly() ? 'checked' : ''}><i></i>Gratuites seulement</label>`;

    /* ═════ 🔍 Chercher et ⚙️ Adresses des sites : la fenêtre commune de tous les lots (heritage-archives-en-ligne.js) ═════ */
    /** la fenêtre commune, déjà sur une rubrique de ce lot ; placeOnly = la fiche d'un lieu (bibliothèques de sa région) */
    const openSearch = (o = {}) => ext.archives?.open({...o, lot: 6, group: o.group || undefined,
        place: o.placeOnly ? {name: o.place || '', id: Number(o.placeId) || 0, county: o.county || '', state: o.state || '', insee: o.insee || '', country: o.country || ''} : o.place || ''});
    const openSettings = onChange => ext.archives?.openSettings({lot: 6, onChange, mine: true});
    /** ce qu'une ligne de la fenêtre commune montre en plus pour un site de ce lot : le quartier maritime d'un port, la cote d'un notaire */
    function extra(e, p = {}, ctx = null) {
        const s = e?.lot === 6 ? S6()?.site(e.key) : null; if (!s) return '';
        let out = '';
        if (s.needs === 'port') {
            const m = S6().maritime(p.port);
            const ad = m && (ctx?.depts || []).find(d => d.code === m.dept);
            out += m ? `<small class="ui-hint so6-port">⚓ ${esc(m.text)}${ad?.url ? ` <a href="${esc(ad.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(ad.service || 'Archives départementales')} (${esc(ad.code)})</a>` : ''}</small>`
                : `<small class="ui-hint">${p.port ? `Je ne connais pas le port « ${esc(p.port)} » : choisis le port d’attache le plus proche dans la liste.` : 'Écris son port d’attache (Saint-Malo, Fécamp, Sète…) dans « Plus de précisions » pour savoir où sont ses registres.'}</small>`;
        }
        if (s.group === 'fr_notaires' && s.key === 'minutier') out += '<small class="ui-hint">Une cote comme « MC/ET/XLVIII/312 » se lit : étude 48 (en chiffres romains), article 312.</small>';
        return out;
    }

    /* ═════ ⤒ Importer ce qu'on a téléchargé ou copié (K13) ═════ */
    const KIND_LABEL = {auteur: '✍️ Notice d’auteur (IdRef, data.bnf)', hiski: '⛪ Actes HisKi (Finlande)', oldbailey: '⚖ Procès de l’Old Bailey', document: '📚 Document (bibliothèque, Wikisource…)'};
    const KIND_SITES = {auteur: ['idref', 'databnf'], hiski: ['hiski'], oldbailey: ['oldbailey'], document: ['numelyo', 'lectura', 'rosalis', 'memoirevive', 'normannia', 'yroise', 'wikisource', 'marins_shd', 'minutier', 'siv', 'scotlandspeople', 'ancestry', 'myheritage', 'filae', 'geneanet_premium']};
    const fld = (name, label, value = '', a = '') => `<label>${esc(label)}<input name="${esc(name)}" value="${esc(value ?? '')}" autocomplete="off" ${a}></label>`;
    const readText = f => f.arrayBuffer().then(b => window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(b)).text : new TextDecoder().decode(b));
    function fieldsHtml(kind, v) {
        if (kind === 'auteur') return `${fld('last', 'Nom', v.last)}${fld('first', 'Prénoms', v.first)}
            ${fld('birth_date', 'Naissance (date)', v.birth_date, 'data-ui-date placeholder="26 février 1802"')}${fld('birth_place', 'Lieu de naissance', v.birth_place)}
            ${fld('death_date', 'Mort (date)', v.death_date, 'data-ui-date')}${fld('death_place', 'Lieu de la mort', v.death_place)}
            ${fld('idref', 'Identifiant IdRef (PPN)', v.idref, 'placeholder="026927608"')}${fld('ark', 'Identifiant BnF (ark)', v.ark, 'placeholder="cb119079302"')}${fld('isni', 'ISNI', v.isni)}
            <label class="so-span-2">Ce que dit la notice (métier, œuvres…)<textarea name="note" rows="2">${esc(v.note || '')}</textarea></label>`;
        if (kind === 'oldbailey') return `${fld('ref', 'Référence du procès', v.ref, 'placeholder="t17800628-33"')}${fld('date', 'Date du procès', v.date, 'data-ui-date')}
            <label>Son rôle<select name="role">${Object.entries({accuse: 'Accusé', victime: 'Victime', temoin: 'Témoin'}).map(([k, l]) => `<option value="${k}" ${v.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${fld('offence', 'Crime (Offence)', v.offence_fr ? `${v.offence_fr}` : v.offence)}${fld('verdict', 'Verdict', v.verdict_fr || v.verdict)}${fld('punishment', 'Peine', v.punishment_fr || v.punishment)}`;
        if (kind === 'document') return `<label>Site<select name="site">${KIND_SITES.document.map(k => { const s = S6().site(k); return `<option value="${k}" ${v.site === k ? 'selected' : ''}>${esc(s.label)}${s.paid ? ' (payant)' : ''}</option>`; }).join('')}<option value="" ${!v.site ? 'selected' : ''}>Autre</option></select></label>
            ${fld('title', 'Titre du document', v.title, 'placeholder="Annuaire du Finistère, 1852"')}${fld('date', 'Date ou année', v.date)}${fld('page', 'Page, vue', v.page)}${fld('cote', 'Cote ou référence', v.cote)}`;
        return '';
    }
    function eventsOf(st) {
        const v = st.v, evs = [];
        if (st.kind === 'auteur') {
            if (v.birth_date || v.birth_place) evs.push({tag: 'BIRT', label: 'Naissance', date: v.birth_date || '', place: v.birth_place || '', note: ''});
            if (v.death_date || v.death_place) evs.push({tag: 'DEAT', label: 'Décès', date: v.death_date || '', place: v.death_place || '', note: ''});
        } else if (st.kind === 'oldbailey') {
            const desc = [v.offence && `Crime : ${v.offence}`, v.verdict && `verdict : ${v.verdict}`, v.punishment && `peine : ${v.punishment}`, v.ref && `réf. ${v.ref}`].filter(Boolean).join(' · ');
            evs.push({tag: 'EVEN', label: S6().ROLE_LABEL[v.role || 'accuse'] + ' à l’Old Bailey', date: v.date || '', place: 'Londres (Old Bailey)', note: desc});
        } else if (st.kind === 'hiski') {
            st.rows.forEach((r, i) => { if (st.picked.has(i)) S6().hiskiEvents(r).forEach(e => evs.push(e)); });
        }
        return evs;
    }
    function openImport(o = {}) {
        // notaires et gens de mer : la fenêtre du lot « Archives nationales, SHD » quand elle est là (même tables, même ↶ Annuler)
        const so2 = ext.sourcesOuvertes2;
        if ((o.kind === 'notaire' || o.kind === 'marin') && so2?.openImport && window.LCNDA_SOURCES_OUVERTES_2) return so2.openImport({personId: o.personId, kind: o.kind === 'notaire' ? 'minutier' : 'shd_marin'});
        const kind = KIND_LABEL[o.kind] ? o.kind : 'document';
        const st = {kind, pid: Number(o.personId) || 0, placeId: Number(o.placeId) || 0, placeName: o.placeName || '', ctx: null, file: null, link: o.link || '', text: o.text || '', v: {site: o.site || (o.kind === 'notaire' ? 'minutier' : o.kind === 'marin' ? 'marins_shd' : '')}, rows: [], picked: new Set(), evOn: new Set(), sheet: true, objUrl: '', preview: ''};
        const reparse = () => {
            if (st.kind === 'auteur' && st.text) Object.assign(st.v, Object.fromEntries(Object.entries(S6().parseAuthority(st.text)).filter(([k, x]) => x && !st.v[k])));
            if (st.kind === 'oldbailey' && st.text) Object.assign(st.v, Object.fromEntries(Object.entries(S6().parseOldBailey(st.text)).filter(([k, x]) => x && !st.v[k])));
            if (st.kind === 'hiski') { const r = S6().parseHisKi(st.text); st.rows = r.rows; st.rowsError = r.ok ? '' : r.error;
                const last = S6().fold(st.ctx?.person?.last || ''); st.picked = new Set(st.rows.map((x, i) => i).filter(i => last && S6().fold(st.rows[i].line).includes(last) && st.rows[i].tag !== 'MARR')); }
            const lk = S6().parseLink(st.link);
            if (lk.idref && !st.v.idref) st.v.idref = lk.idref; if (lk.ark && !st.v.ark) st.v.ark = lk.ark;
            if (lk.ref && !st.v.ref) { st.v.ref = lk.ref; st.v.date = st.v.date || lk.date; }
            if (lk.title && !st.v.title) st.v.title = lk.title;
            if (lk.site && st.kind === 'document' && KIND_SITES.document.includes(lk.site) && !o.site) st.v.site = lk.site;
            const evs = eventsOf(st); st.evOn = new Set(evs.map((e, i) => i).filter(i => evs[i].tag !== 'MARR'));
        };
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            const extn = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (f.size > 60 * 1048576) throw new Error('fichier trop gros (60 Mo au plus)');
            st.file = null; st.preview = '';
            if (o.textOnly) { st.preview = ''; }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extn)) { st.file = f; if (st.objUrl) URL.revokeObjectURL(st.objUrl); st.objUrl = URL.createObjectURL(f); st.preview = `<img src="${esc(st.objUrl)}" alt="Le document importé">`; }
            else if (extn === 'pdf') { st.file = f; st.preview = `<div class="so-pdf">📄 <b>${esc(f.name)}</b><br><small>Le PDF sera rangé dans les médias. Recopie à côté ce qu’il dit.</small></div>`; }
            else if (['html', 'htm', 'xml', 'json', 'rdf'].includes(extn)) {
                const raw = await readText(f); st.text = raw.slice(0, 2_000_000);
                const pg = window.LCNDA_SOURCES_OUVERTES?.parseSavedPage && /^htm/.test(extn) ? window.LCNDA_SOURCES_OUVERTES.parseSavedPage(raw) : null;
                if (pg) { st.link = st.link || pg.url; st.v.title = st.v.title || pg.title; }
                if (!o.kind) { if (/<record\b|idref|data\.bnf|dateOfBirth/i.test(raw)) st.kind = 'auteur'; else if (/oldbaileyonline|Reference Number:\s*t\d{8}/i.test(raw)) st.kind = 'oldbailey'; else if (/hiski|kastetut|haudatut/i.test(raw)) st.kind = 'hiski'; }
                st.preview = `<div class="so-pdf">🌐 <b>${esc(pg?.title || f.name)}</b><br><small>${/^htm/.test(extn) ? 'Page enregistrée : seul son texte est lu, la page elle-même n’est pas gardée.' : 'Fichier de notice : seules les informations reconnues sont reprises.'}</small></div>`;
                if (pg) st.text = pg.text || st.text;
            }
            else if (extn === 'txt') { st.file = null; st.text = st.text || await readText(f); st.preview = `<div class="so-pdf">📝 <b>${esc(f.name)}</b></div>`; }
            else throw new Error('ici : une image (JPG, PNG, WebP, GIF), un PDF, une page enregistrée (.html), une notice (.xml, .json) ou un texte (.txt)');
            if (!o.kind && st.kind === 'document' && st.text) { if (/Reference Number:\s*t\d{8}|was indicted/i.test(st.text)) st.kind = 'oldbailey'; else if (/kastetut|haudatut|döpta|begravda/i.test(st.text)) st.kind = 'hiski'; else if (/naissance\s*:|idref|data\.bnf|isni/i.test(st.text)) st.kind = 'auteur'; }
            const lk = S6().parseLink(st.link); if (!o.kind && lk.kind && KIND_LABEL[lk.kind]) st.kind = lk.kind;
            if (st.pid) { forget(st.pid); st.ctx = await context(st.pid).catch(() => null); }
            reparse();
            return {count: 1, noun: 'document', summaryHtml: `<b>un document</b> pour ${st.ctx?.person ? `<b>${esc([st.ctx.person.first, String(st.ctx.person.last || '').toUpperCase()].join(' '))}</b>` : st.placeId ? `le lieu <b>${esc(st.placeName)}</b>` : 'la fiche choisie ci-dessous'}`,
                notices: [{kind: 'warn', text: `${S6().MENTION}. Le document entre « À vérifier ».`}, {kind: 'info', text: 'Rien de la fiche n’est remplacé : une naissance ou un décès déjà notés sont gardés, et « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
                preview: `<div class="so-imp" data-so6-imp></div>`, onShow: body => { body.closest('dialog')?.classList.add('modal-l', 'so-import', 'so6-import'); bind(body); draw(body); }};
        };
        const read = body => {
            const box = body.querySelector('[data-so6-imp]'); if (!box) return st.v;
            box.querySelectorAll('.so-fields .so-grid [name]').forEach(i => { if (i.type !== 'checkbox' && !i.name.startsWith('so6_')) st.v[i.name] = i.value; });
            const lk = box.querySelector('[name=so6_link]'); if (lk) st.link = lk.value.trim();
            const tx = box.querySelector('[name=so6_text]'); if (tx) st.text = tx.value;
            const sh = box.querySelector('[name=so6_sheet]'); if (sh) st.sheet = sh.checked;
            const evOn = [...box.querySelectorAll('[data-so6-ev]')]; if (evOn.length) st.evOn = new Set(evOn.filter(i => i.checked).map(i => Number(i.dataset.so6Ev)));
            box.querySelectorAll('[data-so6-row]').forEach(i => { const n = Number(i.dataset.so6Row); if (i.checked) st.picked.add(n); else st.picked.delete(n); });
            return st.v;
        };
        let ecT = 0;
        const ecarts = body => {
            clearTimeout(ecT);
            ecT = setTimeout(async () => {
                const ul = body.querySelector('[data-so6-ecarts]'); if (!ul) return;
                if (!st.pid && !st.placeId) { ul.innerHTML = `<li class="so-ecart is-info">ℹ️ Choisis la fiche : l’app comparera le document avec elle.</li>`; return; }
                try {
                    const r = await post('so6_preview', payload(body));
                    ul.innerHTML = r.ecarts.length ? r.ecarts.map(e => `<li class="so-ecart is-${esc(e.level)}">${e.level === 'orange' ? '🟠' : e.level === 'yellow' ? '🟡' : 'ℹ️'} ${esc(e.text)}</li>`).join('') : `<li class="so-ecart is-ok">✓ Le nom, le prénom et les dates ne contredisent pas la fiche.</li>`;
                } catch (e) { ul.innerHTML = `<li class="so-ecart is-orange">⛔ ${esc(e.message)}</li>`; }
            }, 350);
        };
        const payload = body => {
            read(body); const evs = eventsOf(st);
            const site = st.kind === 'auteur' ? (S6().parseLink(st.link).site || (st.v.ark && !st.v.idref ? 'databnf' : 'idref')) : st.kind === 'document' ? (st.v.site || '') : st.kind;
            return {kind: st.kind, site, person_id: st.pid, place_id: st.pid ? 0 : st.placeId, url: S6().cleanUrl(st.link), fields: {...st.v}, text: st.text.slice(0, 20000), sheet: st.sheet,
                events: evs.filter((e, i) => st.evOn.has(i)), source_title: st.kind === 'document' && st.v.title ? st.v.title : ''};
        };
        const draw = body => {
            const box = body.querySelector('[data-so6-imp]'); if (!box) return;
            const evs = eventsOf(st); const has = st.ctx?.person ? (st.ctx.has_death ? ['DEAT'] : []) : [];
            const multi = st.kind === 'hiski';
            box.innerHTML = `<div class="so-imp-who">${st.placeId && !st.pid ? `<span class="pk-lab">Lieu</span> <b>📍 ${esc(st.placeName)}</b>` : st.ctx?.person && o.personId ? `<span class="pk-lab">Fiche</span> <b>${esc(st.ctx.person.first)} ${esc(String(st.ctx.person.last || '').toUpperCase())}</b>` : `<span class="pk-lab">À qui se rapporte ce document ?</span>${pickerField({name: 'so6_pid', kind: 'person', value: st.pid || null})}`}</div>
                <div class="segmented so-kinds" role="tablist" aria-label="Sorte de document">${Object.entries(KIND_LABEL).filter(([k]) => !(st.placeId && !st.pid) || k === 'document').map(([k, l]) => `<button type="button" class="${k === st.kind ? 'is-active' : ''}" aria-selected="${k === st.kind}" data-so6-kind="${k}">${esc(l)}</button>`).join('')}</div>
                <div class="so-imp-grid${st.preview ? '' : ' is-noimg'}">${st.preview ? `<div class="so-imp-img">${st.preview}</div>` : ''}
                    <div class="so-fields"><p class="so-imp-badge">${badge('À vérifier', 'yellow', {title: S6().MENTION})} <small class="muted">Recopie ce que dit le document ; laisse vide ce que tu ne sais pas.</small></p>
                    <div class="form-grid so-grid">${fieldsHtml(st.kind, st.v)}
                        <label class="so-span-2">Lien vers la notice ou la page<input name="so6_link" value="${esc(st.link)}" inputmode="url" placeholder="https://…" autocomplete="off"></label>
                        ${multi ? '' : `<label class="so-span-2">Texte copié (facultatif : gardé dans la source)<textarea name="so6_text" rows="3">${esc(st.text.slice(0, 20000))}</textarea></label>`}</div>
                    ${multi ? (st.rows.length ? `<fieldset class="so-props"><legend>Les actes trouvés : coche ceux qui sont les siens</legend><ul class="so6-rows">${st.rows.map((r, i) => `<li><label class="checkbox-line"><input type="checkbox" data-so6-row="${i}" ${st.picked.has(i) ? 'checked' : ''}><span><b>${esc({CHR: 'Baptême', BURI: 'Sépulture', MARR: 'Mariage', EVEN: 'Départ'}[r.tag] || r.tag)}</b> · ${esc(r.birth || r.death ? `${r.birth || r.death} → ${r.date}` : r.date)}${r.parish ? ` · ${esc(r.parish)}` : ''}<br><small class="muted">${esc(r.text)}</small></span></label></li>`).join('')}</ul></fieldset>`
                        : UI().notice('warn', st.rowsError || 'Colle le tableau des résultats de HisKi.')) : ''}
                    ${evs.length ? `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend>${evs.map((e, i) => { const dup = has.includes(e.tag) || (st.ctx?.birth && ['BIRT'].includes(e.tag) && st.ctx.birth.date);
                        return `<label class="checkbox-line"><input type="checkbox" data-so6-ev="${i}" ${e.tag === 'MARR' ? 'disabled' : st.evOn.has(i) && !dup ? 'checked' : ''}><span>${esc(e.label)}${e.date ? ` · ${esc(e.date)}` : ''}${e.place ? ` · ${esc(e.place)}` : ''}${e.tag === 'MARR' ? ' — un mariage se range dans la famille : il reste dans la source' : dup ? ' — déjà sur la fiche : gardé tel quel' : ''}</span></label>`; }).join('')}</fieldset>` : ''}
                    ${st.kind === 'auteur' ? `<label class="checkbox-line"><input type="checkbox" name="so6_sheet" ${st.sheet ? 'checked' : ''}><span>Ajouter le lien de la notice à ses « Fiches en ligne »</span></label>` : ''}
                    ${st.pid ? `<div class="so-ecarts-box"><h4>C’est la même personne ?</h4><ul class="so-ecarts" data-so6-ecarts></ul></div>` : '<ul class="so-ecarts" data-so6-ecarts hidden></ul>'}</div></div>`;
            ecarts(body);
        };
        const bind = body => {
            if (body._so6Bound) return; body._so6Bound = true;
            body.addEventListener('click', e => { const k = e.target.closest('[data-so6-kind]'); if (!k) return; read(body); st.kind = k.dataset.so6Kind; reparse(); draw(body); });
            body.addEventListener('input', e => { if (e.target.closest('.so-fields')) ecarts(body); });
            body.addEventListener('change', async e => {
                if (e.target.name === 'so6_pid') { st.pid = Number(e.target.value) || 0; read(body); st.ctx = null; if (st.pid) { forget(st.pid); st.ctx = await context(st.pid).catch(err => { toast(err.message, 'error'); return null; }); } reparse(); draw(body); return; }
                if (e.target.closest('.so-grid') && st.kind !== 'document') { read(body); const keep = new Set(st.evOn); draw(body); st.evOn = keep; }
                else if (e.target.closest('.so-fields')) ecarts(body);
            });
        };
        const run = async (an, files, body) => {
            const data = payload(body);
            const box = body.querySelector('[data-so6-imp]');
            if (!st.pid && !(st.placeId && st.kind === 'document')) { const f = box.querySelector('.so-imp-who .pk') || box.querySelector('.so-imp-who'); UI().fail?.(f, 'Choisis la fiche à qui se rapporte ce document.'); return {keepOpen: true}; }
            if (st.link && !S6().cleanUrl(st.link)) { UI().fail?.(box.querySelector('[name=so6_link]'), 'Le lien doit commencer par https:// (ou http://).'); return {keepOpen: true}; }
            if (!st.file && !data.url && !data.text.trim() && !data.events.length) { UI().fail?.(box.querySelector('[name=so6_link]'), 'Il faut un fichier, un lien, le texte du document ou au moins une ligne cochée.'); return {keepOpen: true}; }
            const fd = new FormData(); const csrf = A().state?.csrf || '';
            if (st.file) fd.append('file', st.file, st.file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const headers = {'X-CSRF-Token': csrf, Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})};
            const resp = await fetch('api.php?action=so6_import', {method: 'POST', body: fd, headers});
            const j = await resp.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!resp.ok || j.error) throw new Error(j.error || `Erreur ${resp.status}`);
            const r = j.result; forget(st.pid); if (st.objUrl) URL.revokeObjectURL(st.objUrl);
            window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed', {detail: r}));
            refresh();
            return {message: `${r.summary} — à vérifier sur le document.`, undo: async () => { await post('so6_undo', {batch: r.batch}); forget(st.pid); refresh(); }};
        };
        return UI().openImportDialog({title: 'Importer : bibliothèques, auteurs, HisKi, Old Bailey', accept: 'image/*,.pdf,.html,.htm,.txt,.xml,.json', what: 'image, PDF, page enregistrée, notice ou texte',
            intro: 'Ce que tu as téléchargé ou enregistré : une page en image ou en PDF, la page enregistrée par ton navigateur (« Enregistrer sous… »), la notice d’un auteur (IdRef : « Télécharger » en XML ou JSON), ou un texte copié (notice, procès de l’Old Bailey, tableau de résultats HisKi). Rien n’est demandé au site : seul ton fichier est lu. Pas de fichier ? « 🔗 Coller un lien » (avec ou sans le texte).',
            noun: 'document', analyze, run, files: o.files});
    }
    /** pas de fichier : le texte copié (ou le lien) → le seul « 🔗 Coller un lien » de l'app, qui revient à openImport */
    const openPasteText = (o = {}) => ext.archives?.openPaste({...o, lot: 6});

    /* ═════ Les boutons : « Chercher sur internet », blocs des profils, fiche d'un lieu, page Recherche ═════ */
    const btn = (pid, o = {}) => `<button type="button" class="button small secondary" data-so6-search="${esc(o.group || '')}" data-pid="${Number(pid) || 0}"${o.place ? ` data-place="${esc(o.place)}"` : ''}${o.placeOnly ? ' data-place-only="1"' : ''}${o.placeId ? ` data-place-id="${Number(o.placeId)}"` : ''}${o.county ? ` data-county="${esc(o.county)}"` : ''}${o.state ? ` data-state="${esc(o.state)}"` : ''}${o.insee ? ` data-insee="${esc(o.insee)}"` : ''}${o.country ? ` data-country="${esc(o.country)}"` : ''} title="${esc(o.title || 'Ouvre la recherche dans ton navigateur, nom et lieu déjà remplis')}">${esc(o.label || '📚 Bibliothèques, auteurs, marins, notaires…')}</button>`;
    const authorBtn = pid => btn(pid, {group: 'fr_auteurs', label: '✍️ IdRef · data.bnf (auteur)', title: 'Sa notice d’auteur à la BnF ou dans les universités : dates, lieux, autres noms. S’ouvre dans ton navigateur.'});
    const importBtn = (pid, kind = '') => `<button type="button" class="button small secondary" data-so6-import="${esc(kind)}" data-pid="${Number(pid) || 0}" title="Range le document trouvé, crée la source et propose ce qu’il dit">⤒ Importer…</button>`;
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so6-search]'); if (s) { e.preventDefault(); const d = s.dataset; openSearch({personId: Number(d.pid) || 0, group: d.so6Search || '', place: d.place || '', placeOnly: d.placeOnly === '1', placeId: Number(d.placeId) || 0, county: d.county || '', state: d.state || '', insee: d.insee || '', country: d.country || ''}); return; }
        const im = e.target.closest('[data-so6-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.so6Import || undefined, placeId: Number(im.dataset.placeId) || 0, placeName: im.dataset.place || ''}); return; }
        const pl = e.target.closest('[data-so6-paste]'); if (pl) { e.preventDefault(); openPasteText({personId: Number(pl.dataset.pid) || 0}); }
    });
    const AUTHOR_BLOCKS = ['artist_page', 'sciences', 'profiles'];
    /** la ligne « bibliothèque de la région » d'un lieu (fiche d'un village, monographie) */
    function placeRow(o) {
        const lib = S6().libraryFor(o); const cu = custom(); const p = {place: o.name};
        const links = lib.mine.map(s => `<a class="button small secondary" href="${esc(S6().url(s.key, p, cu))}" target="_blank" rel="noopener noreferrer" data-so6-go="${esc(s.key)}" title="${esc(s.note)}">📚 ${esc(s.label.split(' — ')[0])} ↗</a>`).join('');
        return `<p class="so-row so6-row so6-place" data-so6-region="${esc(lib.region?.key || '')}">${links}${btn(0, {group: 'fr_bn', place: o.name, placeOnly: true, placeId: o.placeId, county: o.county, state: o.state, insee: o.insee, country: o.country, label: lib.mine.length ? '📚 Autres bibliothèques…' : '📚 Livres et journaux sur ce lieu…'})}${o.placeId && !o.ro ? `<button type="button" class="button small secondary" data-so6-import="document" data-pid="0" data-place-id="${Number(o.placeId)}" data-place="${esc(o.name)}" title="Range la page trouvée et crée la source, reliées à ce lieu">⤒ Importer…</button>` : ''}${lib.region ? ` <small class="muted">${esc(lib.region.label)}</small>` : ''}</p>`;
    }
    function decorate(root = document) {
        const ws = root.querySelector?.('#workspace') || root; if (!ws?.querySelectorAll || !S6()) return;
        const cur = A()?.state?.currentPerson?.person; const pid = Number(cur?.id) || 0;
        const ro = document.body.classList.contains('is-kiosk') || Number(cur?.is_locked) === 1 || document.documentElement.classList.contains('ms-open');
        if (pid) {
            const blocks = AUTHOR_BLOCKS.map(k => ws.querySelector(`[data-pblock="${k}"]`)).filter(b => b && !b.querySelector('.so6-author'));
            if (blocks.length) context(pid).then(c => {
                if (!c?.is_author) return;
                blocks.forEach(card => { const b = card.querySelector('.card-body'); if (b && !card.querySelector('.so6-author')) b.insertAdjacentHTML('beforeend', `<p class="so-row so6-row so6-author">${authorBtn(pid)}${ro ? '' : importBtn(pid, 'auteur')}</p>`); });
            }).catch(() => {});
        }
        const village = ws.querySelector('.h-village:not([data-so6])');
        if (village) {
            village.dataset.so6 = '1';
            const name = (village.querySelector('.page-header h2, h2')?.textContent || '').trim().replace(/^[^\p{L}]+/u, '');
            const sub = village.querySelector('.page-header p, header p')?.textContent || '';
            const host = village.querySelector('[data-cpo-host]'); const cad = village.querySelector('[data-cad-insee]');
            const parts = sub.split(/[,·]/).map(x => x.trim()).filter(Boolean);
            const stats = village.querySelector('[data-vsec="stats"]');
            if (name && stats) stats.insertAdjacentHTML('afterend', placeRow({name, placeId: Number(host?.dataset.cpoPlace) || 0, county: parts[0] || '', state: parts[1] || '', country: parts[parts.length - 1] || '', insee: cad?.dataset.cadInsee || '', ro}));
        }
        const mono = ws.querySelector('[data-cpo-host].place-monograph-postcards:not([data-so6])');
        if (mono && !mono.closest('.h-village')) {
            mono.dataset.so6 = '1';
            const name = mono.dataset.cpoName || ''; const page = mono.closest('section.page') || ws;
            const sub = page.querySelector('.page-header p, header p')?.textContent || '';
            if (name) mono.insertAdjacentHTML('beforebegin', placeRow({name, placeId: Number(mono.dataset.cpoPlace) || 0, county: '', state: '', country: '', insee: '', ro, ...{text: sub}}).replace('data-so6-region', 'data-so6-mono data-so6-region'));
        }
        applyFree(ws);
    }

    /* ═════ « Chercher sur internet » : les nouveaux sites, la pastille PAYANT et « Gratuites seulement » ═════ */
    const prevExtra = ext.webSearchExtra;
    ext.webSearchExtra = () => [...(typeof prevExtra === 'function' ? (() => { try { return prevExtra() || []; } catch (_) { return []; } })() : []), ...(S6() ? S6().webSites(custom()) : [])];
    function addGroups() {
        const groups = A()?.webSearchGroups; if (!Array.isArray(groups)) return false;
        const at = Math.max(0, groups.indexOf('Autres'));
        S6().GROUPS.filter(g => g.id !== 'payant' && g.id !== 'fr_notaires').map(g => g.label).filter(l => !groups.includes(l)).reverse().forEach(l => groups.splice(at, 0, l));
        return true;
    }
    const PAID_TITLE = key => key === 'so6_scotlandspeople' ? 'Payant : voir un acte demande d’acheter des crédits' : 'Payant : abonnement pour voir la plupart des documents';
    /** les panneaux « Chercher sur internet » (fiche, widget, Recherche) : pastille et filtre ; jamais en premier */
    function applyFree(root = document) {
        if (!S6()) return;
        const free = freeOnly();
        root.querySelectorAll?.('.web-search-panel').forEach(panel => {
            const opts = panel.querySelector('.web-search-options') || panel.querySelector('.web-search-multi') || panel.querySelector('#wst-query');
            if (opts && !panel.querySelector('[data-so6-free]')) opts.insertAdjacentHTML(opts.classList.contains('web-search-options') ? 'beforeend' : 'beforebegin', `<div class="so6-free-line">${freeToggle()}<small class="muted" data-so6-free-count></small></div>`);
            let hidden = 0;
            panel.querySelectorAll('.web-search-site').forEach(sp => {
                const a = sp.querySelector('[data-ws-site]'); if (!a) return; const key = a.dataset.wsSite;
                const paid = S6().isPaidKey(key), partly = S6().PARTLY_PAID[key];
                if ((paid || partly) && !sp.querySelector('.so6-paid')) { a.insertAdjacentHTML('afterend', paidBadge(!paid, paid ? PAID_TITLE(key) : partly)); if (paid) { sp.classList.add('is-paid'); a.title = PAID_TITLE(key); } }
                if (!paid) return;
                const cb = sp.querySelector('[data-ws-pick], [data-ws-pick-off]');
                sp.hidden = free; if (free) hidden++;
                if (cb) { if (free) { cb.checked = false; if (cb.hasAttribute('data-ws-pick')) { cb.dataset.wsPickOff = cb.getAttribute('data-ws-pick'); cb.removeAttribute('data-ws-pick'); } } else if (cb.hasAttribute('data-ws-pick-off')) { cb.setAttribute('data-ws-pick', cb.dataset.wsPickOff); cb.removeAttribute('data-ws-pick-off'); } }
                const links = sp.parentElement; if (links && !free && sp !== links.lastElementChild && links.classList.contains('web-search-links')) links.appendChild(sp); // les payants à la fin de leur rubrique
            });
            panel.querySelectorAll('.web-search-group').forEach(g => { const all = g.querySelectorAll('.web-search-site'); if (!all.length) return; g.hidden = [...all].every(s => s.hidden); });
            const c = panel.querySelector('[data-so6-free-count]'); if (c) c.textContent = hidden ? `${hidden} site${hidden > 1 ? 's' : ''} payant${hidden > 1 ? 's' : ''} caché${hidden > 1 ? 's' : ''}` : '';
        });
        root.querySelectorAll?.('.web-search-editor').forEach(ed => {
            const list = ed.querySelector('.order-list'); if (!list) return;
            if (!ed.querySelector('[data-so6-free]')) list.insertAdjacentHTML('beforebegin', `<div class="so6-free-line">${freeToggle()}<small class="ui-hint">Décoche pour voir et ranger les sites payants (Ancestry, MyHeritage, Filae…).</small></div>`);
            list.querySelectorAll('.order-row').forEach(r => {
                const key = r.dataset.orderKey || '';
                const paid = S6().isPaidKey(key), partly = S6().PARTLY_PAID[key];
                if ((paid || partly) && !r.querySelector('.so6-paid')) (r.querySelector('b, strong, span') || r).insertAdjacentHTML('afterend', ' ' + paidBadge(!paid, partly || PAID_TITLE(key)));
                if (paid) { r.classList.add('is-paid'); r.hidden = free; }
            });
        });
    }
    document.addEventListener('change', e => { if (e.target.matches?.('[data-so6-free]') && !e.target.closest('dialog')) setFreeOnly(e.target.checked); });
    let decoT = 0;
    const watch = () => {
        const ws = document.getElementById('workspace'); if (!ws) return setTimeout(watch, 400);
        new MutationObserver(() => { clearTimeout(decoT); decoT = setTimeout(() => decorate(document), 80); }).observe(ws, {childList: true, subtree: true});
        new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.web-search-editor, .web-search-panel') || n.querySelector?.('.web-search-editor, .web-search-panel'))))) setTimeout(() => applyFree(document), 0); }).observe(document.body, {childList: true, subtree: true});
        decorate(document); applyFree(document);
    };
    const start = () => { if (!A() || !S6()) return setTimeout(start, 200); addGroups(); watch(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    ext.sourcesOuvertes6 = {openSearch, openImport, openPasteText, openSettings, btn, authorBtn, importBtn, placeRow, decorate, applyFree, context, freeOnly, setFreeOnly, archives: {extra}};
})();
