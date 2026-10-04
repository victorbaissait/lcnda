<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="Le Carnet numérique des ancêtres : une application locale pour organiser, documenter et transmettre une généalogie.">
    <meta name="color-scheme" content="light">
    <title>LCNDA — Le Carnet numérique des ancêtres</title>
    <style>
        :root { --presentation-ink:#080808; --presentation-blue:#0066cc; --presentation-paper:#fbfbfb; }
        * { box-sizing:border-box; }
        html { scroll-behavior:smooth; }
        body { margin:0; font-family:Arial, Helvetica, sans-serif; color:var(--presentation-ink); }
        a { color:inherit; text-decoration:none; }
        .button { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:11px 15px; border:2px solid var(--presentation-ink); background:var(--presentation-blue); color:#fff; box-shadow:4px 4px 0 rgba(5,93,255,.25); font-weight:700; transition:.15s ease; }
        .button:hover { transform:translate(3px,3px); box-shadow:1px 1px 0 var(--presentation-ink); }
        .button.secondary { background:#fff; color:var(--presentation-ink); }
        .presentation-body { min-width:320px; overflow:auto; background-color:var(--presentation-paper); background-image:linear-gradient(rgba(0,102,204,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,102,204,.035) 1px,transparent 1px); background-size:28px 28px; }
        .presentation-topbar { position:sticky; top:0; z-index:10; display:grid; grid-template-columns:minmax(250px,1fr) auto auto; align-items:center; gap:24px; min-height:78px; padding:10px clamp(18px,4vw,64px); border-bottom:2px solid var(--presentation-ink); background:rgba(255,255,255,.96); backdrop-filter:blur(10px); }
        .presentation-brand { display:flex; align-items:center; gap:12px; min-width:0; font-weight:900; line-height:1; letter-spacing:.04em; }
        .presentation-brand span { display:grid; place-items:center; box-sizing:border-box; flex:0 0 44px; width:44px; height:44px; border:2px solid var(--presentation-ink); background:var(--presentation-blue); color:#fff; box-shadow:4px 4px 0 rgba(5,93,255,.25); font-size:8px; letter-spacing:0; white-space:nowrap; }
        .presentation-brand strong { font-size:11px; letter-spacing:.1em; }
        .presentation-nav { display:flex; gap:20px; font-size:12px; font-weight:800; }.presentation-nav a:hover { color:var(--presentation-blue); text-decoration:underline; text-underline-offset:4px; }.presentation-open { white-space:nowrap; }.presentation-open > span,.presentation-actions .button > span { margin-left:9px; font-size:16px; }
        .presentation-hero { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(390px,.95fr); gap:clamp(32px,7vw,110px); max-width:1450px; min-height:620px; margin:0 auto; padding:clamp(64px,10vw,144px) clamp(24px,7vw,108px) 90px; align-items:center; }.presentation-hero-copy { position:relative; }.presentation-acronym { margin:17px 0 -14px; color:var(--presentation-blue); font-weight:900; font-size:clamp(64px,11vw,160px); line-height:.8; letter-spacing:-.09em; opacity:.14; user-select:none; }.presentation-hero h1 { position:relative; max-width:750px; margin:0; font-size:clamp(45px,6.5vw,92px); line-height:.9; letter-spacing:-.075em; }.presentation-lead { position:relative; max-width:570px; margin:30px 0 0; font-size:clamp(17px,1.7vw,24px); line-height:1.35; font-weight:600; }.presentation-actions { display:flex; flex-wrap:wrap; gap:14px; margin-top:34px; }
        .presentation-hero-board { position:relative; min-height:410px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:10px 10px 0 rgba(8,8,8,.13); overflow:hidden; }.presentation-hero-board::before { content:""; position:absolute; inset:0; background:repeating-linear-gradient(90deg,transparent 0 50px,rgba(0,102,204,.07) 50px 51px),repeating-linear-gradient(0deg,transparent 0 50px,rgba(0,102,204,.07) 50px 51px); }.presentation-note { position:absolute; z-index:2; display:grid; gap:8px; width:58%; padding:18px 19px; border:2px solid var(--presentation-ink); box-shadow:6px 6px 0 rgba(8,8,8,.14); transform:rotate(-3deg); }.presentation-note span { color:var(--presentation-blue); font-size:11px; font-weight:900; letter-spacing:.1em; }.presentation-note strong { font-size:19px; }.presentation-note small { font-size:12px; line-height:1.3; font-weight:700; }.note-blue { top:37px; left:25px; background:#dbeaff; }.note-white { top:152px; right:20px; background:#fff; transform:rotate(4deg); }.note-black { bottom:34px; left:64px; background:#111; color:#fff; transform:rotate(-1.5deg); }.note-black span { color:#fff; }.presentation-thread { position:absolute; z-index:1; height:2px; background:var(--presentation-blue); transform-origin:left center; }.thread-one { width:67%; top:118px; left:44%; transform:rotate(37deg); }.thread-two { width:57%; top:294px; left:5%; transform:rotate(-18deg); }
        .presentation-section { max-width:1450px; margin:0 auto; padding:clamp(70px,10vw,140px) clamp(24px,7vw,108px); }.presentation-section-head { max-width:760px; }.presentation-section h2 { margin:13px 0 0; font-size:clamp(34px,4.7vw,64px); line-height:.96; letter-spacing:-.065em; }.presentation-section-head > p { margin:22px 0 0; color:#515151; font-size:18px; line-height:1.5; font-weight:600; }#fonctionnalites { position:relative; }#fonctionnalites::before { content:""; position:absolute; top:0; left:50%; width:100vw; border-top:2px solid var(--presentation-ink); transform:translateX(-50%); }
        .presentation-feature-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:48px; }.presentation-feature { min-height:265px; padding:24px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:6px 6px 0 rgba(5,93,255,.21); }.presentation-feature-large { grid-row:span 2; }.presentation-feature h3 { margin:28px 0 10px; font-size:25px; line-height:1; letter-spacing:-.04em; }.presentation-feature p { margin:0; color:#4f4f4f; font-weight:600; line-height:1.45; }.feature-index { display:block; color:var(--presentation-blue); font-weight:900; font-size:13px; letter-spacing:.12em; }.presentation-feature ul { margin:22px 0 0; padding:0; list-style:none; font-size:13px; font-weight:800; }.presentation-feature li { padding:8px 0; border-top:1px solid #d7d7d7; }.presentation-feature li::before { content:"→"; color:var(--presentation-blue); margin-right:7px; }
        .presentation-install { max-width:none; padding-left:max(24px,calc((100vw - 1450px)/2 + 108px)); padding-right:max(24px,calc((100vw - 1450px)/2 + 108px)); border-top:2px solid var(--presentation-ink); background:#fff; }.presentation-steps { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 44px; margin:46px 0 0; padding:0; list-style:none; }.presentation-steps li { display:grid; grid-template-columns:56px 1fr; gap:18px; padding:23px 0; border-top:2px solid var(--presentation-ink); }.presentation-steps li > span { display:grid; place-items:center; width:42px; height:42px; border:2px solid var(--presentation-ink); background:var(--presentation-blue); color:#fff; font-size:11px; font-weight:900; }.presentation-steps h3 { margin:0; font-size:20px; letter-spacing:-.03em; }.presentation-steps p { margin:7px 0 0; color:#4f4f4f; line-height:1.45; font-weight:600; }.presentation-steps code,.presentation-callout code { display:inline-block; padding:1px 4px; border:1px solid #b8d5f5; background:#eaf2ff; color:#111; font-size:.9em; }.presentation-callout { display:grid; grid-template-columns:190px 1fr; gap:18px; margin-top:30px; padding:19px 22px; border:2px solid var(--presentation-ink); background:#fff5d6; box-shadow:5px 5px 0 rgba(8,8,8,.14); font-size:14px; line-height:1.45; }.presentation-callout strong { font-size:15px; }
        .presentation-footer { display:flex; justify-content:space-between; gap:20px; padding:21px clamp(24px,4vw,64px); border-top:2px solid var(--presentation-ink); background:#fff; font-size:11px; letter-spacing:.08em; font-weight:900; }.presentation-footer a { color:var(--presentation-blue); }
        @media (max-width:900px) { .presentation-topbar { grid-template-columns:1fr auto; }.presentation-nav { display:none; }.presentation-hero { grid-template-columns:1fr; padding-top:80px; }.presentation-hero-board { width:100%; max-width:590px; }.presentation-feature-grid { grid-template-columns:repeat(2,1fr); }.presentation-feature-large { grid-row:auto; }.presentation-steps { grid-template-columns:1fr; } }
        @media (max-width:580px) { .presentation-topbar { min-height:64px; padding:8px 15px; }.presentation-brand span { flex-basis:36px; width:36px; height:36px; font-size:6.5px; }.presentation-brand strong { font-size:9px; }.presentation-open { padding:9px 10px; font-size:11px; }.presentation-open span { display:none; }.presentation-hero { min-height:0; padding-top:58px; }.presentation-lead { font-size:17px; }.presentation-hero-board { min-height:340px; }.presentation-note { width:68%; padding:13px; }.presentation-note strong { font-size:15px; }.note-white { top:132px; }.note-black { left:35px; }.presentation-feature-grid { grid-template-columns:1fr; }.presentation-feature { min-height:0; }.presentation-section { padding-top:72px; padding-bottom:72px; }.presentation-install { padding-left:24px; padding-right:24px; }.presentation-callout { grid-template-columns:1fr; gap:7px; }.presentation-footer { flex-direction:column; } }
    </style>
</head>
<body class="presentation-body">
    <header class="presentation-topbar">
        <a class="presentation-brand" href="#haut" aria-label="Le Carnet numérique des ancêtres, accueil">
            <span>LCNDA</span>
            <strong>LE CARNET NUMÉRIQUE<br>DES ANCÊTRES</strong>
        </a>
        <nav class="presentation-nav" aria-label="Navigation de la présentation">
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#installer">Installation</a>
        </nav>
        <a class="button presentation-open" href="LCNDA0001.zip">Télécharger le ZIP <span aria-hidden="true">↓</span></a>
    </header>

    <main id="haut">
        <section class="presentation-hero">
            <div class="presentation-hero-copy">
                <span class="eyebrow">VERSION ALPHA · 0.0.1</span>
                <p class="presentation-acronym" aria-hidden="true">LCNDA</p>
                <h1>Le Carnet numérique<br>des ancêtres</h1>
                <p class="presentation-lead">Un espace de travail local open source et totalement gratuit pour travailler avec son histoire familiale : personnes, actes, images et archives, pensé par Victor Baissait et codé par Codex (ChatGPT) et Claude.</p>
                <div class="presentation-actions">
                    <a class="button" href="LCNDA0001.zip">Télécharger le ZIP <span aria-hidden="true">↓</span></a>
                    <a class="button secondary" href="#installer">Voir l’installation</a>
                </div>
            </div>
            <div class="presentation-hero-board" aria-label="Aperçu des éléments réunis dans l'application">
                <article class="presentation-note note-blue"><span>01</span><strong>PERSONNES</strong><small>Fiches, liens familiaux et repères de vie</small></article>
                <article class="presentation-note note-white"><span>02</span><strong>ARCHIVES</strong><small>Cotes, visites, dépouillements et médias</small></article>
                <article class="presentation-note note-black"><span>03</span><strong>ENQUÊTES</strong><small>Pistes, hypothèses et preuves à vérifier</small></article>
                <div class="presentation-thread thread-one" aria-hidden="true"></div>
                <div class="presentation-thread thread-two" aria-hidden="true"></div>
            </div>
        </section>

        <section class="presentation-section" id="fonctionnalites">
            <header class="presentation-section-head">
                <span class="eyebrow">01 — DANS LE CARNET</span>
                <h2>Tout ce qui aide à comprendre une famille.</h2>
            </header>
            <div class="presentation-feature-grid">
                <article class="presentation-feature feature-large">
                    <span class="feature-index">A</span>
                    <h3>Construire et relier</h3>
                    <p>Fiches individuelles, parents, fratries, couples, enfants, variantes de nom, événements et arbres de parenté.</p>
                    <ul><li>Graphiques et chronologies</li><li>Recensements et lieux</li><li>SOSA et d’Aboville</li></ul>
                </article>
                <article class="presentation-feature">
                    <span class="feature-index">B</span>
                    <h3>Composer votre espace</h3>
                    <p>Une interface personnalisable : ordre des menus et des blocs, éléments visibles, tableaux de bord, couleurs et modes d’affichage selon votre manière de travailler.</p>
                </article>
                <article class="presentation-feature feature-blue">
                    <span class="feature-index">C</span>
                    <h3>Documenter</h3>
                    <p>Photos, PDF, actes, transcriptions, sources, médias liés et niveau de confiance pour chaque fait.</p>
                </article>
                <article class="presentation-feature feature-blue">
                    <span class="feature-index">D</span>
                    <h3>Enquêter</h3>
                    <p>Outils spécifiques : hypothèses, battues, rappels, budget, courriers et planification de visites aux archives.</p>
                </article>
                <article class="presentation-feature">
                    <span class="feature-index">E</span>
                    <h3>Transmettre</h3>
                    <p>Listes, répertoire des vivants, exports, livrets et activités pour faire circuler l’histoire familiale.</p>
                </article>
                <article class="presentation-feature feature-dark">
                    <span class="feature-index">F</span>
                    <h3>Base locale</h3>
                    <p>Les personnes, événements et recherches sont stockés dans une base SQLite locale sur son ordinateur, pas besoin d’internet.</p>
                </article>
            </div>
        </section>

        <section class="presentation-section presentation-install" id="installer">
            <header class="presentation-section-head">
                <span class="eyebrow">02 — INSTALLATION LOCALE</span>
                <h2>Installer le carnet sur votre ordinateur.</h2>
                <p>Le Carnet numérique des ancêtres (en version alpha 0.0.1) fonctionne dans votre navigateur, avec les fichiers conservés sur votre ordinateur. Il faut simplement un petit serveur local, tel que MAMP, XAMPP ou WampServer, pour l’ouvrir.</p>
            </header>
            <ol class="presentation-steps">
                <li><span>01</span><div><h3>Télécharger puis décompresser</h3><p>Téléchargez l’archive ZIP, puis ouvrez-la : vous obtenez le dossier <code>LCNDA</code>.</p></div></li>
                <li><span>02</span><div><h3>Ouvrir un serveur local</h3><p>Installez puis lancez MAMP, XAMPP ou WampServer. Ces outils permettent de faire fonctionner le carnet sur votre ordinateur.</p></div></li>
                <li><span>03</span><div><h3>Déposer le dossier</h3><p>Placez le dossier <code>LCNDA</code> dans le dossier web indiqué par votre outil, puis ouvrez dans votre navigateur l’adresse qu’il affiche.</p></div></li>
                <li><span>04</span><div><h3>Commencer la généalogie</h3><p>À la première ouverture, importez un GEDCOM ou créez une première personne. Le carnet est prêt à être utilisé.</p></div></li>
            </ol>
            <aside class="presentation-callout"><strong>À savoir</strong><span>L’adresse affichée peut ressembler à <code>http://localhost/LCNDA/</code> ou <code>http://localhost:8888/LCNDA/</code>. Le nombre <code>8888</code> est normal : il dépend simplement de l’outil utilisé. Le ZIP contient le logiciel vierge, sans base généalogique ni médias personnels.</span></aside>
        </section>

    </main>

    <footer class="presentation-footer">
        <span>LCNDA — LE CARNET NUMÉRIQUE DES ANCÊTRES · ALPHA 0.0.1</span>
        <a href="#haut">Retour en haut ↑</a>
    </footer>
</body>
</html>
