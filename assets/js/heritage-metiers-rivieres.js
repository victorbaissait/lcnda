/* LCNDA — ⛏️🏭⚙️🌊🖼️ Métiers et rivières (serveur : lib/metiers_rivieres.php ; style : assets/css/metiers-rivieres.css ;
 * données : assets/data/casias/, roe-moulins.json.gz, metiers-mines.json.gz, reperes-crues.json.gz, metiers-sites.json).
 *  1. ⛏️ bloc de fiche « Son métier, près de chez lui » : « Il était tanneur. À 800 m de Saint-Jal, une tannerie : il y a peut-être
 *     travaillé. » — seulement quand un métier va avec un ancien site (CASIAS, mines Wikidata, moulins du ROE) à 5 km au plus d'un
 *     lieu de sa vie, et que les dates vont (ou sont inconnues : on le dit). Rien sinon (le bloc reste caché).
 *  2. 🌊 dans « 🏘 Le lieu à son époque » (heritage-histoire.js, crochet ext.histoireAfter) : la rivière de ses lieux (BD TOPAGE, en
 *     ligne), les repères de crues tout près, les plus hautes eaux de son vivant à la station de mesure (Hub'Eau, en ligne), et une
 *     ligne pour les métiers de la rivière (batelier, flotteur, pêcheur, passeur, lavandière, meunier).
 *  3. fiche d'un village et monographie de commune : 🏭 Activités anciennes de la commune, ⚙️ Moulins et usines à eau,
 *     🌊 La rivière du village, 🖼️ Ton village au musée (POP, en ligne ; « ＋ Garder dans les médias » seulement sous licence libre, ↶).
 *  4. Réglages → « ⛏️ Métiers et rivières » : chaque partie s'éteint (localStorage « genealogie-metiers-rivieres ») ; réponses gardées
 *     (🗑 avec ↶) ; À propos des données.
 *  5. LCNDA_EXT.dataSources : mr_metier (personne), mr_sites, mr_moulins, mr_riviere, mr_musee (lieu).
 * Essai : tests/test-metiers-rivieres.js
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-metiers-rivieres';
    const TAB = ['metiers_rivieres', '25k5', '⛏️ Métiers et rivières'];
    const PARTS = [
        ['metier', '⛏️ Son métier, près de chez lui', 'Bloc de fiche : un ancien site (tannerie, mine, forge, moulin…) qui va avec son métier, à moins de 5 km de ses lieux.'],
        ['rivers', '🌊 Sa rivière et ses crues', 'Dans « 🏘 Le lieu à son époque » : la rivière de ses lieux, les repères de crues, les plus hautes eaux de son vivant.'],
        ['place_sites', '🏭 Activités anciennes de la commune', 'Fiche d’un village : les anciens ateliers et usines connus (CASIAS), mines et carrières.'],
        ['place_mills', '⚙️ Moulins et usines à eau', 'Fiche d’un village : les moulins et usines à eau du Référentiel des obstacles à l’écoulement.'],
        ['place_river', '🌊 La rivière du village', 'Fiche d’un village : ses rivières, ses repères de crues, la plus haute crue mesurée.'],
        ['place_pop', '🖼️ Ton village au musée', 'Fiche d’un village : photos (Mémoire) et objets de musée (Joconde) de la commune, en ligne.']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dayTxt = (d, m, y) => `${d ? (d === 1 ? '1er ' : d + ' ') : ''}${m ? T(MONTHS[m - 1]) + ' ' : ''}${y}`;
    const ymTxt = ym => { const [y, m] = String(ym).split('-').map(Number); return dayTxt(0, m, y); };
    const num = (n, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
    const fmtKm = km => (km == null ? '' : km < 1 ? T('{n} m', {n: Math.max(50, Math.round(km * 1000 / 50) * 50)}) : T('{n} km', {n: num(km)}));
    const fmtDate = ts => { try { return new Date(ts * 1000).toLocaleDateString('fr-FR'); } catch (_) { return ''; } };
    const link = (url, label) => (url ? `${window.LCNDA_UI.extLink(url, label)}` : esc(label));
    const emptyLine = (t, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text: t, icon, size: 'small'}) : `<p class="muted">${esc(t)}</p>`);
    const wait = t => (UI().spinner ? UI().spinner(t) : `<p class="muted">${esc(t)}</p>`);
    const row = (icon, html, src, extra = '') => `<div class="hist-row mr-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const srcTxt = list => (list || []).map(s => link(s.url, s.mention || s.label) + (s.licence ? ` (${esc(s.licence)})` : '')).join(' · ');
    const memo = new Map();
    window.addEventListener('lcnda:data-changed', () => memo.clear()); // une fiche modifiée (date, lieu, lien…) : ses blocs sont redemandés, pas repris de la mémoire
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }
    const offLine = what => `<p class="cplus-off mr-off">📴 ${esc(T('Pas de connexion à Internet : {what} s’afficheront quand tu seras connecté.', {what}))}</p>`;
    const he = P => (P.gender === 'female' ? T('Elle') : P.gender === 'male' ? T('Il') : esc(P.first || T('Cette personne')));

    /* ═════════ 1. ⛏️ son métier, près de chez lui ═════════ */
    const SRC_WORD = {casias: 'CASIAS', wikidata: 'Wikidata', roe: 'ROE'};
    function siteName(s, label) {
        if (s.src === 'roe') return s.name + (s.river ? ` (${T('sur {r}', {r: s.river})})` : '');
        if (s.src === 'wikidata') return s.name;
        return s.name + (s.activity ? ` — ${s.activity}` : '');
    }
    function siteDates(s) {
        if (s.start || s.end) return ` (${s.start || '?'}–${s.end || ''})`;
        return '';
    }
    function siteLink(s) {
        if (s.src === 'roe') return '';
        return s.url ? ` ${link(s.url, T('fiche ↗'))}` : '';
    }
    function matchHtml(P, m) {
        const s = m.sites[0], where = s.km != null ? T('À {d} de {p}', {d: fmtKm(s.km), p: s.near}) : T('À {p}', {p: s.near});
        const tail = m.trade === 'moulin' ? T('c’était peut-être le sien.') : T('il y a peut-être travaillé.');
        const nm = siteName(s), lbl = T(m.label), same = !nm || lbl.toLowerCase().includes(nm.toLowerCase());
        let html = `${T('{who} était {job}.', {who: he(P), job: `<b>${esc(m.job.toLowerCase())}</b>`})} ${esc(where)}, ${esc(same ? lbl : lbl.replace(/\s*\(.*\)$/, ''))}${same ? '' : ` (« ${esc(nm)} »)`}${esc(siteDates(s))} : ${esc(tail)}`;
        if (s.dates === 'unknown') html += ` <span class="muted">${esc(s.src === 'casias' ? T('(l’inventaire ne dit pas les années d’activité)') : T('(ses dates ne sont pas connues)'))}</span>`;
        const more = m.sites.slice(1);
        const extra = more.length ? `<details class="mr-more"><summary>${esc(T('plus ({n})', {n: more.length + (m.count > m.sites.length ? m.count - m.sites.length : 0)}))}</summary><ul class="hist-ul">${more.map(x => `<li>${esc(siteName(x))}${esc(siteDates(x))} — ${esc(x.km != null ? T('{d} de {p}', {d: fmtKm(x.km), p: x.near}) : x.near)}${siteLink(x)}</li>`).join('')}</ul></details>` : '';
        const icon = {mine: '⛏️', carriere: '⛏️', moulin: '⚙️', forge: '🔨', textile: '🧵', verrerie: '🫙', tannerie: '🏭'}[m.trade] || '🏭';
        return row(icon, html + siteLink(s), [...new Set(m.sites.map(x => SRC_WORD[x.src]))].map(w => esc(w)).join(' · '), extra);
    }
    async function fillMetier(host, pid) {
        const r = await ask('mr_person', {id: pid});
        if (!host.isConnected) return r;
        if (!r?.ok || !r.matches?.length) { host.innerHTML = ''; host.closest('section.card')?.setAttribute('hidden', ''); return r; }
        host.innerHTML = r.matches.map(m => matchHtml(r.person, m)).join('') + `<p class="mr-src">${esc(T('Règle : un site dont le nom va avec le métier, à moins de {k} km d’un lieu de sa vie, ouvert de son vivant quand ses dates sont connues. « Peut-être » : rien ne dit qu’il y a travaillé.', {k: r.radius_km}))} ${srcTxt(r.sources)}</p>`;
        host.closest('section.card')?.removeAttribute('hidden');
        return r;
    }

    /* ═════════ 2. 🌊 la rivière, les repères, les hautes eaux ═════════ */
    const riverList = rs => rs.map(x => `<b>${esc(x.name)}</b>`);
    function riversHtml(r, {person = null, place = false} = {}) {
        const out = [];
        const withRiver = (r.places || []).filter(p => p.rivers?.length);
        if (withRiver.length) {
            const lines = withRiver.map(p => { const rs = riverList(p.rivers); return T('{rivers} {verb} à {p}', {rivers: rs.length > 1 ? rs.slice(0, -1).join(', ') + ' ' + T('et') + ' ' + rs[rs.length - 1] : rs[0], verb: rs.length > 1 ? T('passent') : T('passe'), p: esc(p.name)}); });
            out.push(row('🌊', lines.join(' ; ') + '.', link('https://www.sandre.eaufrance.fr/', 'Sandre — BD TOPAGE®') + ' (Licence Ouverte)'));
        }
        (r.river_jobs || []).forEach(j => { if (!j.river) return; out.push(row('🚣', esc(T(j.line, {p: person?.first || T('Cette personne'), job: j.job.toLowerCase(), r: j.river})), '')); });
        const reps = r.reperes || [];
        if (reps.length) {
            const one = x => `${T('{where}, une marque rappelle la crue du {d}', {where: esc(x.desc && x.desc !== '-' ? `${x.commune} — « ${x.desc} »` : x.commune), d: esc(dayTxt(x.day, x.month, x.year))})}${x.river ? ` (${esc(x.river)})` : ''}${x.max ? ` — <b>${esc(T('la plus haute connue ici'))}</b>` : ''}${x.in_life ? ` · <span class="mr-life">${esc(T('de son vivant'))}</span>` : ''} ${link(x.url, T('photo et fiche ↗'))}`;
            const first = reps.slice(0, 3), rest = reps.slice(3);
            out.push(row('〰️', `<b>${esc(T('Repères de crues tout près'))}</b><ul class="hist-ul">${first.map(x => `<li>${one(x)}</li>`).join('')}</ul>`, link('https://www.reperesdecrues.developpement-durable.gouv.fr/', T('Plateforme des repères de crues')) + ' (Licence Ouverte)',
                rest.length ? `<details class="mr-more"><summary>${esc(T('plus ({n})', {n: (r.reperes_count || reps.length) - 3}))}</summary><ul class="hist-ul">${rest.map(x => `<li>${one(x)}</li>`).join('')}</ul></details>` : ''));
        }
        (r.gauges || []).forEach(g => {
            const top = g.top.map(x => `${esc(ymTxt(x.ym))} : <b>${esc(T('{h} m', {h: num(x.h_m, 2)}))}</b>${x.ym === g.record.ym ? ` (${esc(T('le record de la station'))})` : ''}`);
            const lead = place ? T('Les plus hautes eaux mesurées à la station « {s} » (depuis {y}) :', {s: g.station.name, y: g.first}) : T('Les plus hautes eaux de son vivant à la station « {s} » ({d}, mesurée depuis {y}) :', {s: g.station.name, d: fmtKm(g.station.km), y: g.first});
            const rec = g.top.some(x => x.ym === g.record.ym) ? '' : ` ${T('Record de la station : {h} m en {m}.', {h: num(g.record.h_m, 2), m: ymTxt(g.record.ym)})}`;
            out.push(row('📏', `${esc(lead)} ${top.join(' ; ')}.${esc(rec)}`, link('https://hubeau.eaufrance.fr/page/api-hydrometrie', 'Hub’Eau — Hydroportail') + ' (Licence Ouverte)',
                `<small class="muted hist-hyp">${esc(T('Hauteur maximale du mois lue à l’échelle de la station (pas la hauteur dans le village).'))}</small>`));
        });
        if (r.offline && !out.length) return offLine(T('la rivière et ses crues'));
        return out.join('') + (r.offline ? `<p class="mr-off muted">📴 ${esc(T('Une partie vient d’Internet : elle s’affichera quand tu seras connecté.'))}</p>` : '');
    }
    /** crochet de heritage-histoire.js : après les inondations du bloc « 🏘 Le lieu à son époque » */
    async function histoireAfter(host) {
        if (!on('rivers') || !host?.isConnected) return;
        const pid = Number(host.dataset.histLife); if (!pid) return;
        host.querySelector('[data-mr-hist]')?.remove();
        // la rivière vient en partie d'Internet (Sandre) : seulement quand le bloc arrive à l'écran, jamais pendant l'ouverture de la fiche
        const W = window.LCNDA_PERF?.whenSeen; if (W) await new Promise(ok => W(host, ok));
        if (!host.isConnected) return;
        const r = await ask('mr_rivers', {id: pid});
        if (!host.isConnected || !r?.ok) return;
        const html = riversHtml(r, {person: r.person});
        if (!html) return;
        const box = `<div class="mr-hist" data-mr-hist>${html}</div>`;
        host.querySelector('[data-mr-hist]')?.remove();
        const rows = [...host.querySelectorAll(':scope > .hist-row')], flood = rows.filter(x => /🌊|🏛/.test(x.querySelector('.hist-i')?.textContent || '')).pop();
        if (flood) flood.insertAdjacentHTML('afterend', box);
        else { const kids = rows.filter(x => /👶/.test(x.querySelector('.hist-i')?.textContent || '')); if (kids[0]) kids[0].insertAdjacentHTML('beforebegin', box); else host.insertAdjacentHTML('beforeend', box); }
    }
    (ext.histoireAfter = ext.histoireAfter || []).push(histoireAfter);

    /* ═════════ 3. la fiche d'un village ═════════ */
    const placeQuery = p => Object.fromEntries(Object.entries({place_id: Number(p?.id || p?.place_id) || '', name: p?.name || '', insee: p?.insee || '', lat: p?.lat ?? p?.latitude, lon: p?.lon ?? p?.longitude})
        .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))));
    function panel(id, title, body) { return body ? `<section class="maintenance-panel cplus-panel mr-panel" data-mr-part="${id}"><h3>${esc(T(title))}</h3>${body}</section>` : ''; }
    function sitesHtml(d) {
        const S = d.sites || {}, mines = d.mines || [];
        if (!S.count && !mines.length) return '';
        const name = d.place.name || T('la commune');
        const out = [];
        if (S.count) {
            const kinds = (S.tally || []).slice(0, 5).map(x => `${esc(T(x.label).replace(/^(une?|des) /, ''))} (${x.count})`).join(', ');
            const item = x => `<li><b>${esc(x.name)}</b>${x.activity ? ` — ${esc(x.activity)}` : ''}${x.address ? ` <small class="muted">${esc(x.address)}</small>` : ''}${x.url ? ` ${link(x.url, T('fiche ↗'))}` : ''}</li>`;
            out.push(`<p>${T(S.count > 1 ? '{n} anciens ateliers, usines et commerces connus à {p}' : '{n} ancien atelier ou usine connu à {p}', {n: `<b>${S.count}</b>`, p: esc(name)})}${kinds ? ` ${T('— dont {k}', {k: kinds})}` : ''}.</p>
                <details class="mr-more"><summary>${esc(T('voir la liste'))}</summary>${S.count > 12 ? `<input type="search" class="mr-filter" data-mr-filter placeholder="${esc(T('Filtrer (ex. tannerie)'))}">` : ''}<ul class="mr-list">${S.items.map(item).join('')}</ul>${S.count > S.items.length ? `<p class="muted">${esc(T('… et {n} autres.', {n: S.count - S.items.length}))}</p>` : ''}</details>
                <p class="mr-src">${esc(T('L’inventaire ne dit pas les années d’activité ; beaucoup de sites sont d’après 1850.'))} ${T('Source :')} ${link(d.sources[0].url, d.sources[0].mention)} (${esc(d.sources[0].licence)})</p>`);
        }
        if (mines.length) out.push(`<p>⛏️ ${esc(T('Mines et carrières :'))} ${mines.map(m => `${link(m.url, m.name)}${m.start || m.end ? ` (${m.start || '?'}–${m.end || ''})` : ''}`).join(', ')} <small class="muted">${esc(T('Source :'))} Wikidata (CC0)</small></p>`);
        return out.join('');
    }
    function millsHtml(d) {
        const M = d.mills || []; if (!M.length) return '';
        const ETAT = ['', T('détruit en partie'), T('détruit')];
        const li = x => `<li><b>${esc(x.name)}</b>${x.river ? ` — ${esc(x.river)}` : ''}${x.state ? ` <small class="muted">(${esc(ETAT[x.state])})</small>` : ''}${x.drop_m ? ` <small class="muted">${esc(T('chute de {h} m', {h: num(x.drop_m)}))}</small>` : ''}${x.km != null && d.rule === 'radius' ? ` <small class="muted">${esc(fmtKm(x.km))}</small>` : ''}</li>`;
        const rivers = [...new Set(M.map(x => x.river).filter(Boolean))].slice(0, 3);
        return `<p>${T(d.mills_count > 1 ? '{n} moulins et usines à eau{r}.' : '{n} moulin ou usine à eau{r}.', {n: `<b>${d.mills_count}</b>`, r: rivers.length ? ' ' + esc(T('sur {r}', {r: rivers.join(', ')})) : ''})}</p>
            <ul class="mr-list">${M.slice(0, 4).map(li).join('')}</ul>${M.length > 4 ? `<details class="mr-more"><summary>${esc(T('plus ({n})', {n: d.mills_count - 4}))}</summary><ul class="mr-list">${M.slice(4).map(li).join('')}</ul></details>` : ''}
            <p class="mr-src">${esc(T('Le nom de l’ouvrage garde souvent celui du moulin d’autrefois.'))} ${T('Source :')} ${link('https://www.sandre.eaufrance.fr/', 'OFB, Sandre — ROE')} (Licence Ouverte)</p>`;
    }
    async function fillRiverPlace(body, place, d) {
        body.innerHTML = wait(T('On cherche la rivière…'));
        const r = await ask('mr_rivers', placeQuery(place));
        if (!body.isConnected) return r;
        // les repères de la commune (données livrées) plutôt que ceux des 5 km
        const mixed = {...(r?.ok ? r : {places: [], gauges: []}), reperes: (d?.reperes || []).map(x => ({...x, in_life: false})), reperes_count: d?.reperes_count || 0, offline: !r?.ok || r.offline};
        const html = riversHtml(mixed, {place: true});
        body.innerHTML = html;
        if (!html.trim()) body.closest('[data-mr-part]')?.remove();
        return r;
    }

    /* 🖼️ Ton village au musée */
    const popCache = new Map();
    function popCard(it, key, i) {
        const cap = [it.when, it.author].filter(Boolean).join(' · ');
        return `<figure class="cplus-img mr-img"><a href="${esc(it.page)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Voir sur POP'))}"><img loading="lazy" alt="${esc(it.title)}" src="${esc(it.thumb)}" onerror="this.closest('figure').classList.add('is-noimg')"></a>
            <figcaption><b>${esc(it.kind === 'photo' ? T('📷 Photo') : it.held ? T('🏛 Au musée de la commune') : T('🏛 Musée'))}${it.where ? ` — ${esc(it.where)}` : ''}</b><span class="cplus-img-t">${esc(it.title)}</span><small>${cap ? esc(cap) + ' · ' : ''}${esc(it.copy || T('droits non précisés'))}</small>
            ${it.free && !kiosk() ? `<button type="button" class="button small secondary" data-mr-keep="${i}" data-mr-key="${esc(key)}">${esc(T('＋ Garder dans les médias'))}</button>` : ''}</figcaption></figure>`;
    }
    async function fillPop(body, place) {
        body.innerHTML = wait(T('On cherche ton village dans les musées…'));
        const r = await ask('mr_pop', placeQuery(place));
        if (!body.isConnected) return r;
        if (!r?.ok) { if (r?.offline) body.innerHTML = offLine(T('les photos et objets de musée')); else body.closest('[data-mr-part]')?.remove(); return r; }
        if (!r.items?.length) { body.closest('[data-mr-part]')?.remove(); return r; }
        const key = `${r.place?.insee || ''}|${r.place?.name || ''}`; popCache.set(key, {items: r.items, place});
        const when = r.fetched_at ? (r.cached ? T('gardé sur l’ordinateur le {d}', {d: fmtDate(r.fetched_at)}) : T('lu en ligne le {d}', {d: fmtDate(r.fetched_at)})) : '';
        body.innerHTML = `<p>${esc(T('{n} photos et objets de musée où paraît {p}.', {n: r.items.length, p: r.place?.name || ''}))} ${link(r.search, T('Tout voir sur POP ↗'))}</p><div class="cplus-strip">${r.items.map((it, i) => popCard(it, key, i)).join('')}</div>
            <p class="cplus-src">${T('Source :')} ${link(r.source.url, r.source.mention)} — ${esc(T('notices sous Licence Ouverte ; chaque photo a ses droits, écrits sous elle. « Garder » seulement quand la licence le permet.'))}${when ? ` · <span>${esc(when)}</span>` : ''}${r.stale ? ` · <span class="cplus-stale">${esc(T('hors ligne : réponse gardée'))}</span>` : ''}</p>`;
        return r;
    }
    async function keepPop(btn) {
        const g = popCache.get(btn.dataset.mrKey); const it = g?.items?.[Number(btn.dataset.mrKeep)]; if (!it) return;
        btn.disabled = true; const label = btn.textContent; btn.textContent = '…';
        try {
            const res = await post('mr_pop_keep', {base: it.base, ref: it.ref, place_name: g.place?.name || ''});
            btn.textContent = T('✓ Dans les médias');
            const undo = async () => { await post('mr_pop_keep_undo', {batch: res.batch}); if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } };
            A().undoToast ? A().undoToast(T('Image rangée dans les médias, avec sa mention ({l}).', {l: res.licence}), {undo, icon: '🖼️'}) : A().toast?.(T('Image rangée dans les médias.'));
        } catch (e) { btn.disabled = false; btn.textContent = label; A().toast?.(e.message, 'error'); }
    }

    /** remplit un hôte avec les parties allumées de la commune (rien s'il n'y a rien) ; opts.parts pour n'en montrer qu'une */
    async function placeInto(host, place, opts = {}) {
        if (!host) return null;
        const s = settings(), parts = (opts.parts || ['place_sites', 'place_mills', 'place_river', 'place_pop']).filter(k => opts.force || s[k]);
        if (!parts.length) { host.innerHTML = ''; return null; }
        const d = (parts.some(k => k !== 'place_pop')) ? await ask('mr_place', placeQuery(place)) : {ok: true, place};
        if (!host.isConnected && !opts.detached) return d;
        if (!d?.ok) { host.innerHTML = ''; return d; }
        host.innerHTML = parts.map(k => k === 'place_sites' ? panel(k, '🏭 Activités anciennes de la commune', sitesHtml(d))
            : k === 'place_mills' ? panel(k, '⚙️ Moulins et usines à eau', millsHtml(d))
                : panel(k, k === 'place_river' ? '🌊 La rivière du village' : '🖼️ Ton village au musée', '<div data-mr-body></div>')).join('');
        host.classList.toggle('mr-place', !!host.innerHTML);
        const pl = {...place, insee: place.insee || d.place?.insee, lat: place.lat ?? d.place?.lat, lon: place.lon ?? d.place?.lon, name: place.name || d.place?.name};
        const jobs = [];
        const rb = host.querySelector('[data-mr-part="place_river"] [data-mr-body]'); if (rb) jobs.push(pl.lat != null ? fillRiverPlace(rb, pl, d) : Promise.resolve(rb.innerHTML = riversHtml({reperes: d.reperes, reperes_count: d.reperes_count}, {place: true})).then(() => { if (!rb.innerHTML.trim()) rb.closest('[data-mr-part]')?.remove(); }));
        const pb = host.querySelector('[data-mr-part="place_pop"] [data-mr-body]'); if (pb) jobs.push(fillPop(pb, pl));
        await Promise.all(jobs);
        return d;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'mr_place', host: '[data-mr-host]', icon: '⛏️', label: 'Activités anciennes, moulins, rivière, musée', group: 'Autour'});
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-mr])');
        if (village) {
            village.dataset.mr = '1';
            const place = villagePlace(village); if (!place.id && !place.insee) return;
            const anchor = village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid') || village.querySelector('[data-vsec="stats"]');
            const box = '<div class="mr-place" data-mr-host></div>';
            if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
            placeInto(village.querySelector('[data-mr-host]'), place);
            return;
        }
        const mono = ws.querySelector('.place-monograph-sections:not([data-mr])');
        if (mono && !mono.closest('.h-village')) {
            mono.dataset.mr = '1';
            const pli = ws.querySelector('.place-monograph-images[data-pli-host]'), cpo = ws.querySelector('[data-cpo-place]');
            const place = {id: Number(pli?.dataset.pliPlace || cpo?.dataset.cpoPlace) || 0, name: pli?.dataset.pliName || '', lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null};
            if (!place.id) return;
            const anchor = mono.querySelector('[data-lp-host]') || mono.querySelector('.place-monograph-postcards');
            const box = '<div class="mr-place" data-mr-host></div>';
            if (anchor) anchor.insertAdjacentHTML(anchor.matches('[data-lp-host]') ? 'afterend' : 'beforebegin', box); else mono.insertAdjacentHTML('beforeend', box);
            placeInto(mono.querySelector('[data-mr-host]'), place);
        }
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════ le bloc de la fiche personne ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.mr_metier = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !on('metier')) return '';
        return A().card(index, T('⛏️ Son métier, près de chez lui'), '', `<div class="mr-block" data-mr-metier="${Number(p.id)}"></div>`, 'span-12').replace(/^(\s*<section class="card [^"]*")/, '$1 hidden'); // hidden après class : l'app pose encore data-pblock sur la carte
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-mr-metier]').forEach(h => fillMetier(h, Number(h.dataset.mrMetier))); });

    document.addEventListener('click', e => {
        const k = e.target.closest?.('[data-mr-keep]'); if (k) { e.preventDefault(); keepPop(k); return; }
        if (e.target.closest?.('[data-mr-clear]')) clearCache();
    });
    document.addEventListener('input', e => {
        const f = e.target.closest?.('[data-mr-filter]'); if (!f) return;
        const q = f.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        (f.closest('details, .mr-panel') || f.parentElement).querySelectorAll('.mr-list > li').forEach(li => { li.hidden = !!q && !(window.LCNDA_UI?.listMatch?.text || ((q, ...h) => h.join(' ').toLowerCase().includes(String(q).toLowerCase())))(q, li.textContent); });
    });
    document.addEventListener('change', e => { const t = e.target.closest?.('[data-mr-tg]'); if (t && e.target.matches('input')) { const s = settings(); s[t.dataset.mrTg] = e.target.checked; save(s); memo.clear(); } });

    /* ═════════ Réglages → ⛏️ Métiers et rivières ═════════ */
    async function clearCache() {
        try {
            const res = await post('mr_cache_clear', {});
            memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await post('mr_cache_restore', {token: res.token}); drawSettings(); }});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = {sources: [], cache: {count: 0, bytes: 0}};
        try { about = await api('mr_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-mr-settings]')) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-mr-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = about.sources.map(x => `<tr><td>${link(x.url, x.label)}</td><td>${esc(x.what)}${x.count ? ` <small class="muted">(${esc(Number(x.count).toLocaleString('fr-FR'))})</small>` : ''}</td><td>${esc(x.online ? T('en ligne, gardé') : T('dans l’app'))}</td><td>${esc(x.licence)}</td><td>${esc(x.mention)}</td></tr>`).join('');
        const kb = Math.max(1, Math.round((about.cache?.bytes || 0) / 1024));
        ws.innerHTML = `<section class="page cplus-settings mr-settings" data-mr-settings>${UI().pageHeader ? UI().pageHeader({title: T('Métiers et rivières'), icon: '⛏️', where: T('Réglages · Données'), help: esc(T('Les anciens ateliers, mines et moulins près des lieux de tes ancêtres, la rivière du village et ses crues, ton village au musée.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('Les rivières, les hautes eaux et les musées viennent d’Internet, une fois : {n} réponses gardées ({k} Ko).', {n: about.cache?.count || 0, k: kb}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-mr-clear ${about.cache?.count && !kiosk() ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Mention'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Ce qui part sur Internet : la position ou le code INSEE du lieu, et son nom pour les musées. Jamais de nom de personne.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'commune_plus'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'mr_metier')) { let i = B.findIndex(b => b[0] === 'histoire'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, ['mr_metier', '⛏️ Son métier, près de chez lui']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.mr_metier ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    /* ═════════ 🧰 le registre commun des données : à la demande ═════════ */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    async function runPlace(part, ctx, host, empty) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        host.innerHTML = '<div></div>';
        const d = await placeInto(host.firstElementChild, pl, {parts: [part], force: true, detached: true});
        if (!host.firstElementChild?.textContent.trim()) host.innerHTML = emptyLine(d?.ok === false && d?.noplace ? T('Lieu introuvable : il faut un lieu en France, avec un code INSEE ou une position.') : empty, 'ℹ️');
        return d;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'mr_metier', icon: '⛏️', label: T('Son métier, près de chez lui (anciens sites)'), group: 'La personne', needs: ['person'], installed: () => true,
            run: async (ctx, host) => { const id = Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0; if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
                host.innerHTML = '<div class="mr-block"></div>'; const r = await fillMetier(host.firstElementChild, id);
                if (!host.firstElementChild?.innerHTML.trim()) host.innerHTML = emptyLine(T('Aucun ancien site ne va avec son métier près de ses lieux (il faut un métier et des lieux placés en France).'), '⛏️'); return r; }},
        {id: 'mr_riviere_personne', icon: '🌊', label: T('Sa rivière et ses crues'), group: 'La personne', needs: ['person'], online: true,
            run: async (ctx, host) => { const id = Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0; if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
                const r = await ask('mr_rivers', {id}); host.innerHTML = (r?.ok ? riversHtml(r, {person: r.person}) : '') || emptyLine(T('Pas de rivière ni de repère de crue connus près de ses lieux.'), '🌊'); return r; }},
        {id: 'mr_sites', icon: '🏭', label: T('Activités anciennes de la commune'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('place_sites', ctx, host, T('Aucun ancien site industriel connu dans cette commune.'))},
        {id: 'mr_moulins', icon: '⚙️', label: T('Moulins et usines à eau de la commune'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('place_mills', ctx, host, T('Aucun moulin connu du ROE ici.'))},
        {id: 'mr_riviere', icon: '🌊', label: T('La rivière du village et ses crues'), group: 'Le lieu', needs: ['place'], online: true, run: (ctx, host) => runPlace('place_river', ctx, host, T('Pas de rivière ni de repère de crue connus ici.'))},
        {id: 'mr_musee', icon: '🖼️', label: T('Ton village au musée (POP)'), group: 'Le lieu', needs: ['place'], online: true, run: (ctx, host) => runPlace('place_pop', ctx, host, T('Rien dans les musées pour cette commune.'))});

    /* ═════════ 📋 Listes : chaque jeu de données dans Listes (moteur commun, LCNDA_EXT.dataLists) ═════════ */
    const listQuery = kind => async query => { const r = await api('mr_list', {kind, query: JSON.stringify(query || {})}); return {rows: r.rows || [], total: r.total || 0}; };
    const geo = r => (r.lat != null && r.lon != null ? [r.lat, r.lon] : null);
    const openUrl = r => { if (r.url) window.open(r.url, '_blank', 'noopener'); };
    const DEPF = {key: 'dep', label: T('Département'), type: 'enum'}, INSEEF = {key: 'insee', label: T('Code INSEE'), type: 'text'};
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'mr_casias', icon: '🏭', label: T('Anciens sites industriels (CASIAS)'), group: 'Le lieu', source: 'Géorisques, BRGM — CASIAS (Licence Ouverte Etalab 2.0)', sourceUrl: 'https://www.georisques.gouv.fr/donnees/bases-de-donnees/inventaire-historique-de-sites-industriels-et-activites-de-service',
            query: listQuery('casias'), geo, open: openUrl, period: () => null,
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'categorie', label: T('Sorte (métier)'), type: 'enum', values: ['tannerie', 'mine', 'carrière', 'forge', 'verrerie', 'atelier textile', 'moulin', 'papeterie', 'tuilerie', 'four à chaux', 'brasserie', 'distillerie', 'poterie', 'scierie', 'teinturerie', 'chapellerie', 'manufacture d’armes', 'tonnellerie', 'savonnerie', 'corderie', 'usine à gaz', 'fabrique de chandelles', 'sucrerie', 'saline', 'imprimerie', 'blanchisserie', 'abattoir', 'manufacture des tabacs', 'ateliers du chemin de fer']},
                {key: 'activite', label: T('Activité'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, DEPF, INSEEF, {key: 'adresse', label: T('Adresse'), type: 'text'}, {key: 'km', label: T('Distance (km)'), type: 'number'}, {key: 'url', label: T('Fiche'), type: 'url'}]},
        {id: 'mr_mines', icon: '⛏️', label: T('Mines et carrières (Wikidata)'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q820477',
            query: listQuery('mines'), geo, open: openUrl, period: r => (r.debut || r.fin ? [r.debut || r.fin, r.fin || new Date().getFullYear()] : null),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'categorie', label: T('Sorte'), type: 'enum', values: ['mine', 'carrière']}, {key: 'debut', label: T('Ouverte'), type: 'year'}, {key: 'fin', label: T('Fermée'), type: 'year'}, DEPF, {key: 'km', label: T('Distance (km)'), type: 'number'}, {key: 'url', label: T('Wikidata'), type: 'url'}]},
        {id: 'mr_moulins', icon: '⚙️', label: T('Moulins et usines à eau (ROE)'), group: 'Le lieu', source: 'OFB, Sandre — ROE (Licence Ouverte Etalab 2.0)', sourceUrl: 'https://www.sandre.eaufrance.fr/',
            query: listQuery('roe'), geo, period: () => null,
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'categorie', label: T('Sorte'), type: 'enum', values: ['moulin', 'minoterie', 'forge', 'martinet', 'scierie', 'papeterie', 'filature', 'foulon', 'usine', 'taillanderie', 'tannerie']},
                {key: 'riviere', label: T('Rivière'), type: 'text'}, {key: 'etat', label: T('État'), type: 'enum', values: ['existant', 'détruit en partie', 'détruit']}, {key: 'chute', label: T('Hauteur de chute (m)'), type: 'number'}, DEPF, INSEEF, {key: 'km', label: T('Distance (km)'), type: 'number'}]},
        {id: 'mr_reperes', icon: '🌊', label: T('Repères de crues'), group: 'Le lieu', source: 'Plateforme nationale des repères de crues (Licence Ouverte Etalab 2.0)', sourceUrl: 'https://www.reperesdecrues.developpement-durable.gouv.fr/',
            query: listQuery('reperes'), geo, open: openUrl, period: r => [r.annee, r.annee],
            fields: [{key: 'date', label: T('Date de la crue'), type: 'text'}, {key: 'annee', label: T('Année'), type: 'year'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'riviere', label: T('Rivière'), type: 'enum'}, {key: 'plus_haute', label: T('Plus haute crue connue ici'), type: 'enum', values: ['oui', 'non']},
                {key: 'description', label: T('Où est la marque'), type: 'text'}, {key: 'altitude', label: T('Altitude de l’eau (m NGF)'), type: 'number'}, DEPF, INSEEF, {key: 'km', label: T('Distance (km)'), type: 'number'}, {key: 'url', label: T('Photo et fiche'), type: 'url'}]},
        {id: 'mr_musee', icon: '🖼️', label: T('Ton village au musée (POP, en ligne)'), group: 'Le lieu', source: 'Ministère de la Culture, POP — notices Licence Ouverte ; photos : droits propres à chacune', sourceUrl: 'https://pop.culture.gouv.fr/', online: true,
            query: async query => { const r = await api('mr_list_pop', {query: JSON.stringify(query || {})}); return {rows: r.rows || [], total: r.total || 0, message: r.message || (r.offline ? T('Pas de connexion à Internet.') : '')}; },
            open: openUrl, period: () => null,
            fields: [{key: 'titre', label: T('Titre'), type: 'text'}, {key: 'sorte', label: T('Sorte'), type: 'enum', values: ['photo', 'musée', 'conservé dans la commune']}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'date', label: T('Date'), type: 'text'},
                {key: 'auteur', label: T('Auteur'), type: 'text'}, {key: 'lieu', label: T('Lieu ou musée'), type: 'text'}, {key: 'droits', label: T('Droits'), type: 'text'}, {key: 'libre', label: T('Licence libre'), type: 'enum', values: ['oui', 'non']}, {key: 'url', label: T('Notice POP'), type: 'url'}, {key: 'image', label: T('Image'), type: 'image'}]});

    ext.metiersRivieres = {settings, placeInto, fillMetier, histoireAfter, riversHtml, decorate, openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})();
