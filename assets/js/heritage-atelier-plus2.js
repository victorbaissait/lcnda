/* LCNDA — 📜 Atelier de transcription, outils en plus (2). Rangés dans les menus et le panneau 🧰 qui existent déjà ; tout est sur
 * cet ordinateur (rien ne part sur Internet) ; les réglages dans ⚙️ Personnaliser (la barre de l'image), avec de bons réglages au départ.
 *  📖 Mots d'autrefois au survol (laboureur, feue, susdit…) : un sens sûr et sa source ; 📖 mes mots (Mon glossaire) passent avant tout.
 *  🏛 Latin des registres au survol (baptizavi, filius legitimus, sepultus est…), et dans 🧰 la liste à chercher + les formules repérées.
 *  💰 Montants et mesures de l'acte (🧰) : ceux que l'app souligne déjà (app-montants-core.js), en liste, avec leur valeur.
 *  ✍️ Ce scribe (🧰) : les lettres de référence découpées sur l'image (« son s », « son d »), gardées avec l'acte (data.letters) et
 *     montrées pour toute la main (✍ Main du registre, heritage-atelier-suivant.js), côte à côte quand on hésite sur un mot ([?], Ma…d) ;
 *     ses abréviations les plus fréquentes, d'un acte à l'autre du registre.
 *  🔊 Lire à voix haute (Outils) : la voix du navigateur (speechSynthesis), ligne à ligne, la ligne et sa zone montrées ; vitesse ; ■.
 *  🧾 Résumé (Édition) : qui, quoi, quand, où ; à la main, ou 🤖 proposé par l'IA de cet ordinateur (Ollama), relu puis gardé (data.summary).
 *  👥 Seconde lecture (Fichier) : la lecture d'une autre personne, avec son nom, gardée comme une lecture (🕘 Versions, reader:Nom), puis
 *     ⚖️ Comparer les lectures (mot à mot, fusion) ; ou une fiche vierge numérotée (.txt) à lui donner, et la reprendre remplie.
 *  📋 Relevé pour l'entraide (Fichier) : le tableau des cercles généalogiques (UI.exportRows : CSV, tableur, Excel), sans les personnes
 *     vivantes ou confidentielles ni les naissances et mariages de moins de 75 ans, sauf si on le choisit.
 *  🎯 Petit objectif du jour (Outils, éteint au départ) : une ligne ou un acte par jour sur une pile d'actes ; le rappel est seulement ici.
 *  📚 Registre entier : « Acte suivant » reprend aussi les réglages « Mieux voir » de l'acte (en plus du registre et de la main).
 * Données et calculs : heritage-atelier-plus2-data.js. Serveur : lib/atelier_plus2.php. Essai : tests/test-atelier-plus2.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = window.LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const D = () => ext.txPlus2Data;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = q => A().api('atelier_plus2', q);
    const post = b => A().api('atelier_plus2_write', {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const ls = (k, d = '') => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const lsJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const link = (url, site) => (UI().extLink ? UI().extLink(url, site) : `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(site)} ↗</a>`);
    const emptyLine = (text, icon) => (A()?.empty ? A().empty(text, {icon}) : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${icon}</span><span class="empty-line-text">${esc(text)}</span></p>`);

    /* ═════════ ⚙️ Personnaliser : les réglages (le conseillé au départ) ═════════ */
    const P = {mots: 'genealogie-tx-mots', latin: 'genealogie-tx-latin', glo: 'genealogie-tx-glo-survol', vue: 'genealogie-tx-reprendre-vue',
        taille: 'genealogie-tx-loupe-taille', zoom: 'genealogie-tx-loupe-zoom', seule: 'genealogie-tx-loupe-seule', vitesse: 'genealogie-tx-voix-vitesse'};
    const on = k => ls(P[k]) !== '0'; // allumé au départ
    const GLO_KEY = 'genealogie-tx-glossaire', GOAL_KEY = 'genealogie-tx-objectif', LOG_KEY = 'genealogie-tx-objectif-jours', RAPPEL_KEY = 'genealogie-tx-objectif-rappel', READERS_KEY = 'genealogie-tx-lecteurs';
    const gloList = () => { const a = lsJson(GLO_KEY, []); return Array.isArray(a) ? a.filter(x => x && x.w && x.m) : []; };
    const plugs = new Set();
    const tog = (k, label) => `<label class="ui-toggle"><input type="checkbox" data-ap2-pref="${k}" ${on(k) ? 'checked' : ''}><i></i>${esc(label)}</label>`;
    const sel = (k, label, opts, cur) => `<label class="h-txb-pick">${esc(label)} <select data-ap2-pref="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    ext.txPrefsMore = ext.txPrefsMore || [];
    ext.txPrefsMore.push(() => `<div class="ap2-prefs" data-ap2-prefs>
        ${tog('mots', i18n('Mots d’autrefois expliqués au survol, avec leur source (conseillé)'))}
        ${tog('latin', i18n('Latin des registres traduit au survol (conseillé)'))}
        ${tog('glo', i18n('Mes mots (« Mon glossaire ») expliqués au survol, avant tout le reste (conseillé)'))}
        ${tog('vue', i18n('« Acte suivant » reprend les réglages « Mieux voir » (registre entier, conseillé)'))}
        <div class="ap2-prefs-row">🔍 ${sel('taille', i18n('Loupe : taille'), [['0', i18n('Selon l’image (conseillé)')], ['160', i18n('Petite')], ['240', i18n('Moyenne')], ['340', i18n('Grande')]], ls(P.taille, '0'))}
        ${sel('zoom', i18n('grossissement'), [['2', '× 2'], ['3', '× 3'], ['4', '× 4'], ['6', '× 6']], [2, 3, 4, 6].reduce((b, x) => (Math.abs(x - Number(ls(P.zoom, '3'))) < Math.abs(b - Number(ls(P.zoom, '3'))) ? x : b), 3))}</div>
        <label class="ui-toggle"><input type="checkbox" data-ap2-pref="seule" ${ls(P.seule) === '1' ? 'checked' : ''}><i></i>${esc(i18n('« Mieux voir » seulement dans la loupe : l’image reste telle quelle'))}</label>
        ${sel('vitesse', `🔊 ${i18n('Lecture à voix haute : vitesse')}`, [['0.7', i18n('Lente')], ['0.9', i18n('Posée (conseillé)')], ['1.1', i18n('Normale')], ['1.3', i18n('Rapide')]], ls(P.vitesse, '0.9'))}</div>`);
    if (typeof document !== 'undefined') document.addEventListener('change', e => {
        const k = e.target?.dataset?.ap2Pref; if (!k || !P[k]) return;
        const v = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value;
        lsSet(P[k], v);
        if (k === 'seule') plugs.forEach(p => { try { p.applyImage?.(); } catch (_) {} });
        window.dispatchEvent(new CustomEvent('lcnda-txbar-change')); // le texte se redessine (mots soulignés)
    });

    /* ═════════ 📖 🏛 au survol : mes mots, les mots d'autrefois, le latin (ext.txHoverMore, heritage-transcribe.js) ═════════ */
    let latIdx = null, latFor = null;
    const AL = () => window.LCNDA_AIDE_LECTURE;
    const latinEntries = () => { const L = AL(); return L?.allEntries ? L.allEntries().filter(e => e.lang === 'la') : []; };
    const latinIndex = () => { const L = AL(); const list = L?.allEntries ? L.allEntries() : null; if (!list) return null; if (latFor !== list) { latFor = list; latIdx = D().latinIndex(list.filter(e => e.lang === 'la')); } return latIdx; };
    const latinSource = () => (window.LCNDA_AIDE_LANGS || []).find(l => l.code === 'la')?.sources?.[0] || null;
    const isLatinText = lang => /\blat\b/.test(String(lang || ''));
    function tipMot(word, m) { return `<b><span aria-hidden="true">📖</span> <span data-i18n-off>${esc(word)}</span></b> : <span data-i18n-off lang="fr">${esc(m.d)}</span><small>${esc(i18n('Source'))} : ${link(m.url, m.src)}</small>`; }
    function tipLat(word, item) { const s = latinSource(); return `<b><span aria-hidden="true">🏛</span> <span data-i18n-off>${esc(word)}</span></b> = <span data-i18n-off lang="fr">${esc(item.d)}</span>${item.ex ? `<small data-i18n-off>${esc(item.ex)}</small>` : ''}${s ? `<small>${esc(i18n('Source'))} : ${link(s.url, s.label)}</small>` : ''}<button type="button" class="link-button" data-tx-abopen>${esc(i18n('Ouvrir dans 📖 Aide à la lecture'))}</button>`; }
    function hover(text, o = {}) {
        const X = D(); if (!X) return [];
        const glo = gloList(), out = [];
        if (on('glo')) X.scanGlo(text, glo).forEach(h => out.push({s: h.s, e: h.e, word: h.word, prio: true, cls: 'is-glo', tip: `<b><span aria-hidden="true">📖</span> <span data-i18n-off>${esc(h.glo.w)}</span></b> = <span data-i18n-off>${esc(h.glo.m)}</span><small>${esc(i18n('Mon glossaire'))}</small>`}));
        if (on('mots')) X.scanMots(text, glo).forEach(h => out.push({s: h.s, e: h.e, word: h.word, cls: 'is-old', tip: tipMot(h.word, h.mot)}));
        if (on('latin')) { const idx = latinIndex(); if (idx) X.scanLatin(text, idx, {force: isLatinText(o.lang)}).forEach(h => out.push({s: h.s, e: h.e, word: h.word, cls: 'is-lat', tip: tipLat(h.word, h.item), open: () => ext.readingAid?.open({q: String(h.item.t).split(',')[0].trim(), lang: 'la'})})); }
        return out;
    }
    ext.txHoverMore = ext.txHoverMore || []; ext.txHoverMore.push(hover);
    ext.txSummaryText = t => (D() ? D().summaryLines(t?.data?.summary).join('\n') : '');

    /* ═════════ 🧰 les sections en plus du panneau des aides ═════════ */
    const searchBox = (ph, attr) => `<input type="search" class="ap2-q" ${attr} placeholder="${esc(ph)}" aria-label="${esc(ph)}" spellcheck="false">`;
    function paintMots(box, plug) {
        const X = D(), here = new Set(X.scanMots(plug.area.value, gloList()).map(h => h.mot));
        const draw = q => { const f = X.fold(q.trim()); const list = X.MOTS.filter(m => !f || X.fold(m.forms.join(' ') + ' ' + m.d).includes(f)).sort((a, b) => (here.has(b) - here.has(a)) || a.forms[0].localeCompare(b.forms[0], 'fr'));
            box.querySelector('[data-ap2-motslist]').innerHTML = list.length ? list.map(m => `<li class="${here.has(m) ? 'is-here' : ''}"><b data-i18n-off>${esc(m.forms.slice(0, 2).join(', '))}</b> : <span data-i18n-off lang="fr">${esc(m.d)}</span> <small>${link(m.url, m.src)}</small></li>`).join('') : `<li>${emptyLine(i18n('Aucun mot pour « {q} ».', {q}), '📖')}</li>`; };
        box.innerHTML = `${searchBox(i18n('Chercher un mot (laboureur, feue…)'), 'data-ap2-motsq')}<ul class="ap2-list" data-ap2-motslist></ul>
            <p class="ui-hint">${esc(i18n('Seulement des sens sûrs, chacun avec sa source. Tes mots de « Mon glossaire » passent avant.'))}</p>`;
        box.querySelector('[data-ap2-motsq]').addEventListener('input', e => draw(e.target.value)); draw('');
    }
    function paintLatin(box, plug) {
        const X = D(), all = latinEntries(), src = latinSource();
        if (!all.length) { box.innerHTML = emptyLine(i18n('Le latin de l’Aide à la lecture n’est pas chargé.'), '🏛'); return; }
        const forms = X.latinFormulas(plug.area.value, all), idx = latinIndex(), here = new Set(X.scanLatin(plug.area.value, idx, {force: true}).map(h => h.item));
        const draw = q => { const f = X.fold(q.trim()); const list = all.filter(e => !f || X.fold(`${e.t} ${(e.alt || []).join(' ')} ${e.d}`).includes(f)).sort((a, b) => (here.has(b) - here.has(a))).slice(0, f ? 80 : 40);
            box.querySelector('[data-ap2-latlist]').innerHTML = list.length ? list.map(e => `<li class="${here.has(e) ? 'is-here' : ''}"><b data-i18n-off>${esc(e.t)}</b> = <span data-i18n-off lang="fr">${esc(e.d)}</span></li>`).join('') : `<li>${emptyLine(i18n('Aucun mot pour « {q} ».', {q}), '🏛')}</li>`; };
        box.innerHTML = `${forms.length ? `<p class="ap2-sub">${esc(i18n('Formules repérées dans cet acte'))}</p><ul class="ap2-list is-formulas">${forms.map(e => `<li class="is-here"><b data-i18n-off>${esc(e.t)}</b><br><span data-i18n-off lang="fr">${esc(e.d)}</span></li>`).join('')}</ul>` : ''}
            ${searchBox(i18n('Chercher (baptizavi, obiit, patrinus…)'), 'data-ap2-latq')}<ul class="ap2-list" data-ap2-latlist></ul>
            <p class="ui-hint">${esc(i18n('{n} mots et formules des registres en latin, avec leur traduction.', {n: all.length}))}${src ? ` ${esc(i18n('Source'))} : ${link(src.url, src.label)}` : ''}</p>`;
        box.querySelector('[data-ap2-latq]').addEventListener('input', e => draw(e.target.value)); draw('');
    }
    /** 💰📏 les sommes et mesures de l'acte, comme leur bulle (l'année de l'acte ; la région d'après « (35) » dans le lieu, sinon celle du Convertisseur) */
    function unitsOf(plug) {
        const MT = window.LCNDA_MONTANTS; if (!MT) return null; if (!ext.prixReference) MT.loadPrices?.();
        const $ = plug.$, ym = String($('[data-tx="date_text"]')?.value || '').match(/\b(1[2-9]\d{2}|20[0-2]\d)\b/), dm = String($('[data-tx="place"]')?.value || '').match(/\((\d{2}|2[AB])\)/i), cm = ext.calendarMore;
        let region = dm && cm?.regionOfDept ? cm.regionOfDept(dm[1]) : ''; if (!region) region = String(lsJson('lcnda-autrefois-region', 'paris') || 'paris');
        return MT.scan(plug.area.value).map(h => ({h, x: MT.explain(h, {year: ym ? Number(ym[1]) : 0, region, wageSols: A().journalierWageSols, calendarMore: cm, prices: ext.prixReference})})).filter(r => r.x);
    }
    function paintUnits(box, plug) {
        const rows = unitsOf(plug);
        if (!rows) { box.innerHTML = emptyLine(i18n('Les montants et mesures ne sont pas chargés.'), '💰'); return; }
        box.innerHTML = rows.length ? `<ul class="ap2-list is-units">${rows.map((r, i) => `<li><b>${r.h.type === 'money' ? '💰' : '📏'} <span data-i18n-off>${esc(r.h.raw)}</span></b>${r.x.lines.map(l => `<span class="ap2-unitline">${esc(l)}</span>`).join('')}${r.x.source ? `<small>${esc(i18n('Source'))} : ${r.x.url ? link(r.x.url, r.x.source) : esc(r.x.source)}</small>` : ''}<span class="ap2-acts"><button type="button" class="link-button" data-ap2-unitgo="${i}">${esc(i18n('Voir dans le texte'))}</button><button type="button" class="link-button" data-ap2-unitconv="${i}">🪙 ${esc(i18n('Convertisseur'))}</button></span></li>`).join('')}</ul>`
            : emptyLine(i18n('Aucune somme ni mesure ancienne repérée dans cet acte (livres, sols, deniers, arpents, setiers, toises…).'), '💰');
        box.onclick = e => { const g = e.target.closest('[data-ap2-unitgo]'), c = e.target.closest('[data-ap2-unitconv]'); if (g) { const r = rows[Number(g.dataset.ap2Unitgo)]; plug.gotoRange(r.h.s, r.h.e); } if (c) { const r = rows[Number(c.dataset.ap2Unitconv)]; ext.autrefois?.open({tab: r.x.convert.tab, value: r.x.convert.value, year: r.x.convert.year}); } };
    }

    /* ═════════ ✍️ Ce scribe : les lettres de référence, les habitudes ═════════ */
    const thumbUrl = (act, id) => `api.php?action=atelier_plus2&op=letter_thumb&act=${encodeURIComponent(act)}&id=${encodeURIComponent(id)}`;
    const SUGG = ['s', 'ſ', 'd', 'r', 'e', 'c', 't', 'st', 'ct', 'ss', 'll', 'p', 'q', 'h', 'x', '&', 'M', 'L', 'P'];
    function letterFig(plug, l, act, here) {
        const canLocal = here && (!l.p || Number(l.p) === Number(plug.t.media_id)) && plug.t.filename;
        return `<figure class="ap2-letter${here ? ' is-here' : ''}" data-ap2-letter="${esc(l.id)}" data-act="${esc(act || '')}">${canLocal ? `<canvas data-ap2-lc="${esc(l.id)}" aria-label="${esc(l.label)}"></canvas>` : `<img src="${thumbUrl(act, l.id)}" alt="${esc(l.label)}" loading="lazy" onerror="this.replaceWith(document.createTextNode('—'))">`}<figcaption data-i18n-off>${esc(l.label)}</figcaption>${here ? `<button type="button" class="ap2-x" data-ap2-ldel="${esc(l.id)}" title="${esc(i18n('Retirer'))}" aria-label="${esc(i18n('Retirer'))}">×</button>` : ''}</figure>`;
    }
    /** les lettres de l'acte ouvert, dessinées depuis l'image (même pas encore enregistrées) */
    function drawLocal(plug, host) {
        const cs = host.querySelectorAll('canvas[data-ap2-lc]'); if (!cs.length || !plug.t.filename) return;
        const im = new Image(); im.onload = () => cs.forEach(c => { const l = (plug.t.data.letters || []).find(x => x.id === c.dataset.ap2Lc); if (!l) return; const H = 72, pad = Math.max(l.w, l.h) * .08, sx = Math.max(0, l.x - pad), sy = Math.max(0, l.y - pad), sw = l.w + 2 * pad, sh = l.h + 2 * pad, W = Math.max(8, Math.min(260, Math.round(sw * H / sh)));
            c.width = W; c.height = H; c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, W, H); });
        im.src = `media/${encodeURIComponent(plug.t.filename)}`;
    }
    async function scribeData(plug, fresh = false) {
        const st = plug._ap2; if (!fresh && st.scribe) return st.scribe;
        const hand = plug.t.data.reg?.hand || '', q = {act_id: plug.t.id || 0, hand};
        let L = {items: []}, H = {texts: [], acts: 0}; try { [L, H] = await Promise.all([get({op: 'letters', ...q}), get({op: 'hand', ...q})]); } catch (_) {}
        return (st.scribe = {hand, L, H});
    }
    /** toutes les lettres : celles de cet acte (d'ici, même pas enregistrées) puis celles des autres actes de la main */
    const allLetters = (plug, S) => [...(plug.t.data.letters || []).map(l => ({l, act: plug.t.id, here: true})), ...((S?.L?.items) || []).filter(x => !x.here).map(x => ({l: {id: x.id, label: x.label}, act: x.act_id, here: false, title: x.title}))];
    function lettersHtml(plug, S) {
        const all = allLetters(plug, S); if (!all.length) return '';
        const groups = new Map(); all.forEach(x => { const k = x.l.label; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
        return `<div class="ap2-letters">${[...groups].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([k, xs]) => `<div class="ap2-lgroup"><span class="ap2-lname" data-i18n-off>${esc(i18n('son « {l} »', {l: k}))}</span>${xs.map(x => letterFig(plug, x.l, x.act, x.here)).join('')}</div>`).join('')}</div>`;
    }
    async function paintScribe(box, plug) {
        box.textContent = '…';
        const S = await scribeData(plug, true); if (!box.isConnected) return;
        const hand = plug.t.data.reg?.hand || '', habits = D().habitsOf(S.H?.texts || [], t => (AL()?.abbrevs ? AL().abbrevs(t, '') : []));
        box.innerHTML = `<p class="ap2-hand">${hand ? `✍ <b data-i18n-off>${esc(hand)}</b> · ${esc(A().plural ? A().plural(S.H?.acts || 1, 'acte') : String(S.H?.acts || 1))}` : `<span class="muted">${esc(i18n('La main de cet acte n’a pas de nom : ses lettres valent pour le registre.'))}</span>`}
                ${plug.suivant ? `<button type="button" class="link-button" data-ap2-hand>📚 ${esc(i18n('Registre et main…'))}</button>` : ''}</p>
            <button type="button" class="button small secondary" data-ap2-crop>✂️ ${esc(i18n('Découper une lettre sur l’image'))}</button>
            ${lettersHtml(plug, S) || `<p class="ui-hint">${esc(i18n('Découpe une lettre bien lisible de ce scribe (son s, son d, une ligature) et nomme-la : quand tu hésites sur un mot, ses lettres sont montrées à côté du texte.'))}</p>`}
            ${habits.length ? `<p class="ap2-sub">${esc(i18n('Ses abréviations les plus fréquentes'))}</p><ul class="ap2-habits">${habits.map(h => `<li><b data-i18n-off>${esc(h.word)}</b> <small>× ${esc(String(h.n))}</small> <span data-i18n-off lang="fr">${esc(h.d)}</span></li>`).join('')}</ul>` : ''}`;
        drawLocal(plug, box);
        box.onclick = e => {
            if (e.target.closest('[data-ap2-crop]')) return startCrop(plug);
            if (e.target.closest('[data-ap2-hand]')) return plug.suivant?.editReg();
            const del = e.target.closest('[data-ap2-ldel]'); if (del) return removeLetter(plug, del.dataset.ap2Ldel);
        };
    }
    const repaintScribe = plug => { const d = plug.aides?.panel?.querySelector('[data-txh-sec="scribe"]'); if (d?.open) paintScribe(d.querySelector('.txh-body'), plug); paintHesitate(plug); };
    function removeLetter(plug, id) {
        const before = [...(plug.t.data.letters || [])], l = before.find(x => x.id === id); if (!l) return;
        plug.t.data.letters = before.filter(x => x.id !== id); plug.touch(); repaintScribe(plug);
        A().undoToast?.(i18n('Lettre « {l} » retirée', {l: l.label}), {icon: '✍️', undo: () => { plug.t.data.letters = before; plug.touch(); repaintScribe(plug); }});
    }
    /** ✂️ découper : un rectangle tracé sur l'image (pixels de l'image), puis son nom */
    function startCrop(plug) {
        const stage = plug.$('[data-tx-stage]'), svg = plug.$('[data-tx-svg]'); if (!stage || !svg || !plug.geo().imgW) return A().toast(i18n('Choisis d’abord l’image de l’acte.'), 'error');
        stage.querySelector('.ap2-crop')?.remove();
        const ov = document.createElement('div'); ov.className = 'ap2-crop'; ov.dataset.ap2Crop = '';
        ov.innerHTML = `<div class="ap2-crop-tip">✂️ ${esc(i18n('Trace un rectangle autour d’une lettre bien lisible (Échap : annuler)'))}</div><div class="ap2-crop-box" hidden></div>`;
        stage.appendChild(ov);
        const boxEl = ov.querySelector('.ap2-crop-box'); let p0 = null;
        const end = () => { ov.remove(); window.removeEventListener('keydown', onEsc, true); };
        const onEsc = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } };
        window.addEventListener('keydown', onEsc, true);
        ov.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); p0 = [e.clientX, e.clientY]; ov.setPointerCapture?.(e.pointerId); });
        ov.addEventListener('pointermove', e => { if (!p0) return; const r = ov.getBoundingClientRect(); Object.assign(boxEl.style, {left: `${Math.min(p0[0], e.clientX) - r.left}px`, top: `${Math.min(p0[1], e.clientY) - r.top}px`, width: `${Math.abs(e.clientX - p0[0])}px`, height: `${Math.abs(e.clientY - p0[1])}px`}); boxEl.hidden = false; });
        ov.addEventListener('pointerup', e => {
            if (!p0) return; const G = plug.geo(), r = svg.getBoundingClientRect(), a = p0; p0 = null;
            const toImg = (cx, cy) => G.unrot((cx - r.left - G.panX) / G.zoom, (cy - r.top - G.panY) / G.zoom);
            const pts = [toImg(a[0], a[1]), toImg(e.clientX, a[1]), toImg(a[0], e.clientY), toImg(e.clientX, e.clientY)], xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
            const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys)), w = Math.min(G.imgW, Math.max(...xs)) - x, h = Math.min(G.imgH, Math.max(...ys)) - y;
            end(); if (!(w >= 3 && h >= 3)) return A().toast(i18n('Rectangle trop petit : trace-le autour de la lettre.'), 'error');
            nameLetter(plug, {x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h)});
        });
    }
    function nameLetter(plug, rect) {
        const word = (() => { const W = ext.txAides?.wordAt; return W ? W(plug.area.value, plug.area.selectionStart).w : ''; })();
        ext.openDialog({eyebrow: i18n('CE SCRIBE'), title: `✍️ ${i18n('Lettre de référence')}`, submitLabel: i18n('Garder'),
            body: `<label class="ap2-f"><span>${esc(i18n('Quelle lettre (ou ligature) ?'))}</span><input name="label" maxlength="40" required value="" placeholder="s" spellcheck="false" data-ap2-lname></label>
                <div class="ap2-chips">${SUGG.map(s => `<button type="button" class="button small secondary" data-ap2-sugg="${esc(s)}" data-i18n-off>${esc(s)}</button>`).join('')}</div>
                <p class="ui-hint">${esc(i18n('Gardée avec cet acte et montrée pour toute la main du registre.'))}${word ? ` ${esc(i18n('Mot sous le curseur : « {w} ».', {w: word}))}` : ''}</p>`,
            onOpen: dg => { dg.addEventListener('click', e => { const b = e.target.closest('[data-ap2-sugg]'); if (b) { dg.querySelector('[data-ap2-lname]').value = b.dataset.ap2Sugg; dg.querySelector('[data-ap2-lname]').focus(); } }); setTimeout(() => dg.querySelector('[data-ap2-lname]')?.focus(), 30); },
            onSubmit: f => {
                const label = f.querySelector('[data-ap2-lname]').value.trim().slice(0, 40); if (!label) return UI().fail ? UI().fail(f.querySelector('[data-ap2-lname]'), i18n('Écris la lettre.')) : false;
                const before = [...(plug.t.data.letters || [])], pid = plug.curPid?.(), l = {id: `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ...rect, label, ...(pid && Number(pid) !== Number(plug.t.media_id) ? {p: Number(pid)} : {})};
                plug.t.data.letters = [...before, l]; plug.touch(); repaintScribe(plug);
                A().undoToast?.(i18n('Lettre « {l} » gardée pour ce scribe', {l: label}), {icon: '✍️', undo: () => { plug.t.data.letters = before; plug.touch(); repaintScribe(plug); }});
                return true;
            }});
    }
    /** quand on hésite (un mot avec « ? », « … », [?]) : les lettres de ce scribe, côte à côte, sous le texte */
    async function paintHesitate(plug) {
        const st = plug._ap2, strip = st.hes; if (!strip) return;
        const v = plug.area.value, a = plug.area.selectionStart, W = ext.txAides?.wordAt, w = W ? W(v, a).w : '';
        const around = v.slice(Math.max(0, a - 12), a + 12), doubt = /[?…]/.test(w) || /\[\s*(?:\?|illisible)[^\]]*\]/i.test(around);
        if (!doubt) { strip.hidden = true; return; }
        const S = await scribeData(plug); const all = allLetters(plug, S);
        if (!all.length) { strip.hidden = true; return; }
        strip.innerHTML = `<span class="ap2-hes-t">✍️ ${esc(i18n('Les lettres de ce scribe'))}</span>${all.slice(0, 16).map(x => letterFig(plug, x.l, x.act, x.here)).join('')}`;
        strip.querySelectorAll('.ap2-x').forEach(b => b.remove()); // ici, on regarde seulement
        drawLocal(plug, strip); strip.hidden = false;
    }

    /* ═════════ 🔊 Lire à voix haute ═════════ */
    const voicesNow = () => new Promise(res => { const S = window.speechSynthesis; if (!S) return res([]); const v = S.getVoices(); if (v.length) return res(v); let done = false; const f = () => { if (done) return; done = true; res(S.getVoices()); }; S.addEventListener?.('voiceschanged', f, {once: true}); setTimeout(f, 1200); });
    async function sayStart(plug) {
        const st = plug._ap2, S = window.speechSynthesis;
        if (!S || typeof window.SpeechSynthesisUtterance !== 'function') return A().toast(i18n('La lecture à voix haute n’est pas possible dans ce navigateur.'), 'error');
        const lines = D().readLines(plug.area.value); if (!lines.length) return A().toast(i18n('Le texte est vide : lis ou écris d’abord l’acte.'), 'error');
        const voices = await voicesNow(), fr = voices.find(v => /^fr([-_]|$)/i.test(v.lang || '')) || null;
        const caret = plug.area.selectionStart; let i = lines.findIndex(l => caret >= l.s && caret <= l.e); if (i < 0) i = lines.findIndex(l => l.s >= caret); if (i < 0) i = 0;
        st.say = {lines, i, voice: fr, noFr: !fr, paused: false, seq: 0};
        paintSay(plug); speakAt(plug, i);
    }
    function speakAt(plug, i) {
        const st = plug._ap2, R = st.say, S = window.speechSynthesis; if (!R || !S) return;
        if (i >= R.lines.length) { sayStop(plug, true); return; }
        R.i = i; R.paused = false; const L = R.lines[i], seq = ++R.seq;
        try { plug.gotoRange(L.s, L.e); } catch (_) {}
        const exp = ext.txCouches?.expand ? ext.txCouches.expand(L.text) : L.text;
        const u = new window.SpeechSynthesisUtterance(D().speakable(exp)); u.lang = R.voice?.lang || 'fr-FR'; if (R.voice) u.voice = R.voice; u.rate = Number(ls(P.vitesse, '0.9')) || .9;
        u.onend = () => { if (st.say === R && R.seq === seq && !R.paused) speakAt(plug, i + 1); };
        S.cancel(); S.speak(u); plug.dlg.dataset.ap2Say = String(i + 1); paintSay(plug);
    }
    function sayStop(plug, finished = false) { const st = plug._ap2; if (!st.say) return; st.say = null; try { window.speechSynthesis?.cancel(); } catch (_) {} delete plug.dlg.dataset.ap2Say; paintSay(plug); if (finished) plug.status(i18n('Lecture à voix haute finie')); }
    function paintSay(plug) {
        const st = plug._ap2, bar = st.sayBar, R = st.say; if (!bar) return;
        bar.hidden = !R; if (!R) { bar.innerHTML = ''; return; }
        bar.innerHTML = `<span class="ap2-say-t">🔊 ${esc(i18n('Ligne {n} / {total}', {n: R.i + 1, total: R.lines.length}))}</span>
            <button type="button" class="icon-button small" data-ap2-say="prev" title="${esc(i18n('Ligne d’avant'))}" aria-label="${esc(i18n('Ligne d’avant'))}">⏮</button>
            <button type="button" class="icon-button small" data-ap2-say="pause" title="${esc(R.paused ? i18n('Reprendre') : i18n('Pause'))}" aria-label="${esc(R.paused ? i18n('Reprendre') : i18n('Pause'))}">${R.paused ? '▶' : '⏸'}</button>
            <button type="button" class="icon-button small" data-ap2-say="next" title="${esc(i18n('Ligne suivante'))}" aria-label="${esc(i18n('Ligne suivante'))}">⏭</button>
            <label class="ap2-say-rate">${esc(i18n('vitesse'))} <input type="range" min="0.5" max="1.6" step="0.1" value="${esc(ls(P.vitesse, '0.9'))}" data-ap2-rate aria-label="${esc(i18n('Vitesse de la voix'))}"></label>
            <button type="button" class="button small secondary" data-ap2-say="stop">■ ${esc(i18n('Arrêter'))}</button>
            ${R.noFr ? `<span class="ap2-say-warn" role="status">⚠️ ${esc(i18n('Pas de voix française sur cet ordinateur : la voix par défaut lit le texte. Ajoute une voix française dans les réglages du système.'))}</span>` : ''}`;
    }

    /* ═════════ 🧾 Le résumé : qui, quoi, quand, où ═════════ */
    function openSummary(plug) {
        const s = plug.t.data.summary || {}, F = [['who', 'Qui', 'Jean MAZAUD, fils de Pierre et de Marie LACOMBE'], ['what', 'Quoi', 'baptême'], ['when', 'Quand', '12 novembre 1787'], ['where', 'Où', 'Treignac']];
        let ai = s.from === 'ai' ? {model: s.model || ''} : null;
        ext.openDialog({eyebrow: i18n('RÉSUMÉ'), title: `🧾 ${i18n('Résumé de l’acte')}`, submitLabel: i18n('Garder'),
            body: `<div class="ap2-sum-form">${F.map(([k, l, ph]) => `<label class="ap2-f"><span>${esc(i18n(l))}</span><input data-ap2-sum="${k}" maxlength="240" value="${esc(s[k] || '')}" placeholder="${esc(ph)}" data-i18n-off></label>`).join('')}</div>
                <div class="ap2-sum-ai"><button type="button" class="button small secondary" data-ap2-sumai>🤖 ${esc(i18n('Proposer'))}</button><span class="ui-hint">${esc(i18n('Avec l’IA de cet ordinateur (Ollama), si elle est lancée ; rien ne part sur Internet. Relis avant de garder.'))}</span></div>
                <div data-ap2-summsg></div>`,
            onOpen: dg => {
                dg.classList.add('ap2-sumdlg');
                dg.querySelector('[data-ap2-sumai]').addEventListener('click', async e => {
                    const b = e.currentTarget, old = b.innerHTML; if (!plug.area.value.trim()) return A().toast(i18n('Le texte est vide : lis ou écris d’abord l’acte.'), 'error');
                    b.disabled = true; b.innerHTML = `${UI().spinner ? UI().spinner('', {inline: true}) : '…'} ${esc(i18n('L’IA lit l’acte…'))}`;
                    try {
                        const r = await post({op: 'summary_ai', text: plug.area.value, kind: plug.kindNow?.() || '', date: plug.$('[data-tx="date_text"]')?.value || '', place: plug.$('[data-tx="place"]')?.value || '', lang: plug.$('[data-tx-lang]')?.value || 'fra'});
                        F.forEach(([k]) => { const i = dg.querySelector(`[data-ap2-sum="${k}"]`); if (r[k]) { i.value = r[k]; i.classList.add('is-ai'); } });
                        ai = {model: r.model || ''};
                        dg.querySelector('[data-ap2-summsg]').innerHTML = `<div class="ui-notice ui-notice-info" role="status"><span class="ui-notice-ico" aria-hidden="true">🤖</span><span>${esc(i18n('Proposé par l’IA de cet ordinateur : relis et corrige, puis « Garder ».'))}</span></div>`;
                    } catch (err) { dg.querySelector('[data-ap2-summsg]').innerHTML = `<div class="ui-notice ui-notice-error" role="alert"><span class="ui-notice-ico" aria-hidden="true">⛔</span><span>${esc(err.message)}</span></div>`; }
                    finally { if (b.isConnected) { b.disabled = false; b.innerHTML = old; } }
                });
            },
            onSubmit: f => {
                const next = {}; F.forEach(([k]) => { const v = f.querySelector(`[data-ap2-sum="${k}"]`).value.trim(); if (v) next[k] = v.slice(0, 240); });
                const was = plug.t.data.summary ? {...plug.t.data.summary} : null;
                if (Object.keys(next).length) plug.t.data.summary = {...next, from: ai ? 'ai' : 'hand', ok: true, ...(ai?.model ? {model: ai.model} : {})}; else delete plug.t.data.summary;
                plug.touch(); paintSum(plug);
                A().undoToast?.(Object.keys(next).length ? i18n('Résumé gardé avec l’acte') : i18n('Résumé retiré'), {icon: '🧾', undo: () => { if (was) plug.t.data.summary = was; else delete plug.t.data.summary; plug.touch(); paintSum(plug); }});
                return true;
            }});
    }
    function paintSum(plug) {
        const el = plug._ap2.sum, s = plug.t.data.summary; if (!el) return;
        const lines = D().summaryLines(s); el.hidden = !lines.length;
        el.innerHTML = lines.length ? `<button type="button" class="ap2-sumchip" data-ap2-sumopen title="${esc(i18n('Résumé de l’acte (Édition → Résumé)'))}">🧾 <span data-i18n-off>${esc([s.who, s.what, [s.when, s.where].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</span>${s.from === 'ai' ? ` <small>🤖 ${esc(i18n('relu'))}</small>` : ''}</button>` : '';
    }

    /* ═════════ 👥 Seconde lecture ═════════ */
    const dlText = (text, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'})); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
    async function openSecond(plug) {
        if (!plug.t.id) { await plug.save(); if (!plug.t.id) return; }
        const $ = plug.$, title = $('[data-tx="title"]')?.value || i18n('Acte'), n = Math.max(1, D().countLines(plug.area.value) || plug.area.value.split('\n').length);
        const readers = (lsJson(READERS_KEY, []) || []).filter(x => typeof x === 'string').slice(0, 30);
        const dg = ext.openDialog({eyebrow: i18n('À DEUX'), title: `👥 ${i18n('Seconde lecture')}`, wide: true, submitLabel: i18n('Garder et comparer'),
            body: `<p class="ui-hint">${esc(i18n('Une autre personne lit le même acte de son côté ; sa lecture est gardée à part (🕘 Versions), puis ⚖️ comparée mot à mot avec la tienne. Rien ne part sur Internet.'))}</p>
                <label class="ap2-f"><span>${esc(i18n('Nom du lecteur ou de la lectrice'))}</span><input data-ap2-reader maxlength="60" list="ap2-readers" placeholder="Anne DURAND" required data-i18n-off></label><datalist id="ap2-readers">${readers.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
                <label class="ap2-f is-col"><span>${esc(i18n('Sa lecture ({n} lignes dans l’acte)', {n}))}</span><textarea data-ap2-second rows="${Math.min(14, n + 1)}" spellcheck="false" placeholder="${esc(i18n('Une ligne de l’acte par ligne'))}"></textarea></label>
                <label class="ui-toggle"><input type="checkbox" data-ap2-hide checked><i></i>${esc(i18n('Cacher mon texte pendant la saisie (pour ne pas influencer)'))}</label>
                <div class="ap2-acts"><button type="button" class="button small secondary" data-ap2-pack>⤓ ${esc(i18n('Fiche vierge à donner (.txt)'))}</button><button type="button" class="button small secondary" data-ap2-load>📂 ${esc(i18n('Reprendre une fiche remplie…'))}</button><input type="file" accept=".txt,text/plain" data-ap2-file hidden></div>`,
            onOpen: d => {
                const hide = on2 => plug.dlg.classList.toggle('ap2-hide-text', on2); hide(true);
                d.addEventListener('close', () => hide(false));
                d.querySelector('[data-ap2-hide]').addEventListener('change', e => hide(e.target.checked));
                d.querySelector('[data-ap2-pack]').addEventListener('click', () => { const reader = d.querySelector('[data-ap2-reader]').value.trim(); dlText(D().packageText({title, source: $('[data-tx="source"]')?.value || '', date: $('[data-tx="date_text"]')?.value || '', place: $('[data-tx="place"]')?.value || '', lines: n, reader}), `${A().safeExportFilename ? A().safeExportFilename(title, 'acte') : 'acte'} - ${i18n('seconde lecture')}.txt`); });
                d.querySelector('[data-ap2-load]').addEventListener('click', () => d.querySelector('[data-ap2-file]').click());
                d.querySelector('[data-ap2-file]').addEventListener('change', async e => { const f = e.target.files?.[0]; if (!f) return; const r = D().parsePackage(await f.text()); d.querySelector('[data-ap2-second]').value = r.body; if (r.reader && !d.querySelector('[data-ap2-reader]').value.trim()) d.querySelector('[data-ap2-reader]').value = r.reader; e.target.value = ''; });
                setTimeout(() => d.querySelector('[data-ap2-reader]')?.focus(), 30);
            },
            onSubmit: async f => {
                const name = f.querySelector('[data-ap2-reader]').value.trim(), raw = f.querySelector('[data-ap2-second]').value, body = D().parsePackage(raw).body || raw.trim();
                if (!name) return UI().fail ? UI().fail(f.querySelector('[data-ap2-reader]'), i18n('Écris le nom de la personne qui a lu.')) : false;
                if (!body.trim()) return UI().fail ? UI().fail(f.querySelector('[data-ap2-second]'), i18n('Écris ou reprends sa lecture.')) : false;
                const r = await A().api('save_act_transcription_version', {}, {method: 'POST', body: {act_id: plug.t.id, label: i18n('👥 Lecture de {name}', {name}), body, data: {zones: [], people: [], meta: {from: i18n('Seconde lecture')}}, auto: 0, source: D().readerSource(name)}});
                lsSet(READERS_KEY, JSON.stringify([name, ...readers.filter(x => x !== name)].slice(0, 30)));
                const vid = Number(r?.result?.id ?? r?.id ?? 0); plug.versionsSoon?.();
                A().toast(i18n('Lecture de {name} gardée : comparaison mot à mot', {name}));
                setTimeout(() => plug.openCompare?.(vid ? [vid] : null, 'word'), 60);
                return true;
            }});
        return dg;
    }

    /* ═════════ 📋 Relevé pour l'indexation collective ═════════ */
    async function openReleve(plug) {
        if (plug.isDirty() || !plug.t.id) { await plug.save(); if (!plug.t.id) return; }
        let scope = plug.reg?.register || plug.t.data.reg?.register ? 'register' : 'act', priv = false;
        const seg = () => (UI().segmented ? UI().segmented({label: i18n('Quels actes'), items: [['act', i18n('Cet acte')], ['register', i18n('Ce registre')], ['all', i18n('Tous les actes')]].map(([k, l]) => ({on: k === scope, attrs: `data-ap2-scope="${k}"`, html: esc(l)}))}) : '');
        const fetchRows = () => get({op: 'releve', scope, act_id: plug.t.id, private: priv ? 1 : 0});
        ext.openDialog({eyebrow: i18n('ENTRAIDE'), title: `📋 ${i18n('Relevé pour l’entraide')}`, submitLabel: i18n('Exporter…'),
            body: `<p class="ui-hint">${esc(i18n('Le tableau des relevés des cercles généalogiques : date, type d’acte, nom, prénom, père, mère, parrain, marraine, témoins, lieu, cote, vue — d’après ce que l’app a trouvé dans l’acte et ce que tu as corrigé (le gabarit).'))}</p>
                <div data-ap2-seg>${seg()}</div>
                <label class="ui-toggle"><input type="checkbox" data-ap2-priv><i></i>${esc(i18n('Garder aussi les personnes vivantes ou confidentielles et les naissances ou mariages de moins de 75 ans (déconseillé pour un relevé partagé)'))}</label>
                <p class="ap2-count" data-ap2-count role="status">…</p>`,
            onOpen: dg => {
                const count = async () => { const el = dg.querySelector('[data-ap2-count]'); el.textContent = '…'; try { const r = await fetchRows(); const h = r.hidden || {};
                    el.textContent = [A().plural ? A().plural(r.rows.length, 'ligne') : String(r.rows.length), h.private ? i18n('{n} laissés de côté : personnes vivantes ou confidentielles', {n: h.private}) : '', h.recent ? i18n('{n} laissés de côté : moins de 75 ans', {n: h.recent}) : ''].filter(Boolean).join(' · '); } catch (e) { el.textContent = e.message; } };
                dg.addEventListener('click', e => { const b = e.target.closest('[data-ap2-scope]'); if (!b) return; scope = b.dataset.ap2Scope; UI().segPick?.(b); count(); });
                dg.querySelector('[data-ap2-priv]').addEventListener('change', e => { priv = e.target.checked; count(); });
                count();
            },
            onSubmit: () => {
                const title = i18n('Relevé pour l’entraide');
                setTimeout(() => UI().exportRows?.({title, name: `${title} - ${plug.t.data.reg?.register || plug.$('[data-tx="title"]')?.value || ''}`.trim(), info: priv ? i18n('Avec les personnes vivantes ou confidentielles (ton choix).') : i18n('Sans les personnes vivantes ou confidentielles.'),
                    rows: async () => { const r = await fetchRows(); return [r.columns.map(c => c[1]), ...r.rows.map(x => r.columns.map(c => x[c[0]] ?? ''))]; }}), 30);
                return true;
            }});
    }

    /* ═════════ 🎯 Le petit objectif du jour ═════════ */
    const goalGet = () => D().cleanGoal(lsJson(GOAL_KEY, D().GOAL_DEFAULT));
    function openGoal(plug) {
        const g = goalGet(), reg = plug.t.data.reg?.register || plug.reg?.title || '';
        let unit = g.unit;
        ext.openDialog({eyebrow: i18n('PETITES SÉANCES'), title: `🎯 ${i18n('Petit objectif du jour')}`, submitLabel: i18n('Garder'),
            body: `<label class="ui-toggle"><input type="checkbox" data-ap2-gon ${g.on ? 'checked' : ''}><i></i>${esc(i18n('Un petit objectif chaque jour'))}</label>
                <div class="ap2-goal-row"><input type="number" min="1" max="50" value="${g.n}" data-ap2-gn aria-label="${esc(i18n('Combien'))}">
                ${UI().segmented ? UI().segmented({label: i18n('Quoi'), items: [['line', i18n('ligne(s)')], ['act', i18n('acte(s) relu(s) ou fini(s)')]].map(([k, l]) => ({on: k === unit, attrs: `data-ap2-unit="${k}"`, html: esc(l)}))}) : ''} <span>${esc(i18n('par jour'))}</span></div>
                <label class="ap2-f"><span>${esc(i18n('Sur quelle pile ?'))}</span><select data-ap2-gpile><option value="todo">${esc(i18n('Tous mes actes à faire ou en cours'))}</option>${reg ? `<option value="register" ${g.pile === 'register' ? 'selected' : ''}>${esc(i18n('Ce registre : {r}', {r: reg}))}</option>` : ''}</select></label>
                <p class="ui-hint">${esc(i18n('Le rappel est doux et seulement ici, dans l’Atelier : aucune notification hors de l’app. Éteint au départ.'))}</p>`,
            onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-ap2-unit]'); if (b) { unit = b.dataset.ap2Unit; UI().segPick?.(b); } }),
            onSubmit: f => {
                const before = lsJson(GOAL_KEY, null), pile = f.querySelector('[data-ap2-gpile]').value;
                const next = D().cleanGoal({on: f.querySelector('[data-ap2-gon]').checked, unit, n: f.querySelector('[data-ap2-gn]').value, pile, register: pile === 'register' ? reg : ''});
                lsSet(GOAL_KEY, JSON.stringify(next)); plugs.forEach(p => goalRefresh(p));
                A().undoToast?.(next.on ? i18n('Petit objectif du jour gardé') : i18n('Petit objectif du jour éteint'), {icon: '🎯', undo: () => { if (before) lsSet(GOAL_KEY, JSON.stringify(before)); else { try { localStorage.removeItem(GOAL_KEY); } catch (_) {} } plugs.forEach(p => goalRefresh(p)); }});
                return true;
            }});
    }
    /** ce qui a été fait aujourd'hui dans cet acte (lignes ajoutées depuis l'ouverture, acte relu ou fini) → le journal */
    function goalTrack(plug) {
        const st = plug._ap2, G = st.goal; if (!G) return;
        const key = String(plug.t.id || G.key), day = D().dayKey(), log = lsJson(LOG_KEY, {}) || {}, d = log[day] || (log[day] = {l: {}, a: []});
        const added = Math.max(0, D().countLines(plug.area.value) - G.base), lines = G.before + added;
        let ch = false;
        if ((d.l[key] || 0) !== lines && (added > 0 || d.l[key])) { if (key !== G.key && d.l[G.key] != null) delete d.l[G.key]; d.l[key] = lines; ch = true; }
        const s = plug.t.data.status; if (['checked', 'done'].includes(s) && !['checked', 'done'].includes(G.status0) && plug.t.id && !d.a.includes(plug.t.id)) { d.a.push(plug.t.id); ch = true; }
        if (ch) { lsSet(LOG_KEY, JSON.stringify(D().trimLog(log))); paintGoal(plug); }
    }
    async function goalRefresh(plug) {
        const st = plug._ap2, g = goalGet();
        if (!g.on) { st.pile = null; paintGoal(plug); return; }
        try { st.pile = await get({op: 'pile', pile: g.pile, act_id: plug.t.id || 0, register: g.register || ''}); } catch (_) { st.pile = null; }
        paintGoal(plug);
        const day = D().dayKey(), s = D().goalStatus(g, lsJson(LOG_KEY, {}), day);
        if (!s.reached && ls(RAPPEL_KEY) !== day) { lsSet(RAPPEL_KEY, day); A().toast(i18n('🎯 Petit objectif du jour : {n} {u}. Bon courage !', {n: s.target, u: s.unit === 'act' ? i18n('acte(s)') : i18n('ligne(s)')})); }
    }
    function paintGoal(plug) {
        const st = plug._ap2, el = st.goalEl, g = goalGet(); if (!el) return;
        el.hidden = !g.on; plug.dlg.dataset.ap2Goal = g.on ? '1' : ''; if (!g.on) { el.innerHTML = ''; return; }
        const s = D().goalStatus(g, lsJson(LOG_KEY, {})), P2 = st.pile;
        el.classList.toggle('is-done', s.reached); plug.dlg.dataset.ap2GoalDone = s.reached ? '1' : '';
        el.innerHTML = `<button type="button" class="ap2-goalchip" data-ap2-goalopen title="${esc(i18n('Petit objectif du jour (Outils)'))}">${s.reached ? '✓' : '🎯'} ${esc(i18n('Aujourd’hui : {d} / {n} {u}', {d: Math.min(s.done, 999), n: s.target, u: s.unit === 'act' ? i18n('acte(s)') : i18n('ligne(s)')}))}${s.reached ? ` · ${esc(i18n('bravo !'))}` : ''}</button>
            ${P2 ? `<span class="ap2-pile">${esc(i18n('{n} à faire dans la pile', {n: P2.left}))}</span>${P2.next_id ? `<button type="button" class="link-button" data-ap2-pilenext>▶ ${esc(i18n('Acte suivant de la pile'))}</button>` : ''}` : ''}`;
    }

    /* ═════════ l'Atelier ═════════ */
    function init(plug) {
        const {dlg, area, $} = plug, editor = $('[data-tx-editor]'); if (!editor || !area) return;
        plugs.add(plug);
        const st = plug._ap2 = {say: null, scribe: null, goal: {key: `n${Date.now().toString(36)}`, base: D().countLines(area.value), before: 0, status0: plug.t.data.status}};
        st.goal.before = Number(((lsJson(LOG_KEY, {}) || {})[D().dayKey()]?.l || {})[String(plug.t.id || '')] || 0);
        const row = document.createElement('div'); row.className = 'ap2-row'; row.dataset.ap2Row = '';
        row.innerHTML = '<div class="ap2-goal" data-ap2-goal hidden></div><div class="ap2-sum" data-ap2-sumbox hidden></div><div class="ap2-say" data-ap2-saybar hidden role="group"></div>';
        editor.before(row);
        st.goalEl = row.querySelector('[data-ap2-goal]'); st.sum = row.querySelector('[data-ap2-sumbox]'); st.sayBar = row.querySelector('[data-ap2-saybar]');
        const hes = st.hes = document.createElement('div'); hes.className = 'ap2-hes'; hes.dataset.ap2Hes = ''; hes.hidden = true;
        setTimeout(() => { const h = editor.parentElement?.querySelector(':scope > .txh-hint'); (h || editor).after(hes); }, 0);
        row.addEventListener('click', e => {
            const b = e.target.closest('[data-ap2-say]');
            if (b) { const R = st.say; if (!R) return; const k = b.dataset.ap2Say;
                if (k === 'stop') return sayStop(plug);
                if (k === 'pause') { if (R.paused) speakAt(plug, R.i); else { R.paused = true; window.speechSynthesis?.cancel(); paintSay(plug); } return; }
                return speakAt(plug, Math.max(0, R.i + (k === 'next' ? 1 : -1))); }
            if (e.target.closest('[data-ap2-sumopen]')) return openSummary(plug);
            if (e.target.closest('[data-ap2-goalopen]')) return openGoal(plug);
            if (e.target.closest('[data-ap2-pilenext]') && st.pile?.next_id) return plug.switchTo({id: st.pile.next_id});
        });
        row.addEventListener('input', e => { if (e.target.matches('[data-ap2-rate]')) lsSet(P.vitesse, e.target.value); });
        row.addEventListener('change', e => { if (e.target.matches('[data-ap2-rate]') && st.say && !st.say.paused) speakAt(plug, st.say.i); });
        let hT = 0; const soon = () => { clearTimeout(hT); hT = setTimeout(() => paintHesitate(plug), 220); };
        ['keyup', 'mouseup', 'select'].forEach(ev => area.addEventListener(ev, soon));
        // 📚 registre entier : « Acte suivant » / « Vue suivante » reprennent aussi les réglages « Mieux voir » (sans l'inclinaison, propre à chaque vue)
        const sw = plug.switchTo;
        plug.switchTo = next => { if (next?.atelierNext && on('vue')) { const v = {...(plug.t.data.view || {})}; delete v.tilt; next = {...next, atelierNext: {...next.atelierNext, view: v}}; } sayStop(plug); return sw(next); };
        plug.plus2 = {say: () => (st.say ? sayStop(plug) : sayStart(plug)), saying: () => !!st.say, summary: () => openSummary(plug), second: () => openSecond(plug), releve: () => openReleve(plug), goal: () => openGoal(plug),
            scribe: () => plug.aides?.openSec?.('scribe'), crop: () => startCrop(plug), hover: text => hover(text, {lang: $('[data-tx-lang]')?.value || ''}), units: () => unitsOf(plug)};
        paintSum(plug);
        const iv = setInterval(() => { if (!dlg.isConnected) return; goalTrack(plug); }, 1500);
        goalRefresh(plug);
        new MutationObserver((_, o) => { if (!dlg.isConnected) { clearInterval(iv); if (st.say) { st.say = null; try { window.speechSynthesis?.cancel(); } catch (_) {} } plugs.delete(plug); o.disconnect(); } }).observe(document.body, {childList: true});
    }

    /* ─── les sections du panneau 🧰 (heritage-atelier-aides.js : ext.txAidesMore) ─── */
    ext.txAidesMore = ext.txAidesMore || [];
    ext.txAidesMore.push({id: 'scribe', icon: '✍️', title: () => i18n('Ce scribe : lettres et habitudes'), paint: paintScribe},
        {id: 'mots', icon: '📖', title: () => i18n('Mots d’autrefois'), paint: paintMots},
        {id: 'latin', icon: '🏛', title: () => i18n('Latin des registres'), paint: paintLatin},
        {id: 'units', icon: '💰', title: () => i18n('Montants et mesures de cet acte'), paint: paintUnits});
    ext.txPlugins = ext.txPlugins || []; ext.txPlugins.push(init);
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => {
        const X = plug.plus2; if (!X) return [];
        if (menu === 'Fichier') return [{icon: '👥', label: `${i18n('Seconde lecture (un autre lecteur)')}…`, run: X.second}, {icon: '📋', label: `${i18n('Relevé pour l’entraide (CSV)')}…`, run: X.releve}];
        if (menu === 'Édition') return [{icon: '🧾', label: `${i18n('Résumé : qui, quoi, quand, où')}…`, run: X.summary}];
        if (menu === 'Outils') return [{icon: '🔊', label: X.saying() ? i18n('Arrêter la lecture à voix haute') : i18n('Lire à voix haute'), run: X.say}, {icon: '✍️', label: `${i18n('Lettres de ce scribe')}…`, run: X.scribe}, {icon: '🎯', label: `${i18n('Petit objectif du jour')}…`, run: X.goal}];
        return [];
    });
})();
