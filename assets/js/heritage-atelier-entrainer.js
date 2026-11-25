/* LCNDA — 📜 Atelier de transcription, idée 35 : 🎓 entraîner la lecture sur mes lignes relues (maquette approuvée
 * docs/design/atelier-idees.html ; réponse 1 : le modèle entraîné est choisi PAR REGISTRE, le modèle de départ partout ailleurs).
 * Outils → « 🎓 Entraîner la lecture… » (et une phrase discrète après une relecture, quand une main a assez de lignes relues).
 * Deux moteurs, tout sur cet ordinateur, rien n'est téléchargé sans un clic :
 *   ⚡ Lecture rapide (Kraken) — conseillé d'abord, marche partout (Mac compris) : ketos train depuis le modèle installé, ~150 lignes ;
 *   🧠 Qwen (avec Unsloth) — LoRA du modèle de vision sur les images de lignes + texte corrigé, export pour Ollama / Unsloth ;
 *      carte graphique de 8 Go ou plus (PC) ; sur Mac : pas garanti, on le dit. Le serveur d'IA « Unsloth » des réglages est repris.
 * L'app vérifie l'ordinateur (carte graphique, outils installés) et explique ce qui est possible. Le travail tourne en tâche de fond :
 * avancée (passe n / N, temps restant), ■ Arrêter (le meilleur état est gardé), 1 ligne sur 10 mise de côté → justesse avant / après.
 * « ✨ Lire l'acte » prend tout seul le modèle choisi pour le registre de l'acte (ext.txModelFor, lu par heritage-transcribe.js).
 * Serveur : lib/atelier_entrainer.php, scripts/atelier_train.php. Essai : tests/test-atelier-idees.js (faux entraîneur).
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = q => A().api('atelier_idees', q);
    const post = b => A().api('atelier_idees_write', {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const ENGINE_KEY = 'genealogie-tx-train-engine';
    const pct = v => (v == null ? '—' : `${window.LCNDA_I18N?.fmtNumber ? window.LCNDA_I18N.fmtNumber(v) : String(v).replace('.', ',')} %`);
    const mins = m => (m >= 60 ? i18n('{h} h {m} min', {h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0')}) : i18n('{n} min', {n: Math.max(1, m)}));
    const plugs = new Set();
    let models = [];

    /** 🎓 le modèle choisi pour le registre de cet acte ('' : le modèle de départ) */
    ext.txModelFor = t => { const p = [...plugs].find(q => q.t === t && q.dlg.isConnected); return p?.reg?.model || ''; };

    /* ─── la fenêtre ─── */
    let poll = 0, watching = '';
    async function open(plug = null) {
        const dg = document.createElement('dialog'); dg.className = 'modal ait-dlg'; document.body.appendChild(dg);
        dg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">📜 ${esc(i18n('ATELIER'))}</span><h2>🎓 ${esc(i18n('Entraîner la lecture sur mes lignes relues'))} <span class="ait-local">💻 ${esc(i18n('sur cet ordinateur'))}</span></h2></div><button type="button" class="icon-button" data-ait-x aria-label="${esc(i18n('Fermer'))}">×</button></div><div class="ait-body" data-ait-body>${window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(i18n('Vérification de cet ordinateur…')) : ''}</div>`;
        dg.showModal(); dg.addEventListener('close', () => { dg.remove(); if (!watching) clearInterval(poll); });
        const body = dg.querySelector('[data-ait-body]');
        let st = null, sel = '', engine = (() => { try { return localStorage.getItem(ENGINE_KEY) === 'qwen' ? 'qwen' : 'kraken'; } catch (_) { return 'kraken'; } })(), job = null;
        const myHand = plug?.t?.data?.reg?.hand || '';
        async function load(probe = false) {
            try { st = await get({op: probe ? 'train_probe' : 'train_status'}); } catch (e) { body.innerHTML = `<div class="ui-msg is-error">⛔ ${esc(e.message)}</div>`; return; }
            models = st.models || [];
            if (!sel) sel = (st.hands.find(h => h.hand && myHand && h.hand.toLowerCase() === myHand.toLowerCase()) || st.hands.find(h => h.can) || st.hands[0] || {}).hand || '';
            if (st.running && !job) { job = st.running; watch(st.running.id); }
            paint();
        }
        const machine = () => {
            const m = st.machine, g = m.gpu, os = {mac: 'Mac', windows: 'Windows', linux: 'Linux'}[m.os] || m.os;
            const gpu = g.kind === 'nvidia' ? `⚡ ${esc(g.name)} (${esc(i18n('{n} Go', {n: g.vram_gb}))})` : g.kind === 'apple' ? `🍎 ${esc(g.name || 'Apple Silicon')}` : `🐢 ${esc(i18n('pas de carte graphique reconnue (ça marche, en plus lent)'))}`;
            const kr = st.kraken.ready ? `✍ ${esc(i18n('Kraken prêt'))} ✓` : `✍ ${esc(i18n('Kraken à installer'))}`;
            const un = st.qwen.unsloth, us = un.installed ? `🦥 ${esc(i18n('Unsloth prêt'))} ✓` : un.checked ? `🦥 ${esc(i18n('Unsloth absent'))}` : `🦥 Unsloth : <button type="button" class="link-button" data-ait-probe>${esc(i18n('vérifier'))}</button>`;
            return `<p class="ait-machine">💻 <b>${esc(os)}</b> · ${gpu} · ${kr} · ${us}${un.provider ? ` · <span title="${esc(i18n('Le serveur d’IA choisi dans les réglages'))}">🖥 ${esc(un.provider_name || 'Unsloth')}</span>` : ''}</p>`;
        };
        const handRow = h => {
            const n = h.lines, w = Math.min(100, Math.round(100 * n / st.advised)), regs = (h.registers || []).map(r => r.label).filter(Boolean).join(' · ');
            const state = !h.hand ? `<span class="ui-badge is-grey">${esc(i18n('« Main » à remplir'))}</span>` : h.ready ? `<span class="ui-badge is-green">✓ ${esc(i18n('prêt'))}</span>` : `<span class="ui-badge is-yellow">${esc(i18n('encore {n}', {n: st.advised - n}))}</span>`;
            return `<tr class="${h.hand === sel ? 'is-sel' : ''}${h.hand ? '' : ' is-unknown'}" data-ait-hand="${esc(h.hand)}" tabindex="0"><td data-i18n-off>${h.hand ? esc(h.hand) : `<i>${esc(i18n('Main inconnue'))}</i>`}</td><td class="muted" data-i18n-off>${esc(regs)}</td>
                <td><span class="ait-bar"><b style="width:${w}%"></b></span> <small>${esc(i18n('{n} / {m} conseillées', {n, m: st.advised}))}</small></td><td>${state}</td></tr>`;
        };
        const whyQwen = q => ({unchecked: i18n('Vérifie d’abord si Unsloth est installé sur cet ordinateur.'), unsloth: i18n('Unsloth n’est pas installé : il s’installe à part (Python, avec une carte graphique NVIDIA). Rien n’est téléchargé par l’app.'),
            gpu: i18n('Il faut une carte graphique NVIDIA de 8 Go ou plus : sur cet ordinateur, la lecture rapide (Kraken) est le bon choix.'), mac: i18n('Sur Mac, Unsloth n’est pas garanti : l’essai peut échouer ou être très lent. Kraken marche bien sur Mac.')})[q.why] || '';
        const whyKraken = k => ({engine: i18n('La lecture rapide n’est pas installée : Réglages → Reconnaissance d’écriture (HTR).'), ketos: i18n('Kraken est installé sans son outil d’entraînement (ketos) : réinstalle-le depuis Réglages → Reconnaissance d’écriture (HTR).'), model: i18n('Aucun modèle de départ installé : Réglages → Reconnaissance d’écriture (HTR), étape ②.')})[k.why] || '';
        function paint() {
            if (!st) return; const h = st.hands.find(x => x.hand === sel), q = st.qwen, k = st.kraken;
            const est = h ? h.estimate[engine] : null;
            const canGo = !!h?.can && (engine === 'kraken' ? k.ready : q.ready || (q.mac && q.unsloth.installed)) && !job;
            const regs = [...new Map(st.hands.flatMap(x => x.registers || []).filter(r => r.key).map(r => [r.key, r])).values()];
            body.innerHTML = `${machine()}
                ${st.hands.length ? `<table class="ait-hands"><thead><tr><th>${esc(i18n('Main'))}</th><th>${esc(i18n('Registre'))}</th><th>${esc(i18n('Lignes relues'))}</th><th></th></tr></thead><tbody>${st.hands.map(handRow).join('')}</tbody></table>`
                    : `<p class="ait-empty">👁 ${esc(i18n('Aucune ligne relue pour l’instant. Relis des actes ligne à ligne (👁 Relire ligne à ligne) et remplis leur « Main » (📚 Registre et main) : à partir de 150 lignes d’une même main, la lecture peut l’apprendre.'))}</p>`}
                ${h && !h.hand ? `<p class="ui-hint">✍ ${esc(i18n('Ces lignes n’ont pas de main : remplis « Main » dans 📚 Registre et main (menu Édition de l’Atelier), elle est reprise d’un acte à l’autre.'))}</p>` : ''}
                ${h?.hand ? `<fieldset class="ait-engines"><legend>${esc(i18n('Avec quel moteur ?'))}</legend>
                    <label class="ait-eng${engine === 'kraken' ? ' is-on' : ''}"><input type="radio" name="ait-eng" value="kraken" ${engine === 'kraken' ? 'checked' : ''}><span><b>⚡ ${esc(i18n('Lecture rapide (Kraken)'))}</b> <span class="ui-badge is-blue">${esc(i18n('conseillé'))}</span><small>${esc(i18n('Affine le modèle de lecture installé sur les lignes de cette main. Marche partout, Mac compris.'))}${k.ready ? '' : ` <b class="ait-why">${esc(whyKraken(k))}</b>`}</small></span></label>
                    <label class="ait-eng${engine === 'qwen' ? ' is-on' : ''}"><input type="radio" name="ait-eng" value="qwen" ${engine === 'qwen' ? 'checked' : ''}><span><b>🧠 ${esc(i18n('Qwen (avec Unsloth)'))}</b><small>${esc(i18n('Apprend au modèle de vision (lecture approfondie) les images de lignes et leur texte corrigé ; export pour Ollama ou Unsloth. Carte graphique de 8 Go ou plus conseillée.'))}${q.why ? ` <b class="ait-why">${esc(whyQwen(q))}</b>` : ''}</small></span></label></fieldset>
                    ${engine === 'qwen' && q.mac && q.unsloth.installed ? `<label class="ait-opt"><input type="checkbox" data-ait-mac> ${esc(i18n('Essayer quand même sur ce Mac (pas garanti)'))}</label>` : ''}
                    ${engine === 'qwen' && q.unsloth.installed && !q.base_cached ? `<label class="ait-opt"><input type="checkbox" data-ait-dl> ${esc(i18n('Télécharger une fois le modèle de départ de Qwen (environ 3 Go, depuis Hugging Face)'))}</label>` : ''}
                    <p class="ait-how">${esc(i18n('1 ligne sur 10 est mise de côté et jamais montrée pendant l’entraînement : elle mesure la lecture avant et après.'))}${est ? ` ${esc(i18n('Durée sur cet ordinateur : environ {a} à {b}.', {a: mins(est.min), b: mins(est.max)}))}` : ''}${h.lines < st.advised ? ` ${esc(i18n('On peut essayer dès {min} lignes ; {adv} sont conseillées.', {min: st.min, adv: st.advised}))}` : ''}</p>
                    <div class="ait-go"><button type="button" class="button" data-ait-go ${canGo ? '' : 'disabled'}>🎓 ${esc(i18n('Entraîner'))}</button><span class="muted" data-i18n-off>${esc(i18n('Le modèle obtenu s’appellera « {t} ».', {t: i18n('Main de {h}', {h: h.hand})}))}</span></div>` : ''}
                <div class="ait-job" data-ait-job></div>
                ${regs.length && models.some(m => m.engine === 'kraken') ? `<details class="ait-regs"><summary>${esc(i18n('Quel modèle pour quel registre'))}</summary><p class="muted">${esc(i18n('« ✨ Lire l’acte » prend tout seul le modèle choisi pour le registre de l’acte ; le modèle de départ reste toujours là.'))}</p>
                    ${regs.map(r => `<label class="ait-reg"><span data-i18n-off>${esc(r.label || r.key)}</span><select data-ait-reg="${esc(r.key)}"><option value="">${esc(i18n('Modèle de départ'))}</option>${models.filter(m => m.engine === 'kraken').map(m => `<option value="${esc(m.file)}" ${st.assigned?.[r.key] === m.file ? 'selected' : ''}>${esc(m.title)}${m.after != null ? ` · ${esc(pct(m.after))}` : ''}</option>`).join('')}</select></label>`).join('')}</details>` : ''}
                ${models.some(m => m.engine === 'qwen') ? `<details class="ait-regs"><summary>${esc(i18n('Modèles Qwen entraînés'))}</summary>${models.filter(m => m.engine === 'qwen').map(m => `<p><b data-i18n-off>${esc(m.title)}</b> · ${esc(pct(m.before))} → ${esc(pct(m.after))} ${m.modelfile ? `<button type="button" class="button small secondary" data-ait-ollama="${esc(m.id)}">${esc(i18n('Ajouter à Ollama'))}</button>` : ''}<br><small class="muted">${esc(i18n('L’adaptateur LoRA est dans : {d}', {d: m.dir}))}</small></p>`).join('')}</details>` : ''}`;
            paintJob();
        }
        function paintJob() {
            const el = body.querySelector('[data-ait-job]'); if (!el) return; if (!job) { el.innerHTML = ''; return; }
            const run = job.state === 'running', ph = {start: i18n('Préparation…'), before: i18n('Mesure de la lecture avant…'), train: i18n('Entraînement…'), after: i18n('Mesure de la lecture après…'), download: i18n('Téléchargement du modèle de départ…'), done: ''}[job.phase] ?? '';
            const p = Math.max(0, Math.min(100, job.pct || 0));
            el.innerHTML = run ? `<div class="ait-run"><b data-i18n-off>🎓 ${esc(job.title || '')}</b> <span class="muted">${esc(ph)}</span>
                    <div class="ait-prog"><progress max="100" value="${p}"></progress> <span>${job.epochs ? esc(i18n('passe {n} / {m}', {n: job.epoch || 0, m: job.epochs})) : ''}${job.eta != null ? ` · ${esc(i18n('temps restant ≈ {t}', {t: mins(Math.round(job.eta / 60))}))}` : ''}</span></div>
                    <p class="muted">${job.before != null ? esc(i18n('Lecture avant : {p}', {p: pct(job.before)})) : ''}${job.val != null ? ` · ${esc(i18n('en cours : {p}', {p: pct(job.val)}))}` : ''}</p>
                    <button type="button" class="button small secondary" data-ait-stop>■ ${esc(i18n('Arrêter'))}</button> <small class="muted">${esc(i18n('Tu peux fermer cette fenêtre : l’entraînement continue, le meilleur état atteint est gardé si tu l’arrêtes.'))}</small></div>`
                : job.state === 'error' ? `<div class="ui-msg is-error">⛔ ${esc(job.error || i18n('L’entraînement n’a pas abouti.'))}</div>${job.log ? `<details><summary>${esc(i18n('Journal'))}</summary><pre class="ait-log">${esc(job.log)}</pre></details>` : ''}`
                : job.state === 'cancelled' && !job.kept ? `<p class="ui-hint">■ ${esc(i18n('Entraînement arrêté avant la première passe : rien n’est gardé.'))}</p>`
                : `<div class="ait-done"><b>✓ ${esc(job.state === 'cancelled' ? i18n('Arrêté : le meilleur état atteint est gardé.') : i18n('Entraînement fini.'))}</b>
                    <p class="ait-score">${esc(i18n('Avant : {a} → après : {b}', {a: pct(job.before), b: pct(job.after)}))} <small class="muted">${esc(i18n('(sur {n} lignes jamais vues pendant l’entraînement)', {n: job.heldout_n || 0}))}</small></p>
                    ${job.engine === 'kraken' ? `<p class="muted">${esc(i18n('« ✨ Lire l’acte » l’utilise désormais pour les registres de cette main ; ailleurs, le modèle de départ.'))}</p>` : `<p class="muted">${esc(i18n('Pour lire avec : « Ajouter à Ollama », puis Lecture approfondie → Autre modèle ; ou charge l’adaptateur dans Unsloth (serveur d’IA des réglages).'))}</p>${job.modelfile ? `<button type="button" class="button small secondary" data-ait-ollama="${esc(job.id)}">${esc(i18n('Ajouter à Ollama'))}</button>` : ''}`}</div>`;
        }
        function watch(id) {
            watching = id; clearInterval(poll);
            const tick = async () => {
                let j; try { j = await get({op: 'train_job', id}); } catch (_) { return; }
                job = j; if (dg.isConnected) paintJob();
                if (j.state !== 'running') {
                    clearInterval(poll); watching = '';
                    if (j.assigned_now && Object.keys(j.assigned_now).length) {
                        const was = j.assigned_now;
                        A().undoToast?.(i18n('🎓 « {t} » : lu désormais pour {n}', {t: j.title, n: A().plural ? A().plural(Object.keys(was).length, 'registre') : Object.keys(was).length}), {icon: '🎓', undo: async () => { await post({op: 'train_assign', reg_keys: was}); plugs.forEach(p => p.suivant?.refresh()); if (dg.isConnected) load(); }});
                        plugs.forEach(p => p.suivant?.refresh());
                    } else if (j.state === 'error') A().toast(i18n('🎓 L’entraînement n’a pas abouti : {e}', {e: j.error || ''}), 'error');
                    if (dg.isConnected) load();
                }
            };
            poll = setInterval(tick, 1200); tick();
        }
        dg.addEventListener('click', async e => {
            if (e.target.closest('[data-ait-x]')) return dg.close();
            if (e.target.closest('[data-ait-probe]')) { body.querySelector('[data-ait-probe]').textContent = i18n('vérification…'); return load(true); }
            const tr = e.target.closest('[data-ait-hand]'); if (tr) { sel = tr.dataset.aitHand; return paint(); }
            if (e.target.closest('[data-ait-stop]')) { if (job) { try { await post({op: 'train_cancel', id: job.id}); } catch (err) { A().toast(err.message, 'error'); } } return; }
            const ol = e.target.closest('[data-ait-ollama]'); if (ol) { ol.disabled = true; try { const r = await post({op: 'train_ollama', id: ol.dataset.aitOllama}); A().toast(i18n('Ajouté à Ollama : {n}', {n: r.name})); } catch (err) { A().toast(err.message, 'error'); ol.disabled = false; } return; }
            const go = e.target.closest('[data-ait-go]'); if (!go || go.disabled) return;
            go.disabled = true;
            try {
                const r = await post({op: 'train_start', engine, hand: sel, accept_mac: body.querySelector('[data-ait-mac]')?.checked ? 1 : 0, allow_download: body.querySelector('[data-ait-dl]')?.checked ? 1 : 0});
                job = {id: r.id, state: 'running', phase: 'start', title: r.title, epochs: r.epochs, epoch: 0, engine: r.engine, heldout_n: r.heldout}; paint(); watch(r.id);
            } catch (err) { A().toast(err.message, 'error'); go.disabled = false; }
        });
        dg.addEventListener('keydown', e => { const tr = e.target.closest?.('[data-ait-hand]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sel = tr.dataset.aitHand; paint(); } });
        dg.addEventListener('change', async e => {
            if (e.target.name === 'ait-eng') { engine = e.target.value; try { localStorage.setItem(ENGINE_KEY, engine); } catch (_) {} return paint(); }
            const rs = e.target.closest('[data-ait-reg]'); if (rs) {
                const key = rs.dataset.aitReg, was = st.assigned?.[key] || '';
                try { await post({op: 'reg_model', reg_key: key, model: rs.value}); st.assigned = {...(st.assigned || {}), [key]: rs.value}; plugs.forEach(p => p.suivant?.refresh());
                    A().undoToast?.(i18n('Modèle de lecture choisi pour ce registre'), {icon: '🎓', undo: async () => { await post({op: 'reg_model', reg_key: key, model: was}); st.assigned[key] = was; plugs.forEach(p => p.suivant?.refresh()); if (dg.isConnected) paint(); }}); }
                catch (err) { A().toast(err.message, 'error'); }
            }
        });
        load();
        return dg;
    }
    ext.atelierTrain = {open};

    /* ─── « 📚 Registre et main » : le modèle de lecture de ce registre (seulement s'il y a des modèles entraînés) ─── */
    ext.txRegExtra = ext.txRegExtra || [];
    ext.txRegExtra.push(plug => {
        const ms = models.filter(m => m.engine === 'kraken'); if (!ms.length || !plug.reg?.reg_key) return '';
        return `<label class="ais-f"><span>${esc(i18n('Modèle de lecture'))}</span><select data-ait-regsel><option value="">${esc(i18n('Modèle de départ'))}</option>${ms.map(m => `<option value="${esc(m.file)}" ${plug.reg.model === m.file ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></label>`;
    });
    ext.txRegExtraBind = ext.txRegExtraBind || [];
    ext.txRegExtraBind.push((dg, plug) => dg.querySelector('[data-ait-regsel]')?.addEventListener('change', async e => {
        const key = plug.reg.reg_key, was = plug.reg.model || '';
        try { await post({op: 'reg_model', reg_key: key, model: e.target.value}); await plug.suivant?.refresh();
            A().undoToast?.(i18n('Modèle de lecture choisi pour ce registre'), {icon: '🎓', undo: async () => { await post({op: 'reg_model', reg_key: key, model: was}); plug.suivant?.refresh(); }}); }
        catch (err) { A().toast(err.message, 'error'); }
    }));

    ext.txPlugins = ext.txPlugins || [];
    ext.txPlugins.push(plug => {
        plugs.add(plug);
        get({op: 'train_models'}).then(r => { models = r.models || []; if (r.running && !watching) { /* un entraînement tourne : la fenêtre le montre à l'ouverture */ } }).catch(() => {});
        // une phrase discrète après une relecture : « 214 lignes relues de cette main : tu peux entraîner la lecture »
        const seen = new Set();
        const mo = new MutationObserver(muts => {
            if (!plug.dlg.isConnected) { plugs.delete(plug); mo.disconnect(); return; }
            if (!muts.some(m => [...m.removedNodes].some(n => n.classList?.contains('h-txr-dlg')))) return;
            const hand = plug.t.data.reg?.hand; if (!hand || seen.has(hand)) return;
            get({op: 'train_status'}).then(st => {
                const h = st.hands.find(x => x.hand.toLowerCase() === hand.toLowerCase()); if (!h?.ready || (st.models || []).some(m => (m.hand || '').toLowerCase() === hand.toLowerCase())) return;
                seen.add(hand);
                A().toast(i18n('{n} lignes relues de cette main : tu peux entraîner la lecture.', {n: h.lines}), '', {action: {label: `🎓 ${i18n('Entraîner…')}`, run: () => open(plug)}});
            }).catch(() => {});
        });
        mo.observe(document.body, {childList: true});
    });
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => (menu === 'Outils' ? [{icon: '🎓', label: `${i18n('Entraîner la lecture')}…`, run: () => open(plug)}] : []));
})();
