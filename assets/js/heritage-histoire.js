/* LCNDA — 🏘 Histoire du lieu (serveur : lib/histoire.php ; pack fabriqué par scripts/histoire/build-histoire.py).
 *  - bloc de fiche « 🏘 Le lieu à son époque » : population de la commune (et sa courbe), le train, le temps de trajet, l'été de
 *    l'année d'après les vendanges, séismes et inondations près de ses lieux, la mortalité des enfants comparée au département ;
 *    chaque ligne dit sa source. Sans le pack : un bouton « ⤓ Installer » (un clic) ;
 *  - Réglages → « 🏘 Histoire du lieu » : ⤓ Installer (barre, pause, reprise), 🗑 Supprimer (↶), tables de frdata.org, À propos des données.
 * Rien n'est écrit dans la généalogie : tout est calculé à l'affichage.
 */
(() => {
    'use strict';
    /* un téléchargement coupé (page rechargée, application arrêtée, réseau perdu) n'est pas une erreur à montrer : la partie reste vide, sans rien dans la console */
    const cutOff = e => e?.name === 'AbortError' || e?.network === true || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || '')));
    const report = e => { if (!cutOff(e)) console.error(e); };
    // les nombres sont passés en texte : une année reste « 1870 » (pas « 1 870 ») ; les grands nombres sont mis en forme avant (nf)
    const i18n = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return window.LCNDA_I18N ? window.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && k in w ? w[k] : m)); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    // ⚠ la vérification « installé ? » a échoué (serveur) : on le DIT (pas « pas installé » en silence), une fois toutes les 30 s au plus
    const statusErr = e => { const now = Date.now(); if (now - (statusErr.at || 0) < 30000) return; statusErr.at = now; A().toast?.(i18n('Impossible de vérifier si ces données sont installées : {e}', {e: e?.message || String(e)}), 'error'); };
    const UI = () => window.LCNDA_UI || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const fmtSize = b => (b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${Math.round(b / 1e6)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dayTxt = (d, m, y) => `${d ? (d === 1 ? '1er ' : d + ' ') : ''}${m ? MONTHS[m - 1] + ' ' : ''}${y}`;
    const isoTxt = iso => { const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number); return y ? dayTxt(d, m, y) : ''; };
    const WHAT = {birth: 'naissance', marriage: 'mariage', death: 'décès'};
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const ioTxt = io => String(io || '').split('-').map(x => ROMAN[Math.round(Number(x))] || x).join('–');
    const hoursTxt = (h, perDay) => {
        if (h < 1) return i18n('moins d’une heure');
        if (perDay && h > perDay * 1.2) { const d = Math.round(h / perDay * 2) / 2; return i18n('≈ {n} jours', {n: String(d).replace('.', ',')}); }
        return i18n('≈ {n} h', {n: String(Math.round(h))});
    };

    /* ═════════════════ Le bloc de la fiche ═════════════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.histoire = (index, detail) => {
        const p = detail?.person;
        if (!p?.id || p.kind === 'animal') return '';
        const more = `<button type="button" class="icon-button small" data-hist-more="${Number(p.id)}" title="${esc(i18n('Plus d’actions'))}" aria-label="${esc(i18n('Plus d’actions'))}">⋯</button>`;
        return A().card(index, i18n('🏘 Le lieu à son époque'), '', `<div class="hist-life" data-hist-life="${Number(p.id)}">${UI().skeleton ? UI().skeleton(3) : ''}</div>`, 'span-12', more);
    };

    const row = (icon, html, src, extra = '') => `<div class="hist-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(i18n('Source :'))} ${esc(src)}</small>` : ''}</div></div>`;
    const ageAt = (d, y) => (d.person.birth != null && y != null ? y - d.person.birth : null);
    const ageTxt = n => (n === 0 ? i18n('moins d’un an') : n === 1 ? i18n('1 an') : i18n('{n} ans', {n: String(n)}));
    const first = d => esc(d.person.first || i18n('cette personne'));

    /** la petite courbe de la population (SVG), avec un point à chaque événement */
    function curve(p) {
        const ys = p.years || [], vs = p.values || []; if (ys.length < 2) return '';
        const W = 300, H = 64, x0 = ys[0], x1 = ys[ys.length - 1], vmax = Math.max(...vs), vmin = Math.min(...vs);
        const X = y => 6 + (y - x0) / Math.max(1, x1 - x0) * (W - 12), Y = v => H - 14 - (v - vmin) / Math.max(1, vmax - vmin) * (H - 26);
        const line = ys.map((y, i) => `${i ? 'L' : 'M'}${X(y).toFixed(1)},${Y(vs[i]).toFixed(1)}`).join('');
        const dots = (p.at || []).filter(a => a.census).map(a => `<circle cx="${X(a.census).toFixed(1)}" cy="${Y(a.value).toFixed(1)}" r="3.5" class="hist-dot"><title>${esc(a.census + ' : ' + nf(a.value) + ' ' + i18n('habitants'))}</title></circle>`).join('');
        return `<svg class="hist-curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(i18n('Population de {c}, de {a} à {b}', {c: p.commune, a: x0, b: x1}))}"><path d="${line}" fill="none" stroke="currentColor" stroke-width="2"/>${dots}<text x="6" y="${H - 2}" class="hist-ax">${x0}</text><text x="${W - 6}" y="${H - 2}" text-anchor="end" class="hist-ax">${x1}</text><text x="${W - 6}" y="10" text-anchor="end" class="hist-ax">${esc(nf(vmax))}</text></svg>`;
    }

    function popLines(d) {
        return (d.population || []).map(p => {
            const by = Object.fromEntries((p.at || []).map(a => [a.what, a]));
            const parts = [];
            const miss = [];
            const say = (a, verb) => { if (a.census) parts.push(i18n('{v} habitants {verb} (recensement de {c})', {v: `<b>${nf(a.value)}</b>`, verb, c: a.census})); else miss.push(a.year); };
            if (by.birth) say(by.birth, i18n('quand {p} y naît', {p: first(d)}));
            if (by.marriage) say(by.marriage, i18n('à son mariage, en {y}', {y: by.marriage.year}));
            if (by.death) say(by.death, i18n('à sa mort, en {y}', {y: by.death.year}));
            if (by.death_elsewhere) say(by.death_elsewhere, i18n('à sa mort, en {y}', {y: by.death_elsewhere.year}));
            if (!parts.length && !miss.length) return '';
            const note = [p.commune !== p.place ? i18n('commune de {c} dans ses limites de 2025', {c: p.commune}) : '', p.match === 'name' ? i18n('trouvée par son nom') : ''].filter(Boolean).join(' · ');
            const first0 = p.years?.[0] || 1876;
            let html = parts.length ? `<b>${esc(p.commune)}</b> ${i18n('comptait')} ${parts.join(', ')}.` : '';
            if (miss.length) html += `${html ? ' ' : ''}${i18n('Pas de recensement de {c} à moins de 10 ans de {y}', {c: `<b>${esc(p.commune)}</b>`, y: [...new Set(miss)].join(i18n(' ni de '))})}${miss.some(y => y < first0) ? ' : ' + i18n('les chiffres de l’Insee commencent en {y}', {y: first0}) : ''}.`;
            return row('👥', `${html}${note ? ` <span class="muted">(${esc(note)})</span>` : ''}`, i18n('Insee, recensements de la population (communes au 1er janvier 2025)'), curve(p));
        }).join('');
    }

    function trainLines(d) {
        return (d.train || []).map(t => {
            const out = [];
            const f = t.first;
            if (f) {
                const age = ageAt(d, f.ouverture), dy = d.person.death;
                const where = f.km < 3 ? f.nom : i18n('{g} ({km} km de {p})', {g: f.nom, km: Math.round(f.km), p: t.place});
                if (age != null && age < 0) out.push(i18n('Quand {p} naît, le train passe déjà à {w}, depuis {y}.', {p: first(d), w: esc(where), y: f.ouverture}));
                else if (dy != null && f.ouverture > dy) out.push(i18n('Le train n’arrive à {w} qu’en {y}, après la mort de {p}.', {w: esc(where), y: f.ouverture, p: first(d)}));
                else out.push(i18n('Le train arrive à {w} en {y}', {w: esc(where), y: f.ouverture}) + (age != null ? ` : ${i18n('{p} a {a}', {p: first(d), a: ageTxt(age)})}.` : '.'));
            } else if (t.closest) out.push(i18n('Pas de gare datée à moins de 20 km de {p} ; la plus proche connue : {g} ({km} km), ouverte en {y}.', {p: esc(t.place), g: esc(t.closest.nom), km: String(Math.round(t.closest.km)), y: t.closest.ouverture}));
            if (t.undated && (!f || t.undated.nom.toLowerCase() !== f.nom.toLowerCase())) out.push(t.undated.km < 1 ? i18n('Une gare a existé à {g}, mais sa date d’ouverture n’est pas dans les données.', {g: esc(t.undated.nom)}) : i18n('Une gare a existé à {g} ({km} km), mais sa date d’ouverture n’est pas dans les données.', {g: esc(t.undated.nom), km: Math.round(t.undated.km)}));
            if (!out.length) return '';
            return row('🚂', out.join(' '), i18n('Wikidata (dates d’ouverture, incomplètes) · Un siècle de gares, R. Jeansoulin (ODbL)'));
        }).join('');
    }

    function travelLines(d) {
        const list = d.travel || []; if (!list.length) return '';
        const rows = list.map(t => {
            const m = Object.fromEntries(t.modes.map(x => [x.mode, x]));
            const bits = [`${i18n('à pied')} ${hoursTxt(m.walk.hours, m.walk.per_day)}`];
            if (m.coach) bits.push(`${i18n('en diligence')} ${hoursTxt(m.coach.hours, m.coach.per_day)}`);
            if (m.train) bits.push(`${i18n('en train')} ${hoursTxt(m.train.hours)} (${esc(m.train.from_station.nom)} → ${esc(m.train.to_station.nom)})`);
            return `<li>${i18n('De {a} à {b} ({km} km à vol d’oiseau), en {y} : {modes}.', {a: esc(t.from), b: esc(t.to), km: t.km, y: t.year, modes: bits.join(', ')})}</li>`;
        }).join('');
        const sp = d.rules?.speeds || {};
        const hyp = i18n('Ordre de grandeur, avec ces hypothèses : routes 1,3 fois plus longues que la ligne droite ; à pied {w} km/h, {wh} h de marche par jour ; diligence {c} km/h, {ch} h par jour (avant 1914) ; train {t1} km/h avant 1900, {t2} km/h jusqu’en 1938, {t3} km/h ensuite, s’il y a une gare ouverte à moins de 20 km des deux lieux (et la marche jusqu’aux gares).',
            {w: sp.walk || 4, wh: sp.walk_hours || 8, c: sp.coach || 8, ch: sp.coach_hours || 12, t1: sp.train?.[0]?.[2] || 30, t2: sp.train?.[1]?.[2] || 45, t3: sp.train?.[2]?.[2] || 70});
        return row('🧭', `<b>${i18n('Le voyage entre ses lieux')}</b><ul class="hist-ul">${rows}</ul>`, i18n('calcul de l’app (gares : Wikidata)'), `<small class="muted hist-hyp">${esc(hyp)}</small>`);
    }

    function climateLines(d) {
        const ok = (d.climate || []).filter(c => !c.none); if (!(d.climate || []).length) return '';
        if (!ok.length) return row('🍇', i18n('Pas de date de vendanges connue près d’ici pour ces années.'), i18n('Daux et al. 2012, NOAA'));
        const lines = ok.map(c => {
            const [mm, dd] = String(c.date).split('-').map(Number);
            const when = `${dd === 1 ? '1er' : dd} ${MONTHS[mm - 1]}`;
            const ecart = Math.abs(c.diff);
            const k = {very_early: i18n('vendanges très précoces'), early: i18n('vendanges précoces'), normal: i18n('vendanges à la date habituelle'), late: i18n('vendanges tardives'), very_late: i18n('vendanges très tardives')}[c.kind];
            const summer = {very_early: i18n('un été très chaud'), early: i18n('sans doute un été chaud'), normal: i18n('un été ni chaud ni frais'), late: i18n('sans doute un été frais'), very_late: i18n('un été très frais')}[c.kind];
            const diff = c.kind === 'normal' ? '' : ` (${i18n(c.diff < 0 ? '{n} jours plus tôt que d’habitude' : '{n} jours plus tard que d’habitude', {n: ecart})})`;
            const note = c.year < 1836 ? ` <span class="muted">${esc(i18n('(avant les premiers relevés météo)'))}</span>` : c.year >= 1880 ? ` <span class="muted">${esc(i18n('(après le phylloxéra, le lien avec l’été est moins net)'))}</span>` : '';
            return `<li>${i18n('{y} ({w}) : {k} (vignoble « {r} »{km}), vers le {d}{diff} : {s}.', {y: c.year, w: i18n(WHAT[c.what] || c.what), k, r: esc(c.series_name), km: c.km != null ? `, ${i18n('à {n} km', {n: c.km})}` : '', d: when, diff, s: summer})}${note}</li>`;
        }).join('');
        return row('🍇', `<b>${i18n('L’été de l’année, d’après les vendanges')}</b><ul class="hist-ul">${lines}</ul>`, i18n('Daux et al. 2012, base des dates de vendanges (NOAA/WDS-Paleo)'),
            `<small class="muted hist-hyp">${esc(i18n('« D’habitude » : la moyenne de la série ({r}). Précoces ou tardives : au moins un écart-type (≈ 10 jours) d’écart. Vignoble choisi par département (table écrite pour l’app).', {r: d.rules?.ghd_ref || ''}))}</small>`);
    }

    function quakeLines(d) {
        const q = d.quakes || [], b = d.person.birth; if (b == null) return '';
        const after = (d.person.death ?? b + 80) > 1899;
        const felt = d.rules?.felt_km || {};
        const rule = i18n('Sans doute ressenti : règle simple de l’app, selon l’intensité à l’épicentre (V : {a} km, VI : {b2} km, VII : {c} km, VIII : {e} km, IX : {f} km). Il n’existe pas de relevé commune par commune en données ouvertes.', {a: felt[5] || 25, b2: felt[6] || 50, c: felt[7] || 100, e: felt[8] || 150, f: felt[9] || 250});
        if (!q.length) return b <= 1899 ? row('🌋', i18n('Aucun séisme connu assez fort pour être ressenti à ses lieux pendant sa vie.') + (after ? ` <span class="muted">${esc(i18n('(le catalogue s’arrête en 1899)'))}</span>` : ''), i18n('EPICA v1.1, INGV (CC BY 4.0)')) : '';
        const lines = q.map(x => `<li>${i18n('Séisme du {d} ({z}) : épicentre {where}, intensité {io} à l’épicentre{mw}. Sans doute ressenti{age}.', {d: dayTxt(x.day, x.month, x.year), z: esc(x.zone || '?'), where: x.km < 1 ? i18n('à {p}', {p: esc(x.place)}) : i18n('à {km} km de {p}', {km: x.km, p: esc(x.place)}), io: ioTxt(x.io), mw: x.mw ? `, ${i18n('magnitude {m}', {m: String(x.mw).replace('.', ',')})}` : '', age: ageAt(d, x.year) != null ? ` (${i18n('{p} a {a}', {p: first(d), a: ageTxt(ageAt(d, x.year))})})` : ''})}</li>`).join('');
        return row('🌋', `<b>${i18n('Séismes')}</b><ul class="hist-ul">${lines}</ul>`, i18n('EPICA v1.1, INGV (CC BY 4.0), 1000–1899'), `<small class="muted hist-hyp">${esc(rule)}${after ? ' ' + esc(i18n('Le catalogue s’arrête en 1899.')) : ''}</small>`);
    }

    function floodLines(d, here = false) {
        const f = d.floods || {}, out = [];
        if ((f.bdhi || []).length) out.push(row('🌊', `<b>${i18n('Inondations')}</b><ul class="hist-ul">${f.bdhi.map(x => `<li>${esc(x.year)} : ${esc(x.title)}${x.place ? ` (${esc(x.place)})` : ` <span class="muted">(${esc(i18n('dans le département'))})</span>`}</li>`).join('')}</ul>`, i18n('Géorisques, base historique des inondations (BDHI), Licence Ouverte')));
        if ((f.monde || []).length) out.push(row('🌊', `<ul class="hist-ul">${f.monde.map(x => `<li>${esc(x.year)} : ${esc(x.title)}${x.desc ? ` — ${esc(x.desc)}` : ''}</li>`).join('')}</ul>`, f.monde[0].src || i18n('Le monde autour (LCNDA)')));
        if ((f.catnat || []).length) {
            const list = f.catnat.slice(-6).map(x => `<li>${esc(isoTxt(x.date))} : ${esc(x.label.toLowerCase())}${x.place ? ` (${esc(x.place)})` : ''}</li>`).join('');
            out.push(row('🏛', `${i18n(here ? '{n} reconnue(s) ici depuis 1982' : '{n} reconnue(s) depuis 1982 dans ses communes, de son vivant', {n: `<b>${A().plural ? A().plural(f.catnat.length, 'catastrophe naturelle', 'catastrophes naturelles') : f.catnat.length}</b>`})}${f.catnat.length > 6 ? ` (${i18n('les 6 dernières')})` : ''} :<ul class="hist-ul">${list}</ul>`, i18n('Géorisques, arrêtés CatNat (GASPAR), Licence Ouverte')));
        }
        return out.join('');
    }

    function childLines(d) {
        const c = d.children || {}; if (!c.total) return '';
        let txt = i18n('{a} enfant(s) sur {b} mort(s) avant 5 ans', {a: `<b>${c.under5}</b>`, b: `<b>${c.total}</b>`}) + (c.unknown ? ` ${i18n('({n} sans date de décès)', {n: c.unknown})}` : '');
        let src = i18n('ta généalogie (les enfants de ses unions)'), extra = '';
        if (c.compare) {
            const q = c.compare.q5, one = q > 0 ? Math.round(1 / q) : 0;
            txt += ` ; ${i18n('en {dep}, {p} : 1 enfant sur {n} ({pc} %)', {dep: esc(c.compare.name || c.compare.code), p: c.compare.period.replace('-', '–'), n: one, pc: String(Math.round(q * 1000) / 10).replace('.', ',')})}`;
            src += ' · ' + i18n('French Human Mortality Database, frdata.org (moyenne garçons-filles)');
        } else if (c.why === 'before1901') txt += ` ; ${i18n('pour le département à cette époque : pas de chiffre sûr (les tables commencent en 1901)')}`;
        else if (c.why === 'nofhmd') extra = `<p class="hist-act"><button type="button" class="link-button" data-hist-goset>${esc(i18n('⤓ Télécharger la table de mortalité de son département (frdata.org)'))}</button></p>`;
        return row('👶', txt + '.', src, extra);
    }

    async function fill(host) {
        const pid = Number(host.dataset.histLife);
        let d;
        try { d = await api('hist_person', {id: pid}); } catch (e) { host.innerHTML = A().empty ? A().empty(e.message, {icon: '⛔'}) : esc(e.message); return; }
        if (!host.isConnected) return;
        if (!d.installed) {
            host.innerHTML = (A().empty ? A().empty(i18n('L’histoire des lieux n’est pas installée.'), {icon: '🏘', hint: i18n('Population de la commune, arrivée du train, été de l’année, séismes et inondations : un fichier d’environ 18 Mo, téléchargé une fois.'), action: {label: i18n('⤓ Installer l’histoire des lieux'), attrs: 'data-hist-install'}}) : '') + childLines(d);
            return afterFill(host, d);
        }
        const html = [popLines(d), trainLines(d), travelLines(d), climateLines(d), quakeLines(d), floodLines(d), childLines(d)].join('');
        host.innerHTML = html || (A().empty ? A().empty(i18n('Rien à dire pour l’instant : il faut des lieux en France (placés sur la carte) et des dates.'), {icon: '🏘'}) : '');
        afterFill(host, d);
    }
    /** crochet : d'autres modules ajoutent leurs lignes au bloc (ex. 🌊 la rivière, heritage-metiers-rivieres.js) — ext.histoireAfter.push((host, d) => …) */
    function afterFill(host, d) { (ext.histoireAfter || []).forEach(f => { try { Promise.resolve(f(host, d)).catch(report); } catch (e) { console.error(e); } }); }

    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-hist-life]').forEach(fill); });

    /** 📜 Monographie de commune : la population de la commune (courbe), le train, les séismes et les inondations des années
     *  de la famille (hist_place). Rien à dire (ou pack absent) → false, et la partie est passée. */
    async function placeInto(host, placeId, {from = 0, to = 0} = {}) {
        let d; try { d = await api('hist_place', {id: Number(placeId), from: from || '', to: to || ''}); } catch (_) { return false; }
        if (!d?.installed || !host.isConnected) return false;
        const out = [], c = d.commune, ser = c?.series || {};
        const ys = Object.keys(ser).map(Number).sort((a, b) => a - b);
        if (ys.length) {
            const last = ys[ys.length - 1], top = ys.reduce((a, y) => (ser[y] > ser[a] ? y : a), ys[0]);
            const txt = i18n('{c} comptait {a} habitants en {y1} et {b} en {y2}', {c: `<b>${esc(c.nom)}</b>`, a: `<b>${nf(ser[ys[0]])}</b>`, y1: ys[0], b: `<b>${nf(ser[last])}</b>`, y2: last})
                + (top !== ys[0] && top !== last ? ` ; ${i18n('le plus : {n} en {y}', {n: nf(ser[top]), y: top})}` : '') + '.';
            out.push(row('👥', txt, i18n('Insee, recensements de la population (communes au 1er janvier 2025)'), curve({years: ys, values: ys.map(y => ser[y]), at: [], commune: c.nom})));
        }
        const t = d.train;
        if (t?.first) out.push(row('🚂', t.first.km < 3 ? i18n('Le train arrive à {w} en {y}.', {w: esc(t.first.nom), y: t.first.ouverture}) : i18n('La gare la plus proche, {g} ({km} km), ouvre en {y}.', {g: esc(t.first.nom), km: String(Math.round(t.first.km)), y: t.first.ouverture}), i18n('Wikidata (dates d’ouverture, incomplètes) · Un siècle de gares, R. Jeansoulin (ODbL)')));
        else if (t?.closest) out.push(row('🚂', i18n('Pas de gare datée à moins de 20 km ; la plus proche connue : {g} ({km} km), ouverte en {y}.', {g: esc(t.closest.nom), km: String(Math.round(t.closest.km)), y: t.closest.ouverture}), i18n('Wikidata (dates d’ouverture, incomplètes) · Un siècle de gares, R. Jeansoulin (ODbL)')));
        if ((d.quakes || []).length) out.push(row('🌋', `<b>${i18n('Séismes sans doute ressentis ici')}</b><ul class="hist-ul">${d.quakes.map(x => `<li>${i18n('Séisme du {d} ({z}) : épicentre {where}, intensité {io} à l’épicentre.', {d: dayTxt(x.day, x.month, x.year), z: esc(x.zone || '?'), where: x.km < 1 ? i18n('ici') : i18n('à {km} km', {km: x.km}), io: ioTxt(x.io)})}</li>`).join('')}</ul>`, i18n('EPICA v1.1, INGV (CC BY 4.0), 1000–1899')));
        out.push(floodLines(d, true));
        const html = out.join('');
        if (!html) return false;
        host.innerHTML = `<div class="hist-life">${html}</div>`;
        return true;
    }

    function openSettings(autoStart = false) {
        const st = A().state; if (!st) return;
        DL.autoStart = !!autoStart;
        st.maintenanceTab = 'histoire'; A().persistUiState?.(); A().setModule?.('maintenance');
    }
    document.addEventListener('click', e => {
        if (e.target.closest?.('[data-hist-install]')) return openSettings(true);
        if (e.target.closest?.('[data-hist-goset]')) return openSettings(false);
        const more = e.target.closest?.('[data-hist-more]');
        if (more) return UI().menuAt?.(more, [{icon: '⚙️', label: i18n('Réglages de l’histoire du lieu'), run: () => openSettings(false)}, {icon: '📚', label: i18n('À propos des données'), run: openAbout}]);
    });

    /* ═════════════════ À propos des données ═════════════════ */
    async function openAbout() {
        let d = {sources: [], missing: {}};
        try { d = await api('hist_about'); } catch (_) {}
        const rows = d.sources.map(x => `<tr><td>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.nom)} ↗</a>` : esc(x.nom)}</td><td>${esc(x.what)}</td><td>${esc(x.years)}</td><td>${x.installed ? (UI().badge ? UI().badge(i18n('Installé'), 'green') : '✓') : ''}</td><td class="hist-lic">${esc(x.licence)}${x.mention ? ` — « ${esc(x.mention)} »` : ''}</td></tr>`).join('');
        const miss = Object.values(d.missing || {}).map(t => `<li>${esc(t)}</li>`).join('');
        const body = `<div class="hist-scroll"><table class="data-table hist-tbl" data-hist-about-table><thead><tr><th>${esc(i18n('Source'))}</th><th>${esc(i18n('Ce qu’elle donne'))}</th><th>${esc(i18n('Années'))}</th><th></th><th>${esc(i18n('Licence et mention'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            ${miss ? `<p><b>${esc(i18n('Pas dans le pack, et pourquoi'))}</b></p><ul class="hist-ul">${miss}</ul>` : ''}
            ${UI().notice ? UI().notice('info', i18n('Les phrases sont calculées par l’app à partir de ces fichiers : les règles (recensement à 10 ans au plus, rayon où un séisme est ressenti, vitesses des voyages) sont dites sous chaque ligne.')) : ''}`;
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l hist-about';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${esc(i18n('🏘 HISTOIRE DU LIEU'))}</span><h2>${esc(i18n('À propos des données'))}</h2></div><button type="button" class="icon-button" data-hist-x aria-label="${esc(i18n('Fermer'))}">×</button></div><div class="hist-body">${body}</div><div class="modal-actions"><span class="spacer"></span><button type="submit" class="button secondary">${esc(i18n('Fermer'))}</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.querySelector('[data-hist-x]').addEventListener('click', () => dlg.close()); dlg.showModal();
    }

    /* ═════════════════ Réglages → 🏘 Histoire du lieu ═════════════════ */
    const DL = {online: null, err: '', run: null, paused: null, autoStart: false}, DL_KEY = 'genealogie-histoire-dl';
    const dlSaved = () => { try { return localStorage.getItem(DL_KEY) || ''; } catch (_) { return ''; } };
    const dlRemember = id => { try { localStorage.setItem(DL_KEY, id); } catch (_) {} };
    const dlForget = () => { try { localStorage.removeItem(DL_KEY); } catch (_) {} };
    const pct = (a, b) => (b ? Math.floor(a / b * 100) : 0);
    let redraw = () => {}, refresh = async () => {};

    function dlActs(st) {
        const run = DL.run, pz = DL.paused, on = DL.online && DL.online.histoire;
        if (run) return `<span class="hist-dl" data-hist-dl-box><span class="hist-prog"><i style="width:${pct(run.received, run.size)}%"></i></span><small data-hist-dl-txt>${esc(pct(run.received, run.size) + ' %')}</small><button type="button" class="button small secondary" data-hist-dl-pause>⏸ ${esc(i18n('Pause'))}</button></span>`;
        if (pz) return `<span class="hist-dl"><span class="hist-prog"><i style="width:${pct(pz.received, pz.size)}%"></i></span><small>${esc(i18n('En pause : {p} %', {p: String(pct(pz.received, pz.size))}))}</small><button type="button" class="button small" data-hist-dl>▶ ${esc(i18n('Reprendre'))}</button><button type="button" class="button small secondary" data-hist-dl-cancel>✕ ${esc(i18n('Abandonner'))}</button></span>`;
        if (DL.online === null) return `<small class="muted">${esc(i18n('Recherche des données en ligne…'))}</small>`;
        if (!on) return `<small class="muted" title="${esc(DL.err)}">${esc(DL.err ? i18n('Pas de connexion aux données en ligne.') : i18n('Pas encore en ligne.'))}</small>${st.removed ? `<button type="button" class="button small secondary" data-hist-restore>↶ ${esc(i18n('Remettre le pack supprimé'))}</button>` : ''}`;
        return `<button type="button" class="button small" data-hist-dl>⤓ ${esc(i18n('Installer ({s})', {s: fmtSize(on.size)}))}</button>`;
    }
    async function dlRun() {
        if (DL.run) return;
        let id = DL.paused?.id || dlSaved(), run;
        try {
            if (id) { const r = await api('hist_dl_resume', {id}); if (!r.exists) id = ''; else run = {id, received: r.received, size: r.size}; }
            if (!id) { const r = await post('hist_dl_start', {}); id = r.id; run = {id, received: 0, size: r.size}; }
        } catch (x) { return A().toast(x.message, 'error'); }
        dlRemember(id); DL.paused = null; DL.run = {...run, stop: false}; redraw();
        let fails = 0;
        while (!DL.run.stop) {
            try {
                const r = await post('hist_dl_step', {id}); DL.run.received = r.received; fails = 0;
                const box = document.querySelector('[data-hist-dl-box]'); if (box) { box.querySelector('.hist-prog i').style.width = `${pct(r.received, r.size)}%`; box.querySelector('[data-hist-dl-txt]').textContent = `${pct(r.received, r.size)} % · ${fmtSize(r.received)} ${i18n('sur')} ${fmtSize(r.size)}`; }
                if (r.done) break;
            } catch (x) { if (++fails >= 3) { A().toast(i18n('Téléchargement arrêté : {e}', {e: x.message}), 'error'); DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; return redraw(); } await new Promise(r => setTimeout(r, 1500 * fails)); }
        }
        if (DL.run.stop) { DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; return redraw(); }
        const txt = document.querySelector('[data-hist-dl-txt]'); if (txt) txt.textContent = i18n('Vérification et installation…');
        try {
            const r = await post('hist_pack_finish', {id}); dlForget(); DL.run = null;
            await refresh();
            A().undoToast?.(i18n('🏘 Histoire du lieu installée ({n} communes).', {n: nf(r.communes)}), {undo: async () => { await post('hist_pack_undo', {}); await refresh(); }});
        } catch (x) { dlForget(); DL.run = null; redraw(); A().toast(x.message, 'error'); }
    }
    async function dlCancel() { const id = DL.paused?.id || dlSaved(); DL.paused = null; dlForget(); if (id) { try { await post('hist_dl_cancel', {id}); } catch (_) {} } redraw(); }

    const SRC_NAMES = {insee: 'Population (Insee)', wikidata: 'Gares datées (Wikidata)', gares: 'Positions des gares', ghd: 'Vendanges', epica: 'Séismes (EPICA)', gaspar: 'CatNat', bdhi: 'Inondations historiques (BDHI)'};
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.histoire = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let st = {installed: false, fhmd: {count: 0, codes: []}}, fh = {codes: [], wanted: [], missing: []};
        const load = async () => { try { st = await api('hist_status'); } catch (e) { statusErr(e); } try { fh = await api('hist_fhmd_status'); } catch (e) { statusErr(e); } };
        await load();
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const draw = () => {
            const s = st.stats || {};
            const desc = st.installed ? [s.insee ? i18n('{n} communes ({y})', {n: nf(s.insee.communes), y: s.insee.years}) : '', s.wikidata ? i18n('{n} gares datées', {n: nf(s.wikidata.dated)}) : '', s.ghd ? i18n('{n} séries de vendanges', {n: s.ghd.series}) : '',
                s.epica ? i18n('{n} séismes', {n: nf(s.epica.epica + (s.epica.fcat || 0))}) : '', s.gaspar ? i18n('{n} arrêtés CatNat', {n: nf(s.gaspar.catnat)}) : '', s.bdhi?.bdhi ? i18n('{n} inondations historiques', {n: nf(s.bdhi.bdhi)}) : '', fmtSize(st.size || 0), st.built ? i18n('fabriqué le {d}', {d: isoTxt(st.built)}) : ''].filter(Boolean).join(' · ')
                : i18n('Population des communes (1876 → 2023), gares et date d’arrivée du train, été de l’année d’après les vendanges (1354 → 2007), séismes (1000 → 1899), inondations et catastrophes naturelles · ≈ 18 Mo');
            const acts = st.installed ? `<button type="button" class="button small secondary" data-hist-remove>🗑 ${esc(i18n('Supprimer'))}</button>` : dlActs(st);
            const fhRow = `<div class="hist-data-row"><span><b>${esc(i18n('Mortalité des enfants par département'))}</b><small>${esc(fh.codes.length ? i18n('Tables gardées : {list}', {list: fh.codes.join(', ')}) : i18n('Tables de la French Human Mortality Database (1901 → 2020), téléchargées chez frdata.org pour les seuls départements de ta base : leurs auteurs demandent de ne pas les redistribuer.'))}</small></span>${UI().badge ? UI().badge(fh.codes.length ? i18n('{n} département(s)', {n: fh.codes.length}) : i18n('Pas téléchargé'), fh.codes.length ? 'green' : 'grey') : ''}<span class="hist-acts">${fh.missing.length ? `<button type="button" class="button small" data-hist-fhmd>⤓ ${esc(i18n('Télécharger ({n} département(s))', {n: fh.missing.length}))}</button>` : ''}${fh.codes.length ? `<button type="button" class="button small secondary" data-hist-fhmd-remove>🗑 ${esc(i18n('Supprimer'))}</button>` : ''}</span></div>`;
            ws.innerHTML = `<section class="page hist-settings">${UI().pageHeader ? UI().pageHeader({title: i18n('Histoire du lieu'), icon: '🏘', attrs: 'data-ph-title', where: i18n('Réglages · Données'), help: i18n('Le lieu à l’époque de chaque personne : combien d’habitants, quand le train arrive, l’été de l’année, les séismes et les inondations. Le bloc « 🏘 Le lieu à son époque » est sur chaque fiche.')}) : `<h2>🏘 ${esc(i18n('Histoire du lieu'))}</h2>`}
                <section class="card hist-card"><h3>${esc(i18n('Les données dans l’app'))}</h3>
                    <div class="hist-data-row" data-hist-pack><span><b>${esc(i18n('Pack « Histoire du lieu »'))}</b><small>${esc(desc)}</small>${st.installed && st.sources ? `<small class="muted">${esc(st.sources.map(k => i18n(SRC_NAMES[k] || k)).join(' · '))}</small>` : ''}</span>${UI().badge ? UI().badge(st.installed ? i18n('Installé') : i18n('Pas installé'), st.installed ? 'green' : 'grey') : ''}<span class="hist-acts">${acts}</span></div>
                    ${fhRow}
                    ${UI().notice ? UI().notice('info', i18n('Le pack se télécharge une fois depuis la page GitHub de l’app ; ensuite tout marche sans Internet. Rien de ta généalogie n’est envoyé.')) : ''}
                    <p class="hist-about-link"><button type="button" class="link-button" data-hist-about>↗ ${esc(i18n('À propos des données et des licences'))}</button></p>
                </section></section>`;
        };
        draw();
        redraw = draw; refresh = async () => { await load(); draw(); document.querySelectorAll('#workspace [data-hist-life]').forEach(fill); };
        api('hist_dl_info').then(r => { DL.online = r.packs || {}; DL.err = r.error || ''; }).catch(x => { DL.online = {}; DL.err = x.message; }).finally(async () => {
            const id = dlSaved(); if (id && !DL.run) { try { const r = await api('hist_dl_resume', {id}); if (r.exists) DL.paused = {id, received: r.received, size: r.size}; else dlForget(); } catch (_) {} }
            if (ws.querySelector('.hist-settings')) draw();
            if (DL.autoStart && !st.installed && DL.online?.histoire) { DL.autoStart = false; dlRun(); }
        });
        if (ws.__histBound !== true) {
            ws.__histBound = true;
            ws.addEventListener('click', async e => {
                if (!ws.querySelector('.hist-settings')) return;
                if (e.target.closest('[data-hist-about]')) return openAbout();
                if (e.target.closest('[data-hist-dl]')) return dlRun();
                if (e.target.closest('[data-hist-dl-pause]')) { if (DL.run) DL.run.stop = true; return; }
                if (e.target.closest('[data-hist-dl-cancel]')) return dlCancel();
                if (e.target.closest('[data-hist-restore]')) { try { await post('hist_pack_restore', {}); } catch (x) { return A().toast(x.message, 'error'); } return refresh(); }
                if (e.target.closest('[data-hist-remove]')) {
                    try { await post('hist_pack_remove', {}); } catch (x) { return A().toast(x.message, 'error'); }
                    await refresh();
                    A().undoToast?.(i18n('🗑 Histoire du lieu supprimée'), {undo: async () => { await post('hist_pack_restore', {}); await refresh(); }, redo: async () => { await post('hist_pack_remove', {}); await refresh(); }});
                    return;
                }
                const fb = e.target.closest('[data-hist-fhmd]');
                if (fb) {
                    fb.disabled = true; let n = 0;
                    for (const code of fh.missing) {
                        fb.textContent = i18n('⤓ Département {c}… ({n}/{t})', {c: code, n: n + 1, t: fh.missing.length});
                        try { await post('hist_fhmd_step', {code}); n++; } catch (x) { A().toast(i18n('frdata.org, département {c} : {e}', {c: code, e: x.message}), 'error'); break; }
                    }
                    await refresh();
                    if (n) A().toast?.(i18n('👶 {n} table(s) de mortalité téléchargée(s) chez frdata.org.', {n}));
                    return;
                }
                if (e.target.closest('[data-hist-fhmd-remove]')) {
                    try { await post('hist_fhmd_remove', {}); } catch (x) { return A().toast(x.message, 'error'); }
                    await refresh();
                    A().undoToast?.(i18n('🗑 Tables de mortalité supprimées'), {undo: async () => { await post('hist_fhmd_restore', {}); await refresh(); }});
                }
            });
        }
    };

    /* le bloc (après « 🌍 Le monde autour ») et la page des Réglages (après la Météo d'autrefois) */
    const boot = () => {
        const B = A()?.defaultPersonBlocks; if (Array.isArray(B) && !B.some(b => b[0] === 'histoire')) { let i = B.findIndex(b => b[0] === 'world'); if (i < 0) i = B.findIndex(b => b[0] === 'meteo'); B.splice(i < 0 ? B.length : i + 1, 0, ['histoire', '🏘 Le lieu à son époque']); }
        const T = A()?.defaultMaintenanceTabs; if (Array.isArray(T) && !T.some(t => t[0] === 'histoire')) { const i = T.findIndex(t => t[0] === 'meteo'); T.splice(i < 0 ? T.length : i + 1, 0, ['histoire', '25k2', '🏘 Histoire du lieu']); }
    };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
    ext.histoire = {fill, placeInto, openAbout, openSettings, dl: {run: dlRun, state: DL}};
})();
