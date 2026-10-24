/**
 * 📝 Traitement de texte — le panneau de droite (E2 : styles, paragraphe, caractère, page, document ; commentaires ;
 * modifications ; vérification), le panneau de navigation (titres, pages, résultats), rechercher et remplacer,
 * les insertions (image par la fenêtre unique, tableau, tableau du Tableur, lien, notes, source citée F4, sommaire, index,
 * bibliographie, personne et lieu par le menu de choix — avec date ou lieu tenus à jour —, média, biographie F5, petit arbre,
 * diagramme, caractères spéciaux dont les lettres anciennes, le grec et le cyrillique, date et champs, sauts, colonnes,
 * en-tête et pied), les outils (nombre de mots, langue, vérifier avec les fiches, lecture à voix haute, styles et jeux de styles,
 * styles d'un livre de la mise en page, format de la page, réglages K2).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const T = () => window.LCNDA_TEXT;
    const P = () => window.LCNDA_PICKER || A();
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const K = () => ext.textDocKit;
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const plural = (n, w) => (A()?.plural ? A().plural(n, w) : `${n} ${w}${n > 1 ? 's' : ''}`);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
    const nid = p => T().nid(p);
    const R1 = v => Math.round(Number(v) * 10) / 10;
    // la place gardée avant d'ouvrir une fenêtre (menu de choix, part du nom…) passe devant le curseur que le navigateur remet en haut du texte au retour
    const T2 = (ed, html) => { ed.focusBack(); const lr = ed.lastRange; if (lr && lr.startContainer.isConnected && ed.secOf(lr.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(lr); } ed.commit(); ed.insertHtml(html); ed.commit(); ed.layoutSoon(0); };
    const dateFr = (d = new Date()) => d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'});
    const tools = ext.textDocTools = ext.textDocTools || {};
    const pref = (k, d) => K().pref(k, d), prefs = () => K().prefs(), setPrefs = p => K().setPrefs(p);
    const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['de', 'Allemand'], ['es', 'Espagnol'], ['it', 'Italien'], ['pt', 'Portugais'], ['nl', 'Néerlandais'], ['la', 'Latin'], ['oc', 'Occitan'], ['br', 'Breton'], ['pl', 'Polonais']];
    const MM = 96 / 25.4, PT = 96 / 72, cleanHtml = (...a) => K().cleanHtml(...a), blockOf = (...a) => K().blockOf(...a);
    const wait = setInterval(() => { if (!ext.textDocKit?.Editor || !Object.prototype.hasOwnProperty.call(ext.textDocKit.Editor.prototype, 'bind')) return; clearInterval(wait); install(); }, 30);

    /* ═════════ Les caractères spéciaux : la typographie, la généalogie, les lettres anciennes, le grec et le cyrillique de l'app ═════════ */
    const GLYPHS = () => {
        const D = window.LCNDA_ALPHABETS || {languages: [], keyboard: {}};
        const old = [...new Set((D.languages || []).flatMap(l => (l.old || []).map(o => o[0])).filter(c => c && [...c].length <= 2))];
        const kb = k => [...new Set((D.keyboard?.[k] || []).flatMap(g => g.keys || []))];
        const up = l => [...new Set(l.flatMap(c => [c.toLocaleUpperCase(), c]))];
        return [
            ['fr', 'Typographie française', '« » ‹ › “ ” ‘ ’ „ — – ‑ … · • ′ ″ ‰ № § ¶ † ‡ ° ª º ¹ ² ³ ᵉ ʳ ᵈ ˢ ᵐ ⁿ ¿ ¡    '.split(' ')],
            ['genea', 'Généalogie', '° ⚭ ∞ ⚮ ⚯ † ✝ ✞ ⚰ ⚱ ♂ ♀ ⚥ ~ ≈ ? ⁂ ⚔ ✠ ⚜ ✡ ☪ ☦ ⌂ ✉ ☩ ♰ ♱ ⚓ ⚒ ✿ ❀ ☙ ❧ ❦'.split(' ')],
            ['old', 'Lettres et abréviations anciennes', [...new Set([...old, 'ſ', 'ꝑ', 'ꝓ', 'ꝗ', 'ꝯ', 'ꝰ', '⁊', 'ꞇ', 'ȝ', 'þ', 'ð', 'Þ', 'Ð', 'æ', 'Æ', 'œ', 'Œ', '&', 'ꝛ', 'ꝫ', 'ꝭ', 'ꝸ'])]],
            ['acc', 'Lettres accentuées', 'À Â Ä Æ Ç É È Ê Ë Î Ï Ô Ö Œ Ù Û Ü Ÿ à â ä æ ç é è ê ë î ï ô ö œ ù û ü ÿ Á Í Ó Ú Ñ á í ó ú ñ Ã Õ ã õ Å å Ø ø ß Ł ł Ś ś Ź ź Ż ż Č č Š š Ž ž Ř ř Ě ě Ő ő Ű ű'.split(' ')],
            ['greek', 'Grec', up(kb('greek').length ? kb('greek') : 'α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ ς τ υ φ χ ψ ω'.split(' '))],
            ['cyr', 'Cyrillique', up(kb('cyrillic').length ? kb('cyrillic') : 'а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я'.split(' '))],
            ['money', 'Monnaies et chiffres', '€ £ $ ¢ ¥ ₣ ₤ ₶ ½ ⅓ ⅔ ¼ ¾ ⅛ ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ₀ ₁ ₂ ₃ Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ Ⅵ Ⅶ Ⅷ Ⅸ Ⅹ Ⅺ Ⅻ Ⅼ Ⅽ Ⅾ Ⅿ'.split(' ')],
            ['sym', 'Symboles et flèches', '© ® ™ ✓ ✗ ★ ☆ ✦ ◆ ◇ ■ □ ▲ △ ● ○ ♠ ♣ ♥ ♦ ♪ ☀ ☁ ☎ ✂ ✎ ✍ ☐ ☑ ← ↑ → ↓ ↔ ⇐ ⇒ ⇔ ➔ ↩ ↪'.split(' ')],
            ['math', 'Mathématiques', '± × ÷ − ≠ ≤ ≥ ≈ ≡ ∞ √ ∑ ∏ ∫ ∂ ∆ ∈ ∉ ∩ ∪ ⊂ ∀ ∃ ∅ ¬ ∧ ∨ ∴ ∵ µ π Ω'.split(' ')],
        ];
    };
    const GLYPH_NAMES = {' ': 'espace fine insécable (avant ; : ! ? »)', ' ': 'espace insécable', '⚭': 'marié', '∞': 'marié (autre signe)', '⚮': 'divorcé', '†': 'décédé', '°': 'né', '⚰': 'inhumé', '✝': 'décédé (croix)', 'ſ': 's long', 'ꝑ': 'p barré (par)', 'ꝓ': 'p à crosse (pro)', '⁊': 'et (note tironienne)', '♂': 'homme', '♀': 'femme', '№': 'numéro'};

    /* ═════════ Les modèles ═════════ */
    const ph = t => `<span class="wp-ph">${esc(t)}</span>`;
    const P_ = (t, st = 'normal', css = '') => `<p data-st="${st}"${css ? ` style="${css}"` : ''}>${t || '<br>'}</p>`;
    const TEMPLATES = [
        {key: 'blank', icon: '📄', name: 'Page blanche', hint: 'Normal, A4, marges de 2,5 cm', html: () => P_('')},
        {key: 'archives', icon: '🏛️', name: 'Lettre aux archives', hint: 'demande de recherche à un service d’archives', html: () => [P_(`${ph('Ton prénom et ton nom')}<br>${ph('Ton adresse')}<br>${ph('Ton courriel')}`, 'address'), P_(`${ph('Archives départementales de …')}<br>${ph('Service des recherches')}<br>${ph('Adresse du service')}`, 'address', 'margin-left:95mm;margin-top:12pt'), P_(`${ph('Ville')}, le ${esc(dateFr())}`, 'normal', 'text-align:right;margin-top:14pt'), P_(`<b>Objet :</b> demande de recherche — ${ph('famille, commune, période')}`, 'normal', 'margin-top:14pt'), P_('Madame, Monsieur,', 'normal', 'margin-top:12pt'), P_(`Je recherche ${ph('l’acte de …')} de ${ph('Prénom NOM')}, ${ph('né vers 1850 à …')}. J’ai déjà consulté ${ph('les registres en ligne de … (cotes …)')}, sans trouver ${ph('…')}.`), P_(`Pourriez-vous me dire si votre service conserve ${ph('ces registres, ces minutes notariales, ce fonds …')}, et comment en obtenir une copie ? Je reste à votre disposition pour tout renseignement et je prendrai à ma charge les frais éventuels.`), P_('Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.'), P_(ph('Signature'), 'signature')].join('')},
        {key: 'acte', icon: '📜', name: 'Demande d’acte d’état civil', hint: 'à une mairie : naissance, mariage, décès', html: () => [P_(`${ph('Ton prénom et ton nom')}<br>${ph('Ton adresse')}`, 'address'), P_(`Mairie de ${ph('commune')}<br>Service de l’état civil`, 'address', 'margin-left:95mm;margin-top:12pt'), P_(`${ph('Ville')}, le ${esc(dateFr())}`, 'normal', 'text-align:right;margin-top:14pt'), P_('<b>Objet :</b> demande de copie intégrale d’acte', 'normal', 'margin-top:14pt'), P_('Madame, Monsieur,', 'normal', 'margin-top:12pt'), P_(`Je vous serais reconnaissant(e) de bien vouloir m’adresser une copie intégrale de l’acte de ${ph('naissance / mariage / décès')} de :`), `<table class="wp-table"><tbody><tr><td>Nom</td><td>${ph('NOM')}</td></tr><tr><td>Prénoms</td><td>${ph('Prénoms')}</td></tr><tr><td>Date de l’événement</td><td>${ph('jour mois année')}</td></tr><tr><td>Lieu</td><td>${ph('commune')}</td></tr><tr><td>Parents</td><td>${ph('noms du père et de la mère')}</td></tr><tr><td>Mon lien avec la personne</td><td>${ph('arrière-petit-fils, petite-fille…')}</td></tr></tbody></table>`, P_('Vous trouverez ci-joint une enveloppe timbrée à mon adresse pour la réponse.'), P_('Avec mes remerciements, je vous prie d’agréer, Madame, Monsieur, mes salutations distinguées.'), P_(ph('Signature'), 'signature')].join('')},
        {key: 'recit', icon: '📖', name: 'Récit d’un ancêtre', hint: 'la biographie F5 de la fiche, à compléter', person: true, html: async pid => { if (!pid) return P_('Le récit', 'title') + P_(''); const [bio, ppl] = await Promise.all([api('biography', {id: pid}).catch(() => ({text: ''})), api('textdoc_people', {ids: String(pid)}).catch(() => ({people: {}}))]); const p = ppl.people?.[pid] || {}; return P_(esc(p.name || 'Récit'), 'title') + P_(esc([p.by, p.dy].filter(Boolean).join(' – ')), 'subtitle') + bioHtml(bio.text || '', pid) + P_('Ce que la famille raconte', 'h1') + P_(ph('Les souvenirs, les anecdotes, ce qu’on disait d’elle ou de lui…')) + P_('Sources', 'h1') + P_(ph('Les actes et documents consultés…')); }},
        {key: 'visite', icon: '🗄️', name: 'Compte rendu de visite', hint: 'aux archives : cotes vues, trouvailles, suite', html: () => [P_('Compte rendu de visite', 'title'), P_(`${ph('Service d’archives')} — ${esc(dateFr())}`, 'subtitle'), P_('Ce que je cherchais', 'h1'), P_(ph('Les questions de départ, les personnes…')), P_('Les cotes consultées', 'h1'), `<table class="wp-table"><thead><tr><th>Cote</th><th>Ce que c’est</th><th>Résultat</th><th>Notes</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr></tbody></table>`, P_('Ce que j’ai trouvé', 'h1'), P_(ph('Les actes, les photos prises, les surprises…')), P_('La suite', 'h1'), `<ul><li data-st="normal">${ph('Prochaine cote à voir')}</li><li data-st="normal">${ph('Une lettre à écrire')}</li></ul>`].join('')},
        {key: 'rapport', icon: '🔎', name: 'Rapport de recherche', hint: 'question, sources, analyse, conclusion', html: () => [P_('Rapport de recherche', 'title'), P_(`${esc(dateFr())}`, 'subtitle'), `<div class="wp-gen" data-gen="toc" contenteditable="false"></div>`, P_('La question', 'h1'), P_(ph('Ce que je cherche à savoir, en une ou deux phrases.')), P_('Ce que l’on sait déjà', 'h1'), P_(ph('Les faits sûrs, avec leurs sources.')), P_('Les sources consultées', 'h1'), P_(ph('Chaque source, avec sa cote et ce qu’elle dit (Insertion → ❝ Source citée).')), P_('Analyse', 'h1'), P_(ph('Ce qui concorde, ce qui se contredit, les hypothèses.')), P_('Conclusion', 'h1'), P_(ph('Ce que je retiens, et ce qu’il reste à chercher.')), `<div class="wp-gen" data-gen="bib" contenteditable="false"></div>`].join('')},
        {key: 'famille', icon: '💌', name: 'Lettre à la famille', hint: 'pour partager une découverte', html: () => [P_(`${ph('Ville')}, le ${esc(dateFr())}`, 'normal', 'text-align:right'), P_(`Chers ${ph('cousins, cousines')},`, 'normal', 'margin-top:14pt'), P_(`Je voulais vous raconter ce que j’ai découvert sur ${ph('notre arrière-grand-père …')}.`), P_(ph('Le récit de la découverte, avec une photo (Insertion → 🖼 Image).')), P_(`Si vous avez des photos, des lettres ou des souvenirs de ${ph('cette branche')}, je serais très heureux de les voir !`), P_('Je vous embrasse,', 'normal', 'margin-top:14pt'), P_(ph('Ton prénom'), 'signature')].join('')},
        {key: 'transcription', icon: '✍', name: 'Transcription d’acte mise au propre', hint: 'texte de l’acte, notes, références', html: () => [P_(`Acte de ${ph('baptême / mariage / sépulture')} de ${ph('Prénom NOM')}`, 'title'), P_(`${ph('Paroisse ou commune')}, ${ph('date')} — ${ph('cote, page ou vue')}`, 'subtitle'), P_('Transcription', 'h1'), P_(ph('Le texte de l’acte, ligne à ligne…'), 'mono'), P_('Mots difficiles et abréviations', 'h1'), `<ul><li data-st="normal">${ph('ꝑoisse')} = paroisse</li></ul>`, P_('Les personnes de l’acte', 'h1'), `<table class="wp-table"><thead><tr><th>Personne</th><th>Rôle</th><th>Âge, métier, lieu</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table>`].join('')},
        {key: 'chronique', icon: '🏡', name: 'Histoire d’une maison ou d’un village', hint: 'récit en parties, images, notes', html: () => [P_(ph('Le titre'), 'title'), P_(ph('Un sous-titre'), 'subtitle'), `<div class="wp-gen" data-gen="toc" contenteditable="false"></div>`, P_('Les origines', 'h1'), P_(ph('Le récit…')), P_('Les familles', 'h1'), P_(ph('Le récit…')), P_('Aujourd’hui', 'h1'), P_(ph('Le récit…')), `<div class="wp-gen" data-gen="index" contenteditable="false"></div>`].join('')},
    ];
    /** la biographie F5 en paragraphes, ses notes en notes de bas de page */
    function bioHtml(text, pid) {
        const [body, notes] = String(text || '').split(/\n\s*Notes :\n/), list = notes ? notes.split('\n').map(l => l.replace(/^\[\d+\]\s*/, '').trim()).filter(Boolean) : [];
        const paras = body.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
        if (!paras.length) return P_('Pas encore assez d’informations sur la fiche pour écrire sa vie : complète-la, ou écris ici.');
        return paras.map(x => P_(esc(x).replace(/\[(\d+(?:,\d+)*)\]/g, (m, ns) => ns.split(',').map(n => `<sup class="wp-fn" data-fn="${nid('n')}" data-kind="foot" data-note="${esc(list[Number(n) - 1] || '')}" contenteditable="false">${n}</sup>`).join('')).replace(/\n/g, '<br>'))).join('');
    }
    tools.TEMPLATES = TEMPLATES; tools.bioHtml = bioHtml;

    function install() {
        const {Editor} = K();
        Object.assign(Editor.prototype, {
            /* ═════════ Le panneau de droite (E2) ═════════ */
            buildPanel() { this.panelTab = pref('panelTab', 'format'); this.paintPanel(); },
            showPanel(tab, open = '') {
                const pn = this.$('[data-wp-panel]'); if (!tab) { pn.hidden = true; setPrefs({...prefs(), panel: false}); return; }
                pn.hidden = false; setPrefs({...prefs(), panel: true, panelTab: tab}); this.panelTab = tab; this.paintPanel();
                if (open) { const d = pn.querySelector(`[data-wp-sec="${open}"]`); if (d) { d.open = true; d.scrollIntoView({block: 'nearest'}); } }
            },
            paintPanel() {
                const pn = this.$('[data-wp-panel]'); if (!pn) return; const tab = this.panelTab || 'format', open = this.doc.comments.filter(c => !c.done).length, ch = this.changes().length;
                const tabs = `<div class="segmented" role="tablist">${[['format', '🎨 Forme'], ['comments', `💬 ${open || ''}`.trim()], ['changes', `✍ ${ch || ''}`.trim()], ['check', '🔎']].map(([k, l]) => `<button type="button" role="tab" class="${k === tab ? 'is-active' : ''}" data-wp-cmd="panel:${k}" title="${({format: 'Mise en forme', comments: 'Commentaires', changes: 'Modifications suivies', check: 'Vérifier avec les fiches'})[k]}">${esc(l)}</button>`).join('')}</div>`;
                const body = tab === 'comments' ? this.commentsHtml() : tab === 'changes' ? this.changesHtml() : tab === 'check' ? this.checkHtml() : this.formatHtml();
                pn.innerHTML = `${tabs}<div class="wp-pbody" data-wp-pbody>${body}</div>`;
                pn.onclick = e => this.panelClick(e); pn.onchange = e => this.panelChange(e); pn.oninput = e => { if (e.target.matches('[data-wp-p="wmo"]')) this.panelChange(e); };
                if (tab === 'format') this.syncPanel();
            },
            formatHtml() {
                const U = UI(), sec = (k, title, body, open) => U.panelSection({title, key: 'wp-' + k, open, body}).replace('<details', `<details data-wp-sec="${k}"`);
                const st = s => [s.font ? `font-family:'${T().fontOk(s.font)}'` : '', s.size ? `font-size:${Math.min(16, s.size)}pt` : '', s.color ? `color:${s.color}` : '', s.b ? 'font-weight:700' : '', s.i ? 'font-style:italic' : '', s.sc ? 'font-variant:small-caps' : ''].filter(Boolean).join(';');
                const styles = `<div class="wp-stylelist" role="listbox" aria-label="Styles de paragraphe">${this.doc.styles.filter(s => s.kind !== 'c').map(s => `<button type="button" data-wp-st="${esc(s.id)}" style="${st(s)}" title="${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div>
                    <div class="wp-row"><button type="button" class="button small secondary" data-wp-cmd="newstyle">＋ Nouveau style</button><button type="button" class="button small secondary" data-wp-cmd="editstyle">✎ Modifier le style</button></div>
                    <div class="wp-row"><span class="wp-lab">Jeu de styles</span><select data-wp-p="set">${T().STYLE_SETS.map(s => `<option value="${s.id}" ${this.doc.set === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
                    ${this.doc.styles.some(s => s.kind === 'c') ? `<div class="wp-row"><span class="wp-lab">Caractère</span>${this.doc.styles.filter(s => s.kind === 'c').map(s => `<button type="button" class="button small secondary" data-wp-cs="${esc(s.id)}" style="${st(s)}">${esc(s.name)}</button>`).join('')}</div>` : ''}
                    <div class="wp-row"><button type="button" class="button small secondary" data-wp-cmd="layoutstyles">📐 Styles d’un livre…</button></div>`;
                const n = (k, label, unit, step = 1, min = '') => `<label>${label}<input type="number" data-wp-p="${k}" data-unit="${unit}" step="${step}"${min !== '' ? ` min="${min}"` : ''}></label>`;
                const tog = (k, label) => `<label class="ui-toggle"><input type="checkbox" data-wp-p="${k}"><i></i>${label}</label>`;
                const para = `<div class="wp-row"><div class="segmented" role="group" aria-label="Alignement">${[['left', '⟸'], ['center', '≡'], ['right', '⟹'], ['justify', '☰']].map(([k, i]) => `<button type="button" data-wp-cmd="al:${k}" data-wp-al="${k}" title="${({left: 'À gauche', center: 'Centré', right: 'À droite', justify: 'Justifié'})[k]}">${i}</button>`).join('')}</div></div>
                    <div class="wp-row"><span class="wp-lab">Interligne</span><select data-wp-p="lh">${[['', '—'], ['1', 'Simple (1)'], ['1.15', '1,15'], ['1.4', '1,4'], ['1.5', '1,5'], ['2', 'Double (2)'], ['2.5', '2,5'], ['3', 'Triple (3)']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
                    <div class="wp-row">${n('sb', 'Avant', 'pt', 1, 0)}${n('sa', 'Après', 'pt', 1, 0)}</div>
                    <div class="wp-row">${n('il', 'Retrait gauche', 'mm')}${n('ir', 'droite', 'mm')}</div><div class="wp-row">${n('fi', '1re ligne', 'mm')}</div>
                    <div class="wp-row">${tog('drop', 'Lettrine')}${tog('keep', 'Garder avec le suivant')}</div>
                    <div class="wp-row"><button type="button" class="button small secondary" data-wp-cmd="border">▢ Bordure et trame…</button><button type="button" class="button small secondary" data-wp-cmd="tabs">⇥ Tabulations…</button></div>`;
                const chr = `<div class="wp-row"><button type="button" class="button small secondary wp-fontbtn" data-wp-cmd="font" data-wp-pfont>Police…</button>${n('sz', 'Taille', 'pt', 0.5, 4)}</div>
                    <div class="wp-row"><button type="button" class="button small secondary" data-wp-cmd="color">A Couleur…</button><button type="button" class="button small secondary" data-wp-cmd="highlight">🖍 Surlignage…</button><button type="button" class="button small secondary" data-wp-cmd="smallcaps">Petites capitales</button></div>
                    <div class="wp-row"><span class="wp-lab">Casse</span><button type="button" class="button small secondary" data-wp-cmd="case:upper" title="MAJUSCULES">AB</button><button type="button" class="button small secondary" data-wp-cmd="case:lower" title="minuscules">ab</button><button type="button" class="button small secondary" data-wp-cmd="case:sentence" title="Majuscule en début de phrase">Ab.</button><button type="button" class="button small secondary" data-wp-cmd="case:title" title="Chaque Mot">Ab Cd</button></div>`;
                const F = window.LCNDA_FORMATS, papers = F ? F.PRESETS.filter(p => p.group === 'Papier' || p.group === 'Cartes et livres') : [];
                const pg = this.curPage();
                const page = `${this.secs.length > 1 ? `<p class="muted">Section ${this.secs.indexOf(this.curSec()) + 1} sur ${this.secs.length}${this.curSec()?.page ? ' (format à elle)' : ' (comme le document)'}.</p>` : ''}
                    <div class="wp-row"><span class="wp-lab">Format</span><select data-wp-p="size">${papers.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}<option value="custom">✏️ À mes mesures</option></select></div>
                    <div class="wp-row">${n('pw', 'Largeur', 'mm', 1, 50)}${n('ph', 'Hauteur', 'mm', 1, 50)}</div>
                    <div class="wp-row"><div class="segmented" role="group" aria-label="Orientation"><button type="button" data-wp-orient="portrait" class="${pg.orient !== 'landscape' ? 'is-active' : ''}">▯ Portrait</button><button type="button" data-wp-orient="landscape" class="${pg.orient === 'landscape' ? 'is-active' : ''}">▭ Paysage</button></div></div>
                    <div class="wp-row">${n('mt', 'Haut', 'mm', 1, 0)}${n('mb', 'Bas', 'mm', 1, 0)}</div><div class="wp-row">${n('ml', 'Gauche', 'mm', 1, 0)}${n('mr', 'Droite', 'mm', 1, 0)}</div>
                    <div class="wp-row"><button type="button" class="button small secondary" data-wp-cmd="pagecolor">🎨 Couleur de page…</button><button type="button" class="button small secondary" data-wp-cmd="headfoot">En-tête et pied…</button></div>
                    <div class="wp-row"><label>Filigrane<input type="text" data-wp-p="wm" maxlength="60" placeholder="ex. BROUILLON, COPIE"></label></div>
                    <div class="wp-row"><label>Transparence<input type="range" data-wp-p="wmo" min="2" max="60" step="1"></label></div>`;
                const docu = `<div class="wp-row"><label>Auteur<input type="text" data-wp-p="author" maxlength="120"></label></div><div class="wp-row"><label>Sujet<input type="text" data-wp-p="subject" maxlength="200"></label></div>
                    <div class="wp-row"><span class="wp-lab">Langue</span><select data-wp-p="lang">${LANGS.map(([k, l]) => `<option value="${k}" ${this.doc.lang === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
                    <div class="wp-row"><button type="button" class="button small secondary" data-wp-cmd="words">🔢 Nombre de mots…</button><button type="button" class="button small secondary" data-wp-cmd="versions">🕘 Versions…</button></div>`;
                return sec('styles', 'Styles', styles, true) + sec('para', 'Paragraphe', para, true) + sec('char', 'Caractère', chr, false) + sec('page', 'Page', page, false) + sec('doc', 'Document', docu, false);
            },
            curSec() { const r = this.sel() || this.lastRange; return (r && this.secOf(r.startContainer)) || this.secs[0]; },
            curPage() { const s = this.curSec(); return {...T().PAGE0, ...this.doc.page, ...(s?.page || {}), m: {...this.doc.page.m, ...(s?.page?.m || {})}}; },
            /** les valeurs du panneau suivent le curseur */
            syncPanel() {
                const pn = this.$('[data-wp-panel]'); if (!pn || pn.hidden || this.panelTab !== 'format') return; if (pn.contains(document.activeElement) && document.activeElement.matches('input, select')) return;
                const set = (k, v) => { const el = pn.querySelector(`[data-wp-p="${k}"]`); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? ''; };
                const r = this.sel() || this.lastRange, body = r ? this.secOf(r.startContainer)?.body : null, b = body ? blockOf(r.startContainer, body) : null;
                if (b) { const cs = getComputedStyle(b); set('lh', /^[\d.]+$/.test(b.style.lineHeight) ? b.style.lineHeight : ''); set('sb', R1(parseFloat(cs.marginTop) / PT)); set('sa', R1(parseFloat(cs.marginBottom) / PT)); set('il', R1(parseFloat(cs.marginLeft) / MM)); set('ir', R1(parseFloat(cs.marginRight) / MM)); set('fi', R1(parseFloat(cs.textIndent) / MM)); set('drop', !!b.dataset.drop); set('keep', !!b.dataset.keep);
                    pn.querySelectorAll('[data-wp-st]').forEach(x => x.classList.toggle('is-active', x.dataset.wpSt === b.dataset.st)); pn.querySelectorAll('[data-wp-al]').forEach(x => x.classList.toggle('is-active', x.dataset.wpAl === (cs.textAlign === 'start' ? 'left' : cs.textAlign)));
                    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement, ecs = getComputedStyle(el); set('sz', R1(parseFloat(ecs.fontSize) / PT)); const fb = pn.querySelector('[data-wp-pfont]'); if (fb) { fb.textContent = ecs.fontFamily.split(',')[0].replace(/["']/g, ''); fb.style.fontFamily = ecs.fontFamily; } }
                const pg = this.curPage(), F = window.LCNDA_FORMATS; let w = pg.w, h = pg.h; if (pg.orient === 'landscape' && h > w) [w, h] = [h, w];
                const match = F?.PRESETS.find(p => Math.abs(p.w - Math.min(pg.w, pg.h)) < 0.6 && Math.abs(p.h - Math.max(pg.w, pg.h)) < 0.6 && (p.group === 'Papier' || p.group === 'Cartes et livres'));
                set('size', match ? match.id : 'custom'); set('pw', R1(w)); set('ph', R1(h)); set('mt', pg.m.t); set('mb', pg.m.b); set('ml', pg.m.l); set('mr', pg.m.r); set('wm', this.doc.page.wm || ''); set('wmo', this.doc.page.wmo || 12);
                set('author', this.doc.meta?.author || ''); set('subject', this.doc.meta?.subject || '');
            },
            panelClick(e) {
                const b = e.target.closest('button'); if (!b) return;
                if (b.dataset.wpSt) { e.preventDefault(); return this.setStyle(b.dataset.wpSt); }
                if (b.dataset.wpCs) { e.preventDefault(); return this.charStyle(b.dataset.wpCs); }
                if (b.dataset.wpOrient) { e.preventDefault(); return this.setPage({orient: b.dataset.wpOrient}); }
                const cm = b.closest('[data-wp-cmt]'); if (cm && b.dataset.act) { e.preventDefault(); const id = cm.dataset.wpCmt; if (b.dataset.act === 'reply') { const ta = cm.querySelector('[data-reply]'); return this.commentAct(id, 'reply', ta?.value || ''); } return this.commentAct(id, b.dataset.act); }
                const chg = b.closest('[data-wp-chg]'); if (chg && b.dataset.act) { e.preventDefault(); const x = this.changes()[Number(chg.dataset.wpChg)]; if (!x) return; this.selectNode(x); return this.resolveChange(b.dataset.act === 'accept', false); }
                if (cm) return this.focusComment(cm.dataset.wpCmt);
                if (chg) { const x = this.changes()[Number(chg.dataset.wpChg)]; if (x) this.selectNode(x); return; }
                const ck = b.closest('[data-wp-chk]'); if (ck) { const blk = this.factBlocks?.[Number(ck.dataset.wpChk)]; if (blk?.el?.isConnected) this.selectNode(blk.el); }
            },
            panelChange(e) {
                const el = e.target, k = el.dataset.wpP; if (!k) return;
                if (el.closest('[data-wp-cmt]') && el.matches('textarea[data-text]')) { this.commentAct(el.closest('[data-wp-cmt]').dataset.wpCmt, 'text', el.value); return; }
                const v = el.type === 'checkbox' ? el.checked : el.value;
                const para = fn => { this.restoreSel(); this.selBlocks().forEach(p => { fn(p); if (!p.getAttribute('style')) p.removeAttribute('style'); }); this.commit(); this.layoutSoon(0); };
                switch (k) {
                    case 'lh': return para(p => { p.style.lineHeight = v; });
                    case 'sb': return para(p => { p.style.marginTop = v === '' ? '' : `${clamp(v, 0, 200)}pt`; }); case 'sa': return para(p => { p.style.marginBottom = v === '' ? '' : `${clamp(v, 0, 200)}pt`; });
                    case 'il': return para(p => { p.style.marginLeft = Number(v) ? `${clamp(v, -50, 200)}mm` : ''; }); case 'ir': return para(p => { p.style.marginRight = Number(v) ? `${clamp(v, 0, 200)}mm` : ''; }); case 'fi': return para(p => { p.style.textIndent = Number(v) ? `${clamp(v, -100, 100)}mm` : ''; });
                    case 'drop': return para(p => { if (v) p.dataset.drop = '1'; else p.removeAttribute('data-drop'); }); case 'keep': return para(p => { if (v) p.dataset.keep = '1'; else p.removeAttribute('data-keep'); });
                    case 'sz': this.restoreSel(); return this.styleRange(sp => { sp.style.fontSize = `${clamp(v, 4, 144)}pt`; });
                    case 'set': return this.applySet(v);
                    case 'size': { const F = window.LCNDA_FORMATS, p = F?.PRESETS.find(x => x.id === v); if (!p) return; return this.setPage({w: p.w, h: p.h, size: p.id}); }
                    case 'pw': case 'ph': { const pg = this.curPage(); let w = pg.orient === 'landscape' ? Math.max(pg.w, pg.h) : Math.min(pg.w, pg.h), h = pg.orient === 'landscape' ? Math.min(pg.w, pg.h) : Math.max(pg.w, pg.h); if (k === 'pw') w = clamp(v, 50, 1200); else h = clamp(v, 50, 1200); return this.setPage({w: Math.min(w, h), h: Math.max(w, h), orient: w > h ? 'landscape' : 'portrait', size: 'custom'}); }
                    case 'mt': case 'mb': case 'ml': case 'mr': return this.setPage({m: {[k[1]]: clamp(v, 0, 200)}});
                    case 'wm': this.doc.page.wm = String(v).trim().slice(0, 60); if (!this.doc.page.wm) delete this.doc.page.wm; this.commit(); return this.paintSheets();
                    case 'wmo': this.doc.page.wmo = clamp(v, 2, 60); this.paintSheets(); clearTimeout(this.wmT); this.wmT = setTimeout(() => this.commit(), 400); return;
                    case 'author': this.doc.meta.author = String(v).slice(0, 120); return this.commit(); case 'subject': this.doc.meta.subject = String(v).slice(0, 200); return this.commit();
                    case 'lang': return this.setLang(v);
                }
            },
            /** le format de page : la section du curseur si elle a le sien, sinon tout le document */
            setPage(ch) {
                const sec = this.curSec(), target = sec?.page ? sec.page : this.doc.page;
                if (ch.m) target.m = {...(target.m || this.doc.page.m), ...ch.m}; if (ch.orient) target.orient = ch.orient; if (ch.w) { target.w = ch.w; target.h = ch.h; } if (ch.size) target.size = ch.size;
                this.commit(); this.layout(); this.syncPanel(); this.status?.flash('Page : ' + `${R1(Math.min(target.w, target.h) / 10).toString().replace('.', ',')} × ${R1(Math.max(target.w, target.h) / 10).toString().replace('.', ',')} cm, ${target.orient === 'landscape' ? 'paysage' : 'portrait'}`);
            },
            setLang(v) { if (!LANGS.some(l => l[0] === v)) return; this.doc.lang = v; this.bodies().forEach(b => this.spellOn(b)); this.commit(); this.paintStatus(); },
            applySet(id) {
                const fresh = T().styleSet(id), mine = this.doc.styles.filter(s => !T().BUILTIN.has(s.id));
                this.doc.styles = [...fresh, ...mine]; this.doc.set = id; this.applyStyles(); this.commit(); this.layoutSoon(0); this.paintPanel(); this.undoable(`Jeu de styles « ${(T().STYLE_SETS.find(s => s.id === id) || {}).name} »`);
            },
            commentsHtml() {
                const list = this.doc.comments; if (!list.length) return A().empty('Pas encore de commentaire : choisis un passage, puis « 💬 Nouveau commentaire ».', {icon: '💬', action: {label: '＋ Nouveau commentaire', attrs: 'data-wp-cmd="comment"'}});
                const quote = id => { const els = [...this.docEl.querySelectorAll(`.wp-cm[data-cm="${CSS.escape(id)}"]`)]; return els.map(x => x.textContent).join(' ').trim().slice(0, 90); };
                return `<div class="wp-row" style="padding:0 8px"><button type="button" class="button small secondary" data-wp-cmd="comment">＋ Nouveau commentaire</button><button type="button" class="button small secondary" data-wp-cmd="showcm">${pref('showcm', true) === false ? 'Montrer' : 'Cacher'} dans le texte</button></div>` + list.map(c => `<div class="wp-cmt${c.done ? ' is-done' : ''}" data-wp-cmt="${esc(c.id)}"><div class="wp-cmt-h"><b>${esc(c.author || 'Moi')}</b>${UI().when ? UI().when(c.at) : ''}${c.done ? ' ' + UI().badge('Résolu', 'green') : ''}</div><p class="wp-cmt-q">« ${esc(quote(c.id) || '…')} »</p>
                    ${c.text || c.done ? `<p class="wp-cmt-t">${esc(c.text)}</p>` : `<textarea data-wp-p="ctext" data-text rows="3" placeholder="Ton commentaire…" aria-label="Texte du commentaire">${esc(c.text)}</textarea>`}
                    ${(c.replies || []).map(r => `<div class="wp-cmt-r"><b>${esc(r.author || '')}</b> ${UI().when ? UI().when(r.at) : ''}<br>${esc(r.text)}</div>`).join('')}
                    <div class="wp-cmt-a">${c.done ? '' : `<input type="text" data-reply placeholder="Répondre…" aria-label="Répondre"><button type="button" class="button small secondary" data-act="reply">Répondre</button>`}<button type="button" class="button small secondary" data-act="done">${c.done ? '↺ Rouvrir' : '✓ Résolu'}</button><button type="button" class="icon-button small" data-act="delete" title="Supprimer le commentaire" aria-label="Supprimer le commentaire">🗑</button></div></div>`).join('');
            },
            focusComment(id) { const el = this.docEl.querySelector(`.wp-cm[data-cm="${CSS.escape(id)}"]`); if (el) { this.selectNode(el); this.showComment(id); } },
            changesHtml() {
                const list = this.changes();
                const head = `<div class="wp-row" style="padding:0 8px"><button type="button" class="button small ${this.doc.track ? '' : 'secondary'}" data-wp-cmd="track">✍ ${this.doc.track ? 'Suivi en cours' : 'Suivre les modifications'}</button><button type="button" class="button small secondary" data-wp-cmd="tcshow">Montrer ▾</button></div>${list.length ? `<div class="wp-row" style="padding:0 8px"><button type="button" class="button small secondary" data-wp-cmd="acceptall">✓ Tout accepter</button><button type="button" class="button small secondary" data-wp-cmd="rejectall">✗ Tout refuser</button></div>` : ''}`;
                if (!list.length) return head + A().empty(this.doc.track ? 'Rien de changé depuis : ce que tu tapes ou effaces apparaîtra ici.' : 'Aucune modification suivie. « ✍ Suivre les modifications » garde la trace de chaque ajout et de chaque suppression.', {icon: '✍'});
                return head + list.slice(0, 400).map((x, i) => `<div class="wp-chg${x.tagName === 'DEL' ? ' is-del' : ''}" data-wp-chg="${i}"><div class="wp-cmt-h"><b>${esc(x.dataset.a || '')}</b> ${x.tagName === 'DEL' ? 'a supprimé' : 'a ajouté'} ${UI().when ? UI().when(x.dataset.t) : ''}</div><p class="wp-chg-t">${x.tagName === 'DEL' ? '<s>' : ''}${esc(x.textContent.slice(0, 120))}${x.tagName === 'DEL' ? '</s>' : ''}</p><div class="wp-cmt-a"><button type="button" class="button small secondary" data-act="accept">✓ Accepter</button><button type="button" class="button small secondary" data-act="reject">✗ Refuser</button></div></div>`).join('');
            },
            checkHtml() {
                const res = this.factResults;
                const head = `<div class="wp-row" style="padding:0 8px"><button type="button" class="button small" data-wp-cmd="facts">🔎 Vérifier avec les fiches</button></div><p class="muted" style="padding:0 8px">Les dates et les lieux écrits à côté d’un nom de la base sont comparés à sa fiche (naissance, baptême, mariage, décès, inhumation, âges, numéros Sosa). Rien n’est changé tout seul.</p>`;
                if (!res) return head;
                if (!res.length) return head + A().empty('Tout concorde avec les fiches.', {icon: '✓'});
                return head + res.map((x, i) => `<div class="wp-chk ${x.lvl === 'err' ? 'is-err' : x.lvl === 'info' ? 'is-info' : ''}" data-wp-chk="${x.id}" role="button" tabindex="0">${esc(x.text)}</div>`).join('');
            },
            /* ═════════ Le panneau de navigation : titres, pages, résultats ═════════ */
            toggleNav(tab) { const s = this.$('[data-wp-side]'); if (tab) { s.hidden = false; this.navTab = tab; } else s.hidden = !s.hidden; setPrefs({...prefs(), nav: !s.hidden}); this.paintNav(); },
            paintNav() {
                const side = this.$('[data-wp-side]'); if (!side || side.hidden) return; const tab = this.navTab || 'heads';
                const tabs = `<div class="segmented" role="tablist">${[['heads', 'Titres'], ['pages', 'Pages'], ['found', 'Résultats']].map(([k, l]) => `<button type="button" role="tab" class="${k === tab ? 'is-active' : ''}" data-nav="${k}">${l}</button>`).join('')}</div>`;
                let body = '';
                if (tab === 'heads') body = (this.headings || []).length ? this.headings.map((h, i) => `<button type="button" class="wp-nav-item" data-nav-h="${i}" style="padding-left:${6 + (h.lvl - 1) * 12}px"><small>${h.page}</small>${esc(h.text || '(titre vide)')}</button>`).join('') : A().empty('Pas encore de titre : choisis le style « Titre 1 » (ou Titre 2, 3…) pour un paragraphe, il apparaîtra ici.', {icon: '🧭'});
                if (tab === 'pages') body = Array.from({length: this.totalPages || 1}, (_, i) => `<button type="button" class="wp-nav-item" data-nav-p="${i + 1}">Page ${i + 1}</button>`).join('');
                if (tab === 'found') body = (this.found || []).length ? this.found.slice(0, 500).map((f, i) => `<button type="button" class="wp-nav-item${i === this.foundAt ? ' is-active' : ''}" data-nav-f="${i}">${f.ctx}</button>`).join('') : A().empty('Cherche un mot avec 🔍 : chaque endroit trouvé s’affiche ici.', {icon: '🔍'});
                side.innerHTML = tabs + `<div>${body}</div>`;
                side.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.nav) { this.navTab = b.dataset.nav; return this.paintNav(); } if (b.dataset.navH) { const h = this.headings[Number(b.dataset.navH)]; if (h?.el) { this.selectNode(h.el); getSelection().collapseToStart(); } } if (b.dataset.navP) this.gotoPage(Number(b.dataset.navP)); if (b.dataset.navF) { this.foundAt = Number(b.dataset.navF); this.showFound(); } };
            },
            gotoPage(n) { const sec = this.secs.find(s => n > s.first && n <= s.first + s.pages); if (!sec) return; const sheet = sec.sheets.querySelector(`[data-page="${n}"]`); if (sheet) { const top = sheet.getBoundingClientRect().top - this.scroll.getBoundingClientRect().top + this.scroll.scrollTop - 10; this.scroll.scrollTop = top; } },

            /* ═════════ Rechercher et remplacer ═════════ */
            openFind(replace) {
                const bar = this.$('[data-wp-findbar]'); const was = !bar.hidden; bar.hidden = false;
                if (!was) { bar.innerHTML = `<span aria-hidden="true">🔍</span><input type="search" data-f="q" placeholder="Chercher… (un mot, un nom)" aria-label="Chercher"><span class="wp-find-n" data-f="n" aria-live="polite"></span><button type="button" class="icon-button small" data-f="prev" title="Précédent (⇧ Entrée)" aria-label="Précédent">↑</button><button type="button" class="icon-button small" data-f="next" title="Suivant (Entrée)" aria-label="Suivant">↓</button>
                        <input type="text" data-f="r" placeholder="Remplacer par…" aria-label="Remplacer par"><button type="button" class="button small secondary" data-f="one">Remplacer</button><button type="button" class="button small secondary" data-f="all">Tout remplacer</button>
                        <label class="checkbox-line" title="Majuscules et minuscules comptent"><input type="checkbox" data-f="case"> Aa</label><label class="checkbox-line" title="Le mot entier seulement"><input type="checkbox" data-f="word"> Mot entier</label><label class="checkbox-line" title="* = des lettres, ? = une lettre, # = un chiffre"><input type="checkbox" data-f="rx"> Expressions simples</label>
                        <button type="button" class="icon-button small" data-f="close" title="Fermer (Échap)" aria-label="Fermer">×</button>`;
                    const q = bar.querySelector('[data-f="q"]');
                    bar.addEventListener('input', e => { if (e.target.matches('[data-f="q"]')) { clearTimeout(this.fT); this.fT = setTimeout(() => this.doFind(), 140); } });
                    bar.addEventListener('change', e => { if (e.target.type === 'checkbox') this.doFind(); });
                    bar.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (e.target.matches('[data-f="r"]')) return this.replaceOne(); this.stepFind(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.run('findclose'); } });
                    bar.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b || b.tagName !== 'BUTTON') return; ({prev: () => this.stepFind(-1), next: () => this.stepFind(1), one: () => this.replaceOne(), all: () => this.replaceAll(), close: () => this.run('findclose')})[b.dataset.f]?.(); });
                    void q;
                }
                const q = bar.querySelector('[data-f="q"]'), seltext = this.sel()?.toString(); if (seltext && seltext.length < 80 && !seltext.includes('\n')) q.value = seltext;
                (replace ? bar.querySelector('[data-f="r"]') : q).focus(); q.select?.(); this.doFind();
            },
            findRx() {
                const bar = this.$('[data-wp-findbar]'), q = bar?.querySelector('[data-f="q"]')?.value || ''; if (!q) return null;
                const c = bar.querySelector('[data-f="case"]').checked, w = bar.querySelector('[data-f="word"]').checked, rx = bar.querySelector('[data-f="rx"]').checked;
                let src = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (rx) src = src.replace(/\\\*/g, '[\\p{L}\\p{N}\'’-]*').replace(/\\\?/g, '[\\p{L}\\p{N}]').replace(/#/g, '\\p{N}');
                if (w) src = `(?<![\\p{L}\\p{N}])${src}(?![\\p{L}\\p{N}])`;
                try { return new RegExp(src, `gu${c ? '' : 'i'}`); } catch (_) { return null; }
            },
            /** chaque paragraphe : son texte et, pour chaque lettre, son nœud (les passages supprimés et les éléments spéciaux ne comptent pas) */
            textMap(el) {
                const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {acceptNode: n => (n.parentElement.closest('[contenteditable="false"], del, .wp-endnotes') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)}), parts = []; let n, text = '';
                while ((n = w.nextNode())) { parts.push({n, at: text.length}); text += n.data; }
                const pos = i => { for (let k = parts.length - 1; k >= 0; k--) if (parts[k].at <= i) return [parts[k].n, i - parts[k].at]; return [parts[0]?.n, 0]; };
                return {text, pos, parts};
            },
            findBlocks() { return this.bodies().flatMap(b => [...b.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, figcaption')].filter(x => !x.querySelector('p, li, h1, h2, h3, h4, h5, h6, td') && !x.closest('[contenteditable="false"]:not(figure)'))); },
            doFind(keep = false) {
                const rx = this.findRx(), out = [];
                if (rx) this.findBlocks().forEach(b => { const m = this.textMap(b); if (!m.parts.length) return; let x; rx.lastIndex = 0; while ((x = rx.exec(m.text)) && out.length < 5000) { if (!x[0].length) { rx.lastIndex++; continue; } const [sn, so] = m.pos(x.index), [en, eo] = m.pos(x.index + x[0].length - 1); const r = document.createRange(); r.setStart(sn, so); r.setEnd(en, eo + 1); out.push({r, ctx: `${esc(m.text.slice(Math.max(0, x.index - 24), x.index))}<mark>${esc(x[0])}</mark>${esc(m.text.slice(x.index + x[0].length, x.index + x[0].length + 24))}`}); } });
                this.found = out; if (!keep) { const r = this.sel() || this.lastRange; this.foundAt = r ? Math.max(0, out.findIndex(f => f.r.compareBoundaryPoints(Range.START_TO_START, r) >= 0)) : 0; } else this.foundAt = Math.min(this.foundAt || 0, Math.max(0, out.length - 1));
                this.showFound(false);
                if (out.length && this.$('[data-wp-side]').hidden && innerWidth > 760) this.toggleNav('found'); else this.paintNav();
            },
            showFound(scroll = true) {
                const n = this.$('[data-wp-findbar] [data-f="n"]'), f = this.found || [];
                try { if (window.CSS?.highlights) { CSS.highlights.set('wp-find', new Highlight(...f.map(x => x.r))); CSS.highlights.set('wp-find-cur', new Highlight(...(f[this.foundAt] ? [f[this.foundAt].r] : []))); } } catch (_) {}
                if (n) n.textContent = f.length ? `${(this.foundAt || 0) + 1} / ${f.length}` : (this.findRx() ? 'Rien trouvé' : '');
                const cur = f[this.foundAt]; if (cur && scroll) { const rc = cur.r.getBoundingClientRect(), vp = this.scroll.getBoundingClientRect(); if (rc.top < vp.top + 30 || rc.bottom > vp.bottom - 30) this.scroll.scrollTop += rc.top - vp.top - vp.height / 3; }
                this.$$('[data-nav-f]').forEach(b => b.classList.toggle('is-active', Number(b.dataset.navF) === this.foundAt));
            },
            stepFind(d) { const f = this.found || []; if (!f.length) return; this.foundAt = ((this.foundAt || 0) + d + f.length) % f.length; this.showFound(); },
            replaceOne() {
                const f = this.found || [], cur = f[this.foundAt]; if (!cur) return; const rep = this.$('[data-wp-findbar] [data-f="r"]').value;
                this.commit(); const r = cur.r; if (this.doc.track) { getSelection().removeAllRanges(); getSelection().addRange(r); this.markDeleted(r); const s = getSelection(); if (this.lastMark) { s.removeAllRanges(); s.addRange(this.lastMark); s.collapseToEnd(); } if (rep) this.trackInsert(rep); } else { r.deleteContents(); if (rep) r.insertNode(document.createTextNode(rep)); }
                this.bodies().forEach(b => b.normalize()); this.commit(); this.doFind(true); this.layoutSoon();
            },
            replaceAll() {
                const f = (this.found || []).slice(); if (!f.length) return toast('Rien à remplacer.'); const rep = this.$('[data-wp-findbar] [data-f="r"]').value;
                this.commit();
                f.reverse().forEach(x => { if (this.doc.track) { getSelection().removeAllRanges(); getSelection().addRange(x.r); this.markDeleted(x.r); const s = getSelection(); if (this.lastMark) { s.removeAllRanges(); s.addRange(this.lastMark); s.collapseToEnd(); } if (rep) this.trackInsert(rep); } else { x.r.deleteContents(); if (rep) x.r.insertNode(document.createTextNode(rep)); } });
                this.bodies().forEach(b => b.normalize()); this.commit(); this.doFind(true); this.layoutSoon(0);
                this.undoable(`${plural(f.length, 'remplacement')} fait${f.length > 1 ? 's' : ''}`);
            },
        });
        tools.installed = true;
    }

    /* ═════════ Les commandes de cet outil (appelées par run() de l'éditeur) ═════════ */
    tools.run = async (ed, cmd, arg) => {
        const [c, v] = String(cmd).split(':');
        try {
            switch (c) {
                case 'find': return ed.openFind(false); case 'replace': return ed.openFind(true);
                case 'findclose': { ed.$('[data-wp-findbar]').hidden = true; try { CSS.highlights?.delete('wp-find'); CSS.highlights?.delete('wp-find-cur'); } catch (_) {} ed.found = []; ed.paintNav(); return ed.focusBack(); }
                case 'goto': { const n = await A().askText({title: 'Aller à la page', message: `Numéro de la page (1 à ${ed.totalPages || 1}) :`, value: '1', okLabel: 'Aller'}); if (n) ed.gotoPage(clamp(n, 1, ed.totalPages || 1)); return; }
                case 'image': return insertImage(ed, arg);
                case 'table': return insertTable(ed);
                case 'sheet': return insertSheet(ed);
                case 'tosheet': return tableToSheet(ed);
                case 'link': return insertLink(ed);
                case 'footnote': case 'endnote': { ed.restoreSel(); const id = nid('n'); T2(ed, `<sup class="wp-fn" data-fn="${id}" data-kind="${c === 'endnote' ? 'end' : 'foot'}" data-note="" contenteditable="false">*</sup>`); ed.layout(); const s = ed.docEl.querySelector(`sup.wp-fn[data-fn="${id}"]`); if (s) ed.editNote(s); return; }
                case 'cite': return insertCite(ed);
                case 'toc': case 'index': case 'bib': ed.restoreSel(); T2(ed, `<div class="wp-gen" data-gen="${c}" contenteditable="false"></div>`); tools.refreshGenerated(ed, true, true); return ed.layoutSoon(0);
                case 'xe': { ed.restoreSel(); const r = ed.sel(); const t = r?.toString().trim(); const term = await A().askText({title: 'Marquer pour l’index', message: 'Le mot tel qu’il apparaîtra dans l’index :', value: t || '', okLabel: 'Marquer'}); if (!term?.trim()) return; ed.focusBack(); if (t) ed.styleRange(sp => { sp.classList.add('wp-xe'); sp.dataset.xe = term.trim().slice(0, 80); }); else T2(ed, `<span class="wp-xe" data-xe="${esc(term.trim().slice(0, 80))}">${esc(term.trim())}</span>`); return; }
                case 'person': return insertPerson(ed);
                case 'place': return insertPlace(ed);
                case 'media': return insertMediaLink(ed);
                case 'bio': return insertBio(ed);
                case 'tree': return insertTree(ed);
                case 'diagram': return insertDiagram(ed);
                case 'chars': return charsDialog(ed);
                case 'date': ed.restoreSel(); return T2(ed, esc(dateFr()));
                case 'field': return fieldMenu(ed, arg);
                case 'pagebreak': ed.restoreSel(); T2(ed, '<hr class="wp-pb" data-break="page" contenteditable="false">'); return ed.status?.flash('Saut de page : la suite commence en haut de la page suivante.');
                case 'sectionbreak': return sectionBreak(ed);
                case 'columns': return columnsDialog(ed);
                case 'hr': ed.restoreSel(); return T2(ed, '<hr class="wp-hr">');
                case 'headfoot': return headFootDialog(ed);
                case 'words': return wordsDialog(ed);
                case 'lang': return langDialog(ed);
                case 'facts': return factCheck(ed);
                case 'read': return readAloud(ed);
                case 'stopread': try { speechSynthesis.cancel(); } catch (_) {} ed.reading = false; ed.docEl.querySelectorAll('.wp-read').forEach(x => x.classList.remove('wp-read')); return ed.status?.flash('Lecture arrêtée.');
                case 'newstyle': return newStyle(ed);
                case 'editstyle': return editStyle(ed);
                case 'styleset': return styleSetDialog(ed);
                case 'layoutstyles': return layoutStyles(ed);
                case 'pagecolor': return UI().openColorBox(arg && arg.isConnected ? arg : ed.$('[data-wp-cmd="pagecolor"]') || {x: innerWidth / 2, y: 200}, {allowNone: true, get: () => ed.doc.page.color || '#ffffff', set: (val, fin) => { ed.doc.page.color = val || ''; if (!ed.doc.page.color) delete ed.doc.page.color; ed.paintSheets(); if (fin) ed.commit(); }});
                case 'pagesetup': return ed.showPanel('format', 'page');
                case 'props': return ed.showPanel('format', 'doc');
                case 'tabs': return tabsDialog(ed);
                case 'settings': return settingsDialog(ed);
                case 'keys': return keysDialog();
                case 'fieldsupdate': return tools.updateFields(ed, true);
                default: { const fn = ext.textDocCommands?.[c]; if (typeof fn === 'function') return fn(ed, v, arg); return tools.filesRun?.(ed, cmd, arg); } // commandes ajoutées par d'autres fichiers (publipostage…)
            }
        } catch (e) { toast(e.message || String(e), 'error'); }
    };

    /* ── les images (la fenêtre unique), collées ou déposées ── */
    const mediaSrc = it => (it?.filename ? `media/${String(it.filename).replace(/^media\//, '')}` : String(it?.thumb || it?.src || '').replace(/^\.?\//, ''));
    function figureHtml(ed, src, {mid = 0, alt = '', w = 0} = {}) {
        const cw = (ed.curBody()?.clientWidth || 600);
        return `<figure class="wp-fig" data-wrap="topbottom" data-align="center" contenteditable="false" style="width:${Math.round(Math.min(Math.max(w || cw * 0.6, 60), cw * 0.75))}px"><img src="${esc(src)}" alt="${esc(alt)}"${mid ? ` data-media="${Number(mid)}"` : ''}></figure>`;
    }
    async function insertImage(ed, o = {}) {
        ed.restoreSel(); const range = ed.lastRange;
        const P2 = window.LCNDA_MEDIA_PICKER; if (!P2?.openMediaPicker) return toast('La fenêtre des images n’est pas chargée.', 'error');
        const it = await P2.openMediaPicker({types: ['image'], allowImport: true, title: o.replace ? 'Changer l’image' : 'Choisir une image'}); if (!it) return;
        const src = mediaSrc(it); if (!/^media\//.test(src)) return toast('Cette image n’a pas de fichier.', 'error');
        if (o.replace) { const img = o.replace.querySelector('img') || o.replace; img.src = src; img.alt = it.title || ''; img.dataset.media = it.id; ed.commit(); return ed.layoutSoon(0); }
        ed.lastRange = range; ed.restoreSel(); const nat = await natW(src); T2(ed, figureHtml(ed, src, {mid: it.id, alt: it.title || '', w: nat}));
        ed.status?.flash('Image posée : clic pour la taille, clic droit pour l’habillage (carré, haut et bas) et la légende.');
    }
    const natW = src => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0); im.src = src; setTimeout(() => res(0), 3000); });
    tools.insertImageFile = async (ed, file) => {
        const P2 = window.LCNDA_PICKER || A(); if (!P2?.importMediaFile) return toast('Envoi des images indisponible.', 'error');
        ed.status?.flash('Image rangée dans les médias…');
        try { const m = await P2.importMediaFile(file, ['image']); const src = mediaSrc(m); T2(ed, figureHtml(ed, src, {mid: m.id, alt: m.title || '', w: await natW(src)})); toast('Image ajoutée (et rangée dans les médias).'); } catch (e) { toast(e.message, 'error'); }
    };
    /** les images collées ou importées (data:…) entrent dans les médias */
    tools.adoptImages = async ed => {
        const P2 = window.LCNDA_PICKER || A(); if (!P2?.importMediaFile || ed.adopting) return; const imgs = ed.bodies().flatMap(b => [...b.querySelectorAll('img[src^="data:image/"]')]); if (!imgs.length) return;
        ed.adopting = true; let n = 0;
        for (const im of imgs.slice(0, 60)) { try { const d = T().fromDataUrl(im.getAttribute('src')); if (!d) continue; const f = new File([d.data], `image-${Date.now()}-${n}.${d.type === 'jpeg' ? 'jpg' : d.type}`, {type: `image/${d.type}`}); const m = await P2.importMediaFile(f, ['image']); if (im.isConnected) { im.src = mediaSrc(m); im.dataset.media = m.id; n++; } } catch (_) { break; } }
        ed.adopting = false; if (n) { ed.commit(); ed.status?.flash(`${plural(n, 'image')} rangée${n > 1 ? 's' : ''} dans les médias.`); }
    };
    /* ── tableau ── */
    function insertTable(ed) {
        ed.restoreSel(); const range = ed.lastRange;
        ext.openDialog({eyebrow: 'INSERTION', title: '▦ Nouveau tableau', submitLabel: 'Créer le tableau', body: `<div class="form-grid"><label>Lignes<input type="number" name="r" min="1" max="200" value="3"></label><label>Colonnes<input type="number" name="c" min="1" max="20" value="3"></label><label class="checkbox-line"><input type="checkbox" name="h" checked> Une ligne d’en-tête (répétée sur chaque page)</label><label class="checkbox-line"><input type="checkbox" name="bd" checked> Bordures</label></div>`,
            onSubmit: f => { const r = clamp(f.elements.r.value, 1, 200), c = clamp(f.elements.c.value, 1, 20), h = f.elements.h.checked; if (!(Number(f.elements.r.value) >= 1)) return UI().fail(f.elements.r, 'Au moins une ligne.');
                const row = tag => `<tr>${Array.from({length: c}, () => `<${tag}><br></${tag}>`).join('')}</tr>`;
                ed.lastRange = range; T2(ed, `<table class="wp-table"${f.elements.bd.checked ? '' : ' data-bd="0"'}>${h ? `<thead>${row('th')}</thead>` : ''}<tbody>${Array.from({length: h ? r - 1 || 1 : r}, () => row('td')).join('')}</tbody></table>`); }});
    }
    async function insertSheet(ed) {
        ed.restoreSel(); const range = ed.lastRange;
        const it = await P().openPicker({kind: 'workbook', title: 'Choisir un classeur du Tableur'}); if (!it) return;
        const S = window.LCNDA_SHEET; if (!S) return toast('Le moteur du tableur n’est pas chargé.', 'error');
        const r = await api('workbook', {id: it.id}), wb = S.normalize(r.data), calc = new S.Calc(wb);
        let si = wb.active || 0;
        if (wb.sheets.length > 1) { si = await new Promise(res => UI().menuAt({x: innerWidth / 2 - 100, y: 160}, wb.sheets.map((s, i) => ({icon: '▦', label: s.name, run: () => res(i)})), {title: 'Quelle feuille ?', onClose: () => setTimeout(() => res(-1), 50)})); if (si < 0) return; }
        const g = S.usedRange(wb.sheets[si]); if (!g) return toast('Cette feuille est vide.');
        if ((g.r1 + 1) * (g.c1 + 1) > 20000) return toast('Feuille trop grande pour un document (plus de 20 000 cases) : choisis une plage plus petite dans le Tableur.', 'error');
        const m = S.matrix(wb, calc, si, {r0: 0, c0: 0, r1: g.r1, c1: g.c1}, {display: true});
        ed.lastRange = range; T2(ed, `<table class="wp-table"><thead><tr>${m[0].map(v => `<th>${esc(v) || '<br>'}</th>`).join('')}</tr></thead><tbody>${m.slice(1).map(row => `<tr>${row.map(v => `<td>${esc(v) || '<br>'}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        toast(`Tableau « ${wb.sheets[si].name} » ajouté (${plural(m.length, 'ligne')}).`);
    }
    function tableToSheet(ed) {
        const c = ed.cell(); if (!c) return toast('Place le curseur dans un tableau.');
        const t = c.closest('table'), rows = [...t.rows].map(tr => [...tr.cells].flatMap(x => [x.textContent.trim(), ...Array(x.colSpan - 1).fill('')]));
        if (!ext.openWorkbook || !window.LCNDA_SHEET) return toast('Le tableur n’est pas chargé.', 'error');
        const S = window.LCNDA_SHEET, wb = S.newWorkbook(); wb.sheets[0].cells = S.rowsToCells(rows.map(r => r.map(v => S.parseInput(v).v))); ext.openWorkbook({data: wb, name: `Tableau de « ${ed.name} »`});
    }
    /* ── lien ── */
    function insertLink(ed) {
        ed.restoreSel(); const r = ed.sel() || ed.lastRange, range = r?.cloneRange(), a = (r?.startContainer.nodeType === 3 ? r.startContainer.parentElement : r?.startContainer)?.closest?.('.wp-body a[href]');
        const text = a ? a.textContent : r?.toString() || '';
        ext.openDialog({eyebrow: 'INSERTION', title: a ? '🔗 Modifier le lien' : '🔗 Nouveau lien', submitLabel: a ? 'Enregistrer' : 'Créer le lien', onDelete: a ? () => { a.replaceWith(...a.childNodes); ed.commit(); } : undefined,
            body: `<div class="form-grid one-column"><label>Texte affiché<input type="text" name="t" value="${esc(text)}" maxlength="300"></label><label>Adresse<input type="text" name="u" value="${esc(a?.getAttribute('href') || 'https://')}" placeholder="https://…, mailto:…" spellcheck="false"></label><p class="muted">Pour une fiche ou un lieu de la base : Insertion → 👤 Une personne, 📍 Un lieu.</p></div>`,
            onSubmit: f => { const u = f.elements.u.value.trim(), t = f.elements.t.value.trim(); if (!/^(https?:\/\/[^\s]+\.[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(u)) return UI().fail(f.elements.u, 'Une adresse qui commence par https:// (ou mailto:).'); if (!t) return UI().fail(f.elements.t, 'Écris le texte du lien.');
                if (a) { a.setAttribute('href', u); if (a.textContent !== t) a.textContent = t; ed.commit(); return; }
                ed.lastRange = range; T2(ed, `<a href="${esc(u)}">${esc(t)}</a>`); }});
    }
    /* ── source citée (F4) et bibliographie ── */
    async function insertCite(ed) {
        ed.restoreSel(); const range = ed.lastRange; const C = ext.citations; const pref0 = C?.preferred?.() || 'fr';
        ext.openDialog({eyebrow: 'INSERTION', title: '❝ Citer une source', submitLabel: 'Ajouter la citation', body: `<div class="form-grid one-column"><span class="pk-lab">Source</span>${P().pickerField({name: 'src', kind: 'source', inline: true})}
            <label>Style<select name="st">${Object.entries(C?.STYLES || {fr: 'Classique (à la française)'}).map(([k, l]) => `<option value="${k}" ${k === pref0 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label>Où<select name="where"><option value="foot">En note de bas de page</option><option value="end">En note de fin</option><option value="inline">Dans le texte, entre parenthèses</option></select></label><p class="muted">La bibliographie (Insertion → 📚) reprend toute seule les sources citées.</p></div>`,
            onSubmit: async f => { const id = Number(f.elements.src.value); if (!id) return UI().fail(f.querySelector('.pk-field input, [data-picker] input') || f.elements.src, 'Choisis une source.'); const st = f.elements.st.value; C?.setPreferred?.(st);
                const d = await api('source_citations', {source_id: id, only: 1}); const it = d.items?.[0]; if (!it) throw new Error('Source introuvable.'); const note = it.styles?.[st]?.note || it.title;
                ed.lastRange = range; if (f.elements.where.value === 'inline') T2(ed, ` (${esc(note.replace(/\.$/, ''))})`); else T2(ed, `<sup class="wp-fn" data-fn="${nid('n')}" data-kind="${f.elements.where.value === 'end' ? 'end' : 'foot'}" data-note="${esc(note)}" data-src="${id}" data-fmt="${esc(st)}" contenteditable="false">*</sup>`);
                tools.refreshGenerated(ed, true, true); }});
    }
    /* ── sommaire, index, bibliographie : refaits à chaque mise en page ── */
    const bibCache = new Map();
    tools.refreshGenerated = (ed, withPages, force = false) => {
        const gens = ed.bodies().flatMap(b => [...b.querySelectorAll('.wp-gen')]); if (!gens.length) return;
        gens.forEach(g => {
            let html = '';
            if (g.dataset.gen === 'toc') { const hs = (ed.headings || []).filter(h => h.lvl <= 3); html = `<p class="wp-gen-h">Sommaire</p>${hs.length ? hs.map((h, i) => `<div class="wp-gen-l" data-lvl="${h.lvl}" data-goto="${ed.headings.indexOf(h)}"><span>${esc(h.text || '…')}</span><i></i><b>${withPages ? h.page : ''}</b></div>`).join('') : '<p class="wp-gen-b">(Les titres — Titre 1, 2, 3 — apparaîtront ici.)</p>'}`; }
            if (g.dataset.gen === 'index') {
                const terms = new Map(), add = (k, el) => { k = k.trim(); if (!k) return; const sec = ed.secs.find(s => s.body.contains(el)), pitch = (sec?.geo?.H || 1100) + K().GAP; const page = (sec?.first || 0) + Math.floor(ed.offTop(el, sec.body) / pitch) + 1; const l = terms.get(k) || new Set(); l.add(page); terms.set(k, l); };
                ed.bodies().forEach(b => b.querySelectorAll('a.wp-person, a.wp-place, .wp-xe').forEach(x => add(x.dataset.xe || (x.classList.contains('wp-person') ? (x.dataset.part && x.dataset.part !== 'name' ? (ed.peopleCache?.get(Number(x.dataset.wpPerson))?.name || x.textContent) : x.textContent) : x.textContent), x)));
                const keys = [...terms.keys()].sort((a, b) => a.localeCompare(b, 'fr', {sensitivity: 'base'})); let letter = '';
                html = `<p class="wp-gen-h">Index</p>${keys.length ? keys.map(k => { const L = k.normalize('NFD')[0].toUpperCase(); const head = L !== letter ? `<p class="wp-gen-k">${esc((letter = L))}</p>` : ''; return `${head}<p class="wp-gen-b" data-lvl="1">${esc(k)}${withPages ? `, ${[...terms.get(k)].sort((a, b) => a - b).join(', ')}` : ''}</p>`; }).join('') : '<p class="wp-gen-b">(Les personnes, les lieux et les mots marqués pour l’index apparaîtront ici.)</p>'}`;
            }
            if (g.dataset.gen === 'bib') {
                const ids = [...new Set(ed.bodies().flatMap(b => [...b.querySelectorAll('sup.wp-fn[data-src]')]).map(s => `${s.dataset.src}|${s.dataset.fmt || 'fr'}`))];
                const todo = ids.filter(k => !bibCache.has(k));
                if (todo.length && !ed.bibLoading) { ed.bibLoading = true; Promise.all(todo.map(k => { const [id, st] = k.split('|'); return api('source_citations', {source_id: id, only: 1}).then(d => bibCache.set(k, d.items?.[0]?.styles?.[st]?.biblio || d.items?.[0]?.title || '')).catch(() => bibCache.set(k, '')); })).then(() => { ed.bibLoading = false; ed.layoutSoon(0); }); }
                const list = [...new Set(ids.map(k => bibCache.get(k)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', {sensitivity: 'base'}));
                html = `<p class="wp-gen-h">Bibliographie</p>${list.length ? list.map(t => `<p class="wp-gen-b" data-lvl="1">${esc(t)}</p>`).join('') : '<p class="wp-gen-b">(Les sources citées — Insertion → ❝ Source citée — apparaîtront ici.)</p>'}`;
            }
            if (g._k !== html) { const grew = !!g._k && g._k.length !== html.length; g._k = html; g.innerHTML = html; if (withPages && !force && grew) ed.layoutSoon(30); }
        });
    };
    /* ── personnes et lieux de la base (le menu de choix unique) ; nom, dates ou lieux tenus à jour ── */
    const PARTS = [['name', 'Le nom (lien vers la fiche)'], ['life', 'Le nom et les années (1850 – 1920)'], ['birth', 'La naissance : date et lieu'], ['death', 'Le décès : date et lieu'], ['full', 'Le nom, la naissance et le décès']];
    const partText = (p, part) => { if (!p) return ''; const b = [p.birth, p.birth_place && `à ${p.birth_place}`].filter(Boolean).join(' '), d = [p.death, p.death_place && `à ${p.death_place}`].filter(Boolean).join(' ');
        return part === 'life' ? `${p.name}${p.by || p.dy ? ` (${p.by || '?'} – ${p.dy || ''})`.replace(' – )', ')') : ''}` : part === 'birth' ? (b ? `${p.gender === 'female' ? 'née' : 'né'} ${b}` : `${p.gender === 'female' ? 'née' : 'né'} à une date inconnue`) : part === 'death' ? (d ? `${p.gender === 'female' ? 'décédée' : 'décédé'} ${d}` : 'décès inconnu') : part === 'full' ? [p.name, b && `${p.gender === 'female' ? 'née' : 'né'} ${b}`, d && `${p.gender === 'female' ? 'décédée' : 'décédé'} ${d}`].filter(Boolean).join(', ') : p.name; };
    async function insertPerson(ed) {
        ed.restoreSel(); const range = ed.lastRange;
        const it = await P().openPicker({kind: 'person', title: 'Choisir une personne'}); if (!it) return;
        const part = await new Promise(res => UI().menuAt({x: innerWidth / 2 - 150, y: 180}, PARTS.map(([k, l]) => ({icon: k === 'name' ? '👤' : k === 'life' ? '⏳' : k === 'birth' ? '°' : k === 'death' ? '†' : '≡', label: l, run: () => res(k)})), {title: `${it.title} — que faut-il écrire ?`, onClose: () => setTimeout(() => res(''), 60)}));
        if (!part) return;
        const ppl = await api('textdoc_people', {ids: String(it.id)}); const p = ppl.people?.[it.id] || {name: it.title}; (ed.peopleCache = ed.peopleCache || new Map()).set(Number(it.id), p);
        ed.lastRange = range; T2(ed, `<a class="wp-person" data-wp-person="${Number(it.id)}"${part !== 'name' ? ` data-part="${part}"` : ''} href="#">${esc(partText(p, part))}</a>&nbsp;`);
        if (part !== 'name') ed.status?.flash('Ce texte suit la fiche : il se met à jour à l’ouverture du document (Outils → Mettre à jour les champs).');
    }
    tools.personPart = async (ed, a) => {
        const part = await new Promise(res => UI().menuAt(a, PARTS.map(([k, l]) => ({icon: (a.dataset.part || 'name') === k ? '✓' : ' ', label: l, run: () => res(k)})), {title: 'Afficher', onClose: () => setTimeout(() => res(''), 60)})); if (!part) return;
        const ppl = await api('textdoc_people', {ids: a.dataset.wpPerson}); const p = ppl.people?.[a.dataset.wpPerson]; if (!p) return toast('Fiche introuvable.', 'error');
        if (part === 'name') a.removeAttribute('data-part'); else a.dataset.part = part; a.textContent = partText(p, part); ed.commit(); ed.layoutSoon();
    };
    /** à l'ouverture : les noms, dates et lieux tenus à jour d'après les fiches */
    tools.updateFields = async (ed, loud = false) => {
        const els = ed.bodies().flatMap(b => [...b.querySelectorAll('a.wp-person[data-part]')]); if (!els.length) { if (loud) toast('Aucun champ à mettre à jour.'); return; }
        try { const ppl = await api('textdoc_people', {ids: [...new Set(els.map(a => a.dataset.wpPerson))].join(',')}); let n = 0;
            els.forEach(a => { const p = ppl.people?.[a.dataset.wpPerson]; if (!p) return; (ed.peopleCache = ed.peopleCache || new Map()).set(Number(a.dataset.wpPerson), p); const t = partText(p, a.dataset.part); if (t && a.textContent !== t) { a.textContent = t; n++; } });
            if (n) { ed.commit(); ed.layoutSoon(0); ed.status?.flash(`${plural(n, 'champ')} mis à jour d’après les fiches.`); } else if (loud) toast('Tout est déjà à jour.');
        } catch (_) {}
    };
    async function insertPlace(ed) {
        ed.restoreSel(); const range = ed.lastRange;
        const it = await P().openPicker({kind: 'place', title: 'Choisir un lieu'}); if (!it || !Number(it.id)) return;
        ed.lastRange = range; T2(ed, `<a class="wp-place" data-wp-place="${Number(it.id)}" href="#">${esc(String(it.title || '').split(',')[0])}</a>&nbsp;`);
    }
    async function insertMediaLink(ed) {
        ed.restoreSel(); const range = ed.lastRange;
        const P2 = window.LCNDA_MEDIA_PICKER; const it = await P2?.openMediaPicker({types: ['image', 'audio', 'video'], title: 'Choisir un média (lien)'}); if (!it) return;
        ed.lastRange = range; T2(ed, `<a class="wp-media" data-media="${Number(it.id)}" href="#media">🎞 ${esc(it.title || 'Média')}</a>&nbsp;`);
    }
    tools.openPerson = id => { const app = A(); app.state.currentPersonId = id; try { app.selectPerson?.(id); app.setModule?.('personnes'); } catch (_) {} toast('Fiche ouverte derrière le document (ferme-le ou réduis-le pour la voir).'); };
    tools.openPlace = id => { try { ext.openPlace?.(id) || (A().state.listType = 'places', A().setModule('listes')); } catch (_) {} };
    async function insertBio(ed) {
        ed.restoreSel(); const range = ed.lastRange;
        const it = await P().openPicker({kind: 'person', title: 'La biographie de qui ?'}); if (!it) return;
        const d = await api('biography', {id: it.id}); ed.lastRange = range;
        T2(ed, `<h2 data-st="h2">${esc(it.title)}</h2>${bioHtml(d.text || '', it.id)}`);
        ed.status?.flash('Biographie ajoutée (écrite par l’app d’après la fiche) : modifie-la librement.');
    }
    async function insertTree(ed) {
        ed.restoreSel(); const range = ed.lastRange;
        const it = await P().openPicker({kind: 'person', title: 'Le petit arbre de qui ?'}); if (!it) return;
        const t = await api('textdoc_tree', {id: it.id, gens: 3}), by = new Map((t.people || []).map(p => [p.sosa, p]));
        const box = n => { const p = by.get(n); return p ? `<a class="wp-person" data-wp-person="${p.id}" href="#">${esc(p.name)}</a><br>${esc([p.by, p.dy].filter(Boolean).join(' – '))}` : '?'; };
        ed.lastRange = range;
        T2(ed, `<table class="wp-table wp-tree" data-bd="0"><tbody><tr>${[4, 5, 6, 7].map(n => `<td>${box(n)}</td>`).join('')}</tr><tr><td colspan="2">${box(2)}</td><td colspan="2">${box(3)}</td></tr><tr><td colspan="4">${box(1)}</td></tr></tbody></table>`);
    }
    async function insertDiagram(ed) {
        ed.restoreSel(); const range = ed.lastRange;
        const it = await P().openPicker({kind: 'diagram', title: 'Choisir un diagramme'}); if (!it) return;
        if (!ext.diagramSvg) return toast('Les diagrammes ne sont pas chargés.', 'error');
        const svg = await ext.diagramSvg(it.id); if (!svg) return toast('Ce diagramme est vide.', 'error');
        const png = await svgToPng(svg); const P2 = window.LCNDA_PICKER || A();
        const f = new File([T().fromDataUrl(png).data], `diagramme-${it.id}.png`, {type: 'image/png'}); const m = await P2.importMediaFile(f, ['image']);
        ed.lastRange = range; T2(ed, figureHtml(ed, mediaSrc(m), {mid: m.id, alt: it.title, w: 9999}).replace('</figure>', `<figcaption contenteditable="true">${esc(it.title)}</figcaption></figure>`));
    }
    const svgToPng = svg => new Promise((res, rej) => { const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'})); img.onload = () => { const w = img.naturalWidth || 900, h = img.naturalHeight || 600, k = Math.min(2, 1800 / w), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png')); }; img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Diagramme illisible.')); }; img.src = url; });
    tools.svgToPng = svgToPng;
    /* ── caractères spéciaux ── */
    function charsDialog(ed) {
        ed.restoreSel(); const KEY = 'genealogie-traitement-texte-glyphes';
        const recent = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string' && [...x].length <= 2).slice(0, 24) : []; } catch (_) { return []; } };
        const sets = GLYPHS(); let cur = pref('glyphSet', 'fr');
        const btn = c => `<button type="button" data-g="${esc(c)}" title="${esc(GLYPH_NAMES[c] || `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)}">${c === ' ' ? '⍽' : c === ' ' ? '␣' : esc(c)}</button>`;
        ext.openDialog({eyebrow: 'INSERTION', title: 'Ω Caractères spéciaux', submitLabel: 'Fermer', body: `<p class="muted">Clique pour l’ajouter au texte (la fenêtre reste ouverte).</p><div class="wp-row"><span class="wp-lab">Récents</span><div class="wp-glyphs wp-glyph-recent" data-rec>${recent().map(btn).join('') || '<span class="muted">—</span>'}</div></div>
            <div class="wp-row"><select data-set aria-label="Groupe de caractères">${sets.map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div><div class="wp-glyphs" data-list role="listbox"></div>`,
            onOpen: d => { const paint = () => { d.querySelector('[data-list]').innerHTML = (sets.find(s => s[0] === cur) || sets[0])[2].filter(Boolean).map(btn).join(''); }; paint();
                d.querySelector('[data-set]').addEventListener('change', e => { cur = e.target.value; setPrefs({...prefs(), glyphSet: cur}); paint(); });
                d.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; const c = b.dataset.g; // posé dans le texte sans le navigateur : sous cette fenêtre, le document ne reçoit pas le clavier
                    const r0 = ed.lastRange; if (!r0 || !r0.startContainer.isConnected || !ed.secOf(r0.startContainer)) return toast('Place d’abord le curseur dans le texte.'); const r = r0.cloneRange(); if (!r.collapsed) { if (ed.doc.track) ed.markDeleted?.(r); else r.deleteContents(); r.collapse(false); }
                    let node = document.createTextNode(c); if (ed.doc.track) { const ins = document.createElement('ins'); ins.className = 'wp-ins'; Object.assign(ins.dataset, {tc: nid('t'), a: ed.author, t: new Date().toISOString().replace(/\.\d+Z$/, 'Z')}); ins.appendChild(node); node = ins; }
                    r.insertNode(node); r.setStartAfter(node); r.collapse(true); ed.lastRange = r; ed.commitSoon(); ed.layoutSoon(); const rc = [c, ...recent().filter(x => x !== c)].slice(0, 24); try { localStorage.setItem(KEY, JSON.stringify(rc)); } catch (_) {} d.querySelector('[data-rec]').innerHTML = rc.map(btn).join(''); }); },
            onSubmit: () => {}});
    }
    function fieldMenu(ed, anchor) {
        ed.restoreSel(); const range = ed.lastRange;
        const put = f => { ed.lastRange = range; T2(ed, `<span class="wp-field" data-field="${f}" contenteditable="false">${esc(f === 'page' ? '1' : f === 'pages' ? String(ed.totalPages || 1) : f === 'title' ? ed.name : f === 'author' ? (ed.doc.meta?.author || '') : dateFr())}</span>`); };
        UI().menuAt(anchor && anchor.isConnected ? anchor : {x: innerWidth / 2 - 120, y: 160}, [{icon: '#', label: 'Numéro de la page', run: () => put('page')}, {icon: '∑', label: 'Nombre de pages', run: () => put('pages')}, {icon: 'T', label: 'Titre du document', run: () => put('title')}, {icon: '✎', label: 'Auteur', run: () => put('author')}, {icon: '📅', label: 'Date (mise à jour à chaque ouverture)', run: () => put('date')}, '-', {icon: '↻', label: 'Mettre à jour les champs (personnes, dates)', run: () => tools.updateFields(ed, true)}], {title: 'Champ'});
    }
    /* ── sections et colonnes ── */
    function sectionBreak(ed) {
        ed.restoreSel(); const r = ed.sel() || ed.lastRange; if (!r) return toast('Place le curseur à l’endroit de la coupure.');
        const sec = ed.secOf(r.startContainer), cur = ed.curPage();
        ext.openDialog({eyebrow: 'INSERTION', title: '📄 Saut de section', submitLabel: 'Couper ici', body: `<p>La suite du document commence sur une nouvelle page, avec son propre format : par exemple un grand tableau ou un arbre en paysage, puis on revient en portrait.</p><div class="form-grid"><label>Orientation de la suite<select name="o"><option value="landscape" ${cur.orient !== 'landscape' ? 'selected' : ''}>▭ Paysage</option><option value="portrait" ${cur.orient === 'landscape' ? 'selected' : ''}>▯ Portrait</option></select></label></div>`,
            onSubmit: f => {
                ed.commit(); const body = sec.body; let top = r.startContainer; while (top && top.parentNode !== body) top = top.parentNode; if (!top) return;
                const after = document.createRange(); after.setStart(r.startContainer, r.startOffset); after.setEndAfter(body.lastChild); const frag = after.extractContents();
                const ns = ed.addSection({html: '', page: {...cur, m: {...cur.m}, orient: f.elements.o.value}}, sec); ns.body.innerHTML = ''; ns.body.appendChild(frag); body.querySelectorAll(':scope > .wp-endnotes').forEach(x => x.remove()); ed.normalize(body); ed.normalize(ns.body);
                ed.commit(); ed.layout(); ns.body.focus(); ed.status?.flash(`Nouvelle section en ${f.elements.o.value === 'landscape' ? 'paysage' : 'portrait'}.`);
            }});
    }
    function columnsDialog(ed) {
        ed.restoreSel(); const bs = ed.selBlocks(); if (!bs.length) return toast('Choisis les paragraphes à mettre en colonnes.');
        const body = ed.secOf(bs[0])?.body, tops = [...new Set(bs.map(b => { let t = b; while (t.parentNode !== body && t.parentNode && !t.parentNode.matches?.('.wp-cols')) t = t.parentNode; return t.parentNode?.matches?.('.wp-cols') ? t.parentNode : t; }))];
        const inCols = tops.length === 1 && tops[0].matches?.('.wp-cols') ? tops[0] : null;
        ext.openDialog({eyebrow: 'FORMAT', title: '▥ Colonnes', submitLabel: 'Enregistrer', body: `<p class="muted">Les paragraphes choisis se partagent en colonnes équilibrées (comme dans un journal).</p><div class="form-grid one-column"><label>Nombre de colonnes<select name="n">${[1, 2, 3, 4].map(n => `<option value="${n}" ${(Number(inCols?.dataset.cols) || 2) === n ? 'selected' : ''}>${n === 1 ? '1 (retirer les colonnes)' : n}</option>`).join('')}</select></label></div>`,
            onSubmit: f => { const n = Number(f.elements.n.value);
                if (inCols) { if (n === 1) inCols.replaceWith(...inCols.childNodes); else inCols.dataset.cols = String(n); }
                else if (n > 1) { const div = document.createElement('div'); div.className = 'wp-cols'; div.dataset.cols = String(n); tops[0].before(div); tops.forEach(t => div.appendChild(t)); }
                ed.normalize(body); ed.commit(); ed.layoutSoon(0); }});
    }
    /* ── en-tête et pied de page ── */
    function headFootDialog(ed) {
        const area = (name, html, label) => `<div class="field"><span class="pk-lab">${label}</span><div class="wp-hf-edit" data-hf="${name}" contenteditable="true" style="border:1px solid var(--line-soft,#ccc);min-height:38px;padding:6px 8px;background:#fff;color:#111;font-family:Georgia,serif">${cleanHtml(html || '').html || '<p data-st="normal"><br></p>'}</div></div>`;
        const tbar = `<div class="wp-row"><button type="button" class="button small secondary" data-hf-f="page"># N° de page</button><button type="button" class="button small secondary" data-hf-f="pages">∑ Nombre de pages</button><button type="button" class="button small secondary" data-hf-f="title">T Titre</button><button type="button" class="button small secondary" data-hf-f="author">✎ Auteur</button><button type="button" class="button small secondary" data-hf-f="date">📅 Date</button><span class="wp-lab"></span><button type="button" class="icon-button small" data-hf-al="left" title="À gauche">⟸</button><button type="button" class="icon-button small" data-hf-al="center" title="Centré">≡</button><button type="button" class="icon-button small" data-hf-al="right" title="À droite">⟹</button></div>`;
        const h = ed.doc.header, f = ed.doc.footer;
        ext.openDialog({eyebrow: 'MISE EN PAGE', title: 'En-tête et pied de page', submitLabel: 'Enregistrer', wide: true, body: `${tbar}${area('header', h.html, 'En-tête (en haut de chaque page)')}${area('footer', f.html, 'Pied de page (en bas de chaque page)')}
            <label class="checkbox-line"><input type="checkbox" name="first" ${h.first || f.first ? 'checked' : ''}> Première page différente (pour une page de titre ou une lettre)</label><div data-first ${h.first || f.first ? '' : 'hidden'}>${area('fheader', h.firstHtml, 'En-tête de la première page')}${area('ffooter', f.firstHtml, 'Pied de la première page')}</div>`,
            onOpen: d => { let lastEd = d.querySelector('[data-hf="header"]'); d.addEventListener('focusin', e => { const x = e.target.closest('[data-hf]'); if (x) lastEd = x; });
                d.querySelector('[name=first]').addEventListener('change', e => { d.querySelector('[data-first]').hidden = !e.target.checked; });
                d.addEventListener('mousedown', e => { if (e.target.closest('[data-hf-f], [data-hf-al]')) e.preventDefault(); });
                d.addEventListener('click', e => { const b = e.target.closest('[data-hf-f], [data-hf-al]'); if (!b) return; lastEd.focus(); if (b.dataset.hfF) document.execCommand('insertHTML', false, `<span class="wp-field" data-field="${b.dataset.hfF}" contenteditable="false">${b.dataset.hfF === 'page' ? '1' : b.dataset.hfF === 'pages' ? 'N' : b.dataset.hfF === 'title' ? esc(ed.name) : b.dataset.hfF === 'author' ? esc(ed.doc.meta?.author || 'Auteur') : esc(dateFr())}</span>&nbsp;`); else { const s = getSelection(), p = (s.anchorNode?.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode)?.closest('p') || lastEd.querySelector('p'); if (p) p.style.textAlign = b.dataset.hfAl === 'left' ? '' : b.dataset.hfAl; } }); },
            onSubmit: form => { const get = n => { const x = form.querySelector(`[data-hf="${n}"]`); const c = cleanHtml(x?.innerHTML || '').html; return x && x.textContent.trim() || /wp-field/.test(c) ? c : ''; };
                const first = form.elements.first.checked; ed.doc.header = {html: get('header'), first, firstHtml: first ? get('fheader') : ''}; ed.doc.footer = {html: get('footer'), first, firstHtml: first ? get('ffooter') : ''}; ed.commit(); ed.layout(); }});
    }
    /* ── outils ── */
    function wordsDialog(ed) {
        const all = ed.bodies().map(b => { const c = b.cloneNode(true); c.querySelectorAll('del, .wp-endnotes, .wp-gen, sup.wp-fn').forEach(x => x.remove()); return c.innerText || c.textContent; }).join('\n');
        const sel = ed.sel()?.toString() || ''; const w = T().wordCount(all), chars = all.replace(/\n/g, '').length, noSp = all.replace(/\s/g, '').length, paras = ed.bodies().reduce((n, b) => n + [...b.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')].filter(p => p.textContent.trim()).length, 0);
        const notes = ed.bodies().reduce((n, b) => n + b.querySelectorAll('sup.wp-fn').length, 0), imgs = ed.bodies().reduce((n, b) => n + b.querySelectorAll('figure, img.wp-inl').length, 0);
        const row = (l, v) => `<tr><th style="text-align:left;font-weight:500">${esc(l)}</th><td style="text-align:right"><b>${esc(typeof v === 'number' ? v.toLocaleString('fr-FR') : v)}</b></td></tr>`;
        ext.openDialog({eyebrow: 'OUTILS', title: '🔢 Nombre de mots', submitLabel: 'Fermer', body: `<table class="data-table" style="width:100%">${row('Pages', ed.totalPages || 1)}${row('Mots', w)}${row('Caractères (espaces compris)', chars)}${row('Caractères (sans les espaces)', noSp)}${row('Paragraphes', paras)}${row('Notes', notes)}${row('Images', imgs)}${row('Commentaires', ed.doc.comments.length)}${sel ? row('Dans la sélection : mots', T().wordCount(sel)) : ''}</table><p class="muted">Temps de lecture : environ ${Math.max(1, Math.round(w / 230))} min.</p>`, onSubmit: () => {}});
    }
    function langDialog(ed) {
        ext.openDialog({eyebrow: 'OUTILS', title: '🌐 Langue du document', submitLabel: 'Enregistrer', body: `<p class="muted">Elle sert à l’orthographe (mots soulignés en rouge, corrections au clic droit) et à la lecture à voix haute.</p><label class="field">Langue<select name="l">${LANGS.map(([k, l]) => `<option value="${k}" ${ed.doc.lang === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label class="checkbox-line"><input type="checkbox" name="s" ${pref('spell', true) !== false ? 'checked' : ''}> Vérifier l’orthographe pendant la frappe</label>`,
            onSubmit: f => { ed.setLang(f.elements.l.value); setPrefs({...prefs(), spell: f.elements.s.checked}); ed.bodies().forEach(b => ed.spellOn(b)); ed.applyView(); }});
    }
    async function factCheck(ed) {
        if (!ext.factCheck) return toast('La vérification n’est pas chargée.', 'error');
        ed.status?.flash('🔎 Vérification avec les fiches…');
        const blocks = []; ed.secs.forEach(sec => { const pitch = (sec.geo?.H || 1100) + K().GAP; [...sec.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td')].filter(x => !x.querySelector('p, li, td')).forEach(el => { const c = el.cloneNode(true); c.querySelectorAll('del, sup.wp-fn').forEach(x => x.remove()); const t = c.textContent.trim(); if (t) blocks.push({id: blocks.length, page: (sec.first || 0) + Math.floor(ed.offTop(el, sec.body) / pitch) + 1, text: t, el}); }); });
        ed.factBlocks = blocks;
        try { ed.factResults = await ext.factCheck(blocks.map(({id, page, text}) => ({id, page, text}))); } catch (e) { return toast(e.message || 'Vérification impossible.', 'error'); }
        ed.showPanel('check'); ed.status?.flash(ed.factResults.length ? `🔎 ${plural(ed.factResults.length, 'chose')} à regarder.` : '✓ Tout concorde avec les fiches.');
    }
    function readAloud(ed) {
        if (!('speechSynthesis' in window)) return toast('La lecture à voix haute n’existe pas dans ce navigateur.', 'error');
        try { speechSynthesis.cancel(); } catch (_) {}
        const all = ed.bodies().flatMap(b => [...b.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')].filter(p => p.textContent.trim()));
        const r = ed.sel() || ed.lastRange; let start = 0; if (r) { const b = blockOf(r.startContainer, ed.secOf(r.startContainer)?.body); const i = all.indexOf(b); if (i > 0) start = i; }
        const lang = {fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL', la: 'it-IT', oc: 'fr-FR', br: 'fr-FR', pl: 'pl-PL'}[ed.doc.lang] || 'fr-FR';
        const voice = speechSynthesis.getVoices().find(v => v.lang === lang) || speechSynthesis.getVoices().find(v => v.lang?.startsWith(lang.slice(0, 2)));
        ed.reading = true; let i = start;
        const next = () => { ed.docEl.querySelectorAll('.wp-read').forEach(x => x.classList.remove('wp-read')); if (!ed.reading || i >= all.length || ed.closed) { ed.reading = false; return; } const p = all[i++]; const c = p.cloneNode(true); c.querySelectorAll('del, sup.wp-fn, ul, ol').forEach(x => x.remove()); p.classList.add('wp-read'); p.scrollIntoView({block: 'nearest'});
            const u = new SpeechSynthesisUtterance(c.textContent.trim()); u.lang = lang; if (voice) u.voice = voice; u.rate = clamp(pref('rate', 1), 0.5, 2); u.onend = next; u.onerror = () => { ed.reading = false; p.classList.remove('wp-read'); }; speechSynthesis.speak(u); };
        next(); ed.status?.flash('🔊 Lecture… (Échap ou Outils → ⏹ Arrêter la lecture)');
    }
    function styleForm(s) {
        const a = [['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite'], ['justify', 'Justifié']];
        return `<div class="form-grid"><label>Nom<input type="text" name="name" maxlength="60" value="${esc(s.name || '')}"></label>
            <label>Police<span class="wp-row"><button type="button" class="button small secondary" data-sfont style="font-family:'${esc(s.font || 'Georgia')}'">${esc(s.font || '(celle de Normal)')}</button></span><input type="hidden" name="font" value="${esc(s.font || '')}"></label>
            <label>Taille<input type="number" name="size" data-unit="pt" min="4" max="144" step="0.5" value="${s.size || ''}"></label>
            <label>Couleur<span class="wp-row"><button type="button" class="button small secondary" data-scol>🎨 <span data-scolv>${esc(s.color || 'automatique')}</span></button></span><input type="hidden" name="color" value="${esc(s.color || '')}"></label>
            <label class="checkbox-line"><input type="checkbox" name="b" ${s.b ? 'checked' : ''}> Gras</label><label class="checkbox-line"><input type="checkbox" name="i" ${s.i ? 'checked' : ''}> Italique</label>
            <label class="checkbox-line"><input type="checkbox" name="sc" ${s.sc ? 'checked' : ''}> Petites capitales</label><label class="checkbox-line"><input type="checkbox" name="u" ${s.u ? 'checked' : ''}> Souligné</label>
            ${s.kind === 'c' ? '' : `<label>Alignement<select name="align"><option value="">—</option>${a.map(([k, l]) => `<option value="${k}" ${s.align === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label>Interligne<input type="number" name="line" step="0.05" min="0.6" max="4" value="${s.line || ''}"></label><label>Espace avant<input type="number" name="before" data-unit="pt" min="0" value="${s.before ?? ''}"></label><label>Espace après<input type="number" name="after" data-unit="pt" min="0" value="${s.after ?? ''}"></label>
            <label>Retrait gauche<input type="number" name="il" data-unit="mm" value="${s.il || ''}"></label><label>1re ligne<input type="number" name="fi" data-unit="mm" value="${s.fi || ''}"></label>
            <label class="checkbox-line"><input type="checkbox" name="keep" ${s.keep ? 'checked' : ''}> Garder avec le paragraphe suivant</label>`}</div>`;
    }
    function bindStyleForm(d) {
        d.querySelector('[data-sfont]').addEventListener('click', async e => { const f = await UI().openFontPicker({value: d.querySelector('[name=font]').value}); if (f) { d.querySelector('[name=font]').value = f; e.target.textContent = f; e.target.style.fontFamily = `'${f}'`; } });
        d.querySelector('[data-scol]').addEventListener('click', e => UI().openColorBox(e.target, {allowNone: true, get: () => d.querySelector('[name=color]').value || '#1a1a1a', set: v => { d.querySelector('[name=color]').value = v || ''; d.querySelector('[data-scolv]').textContent = v || 'automatique'; }}));
    }
    const readStyleForm = (f, base) => T().cleanStyle({...base, name: f.elements.name.value.trim() || base.name, font: f.elements.font.value, size: f.elements.size.value, color: f.elements.color.value, b: f.elements.b.checked, i: f.elements.i.checked, sc: f.elements.sc.checked, u: f.elements.u.checked,
        ...(base.kind === 'c' ? {} : {align: f.elements.align.value, line: f.elements.line.value, before: f.elements.before.value === '' ? undefined : f.elements.before.value, after: f.elements.after.value === '' ? undefined : f.elements.after.value, il: f.elements.il.value, fi: f.elements.fi.value, keep: f.elements.keep.checked})});
    function newStyle(ed) {
        ed.restoreSel(); const p = ed.selBlocks()[0]; const cs = p ? getComputedStyle(p) : null;
        const base = {id: 'u-' + nid('s'), kind: 'p', name: 'Mon style', font: cs ? cs.fontFamily.split(',')[0].replace(/["']/g, '') : '', size: cs ? R1(parseFloat(cs.fontSize) / PT) : 12, color: cs ? T().col(cs.color) : '', b: cs && /bold|[6-9]00/.test(cs.fontWeight) ? 1 : 0, i: cs?.fontStyle === 'italic' ? 1 : 0, align: cs?.textAlign === 'start' ? 'left' : cs?.textAlign, before: cs ? R1(parseFloat(cs.marginTop) / PT) : undefined, after: cs ? R1(parseFloat(cs.marginBottom) / PT) : undefined};
        ext.openDialog({eyebrow: 'STYLES', title: '＋ Nouveau style', submitLabel: 'Créer le style', wide: true, body: `<p class="muted">D’après le paragraphe du curseur : change ce que tu veux, puis il sera proposé dans la liste des styles.</p><label class="field">Sorte<select name="kind"><option value="p">Style de paragraphe</option><option value="c">Style de caractère (quelques mots)</option></select></label>${styleForm(base)}`,
            onOpen: bindStyleForm,
            onSubmit: f => { if (!f.elements.name.value.trim()) return UI().fail(f.elements.name, 'Donne un nom au style.'); if (ed.doc.styles.some(s => s.name === f.elements.name.value.trim())) return UI().fail(f.elements.name, 'Un style porte déjà ce nom.');
                const s = readStyleForm(f, {...base, kind: f.elements.kind.value}); ed.doc.styles.push(s); ed.applyStyles(); if (s.kind === 'p') ed.setStyle(s.id); else ed.charStyle(s.id); ed.commit(); ed.paintPanel(); toast(`Style « ${s.name} » créé.`); }});
    }
    function editStyle(ed) {
        ed.restoreSel(); const p = ed.selBlocks()[0]; const s = ed.doc.styles.find(x => x.id === (p?.dataset.st || 'normal')); if (!s) return;
        ext.openDialog({eyebrow: 'STYLES', title: `✎ Le style « ${s.name} »`, submitLabel: 'Enregistrer', wide: true, onDelete: T().BUILTIN.has(s.id) ? undefined : () => { ed.doc.styles = ed.doc.styles.filter(x => x !== s); ed.bodies().forEach(b => b.querySelectorAll(`[data-st="${CSS.escape(s.id)}"]`).forEach(x => { x.dataset.st = 'normal'; })); ed.applyStyles(); ed.commit(); ed.layoutSoon(0); ed.paintPanel(); ed.undoable(`Style « ${s.name} » supprimé`); },
            body: `<p class="muted">Tous les paragraphes de ce style changent ensemble.</p>${styleForm(s)}`, onOpen: bindStyleForm,
            onSubmit: f => { const n = readStyleForm(f, s); Object.keys(s).forEach(k => { if (!['id', 'kind'].includes(k)) delete s[k]; }); Object.assign(s, n, {id: s.id, kind: s.kind}); ed.applyStyles(); ed.commit(); ed.layoutSoon(0); ed.paintPanel(); }});
    }
    function styleSetDialog(ed) {
        ext.openDialog({eyebrow: 'STYLES', title: 'Jeu de styles', submitLabel: 'Fermer', wide: true, body: `<p class="muted">Les titres et le texte changent ensemble de police et de couleur ; tes propres styles restent.</p><div class="wp-tpls">${T().STYLE_SETS.map(s => `<button type="button" class="wp-tpl" data-set="${s.id}" style="font-family:'${esc(s.body)}'"><b style="font-family:'${esc(s.head)}';color:${esc(s.ink)};font-size:18px">${esc(s.name)}</b><small>Titre en ${esc(s.head)}, texte en ${esc(s.body)}</small></button>`).join('')}</div>`,
            onOpen: d => d.addEventListener('click', e => { const b = e.target.closest('[data-set]'); if (b) { ed.applySet(b.dataset.set); d.close(); } }), onSubmit: () => {}});
    }
    /** reprendre les styles d'un livre de la mise en page */
    async function layoutStyles(ed) {
        const it = await P().openPicker({kind: 'layout', title: 'Le livre dont reprendre les styles'}); if (!it) return;
        const r = await api('layout_doc', {id: it.id}), d = r.doc || {}, sw = new Map((d.swatches || []).map(s => [s.id, s.c || s.color || s.hex])), col = c => T().col(/^#/.test(c || '') ? c : sw.get(c) || '');
        const MAP = {'ps-body': 'normal', 'ps-title': 'title', 'ps-subtitle': 'subtitle', 'ps-chapter': 'h1', 'ps-head': 'h2', 'ps-name': 'h3', 'ps-quote': 'quote', 'ps-caption': 'caption'};
        let n = 0;
        (d.paraStyles || []).forEach(ps => { const id = MAP[ps.id] || ('ly-' + String(ps.id).replace(/[^\w-]/g, '').slice(0, 30)); const s = T().cleanStyle({id, name: MAP[ps.id] ? ed.doc.styles.find(x => x.id === id)?.name || ps.name : ps.name, kind: 'p', font: ps.font, size: ps.size, color: col(ps.color), b: Number(ps.weight) >= 600, i: ps.italic, sc: ps.caps === 'small', align: ps.align === 'justify' ? 'justify' : ps.align, line: ps.lead && ps.size ? Math.round(ps.lead / ps.size * 100) / 100 : undefined, before: ps.before != null ? Math.round(ps.before * 2.835) : undefined, after: ps.after != null ? Math.round(ps.after * 2.835) : undefined, il: ps.indentL, fi: ps.indent}); if (!s) return; const i = ed.doc.styles.findIndex(x => x.id === id); if (i >= 0) ed.doc.styles[i] = {...ed.doc.styles[i], ...s}; else ed.doc.styles.push(s); n++; });
        if (!n) return toast('Ce livre n’a pas de styles de paragraphe.', 'error');
        ed.applyStyles(); ed.commit(); ed.layoutSoon(0); ed.paintPanel(); ed.undoable(`${plural(n, 'style')} repris de « ${it.title} »`);
    }
    function tabsDialog(ed) {
        ext.openDialog({eyebrow: 'FORMAT', title: '⇥ Tabulations', submitLabel: 'Enregistrer', body: `<p class="muted">La touche Tab avance jusqu’au prochain arrêt. Dans un tableau, Tab passe à la case suivante ; dans une liste, elle décale d’un niveau.</p><label class="field">Un arrêt tous les<input type="number" name="t" data-unit="mm" min="2" max="60" value="${ed.doc.tab || 12.5}"></label>`,
            onSubmit: f => { ed.doc.tab = clamp(f.elements.t.value, 2, 60); ed.bodies().forEach(b => { b.style.tabSize = `${R1(ed.doc.tab * MM)}px`; }); ed.commit(); ed.layoutSoon(); }});
    }
    function keysDialog() {
        ext.openDialog({eyebrow: 'TRAITEMENT DE TEXTE', title: '⌨️ Raccourcis du traitement de texte', wide: true, submitLabel: 'Fermer', body: '<div data-wp-keys></div>', onOpen: d => { const box = d.querySelector('[data-wp-keys]'); if (ext.editorKeysPanel) { localStorage.setItem('genealogie-editor-shortcuts-tab', 'textdoc'); ext.editorKeysPanel(box); } else box.innerHTML = A().empty('Les raccourcis à soi ne sont pas chargés.'); }, onSubmit: () => {}});
    }
    /* ── les réglages (K2 : gardés tout de suite) et les réglages enregistrés ── */
    function settingsDialog(ed) {
        const SETS_KEY = 'genealogie-traitement-texte-reglages', p = prefs();
        const tog = (k, l, on) => `<label class="ui-toggle"><input type="checkbox" name="${k}" ${on ? 'checked' : ''}><i></i>${l}</label>`;
        const dlg = ext.openDialog({eyebrow: 'TRAITEMENT DE TEXTE', title: '⚙️ Réglages du traitement de texte', submitLabel: 'Fermer', wide: true,
            body: `<div class="wp-row" style="justify-content:flex-end"><button type="button" class="link-button" data-ui-reset>↺ Remettre comme au départ</button></div><div class="form-grid">
                <label>Mon nom (pour le suivi des modifications et les commentaires)<input type="text" name="author" maxlength="80" value="${esc(p.author || '')}"></label>
                <label>Jeu de styles des nouveaux documents<select name="set">${T().STYLE_SETS.map(s => `<option value="${s.id}" ${(p.set || 'classique') === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
                <label>Langue des nouveaux documents<select name="lang">${LANGS.map(([k, l]) => `<option value="${k}" ${(p.lang || 'fr') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Enregistrer tout seul<select name="autosave">${[[0, 'Non (avec 💾 ou ⌘S)'], [1, 'Toutes les minutes'], [5, 'Toutes les 5 minutes'], [10, 'Toutes les 10 minutes']].map(([v, l]) => `<option value="${v}" ${Number(p.autosave || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Coller depuis Word ou le web<select name="pasteMode"><option value="keep" ${(p.pasteMode || 'keep') === 'keep' ? 'selected' : ''}>Garder la mise en forme (nettoyée)</option><option value="text" ${p.pasteMode === 'text' ? 'selected' : ''}>Le texte seul</option></select></label>
                <label>Vitesse de lecture à voix haute<input type="range" name="rate" min="0.5" max="2" step="0.1" value="${p.rate || 1}"></label>
                ${tog('spell', 'Vérifier l’orthographe pendant la frappe', p.spell !== false)}${tog('ribbon', 'Barre d’outils en ruban (avec les noms)', !!p.ribbon)}${tog('marks', 'Montrer les marques de mise en forme ¶', !!p.marks)}${tog('nav', 'Ouvrir le panneau de navigation', !!p.nav)}</div><div data-presets></div>`,
            onOpen: d => {
                const save = () => { const f = d.querySelector('form'), q = {...prefs()}; ['author', 'set', 'lang', 'pasteMode'].forEach(k => { q[k] = f.elements[k].value; }); q.autosave = Number(f.elements.autosave.value); q.rate = Number(f.elements.rate.value); ['spell', 'ribbon', 'marks', 'nav'].forEach(k => { q[k] = f.elements[k].checked; }); setPrefs(q); ed.$('.wp')?.classList.toggle('is-ribbon', !!q.ribbon); ed.bodies().forEach(b => ed.spellOn(b)); ed.applyView(); ed.layoutSoon(0); };
                UI().autoSaveDialog?.(d, {keys: ['genealogie-traitement-texte'], save, reload: () => { d.close(); settingsDialog(ed); }, reset: () => { try { localStorage.removeItem('genealogie-traitement-texte'); } catch (_) {} }});
                const sets = () => { try { const v = JSON.parse(localStorage.getItem(SETS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }, put = l => { try { localStorage.setItem(SETS_KEY, JSON.stringify(l)); } catch (_) {} };
                const fr = UI().presetsFrame?.({id: 'traitement-texte', title: 'Réglages enregistrés', what: 'ces réglages du traitement de texte', list: () => sets().map(x => ({name: x.name, date: x.date})),
                    apply: i => { setPrefs({...prefs(), ...sets()[i].v}); d.close(); settingsDialog(ed); }, save: name => { const l = sets().filter(x => x.name !== name); l.push({name, date: new Date().toISOString(), v: prefs()}); put(l); },
                    replace: i => { const l = sets(); l[i] = {...l[i], date: new Date().toISOString(), v: prefs()}; put(l); }, rename: (i, n) => { const l = sets(); l[i].name = n; put(l); }, duplicate: i => { const l = sets(); l.push({...l[i], name: UI().freeName(l[i].name, l.map(x => x.name))}); put(l); },
                    remove: i => { const l = sets(), gone = l[i]; l.splice(i, 1); put(l); A().undoToast?.(`Réglages « ${gone.name} » supprimés`, {undo: () => { const m = sets(); m.splice(i, 0, gone); put(m); fr?.refresh(); }}); }});
                if (fr) d.querySelector('[data-presets]').appendChild(fr);
            }, onSubmit: () => {}});
        void dlg;
    }

    /* ═════════ À l'ouverture d'un document ═════════ */
    tools.afterOpen = ed => { tools.updateFields(ed); if (pref('nav', false) && innerWidth > 760) ed.toggleNav('heads'); if (ed.doc.tab) ed.bodies().forEach(b => { b.style.tabSize = `${R1(ed.doc.tab * MM)}px`; }); tools.adoptImages(ed); };
})();
