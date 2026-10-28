/**
 * 📝 Traitement de texte — 📨 publipostage et modèles remplis avec une fiche (branché par ext.textDocMenuExtra / ext.textDocCommands) :
 *  - Insertion → « 📨 Champ de fusion » : «Prénom», «Nom», «Date de naissance», «Père», «Conjoint», «né / née»… (un .wp-field data-field="merge-…") ;
 *  - Fichier → « 👤 Remplir avec une fiche… » : les champs prennent les valeurs d'une personne (↶ pour revenir) ;
 *  - Outils → « 📨 Publipostage… » : une copie du document par personne choisie (une à une, ou les personnes d'une de « Mes listes »),
 *    dans un nouveau document (chaque copie commence sur une nouvelle page) ; aperçu avant ;
 *  - des modèles prêts (Fichier → Partir d'un modèle) qui demandent la personne : demande d'acte, fiche d'identité, avis de recherche.
 * Serveur : textdoc_merge_people (lib/textdocs.php). Sans écran : ext.textDocMerge.fill (aussi require() dans Node, pour les essais).
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /* [clé, nom affiché dans le document, groupe] */
    const FIELDS = [['first', 'Prénom', 'La personne'], ['last', 'Nom', 'La personne'], ['name', 'Nom complet', 'La personne'], ['ne', 'né / née', 'La personne'], ['il', 'il / elle', 'La personne'],
        ['birth', 'Date de naissance', 'Naissance et décès'], ['birth_place', 'Lieu de naissance', 'Naissance et décès'], ['death', 'Date du décès', 'Naissance et décès'], ['death_place', 'Lieu du décès', 'Naissance et décès'], ['age', 'Âge au décès', 'Naissance et décès'], ['years', 'Années (1850 – 1920)', 'Naissance et décès'],
        ['occupation', 'Métier', 'Famille et vie'], ['father', 'Père', 'Famille et vie'], ['mother', 'Mère', 'Famille et vie'], ['spouse', 'Conjoint', 'Famille et vie'], ['marriage', 'Date du mariage', 'Famille et vie'], ['marriage_place', 'Lieu du mariage', 'Famille et vie'],
        ['today', 'Date du jour', 'Autre']];
    const LABEL = Object.fromEntries(FIELDS.map(f => [f[0], f[1]]));
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const todayFr = () => { const d = new Date(); return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
    /** la valeur d'un champ pour une personne (texte simple ; vide = « … » pour qu'on voie ce qui manque) */
    function valueOf(p, k) {
        if (k === 'today') return todayFr();
        if (!p) return '';
        // ✍️ accordé avec la fiche (app-accord.js) ; une fiche ni homme ni femme suit le réglage « Accord des mots » (au départ : « né », « il », comme avant)
        const acc = root.LCNDA_ACCORD?.accord, f = p.gender === 'female';
        if (k === 'ne') return acc ? acc(p, 'né(e)', {before: 'né'}) : (f ? 'née' : 'né');
        if (k === 'il') return acc ? acc(p, {m: 'il', f: 'elle'}, {before: 'il'}) : (f ? 'elle' : 'il');
        if (k === 'name') return p.name || [p.first, String(p.last || '').toUpperCase()].filter(Boolean).join(' ');
        if (k === 'years') return p.by || p.dy ? `${p.by || '?'} – ${p.dy || ''}`.replace(/ – $/, '') : '';
        if (k === 'age') return Number.isFinite(Number(p.age)) && p.age !== null && p.age !== '' ? `${p.age} ans` : '';
        return String(p[k] ?? '').trim();
    }
    const FIELD_RX = /<span class="wp-field" data-field="merge-([a-z_]+)"[^>]*>[\s\S]*?<\/span>/g;
    /** remplace chaque champ de fusion d'un HTML par la valeur de la personne (échappée) ; missing : ce qu'on écrit quand c'est vide */
    function fill(html, p, {missing = '…'} = {}) { return String(html || '').replace(FIELD_RX, (m, k) => { if (!LABEL[k]) return m; const v = valueOf(p, k); return esc(v || missing); }); }
    const fieldsIn = html => [...String(html || '').matchAll(FIELD_RX)].map(m => m[1]).filter(k => LABEL[k]);
    const fieldHtml = k => `<span class="wp-field" data-field="merge-${k}" contenteditable="false">«${esc(LABEL[k])}»</span>`;
    ext.textDocMerge = {FIELDS, valueOf, fill, fieldsIn, fieldHtml};
    if (typeof module === 'object' && module.exports) { module.exports = ext.textDocMerge; return; }

    /* ═════════ L'écran ═════════ */
    const A = () => root.LCNDA_APP, UI = () => root.LCNDA_UI, P = () => root.LCNDA_PICKER || A();
    const tools = () => ext.textDocTools || {};
    const toast = (...a) => A().toast(...a), api = (...a) => A().api(...a);
    const plural = (n, w, pl) => (A()?.plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? pl || w + 's' : w}`);
    const T2 = (ed, html) => { ed.focusBack(); const lr = ed.lastRange; if (lr && lr.startContainer.isConnected && ed.secOf(lr.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(lr); } ed.commit(); ed.insertHtml(html); ed.commit(); ed.layoutSoon(0); };
    const people = async ids => ((await api('textdoc_merge_people', {ids: [...new Set(ids.map(Number).filter(Boolean))].slice(0, 400).join(',')})).people || {});
    const docHtml = d => [...(d.sections || []).map(s => s.html || ''), d.header?.html || '', d.footer?.html || ''].join('');

    function fieldMenu(ed, anchor) {
        ed.restoreSel(); const range = ed.lastRange, groups = [...new Set(FIELDS.map(f => f[2]))];
        const items = []; groups.forEach((g, i) => { if (i) items.push('-'); FIELDS.filter(f => f[2] === g).forEach(([k, l]) => items.push({icon: '«»', label: l, run: () => { ed.lastRange = range; T2(ed, fieldHtml(k) + '&nbsp;'); }})); });
        items.push('-', {icon: '❓', label: 'À quoi ça sert ?', run: () => toast('Les champs « » prennent les valeurs d’une fiche : Fichier → « 👤 Remplir avec une fiche… », ou une copie par personne avec Outils → « 📨 Publipostage… ».')});
        UI().menuAt(anchor && anchor.isConnected ? anchor : {x: innerWidth / 2 - 120, y: 160}, items, {title: '📨 Champ de fusion'});
    }
    /** les champs du document prennent les valeurs d'une fiche (↶ revient) */
    async function fillWithPerson(ed) {
        const d = ed.docData(); if (!fieldsIn(docHtml(d)).length) { const ok = await A().confirmBox?.({title: '👤 Remplir avec une fiche', message: 'Ce document n’a pas encore de champ de fusion (Insertion → « 📨 Champ de fusion »). Insérer d’abord une petite fiche d’identité à l’endroit du curseur ?', okLabel: 'Insérer la fiche d’identité'}); if (!ok) return; ed.restoreSel(); T2(ed, idCardHtml()); }
        const it = await P().openPicker({kind: 'person', title: 'Remplir avec la fiche de qui ?'}); if (!it || !Number(it.id)) return;
        const p = (await people([it.id]))[String(it.id)]; if (!p) return toast('Fiche introuvable.', 'error');
        ed.commit(); let n = 0;
        ed.bodies().forEach(b => b.querySelectorAll('.wp-field[data-field^="merge-"]').forEach(x => { const k = x.dataset.field.slice(6); if (!LABEL[k]) return; x.replaceWith(document.createTextNode(valueOf(p, k) || '…')); n++; }));
        ['header', 'footer'].forEach(h => { if (ed.doc[h]?.html) ed.doc[h].html = fill(ed.doc[h].html, p); if (ed.doc[h]?.firstHtml) ed.doc[h].firstHtml = fill(ed.doc[h].firstHtml, p); });
        ed.commit(); ed.layoutSoon(0); ed.status?.flash?.(`${plural(n, 'champ rempli', 'champs remplis')} avec la fiche de ${p.name} (↶ pour revenir).`);
    }
    /** 📨 une copie du document par personne, dans un nouveau document */
    async function mergeDialog(ed) {
        const d0 = ed.docData(), keys = fieldsIn(docHtml(d0));
        if (!keys.length) return toast('Ajoute d’abord des champs : Insertion → « 📨 Champ de fusion » (Prénom, Nom, Date de naissance…).');
        let lists = []; try { lists = ((await api('my_lists', {})).lists || []).filter(l => ['persons', 'events'].includes(l.source)); } catch (_) {}
        const chosen = new Map();
        ext.openDialog({eyebrow: 'OUTILS', title: '📨 Publipostage', wide: true, submitLabel: 'Créer les copies',
            body: `<p class="muted">Une copie de ce document par personne, chaque champ « » rempli avec sa fiche ; les copies se suivent dans un nouveau document (une nouvelle page pour chacune). Champs utilisés : ${[...new Set(keys)].map(k => `<b>«${esc(LABEL[k])}»</b>`).join(', ')}.</p>
                <div class="wp-mm-add"><button type="button" class="button secondary" data-mm-add>＋ Ajouter des personnes…</button>${lists.length ? `<select data-mm-list aria-label="Ajouter les personnes d’une liste"><option value="">＋ Les personnes d’une de mes listes…</option>${lists.map(l => `<option value="${Number(l.id)}">${esc(l.name || l.title || 'Liste')}</option>`).join('')}</select>` : ''}<button type="button" class="button small secondary" data-mm-clear>Tout retirer</button></div>
                <div class="wp-mm-list" data-mm-list-box></div><label class="field">Un champ vide s’écrit<select name="missing"><option value="…">« … » (pour le voir)</option><option value="">rien</option><option value="________">« ________ » (à remplir à la main)</option></select></label>
                <div class="wp-mm-prev" data-mm-prev></div>`,
            onOpen: dlg => {
                const box = dlg.querySelector('[data-mm-list-box]'), prev = dlg.querySelector('[data-mm-prev]');
                const draw = () => { const l = [...chosen.values()]; box.innerHTML = l.length ? `<p><b>${plural(l.length, 'personne')}</b></p><div class="wp-mm-chips">${l.map(p => `<span class="ui-badge is-gray">${esc(p.name)} <button type="button" class="link-button" data-mm-del="${p.id}" aria-label="Retirer ${esc(p.name)}">×</button></span>`).join('')}</div>` : '<p class="muted">Personne pour l’instant.</p>';
                    const first = l[0]; prev.innerHTML = first ? `<p class="muted">Aperçu avec ${esc(first.name)} :</p><div class="wp-mm-sheet">${fill((d0.sections?.[0]?.html || '').slice(0, 20000), first, {missing: dlg.querySelector('[name=missing]').value})}</div>` : ''; };
                const add = async ids => { const got = await people(ids); Object.values(got).forEach(p => chosen.set(p.id, p)); draw(); };
                dlg.addEventListener('click', async e => {
                    if (e.target.closest('[data-mm-add]')) { const its = await P().openPicker({kind: 'person', multiple: true, title: 'Les personnes du publipostage'}); const ids = (Array.isArray(its) ? its : its ? [its] : []).map(x => x.id); if (ids.length) add(ids); }
                    const del = e.target.closest('[data-mm-del]'); if (del) { chosen.delete(Number(del.dataset.mmDel)); draw(); }
                    if (e.target.closest('[data-mm-clear]')) { chosen.clear(); draw(); }
                });
                dlg.addEventListener('change', async e => {
                    if (e.target.matches('[data-mm-list]') && e.target.value) { const id = e.target.value; e.target.value = ''; try { const r = await api('my_list_rows', {id}), src = lists.find(l => String(l.id) === String(id))?.source; const ids = (r.rows || r.items || []).map(x => Number(x.person_id || (src === 'persons' ? x.id : 0))).filter(Boolean); if (!ids.length) return toast('Pas de personne dans cette liste.'); add(ids); } catch (err) { toast(err.message, 'error'); } }
                    if (e.target.matches('[name=missing]')) draw();
                });
                draw();
            },
            onSubmit: f => {
                const l = [...chosen.values()]; if (!l.length) throw new Error('Ajoute au moins une personne.');
                const missing = f.elements.missing.value, sections = l.flatMap(p => (d0.sections || []).map(s => ({...s, html: fill(s.html, p, {missing})})));
                // chaque copie commence sur une page neuve : une section par copie (et les en-têtes restent communs, sans champ)
                const data = {...JSON.parse(JSON.stringify(d0)), sections, header: {...d0.header, html: fill(d0.header?.html, l[0], {missing: ''}), firstHtml: fill(d0.header?.firstHtml, l[0], {missing: ''})}, footer: {...d0.footer, html: fill(d0.footer?.html, l[0], {missing: ''}), firstHtml: fill(d0.footer?.firstHtml, l[0], {missing: ''})}};
                ext.openTextDoc?.({data, name: `${ed.name} — publipostage (${plural(l.length, 'personne')})`});
                toast(`${plural(l.length, 'copie')} prête${l.length > 1 ? 's' : ''} dans un nouveau document : vérifie, puis enregistre, imprime ou exporte.`);
            }});
    }

    /* ── des modèles qui demandent la personne et se remplissent tout seuls ── */
    const F = fieldHtml, P_ = (t, st = 'normal', css = '') => `<p data-st="${st}"${css ? ` style="${css}"` : ''}>${t || '<br>'}</p>`;
    const idCardHtml = () => [P_(`${F('name')}`, 'h2'), P_(`${F('ne')} le ${F('birth')} à ${F('birth_place')}`), P_(`Enfant de ${F('father')} et de ${F('mother')}`), P_(`Métier : ${F('occupation')}`), P_(`Mariage le ${F('marriage')} à ${F('marriage_place')} avec ${F('spouse')}`), P_(`Décès : le ${F('death')} à ${F('death_place')} (${F('age')})`)].join('');
    const MODELS = [
        {key: 'f_acte', icon: '📜', name: 'Demande d’acte (remplie avec une fiche)', hint: 'naissance, mariage ou décès : la personne, les dates et les lieux déjà écrits', person: true, ask: 'La demande d’acte pour qui ?',
            body: () => [P_('<span class="wp-ph">Ton prénom et ton nom</span><br><span class="wp-ph">Ton adresse</span>'), P_(`À <span class="wp-ph">Ville</span>, le ${F('today')}`, 'normal', 'text-align:right'), P_(`Mairie de ${F('birth_place')}<br>Service de l’état civil`), P_('<b>Objet : demande de copie intégrale d’acte</b>'),
                P_('Madame, Monsieur,'), P_(`Dans le cadre de recherches généalogiques, je vous remercie par avance de bien vouloir m’adresser une copie intégrale de l’acte de naissance de ${F('name')}, ${F('ne')} le ${F('birth')} à ${F('birth_place')}, enfant de ${F('father')} et de ${F('mother')}.`),
                P_('Je joins une enveloppe timbrée à mon adresse pour la réponse.'), P_('Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.'), P_('<span class="wp-ph">Signature</span>', 'normal', 'text-align:right')].join('')},
        {key: 'f_id', icon: '🪪', name: 'Fiche d’identité d’un ancêtre (remplie)', hint: 'nom, naissance, parents, métier, mariage, décès', person: true, ask: 'La fiche de qui ?', body: () => P_('Fiche d’identité', 'title') + idCardHtml() + P_('Ce que je sais d’autre', 'h2') + P_('')},
        {key: 'f_avis', icon: '📣', name: 'Avis de recherche (lettre aux cousins, remplie)', hint: 'je cherche des renseignements sur cette personne', person: true, ask: 'Tu cherches des renseignements sur qui ?',
            body: () => [P_('Avis de recherche', 'title'), P_(`Je recherche tout renseignement sur ${F('name')}, ${F('ne')} le ${F('birth')} à ${F('birth_place')}, ${F('occupation')}.`), P_(`${F('il')} a épousé ${F('spouse')} le ${F('marriage')} à ${F('marriage_place')}. Ses parents : ${F('father')} et ${F('mother')}.`),
                P_('Photos, lettres, souvenirs, papiers de famille : tout m’intéresse. Merci de me répondre à <span class="wp-ph">ton adresse ou ton courriel</span>.'), P_(`Le ${F('today')}`, 'normal', 'text-align:right')].join('')},
    ];
    const addModels = () => { const T = tools().TEMPLATES; if (!T) return false; MODELS.forEach(m => { if (T.some(x => x.key === m.key)) return; T.push({key: m.key, icon: m.icon, name: m.name, hint: m.hint, person: true, ask: m.ask, html: async pid => { const p = pid ? (await people([pid]))[String(pid)] : null; return p ? fill(m.body(), p) : m.body(); }}); }); return true; };
    if (!addModels()) document.addEventListener('DOMContentLoaded', addModels, {once: true}); setTimeout(addModels, 0);

    ext.textDocMenuExtra = ext.textDocMenuExtra || [];
    ext.textDocMenuExtra.push({menu: 'Insertion', cmd: 'mmfield', label: '📨 Champ de fusion (prénom, dates…)'}, {menu: 'Fichier', cmd: 'mmfill', label: '👤 Remplir avec une fiche…'}, {menu: 'Outils', cmd: 'mailmerge', label: '📨 Publipostage…'});
    ext.textDocCommands = ext.textDocCommands || {};
    ext.textDocCommands.mmfield = (ed, v, arg) => fieldMenu(ed, arg);
    ext.textDocCommands.mmfill = ed => fillWithPerson(ed);
    ext.textDocCommands.mailmerge = ed => mergeDialog(ed);
})(typeof window !== 'undefined' ? window : globalThis);
