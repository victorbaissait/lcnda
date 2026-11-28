/* LCNDA — 🌦 Météo d'autrefois (maquette validée docs/design/meteo.html, M1 à M11 ; serveur : lib/meteo.php).
 * Le temps qu'il faisait le jour de chaque événement (et à l'heure de l'acte quand on la connaît), sans Internet.
 *  M1 pastille sous le lieu de chaque événement de la fiche (bulle au survol, détail au clic) · M2 fenêtre du jour (540) ou panneau
 *  qui se déplie · M4 bloc « 🌦 Météo de sa vie » · M5 réglages (Réglages → 🌦 Météo d'autrefois, K2) · M6 import d'un pack (K13)
 *  · M7 widget du tableau de bord + pastilles dans « 🎂 Dates à fêter » · M8 frise (Chronologie → « 🌦 Météo ») · M9 l'heure de l'acte
 *  · M10 « À propos des données » · M11 mode sombre (meteo.css).
 * Masquer : réglage général (Toujours / Au survol / Jamais), sortes d'événements, et par personne ou par événement (clic droit sur la
 * pastille, ⋯ du détail ou du bloc) — tout se retrouve dans les réglages. Réglages : localStorage['genealogie-meteo'].
 * Rien n'est écrit dans la fiche : la météo est calculée à l'affichage. Mode consultation 🔒 et mode simple : lecture seule.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    // ⚠ la vérification « installé ? » a échoué (serveur) : on le DIT (pas « pas installé » en silence), une fois toutes les 30 s au plus
    const statusErr = e => { const now = Date.now(); if (now - (statusErr.at || 0) < 30000) return; statusErr.at = now; A().toast?.(i18n('Impossible de vérifier si ces données sont installées : {e}', {e: e?.message || String(e)}), 'error'); };
    const UI = () => window.LCNDA_UI || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const KEY = 'genealogie-meteo';
    /* ⤓ adresses de téléchargement des packs (vides tant qu'ils ne sont pas mis en ligne : la fenêtre explique alors comment les fabriquer) */
    const PACK_URLS = {complet: '', europe: '', socle: ''};
    const KINDS = [['BIRT', 'Naissance', ['BIRT']], ['BAPM', 'Baptême', ['BAPM', 'CHR', 'BAPT']], ['MARR', 'Mariage', ['MARR', 'MARB', 'MARC', 'MARL', 'MARS', 'ENGA']], ['DEAT', 'Décès', ['DEAT']],
        ['BURI', 'Inhumation', ['BURI', 'CREM']], ['CENS', 'Recensement', ['CENS']], ['TRAVEL', 'Départ, voyage', ['EMIG', 'IMMI', 'TRAV', 'TRAVEL', 'RESI']], ['OTHER', 'Tous les autres', []]];
    const DEF = {show: 'always', open: 'window', temp: 'c', rain: 'mm', phrase: true, normal: true, sources: true, block: false, curious: true, today: true, coarse: false, plus: true,
        kinds: {BIRT: true, BAPM: true, MARR: true, DEAT: true, BURI: true, CENS: false, TRAVEL: false, OTHER: false}, hidePersons: [], hideEvents: []};
    const clone = o => JSON.parse(JSON.stringify(o));
    function settings() {
        let s = {};
        try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; }
        const o = {...clone(DEF), ...s};
        o.kinds = {...DEF.kinds, ...(s.kinds || {})};
        if (!['always', 'hover', 'never'].includes(o.show)) o.show = 'always';
        if (!['window', 'fold'].includes(o.open)) o.open = 'window';
        o.offTypes = (Array.isArray(o.offTypes) ? o.offTypes : []).map(Number).filter(Boolean).slice(0, 2000);
        o.hidePersons = (Array.isArray(o.hidePersons) ? o.hidePersons : []).filter(x => x && Number(x.id)).slice(0, 500);
        o.hideEvents = (Array.isArray(o.hideEvents) ? o.hideEvents : []).filter(x => x && Number(x.id)).slice(0, 2000);
        return o;
    }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const kindOf = tag => (KINDS.find(k => k[2].includes(String(tag || '').toUpperCase())) || ['OTHER'])[0];
    // Type par type (les types d'événements qui ont au moins un événement) : s.offTypes = identifiants éteints ; la sorte (s.kinds) reste pour les anciens réglages
    const typeIdOf = (typeId, label) => Number(typeId) || Number((A()?.state?.bootstrap?.eventTypes || []).find(t => t.label === label)?.id) || 0;
    const kindOn = (tag, s = settings(), typeId = 0, label = '') => { const id = typeIdOf(typeId, label); return !!s.kinds[kindOf(tag)] && !(id && (s.offTypes || []).includes(id)); };
    const personHidden = (pid, s = settings()) => s.hidePersons.some(x => Number(x.id) === Number(pid));
    const eventHidden = (eid, s = settings()) => s.hideEvents.some(x => Number(x.id) === Number(eid));

    /* ═════════════════ Mots et nombres ═════════════════ */
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MONTHS_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const ymd = iso => String(iso || '').split('-').map(Number);
    const weekday = iso => { const [y, m, d] = ymd(iso); return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
    const dayLong = iso => { const [y, m, d] = ymd(iso); return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`; };
    const dayShort = (iso, year = true) => { const [y, m, d] = ymd(iso); return `${d === 1 ? '1er' : d} ${MONTHS_S[m - 1]}${year ? ' ' + y : ''}`; };
    const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
    const num = v => String(v).replace('-', '−');
    const T = (c, s = settings(), unit = true) => { if (c == null) return '?'; const v = s.temp === 'f' ? c * 9 / 5 + 32 : c; return `${num(Math.round(v))}${unit ? (s.temp === 'f' ? ' °F' : ' °C') : '°'}`; };
    const dT = (c, s = settings()) => { const v = Math.abs(s.temp === 'f' ? c * 9 / 5 : c); return `${Math.round(v)} ${s.temp === 'f' ? '°F' : '°C'}`; };
    const R = (mm, s = settings()) => (s.rain === 'in' ? `${String(Math.round(mm / 25.4 * 100) / 100).replace('.', ',')} po` : `${String(Math.round(mm)).replace('.', ',')} mm`);
    const wind = kmh => (kmh == null ? '' : kmh < 15 ? 'vent faible' : kmh < 40 ? `vent ${kmh} km/h` : `vent fort (rafales à ${kmh} km/h)`);
    const EV_NOUN = {BIRT: 'Naissance', BAPM: 'Baptême', MARR: 'Mariage', DEAT: 'Décès', BURI: 'Inhumation', CENS: 'Recensement', TRAVEL: 'Départ'};
    const EV_OF = {BIRT: 'la naissance', BAPM: 'le baptême', MARR: 'le mariage', DEAT: 'le décès', BURI: 'l’inhumation', CENS: 'le recensement', TRAVEL: 'le départ', OTHER: 'l’événement'};
    const EV_DU = {BIRT: 'de la naissance', BAPM: 'du baptême', MARR: 'du mariage', DEAT: 'du décès', BURI: 'de l’inhumation', CENS: 'du recensement', TRAVEL: 'du départ', OTHER: 'de l’événement'};

    /** l'allure d'une journée : icône, titre (« Matin de brouillard glacé »), phrase (« −2 °C au lever, 7 °C l'après-midi, pas de pluie ») */
    function look(r, s = settings()) {
        const d = r?.day || {}, ww = Number(d.ww) || 0, rr = Number(d.rr) || 0, nn = d.nn ?? 50, tn = d.tn, tx = d.tx;
        let icon = '☁️', title = 'Couvert', verb = 'le ciel était gris';
        if ((ww & 8) || (d.sn > 0 && (tx ?? 5) < 3)) { icon = '🌨️'; title = 'Il neigeait'; verb = 'il neigeait'; }
        else if (ww & 2) { icon = '⛈️'; title = 'Orage'; verb = 'il y avait de l’orage'; }
        else if (rr >= 10) { icon = '🌧️'; title = 'Pluie toute la journée'; verb = 'il pleuvait'; }
        else if (rr >= 2) { icon = '🌧️'; title = 'Pluie faible'; verb = 'il pleuvait un peu'; }
        else if (rr >= 0.3) { icon = '🌦️'; title = 'Quelques gouttes'; verb = 'il y a eu quelques gouttes'; }
        else if (ww & 1) { icon = '🌫️'; title = tn != null && tn <= 0 ? 'Matin de brouillard glacé' : 'Brouillard le matin'; verb = 'il y avait du brouillard'; }
        else if (tn != null && tn <= -5) { icon = '❄️'; title = 'Il faisait très froid'; verb = 'il faisait très froid'; }
        else if (tx != null && tx >= 30) { icon = '☀️'; title = 'Grand soleil et chaleur'; verb = 'il faisait très chaud'; }
        else if (nn >= 75) { icon = '☁️'; title = tx != null && tx < 10 ? 'Gris et frais' : 'Couvert'; verb = 'le ciel était gris'; }
        else if (nn >= 40) { icon = '⛅'; title = 'Nuages et éclaircies'; verb = 'le temps était mitigé'; }
        else { icon = '☀️'; title = tn != null && tn <= 0 ? 'Froid mais ensoleillé' : 'Beau temps'; verb = 'il faisait beau'; }
        const regional = !!r?.regional_rain;
        if (regional && rr >= 0.3 && !(ww & 8)) { title = icon === '🌧️' || icon === '🌦️' ? 'Gris, de la pluie dans la région' : title; verb = 'il a plu dans la région'; }
        if (r?.reliability === 'coarse') {
            const mean = tn != null && tx != null ? (tn + tx) / 2 : tx;
            const adj = mean == null ? 'variable' : mean < 0 ? 'très froid' : mean < 5 ? 'froid' : mean < 11 ? 'frais' : mean < 19 ? 'doux' : mean < 25 ? 'chaud' : 'très chaud';
            return {icon, title: `Sans doute ${adj}`, desc: tn != null && tx != null ? `Entre ${T(tn, s, false).replace('°', '')} et ${T(tx, s)}${rr >= 2 ? ', peut-être de la pluie' : ''}.` : '', verb: `il faisait sans doute ${adj}`};
        }
        const parts = [];
        if (tn != null) parts.push(`${T(tn, s)} au ${ww & 1 ? 'lever' : 'matin'}`);
        if (tx != null) parts.push(`${T(tx, s)} l’après-midi`);
        if (regional && rr >= 0.3) parts.push('il a plu dans la région');
        else if (rr >= 0.3) parts.push(`${R(rr, s)} de pluie`);
        else parts.push(nn < 25 && !(ww & 1) ? 'ciel clair' : 'pas de pluie');
        if (d.sn > 0) parts.push(`${d.sn} cm de neige`);
        const w = wind(d.fx); if (w && (d.fx < 15 || d.fx >= 40)) parts.push(w);
        return {icon, title, desc: cap(parts.join(', ')) + '.', verb};
    }
    const momentT = r => (r?.moment?.t != null ? r.moment.t : r?.day?.tx ?? r?.day?.tn);
    function badge(r) {
        const B = UI().badge || ((t, k) => `<span class="ui-badge is-${k}">${esc(t)}</span>`);
        if (r.reliability === 'measured') return B(i18n('Mesuré'), 'green', {title: i18n('Station à moins de 15 km (et moins de 150 m d’écart d’altitude)')});
        if (r.reliability === 'station') return B(i18n('Station à {n} km', {n: Math.round(r.station?.km || 0)}), 'yellow', {title: (r.station?.km || 0) > 40 ? i18n('Station entre 40 et 150 km (pack du monde, là où les stations sont rares) : une idée du temps de la région') : i18n('Station entre 15 et 40 km : indicatif (la pluie change vite d’un village à l’autre)')});
        if (r.reliability === 'estimated') return B(i18n('Estimé (carreau ≈ 30 km)'), 'yellow', {title: i18n('Réanalyse ERA5 : aucune station à moins de 40 km')});
        if (r.reliability === 'coarse') return B(i18n('Reconstitution grossière (≈ 100 km)'), 'grey', {title: i18n('Réanalyse 20CR (1836–1939) : une idée du temps, pas une mesure')});
        return '';
    }
    const badgeShort = r => (r.reliability === 'station' ? (UI().badge ? UI().badge(`${Math.round(r.station?.km || 0)} km`, 'yellow') : '') : badge(r));
    const COUNTRY = {FR: 'France', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg', IT: 'Italie', NL: 'Pays-Bas', ES: 'Espagne', DE: 'Allemagne', PT: 'Portugal', GB: 'Royaume-Uni', PL: 'Pologne', DK: 'Danemark', CZ: 'Tchéquie', SK: 'Slovaquie'};
    let regionNames = null; // les autres pays (packs du monde) : le nom donné par le navigateur
    const countryName = c => COUNTRY[c] || (() => { try { regionNames = regionNames || new Intl.DisplayNames(['fr'], {type: 'region'}); return regionNames.of(c) || c; } catch (_) { return c; } })();
    // 🧺 une date hors des données installées ici (trop tôt, ou pas encore dans les packs) : dire de quand à quand c'est possible
    const outOfSpan = r => { const y = Number(String(r?.date || '').slice(0, 4)); return r?.why === 'far' && r.span && y && (y < r.span.from || y > r.span.to) ? y : 0; };
    const emptyText = r => outOfSpan(r) ? i18n(outOfSpan(r) > r.span.to ? 'Pas encore de météo pour {year} ici : les données installées couvrent ce lieu de {from} à {to}.' : 'Pas de météo pour {year} ici : les données installées couvrent ce lieu de {from} à {to}.', {year: String(outOfSpan(r)), from: String(r.span.from), to: String(r.span.to)}) : i18n(r.why === 'nodata' ? 'Les données météo ne sont pas installées.' : r.why === 'place' ? 'Le lieu n’a pas de coordonnées : place-le sur la carte pour avoir sa météo.'
        : r.why === 'date' ? 'La date n’est pas connue au jour près.'
        : r.why === 'out' ? 'Pas de météo pour ce lieu : aucune station connue à moins de 150 km dans les données installées (Réglages → 🌦 Météo d’autrefois : le pack Europe et les packs du monde ajoutent les autres pays).' : r.first ? 'Pas de relevé connu près d’ici avant {year} (première station : {name}).' : 'Pas de relevé connu près d’ici avant {year}.', {year: String(r.first?.year || 1836), name: r.first?.name || ''});
    const sourcesLine = r => (r.sources || []).map(x => { const m = x.mention || x.nom || ''; return `${x.id === 'era5' && r.hours_source && r.reliability !== 'estimated' ? 'Heures : ' : ''}${m}${x.licence && !/Copernicus|20th/.test(m) ? ', ' + x.licence : ''}`; }).join(' · ');
    const shown = (r, s = settings()) => r && r.ok && (r.reliability !== 'coarse' || s.coarse);

    /* ═════════════════ M1 : la pastille sur la fiche ═════════════════ */
    const cache = new Map(); // id d'événement → résultat
    function pillHtml(r, s = settings(), extra = '') {
        const lk = look(r, s);
        return `<button type="button" class="wx-pill" data-wx-event="${Number(r.event_id) || ''}" data-tip-off aria-label="Météo : ${esc(lk.title)}, ${esc(T(momentT(r), s))} — voir le détail">${lk.icon} ${esc(T(momentT(r), s))}${extra}</button>`;
    }
    /** pose les pastilles dans les lignes d'événement (data-event-id) d'un bloc */
    async function decorate(root, {personId = 0, rowSel = '.event-row[data-event-id]', after = null} = {}) {
        const s = settings();
        root = root || document;
        root.classList?.toggle('wx-hover-only', s.show === 'hover');
        const rows = [...root.querySelectorAll(rowSel)].filter(row => !row.querySelector('.wx-pill, .wx-fold'));
        if (!rows.length || s.show === 'never' || (personId && personHidden(personId, s))) return;
        const want = rows.filter(row => { const id = Number(row.dataset.eventId); return id && !eventHidden(id, s) && (!row.dataset.eventTag || kindOn(row.dataset.eventTag, s, row.dataset.eventTypeId)); });
        const missing = [...new Set(want.map(r => Number(r.dataset.eventId)).filter(id => !cache.has(id)))];
        for (let i = 0; i < missing.length; i += 120) {
            try { const res = await api('meteo_events', {ids: missing.slice(i, i + 120).join(',')}); if (!res.installed) { ext.meteo.installed = false; return; } ext.meteo.installed = true; Object.entries(res.events || {}).forEach(([id, r]) => cache.set(Number(id), r)); }
            catch (_) { return; } // pas de message : la météo n'est qu'un plus
        }
        want.forEach(row => {
            const r = cache.get(Number(row.dataset.eventId));
            if (!r || row.querySelector('.wx-pill') || !shown(r, s) || (r.tag && !kindOn(r.tag, s, r.type_id, r.type))) return;
            const html = `<div class="wx-line">${pillHtml(r, s)}</div>`;
            if (after) { after(row, html); return; }
            const content = row.querySelector('.event-content') || row;
            const place = content.querySelector(':scope > p');
            if (place) place.insertAdjacentHTML('afterend', html); else (content.querySelector('.item-title-row') || content.firstElementChild || content).insertAdjacentHTML('afterend', html);
        });
    }

    /* la bulle au survol (une phrase + la fiabilité) */
    let pop = null, popTimer = 0;
    function showPop(btn) {
        const r = cache.get(Number(btn.dataset.wxEvent)); if (!r) return;
        const s = settings(), lk = look(r, s);
        hidePop();
        pop = document.createElement('div'); pop.className = 'wx-pop'; pop.setAttribute('role', 'tooltip');
        const when = r.moment?.kind === 'hour' ? `À l’heure de l’acte (≈ ${esc(r.moment.label)}) : ${esc(T(r.moment.t, s))}.` : r.moment?.kind === 'night' ? 'L’acte est de la nuit : la température la plus basse de la journée (avant 1940, la journée seulement).' : '';
        pop.innerHTML = `<b>${lk.icon} ${esc(lk.title)}</b><br>${s.phrase ? esc(lk.desc) : ''}${when ? `<br><span class="muted">${when}</span>` : ''}<div class="wx-pop-foot">${badge(r)}<span class="wx-link">Cliquer pour le détail</span></div>`;
        document.body.appendChild(pop);
        const b = btn.getBoundingClientRect(), p = pop.getBoundingClientRect();
        const left = Math.max(8, Math.min(innerWidth - p.width - 8, b.left));
        const top = b.bottom + 8 + p.height > innerHeight ? b.top - p.height - 8 : b.bottom + 8;
        pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
    }
    function hidePop() { clearTimeout(popTimer); pop?.remove(); pop = null; }
    document.addEventListener('mouseover', e => { const b = e.target.closest?.('.wx-pill'); if (!b) return; clearTimeout(popTimer); popTimer = setTimeout(() => b.isConnected && b.matches(':hover') && showPop(b), 400); });
    document.addEventListener('mouseout', e => { if (e.target.closest?.('.wx-pill') && !e.relatedTarget?.closest?.('.wx-pill')) hidePop(); });
    document.addEventListener('focusin', e => { const b = e.target.closest?.('.wx-pill'); if (b && b.matches(':focus-visible')) showPop(b); });
    document.addEventListener('focusout', e => { if (e.target.closest?.('.wx-pill')) hidePop(); });
    document.addEventListener('click', e => {
        const b = e.target.closest?.('.wx-pill'); if (!b) return;
        e.preventDefault(); e.stopPropagation(); hidePop();
        const id = Number(b.dataset.wxEvent); if (!id) return;
        const s = settings();
        if (s.open === 'fold' && b.closest('.event-row')) return toggleFold(b, id);
        openDay(id);
    }, true);
    document.addEventListener('contextmenu', e => {
        const b = e.target.closest?.('.wx-pill'); if (!b || e.shiftKey) return;
        const r = cache.get(Number(b.dataset.wxEvent)); if (!r) return;
        hidePop(); UI().contextMenu?.(e, menuItems(r, {detail: true}));
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePop(); });

    /** les actions « ⋯ » : détail, masquer pour cet événement / cette personne, réglages */
    function menuItems(r, {detail = false, after = null} = {}) {
        const pid = Number(r.person_id || currentPerson()?.id || 0);
        const items = [];
        if (detail) items.push({icon: '↗', label: 'Voir le détail du jour', run: () => openDay(r.event_id)});
        if (!kiosk()) {
            items.push({icon: '🙈', label: 'Masquer la météo de cet événement', run: () => { hideEvent(r); after?.(); }});
            if (pid) items.push({icon: '🙈', label: 'Masquer la météo de cette personne', run: () => { hidePerson(pid); after?.(); }});
        }
        items.push('-', {icon: '⚙️', label: 'Réglages de la météo', run: openSettings}, {icon: '📚', label: 'À propos des données', run: openAbout});
        return items;
    }
    function currentPerson() { const st = A().state || {}; return st.module === 'personnes' && st.currentPersonId ? {id: Number(st.currentPersonId)} : null; }
    function personLabel(pid) { const h = document.querySelector('#workspace .person-hero h2, #workspace .person-hero h1'); return (h?.textContent || '').trim() || `Fiche n° ${pid}`; }
    function refreshAfterHide() { document.querySelectorAll('.wx-line, .wx-fold').forEach(x => x.remove()); A().refreshScreen ? A().refreshScreen() : null; }
    function hideEvent(r) {
        const before = settings();
        const label = `${r.type || EV_NOUN[kindOf(r.tag)] || 'Événement'}${r.date ? ' · ' + dayShort(r.date) : ''}${r.place ? ' · ' + r.place : ''}${r.who ? ' — ' + r.who : ''}`;
        const s = settings(); if (!eventHidden(r.event_id, s)) s.hideEvents.push({id: Number(r.event_id), label}); save(s);
        document.querySelectorAll(`.wx-pill[data-wx-event="${Number(r.event_id)}"]`).forEach(p => p.closest('.wx-line')?.remove() || p.remove());
        undoToast('🙈 Météo masquée pour cet événement', before);
    }
    function hidePerson(pid) {
        const before = settings();
        const s = settings(); if (!personHidden(pid, s)) s.hidePersons.push({id: Number(pid), label: personLabel(pid)}); save(s);
        refreshAfterHide();
        undoToast('🙈 Météo masquée pour cette personne', before);
    }
    function undoToast(msg, before) {
        const after = settings();
        A().undoToast ? A().undoToast(i18n('{what} (la retrouver : Réglages → 🌦 Météo d’autrefois)', {what: i18n(msg)}), {undo: async () => { save(before); refreshAfterHide(); }, redo: async () => { save(after); refreshAfterHide(); }}) : A().toast?.(msg);
    }

    /* ═════════════════ M2 : le détail d'un jour ═════════════════ */
    const MOMENTS = {0: 'Nuit', 6: 'Matin', 12: 'Midi', 18: 'Soir'};
    function dayHtml(r, s = settings(), {compact = false} = {}) {
        if (!r.ok) return (A().empty ? A().empty(emptyText(r), {icon: '🌦'}) : esc(emptyText(r))) + (r.alt ? `<dl class="wx-kv"><dt>Ton lieu</dt><dd>${esc(`${r.alt.from === 'carte' ? '≈ ' : ''}${metres(r.alt.m)}${r.alt.from === 'carte' ? ' (carte du relief)' : ''}`)}</dd></dl>` : '');
        const lk = look(r, s), parts = [];
        parts.push(`<div class="wx-say"><span class="wx-big" aria-hidden="true">${lk.icon}</span><p><b>${esc(lk.title)}.</b>${s.phrase ? `<br>${esc(lk.desc)}` : ''}</p></div>`);
        if (r.hours?.length) {
            parts.push(`<div class="wx-cols">${r.hours.map(h => { const on = r.moment?.kind === 'hour' && r.moment.h === h.h; const hl = look({day: {tn: h.t, tx: h.t, rr: h.rr, nn: h.nn, ww: h.ww}}, s);
                return `<div class="${on ? 'is-on' : ''}"><small>${esc(MOMENTS[h.h] || '')} · ${h.h} h</small><span class="wx-i" aria-hidden="true">${hl.icon}</span><span class="wx-d">${esc(T(h.t, s))}</span><span class="wx-e">${esc(R(h.rr || 0, s))}${h.fx != null ? `<br>vent ${h.fx} km/h` : ''}</span></div>`; }).join('')}</div>`);
        }
        if (r.time?.label) parts.push(`<div class="wx-ok">✓ Compris : ${esc(r.time.label)}${r.moment?.kind === 'hour' ? ` → valeur la plus proche : ${esc(r.moment.label)}${r.hours?.length ? ' (en bleu)' : ''}` : ' — avant 1940 : la journée seulement'}.</div>`);
        if (s.normal && r.normal && r.normal.anomaly != null) {
            const a = r.normal.anomaly, near = Math.abs(a) < 1;
            const where = r.station?.short ? ` à ${r.station.short}` : '';
            parts.push(`<div class="wx-norm"><span aria-hidden="true">${near ? '〰️' : a < 0 ? '📉' : '📈'}</span><span>${near ? '<b>Proche de la normale</b>' : `<b>${esc(dT(a, s))} ${a < 0 ? 'sous' : 'au-dessus de'} la normale</b>`} ${MONTHS[r.normal.month - 1] && /^[aeiouéo]/.test(MONTHS[r.normal.month - 1]) ? 'd’' : 'de '}${esc(MONTHS[r.normal.month - 1])} ${esc(r.normal.period)}${esc(where)} (min. ${esc(T(r.normal.tn, s))}, max. ${esc(T(r.normal.tx, s))}).</span></div>`);
        }
        if (s.plus && r.plus) parts.push(plusHtml(r, s, {compact}));
        if (!compact) {
            const rows = [['Fiabilité', badge(r)]];
            if (r.station) rows.push(['Station', esc(`${r.station.name} · à ${Math.round(r.station.km)} km${r.station.alt != null ? `, ${metres(r.station.alt)}` : ''}${r.alt ? ` — ton lieu ${r.alt.from === 'carte' ? '≈ ' : ''}${metres(r.alt.m)}` : ''}`)]);
            else if (r.alt) rows.push(['Ton lieu', esc(`${r.alt.from === 'carte' ? '≈ ' : ''}${metres(r.alt.m)}${r.alt.from === 'carte' ? ' (carte du relief)' : ''}`)]);
            if (r.cell) rows.push(['Carreau', esc(`${r.cell.source === '20cr' ? '20CR, ≈ 100 km' : 'ERA5, ≈ 30 km'} · centre à ${Math.round(r.cell.km)} km`)]);
            if (r.hours_source) rows.push(['Heures', esc(r.hours_source)]);
            parts.push(`<dl class="wx-kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`);
            if (r.around?.length) parts.push(`<span class="wx-lab">3 jours avant · 3 jours après</span><div class="wx-strip">${r.around.map(a => { const al = look({day: a.day || {}}, s);
                return `<div class="${a.on ? 'is-on' : ''}"><small>${esc(dayShort(a.date, false))}</small><span class="wx-i" aria-hidden="true">${a.day ? al.icon : '·'}</span>${a.day?.tx != null ? esc(T(a.day.tx, s, false)) : '—'}</div>`; }).join('')}</div>`);
        } else {
            parts.push(`<div class="wx-fold-meta">${badge(r)}<span class="muted">${esc([r.station ? `${r.station.short}, ${Math.round(r.station.km)} km` : '', r.normal?.anomaly != null && Math.abs(r.normal.anomaly) >= 1 ? `${dT(r.normal.anomaly, s)} ${r.normal.anomaly < 0 ? 'sous' : 'au-dessus de'} la normale` : ''].filter(Boolean).join(' · '))}</span></div>`);
        }
        const cx = !compact && !kiosk() && ext.connexions && ext.connexions.enabled?.() !== false ? `<button type="button" class="link-button" data-wx-cxtake>🧺 ${esc(i18n('Au panier'))}</button><button type="button" class="link-button" data-wx-cxput>📍 ${esc(i18n('Mettre dans…'))}</button>` : '';
        parts.push(`<div class="wx-links">${cx}${compact ? `<button type="button" class="link-button" data-wx-full="${Number(r.event_id) || ''}">Tout le détail…</button>` : ''}<button type="button" class="link-button" data-wx-about>↗ Source</button><button type="button" class="link-button" data-wx-map>🗺 Voir sur la carte</button>${r.place_id && !kiosk() && !compact ? `<button type="button" class="link-button" data-wx-place-edit="${Number(r.place_id)}">⛰ Altitude du lieu</button>` : ''}${r.event_id ? `<button type="button" class="icon-button wx-more" data-wx-more title="Plus d’actions" aria-label="Plus d’actions">⋯</button>` : ''}</div>`);
        if (!compact || s.sources) parts.push(`<div class="wx-src">${esc(sourcesLine(r))}</div>`); // la ligne des sources reste toujours dans le détail (licences)
        return parts.join('');
    }
    /* les compléments Copernicus (packs « plus-… », lib/meteo_plus.php) : une phrase par complément, les sources repliées */
    const utciWord = v => (v > 46 ? 'chaleur extrême' : v > 38 ? 'chaleur très forte' : v > 32 ? 'forte chaleur' : v > 26 ? 'chaleur modérée' : v >= 9 ? 'pas de gêne' : v >= 0 ? 'un peu de froid' : v >= -13 ? 'froid modéré' : v >= -27 ? 'froid fort' : v >= -40 ? 'froid très fort' : 'froid extrême');
    const nf = (v, d = 0) => Number(v).toLocaleString('fr-FR', {maximumFractionDigits: d});
    function plusLines(r, s = settings()) {
        const p = r.plus || {}, out = [];
        const sn = p.snow;
        if (sn && (sn.sh > 0 || sn.sf > 0)) {
            out.push(['❄️', sn.sh > 0 ? `<b>${esc(i18n('Neige au sol : {n} cm', {n: nf(sn.sh)}))}</b>${sn.sf > 0 ? esc(i18n(' ; il en est tombé ≈ {n} cm ce jour-là', {n: nf(sn.sf)})) : ''}.`
                : esc(i18n('Il est tombé ≈ {n} cm de neige ce jour-là (pas de neige au sol le matin).', {n: nf(sn.sf)})), 'era5land']);
        }
        const fe = p.feel;
        if (fe) {
            if (fe.ux != null && fe.ux > 26) out.push(['🥵', esc(i18n('Ressenti au plus chaud : {t} ({w}).', {t: T(fe.ux, s), w: i18n(utciWord(fe.ux))})), 'utci']);
            if (fe.un != null && fe.un < 0) out.push(['🥶', esc(i18n('Ressenti au plus froid : {t} ({w}).', {t: T(fe.un, s), w: i18n(utciWord(fe.un))})), 'utci']);
            if (!(fe.ux > 26) && !(fe.un < 0) && fe.ux != null && fe.un != null) out.push(['🙂', esc(i18n('Ressenti : de {a} à {b} (pas de gêne).', {a: T(fe.un, s), b: T(fe.ux, s)})), 'utci']);
        }
        const rv = p.river;
        if (rv && rv.mean > 0) {
            const ratio = rv.q / rv.mean;
            const state = rv.q >= rv.p99 ? 'en crue' : rv.q >= rv.p90 ? 'hautes eaux' : rv.q <= rv.p10 ? 'basses eaux' : '';
            const cmp = ratio >= 1.5 ? i18n('{n} fois son débit moyen', {n: nf(ratio, 1)}) : ratio <= 0.67 ? i18n('{n} % de son débit moyen', {n: nf(Math.round(ratio * 100))}) : i18n('proche de son débit moyen');
            out.push([state === 'en crue' ? '🌊' : '〰️', `${esc(i18n('La grande rivière la plus proche (à {km} km) : {q} m³/s, {cmp}', {km: nf(Math.max(1, Math.round(rv.km))), q: nf(rv.q, rv.q < 10 ? 1 : 0), cmp}))}${state ? ` — <b>${esc(i18n(state))}</b>` : ''}.`, 'glofas']);
        }
        const fi = p.fine;
        if (fi && r.reliability !== 'measured' && (fi.tn != null || fi.tx != null)) {
            out.push(['🌡', esc(i18n('Au plus près ({src}, carreau ≈ {size} km) : min. {tn}, max. {tx}.', {src: fi.source === 'cerra' ? 'CERRA' : 'ERA5-Land', size: nf(fi.size, 1), tn: T(fi.tn, s), tx: T(fi.tx, s)})), fi.source]);
        }
        return out;
    }
    function plusHtml(r, s = settings(), {compact = false} = {}) {
        const lines = plusLines(r, s);
        if (!lines.length) return '';
        const srcs = (r.plus.sources || []).filter(x => lines.some(l => l[2] === x.id));
        const more = !compact && srcs.length ? `<details class="wx-plus-more"><summary>${esc(i18n('▸ Sources des compléments'))}</summary><ul>${srcs.map(x => `<li><b>${esc(x.nom)}</b> — ${esc(x.licence)}${x.mention ? ` — « ${esc(x.mention)} »` : ''}${x.url ? ` <a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(i18n('↗ source'))}</a>` : ''}</li>`).join('')}</ul></details>` : '';
        return `<div class="wx-plus" data-wx-plus>${lines.map(([icon, html]) => `<div class="wx-norm wx-plus-line"><span aria-hidden="true">${icon}</span><span>${html}</span></div>`).join('')}${more}</div>`;
    }
    async function openDay(id, {result = null} = {}) {
        let r = result;
        const dlg = document.createElement('dialog');
        dlg.className = 'modal small-modal wx-dialog';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow" data-wx-eye>🌦 MÉTÉO D’AUTREFOIS</span><h2 data-wx-title>…</h2></div><button type="button" class="icon-button" data-wx-x aria-label="Fermer">×</button></div><div class="wx-body" data-wx-body>${UI().spinner ? UI().spinner('Lecture des données météo…') : ''}</div><div class="modal-actions"><span class="spacer"></span><button type="submit" class="button secondary">Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        dlg.querySelector('[data-wx-x]').addEventListener('click', () => dlg.close());
        dlg.showModal();
        try { if (!r) r = (await api('meteo_event', {id})).result; }
        catch (e) { dlg.querySelector('[data-wx-body]').innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; }
        const s = settings();
        const what = `${r.type || 'Événement'}${r.who ? ' de ' + r.who : ''}`;
        dlg.querySelector('[data-wx-eye]').textContent = `${i18n('🌦 MÉTÉO D’AUTREFOIS')} · ${i18n(what).toUpperCase()}`;
        dlg.querySelector('[data-wx-title]').textContent = r.date ? `${cap(weekday(r.date))} ${dayLong(r.date)}${r.place ? ' · ' + r.place : ''}` : (r.place || 'Météo');
        const body = dlg.querySelector('[data-wx-body]');
        body.innerHTML = dayHtml(r, s);
        bindDay(body, r, () => dlg.close());
    }
    function bindDay(box, r, close = null) {
        box.addEventListener('click', e => {
            if (e.target.closest('[data-wx-about]')) return openAbout();
            if (e.target.closest('[data-wx-map]')) return openMap(r);
            if (e.target.closest('[data-wx-cxtake]')) return ext.connexions?.take?.([dayItem(r)]); // 🧺 heritage-connexions.js
            if (e.target.closest('[data-wx-cxput]')) { close?.(); return ext.connexions?.putInto?.([dayItem(r)]); }
            const pe = e.target.closest('[data-wx-place-edit]'); if (pe) return editPlaceAltitude(Number(pe.dataset.wxPlaceEdit), () => { cache.clear(); close?.(); openDay(r.event_id); A().state?.module === 'personnes' && A().refreshScreen?.(); });
            const full = e.target.closest('[data-wx-full]'); if (full) return openDay(Number(full.dataset.wxFull));
            const more = e.target.closest('[data-wx-more]'); if (more) UI().menuAt?.(more, menuItems(r, {after: () => close?.()}));
        });
    }
    /* ═════════════════ 🧺 Prendre la météo d'un jour (heritage-connexions.js) : des infos précises, sourcées ═════════════════ */
    const strip = h => { const d = document.createElement('div'); d.innerHTML = h; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
    function factsOf(r, s = settings()) {
        const lk = look(r, s), d = r.day || {}, out = [], url = (r.sources || []).map(x => x.url).find(Boolean) || '', src = sourcesLine(r);
        out.push({label: i18n('Le temps'), value: `${lk.icon} ${lk.title}. ${lk.desc}`.trim()});
        if (d.tn != null) out.push({label: i18n('Température la plus basse'), value: T(d.tn, s)});
        if (d.tx != null) out.push({label: i18n('Température la plus haute'), value: T(d.tx, s)});
        if (d.rr != null) out.push({label: i18n('Pluie'), value: R(d.rr, s)});
        if (d.sn > 0) out.push({label: i18n('Neige'), value: `${d.sn} cm`});
        if (r.normal?.anomaly != null) out.push({label: i18n('Par rapport à la normale'), value: Math.abs(r.normal.anomaly) < 1 ? i18n('proche de la normale') : `${dT(r.normal.anomaly, s)} ${r.normal.anomaly < 0 ? i18n('sous') : i18n('au-dessus de')} ${i18n('la normale')} (${r.normal.period})`});
        plusLines(r, s).forEach(([, html]) => out.push({label: i18n('Complément'), value: strip(html)}));
        out.push({label: i18n('Fiabilité'), value: [strip(badge(r)), r.station ? i18n('station {n} à {k} km', {n: r.station.name, k: Math.round(r.station.km)}) : r.cell ? i18n('carreau {s}', {s: r.cell.source === '20cr' ? '20CR (≈ 100 km)' : 'ERA5 (≈ 30 km)'}) : ''].filter(Boolean).join(' · ')});
        return {facts: out.map(f => ({...f, url, source: src})), source: src, url};
    }
    function dayItem(r) {
        const f = factsOf(r), title = `🌦 ${i18n('Météo du {d}', {d: r.date ? dayLong(r.date) : ''})}${r.place ? ` · ${r.place}` : ''}`;
        return {kind: 'data', title, value: f.facts.map(x => `${x.label} : ${x.value}`).join(' · '), data: {facts: f.facts, date: r.date, place: r.place}, origin: {label: `${i18n('Météo d’autrefois')} — ${f.source}`, url: f.url, person_id: Number(r.person_id) || 0}};
    }
    async function dayAt(place, date) {
        const lat = place?.lat ?? place?.latitude, lon = place?.lon ?? place?.longitude;
        if (lat == null || lon == null) throw new Error(i18n('Le lieu n’a pas de coordonnées : place-le sur la carte pour avoir sa météo.'));
        const r = await api('meteo_point', {lat, lon, date, country: place.country || '', place: place.name || '', detail: '1'});
        if (r.installed === false) { const e = new Error(i18n('Les données météo ne sont pas installées.')); e.notInstalled = true; throw e; }
        const day = r.result || {}; if (!day.ok) throw new Error(emptyText(day));
        return {...day, date: day.date || date, place: day.place || place.name || ''};
    }
    /* « 📥 Prendre depuis… → 🧰 Données → 🌦 Météo d'autrefois » : pour une date et un lieu (ou du… au…), sans fiche */
    (ext.pickSources = ext.pickSources || []).push({id: 'meteo_jour', icon: '🌦', label: 'Météo d’autrefois', group: 'Le lieu', needs: ['place', 'date'], source: 'Météo d’autrefois (packs installés)',
        enabled: () => settings().on !== false,
        installed: async () => { const st = await api('meteo_status'); return Object.values(st.files || {}).some(f => f && f.ok); }, // une erreur remonte : ce n'est pas « pas installé »
        install: () => openSettings(),
        fetch: async ctx => { const r = await dayAt(ctx.place, ctx.date); const f = factsOf(r); return {title: `🌦 ${i18n('Météo du {d}', {d: dayLong(r.date)})} · ${r.place}`, ...f}; },
        range: async (ctx, progress) => {
            const days = []; for (let t = Date.parse(ctx.from + 'T12:00:00Z'), end = Date.parse(ctx.to + 'T12:00:00Z'); t <= end && days.length < 92; t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
            const rows = [], s = settings(); let url = '', source = '';
            for (let i = 0; i < days.length; i++) {
                progress?.(i + 1, days.length);
                try { const r = await dayAt(ctx.place, days[i]), lk = look(r, s), d = r.day || {}, f = factsOf(r, s); url = url || f.url; source = source || f.source;
                    rows.push([days[i], `${lk.icon} ${lk.title}`, d.tn != null ? T(d.tn, s) : '', d.tx != null ? T(d.tx, s) : '', d.rr != null ? R(d.rr, s) : '', strip(badge(r))]); }
                catch (e) { if (e.notInstalled) throw e; rows.push([days[i], '—', '', '', '', e.message]); }
            }
            if (rows.length && rows.every(x => x[1] === '—') && new Set(rows.map(x => x[5])).size === 1) throw new Error(rows[0][5]); // rien sur toute la période : la raison une fois (ex. « couvrent ce lieu de 1836 à 2025 »)
            return {columns: [i18n('Jour'), i18n('Temps'), i18n('Min.'), i18n('Max.'), i18n('Pluie'), i18n('Fiabilité')], rows, source, url};
        }});

    /* variante : le panneau qui se déplie sous l'événement */
    async function toggleFold(btn, id) {
        const row = btn.closest('.event-row'), open = row.querySelector('.wx-fold');
        if (open) { open.remove(); btn.classList.remove('is-open'); btn.innerHTML = btn.innerHTML.replace(/ ▴$/, ''); return; }
        btn.classList.add('is-open'); btn.insertAdjacentText('beforeend', ' ▴');
        const fold = document.createElement('div'); fold.className = 'wx-fold'; fold.innerHTML = UI().spinner ? UI().spinner('Lecture…') : '';
        (row.querySelector('.event-content') || row).appendChild(fold);
        try { const r = (await api('meteo_event', {id})).result; fold.innerHTML = dayHtml(r, settings(), {compact: true}); bindDay(fold, r); }
        catch (e) { fold.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); }
    }
    /* 🗺 le lieu, la station et le carreau sur une petite carte */
    function openMap(r) {
        const pts = [{lat: r.lat, lon: r.lon, label: r.place || 'Le lieu', color: '#0057d9'}];
        const paths = [];
        if (r.station) pts.push({lat: r.station.lat, lon: r.station.lon, label: `Station : ${r.station.name}`, color: '#1f8a3b'});
        if (r.cell) { const h = r.cell.source === '20cr' ? 0.5 : 0.125; const {lat, lon} = r.cell; paths.push({coords: [[lat - h, lon - h], [lat - h, lon + h], [lat + h, lon + h], [lat + h, lon - h], [lat - h, lon - h]], color: '#c98a00', dashed: true}); }
        const map = ext.miniMap ? ext.miniMap(pts, paths, {height: 380}) : '';
        const legend = `<ul class="wx-map-legend"><li><i style="--c:#0057d9"></i>${esc(r.place || 'Le lieu de l’événement')}</li>${r.station ? `<li><i style="--c:#1f8a3b"></i>Station ${esc(r.station.name)} (${Math.round(r.station.km)} km)</li>` : ''}${r.cell ? `<li><i class="sq"></i>Carreau ${r.cell.source === '20cr' ? '20CR (≈ 100 km)' : 'ERA5 (≈ 30 km)'}</li>` : ''}</ul>`;
        if (ext.openDialog) ext.openDialog({eyebrow: '🌦 MÉTÉO D’AUTREFOIS', title: 'Le lieu, la station et le carreau', body: `${map}${legend}`});
    }

    /* ═════════════════ ⛰ L'altitude d'un lieu (saisie > carte du relief) ═════════════════ */
    const metres = m => `${Math.round(Number(m)).toLocaleString('fr-FR')} m`;
    /** la case « Altitude » : vide = automatique (« ≈ 312 m (carte du relief) » en gris) ; un nombre = saisi à la main */
    function altFieldHtml(d) {
        const auto = d.auto != null ? `≈ ${metres(d.auto)} (carte du relief)` : (d.has_coords ? 'pas d’altitude sur la carte du relief ici' : 'place d’abord le lieu sur la carte');
        return `<div class="wx-alt" data-wx-alt-id="${Number(d.id)}"><label class="wx-alt-l">Altitude<input type="number" name="altitude" step="1" min="-450" max="8900" data-unit="m" value="${d.altitude != null ? esc(Math.round(d.altitude)) : ''}" placeholder="${esc(d.auto != null ? '≈ ' + d.auto : '')}" ${kiosk() ? 'disabled' : ''}></label>
            <small class="wx-alt-auto">${d.altitude != null ? `saisie à la main · carte du relief : ${esc(d.auto != null ? '≈ ' + metres(d.auto) : '—')}` : esc(auto)}</small>
            ${d.altitude != null && !kiosk() ? '<button type="button" class="link-button" data-wx-alt-reset>↺ Remettre l’altitude de la carte</button>' : ''}</div>`;
    }
    async function saveAltitude(id, value, before, after) {
        try { await api('meteo_place_altitude', {}, {method: 'POST', body: {id, altitude: value}}); }
        catch (e) { A().toast(e.message, 'error'); return false; }
        cache.clear();
        A().undoToast?.(value === null ? i18n('↺ Altitude remise à celle de la carte') : i18n('⛰ Altitude enregistrée : {n}', {n: metres(value)}), {
            undo: async () => { await api('meteo_place_altitude', {}, {method: 'POST', body: {id, altitude: before}}); cache.clear(); after?.(); },
            redo: async () => { await api('meteo_place_altitude', {}, {method: 'POST', body: {id, altitude: value}}); cache.clear(); after?.(); }});
        after?.();
        return true;
    }
    function bindAlt(box, d, after) {
        box.querySelector('[name=altitude]')?.addEventListener('change', async e => {
            const raw = e.target.value.trim(), v = raw === '' ? null : Number(raw);
            if (v !== null && (!Number.isFinite(v) || v < -450 || v > 8900)) { UI().fieldError ? UI().fieldError(e.target, 'Entre −450 et 8 900 m.') : A().toast('Altitude impossible.', 'error'); return; }
            await saveAltitude(d.id, v, d.altitude, after);
        });
        box.querySelector('[data-wx-alt-reset]')?.addEventListener('click', () => saveAltitude(d.id, null, d.altitude, after));
    }
    /** dans la monographie de la commune (Graphiques → Lieux) : la case Altitude du lieu */
    async function placeAltitudeInto(host) {
        const id = Number(host.dataset.wxPlaceAlt); if (!id) return;
        let d; try { d = await api('meteo_place', {id}); } catch (_) { return; }
        if (!host.isConnected) return;
        host.innerHTML = altFieldHtml(d);
        bindAlt(host, d, () => placeAltitudeInto(host));
    }
    /** la fenêtre « Altitude du lieu » (depuis le détail du jour) */
    async function editPlaceAltitude(id, onDone) {
        let changed = false; const after = () => { changed = true; };
        let d; try { d = await api('meteo_place', {id}); } catch (e) { return A().toast(e.message, 'error'); }
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal wx-alt-dialog';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">⛰ LIEU</span><h2>${i18n('Altitude de {name}', {name: esc(d.name || i18n('ce lieu'))})}</h2></div><button type="button" class="icon-button" data-wx-x aria-label="Fermer">×</button></div>
            <div class="wx-body"><p class="muted">Elle sert à choisir la station météo la plus semblable (en montagne, une station de plaine toute proche ne dit pas le temps qu’il faisait là-haut). Laisse la case vide pour garder celle de la carte du relief.</p>${altFieldHtml(d)}</div>
            <div class="modal-actions"><span class="spacer"></span><button type="submit" class="button secondary">Fermer</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => { dlg.remove(); if (changed) onDone?.(); }); dlg.querySelector('[data-wx-x]').addEventListener('click', () => dlg.close());
        const redraw = async () => { const n = await api('meteo_place', {id}); d = n; const box = dlg.querySelector('.wx-alt'); if (box) { box.outerHTML = altFieldHtml(n); bindAlt(dlg.querySelector('.wx-alt'), n, () => { redraw(); after?.(); }); } };
        bindAlt(dlg.querySelector('.wx-alt'), d, () => { redraw(); after?.(); });
        dlg.showModal();
    }

    /* ═════════════════ M10 : à propos des données ═════════════════ */
    async function openAbout() {
        let d = {sources: []};
        try { d = await api('meteo_about'); } catch (_) {}
        const rows = d.sources.map(x => `<tr><td>${esc(x.nom)}</td><td>${esc(x.what)}</td><td>${esc(x.years)}</td><td>${esc(x.in)}${x.installed?.length ? ` ${UI().badge ? UI().badge('Installé', 'green') : ''}` : ''}</td><td class="wx-lic">${esc(x.licence)}${x.mention ? ` — « ${esc(x.mention)} »` : ''}</td></tr>`).join('');
        const body = `<div class="wx-scroll"><table class="data-table wx-tbl"><thead><tr><th>Source</th><th>Ce qu’elle donne</th><th>Années</th><th>Dans</th><th>Licence et mention</th></tr></thead><tbody>${rows}</tbody></table></div>
            ${UI().notice ? UI().notice('warn', 'Une météo ancienne reste une estimation : elle aide à imaginer la journée, elle ne remplace pas ce que dit l’acte ou un journal de l’époque.') : ''}
            <p class="muted wx-about-note">Rien n’est envoyé sur Internet : toutes ces données sont dans l’app ou dans les packs importés. Les règles de fiabilité : station à moins de 15 km et moins de 150 m d’écart d’altitude → « Mesuré » ; de 15 à 40 km → « Station à … km » ; sinon la réanalyse ERA5 (1940 →) → « Estimé » ; de 1836 à 1939 la reconstitution 20CR → « Reconstitution grossière ».</p>`;
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l wx-about';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🌦 MÉTÉO D’AUTREFOIS</span><h2>À propos des données</h2></div><button type="button" class="icon-button" data-wx-x aria-label="Fermer">×</button></div><div class="wx-body">${body}</div><div class="modal-actions"><span class="spacer"></span><button type="submit" class="button secondary">Fermer</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.querySelector('[data-wx-x]').addEventListener('click', () => dlg.close()); dlg.showModal();
    }
    function openSettings() { const st = A().state; if (!st) return; st.maintenanceTab = 'meteo'; A().persistUiState?.(); A().setModule?.('maintenance'); }

    /* ═════════════════ M4 : le bloc « 🌦 Météo de sa vie » ═════════════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.meteo = (index, detail, opt = {}) => {
        const s = settings(), p = detail?.person;
        if (!p?.id || p.kind === 'animal' || !s.block || s.show === 'never' || personHidden(p.id, s)) return '';
        const actions = `<button type="button" class="icon-button small" data-wx-block-more="${Number(p.id)}" title="Plus d’actions" aria-label="Plus d’actions">⋯</button>`;
        return A().card(index, '🌦 Météo de sa vie', '', `<div class="wx-life" data-wx-life="${Number(p.id)}">${UI().skeleton ? UI().skeleton(3) : ''}</div>`, 'span-6', actions);
    };
    const curiousText = (c, g) => {
        // ✍️ accordé avec la fiche (app-accord.js) ; sans réglage, une fiche ni homme ni femme reste au masculin, comme avant
        const ac = w => window.LCNDA_ACCORD?.accord ? window.LCNDA_ACCORD.accord(g, w + '(e)', {before: w}) : w + (g === 'female' ? 'e' : '');
        const verb = {BIRT: ac('Né'), BAPM: ac('Baptisé'), CHR: ac('Baptisé'), MARR: ac('Marié'), DEAT: ac('Décédé'), BURI: ac('Inhumé')}[c.tag] || 'Ce jour-là';
        if (c.kind === 'coldest_day') return `🥶 ${verb} le jour le plus froid de l’hiver ${c.season} à ${c.town}.`;
        if (c.kind === 'coldest_week') return `🥶 ${verb} pendant la semaine la plus froide de l’hiver ${c.season} à ${c.town}.`;
        if (c.kind === 'hottest_day') return `🥵 ${verb} le jour le plus chaud de l’été ${c.season} à ${c.town}.`;
        if (c.kind === 'rainiest_day') return `☔ ${verb} le jour le plus pluvieux ${/^[aeiouéo]/.test(MONTHS[c.month - 1]) ? 'd’' : 'de '}${MONTHS[c.month - 1]} ${c.year} à ${c.town}.`;
        return '';
    };
    async function fillLife(host) {
        const pid = Number(host.dataset.wxLife), s = settings();
        let d;
        try { d = await api('meteo_person', {id: pid}); } catch (e) { host.innerHTML = A().empty ? A().empty(e.message, {icon: '⛔'}) : ''; return; }
        if (!host.isConnected) return;
        if (!d.installed) { host.innerHTML = A().empty('Les données météo ne sont pas installées.', {icon: '🌦', action: {label: '📦 Installer les données météo', attrs: 'data-wx-goset'}}); return; }
        const evs = (d.events || []).filter(r => !eventHidden(r.event_id, s) && kindOn(r.tag, s, r.type_id, r.type));
        const ok = evs.filter(r => shown(r, s));
        const card = host.closest('.card'); const small = card?.querySelector('.card-title h3'); if (small && !small.querySelector('small')) small.insertAdjacentHTML('beforeend', ` <small>(${ok.length})</small>`);
        if (!evs.length) { host.innerHTML = A().empty('Aucun événement daté au jour près, avec un lieu placé sur la carte.', {icon: '🌦'}); return; }
        const rows = evs.map(r => {
            const label = `${EV_NOUN[kindOf(r.tag)] || r.type} · ${r.date ? dayShort(r.date) : '?'}`;
            if (!shown(r, s)) return `<div class="wx-row is-empty"><span class="wx-i" aria-hidden="true">🌦</span><span><b>${esc(label)}</b><small>${esc(r.ok && r.reliability === 'coarse' ? 'Seulement une reconstitution grossière (à montrer dans les réglages).' : emptyText(r))}</small></span></div>`;
            const lk = look(r, s);
            return `<button type="button" class="wx-row" data-wx-day="${Number(r.event_id)}"><span class="wx-i" aria-hidden="true">${lk.icon}</span><span><b>${esc(label)}</b><small>${esc(s.phrase ? lk.desc.replace(/\.$/, '') : lk.title)}</small></span>${badgeShort(r)}</button>`;
        }).join('');
        let cur = '';
        if (s.curious) {
            const lines = (d.curious || []).map(c => curiousText(c, d.gender)).filter(Boolean);
            const counted = ok.filter(r => ['measured', 'station'].includes(r.reliability));
            if (counted.length >= 3) {
                const grey = counted.filter(r => ['☁️', '🌧️', '🌦️', '🌫️', '🌨️', '⛈️'].includes(look(r, s).icon)).length, sun = counted.filter(r => look(r, s).icon === '☀️').length;
                lines.push(`📊 Sur ses ${counted.length} grands jours : ${grey} gris ou pluvieux, ${sun ? (sun === 1 ? 'un de soleil' : `${sun} de soleil`) : 'aucun de soleil'}.`);
            }
            if (lines.length) cur = `<div class="wx-cur">${lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
        }
        evs.forEach(r => cache.set(Number(r.event_id), r));
        host.innerHTML = rows + cur;
    }
    document.addEventListener('click', e => {
        const row = e.target.closest?.('[data-wx-day]'); if (row) return openDay(Number(row.dataset.wxDay));
        const more = e.target.closest?.('[data-wx-block-more]');
        if (more) { const pid = Number(more.dataset.wxBlockMore); return UI().menuAt?.(more, [...(kiosk() ? [] : [{icon: '🙈', label: 'Masquer la météo de cette personne', run: () => hidePerson(pid)}, '-']), {icon: '⚙️', label: 'Réglages de la météo', run: openSettings}, {icon: '📚', label: 'À propos des données', run: openAbout}]); }
        const how = e.target.closest?.('[data-wx-howto]'); if (how) return openHowTo(how.dataset.wxHowto || 'socle');
        if (e.target.closest?.('[data-wx-goset]')) return openSettings();
    });
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        const pid = Number(detail?.person?.id) || 0;
        const ws = document.getElementById('workspace'); if (!ws) return;
        decorate(ws.querySelector('[data-pblock="events"]') || ws, {personId: pid});
        ws.querySelectorAll('[data-wx-life]').forEach(fillLife);
    });

    /* ═════════════════ M9 : l'heure dans la fenêtre de l'événement ═════════════════ */
    let timeTimer = 0;
    document.addEventListener('input', e => { if (e.target.closest?.('#event-form') && (e.target.name === 'event_time' || e.target.name === 'date_text' || e.target.closest('.ui-time'))) { clearTimeout(timeTimer); timeTimer = setTimeout(() => timeHint(e.target.closest('#event-form')), 500); } }, true);
    document.addEventListener('change', e => { if (e.target.closest?.('#event-form') && ['event_time', 'date_text', 'place_id'].includes(e.target.name)) { clearTimeout(timeTimer); timeTimer = setTimeout(() => timeHint(e.target.closest('#event-form')), 200); } }, true);
    async function timeHint(form) {
        const hint = form?.querySelector('[data-meteo-time-hint]'); if (!hint) return;
        const time = form.elements.event_time?.value || '', date = form.elements.date_text?.value || '';
        if (!time || !date) { hint.hidden = true; return; }
        try {
            const r = await api('meteo_time', {time, date, place_id: form.elements.place_id?.value || ''});
            hint.hidden = !r.ok; if (r.ok) hint.textContent = `🌦 ${r.label}${r.before1940 ? ' (avant 1940, la météo montre la journée)' : ''}`;
        } catch (_) { hint.hidden = true; }
    }

    /* ═════════════════ M5 : les réglages (Réglages → 🌦 Météo d'autrefois) ═════════════════ */
    const SEG = (key, val, opts) => `<span class="segmented wx-seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${val === v ? 'is-active' : ''}" aria-pressed="${val === v}" data-wx-set="${key}" data-wx-val="${esc(v)}">${esc(l)}</button>`).join('')}</span>`;
    const fmtSize = b => (b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${Math.round(b / 1e6)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const PACKS = [['socle', 'Socle', '1836 à 2025 · France, Belgique, Suisse, Luxembourg · ≈ 300 stations chaque jour, 4 heures par jour depuis 1940 · ≈ 550 Mo'],
        ['complet', 'Pack complet', 'Toutes les stations (≈ 14 700), heure par heure depuis 1950 · ≈ 3 Go'],
        ['europe', 'Pack Europe', 'Stations d’Allemagne, des Pays-Bas, du Danemark, du Royaume-Uni, d’Espagne, de Pologne, de Tchéquie, d’Italie, du Portugal et de Slovaquie + reconstitution 20CR (1836–1939) et ERA5 sur toute l’Europe · ≈ 1,5 à 3,5 Go'],
        // les packs du monde (NOAA GHCN-Daily) : un par continent, les plus longues séries bien réparties, chaque jour (températures, pluie, neige)
        ['monde-amerique-nord', 'Amérique du Nord', '≈ 2 500 stations (États-Unis, Canada, Mexique, Amérique centrale, Caraïbes, Groenland) · ≈ 300 Mo'],
        ['monde-amerique-sud', 'Amérique du Sud', '≈ 400 stations · ≈ 15 Mo'],
        ['monde-afrique', 'Afrique', '≈ 600 stations · ≈ 25 Mo'],
        ['monde-asie', 'Asie', '≈ 1 800 stations (avec la Russie à l’est de l’Oural, la Turquie et le Caucase) · ≈ 100 Mo'],
        ['monde-oceanie', 'Océanie', '≈ 1 000 stations (Australie, Nouvelle-Zélande, îles du Pacifique) · ≈ 50 Mo'],
        ['monde-europe', 'Europe (hors pack Europe)', '≈ 1 200 stations des pays que le pack Europe n’a pas (Autriche, Scandinavie, Europe de l’Est, Russie jusqu’à l’Oural…) · ≈ 80 Mo'],
        // les compléments Copernicus (scripts/meteo/meteo_plus.py) : facultatifs, chacun s'installe à part (France, Belgique, Suisse, Luxembourg)
        ['plus-neige', 'Neige et températures fines', 'ERA5-Land : neige au sol, neige tombée, min. et max. sur des carreaux de ≈ 9 km · 1950 → · ≈ 150 à 300 Mo'],
        ['plus-cerra', 'Températures très fines', 'CERRA : min. et max. sur des carreaux de ≈ 5,5 km · 1985 → 2021 · ≈ 300 à 600 Mo'],
        ['plus-ressenti', 'Ressenti thermique', 'UTCI (ERA5-HEAT) : le ressenti le plus chaud et le plus froid de chaque jour, en tenant compte du vent, du soleil et de l’humidité · 1940 → · ≈ 100 Mo'],
        ['plus-rivieres', 'Débit des rivières', 'GloFAS : le débit des grandes rivières chaque jour (crues, basses eaux) · 1979 → · ≈ 100 à 200 Mo'],
        ['plus-anciennes', 'Relevés anciens (avant 1836)', 'Les plus vieilles séries de relevés d’Europe, avant le socle (relevés à heures fixes) · quelques Mo']];
    /* source, licence et page officielle de chaque complément (ligne sous le pack, lien « ↗ source ») */
    const PLUS_SRC = {'plus-neige': ['ERA5-Land (Copernicus)', 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land'],
        'plus-cerra': ['CERRA (Copernicus)', 'https://cds.climate.copernicus.eu/datasets/reanalysis-cerra-single-levels'],
        'plus-ressenti': ['ERA5-HEAT, UTCI (Copernicus)', 'https://cds.climate.copernicus.eu/datasets/derived-utci-historical'],
        'plus-rivieres': ['GloFAS (Copernicus CEMS)', 'https://ewds.climate.copernicus.eu/datasets/cems-glofas-historical'],
        'plus-anciennes': ['Observations in situ (Copernicus)', 'https://cds.climate.copernicus.eu/datasets/insitu-observations-surface-land']};
    const PLUS_LIC = {'plus-rivieres': 'Licence CEMS-FLOODS, libre avec mention'};
    const isWorld = k => String(k).startsWith('monde-');
    const isPlus = k => String(k).startsWith('plus-');
    const packName = k => (PACKS.find(p => p[0] === k) || [k, 'Pack'])[1];
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.meteo = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let st = {files: {}};
        try { st = await api('meteo_status'); } catch (e) { statusErr(e); }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const draw = () => {
            const s = settings(), K = UI().toggleHtml, C = UI().checkHtml;
            const tg = (k, label, sub = '') => `<div class="wx-tg">${K(label, {checked: !!s[k], attrs: `data-wx-tg="${k}"`, sub})}</div>`;
            const hidden = [...s.hidePersons.map(x => ['p', x]), ...s.hideEvents.map(x => ['e', x])];
            const files = st.files || {};
            const dataRows = PACKS.map(([k, name, sub]) => {
                const f = files[k];
                const on = f && f.ok;
                const head = k === 'monde-amerique-nord' ? `<div class="wx-data-head"><b>${esc(i18n('Le reste du monde'))}</b><small>${esc(i18n('Un pack par continent (NOAA GHCN-Daily) : chaque jour, températures, pluie et neige des plus longues séries. Là où les stations sont rares, la plus proche jusqu’à 150 km.'))}</small></div>`
                    : k === 'plus-neige' ? `<div class="wx-data-head"><b>${esc(i18n('Compléments Copernicus (facultatifs)'))}</b><small>${esc(i18n('Chacun s’installe à part et s’ajoute au détail d’un jour : neige, ressenti, rivière, températures plus fines, relevés d’avant 1836. France, Belgique, Suisse, Luxembourg (les relevés anciens : toute l’Europe).'))}</small></div>` : '';
                const plusSrc = isPlus(k) && PLUS_SRC[k] ? `<small class="wx-plus-src">${esc(i18n('Source : {s} · {l} · citation demandée', {s: PLUS_SRC[k][0], l: i18n(PLUS_LIC[k] || 'CC BY 4.0')}))} <a href="${esc(PLUS_SRC[k][1])}" target="_blank" rel="noopener">${esc(i18n('↗ source'))}</a></small>` : '';
                const desc = on ? `${isWorld(k) && f.station_countries?.length ? `${A().plural(f.station_countries.length, 'pays', 'pays')} · ` : ''}${k === 'europe' && f.station_countries?.length ? `Stations : ${f.station_countries.map(countryName).join(', ')} · ` : ''}${k === 'europe' && f.c20?.n ? `20CR ${f.c20.a}–${f.c20.b} (toute l’Europe) · ` : ''}${f.stations ? A().plural(f.stations, 'station') : ''}${f.cells ? ` · ${A().plural(f.cells, 'carreau', 'carreaux')}` : ''}${f.from ? ` · ${f.from} → ${f.to}` : ''}${f.hours_from ? ` · heures depuis ${f.hours_from}` : ''}${f.relief ? ` · altitudes : ${A().plural(f.relief, 'carré')} de 1°${f.relief_countries?.length ? ` (${f.relief_countries.map(countryName).join(', ')})` : ''}` : ''} · ${fmtSize(f.size)}${f.fixture ? ' · jeu d’essai fabriqué' : ''}` : sub;
                const desc1 = desc.replace(/^ · /, '');
                const acts = on ? (f.removable ? `<button type="button" class="button small secondary" data-wx-remove="${k}">🗑 Supprimer le pack</button>` : '')
                    : dlActs(k);
                return `${head}<div class="wx-data-row${isWorld(k) ? ' wx-world' : ''}${isPlus(k) ? ' wx-plus-row' : ''}" data-wx-pack="${esc(k)}"><span><b>${esc(name)}</b><small>${esc(desc1)}</small>${plusSrc}</span>${UI().badge(on ? 'Installé' : 'Pas installé', on ? 'green' : 'grey')}${acts ? `<span class="wx-acts">${acts}</span>` : ''}</div>`;
            }).join('');
            ws.innerHTML = `<section class="page wx-settings">${UI().pageHeader({title: 'Météo d’autrefois', icon: '🌦', attrs: 'data-ph-title', where: 'Réglages · Données', saved: true, help: 'Le temps qu’il faisait le jour de chaque événement, sans Internet.',
                actions: ['<button type="button" class="button secondary" data-wx-reset data-ui-reset>↺ Remettre comme au départ</button>']})}
                <div class="wx-set">
                <section class="card wx-card"><h3>Ce qu’on montre</h3>
                    <div class="wx-line-set"><span>Météo sur les fiches</span>${SEG('show', s.show, [['always', 'Toujours'], ['hover', 'Au survol'], ['never', 'Jamais']])}</div>
                    <div class="wx-line-set"><span>Au clic sur la pastille</span>${SEG('open', s.open, [['window', 'Fenêtre'], ['fold', 'Sous l’événement']])}</div>
                    <div class="wx-line-set"><span>Températures</span>${SEG('temp', s.temp, [['c', '°C'], ['f', '°F']])}</div>
                    <div class="wx-line-set"><span>Pluie</span>${SEG('rain', s.rain, [['mm', 'mm'], ['in', 'pouces']])}</div>
                    ${tg('phrase', 'La phrase simple', '« Il faisait froid : −4 °C au matin… »')}
                    ${tg('normal', 'Comparer à la normale')}
                    ${tg('sources', 'Ligne des sources sous le détail', 'Obligatoire pour certaines licences : elle reste dans le détail et à l’export.')}
                    ${tg('block', 'Bloc « 🌦 Météo de sa vie » sur les fiches')}
                    ${tg('curious', 'Phrases curieuses (« Né le jour le plus froid… »)')}
                    ${tg('today', 'Dans « Ce jour-là » et le tableau de bord')}
                    ${tg('coarse', 'Montrer aussi les reconstitutions grossières (avant 1940)')}
                    ${tg('plus', 'Les compléments Copernicus dans le détail', 'Neige, ressenti, rivière, températures plus fines… quand le pack est installé.')}
                    <h4>Pour quels événements</h4>
                    ${(() => { const used = (A()?.state?.bootstrap?.eventTypes || []).filter(t => Number(t.usage_count) > 0).sort((a, b) => String(a.label).localeCompare(String(b.label), 'fr', {sensitivity: 'base'}));
                        if (!used.length) return `<div class="wx-chks">${KINDS.map(([k, l]) => C(l, {checked: !!s.kinds[k], attrs: `data-wx-kind="${k}"`})).join('')}</div>`;
                        const off = s.offTypes || [];
                        return `<p class="muted wx-types-help">Tous les types d’événements de ta base (avec leur nombre). Décoche ceux qui n’ont pas besoin de la météo.</p><div class="wx-types-act"><button type="button" class="link-button" data-wx-types="all">Tout cocher</button> · <button type="button" class="link-button" data-wx-types="none">Tout décocher</button></div>
                            <div class="wx-chks wx-types">${used.map(t => C(`${t.label} (${Number(t.usage_count).toLocaleString('fr-FR')})`, {checked: !!s.kinds[kindOf(t.gedcom_tag)] && !off.includes(Number(t.id)), attrs: `data-wx-type="${Number(t.id)}" data-wx-type-tag="${esc(t.gedcom_tag || '')}"`})).join('')}</div>`; })()}
                    <h4>Météo masquée</h4>
                    ${hidden.length ? `<ul class="wx-hidden">${hidden.map(([t, x]) => `<li><span>${t === 'p' ? '👤' : '📅'} ${esc(x.label || (t === 'p' ? 'Fiche' : 'Événement') + ' n° ' + x.id)}</span><button type="button" class="icon-button small" data-wx-unhide="${t}:${Number(x.id)}" title="Remontrer la météo" aria-label="Remontrer la météo">×</button></li>`).join('')}</ul>`
                        : A().empty('Rien n’est masqué.', {icon: '🙈', hint: 'Sur une fiche : clic droit sur la pastille météo (ou ⋯ du détail) → « Masquer la météo ».'})}
                </section>
                <section class="card wx-card"><h3>Les données dans l’app</h3>
                    <div class="wx-data">${dataRows}</div>
                    ${UI().notice('info', 'Le téléchargement se fait une fois, depuis n’importe quel ordinateur. Ensuite on importe le fichier ici et l’app n’a plus besoin d’Internet.')}
                    <p class="wx-about-link"><button type="button" class="link-button" data-wx-about>↗ À propos des données et des licences</button></p>
                </section></div></section>`;
        };
        draw();
        const refresh = async () => { try { st = await api('meteo_status'); } catch (e) { statusErr(e); } cache.clear(); draw(); };
        dlRedraw = draw; dlRefresh = refresh;
        // ce qui est en ligne (taille de chaque pack), et les téléchargements interrompus à reprendre
        api('meteo_dl_info').then(r => { DL.online = r.packs || {}; DL.err = r.error || ''; }).catch(x => { DL.online = {}; DL.err = x.message; }).finally(async () => {
            const ids = dlSaved(); for (const [k, id] of Object.entries(ids)) { if (DL.run[k]) continue; try { const r = await api('meteo_dl_resume', {id}); if (r.exists) DL.paused[k] = {id, received: r.received, size: r.size}; else dlForget(k); } catch (_) {} }
            if (ws.querySelector('.wx-settings')) draw(); });
        if (ws.__wxBound !== true) {
            ws.__wxBound = true;
            ws.addEventListener('click', async e => {
                if (!ws.querySelector('.wx-settings')) return;
                const seg = e.target.closest('[data-wx-set]');
                if (seg) { const s = settings(); s[seg.dataset.wxSet] = seg.dataset.wxVal; save(s); cache.clear(); return draw(); }
                if (e.target.closest('[data-wx-reset]')) { const s = settings(); save({...clone(DEF), hidePersons: s.hidePersons, hideEvents: s.hideEvents}); return draw(); }
                const un = e.target.closest('[data-wx-unhide]');
                if (un) { const [t, id] = un.dataset.wxUnhide.split(':'); const s = settings(); if (t === 'p') s.hidePersons = s.hidePersons.filter(x => Number(x.id) !== Number(id)); else s.hideEvents = s.hideEvents.filter(x => Number(x.id) !== Number(id)); save(s); return draw(); }
                if (e.target.closest('[data-wx-about]')) return openAbout();
                const imp = e.target.closest('[data-wx-import]'); if (imp) { await importPack(imp.dataset.wxImport); return refresh(); }
                const dl = e.target.closest('[data-wx-dl]'); if (dl) return dlRun(dl.dataset.wxDl);
                const pz = e.target.closest('[data-wx-dl-pause]'); if (pz) { const k = pz.dataset.wxDlPause; if (DL.run[k]) DL.run[k].stop = true; return; }
                const cx = e.target.closest('[data-wx-dl-cancel]'); if (cx) return dlCancel(cx.dataset.wxDlCancel);
                const rm = e.target.closest('[data-wx-remove]');
                if (rm) {
                    const kind = rm.dataset.wxRemove;
                    try { await api('meteo_pack_remove', {}, {method: 'POST', body: {kind}}); } catch (x) { return A().toast(x.message, 'error'); }
                    await refresh();
                    A().undoToast(i18n('🗑 {name} supprimé', {name: i18n(packName(kind))}), {undo: async () => { await api('meteo_pack_restore', {}, {method: 'POST', body: {kind}}); await refresh(); }, redo: async () => { await api('meteo_pack_remove', {}, {method: 'POST', body: {kind}}); await refresh(); }});
                }
            });
            ws.addEventListener('change', e => {
                if (!ws.querySelector('.wx-settings')) return;
                const t = e.target.closest('[data-wx-tg]'); if (t) { const s = settings(); s[t.dataset.wxTg] = t.checked; save(s); cache.clear(); return; }
                const k = e.target.closest('[data-wx-kind]'); if (k) { const s = settings(); s.kinds[k.dataset.wxKind] = k.checked; save(s); }
                const ty = e.target.closest('[data-wx-type]'); if (ty) { const s = settings(), id = Number(ty.dataset.wxType), cat = kindOf(ty.dataset.wxTypeTag);
                    let off = (s.offTypes || []).filter(x => x !== id);
                    if (!ty.checked) off.push(id);
                    else if (!s.kinds[cat]) { s.kinds[cat] = true; ws.querySelectorAll('[data-wx-type]').forEach(o => { if (o !== ty && kindOf(o.dataset.wxTypeTag) === cat && !o.checked) off.push(Number(o.dataset.wxType)); }); }
                    s.offTypes = [...new Set(off)]; save(s); cache.clear(); }
            });
            ws.addEventListener('click', e => { const b = e.target.closest('[data-wx-types]'); if (!b || !ws.querySelector('.wx-settings')) return; const s = settings(), all = b.dataset.wxTypes === 'all';
                if (all) { Object.keys(s.kinds).forEach(k => { s.kinds[k] = true; }); s.offTypes = []; } else s.offTypes = [...ws.querySelectorAll('[data-wx-type]')].map(o => Number(o.dataset.wxType));
                save(s); cache.clear(); draw(); });
        }
        UI().autoSave?.(ws, {redraw: () => draw()});
    };

    /* ═════════ 📦 Installer un pack en un bouton (lib/meteo_dl.php) : rien de météo n'est livré avec l'app ═════════ */
    const DL = {online: null, err: '', run: {}, paused: {}}, DL_KEY = 'genealogie-meteo-dl';
    let dlRedraw = () => {}, dlRefresh = async () => {};
    const dlSaved = () => { try { return JSON.parse(localStorage.getItem(DL_KEY) || '{}') || {}; } catch (_) { return {}; } };
    const dlRemember = (k, id) => { const v = dlSaved(); v[k] = id; try { localStorage.setItem(DL_KEY, JSON.stringify(v)); } catch (_) {} };
    const dlForget = k => { const v = dlSaved(); delete v[k]; try { localStorage.setItem(DL_KEY, JSON.stringify(v)); } catch (_) {} };
    const pct = (a, b) => (b ? Math.floor(a / b * 100) : 0);
    function dlActs(k) {
        const run = DL.run[k], pz = DL.paused[k], on = DL.online && DL.online[k];
        if (run) return `<span class="wx-dl" data-wx-dl-box="${k}"><span class="wx-prog"><i style="width:${pct(run.received, run.size)}%"></i></span><small data-wx-dl-txt>${esc(dlText(run))}</small><button type="button" class="button small secondary" data-wx-dl-pause="${k}">⏸ ${esc(i18n('Pause'))}</button></span>`;
        const imp = `<button type="button" class="button small secondary" data-wx-import="${k}" title="${esc(i18n('Un fichier .lcmeteo déjà téléchargé ou fabriqué'))}">⤒ ${esc(i18n('Importer un fichier…'))}</button>`;
        if (pz) return `<span class="wx-dl"><span class="wx-prog"><i style="width:${pct(pz.received, pz.size)}%"></i></span><small>${esc(i18n('En pause : {p} %', {p: String(pct(pz.received, pz.size))}))}</small><button type="button" class="button small" data-wx-dl="${k}">▶ ${esc(i18n('Reprendre'))}</button><button type="button" class="button small secondary" data-wx-dl-cancel="${k}">✕ ${esc(i18n('Abandonner'))}</button></span>`;
        if (DL.online === null) return `${window.LCNDA_UI.spinner(i18n('Recherche des données en ligne…'), {inline: true})}${imp}`;
        if (!on) return `<small class="muted" title="${esc(DL.err)}">${esc(DL.err ? i18n('Pas de connexion aux données en ligne.') : i18n('Pas encore en ligne.'))}</small>${imp}<button type="button" class="link-button" data-wx-howto="${k}">${esc(i18n('Le fabriquer soi-même'))}</button>`;
        return `<button type="button" class="button small" data-wx-dl="${k}">📦 ${esc(i18n('Installer ({s})', {s: fmtSize(on.size)}))}</button>${imp}`;
    }
    function dlText(run) { const el = (Date.now() - run.t0) / 1000, rate = el > 2 ? (run.received - run.r0) / el : 0, left = rate > 0 ? (run.size - run.received) / rate : 0;
        return `${pct(run.received, run.size)} % · ${fmtSize(run.received)} ${i18n('sur')} ${fmtSize(run.size)}${left > 0 ? ` · ${i18n('reste ≈ {m} min', {m: String(Math.max(1, Math.round(left / 60)))})}` : ''}`; }
    function dlPaint(k) { const run = DL.run[k], box = document.querySelector(`[data-wx-dl-box="${k}"]`); if (!run || !box) return; box.querySelector('.wx-prog i').style.width = `${pct(run.received, run.size)}%`; box.querySelector('[data-wx-dl-txt]').textContent = dlText(run); }
    async function dlRun(k) {
        if (DL.run[k]) return;
        const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
        let id = DL.paused[k]?.id || dlSaved()[k] || '', run;
        try {
            if (id) { const r = await api('meteo_dl_resume', {id}); if (!r.exists) id = ''; else run = {id, received: r.received, size: r.size}; }
            if (!id) { const r = await post('meteo_dl_start', {kind: k}); id = r.id; run = {id, received: 0, size: r.size}; }
        } catch (x) { return A().toast(x.message, 'error'); }
        dlRemember(k, id); delete DL.paused[k];
        DL.run[k] = {...run, t0: Date.now(), r0: run.received, stop: false}; dlRedraw();
        let fails = 0;
        while (!DL.run[k].stop) {
            try { const r = await post('meteo_dl_step', {id}); DL.run[k].received = r.received; fails = 0; dlPaint(k); if (r.done) break; }
            catch (x) { if (++fails >= 3) { A().toast(i18n('Téléchargement arrêté : {e}', {e: x.message}), 'error'); DL.paused[k] = {id, received: DL.run[k].received, size: DL.run[k].size}; delete DL.run[k]; return dlRedraw(); } await new Promise(r => setTimeout(r, 1500 * fails)); }
        }
        if (DL.run[k].stop) { DL.paused[k] = {id, received: DL.run[k].received, size: DL.run[k].size}; delete DL.run[k]; return dlRedraw(); }
        const box = document.querySelector(`[data-wx-dl-box="${k}"] [data-wx-dl-txt]`); if (box) box.textContent = i18n('Vérification et installation…');
        try {
            const r = await post('meteo_pack_finish', {id}); dlForget(k); delete DL.run[k];
            await dlRefresh();
            A().undoToast?.(r.stations || !isPlus(k) ? i18n('🌦 {name} installé ({n} stations).', {name: i18n(packName(k)), n: String(r.stations || 0)}) : i18n('🌦 {name} installé.', {name: i18n(packName(k))}), {undo: async () => { await post('meteo_pack_undo', {kind: k}); await dlRefresh(); }});
        } catch (x) { dlForget(k); delete DL.run[k]; dlRedraw(); A().toast(x.message, 'error'); }
    }
    async function dlCancel(k) {
        const id = DL.paused[k]?.id || dlSaved()[k]; delete DL.paused[k]; dlForget(k);
        if (id) { try { await api('meteo_dl_cancel', {}, {method: 'POST', body: {id}}); } catch (_) {} }
        dlRedraw();
    }
    ext.meteoDl = {run: dlRun, state: DL};

    /* ⤓ le fabriquer soi-même (le fichier se fabrique une fois, puis s'importe) */
    function openHowTo(kind) {
        const url = PACK_URLS[kind];
        const name = {socle: 'le socle', complet: 'le pack complet', europe: 'le pack Europe'}[kind] || (isWorld(kind) || isPlus(kind) ? i18n('le pack « {name} »', {name: i18n(packName(kind))}) : 'le pack');
        const cmd = PACKS.some(p => p[0] === kind) ? kind : 'socle';
        const body = `${url ? `<p><a class="button" href="${esc(url)}" target="_blank" rel="noopener">⤓ Télécharger ${esc(name)}</a></p>` : ''}
            <ol class="wx-steps">${isPlus(kind) ? `<li>${esc(i18n('Il faut un compte Copernicus gratuit, sa clé (docs/METEO.md, « Le compte Copernicus ») et avoir accepté les conditions du jeu sur sa page (onglet « Download »).'))}</li>` : ''}<li>${url ? 'Ou bien, sur' : 'Sur'} un ordinateur qui a Internet, suis le mode d’emploi <b>docs/METEO.md</b> (livré avec l’app) : il installe Python si besoin, puis lance<br><code>python3 scripts/meteo/build-meteo.py ${esc(cmd)}</code></li>
            <li>Le fichier <code>meteo-${esc(cmd === 'socle' ? 'socle.sqlite' : 'pack-' + cmd + '.lcmeteo')}</code> apparaît dans le dossier <code>meteo-sortie</code>.</li>
            <li>Ici : <b>⤒ Importer le fichier…</b> (une seule fois). Ensuite l’app n’a plus besoin d’Internet.</li></ol>
            ${UI().notice('info', 'Rien n’est envoyé sur Internet par l’app : le fichier reste sur ton ordinateur.')}`;
        if (ext.openDialog) ext.openDialog({eyebrow: '🌦 MÉTÉO D’AUTREFOIS', title: i18n('Obtenir {name}', {name: i18n(name)}), body});
    }

    /* ═════════════════ M6 : importer un pack (K13, envoi par morceaux) ═════════════════ */
    const CHUNK = 4 * 1024 * 1024;
    function importPack(kindWanted = '') {
        return UI().openImportDialog({title: 'Importer un pack météo', accept: '.lcmeteo,.sqlite', what: 'fichier .lcmeteo', noun: 'station',
            text: '📁 Glisse le fichier du pack ici, colle-le (⌘V) ou choisis-le sur l’ordinateur', hint: 'meteo-pack-complet-2025.lcmeteo, meteo-pack-europe-2025.lcmeteo…',
            analyze: async files => {
                const f = files[0]; if (!f) throw new Error('aucun fichier');
                const head = await f.slice(0, 4096).text();
                if (!head.startsWith('LCMETEO1\n')) throw new Error('ce n’est pas un pack météo de LCNDA (il faut un fichier .lcmeteo, fabriqué par build-meteo.py).');
                let h; try { h = JSON.parse(head.slice(9).trim()); } catch (_) { throw new Error('l’en-tête du pack est abîmé.'); }
                if (!PACKS.some(p => p[0] === h.kind)) throw new Error('sorte de pack inconnue.');
                if (f.size - 4096 !== Number(h.size)) throw new Error('le fichier est incomplet (téléchargement interrompu ?).');
                const name = packName(h.kind);
                const nf = n => Number(n || 0).toLocaleString('fr-FR');
                const what = `<div class="wx-what"><div><b>${nf(h.stations)}</b><small>stations</small></div>${h.cells ? `<div><b>${nf(h.cells)}</b><small>carreaux</small></div>` : ''}<div><b>${h.from || '?'}–${h.to || '?'}</b><small>chaque jour</small></div>${h.hours_from ? `<div><b>${h.hours_from} →</b><small>heure par heure</small></div>` : ''}<div><b>${fmtSize(h.size)}</b><small>sur le disque</small></div></div>`;
                const notes = [{kind: 'ok', text: h.kind === 'socle' ? 'Le socle sert de base : les packs s’ajoutent par-dessus.' : 'Le socle reste : le pack s’ajoute par-dessus.'}];
                if (kindWanted && kindWanted !== h.kind) notes.push({kind: 'warn', text: `Ce fichier est « ${name} » (pas celui de la ligne choisie) : il sera rangé comme « ${name} ».`});
                return {count: Number(h.stations) || 1, summaryHtml: `📦 <b>${esc(f.name)}</b> ${UI().badge('Vérifié', 'green')} — ${esc(name)}`, extra: what, notices: notes, goLabel: `⤒ Importer le ${h.kind === 'socle' ? 'socle' : 'pack'}`, data: h};
            },
            run: async (an, files, body) => {
                const f = files[0], h = an.data, st = A().state;
                body.insertAdjacentHTML('beforeend', `<div class="wx-prog-box"><div class="wx-prog-t">${UI().spinner ? UI().spinner('Envoi du fichier…') : ''}</div><div class="wx-prog"><i style="width:0%"></i></div><small class="muted">Tu peux continuer à regarder l’app pendant ce temps.</small></div>`);
                const bar = body.querySelector('.wx-prog i'), txt = body.querySelector('.wx-prog-t span:last-child');
                const {id} = await api('meteo_pack_begin', {}, {method: 'POST', body: {size: f.size}});
                for (let off = 0; off < f.size; off += CHUNK) {
                    const blob = f.slice(off, Math.min(f.size, off + CHUNK));
                    const resp = await fetch(`api.php?action=meteo_pack_chunk&id=${id}&offset=${off}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream', 'X-CSRF-Token': st.csrf}, body: blob});
                    const j = await resp.json().catch(() => ({error: 'réponse illisible'}));
                    if (!resp.ok || j.error) throw new Error(j.error || 'envoi interrompu');
                    const pc = Math.round(Math.min(f.size, off + CHUNK) / f.size * 100);
                    if (bar) bar.style.width = pc + '%'; if (txt) txt.textContent = i18n('Envoi du fichier… {n} %', {n: pc});
                }
                if (txt) txt.textContent = 'Vérification du pack…';
                const r = await api('meteo_pack_finish', {}, {method: 'POST', body: {id}});
                cache.clear();
                const name = packName(r.kind);
                return {message: `✓ ${name} importé : ${A().plural(r.stations || h.stations || 0, 'station')}`, undo: async () => { await api('meteo_pack_undo', {}, {method: 'POST', body: {kind: r.kind}}); cache.clear(); if (A().state?.maintenanceTab === 'meteo') ext.maintenance.meteo(); }};
            }});
    }

    /* ═════════════════ M7 : le widget du tableau de bord ═════════════════ */
    const app0 = window.LCNDA_APP;
    try { if (app0?.defaultDashboardBlocks && !app0.defaultDashboardBlocks.some(x => x[0] === 'meteo_widget')) { app0.defaultDashboardBlocks.push(['meteo_widget', '🌦 Météo d’autrefois']); if (app0.defaultDashboardBlockSpans) app0.defaultDashboardBlockSpans.meteo_widget = '6'; } } catch (_) {}
    ext.dashboard = ext.dashboard || {};
    const whoText = ps => { const n = (ps || []).map(p => `<b>${esc(p.first || p.last || '?')}</b>`); return n.length > 1 ? `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}` : n[0] || 'quelqu’un'; };
    ext.dashboard.meteo_widget = {load: () => (settings().today ? api('meteo_today').catch(() => null) : Promise.resolve({off: true})), render: (index, widget, span, d) => {
        const today = new Date(), md = `${today.getDate() === 1 ? '1er' : today.getDate()} ${MONTHS[today.getMonth()]}`;
        let body;
        if (d?.off) body = A().empty('La météo est masquée ici (Réglages → 🌦 Météo d’autrefois).', {icon: '🌦'});
        else if (!d || !d.installed) body = A().empty('Les données météo ne sont pas installées.', {icon: '🌦', action: {label: '📦 Installer les données météo', attrs: 'data-wx-goset'}});
        else if (!d.pick) body = A().empty('Aucun anniversaire rond avec une météo connue aujourd’hui.', {icon: '🌦', hint: 'Il en faut un de 10, 25, 50, 100 ans… d’une naissance, d’un mariage ou d’un décès.'});
        else {
            const r = d.pick, s = settings(), lk = look(r, s), k = kindOf(r.tag);
            const town = r.station?.short || r.place || 'ici';
            const amount = [r.day?.rr >= 0.3 && !r.regional_rain ? R(r.day.rr, s) : '', r.day?.tx != null ? T(r.day.tx, s) : ''].filter(Boolean).join(' et ');
            cache.set(Number(r.event_id), r);
            body = `<div class="wx-wid"><span class="wx-big" aria-hidden="true">${lk.icon}</span><p>Il y a <b>${A().plural(r.ago, 'an')}</b>, le jour ${esc(EV_DU[k] || 'de l’événement')} de ${whoText(r.people)}, ${esc(lk.verb)} à <b>${esc(town)}</b>${amount ? ` : ${esc(amount)}` : ''}.</p></div>
                <div class="wx-wid-ft">${badge(r)}<button type="button" class="link-button" data-wx-open-person="${Number(r.people?.[0]?.id) || 0}">↗ Voir ${esc(EV_OF[k] || 'l’événement')}</button><button type="button" class="link-button" data-wx-day="${Number(r.event_id)}">Le détail du jour</button></div>`;
        }
        return A().card(index, '🌦 Météo d’autrefois', '', `<div class="wx-wid-host"><span class="wx-wid-date muted">${esc(md)}</span>${body}</div>`, span);
    }};
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-wx-open-person]'); if (b && Number(b.dataset.wxOpenPerson)) A().openPersonById?.(Number(b.dataset.wxOpenPerson)); });

    /* ═════════════════ « 🎂 Dates à fêter » (Ce jour-là du tableau de bord) et la frise ═════════════════ */
    /** pastilles au bout des lignes des Dates à fêter (seulement les ancêtres : jamais un vivant) */
    function decorateDates(list, items) {
        const s = settings(); if (!s.today || s.show === 'never' || !list) return;
        list.querySelectorAll('[data-df-i]').forEach(li => {
            const it = items[Number(li.dataset.dfI)]; if (!it || it.living || !Number(it.event_id) || it.masked) return;
            li.dataset.eventId = String(it.event_id);
        });
        decorate(list, {rowSel: '[data-df-i][data-event-id]', after: (row, html) => (row.querySelector('.h-df-txt') || row).insertAdjacentHTML('beforeend', html.replace('class="wx-line"', 'class="wx-line wx-inline"'))});
    }
    /** la frise de Chronologie : interrupteur « 🌦 Météo » */
    function decorateTimeline(root) { decorate(root, {rowSel: '.timeline-row[data-event-id], .timeline-card-line[data-event-id]', after: (row, html) => (row.querySelector('.timeline-card') || row).insertAdjacentHTML('beforeend', html)}); }

    /** M8 — l'encadré météo de la mise en page (objet dynamique {type: 'meteo', id}) : icône, phrase, source (qui suit à l'export) */
    async function noticeHtml(dyn) {
        const r = (await api('meteo_event', {id: Number(dyn.id)})).result || {};
        const s = settings();
        if (!r.ok) return `<p data-ps="ps-body">🌦 ${esc(emptyText(r))}</p>`;
        const lk = look(r, s), d = r.day || {};
        const vals = [d.tx != null ? T(momentT(r), s) : '', d.rr >= 0.3 && !r.regional_rain ? R(d.rr, s) : ''].filter(Boolean).join(' · ');
        return `<p data-ps="ps-name">${lk.icon} ${esc(r.place || '')}${r.date ? `, ${esc(dayShort(r.date))}` : ''}</p><p data-ps="ps-body"><b>${esc(lk.title)}</b>${vals ? ` — ${esc(vals)}` : ''}${s.phrase ? `<br>${esc(lk.desc)}` : ''}</p><p data-ps="ps-list"><small>Météo : ${esc(sourcesLine(r))}</small></p>`;
    }

    ext.meteo = {noticeHtml, placeAltitudeInto, editPlaceAltitude, settings, save, look, badge, decorate, decorateDates, decorateTimeline, openDay, openAbout, openSettings, importPack, cache, installed: null, T, R, kindOf};
})();
