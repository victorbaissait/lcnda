/**
 * ✨ Trésors — 🕯️ Garder la mémoire :
 *  - ✉️ Lettres aux descendants (capsule temporelle) : un texte, un son ou une vidéo qui ne s'ouvre qu'à une date — choisie,
 *    ou « aux N ans de » quelqu'un. Scellée, la lettre ne montre que pour qui, de qui et quand (le serveur garde le texte).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const P = () => window.LCNDA_PICKER;
    const today = () => new Date().toISOString().slice(0, 10);
    const daysTo = d => Math.ceil((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
    const humanWait = n => n <= 0 ? 'aujourd’hui' : n < 60 ? `dans ${n} jour${n > 1 ? 's' : ''}` : n < 730 ? `dans ${Math.round(n / 30.4)} mois` : `dans ${Math.round(n / 365.25)} ans`;

    /* ── ✉️ Lettres aux descendants ── */
    async function mediaHtml(T, ids) {
        if (!ids?.length) return '';
        const r = await T.api('tresor_media', {ids: ids.join(',')}).catch(() => ({media: []}));
        return (r.media || []).map(m => { const src = `media/${encodeURIComponent(m.filename)}`, t = m.media_type;
            return t === 'audio' ? `<audio controls preload="none" src="${src}"></audio>` : t === 'video' ? `<video controls preload="none" src="${src}" style="max-width:100%"></video>` : `<img src="${src}" alt="${T.esc(m.title || '')}" style="max-width:100%;border-radius:8px">`; }).join('');
    }
    function letterForm(T, it, tr) {
        const d = it?.data || {};
        return `<div class="form-grid">
            <div class="span-2"><span class="pk-lab">De la part de (une fiche, ou un nom)</span>${P().pickerField({name: 'from', kind: 'person', allowFree: true, value: d.from ?? null})}</div>
            <label class="span-2">Pour (ex. « Léa », « mes petits-enfants », « celui qui reprendra la maison »)<input name="to" maxlength="200" value="${T.esc(d.to || '')}"></label>
            <label>S’ouvre<select name="when"><option value="date" ${d.when !== 'age' ? 'selected' : ''}>à une date</option><option value="age" ${d.when === 'age' ? 'selected' : ''}>à un anniversaire</option></select></label>
            <label data-w="date">Le<input type="date" name="open_at" value="${T.esc(it?.open_at || '')}" min="${today()}"></label>
            <div class="span-2" data-w="age"><span class="pk-lab">L’anniversaire de</span>${P().pickerField({name: 'for_person', kind: 'person', value: d.for_person ?? null})}</div>
            <label data-w="age">À ses<input type="number" name="age" min="1" max="120" value="${T.esc(d.age || 18)}"> ans</label>
            <label class="span-2">Titre<input name="title" maxlength="200" value="${T.esc(it?.title || '')}" placeholder="Pour tes 18 ans"></label>
            <label class="span-2">La lettre<textarea name="body" rows="10" placeholder="${it?.sealed ? 'Scellée : laisse vide pour garder le texte d’origine' : 'Écris ici…'}">${it?.sealed ? '' : T.esc(it?.body || '')}</textarea></label>
            <div class="span-2"><span class="pk-lab">Un son, une vidéo ou une photo (facultatif)</span>${P().mediaField({name: 'media_ids', multiple: true, value: d.media || []})}</div>
        </div>`;
        void tr;
    }
    /** la date d'ouverture « aux N ans de » quelqu'un : son anniversaire cette année-là */
    const ageDate = (p, age) => { if (!p?.by) return ''; const md = p.bd ? p.bd.slice(4) : '-01-01'; return `${String(p.by + age).padStart(4, '0')}${md}`; };
    function editLetter(T, it, after) {
        T.tree().then(tr => ext.openDialog({eyebrow: 'LETTRE AUX DESCENDANTS', title: it ? '✉️ La lettre' : '✉️ Nouvelle lettre', wide: true, submitLabel: it ? 'Enregistrer' : '🔒 Sceller la lettre', body: letterForm(T, it, tr),
            onOpen: dl => { const sync = () => { const w = dl.querySelector('[name=when]').value; dl.querySelectorAll('[data-w]').forEach(x => { x.hidden = x.dataset.w !== w; }); }; dl.querySelector('[name=when]').addEventListener('change', sync); sync(); },
            onSubmit: async form => {
                const v = k => form.elements[k]?.value || '', when = v('when');
                let open = v('open_at');
                if (when === 'age') { const p = tr.byId.get(Number(v('for_person'))); if (!p?.by) { T.toast('Choisis une personne dont on connaît la naissance.', 'error'); return false; } open = ageDate(p, Number(v('age')) || 18); }
                if (!open) { T.toast('Choisis le jour où la lettre s’ouvrira.', 'error'); return false; }
                if (!it && open <= today()) { T.toast('La date doit être dans le futur (sinon ce n’est plus une surprise).', 'error'); return false; }
                if (!it && !v('body').trim() && !v('media_ids')) { T.toast('Écris quelque chose ou joins un son, une vidéo ou une photo.', 'error'); return false; }
                const from = v('from'), media = v('media_ids') ? v('media_ids').split(',').map(Number).filter(Boolean) : [];
                const pid = /^\d+$/.test(from) ? Number(from) : (when === 'age' ? Number(v('for_person')) : 0);
                await T.save({id: it?.id, kind: 'letter', person_id: pid || null, title: v('title') || (when === 'age' ? `Pour ses ${v('age')} ans` : 'Lettre'), body: v('body'), open_at: open,
                    data: {from, to: v('to'), when, for_person: Number(v('for_person')) || null, age: Number(v('age')) || null, media, occasion: when === 'age' ? `à ses ${v('age')} ans` : ''}});
                T.toast(it ? 'Lettre enregistrée.' : `🔒 Lettre scellée : elle s’ouvrira le ${T.dateFr(open)}.`, 'success'); after();
            }}));
    }
    async function renderLetters(host, T) {
        const tr = await T.tree();
        const draw = async () => {
            const list = await T.items('letter'), who = v => (/^\d+$/.test(String(v || '')) ? T.name(tr.byId.get(Number(v))) : String(v || '').replace(/^txt:/, '')) || 'Quelqu’un';
            const open = list.filter(x => !x.sealed), sealed = list.filter(x => x.sealed).sort((a, b) => a.open_at.localeCompare(b.open_at));
            host.innerHTML = `<div class="h-tr-row h-tr-noprint"><button type="button" class="button" data-l-new>✉️ Écrire une lettre</button><span class="h-tr-muted">${sealed.length} scellée${sealed.length > 1 ? 's' : ''} · ${open.length} ouverte${open.length > 1 ? 's' : ''}</span></div>
                ${sealed.length ? `<h3>🔒 En attente</h3><div class="h-tr-cards">${sealed.map(x => `<div class="h-tr-sealed"><span style="font-size:34px">✉️</span><b>${T.esc(x.title)}</b><small>De ${T.esc(who(x.data?.from))}${x.data?.to ? ` pour ${T.esc(x.data.to)}` : ''}</small><span class="h-tr-pill">s’ouvre le ${T.esc(T.dateFr(x.open_at))} · ${humanWait(daysTo(x.open_at))}</span><span><button type="button" class="h-tr-link" data-l-edit="${x.id}">Modifier</button> · <button type="button" class="h-tr-link" data-l-del="${x.id}">Supprimer</button></span></div>`).join('')}</div>` : ''}
                <h3>📬 Ouvertes</h3>${open.length ? (await Promise.all(open.map(async x => `<article class="h-tr-panel h-tr-print"><div class="h-tr-row" style="justify-content:space-between"><div><b>${T.esc(x.title)}</b><br><small class="h-tr-muted">De ${T.esc(who(x.data?.from))}${x.data?.to ? ` · pour ${T.esc(x.data.to)}` : ''} · écrite le ${T.esc(T.dateFr(String(x.created_at).slice(0, 10)))}${x.open_at ? ` · ouverte le ${T.esc(T.dateFr(x.open_at))}` : ''}</small></div><span class="h-tr-noprint"><button type="button" class="h-tr-link" data-l-edit="${x.id}">Modifier</button> · <button type="button" class="h-tr-link" data-l-del="${x.id}">Supprimer</button></span></div>${x.body ? `<div class="h-tr-letter">${T.esc(x.body)}</div>` : ''}${await mediaHtml(T, x.data?.media)}</article>`))).join('') : '<p class="h-tr-muted">Aucune lettre ouverte pour l’instant.</p>'}`;
        };
        host.addEventListener('click', async e => {
            if (e.target.closest('[data-l-new]')) return editLetter(T, null, draw);
            const ed = e.target.closest('[data-l-edit]'); if (ed) { const it = (await T.items('letter')).find(x => x.id === Number(ed.dataset.lEdit)); return editLetter(T, it, draw); }
            const del = e.target.closest('[data-l-del]'); if (del && await window.LCNDA_APP.confirmBox('La lettre sera effacée pour de bon.', {title: 'Supprimer la lettre ?', okLabel: 'Supprimer', danger: true})) { await T.remove(Number(del.dataset.lDel)); draw(); }
        });
        await draw();
    }
    F.push({key: 'lettres', group: 'memoire', icon: '✉️', title: 'Lettres aux descendants', desc: 'Un texte, un son ou une vidéo qui ne s’ouvre qu’à une date : « pour les 18 ans de Léa », « en 2050 ».', render: renderLetters});
    ext.tresorLetters = {ageDate, editLetter};
})();
