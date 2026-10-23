/* LCNDA — 🐾 📤 Suivi des animaux : partager et fusionner (serveur : lib/suivi_share.php).
 * Partager : une fiche, des animaux choisis, une espèce, un site ou tout le suivi → un fichier « .lcsuivi » (un ZIP fait par
 * le moteur commun LCNDA_SHEET.makeZip : suivi.json + medias/… + LISEZ-MOI.txt). Jamais les propriétaires ; les noms des
 * observateurs seulement si on coche la case.
 * Recevoir : la fenêtre « ⤒ Importer » (K13, 3 étapes) : « Voilà ce qui va entrer » (nouveaux animaux, lignes nouvelles,
 * doublons écartés, conflits) ; s'il y a des conflits, l'écran de fusion (même aspect que « Fusion de doublons » : merge-row,
 * « Garder le mien / Prendre le sien / Garder les deux », « Tout garder le mien / Tout prendre le sien », « N conflits
 * restants », « Fusionner ») ; puis le message H7 avec « ↶ Annuler » qui remet tout comme avant.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.suivi = ext.suivi || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER, X = () => window.LCNDA_SHEET;
    const U = () => ext.suivi.U;
    const esc = v => U().esc(v);
    const MAX_FILE = 200 * 1024 * 1024, MAX_JSON = 120 * 1024 * 1024;
    const SPECIES = ['oiseau', 'chat', 'chien', 'cheval', 'ferme', 'poisson', 'reptile', 'sauvage', 'marin', 'lapin', 'rongeur', 'autre'];

    /* ═════════ 📤 Partager ═════════ */
    async function openShare({scope = 'all', ids = [], species = '', site = 0} = {}) {
        if (U().RO()) return U().toast('Mode consultation : pas de partage.');
        const dlg = ext.openDialog({eyebrow: '🐾 SUIVI DES ANIMAUX', title: '📤 Partager le suivi', submitLabel: '📤 Partager',
            body: `<div class="sv-form sv-share"><p class="muted">Un fichier « .lcsuivi » à envoyer à quelqu’un qui a aussi l’app : il le reçoit avec « ⤒ Recevoir un suivi partagé ». Chaque animal et chaque observation y gardent un identifiant : chez l’autre, ce qui est déjà là est reconnu.</p>
                <fieldset class="sv-share-scope"><legend>Ce qu’on partage</legend>
                <label class="checkbox-line"><input type="radio" name="scope" value="pets" ${scope === 'pets' ? 'checked' : ''}> Des animaux choisis</label><div data-for="pets">${P().pickerField({name: 'ids', kind: 'pet', multiple: true, value: ids})}</div>
                <label class="checkbox-line"><input type="radio" name="scope" value="species" ${scope === 'species' ? 'checked' : ''}> Tous les animaux d’une espèce</label><div data-for="species" class="sv-obs-2"><select name="species" aria-label="Espèce"><option value="">—</option>${SPECIES.map(k => `<option value="${k}" ${species === k ? 'selected' : ''}>${esc(U().speciesIcon(k))} ${esc((ext.speciesLabel?.(k) || k).split(/[ ,(]/)[0])}</option>`).join('')}</select><input name="taxon" placeholder="Nom de l’espèce (facultatif) : Corneille noire…" maxlength="80"></div>
                <label class="checkbox-line"><input type="radio" name="scope" value="site" ${scope === 'site' ? 'checked' : ''}> Les animaux d’un site</label><div data-for="site">${P().pickerField({name: 'site', kind: 'tsite', value: site || null})}</div>
                <label class="checkbox-line"><input type="radio" name="scope" value="all" ${scope === 'all' ? 'checked' : ''}> Tout le suivi</label></fieldset>
                <fieldset><legend>Avec</legend>${UI().checkHtml('Les points GPS', {checked: true, attrs: 'name="gps"'})}${UI().checkHtml('Les photos et les sons', {checked: true, attrs: 'name="photos"'})}${UI().checkHtml('Les noms des observateurs, bagueurs et soigneurs (des personnes vivantes : à cocher seulement avec leur accord)', {checked: false, attrs: 'name="names"'})}</fieldset>
                <div class="sv-share-prev" data-prev aria-live="polite"></div></div>`,
            onSubmit: async form => {
                const q = params(form);
                if (q.scope === 'pets' && !q.ids) return UI().fail(form.querySelector('[data-for="pets"] .pk'), 'Choisis au moins un animal.');
                if (q.scope === 'site' && !q.site) return UI().fail(form.querySelector('[data-for="site"] .pk'), 'Choisis le site.');
                if (q.scope === 'species' && !q.species && !q.taxon) return UI().fail(form.elements.species, 'Choisis l’espèce.');
                const pkg = await U().api('suivi', {op: 'share', ...q});
                if (!pkg.animals?.length && !pkg.sites?.length && !pkg.free_observations?.length) { U().toast('Rien à partager avec ces choix.', 'error'); return false; }
                const files = [{name: 'suivi.json', data: JSON.stringify(pkg)}, {name: 'LISEZ-MOI.txt', data: `Suivi des animaux partagé depuis LCNDA le ${new Date().toLocaleDateString('fr-FR')}.\r\n${pkg.animals.length} animaux · ${pkg.animals.reduce((n, a) => n + a.observations.length, 0)} observations.\r\nPour l’ouvrir : dans l’app, Suivi des animaux → ⋯ → « ⤒ Recevoir un suivi partagé… ».\r\n`}];
                for (const m of pkg.media || []) { try { const r = await fetch(m.url); if (r.ok) files.push({name: m.file, data: new Uint8Array(await r.arrayBuffer())}); } catch (_) { /* un média absent : il reste dans le fichier sans image */ } }
                const blob = await X().makeZip(files, 'application/zip');
                const name = q.scope === 'pets' && pkg.animals.length === 1 ? pkg.animals[0].name : q.scope === 'species' ? (q.taxon || ext.speciesLabel?.(q.species) || q.species) : q.scope === 'site' ? 'site' : 'tout';
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (A().safeExportFilename ? A().safeExportFilename(`Suivi des animaux — ${name}`) : `Suivi des animaux - ${name}`) + '.lcsuivi'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
                U().toast(`📤 Fichier prêt : ${U().plural(pkg.animals.length, 'animal', 'animaux')}${pkg.names ? '' : ' (sans les noms des observateurs)'}.`, 'success');
            }});
        const form = dlg.querySelector('form');
        const show = () => { const sc = form.querySelector('[name="scope"]:checked')?.value; form.querySelectorAll('[data-for]').forEach(x => { x.hidden = x.dataset.for !== sc; }); };
        let timer = 0;
        const prev = () => { clearTimeout(timer); timer = setTimeout(async () => { const box = form.querySelector('[data-prev]'); try { const r = await U().api('suivi', {op: 'share', preview: 1, ...params(form)}); box.innerHTML = UI().notice('info', `${U().plural(r.animals, 'animal', 'animaux')} · ${U().plural(r.observations, 'observation')}${r.gps ? ` · ${U().fmtN(r.gps)} points GPS` : ''}${r.names?.length ? ` : ${r.names.join(', ')}${r.animals > r.names.length ? '…' : ''}` : ''}`); } catch (e) { box.innerHTML = UI().notice('error', e.message); } }, 250); };
        form.addEventListener('change', () => { show(); prev(); }); form.addEventListener('input', prev); form.addEventListener('picker-change', prev);
        show(); prev();
        return dlg;
    }
    function params(form) {
        const v = new FormData(form), sc = String(v.get('scope') || 'all');
        const pk = n => { const el = form.querySelector(`[data-for="${n}"] .pk`); return el ? P().pickerValue(el) : null; };
        return {scope: sc, ids: (pk('pets') || []).join?.(',') || '', species: String(v.get('species') || ''), taxon: String(v.get('taxon') || ''), site: Number(pk('site')) || 0, gps: v.get('gps') ? 1 : 0, photos: v.get('photos') ? 1 : 0, names: v.get('names') ? 1 : 0};
    }

    /* ═════════ ⤒ Recevoir (K13) ═════════ */
    async function readPackage(file) {
        if (file.size > MAX_FILE) throw new Error('Fichier trop gros (200 Mo au plus).');
        const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf);
        let text = '', zip = null;
        if (u8[0] === 0x50 && u8[1] === 0x4b) {
            zip = await X().unzip(buf, {maxTotal: 400 * 1024 * 1024, maxEntry: MAX_JSON});
            if (!zip.has('suivi.json')) throw new Error('Ce fichier n’est pas un suivi partagé (suivi.json manque).');
            text = await zip.text('suivi.json');
        } else { if (buf.byteLength > MAX_JSON) throw new Error('Fichier trop gros.'); text = new TextDecoder().decode(u8); }
        let pkg; try { pkg = JSON.parse(text); } catch (_) { throw new Error('Fichier abîmé : il ne se lit pas.'); }
        if (!pkg || pkg.format !== 'lcnda-suivi') throw new Error('Ce fichier n’est pas un suivi d’animaux partagé (format inconnu).');
        return {pkg, zip};
    }
    async function openReceive({files = null} = {}) {
        if (U().RO()) return U().toast('Mode consultation : rien à importer.');
        return UI().openImportDialog({title: 'Un suivi partagé', accept: '.lcsuivi,.zip,.json', files: files || undefined, noun: 'animal', many: 'animaux',
            text: '📁 Glisse ici le fichier « .lcsuivi », colle-le (⌘V) ou choisis-le', hint: 'Un suivi des animaux partagé depuis l’app (une fiche, une espèce, un site ou tout le suivi).',
            analyze: async fs => {
                const {pkg, zip} = await readPackage(fs[0]);
                const an = await U().write('share_analyze', {package: pkg});
                const s = an.summary;
                return {count: pkg.animals.length, noun: 'animal', many: 'animaux', data: {pkg, an, zip}, allowEmpty: true,
                    summaryHtml: `<b>${U().plural(s.animals_new, 'nouvel animal', 'nouveaux animaux')}</b>, ${U().plural(s.animals_match, 'animal déjà là', 'animaux déjà là')} (à compléter), <b>${U().plural(s.lines_new + s.free_new, 'ligne nouvelle', 'lignes nouvelles')}</b> (observations, marques, santé, groupes)${s.gps ? `, ${U().fmtN(s.gps)} points GPS` : ''}`,
                    notices: [...(s.lines_dup ? [{kind: 'info', text: `${U().plural(s.lines_dup, 'ligne déjà là, écartée', 'lignes déjà là, écartées')} (doublons exacts).`}] : []), ...(s.conflicts ? [{kind: 'warn', text: `${U().plural(s.conflicts, 'conflit')} : tu choisiras pour chacun, à l’étape suivante.`}] : [])],
                    preview: an.animals.slice(0, 12).map(a => `<div class="sv-row"><span class="sv-what">${esc(U().speciesIcon(a.species))} <b>${esc(a.name)}</b> ${a.status === 'match' ? `<small class="muted">= ${esc(a.target_title)} chez toi (reconnu par ${esc(a.match_by)})</small>` : ''}</span>${a.status === 'new' ? U().badge('Nouveau', 'blue') : a.fields.length || a.lines.some(l => l.status === 'conflict') ? U().badge('Conflits', 'yellow') : U().badge('À compléter', 'green')}</div>`).join(''),
                    goLabel: s.conflicts ? 'Comparer et fusionner…' : `⤒ Importer ${U().plural(pkg.animals.length, 'animal', 'animaux')}`};
            },
            run: async analysis => {
                const {pkg, an, zip} = analysis.data;
                if (an.summary.conflicts) { setTimeout(() => openMerge(pkg, an, zip), 50); return {message: ''}; }
                const r = await apply(pkg, an, {}, zip);
                return {message: `Suivi reçu : ${r.summary}`, undo: () => undo(r.receipt)};
            }});
    }
    async function uploadMedia(pkg, zip) {
        const map = {};
        if (!zip || !A().importMediaFile) return map;
        for (const m of pkg.media || []) {
            try { const b = await zip.read(m.file); if (!b) continue; const ext = m.file.split('.').pop().toLowerCase(); const type = /jpe?g/.test(ext) ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : /mp3/.test(ext) ? 'audio/mpeg' : /m4a/.test(ext) ? 'audio/mp4' : ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : ext === 'mp4' ? 'video/mp4' : 'video/webm';
                const it = await A().importMediaFile(new File([b], `${(m.title || m.key).slice(0, 80)}.${ext}`, {type}), ['image', 'audio', 'video']); if (it?.id) map[m.key] = it.id; } catch (e) { console.warn('média reçu non importé', e); }
        }
        return map;
    }
    async function apply(pkg, an, decisions, zip) {
        const media_map = await uploadMedia(pkg, zip);
        const r = await U().write('share_apply', {package: pkg, decisions, media_map, source: String(pkg.from || '').slice(0, 120)});
        U().refreshView();
        return r;
    }
    async function undo(receipt) { await U().write('share_undo', {receipt}); U().refreshView(); }

    /* ═════════ La fusion : comparer champ par champ, puis « Fusionner » ═════════ */
    function openMerge(pkg, an, zip) {
        const dec = {animals: {}};
        const keyOf = (a, i) => a.uuid || String(i);
        an.animals.forEach((a, i) => { dec.animals[keyOf(a, i)] = {mode: a.status === 'match' ? 'merge' : 'new', fields: {}, lines: {}}; a.lines.filter(l => l.status === 'conflict').forEach(l => { dec.animals[keyOf(a, i)].lines[l.uuid] = 'both'; }); });
        const withConf = an.animals.map((a, i) => ({a, i})).filter(({a}) => a.status === 'match' && (a.fields.length || a.lines.some(l => l.status === 'conflict')));
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l sv-merge';
        const left = () => withConf.reduce((n, {a, i}) => n + (dec.animals[keyOf(a, i)].mode === 'merge' ? a.fields.filter(f => !dec.animals[keyOf(a, i)].fields[f.field]).length : 0), 0);
        const radio = (name, v, cur, label) => `<label class="checkbox-line"><input type="radio" name="${esc(name)}" value="${v}" ${cur === v ? 'checked' : ''}> ${label}</label>`;
        const draw = () => {
            const n = left();
            dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">⤒ RECEVOIR · FUSIONNER</span><h2>Fusionner le suivi reçu</h2><p>Pour chaque différence : garde le tien, prends le sien, ou (pour une ligne) garde les deux.</p></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
                <div class="sv-merge-body"><div class="merge-summary maintenance-panel"><span><b data-left>${n}</b> ${n > 1 ? 'conflits restants' : 'conflit restant'}</span><span><b>${an.summary.animals_new}</b> nouveaux</span><span><b>${an.summary.lines_new + an.summary.free_new}</b> lignes nouvelles</span><span><b>${an.summary.lines_dup}</b> doublons écartés</span></div>
                <div class="merge-bulk"><button type="button" class="button small secondary" data-all="mine">Tout garder le mien</button><button type="button" class="button small secondary" data-all="theirs">Tout prendre le sien</button></div>
                <div class="merge-list">${withConf.map(({a, i}) => { const d = dec.animals[keyOf(a, i)], k = keyOf(a, i);
                    return `<section class="sv-merge-animal"><h3>${esc(U().speciesIcon(a.species))} ${esc(a.name)} <small class="muted">reçu · chez toi : ${esc(a.target_title)} (reconnu par ${esc(a.match_by)})</small></h3>
                        <div class="sv-tags">${radio(`mode-${k}`, 'merge', d.mode, 'Fusionner avec ma fiche')}${radio(`mode-${k}`, 'new', d.mode, 'En faire une nouvelle fiche')}${radio(`mode-${k}`, 'skip', d.mode, 'Ne pas le prendre')}</div>
                        ${d.mode !== 'merge' ? '' : a.fields.map(f => `<article class="merge-row merge-check"><div class="merge-incoming"><span class="eyebrow">${esc(f.label)}</span><small>Le mien : <b>${esc(f.mine)}</b></small><small>Le sien : <b>${esc(f.theirs)}</b></small></div><div class="merge-choice">${radio(`f-${k}-${f.field}`, 'mine', d.fields[f.field], `Garder le mien (« ${esc(f.mine)} »)`)}${radio(`f-${k}-${f.field}`, 'theirs', d.fields[f.field], `Prendre le sien (« ${esc(f.theirs)} »)`)}</div></article>`).join('')}
                        ${d.mode !== 'merge' ? '' : a.lines.filter(l => l.status === 'conflict').map(l => `<article class="merge-row merge-check"><div class="merge-incoming"><span class="eyebrow">${esc({obs: 'Observation modifiée', mark: 'Marque modifiée', health: 'Événement de santé modifié', member: 'Rôle dans le groupe'}[l.kind])}</span><small>Le mien : <b>${esc(l.mine)}</b></small><small>Le sien : <b>${esc(l.theirs)}</b></small></div><div class="merge-choice">${radio(`l-${k}-${l.uuid}`, 'mine', d.lines[l.uuid], 'Garder le mien')}${radio(`l-${k}-${l.uuid}`, 'theirs', d.lines[l.uuid], 'Prendre le sien')}${radio(`l-${k}-${l.uuid}`, 'both', d.lines[l.uuid], 'Garder les deux')}</div></article>`).join('')}</section>`; }).join('')}</div></div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="button" class="button" data-go ${n ? 'disabled' : ''} title="${n ? 'Choisis d’abord pour chaque conflit' : ''}">Fusionner</button></div>`;
        };
        dlg.addEventListener('change', e => {
            const r = e.target; if (r.type !== 'radio') return;
            const m = /^(mode|f|l)-(.+?)(?:-(.+))?$/.exec(r.name); if (!m) return;
            const k = Object.keys(dec.animals).find(x => r.name.startsWith(`${m[1]}-${x}`)); if (!k) return;
            const rest = r.name.slice(`${m[1]}-${k}`.length + 1);
            if (m[1] === 'mode') dec.animals[k].mode = r.value; else if (m[1] === 'f') dec.animals[k].fields[rest] = r.value; else dec.animals[k].lines[rest] = r.value;
            const y = dlg.querySelector('.sv-merge-body')?.scrollTop || 0; draw(); const b = dlg.querySelector('.sv-merge-body'); if (b) b.scrollTop = y;
        });
        dlg.addEventListener('click', async e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const all = e.target.closest('[data-all]');
            if (all) { withConf.forEach(({a, i}) => { const d = dec.animals[keyOf(a, i)]; a.fields.forEach(f => { d.fields[f.field] = all.dataset.all; }); a.lines.filter(l => l.status === 'conflict').forEach(l => { d.lines[l.uuid] = all.dataset.all; }); }); draw(); return; }
            const go = e.target.closest('[data-go]');
            if (go && !go.disabled) {
                go.disabled = true; go.textContent = 'Fusion…';
                try { const r = await apply(pkg, an, dec, zip); dlg.close(); A().undoToast(`Suivi reçu et fusionné : ${r.summary}`, {undo: () => undo(r.receipt), icon: '⤒'}); }
                catch (x) { go.disabled = false; go.textContent = 'Fusionner'; U().toast(x.message, 'error'); }
            }
        });
        dlg.addEventListener('close', () => dlg.remove());
        document.body.appendChild(dlg); draw(); dlg.showModal();
        return dlg;
    }

    Object.assign(ext.suivi, {openShare, openReceive, openMerge, readPackage});
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-sv-share], [data-sv-receive]'); if (!b) return;
        e.preventDefault();
        if (b.dataset.svReceive !== undefined) return openReceive();
        const id = Number(b.dataset.svShare) || 0;
        openShare(id ? {scope: 'pets', ids: [id]} : {scope: A().state.module === 'suivi' && A().currentDashboardPage?.()?.filter?.species ? 'species' : 'all', species: A().currentDashboardPage?.()?.filter?.species || ''});
    });
})();
