/* ⤓ Exports « en plus » (lib/echanges.php, lib/export_gramps.php) : Réglages → Export → « ⤓ Vers d’autres logiciels et sites »,
 * et « ⤓ Exporter ▾ » des listes Lieux (KML, GeoJSON) et Répertoire des vivants (vCard).
 *   🌐 Pour Geneanet (GEDCOM réglé pour Geneanet) · 🌳 Vers Gramps (.gramps) · 🔗 GEDCOM-X (FamilySearch) · 📅 Agenda des
 *   anniversaires (.ics) · 📇 Contacts (vCard) · 🗺 Lieux (KML Google Earth, GeoJSON).
 * Vie privée : comme le GEDCOM « pour partager » — vivants et fiches confidentielles anonymes, ou retirés.
 * Les imports RootsMagic (.rmtree) et Family Tree Maker (.ftm) passent par « ⤒ Importer un arbre » (lib/import_autres.php). */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['exportPanels', 'afterExport']) ext[key] = ext[key] || [];
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A().toast?.(m, k);
    const plural = (n, a, b) => A().plural ? A().plural(n, a, b) : `${n} ${n > 1 ? (b || a + 's') : a}`;

    /** Adresse d'un export (la généalogie de cette fenêtre, le mode confidentialité des Réglages). */
    function exportUrl(action, params = {}) {
        const url = new URL('api.php', location.href);
        url.searchParams.set('action', action);
        if (typeof window.LCNDA_GENEALOGY === 'string') url.searchParams.set('g', window.LCNDA_GENEALOGY);
        Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, String(v)); });
        try {
            const pv = JSON.parse(localStorage.getItem('genealogie-export-privacy') || '{}');
            if (pv.enabled) { url.searchParams.set('privacy', '1'); if (pv.deathCutoffYear) url.searchParams.set('death_cutoff_year', pv.deathCutoffYear); }
        } catch (_) {}
        return url.toString();
    }
    /** Télécharge un export ; une erreur du serveur devient un message (H7), le nombre exporté aussi. */
    async function download(action, params, {noun = 'élément', many = '', feminine = false, skippedText = ''} = {}) {
        const resp = await fetch(exportUrl(action, params), {credentials: 'same-origin'});
        if (!resp.ok) { let msg = 'Export impossible.'; try { msg = (await resp.json()).error || msg; } catch (_) {} throw new Error(msg); }
        const blob = await resp.blob();
        const cd = resp.headers.get('Content-Disposition') || '';
        const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'export';
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        const n = Number(resp.headers.get('X-LCNDA-Count') || 0), skipped = Number(resp.headers.get('X-LCNDA-Skipped') || 0);
        toast(`⤓ ${name}${n ? ` : ${plural(n, noun, many)}` : ''}${skipped && skippedText ? ` · ${skippedText(skipped)}` : ''}.`);
        return {name, n, skipped, blob};
    }
    ext.exportDownload = download; // pour les essais

    const shareBlock = (checked = true) => `<fieldset class="h-rc-modes"><legend>Vie privée</legend>
        <label class="checkbox-line"><input type="checkbox" name="share" ${checked ? 'checked' : ''}> Pour partager : cacher les vivants et les fiches confidentielles</label>
        <div data-living-mode><label class="checkbox-line"><input type="radio" name="living" value="anon" checked> Les garder anonymes (« Personne vivante » : sexe et liens familiaux seulement)</label>
        <label class="checkbox-line"><input type="radio" name="living" value="drop"> Les retirer du fichier</label></div>
        <p class="ui-hint">Vivants : sans décès noté et nés il y a moins de 100 ans. Rien d’autre d’eux ne part : ni dates, ni lieux, ni notes, ni photos.</p></fieldset>`;
    const bindShare = dl => { const s = dl.querySelector('[name=share]'), box = dl.querySelector('[data-living-mode]'); if (!s || !box) return; const sync = () => { box.hidden = !s.checked; }; s.addEventListener('change', sync); sync(); };
    const shareParams = form => ({share: form.elements.share?.checked === false ? '0' : '1', living: form.querySelector('[name=living]:checked')?.value || 'anon'});

    const FORMATS = {
        geneanet: {icon: '🌐', title: 'Pour Geneanet', what: 'GEDCOM réglé pour Geneanet',
            body: () => `<p>Un fichier GEDCOM 5.5.1 en UTF-8 prêt pour « Importer un fichier GEDCOM » de Geneanet : lieux au format de Geneanet (« [Lieu-dit] - Commune, code INSEE, département, région, pays »), photos en liens seulement (celles qui ont une adresse en ligne : Geneanet ne reçoit pas les fichiers), sans les balises propres à LCNDA.</p>
                <fieldset class="h-rc-modes"><legend>Les vivants et les fiches confidentielles (toujours cachés)</legend>
                <label class="checkbox-line"><input type="radio" name="living" value="anon" checked> Anonymes (« Personne vivante »), pour que les branches restent reliées</label>
                <label class="checkbox-line"><input type="radio" name="living" value="drop"> Retirés du fichier</label></fieldset>
                <label class="checkbox-line"><input type="checkbox" name="include_notes" checked> Notes</label><label class="checkbox-line"><input type="checkbox" name="include_sources" checked> Sources</label>`,
            run: form => download('export_gedcom', {target: 'geneanet', gedcom_version: '5.5.1', share: '1', living: form.querySelector('[name=living]:checked').value, include_living: '1', include_media: '1',
                include_notes: form.elements.include_notes.checked ? '1' : '0', include_sources: form.elements.include_sources.checked ? '1' : '0'}, {noun: 'fichier'})},
        gramps: {icon: '🌳', title: 'Vers Gramps', what: 'fichier .gramps',
            body: () => `<p>Un fichier <b>.gramps</b> (XML de Gramps 5, compressé) : personnes, familles, événements, lieux rangés par pays, région, département et commune avec leurs coordonnées, sources, citations, notes, étiquettes et témoins. Dans Gramps : « Famille → Importer… ». Les photos ne sont pas dans le fichier : seulement leur nom.</p>${shareBlock(false)}`,
            onOpen: bindShare, run: form => download('export_plus', {format: 'gramps', ...shareParams(form)}, {noun: 'personne', feminine: true})},
        gedcomx: {icon: '🔗', title: 'GEDCOM-X (FamilySearch)', what: 'JSON GEDCOM-X',
            body: () => `<p>Le format de FamilySearch, en JSON : personnes, liens de couple et de filiation (avec adoption), faits datés et placés, sources et lieux avec coordonnées.</p>${shareBlock(true)}`,
            onOpen: bindShare, run: form => download('export_plus', {format: 'gedcomx', ...shareParams(form)}, {noun: 'personne', feminine: true})},
        kml: {icon: '🗺', title: 'Lieux pour Google Earth (KML)', what: 'KML',
            body: () => `<p>Les lieux de ta généalogie sur un globe : un dossier par sorte d’événement (Naissance, Mariage, Décès…), un repère par lieu avec ses événements. Les lieux sans coordonnées sont laissés de côté.</p>${shareBlock(true)}`,
            onOpen: bindShare, run: form => download('export_plus', {format: 'kml', ...shareParams(form)}, {noun: 'lieu', many: 'lieux', skippedText: n => `${plural(n, 'lieu', 'lieux')} sans coordonnées laissé${n > 1 ? 's' : ''} de côté`})},
        geojson: {icon: '🗺', title: 'Lieux en GeoJSON', what: 'GeoJSON',
            body: () => `<p>Les lieux de ta généalogie en GeoJSON (QGIS, uMap, sites de cartes) : un point par lieu, avec le nombre d’événements de chaque sorte.</p>${shareBlock(true)}`,
            onOpen: bindShare, run: form => download('export_plus', {format: 'geojson', ...shareParams(form)}, {noun: 'lieu', many: 'lieux', skippedText: n => `${plural(n, 'lieu', 'lieux')} sans coordonnées laissé${n > 1 ? 's' : ''} de côté`})},
        vcard: {icon: '📇', title: 'Contacts (vCard)', what: 'vCard 4.0',
            body: () => `<p>Un fichier .vcf à ouvrir dans les Contacts de ton téléphone, de ton ordinateur ou de ta messagerie : adresses, e-mails et téléphones que tu as notés.</p>
                <fieldset class="h-rc-modes"><legend>Les contacts</legend>
                <label class="checkbox-line"><input type="checkbox" name="w_living" checked> 👪 Répertoire des vivants (cousins, famille)</label>
                <label class="checkbox-line"><input type="checkbox" name="w_archives" checked> 🏛 Services d’archives</label>
                <label class="checkbox-line"><input type="checkbox" name="w_dna" checked> 🧬 Cousins ADN</label>
                <label class="checkbox-line"><input type="checkbox" name="w_courriers" checked> ✉️ Correspondants (registre de courriers)</label></fieldset>`,
            run: form => { const which = ['living', 'archives', 'dna', 'courriers'].filter(k => form.elements['w_' + k].checked);
                if (!which.length) return UI().fail?.(form.elements.w_living, 'Coche au moins une sorte de contacts.') ?? false;
                return download('export_plus', {format: 'vcard', which: which.join(',')}, {noun: 'contact'}); }},
    };

    /** 📅 Agenda des anniversaires (.ics) : même fenêtre depuis le Calendrier de la famille et depuis Réglages → Export. */
    function openIcsExport() {
        const PK = window.LCNDA_PICKER;
        ext.openDialog({eyebrow: 'CALENDRIER', title: '⤓ Exporter les anniversaires (.ics)', submitLabel: '⤓ Exporter en .ics',
            body: `<p class="muted">Un fichier à ouvrir dans ton calendrier (Apple, Google, Outlook…) : chaque anniversaire revient tous les ans. Le réimporter plus tard met à jour sans créer de doublon. Les fiches confidentielles n’y sont jamais.</p>
                <fieldset class="h-rc-modes"><legend>Les personnes</legend>
                    <label class="checkbox-line"><input type="radio" name="who" value="sosa" checked> Mes ancêtres directs (numérotés Sosa)</label>
                    <label class="checkbox-line"><input type="radio" name="who" value="all"> Toute la base</label>
                    <label class="checkbox-line"><input type="radio" name="who" value="branch"> Une branche : une personne et tous ses descendants</label>
                    <div data-ics-branch hidden>${PK ? PK.pickerField({name: 'ics_root', kind: 'person', allowCreate: false}) : '<input name="ics_root">'}</div></fieldset>
                <fieldset class="h-rc-modes"><legend>Vivants ou tous</legend>
                    <label class="checkbox-line"><input type="radio" name="living" value="1"> Seulement les personnes en vie (sans décès noté)</label>
                    <label class="checkbox-line"><input type="radio" name="living" value="0" checked> Tout le monde</label></fieldset>
                <fieldset class="h-rc-modes"><legend>Les anniversaires</legend>
                    <label class="checkbox-line"><input type="checkbox" name="g_birth" checked> 👶 Naissances, baptêmes</label>
                    <label class="checkbox-line"><input type="checkbox" name="g_union" checked> 💍 Mariages</label>
                    <label class="checkbox-line"><input type="checkbox" name="g_death"> ✝️ Décès</label>
                    <label class="checkbox-line"><input type="checkbox" name="g_feast"> 🎉 Fêtes (saint du prénom)</label></fieldset>
                <label class="checkbox-line"><input type="checkbox" name="alarm" checked> Me le rappeler la veille</label>`,
            onOpen: dl => {
                const sync = () => { dl.querySelector('[data-ics-branch]').hidden = dl.querySelector('[name=who]:checked').value !== 'branch'; };
                dl.querySelectorAll('[name=who]').forEach(r => r.addEventListener('change', sync));
            },
            onSubmit: async form => {
                const who = form.querySelector('[name=who]:checked').value, groups = ['birth', 'union', 'death', 'feast'].filter(g => form.elements['g_' + g].checked);
                if (!groups.length) return UI().fail(form.elements.g_birth, 'Coche au moins une sorte d’anniversaire.');
                let root = 0;
                if (who === 'sosa') { root = Number(localStorage.getItem('genealogie-sosa-root')) || 0; if (!root) { toast('Aucune personne n°1 (Sosa) : choisis-la dans Réglages → Apparence.', 'error'); return false; } }
                if (who === 'branch') { root = Number(PK?.pickerValue?.(form.querySelector('[data-ics-branch] .pk')) || form.querySelector('[name=ics_root]')?.value || 0); if (!root) return UI().fail(form.querySelector('[data-ics-branch] .pk') || form.querySelector('[name=ics_root]'), 'Choisis la personne en haut de la branche.'); }
                try {
                    await download('export_plus', {format: 'ics', who, root_id: root || '', living: form.querySelector('[name=living]:checked').value, groups: groups.join(','), alarm: form.elements.alarm.checked ? '1' : '0'},
                        {noun: 'anniversaire', skippedText: n => `${plural(n, 'date laissée', 'dates laissées')} de côté (année seule ou date approchée : un calendrier a besoin du jour précis)`});
                } catch (e) { toast(e.message, 'error'); return false; }
            }});
    }
    ext.openIcsExport = openIcsExport;

    function openFormat(key) {
        if (key === 'ics') return openIcsExport();
        const f = FORMATS[key]; if (!f) return;
        ext.openDialog({eyebrow: 'EXPORTER · ' + f.what.toUpperCase(), title: `${f.icon} ${f.title}`, submitLabel: `⤓ Exporter`, body: f.body(), onOpen: f.onOpen,
            onSubmit: async form => { try { const r = await f.run(form); if (r === false) return false; } catch (e) { toast(e.message, 'error'); return false; } }});
    }
    ext.openExportFormat = openFormat;

    /* Réglages → Export : un cadre avec tous ces formats */
    const BUTTONS = [['geneanet', '🌐 Pour Geneanet', 'GEDCOM prêt pour Geneanet : vivants cachés, lieux au format Geneanet'], ['gramps', '🌳 Vers Gramps', 'Fichier .gramps'], ['gedcomx', '🔗 GEDCOM-X', 'JSON de FamilySearch'],
        ['ics', '📅 Agenda des anniversaires', 'Fichier .ics : naissances, mariages, décès, fêtes'], ['vcard', '📇 Contacts', 'vCard : cousins, archives, correspondants'], ['kml', '🗺 Lieux (KML)', 'Google Earth'], ['geojson', '🗺 Lieux (GeoJSON)', 'QGIS, uMap…']];
    ext.exportPanels.push(() => `<section class="maintenance-panel" id="h-export-plus"><h3 data-help="D’autres logiciels et sites lisent ta généalogie : Geneanet, Gramps, FamilySearch, ton agenda, tes contacts, Google Earth. Pour un fichier à partager, les vivants et les fiches confidentielles sont cachés comme dans le GEDCOM « pour partager »." data-help-faq="Geneanet">⤓ Vers d’autres logiciels et sites</h3>
        <p>Chaque bouton ouvre une petite fenêtre avec ses choix, puis télécharge le fichier.</p>
        <div class="page-actions h-export-plus-grid">${BUTTONS.map(([k, l, t]) => `<button type="button" class="button secondary" data-export-plus="${k}" title="${esc(t)}">${esc(l)}</button>`).join('')}</div>
        <p class="ui-hint">Pour importer : RootsMagic (.rmtree) est lu directement par « ⤒ Importer un arbre » (Réglages → Import). Family Tree Maker (.ftm) et Généatique : passe par leur export GEDCOM.</p></section>`);
    ext.afterExport.push(() => { document.querySelectorAll('[data-export-plus]').forEach(b => b.addEventListener('click', () => openFormat(b.dataset.exportPlus))); });

    /* « ⤓ Exporter ▾ » des listes (heritage-columns.js) : Lieux → KML, GeoJSON ; Répertoire des vivants → vCard */
    ext.listExportExtras = type => {
        if (type === 'places') return [{icon: '🗺', label: 'Pour Google Earth (KML)', help: 'un dossier par sorte d’événement', run: () => openFormat('kml')}, {icon: '🗺', label: 'En GeoJSON', run: () => openFormat('geojson')}];
        if (type === 'living_contacts') return [{icon: '📇', label: 'Contacts (vCard)', help: 'téléphone, ordinateur, messagerie', run: () => openFormat('vcard')}];
        return [];
    };
})();
