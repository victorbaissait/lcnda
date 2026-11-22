/* LCNDA — 📜 Transcription d'actes, la suite (maquette validée : docs/design/transcription-actes.html) :
 *  A. avant « ✨ Lire l'acte » : une capture d'écran d'un site d'archives (barres d'outils, bords gris) est repérée et la lecture
 *     recadrée sur le document (« ✂ Recadrer sur le texte » / « Lire quand même ») ;
 *  B. après la lecture : un texte peu sûr propose « ✂ Recadrer et relire » ou « 🔍 Essayer la lecture approfondie » ;
 *  G. la lecture approfondie, facultative : un modèle « vision » ouvert (Qwen3-VL) servi par Ollama sur cet ordinateur ;
 *     les deux lectures côte à côte, on garde la meilleure ;
 *  C–F. « Ce que l'app a trouvé » : l'événement, les personnes et leurs liens, relier / comparer / créer chaque fiche, la source
 *     préparée, le récapitulatif, puis « ✓ Ajouter à la généalogie » d'un coup, avec « ↶ Annuler ».
 * Le calcul : heritage-transcribe-acte-core.js (window.LCNDA_TXACTE). Serveur : lib/transcription_actes.php.
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = window.LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const C = () => window.LCNDA_TXACTE;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const UI = () => window.LCNDA_UI || {};
    const notice = (kind, html) => `<div class="ui-notice ui-notice-${kind} h-txa-msg" role="status"><span class="ui-notice-ico" aria-hidden="true">${{info: 'ℹ️', warn: '⚠️', ok: '✓', error: '⛔'}[kind] || 'ℹ️'}</span><span>${html}</span></div>`;

    /* ═════════ A. Recadrer sur le texte ═════════ */
    /** la zone du document dans l'image (pixels de l'image) ; screenshot : il y a beaucoup de choses autour */
    function detectCrop(im) {
        const W = im.naturalWidth || im.width, H = im.naturalHeight || im.height; if (!W || !H) return null;
        const k = Math.min(1, 400 / Math.max(W, H)), w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(im, 0, 0, w, h);
        let data; try { data = g.getImageData(0, 0, w, h).data; } catch (_) { return null; }
        const b = C().cropBox(data, w, h), m = Math.round(Math.max(W, H) * .006);
        const x = Math.max(0, Math.round(b.x / k) - m), y = Math.max(0, Math.round(b.y / k) - m);
        return {x, y, w: Math.min(W - x, Math.round(b.w / k) + 2 * m), h: Math.min(H - y, Math.round(b.h / k) + 2 * m), ratio: b.ratio, screenshot: b.screenshot};
    }
    /** A : « Cette image ressemble à une capture d'écran… » → 'crop' | 'full' | null (fermé) */
    function askCrop(im, box) {
        return new Promise(res => {
            let answer = null;
            ext.openDialog({eyebrow: i18n('LECTURE AUTOMATIQUE'), title: `✂ ${i18n('Recadrer sur le texte ?')}`, submitLabel: `✂ ${i18n('Recadrer sur le texte')}`, closeLabel: i18n('Lire quand même'),
                body: `${notice('warn', `<b>${esc(i18n('Cette image ressemble à une capture d’écran'))}</b> ${esc(i18n('(boutons et bords gris autour) : la lecture sera moins bonne. Télécharge l’image en grand sur le site des archives, ou recadre sur le texte.'))}`)}
                    <canvas class="h-txa-cropprev" data-txa-prev aria-label="${esc(i18n('La zone qui sera lue'))}"></canvas><p class="ui-hint">${esc(i18n('Le cadre bleu montre la zone qui sera lue. Pour choisir toi-même, dessine une zone (▭) puis « ✨ Lire cette zone ».'))}</p>`,
                onOpen: d => {
                    const cv = d.querySelector('[data-txa-prev]'), W = im.naturalWidth, H = im.naturalHeight, k = Math.min(1, 560 / W, 320 / H);
                    cv.width = Math.round(W * k); cv.height = Math.round(H * k); const g = cv.getContext('2d'); g.drawImage(im, 0, 0, cv.width, cv.height);
                    g.fillStyle = 'rgba(17,17,17,.55)'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, box.x, box.y, box.w, box.h, box.x * k, box.y * k, box.w * k, box.h * k);
                    g.strokeStyle = '#055dff'; g.lineWidth = 3; g.strokeRect(box.x * k, box.y * k, box.w * k, box.h * k);
                    d.querySelector('.modal-actions [data-h-close]')?.addEventListener('click', () => { answer = 'full'; });
                    d.addEventListener('close', () => res(answer));
                },
                onSubmit: () => { answer = 'crop'; }});
        });
    }

    /* ═════════ B. Une lecture peu sûre ═════════ */
    function lowNoticeHtml(st) {
        return notice('info', `🔎 <b>${esc(i18n('La lecture à la main a donné un texte peu sûr'))}</b> ${esc(i18n('({x} % de mots douteux). Souvent à cause des bords de l’écran autour de l’acte, ou d’une écriture trop difficile pour ce modèle.', {x: Math.round(st.ratio * 100)}))}
            <span class="h-txa-row"><button type="button" class="button small secondary" data-txa-recrop>✂ ${esc(i18n('Recadrer et relire'))}</button><button type="button" class="button small" data-txa-deep>🔍 ${esc(i18n('Essayer la lecture approfondie'))}</button></span>`);
    }

    /* ═════════ G. Lecture approfondie (Ollama, sur cet ordinateur) ═════════ */
    const DEEP_KEY = 'genealogie-tx-deep-model';
    const gb = n => `${(n / 1e9).toLocaleString(document.documentElement.lang || 'fr', {maximumFractionDigits: 1})} Go`;
    /**
     * o.getImage() : l'image à lire (base64 PNG / JPEG, la zone recadrée) ; o.lang : la langue du texte ;
     * o.htrText : le texte déjà lu à la main (pour comparer) ; o.onKeep(text, from) : met le texte choisi dans la transcription.
     */
    async function openDeep(o = {}) {
        let st = null, job = null, timer = 0, model = '';
        try { model = localStorage.getItem(DEEP_KEY) || ''; } catch (_) {}
        const dlg = ext.openDialog({eyebrow: i18n('LECTURE APPROFONDIE'), title: `🔍 ${i18n('Lecture approfondie')}`, wide: true, body: '<div data-txa-deep></div>',
            onOpen: d => { d.addEventListener('close', () => { clearTimeout(timer); if (job && job.state === 'running') post('tx_deep_cancel', {id: job.id}).catch(() => {}); }); }});
        const box = dlg.querySelector('[data-txa-deep]');
        const info = () => `<div class="h-txa-grid">
            <span class="k">${esc(i18n('Ce qu’il faut'))}</span><span>${esc(i18n('Ollama (gratuit, open source) et un modèle vision ouvert, au choix :'))}</span>
            <span class="k">${esc(i18n('Modèle'))}</span><span class="h-txa-models">${(st?.models || []).map(m => `<label><input type="radio" name="txa_model" value="${esc(m.tag)}" ${m.tag === model ? 'checked' : ''}> <b>${esc(m.label)}</b> — ${esc(m.recommended ? i18n('le meilleur, ≈ {x} Go', {x: String(m.size_gb).replace('.', ',')}) : i18n('plus léger, ≈ {x} Go, pour un ordinateur modeste', {x: String(m.size_gb).replace('.', ',')}))} <small class="muted">${esc(m.license)}${m.present ? ' · ✓ ' + esc(i18n('déjà téléchargé')) : ''}</small></label>`).join('')}</span>
            <span class="k">${esc(i18n('Mémoire'))}</span><span>${esc(i18n('8 Go conseillés (16 Go pour le 8B) · téléchargé une seule fois'))}</span>
            <span class="k">${esc(i18n('Vitesse'))}</span><span>${esc(i18n('≈ 20 à 60 s par page sur un ordinateur récent'))}</span>
            <span class="k">${esc(i18n('Confidentialité'))}</span><span>${esc(i18n('rien ne quitte ton ordinateur ; l’app vérifie qu’Ollama ne répond que sur ton ordinateur'))}</span></div>`;
        const pick = () => { const r = box.querySelector('[name="txa_model"]:checked'); if (r) { model = r.value; try { localStorage.setItem(DEEP_KEY, model); } catch (_) {} } return model; };
        async function refresh() {
            box.innerHTML = UI().spinner ? UI().spinner(i18n('Recherche d’Ollama sur cet ordinateur…')) : '…';
            try { st = await api('tx_deep_status'); } catch (e) { box.innerHTML = notice('error', esc(e.message)); return; }
            if (!st.models.some(m => m.tag === model)) model = (st.models.find(m => m.present && m.recommended) || st.models.find(m => m.present) || st.models.find(m => m.recommended) || st.models[0]).tag;
            const ready = st.running && st.models.some(m => m.tag === model && m.present);
            const head = !st.local_only ? notice('error', esc(i18n('L’adresse d’Ollama n’est pas sur cet ordinateur : la lecture approfondie est refusée.')))
                : !st.installed ? notice('info', `<b>${esc(i18n('Ollama n’est pas encore sur cet ordinateur.'))}</b> ${esc(i18n('Installe-le une fois depuis son site (gratuit), lance-le, puis « ↻ Vérifier à nouveau ».'))}`)
                : !st.running ? notice('warn', `<b>${esc(i18n('Ollama est installé mais ne tourne pas.'))}</b> ${esc(i18n('Lance l’application Ollama, puis « ↻ Vérifier à nouveau ».'))}`)
                : ready ? notice('ok', esc(i18n('Prêt : la lecture se fait sur cet ordinateur, sans Internet.'))) : '';
            box.innerHTML = `${head}${info()}<div class="h-txa-prog" data-txa-prog hidden><div class="h-txa-bar"><i></i></div><small data-txa-progtxt></small></div><div class="h-txa-out" data-txa-out></div>
                <div class="h-txa-row h-txa-deepbtns">${!st.installed ? `<a class="button" href="${esc(st.download_url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(i18n('Télécharger Ollama (ollama.com)'))}</a>` : ''}
                ${st.running && !ready ? `<button type="button" class="button" data-txa-pull>⤓ ${esc(i18n('Installer la lecture approfondie'))}</button>` : ''}
                ${ready && !o.setupOnly ? `<button type="button" class="button" data-txa-read>🔍 ${esc(i18n('Lire l’acte avec ce modèle'))}</button>` : ''}
                <button type="button" class="button secondary" data-txa-recheck>↻ ${esc(i18n('Vérifier à nouveau'))}</button></div>
                ${ready && o.setupOnly ? notice('info', esc(i18n('Pour lire un acte : ouvre son image dans l’Atelier de transcription (« 📜 Ouvrir dans l’Atelier »), puis « ✨ Lire l’acte ».'))) : ''}
                <p class="ui-hint">${esc(i18n('« 🔍 Essayer aussi la lecture approfondie » sur une page déjà lue montre les deux textes côte à côte, et on garde la meilleure. Relis toujours : un modèle peut se tromper sur les noms.'))}</p>`;
        }
        const prog = (on, pct, txt) => { const p = box.querySelector('[data-txa-prog]'); if (!p) return; p.hidden = !on; p.querySelector('i').style.width = `${Math.max(0, Math.min(100, pct))}%`; p.querySelector('[data-txa-progtxt]').textContent = txt || ''; };
        async function poll(onDone) {
            let j; try { j = await api('tx_deep_job', {id: job.id}); } catch (e) { job = null; prog(false); box.querySelectorAll('[data-txa-read], [data-txa-pull]').forEach(x => { x.disabled = false; }); const out = box.querySelector('[data-txa-out]'); if (out) out.innerHTML = notice('error', `${esc(i18n('Impossible de suivre la lecture : {x}', {x: e.message || '?'}))}`); return toast(e.message, 'error'); }
            job = {...job, ...j};
            if (j.state === 'running') {
                if (j.kind === 'pull') prog(true, j.total ? j.completed / j.total * 100 : 3, j.total ? i18n('Téléchargement du modèle… {done} sur {total}', {done: gb(j.completed), total: gb(j.total)}) : i18n('Téléchargement du modèle…'));
                else { prog(true, Math.min(95, j.elapsed * 2), i18n('Lecture approfondie… {n} s', {n: j.elapsed})); const out = box.querySelector('[data-txa-out]'); if (out && j.text) out.innerHTML = `<pre class="h-txa-live">${esc(j.text)}</pre>`; }
                timer = setTimeout(() => poll(onDone), 900); return;
            }
            prog(false);
            box.querySelectorAll('[data-txa-read], [data-txa-pull]').forEach(x => { x.disabled = false; }); // jamais un bouton grisé pour rien
            if (j.state === 'error' || j.state === 'cancelled') { // le message reste dans la fenêtre (une bulle passe trop vite)
                const msg = j.state === 'cancelled' ? i18n('La lecture a été arrêtée.') : (j.error ? i18n(j.error) : i18n('La lecture approfondie n’a pas abouti.'));
                const out = box.querySelector('[data-txa-out]'); if (out) out.innerHTML = notice('error', `${esc(msg)}<br><small>${esc(i18n('Modèle : {m} · {n} s', {m: j.model || '?', n: String(j.elapsed ?? '?')}))}${j.detail ? ` · ${esc(j.detail)}` : ''}</small>`);
                return toast(msg, 'error');
            }
            if (j.state === 'done') onDone(j);
        }
        function compare(deepText) {
            const out = box.querySelector('[data-txa-out]'); const two = !!String(o.htrText || '').trim();
            out.innerHTML = `<h4>${esc(two ? i18n('Les deux lectures côte à côte') : i18n('Le texte lu'))}</h4><div class="h-txa-cmp2${two ? '' : ' is-one'}">
                ${two ? `<div><b>✍ ${esc(i18n('Écriture à la main'))}</b><textarea data-txa-t="htr" spellcheck="false">${esc(o.htrText)}</textarea><button type="button" class="button small secondary" data-txa-keep="htr">✓ ${esc(i18n('Garder celle-ci'))}</button></div>` : ''}
                <div><b>🔍 ${esc(i18n('Lecture approfondie'))}</b><textarea data-txa-t="deep" spellcheck="false">${esc(deepText)}</textarea><button type="button" class="button small" data-txa-keep="deep">✓ ${esc(two ? i18n('Garder celle-ci') : i18n('Mettre dans le texte'))}</button></div></div>`;
        }
        box.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-txa-recheck]')) return refresh();
            if (b.matches('[data-txa-pull]')) {
                try { const r = await post('tx_deep_pull', {model: pick()}); job = {id: r.result.id, state: 'running'}; b.disabled = true; prog(true, 2, i18n('Téléchargement du modèle…')); poll(() => { toast(i18n('La lecture approfondie est installée.')); refresh(); }); } catch (err) { toast(err.message, 'error'); }
                return;
            }
            if (b.matches('[data-txa-read]')) {
                let img; try { img = await o.getImage(); } catch (err) { return toast(err.message, 'error'); }
                try { const r = await post('tx_deep_read', {model: pick(), language: o.lang || 'fra', image_b64: img}); job = {id: r.result.id, state: 'running'}; b.disabled = true; prog(true, 2, `${i18n('Lecture approfondie')}…`); poll(j => { b.disabled = false; compare(j.text); }); } catch (err) { toast(err.message, 'error'); }
                return;
            }
            if (b.dataset.txaKeep) { const v = box.querySelector(`[data-txa-t="${b.dataset.txaKeep}"]`)?.value || ''; if (!v.trim()) return; o.onKeep?.(v, b.dataset.txaKeep); dlg.close(); }
        });
        box.addEventListener('change', e => { if (e.target.name === 'txa_model') { pick(); refresh(); } });
        refresh();
        return dlg;
    }

    /* ═════════ C–F. Ce que l'app a trouvé ═════════ */
    const ROLE = {epoux: 'Époux', epouse: 'Épouse', pere_epoux: 'Père de l’époux', mere_epoux: 'Mère de l’époux', pere_epouse: 'Père de l’épouse', mere_epouse: 'Mère de l’épouse', pere: 'Père', mere: 'Mère',
        pere_defunt: 'Père du défunt', mere_defunt: 'Mère du défunt', sujet: 'Enfant', defunt: 'Défunt', conjoint: 'Conjoint', temoin: 'Témoin', parrain: 'Parrain', marraine: 'Marraine', declarant: 'Déclarant', parent: 'Parent', autre: 'Autre personne'};
    const roleLabel = p => i18n(p.role === 'defunt' && p.sex === 'f' ? 'Défunte' : p.role === 'conjoint' && p.sex === 'f' ? 'Conjointe' : ROLE[p.role] || 'Autre personne');
    const KIND_ICON = {mariage: '💍', bapteme: '💧', naissance: '👶', deces: '✝', sepulture: '⚱', notarial: '📜'};
    const KIND_TITLE = {mariage: 'Acte de mariage', bapteme: 'Acte de baptême', naissance: 'Acte de naissance', deces: 'Acte de décès', sepulture: 'Acte de sépulture', notarial: 'Acte notarié'};
    const SECOND = new Set(['temoin', 'parrain', 'marraine', 'declarant']);
    const initials = p => ((p.given || '').charAt(0) + (p.surname || '').replace(/^(?:de |du |d’|d')/i, '').charAt(0)).toUpperCase() || '?';
    const upName = p => `${p.given}${p.surname ? ' ' + p.surname.toUpperCase() : ''}`.trim();
    const birthTxt = p => p.birthYear ? i18n(p.sex === 'f' ? '{n} ans → née vers {year}' : '{n} ans → né vers {year}', {n: p.age, year: p.birthYear}) : p.age != null ? plural(p.age, 'an', 'ans') : '';
    /**
     * ctx : {text, kind, date, place, source, filename, title, mediaId, transcriptionId, unsure, kinds: [[k, label]], helpers,
     *        frameText: async () => texte lu autour de l'acte, onApplied({result, people}), onUndone(), onKeepOnly(people)}
     */
    async function openFound(ctx) {
        // 🧭 le repérage riche (heritage-transcribe-trouve.js) complète : âges, métiers, domiciles cochés, personnes en plus, rien d'écarté
        const enrich = e => (ctx.rich?.rf && C().mergeRich ? C().mergeRich(e, ctx.rich.rf, ctx.rich.keep) : e);
        let ex = enrich(C().extractAct(ctx.text, {kind: ctx.kind, place: ctx.place, date: ctx.date, helpers: ctx.helpers}));
        if (!ex.people.length) return toast(i18n('Aucune personne trouvée dans le texte : relis-le, puis « 🧭 Repérer ».'), 'error');
        let frame = ''; try { frame = await Promise.race([ctx.frameText?.() || '', new Promise(r => setTimeout(() => r(''), 15000))]); } catch (_) {}
        const st = {people: new Map(), check: {candidates: {}, source: null}, opt: {job: true, birth: true, death: true, residence: false}, place: null};
        const guessSrc = () => C().sourceGuess({source: ctx.source, filename: ctx.filename, title: ctx.title, frameText: frame, place: ex.place, kind: ex.kind, date: ex.date?.label || '', year: ex.year,
            names: [ex.people.find(p => p.role === 'epoux' || p.role === 'sujet' || p.role === 'defunt'), ex.people.find(p => p.role === 'epouse')].filter(Boolean).map(p => p.surname || p.given)});
        let src = guessSrc();
        const initState = () => { st.people = new Map(ex.people.map(p => [p.key, {action: SECOND.has(p.role) ? 'witness' : 'create', person_id: 0, cand: null}])); };
        initState();
        async function check() {
            try {
                const r = await post('act_import_check', {people: ex.people.map(p => ({key: p.key, first: p.given, last: p.surname, sex: p.sex, birth_year: p.birthYear, role: p.role})), year: ex.year, source_title: src.title});
                st.check = r.result || st.check;
                ex.people.forEach(p => { const c = st.check.candidates?.[p.key] || [], s = st.people.get(p.key); if (c.length && c[0].score >= 5 && !s.person_id) { s.action = 'link'; s.person_id = c[0].id; s.cand = c[0]; } });
            } catch (e) { toast(e.message, 'error'); }
        }
        await check();
        const dlg = ext.openDialog({eyebrow: i18n('TRANSCRIPTION'), title: `🧭 ${i18n('Ce que l’app a trouvé dans l’acte')}`, wide: true, submitLabel: `✓ ${i18n('Ajouter à la généalogie')}`,
            body: '<div class="h-txa-found" data-txa-found></div>', onSubmit: () => apply()});
        dlg.classList.add('h-txa-dlg');
        const root = dlg.querySelector('[data-txa-found]');
        // « Garder seulement la transcription » : à gauche des boutons du bas
        const keepBtn = document.createElement('button'); keepBtn.type = 'button'; keepBtn.className = 'button secondary h-txa-keeponly'; keepBtn.textContent = i18n('Garder seulement la transcription');
        dlg.querySelector('.modal-actions')?.prepend(keepBtn);
        keepBtn.addEventListener('click', () => { ctx.onKeepOnly?.(ex.people.map(p => ({name: upName(p), role: p.role, person_id: st.people.get(p.key).action === 'link' ? st.people.get(p.key).person_id : 0, s: p.s, e: p.e}))); dlg.close(); });
        const byKey = k => ex.people.find(p => p.key === k);
        const relText = p => {
            const out = []; const kid = p.relations.find(r => r.type === 'parent_of');
            if (p.job) out.push(esc(p.job)); const b = birthTxt(p); if (b) out.push(esc(b));
            if (p.residence) out.push(esc(i18n(p.sex === 'f' ? 'demeurant à {place}' : 'demeurant à {place}', {place: p.residence})));
            const parents = ex.people.filter(q => q.relations.some(r => r.type === 'parent_of' && r.of === p.key));
            if (parents.length) { const f = parents.find(q => q.sex !== 'f'), m = parents.find(q => q.sex === 'f');
                out.push(esc(f && m ? i18n(p.sex === 'f' ? 'fille de {a} et de {b}' : 'fils de {a} et de {b}', {a: f.name + (f.deceased ? ` (${i18n('décédé')})` : ''), b: m.name + (m.deceased ? ` (${i18n('décédée')})` : '')}) : i18n(p.sex === 'f' ? 'fille de {a}' : 'fils de {a}', {a: (f || m).name}))); }
            const sib = p.relations.find(r => r.type === 'sibling_of' || r.type === 'kin_of'); if (sib && byKey(sib.of)) out.push(esc(i18n(sib.type === 'sibling_of' ? (p.sex === 'f' ? 'sœur de {name}' : 'frère de {name}') : 'parent de {name}', {name: byKey(sib.of).given})));
            const sp = p.relations.find(r => r.type === 'spouse_of'); if (sp && byKey(sp.of)) out.push(esc(i18n(p.deceased ? 'conjoint décédé de {name}' : 'conjoint de {name}', {name: byKey(sp.of).name})));
            if (p.deceased && !sp) out.push(esc(i18n(p.sex === 'f' ? 'décédée avant l’acte' : 'décédé avant l’acte')));
            void kid; return out.join(' · ');
        };
        const matchLine = p => {
            const s = st.people.get(p.key), c = st.check.candidates?.[p.key] || [];
            const chip = x => `<button type="button" class="h-txa-chip${s.person_id === x.id ? ' is-on' : ''}" data-txa-cand="${p.key}:${x.id}" title="${esc(i18n('Relier à cette fiche'))}"><span class="h-txa-av is-${x.detail?.gender === 'female' ? 'f' : x.detail?.gender === 'male' ? 'm' : 'u'}">${esc((x.title || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2))}</span><b>${esc(x.title)}</b> <small>${esc(x.years || '')}</small></button>`;
            if (s.action === 'link' && s.person_id && !c.some(x => x.id === s.person_id)) return `${esc(i18n('Reliée à :'))} <span class="h-txa-chip is-on"><b>${esc(s.cand?.title || i18n('fiche n° {person_id}', {person_id: s.person_id}))}</b></span>`;
            if (c.length) return `${esc(c.length > 1 ? i18n('Fiches proches :') : i18n('Fiche existante :'))} ${c.map(chip).join(' ')} ${c[0].score >= 5 ? `<span class="h-txa-badge is-ok">${esc(i18n('même personne probable'))}</span>` : `<span class="h-txa-badge is-warn">${esc(i18n('à vérifier'))}</span>`}`;
            if (s.action === 'witness') return esc(i18n('Pas de fiche · restera dans l’acte avec son rôle, sans créer de fiche'));
            if (s.action === 'ignore') return esc(i18n('Laissée de côté'));
            const kid = p.relations.find(r => r.type === 'parent_of');
            return esc(kid && byKey(kid.of) ? i18n(p.sex === 'f' ? 'Aucune fiche : elle sera créée et reliée comme mère de {name}' : 'Aucune fiche : elle sera créée et reliée comme père de {name}', {name: byKey(kid.of).given}) : i18n('Aucune fiche : elle sera créée'));
        };
        const seg = p => { const s = st.people.get(p.key), opts = [['link', `🔗 ${i18n('Relier')}`], ['compare', `⇆ ${i18n('Comparer')}`], ['create', `＋ ${i18n('Créer')}`], SECOND.has(p.role) ? ['witness', i18n('Témoin seul')] : ['ignore', i18n('Ignorer')]];
            return `<span class="h-txa-seg" role="group" aria-label="${esc(i18n('Que faire de cette personne'))}">${opts.map(([k, l]) => `<button type="button" data-txa-act="${p.key}:${k}" class="${s.action === k ? 'is-on' : ''}" aria-pressed="${s.action === k}">${esc(l)}</button>`).join('')}</span>`; };
        const recap = () => {
            const P = ex.people.map(p => [p, st.people.get(p.key)]), made = P.filter(([, s]) => s.action === 'create'), linked = P.filter(([, s]) => s.action === 'link'), wit = P.filter(([p, s]) => s.action === 'witness');
            const ep = ex.people.find(p => p.role === 'epoux'), es = ex.people.find(p => p.role === 'epouse');
            const evOk = ex.kind === 'mariage' ? ep && es && st.people.get(ep.key).action !== 'ignore' && st.people.get(ep.key).action !== 'witness' && st.people.get(es.key).action !== 'ignore' && st.people.get(es.key).action !== 'witness' : ex.people.some(p => (p.role === 'sujet' || p.role === 'defunt') && ['create', 'link'].includes(st.people.get(p.key).action));
            const dead = P.filter(([p, s]) => p.deceased && st.opt.death && ['create', 'link'].includes(s.action));
            const li = [];
            if (linked.length) li.push(`🔗 <b>${esc(plural(linked.length, 'fiche complétée', 'fiches complétées'))}</b> : ${linked.map(([p]) => esc(upName(p))).join(', ')}`);
            if (made.length) li.push(`＋ <b>${esc(plural(made.length, 'fiche créée', 'fiches créées'))}</b> : ${made.map(([p]) => esc(upName(p))).join(', ')}`);
            if (evOk && ex.kind !== 'autre') li.push(`${KIND_ICON[ex.kind] || '📅'} <b>${esc(i18n(KIND_TITLE[ex.kind] || 'Acte'))}</b>${ex.date ? ` · ${esc(ex.date.label)}` : ''}${ex.place ? ` · ${esc(ex.place)}` : ''}`);
            if (dead.length) li.push(`✝ <b>${esc(i18n('Décès estimé avant l’acte'))}</b> : ${dead.map(([p]) => esc(upName(p))).join(', ')}`);
            if (wit.length) li.push(`☆ <b>${esc(i18n('Gardés dans l’acte, sans fiche'))}</b> : ${wit.map(([p]) => esc(upName(p) + (p.job ? ` (${p.job})` : ''))).join(', ')}`);
            li.push(`📚 <b>${esc(i18n('La source'))}</b> : ${esc(src.title || i18n('(sans titre)'))}${st.check.source ? ` · ${esc(i18n('déjà dans ta base, reprise'))}` : ''}`);
            return `<ul class="h-txa-recap">${li.map(x => `<li>${x}</li>`).join('')}</ul>`;
        };
        function paint() {
            const kinds = (ctx.kinds || []).filter(([k]) => ['mariage', 'bapteme', 'naissance', 'deces', 'sepulture', 'autre'].includes(k));
            root.innerHTML = `<div class="h-txa-box">
                <div class="h-txa-head"><span><b>${KIND_ICON[ex.kind] || '📜'} ${esc(i18n(KIND_TITLE[ex.kind] || 'Acte'))}</b>${ctx.unsure ? ` · <span class="h-txa-badge is-warn">${esc(i18n('À relire'))}</span> ${esc(plural(ctx.unsure, 'mot peu sûr', 'mots peu sûrs'))}` : ''}</span>
                    <span class="h-txa-row"><button type="button" class="button small secondary" data-txa-redo>↺ ${esc(i18n('Relever à nouveau'))}</button><label class="h-txa-kind">${esc(i18n('Sorte d’acte'))} <select data-txa-kind>${kinds.map(([k, l]) => `<option value="${esc(k)}" ${ex.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></span></div>
                <section class="h-txa-sec"><h4>${esc(i18n('L’événement'))}</h4><div class="h-txa-grid">
                    <span class="k">${esc(i18n('Date'))}</span><span><input class="h-txa-in" data-txa-date value="${esc(ex.date?.label || '')}">${ex.date?.iso ? `<div class="h-txa-okline">✓ ${esc(i18n('Compris : {date}', {date: ex.date.label}))}</div>` : ''}</span>
                    <span class="k">${esc(i18n('Lieu'))}</span><span>${(window.LCNDA_PICKER || A()).pickerField({name: 'txa_place', kind: 'place', allowFree: true, value: st.place || (ex.place ? `txt:${ex.place}` : null)})}</span></div></section>
                <section class="h-txa-sec"><h4>${esc(i18n('Les personnes ({n})', {n: ex.people.length}))}</h4>
                    ${ex.people.map(p => `<div class="h-txa-pers" data-txa-p="${p.key}"><span class="h-txa-av is-${p.sex}">${esc(initials(p))}</span><div><span class="h-txa-role">${esc(roleLabel(p))}</span><b>${esc(upName(p))}</b>
                        <div class="h-txa-meta">${relText(p) || '&nbsp;'}</div><div class="h-txa-match">${matchLine(p)}</div></div>${seg(p)}</div>`).join('')}</section>
                <section class="h-txa-sec"><h4>${esc(i18n('Ce que l’acte ajoute aussi'))}</h4><div class="h-txa-opts">
                    <label class="checkbox-line"><input type="checkbox" data-txa-opt="job" ${st.opt.job ? 'checked' : ''}> ${esc(i18n('Métiers'))} <small class="muted">${esc([...new Set(ex.people.filter(p => p.job).map(p => p.job))].join(', ') || '—')}</small></label>
                    <label class="checkbox-line"><input type="checkbox" data-txa-opt="birth" ${st.opt.birth ? 'checked' : ''}> ${esc(i18n('Naissance estimée d’après l’âge (marquée « estimée »)'))}</label>
                    <label class="checkbox-line"><input type="checkbox" data-txa-opt="death" ${st.opt.death ? 'checked' : ''}> ${esc(i18n('Décès d’avant l’acte (« feu », « veuve de »)'))}</label>
                    <label class="checkbox-line"><input type="checkbox" data-txa-opt="residence" ${st.opt.residence ? 'checked' : ''}> ${esc(i18n('Domiciles'))}</label>
                    ${ex.signatures.length ? `<p class="h-txa-sig"><span class="k">${esc(i18n('Signatures'))}</span> <i data-i18n-off>${esc(ex.signatures.join(' · '))}</i></p>` : ''}</div></section>
                <section class="h-txa-sec"><h4>📚 ${esc(i18n('La source, toute prête'))}</h4><div class="h-txa-src"><div class="h-txa-grid">
                    ${[['title', 'Source'], ['register', 'Registre'], ['years', 'Années'], ['cote', 'Cote'], ['view', 'Vue'], ['view_total', 'Vues en tout'], ['act', 'Acte'], ['url', 'Lien']].map(([k, l]) => `<span class="k">${esc(i18n(l))}</span><span><input class="h-txa-in" data-txa-src="${k}" value="${esc(src[k] || '')}"${k === 'url' ? ' placeholder="https://…"' : ''}></span>`).join('')}</div>
                    ${notice('info', esc(st.check.source ? i18n('La même source est déjà dans ta base : elle est reprise au lieu d’en créer une deuxième.') : frame ? i18n('Remplie d’après le champ Source, le nom du fichier et le texte lu autour de l’image. Vérifie avant d’ajouter.') : i18n('Remplie d’après le champ Source et le nom du fichier. Vérifie avant d’ajouter.')))}</div></section>
                <section class="h-txa-sec is-last"><h4>${esc(i18n('Voilà ce qui va entrer dans ta généalogie'))}</h4><div data-txa-recap>${recap()}</div>
                    <p class="ui-hint">${esc(i18n('Rien n’est écrasé : une information différente de la fiche est proposée, jamais imposée. « ↶ Annuler » défait tout l’ajout d’un coup.'))}</p></section></div>`;
        }
        paint();
        const repaintPerson = k => { const p = byKey(k), el = root.querySelector(`[data-txa-p="${k}"]`); if (!p || !el) return; el.querySelector('.h-txa-match').innerHTML = matchLine(p); el.querySelector('.h-txa-seg').outerHTML = seg(p); root.querySelector('[data-txa-recap]').innerHTML = recap(); };
        async function linkOther(p) {
            const P = window.LCNDA_PICKER || A(); if (!P.openPicker) return;
            const it = await P.openPicker({kind: 'person', title: i18n('Relier « {name} » à une fiche', {name: upName(p)}), q: p.name}); if (!it) return;
            const s = st.people.get(p.key); s.action = 'link'; s.person_id = Number(it.id); s.cand = {id: Number(it.id), title: it.title}; repaintPerson(p.key);
        }
        root.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-txa-redo]')) { ex = enrich(C().extractAct(ctx.text, {kind: root.querySelector('[data-txa-kind]').value, place: ctx.place, date: ctx.date, helpers: ctx.helpers})); initState(); src = guessSrc(); await check(); paint(); return; }
            if (b.dataset.txaCand) { const [k, id] = b.dataset.txaCand.split(':'), s = st.people.get(k), c = (st.check.candidates?.[k] || []).find(x => x.id === Number(id)); if (s.action === 'link' && s.person_id === Number(id)) { s.action = 'create'; s.person_id = 0; s.cand = null; } else { s.action = 'link'; s.person_id = Number(id); s.cand = c; } repaintPerson(k); return; }
            if (b.dataset.txaAct) {
                const [k, act] = b.dataset.txaAct.split(':'), p = byKey(k), s = st.people.get(k), c = st.check.candidates?.[k] || [];
                if (act === 'link') { if (s.person_id) { s.action = 'link'; repaintPerson(k); } else if (c.length) { s.action = 'link'; s.person_id = c[0].id; s.cand = c[0]; repaintPerson(k); } else await linkOther(p); return; }
                if (act === 'compare') { const cand = s.cand || c[0]; if (!cand) { await linkOther(p); if (!st.people.get(k).person_id) return; } openCompare(p, st.people.get(k).cand || c[0]); return; }
                s.action = act; if (act !== 'link') { s.person_id = 0; s.cand = null; } repaintPerson(k); return;
            }
        });
        root.addEventListener('change', e => {
            if (e.target.matches('[data-txa-opt]')) { st.opt[e.target.dataset.txaOpt] = e.target.checked; root.querySelector('[data-txa-recap]').innerHTML = recap(); }
            if (e.target.matches('[data-txa-kind]')) root.querySelector('[data-txa-redo]').click();
        });
        root.addEventListener('input', e => {
            if (e.target.matches('[data-txa-src]')) { src[e.target.dataset.txaSrc] = e.target.value; if (e.target.dataset.txaSrc === 'title') root.querySelector('[data-txa-recap]').innerHTML = recap(); }
            if (e.target.matches('[data-txa-date]')) { ex.date = {...(ex.date || {}), label: e.target.value, iso: ''}; }
        });
        /* D. Comparer / fusionner : l'acte et la fiche côte à côte, champ par champ */
        async function openCompare(p, cand) {
            let f = cand?.detail; if (!f && cand) { try { f = ((await api('act_people_details', {ids: String(cand.id)})).people || [])[0]; } catch (_) {} }
            if (!f) return;
            const nm = s => C().norm(s).replace(/[^a-z ]/g, '').trim();
            const actParents = ex.people.filter(q => q.relations.some(r => r.type === 'parent_of' && r.of === p.key)), af = actParents.find(q => q.sex !== 'f'), am = actParents.find(q => q.sex === 'f');
            const same = (a, b) => a && b && nm(a.name || '').split(' ').pop() === nm(b.name || '').split(' ').pop() && nm(a.name).split(' ')[0] === nm(b.name).split(' ')[0];
            const pOk = (af || am) && (!af || same(af, f.father)) && (!am || same(am, f.mother)) && (f.father || f.mother), pBad = (af && f.father && !same(af, f.father)) || (am && f.mother && !same(am, f.mother));
            const ev = ex.kind === 'mariage' && (p.role === 'epoux' || p.role === 'epouse') ? ex.people.find(q => q.role === (p.role === 'epoux' ? 'epouse' : 'epoux')) : null;
            const yes = p.sex === 'f' ? i18n('C’est elle : relier') : i18n('C’est lui : relier'), no = p.sex === 'f' ? i18n('Ce n’est pas elle') : i18n('Ce n’est pas lui');
            const row = (lab, a, b, cls = '', box = '') => `<tr><td>${esc(lab)}</td><td class="${cls}">${a}${box}</td><td>${b}</td></tr>`;
            const chk = k => ` <label class="h-txa-add"><input type="checkbox" data-txa-cadd="${k}" checked> ${esc(i18n('ajouter'))}</label>`;
            const fb = f.birth ? esc([f.birth.date, f.birth.place].filter(Boolean).join(', ')) : '—';
            const d2 = ext.openDialog({eyebrow: i18n('COMPARER'), title: `⇆ ${i18n('{name} : l’acte et la fiche côte à côte', {name: upName(p)})}`, wide: true, submitLabel: `🔗 ${yes}`, closeLabel: no,
                body: `<table class="h-txa-cmp"><thead><tr><th></th><th>${esc(i18n('Dans l’acte'))}</th><th>${esc(i18n('Fiche · {name}', {name: f.name}))}</th></tr></thead><tbody>
                    ${row(i18n('Naissance'), esc(p.birthYear ? i18n('vers {year} ({n} ans)', {year: p.birthYear, n: p.age}) : '—'), fb, p.birthYear && f.birth ? 'is-diff' : p.birthYear ? 'is-new' : '', p.birthYear && !f.birth ? chk('birth') : '')}
                    ${row(i18n('Métier'), esc(p.job || '—'), esc(f.occupation || '—'), p.job && C().norm(p.job) !== C().norm(f.occupation) ? 'is-new' : '', p.job && C().norm(p.job) !== C().norm(f.occupation) ? chk('job') : '')}
                    ${row(i18n('Père'), esc(af ? af.name + (af.deceased ? ` (${i18n('décédé')})` : '') : '—'), f.father ? `${esc(f.father.name)}${af && same(af, f.father) ? ' ✓' : ''}` : '—', af && f.father && !same(af, f.father) ? 'is-diff' : '')}
                    ${row(i18n('Mère'), esc(am ? am.name : '—'), f.mother ? `${esc(f.mother.name)}${am && same(am, f.mother) ? ' ✓' : ''}` : '—', am && f.mother && !same(am, f.mother) ? 'is-diff' : '')}
                    ${ev ? row(i18n('Mariage'), esc(i18n('{date} avec {name}', {date: ex.date?.label || '?', name: ev.name})), esc((f.spouses || []).map(s => s.name).join(', ') || '—'), 'is-new', '') : ''}
                    ${p.deceased ? row(i18n('Décès'), esc(i18n('avant le {date}', {date: ex.date?.label || '?'})), f.death ? esc([f.death.date, f.death.place].filter(Boolean).join(', ')) : '—', f.death ? '' : 'is-new', f.death ? '' : chk('death')) : ''}
                    </tbody></table>${pOk ? notice('ok', esc(i18n(p.sex === 'f' ? 'Les parents sont les mêmes : c’est très probablement elle.' : 'Les parents sont les mêmes : c’est très probablement lui.'))) : pBad ? notice('warn', esc(i18n('Les parents ne sont pas les mêmes : vérifie avant de relier.'))) : ''}
                    ${f.birth && p.birthYear ? `<p class="ui-hint">${esc(i18n('La date de naissance de la fiche est gardée (elle est plus précise que l’âge de l’acte).'))}</p>` : ''}`,
                onOpen: d => { d.querySelector('.modal-actions [data-h-close]')?.addEventListener('click', () => { const s = st.people.get(p.key); s.action = 'create'; s.person_id = 0; s.cand = null; repaintPerson(p.key); }); },
                onSubmit: frm => { const s = st.people.get(p.key); s.action = 'link'; s.person_id = f.id; s.cand = cand || {id: f.id, title: f.name}; s.add = Object.fromEntries([...frm.querySelectorAll('[data-txa-cadd]')].map(i => [i.dataset.txaCadd, i.checked])); repaintPerson(p.key); }});
            return d2;
        }
        /* F. ✓ Ajouter à la généalogie : un seul appel, tout ou rien */
        async function apply() {
            const pv = (window.LCNDA_PICKER || A()).pickerValue?.(root.querySelector('[data-picker="place"]'));
            const placeId = typeof pv === 'number' || /^\d+$/.test(String(pv || '')) ? Number(pv) : 0, placeName = typeof pv === 'string' && pv.startsWith('txt:') ? pv.slice(4) : (placeId ? '' : ex.place);
            const people = ex.people.map(p => { const s = st.people.get(p.key), a = s.add || {};
                return {key: p.key, action: s.action === 'compare' ? 'create' : s.action, person_id: s.person_id, first: p.given, last: p.surname, name: p.name, sex: p.sex, role: p.role, job: p.job, age: p.age, birth_year: p.birthYear, residence: p.residence, deceased: p.deceased,
                    add: {job: st.opt.job && a.job !== false, birth: st.opt.birth && (s.action === 'create' || a.birth !== false), death: st.opt.death && a.death !== false, residence: st.opt.residence}}; });
            const body = {transcription_id: ctx.transcriptionId || 0, media_id: ctx.mediaId || 0, text: ctx.text, event: {kind: ex.kind, date: ex.date?.label || '', place: placeName, place_id: placeId}, people, relations: ex.relations, source: {...src, id: st.check.source?.id || 0}};
            const r = await post('act_import_apply', body), res = r.result || {};
            const parts = [plural((res.created || 0) + (res.linked || 0), 'fiche', 'fiches')]; if (res.events) parts.push(plural(res.events, 'événement ajouté', 'événements ajoutés')); if (res.source_id) parts.push(plural(1, 'source', 'sources'));
            const kept = ex.people.map(p => { const s = st.people.get(p.key); return {name: upName(p), role: p.role, person_id: res.map?.[p.key] || 0, s: p.s, e: p.e, action: s.action}; });
            ctx.onApplied?.({result: res, people: kept, source: src});
            let undone = false;
            (A().undoToast || toast)(i18n('✓ Acte ajouté : {what}', {what: parts.join(', ')}), {undo: async () => { if (undone) return {already: true}; await post('act_import_undo', {token: res.undo}); undone = true; ctx.onUndone?.(); }});
            if (res.skipped?.length) toast(i18n('Déjà d’autres parents, lien non fait : {names}', {names: res.skipped.join(', ')}));
        }
        return dlg;
    }

    ext.txActe = {detectCrop, askCrop, lowNoticeHtml, openDeep, openFound};
})();
