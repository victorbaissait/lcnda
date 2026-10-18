/* LCNDA — 📰 « Dans les médias » (maquette O) : le passage d'une personne dans la presse, à la radio, à la télé, en podcast,
 * sur le web… ; le bloc de la fiche (frise, cartes filtrables, ton) et la liste « Revue de presse » (Listes, barre H10).
 * Le média est une revue de « Listes → Revues et magazines » (menu de choix, sorte « periodical »), ou un nom libre.
 * Noyau : heritage-blocs.js (BL) sur le moteur heritage-artist.js (ART). API : ext.press.listFor(pid), ext.press.cardsHtml(list).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, ext = window.LCNDA_EXT || {}, BL = ext.blocs; if (!ART?.define || !BL?.open) return;
    const A = () => window.LCNDA_APP, U = ART.util, esc = U.esc;

    const MEDIA = [['presse', '📰 Presse'], ['radio', '📻 Radio'], ['tv', '📺 TV'], ['podcast', '🎧 Podcast'], ['web', '🌐 Web'], ['film', '🎞 Actualités filmées'], ['livre', '📚 Livre'], ['affiche', '📢 Affiche'], ['autre', '✦ Autre']];
    const PTYPES = [['article', 'Article'], ['interview', 'Interview'], ['portrait', 'Portrait'], ['reportage', 'Reportage'], ['citation', 'Citation'], ['photo', 'Photo publiée'], ['debat', 'Débat'], ['invite', 'Invité'],
        ['chronique', 'Chronique'], ['tribune', 'Tribune'], ['necrologie', 'Nécrologie'], ['naissance', 'Avis de naissance'], ['mariage', 'Avis de mariage'], ['deces', 'Avis de décès'], ['critique', 'Critique · avis'],
        ['faits_divers', 'Faits divers'], ['annonce', 'Petite annonce'], ['publicite', 'Publicité'], ['palmares', 'Résultats, palmarès'], ['autre', 'Autre']];
    const TONES = [['', '—'], ['pos', '😊 positif'], ['neu', '😐 neutre'], ['neg', '☹️ négatif']];
    const ICON = {presse: '📰', radio: '📻', tv: '📺', podcast: '🎧', web: '🌐', film: '🎞', livre: '📚', affiche: '📢', autre: '✦'};
    const TAGC = {interview: 'c1', portrait: 'c1', invite: 'c2', debat: 'c2', chronique: 'c2', tribune: 'c2', necrologie: 'c3', deces: 'c3', naissance: 'c4', mariage: 'c4', critique: 'c5', faits_divers: 'c5', palmares: 'c4'};
    const lab = (l, v) => BL.labelOf(l, v);
    const isPrint = m => ['presse', 'web', 'livre', 'affiche'].includes(m || 'presse');
    /** le titre d'un article entre guillemets (sauf s'il en a déjà) ; une émission sans */
    const titled = (t, med) => (isPrint(med) && !/^\s*[«"“]/.test(String(t || '')) ? `« ${t} »` : String(t || ''));
    const fileIcon = m => { const x = ART.mediaOf(m); if (!x) return ''; return BL.isAudio(x.f, x.type) ? '🎧' : BL.isVideo(x.f, x.type) ? '🎬' : BL.isImg(x.f) ? '🖼' : '📄'; };
    ART.views.bl_fileicon = {text: (ctx, it, f) => { const v = it.data?.[f.of]; return Array.isArray(v) ? (v.length ? (BL.isImg(v[0]?.f) ? '🖼' : '📄') : '') : fileIcon(v); }, read: (ctx, it, f) => esc(ART.views.bl_fileicon.text(ctx, it, f))};

    ART.define({key: 'press_item', icon: '📰', label: 'Passage dans les médias', many: 'Passages dans les médias', tab: 'Passages', domain: 'blocs', hidden: true,
        eyebrow: it => `Dans les médias · ${BL.bare(lab(MEDIA, it.data?.medium)) || 'passage'}`,
        heading: (ctx, it) => { const d = it.data || {}, t = lab(PTYPES, d.ptype), med = d.medium || 'presse';
            const meta = [BL.perChip(d.outlet, ICON[med]), d.date && esc(d.date), d.pages && esc(d.pages)].filter(Boolean).join(' · ');
            return `<div class="bl-head">${d.ptype ? `<span class="bl-mtag ${TAGC[d.ptype] || ''}">${esc(t)}</span>` : ''}<h2 class="ar-h2">${esc(titled(it.title, med))}</h2>${meta ? `<p class="bl-hmeta">${meta}</p>` : ''}${d.tone ? `<span class="bl-tone ${esc(d.tone)}">${esc(BL.bare(lab(TONES, d.tone)))}</span>` : ''}</div>`; },
        newData: () => ({medium: 'presse', ptype: 'article', tone: ''}),
        titleHint: 'Il faut un titre (ou le nom de l’émission).',
        askWho: 'Ce passage parle de qui ?',
        groups: [
            {key: 'main', label: 'Le passage', zone: 'main', fields: [
                {key: 'medium', label: 'Sorte de média', short: 'Sorte', type: 'pills', choices: MEDIA, star: true},
                {key: 'ptype', label: 'Type de passage', short: 'Type', type: 'select', choices: PTYPES, star: true, head: true},
                {key: 'date', label: 'Date', type: 'date', star: true, head: true},
                {key: 'outlet', label: 'Média', short: 'Média', type: 'periodical', star: true, head: true, help: '(de « Revues et magazines », ou un nom)'},
                {key: 'title', label: 'Titre / émission', short: 'Titre', type: 'text', star: true, head: true},
                {key: 'pages', label: 'Page · durée', type: 'text', star: true, head: true, ph: 'p. 6 · 1/2 page, 12:40…'},
                {key: 'author', label: 'Journaliste / animateur', short: 'Par', type: 'person', star: true, roleWord: 'journaliste'},
                {key: 'people', label: 'Personnes', type: 'cast', star: true, roleWord: 'cité', roles: ['interviewé', 'invité', 'cité', 'photographié', 'animateur', 'journaliste', 'photographe', 'auteur', 'témoin']},
                {key: 'subject', label: 'Sujet', type: 'text', star: true},
                {key: 'tone', label: 'Ton', type: 'select', choices: TONES, star: true, head: true}]},
            {key: 'extract', label: 'Extrait', zone: 'main', fields: [{key: 'quote', label: 'Extrait', type: 'longtext', view: 'bl_quote', star: true, section: true, wide: true}]},
            {key: 'file', label: 'Fichier', icon: '📄', zone: 'left', fields: [{key: 'file', label: 'Fichier (scan, son, vidéo)', short: 'Fichier', type: 'media', media: ['image', 'audio', 'video', 'document'], star: true}]},
            {key: 'more', label: 'Transcription · lien', icon: '📝', zone: 'right', fields: [
                {key: 'url', label: 'Lien (Gallica, INA, site…)', short: 'Lien', type: 'url', star: true},
                {key: 'transcript', label: 'Transcription', type: 'longtext', star: true},
                {key: 'partof', label: 'Fait partie de', type: 'items', star: true, help: '(une tournée, un disque, une enquête…)'}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        listExtra: [BL.OWNER_COL, {key: 'c_file', label: 'Fichier', type: 'computed', view: 'bl_fileicon', of: 'file'}],
        list: ['date', 'outlet', 'title', 'ptype', 'pages', 'tone', 'c_file', 'c_who'], card: ['date', 'outlet', 'ptype'],
        export: ['date', 'medium', 'outlet', 'title', 'ptype', 'pages', 'author', 'people', 'subject', 'tone', 'quote', 'url', 'notes'],
        filters: () => [BL.WHO,
            {id: 'medium', group: 'Sorte de média', label: 'Sorte de média', type: 'check', options: MEDIA, test: (it, v) => !v?.length || v.includes(it.data.medium || 'presse')},
            {id: 'ptype', group: 'Type de passage', label: 'Type de passage', type: 'check', options: PTYPES, test: (it, v) => !v?.length || v.includes(it.data.ptype)},
            {id: 'tone', group: 'Ton', label: 'Ton', type: 'check', options: TONES.filter(t => t[0]), test: (it, v) => !v?.length || v.includes(it.data.tone)},
            {id: 'withfile', group: 'Fichier', label: 'Avec un scan, un son ou une vidéo', type: 'check', test: (it, v) => !v || !!ART.mediaOf(it.data.file)}],
        quick: {filter: 'medium', options: MEDIA, value: it => it.data.medium || 'presse'},
        sorts: [['year', 'Plus anciens'], ['recent', 'Plus récents'], ['az', 'A → Z'], ['za', 'Z → A']],
        searchHint: 'titre, média, journaliste, extrait',
        listIntro: 'Les passages dans la presse, à la radio, à la télé, en podcast, sur le web… de toutes les personnes (filtre « Personne » pour une seule).',
        emptyHint: '« ＋ Nouveau passage » : un article, une interview, une émission, une nécrologie, une photo publiée…',
        listExtraHtml: (store, list) => list.length ? `<div class="bl-sec"><b>📊 Frise des passages</b>${strip(list)}</div>` : '',
        summary: list => { const n = list.filter(it => ART.mediaOf(it.data.file)).length; return n ? `${U.plural(n, 'fichier')} (scan, son, vidéo)` : ''; },
    });

    /* ═════════ La frise (barres par tranche d'années) ═════════ */
    function strip(list) {
        const ys = list.map(it => BL.span(it)?.[0]).filter(Boolean); if (!ys.length) return '';
        let a = Math.min(...ys), b = Math.max(...ys); const step = b - a > 150 ? 10 : 5; a = Math.floor(a / step) * step; b = Math.floor(b / step) * step + step;
        const bins = []; for (let y = a; y < b; y += step) bins.push(ys.filter(x => x >= y && x < y + step).length);
        const max = Math.max(1, ...bins), ticks = [...new Set([0, 1, 2, 3, 4].map(i => Math.round(a + (b - a) * i / 4)))];
        return `<div class="bl-strip" role="img" aria-label="${esc(`${U.plural(ys.length, 'passage')} entre ${a} et ${b}`)}">${bins.map((n, i) => `<i style="height:${Math.round(n / max * 100)}%" title="${esc(`${a + i * step} – ${a + i * step + step - 1} : ${U.plural(n, 'passage')}`)}"></i>`).join('')}</div><div class="bl-axis">${ticks.map(t => `<span>${t}</span>`).join('')}</div>`;
    }
    BL.strip = strip;

    /* ═════════ Le bloc « 📰 Dans les médias » de la fiche ═════════ */
    const byDate = (x, y) => (BL.span(x)?.[0] || 9999) - (BL.span(y)?.[0] || 9999) || String(x.data?.date || '').localeCompare(String(y.data?.date || '')) || x.id - y.id;
    const name = v => U.nameOf(v);
    /** une carte de passage (vignette du scan, ou icône et durée ; sorte ; titre ; ligne grise ; extrait ; lecteur ; ton) */
    function card(it, pid) {
        const d = it.data || {}, med = d.medium || 'presse', m = ART.mediaOf(d.file), src = BL.mediaSrc(m);
        const thumb = m && BL.isImg(m.f) ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span>${esc(ICON[med] || '📰')}</span>`;
        const small = m ? (BL.isAudio(m.f, m.type) || BL.isVideo(m.f, m.type) ? (m.dur || (BL.isAudio(m.f, m.type) ? 'SON' : 'VIDÉO')) : BL.isImg(m.f) ? '' : 'SCAN') : (d.pages && /\d:\d\d/.test(d.pages) ? d.pages.match(/\d+:\d\d(?::\d\d)?/)[0] : '');
        const cast = BL.castOf(d.people).filter(r => Number(r.pid) !== Number(pid));
        const meta = [BL.perTitle(d.outlet), d.date, d.pages, name(d.author) && `par ${name(d.author)}`, cast.length && `avec ${cast.slice(0, 3).map(r => r.title || r.pname).join(', ')}${cast.length > 3 ? '…' : ''}`].filter(Boolean).join(' · ');
        const owner = Number(it.person_id) !== Number(pid) ? `<small class="bl-cited">dans la fiche de ${esc(it.owner || '')}${it.my_roles?.length ? ` (${esc(it.my_roles.join(', '))})` : ''}</small>` : '';
        const player = m && BL.isAudio(m.f, m.type) ? ART.player(src, m.dur, m.title) : '';
        return `<div class="bl-mcard" role="button" tabindex="0" data-bl-item="${it.id}" data-bl-kind="press_item" data-pid="${Number(pid)}" data-bl-medium="${esc(med)}" title="Ouvrir le passage">
            <span class="bl-mt bl-m-${esc(med)}">${thumb}${small ? `<small>${esc(small)}</small>` : ''}</span>
            <span class="bl-mc"><span class="bl-mline">${d.ptype ? `<span class="bl-mtag ${TAGC[d.ptype] || ''}">${esc(lab(PTYPES, d.ptype))}</span> ` : ''}<b>${esc(titled(it.title, med))}</b></span>${meta ? `<small class="ar-g">${esc(meta)}</small>` : ''}${owner}${d.quote ? `<span class="bl-mq">« ${esc(String(d.quote).replace(/^«\s*|\s*»$/g, '').slice(0, 220))}${String(d.quote).length > 220 ? '…' : ''} »</span>` : ''}${player}</span>
            <span class="bl-mr">${d.tone ? `<span class="bl-tone ${esc(d.tone)}">${esc(BL.bare(lab(TONES, d.tone)))}</span>` : ''}${d.transcript ? '<span class="ar-ochip"><i>📝</i>transcription</span>' : ''}</span></div>`;
    }
    const MAX = 30;
    function render(p, data, {locked} = {}) {
        const pid = Number(p.id), own = (data.items || []).filter(i => i.kind === 'press_item').sort(byDate), cited = (data.cited || []).filter(i => i.kind === 'press_item').sort(byDate);
        const all = [...own, ...cited].sort(byDate);
        if (!all.length) return `${A().emptyState({icon: '📰', text: 'Aucun passage dans les médias pour l’instant', hint: 'Un article, une interview à la radio, une émission de télé, un avis de naissance ou une nécrologie, une photo publiée…', action: locked ? null : {label: '＋ Ajouter un passage', attrs: `data-bl-new="press_item" data-pid="${pid}"`}})}`;
        const counts = new Map(); all.forEach(it => { const m = it.data?.medium || 'presse'; counts.set(m, (counts.get(m) || 0) + 1); });
        const ys = all.map(it => BL.span(it)?.[0]).filter(Boolean);
        const range = ys.length ? (Math.min(...ys) === Math.max(...ys) ? ` · ${Math.min(...ys)}` : ` · ${Math.min(...ys)} – ${Math.max(...ys)}`) : '';
        const filt = counts.size > 1 ? `<div class="ui-filters bl-mfilt"><button type="button" class="is-active" data-bl-mf="">Tout ${all.length}</button>${MEDIA.filter(([k]) => counts.has(k)).map(([k, l]) => `<button type="button" data-bl-mf="${esc(k)}">${esc(l)} ${counts.get(k)}</button>`).join('')}</div>` : '';
        return `<div class="bl-bh"><small class="ar-g">${esc(U.plural(all.length, 'passage'))}${esc(range)}</small><span class="spacer"></span>${filt}</div>${strip(all)}
            <div class="bl-mcards">${all.slice(0, MAX).map(it => card(it, pid)).join('')}</div>${all.length > MAX ? `<p class="ar-g">… et ${esc(U.plural(all.length - MAX, 'autre passage', 'autres passages'))} : « Tout voir ».</p>` : ''}`;
    }
    BL.renderers.in_media = render;
    ext.personBlocks.in_media = BL.block({key: 'in_media', title: '📰 Dans les médias', render,
        actions: (p, ed) => `<button type="button" class="button small secondary" data-bl-open="press" data-pid="${Number(p.id)}" title="La revue de presse de cette personne">Tout voir</button>${ed(`<button type="button" class="button small secondary" data-bl-new="press_item" data-pid="${Number(p.id)}">＋ Ajouter</button>`)}`});
    // Entrée ou Espace sur une carte : l'ouvrir
    document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.bl-mcard, .bl-rowbtn')) { e.preventDefault(); e.target.click(); } });

    /* ═════════ L'écran Listes → « Revue de presse » ═════════ */
    ext.lists.press_review = BL.listScreen('press', 'press_item');

    /* ═════════ API pour les autres outils ═════════ */
    const norm = it => { const d = it.data || {}; const m = ART.mediaOf(d.file);
        return {id: it.id, kind: it.kind, person_id: it.person_id, owner: it.owner || '', title: it.title, date: d.date || '', year: it.year, date_min: it.date_min, medium: d.medium || 'presse', mediumLabel: BL.bare(lab(MEDIA, d.medium || 'presse')),
            type: d.ptype || '', typeLabel: lab(PTYPES, d.ptype), outlet: BL.perTitle(d.outlet), outletId: BL.perVal(d.outlet)?.perid || 0, pages: d.pages || '', author: name(d.author), people: BL.castOf(d.people),
            subject: d.subject || '', tone: d.tone || '', quote: d.quote || '', url: BL.safeUrl(d.url), file: m, roles: it.my_roles || [], data: d}; };
    ext.press = {
        /** les passages de la personne (cited: true → aussi ceux rangés chez d'autres qui la citent) */
        listFor: async (pid, o = {}) => (await BL.listFor(pid, {kinds: ['press_item'], cited: !!o.cited})).sort(byDate).map(norm),
        /** des cartes prêtes à poser (clic = ouvrir le passage) */
        cardsHtml: (list, pid = 0) => `<div class="bl-mcards">${(list || []).map(x => card(x, pid)).join('')}</div>`,
        stripHtml: list => strip(list || []),
        open: (pid, o = {}) => BL.open({domain: 'press', pid, ...o}), MEDIA, PTYPES,
    };
})();
