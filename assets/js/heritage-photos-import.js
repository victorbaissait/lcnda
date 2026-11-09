/* LCNDA — ⤒ Importer des photos (Google Photos, Apple Photos…) : Listes → Médias et documents → « ⤒ Importer des photos ».
 * La fenêtre unique d'import (K13 : déposer → « Voilà ce qui va entrer » → « ⤒ Importer N photos », puis « ↶ Annuler »).
 * Lecture : assets/js/app-photos-meta.js (LCNDA_PHOTOMETA : .json de Google Takeout, XMP / IPTC / EXIF d'Apple Photos et des
 * autres logiciels, ZIP borné, chemins « ../ » refusés). Rien ne part sur internet : les lieux sont cherchés dans la base et dans
 * les communes livrées (picker_search, « near » pour une position GPS), les personnes dans la base.
 * Envoi : les « traitements par lot » (lib/lots.php : lot_begin, lot_item en mode « new » avec description, date, lieu,
 * étiquettes et personnes confirmées, lot_undo pour « ↶ Annuler »).
 * Règle validée : un lieu ou une personne n'est relié que si on l'a confirmé (case cochée, ou choix fait à la main). */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const PK = () => window.LCNDA_PICKER;
    const META = () => window.LCNDA_PHOTOMETA;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, a, b) => A().plural ? A().plural(n, a, b) : `${n} ${n > 1 ? (b || a + 's') : a}`;
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const MAX_KEYS = 60; // lieux et personnes proposés au plus (au-delà : à choisir à la main)

    /** le premier lieu proposé pour un texte ou une position GPS (base d'abord, puis communes livrées) */
    async function suggestPlace(group) {
        try {
            const p = group.text ? {kind: 'place', q: group.text.split(',').slice(0, 2).join(' ').trim(), limit: 3} : {kind: 'place', near: `${group.lat},${group.lon}`, limit: 3};
            const r = await api('picker_search', p);
            for (const g of r.groups || []) { const it = (g.items || [])[0]; if (it && it.id && !it.free && (g.key !== 'world')) return it; }
        } catch (_) {}
        return null;
    }
    /** une personne de la base dont le nom ressemble beaucoup (proposée, jamais reliée sans confirmation) */
    async function suggestPerson(name) {
        try {
            const r = await api('picker_search', {kind: 'person', q: name, limit: 3, animals: '0'});
            const items = (r.groups || []).flatMap(g => g.items || []).filter(it => it.id);
            const want = fold(name).split(' ').filter(w => w.length > 1);
            return items.find(it => { const t = fold(it.title || it.name || ''); return want.length && want.every(w => t.includes(w)); }) || null;
        } catch (_) { return null; }
    }

    function rowHtml(kind, key, label, count, i) {
        const P = PK();
        return `<div class="h-phi-row" data-phi-${kind}="${esc(key)}" data-phi-i="${i}">
            <div class="h-phi-what"><b>${esc(label)}</b><span class="muted"> · ${esc(plural(count, 'photo'))}</span></div>
            <div class="h-phi-pick">${P ? P.pickerField({name: `phi_${kind}_${i}`, kind}) : ''}</div>
            <label class="checkbox-line h-phi-ok"><input type="checkbox" data-phi-ok> Relier</label>
            <p class="ui-hint" data-phi-hint></p></div>`;
    }

    async function analyze(files) {
        const M = META(); if (!M) throw new Error('Lecteur de photos absent : recharge la page.');
        const list = files.map(f => ({name: f.name, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer())}));
        const res = await M.collect(list);
        const items = res.items;
        if (!items.length) throw new Error(res.skipped.length ? `Aucune photo à importer : ${res.skipped.map(s => `${s.name} (${s.why})`).slice(0, 5).join(', ')}.` : 'Aucune photo ni vidéo trouvée (JPEG, PNG, WebP, GIF, AVIF, MP4, MOV).');
        // lieux : un par texte de lieu, sinon par position (≈ 1 km) ; personnes : un par nom
        const places = new Map(), people = new Map(), labels = new Map();
        items.forEach((it, idx) => {
            const m = it.meta, k = M.placeKey(m);
            if (k) { if (!places.has(k)) places.set(k, {key: k, text: m.placeText, lat: m.lat, lon: m.lon, items: []}); places.get(k).items.push(idx); }
            m.people.forEach(n => { const pk = fold(n); if (!people.has(pk)) people.set(pk, {key: pk, name: n, items: []}); people.get(pk).items.push(idx); });
            m.keywords.forEach(w => labels.set(w.toLowerCase(), w));
        });
        const pl = [...places.values()].sort((a, b) => b.items.length - a.items.length).slice(0, MAX_KEYS);
        const pe = [...people.values()].sort((a, b) => b.items.length - a.items.length).slice(0, MAX_KEYS);
        await Promise.all([...pl.map(async g => { g.sugg = await suggestPlace(g); }), ...pe.map(async g => { g.sugg = await suggestPerson(g.name); })]);
        const n = items.length, dated = items.filter(it => it.meta.taken).length, desc = items.filter(it => it.meta.description).length;
        const kinds = {google: items.filter(it => it.meta.from.includes('Google Photos')).length, meta: items.filter(it => it.meta.from.some(f => f !== 'Google Photos')).length};
        const thumbs = items.slice(0, 8).map(it => { const img = /\.(jpe?g|png|webp|gif|avif)$/i.test(it.name); const url = img ? URL.createObjectURL(new Blob([it.bytes])) : '';
            return `<tr><td>${img ? `<img src="${url}" alt="" class="h-phi-thumb">` : '<span class="h-phi-thumb">🎬</span>'}</td><td><b>${esc(it.meta.title)}</b><br><span class="muted">${esc([it.meta.dateText, it.meta.placeText || (it.meta.lat != null ? '📍 position GPS' : '')].filter(Boolean).join(' · '))}</span>${it.meta.description ? `<br>${esc(it.meta.description.slice(0, 120))}` : ''}</td></tr>`; }).join('');
        const lab = [...labels.values()];
        const notices = [{kind: 'info', text: 'Tout est lu sur cet ordinateur : rien n’est envoyé sur internet. Un lieu ou une personne n’est relié que si tu le confirmes (case « Relier »).'}];
        if (res.skipped.length) notices.push({kind: 'warn', text: `${plural(res.skipped.length, 'fichier laissé', 'fichiers laissés')} de côté : ${res.skipped.slice(0, 6).map(s => `${s.name} (${s.why})`).join(', ')}${res.skipped.length > 6 ? '…' : ''}.`});
        if (places.size > MAX_KEYS || people.size > MAX_KEYS) notices.push({kind: 'warn', text: `Beaucoup de lieux ou de noms : seuls les ${MAX_KEYS} plus fréquents sont proposés ici.`});
        const extra = `<div class="h-phi">
            <section class="h-phi-sec"><h4>📝 Ce qu’on reprend</h4>
                <label class="checkbox-line"><input type="checkbox" name="phi_desc" checked> Les descriptions (${esc(plural(desc, 'photo'))})</label>
                <label class="checkbox-line"><input type="checkbox" name="phi_date" checked> La date de prise de vue (${esc(plural(dated, 'photo'))})</label>
                ${lab.length ? `<label class="checkbox-line"><input type="checkbox" name="phi_labels" checked> Les mots-clés et albums en étiquettes (${esc(lab.slice(0, 6).join(', '))}${lab.length > 6 ? '…' : ''})</label>` : ''}</section>
            ${pl.length ? `<section class="h-phi-sec"><h4>📍 Lieux trouvés — à confirmer</h4><p class="ui-hint">Le lieu proposé vient de ta base ou des communes livrées avec l’app. Vérifie-le, change-le si besoin, puis coche « Relier ».</p>${pl.map((g, i) => rowHtml('place', g.key, g.text || `Position ${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}`, g.items.length, i)).join('')}</section>` : ''}
            ${pe.length ? `<section class="h-phi-sec"><h4>👤 Personnes nommées — à confirmer</h4><p class="ui-hint">Les noms donnés dans Google Photos ou Apple Photos. Choisis la bonne fiche et coche « Relier » : rien n’est relié sans toi.</p>${pe.map((g, i) => rowHtml('person', g.key, g.name, g.items.length, i)).join('')}</section>` : ''}
            <p class="ui-hint" data-phi-progress></p></div>`;
        return {count: n, noun: 'photo', feminine: true, data: {items, pl, pe, lab},
            summaryHtml: `<b>${esc(plural(n, 'photo'))}</b>${kinds.google ? (kinds.google < n ? ` (dont ${esc(String(kinds.google))} de Google Photos)` : ' de Google Photos') : ''}${dated ? `, ${esc(plural(dated, 'date', 'dates'))}` : ''}${places.size ? `, ${esc(plural(places.size, 'lieu', 'lieux'))}` : ''}${people.size ? `, ${esc(plural(people.size, 'personne nommée', 'personnes nommées'))}` : ''}`,
            notices, preview: `<table class="h-phi-prev"><tbody>${thumbs}</tbody></table>${n > 8 ? `<p class="muted">… et ${esc(plural(n - 8, 'autre photo', 'autres photos'))}.</p>` : ''}`, extra,
            goLabel: `⤒ Importer ${plural(n, 'photo')}`,
            onShow: body => bindRows(body, pl, pe)};
    }

    /** pré-remplit chaque ligne avec la proposition (non cochée) ; un choix fait à la main coche « Relier » */
    function bindRows(body, pl, pe) {
        const P = PK();
        const bind = (kind, groups) => groups.forEach((g, i) => {
            const row = body.querySelector(`[data-phi-${kind}][data-phi-i="${i}"]`); if (!row) return;
            const field = row.querySelector('.pk'), ok = row.querySelector('[data-phi-ok]'), hint = row.querySelector('[data-phi-hint]');
            if (g.sugg && P?.pickerSet && field) { P.pickerSet(field, g.sugg); hint.textContent = kind === 'person' ? 'Proposé d’après le nom : à vérifier.' : 'Proposé d’après le nom du lieu ou la position : à vérifier.'; }
            else hint.textContent = kind === 'place' ? 'Rien de proche trouvé : choisis le lieu, ou laisse vide.' : 'Aucune fiche à ce nom : choisis-la, ou laisse vide.';
            row.addEventListener('picker-change', () => { const v = P?.pickerValue?.(field); ok.checked = !!(v && /^\d+$/.test(String(v))); hint.textContent = ok.checked ? 'Choisi : sera relié.' : ''; });
        });
        bind('place', pl); bind('person', pe);
    }

    async function run(an, files, body) {
        const {items, pl, pe} = an.data, P = PK();
        const chosen = (kind, groups) => { const out = new Map();
            groups.forEach((g, i) => { const row = body.querySelector(`[data-phi-${kind}][data-phi-i="${i}"]`); if (!row?.querySelector('[data-phi-ok]')?.checked) return;
                const v = Number(P?.pickerValue?.(row.querySelector('.pk')) || 0); if (v > 0) out.set(g.key, v); });
            return out; };
        const placeOf = chosen('place', pl), personOf = chosen('person', pe);
        const withDesc = !!body.querySelector('[name=phi_desc]')?.checked, withDate = !!body.querySelector('[name=phi_date]')?.checked, withLabels = !!body.querySelector('[name=phi_labels]')?.checked;
        const prog = body.querySelector('[data-phi-progress]');
        const csrf = A().state?.csrf || '';
        const token = (await post('lot_begin', {count: items.length, name: 'Import de photos'})).result.token;
        let ok = 0; const errors = [];
        for (const it of items) {
            const m = it.meta, M = META();
            const fd = new FormData();
            fd.append('csrf', csrf); fd.append('token', token); fd.append('mode', 'new'); fd.append('name', it.name); fd.append('title', m.title);
            fd.append('file', new Blob([it.bytes]), it.name);
            if (withDesc && m.description) fd.append('description', m.description);
            if (withDate && m.taken) { fd.append('date_text', m.dateText); fd.append('taken', m.taken); }
            if (m.lat != null && m.lon != null) { fd.append('geo_lat', String(m.lat)); fd.append('geo_lon', String(m.lon)); }
            const pk = M.placeKey(m); if (pk && placeOf.has(pk)) fd.append('place_id', String(placeOf.get(pk)));
            const pids = [...new Set(m.people.map(n => personOf.get(fold(n))).filter(Boolean))]; if (pids.length) fd.append('person_ids', pids.join(','));
            if (withLabels && m.keywords.length) fd.append('label_names', m.keywords.join('\n'));
            try {
                const r = await fetch('api.php?action=lot_item', {method: 'POST', body: fd, headers: {'X-CSRF-Token': csrf}});
                const j = await r.json().catch(() => ({}));
                if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
                ok++;
            } catch (e) { errors.push(`${it.name} : ${e.message}`); }
            if (prog) prog.textContent = `${ok + errors.length} / ${items.length}…`;
        }
        window.dispatchEvent(new CustomEvent('lcnda:data-changed', {detail: {action: 'media_import'}}));
        try { ext.refreshView?.(); } catch (_) {}
        if (!ok) throw new Error(errors.slice(0, 3).join(' ; ') || 'Aucune photo n’a pu entrer.');
        const linked = [placeOf.size ? plural(placeOf.size, 'lieu relié', 'lieux reliés') : '', personOf.size ? plural(personOf.size, 'personne reliée', 'personnes reliées') : ''].filter(Boolean).join(', ');
        return {message: `${plural(ok, 'photo importée', 'photos importées')}${linked ? ` (${linked})` : ''}${errors.length ? ` ; ${plural(errors.length, 'refusée', 'refusées')} : ${errors.slice(0, 2).join(' ; ')}` : ''}.`,
            kind: errors.length ? 'error' : '',
            undo: async () => { await post('lot_undo', {token}); try { ext.refreshView?.(); } catch (_) {} }};
    }

    function openPhotosImport(files) {
        if (!UI().openImportDialog) return;
        return UI().openImportDialog({title: 'Importer des photos (Google Photos, Apple Photos…)', multiple: true, files,
            accept: '.zip,.jpg,.jpeg,.png,.webp,.gif,.avif,.mp4,.mov,.json,.xmp,.heic,.heif',
            what: 'ZIP de Google Takeout, ou photos avec leurs .json / .xmp',
            intro: 'Google Photos : l’archive .zip de Google Takeout (les fichiers .json à côté de chaque photo donnent la date, le lieu, la description et les personnes nommées). Apple Photos : les photos exportées avec « Titre, mots-clés et légende » et « Informations de lieu » (ou avec leurs fichiers .xmp). Les autres logiciels qui écrivent XMP, IPTC ou EXIF aussi.',
            analyze, run});
    }
    ext.openPhotosImport = openPhotosImport;
    ext.photosImportInternals = {analyze, run, suggestPlace, suggestPerson};
})();
