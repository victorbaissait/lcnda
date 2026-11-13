/* ⤓ Exports « en plus » (lib/echanges.php, lib/export_gramps.php) : Réglages → Export → « ⤓ Vers d’autres logiciels et sites »,
 * et « ⤓ Exporter ▾ » des listes Lieux (KML, GeoJSON) et Répertoire des vivants (vCard).
 *   🌐 Pour Geneanet (GEDCOM réglé pour Geneanet) · 🌳 Vers Gramps (.gramps, ou paquet .gpkg avec les photos) · 📦 GedZip avec les photos ·
 *   🔗 GEDCOM-X (FamilySearch) · 📅 Agenda des
 *   anniversaires (.ics) · 📇 Contacts (vCard) · 🗺 Lieux (KML Google Earth, GeoJSON) · 🗒 Obsidian (ZIP de notes Markdown) ·
 *   🕸 Réseau familial (GraphML pour Gephi / yEd, DOT pour Graphviz) — lib/echanges_reseau.php.
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

    /* Qui part dans le fichier : toute la base, les ancêtres Sosa, ou une branche (menu de choix des personnes) */
    const scopeBlock = () => { const PK = window.LCNDA_PICKER;
        return `<fieldset class="h-rc-modes"><legend>Les personnes</legend>
        <label class="checkbox-line"><input type="radio" name="scope" value="all" checked> Toute la base</label>
        <label class="checkbox-line"><input type="radio" name="scope" value="sosa"> Mes ancêtres directs (numérotés Sosa)</label>
        <label class="checkbox-line"><input type="radio" name="scope" value="branch"> Une branche</label>
        <div data-scope-branch hidden>${PK ? PK.pickerField({name: 'scope_root', kind: 'person', allowCreate: false}) : '<input name="scope_root">'}
            <label class="checkbox-line"><input type="radio" name="branch_mode" value="descendants" checked> Cette personne et ses descendants</label>
            <label class="checkbox-line"><input type="radio" name="branch_mode" value="ascendants"> Cette personne et ses ancêtres</label></div></fieldset>`; };
    const familiesBlock = () => `<label class="checkbox-line"><input type="checkbox" name="families"> Ajouter un point par famille (couple) entre les parents et les enfants</label>`;
    const bindScope = dl => { const sync = () => { const box = dl.querySelector('[data-scope-branch]'); if (box) box.hidden = dl.querySelector('[name=scope]:checked')?.value !== 'branch'; }; dl.querySelectorAll('[name=scope]').forEach(r => r.addEventListener('change', sync)); sync(); };
    const scopeParams = form => {
        const scope = form.querySelector('[name=scope]:checked')?.value || 'all', PK = window.LCNDA_PICKER;
        if (scope === 'sosa') return {scope, root_id: Number(localStorage.getItem('genealogie-sosa-root')) || ''};
        if (scope !== 'branch') return {scope};
        const field = form.querySelector('[data-scope-branch] .pk') || form.querySelector('[name=scope_root]');
        const id = Number(PK?.pickerValue?.(field) || form.querySelector('[name=scope_root]')?.value || 0);
        if (!id) { UI().fail?.(field, 'Choisis la personne de la branche.'); return null; }
        return {scope, branch_person: id, branch_mode: form.querySelector('[name=branch_mode]:checked')?.value || 'descendants'};
    };

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
        gedzip: {icon: '📦', title: 'GedZip avec les photos', what: 'GedZip (GEDCOM 7 + médias)',
            body: () => `<p>Un seul fichier <b>.gdz</b> (un zip) : ta généalogie en GEDCOM 7 et, à côté, les fichiers des photos, actes et sons reliés aux fiches (dossier « media »). Il se rouvre dans les logiciels qui lisent GedZip, et ici par « ⤒ Importer un arbre ».</p>${shareBlock(true)}<div data-paquet-size aria-live="polite"></div>`,
            onOpen: dl => paquetOpen(dl, 'gedzip'), run: form => paquetRun(form, 'gedzip')},
        gpkg: {icon: '🌳', title: 'Paquet Gramps avec les photos', what: 'paquet Gramps .gpkg',
            body: () => `<p>Un paquet <b>.gpkg</b> : le fichier Gramps et, avec lui, les fichiers des photos et documents reliés aux fiches. Dans Gramps : « Famille → Importer… ».</p>${shareBlock(true)}<div data-paquet-size aria-live="polite"></div>`,
            onOpen: dl => paquetOpen(dl, 'gpkg'), run: form => paquetRun(form, 'gpkg')},
        kml: {icon: '🗺', title: 'Lieux pour Google Earth (KML)', what: 'KML',
            body: () => `<p>Les lieux de ta généalogie sur un globe : un dossier par sorte d’événement (Naissance, Mariage, Décès…), un repère par lieu avec ses événements. Les lieux sans coordonnées sont laissés de côté.</p>${shareBlock(true)}`,
            onOpen: bindShare, run: form => download('export_plus', {format: 'kml', ...shareParams(form)}, {noun: 'lieu', many: 'lieux', skippedText: n => `${plural(n, 'lieu', 'lieux')} sans coordonnées laissé${n > 1 ? 's' : ''} de côté`})},
        geojson: {icon: '🗺', title: 'Lieux en GeoJSON', what: 'GeoJSON',
            body: () => `<p>Les lieux de ta généalogie en GeoJSON (QGIS, uMap, sites de cartes) : un point par lieu, avec le nombre d’événements de chaque sorte.</p>${shareBlock(true)}`,
            onOpen: bindShare, run: form => download('export_plus', {format: 'geojson', ...shareParams(form)}, {noun: 'lieu', many: 'lieux', skippedText: n => `${plural(n, 'lieu', 'lieux')} sans coordonnées laissé${n > 1 ? 's' : ''} de côté`})},
        obsidian: {icon: '🗒', title: 'Pour Obsidian (notes Markdown)', what: 'dossier de notes',
            body: () => `<p>Un dossier (fichier .zip) de notes Markdown à ouvrir comme « coffre » dans Obsidian (ou Logseq, Zettlr…) : une note par personne (identité, événements, sources, notes) et une par lieu, reliées par des liens <code>[[…]]</code> vers les parents, les enfants, les conjoints et les lieux. La « vue graphique » d’Obsidian montre alors toute la famille.</p>${scopeBlock()}
                <fieldset class="h-rc-modes"><legend>Dans chaque note</legend><label class="checkbox-line"><input type="checkbox" name="sources" checked> Sources</label><label class="checkbox-line"><input type="checkbox" name="notes" checked> Notes</label></fieldset>${shareBlock(true)}`,
            onOpen: dl => { bindShare(dl); bindScope(dl); }, run: form => { const sc = scopeParams(form); if (!sc) return false;
                return download('export_plus', {format: 'obsidian', ...sc, ...shareParams(form), sources: form.elements.sources.checked ? '1' : '0', notes: form.elements.notes.checked ? '1' : '0'}, {noun: 'note de personne', many: 'notes de personnes', feminine: true}); }},
        graphml: {icon: '🕸', title: 'Réseau familial (GraphML)', what: 'GraphML',
            body: () => `<p>Le réseau de la famille pour <b>Gephi</b> ou <b>yEd</b> : un point par personne (avec nom, sexe, années, génération et numéro Sosa), un trait par lien parent-enfant et par couple.</p>${scopeBlock()}${familiesBlock()}${shareBlock(true)}`,
            onOpen: dl => { bindShare(dl); bindScope(dl); }, run: form => { const sc = scopeParams(form); if (!sc) return false;
                return download('export_plus', {format: 'graphml', ...sc, ...shareParams(form), families: form.elements.families.checked ? '1' : '0'}, {noun: 'personne', feminine: true}); }},
        dot: {icon: '🕸', title: 'Réseau familial (Graphviz)', what: 'DOT',
            body: () => `<p>Le même réseau au format <b>DOT</b> de Graphviz : <code>dot -Tsvg reseau.dot -o reseau.svg</code> en fait un dessin. Hommes en bleu, femmes en rose, ancêtres Sosa en gras.</p>${scopeBlock()}${familiesBlock()}${shareBlock(true)}`,
            onOpen: dl => { bindShare(dl); bindScope(dl); }, run: form => { const sc = scopeParams(form); if (!sc) return false;
                return download('export_plus', {format: 'dot', ...sc, ...shareParams(form), families: form.elements.families.checked ? '1' : '0'}, {noun: 'personne', feminine: true}); }},
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

    /* 📦 Paquets avec les photos (GedZip, Gramps .gpkg) : la taille est dite AVANT (estimate=1), puis le fichier est téléchargé
     * directement (sans le garder en mémoire dans la page : il peut faire plusieurs centaines de Mo). */
    const sizeText = b => b >= 1073741824 ? `${(b / 1073741824).toLocaleString('fr-FR', {maximumFractionDigits: 1})} Go` : b >= 1048576 ? `${(b / 1048576).toLocaleString('fr-FR', {maximumFractionDigits: 1})} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`;
    async function paquetEstimate(form, kind) {
        const resp = await fetch(exportUrl('export_plus', {format: kind, estimate: '1', ...shareParams(form)}), {credentials: 'same-origin'});
        const d = await resp.json().catch(() => ({error: 'Réponse illisible'}));
        if (!resp.ok || d.error) throw new Error(d.error || 'Calcul de la taille impossible.');
        return d;
    }
    function paquetOpen(dl, kind) {
        bindShare(dl);
        const box = dl.querySelector('[data-paquet-size]'), form = dl.querySelector('form') || dl;
        const show = async () => {
            box.innerHTML = UI().spinner ? UI().spinner('Calcul de la taille…') : 'Calcul de la taille…';
            try {
                const d = await paquetEstimate(form, kind);
                const bits = [`${plural(d.persons, 'personne')}`, `${plural(d.media, 'fichier de média', 'fichiers de médias')}`];
                const notes = [];
                if (d.private) notes.push(`${plural(d.private, 'média laissé', 'médias laissés')} de côté : une personne vivante ou une fiche confidentielle y figure.`);
                if (d.missing) notes.push(`${plural(d.missing, 'fichier introuvable', 'fichiers introuvables')} dans tes médias : la fiche du média part, sans le fichier.`);
                box.innerHTML = (UI().notice ? UI().notice(d.too_big ? 'error' : 'info', `${d.too_big ? '⛔ Trop gros : ' : ''}≈ ${sizeText(d.bytes)} — ${bits.join(', ')}.`) : `<p>≈ ${sizeText(d.bytes)}</p>`)
                    + notes.map(t => UI().notice ? UI().notice('warn', t) : `<p>${esc(t)}</p>`).join('');
                box.dataset.ok = d.too_big ? '' : '1';
            } catch (e) { box.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); box.dataset.ok = ''; }
        };
        dl.querySelectorAll('[name=share],[name=living]').forEach(i => i.addEventListener('change', show));
        show();
    }
    async function paquetRun(form, kind) {
        const d = await paquetEstimate(form, kind);
        if (d.too_big) throw new Error('Les médias font plus de 4 Go : choisis une branche, ou fais une sauvegarde complète.');
        const a = document.createElement('a'); a.href = exportUrl('export_plus', {format: kind, ...shareParams(form)}); a.download = ''; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
        toast(`⤓ ${kind === 'gedzip' ? 'GedZip' : 'Paquet Gramps'} : ${plural(d.persons, 'personne')}, ${plural(d.media, 'média')} (≈ ${sizeText(d.bytes)}).`);
        return d;
    }

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
    const BUTTONS = [['geneanet', '🌐 Pour Geneanet', 'GEDCOM prêt pour Geneanet : vivants cachés, lieux au format Geneanet'], ['gramps', '🌳 Vers Gramps', 'Fichier .gramps'], ['gpkg', '🌳 Paquet Gramps avec les photos', 'Fichier .gpkg : Gramps + photos et documents'], ['gedzip', '📦 GedZip avec les photos', 'GEDCOM 7 + photos et documents dans un zip'], ['gedcomx', '🔗 GEDCOM-X', 'JSON de FamilySearch'],
        ['ics', '📅 Agenda des anniversaires', 'Fichier .ics : naissances, mariages, décès, fêtes'], ['vcard', '📇 Contacts', 'vCard : cousins, archives, correspondants'], ['kml', '🗺 Lieux (KML)', 'Google Earth'], ['geojson', '🗺 Lieux (GeoJSON)', 'QGIS, uMap…'],
        ['obsidian', '🗒 Pour Obsidian', 'Une note Markdown par personne et par lieu, reliées par des liens [[…]]'], ['graphml', '🕸 Réseau (GraphML)', 'Gephi, yEd'], ['dot', '🕸 Réseau (Graphviz)', 'Fichier .dot']];
    ext.exportPanels.push(() => `<section class="maintenance-panel" id="h-export-plus"><h3 data-help="D’autres logiciels et sites lisent ta généalogie : Geneanet, Gramps, FamilySearch, ton agenda, tes contacts, Google Earth, Obsidian, Gephi. Pour un fichier à partager, les vivants et les fiches confidentielles sont cachés comme dans le GEDCOM « pour partager »." data-help-faq="Geneanet">⤓ Vers d’autres logiciels et sites</h3>
        <p>Chaque bouton ouvre une petite fenêtre avec ses choix, puis télécharge le fichier.</p>
        <div class="page-actions h-export-plus-grid">${BUTTONS.map(([k, l, t]) => `<button type="button" class="button secondary" data-export-plus="${k}" title="${esc(t)}">${esc(l)}</button>`).join('')}</div>
        <p class="ui-hint">Pour importer : RootsMagic (.rmtree), GeneWeb (.gw), GEDCOM-X (.json, .xml) et les paquets GedZip et Gramps sont lus directement par « ⤒ Importer un arbre » (Réglages → Import). Family Tree Maker, Généatique et GenoPro : passe par leur export GEDCOM.</p></section>`);
    ext.afterExport.push(() => { document.querySelectorAll('[data-export-plus]').forEach(b => b.addEventListener('click', () => openFormat(b.dataset.exportPlus))); });

    /* « ⤓ Exporter ▾ » des listes (heritage-columns.js) : Lieux → KML, GeoJSON ; Répertoire des vivants → vCard */
    ext.listExportExtras = type => {
        if (type === 'places') return [{icon: '🗺', label: 'Pour Google Earth (KML)', help: 'un dossier par sorte d’événement', run: () => openFormat('kml')}, {icon: '🗺', label: 'En GeoJSON', run: () => openFormat('geojson')}];
        if (type === 'living_contacts') return [{icon: '📇', label: 'Contacts (vCard)', help: 'téléphone, ordinateur, messagerie', run: () => openFormat('vcard')}];
        return [];
    };
})();
