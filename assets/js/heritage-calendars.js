/**
 * 📅 Calendriers (onglet Listes ; serveur : lib/calendars.php).
 *  - « 🗓️ Mon agenda » : salons, visites d'archives, rappels, courriers (envoi, relance), circuits, renouvellements, tâches
 *    de l'Atelier, rappels d'enquête ; « + Nouveau » range la création dans la bonne liste.
 *  - « 📜 Calendrier de la famille » : les événements des fiches au jour, au mois ou à l'année ; sous chaque jour, la date
 *    dans les calendriers choisis (julien, républicain, juif, musulman…) ; mode « anniversaires » ; une personne seule.
 * Vues : siècle, décennie, année, mois, semaine, jour, liste. Réglages : premier jour de la semaine, style, taille,
 * couleurs, calendriers en correspondance, numéros de semaine, week-ends, nombre d'événements par case…
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const toast = (...a) => A().toast(...a);
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MONTHS_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const VIEWS = [['century', 'Siècle'], ['decade', 'Décennie'], ['year', 'Année'], ['month', 'Mois'], ['week', 'Semaine'], ['day', 'Jour'], ['list', 'Liste']];
    const pad = n => String(n).padStart(2, '0');
    const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
    const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dow = (y, m, d) => { const dt = new Date(Date.UTC(2000, m - 1, d)); dt.setUTCFullYear(y); return dt.getUTCDay(); };
    const addDays = (y, m, d, n) => { const dt = new Date(Date.UTC(2000, m - 1, d)); dt.setUTCFullYear(y); dt.setUTCDate(dt.getUTCDate() + n); return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]; };
    const isoWeek = (y, m, d) => { const dt = new Date(Date.UTC(2000, m - 1, d)); dt.setUTCFullYear(y); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3); const first = new Date(Date.UTC(2000, 0, 4)); first.setUTCFullYear(dt.getUTCFullYear()); return 1 + Math.round(((dt - first) / 864e5 - 3 + (first.getUTCDay() + 6) % 7) / 7); };
    const todayArr = () => { const t = new Date(); return [t.getFullYear(), t.getMonth() + 1, t.getDate()]; };
    const longDate = (y, m, d) => `${DAYS[dow(y, m, d)]} ${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`;

    /* ─── Réglages (gardés par calendrier, et copiés dans la base comme les autres réglages) ─── */
    const DEFAULTS = {
        agenda: {view: 'month', weekStart: 1, style: 'classique', size: 'normal', alt: [], weekNumbers: true, weekend: true, max: 4, showDone: true, colors: {}},
        genea: {view: 'year', weekStart: 1, style: 'papier', size: 'normal', alt: ['julian', 'republican'], weekNumbers: false, weekend: false, max: 3, anniv: false, approx: true, hidden: [], colors: {}},
    };
    const prefsKey = k => `genealogie-cal-${k}`;
    const prefs = k => { let p = {}; try { p = JSON.parse(localStorage.getItem(prefsKey(k)) || '{}') || {}; } catch (_) {} return {...DEFAULTS[k], ...p, colors: {...(p.colors || {})}}; };
    const savePrefs = (k, p) => { try { const {cursor, ...keep} = p; localStorage.setItem(prefsKey(k), JSON.stringify(keep)); } catch (_) {} };
    const GROUPS = {
        genea: [['birth', '👶 Naissances, baptêmes', '#1f9d55'], ['union', '💍 Mariages, unions', '#d6336c'], ['death', '✝️ Décès, sépultures', '#495057'], ['other', '📌 Autres événements', '#1c7ed6']],
        agenda: [['fair', '🎪 Salons et événements', '#e67700'], ['archive_visit', '🏛️ Visites d’archives', '#5f3dc4'], ['reminder', '🔔 Rappels', '#c92a2a'], ['courrier', '✉️ Courriers envoyés', '#868e96'],
            ['courrier_relance', '📮 Relances de courrier', '#d9480f'], ['field_trip', '🚗 Circuits sur le terrain', '#2b8a3e'], ['budget', '💶 Renouvellements', '#0b7285'], ['atelier_task', '✅ Tâches de l’Atelier', '#1c7ed6'], ['investigation', '🔍 Rappels d’enquête', '#7048e8']],
    };
    /** Sortes d'événements trouvées dans les fiches (chacune sa ligne dans la légende, au lieu de « Autres »). */
    const DYN = {genea: [], agenda: []};
    const groupsOf = k => [...GROUPS[k].filter(g => k !== 'genea' || g[0] !== 'other' || prefs('genea').groupOthers), ...DYN[k]];
    const colorOf = (k, p, g) => p.colors[g] || ([...GROUPS[k], ...DYN[k]].find(x => x[0] === g) || [, , '#1c7ed6'])[2];

    /* ─── Correspondances : la date dans les autres calendriers ─── */
    const altText = (y, m, d, type) => {
        try { const t = A().formatCalendarByType(A().gregorianToJdn(y, m, d), type); return /^(Hors|avant)/i.test(t || '') ? '' : t; } catch (_) { return ''; }
    };
    const altShort = (y, m, d, type) => { const t = altText(y, m, d, type); if (!t) return ''; return t.replace(/^(\d+)\s+([^\s]+)\s+(an\s+)?(\d+).*$/u, (_, dd, mm, an, yy) => `${dd} ${mm.slice(0, 5)}${mm.length > 5 ? '.' : ''} ${an ? 'an ' : ''}${yy}`); };
    const calName = type => (A().converterCalendarOptions.find(x => x[0] === type) || [, type])[1];

    /* ─── Le moteur : index des éléments, vues, navigation ─── */
    function makeIndex(items, p, cursorYear) {
        const day = new Map(), month = new Map(), year = new Map(), yearsAll = new Map();
        const push = (map, key, it) => { if (!map.has(key)) map.set(key, []); map.get(key).push(it); };
        items.forEach(it => {
            yearsAll.set(it.y, (yearsAll.get(it.y) || 0) + 1);
            if (it.d && it.m) {
                if (p.anniv) { push(day, iso(cursorYear, it.m, Math.min(it.d, dim(cursorYear, it.m))), it); return; }
                push(day, iso(it.y, it.m, it.d), it);
                if (it.end) { let [y, m, d] = [it.y, it.m, it.d]; for (let k = 0; k < 62; k++) { [y, m, d] = addDays(y, m, d, 1); const key = iso(y, m, d); if (key > it.end) break; push(day, key, {...it, cont: true}); } }
            } else if (it.m) { if (!p.anniv) push(month, `${it.y}-${pad(it.m)}`, it); }
            else if (!p.anniv) push(year, it.y, it);
        });
        return {day, month, year, yearsAll, count: (y, m = 0, d = 0) => {
            if (d) return (day.get(iso(y, m, d)) || []).length;
            if (m) { let n = (month.get(`${y}-${pad(m)}`) || []).length; for (let k = 1; k <= dim(y, m); k++) n += (day.get(iso(y, m, k)) || []).filter(i => !i.cont).length; return n; }
            if (p.anniv) return 0;
            return yearsAll.get(y) || 0;
        }};
    }

    function calendarScreen({key, eyebrow, title, intro, load, toItems, extraToolbar = () => '', bindExtra = () => {}, onNew = null, onOpen, initialCursor = null}) {
        return async token => {
            const st = S(), p = prefs(key);
            st.hCal ||= {};
            const fresh = !st.hCal[key];
            const c = st.hCal[key] ||= {view: p.view, cursor: todayArr()};
            let data;
            try { data = await load(); } catch (e) { toast(e.message, 'error'); return; }
            if (token !== st.workspaceToken || st.module !== 'listes') return;
            if (fresh && initialCursor) { const ic = initialCursor(data, p); if (ic) c.cursor = ic; }
            const ws = A().$('#workspace');
            let drawing = false;
            const draw = () => { if (drawing) return; drawing = true; try { paint(); } finally { drawing = false; } }; // un champ qui perd le focus pendant le dessin ne relance pas un dessin
            const paint = () => {
                const items = toItems(data, p, c).filter(it => (p.showDone !== false || !it.done) && !(p.hidden || []).includes(it.group) && (p.approx !== false || !it.approx));
                const [cy, cm, cd] = c.cursor, ix = makeIndex(items, p, cy);
                const chip = (it, full = false) => `<button type="button" class="h-cal-ev ${it.done ? 'is-done' : ''} ${it.approx ? 'is-approx' : ''} ${it.cont ? 'is-cont' : ''}" data-cal-uid="${esc(it.uid)}" style="--c:${colorOf(key, p, it.group)}" title="${esc(it.title + (it.sub ? ' — ' + it.sub : '') + (it.approx ? ' (date approximative)' : ''))}"><i></i><span>${esc(p.anniv && it.y ? `${it.title} (${cy - it.y} ans)` : it.title)}</span>${full && it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`;
                const head = (y, m, d) => `${p.alt.map(t => { const s = altShort(y, m, d, t); return s ? `<small class="h-cal-alt" title="${esc(calName(t))} : ${esc(altText(y, m, d, t))}">${esc(s)}</small>` : ''; }).join('')}`;
                const today = iso(...todayArr());
                const dayCell = (y, m, d, outside = false) => { const list = ix.day.get(iso(y, m, d)) || [], wd = dow(y, m, d);
                    return `<div class="h-cal-cell ${outside ? 'is-out' : ''} ${iso(y, m, d) === today ? 'is-today' : ''} ${p.weekend && (wd === 0 || wd === 6) ? 'is-we' : ''}" data-cal-go="day:${y}:${m}:${d}">
                        <div class="h-cal-dhead"><b>${d}</b>${head(y, m, d)}${onNew ? `<button type="button" class="h-cal-plus" data-cal-new="${iso(y, m, d)}" title="Créer ce jour-là">＋</button>` : ''}</div>
                        ${list.slice(0, p.max).map(it => chip(it)).join('')}${list.length > p.max ? `<span class="h-cal-more">+${list.length - p.max} ${list.length - p.max > 1 ? 'autres' : 'autre'}</span>` : ''}</div>`; };
                const order = [...Array(7).keys()].map(i => (p.weekStart + i) % 7);
                const heat = n => n ? `style="--h:${Math.min(1, 0.18 + Math.log2(n + 1) / 6)}"` : '';
                let body = '', label = '';
                const band = list => list?.length ? `<div class="h-cal-band"><span class="muted">Sans jour précis :</span> ${list.map(it => chip(it)).join('')}</div>` : '';
                if (c.view === 'month') {
                    label = `${MONTHS[cm - 1]} ${cy}`;
                    const first = (dow(cy, cm, 1) - p.weekStart + 7) % 7; let [y, m, d] = addDays(cy, cm, 1, -first);
                    const weeks = []; for (let w = 0; w < 6; w++) { const row = []; for (let k = 0; k < 7; k++) { row.push([y, m, d]); [y, m, d] = addDays(y, m, d, 1); } if (w < 5 || row.some(x => x[1] === cm)) weeks.push(row); }
                    body = `${band(ix.month.get(`${cy}-${pad(cm)}`))}<div class="h-cal-grid ${p.weekNumbers ? 'has-wn' : ''}"><div class="h-cal-wdays">${p.weekNumbers ? '<span class="h-cal-wn">S.</span>' : ''}${order.map(i => `<span>${DAYS[i].slice(0, 3)}.</span>`).join('')}</div>
                        ${weeks.map(row => `<div class="h-cal-week">${p.weekNumbers ? `<span class="h-cal-wn" data-cal-go="week:${row[0].join(':')}">${isoWeek(...row[3])}</span>` : ''}${row.map(([y2, m2, d2]) => dayCell(y2, m2, d2, m2 !== cm)).join('')}</div>`).join('')}</div>`;
                } else if (c.view === 'week') {
                    const back = (dow(cy, cm, cd) - p.weekStart + 7) % 7; const start = addDays(cy, cm, cd, -back);
                    const days = [...Array(7).keys()].map(i => addDays(...start, i));
                    label = `Semaine ${isoWeek(...days[3])} · ${days[0][2]} ${MONTHS_S[days[0][1] - 1]} → ${days[6][2]} ${MONTHS_S[days[6][1] - 1]} ${days[6][0]}`;
                    body = `<div class="h-cal-weekview">${days.map(([y, m, d]) => { const list = ix.day.get(iso(y, m, d)) || [], wd = dow(y, m, d);
                        return `<div class="h-cal-wcol ${iso(y, m, d) === today ? 'is-today' : ''} ${p.weekend && (wd === 0 || wd === 6) ? 'is-we' : ''}"><div class="h-cal-wchead" data-cal-go="day:${y}:${m}:${d}"><b>${DAYS[wd].slice(0, 3)}. ${d}</b> <small>${MONTHS_S[m - 1]}</small>${head(y, m, d)}${onNew ? `<button type="button" class="h-cal-plus" data-cal-new="${iso(y, m, d)}" title="Créer ce jour-là">＋</button>` : ''}</div>${list.map(it => chip(it, true)).join('') || '<span class="muted h-cal-none">—</span>'}</div>`; }).join('')}</div>`;
                } else if (c.view === 'day') {
                    label = longDate(cy, cm, cd);
                    const list = ix.day.get(iso(cy, cm, cd)) || [];
                    const corr = A().converterCalendarOptions.filter(([t]) => t !== 'gregorian').map(([t, n]) => [n, altText(cy, cm, cd, t)]).filter(x => x[1]);
                    body = `<div class="h-cal-dayview"><div><h3>${list.length ? A().plural(list.length, 'élément') : 'Rien ce jour-là'}</h3>${list.map(it => `<div class="h-cal-dayitem" style="--c:${colorOf(key, p, it.group)}">${chip(it, true)}</div>`).join('')}
                            ${onNew ? `<button type="button" class="button small" data-cal-new="${iso(cy, cm, cd)}">+ Créer ce jour-là</button>` : ''}</div>
                        <aside class="h-cal-corr"><h4>Ce jour dans les autres calendriers</h4><dl>${corr.map(([n, t]) => `<dt>${esc(n)}</dt><dd>${esc(t)}</dd>`).join('')}</dl></aside></div>`;
                } else if (c.view === 'year') {
                    label = String(cy);
                    body = `${band(ix.year.get(cy))}<div class="h-cal-yeargrid">${MONTHS.map((mn, i) => { const m = i + 1, first = (dow(cy, m, 1) - p.weekStart + 7) % 7, n = ix.count(cy, m);
                        return `<div class="h-cal-mini"><button type="button" class="h-cal-minihead" data-cal-go="month:${cy}:${m}:1">${mn} ${n ? `<small>${n}</small>` : ''}</button><div class="h-cal-minigrid">${order.map(k => `<span class="h-cal-miniwd">${DAYS[k][0].toUpperCase()}</span>`).join('')}${'<span></span>'.repeat(first)}${[...Array(dim(cy, m)).keys()].map(k => { const d = k + 1, c2 = ix.count(cy, m, d);
                            return `<button type="button" class="h-cal-miniday ${c2 ? 'has' : ''} ${iso(cy, m, d) === today ? 'is-today' : ''}" ${heat(c2)} data-cal-go="day:${cy}:${m}:${d}" title="${longDate(cy, m, d)}${c2 ? ` · ${A().plural(c2, 'élément')}` : ''}">${d}</button>`; }).join('')}</div>${(ix.month.get(`${cy}-${pad(m)}`) || []).length ? `<small class="muted">+ ${(ix.month.get(`${cy}-${pad(m)}`) || []).length} sans jour précis</small>` : ''}</div>`; }).join('')}</div>`;
                } else if (c.view === 'decade') {
                    const y0 = Math.floor(cy / 10) * 10; label = `${y0} – ${y0 + 9}`;
                    body = `<table class="h-cal-heat"><thead><tr><th></th>${MONTHS_S.map(m => `<th>${m}</th>`).join('')}<th>Année</th></tr></thead><tbody>${[...Array(10).keys()].map(k => { const y = y0 + k;
                        return `<tr><th><button type="button" class="link-button" data-cal-go="year:${y}:1:1">${y}</button></th>${MONTHS.map((_, i) => { const n = ix.count(y, i + 1); return `<td><button type="button" class="h-cal-hcell ${n ? 'has' : ''}" ${heat(n)} data-cal-go="month:${y}:${i + 1}:1">${n || ''}</button></td>`; }).join('')}<td class="h-cal-tot">${ix.count(y) || ''}</td></tr>`; }).join('')}</tbody></table>`;
                } else if (c.view === 'century') {
                    const y0 = Math.floor(cy / 100) * 100; label = `${y0} – ${y0 + 99}`;
                    body = `<table class="h-cal-heat"><thead><tr><th></th>${[...Array(10).keys()].map(k => `<th>${k}</th>`).join('')}<th>Décennie</th></tr></thead><tbody>${[...Array(10).keys()].map(k => { const d0 = y0 + k * 10; let tot = 0;
                        const cells = [...Array(10).keys()].map(j => { const y = d0 + j, n = ix.count(y); tot += n; return `<td><button type="button" class="h-cal-hcell ${n ? 'has' : ''}" ${heat(n)} data-cal-go="year:${y}:1:1" title="${y}">${n ? `<small>${y}</small>${n}` : `<small>${y}</small>`}</button></td>`; }).join('');
                        return `<tr><th><button type="button" class="link-button" data-cal-go="decade:${d0}:1:1">${d0}s</button></th>${cells}<td class="h-cal-tot">${tot || ''}</td></tr>`; }).join('')}</tbody></table>`;
                } else {
                    label = `Liste · ${p.listScope === 'month' ? `${MONTHS[cm - 1]} ${cy}` : cy}`;
                    const inScope = it => p.anniv ? (p.listScope !== 'month' || it.m === cm) : it.y === cy && (p.listScope !== 'month' || it.m === cm);
                    const list = items.filter(inScope).filter(it => !p.anniv || it.d).sort((a, b) => p.anniv ? (a.m - b.m || a.d - b.d) : (a.y - b.y || (a.m || 0) - (b.m || 0) || (a.d || 0) - (b.d || 0)));
                    body = `<div class="h-cal-listhead"><span class="segmented"><button type="button" class="${p.listScope !== 'month' ? 'is-active' : ''}" data-cal-scope="year">L’année</button><button type="button" class="${p.listScope === 'month' ? 'is-active' : ''}" data-cal-scope="month">Le mois</button></span></div>
                        ${list.length ? `<table class="data-table h-cal-list"><tbody>${list.map(it => { const y = p.anniv ? cy : it.y;
                        return `<tr><td class="h-cal-ldate">${it.d ? `<button type="button" class="link-button" data-cal-go="day:${y}:${it.m}:${it.d}">${it.d} ${MONTHS_S[it.m - 1]} ${y}</button>` : it.m ? `${MONTHS[it.m - 1]} ${it.y}` : `${it.y}`}${it.approx ? ' <small class="muted">env.</small>' : ''}${it.end ? `<br><small class="muted">→ ${esc(it.end.split('-').reverse().join('/'))}</small>` : ''}</td>
                            <td>${chip(it, true)}</td><td class="h-cal-lalt">${it.d ? p.alt.map(t => { const s = altText(y, it.m, it.d, t); return s ? `<small title="${esc(calName(t))}">${esc(s)}</small>` : ''; }).join('<br>') : ''}</td></tr>`; }).join('')}</tbody></table>` : A().empty('Rien sur cette période.')}`;
                }
                const viewBtns = VIEWS.map(([v, l]) => `<button type="button" class="${c.view === v ? 'is-active' : ''}" data-cal-view="${v}">${l}</button>`).join('');
                const legend = groupsOf(key).map(([g, l]) => `<button type="button" class="h-cal-leg ${(p.hidden || []).includes(g) ? 'is-off' : ''}" data-cal-leg="${g}" style="--c:${colorOf(key, p, g)}" title="Montrer / cacher"><i></i>${esc(l)}</button>`).join('');
                ws.innerHTML = `<section class="page collection-page h-cal h-cal-style-${p.style} h-cal-size-${p.size}">
                    <header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${title}</h2><p>${intro}</p></div><div class="page-actions">${onNew ? '<button type="button" class="button" data-cal-new="">+ Nouveau</button>' : ''}<button type="button" class="button secondary" data-cal-settings>⚙️ Réglages</button></div></header>
                    <div class="h-cal-bar"><span class="h-cal-nav"><button type="button" class="button small secondary" data-cal-step="-1" title="Précédent">‹</button><button type="button" class="button small secondary" data-cal-today>Aujourd’hui</button><button type="button" class="button small secondary" data-cal-step="1" title="Suivant">›</button></span>
                        <h3 class="h-cal-label">${esc(label)}</h3>
                        <span class="h-cal-jump"><select data-cal-month aria-label="Mois">${MONTHS.map((mn, i) => `<option value="${i + 1}" ${i + 1 === cm ? 'selected' : ''}>${mn}</option>`).join('')}</select><input type="number" data-cal-year value="${cy}" min="1" max="9999" aria-label="Année"></span>
                        <span class="segmented h-cal-views">${viewBtns}</span></div>
                    <div class="h-cal-bar2">${extraToolbar(data, p, c)}<span class="h-cal-legend">${legend}</span></div>
                    <div class="h-cal-body">${body}</div></section>`;
                const sec = ws.querySelector('.h-cal');
                const go = (view, y, m, d) => { c.view = view; c.cursor = [Number(y), Number(m) || 1, Number(d) || 1]; p.view = view; savePrefs(key, p); draw(); };
                sec.querySelectorAll('[data-cal-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.calView, ...c.cursor)));
                sec.querySelector('[data-cal-today]').addEventListener('click', () => go(c.view, ...todayArr()));
                sec.querySelectorAll('[data-cal-step]').forEach(b => b.addEventListener('click', () => { const s = Number(b.dataset.calStep); let [y, m, d] = c.cursor;
                    if (c.view === 'month') { m += s; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } d = Math.min(d, dim(y, m)); }
                    else if (c.view === 'week') [y, m, d] = addDays(y, m, d, 7 * s); else if (c.view === 'day') [y, m, d] = addDays(y, m, d, s);
                    else if (c.view === 'year' || c.view === 'list') { if (c.view === 'list' && p.listScope === 'month') { m += s; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } } else y += s; }
                    else if (c.view === 'decade') y += 10 * s; else y += 100 * s;
                    go(c.view, y, m, d); }));
                sec.querySelector('[data-cal-month]').addEventListener('change', e => go(c.view === 'year' || c.view === 'decade' || c.view === 'century' ? 'month' : c.view, c.cursor[0], e.target.value, 1));
                sec.querySelector('[data-cal-year]').addEventListener('change', e => { const y = Number(e.target.value); if (y >= 1 && y <= 9999) go(c.view, y, c.cursor[1], Math.min(c.cursor[2], dim(y, c.cursor[1]))); });
                sec.querySelectorAll('[data-cal-scope]').forEach(b => b.addEventListener('click', () => { p.listScope = b.dataset.calScope; savePrefs(key, p); draw(); }));
                sec.querySelectorAll('[data-cal-leg]').forEach(b => b.addEventListener('click', () => { const g = b.dataset.calLeg; p.hidden = (p.hidden || []).includes(g) ? p.hidden.filter(x => x !== g) : [...(p.hidden || []), g]; savePrefs(key, p); draw(); }));
                sec.querySelector('.h-cal-body').addEventListener('click', e => {
                    const nw = e.target.closest('[data-cal-new]'); if (nw) { e.stopPropagation(); return onNew?.(nw.dataset.calNew, () => reload()); }
                    const ev = e.target.closest('[data-cal-uid]'); if (ev) { e.stopPropagation(); const it = items.find(x => x.uid === ev.dataset.calUid); if (it) onOpen(it, {p, reload}); return; }
                    const g = e.target.closest('[data-cal-go]'); if (g) { const [v, y, m, d] = g.dataset.calGo.split(':'); go(v, y, m, d); }
                });
                sec.querySelector('[data-cal-new=""]')?.addEventListener('click', () => onNew(iso(...c.cursor), () => reload()));
                sec.querySelector('[data-cal-settings]').addEventListener('click', () => settingsDialog(key, p, draw));
                bindExtra(sec, data, p, c, {draw, reload});
            };
            const reload = async () => { try { data = await load(); } catch (e) { toast(e.message, 'error'); } draw(); };
            draw();
        };
    }

    function settingsDialog(key, p, after) {
        const alts = A().converterCalendarOptions.filter(([t]) => t !== 'gregorian');
        ext.openDialog({eyebrow: 'RÉGLAGES DU CALENDRIER', title: key === 'genea' ? 'Calendrier de la famille' : 'Mon agenda', wide: true, submitLabel: 'Appliquer',
            body: `<div class="form-grid"><label>La semaine commence le<select name="weekStart">${[[1, 'lundi (France, Europe)'], [0, 'dimanche (Amériques, Japon…)'], [6, 'samedi (Moyen-Orient)']].map(([v, l]) => `<option value="${v}" ${p.weekStart === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Style<select name="style">${[['classique', 'Classique'], ['papier', 'Papier ancien'], ['aere', 'Aéré'], ['compact', 'Compact'], ['contraste', 'Contrasté'], ['couleur', 'Cases colorées']].map(([v, l]) => `<option value="${v}" ${p.style === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Taille du texte<select name="size">${[['petit', 'Petite'], ['normal', 'Normale'], ['grand', 'Grande']].map(([v, l]) => `<option value="${v}" ${p.size === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Vue de départ<select name="view">${VIEWS.map(([v, l]) => `<option value="${v}" ${p.view === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Éléments par case (mois)<input type="number" name="max" min="1" max="20" value="${p.max}"></label></div>
                <fieldset class="h-rc-modes"><legend>Affichage</legend>
                    <label class="checkbox-line"><input type="checkbox" name="weekNumbers" ${p.weekNumbers ? 'checked' : ''}> Numéros de semaine</label>
                    <label class="checkbox-line"><input type="checkbox" name="weekend" ${p.weekend ? 'checked' : ''}> Week-ends grisés</label>
                    ${key === 'genea' ? `<label class="checkbox-line"><input type="checkbox" name="anniv" ${p.anniv ? 'checked' : ''}> <b>Anniversaires</b> : chaque événement revient tous les ans, au même jour (avec « il y a … ans »)</label>
                    <label class="checkbox-line"><input type="checkbox" name="approx" ${p.approx !== false ? 'checked' : ''}> Montrer les dates approximatives (« vers 1850 »)</label>
                    <label class="checkbox-line"><input type="checkbox" name="groupOthers" ${p.groupOthers ? 'checked' : ''}> Regrouper les autres sortes d’événements (métier, résidence…) sous « 📌 Autres événements »</label>` : `<label class="checkbox-line"><input type="checkbox" name="showDone" ${p.showDone !== false ? 'checked' : ''}> Montrer ce qui est fait ou passé</label>`}</fieldset>
                <fieldset class="h-rc-modes"><legend>Sous chaque jour, la date dans ces calendriers</legend><div class="h-cal-altpick">${alts.map(([t, n]) => `<label class="checkbox-line"><input type="checkbox" name="alt" value="${t}" ${p.alt.includes(t) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div></fieldset>
                <fieldset class="h-rc-modes"><legend>Couleurs</legend><div class="h-cal-colors">${groupsOf(key).map(([g, l]) => `<label><input type="color" name="color_${g}" value="${colorOf(key, p, g)}"> ${esc(l)}</label>`).join('')}</div></fieldset>
                <button type="button" class="button small secondary" data-cal-reset>↺ Remettre comme au départ</button>`,
            onOpen: d => d.querySelector('[data-cal-reset]').addEventListener('click', async () => { if (!await A().confirmBox('Remettre tous les réglages de ce calendrier comme au départ ?', {title: 'Réglages de départ', okLabel: 'Remettre comme au départ', danger: true})) return; Object.keys(p).forEach(k => delete p[k]); Object.assign(p, JSON.parse(JSON.stringify(DEFAULTS[key]))); savePrefs(key, p); d.close(); after(); }),
            onSubmit: form => {
                const fd = new FormData(form);
                Object.assign(p, {weekStart: Number(fd.get('weekStart')), style: fd.get('style'), size: fd.get('size'), view: fd.get('view'), max: Math.max(1, Math.min(20, Number(fd.get('max')) || 3)),
                    weekNumbers: fd.has('weekNumbers'), weekend: fd.has('weekend'), alt: fd.getAll('alt')});
                if (key === 'genea') Object.assign(p, {anniv: fd.has('anniv'), approx: fd.has('approx'), groupOthers: fd.has('groupOthers')}); else p.showDone = fd.has('showDone');
                groupsOf(key).forEach(([g, , def]) => { const v = fd.get('color_' + g); if (v && v !== def) p.colors[g] = v; else delete p.colors[g]; });
                const st = S().hCal?.[key]; if (st) st.view = p.view;
                savePrefs(key, p); after();
            },
        });
    }

    /* ─────────── 📜 Calendrier de la famille ─────────── */
    const genea = () => S().hCalGenea ||= {person: 0, personName: '', place: ''};
    /** Choisir un lieu : une commune, un département, une région ou un pays (ou leurs équivalents ailleurs). */
    const PLACE_KINDS = {place: 'commune', county: 'département', region: 'région', country: 'pays'};
    const placeLabel = (k, v, n) => `${v} — ${PLACE_KINDS[k]}${n ? ` (${n})` : ''}`;
    function placeSelect(data) {
        const cur = genea().place || '';
        if (cur) { const [k, v] = cur.split(/:(.*)/s); return `<span class="h-cal-place">📍 <b>${esc(v)}</b> <small class="muted">${esc(PLACE_KINDS[k] || '')}</small> <button type="button" class="icon-button" data-cal-place-clear title="Tous les lieux">✕</button></span>`; }
        const m = new Map(); data.events.forEach(e => Object.keys(PLACE_KINDS).forEach(k => { if (e[k]) { const key = k + ':' + e[k]; m.set(key, (m.get(key) || 0) + 1); } }));
        const opts = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, n]) => { const [k, v] = key.split(/:(.*)/s); return `<option value="${esc(placeLabel(k, v, n))}" data-key="${esc(key)}">`; }).join('');
        return `<span class="h-cal-place"><input type="search" data-cal-place placeholder="📍 Un lieu : commune, département, région, pays…" list="h-cal-places"><datalist id="h-cal-places">${opts}</datalist></span>`;
    }
    /* ─── 📅 Exporter les anniversaires dans un fichier .ics (calendrier du téléphone, de l'ordinateur) ─── */
    function icsExportDialog() {
        const PK = window.LCNDA_PICKER;
        ext.openDialog({eyebrow: 'CALENDRIER', title: '📅 Exporter les anniversaires (.ics)', submitLabel: '📅 Télécharger le fichier',
            body: `<p class="muted">Un fichier à ouvrir dans ton calendrier (Apple, Google, Outlook…) : chaque anniversaire revient tous les ans. Le réimporter plus tard met à jour sans créer de doublon.</p>
                <fieldset class="h-rc-modes"><legend>Les personnes</legend>
                    <label class="checkbox-line"><input type="radio" name="who" value="sosa" checked> Mes ancêtres directs (numérotés Sosa)</label>
                    <label class="checkbox-line"><input type="radio" name="who" value="all"> Toute la base</label>
                    <label class="checkbox-line"><input type="radio" name="who" value="branch"> Une branche : une personne et tous ses descendants</label>
                    <div data-ics-branch hidden>${PK.pickerField({name: 'ics_root', kind: 'person', allowCreate: false})}</div></fieldset>
                <label class="checkbox-line"><input type="checkbox" name="living"> Seulement les personnes en vie (sans décès noté)</label>
                <fieldset class="h-rc-modes"><legend>Les anniversaires</legend>
                    <label class="checkbox-line"><input type="checkbox" name="g_birth" checked> 👶 Naissances, baptêmes</label>
                    <label class="checkbox-line"><input type="checkbox" name="g_union" checked> 💍 Mariages</label>
                    <label class="checkbox-line"><input type="checkbox" name="g_death"> ✝️ Décès</label></fieldset>
                <label class="checkbox-line"><input type="checkbox" name="alarm" checked> Me le rappeler la veille</label>
                <p class="muted" data-ics-note></p>`,
            onOpen: dl => {
                const sync = () => { dl.querySelector('[data-ics-branch]').hidden = dl.querySelector('[name=who]:checked').value !== 'branch'; };
                dl.querySelectorAll('[name=who]').forEach(r => r.addEventListener('change', sync));
            },
            onSubmit: async form => {
                const who = form.querySelector('[name=who]:checked').value, groups = ['birth', 'union', 'death'].filter(g => form.elements['g_' + g].checked);
                if (!groups.length) return window.LCNDA_UI.fail(form.elements.g_birth, 'Coche au moins une sorte d’anniversaire.');
                let ids = null;
                if (who === 'sosa') { ids = new Set(Object.keys(A().sosaMap?.() || {}).map(Number)); if (!ids.size) { toast('Aucune personne numérotée Sosa : choisis le n°1 dans Maintenance → Apparence.', 'error'); return false; } }
                if (who === 'branch') { const root = Number(PK.pickerValue?.(form.querySelector('[data-ics-branch] .pk')) || form.querySelector('[name=ics_root]')?.value || 0); if (!root) return window.LCNDA_UI.fail(form.querySelector('[data-ics-branch] .pk'), 'Choisis la personne en haut de la branche.');
                    const m = await A().api('daboville_map', {root_id: root}); ids = new Set([root, ...Object.keys(m.map || {}).map(Number)]); }
                const data = await A().api('genea_calendar');
                const dead = new Set(data.events.filter(e => e.group === 'death').flatMap(e => e.who.map(w => Number(w.id))));
                const keep = e => groups.includes(e.group) && e.who.some(w => (!ids || ids.has(Number(w.id))) && (!form.elements.living.checked || !dead.has(Number(w.id))));
                const chosen = data.events.filter(keep), ok = chosen.filter(e => e.d && e.m && !e.approx), skipped = chosen.length - ok.length;
                if (!ok.length) { toast(chosen.length ? `Aucune date assez précise : ${A().plural(skipped, 'date n’a', 'dates n’ont')} que l’année ou une date approchée (vers, avant…), qu’un calendrier ne sait pas placer.` : 'Personne ne correspond à ce choix.', 'error'); return false; }
                const LABEL = {birth: 'Anniversaire de naissance', union: 'Anniversaire de mariage', death: 'Anniversaire du décès'};
                const entries = ok.map(e => { const names = e.who.map(w => w.name).join(' et '), g = e.who[0]?.gender === 'female';
                    return {uid: `lcnda-anniv-${e.id}@lcnda.local`, date: {y: e.y, m: e.m, d: e.d}, yearly: true, alarm: form.elements.alarm.checked,
                        summary: `${LABEL[e.group]} de ${names} (${e.group === 'birth' ? `${g ? 'née' : 'né'} en ${e.y}` : `${e.type.toLowerCase()} en ${e.y}`})`,
                        description: `${e.type} : ${e.text}${e.place ? ` à ${e.place}` : ''}\nExporté depuis LCNDA (généalogie).`}; });
                A().ics.download(`anniversaires-${who === 'sosa' ? 'ancetres' : who === 'all' ? 'famille' : 'branche'}.ics`, A().ics.build(entries, {name: 'Anniversaires de la famille'}));
                toast(`${A().plural(entries.length, 'anniversaire exporté', 'anniversaires exportés')}${skipped ? ` · ${A().plural(skipped, 'date laissée de côté', 'dates laissées de côté')} (année seule ou date approchée : un calendrier a besoin du jour précis)` : ''}.`);
            }});
    }
    ext.lists.genea_calendar = calendarScreen({
        key: 'genea', eyebrow: 'LISTES · CALENDRIERS', title: '📜 Calendrier de la famille',
        intro: 'Naissances, mariages, décès et tous les événements des fiches, au jour près quand la date le dit. Sous chaque jour, sa date dans les autres calendriers (julien, républicain…) : à choisir dans ⚙️ Réglages.',
        load: () => A().api('genea_calendar', genea().person ? {person_id: genea().person} : {}),
        // À l'ouverture : l'année du milieu des événements datés au jour (sinon de tous) ; en mode anniversaires, aujourd'hui
        initialCursor: (data, p) => { if (p.anniv || !data.events.length) return null; const pool = data.events.filter(e => e.d).length ? data.events.filter(e => e.d) : data.events; const ys = pool.map(e => e.y).sort((a, b) => a - b); const e = pool.find(x => x.y === ys[Math.floor(ys.length / 2)]); return [e.y, e.m || 1, e.d || 1]; },
        toItems: (data, p) => {
            const types = new Map(); data.events.filter(e => e.group === 'other').forEach(e => { const k = 'type:' + e.type; if (!types.has(k)) types.set(k, [k, '📌 ' + e.type, e.color || '#1c7ed6']); });
            DYN.genea = p.groupOthers ? [] : [...types.values()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
            const [pk, pv] = (genea().place || '').split(/:(.*)/s);
            return data.events.filter(e => !pk || String(e[pk] || '') === pv).map(e => ({uid: 'g' + e.id, y: e.y, m: e.m, d: e.d, approx: e.approx, group: e.group === 'other' && !p.groupOthers ? 'type:' + e.type : e.group,
            title: `${e.type}${e.who.length ? ' — ' + e.who.map(w => w.name).join(' et ') : ''}`, sub: [e.text && e.text !== String(e.y) ? e.text : '', e.place].filter(Boolean).join(' · '), raw: e}));
        },
        extraToolbar: (data) => '<button type="button" class="button small secondary" data-cal-ics title="Un fichier .ics à ouvrir dans ton calendrier (Apple, Google, Outlook…)">📅 Exporter les anniversaires (.ics)</button>' + placeSelect(data) + `<span class="h-cal-person">${genea().person ? `👤 <b>${esc(genea().personName)}</b> <button type="button" class="icon-button" data-cal-person-clear title="Toute la famille">✕</button>` : window.LCNDA_PICKER.pickerField({name: 'cal_person', kind: 'person', placeholder: 'Une seule personne…'})}</span>${data.undated ? `<small class="muted">${A().plural(data.undated, 'événement')} sans date lisible</small>` : ''}`,
        bindExtra: (sec, data, p, c, {reload, draw}) => {
            sec.querySelector('[data-cal-ics]')?.addEventListener('click', () => icsExportDialog());
            sec.querySelector('[data-cal-place-clear]')?.addEventListener('click', () => { genea().place = ''; draw(); });
            sec.querySelector('[data-cal-place]')?.addEventListener('input', e => { const o = [...sec.querySelectorAll('#h-cal-places option')].find(x => x.value === e.target.value); if (o) { genea().place = o.dataset.key; draw(); } });
            sec.querySelector('[data-cal-person-clear]')?.addEventListener('click', () => { Object.assign(genea(), {person: 0, personName: ''}); reload(); });
            // une seule personne : le menu de choix unique
            sec.querySelector('.h-cal-person')?.addEventListener('picker-change', e => { const it = e.detail.item; if (e.detail.name !== 'cal_person' || !it?.id) return; Object.assign(genea(), {person: Number(it.id), personName: it.title}); reload(); });
        },
        onOpen: (it, {p}) => {
            const e = it.raw, alts = e.d ? A().converterCalendarOptions.filter(([t]) => t !== 'gregorian').map(([t, n]) => [n, altText(e.y, e.m, e.d, t)]).filter(x => x[1]) : [];
            ext.openDialog({eyebrow: e.type.toUpperCase(), title: it.title, wide: true, submitLabel: 'Fermer',
                body: `<p><b>Date dans la fiche :</b> ${esc(e.text || String(e.y))}${e.calendar && e.calendar !== 'gregorian' ? ` <small class="muted">(${esc(calName(e.calendar))})</small>` : ''}${e.approx ? ' <small class="muted">— approximative</small>' : ''}</p>
                    ${e.d ? `<p><b>Grégorien :</b> ${longDate(e.y, e.m, e.d)}${p.anniv ? ` · il y a ${new Date().getFullYear() - e.y} ans` : ''}</p>` : `<p class="muted">Date connue ${e.m ? 'au mois' : 'à l’année'} près.</p>`}
                    ${e.place ? `<p><b>Lieu :</b> ${esc(e.place)}</p>` : ''}
                    <p>${e.who.map(w => `<button type="button" class="button small secondary" data-open-person="${w.id}">👤 ${esc(w.name)}</button>`).join(' ')}</p>
                    ${alts.length ? `<h4>Ce jour dans les autres calendriers</h4><dl class="h-cal-corr-dl">${alts.map(([n, t]) => `<dt>${esc(n)}</dt><dd>${esc(t)}</dd>`).join('')}</dl>` : ''}`,
                onOpen: d => d.querySelectorAll('[data-open-person]').forEach(b => b.addEventListener('click', () => { d.close(); S().currentPersonId = Number(b.dataset.openPerson); A().setModule('personnes'); })),
                onSubmit: () => true,
            });
        },
    });

    /* ─────────── 🗓️ Mon agenda ─────────── */
    const SRC_LIST = {fair: 'fairs', archive_visit: 'archive_visits', reminder: 'reminders', courrier: 'courriers', courrier_relance: 'courriers', field_trip: 'field_trips', budget: 'research_budget'};
    const KINDS = [
        ['fair', '🎪 Salon, forum, conférence', 'Salons et événements', 'save_genealogy_fair'], ['archive_visit', '🏛️ Visite aux archives', 'Planificateur de visite d’archives', 'save_archive_visit_plan'],
        ['reminder', '🔔 Rappel', 'Rappels', 'save_standalone_reminder'], ['field_trip', '🚗 Circuit sur le terrain', 'Circuits sur le terrain', 'save_field_trip'],
        ['courrier', '✉️ Courrier envoyé', 'Registre de courriers', 'save_courrier'], ['atelier_task', '✅ Tâche d’un projet de l’Atelier', 'Atelier de recherche', 'save_atelier_item'],
    ];
    function newDialog(date, projects, after) {
        ext.openDialog({eyebrow: 'MON AGENDA', title: 'Nouveau', wide: true, submitLabel: 'Créer',
            body: `<label>C’est…<select name="kind">${KINDS.map(([k, l, list]) => `<option value="${k}">${l} — rangé dans « ${esc(list)} »</option>`).join('')}</select></label>
                <div class="form-grid"><label class="span-2" data-k="all">Titre<input name="title" placeholder="Salon de généalogie de Bourges"></label>
                <label data-k="courrier">Destinataire<input name="destinataire" placeholder="Mairie de Saint-Amand-Montrond"></label>
                <label data-k="archive_visit">Centre d’archives<input name="archive_center" placeholder="Archives départementales du Cher"></label>
                <label data-k="all">Date<input type="date" name="start" value="${esc(date || '')}"></label>
                <label data-k="fair field_trip">Jusqu’au <small class="muted">(facultatif)</small><input type="date" name="end"></label>
                <label data-k="fair archive_visit field_trip">Lieu<input name="place" placeholder="Bourges"></label>
                <label data-k="fair">Horaires<input name="hours" placeholder="9 h – 18 h"></label>
                <label data-k="reminder">Catégorie<input name="category" placeholder="Archives, Famille…"></label>
                <label data-k="atelier_task">Projet<select name="project">${projects.map(pr => `<option value="${pr.id}">${esc(pr.title)}</option>`).join('') || '<option value="">(aucun projet)</option>'}</select></label>
                <label class="span-2" data-k="archive_visit reminder courrier">Notes<textarea name="notes" rows="3"></textarea></label></div>`,
            onOpen: d => { const sync = () => { const k = d.querySelector('[name=kind]').value; d.querySelectorAll('[data-k]').forEach(el => { el.hidden = !(el.dataset.k === 'all' || el.dataset.k.split(' ').includes(k)); }); d.querySelector('[name=title]').closest('label').firstChild.textContent = k === 'courrier' ? 'Objet' : 'Titre'; };
                d.querySelector('[name=kind]').addEventListener('change', sync); sync(); },
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form)), k = f.kind, def = KINDS.find(x => x[0] === k);
                const title = (f.title || '').trim();
                if (k !== 'archive_visit' && !title) return window.LCNDA_UI.fail(form.elements.title, 'Donne un titre.');
                const body = {
                    fair: {title, date_start: f.start, date_end: f.end, place_text: f.place, hours_text: f.hours},
                    archive_visit: {title, archive_center: (f.archive_center || '').trim(), visit_date: f.start, address: f.place, notes: f.notes},
                    reminder: {title, reminder_due_at: f.start, reminder_mode: 'on', reminder_category: f.category, notes: f.notes},
                    field_trip: {title, date_start: f.start, date_end: f.end, start_place: f.place},
                    courrier: {objet: title, destinataire: (f.destinataire || '').trim(), date_envoi: f.start, notes: f.notes},
                    atelier_task: {project_id: Number(f.project), type: 'task', title, data: {due: f.start, done: 0, priority: 'normale'}},
                }[k];
                if (k === 'archive_visit' && !body.archive_center) return window.LCNDA_UI.fail(form.elements.archive_center, 'Indique le centre d’archives.');
                if (k === 'courrier' && !body.destinataire) return window.LCNDA_UI.fail(form.elements.destinataire, 'Indique le destinataire.');
                if (k === 'reminder' && !f.start) { toast('Un rappel a besoin d’une date.', 'error'); return false; }
                if (k === 'atelier_task' && !body.project_id) { toast('Crée d’abord un projet dans l’Atelier.', 'error'); return false; }
                const r = await A().api(def[3], {}, {method: 'POST', body});
                if (r?.error) throw new Error(r.error);
                toast(`Créé et rangé dans « ${def[2]} ».`);
                after();
            },
        });
    }
    ext.lists.my_calendar = calendarScreen({
        key: 'agenda', eyebrow: 'LISTES · CALENDRIERS', title: '🗓️ Mon agenda',
        intro: 'Tout ce que tu as prévu, rassemblé depuis tes listes : salons, visites d’archives, rappels, courriers et relances, circuits, renouvellements, tâches de l’Atelier, rappels d’enquête. « + Nouveau » range ce que tu crées dans la bonne liste.',
        load: () => A().api('my_agenda'),
        toItems: data => data.items.map(it => { const [y, m, d] = it.start.split('-').map(Number); return {uid: it.src + it.id, y, m, d, end: it.end || '', group: it.src, title: it.title, sub: it.sub, done: it.done, raw: it}; }),
        onNew: (date, after) => A().api('my_agenda').then(d => newDialog(date, d.atelier_projects || [], after)),
        onOpen: it => ext.lists.my_calendar_open(it.raw),
    });
    ext.lists.my_calendar_open = r => {
            const st = S();
            if (r.src === 'fair') { st.listType = 'fairs'; A().setModule('listes'); setTimeout(() => A().renderFairsList?.(++S().workspaceToken, r.id), 50); return; }
            if (r.src === 'atelier_task') { st.atelier = {...(st.atelier || {}), project: r.ref, node: 'tasks', sel: [r.id]}; st.enquetesTab = 'atelier'; st.currentBattueId = 0; st.currentInvestigationId = 0; return A().setModule('enquetes'); }
            if (r.src === 'investigation') { st.enquetesTab = 'enquetes'; st.currentBattueId = 0; st.currentInvestigationId = r.ref; return A().setModule('enquetes'); }
            if (r.src === 'field_trip') { st.listType = 'field_trips'; st.hEdit = {list: 'field_trips', id: r.id}; return A().setModule('listes'); }
            st.listType = SRC_LIST[r.src] || 'reminders'; A().setModule('listes');
    };

    /* ─────────── Tableau de bord : « Mon agenda : à venir » ─────────── */
    ext.dashboard = ext.dashboard || {};
    ext.dashboardConfig = ext.dashboardConfig || {};
    const AGENDA_SRC = GROUPS.agenda.map(g => g[0]);
    const wcfg = w => ({days: 7, srcs: AGENDA_SRC, late: true, anniv: true, ...(w?.config || {})});
    ext.dashboardConfig.agenda_widget = {
        html: w => { const c = wcfg(w);
            return `<fieldset class="h-cal-wcfg"><legend>Mon agenda</legend><label>Sur combien de jours ?<select data-agw="days">${[[1, 'aujourd’hui'], [3, '3 jours'], [7, '7 jours'], [14, '2 semaines'], [31, 'un mois'], [92, '3 mois'], [365, 'un an']].map(([v, l]) => `<option value="${v}" ${Number(c.days) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-agw="late" ${c.late ? 'checked' : ''}> Ce qui est en retard (pas encore fait)</label>
                <label class="checkbox-line"><input type="checkbox" data-agw="anniv" ${c.anniv ? 'checked' : ''}> Les anniversaires de la famille (naissances, mariages, décès)</label>
                <div class="h-cal-wsrc">${GROUPS.agenda.map(([g, l]) => `<label class="checkbox-line"><input type="checkbox" data-agw-src value="${g}" ${c.srcs.includes(g) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></fieldset>`; },
        read: ed => ({days: Number(ed.querySelector('[data-agw=days]')?.value) || 7, late: !!ed.querySelector('[data-agw=late]')?.checked, anniv: !!ed.querySelector('[data-agw=anniv]')?.checked,
            srcs: [...ed.querySelectorAll('[data-agw-src]:checked')].map(x => x.value)}),
    };
    ext.dashboard.agenda_widget = {
        load: async () => { const [a, g] = await Promise.all([A().api('my_agenda'), A().api('genea_calendar').catch(() => ({events: []}))]); return {agenda: a, genea: g}; },
        render: (index, widget, span, data) => {
            const c = wcfg(widget), limit = Number(widget.limit) || 10, [ty, tm, td] = todayArr(), today = iso(ty, tm, td), endDay = iso(...addDays(ty, tm, td, Math.max(0, c.days - 1)));
            const rows = [];
            (data?.agenda?.items || []).filter(it => c.srcs.includes(it.src)).forEach(it => {
                const last = it.end || it.start;
                if (it.start <= endDay && last >= today) rows.push({when: it.start < today ? today : it.start, it, kind: 'agenda'});
                else if (c.late && !it.done && last < today && ['reminder', 'courrier_relance', 'atelier_task', 'investigation', 'budget'].includes(it.src)) rows.push({when: it.start, it, kind: 'late'});
            });
            if (c.anniv) (data?.genea?.events || []).filter(e => e.d && !e.approx).forEach(e => { for (let k = 0; k < Math.min(c.days, 366); k++) { const [y, m, d] = addDays(ty, tm, td, k); if (m === e.m && d === e.d) { rows.push({when: iso(y, m, d), e, years: y - e.y, kind: 'anniv'}); break; } } });
            rows.sort((a, b) => (a.kind === 'late' ? 0 : 1) - (b.kind === 'late' ? 0 : 1) || a.when.localeCompare(b.when));
            const p = prefs('agenda'), pg = prefs('genea');
            const dayLabel = w => { if (w === today) return 'aujourd’hui'; const [y, m, d] = w.split('-').map(Number); if (w === iso(...addDays(ty, tm, td, 1))) return 'demain'; return `${DAYS[dow(y, m, d)].slice(0, 3)}. ${d} ${MONTHS_S[m - 1]}`; };
            const li = r => r.kind === 'anniv'
                ? `<li style="--c:${colorOf('genea', pg, r.e.group)}"><span class="h-agw-when">${dayLabel(r.when)}</span><button type="button" class="link-button" data-agw-person="${r.e.who[0]?.id || 0}">🎂 ${esc(r.e.type)} — ${esc(r.e.who.map(w => w.name).join(' et '))}</button> <small class="muted">il y a ${r.years} ans (${r.e.y})</small></li>`
                : `<li class="${r.kind === 'late' ? 'is-late' : ''}" style="--c:${colorOf('agenda', p, r.it.src)}"><span class="h-agw-when">${r.kind === 'late' ? '⏰ en retard' : dayLabel(r.when)}</span><button type="button" class="link-button" data-agw-item="${esc(r.it.src + ':' + r.it.id)}">${esc(r.it.title)}</button>${r.it.sub ? ` <small class="muted">${esc(r.it.sub)}</small>` : ''}${r.it.end ? ` <small class="muted">→ ${esc(r.it.end.split('-').reverse().slice(0, 2).join('/'))}</small>` : ''}</li>`;
            const html = rows.length ? `<ul class="h-agw">${rows.slice(0, limit).map(li).join('')}</ul>${rows.length > limit ? `<p class="muted">… et ${rows.length - limit} ${rows.length - limit > 1 ? 'autres' : 'autre'}.</p>` : ''}` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Rien de prévu ${c.days === 1 ? 'aujourd’hui' : `sur les ${c.days} prochains jours`}.</span></p>`;
            setTimeout(() => document.querySelectorAll('[data-agw-item]:not([data-b]), [data-agw-person]:not([data-b])').forEach(b => { b.dataset.b = '1'; b.addEventListener('click', () => {
                if (b.dataset.agwPerson) { S().currentPersonId = Number(b.dataset.agwPerson); return A().setModule('personnes'); }
                const [src, id] = b.dataset.agwItem.split(':'), it = (data.agenda.items || []).find(x => x.src === src && String(x.id) === id);
                if (it) ext.lists.my_calendar_open?.(it);
            }); }), 0);
            return A().card(index, `Mon agenda : ${c.days === 1 ? 'aujourd’hui' : c.days === 7 ? '7 jours' : c.days === 31 ? 'le mois' : `${c.days} jours`}`, rows.length || '', html + `<p><button type="button" class="link-button" data-h-open-list="my_calendar">🗓️ Ouvrir mon agenda</button></p>`, span);
        },
    };
})();
