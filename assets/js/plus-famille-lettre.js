/**
 * 💌 Lettre de famille (écran 9 de docs/design/successoral-et-plus.html ; serveur : lib/plus_famille.php, op letter_data…).
 *  - ✨ Trésors → 🎨 Créer et fabriquer → « 💌 Lettre de famille », juste à côté de « 📰 La gazette de l’année » : le mois,
 *    ce qu'on y met (anniversaires du mois, dernières découvertes, une photo, un ancêtre à l'honneur), la photo (fenêtre
 *    unique des images) et l'ancêtre (menu de choix) ; tout le texte se retouche sur place ; 🖨 Imprimer / ⤓ PDF (L1),
 *    ✉️ Courriel prêt (mailto), 📁 Ranger une copie dans les médias, 📝 Retoucher (traitement de texte), 💾 Garder.
 *  - Listes → ✨ Trésors de famille → « 💌 Lettres de famille » (à côté de « 📰 Gazettes ») : les lettres gardées (H10).
 *  - Traitement de texte → 📋 Partir d'un modèle → « 💌 Lettre à la famille » : le même moteur remplit le modèle.
 * Vivants : seulement le prénom et l'âge ; fiches confidentielles : jamais (règle de l'export « Pour partager », serveur).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const api = (...a) => A().api(...a);
    const write = async (op, body = {}) => api('pfam_write', {}, {method: 'POST', body: {op, ...body}});
    const RO = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const LNG = () => window.LCNDA_I18N?.lang || 'fr';
    const monthName = m => (LNG() !== 'fr' && window.LCNDA_I18N?.fmtDate ? window.LCNDA_I18N.fmtDate(new Date(2000, m - 1, 1), {month: 'long'}) : MONTHS[m - 1]);
    const SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const dayMonth = (m, d) => (LNG() !== 'fr' && window.LCNDA_I18N?.fmtDate ? window.LCNDA_I18N.fmtDate(new Date(2000, m - 1, d), {day: 'numeric', month: 'short'}) : `${d === 1 ? '1er' : d} ${SHORT[m - 1]}`);
    const ucfirst = s => s.charAt(0).toUpperCase() + s.slice(1);
    const thisMonth = () => new Date().toISOString().slice(0, 7);
    const SECTIONS = [['birthdays', '🎂', 'Les anniversaires du mois'], ['discoveries', '🔎', 'Les dernières découvertes'], ['photo', '📷', 'Une photo'], ['ancestor', '⭐', 'L’ancêtre à l’honneur']];
    const firstSentences = (text, n = 2) => { const t = String(text || '').split(/\n\s*Notes :\n/)[0].replace(/\[\d+(?:,\d+)*\]/g, '').replace(/\s+/g, ' ').trim(); const parts = t.match(/[^.!?]+[.!?]+/g) || (t ? [t] : []); return parts.slice(0, n).join(' ').trim(); };

    /* ═════════ le moteur : de ce que dit le serveur aux morceaux de la lettre (même moteur pour le modèle du traitement de texte) ═════════ */
    async function load(month, {ancestor = 0} = {}) {
        const d = await api('pfam', {op: 'letter_data', month});
        const aid = Number(ancestor) || d.ancestor?.id || 0;
        let anc = d.ancestor && d.ancestor.id === aid ? d.ancestor : null;
        if (aid && !anc) { try { const r = await api('textdoc_people', {ids: String(aid)}); const p = r.people?.[aid]; if (p) anc = {id: aid, name: p.name, years: [p.by, p.dy].filter(Boolean).join('-')}; } catch (_) {} }
        if (anc) { try { anc.bio = firstSentences((await api('biography', {id: anc.id})).text || ''); } catch (_) { anc.bio = ''; } }
        return {...d, ancestor: anc};
    }
    /** les morceaux : {title, sub, intro, birthdays: [texte], discoveries: [texte], photo: {src, caption} | null, ancestor: {title, text} | null} */
    function parts(d, o = {}) {
        const [Y, M] = d.month.split('-').map(Number);
        const fam = d.family || '';
        const bd = (d.birthdays || []).map(b => {
            const day = dayMonth(M, b.day);
            if (b.kind === 'living') return i18n('{day} : {first}, {age}', {day, first: b.first, age: plural(b.age, 'an', 'ans')});
            if (b.kind === 'wedding') return i18n('{day} : il y a {n} ans, {a} et {b} se mariaient', {day, n: String(b.years), a: b.names[0], b: b.names[1]});
            return i18n('{day} : il y a {n} ans naissait {name}', {day, n: String(b.years), name: b.first || b.name});
        });
        const disc = [];
        const pp = d.discoveries?.people || [];
        if (pp.length) disc.push(i18n('{what} dans l’arbre : {list}', {what: plural(d.discoveries.people_count, 'nouvelle fiche', 'nouvelles fiches'), list: pp.slice(0, 8).map(p => p.name).join(', ') + (d.discoveries.people_count > 8 ? '…' : '')}));
        (d.discoveries?.media || []).slice(0, 6).forEach(m => disc.push(i18n('Nouveau dans les médias : « {title} »', {title: m.title || i18n('sans titre')})));
        const ph = o.photo === undefined ? (d.photos || [])[0] || null : o.photo;
        return {title: o.title || i18n('La lettre des {nm}', {nm: fam || i18n('nôtres')}), sub: `${ucfirst(monthName(M))} ${Y} · ${i18n('n° {n}', {n: String(o.number || d.number || 1)})}`,
            intro: o.intro ?? i18n('Bonjour à tous ! Voici les nouvelles de la famille ce mois-ci.'),
            birthdays: bd, discoveries: disc,
            photo: ph ? {src: `media/${encodeURIComponent(ph.filename)}`, caption: i18n('Photo : {title}', {title: ph.title || i18n('sans titre')}), id: ph.id} : null,
            ancestor: d.ancestor ? {title: `${d.ancestor.name}${d.ancestor.years ? ` (${d.ancestor.years})` : ''}`, text: d.ancestor.bio || '', id: d.ancestor.id} : null};
    }
    /** la lettre en HTML (aperçu, impression, médias) ; show : les parties gardées ; editable : on écrit dedans */
    function letterHtml(p, show = {}, {editable = false} = {}) {
        const on = k => show[k] !== false, ce = editable ? ' contenteditable="true" spellcheck="true"' : '';
        const list = (items, none) => items.length ? `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="pf-lt-none">${esc(none)}</p>`;
        return `<article class="pf-lt"><header><h1${ce} data-pf-lt="title">${esc(p.title)}</h1><p class="pf-lt-sub">${esc(p.sub)}</p></header>
            <p class="pf-lt-intro"${ce} data-pf-lt="intro">${esc(p.intro)}</p>
            ${on('photo') && p.photo ? `<figure class="pf-lt-photo"><img src="${esc(p.photo.src)}" alt=""><figcaption${ce}>${esc(p.photo.caption)}</figcaption></figure>` : ''}
            ${on('birthdays') ? `<section${ce}><h2>🎂 ${esc(i18n('Les anniversaires du mois'))}</h2>${list(p.birthdays, i18n('Pas d’anniversaire ce mois-ci.'))}</section>` : ''}
            ${on('discoveries') ? `<section${ce}><h2>🔎 ${esc(i18n('Les dernières découvertes'))}</h2>${list(p.discoveries, i18n('Rien de nouveau ce mois-ci : à vous de m’envoyer vos souvenirs !'))}</section>` : ''}
            ${on('ancestor') && p.ancestor ? `<section${ce}><h2>⭐ ${esc(i18n('L’ancêtre à l’honneur'))}</h2><p><b>${esc(p.ancestor.title)}</b>${p.ancestor.text ? ` — ${esc(p.ancestor.text)}` : ''}</p></section>` : ''}
            <footer${ce} data-pf-lt="sign">${esc(i18n('Avec toute mon affection,'))}</footer></article>`;
    }
    const LT_CSS = `.pf-lt{max-width:180mm;margin:6mm auto;padding:10mm 12mm;background:#fffdf8;color:#1d1a14;font-family:Georgia,"Times New Roman",serif;line-height:1.5;border:1px solid #e6dcc8}
        .pf-lt header{text-align:center;border-bottom:2px solid #8a5a2b;margin-bottom:5mm}.pf-lt h1{font-size:24pt;margin:0;color:#8a5a2b}.pf-lt-sub{margin:1mm 0 3mm;font-size:10pt;letter-spacing:.06em;text-transform:uppercase;color:#6b5a44}
        .pf-lt h2{font-size:13pt;color:#8a5a2b;margin:5mm 0 2mm;border-bottom:1px solid #e6dcc8}.pf-lt ul{margin:0;padding-left:5mm}.pf-lt li{margin:0 0 1.5mm}
        .pf-lt-photo{margin:4mm 0;text-align:center}.pf-lt-photo img{max-width:100%;max-height:90mm;border:4px solid #fff;box-shadow:0 1px 4px #0003}.pf-lt-photo figcaption{font-size:9.5pt;font-style:italic;color:#6b5a44}
        .pf-lt-none{color:#6b5a44;font-style:italic}.pf-lt footer{margin-top:6mm;text-align:right;font-style:italic}.pf-lt section{break-inside:avoid}`;
    /** le texte simple (courriel prêt) */
    function letterText(el) {
        const out = []; el.querySelectorAll('h1, .pf-lt-sub, .pf-lt-intro, h2, li, p, figcaption, footer').forEach(n => { if (n.closest('li') && n.tagName !== 'LI') return; const t = n.innerText.trim(); if (!t) return; out.push(n.tagName === 'LI' ? `• ${t}` : n.tagName === 'H2' ? `\n${t}` : t); });
        return [...new Set(out)].join('\n');
    }

    /* ═════════ ✨ Trésors → « 💌 Lettre de famille » ═════════ */
    async function render(host, T) {
        const pend = ext.familyLetter.pending; ext.familyLetter.pending = null;
        let saved = null; if (pend) { try { saved = (await api('pfam', {op: 'letter', id: pend})).letter; } catch (e) { T.toast(e.message, 'error'); } }
        const st = {id: saved?.id || 0, month: saved?.month || thisMonth(), show: {birthdays: true, discoveries: true, photo: true, ancestor: true, ...(saved?.options || {})}, photo: undefined, ancestor: saved?.ancestor_id || 0, title: saved?.title || '', number: saved?.number || 0, edited: saved?.body_html || ''};
        host.innerHTML = `<div class="pf-lt-tools h-tr-noprint"><div class="h-tr-row">
                <label>${esc(i18n('Le mois'))}<input type="month" name="pf_month" value="${esc(st.month)}"></label>
                <label>${esc(i18n('Le titre'))}<input name="pf_title" maxlength="80" placeholder="${esc(i18n('La lettre des {nm}', {nm: '…'}))}"></label>
                <label>${esc(i18n('Le numéro'))}<input type="number" name="pf_number" min="1" max="9999" style="width:5em"></label></div>
            <fieldset class="pf-lt-what"><legend>${esc(i18n('Ce qu’on y met'))}</legend>${SECTIONS.map(([k, ic, l]) => `<label class="checkbox-line"><input type="checkbox" data-pf-show="${k}" ${st.show[k] !== false ? 'checked' : ''}> ${ic} ${esc(i18n(l))}</label>`).join('')}</fieldset>
            <div class="h-tr-row pf-lt-pick"><div><span class="pk-lab">${esc(i18n('La photo'))}</span><span data-pf-photo-chip></span> <button type="button" class="button small secondary" data-pf-photo>${esc(i18n('🖼 Changer'))}</button></div>
                <div class="pf-lt-anc"><span class="pk-lab">${esc(i18n('L’ancêtre à l’honneur'))}</span><div data-pf-anc></div></div></div>
            <p class="ui-hint">${esc(i18n('Tout se retouche dans la lettre (clique sur un texte). Les personnes vivantes n’y figurent que par leur prénom et leur âge ; les fiches confidentielles jamais.'))}</p></div>
            <style>${LT_CSS}</style><div class="pf-lt-out" data-pf-out>${UI().spinner ? UI().spinner(i18n('Je remplis la lettre…')) : ''}</div>`;
        const $ = s => host.querySelector(s), out = $('[data-pf-out]');
        let data = null, cur = null;
        const P = window.LCNDA_PICKER;
        $('[data-pf-anc]').innerHTML = P ? P.pickerField({name: 'pf_anc', kind: 'person', animals: false, allowCreate: false}) : '';
        const photoChip = () => { const ph = cur?.photo; $('[data-pf-photo-chip]').innerHTML = ph ? `<span class="pf-lt-chip"><img src="${esc(ph.src)}" alt=""> ${esc(ph.caption)} <button type="button" class="icon-button small" data-pf-photo-x title="${esc(i18n('Sans photo'))}">×</button></span>` : `<small class="muted">${esc(i18n('aucune'))}</small>`; };
        const draw = (keepEdits = false) => {
            cur = parts(data, {photo: st.photo, title: $('[name=pf_title]').value.trim(), number: Number($('[name=pf_number]').value) || 0});
            if (keepEdits && st.edited) out.innerHTML = st.edited; else { out.innerHTML = letterHtml(cur, st.show, {editable: !RO()}); st.edited = ''; }
            photoChip();
        };
        async function refill() {
            out.innerHTML = UI().spinner ? UI().spinner(i18n('Je remplis la lettre…')) : '';
            try { data = await load(st.month, {ancestor: st.ancestor}); } catch (e) { out.innerHTML = A().empty(e.message, {icon: '⛔'}); return; }
            if (!$('[name=pf_number]').value) $('[name=pf_number]').value = String(st.number || data.number);
            $('[name=pf_title]').placeholder = i18n('La lettre des {nm}', {nm: data.family || i18n('nôtres')});
            if (st.title && !$('[name=pf_title]').value) $('[name=pf_title]').value = st.title;
            if (data.ancestor && P?.pickerSet) P.pickerSet($('[data-pf-anc] .pk'), {id: data.ancestor.id, title: data.ancestor.name});
            draw(!!st.edited);
        }
        // une retouche à la main est gardée ; un changement de réglage refait la lettre, avec « ↶ Annuler » pour la retouche perdue
        const redo = () => { const before = out.innerHTML, wasEdited = !!st.edited; draw(); if (wasEdited) A().undoToast?.(i18n('Lettre refaite avec les nouveaux choix'), {undo: () => { out.innerHTML = before; st.edited = before; }}); };
        out.addEventListener('input', () => { st.edited = out.innerHTML; });
        $('.pf-lt-what').addEventListener('change', e => { const k = e.target.dataset.pfShow; if (!k) return; st.show[k] = e.target.checked; redo(); });
        $('[name=pf_month]').addEventListener('change', e => { st.month = /^\d{4}-\d{2}$/.test(e.target.value) ? e.target.value : thisMonth(); st.photo = undefined; st.edited = ''; refill(); });
        $('[name=pf_title]').addEventListener('change', redo); $('[name=pf_number]').addEventListener('change', redo);
        $('[data-pf-anc]').addEventListener('picker-change', e => { const it = e.detail?.item; st.ancestor = it && !it.free ? Number(it.id) || 0 : 0; st.edited = ''; refill(); });
        host.addEventListener('click', async e => {
            if (e.target.closest('[data-pf-photo-x]')) { st.photo = null; redo(); return; }
            if (e.target.closest('[data-pf-photo]')) { const m = await ext.pickImage?.({eyebrow: i18n('LETTRE DE FAMILLE'), title: i18n('La photo de la lettre')}); if (m) { st.photo = {id: Number(m.id), filename: m.filename, title: m.title || ''}; redo(); } }
        });
        const title = () => out.querySelector('[data-pf-lt="title"]')?.textContent.trim() || cur?.title || i18n('Lettre de famille');
        const body = () => out.innerHTML;
        // les images de la lettre en data: (pour une image rangée dans les médias : une image SVG ne lit pas les fichiers du site)
        const inlined = async () => { const box = document.createElement('div'); box.innerHTML = body(); box.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
            for (const img of box.querySelectorAll('img')) { try { const b = await (await fetch(img.getAttribute('src'))).blob(); img.src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch (_) { img.remove(); } }
            return box.innerHTML.replace(/<br>/g, '<br/>').replace(/<img([^>]*?)\s*\/?>/g, '<img$1/>'); };
        const asSvg = async () => { const el = out.querySelector('.pf-lt'), w = 720, h = Math.ceil((el?.getBoundingClientRect().height || 1000) * w / (el?.getBoundingClientRect().width || w)) + 40;
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${LT_CSS}.pf-lt{margin:0 auto}</style>${await inlined()}</div></foreignObject></svg>`; };
        const print = () => ext.tresorPrint(title(), LT_CSS, body().replace(/ contenteditable="true"/g, ''));
        const keep = async () => {
            const r = await write('letter_save', {id: st.id, month: st.month, title: title(), number: Number($('[name=pf_number]').value) || 1, options: st.show, body_html: body().replace(/ contenteditable="true"| spellcheck="true"/g, ''), photo_media_id: cur?.photo?.id || 0, ancestor_id: st.ancestor || data?.ancestor?.id || 0});
            const wasNew = !st.id; st.id = r.id;
            A().undoToast?.(i18n('Lettre gardée : « {title} » (Listes → Lettres de famille)', {title: title()}), {undo: async () => { if (wasNew) { await write('letter_delete', {id: r.id}); st.id = 0; } else if (r.prev) await write('letter_save', r.prev); }});
        };
        const mail = () => { const el = out.querySelector('.pf-lt'); if (!el) return; const href = `mailto:?subject=${encodeURIComponent(title())}&body=${encodeURIComponent(letterText(el)).slice(0, 1800)}`; const a = document.createElement('a'); a.href = href; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
        const retouch = async () => { const tools = ext.textDocTools; if (!tools?.dataOf || !ext.openTextDoc) return T.toast(i18n('Le traitement de texte n’est pas chargé.'), 'error'); ext.openTextDoc({data: tools.dataOf(await wordHtml(cur, st.show)), name: title()}); };
        T.actions(host, {primary: RO() ? null : {label: i18n('💾 Garder'), attrs: 'data-pf-keep', title: i18n('Ranger la lettre dans Listes → Lettres de famille'), run: keep},
            exports: [{icon: '⤓', label: i18n('PDF'), help: i18n('par la fenêtre « Imprimer » (⤓ PDF)'), run: print}, {icon: '🖼', label: i18n('Image (PNG)'), name: () => `lettre-${st.month}.png`, media: true, make: async () => T.svgPng(await asSvg(), 1600)}],
            media: RO() ? null : {title, make: async () => ({blob: await T.svgPng(await asSvg(), 1600), name: `lettre-${st.month}.png`})},
            print: {attrs: 'data-pf-print', run: print},
            more: [{label: i18n('✉️ Courriel prêt'), attrs: 'data-pf-mail', title: i18n('Ouvre ta messagerie avec la lettre déjà écrite : rien n’est envoyé par l’app'), run: mail}, RO() ? null : {label: i18n('📝 Retoucher'), attrs: 'data-pf-retouch', title: i18n('Ouvrir la lettre dans le traitement de texte'), run: retouch}]});
        await refill();
    }
    /** le traitement de texte : la lettre en paragraphes du modèle (styles du traitement de texte) */
    async function wordHtml(p, show = {}) {
        const P_ = (t, stl = 'normal', css = '') => `<p data-st="${stl}"${css ? ` style="${css}"` : ''}>${t || '<br>'}</p>`, ph = t => `<span class="wp-ph">${esc(t)}</span>`, on = k => show[k] !== false;
        const out = [P_(esc(p.title), 'title'), P_(esc(p.sub), 'subtitle'), P_(`${ph(i18n('Ville'))}, ${esc(new Date().toLocaleDateString(window.LCNDA_I18N?.locale?.() || 'fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}))}`, 'normal', 'text-align:right'),
            P_(esc(i18n('Chers cousins, chères cousines,')), 'normal', 'margin-top:12pt'), P_(esc(p.intro))];
        if (on('photo') && p.photo) out.push(`<p data-st="normal" style="text-align:center"><img src="${esc(p.photo.src)}" alt="" style="max-width:100%;max-height:90mm"></p>`, P_(`<i>${esc(p.photo.caption)}</i>`, 'normal', 'text-align:center'));
        if (on('birthdays')) out.push(P_(`🎂 ${esc(i18n('Les anniversaires du mois'))}`, 'h1'), p.birthdays.length ? `<ul>${p.birthdays.map(b => `<li data-st="normal">${esc(b)}</li>`).join('')}</ul>` : P_(esc(i18n('Pas d’anniversaire ce mois-ci.'))));
        if (on('discoveries')) out.push(P_(`🔎 ${esc(i18n('Les dernières découvertes'))}`, 'h1'), p.discoveries.length ? `<ul>${p.discoveries.map(b => `<li data-st="normal">${esc(b)}</li>`).join('')}</ul>` : P_(ph(i18n('Ce que j’ai trouvé ce mois-ci…'))));
        if (on('ancestor') && p.ancestor) out.push(P_(`⭐ ${esc(i18n('L’ancêtre à l’honneur'))}`, 'h1'), P_(`<b>${esc(p.ancestor.title)}</b>${p.ancestor.text ? ` — ${esc(p.ancestor.text)}` : ''}`));
        out.push(P_(esc(i18n('Si vous avez des photos, des lettres ou des souvenirs, je serais très heureux de les voir !'))), P_(esc(i18n('Je vous embrasse,')), 'normal', 'margin-top:14pt'), P_(ph(i18n('Ton prénom')), 'signature'));
        return out.join('');
    }
    // juste à côté de la gazette (même partie « 🎨 Créer et fabriquer »)
    const FEATURE = {key: 'lettre-famille', group: 'creer', icon: '💌', title: 'Lettre de famille', desc: 'La lettre du mois remplie toute seule : anniversaires, dernières découvertes, une photo, un ancêtre à l’honneur. Tout se retouche.', render};
    const place = () => { if (F.some(f => f.key === FEATURE.key)) return; const i = F.findIndex(f => f.key === 'gazette'); F.splice(i < 0 ? F.length : i + 1, 0, FEATURE); };
    place(); document.addEventListener('DOMContentLoaded', place, {once: true});
    ext.familyLetter = {load, parts, letterHtml, wordHtml, LT_CSS, pending: null, open: id => { ext.familyLetter.pending = id || null; ext.tresors?.open?.('lettre-famille'); }};
    ext.tresorRelated = ext.tresorRelated || {};
    ext.tresorRelated['lettre-famille'] = [[i18n('📋 Voir dans Listes › Lettres de famille'), () => { A().state.listType = 'family_letters'; A().setModule('listes'); }]];

    /* ═════════ Traitement de texte → 📋 Partir d'un modèle → « 💌 Lettre à la famille » : rempli par le même moteur ═════════ */
    const patchTemplate = () => {
        const L = ext.textDocTools?.TEMPLATES; if (!L) return false;
        const t = L.find(x => x.key === 'famille'); if (!t || t._pf) return !!t;
        t._pf = true; t.hint = i18n('remplie toute seule : anniversaires du mois, découvertes, photo, ancêtre');
        const plain = t.html;
        t.html = async () => { try { const d = await load(thisMonth()); return wordHtml(parts(d), {}); } catch (_) { return plain(); } };
        return true;
    };
    const wait = setInterval(() => { if (patchTemplate()) clearInterval(wait); }, 300); setTimeout(() => clearInterval(wait), 60000);

    /* ═════════ Listes → ✨ Trésors de famille → « 💌 Lettres de famille » ═════════ */
    ext.lists.family_letters = async token => {
        const S = A().state, ok = () => token === S.workspaceToken && S.module === 'listes', ws = A().$('#workspace');
        let list = []; try { list = (await api('pfam', {op: 'letters'})).letters || []; } catch (e) { if (ok()) ws.innerHTML = `<section class="page">${A().empty(e.message, {icon: '⛔'})}</section>`; return; }
        if (!ok()) return;
        const head = UI().pageHeader({icon: '💌', title: i18n('Lettres de famille'), help: i18n('Les lettres du mois gardées depuis ✨ Trésors → « 💌 Lettre de famille ». À ne pas confondre avec les « ✉️ Lettres aux descendants », qui s’ouvrent plus tard.'),
            primary: RO() ? '' : `<button type="button" class="button" data-pf-lt-new>${esc(i18n('💌 Nouvelle lettre'))}</button>`});
        const L = ext.tresorListBar, H = ext.tresorListHelpers;
        if (!L || !H) { ws.innerHTML = `<section class="page">${head}${A().empty(i18n('La liste n’a pas pu se charger.'))}</section>`; return; }
        const label = m => { const [y, mo] = String(m).split('-').map(Number); return y ? `${ucfirst(monthName(mo))} ${y}` : m; };
        const years = [...new Set(list.map(x => x.month.slice(0, 4)))].sort().reverse();
        L({ws, head, cls: 'pf-lt-list', key: 'family_letters', items: list, noun: ['lettre'], fem: true, noneText: i18n('Aucune lettre ne correspond'),
            search: {placeholder: i18n('Chercher… (titre, mois)'), text: x => `${x.title} ${label(x.month)} ${x.month}`},
            filters: [{id: 'year', label: i18n('Année'), type: 'check', options: H.counted(list, years.map(y => [y, y]), (x, y) => x.month.startsWith(y)), test: (x, v) => v.some(y => x.month.startsWith(y))}],
            sorts: [['recent', i18n('Les plus récentes'), (a, b) => H.cmpTxt(b.month + b.id, a.month + a.id)], ['old', i18n('Les plus anciennes'), (a, b) => H.cmpTxt(a.month, b.month)], ['az', 'A → Z', (a, b) => H.cmpTxt(a.title, b.title)], ['za', 'Z → A', (a, b) => H.cmpTxt(b.title, a.title)]],
            cols: [{label: i18n('Lettre'), key: 'title', val: x => x.title, sort: ['az', 'za']}, {label: i18n('Mois'), key: 'month', val: x => x.month, sort: ['old', 'recent']}, {label: i18n('N°'), key: 'number', val: x => x.number, num: true}, {label: i18n('Gardée'), key: 'updated', val: x => x.updated_at}],
            row: x => `<tr><td><b>${esc(x.title)}</b></td><td>${esc(label(x.month))}</td><td>${x.number}</td><td>${UI().when ? UI().when(x.updated_at) : esc(x.updated_at)}</td><td class="pf-lt-acts"><button type="button" class="button small secondary" data-pf-lt-open="${x.id}">${esc(i18n('Ouvrir'))}</button>${RO() ? '' : `<button type="button" class="icon-button small" data-pf-lt-del="${x.id}" title="${esc(i18n('Supprimer la lettre'))}" aria-label="${esc(i18n('Supprimer'))}">🗑</button>`}</td></tr>`,
            empty: {icon: '💌', text: i18n('Aucune lettre gardée pour l’instant'), hint: i18n('Fais celle du mois dans ✨ Trésors → « 💌 Lettre de famille », puis « 💾 Garder ».'), action: RO() ? null : {label: i18n('💌 Faire la lettre du mois'), attrs: 'data-pf-lt-new'}}});
        ws.onclick = async e => {
            if (e.target.closest('[data-pf-lt-new]')) return ext.familyLetter.open(0);
            const o = e.target.closest('[data-pf-lt-open]'); if (o) return ext.familyLetter.open(Number(o.dataset.pfLtOpen));
            const d = e.target.closest('[data-pf-lt-del]'); if (!d) return;
            const id = Number(d.dataset.pfLtDel), x = list.find(l => l.id === id);
            try { await write('letter_delete', {id}); ext.lists.family_letters(++S.workspaceToken);
                A().undoToast?.(i18n('Lettre « {title} » supprimée', {title: x?.title || ''}), {undo: async () => { await write('letter_restore', {id}); if (S.listType === 'family_letters') ext.lists.family_letters(++S.workspaceToken); }}); }
            catch (err) { A().toast(err.message, 'error'); }
        };
    };
    const reg = () => { const app = A(); if (!app?.defaultListTypes) return false; if (!app.defaultListTypes.some(x => x[0] === 'family_letters')) { const i = app.defaultListTypes.findIndex(x => x[0] === 'gazettes'); app.defaultListTypes.splice(i < 0 ? app.defaultListTypes.length : i + 1, 0, ['family_letters', '37c1', '💌 Lettres de famille']); } return true; };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg, {once: true});
})();
