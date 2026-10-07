<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="Le Carnet numérique des ancêtres : une application locale pour organiser, documenter et transmettre une généalogie.">
    <meta name="color-scheme" content="light">
    <title>LCNDA — Le Carnet numérique des ancêtres</title>
    <style>
        :root { --presentation-ink:#080808; --presentation-blue:#0066cc; --presentation-paper:#fbfbfb; --presentation-muted:#515151; }
        * { box-sizing:border-box; }
        html { scroll-behavior:smooth; }
        body { margin:0; font-family:Arial, Helvetica, sans-serif; color:var(--presentation-ink); }
        a { color:inherit; text-decoration:none; }
        .eyebrow { display:inline-block; color:var(--presentation-blue); font-size:12px; font-weight:900; letter-spacing:.14em; }
        .button { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-height:42px; padding:11px 15px; border:2px solid var(--presentation-ink); background:var(--presentation-blue); color:#fff; box-shadow:4px 4px 0 rgba(5,93,255,.25); font-weight:700; line-height:1.2; text-align:center; transition:.15s ease; }
        .button:hover { transform:translate(3px,3px); box-shadow:1px 1px 0 var(--presentation-ink); }
        .button.secondary { background:#fff; color:var(--presentation-ink); }
        .button > span[aria-hidden] { font-size:16px; }
        .presentation-body { min-width:320px; overflow-x:hidden; background-color:var(--presentation-paper); background-image:linear-gradient(rgba(0,102,204,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,102,204,.035) 1px,transparent 1px); background-size:28px 28px; }

        /* ─── En-tête : texte à gauche, tableau des notes à droite (centré verticalement) ─── */
        .presentation-hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,540px); gap:clamp(32px,6vw,96px); max-width:1450px; min-height:640px; margin:0 auto; padding:clamp(40px,6vw,80px) clamp(24px,7vw,108px); align-items:center; }
        .presentation-hero-copy { position:relative; min-width:0; }
        .presentation-acronym { margin:17px 0 -14px; color:var(--presentation-blue); font-weight:900; font-size:clamp(64px,11vw,160px); line-height:.8; letter-spacing:-.09em; opacity:.14; user-select:none; }
        .presentation-hero h1 { position:relative; max-width:750px; margin:0; font-size:clamp(45px,6.5vw,92px); line-height:.9; letter-spacing:-.075em; }
        .presentation-lead { position:relative; max-width:600px; margin:30px 0 0; font-size:clamp(17px,1.7vw,24px); line-height:1.35; font-weight:600; }
        .presentation-actions { display:flex; flex-wrap:wrap; gap:14px; margin-top:34px; }
        .presentation-hero-board { position:relative; width:100%; min-height:410px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:10px 10px 0 rgba(8,8,8,.13); overflow:hidden; }
        .presentation-hero-board::before { content:""; position:absolute; inset:0; background:repeating-linear-gradient(90deg,transparent 0 50px,rgba(0,102,204,.07) 50px 51px),repeating-linear-gradient(0deg,transparent 0 50px,rgba(0,102,204,.07) 50px 51px); }
        .presentation-note { position:absolute; z-index:2; display:grid; gap:8px; width:58%; padding:18px 19px; border:2px solid var(--presentation-ink); box-shadow:6px 6px 0 rgba(8,8,8,.14); transform:rotate(-3deg); }
        .presentation-note span { color:var(--presentation-blue); font-size:11px; font-weight:900; letter-spacing:.1em; }
        .presentation-note strong { font-size:19px; }
        .presentation-note small { font-size:12px; line-height:1.3; font-weight:700; }
        .note-blue { top:37px; left:25px; background:#dbeaff; }
        .note-white { top:152px; right:20px; background:#fff; transform:rotate(4deg); }
        .note-black { bottom:34px; left:64px; background:#111; color:#fff; transform:rotate(-1.5deg); }
        .note-black span { color:#fff; }
        .presentation-thread { position:absolute; z-index:1; height:2px; background:var(--presentation-blue); transform-origin:left center; }
        .thread-one { width:67%; top:118px; left:44%; transform:rotate(37deg); }
        .thread-two { width:57%; top:294px; left:5%; transform:rotate(-18deg); }

        /* ─── Sections ─── */
        .presentation-section { position:relative; max-width:1450px; margin:0 auto; padding:clamp(70px,9vw,120px) clamp(24px,7vw,108px); }
        .presentation-section::before { content:""; position:absolute; top:0; left:50%; width:100vw; border-top:2px solid var(--presentation-ink); transform:translateX(-50%); }
        .presentation-section-head { max-width:760px; }
        .presentation-section h2 { margin:13px 0 0; font-size:clamp(34px,4.7vw,64px); line-height:.96; letter-spacing:-.065em; }
        .presentation-section-head > p { margin:22px 0 0; color:var(--presentation-muted); font-size:18px; line-height:1.5; font-weight:600; }

        /* ─── Téléchargements ─── */
        .presentation-downloads { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; margin-top:44px; align-items:start; }
        .presentation-os { display:grid; gap:14px; padding:24px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:6px 6px 0 rgba(5,93,255,.21); }
        .presentation-os h3 { margin:0; font-size:28px; letter-spacing:-.04em; }
        .presentation-os-req { margin:-6px 0 0; color:var(--presentation-muted); font-size:14px; font-weight:700; line-height:1.4; }
        .presentation-os-group { display:grid; gap:10px; padding-top:14px; border-top:1px solid #d7d7d7; }
        .presentation-os-group > strong { font-size:12px; letter-spacing:.1em; text-transform:uppercase; }
        .presentation-os .button { width:100%; justify-content:space-between; text-align:left; }
        .presentation-os .button small { display:block; font-size:12px; font-weight:600; opacity:.85; }
        .presentation-os-help { margin:0; color:var(--presentation-muted); font-size:13px; line-height:1.45; font-weight:600; }
        .presentation-os-help code, .presentation-callout code { padding:1px 4px; border:1px solid #b8d5f5; background:#eaf2ff; color:#111; font-size:.92em; word-break:break-all; }
        .presentation-os-source { grid-template-columns:minmax(0,1fr) minmax(260px,420px); align-items:center; gap:24px; margin-top:18px; }
        .presentation-os-source .presentation-os-group { padding-top:0; border-top:0; }
        .presentation-os-source .presentation-os-help { margin-top:10px; }
        @media (max-width:760px) { .presentation-os-source { grid-template-columns:1fr; } }
        /* ─── Nouveautés de la version (bloc qui s'ouvre et se ferme) ─── */
        .presentation-changes { margin-top:18px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:6px 6px 0 rgba(5,93,255,.21); }
        .presentation-changes summary { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 24px; cursor:pointer; list-style:none; font-size:20px; font-weight:800; letter-spacing:-.02em; }
        .presentation-changes summary::-webkit-details-marker { display:none; }
        .presentation-changes summary::after { content:"+"; flex:none; display:grid; place-items:center; width:32px; height:32px; border:2px solid var(--presentation-ink); font-size:20px; line-height:1; }
        .presentation-changes[open] summary::after { content:"−"; }
        .presentation-changes summary small { display:block; margin-top:3px; color:var(--presentation-muted); font-size:13px; font-weight:700; letter-spacing:0; }
        .presentation-changes-body { padding:4px 24px 22px; border-top:1px solid #d7d7d7; font-size:15px; line-height:1.55; }
        .presentation-changes-body h4 { margin:18px 0 6px; font-size:13px; letter-spacing:.1em; text-transform:uppercase; color:var(--presentation-blue); }
        .presentation-changes-body ul { margin:0; padding-left:20px; }
        .presentation-changes-body li { margin:4px 0; }
        .presentation-callout { display:grid; grid-template-columns:200px 1fr; gap:18px; margin-top:22px; padding:19px 22px; border:2px solid var(--presentation-ink); background:#fff5d6; box-shadow:5px 5px 0 rgba(8,8,8,.14); font-size:14px; line-height:1.5; }
        .presentation-callout p { margin:0; }
        .presentation-callout p + p { margin-top:8px; }
        .presentation-callout a { color:var(--presentation-blue); font-weight:800; text-decoration:underline; text-underline-offset:3px; }

        /* ─── Découvrir (texte de présentation) ─── */
        .presentation-intro { max-width:980px; margin:30px 0 0; font-size:clamp(19px,2vw,26px); line-height:1.38; font-weight:600; }
        .presentation-intro strong { color:var(--presentation-blue); }
        .presentation-about-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; margin-top:48px; }
        .presentation-about { padding:24px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:6px 6px 0 rgba(5,93,255,.21); }
        .presentation-about.about-key { grid-column:1 / -1; background:#dbeaff; }
        .presentation-about h3 { margin:0 0 12px; font-size:24px; line-height:1.05; letter-spacing:-.04em; }
        .presentation-about p { margin:0; color:#3f3f3f; font-weight:600; line-height:1.5; }
        .presentation-about p + p, .presentation-about p + ul, .presentation-about ul + p { margin-top:10px; }
        .presentation-about ul { margin:0; padding:0; list-style:none; font-weight:600; line-height:1.45; color:#3f3f3f; }
        .presentation-about li { padding:7px 0; border-top:1px solid #d7d7d7; }
        .presentation-about li::before { content:"→"; color:var(--presentation-blue); margin-right:7px; font-weight:900; }
        .presentation-strengths { display:flex; flex-wrap:wrap; gap:0; margin-top:28px; border:2px solid var(--presentation-ink); background:#111; color:#fff; box-shadow:10px 10px 0 rgba(8,8,8,.13); }
        .presentation-strengths div { flex:1 1 220px; padding:20px 22px; border-right:1px solid #333; border-bottom:1px solid #333; }
        .presentation-strengths strong { display:block; color:#7fb6ff; font-size:15px; letter-spacing:-.01em; }
        .presentation-strengths span { display:block; margin-top:6px; color:#d9d9d9; font-size:14px; font-weight:600; line-height:1.4; }
        .presentation-beta-note { margin:22px 0 0; color:var(--presentation-muted); font-size:14px; font-weight:700; line-height:1.5; }
        @media (max-width:760px) { .presentation-about-grid { grid-template-columns:1fr; } }

        /* ─── Fonctionnalités ─── */
        .presentation-feature-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:48px; }
        .presentation-feature { min-height:265px; padding:24px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:6px 6px 0 rgba(5,93,255,.21); }
        .presentation-feature.feature-blue { background:#dbeaff; }
        .presentation-feature.feature-dark { background:#111; color:#fff; }
        .presentation-feature h3 { margin:28px 0 10px; font-size:25px; line-height:1; letter-spacing:-.04em; }
        .presentation-feature p { margin:0; color:#4f4f4f; font-weight:600; line-height:1.45; }
        .presentation-feature.feature-dark p { color:#d9d9d9; }
        .feature-index { display:block; color:var(--presentation-blue); font-weight:900; font-size:13px; letter-spacing:.12em; }
        .presentation-feature.feature-dark .feature-index { color:#7fb6ff; }
        .presentation-feature ul { margin:22px 0 0; padding:0; list-style:none; font-size:13px; font-weight:800; }
        .presentation-feature li { padding:8px 0; border-top:1px solid #d7d7d7; }
        .presentation-feature li::before { content:"→"; color:var(--presentation-blue); margin-right:7px; }

        /* ─── Aperçu (carrousel sans défilement automatique) ─── */
        .presentation-carousel { position:relative; margin-top:44px; }
        .presentation-carousel-track { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scroll-behavior:smooth; scrollbar-width:none; border:2px solid var(--presentation-ink); background:#fff; box-shadow:10px 10px 0 rgba(8,8,8,.13); }
        .presentation-carousel-track::-webkit-scrollbar { display:none; }
        .presentation-carousel-track:focus-visible { outline:3px solid var(--presentation-blue); outline-offset:4px; }
        .presentation-slide { flex:0 0 100%; margin:0; scroll-snap-align:start; }
        .presentation-slide img { display:block; width:100%; height:auto; aspect-ratio:3456 / 2234; object-fit:cover; background:#f1f1f1; }
        .presentation-slide figcaption { display:flex; gap:12px; align-items:baseline; padding:14px 18px; border-top:2px solid var(--presentation-ink); font-weight:800; }
        .presentation-slide figcaption span { color:var(--presentation-blue); font-size:12px; font-weight:900; letter-spacing:.12em; }
        .presentation-carousel-controls { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:22px; }
        .presentation-carousel-controls .button { min-width:52px; font-size:20px; }
        .presentation-carousel-controls .button:disabled { opacity:.35; cursor:default; transform:none; box-shadow:4px 4px 0 rgba(5,93,255,.25); }
        .presentation-carousel-dots { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }
        .presentation-carousel-dots button { width:13px; height:13px; padding:0; border:2px solid var(--presentation-ink); background:#fff; cursor:pointer; }
        .presentation-carousel-dots button[aria-current="true"] { background:var(--presentation-blue); }

        .presentation-footer { display:flex; justify-content:space-between; gap:20px; padding:21px clamp(24px,4vw,64px); border-top:2px solid var(--presentation-ink); background:#fff; font-size:11px; letter-spacing:.08em; font-weight:900; }
        .presentation-footer a { color:var(--presentation-blue); }

        @media (max-width:1100px) { .presentation-downloads { grid-template-columns:1fr 1fr; } .presentation-os-linux { grid-column:1 / -1; } .presentation-os-linux .presentation-os-groups { display:grid; grid-template-columns:1fr 1fr; gap:14px; } }
        @media (max-width:900px) { .presentation-hero { grid-template-columns:1fr; min-height:0; } .presentation-hero-board { max-width:590px; } .presentation-feature-grid { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:640px) { .presentation-downloads, .presentation-os-linux .presentation-os-groups { grid-template-columns:1fr; } .presentation-os-linux { grid-column:auto; } .presentation-callout { grid-template-columns:1fr; gap:7px; } }
        @media (max-width:580px) { .presentation-lead { font-size:17px; } .presentation-hero-board { min-height:340px; } .presentation-note { width:68%; padding:13px; } .presentation-note strong { font-size:15px; } .note-white { top:132px; } .note-black { left:35px; } .presentation-feature-grid { grid-template-columns:1fr; } .presentation-feature { min-height:0; } .presentation-footer { flex-direction:column; } }
    </style>
</head>
<body class="presentation-body">
    <main id="haut">
        <section class="presentation-hero">
            <div class="presentation-hero-copy">
                <span class="eyebrow">VERSION BÊTA · 0.2.1</span>
                <p class="presentation-acronym" aria-hidden="true">LCNDA</p>
                <h1>Le Carnet numérique<br>des ancêtres</h1>
                <p class="presentation-lead">Un logiciel de généalogie local, open source et gratuit pour travailler avec son histoire familiale. Pensé et designé par Victor Baissait, codé par Codex (ChatGPT) &amp; Claude.</p>
                <div class="presentation-actions">
                    <a class="button" href="#telecharger">Télécharger LCNDA<span aria-hidden="true">↓</span></a>
                    <a class="button secondary" href="#fonctionnalites">Fonctionnalités</a>
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

        <section class="presentation-section" id="telecharger">
            <header class="presentation-section-head">
                <span class="eyebrow">01 — TÉLÉCHARGER</span>
                <h2>Installez LCNDA sur votre ordinateur.</h2>
                <p>Gratuit, sans compte et sans internet : vos données restent chez vous. Choisissez votre système.</p>
            </header>
            <div class="presentation-downloads">
                <article class="presentation-os">
                    <h3>macOS</h3>
                    <p class="presentation-os-req">macOS 13 Ventura ou plus récent</p>
                    <div class="presentation-os-group">
                        <a class="button" href="download/LCNDA-0.2.1-mac-arm64.dmg"><span>Mac Apple Silicon<small>M1, M2, M3, M4… · 296 Mo</small></span><span aria-hidden="true">↓</span></a>
                        <a class="button secondary" href="download/LCNDA-0.2.1-mac-x64.dmg"><span>Mac Intel<small>Modèles 2017 et après · 302 Mo</small></span><span aria-hidden="true">↓</span></a>
                    </div>
                    <p class="presentation-os-help">Votre Mac : menu Pomme → À propos de ce Mac → « Puce » (Apple Silicon) ou « Processeur » (Intel). Ouvrez le fichier .dmg et glissez LCNDA dans Applications.</p>
                </article>

                <article class="presentation-os">
                    <h3>Windows</h3>
                    <p class="presentation-os-req">Windows 10 / 11 (64 bits) — PC Intel ou AMD, et Windows 11 sur processeur ARM</p>
                    <div class="presentation-os-group">
                        <a class="button" href="download/LCNDA-0.2.1-windows-x64.exe"><span>Windows 10 / 11<small>64 bits · 312 Mo</small></span><span aria-hidden="true">↓</span></a>
                    </div>
                    <p class="presentation-os-help">Lancez le fichier et suivez l'installation. Le composant Microsoft Visual C++ nécessaire est installé automatiquement s'il manque.</p>
                </article>

                <article class="presentation-os presentation-os-linux">
                    <h3>Linux</h3>
                    <p class="presentation-os-req">Distribution récente, 64 bits (Ubuntu 22.04, Debian 12, Fedora 38 ou plus récent)</p>
                    <div class="presentation-os-groups">
                        <div class="presentation-os-group">
                            <strong>PC Intel ou AMD</strong>
                            <a class="button" href="download/LCNDA-0.2.1-linux-x86_64.AppImage"><span>AppImage<small>Toutes distributions · 291 Mo</small></span><span aria-hidden="true">↓</span></a>
                            <a class="button secondary" href="download/LCNDA-0.2.1-linux-amd64.deb"><span>Paquet .deb<small>Ubuntu, Debian, Mint · 266 Mo</small></span><span aria-hidden="true">↓</span></a>
                        </div>
                        <div class="presentation-os-group">
                            <strong>Processeur ARM (Raspberry Pi…)</strong>
                            <a class="button" href="download/LCNDA-0.2.1-linux-arm64.AppImage"><span>AppImage ARM<small>Toutes distributions · 293 Mo</small></span><span aria-hidden="true">↓</span></a>
                            <a class="button secondary" href="download/LCNDA-0.2.1-linux-arm64.deb"><span>Paquet .deb ARM<small>Raspberry Pi OS, Ubuntu, Debian · 262 Mo</small></span><span aria-hidden="true">↓</span></a>
                        </div>
                    </div>
                    <p class="presentation-os-help">Le .deb sous Ubuntu ou Debian (<code>sudo apt install ./LCNDA-0.2.1-linux-amd64.deb</code>), sinon l'AppImage : rendez-la exécutable (clic droit → Propriétés → Autoriser l'exécution) puis double-cliquez.</p>
                </article>
            </div>

            <article class="presentation-os presentation-os-source">
                <div>
                    <h3>Code source</h3>
                    <p class="presentation-os-req">Pour les développeurs : LCNDA est un logiciel libre (licence AGPL-3.0)</p>
                    <p class="presentation-os-help">Le code complet de la version 0.2.1. Le répertoire mondial des lieux n'y est pas inclus, car il est trop volumineux : il se fabrique avec <code>npm run fetch:geo</code>.</p>
                </div>
                <div class="presentation-os-group">
                    <a class="button" href="download/lcnda-0.2.1.zip"><span>Archive .zip<small>Windows, macOS · 17 Mo</small></span><span aria-hidden="true">↓</span></a>
                    <a class="button secondary" href="download/lcnda-0.2.1.tar.gz"><span>Archive .tar.gz<small>Linux, macOS · 17 Mo</small></span><span aria-hidden="true">↓</span></a>
                </div>
            </article>

            <details class="presentation-changes">
                <summary><span>Nouveautés de la version 0.2.1<small>Battues au-delà des frontières et corrections</small></span></summary>
                <div class="presentation-changes-body">
                    <h4>Battues au-delà des frontières</h4>
                    <ul>
                        <li>Les battues ne s'arrêtent plus à la frontière : vous pouvez ajouter les communes de <b>Belgique, Suisse, Luxembourg, Liechtenstein, Allemagne, Italie, Autriche et Espagne</b>, ainsi que celles de l'<b>outre-mer français</b> (Guadeloupe, Martinique, Guyane, La Réunion, Mayotte).</li>
                        <li>Les communes voisines de part et d'autre d'une frontière sont reliées : une battue partie de Strasbourg passe à Kehl, une battue partie d'Hendaye passe à Irun.</li>
                        <li>Comme pour la France, les anciennes communes et les lieux-dits sont rattachés à leur commune actuelle.</li>
                        <li>Chaque base choisit ses pays (rubrique « Pays des battues », avec « Tout cocher » / « Tout décocher ») ; un pays utilisé par une battue ne peut pas être retiré par erreur.</li>
                    </ul>
                    <h4>Corrections</h4>
                    <ul>
                        <li>Les boutons qui demandaient de saisir un texte (supprimer une fiche, nouveau dossier d'enquête, recensement spécial, renommer…) fonctionnent de nouveau.</li>
                        <li>Les impressions (graphiques, feuille de mission aux archives, bordereau de copies) s'ouvrent correctement.</li>
                        <li>Recherche de la commune de départ d'une battue et recherche de lieux beaucoup plus rapides sur une base neuve (de plusieurs secondes à quelques centièmes).</li>
                        <li>Le crayon des blocs du tableau de bord fonctionne sur une base jamais personnalisée ; le nombre de personnes se met à jour tout de suite.</li>
                        <li>Enquêtes : la personne principale est affichée et modifiable.</li>
                        <li>Barre de menus du haut : défilement à la molette et barre visible, pour atteindre les menus de droite sur un petit écran.</li>
                        <li>Le bloc « Accès local », inutile dans le logiciel, a été retiré.</li>
                    </ul>
                </div>
            </details>

            <div class="presentation-callout">
                <strong>Premier lancement</strong>
                <div>
                    <p>Cette version bêta n'est pas encore signée. <b>Sur Mac</b>, si l'ouverture est bloquée : Réglages Système → Confidentialité et sécurité → « Ouvrir quand même ». <b>Sur Windows</b>, à l'écran « Windows a protégé votre ordinateur » : « Informations complémentaires » → « Exécuter quand même ».</p>
                    <p>Pour vérifier qu'un fichier n'a pas été modifié, comparez son empreinte avec la liste <a href="download/SHA256SUMS.txt">SHA256SUMS.txt</a>.</p>
                </div>
            </div>
        </section>

        <section class="presentation-section" id="fonctionnalites">
            <header class="presentation-section-head">
                <span class="eyebrow">02 — DANS LE CARNET</span>
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
                    <p>Les personnes, événements et recherches sont stockés dans une base SQLite locale sur votre ordinateur : pas besoin d’internet.</p>
                </article>
            </div>
        </section>

        <section class="presentation-section" id="apercu">
            <header class="presentation-section-head">
                <span class="eyebrow">03 — APERÇU</span>
                <h2>Le carnet en images.</h2>
                <p>Quelques écrans du logiciel. Utilisez les flèches, les touches ← → du clavier, ou faites glisser l’image.</p>
            </header>
            <div class="presentation-carousel" aria-roledescription="carrousel" aria-label="Captures d’écran du logiciel">
                <div class="presentation-carousel-track" tabindex="0">
                <figure class="presentation-slide" id="apercu-1" aria-roledescription="diapositive" aria-label="1 sur 11">
                    <img src="captures/lcnda-01.jpg" alt="Fiche individuelle d’une personne : identité, parents, conjoints, enfants et événements" width="1600" height="1034" loading="eager">
                    <figcaption><span>01</span>La fiche d’une personne : identité, famille et événements</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-2" aria-roledescription="diapositive" aria-label="2 sur 11">
                    <img src="captures/lcnda-02.jpg" alt="Bas d’une fiche : médias, recensements, notes, sources et références externes" width="1600" height="1034" loading="lazy">
                    <figcaption><span>02</span>Médias, recensements, sources et références d’une fiche</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-3" aria-roledescription="diapositive" aria-label="3 sur 11">
                    <img src="captures/lcnda-03.jpg" alt="Graphique d’arbre des descendants" width="1600" height="1034" loading="lazy">
                    <figcaption><span>03</span>Arbres et diagrammes : ici, les descendants</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-4" aria-roledescription="diapositive" aria-label="4 sur 11">
                    <img src="captures/lcnda-04.jpg" alt="Statistiques : prénoms les plus fréquents de la base" width="1600" height="1034" loading="lazy">
                    <figcaption><span>04</span>Statistiques : distribution des prénoms</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-5" aria-roledescription="diapositive" aria-label="5 sur 11">
                    <img src="captures/lcnda-05.jpg" alt="Carte des lieux des événements" width="1600" height="1034" loading="lazy">
                    <figcaption><span>05</span>Carte de tous les événements</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-6" aria-roledescription="diapositive" aria-label="6 sur 11">
                    <img src="captures/lcnda-06.jpg" alt="Liste dynamique des personnes avec naissance, décès et statut" width="1600" height="1034" loading="lazy">
                    <figcaption><span>06</span>Listes dynamiques : personnes à vérifier</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-7" aria-roledescription="diapositive" aria-label="7 sur 11">
                    <img src="captures/lcnda-07.jpg" alt="Liste des rappels avec échéances" width="1600" height="1034" loading="lazy">
                    <figcaption><span>07</span>Rappels de recherche</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-8" aria-roledescription="diapositive" aria-label="8 sur 11">
                    <img src="captures/lcnda-08.jpg" alt="Liste des signatures relevées" width="1600" height="1034" loading="lazy">
                    <figcaption><span>08</span>Signatures relevées dans les actes</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-9" aria-roledescription="diapositive" aria-label="9 sur 11">
                    <img src="captures/lcnda-09.jpg" alt="Recherche des personnes présentes autour d’une commune entre deux dates" width="1600" height="1034" loading="lazy">
                    <figcaption><span>09</span>Recherche par proximité géographique et dans le temps</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-10" aria-roledescription="diapositive" aria-label="10 sur 11">
                    <img src="captures/lcnda-10.jpg" alt="Carte d’une battue avec les communes voisines colorées par niveau" width="1600" height="1034" loading="lazy">
                    <figcaption><span>10</span>Battue : les communes voisines, niveau par niveau</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-11" aria-roledescription="diapositive" aria-label="11 sur 11">
                    <img src="captures/lcnda-11.jpg" alt="Réglages de personnalisation de l’apparence" width="1600" height="1034" loading="lazy">
                    <figcaption><span>11</span>Apparence : couleurs, polices, ordre des menus</figcaption>
                </figure>
                </div>
                <div class="presentation-carousel-controls">
                    <button class="button secondary" type="button" data-carousel-prev aria-label="Image précédente">←</button>
                    <div class="presentation-carousel-dots" role="group" aria-label="Choisir une image"></div>
                    <button class="button secondary" type="button" data-carousel-next aria-label="Image suivante">→</button>
                </div>
            </div>
        </section>

        <section class="presentation-section" id="en-detail">
            <header class="presentation-section-head">
                <span class="eyebrow">04 — EN DÉTAIL</span>
                <h2>Chaque généalogie est unique, votre logiciel aussi.</h2>
            </header>
            <p class="presentation-intro"><strong>LCNDA est un logiciel de généalogie modulable et personnalisable, parce que chaque généalogie est unique.</strong> Menus, fiches, tableau de bord, types d’événements, couleurs : vous l’organisez selon votre famille et votre façon de chercher, pas l’inverse. Disponible sur Mac, Windows et Linux, il rassemble au même endroit vos ancêtres, leurs actes, leurs photos, vos sources et vos recherches en cours. Il fonctionne sans internet et sans compte : votre généalogie reste sur votre ordinateur, dans un fichier qui vous appartient. Gratuit et open source, il importe directement vos données Hérédis, MacFamilyTree ou GEDCOM.</p>

            <div class="presentation-about-grid">
                <article class="presentation-about about-key">
                    <h3>Un logiciel qui s’adapte à votre famille</h3>
                    <p>Une famille d’artistes, de marins ou de paysans, une lignée suivie sur trois siècles ou une enquête sur un seul ancêtre ne se racontent pas de la même façon. Vous choisissez l’ordre des menus, les blocs affichés sur chaque fiche et leur largeur, les rubriques du tableau de bord, les listes, les cartes et les graphiques utiles. Vous créez vos propres types d’événements, avec leurs champs, et vous réglez couleurs, polices et affichage. Vos réglages sont enregistrés avec votre généalogie et la suivent d’un ordinateur à l’autre.</p>
                </article>
                <article class="presentation-about">
                    <h3>Un carnet de recherche, pas seulement un arbre</h3>
                    <p>La plupart des logiciels de généalogie servent à enregistrer une famille. LCNDA sert aussi à la chercher :</p>
                    <ul><li>des enquêtes avec leurs pistes, hypothèses et preuves ;</li><li>des battues pour fouiller les communes voisines, niveau par niveau, sur une carte ;</li><li>la planification de vos visites aux archives ;</li><li>des rappels, un budget de recherche et le suivi de vos courriers.</li></ul>
                </article>
                <article class="presentation-about">
                    <h3>Tout ce qu’il faut pour construire une famille</h3>
                    <ul><li>Fiches complètes : identité, variantes de nom, parents, conjoints, enfants, adoptions, témoins, parrains et marraines.</li><li>Plus de 60 types d’événements, et les vôtres si besoin.</li><li>Arbres d’ascendants et de descendants, éventails, numérotation Sosa et d’Aboville.</li><li>Recensements, signatures relevées dans les actes, niveau de confiance pour chaque fait.</li></ul>
                </article>
                <article class="presentation-about">
                    <h3>Vos documents au cœur des fiches</h3>
                    <p>Photos, actes, PDF, sons et vidéos se rattachent aux personnes, aux événements, aux enquêtes ou aux battues. Les sources et les citations accompagnent chaque information, pour savoir toujours d’où elle vient.</p>
                </article>
                <article class="presentation-about">
                    <h3>Les lieux du monde entier, même hors ligne</h3>
                    <p>Toutes les communes de France, avec leurs contours, leurs voisines et les anciennes communes fusionnées, et plus de 5 millions de localités dans le monde. En tapant un nom de lieu, vous obtenez des suggestions et les coordonnées GPS, sans connexion. Un lieu introuvable peut toujours être saisi librement.</p>
                </article>
                <article class="presentation-about">
                    <h3>Voir sa famille autrement</h3>
                    <p>Cartes des naissances, des mariages et des migrations, chronologies, statistiques sur les prénoms, les métiers, les âges au décès… pour repérer d’un coup d’œil ce que les listes ne montrent pas.</p>
                </article>
                <article class="presentation-about">
                    <h3>Une base propre et vérifiée</h3>
                    <p>Un assistant repère les incohérences : enfant né après la mort d’un parent, mariage après un décès, longévité improbable. Il signale aussi les doublons possibles et les familles incomplètes. Un journal garde la trace de chaque modification, et une suppression peut être annulée.</p>
                </article>
                <article class="presentation-about about-key">
                    <h3>Arrivez avec vos données, repartez quand vous voulez</h3>
                    <ul><li>Import direct des fichiers Hérédis et MacFamilyTree, sans passer par un export : photos, sources et tâches comprises.</li><li>Import et export GEDCOM (5.5.1 et 7), le format d’échange commun à tous les logiciels de généalogie.</li><li>Sauvegarde complète en un seul fichier, avec la base et tous les médias, à garder en lieu sûr ou à ouvrir sur un autre ordinateur.</li></ul>
                </article>
            </div>

            <div class="presentation-strengths" aria-label="Les atouts de LCNDA">
                <div><strong>Modulable et personnalisable</strong><span>L’interface s’organise selon votre généalogie, pas l’inverse.</span></div>
                <div><strong>Gratuit et libre</strong><span>Licence AGPL-3.0 : pas d’abonnement, pas de version payante, code source ouvert.</span></div>
                <div><strong>Vos données restent chez vous</strong><span>Aucun compte, aucun envoi sur internet, un fichier SQLite lisible par d’autres outils.</span></div>
                <div><strong>Fonctionne hors ligne</strong><span>Communes de France et lieux du monde compris.</span></div>
                <div><strong>Mac, Windows et Linux</strong><span>La même application partout.</span></div>
                <div><strong>Pensé pour la recherche</strong><span>Pas seulement pour la saisie.</span></div>
                <div><strong>Arrivée facile</strong><span>Depuis Hérédis, MacFamilyTree ou n’importe quel logiciel compatible GEDCOM.</span></div>
            </div>
            <p class="presentation-beta-note">LCNDA est en version bêta : faites des sauvegardes régulières, ce que l’application facilite. Il n’est pas encore signé par Apple ni Microsoft, d’où un avertissement au premier lancement.</p>
        </section>
    </main>

    <footer class="presentation-footer">
        <span>LCNDA — LE CARNET NUMÉRIQUE DES ANCÊTRES · VERSION BÊTA · 0.2.1 · LICENCE AGPL-3.0</span>
        <a href="#haut">Retour en haut ↑</a>
    </footer>
    <script>
    // Carrousel de l'aperçu : il ne défile jamais tout seul (flèches, points, clavier, glissement au doigt).
    (() => {
        const track = document.querySelector('.presentation-carousel-track');
        if (!track) return;
        const slides = [...track.querySelectorAll('.presentation-slide')];
        const prev = document.querySelector('[data-carousel-prev]');
        const next = document.querySelector('[data-carousel-next]');
        const dotsBox = document.querySelector('.presentation-carousel-dots');
        const dots = slides.map((_, i) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('aria-label', 'Image ' + (i + 1));
            dot.addEventListener('click', () => go(i));
            dotsBox.appendChild(dot);
            return dot;
        });
        const current = () => Math.round(track.scrollLeft / track.clientWidth);
        const go = (i) => track.scrollTo({ left: Math.max(0, Math.min(slides.length - 1, i)) * track.clientWidth });
        const refresh = () => {
            const i = current();
            dots.forEach((dot, k) => dot.setAttribute('aria-current', k === i ? 'true' : 'false'));
            prev.disabled = i <= 0;
            next.disabled = i >= slides.length - 1;
        };
        prev.addEventListener('click', () => go(current() - 1));
        next.addEventListener('click', () => go(current() + 1));
        track.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
        });
        track.addEventListener('scroll', () => window.requestAnimationFrame(refresh), { passive: true });
        window.addEventListener('resize', refresh);
        refresh();
    })();
    </script>
</body>
</html>
