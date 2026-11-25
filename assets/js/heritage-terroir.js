/* LCNDA — 🌾 Son terroir (serveur : lib/terroir.php ; style : assets/css/terroir.css ; données : assets/data/tr-*.json.gz,
 * refaites par scripts/terroir/*).
 *  1. 🍷 Les produits de son terroir : les AOC/AOP, IGP et IG dont l'aire comprend la commune (INAO, data.gouv.fr, Licence Ouverte) —
 *     fiche d'un village, monographie, ligne de fiche quand le métier s'y rapporte (« Vigneron dans l'aire Saint-Émilion (AOC) »),
 *     liste « 🍷 Produits AOC, AOP et IGP ».
 *  2. 🐄 Les animaux de son pays : races locales (Wikidata ; région d'origine des races de France : infobox Wikipédia) — fiche d'un
 *     village, monographie, ligne de fiche pour qui travaillait la terre ou les bêtes (« La vache de son pays : la Salers »), liste.
 *  3. 👒 La coiffe et le costume de sa région : Wikimedia Commons (photos avec auteur et licence) et Wikidata — fiche de personne,
 *     fiche d'un village, monographie, liste.
 *  4. 🔤 Le sens de son prénom (et de son nom) : Wiktionnaire (CC BY-SA 4.0) — ~2 000 prénoms livrés, les autres en ligne (gardés) ;
 *     Réglages : « chercher le sens des prénoms de ma base » ; liste « 🔤 Le sens des prénoms ».
 *  5. 🏫 Écoles d'autrefois : écoles, collèges, lycées, écoles normales, séminaires, universités (Wikidata) — fiche d'un village,
 *     monographie, ligne de fiche pour un élève, un maître… ou une fiche avec une scolarité ; liste.
 * Tout se règle dans Réglages → « 🌾 Son terroir » (localStorage « genealogie-terroir »).
 * Registres communs : LCNDA_EXT.monographSections, .dataSources, .dataLists. Pour d'autres fichiers : LCNDA_EXT.terroir.
 * Essai : tests/test-terroir.js
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
    const KEY = 'genealogie-terroir';
    const TAB = ['terroir', '25k6', '🌾 Son terroir'];
    const PARTS = [
        ['aoc', '🍷 Les produits de son terroir', 'Les AOC, AOP et IGP dont l’aire comprend la commune (INAO). Sur la fiche d’une personne : quand son métier s’y rapporte (vigneron, fromager…).'],
        ['races', '🐄 Les animaux de son pays', 'Les races de vaches, chevaux, moutons, chèvres, porcs, volailles de la région. Sur la fiche : pour qui travaillait la terre ou les bêtes.'],
        ['coiffes', '👒 La coiffe et le costume de sa région', 'Coiffes et costumes traditionnels de la région, avec des photos (aide aussi à dater une photo de famille).'],
        ['prenom', '🔤 Le sens de son prénom', 'Fiche de personne : d’où vient son prénom, et son nom de famille quand le Wiktionnaire l’explique.'],
        ['ecoles', '🏫 Écoles d’autrefois', 'Écoles, collèges, lycées, écoles normales, séminaires de la commune. Sur la fiche : pour un élève, un étudiant, un maître d’école…']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const fmtDate = ts => { try { return new Date(ts * 1000).toLocaleDateString('fr-FR'); } catch (_) { return ''; } };
    const emptyLine = (text, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text, icon, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const more = (inner, n) => `<details class="cplus-more tr-more"><summary>${esc(n ? T('▸ plus ({n})', {n}) : T('▸ plus'))}</summary>${inner}</details>`;
    const memo = new Map();
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }
    const qs = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))));
    const placeQuery = p => qs({place_id: Number(p?.id || p?.place_id) || '', name: p?.name || p?.place_name || '', lat: p?.lat ?? p?.latitude, lon: p?.lon ?? p?.longitude, insee: p?.insee || p?.admin4_code || '', country: p?.country || '', county: p?.county || ''});
    const srcLine = (label, licence, url, extra = '') => `<p class="cplus-src tr-src">${esc(T('Source :'))} ${url ? link(url, label) : esc(label)}${licence ? ` — ${esc(licence)}` : ''}${extra}</p>`;
    const listFr = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${T('et')} ${arr[arr.length - 1]}`);
    const thumb = (src, href, alt = '') => (src ? `<a class="tr-thumb" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(alt)}" src="${esc(src)}" onerror="this.parentNode.remove()"></a>` : '');
    const INAO_SRC = () => srcLine('INAO — Institut national de l’origine et de la qualité, data.gouv.fr', T('Licence Ouverte'), 'https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop', ` · <small>${link('https://www.data.gouv.fr/datasets/aire-geographique-des-igp-et-des-ig', T('aires des IGP ↗'))}</small>`);

    /** l'auteur et la licence d'une image Wikidata (lus en ligne sur Commons, gardés, quand l'image s'affiche) */
    const credit = (file, page) => `<span data-tr-credit="${esc(file)}">${esc(T('auteur et licence :'))}</span> ${link(page, T('Wikimedia Commons ↗'))}`;
    async function fillCredits(root) {
        const spans = [...(root?.querySelectorAll?.('[data-tr-credit]:not([data-done])') || [])]; if (!spans.length) return;
        spans.forEach(s => { s.dataset.done = '1'; });
        const files = [...new Set(spans.map(s => s.dataset.trCredit))];
        for (let i = 0; i < files.length; i += 20) {
            const part = files.slice(i, i + 20);
            const r = await ask('tr_credit', {files: part.join('|')});
            spans.filter(s => part.includes(s.dataset.trCredit)).forEach(s => {
                const c = r?.credits?.[s.dataset.trCredit];
                if (c) s.innerHTML = `${c.author ? `${esc(c.author)} · ` : ''}${c.licence_url ? link(c.licence_url, c.licence) : esc(c.licence)} ·`;
                else s.textContent = r?.offline ? T('auteur et licence : sur la page de l’image (hors ligne)') : T('auteur et licence : sur la page de l’image');
            });
        }
    }
    /** une photo de Commons dont l'auteur et la licence sont livrés avec l'app */
    const photoFig = (p, cls = '') => (p ? `<figure class="tr-photo ${cls}"><a href="${esc(p.page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="" src="${esc(p.thumb)}" onerror="this.closest('figure').remove()"></a>
        <figcaption>${p.author ? `${esc(p.author)} · ` : ''}${p.licence_url ? link(p.licence_url, p.licence) : esc(p.licence)}${p.date ? ` · ${esc(p.date)}` : ''} · ${link(p.page, T('Commons ↗'))}</figcaption></figure>` : '');

    /* ═════════ 🍷 AOC, AOP, IGP ═════════ */
    const signTxt = a => a.sign || 'AOC';
    function aocRow(a) {
        const prods = a.products?.length ? `<small>${esc(T('Produits : {p}', {p: a.products.slice(0, 6).join(' · ')}))}${a.products_count > 6 ? ' …' : ''}</small>` : '';
        return `<li class="tr-item">${a.thumb ? thumb(a.thumb, a.image_page, a.name) : ''}<div><span>${esc(a.icon)} <b>${esc(a.name)}</b> <span class="tr-pill">${esc(signTxt(a))}</span> <small class="muted">${esc(T(a.cat_label))}</small></span>${prods}
            <small>${link(a.url, T('INAO ↗'))}${a.wp ? ` · ${link(a.wp, T('Wikipédia ↗'))}` : ''}${a.wd ? ` · ${link(a.wd, T('Wikidata ↗'))}` : ''}${a.image ? ` · ${credit(a.image, a.image_page)}` : ''}</small></div></li>`;
    }
    function aocSentence(list, commune) {
        const byCat = new Map(); list.forEach(a => { if (!byCat.has(a.cat)) byCat.set(a.cat, []); byCat.get(a.cat).push(a); });
        const parts = [...byCat.values()].slice(0, 3).map(xs => `${xs[0].icon} ${xs.length === 1 ? `${xs[0].name} (${signTxt(xs[0])})` : T('{a} et {n} autres', {a: `${xs[0].name} (${signTxt(xs[0])})`, n: xs.length - 1})}`);
        return T('{c} est dans l’aire de {n} produits d’origine protégée : {p}.', {c: commune || T('La commune'), n: list.length, p: parts.join(' ; ')});
    }
    function aocHtml(list, commune) {
        if (!list?.length) return '';
        const N = 4;
        return `<p class="cplus-lead">${esc(aocSentence(list, commune))}</p><ul class="tr-list">${list.slice(0, N).map(aocRow).join('')}</ul>${list.length > N ? more(`<ul class="tr-list">${list.slice(N).map(aocRow).join('')}</ul>`, list.length - N) : ''}
            ${INAO_SRC()}<p class="muted tr-note"><small>${esc(T('L’aire d’une appellation est fixée aujourd’hui : elle dit ce qu’on produit ici sous ce nom, pas forcément ce que faisaient tes ancêtres.'))}</small></p>`;
    }

    /* ═════════ 🐄 races ═════════ */
    const SP = {bovin: 'Vaches', cheval: 'Chevaux', mouton: 'Moutons', chevre: 'Chèvres', porc: 'Porcs', poule: 'Poules', oie: 'Oies', canard: 'Canards', dindon: 'Dindons', ane: 'Ânes', chien: 'Chiens'};
    const SP_LEAD = {bovin: 'La vache de son pays', cheval: 'Le cheval de son pays', mouton: 'La brebis de son pays', chevre: 'La chèvre de son pays', porc: 'Le cochon de son pays', poule: 'La poule de son pays',
        oie: 'L’oie de son pays', canard: 'Le canard de son pays', dindon: 'Le dindon de son pays', ane: 'L’âne de son pays', chien: 'Le chien de son pays'};
    const SP_ART = {bovin: 'la', cheval: 'le', mouton: 'la', chevre: 'la', porc: 'le', poule: 'la', oie: 'l’', canard: 'le', dindon: 'le', ane: 'l’', chien: 'le'};
    /** « la Salers », mais « Poule de Houdan » (le nom dit déjà l'espèce) */
    const breedName = r => (/^(poule|oie|canard|dindon|âne|ane|baudet|chèvre|chevre|chien|berger|braque|bouledogue|mouton|brebis|race|porc|cochon|cheval|trait|bidet|taureau|bœuf|boeuf|vache|coq|griffon|basset|épagneul|lévrier|dogue|bleu|bleue|petit|grand)\b/i.test(r.name) ? r.name : `${T(SP_ART[r.species] || 'la')}${SP_ART[r.species] === 'l’' ? '' : ' '}${r.name}`);
    function raceRow(r) {
        const where = r.origin ? T('origine : {o}', {o: r.origin}) : (r.country_names ? T('pays : {c}', {c: r.country_names}) : '');
        return `<li class="tr-item">${thumb(r.thumb, r.image_page, r.name)}<div><span>${esc(r.icon)} <b>${esc(r.name)}</b> <small class="muted">${esc(T(SP[r.species] || ''))}</small></span>${r.desc ? `<small>${esc(r.desc)}</small>` : ''}
            <small>${esc(where)}${where ? ' · ' : ''}${r.wp ? `${link(r.wp, T('Wikipédia ↗'))} · ` : ''}${link(r.url, T('Wikidata ↗'))}${r.image ? ` · ${credit(r.image, r.image_page)}` : ''}</small></div></li>`;
    }
    function racesSrc(list) {
        const wp = list.some(r => r.origin);
        return srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/', wp ? ` · <small>${esc(T('région d’origine : infobox des articles de Wikipédia (CC BY-SA 4.0)'))}</small>` : '');
    }
    function racesHtml(list, {lead} = {}) {
        if (!list?.length) return '';
        const bySp = new Map(); list.forEach(r => { if (!bySp.has(r.species)) bySp.set(r.species, []); bySp.get(r.species).push(r); });
        const first = [...bySp.values()].map(xs => xs[0]).slice(0, 3);
        const rest = list.filter(r => !first.includes(r));
        const l = lead || T('Les races de la région : {r}.', {r: listFr([...bySp.entries()].slice(0, 4).map(([sp, xs]) => `${T(SP[sp] || '').toLowerCase()} ${listFr(xs.slice(0, 2).map(x => x.name))}`))});
        return `<p class="cplus-lead">${esc(l)}</p><ul class="tr-list">${first.map(raceRow).join('')}</ul>${rest.length ? more(`<ul class="tr-list">${rest.map(raceRow).join('')}</ul>`, rest.length) : ''}${racesSrc(list)}`;
    }

    /* ═════════ 👒 coiffes et costumes ═════════ */
    function coiffeHtml(c, {lead} = {}) {
        if (!c) return '';
        const it = c.items?.[0], ph = it?.photo || c.photos?.[0];
        const l = lead || (it ? T('La coiffe ou le costume de la région ({r}) : {n}.', {r: c.region, n: it.name}) : T('Le costume traditionnel de la région ({r}) : des photos.', {r: c.region}));
        const items = (c.items || []).map(i => `<li>${i.photo ? '' : '👒 '}<b>${esc(i.name)}</b>${i.desc ? ` <small class="muted">— ${esc(i.desc)}</small>` : ''} <small>${i.url ? `${link(i.url, T('Wikidata ↗'))} · ` : ''}${link(i.category, T('photos ↗'))}</small></li>`).join('');
        const photos = [...(c.items || []).map(i => i.photo).filter(Boolean), ...(c.photos || [])].filter((p, i, a) => a.findIndex(x => x.file === p.file) === i);
        return `<div class="tr-coiffe">${ph ? photoFig(ph) : ''}<div><p class="cplus-lead">👒 ${esc(l)}</p>
            ${items || photos.length > 1 ? more(`${items ? `<ul class="tr-names">${items}</ul>` : ''}<div class="tr-gallery">${photos.slice(1, 9).map(p => photoFig(p, 'is-small')).join('')}</div>
            <p class="muted tr-note"><small>${esc(T('Les coiffes changeaient d’un village à l’autre et d’une époque à l’autre : compare avec tes photos de famille pour les dater.'))}</small></p>`, (c.items?.length || 0) + Math.max(0, photos.length - 1)) : ''}
            ${srcLine(T('Wikimedia Commons, « {c} »', {c: decodeURIComponent(c.category.split('Category:')[1] || '').replace(/_/g, ' ')}), T('licence propre à chaque photo'), c.category, ` · <small>${esc(T('noms : Wikidata'))}</small>`)}</div></div>`;
    }

    /* ═════════ 🏫 écoles ═════════ */
    const founded = s => (s.founded ? T(s.feminine ? 'fondée en {y}' : 'fondé en {y}', {y: s.founded}) : '');
    const schoolLine = s => `${esc(s.name)}${s.founded ? `, ${esc(founded(s))}` : ''}${s.closed ? ` <small class="muted">(${esc(T('jusqu’en {y}', {y: s.closed}))})</small>` : ''}`;
    function schoolRow(s) {
        return `<li class="tr-item">${thumb(s.thumb, s.image_page, s.name)}<div><span>🏫 <b>${schoolLine(s)}</b></span><small>${esc(T(s.kind_label || ''))}${s.type ? ` · ${esc(s.type)}` : ''}${s.place && s.place !== s.commune ? '' : ''}</small>
            <small>${s.wp ? `${link(s.wp, T('Wikipédia ↗'))} · ` : ''}${link(s.url, T('Wikidata ↗'))}${s.image ? ` · ${credit(s.image, s.image_page)}` : ''}</small></div></li>`;
    }
    function schoolsHtml(list, {lead} = {}) {
        if (!list?.length) return '';
        const N = 3, old = list.filter(s => s.founded);
        const f = old[0] || list[0];
        const l = lead || (list.length === 1 ? `${f.name}${f.founded ? `, ${founded(f)}` : ''}.` : T('{n} écoles connues, dont {s}.', {n: list.length, s: `${f.name}${f.founded ? `, ${founded(f)}` : ''}`}));
        return `<p class="cplus-lead">🏫 ${esc(l)}</p><ul class="tr-list">${list.slice(0, N).map(schoolRow).join('')}</ul>${list.length > N ? more(`<ul class="tr-list">${list.slice(N).map(schoolRow).join('')}</ul>`, list.length - N) : ''}
            ${srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/', ` · <small>${esc(T('ce qui est noté sur Wikidata : la liste n’est pas complète'))}</small>`)}`;
    }

    /* ═════════ 🔤 le sens du prénom, du nom ═════════ */
    function meaningHtml(m, word) {
        if (!m?.text) return '';
        const short = m.text.length > 260 ? `${m.text.slice(0, 240).replace(/\s+\S*$/, '')}…` : m.text;
        const when = m.fetched_at && !m.offline ? ` · ${esc(m.cached ? T('gardé le {d}', {d: fmtDate(m.fetched_at)}) : T('lu en ligne le {d}', {d: fmtDate(m.fetched_at)}))}` : '';
        return `<p class="cplus-lead tr-meaning">🔤 <b>${esc(word || m.title)}</b> : ${esc(short)} <small>(${link(m.url, T('Wiktionnaire ↗'))})</small></p>
            ${m.text.length > 260 ? more(`<p>${esc(m.text)}</p>`) : ''}<p class="cplus-src tr-src">${esc(T('Extrait de l’article « {t} » du Wiktionnaire, partie « Étymologie », écrit par ses contributeurs', {t: m.title}))} (${link(m.history_url, T('historique'))}) — ${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}${when}</p>`;
    }

    /* ═════════ la fiche d'une personne : un bloc « 🌾 Son terroir » ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.terroir = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !PARTS.some(x => on(x[0]))) return '';
        return A().card(index, T('🌾 Son terroir'), '', `<div class="tr-block" data-tr-person="${Number(p.id)}"></div>`, 'span-12').replace(/^(\s*<section class="card[^"]*")/, '$1 hidden'); // caché tant qu'il n'y a rien
    };
    const firstWord = s => String(s || '').trim().split(/\s+/)[0] || '';
    async function fillPerson(host, id, only = null) {
        const want = k => (only ? only.includes(k) : on(k));
        const r = await ask('tr_person', {id});
        if (!host.isConnected || !r?.ok) return r;
        const out = [];
        if (want('prenom')) out.push(`<div class="tr-line" data-tr-line="prenom">${meaningHtml(r.prenom, r.prenom?.title || firstWord(r.first))}${meaningHtml(r.nom, (r.last || '').toUpperCase())}</div>`);
        if (want('aoc') && r.aoc) {
            const a = r.aoc.areas[0];
            out.push(`<div class="tr-line" data-tr-line="aoc">${aocHtml(r.aoc.areas, r.aoc.place).replace(/^<p class="cplus-lead">.*?<\/p>/s, `<p class="cplus-lead">${esc(a.icon)} ${esc(T('{j} dans l’aire {a} ({s})', {j: r.aoc.job, a: a.name, s: signTxt(a)}))}${r.aoc.count > 1 ? ` <small class="muted">${esc(T('— {c}, et {n} autres aires', {c: r.aoc.place, n: r.aoc.count - 1}))}</small>` : ` <small class="muted">— ${esc(r.aoc.place)}</small>`}</p>`)}</div>`);
        }
        if (want('races') && r.races?.items?.length) {
            const f = r.races.items[0], where = r.races.dep_name || r.races.place;
            out.push(`<div class="tr-line" data-tr-line="races">${racesHtml(r.races.items, {lead: `${f.icon} ${T('{l} : {b}', {l: T(SP_LEAD[f.species] || 'La race de son pays'), b: breedName(f)})}${where ? ` (${where})` : ''}.`})}</div>`);
        }
        if (want('coiffes') && r.coiffes?.items?.length) {
            const c = r.coiffes.items[0], it = c.items?.[0];
            out.push(`<div class="tr-line" data-tr-line="coiffes">${coiffeHtml(c, {lead: it ? T('La coiffe ou le costume de son pays ({r}) : {n}.', {r: c.region, n: it.name}) : T('Le costume traditionnel de son pays ({r}) : des photos.', {r: c.region})})}</div>`);
        }
        if (want('ecoles') && r.ecoles?.items?.length) {
            const s = r.ecoles.items.find(x => x.founded) || r.ecoles.items[0];
            const lead = `${r.ecoles.job ? `${r.ecoles.job} — ` : ''}${s.name}${s.founded ? `, ${founded(s)}` : ''}${s.place ? ` (${s.place})` : ''}.`;
            out.push(`<div class="tr-line" data-tr-line="ecoles">${schoolsHtml(r.ecoles.items, {lead})}</div>`);
        }
        host.innerHTML = out.join('');
        host.querySelectorAll('.tr-line').forEach(l => { if (!l.textContent.trim()) l.remove(); });
        fillCredits(host);
        const card = host.closest('section.card');
        if (card && host.querySelector('.tr-line')) card.hidden = false;
        // 🔤 en ligne (Wiktionnaire) : prénom pas livré, nom de famille — jamais pour une fiche confidentielle ou une personne vivante
        if (want('prenom') && !r.private && (!r.prenom?.text || (r.last && !r.nom))) {
            const rr = await ask('tr_nom', {id});
            if (!host.isConnected || !rr?.ok) return r;
            const html = `${meaningHtml(rr.prenom, rr.prenom?.title || firstWord(r.first))}${meaningHtml(rr.nom, (r.last || '').toUpperCase())}`;
            if (html) {
                let line = host.querySelector('[data-tr-line="prenom"]');
                if (!line) { host.insertAdjacentHTML('afterbegin', '<div class="tr-line" data-tr-line="prenom"></div>'); line = host.querySelector('[data-tr-line="prenom"]'); }
                line.innerHTML = html;
                if (card) card.hidden = false;
            }
        }
        return r;
    }
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-tr-person]').forEach(h => fillPerson(h, Number(h.dataset.trPerson))); });

    /* ═════════ la fiche d'un village ═════════ */
    const panel = (id, title, body) => `<section class="maintenance-panel cplus-panel tr-panel" data-tr-part="${id}"><h3>${esc(title)}</h3>${body}</section>`;
    const PLACE_PARTS = {aoc: '🍷 Les produits de son terroir', races: '🐄 Les animaux de son pays', coiffes: '👒 La coiffe et le costume de la région', ecoles: '🏫 Écoles d’autrefois'};
    function partHtml(k, r) {
        if (k === 'aoc') return aocHtml(r.aoc, r.commune?.name);
        if (k === 'races') return racesHtml((r.races || []).filter(x => x.species !== 'chien').concat((r.races || []).filter(x => x.species === 'chien')), r.commune?.country && r.commune.country !== 'FR' ? {lead: T('Les races de son pays ({c}) : {r}.', {c: r.commune.country_name, r: listFr(r.races.slice(0, 3).map(x => x.name))})} : {});
        if (k === 'coiffes') return r.coiffes?.length ? r.coiffes.slice(0, 2).map(c => coiffeHtml(c)).join('') : '';
        if (k === 'ecoles') return schoolsHtml(r.ecoles);
        return '';
    }
    async function placeInto(host, place, {parts = null} = {}) {
        const want = k => (parts ? parts.includes(k) : on(k));
        const r = await ask('tr_place', placeQuery(place));
        if (!host.isConnected) return r;
        if (!r?.ok) { host.innerHTML = ''; return r; }
        host.innerHTML = Object.keys(PLACE_PARTS).filter(want).map(k => { const b = partHtml(k, r); return b ? panel(k, T(PLACE_PARTS[k]), b) : ''; }).join('');
        fillCredits(host);
        return r;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tr])');
        if (!village) return;
        village.dataset.tr = '1';
        if (!['aoc', 'races', 'coiffes', 'ecoles'].some(on)) return;
        const place = villagePlace(village); if (!place.id && !place.insee && !place.name) return;
        const anchor = village.querySelector('[data-cc-host]') || village.querySelector('[data-mr-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid') || village.querySelector('[data-vsec="stats"]');
        const box = '<div class="tr-place" data-tr-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tr-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    document.addEventListener('click', e => {
        if (e.target.closest?.('[data-tr-clear]')) { clearCache(); return; }
        if (e.target.closest?.('[data-tr-fetch]')) fetchBase();
    });
    document.addEventListener('change', e => { const t = e.target.closest?.('[data-tr-tg]'); if (t && e.target.matches('input')) { const s = settings(); s[t.dataset.trTg] = e.target.checked; save(s); memo.clear(); } });

    /* ═════════ 📜 Monographie de commune ═════════ */
    const monoPlace = pl => ({id: Number(pl?.id) || 0, name: pl?.name || '', lat: pl?.latitude ?? pl?.lat ?? null, lon: pl?.longitude ?? pl?.lon ?? null, country: pl?.country || '', county: pl?.county || ''});
    const monoRun = part => async (place, host, ctx) => {
        let insee = ''; try { insee = (await ctx?.village?.())?.insee || ''; } catch (_) {}
        host.innerHTML = '<div></div>';
        await placeInto(host.firstElementChild, {...monoPlace(place), insee}, {parts: [part]});
        const body = host.querySelector('[data-tr-part]');
        if (!body || !body.textContent.trim()) { host.innerHTML = ''; return false; }
        host.innerHTML = body.innerHTML.replace(/^<h3>.*?<\/h3>/s, '');
        await fillCredits(host);
        return true;
    };
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'tr_produits', icon: '🍷', label: T('Les produits de son terroir'), group: 'Le lieu', defaultOn: true, enabled: () => on('aoc'), render: monoRun('aoc')},
        {id: 'tr_races', icon: '🐄', label: T('Les animaux du pays'), group: 'Le lieu', defaultOn: true, enabled: () => on('races'), render: monoRun('races')},
        {id: 'tr_coiffes', icon: '👒', label: T('La coiffe et le costume de la région'), group: 'Le lieu', defaultOn: true, enabled: () => on('coiffes'), render: monoRun('coiffes')},
        {id: 'tr_ecoles', icon: '🏫', label: T('Écoles d’autrefois'), group: 'Le lieu', defaultOn: true, enabled: () => on('ecoles'), render: monoRun('ecoles')});

    /* ═════════ 🧰 à la demande : le registre commun des données ═════════ */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, county: pl.county || '', country: pl.country || ''} : null);
    const personId = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPlace(part, ctx, host, empty) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        host.innerHTML = '<div class="tr-place"></div>';
        const r = await placeInto(host.firstElementChild, pl, {parts: [part]});
        if (!host.textContent.trim()) host.innerHTML = emptyLine(r?.ok === false ? (r.message || empty) : empty, 'ℹ️');
        return r;
    }
    async function runPerson(ctx, host, only, empty) {
        const id = personId(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div class="tr-block"></div>';
        const r = await fillPerson(host.firstElementChild, id, only);
        if (!host.textContent.trim()) host.innerHTML = emptyLine(empty, 'ℹ️');
        return r;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'tr_produits', icon: '🍷', label: T('Les produits AOC, AOP et IGP de la commune'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('aoc', ctx, host, T('Cette commune n’est dans l’aire d’aucun produit AOC, AOP ou IGP.'))},
        {id: 'tr_races', icon: '🐄', label: T('Les animaux de son pays (races locales)'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('races', ctx, host, T('Aucune race connue de cette région sur Wikidata.'))},
        {id: 'tr_coiffes', icon: '👒', label: T('La coiffe et le costume de la région'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('coiffes', ctx, host, T('Aucune coiffe ni aucun costume connu pour cette région.'))},
        {id: 'tr_ecoles', icon: '🏫', label: T('Écoles d’autrefois de la commune'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('ecoles', ctx, host, T('Aucune école de cette commune sur Wikidata.'))},
        {id: 'tr_prenom', icon: '🔤', label: T('Le sens de son prénom et de son nom'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(ctx, host, ['prenom'], T('Le Wiktionnaire n’explique pas ce prénom.'))},
        {id: 'tr_terroir', icon: '🌾', label: T('Son terroir (produits, animaux, coiffe, écoles)'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(ctx, host, ['aoc', 'races', 'coiffes', 'ecoles'], T('Rien de connu pour son métier et ses communes.'))});

    /* ═════════ 🧰 Listes → Données ═════════ */
    const openUrl = u => { if (u) window.open(u, '_blank', 'noopener'); };
    const loadList = kind => api('tr_list', {kind}).then(r => r.rows || []);
    const CATS = ['Vin', 'Fromage', 'Eau-de-vie ou liqueur', 'Cidre ou poiré', 'Beurre ou crème', 'Viande ou volaille', 'Produit de la mer', 'Olive ou huile', 'Miel', 'Fruit', 'Légume, céréale ou plante', 'Autre produit'];
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'tr_aoc', icon: '🍷', label: T('Produits AOC, AOP et IGP'), group: 'Le lieu', source: T('INAO, data.gouv.fr (Licence Ouverte)'), sourceUrl: 'https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop', enabled: () => on('aoc'),
            load: () => loadList('aoc'),
            fields: [{key: 'name', label: T('Appellation'), type: 'text'}, {key: 'sign', label: T('Signe'), type: 'enum', values: ['AOC', 'IGP', 'IG']}, {key: 'cat_label', label: T('Sorte'), type: 'enum', values: CATS.map(T)},
                {key: 'communes', label: T('Communes'), type: 'number'}, {key: 'dep_names', label: T('Départements'), type: 'text'}, {key: 'products', label: T('Produits'), type: 'text'}, {key: 'url', label: T('Source (INAO)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            open: r => openUrl(r.url)},
        {id: 'tr_races', icon: '🐄', label: T('Races locales d’animaux'), group: 'Le lieu', source: T('Wikidata (CC0) ; origine : Wikipédia (CC BY-SA 4.0)'), sourceUrl: 'https://www.wikidata.org/', enabled: () => on('races'),
            load: () => loadList('races'),
            fields: [{key: 'name', label: T('Race'), type: 'text'}, {key: 'species_label', label: T('Espèce'), type: 'enum', values: Object.values(SP).map(T)}, {key: 'country_names', label: T('Pays'), type: 'enum'},
                {key: 'origin', label: T('Origine (Wikipédia)'), type: 'text'}, {key: 'dep_names', label: T('Départements'), type: 'text'}, {key: 'desc', label: T('Description'), type: 'text'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'image_page', label: T('Image (auteur et licence sur sa page)'), type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.wp || r.url)},
        {id: 'tr_coiffes', icon: '👒', label: T('Coiffes et costumes des régions'), group: 'Le lieu', source: T('Wikimedia Commons (licence de chaque photo), Wikidata'), sourceUrl: 'https://commons.wikimedia.org/wiki/Category:Traditional_clothing_of_France', enabled: () => on('coiffes'),
            load: () => loadList('coiffes'),
            fields: [{key: 'name', label: T('Coiffe, costume ou photo'), type: 'text'}, {key: 'region', label: T('Région'), type: 'enum'}, {key: 'dep_names', label: T('Départements'), type: 'text'}, {key: 'desc', label: T('Description ou date'), type: 'text'},
                {key: 'photo_credit', label: T('Auteur et licence de la photo'), type: 'text'}, {key: 'photo', label: T('Photo'), type: 'url'}, {key: 'category', label: T('Source (Commons)'), type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.photo || r.category)},
        {id: 'tr_ecoles', icon: '🏫', label: T('Écoles d’autrefois'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('ecoles'),
            load: () => loadList('ecoles'),
            fields: [{key: 'name', label: T('École'), type: 'text'}, {key: 'kind_label', label: T('Sorte'), type: 'enum', values: ['Séminaire', 'École normale', 'Université ou faculté', 'Lycée', 'Collège', 'École primaire', 'École supérieure', 'Établissement religieux', 'Autre école'].map(T)},
                {key: 'founded', label: T('Fondée'), type: 'year'}, {key: 'closed', label: T('Fermée'), type: 'year'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'dep_name', label: T('Département'), type: 'enum'},
                {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.founded || null, r.closed || null], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.wp || r.url)},
        {id: 'tr_prenoms', icon: '🔤', label: T('Le sens des prénoms'), group: 'La personne', source: T('Wiktionnaire (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wiktionary.org/', enabled: () => on('prenom'),
            load: () => loadList('prenoms'),
            fields: [{key: 'name', label: T('Prénom ou nom'), type: 'text'}, {key: 'text', label: T('Origine et sens'), type: 'text'}, {key: 'where', label: T('Où'), type: 'enum'}, {key: 'url', label: T('Source (Wiktionnaire)'), type: 'url'}],
            open: r => openUrl(r.url)});

    /* ═════════ Réglages → 🌾 Son terroir ═════════ */
    async function clearCache() {
        try {
            const res = await post('tr_cache_clear', {});
            memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await post('tr_cache_restore', {token: res.token}); memo.clear(); drawSettings(); }});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    let fetching = false;
    /** cherche en ligne le sens des prénoms de la base (40 par appel), sans rien écrire dans la base : seulement des réponses gardées */
    async function fetchBase() {
        if (fetching) return; fetching = true;
        const box = document.querySelector('[data-tr-base]');
        try {
            for (let i = 0; i < 60; i++) {
                const r = await api('tr_base_names', {fetch: 40});
                if (box?.isConnected) box.innerHTML = baseHtml(r, true);
                if (!r.ok) { A().toast?.(r.message || T('Pas de connexion à Internet : réessaie quand tu seras connecté.'), 'error'); break; }
                if (!r.left) break;
            }
            memo.clear();
        } finally { fetching = false; const b = document.querySelector('[data-tr-base]'); if (b?.isConnected) api('tr_base_names', {}).then(r => { b.innerHTML = baseHtml(r); }).catch(() => {}); }
    }
    function baseHtml(r, busy = false) {
        if (!r?.total) return `<p class="muted">${esc(T('Pas encore de prénoms dans ta base.'))}</p>`;
        return `<p>${esc(T('{f} prénoms de ta base ont un sens connu, sur {t}.', {f: r.found, t: r.total}))}${r.left ? ` ${esc(T('{n} n’ont pas encore été cherchés.', {n: r.left}))}` : ''}</p>
            <div class="page-actions"><button type="button" class="button secondary" data-tr-fetch ${r.left && !busy && !kiosk() ? '' : 'disabled'}>${esc(busy ? T('On cherche sur le Wiktionnaire…') : T('📖 Chercher le sens des autres prénoms (en ligne)'))}</button></div>
            <p class="muted"><small>${esc(T('Seuls les prénoms partent sur Internet (jamais ceux des fiches confidentielles ni des personnes vivantes). Les réponses sont gardées sur l’ordinateur.'))}</small></p>`;
    }
    const fmtSize = b => (b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = {sources: [], cache: {count: 0, bytes: 0}};
        try { about = await api('tr_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-tr-settings]')) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-tr-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = about.sources.map(x => `<tr><td>${link(x.url, x.label)}</td><td>${esc(x.what)}${x.count ? ` <small class="muted">(${esc(Number(x.count).toLocaleString('fr-FR'))})</small>` : ''}</td><td>${esc(x.online ? T('en ligne, gardé') : x.bytes ? T('dans l’app ({s})', {s: fmtSize(x.bytes)}) : T('pas encore là'))}</td><td>${esc(x.licence)}</td><td>${esc(x.mention)}</td></tr>`).join('');
        const kb = Math.max(1, Math.round((about.cache?.bytes || 0) / 1024));
        ws.innerHTML = `<section class="page cplus-settings tr-settings" data-tr-settings>${UI().pageHeader ? UI().pageHeader({title: T('Son terroir'), icon: '🌾', where: T('Réglages · Données'), help: esc(T('Les produits, les animaux, les coiffes et les écoles du pays de tes ancêtres, et le sens de leur prénom.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('🔤 Le sens des prénoms de ta base'))}</h3><div data-tr-base><p class="muted">${esc(T('On compte…'))}</p></div></div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('Le sens des prénoms et des noms trouvés en ligne : {n} réponses gardées ({k} Ko).', {n: about.cache?.count || 0, k: kb}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-tr-clear ${about.cache?.count && !kiosk() ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Mention'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Ce qui part sur Internet : seulement un prénom ou un nom de famille (Wiktionnaire), et le nom des images à créditer (Wikimedia Commons). Tout le reste est dans l’app.'))}</p></div></section>`;
        const b = ws.querySelector('[data-tr-base]');
        if (b) api('tr_base_names', {}).then(r => { if (b.isConnected) b.innerHTML = baseHtml(r, fetching); }).catch(() => { b.innerHTML = ''; });
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = ['commune_culture', 'metiers_rivieres', 'commune_plus'].map(k => tabs.findIndex(t => t[0] === k)).find(j => j >= 0); tabs.splice(i === undefined ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'terroir')) {
            // dans la zone « contexte » de la fiche, après « 🏷️ Son nom et ses villages » et ses voisins
            const after = ['commune_culture', 'mr_metier', 'histoire', 'cplus_newspapers', 'world'].map(k => B.findIndex(b => b[0] === k)).find(i => i >= 0);
            B.splice(after === undefined ? B.length : after + 1, 0, ['terroir', '🌾 Son terroir']);
        }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.terroir ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.terroir = {settings, placeInto, fillPerson, aocHtml, racesHtml, coiffeHtml, schoolsHtml, meaningHtml, decorate,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})();
