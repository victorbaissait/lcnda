/* LCNDA — 🎨 Catalogues d'artistes : le panneau « ⚙️ Champs affichés » (maquette D) et la création de types.
 * Onglets La fiche / La liste (colonnes) / Les vignettes / L'export ; groupes repliables, ⠿ (glisser) et ↑ ↓, 👁 afficher/masquer,
 * ✎ 🗑 sur ses propres champs, « Remettre un champ enlevé », ↺ Réinitialiser ; réglage pour tous ou propre à l'artiste ;
 * « 💾 Réglages enregistrés » (outil « artistes » : enregistrer sous un nom, ⤓ exporter, ⤒ importer).
 * Un champ masqué garde ce qui y est écrit (il ne s'affiche plus, ni à la lecture ni à l'export).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART) return;
    const A = () => window.LCNDA_APP, ext = window.LCNDA_EXT || {};
    const U = ART.util, esc = U.esc;
    const TAB_LABEL = {fiche: 'La fiche', liste: 'La liste', vignettes: 'Les vignettes', export: 'L’export'};
    const badge = f => { const t = ART.ft[f.type] || {}; if (f.type === 'computed') return 'auto'; if (f.type === 'people') return '👤 rôles'; return t.badge || f.type; };

    /* — où écrire : réglage pour tous (global) ou propre à l'artiste — */
    const target = store => { if (store.personSet?.own) return store.personSet; store.global = store.global || {}; return store.global; };
    const kcfg = (obj, kind) => { obj.kinds = obj.kinds || {}; return (obj.kinds[kind] = obj.kinds[kind] || {}); };
    const tcfg = (store, kind, tab) => { const K = kcfg(target(store), kind); return (K[tab] = K[tab] || {}); };
    async function persist(store) {
        store.settings = store.personSet?.own ? store.personSet : store.global;
        await ART.write('save_settings', {key: 'global', data: store.global || {}});
        if (store.personSet) await ART.write('save_settings', {key: `person:${store.pid}`, data: store.personSet});
    }
    ART.persistSettings = persist;

    /** le panneau, dans la colonne de droite de la fenêtre du catalogue */
    ART.openFieldsPanel = (C, kind, tab = 'fiche') => {
        const aside = C.dlg.querySelector('[data-ar-panel]'); let q = '';
        const st = {kind, tab};
        const close = () => { aside.hidden = true; aside.innerHTML = ''; C.panel = null; C.dlg.classList.remove('has-panel'); };
        C.panel = {close, refresh: () => paint()};
        aside.hidden = false; C.dlg.classList.add('has-panel');
        const rowHtml = (f, i, n, gkey) => `<div class="ar-fr ${f.on ? '' : 'off'} ${f.custom ? 'cust' : ''}" data-fkey="${esc(f.key)}" data-g="${esc(gkey || '')}" draggable="true">
            <span class="ar-grip" title="Glisser pour ranger">⠿</span><button type="button" class="ar-eye" data-p-eye="${esc(f.key)}" title="${f.on ? 'Masquer' : 'Afficher'}">${f.on ? '👁' : '🚫'}</button><span class="lbl">${esc(f.label)}</span><span class="ty">${esc(badge(f))}</span>
            <span class="tools"><button type="button" data-p-mv="-1" title="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" data-p-mv="1" title="Descendre" ${i < n - 1 ? '' : 'disabled'}>↓</button>${f.custom ? `<button type="button" data-p-ren="${esc(f.key)}" title="Renommer">✎</button><button type="button" data-p-del="${esc(f.key)}" title="Enlever ce champ (il se remet avec « Remettre un champ enlevé »)">🗑</button>` : ''}</span></div>`;
        function paint() {
            const store = C.store, def = ART.defs[st.kind]; if (!def) return close();
            const L = ART.layout(store, st.kind, st.tab), match = f => !q || `${f.label} ${f.key}`.toLowerCase().includes(q);
            const removed = (kcfg(store.global || {}, st.kind).removed || []).concat(store.personSet ? (kcfg(store.personSet, st.kind).removed || []) : []);
            let list;
            if (st.tab === 'fiche') list = L.groups.map((g, gi) => { const fs = g.fields.filter(match); if (q && !fs.length) return '';
                return `<details class="ar-pgrp" open data-gkey="${esc(g.key)}"><summary><span>${esc(g.label)}</span><span class="c">${g.fields.filter(f => f.on).length} sur ${g.fields.length}</span><span class="gtools"><button type="button" data-p-gmv="-1" title="Monter le groupe" ${gi ? '' : 'disabled'}>↑</button><button type="button" data-p-gmv="1" title="Descendre le groupe" ${gi < L.groups.length - 1 ? '' : 'disabled'}>↓</button></span></summary>${fs.map((f, i) => rowHtml(f, i, fs.length, g.key)).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧩</span><span class="empty-line-text">Aucun champ.</span></p>'}</details>`; }).join('');
            else { const fs = L.fields.filter(match); list = `<div class="ar-pgrp">${fs.map((f, i) => rowHtml(f, i, fs.length, '')).join('')}</div>`; }
            aside.innerHTML = `<div class="ar-ph"><b>⚙️ Champs affichés</b><select class="ar-pkind" data-p-kind aria-label="Sorte de fiche">${Object.values(ART.defs).filter(d => d.key !== 'profile').map(d => `<option value="${esc(d.key)}" ${d.key === st.kind ? 'selected' : ''}>${esc(d.icon)} ${esc(d.label)}</option>`).join('')}</select><span class="spacer"></span><button type="button" class="icon-button small" data-p-close aria-label="Fermer">×</button></div>
                <div class="ar-pbody"><input type="search" class="ar-psearch" data-p-q placeholder="Chercher un champ…" value="${esc(q)}">
                <div class="ui-tabs ar-ptabs" role="tablist">${ART.TABS.map(t => `<button type="button" class="${t === st.tab ? 'is-active' : ''}" data-p-tab="${t}">${TAB_LABEL[t]}</button>`).join('')}</div>
                <p class="ar-phelp">${st.tab === 'fiche' ? 'Le formulaire suit cet ordre : mêmes groupes, même ordre. Un champ masqué garde ce qui y est écrit. À la lecture, un champ vide ne s’affiche jamais.' : st.tab === 'liste' ? 'Les colonnes de la liste, dans l’ordre.' : st.tab === 'vignettes' ? 'Les lignes grises sous chaque vignette (affichage « Fiches »).' : 'Ce qu’on met dans une notice : export, impression, livre du catalogue raisonné.'}</p>
                <div class="ar-plist" data-p-list>${list}</div>
                <div class="ar-pbtns"><button type="button" class="button small secondary" data-p-add>＋ Ajouter un champ</button>${st.tab === 'fiche' ? '<button type="button" class="button small secondary" data-p-addgrp>＋ Ajouter un groupe</button>' : ''}${removed.length ? `<select data-p-back class="ar-in"><option value="">Remettre un champ enlevé… ▾</option>${removed.map(f => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('')}</select>` : ''}</div></div>
                <div class="ar-pfoot"><label class="ui-toggle"><input type="checkbox" data-p-hide ${store.settings?.hideEmpty === false ? '' : 'checked'}><i></i>Cacher les champs vides à la lecture</label>
                    <label class="ui-toggle"><input type="checkbox" data-p-own ${store.personSet?.own ? 'checked' : ''}><i></i>Réglage propre à ${esc(store.name)} (sinon : pour tous)</label>
                    <div data-presets-slot="artistes"></div>
                    <div class="ar-pbtns"><button type="button" class="button small secondary" data-p-reset title="Revenir aux champs de départ de cette sorte">↺ Réinitialiser</button></div></div>`;
            aside.querySelector('[data-presets-slot]').replaceWith(frame); frame.refresh();
        }
        const plist = () => C.store.presets || [];
        const pwrite = async l => { C.store.presets = l; await ART.write('save_settings', {key: 'presets', data: {list: l}}); };
        const pput = (name, data, at = -1) => { const l = [...plist()], i = l.findIndex(p => p.name === name), row = {name, date: new Date().toLocaleDateString('fr-FR'), data}; if (i >= 0) l[i] = row; else if (at >= 0) l.splice(at, 0, row); else l.push(row); return pwrite(l); };
        const frame = window.LCNDA_UI.presetsFrame({id: 'artistes', what: 'les champs affichés, l’ordre, les colonnes, tes champs et la page de l’artiste', list: plist,
            apply: async i => { applyData(C.store, plist()[i].data); await changed(); paint(); return false; },
            save: name => pput(name, JSON.parse(JSON.stringify(target(C.store)))),
            replace: i => pput(plist()[i].name, JSON.parse(JSON.stringify(target(C.store)))),
            rename: (i, name) => { const l = [...plist()]; l[i] = {...l[i], name}; return pwrite(l); },
            duplicate: async i => { const l = plist(), p = l[i], nm = window.LCNDA_UI.freeName(p.name, l.map(x => x.name)); await pput(nm, JSON.parse(JSON.stringify(p.data || {})), i + 1); A().toast(`Copie « ${nm} » créée.`); },
            exportOne: i => { const p = plist()[i]; A().exportSettingFile?.('artistes', p.name, {artistes: p.data}); return false; },
            remove: async i => { const before = plist(), p = before[i], after = before.filter((_, j) => j !== i), back = async l => { await pwrite(l); if (frame.isConnected) frame.refresh(); };
                await pwrite(after); A().undoToast(`Réglage « ${p.name} » supprimé`, {undo: () => back(before), redo: () => back(after)}); },
            importOne: async () => { const got = await A().importSettingFile?.('artistes', {names: plist().map(p => p.name), check: x => x && typeof x.artistes === 'object'}); if (!got) return false; await pwrite([...plist(), {name: got.nom, date: new Date().toLocaleDateString('fr-FR'), data: got.donnees.artistes}]); A().toast(`Réglage « ${got.nom} » importé : « Appliquer » pour t’en servir.`); }});
        const changed = async () => { try { await persist(C.store); } catch (e) { A().toast(e.message, 'error'); } C.paint(false); };
        const orderNow = (gkey) => { if (st.tab === 'fiche') return [...aside.querySelectorAll(`.ar-fr[data-g="${CSS.escape(gkey)}"]`)].map(r => r.dataset.fkey); return [...aside.querySelectorAll('.ar-fr')].map(r => r.dataset.fkey); };
        const saveOrder = gkey => { const T = tcfg(C.store, st.kind, st.tab); if (st.tab === 'fiche') { T.forder = T.forder || {}; T.forder[gkey] = orderNow(gkey); } else T.order = orderNow(); };
        aside.oninput = e => { if (e.target.matches('[data-p-q]')) { q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; paint(); const i = aside.querySelector('[data-p-q]'); i.focus(); i.setSelectionRange(pos, pos); } };
        aside.onchange = async e => {
            const t = e.target;
            if (t.matches('[data-p-kind]')) { st.kind = t.value; return paint(); }
            if (t.matches('[data-p-hide]')) { target(C.store).hideEmpty = t.checked; return changed().then(paint); }
            if (t.matches('[data-p-own]')) { const s = C.store; if (t.checked) { s.personSet = {...JSON.parse(JSON.stringify(s.global || {})), ...(s.personSet || {}), own: true}; s.personSet.kinds = JSON.parse(JSON.stringify(s.global?.kinds || {})); Object.entries(s.personSet.kinds).forEach(([, K]) => { delete K.custom; }); } else if (s.personSet) s.personSet.own = false; await changed(); return paint(); }
            if (t.matches('[data-p-back]') && t.value) { const s = C.store; for (const obj of [s.global, s.personSet].filter(Boolean)) { const K = kcfg(obj, st.kind), i = (K.removed || []).findIndex(f => f.key === t.value); if (i >= 0) { (K.custom = K.custom || []).push(K.removed[i]); K.removed.splice(i, 1); } } await changed(); return paint(); }
        };
        aside.onclick = async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset, s = C.store;
            if (d.pClose !== undefined) return close();
            if (d.pTab) { st.tab = d.pTab; return paint(); }
            if (d.pEye) { const L = ART.layout(s, st.kind, st.tab), f = [...L.groups.flatMap(g => g.fields), ...L.fields].find(x => x.key === d.pEye); ART.setVisible(s, st.kind, st.tab, d.pEye, !f?.on); await changed(); return paint(); }
            if (d.pMv) { const row = b.closest('.ar-fr'), sib = Number(d.pMv) < 0 ? row.previousElementSibling : row.nextElementSibling; if (!sib?.matches('.ar-fr')) return; if (Number(d.pMv) < 0) sib.before(row); else sib.after(row); saveOrder(row.dataset.g); await changed(); paint(); aside.querySelector(`.ar-fr[data-fkey="${CSS.escape(row.dataset.fkey)}"] [data-p-mv="${d.pMv}"]`)?.focus(); return; }
            if (d.pGmv) { const T = tcfg(s, st.kind, 'fiche'), keys = ART.layout(s, st.kind, 'fiche').groups.map(g => g.key), k = b.closest('[data-gkey]').dataset.gkey, i = keys.indexOf(k), j = i + Number(d.pGmv); if (j < 0 || j >= keys.length) return; [keys[i], keys[j]] = [keys[j], keys[i]]; T.gorder = keys; await changed(); return paint(); }
            if (d.pRen) { for (const obj of [s.global, s.personSet].filter(Boolean)) { const f = (kcfg(obj, st.kind).custom || []).find(x => x.key === d.pRen); if (f) { const n = await A().askText({title: 'Renommer le champ', message: 'Le nouveau nom (ce qui est écrit dans les fiches reste).', value: f.label, okLabel: 'Renommer'}); if (!n?.trim()) return; f.label = n.trim().slice(0, 80); } } await changed(); return paint(); }
            if (d.pDel) { // H7 : enlevé tout de suite, « ↶ Annuler » ; les fiches gardent leurs valeurs
                let obj0 = null, f0 = null; for (const obj of [s.global, s.personSet].filter(Boolean)) { const K = kcfg(obj, st.kind), i = (K.custom || []).findIndex(x => x.key === d.pDel); if (i >= 0) { f0 = K.custom.splice(i, 1)[0]; (K.removed = K.removed || []).push(f0); obj0 = obj; } }
                await changed(); paint();
                if (f0) A().undoToast(`Champ « ${f0.label} » enlevé`, {undo: async () => { const K = kcfg(obj0, st.kind); K.removed = (K.removed || []).filter(x => x.key !== f0.key); (K.custom = K.custom || []).push(f0); await changed(); paint(); }});
                return;
            }
            if (d.pAdd !== undefined) return ART.addFieldDialog(C, st.kind, {after: paint});
            if (d.pAddgrp !== undefined) { const n = await A().askText({title: '＋ Ajouter un groupe', message: 'Le nom du groupe (il apparaît dans la colonne de droite de la fiche, avec ses champs).', value: '', okLabel: 'Ajouter le groupe'}); if (!n?.trim()) return; const K = kcfg(target(s), st.kind); (K.groups = K.groups || []).push({key: `g_${U.slug(n)}_${Date.now().toString(36).slice(-3)}`, label: n.trim().slice(0, 60), zone: 'right', icon: '✎'}); await changed(); return paint(); }
            if (d.pReset !== undefined) { if (!await A().confirmBox(`Les champs de « ${ART.defs[st.kind].label} » reviennent comme au départ (ordre, affichés, colonnes). Tes propres champs restent.`, {title: '↺ Réinitialiser ?', okLabel: 'Réinitialiser'})) return; const K = kcfg(target(s), st.kind); ART.TABS.forEach(t => { delete K[t]; }); await changed(); return paint(); }
        };
        // ⠿ glisser une ligne dans son groupe
        let drag = null;
        aside.ondragstart = e => { const r = e.target.closest('.ar-fr'); if (!r) return; drag = r; r.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'ar-field'); } catch (_) {} };
        aside.ondragover = e => { if (!drag) return; const o = e.target.closest('.ar-fr'); if (!o || o === drag || o.dataset.g !== drag.dataset.g) return; e.preventDefault(); const rc = o.getBoundingClientRect(); if (e.clientY < rc.top + rc.height / 2) o.before(drag); else o.after(drag); };
        aside.ondragend = async () => { if (!drag) return; drag.classList.remove('drag'); const g = drag.dataset.g; drag = null; saveOrder(g); await changed(); paint(); };
        paint();
        setTimeout(() => aside.querySelector('[data-p-q]')?.focus(), 30);
    };
    function applyData(s, data) { const keep = JSON.parse(JSON.stringify(data || {})); if (s.personSet?.own) { s.personSet = {...keep, own: true}; } else { s.global = keep; } }

    /* ═════════ « ＋ Ajouter un champ » (maquette D) ═════════ */
    ART.addFieldDialog = (C, kind, {after = null} = {}) => {
        const def = ART.defs[kind], s = C.store, groups = ART.layout(s, kind, 'fiche').groups.filter(g => !g.fields.every(f => f.type === 'computed') || g.key === '_mine');
        let type = 'text';
        ext.openDialog({eyebrow: `${def.icon} ${String(def.label).toUpperCase()}`, title: '＋ Ajouter un champ', submitLabel: '＋ Ajouter le champ',
            body: `<div class="ar-addf"><label>Nom du champ<input name="label" maxlength="80" required placeholder="Écouté sur, Acheté par, Souvenir…"></label>
                <span class="pk-lab">Sorte de champ</span><div class="ar-tys">${ART.CUSTOM_TYPES.map(t => `<button type="button" class="${t === 'text' ? 'on' : ''}" data-ty="${t}">${esc(ART.ft[t]?.tile || ART.ft[t]?.label || t)}</button>`).join('')}</div>
                <label data-choices hidden>Choix (un par ligne)<textarea name="choices" rows="4" placeholder="Tourne-disque\nRadio\nJuke-box"></textarea></label>
                <label data-unit hidden>Unité<input name="unit" placeholder="m, kg, km, heures…"></label>
                <label>Dans le groupe<select name="group">${groups.map(g => `<option value="${esc(g.key)}" ${g.key === '_mine' ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" name="all" checked> Pour toutes les fiches « ${esc(def.label)} » de tous les artistes</label></div>`,
            onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-ty]'); if (!b) return; type = b.dataset.ty; dg.querySelectorAll('[data-ty]').forEach(x => x.classList.toggle('on', x === b)); dg.querySelector('[data-choices]').hidden = type !== 'list'; dg.querySelector('[data-unit]').hidden = !['measure', 'number'].includes(type); }),
            onSubmit: async f => {
                const label = f.elements.label.value.trim(); if (!label) return window.LCNDA_UI.fail(f.elements.label, 'Donne un nom au champ.');
                const fld = {key: `c_${U.slug(label)}_${Date.now().toString(36).slice(-4)}`, label, type, group: f.elements.group.value === '_mine' ? '' : f.elements.group.value, star: true};
                if (type === 'list') fld.choices = f.elements.choices.value.split(/\n|·/).map(x => x.trim()).filter(Boolean).slice(0, 60);
                if (f.elements.unit.value.trim()) fld.unit = f.elements.unit.value.trim();
                if (f.elements.all.checked) { s.global = s.global || {}; (kcfg(s.global, kind).custom = kcfg(s.global, kind).custom || []).push(fld); }
                else { s.personSet = s.personSet || {own: false}; (kcfg(s.personSet, kind).custom = kcfg(s.personSet, kind).custom || []).push(fld); }
                // dans le formulaire ouvert : ce qui est déjà tapé reste
                if (C.S.edit) ART.collect(C.body, s, C.current(), C.S.draft);
                try { await persist(s); } catch (e) { A().toast(e.message, 'error'); return false; }
                C.paint(false); after?.(); A().toast(`Champ « ${label} » ajouté.`);
            }});
    };

    /* ═════════ « ＋ Créer une sorte de fiche » : un type à soi (ses champs, ou ceux d'un autre type) ═════════ */
    const ICONS = ['🎠', '🎭', '🗿', '🏺', '📷', '🎪', '🪆', '🧵', '🪵', '⚒️', '🎻', '🎺', '🏆', '💡', '🔭', '📰', '🗳', '⚽', '🧭', '🎨', '✦'];
    ART.newTypeDialog = (C, {key = ''} = {}) => {
        const types = Object.values(ART.defs).filter(d => d.key !== 'profile'), cur = key ? ART.defs[key] : null;
        ext.openDialog({eyebrow: 'CATALOGUE', title: cur ? `✎ La sorte « ${cur.label} »` : '✎ Créer une sorte de fiche', submitLabel: cur ? 'Enregistrer' : 'Créer la sorte',
            body: `<div class="form-grid"><label>Nom<input name="label" required maxlength="80" value="${esc(cur?.label || '')}" placeholder="Char de carnaval, Sculpture, Affiche…"></label><label>Au pluriel<input name="many" maxlength="80" value="${esc(cur?.many || '')}"></label>
                <div class="span-2"><span class="pk-lab">Icône</span><div class="ar-icons">${ICONS.map(i => `<label><input type="radio" name="icon" value="${i}" ${(cur?.icon || '✦') === i ? 'checked' : ''}><span>${i}</span></label>`).join('')}</div></div>
                <label>Famille<select name="domain">${ART.DOMAINS.map(([k, l]) => `<option value="${k}" ${(cur?.domain || 'autre') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                ${cur ? '' : `<label>Partir de…<select name="from"><option value="">Rien (titre, date, photos, notes)</option>${types.map(d => `<option value="${esc(d.key)}">${esc(d.icon)} ${esc(d.label)} (ses champs)</option>`).join('')}</select></label>`}</div>
                <p class="muted">Ensuite, « ⚙️ Champs affichés » : ajoute tes champs (texte, date, période, personne + rôle, lieu, fiche liée, image, tableau…), range-les, cache-les.</p>`,
            onSubmit: async f => {
                const v = Object.fromEntries(new FormData(f)), src = v.from ? ART.defs[v.from] : null;
                const groups = cur ? cur.groups.filter(g => g.key !== '_linked' && g.key !== '_mine') : src ? JSON.parse(JSON.stringify(src.groups.filter(g => g.key !== '_linked'))).map(g => ({...g, fields: g.fields.filter(x => x.type !== 'computed').map(x => ({...x, source: `${src.key}.${x.key}`}))})).filter(g => g.fields.length) : undefined;
                const r = await ART.write('save_type', {key: cur?.key || '', label: v.label, def: {many: v.many || `${v.label}s`, icon: v.icon || '✦', domain: v.domain, groups, list: src?.list || ['title', 'date'], card: src?.card || ['date'], export: src?.export}});
                await C.reload(); C.S.view = 'list'; C.S.kind = r.key; C.S.id = 0; C.prefs.extraTabs = [...new Set([...(C.prefs.extraTabs || []), r.key])]; C.savePrefs(); C.paint(true);
                A().toast(cur ? 'Sorte enregistrée.' : `Sorte « ${v.label} » créée : ajoute ses champs avec « ⚙️ Champs affichés ».`);
            }});
    };
})();
