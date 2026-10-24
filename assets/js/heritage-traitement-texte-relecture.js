/**
 * 📝 Traitement de texte — relire (branché par ext.textDocMenuExtra / ext.textDocCommands, menu Outils) :
 *  - 🔁 Synonymes : le mot choisi (ou celui sous le curseur) et des mots de même sens, sans internet ; un clic remplace
 *    (la majuscule du début est gardée) ;
 *  - 🔎 Relecture : la typographie française (espace fine avant ; : ! ?, guillemets « », points de suspension, apostrophe ’,
 *    espaces en trop, virgule collée), les mots répétés (« le le »), la majuscule après un point ; « Corriger » une à une ou tout ;
 *  - ♿ Accessibilité : images sans description, titres qui sautent un niveau, tableaux sans ligne de titres, liens « ici »,
 *    texte minuscule, titres vides ; « Voir » va à l'endroit.
 * Sans écran : ext.textDocProof.synonyms / issues / fixAll (aussi require() dans Node, pour les essais).
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const A = () => root.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /* ═════════ 🔁 Les synonymes : des groupes de mots de même sens (un mot peut être dans plusieurs groupes) ═════════ */
    const GROUPS = `naître,venir au monde,voir le jour|mourir,décéder,s'éteindre,disparaître,trépasser,périr|mort,décès,disparition,trépas|naissance,venue au monde
marier,unir,épouser|mariage,union,noces,alliance|épouse,femme,conjointe,compagne|époux,mari,conjoint,compagnon|veuf,veuve
enfant,fils,fille,descendant,rejeton|parent,père,mère,aïeul,ascendant|ancêtre,aïeul,ascendant,devancier,prédécesseur|famille,parenté,lignée,maison,clan,tribu
lignée,descendance,postérité,lignage|origine,source,provenance,racine|héritage,patrimoine,legs,succession|souvenir,mémoire,réminiscence,trace
habiter,demeurer,résider,vivre,loger|maison,demeure,logis,habitation,foyer,domicile|village,bourg,hameau,commune,paroisse|ville,cité,agglomération
partir,quitter,s'en aller,émigrer,s'expatrier|arriver,venir,parvenir,s'installer|voyage,périple,trajet,déplacement,traversée|retour,revenue,rentrée
travailler,œuvrer,besogner,peiner|travail,métier,emploi,profession,labeur,ouvrage,tâche|ouvrier,artisan,travailleur,journalier,manœuvre|paysan,cultivateur,laboureur,agriculteur,fermier,exploitant
soldat,militaire,combattant,conscrit,troupier|guerre,conflit,combat,affrontement,hostilités|blessé,atteint,touché|courage,bravoure,vaillance,héroïsme,audace
document,pièce,acte,papier,écrit|acte,registre,inscription,mention|archive,fonds,dossier,registre|lettre,missive,courrier,pli,correspondance
trouver,découvrir,dénicher,repérer,retrouver|chercher,rechercher,fouiller,explorer,enquêter|recherche,enquête,investigation,quête,exploration|découverte,trouvaille,révélation
dire,affirmer,déclarer,raconter,rapporter,indiquer|raconter,narrer,relater,conter,retracer|histoire,récit,narration,chronique,relation|parler,s'exprimer,évoquer,mentionner
écrire,rédiger,noter,inscrire,consigner|lire,parcourir,déchiffrer,consulter|texte,écrit,passage,extrait|livre,ouvrage,volume,recueil
grand,vaste,important,immense,considérable|petit,menu,modeste,minuscule,réduit|vieux,ancien,âgé,vétuste,antique|jeune,cadet,juvénile|nouveau,récent,neuf,inédit
beau,joli,magnifique,superbe,splendide|bon,excellent,favorable,agréable|mauvais,médiocre,défavorable,néfaste|difficile,dur,pénible,ardu,rude|facile,simple,aisé
pauvre,démuni,modeste,indigent,nécessiteux|riche,aisé,fortuné,nanti,prospère|heureux,content,joyeux,ravi,comblé|triste,malheureux,affligé,chagriné,peiné
important,essentiel,capital,majeur,primordial|certain,sûr,assuré,indiscutable,avéré|probable,vraisemblable,plausible,possible|douteux,incertain,hypothétique,discutable
commencer,débuter,entamer,amorcer|finir,terminer,achever,conclure|continuer,poursuivre,prolonger|changer,modifier,transformer,évoluer|garder,conserver,préserver,maintenir
donner,offrir,léguer,transmettre,céder|recevoir,obtenir,hériter,acquérir|acheter,acquérir|vendre,céder,négocier|perdre,égarer,manquer
aider,secourir,soutenir,assister,épauler|aimer,chérir,adorer,affectionner|quitter,abandonner,délaisser,laisser|rencontrer,croiser,retrouver,connaître
penser,croire,estimer,juger,supposer|savoir,connaître,apprendre|comprendre,saisir,deviner|montrer,indiquer,révéler,prouver,attester|prouver,démontrer,attester,confirmer,établir
voir,apercevoir,observer,remarquer,contempler|regarder,examiner,observer,scruter|entendre,écouter,percevoir|sembler,paraître,avoir l'air
aller,se rendre,partir,se diriger|venir,arriver,se présenter|rester,demeurer,séjourner,s'attarder|passer,traverser,franchir
faire,réaliser,accomplir,effectuer,exécuter|avoir,posséder,détenir|être,exister,se trouver|mettre,placer,poser,disposer,installer
souvent,fréquemment,régulièrement,maintes fois|parfois,quelquefois,de temps en temps|toujours,constamment,sans cesse,continuellement|jamais,en aucun cas
aussi,également,de même,pareillement|mais,cependant,pourtant,toutefois,néanmoins|donc,ainsi,par conséquent,dès lors|car,puisque,parce que,étant donné que|ensuite,puis,après,par la suite
maintenant,aujourd'hui,à présent,actuellement|autrefois,jadis,naguère,anciennement|bientôt,prochainement,sous peu|enfin,finalement,en définitive
peut-être,probablement,sans doute,vraisemblablement|vraiment,réellement,véritablement,effectivement|seulement,uniquement,simplement|surtout,principalement,notamment,particulièrement
église,chapelle,paroisse,sanctuaire|cimetière,nécropole,champ de repos|tombe,sépulture,tombeau,caveau|baptême,ondoiement|prêtre,curé,abbé,ecclésiastique
notaire,tabellion|maire,édile,magistrat municipal|témoin,déclarant|signature,paraphe,seing|date,jour,époque,moment
terre,sol,domaine,propriété,bien|champ,pré,parcelle,lopin|ferme,métairie,exploitation,domaine|moulin,minoterie
chemin,route,voie,sentier,passage|rue,ruelle,allée,avenue|pays,contrée,région,territoire|frontière,limite,lisière
lieu,endroit,place,site,emplacement|période,époque,ère,temps|année,an,millésime|siècle,époque
nom,patronyme,nom de famille|prénom,nom de baptême|surnom,sobriquet,pseudonyme|portrait,image,photographie,effigie|photo,photographie,cliché,image
idée,pensée,notion,concept|raison,motif,cause,mobile|but,objectif,dessein,intention|problème,difficulté,question,obstacle|exemple,cas,illustration
vie,existence,parcours,destin|destin,sort,destinée,fortune|chance,hasard,fortune|malheur,épreuve,drame,calamité|maladie,mal,affection,épidémie
fête,célébration,réjouissance,cérémonie|repas,festin,banquet,dîner|chanson,chant,air,mélodie|danse,bal,valse
force,vigueur,énergie,puissance|peur,crainte,frayeur,effroi,angoisse|colère,fureur,rage,courroux|joie,bonheur,allégresse,gaieté|peine,chagrin,douleur,tristesse
rapide,prompt,vif,leste|lent,progressif,graduel|fort,robuste,solide,vigoureux|faible,fragile,frêle,chétif|calme,paisible,tranquille,serein
fidèle,loyal,dévoué,constant|honnête,droit,intègre,probe|célèbre,connu,illustre,renommé|inconnu,ignoré,obscur,anonyme|étrange,curieux,bizarre,singulier
précis,exact,juste,rigoureux|clair,limpide,net,évident|complet,entier,intégral|rare,exceptionnel,peu courant|commun,courant,ordinaire,habituel
grandir,croître,se développer,pousser|vieillir,prendre de l'âge|construire,bâtir,édifier,élever|détruire,démolir,raser,abattre|réparer,restaurer,rénover,remettre en état
emporter,enlever,prendre,saisir|apporter,amener,fournir|envoyer,expédier,adresser|recevoir,accueillir,héberger|appeler,nommer,désigner,baptiser
naissance,origine,commencement,début|fin,terme,achèvement,clôture|suite,continuation,prolongement|cause,origine,source,raison|conséquence,effet,suite,résultat`;
    const fold = s => String(s || '').toLocaleLowerCase('fr').trim();
    const LIST = GROUPS.split(/[|\n]/).map(g => g.split(',').map(w => w.trim()).filter(Boolean)).filter(g => g.length > 1);
    /** les mots de même sens qu'un mot (sans lui-même), les plus proches d'abord */
    function synonyms(word) {
        const w = fold(word); if (!w) return [];
        const out = []; LIST.forEach(g => { if (g.some(x => fold(x) === w)) g.forEach(x => { if (fold(x) !== w && !out.includes(x)) out.push(x); }); });
        if (!out.length && w.length > 4) { const stem = w.replace(/(es|s|e|x)$/, ''); LIST.forEach(g => { if (g.some(x => fold(x) === stem || fold(x) === stem + 'e')) g.forEach(x => { if (fold(x) !== w && fold(x) !== stem && !out.includes(x)) out.push(x); }); }); }
        return out.slice(0, 24);
    }
    const keepCase = (orig, w) => (/^\p{Lu}/u.test(orig) ? w.charAt(0).toLocaleUpperCase('fr') + w.slice(1) : w);

    /* ═════════ 🔎 La relecture d'un texte : [{i, len, fix, msg, kind}] (positions dans le texte) ═════════ */
    const NB = ' ', NBS = ' ';
    const RULES = [
        ['space', /( {2,})/g, () => ' ', 'Espaces en trop'],
        ['repeat', /\b(\p{L}+)(\s+)\1\b/giu, m => (/^(nous|vous|que|si|il|elle)$/i.test(m[1]) ? null : m[1]), 'Mot répété'],
        ['before', / +([,.])(?!\d)/g, m => m[1], 'Pas d’espace avant la virgule ou le point'],
        ['after', /,(?=\p{L})/gu, () => ', ', 'Une espace après la virgule'],
        ['thin', /([^\s  \d(/])([;!?])/gu, m => m[1] + NB + m[2], 'Espace fine avant ; ! ?'],
        ['colon', /([^\s  \d(/:])(:)(?![\/\d])/gu, m => m[1] + NBS + m[2], 'Espace insécable avant les deux-points'],
        ['quotes', /"([^"\n]{1,300})"/g, m => `«${NBS}${m[1].trim()}${NBS}»`, 'Guillemets français « »'],
        ['dots', /\.{3}/g, () => '…', 'Points de suspension en un seul signe'],
        ['apos', /(\p{L})'(?=\p{L})/gu, m => m[1] + '’', 'Apostrophe typographique ’'],
        ['cap', /([.!?…]\s+)(\p{Ll})/gu, m => m[1] + m[2].toLocaleUpperCase('fr'), 'Majuscule en début de phrase'],
    ];
    function issues(text) {
        const out = []; text = String(text || '');
        for (const [kind, rx, f, msg] of RULES) { rx.lastIndex = 0; let m; while ((m = rx.exec(text))) { const fix = f(m); if (fix == null || fix === m[0]) continue; out.push({i: m.index, len: m[0].length, fix, msg, kind, was: m[0]}); if (out.length > 2000) return out; } }
        // les recouvrements : on garde le premier trouvé à chaque endroit
        out.sort((a, b) => a.i - b.i); const kept = []; let end = -1; out.forEach(x => { if (x.i >= end) { kept.push(x); end = x.i + x.len; } }); return kept;
    }
    const fixAll = text => { let s = String(text || ''), guard = 0, list; while ((list = issues(s)).length && guard++ < 6) for (const x of list.slice().reverse()) s = s.slice(0, x.i) + x.fix + s.slice(x.i + x.len); return s; };
    ext.textDocProof = {synonyms, issues, fixAll};
    if (typeof module === 'object' && module.exports) { module.exports = {synonyms, issues, fixAll}; return; }

    /* ═════════ L'écran ═════════ */
    const toast = (...a) => A()?.toast?.(...a);
    /** le mot choisi, sinon celui sous le curseur : {range, word} */
    function wordAt(ed) {
        ed.restoreSel?.(); const r0 = ed.sel?.() || ed.lastRange; if (!r0) return null;
        if (!r0.collapsed) { const w = r0.toString().trim(); return w ? {range: r0.cloneRange(), word: w} : null; }
        const n = r0.startContainer; if (n.nodeType !== 3) return null; const t = n.nodeValue; let a = r0.startOffset, b = a;
        while (a > 0 && /[\p{L}'’-]/u.test(t[a - 1])) a--; while (b < t.length && /[\p{L}'’-]/u.test(t[b])) b++; if (a === b) return null;
        const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); return {range: r, word: t.slice(a, b)};
    }
    function synDialog(ed) {
        const at = wordAt(ed); if (!at) return toast('Choisis un mot (double-clic) ou mets le curseur dedans, puis 🔁 Synonymes.');
        const list = synonyms(at.word);
        ext.openDialog({eyebrow: 'OUTILS', title: `🔁 Synonymes de « ${at.word} »`, submitLabel: 'Fermer',
            body: list.length ? `<p class="muted">Clic sur un mot : il remplace « ${esc(at.word)} » (↶ pour revenir).</p><div class="wp-syn">${list.map(w => `<button type="button" class="button small secondary" data-syn="${esc(w)}">${esc(keepCase(at.word, w))}</button>`).join('')}</div>`
                : `<p>Pas de synonyme connu pour « ${esc(at.word)} ». Le dictionnaire intégré compte ${LIST.length} groupes de mots, surtout ceux d’un récit de famille.</p>`,
            onOpen: d => d.addEventListener('click', e => { const b = e.target.closest('[data-syn]'); if (!b) return;
                ed.commit(); const t = document.createTextNode(keepCase(at.word, b.dataset.syn)); at.range.deleteContents(); at.range.insertNode(t); ed.commit(); ed.layoutSoon?.(0); d.close?.(); d.remove?.();
                ed.status?.flash?.(`« ${at.word} » → « ${t.nodeValue} »`); }),
            onSubmit: () => {}});
    }
    /** tous les morceaux de texte du document : [{node, issues}] */
    const textNodes = ed => { const out = []; ed.bodies().forEach(b => { const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; if (n.parentElement?.closest('.wp-field, code, pre, [contenteditable="false"]')) continue; const is = issues(n.nodeValue); if (is.length) out.push({node: n, issues: is}); } }); return out; };
    function proofDialog(ed) {
        const found = textNodes(ed), all = found.flatMap(f => f.issues.map(x => ({...x, node: f.node})));
        if (!all.length) return toast('🔎 Rien à reprendre : typographie et répétitions sont bonnes.', 'success');
        const ctx = (x) => { const t = x.node.nodeValue, a = Math.max(0, x.i - 25), b = Math.min(t.length, x.i + x.len + 25); return `${a ? '…' : ''}${esc(t.slice(a, x.i))}<mark>${esc(x.was).replace(/ /g, '·')}</mark>${esc(t.slice(x.i + x.len, b))}${b < t.length ? '…' : ''}`; };
        const counts = {}; all.forEach(x => { counts[x.msg] = (counts[x.msg] || 0) + 1; });
        ext.openDialog({eyebrow: 'OUTILS', title: `🔎 Relecture : ${all.length} point${all.length > 1 ? 's' : ''}`, submitLabel: 'Tout corriger', wide: true,
            body: `<p class="muted">${Object.entries(counts).map(([m, n]) => `${esc(m)} (${n})`).join(' · ')}</p><ol class="wp-proof">${all.slice(0, 300).map((x, i) => `<li data-pf="${i}"><span class="wp-pf-ctx">${ctx(x)}</span> <small class="muted">${esc(x.msg)} → « ${esc(x.fix).replace(/ | /g, '⍽')} »</small> <button type="button" class="button small secondary" data-pf-go="${i}">Voir</button> <button type="button" class="button small" data-pf-fix="${i}">Corriger</button></li>`).join('')}</ol>${all.length > 300 ? `<p class="muted">Et ${all.length - 300} de plus (« Tout corriger » les prend aussi).</p>` : ''}`,
            onOpen: d => d.addEventListener('click', e => {
                const go = e.target.closest('[data-pf-go]'), fx = e.target.closest('[data-pf-fix]'); if (!go && !fx) return; const x = all[Number((go || fx).dataset.pfGo ?? fx.dataset.pfFix)]; if (!x || !x.node.isConnected) return;
                if (go) { const r = document.createRange(); r.setStart(x.node, Math.min(x.i, x.node.length)); r.setEnd(x.node, Math.min(x.i + x.len, x.node.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); x.node.parentElement?.scrollIntoView({block: 'center'}); return; }
                if (x.node.nodeValue.slice(x.i, x.i + x.len) !== x.was) return toast('Ce passage a changé : relance la relecture.');
                ed.commit(); x.node.nodeValue = x.node.nodeValue.slice(0, x.i) + x.fix + x.node.nodeValue.slice(x.i + x.len); ed.commit(); ed.layoutSoon?.(0);
                const diff = x.fix.length - x.len; all.forEach(y => { if (y.node === x.node && y.i > x.i) y.i += diff; }); fx.closest('li').classList.add('is-done'); fx.disabled = true; fx.textContent = '✓'; }),
            onSubmit: () => { ed.commit(); let n = 0; textNodes(ed).forEach(f => { const v = fixAll(f.node.nodeValue); if (v !== f.node.nodeValue) { f.node.nodeValue = v; n++; } }); ed.commit(); ed.layoutSoon?.(0); toast(`🔎 Corrigé dans ${n} passage${n > 1 ? 's' : ''} (↶ pour revenir).`, 'success'); }});
    }
    /* ── ♿ L'accessibilité du document ── */
    function a11yIssues(ed) {
        const out = [], add = (el, msg, fix) => out.push({el, msg, fix}); let last = 0;
        ed.bodies().forEach(b => {
            b.querySelectorAll('img').forEach(im => { if (!(im.getAttribute('alt') || '').trim()) add(im, 'Image sans description (lue à voix haute aux personnes qui ne voient pas)', 'alt'); });
            b.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { const n = Number(h.tagName[1]); if (!h.textContent.trim()) add(h, 'Titre vide'); if (last && n > last + 1) add(h, `Titre de niveau ${n} juste après un niveau ${last} : un niveau est sauté`); last = n; });
            b.querySelectorAll('table').forEach(t => { if (!t.querySelector('th, tr[data-head], thead')) add(t, 'Tableau sans ligne de titres (Tableau → « Ligne d’en-tête »)'); });
            b.querySelectorAll('a').forEach(a => { if (/^(ici|cliquez ici|clique ici|lien|voir|ce lien|plus)$/i.test(a.textContent.trim())) add(a, `Lien « ${a.textContent.trim()} » : écris plutôt où il mène`); });
            b.querySelectorAll('[style*="font-size"]').forEach(s => { const px = parseFloat(s.style.fontSize) * (/pt$/.test(s.style.fontSize) ? 1.333 : 1); if (px && px < 10) add(s, 'Texte très petit (moins de 8 points)'); });
        });
        return out;
    }
    function a11yDialog(ed) {
        const list = a11yIssues(ed); if (!list.length) return toast('♿ Rien à signaler : images décrites, titres en ordre, tableaux avec titres, liens clairs.', 'success');
        ext.openDialog({eyebrow: 'OUTILS', title: `♿ Accessibilité : ${list.length} point${list.length > 1 ? 's' : ''}`, submitLabel: 'Fermer', wide: true,
            body: `<p class="muted">Pour que le document se lise bien avec un lecteur d’écran, à voix haute ou en grand.</p><ol class="wp-proof">${list.map((x, i) => `<li>${esc(x.msg)} <button type="button" class="button small secondary" data-ax-go="${i}">Voir</button>${x.fix === 'alt' ? ` <button type="button" class="button small" data-ax-alt="${i}">＋ Description…</button>` : ''}</li>`).join('')}</ol>`,
            onOpen: d => d.addEventListener('click', async e => { const go = e.target.closest('[data-ax-go]'), al = e.target.closest('[data-ax-alt]'); if (!go && !al) return; const x = list[Number((go || al).dataset.axGo ?? al.dataset.axAlt)]; if (!x?.el.isConnected) return;
                x.el.scrollIntoView({block: 'center'}); x.el.classList.add('wp-ax-flash'); setTimeout(() => x.el.classList.remove('wp-ax-flash'), 1600);
                if (al) { const t = await A().askText({title: 'Description de l’image', message: 'Ce que montre l’image, en une phrase (ex. « Mariage de Jean et Marie devant l’église, 1923 »)', value: '', okLabel: 'Enregistrer'}); if (!t?.trim()) return; ed.commit(); x.el.setAttribute('alt', t.trim().slice(0, 300)); ed.commit(); al.disabled = true; al.textContent = '✓'; } }),
            onSubmit: () => {}});
    }

    ext.textDocMenuExtra = ext.textDocMenuExtra || [];
    ext.textDocMenuExtra.push({menu: 'Outils', cmd: 'synonyms', label: '🔁 Synonymes…'}, {menu: 'Outils', cmd: 'proof', label: '🔎 Relecture (typographie, répétitions)…'}, {menu: 'Outils', cmd: 'a11y', label: '♿ Vérifier l’accessibilité…'});
    ext.textDocCommands = ext.textDocCommands || {};
    Object.assign(ext.textDocCommands, {synonyms: ed => synDialog(ed), proof: ed => proofDialog(ed), a11y: ed => a11yDialog(ed)});
})(typeof window !== 'undefined' ? window : globalThis);
