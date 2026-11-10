/* LCNDA — 🗺 Carte de la vie d'une personne : tous les lieux d'une vie (événements, résidences, recensements, voyages,
 * placements, service militaire, écoles), dans l'ordre, sur la carte, animée (▶ ⏸, vitesse, frise des dates en bas, étapes
 * cliquables), les lieux sans position listés à part ; « 👪 Avec la famille » (le conjoint, les enfants) ; « 🎬 Exporter en
 * vidéo » (MP4 ou WebM, copie dans les médias) ; « 📊 Garder comme diagramme ».
 * Construite sur l'existant, jamais un deuxième moteur :
 *  - le dessin = la « Carte qui raconte » des diagrammes (heritage-diagram-cartes2.js, ext.storyMap) : fonds hors ligne
 *    (Natural Earth, IGN Admin Express : ext.diagramCartes), frise, ◀ ▶ et lecture ;
 *  - la vidéo = le moteur des diagrammes (ext.diagramPerso.recordSvgs : canevas + MediaRecorder, comme la visite de la maison) ;
 *  - les données = api carte_vie (lib/metiers_carte.php), qui reprend les étapes de la Carte qui raconte et ajoute le reste.
 * Entrées : fiche (⋯ → « 🗺 Carte de sa vie »), Carte (colonne de gauche « 🗺 Carte de la vie », et le mode Itinéraire),
 * recherche rapide (⌘K), FAQ. API : ext.lifeMap.open(personId).
 * Vidéo à partager : jamais un vivant ni une fiche confidentielle (share=1 côté serveur).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, CORE = () => window.LCNDA_METIERS_CARTE;
    const DR = () => ext.diagramRender, SM = () => ext.storyMap, GC = () => ext.diagramCartes;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'genealogie-carte-vie';
    const lsGet = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const lsSet = p => { try { localStorage.setItem(KEY, JSON.stringify({...lsGet(), ...p})); } catch (_) {} };
    // couleur d'une étape selon d'où elle vient (la personne : la couleur du chemin)
    const COLORS = {spouse: '#d9488f', child: '#1aa34a', census: '#7a5cc2', voyage: '#0e7f99', placement: '#c2611a', military: '#7a2a2a', school: '#2563c9'};
    const SRC = {event: '', census: '🧾 recensement', voyage: '🚢 voyage', placement: '👶 placement', military: '🎖 armée', spouse: '💞 conjoint', child: '👶 enfant', school: '🏫 école'};

    /** les écoles du bloc « 🎓 Diplômes et formation » (fiches de la personne), s'il est là */
    async function schoolSteps(pid) {
        try {
            const r = await ext.education?.listFor?.(pid); if (!r?.steps?.length) return [];
            return r.steps.map(s => { const place = s.place?.title || s.place?.name || (typeof s.place === 'string' ? s.place : '') || s.school?.title || ''; const y = Number(s.from) || Number(s.year) || null;
                return place ? {date: s.date || (y ? String(y) : ''), year: y, kind: s.typeLabel || 'École', title: s.title || s.school?.title || '', with: '', place, county: '', country: '', insee: '', lat: null, lon: null, src: 'school', who: '', pid} : null; }).filter(Boolean);
        } catch (_) { return []; }
    }
    /** les données d'une vie, rangées (étapes de la base + écoles) */
    async function load(pid, {family = false, share = false} = {}) {
        const r = await A().api('carte_vie', {person: pid, family: family ? 1 : '', share: share ? 1 : ''});
        if (r.private) return r;
        const school = r.id ? await schoolSteps(r.id) : [];
        r.steps = CORE().orderSteps([...(r.steps || []), ...school]);
        return r;
    }
    /** l'étendue des lieux placés → le fond : France, Europe ou le monde */
    function pickMap(spec) {
        const pts = Object.values(spec.places || {}).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
        if (!pts.length) return {map: 'fr', level: 'dep'};
        const inBox = ([w, s, e, n]) => pts.every(p => p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n);
        if (inBox([-5.6, 41.2, 9.9, 51.3])) return {map: 'fr', level: 'dep'};
        if (inBox([-24.5, 34.3, 44.8, 71.3])) return {map: 'eu', level: 'pays'};
        return {map: 'monde', level: 'pays'};
    }
    async function buildSpec(r, W, hFix = 0) {
        const {spec, lost} = await SM().storySpec(r, {spec: {kind: 'storymap', o: {}, rows: []}, colors: COLORS});
        spec.o = {...spec.o, ...pickMap(spec), placeLabels: '', future: true, height: hFix || Math.round(Math.max(220, Math.min(W * .58, (window.innerHeight || 800) * .52, 620)))};
        const kind = DR().KINDS.storymap;
        const s = kind?.resolve ? await kind.resolve(spec) : spec;
        return {spec: s, lost};
    }
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

    function stepsListHtml(st) {
        const rows = st.rows, placed = st.placed;
        const items = rows.map((r, i) => `<li><button type="button" class="lv-step${placed[i] ? '' : ' is-noplace'}" data-lv-step="${i}"${r.color ? ` style="--lv-c:${esc(r.color)}"` : ''}><span class="lv-num">${i + 1}</span><span class="lv-txt"><b>${esc(r.date || 'date inconnue')}</b> ${esc(r.label)}<small>${esc(r.place)}${placed[i] ? '' : ' · 📍 sans position'}${st.src[i] && SRC[st.src[i]] ? ` · ${SRC[st.src[i]]}` : ''}</small></span></button></li>`).join('');
        const miss = rows.map((r, i) => (placed[i] ? null : r.place)).filter(Boolean);
        const uniq = [...new Set(miss)];
        return `<h3>Les étapes <small class="muted">(${rows.length})</small></h3><ol class="lv-steps-list">${items}</ol>
            ${uniq.length ? `<div class="lv-missing"><h4>📍 Lieux sans position <small class="muted">(${uniq.length})</small></h4><p class="ui-hint">Ces lieux ne sont pas sur la carte : ouvre le lieu et donne sa position (ou tape « Nom 48.11, -1.68 » dans le diagramme).</p><ul>${uniq.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
            ${st.noPlace.length ? `<div class="lv-missing"><h4>🗓 Sans lieu <small class="muted">(${st.noPlace.length})</small></h4><ul>${st.noPlace.slice(0, 40).map(s => `<li>${esc([s.date || s.year, s.kind, s.title].filter(Boolean).join(' · '))}</li>`).join('')}</ul></div>` : ''}`;
    }

    async function open(personId) {
        if (!DR()?.KINDS?.storymap || !SM()) { A().toast('La carte n’est pas encore prête : réessaie dans un instant.', 'error'); return; }
        const st0 = A().state, cfg = lsGet();
        let pid = Number(personId) || Number(st0.currentPersonId) || Number(st0.bootstrap?.startPersonId) || 0, family = cfg.family === true, data = null, cur = {spec: null, rows: [], placed: [], src: [], noPlace: []};
        document.querySelector('dialog.lv-dlg')?.close();
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-xl lv-dlg';
        const pk = (A().pickerField || window.LCNDA_PICKER?.pickerField)?.({name: 'lv_person', kind: 'person', allowCreate: false, value: null}) || '';
        const canVideo = typeof MediaRecorder !== 'undefined' && !!document.createElement('canvas').captureStream;
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">CARTE · LA VIE D’UNE PERSONNE</span><h2 data-lv-title>🗺 Carte de la vie</h2></div><button type="button" class="icon-button" data-lv-x aria-label="Fermer">×</button></div>
            <div class="lv-bar"><div class="pk-host lv-pk"><span>Personne</span><div data-lv-pk>${pk.replace(' name="lv_person"', '')}</div></div>
                <label class="ui-toggle" title="Ajoute la naissance et le décès du conjoint, la naissance, le mariage et le décès des enfants (pendant sa vie)"><input type="checkbox" data-lv-family ${family ? 'checked' : ''}><i></i>👪 Avec la famille (le couple, les enfants)</label>
                <span class="spacer"></span>
                <button type="button" class="button small secondary" data-lv-diagram title="Le garder dans « Mes diagrammes » (Graphiques), à poser sur la fiche, le tableau de bord, la mise en page…">📊 Garder comme diagramme</button>
                <button type="button" class="button small" data-lv-video ${canVideo ? '' : 'disabled'} title="${canVideo ? 'Les étapes l’une après l’autre, en vidéo (MP4 ou WebM)' : 'Ce navigateur ne sait pas enregistrer de vidéo'}">🎬 Exporter en vidéo</button></div>
            <div class="lv-body"><div class="lv-map" data-lv-map>${UI().spinner ? UI().spinner('Chargement de la carte…') : 'Chargement…'}</div><aside class="lv-side" data-lv-side></aside></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-lv-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s), host = $('[data-lv-map]'), side = $('[data-lv-side]');
        if (cfg.speed) host.dataset.c2Speed = String(cfg.speed);
        const width = () => Math.max(300, Math.min(1100, Math.round(host.clientWidth || 800)));
        async function draw() {
            host.innerHTML = UI().spinner ? UI().spinner('Chargement de la carte…') : 'Chargement…'; side.innerHTML = '';
            if (!pid) { host.innerHTML = A().emptyState({icon: '🗺', text: 'Choisis une personne', hint: 'La carte de sa vie se remplit avec ses événements, ses résidences, ses recensements, ses voyages…'}); return; }
            try { data = await load(pid, {family}); } catch (e) { host.innerHTML = UI().notice ? UI().notice('error', `⛔ ${esc(e.message)}`) : esc(e.message); return; }
            if (!dlg.isConnected) return;
            $('[data-lv-title]').textContent = `🗺 La vie de ${data.name || 'cette personne'}`;
            const parts = CORE().splitSteps(data.steps);
            const withPlace = data.steps.filter(s => String(s.place || '').trim());
            if (!withPlace.length) { host.innerHTML = A().emptyState({icon: '📍', text: 'Aucun lieu dans cette vie', hint: 'Ajoute un lieu à ses événements (naissance, mariage, résidence…), ou un recensement.', action: {label: '↗ Ouvrir la fiche', attrs: `data-lv-open="${Number(data.id)}"`}}); side.innerHTML = stepsListHtml({rows: [], placed: [], src: [], noPlace: parts.noPlace}); return; }
            const W = width() - 32;
            const {spec} = await buildSpec(data, W);
            if (!dlg.isConnected) return;
            const located = SM().located ? SM().located(spec, W) : null;
            cur = {spec, rows: spec.rows, src: withPlace.map(s => s.src || 'event'), placed: spec.rows.map((r, i) => (located ? !!located[i] : !!(spec.places || {})[fold(r.place)])), noPlace: parts.noPlace};
            host.innerHTML = DR().svg(spec, W + 32);
            side.innerHTML = stepsListHtml(cur);
        }
        const paintStep = i => { side.querySelectorAll('[data-lv-step]').forEach(b => { const on = Number(b.dataset.lvStep) === i; b.classList.toggle('is-active', on); if (on) b.scrollIntoView?.({block: 'nearest'}); }); };
        host.addEventListener('c2-step', e => paintStep(Number(e.detail?.i)));
        host.addEventListener('change', e => { if (e.target.matches?.('[data-c2-speed]')) lsSet({speed: Number(e.target.value) || 1700}); });
        side.addEventListener('click', e => { const b = e.target.closest('[data-lv-step]'); if (!b) return; const g = host.querySelector('[data-c2-story]'); if (g) SM().go(g, Number(b.dataset.lvStep), false); });
        dlg.addEventListener('click', async e => {
            if (e.target.closest('[data-lv-x]')) { dlg.close(); return; }
            const op = e.target.closest('[data-lv-open]'); if (op) { dlg.close(); A().openPersonById?.(Number(op.dataset.lvOpen)); return; }
            if (e.target.closest('[data-lv-diagram]')) { if (!cur.spec) return; const s = JSON.parse(JSON.stringify(cur.spec)); delete s.o.height; ext.openDiagramEditor?.(null, {spec: s, name: s.o.title, link: data?.id ? {type: 'person', id: Number(data.id)} : null}); return; }
            if (e.target.closest('[data-lv-video]')) { exportVideo(); }
        });
        $('[data-lv-family]').addEventListener('change', e => { family = e.target.checked; lsSet({family}); draw(); });
        $('[data-lv-pk]').addEventListener('picker-change', e => { const it = e.detail?.item; if (!it || it.free || !Number(it.id) || Number(it.id) === pid) return; pid = Number(it.id); draw(); });
        dlg.addEventListener('close', () => { if (host._c2T) { clearInterval(host._c2T); host._c2T = 0; } dlg.remove(); });

        /** 🎬 E3 : la vidéo (moteur des diagrammes), une copie dans les médias si on veut */
        async function exportVideo() {
            const rec = ext.diagramPerso?.recordSvgs; if (!rec) return A().toast('Le moteur vidéo n’est pas chargé.', 'error');
            const mp4 = ['video/mp4;codecs=avc1.42E01E', 'video/mp4'].some(m => MediaRecorder.isTypeSupported?.(m)), fmt = mp4 ? 'MP4' : 'WebM';
            const title = `La vie de ${data?.name || 'cette personne'}`;
            await UI().openExportDialog({title: `🎬 ${title}`, defaultName: title, quality: false, saveCopy: !!(A().importMediaFile || window.LCNDA_PICKER?.importMediaFile), copyChecked: true,
                info: 'Les étapes défilent l’une après l’autre, puis toute la vie. La vidéo se fait en temps réel : laisse la fenêtre ouverte. Les personnes vivantes et les fiches confidentielles n’y sont jamais.',
                fields: [{id: 'per', label: 'Durée d’une étape', value: String(cfg.videoPer || 2000), options: [['1200', '1,2 s (rapide)'], ['2000', '2 s'], ['3000', '3 s (lent)']]}],
                formats: [{id: 'video', label: `🎬 Vidéo ${fmt}`, hint: 'les étapes animées', ext: mp4 ? 'mp4' : 'webm', quality: false, goLabel: `⤓ Exporter la vidéo en ${fmt}`, run: async o => {
                    const per = Math.max(600, Math.min(6000, Number(o.fields?.per) || 2000)); lsSet({videoPer: per});
                    const shared = await load(pid, {family, share: true});
                    if (shared.private) throw new Error('cette personne est vivante ou sa fiche est confidentielle : pas de vidéo à partager.');
                    const W = 1100, {spec} = await buildSpec(shared, W, 560), n = spec.rows.length;
                    if (!n) throw new Error('aucune étape avec un lieu.');
                    const frames = [...Array.from({length: n}, (_, i) => ({svg: DR().svg({...spec, o: {...spec.o, step: i}}, W + 32), ms: per})), {svg: DR().svg({...spec, o: {...spec.o, step: -1}}, W + 32), ms: per * 1.5}];
                    const go = document.querySelector('dialog.ui-export [data-ui-go]');
                    const {blob, ext: x} = await rec(frames, {per, maxW: 1280, onProgress: k => { if (go) go.textContent = `🔴 ${Math.round(k * 100)} %`; }});
                    const fname = o.filename ? o.filename.replace(/\.(mp4|webm)$/i, '') + '.' + x : `vie.${x}`;
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                    lastVideo = {blob, name: fname, frames: frames.length};
                    if (o.saveCopy) { const imp = A().importMediaFile || window.LCNDA_PICKER?.importMediaFile; try { await imp(new File([blob], fname, {type: blob.type}), ['video']); A().toast('✓ Vidéo exportée, et une copie rangée dans les médias.'); } catch (err) { A().toast(`Vidéo exportée, mais pas rangée dans les médias : ${err.message}`, 'error'); } }
                    else A().toast(`✓ Vidéo exportée (${x.toUpperCase()}).`);
                }}]});
        }
        dlg.showModal();
        UI().scan?.(dlg);
        await draw();
        // le menu de choix montre la personne
        if (data?.id) { const box = $('[data-lv-pk]'); const html = (A().pickerField || window.LCNDA_PICKER?.pickerField)?.({name: 'lv_person', kind: 'person', allowCreate: false, value: {id: Number(data.id), title: data.name, kind: 'person'}}); if (html && box) { box.innerHTML = html.replace(' name="lv_person"', ''); UI().scan?.(box); } }
        return dlg;
    }
    let lastVideo = null;
    ext.lifeMap = {open, load, _lastVideo: () => lastVideo};

    // ⋯ de la fiche : « 🗺 Carte de sa vie »
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal') return null; return {icon: '🗺', label: 'Carte de sa vie', run: () => open(Number(p.id))}; });
})();
