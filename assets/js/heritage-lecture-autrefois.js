/**
 * 📜 Aide à la lecture des actes anciens et 🪙 Convertisseur d'autrefois : les écrans.
 *  - LCNDA_EXT.readingAid.open({tab, q}) / .mount(élément, {tab, q}) : 🔍 Dictionnaire (latin, formules, abréviations, vieux mots),
 *    ✍️ Les lettres (dessinées en SVG), 🎓 Exercices (corrigés mot à mot). Données et calculs : app-aide-lecture.js.
 *  - LCNDA_EXT.autrefois.open({tab, value}) / .mount(élément, {tab, value}) : 💰 Argent (→ euros d'aujourd'hui, INSEE),
 *    📏 Mesures anciennes (variantes régionales), 📅 Calendrier républicain (dans les deux sens). Calculs : app-autrefois-engine.js.
 * Entrées : Transcription d'actes (« 📜 Aide à la lecture »), recherche rapide (⌘K), ⋯ de la fiche, Réglages → Glossaire et
 * Calendrier / mesures, Trésors, la date d'un acte en calendrier républicain (« 🪙 Convertir » sous le « ✓ Compris »).
 * Tout se fait dans le navigateur, sans requête ni écriture en base (lecture seule : aussi en mode consultation).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const L = () => window.LCNDA_AIDE_LECTURE;
    const F = () => window.LCNDA_AUTREFOIS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A().toast?.(...a);
    const nf = (n, d = 2) => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const store = {get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const badge = (t, k) => UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`;
    const emptyLine = (text, icon = '🔍') => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${icon}</span><span class="empty-line-text">${esc(text)}</span></p>`;
    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); toast('Copié.'); } catch (_) {
            const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
            try { document.execCommand('copy'); toast('Copié.'); } catch (__) { toast('Copie impossible ici.', 'error'); } t.remove();
        }
    }
    /** les lettres tapées surlignées (sans tenir compte des accents ni du ſ) */
    function mark(text, q) {
        const s = String(text ?? ''), f = L()?.fold || (x => x.toLowerCase()), qq = f(q).replace(/[.]/g, '');
        if (!qq) return esc(s);
        const map = []; let folded = '';
        for (let i = 0; i < s.length; i++) { const c = f(s[i]); for (let k = 0; k < c.length; k++) { folded += c[k]; map.push(i); } }
        const at = folded.indexOf(qq); if (at < 0) return esc(s);
        const a = map[at], b = (map[at + qq.length - 1] ?? s.length - 1) + 1;
        return `${esc(s.slice(0, a))}<mark>${esc(s.slice(a, b))}</mark>${esc(s.slice(b))}`;
    }
    const tabsHtml = (tabs, cur, attr) => `<div class="ui-tabs la-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" ${attr}="${k}" class="${k === cur ? 'is-active' : ''}" aria-selected="${k === cur}">${esc(l)}</button>`).join('')}</div>`;

    /* ═════════════════════════ 📜 Aide à la lecture ═════════════════════════ */
    const LA_TAB = 'lcnda-aide-lecture-tab', LA_BEST = 'lcnda-aide-lecture-scores';
    const LA_TABS = [['dict', '🔍 Dictionnaire'], ['lettres', '✍️ Les lettres'], ['exos', '🎓 Exercices']];
    const KIND_BADGE = {latin: 'blue', formule: 'green', abrev: 'yellow', mot: 'grey'};
    const LEVEL_BADGE = {facile: 'green', moyen: 'yellow', difficile: 'red'};
    function mountReading(host, {tab = '', q = ''} = {}) {
        if (!L()) { host.innerHTML = emptyLine('L’aide à la lecture n’a pas pu se charger (fichier app-aide-lecture.js manquant ?).', '⚠️'); return null; }
        const st = {tab: tab || (q ? 'dict' : store.get(LA_TAB, 'dict')), q: String(q || ''), kind: '', acte: '', shown: 60, exo: ''};
        if (!LA_TABS.some(([k]) => k === st.tab)) st.tab = 'dict';
        host.classList.add('la');
        host.innerHTML = `${tabsHtml(LA_TABS, st.tab, 'data-la-tab')}<div class="la-search" data-la-search></div><div class="la-filters" data-la-filters></div><div class="la-body" data-la-body aria-live="polite"></div>`;
        const $ = s => host.querySelector(s), body = $('[data-la-body]');
        const field = UI().searchField ? UI().searchField({placeholder: 'Chercher… ex. vve, feu, filius, ſ, cult., d°', value: st.q, label: 'Chercher dans l’aide à la lecture', delay: 120, onInput: v => { st.q = v; st.shown = 60; draw(); }}) : null;
        if (field) $('[data-la-search]').appendChild(field); else $('[data-la-search]').innerHTML = `<input type="search" data-la-q value="${esc(st.q)}" placeholder="Chercher…">`;
        $('[data-la-q]')?.addEventListener('input', e => { st.q = e.target.value; st.shown = 60; draw(); });
        function filters() {
            if (st.tab !== 'dict') { $('[data-la-filters]').innerHTML = ''; return; }
            const c = L().counts(st.q, st.acte), K = L().KINDS, AC = L().ACTES;
            const pill = (attr, v, label, n, cur) => `<button type="button" ${attr}="${v}" class="${cur === v ? 'is-active' : ''}">${esc(label)}${n == null ? '' : ` (${nf(n, 0)})`}</button>`;
            const nEntries = c.latin + c.formule + c.abrev + c.mot;
            $('[data-la-filters]').innerHTML = `<div class="ui-filters" role="group" aria-label="Sorte">${pill('data-la-kind', '', 'Tout', nEntries, st.kind)}${Object.entries(K).filter(([k]) => c[k] || st.kind === k).map(([k, l]) => pill('data-la-kind', k, l, c[k], st.kind)).join('')}</div>
                <div class="ui-filters la-actes" role="group" aria-label="Sorte d’acte">${pill('data-la-acte', '', 'Tous les actes', null, st.acte)}${['bapteme', 'mariage', 'sepulture', 'recensement'].map(k => pill('data-la-acte', k, AC[k], null, st.acte)).join('')}</div>`;
        }
        function drawDict() {
            const all = L().search(st.q, {kind: st.kind, acte: st.acte}).filter(r => r.type === 'entry'), rows = all.slice(0, st.shown);
            if (!all.length) { body.innerHTML = emptyLine(st.q ? `Rien pour « ${st.q} ». Vérifie l’orthographe, ou cherche un morceau du mot (« vv », « legit »…).` : 'Rien dans cette rubrique.'); return; }
            body.innerHTML = `<p class="la-count">${nf(all.length, 0)} ${all.length > 1 ? 'mots et formules' : 'mot'}</p><dl class="la-dict">${rows.map(({item: e}) => `<div class="la-row">
                <dt>${mark(e.t, st.q)}</dt><dd>${mark(e.d, st.q)}${e.ex ? `<small class="la-ex">${esc(e.ex)}</small>` : ''}</dd>
                <span class="la-row-tags">${badge(L().KINDS[e.k]?.replace(/^\S+\s/, '') || e.k, KIND_BADGE[e.k] || 'grey')}${e.a && e.a !== 'general' ? ` <small class="la-acte">${esc(L().ACTES[e.a] || '')}</small>` : ''}${e.src ? ` <small class="la-acte" title="Repris de ${esc(e.src)}">${esc(e.src)}</small>` : ''}</span>
                <button type="button" class="icon-button small la-copy" data-la-copy="${esc(`${e.t} : ${e.d}`)}" title="Copier" aria-label="Copier « ${esc(e.t)} »">📋</button></div>`).join('')}</dl>`;
            if (all.length > st.shown && UI().moreButton) body.appendChild(UI().moreButton({remaining: all.length - st.shown, step: 60, onClick: () => { st.shown += 60; drawDict(); }}));
        }
        function drawLetters() {
            const list = L().search(st.q, {kind: 'lettre'}).map(r => r.item);
            if (!list.length) { body.innerHTML = emptyLine(`Aucune lettre pour « ${st.q} ». Essaie « s long », « r rond », « u n », « ligature ».`); return; }
            body.innerHTML = `<p class="la-count">${nf(list.length, 0)} forme${list.length > 1 ? 's' : ''} de lettres · trait dessiné à la main, comme dans les registres</p><div class="la-letters">${list.map(l => `<article class="la-letter" data-la-letter="${esc(l.id)}">
                <div class="la-letter-draw"><figure>${L().glyphSvg(l.seen, {title: `${l.name} : se lit ${l.read}`})}<figcaption>on voit</figcaption></figure>${l.cmp.length ? `<figure class="is-cmp">${L().glyphSvg(l.cmp, {title: 'à ne pas confondre'})}<figcaption>à ne pas confondre</figcaption></figure>` : ''}</div>
                <h4>${mark(l.name, st.q)}</h4><p class="la-read">se lit <b>${esc(l.read)}</b></p><p class="la-note">${mark(l.note, st.q)}</p></article>`).join('')}</div>`;
        }
        function exoCard(x) {
            const best = store.get(LA_BEST, {})[x.id];
            return `<button type="button" class="la-exo-card" data-la-exo="${esc(x.id)}"><span class="la-exo-ico" aria-hidden="true">${x.icon}</span><span class="la-exo-txt"><b>${mark(x.title, st.q)}</b><small>${esc(x.tip)}</small></span>
                <span class="la-exo-tags">${badge(x.level, LEVEL_BADGE[x.level] || 'grey')}${best != null ? badge(`Meilleur : ${best} %`, best >= 90 ? 'green' : 'blue') : ''}</span></button>`;
        }
        function drawExos() {
            if (st.exo) return drawExo(L().EXERCISES.find(x => x.id === st.exo));
            const list = L().search(st.q, {kind: 'exercice'}).map(r => r.item);
            body.innerHTML = list.length ? `<p class="la-count">${nf(list.length, 0)} exercice${list.length > 1 ? 's' : ''} · lis le texte comme sur le registre, écris ta lecture (abréviations développées), puis « ✓ Corriger »</p><div class="la-exos">${list.map(exoCard).join('')}</div>
                <p class="ui-hint">Textes rédigés sur le modèle des registres de l’époque (formules authentiques, personnes d’exemple, toutes nées bien avant 1950).</p>` : emptyLine(`Aucun exercice pour « ${st.q} ».`);
        }
        function drawExo(x) {
            if (!x) { st.exo = ''; return drawExos(); }
            const P = L().parseExercise(x);
            body.innerHTML = `<div class="la-exo">
                <div class="la-exo-head"><button type="button" class="button small secondary" data-la-back>← Tous les exercices</button><h4>${x.icon} ${esc(x.title)}</h4>${badge(x.level, LEVEL_BADGE[x.level] || 'grey')}</div>
                <div class="la-old" lang="${x.id === 'bapt1695' ? 'la' : 'fr'}" aria-label="Le texte comme sur le registre">${esc(P.shown)}</div>
                <label class="la-answer"><span>Ta lecture <small class="muted">(développe les abréviations : « par. » → paroisse)</small></span><textarea data-la-answer rows="5" spellcheck="false" placeholder="Écris ici ce que tu lis, mot après mot…"></textarea></label>
                <div class="la-exo-actions"><button type="button" class="button" data-la-correct>✓ Corriger</button><button type="button" class="button secondary" data-la-hint>💡 Un indice</button><button type="button" class="button secondary" data-la-solution>👁 Voir la solution</button><button type="button" class="button secondary" data-la-reset>↻ Recommencer</button></div>
                <div data-la-tip hidden class="ui-hint">💡 ${esc(x.tip)}</div>
                <div class="la-result" data-la-result aria-live="polite"></div></div>`;
            body.querySelector('[data-la-answer]').focus();
        }
        function showCorrection(x, answer) {
            const r = L().correct(x, answer), out = body.querySelector('[data-la-result]'); if (!out) return;
            const best = store.get(LA_BEST, {}); if (best[x.id] == null || r.score > best[x.id]) { best[x.id] = r.score; store.set(LA_BEST, best); }
            const miss = r.words.filter(w => w.st === 'faux' || w.st === 'manque').length;
            out.innerHTML = `${UI().notice ? UI().notice(r.score >= 90 ? 'ok' : r.score >= 60 ? 'info' : 'warn', `${r.ok} mot${r.ok > 1 ? 's' : ''} juste${r.ok > 1 ? 's' : ''} sur ${r.total} (${r.score} %)${miss ? ` · ${miss} à revoir` : ' · bravo !'}${r.extra ? ` · ${r.extra} en trop` : ''}`) : ''}
                <p class="la-legend"><span class="la-w is-ok">juste</span> <span class="la-w is-faux">à revoir</span> <span class="la-w is-manque">oublié</span> <span class="la-w is-trop">en trop</span> — passe la souris sur un mot à revoir pour l’explication.</p>
                <div class="la-words">${r.words.map(w => w.st === 'ok' ? `<span class="la-w is-ok">${esc(w.got)}</span>` : w.st === 'trop' ? `<span class="la-w is-trop" title="Ce mot n’est pas dans le texte">${esc(w.got)}</span>`
                    : `<span class="la-w is-${w.st}" title="${esc([`On lit « ${w.exp} »`, w.hint].filter(Boolean).join(' — '))}">${w.st === 'faux' ? `<s>${esc(w.got)}</s> ` : ''}<b>${esc(w.exp)}</b>${w.hint ? `<small>${esc(w.hint)}</small>` : ''}</span>`).join(' ')}</div>`;
            out.scrollIntoView?.({block: 'nearest', behavior: 'smooth'});
        }
        function draw() {
            host.querySelectorAll('[data-la-tab]').forEach(b => { const on = b.dataset.laTab === st.tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
            filters(); $('[data-la-search]').hidden = !!(st.tab === 'exos' && st.exo); // dans un exercice : pas de recherche
            if (st.tab === 'lettres') drawLetters(); else if (st.tab === 'exos') drawExos(); else drawDict();
        }
        host.addEventListener('click', e => {
            const t = e.target.closest('[data-la-tab]'); if (t) { st.tab = t.dataset.laTab; st.exo = ''; st.shown = 60; store.set(LA_TAB, st.tab); draw(); return; }
            const k = e.target.closest('[data-la-kind]'); if (k) { st.kind = k.dataset.laKind; st.shown = 60; draw(); return; }
            const a = e.target.closest('[data-la-acte]'); if (a) { st.acte = a.dataset.laActe; st.shown = 60; draw(); return; }
            const c = e.target.closest('[data-la-copy]'); if (c) { copyText(c.dataset.laCopy); return; }
            const x = e.target.closest('[data-la-exo]'); if (x) { st.exo = x.dataset.laExo; draw(); return; }
            if (e.target.closest('[data-la-back]')) { st.exo = ''; draw(); return; }
            const cur = L().EXERCISES.find(z => z.id === st.exo); if (!cur) return;
            const ta = body.querySelector('[data-la-answer]');
            if (e.target.closest('[data-la-correct]')) { if (!ta.value.trim()) { if (UI().fail) UI().fail(ta, 'Écris d’abord ta lecture du texte.'); else toast('Écris d’abord ta lecture du texte.', 'error'); return; } showCorrection(cur, ta.value); }
            if (e.target.closest('[data-la-hint]')) body.querySelector('[data-la-tip]').hidden = false;
            if (e.target.closest('[data-la-solution]')) { ta.value = L().parseExercise(cur).answer; showCorrection(cur, ta.value); }
            if (e.target.closest('[data-la-reset]')) { ta.value = ''; body.querySelector('[data-la-result]').innerHTML = ''; ta.focus(); }
        });
        host.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.matches('[data-la-answer]')) { e.preventDefault(); body.querySelector('[data-la-correct]')?.click(); return; }
            if (e.key === 'Enter' && e.target.matches('input')) e.preventDefault(); // dans une fenêtre : Entrée ne la ferme pas
        });
        draw();
        return {set(o = {}) { if (o.tab) st.tab = o.tab; if (o.q != null) { st.q = o.q; const i = host.querySelector('.la-search input'); if (i) i.value = o.q; } st.exo = ''; draw(); }};
    }
    function openReading({tab = '', q = ''} = {}) {
        if (!ext.openDialog) return toast('La fenêtre n’est pas encore prête : réessaie dans un instant.', 'error');
        return ext.openDialog({eyebrow: 'AIDE · LECTURE DES ACTES', title: '📜 Aide à la lecture des actes anciens', wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: '<div data-la-host></div>', onOpen: dg => { dg.classList.add('la-dialog'); mountReading(dg.querySelector('[data-la-host]'), {tab, q}); setTimeout(() => dg.querySelector('.la-search input')?.focus(), 30); }});
    }
    ext.readingAid = {open: openReading, mount: mountReading, search: (q, o) => L()?.search(q, o) || []};

    /* ═════════════════════════ 🪙 Convertisseur d'autrefois ═════════════════════════ */
    const AF_TAB = 'lcnda-autrefois-tab', AF_REGION = 'lcnda-autrefois-region';
    const AF_TABS = [['argent', '💰 Argent'], ['mesures', '📏 Mesures anciennes'], ['calendrier', '📅 Calendrier républicain']];
    /** l'année d'un texte : « 1780 », « vers 1780 », « 12 mars 1780 », « an X » (an X = 1801-1802 : on garde 1802, comme les champs de date) */
    function yearOf(text) {
        const s = String(text || '').toLowerCase(); let m;
        if ((m = s.match(/\ban\s+([ivx]+|\d{1,2})\b/))) { const an = F()?.fromRoman(m[1]) || 0; return an ? 1792 + an : 0; }
        const all = s.match(/\b\d{3,4}\b/g); return all ? Number(all.at(-1)) : 0;
    }
    const hintLine = (r, okText) => !r ? '' : r.ok ? `<span class="ui-hint is-ok">✓ Compris : <b>${esc(okText ?? r.label)}</b></span>` : `<span class="ui-hint is-warn">⚠️ ${esc(String(r.text || '').charAt(0).toUpperCase() + String(r.text || '').slice(1))}</span>`;
    function mountConverter(host, {tab = '', value = '', year = ''} = {}) {
        if (!F()) { host.innerHTML = emptyLine('Le convertisseur n’a pas pu se charger (fichier app-autrefois-engine.js manquant ?).', '⚠️'); return null; }
        const st = {tab: tab || store.get(AF_TAB, 'argent'), region: store.get(AF_REGION, 'paris')};
        if (!AF_TABS.some(([k]) => k === st.tab)) st.tab = 'argent';
        host.classList.add('af');
        const regs = F().regions();
        if (!regs.some(r => r.id === st.region)) st.region = 'paris';
        const init = {argent: st.tab === 'argent' ? value : '', mesures: st.tab === 'mesures' ? value : '', calendrier: st.tab === 'calendrier' ? value : ''};
        host.innerHTML = `${tabsHtml(AF_TABS, st.tab, 'data-af-tab')}
            <section class="af-pane" data-af-pane="argent">
                <div class="af-fields"><label class="af-field"><span>La somme</span><input type="text" data-af-sum autocomplete="off" spellcheck="false" placeholder="12 livres 10 sous, 1 200 francs, 45 NF…" value="${esc(init.argent)}"><span data-af-sum-hint></span></label>
                    <label class="af-field af-year"><span>L’année</span><input type="text" data-af-year autocomplete="off" placeholder="1780, an X, 1955…" value="${esc(year || '')}"><span data-af-year-hint></span></label></div>
                <p class="af-examples">Exemples : ${[['300 livres', '1780'], ['12 livres 10 sous 6 deniers', '1750'], ['1 200 francs', '1880'], ['5 000 francs', '1955'], ['45 NF', '1965'], ['100 F', '1995']].map(([s, y]) => `<button type="button" class="link-button" data-af-ex-sum="${esc(s)}" data-af-ex-year="${y}">${esc(s)} en ${y}</button>`).join(' · ')}</p>
                <div class="af-out" data-af-out="argent" aria-live="polite"></div></section>
            <section class="af-pane" data-af-pane="mesures">
                <div class="af-fields"><label class="af-field"><span>La mesure</span><input type="text" data-af-measure autocomplete="off" spellcheck="false" placeholder="3 arpents, 12 toises 3 pieds, 2 boisseaux, 1,5 ha…" value="${esc(init.mesures)}"><span data-af-measure-hint></span></label>
                    <label class="af-field"><span>Région, ville</span><select data-af-region>${regs.map(r => `<option value="${esc(r.id)}"${r.id === st.region ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select><span class="ui-hint">Les mesures changeaient d’une province à l’autre : choisis celle de l’acte.</span></label></div>
                <p class="af-examples">Exemples : ${['3 arpents', '12 toises 3 pieds', '2 setiers', '5 aunes', '1 lieue', '4 journaux', '1,5 ha'].map(s => `<button type="button" class="link-button" data-af-ex-measure="${esc(s)}">${esc(s)}</button>`).join(' · ')}</p>
                <div class="af-out" data-af-out="mesures" aria-live="polite"></div></section>
            <section class="af-pane" data-af-pane="calendrier">
                <div class="af-fields"><label class="af-field af-wide"><span>La date (républicaine ou de tous les jours)</span><input type="text" data-af-date autocomplete="off" spellcheck="false" placeholder="12 thermidor an II, 14 juillet 1794, 14/07/1794…" value="${esc(init.calendrier)}"><span data-af-date-hint></span></label></div>
                <p class="af-examples">Exemples : ${['9 thermidor an II', '18 brumaire an VIII', '1er vendémiaire an I', '14 juillet 1794', '25/12/1800'].map(s => `<button type="button" class="link-button" data-af-ex-date="${esc(s)}">${esc(s)}</button>`).join(' · ')}</p>
                <div class="af-out" data-af-out="calendrier" aria-live="polite"></div></section>
            <p class="af-source ui-hint">Tout est calculé ici, sans internet. Argent : ${esc(F().SOURCE)} à partir de 1901 ; avant, un ordre de grandeur. Les résultats sont des repères (≈), pas des valeurs exactes.</p>`;
        const $ = s => host.querySelector(s);
        const copyBtn = text => `<button type="button" class="button small secondary af-copy" data-af-copy="${esc(text)}">📋 Copier</button>`;
        function drawMoney() {
            const sumIn = $('[data-af-sum]'), yIn = $('[data-af-year]'), out = $('[data-af-out="argent"]');
            const sum = sumIn.value.trim() ? F().readSum(sumIn.value) : null, y = yearOf(yIn.value);
            $('[data-af-sum-hint]').innerHTML = hintLine(sum);
            const yr = !yIn.value.trim() ? null : y >= 1300 && y <= 2025 ? {ok: true, label: `${y}${/\ban\s/i.test(yIn.value) ? ' (année républicaine)' : ''}`} : y > 2025 ? {ok: false, text: 'une année d’aujourd’hui ou d’avant (jusqu’à 2025)'} : {ok: false, text: 'une année entre 1300 et 2025 (exemples : 1780, an X, 1955)'};
            $('[data-af-year-hint]').innerHTML = hintLine(yr);
            sumIn.classList.toggle('is-invalid', !!sum && !sum.ok); yIn.classList.toggle('is-invalid', !!yr && !yr.ok);
            if (!sum?.ok || !yr?.ok) { out.innerHTML = emptyLine(!sum ? 'Écris une somme et son année : « 300 livres » en « 1780 ».' : !yr ? 'Écris aussi l’année de la somme.' : 'Corrige la case marquée ⚠️ ci-dessus.', '💰'); return; }
            const w = F().worth(sum, y, {wageSols: A().journalierWageSols}); if (!w) { out.innerHTML = ''; return; }
            const txt = `${sum.label} en ${y} ${F().euroText(w.euros)} d’aujourd’hui (${w.source === 'insee' ? 'indice des prix de l’INSEE' : 'ordre de grandeur'})`;
            out.innerHTML = `<div class="af-big"><small>En euros d’aujourd’hui</small><strong>${esc(F().euroText(w.euros))}</strong>${badge(w.source === 'insee' ? 'INSEE' : 'Ordre de grandeur', w.source === 'insee' ? 'green' : 'yellow')}${copyBtn(txt)}</div>
                <div class="af-cards"><div><small>Dans la monnaie de ${y}</small><b>${esc(w.nativeText)}</b></div><div><small>En pain</small><b>🥖 ${nf(w.bread, w.bread < 10 ? 1 : 0)} kg</b></div>${w.days != null ? `<div><small>En journées de travail</small><b>🔨 ${nf(w.days, 1)}</b><small>d’un journalier en ${y}</small></div>` : ''}</div>
                ${w.warn.map(t => UI().notice ? UI().notice('warn', t.charAt(0).toUpperCase() + t.slice(1) + '.') : '').join('')}
                <details class="af-steps"><summary>Le calcul, pas à pas</summary><ol>${w.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><p class="ui-hint">Source : <a href="${esc(F().SOURCE_URL)}" target="_blank" rel="noopener noreferrer">${esc(F().SOURCE)}</a>. Parités exactes : 1 livre = 20 sous = 240 deniers · 81 livres = 80 francs (franc germinal, 1795) · 1 nouveau franc = 100 anciens francs (1960) · 1 € = 6,55957 F (1999).</p></details>
`;
        }
        function drawMeasure() {
            const inp = $('[data-af-measure]'), out = $('[data-af-out="mesures"]');
            const r = inp.value.trim() ? F().readMeasure(inp.value, st.region) : null;
            $('[data-af-measure-hint]').innerHTML = hintLine(r, r?.ok ? `${r.label}${r.fromRegion ? ` (mesure de ${r.fromRegion})` : ''}` : '');
            inp.classList.toggle('is-invalid', !!r && !r.ok);
            if (!r?.ok) { out.innerHTML = emptyLine(!r ? 'Écris une mesure : « 3 arpents », « 12 toises 3 pieds », « 2 boisseaux »… ou « 1,5 ha » pour l’inverse.' : 'Corrige la case marquée ⚠️ ci-dessus.', '📏'); return; }
            const txt = `${r.label} ${r.approx ? '≈' : '='} ${r.metric}`;
            out.innerHTML = `<div class="af-big"><small>${esc(r.kindName)} · ${esc(r.region)}</small><strong>${r.approx ? '≈ ' : '= '}${esc(r.metric)}</strong>${r.approx ? badge('Valeur approchée', 'yellow') : ''}${copyBtn(txt)}</div>
                ${r.units.length ? `<h4 class="af-h">Dans les autres mesures de la région</h4><table class="af-table"><tbody>${r.units.map(u => `<tr><td>${u.approx ? '≈ ' : ''}${nf(u.value, u.value < 10 ? 3 : 1)}</td><td>${esc(u.label)}${u.note ? ` <small class="muted">(${esc(u.note)})</small>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
                ${r.elsewhere.length ? `<h4 class="af-h">La même mesure ailleurs (pour 1)</h4><table class="af-table"><tbody>${r.elsewhere.map(u => `<tr><td>${u.approx ? '≈ ' : ''}${esc(u.metric)}</td><td>${esc(u.label)} <small class="muted">— ${esc(u.region)}</small></td></tr>`).join('')}</tbody></table>` : ''}
`;
        }
        function drawDate() {
            const inp = $('[data-af-date]'), out = $('[data-af-out="calendrier"]');
            const r = inp.value.trim() ? F().republican(inp.value) : null;
            $('[data-af-date-hint]').innerHTML = hintLine(r, r?.ok ? r.from : '');
            inp.classList.toggle('is-invalid', !!r && !r.ok);
            if (!r?.ok) { out.innerHTML = emptyLine(!r ? 'Écris une date républicaine (« 12 thermidor an II ») ou de tous les jours (« 14 juillet 1794 ») : la conversion se fait dans les deux sens.' : 'Corrige la case marquée ⚠️ ci-dessus.', '📅'); return; }
            const an = r.rep.an, months = F().republicanYear(an);
            out.innerHTML = `<div class="af-big"><small>${r.dir === 'rep2greg' ? 'Dans notre calendrier' : 'Dans le calendrier républicain'}</small><strong>= ${esc(r.to)}</strong><span class="af-sub">${esc(r.weekday)}${r.decade ? ` · ${esc(r.decade)} (jour ${((r.rep.d - 1) % 10) + 1} de la décade)` : ''}</span>${copyBtn(r.text)}</div>
                <h4 class="af-h">L’an ${esc(F().toRoman(an))} mois par mois</h4><table class="af-table af-months"><tbody>${months.map((m, i) => `<tr class="${i + 1 === r.rep.mo ? 'is-cur' : ''}"><td>${esc(m.name)}</td><td>${esc(m.start)} → ${esc(m.end)}</td><td class="muted">${m.days} jours</td></tr>`).join('')}</tbody></table>
`;
        }
        function show() {
            host.querySelectorAll('[data-af-tab]').forEach(b => { const on = b.dataset.afTab === st.tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
            host.querySelectorAll('[data-af-pane]').forEach(p => { p.hidden = p.dataset.afPane !== st.tab; });
            if (st.tab === 'argent') drawMoney(); else if (st.tab === 'mesures') drawMeasure(); else drawDate();
        }
        host.addEventListener('input', e => {
            if (e.target.matches('[data-af-sum], [data-af-year]')) drawMoney();
            else if (e.target.matches('[data-af-measure]')) drawMeasure();
            else if (e.target.matches('[data-af-date]')) drawDate();
        });
        host.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.preventDefault(); }); // dans une fenêtre : Entrée ne la ferme pas
        host.addEventListener('change', e => { if (e.target.matches('[data-af-region]')) { st.region = e.target.value; store.set(AF_REGION, st.region); drawMeasure(); } });
        host.addEventListener('click', e => {
            const t = e.target.closest('[data-af-tab]'); if (t) { st.tab = t.dataset.afTab; store.set(AF_TAB, st.tab); show(); host.querySelector(`[data-af-pane="${st.tab}"] input`)?.focus(); return; }
            const c = e.target.closest('[data-af-copy]'); if (c) { copyText(c.dataset.afCopy); return; }
            const xs = e.target.closest('[data-af-ex-sum]'); if (xs) { $('[data-af-sum]').value = xs.dataset.afExSum; $('[data-af-year]').value = xs.dataset.afExYear; drawMoney(); return; }
            const xm = e.target.closest('[data-af-ex-measure]'); if (xm) { $('[data-af-measure]').value = xm.dataset.afExMeasure; drawMeasure(); return; }
            const xd = e.target.closest('[data-af-ex-date]'); if (xd) { $('[data-af-date]').value = xd.dataset.afExDate; drawDate(); }
        });
        show();
        return {set(o = {}) { if (o.tab) st.tab = o.tab; const i = {argent: '[data-af-sum]', mesures: '[data-af-measure]', calendrier: '[data-af-date]'}[st.tab]; if (o.value != null && i) $(i).value = o.value; show(); }};
    }
    function openConverter({tab = '', value = '', year = ''} = {}) {
        if (!ext.openDialog) return toast('La fenêtre n’est pas encore prête : réessaie dans un instant.', 'error');
        return ext.openDialog({eyebrow: 'OUTILS · CONVERTIR', title: '🪙 Convertisseur d’autrefois', wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: '<div data-af-host></div>', onOpen: dg => { dg.classList.add('af-dialog'); mountConverter(dg.querySelector('[data-af-host]'), {tab, value, year}); setTimeout(() => dg.querySelector('.af-pane:not([hidden]) input')?.focus(), 30); }});
    }
    ext.autrefois = {open: openConverter, mount: mountConverter, yearOf};

    /* ═════════ Les entrées ═════════ */
    // n'importe quel bouton : data-la-open="mot cherché" (ou vide), data-autrefois-open="argent|mesures|calendrier" (+ data-autrefois-value)
    document.addEventListener('click', e => {
        const la = e.target.closest('[data-la-open]'); if (la) { e.preventDefault(); openReading({q: la.dataset.laOpen || '', tab: la.dataset.laOpenTab || ''}); return; }
        const af = e.target.closest('[data-autrefois-open]'); if (af) { e.preventDefault();
            // C4 : sous la date d'un acte en calendrier républicain (« ✓ Compris : 12 thermidor an II (30 juillet 1794) »), « 🪙 Convertir »
            const fromDate = af.closest('.ui-date')?.querySelector('input.ui-date-input')?.value;
            openConverter({tab: af.dataset.autrefoisOpen || '', value: af.dataset.autrefoisValue ?? fromDate ?? ''}); }
    });
    // « 🪙 Convertir » sous une date (un <span role=button>, pour ne pas compter parmi les boutons d'un formulaire) : Entrée ou Espace
    document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('span.ui-date-more[data-autrefois-open]')) { e.preventDefault(); e.target.click(); } });
    // Réglages → Glossaire et Calendrier / mesures : la même aide et le même convertisseur, posés dans la page
    ext.mountReadingAid = mountReading; ext.mountAutrefois = mountConverter;
})();
