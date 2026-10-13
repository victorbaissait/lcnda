/**
 * 🎧 Audios et 🎬 Vidéos (onglet Listes ; serveur : lib/media_av.php, structure n°25).
 * Tous les sons ou toutes les vidéos de la base : tri (ajout, nom, durée, date, rattachement), filtre par rattachement,
 * et un lecteur collé en bas de la liste (avancer / reculer, son précédent / suivant, vitesse, lecture en continu).
 * La durée manquante est lue par le navigateur (en-tête du fichier) puis gardée en base.
 * Chargé après app.js et les autres heritage-*.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = value => A().escapeHtml(value ?? '');
    const S = () => A().state;
    const PREFS_KEY = 'genealogie-av-prefs';
    const KINDS = {
        audio: {list: 'audios', icon: '🎧', title: 'Audios', one: 'son', many: 'sons', intro: 'Tous les enregistrements sonores de la base, avec ce à quoi chacun est rattaché. Clique sur ▶ pour écouter : le lecteur reste en bas de la liste.'},
        video: {list: 'videos', icon: '🎬', title: 'Vidéos', one: 'vidéo', many: 'vidéos', intro: 'Toutes les vidéos de la base, avec ce à quoi chacune est rattachée. Clique sur ▶ pour regarder : le lecteur reste en bas de la liste.'},
    };
    const SORTS = [
        ['added_desc', 'Ajout : récent → ancien'], ['added_asc', 'Ajout : ancien → récent'],
        ['name_asc', 'Nom : A → Z'], ['name_desc', 'Nom : Z → A'],
        ['dur_desc', 'Durée : long → court'], ['dur_asc', 'Durée : court → long'],
        ['date_asc', 'Date du document : ancien → récent'], ['date_desc', 'Date du document : récent → ancien'],
        ['owner_asc', 'Rattaché à : A → Z'], ['owner_desc', 'Rattaché à : Z → A'],
        ['size_desc', 'Taille : gros → petit'],
    ];
    const OWNER_GROUPS = [
        ['person', 'Fiches (personnes, couples, événements)', ['person', 'family', 'event']],
        ['battue', 'Battues', ['battue']], ['investigation', 'Enquêtes', ['investigation']],
        ['source', 'Sources', ['source']], ['census', 'Recensements', ['census']], ['military', 'Service militaire', ['military']],
        ['digest', 'Dépouillements', ['digest']], ['collection', 'Collections, listes, atelier', ['collection']],
    ];
    const OWNER_ICONS = {person: '👤', family: '💍', event: '📅', source: '📜', census: '🏠', military: '🎖️', battue: '🐾', investigation: '🔍', digest: '📚', collection: '🗂️'};

    /** Saut de « −N s / +N s » : réglage d'Apparence (15 s par défaut). */
    const skipSeconds = () => { try { const n = Math.round(Number(JSON.parse(localStorage.getItem('genealogie-design') || '{}')?.avSkipSeconds)); return n >= 1 && n <= 3600 ? n : 15; } catch (_) { return 15; } };
    const fmtSkip = n => n >= 60 && n % 60 === 0 ? `${n / 60} min` : `${n} s`;
    /** Vitesse : liste de valeurs courantes + curseur libre de 0,10× à 6×. */
    const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4];
    const RATE_MIN = 0.1, RATE_MAX = 6;
    const cleanRate = v => { const n = Math.round(Number(v) * 100) / 100; return n >= RATE_MIN && n <= RATE_MAX ? n : 1; };
    const fmtRate = r => r.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '×';
    const rateOptions = r => (RATES.includes(r) ? '' : `<option value="${r}" selected>${fmtRate(r)}</option>`) + RATES.map(v => `<option value="${v}"${v === r ? ' selected' : ''}>${String(v).replace('.', ',')}×</option>`).join('');
    const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (_) { return {}; } };
    const prefs = kind => ({q: '', sort: 'added_desc', owner: '', auto: true, rate: 1, ...(loadPrefs()[kind] || {})});
    /** Enregistre seulement les champs donnés (la liste garde tri et filtre, le lecteur vitesse et enchaînement). */
    const savePrefs = (kind, fields) => { try { const all = loadPrefs(); all[kind] = {...(all[kind] || {}), ...fields}; localStorage.setItem(PREFS_KEY, JSON.stringify(all)); } catch (_) {} };

    const fmtDur = sec => {
        if (sec == null || !isFinite(sec)) return '';
        const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
        return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
    };
    const fmtSize = n => !n ? '' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1048576).toLocaleString('fr-FR', {maximumFractionDigits: 1})} Mo`;
    const fmtAdded = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
    const nameOf = it => String(it.title || '').trim() || String(it.filename || '').replace(/^\d+[-_]/, '') || `Média ${it.id}`;
    const ownerText = it => it.owners.map(o => `${o.label} ${o.name}`).join(' · ');
    const yearKey = it => { const m = String(it.date_text || '').match(/\b(\d{3,4})\b/); return m ? Number(m[1]) : null; };
    const cmpText = (a, b) => a.localeCompare(b, 'fr', {sensitivity: 'base', numeric: true});
    /** Vides toujours à la fin, quel que soit le sens. */
    const cmpNullLast = (a, b, dir) => a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : (a - b) * dir;

    function sorted(items, sort) {
        const list = items.slice();
        const [key, way] = sort.split('_'), dir = way === 'desc' ? -1 : 1;
        list.sort((a, b) => {
            let r = 0;
            if (key === 'added') r = (cmpText(String(a.created_at || ''), String(b.created_at || '')) || a.id - b.id) * dir;
            else if (key === 'name') r = cmpText(nameOf(a), nameOf(b)) * dir;
            else if (key === 'dur') r = cmpNullLast(a.duration, b.duration, dir);
            else if (key === 'date') r = cmpNullLast(yearKey(a), yearKey(b), dir);
            else if (key === 'owner') { const x = ownerText(a), y = ownerText(b); r = !x && !y ? 0 : !x ? 1 : !y ? -1 : cmpText(x, y) * dir; }
            else if (key === 'size') r = (a.size - b.size) * dir;
            return r || cmpText(nameOf(a), nameOf(b));
        });
        return list;
    }
    function filtered(items, p) {
        const q = p.q.trim().toLowerCase();
        const group = OWNER_GROUPS.find(g => g[0] === p.owner);
        return items.filter(it => {
            if (p.owner === 'none' && it.owners.length) return false;
            if (group && !it.owners.some(o => group[2].includes(o.type))) return false;
            if (q && ![nameOf(it), it.description, it.filename, it.date_text, ownerText(it)].join(' ').toLowerCase().includes(q)) return false;
            return true;
        });
    }

    function goOwner(o) {
        const st = S();
        if (o.person_id) { st.currentPersonId = Number(o.person_id); return A().setModule('personnes'); }
        if (o.type === 'battue' && o.battue_id) { st.enquetesTab = 'battue'; st.currentInvestigationId = 0; st.currentBattueId = Number(o.battue_id); return A().setModule('enquetes'); }
        if (o.type === 'investigation' && o.investigation_id) { st.enquetesTab = 'enquetes'; st.currentBattueId = 0; st.currentInvestigationId = Number(o.investigation_id); return A().setModule('enquetes'); }
        if (o.atelier_project) { st.atelier = {...(st.atelier || {}), project: Number(o.atelier_project), node: 'all', sel: [Number(o.atelier_item)], q: '', type: ''}; st.enquetesTab = 'atelier'; st.currentBattueId = 0; st.currentInvestigationId = 0; return A().setModule('enquetes'); }
        if (o.list_id) { st.listType = 'mylist:' + Number(o.list_id); return A().setModule('listes'); }
    }

    /** Lit la durée des fichiers qui n'en ont pas encore (un à la fois), met la cellule à jour, puis l'enregistre. */
    async function measureDurations(kind, items, isAlive, onEach) {
        const todo = items.filter(it => it.exists && it.duration == null);
        const found = {};
        for (const it of todo) {
            if (!isAlive()) break;
            const sec = await new Promise(resolve => {
                const el = document.createElement(kind);
                el.preload = 'metadata'; el.muted = true;
                const done = v => { clearTimeout(timer); el.removeAttribute('src'); el.load(); resolve(v); };
                const timer = setTimeout(() => done(null), 8000);
                el.addEventListener('loadedmetadata', () => done(isFinite(el.duration) && el.duration > 0 ? el.duration : null), {once: true});
                el.addEventListener('error', () => done(null), {once: true});
                el.src = `media/${encodeURIComponent(it.filename)}`;
            });
            if (sec) { it.duration = sec; found[it.id] = Math.round(sec * 100) / 100; onEach(it); }
        }
        if (Object.keys(found).length) { try { await A().api('save_media_durations', {}, {method: 'POST', body: {durations: found}}); } catch (_) {} }
        return Object.keys(found).length;
    }

    const kindOf = it => it.kind || (/^(audio|video)$/.test(it.media_type || '') ? it.media_type : (/\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(it.filename || '') ? 'video' : 'audio'));

    /**
     * Lecteur (liste Audios / Vidéos, enquête…) : barre de lecture, précédent / suivant, −N s / +N s, vitesse (liste + curseur
     * 0,10× à 6×, ↺ 1×), enchaînement, vidéo agrandissable. Les sons et les vidéos peuvent se suivre dans la même file.
     * opts : {kind, queue() → éléments lisibles dans l'ordre, subtitle(it), onChange(), onDuration(it)}.
     */
    function makePlayer(host, opts) {
        const kind = opts.kind;
        const p = prefs(kind); p.rate = cleanRate(p.rate);
        const skip = skipSeconds();
        const word = opts.word || (kind === 'audio' ? 'Son' : 'Vidéo');
        host.innerHTML = `<div class="av-player" hidden>
            <div class="av-now"><span class="av-now-icon">🎧</span><div><strong class="av-now-title"></strong><small class="av-now-owner muted"></small></div><span class="av-now-pos muted"></span></div>
            <div class="av-media"></div>
            <div class="av-controls">
                <button type="button" class="button small secondary" data-av="prev" title="${word} précédent(e)">⏮</button>
                <button type="button" class="button small secondary" data-av="back" title="Reculer de ${fmtSkip(skip)} (réglable dans Maintenance › Apparence)">−${fmtSkip(skip)}</button>
                <button type="button" class="button small av-toggle" data-av="toggle" title="Lecture / pause">▶</button>
                <button type="button" class="button small secondary" data-av="fwd" title="Avancer de ${fmtSkip(skip)} (réglable dans Maintenance › Apparence)">+${fmtSkip(skip)}</button>
                <button type="button" class="button small secondary" data-av="next" title="${word} suivant(e)">⏭</button>
                <span class="av-rate">Vitesse <select class="av-rate-select" aria-label="Vitesse">${rateOptions(p.rate)}</select><input type="range" class="av-rate-range" min="${RATE_MIN}" max="${RATE_MAX}" step="0.05" value="${p.rate}" aria-label="Vitesse (curseur)" title="Glisser : de ${fmtRate(RATE_MIN)} à ${fmtRate(RATE_MAX)} · double-clic : 1×"><output class="av-rate-out">${fmtRate(p.rate)}</output><button type="button" class="button small secondary av-rate-reset" title="Remettre la vitesse normale (1×)"${p.rate === 1 ? ' disabled' : ''}>↺ 1×</button></span>
                <label class="av-auto"><input type="checkbox" class="av-auto-box"${p.auto ? ' checked' : ''}> Enchaîner ${opts.chainLabel || (kind === 'audio' ? 'les sons' : 'les vidéos')}</label>
                <button type="button" class="button small secondary" data-av="size" title="Agrandir / réduire la vidéo" hidden>⤢</button>
                <button type="button" class="button small ghost" data-av="close" title="Fermer le lecteur">✕</button>
            </div>
        </div>`;
        const box = host.querySelector('.av-player');
        const q = sel => box.querySelector(sel);
        let el = null, elKind = '', current = null;
        const api = {get current() { return current ? current.id : 0; }, get el() { return el; }, get paused() { return !el || el.paused; }};
        const changed = () => { const t = q('.av-toggle'); if (t) t.textContent = !el || el.paused ? '▶' : '❚❚'; opts.onChange?.(); };
        const updatePos = () => { const list = opts.queue(), i = current ? list.findIndex(it => it.id === current.id) : -1; q('.av-now-pos').textContent = i >= 0 ? `${i + 1} / ${list.length}` : ''; };
        const makeEl = k => {
            if (el && elKind === k) return;
            if (el) { el.pause(); el.removeAttribute('src'); el.load(); el.remove(); }
            el = document.createElement(k); elKind = k;
            el.controls = true; el.preload = 'metadata'; if (k === 'video') el.playsInline = true;
            el.addEventListener('play', changed); el.addEventListener('pause', changed);
            el.addEventListener('ended', () => { if (!(p.auto && api.step(1))) changed(); });
            el.addEventListener('loadedmetadata', () => { if (current && current.duration == null && isFinite(el.duration) && el.duration > 0) { current.duration = el.duration; opts.onDuration?.(current); } });
            q('.av-media').appendChild(el);
            q('[data-av="size"]').hidden = k !== 'video';
            q('.av-now-icon').textContent = k === 'video' ? '🎬' : '🎧';
        };
        api.load = (it, play = true) => {
            if (!it || it.exists === false || !it.filename) return;
            current = it; box.hidden = false;
            makeEl(kindOf(it));
            el.src = `media/${encodeURIComponent(it.filename)}`;
            el.playbackRate = p.rate;
            q('.av-now-title').textContent = nameOf(it);
            q('.av-now-owner').textContent = opts.subtitle ? opts.subtitle(it) : '';
            if (play) el.play().catch(() => {});
            updatePos(); changed();
        };
        api.step = delta => {
            const list = opts.queue(); if (!list.length) return false;
            const i = current ? list.findIndex(it => it.id === current.id) : -1;
            const j = i < 0 ? (delta > 0 ? 0 : list.length - 1) : i + delta;
            if (j < 0 || j >= list.length) return false;
            api.load(list[j]); return true;
        };
        api.toggle = () => { if (!el || !current) return api.step(1); el.paused ? el.play().catch(() => {}) : el.pause(); };
        api.close = () => { if (el) { el.pause(); el.removeAttribute('src'); el.load(); } current = null; box.hidden = true; changed(); };
        api.updatePos = updatePos;
        const setRate = (v, from) => {
            p.rate = cleanRate(v); if (el) el.playbackRate = p.rate;
            if (from !== 'select') q('.av-rate-select').innerHTML = rateOptions(p.rate);
            if (from !== 'range') q('.av-rate-range').value = p.rate;
            q('.av-rate-out').textContent = fmtRate(p.rate);
            q('.av-rate-reset').disabled = p.rate === 1;
        };
        q('.av-rate-reset').addEventListener('click', () => { setRate(1); savePrefs(kind, {rate: p.rate, auto: p.auto}); });
        q('.av-rate-select').addEventListener('change', e => { setRate(e.target.value, 'select'); savePrefs(kind, {rate: p.rate, auto: p.auto}); });
        let rateTimer = 0;
        q('.av-rate-range').addEventListener('input', e => { setRate(e.target.value, 'range'); clearTimeout(rateTimer); rateTimer = setTimeout(() => savePrefs(kind, {rate: p.rate}), 300); });
        q('.av-rate-range').addEventListener('dblclick', () => { setRate(1); savePrefs(kind, {rate: p.rate, auto: p.auto}); });
        q('.av-auto-box').addEventListener('change', e => { p.auto = e.target.checked; savePrefs(kind, {rate: p.rate, auto: p.auto}); });
        q('.av-controls').addEventListener('click', e => {
            const b = e.target.closest('[data-av]'); if (!b) return;
            const a = b.dataset.av;
            if (a === 'toggle') return api.toggle();
            if (a === 'close') return api.close();
            if (a === 'size') return box.classList.toggle('is-big');
            if (!el || !current) return a === 'next' ? api.step(1) : null;
            if (a === 'prev') { if (el.currentTime > 3) el.currentTime = 0; else api.step(-1); }
            if (a === 'next') api.step(1);
            if (a === 'back') el.currentTime = Math.max(0, el.currentTime - skip);
            if (a === 'fwd') el.currentTime = Math.min(el.duration || Infinity, el.currentTime + skip);
        });
        // Espace : lecture / pause ; Alt + ← → : 5 s (sauf dans un champ)
        (opts.keyScope || host).addEventListener('keydown', e => {
            if (!current || !el || e.target.closest('input, select, textarea, video, audio')) return;
            if (e.key === ' ') { e.preventDefault(); el.paused ? el.play().catch(() => {}) : el.pause(); }
            if (e.key === 'ArrowRight' && e.altKey) { e.preventDefault(); el.currentTime += 5; }
            if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); el.currentTime = Math.max(0, el.currentTime - 5); }
        });
        return api;
    }

    async function renderAv(token, kind) {
        const K = KINDS[kind];
        const st = S();
        let data;
        try { data = await A().api('media_av_list', {kind}); } catch (error) { A().toast(error.message, 'error'); return; }
        if (token !== st.workspaceToken || st.module !== 'listes') return;
        const items = (data.items || []).map(it => ({...it, kind}));
        const p = prefs(kind);
        p.q = st.hAvQ?.[kind] || '';
        let view = [];
        const presentGroups = OWNER_GROUPS.filter(g => items.some(it => it.owners.some(o => g[2].includes(o.type))));
        const unlinked = items.filter(it => !it.owners.length).length;

        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page collection-page av-page" data-av-kind="${kind}">
            <header class="page-header"><div><span class="eyebrow">LISTES</span><h2>${K.icon} ${esc(K.title)}</h2><p>${esc(K.intro)}</p></div></header>
            ${items.length ? `<div class="collection-toolbar av-toolbar">
                <input type="search" id="av-q" value="${esc(p.q)}" placeholder="Chercher un titre, une fiche, une battue…">
                <label>Trier <select id="av-sort">${SORTS.map(([v, l]) => `<option value="${v}"${p.sort === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Rattaché à <select id="av-owner"><option value="">Tout</option>${presentGroups.map(g => `<option value="${g[0]}"${p.owner === g[0] ? ' selected' : ''}>${esc(g[1])}</option>`).join('')}${unlinked ? `<option value="none"${p.owner === 'none' ? ' selected' : ''}>Rattaché à rien</option>` : ''}</select></label>
                <span class="av-count muted" id="av-count"></span>
            </div>
            <div class="data-table-wrap"><table class="data-table av-table"><thead><tr><th class="av-play-col"></th><th>Titre</th><th>Durée</th><th>Rattaché à</th><th>Date</th><th>Ajouté le</th><th>Taille</th><th>Format</th><th class="av-edit-col"></th></tr></thead><tbody id="av-body"></tbody></table></div>
            <div id="av-player-host"></div>` : A().empty(`Aucun${kind === 'video' ? 'e vidéo' : ' son'} : ajoute un fichier ${kind === 'video' ? 'MP4, MOV ou WEBM' : 'MP3, M4A, WAV, AIFF ou OGG'} sur une fiche, une battue, une enquête… et ${kind === 'video' ? 'elle' : 'il'} apparaîtra ici.`)}
        </section>`;
        if (!items.length) return;
        const section = ws.querySelector('.av-page');
        const $ = sel => section.querySelector(sel);
        const alive = () => section.isConnected;
        const setDur = it => { const c = section.querySelector(`[data-av-dur="${it.id}"]`); if (c) c.textContent = fmtDur(it.duration); };
        const player = makePlayer($('#av-player-host'), {
            kind, keyScope: section,
            queue: () => view.filter(it => it.exists),
            subtitle: it => it.owners.length ? ownerText(it) : (it.date_text || ''),
            onChange: () => refreshRows(), onDuration: setDur,
        });

        const rowHtml = it => {
            const playing = it.id === player.current;
            return `<tr data-av-row="${it.id}" class="${playing ? 'is-playing' : ''}${it.exists ? '' : ' is-missing'}">
                <td class="av-play-col">${it.exists ? `<button type="button" class="av-play" data-av-play="${it.id}" title="Écouter" aria-label="Lire">${playing && !player.paused ? '❚❚' : '▶'}</button>` : '<span title="Fichier introuvable dans le dossier des médias">⚠️</span>'}</td>
                <td><strong>${esc(nameOf(it))}</strong>${it.description ? `<small class="muted av-desc">${esc(String(it.description).slice(0, 160))}</small>` : ''}${it.exists ? '' : '<small class="muted av-desc">Fichier introuvable</small>'}</td>
                <td class="av-dur" data-av-dur="${it.id}">${fmtDur(it.duration) || (it.exists ? '<span class="muted">…</span>' : '—')}</td>
                <td>${it.owners.length ? it.owners.map((o, i) => { const go = o.person_id || o.battue_id || o.investigation_id || o.atelier_project || o.list_id; return `<${go ? 'button type="button"' : 'span'} class="av-owner${go ? ' is-link' : ''}" ${go ? `data-av-owner="${it.id}:${i}"` : ''} title="${esc(o.label)}">${OWNER_ICONS[o.type] || '•'} <em>${esc(o.label)}</em> ${esc(o.name)}</${go ? 'button' : 'span'}>`; }).join('') : '<span class="muted">—</span>'}</td>
                <td>${esc(it.date_text || '')}</td>
                <td>${esc(fmtAdded(it.created_at))}</td>
                <td class="muted">${esc(fmtSize(it.size))}</td>
                <td class="muted">${esc(it.format || '')}${it.original ? ` <small title="Version modifiée ; l’original (${esc(it.original_format)}) est gardé">✂️</small>` : ''}</td>
                <td class="av-edit-col">${it.original ? `<button type="button" class="icon-button" data-av-original="${it.id}" title="${kind === 'video' ? 'Voir' : 'Écouter'} l’original (avant modification)">🕰️</button>` : ''}${it.exists ? `<button type="button" class="icon-button" data-av-edit="${it.id}" title="Modifier : couper, améliorer le son, assembler… (l’original est gardé)">✏️</button>` : ''}</td>
            </tr>`;
        };
        const draw = () => {
            view = sorted(filtered(items, p), p.sort);
            $('#av-body').innerHTML = view.length ? view.map(rowHtml).join('') : `<tr><td colspan="9" class="muted">Rien ne correspond.</td></tr>`;
            const dur = view.reduce((s, it) => s + (it.duration || 0), 0);
            $('#av-count').textContent = `${view.length} ${view.length > 1 ? K.many : K.one}${view.length !== items.length ? ` sur ${items.length}` : ''}${dur ? ` · ${fmtDur(dur)} en tout` : ''}`;
            player.updatePos();
        };
        const refreshRows = () => section.querySelectorAll('[data-av-row]').forEach(tr => {
            const on = Number(tr.dataset.avRow) === player.current;
            tr.classList.toggle('is-playing', on);
            const b = tr.querySelector('[data-av-play]'); if (b) b.textContent = on && !player.paused ? '❚❚' : '▶';
            if (on && !tr.dataset.seen) { tr.dataset.seen = '1'; tr.scrollIntoView({block: 'nearest'}); }
            if (!on) delete tr.dataset.seen;
        });
        const play = id => { if (id === player.current) player.toggle(); else player.load(items.find(x => x.id === id)); };

        draw();
        let qTimer = 0;
        $('#av-q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { p.q = e.target.value; (st.hAvQ ||= {})[kind] = p.q; draw(); }, 200); });
        $('#av-sort').addEventListener('change', e => { p.sort = e.target.value; savePrefs(kind, {sort: p.sort}); draw(); });
        $('#av-owner').addEventListener('change', e => { p.owner = e.target.value; savePrefs(kind, {owner: p.owner}); draw(); });
        $('#av-body').addEventListener('click', e => {
            const pb = e.target.closest('[data-av-play]');
            if (pb) return play(Number(pb.dataset.avPlay));
            const ed = e.target.closest('[data-av-edit]');
            if (ed) { const it = items.find(x => x.id === Number(ed.dataset.avEdit)); player.close(); return ext.openAvEditor?.({...it, media_type: kind}, {onDone: () => renderAv(++S().workspaceToken, kind)}); }
            const og = e.target.closest('[data-av-original]');
            if (og) { const it = items.find(x => x.id === Number(og.dataset.avOriginal)); return player.load({...it, id: -it.id, filename: it.original, title: nameOf(it) + ' — original', owners: it.owners}); }
            const own = e.target.closest('[data-av-owner]');
            if (own) { const [mid, i] = own.dataset.avOwner.split(':').map(Number); const o = items.find(x => x.id === mid)?.owners[i]; if (o) goOwner(o); return; }
            const tr = e.target.closest('[data-av-row]');
            if (tr && !e.target.closest('button, a')) { const id = Number(tr.dataset.avRow); if (id !== player.current) play(id); }
        });

        const n = await measureDurations(kind, items, alive, setDur);
        if (n && alive() && p.sort.startsWith('dur')) draw();
        else if (n && alive()) { const dur = view.reduce((s, it) => s + (it.duration || 0), 0); const c = $('#av-count'); if (c && dur) c.textContent = c.textContent.replace(/ · .*$/, '') + ` · ${fmtDur(dur)} en tout`; }
    }

    /**
     * Lecteur posé en bas de l'écran courant (enquête, etc.) : ext.playMedia(médias, index, {subtitle}).
     * Les médias qui ne sont ni des sons ni des vidéos sont ignorés ; la file suit l'ordre donné.
     */
    let dock = null;
    ext.playMedia = (list, index = 0, opts = {}) => {
        const queue = (list || []).filter(it => it && it.filename && /^(audio|video)$/.test(kindOf(it))).map(it => ({...it, id: Number(it.id)}));
        const start = list?.[index];
        if (!queue.length) return;
        const ws = A().$('#workspace');
        const section = ws.querySelector(':scope > section') || ws;
        let host = section.querySelector(':scope > .av-dock');
        if (!host) { host = document.createElement('div'); host.className = 'av-dock'; section.appendChild(host); dock = null; }
        if (!dock || dock.host !== host) dock = {host, queue, player: makePlayer(host, {kind: 'audio', word: 'Média', chainLabel: 'les sons et vidéos', keyScope: section, queue: () => dock.queue, subtitle: it => opts.subtitle?.(it) || it.date_text || ''})};
        dock.queue = queue;
        const first = queue.find(it => start && it.id === Number(start.id)) || queue[0];
        if (dock.player.current === first.id) dock.player.toggle(); else dock.player.load(first);
        host.querySelector('.av-player')?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    };

    ext.lists.audios = token => renderAv(token, 'audio');
    ext.lists.videos = token => renderAv(token, 'video');
})();
