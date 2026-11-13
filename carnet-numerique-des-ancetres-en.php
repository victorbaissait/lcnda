<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="The Digital Ancestors' Notebook (LCNDA): a local app to organise, document and pass on a family history.">
    <meta name="color-scheme" content="light">
    <title>LCNDA — The Digital Ancestors' Notebook</title>
    <link rel="alternate" hreflang="fr" href="carnet-numerique-des-ancetres.php">
    <link rel="alternate" hreflang="en" href="carnet-numerique-des-ancetres-en.php">
    <link rel="alternate" hreflang="x-default" href="carnet-numerique-des-ancetres.php">
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
        .presentation-changes-body p { margin:0; }
        .presentation-changes-old { margin-top:12px; }
        .presentation-version { margin-top:14px; border:1px solid #d7d7d7; }
        .presentation-version summary { padding:12px 16px; font-size:16px; cursor:pointer; list-style:none; font-weight:800; }
        .presentation-version summary::-webkit-details-marker { display:none; }
        .presentation-version summary::after { content:"+"; float:right; font-weight:800; }
        .presentation-version[open] summary::after { content:"−"; }
        .presentation-version summary small { display:block; color:var(--presentation-muted); font-size:13px; font-weight:700; }
        .presentation-version-body { padding:0 16px 14px; }
        .presentation-callout { display:grid; grid-template-columns:200px 1fr; gap:18px; margin-top:22px; padding:19px 22px; border:2px solid var(--presentation-ink); background:#fff5d6; box-shadow:5px 5px 0 rgba(8,8,8,.14); font-size:14px; line-height:1.5; }
        .presentation-callout p { margin:0; }
        .presentation-callout p + p { margin-top:8px; }
        .presentation-callout a { color:var(--presentation-blue); font-weight:800; text-decoration:underline; text-underline-offset:3px; }

        /* ─── Découvrir (texte de présentation) ─── */
        .presentation-intro { max-width:980px; margin:30px 0 0; font-size:clamp(19px,2vw,26px); line-height:1.38; font-weight:600; }
        .presentation-intro strong { color:var(--presentation-blue); }
        .presentation-about-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; margin-top:48px; }
        .presentation-about { padding:24px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:6px 6px 0 rgba(5,93,255,.21); }
        .presentation-about.about-intro { grid-column:1 / -1; }
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

        /* ─── FAQ ─── */
        /* Cadre de la FAQ, dans la page */
        .presentation-faq-box { margin-top:44px; padding:clamp(22px,3.5vw,44px); border:2px solid var(--presentation-ink); background:#fff; box-shadow:10px 10px 0 rgba(5,93,255,.21); }
        .presentation-faq-box > h3 { margin:0 0 18px; font-size:clamp(22px,2.6vw,30px); letter-spacing:-.03em; }
        .presentation-faq-hint { margin:12px 0 0; color:var(--presentation-muted); font-size:16px; font-weight:600; }
        .presentation-faq-search { display:block; width:100%; max-width:760px; margin-top:0; padding:14px 16px; border:2px solid var(--presentation-ink); background:#fff; box-shadow:4px 4px 0 rgba(5,93,255,.25); font:600 16px Arial,Helvetica,sans-serif; color:var(--presentation-ink); }
        .presentation-faq-search:focus-visible { outline:3px solid var(--presentation-blue); outline-offset:3px; }
        .presentation-faq-cat { margin-top:28px; }
        .presentation-faq-cat h3 { margin:0 0 8px; padding-bottom:8px; border-bottom:1px solid #d7d7d7; font-size:20px; letter-spacing:-.02em; }
        .presentation-faq-cat h3 small { margin-left:8px; color:var(--presentation-blue); font-size:12px; font-weight:900; letter-spacing:.1em; }
        .presentation-faq-item { border-bottom:1px solid #e3e3e3; background:#fff; }
        .presentation-faq-item summary { display:flex; align-items:baseline; gap:10px; padding:12px 0; cursor:pointer; list-style:none; font-size:17px; font-weight:800; line-height:1.3; }
        .presentation-faq-item summary:hover { color:var(--presentation-blue); }
        .presentation-faq-item summary::-webkit-details-marker { display:none; }
        .presentation-faq-item summary::before { content:"▶"; display:inline-block; flex:none; font-size:12px; transition:transform .15s ease; }
        .presentation-faq-item[open] summary::before { transform:rotate(90deg); }
        .presentation-faq-item p { max-width:900px; margin:0; padding:0 0 16px 22px; color:#3f3f3f; font-weight:600; line-height:1.55; }
        .presentation-faq-empty { margin-top:30px; color:var(--presentation-muted); font-weight:700; }

        .presentation-footer { display:flex; justify-content:space-between; gap:20px; padding:21px clamp(24px,4vw,64px); border-top:2px solid var(--presentation-ink); background:#fff; font-size:11px; letter-spacing:.08em; font-weight:900; }
        .presentation-footer a { color:var(--presentation-blue); }

        @media (max-width:1100px) { .presentation-downloads { grid-template-columns:1fr 1fr; } .presentation-os-linux { grid-column:1 / -1; } .presentation-os-linux .presentation-os-groups { display:grid; grid-template-columns:1fr 1fr; gap:14px; } }
        @media (max-width:900px) { .presentation-hero { grid-template-columns:1fr; min-height:0; } .presentation-hero-board { max-width:590px; } .presentation-feature-grid { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:640px) { .presentation-downloads, .presentation-os-linux .presentation-os-groups { grid-template-columns:1fr; } .presentation-os-linux { grid-column:auto; } .presentation-callout { grid-template-columns:1fr; gap:7px; } }
        @media (max-width:580px) { .presentation-lead { font-size:17px; } .presentation-hero-board { min-height:340px; } .presentation-note { width:68%; padding:13px; } .presentation-note strong { font-size:15px; } .note-white { top:132px; } .note-black { left:35px; } .presentation-feature-grid { grid-template-columns:1fr; } .presentation-feature { min-height:0; } .presentation-footer { flex-direction:column; } }
        /* ─── Choix de la langue (FR · EN) et bandeau « aussi en anglais » ─── */
        .presentation-hero { position:relative; }
        .presentation-lang { position:absolute; top:clamp(12px,2vw,24px); right:clamp(24px,7vw,108px); z-index:3; font-size:12px; font-weight:900; letter-spacing:.14em; color:var(--presentation-muted); }
        .presentation-lang a { color:var(--presentation-blue); text-decoration:underline; text-underline-offset:3px; }
        .presentation-lang strong { color:var(--presentation-ink); }
        .presentation-lang-banner { display:flex; align-items:center; justify-content:center; gap:14px; padding:10px clamp(24px,4vw,64px); border-bottom:2px solid var(--presentation-ink); background:#dbeaff; font-size:14px; font-weight:700; }
        .presentation-lang-banner[hidden] { display:none; }
        .presentation-lang-banner a { color:var(--presentation-blue); text-decoration:underline; text-underline-offset:3px; }
        .presentation-lang-banner button { flex:none; display:grid; place-items:center; width:28px; height:28px; padding:0; border:2px solid var(--presentation-ink); background:#fff; color:var(--presentation-ink); font:900 16px/1 Arial,Helvetica,sans-serif; cursor:pointer; }
    </style>
</head>
<body class="presentation-body">
    <main id="haut">
        <section class="presentation-hero">
            <nav class="presentation-lang" aria-label="Language"><a href="carnet-numerique-des-ancetres.php" hreflang="fr" lang="fr" title="Version française">FR</a> · <strong aria-current="page">EN</strong></nav>
            <div class="presentation-hero-copy">
                <span class="eyebrow">BETA VERSION · 0.9.2</span>
                <p class="presentation-acronym" aria-hidden="true">LCNDA</p>
                <h1>The Digital<br>Ancestors' Notebook</h1>
                <p class="presentation-lead">A local, open-source, free and flexible genealogy app for working on your family history — and also for your inventories and for tracking your animals. Conceived and designed by Victor Baissait, coded by Codex (ChatGPT) &amp; Claude.</p>
                <div class="presentation-actions">
                    <a class="button" href="#telecharger">Download LCNDA<span aria-hidden="true">↓</span></a>
                    <a class="button secondary" href="#fonctionnalites">Features</a>
                    <a class="button secondary" href="#faq">FAQ</a>
                </div>
            </div>
            <div class="presentation-hero-board" aria-label="Overview of what the app brings together">
                <article class="presentation-note note-blue"><span>01</span><strong>PEOPLE</strong><small>Records, family links and life milestones</small></article>
                <article class="presentation-note note-white"><span>02</span><strong>ARCHIVES</strong><small>Records, media, collections and transcriptions</small></article>
                <article class="presentation-note note-black"><span>03</span><strong>INVESTIGATIONS</strong><small>Leads, hypotheses, search sweeps and evidence</small></article>
                <div class="presentation-thread thread-one" aria-hidden="true"></div>
                <div class="presentation-thread thread-two" aria-hidden="true"></div>
            </div>
        </section>

        <section class="presentation-section" id="telecharger">
            <header class="presentation-section-head">
                <span class="eyebrow">01 — DOWNLOAD</span>
                <h2>Install LCNDA on your computer.</h2>
                <p>Free, no account and no internet needed: your data stays with you. Choose your system.</p>
            </header>
            <div class="presentation-downloads">
                <article class="presentation-os">
                    <h3>macOS</h3>
                    <p class="presentation-os-req">macOS 13 Ventura or later</p>
                    <div class="presentation-os-group">
                        <a class="button" href="download/LCNDA-0.9.2-mac-arm64.dmg"><span>Mac Apple Silicon<small>M1, M2, M3, M4… · 590 MB</small></span><span aria-hidden="true">↓</span></a>
                        <a class="button secondary" href="download/LCNDA-0.9.2-mac-x64.dmg"><span>Mac Intel<small>2017 models and later · 596 MB</small></span><span aria-hidden="true">↓</span></a>
                    </div>
                    <p class="presentation-os-help">Which Mac do you have? Apple menu → About This Mac → “Chip” (Apple Silicon) or “Processor” (Intel). Open the .dmg file and drag LCNDA into Applications.</p>
                </article>

                <article class="presentation-os">
                    <h3>Windows</h3>
                    <p class="presentation-os-req">Windows 10 / 11 (64-bit) — Intel or AMD PCs, and Windows 11 on ARM processors</p>
                    <div class="presentation-os-group">
                        <a class="button" href="download/LCNDA-0.9.2-windows-x64.exe"><span>Windows 10 / 11<small>64-bit · 596 MB</small></span><span aria-hidden="true">↓</span></a>
                    </div>
                    <p class="presentation-os-help">Run the file and follow the installer. The required Microsoft Visual C++ component is installed automatically if it is missing.</p>
                </article>

                <article class="presentation-os presentation-os-linux">
                    <h3>Linux</h3>
                    <p class="presentation-os-req">A recent 64-bit distribution (Ubuntu 22.04, Debian 12, Fedora 38 or later)</p>
                    <div class="presentation-os-groups">
                        <div class="presentation-os-group">
                            <strong>Intel or AMD PC</strong>
                            <a class="button" href="download/LCNDA-0.9.2-linux-x86_64.AppImage"><span>AppImage<small>All distributions · 586 MB</small></span><span aria-hidden="true">↓</span></a>
                            <a class="button secondary" href="download/LCNDA-0.9.2-linux-amd64.deb"><span>.deb package<small>Ubuntu, Debian, Mint · 546 MB</small></span><span aria-hidden="true">↓</span></a>
                        </div>
                        <div class="presentation-os-group">
                            <strong>ARM processor (Raspberry Pi…)</strong>
                            <a class="button" href="download/LCNDA-0.9.2-linux-arm64.AppImage"><span>ARM AppImage<small>All distributions · 588 MB</small></span><span aria-hidden="true">↓</span></a>
                            <a class="button secondary" href="download/LCNDA-0.9.2-linux-arm64.deb"><span>ARM .deb package<small>Raspberry Pi OS, Ubuntu, Debian · 542 MB</small></span><span aria-hidden="true">↓</span></a>
                        </div>
                    </div>
                    <p class="presentation-os-help">Use the .deb on Ubuntu or Debian (<code>sudo apt install ./LCNDA-0.9.2-linux-amd64.deb</code>), otherwise the AppImage: make it executable (right-click → Properties → Allow executing as program), then double-click it.</p>
                </article>
            </div>

            <article class="presentation-os presentation-os-source">
                <div>
                    <h3>Source code</h3>
                    <p class="presentation-os-req">For developers: LCNDA is free software (AGPL-3.0 licence)</p>
                    <p class="presentation-os-help">The complete code of version 0.9.2, including the municipalities of the 226 countries used by search sweeps (hence its size). The worldwide gazetteer of places is not included because it is too large: it builds itself on first launch (or with <code>npm run fetch:geo</code>).</p>
                </div>
                <div class="presentation-os-group">
                    <a class="button" href="download/lcnda-0.9.2.zip"><span>.zip archive<small>Windows, macOS · 270 MB</small></span><span aria-hidden="true">↓</span></a>
                    <a class="button secondary" href="download/lcnda-0.9.2.tar.gz"><span>.tar.gz archive<small>Linux, macOS · 269 MB</small></span><span aria-hidden="true">↓</span></a>
                </div>
            </article>

            <details class="presentation-changes">
                <summary><span>What's new in version 0.9.2<small>The app in 32 languages, guided first launch with a sample database, online archives in one place, evidence and strength of links, new tools, imports and exports, maps and diagrams, games</small></span></summary>
                <div class="presentation-changes-body">
                    <h4>🌐 The app in 32 languages</h4>
                    <p>Français, English, Español, Deutsch, Italiano, Português, Polski, Nederlands, Čeština, Svenska, Dansk, Slovenčina, Norsk (bokmål), Română, Suomi, Magyar, Hrvatski, Slovenščina, Lietuvių, Latviešu, Eesti, Íslenska, Türkçe, Lëtzebuergesch, Shqip, Malti, Tiếng Việt, Bahasa Indonesia, Русский, Українська, Ελληνικά, Български. The whole app is translated (menus, records, tools, Settings, games, editors), as are the 806 answers in the FAQ. The first time, the app opens in your computer's language (otherwise in English), with two buttons, “Français” / “English”. The translations are made by an AI: a banner says so, with “Report a mistake”. Your data (names, notes, places) is never translated.</p>
                    <h4>🧭 First launch and guided tour</h4>
                    <p>Choose what you'll use the app for (the useful tabs appear), import your file, start from an empty database or from a sample database (an imaginary family over 5 generations, with nobody living). A 6-step guided tour introduces the app.</p>
                    <h4>🔍 Online archives in one place</h4>
                    <p>A single “Search the online archives” window for 132 sites (Mémoire des hommes, Léonore, military registers, newspapers, Archives nationales, Antenati, FreeBMD, FamilySearch, Yad Vashem…), sorted by country and by topic, with “Free only”. The import asks “is this the same person?”, overwrites nothing and can be undone. SocFace censuses, with automatic-reading errors flagged.</p>
                    <h4>⚖️ Evidence and strength of links</h4>
                    <p>Proof file (clues for and against, conflicts, conclusion), strength of every parent–child link (proven, probable, assumed, unsourced, disproved) with a badge on the record, a “Strength view” in the trees and a “Fragile branches” list. Help reading records in 29 languages, and line-by-line reading of handwritten records (guided installation).</p>
                    <h4>🧰 New tools</h4>
                    <p>Where to look?, Brick walls, My research week, Inheritances and estates, Cousins' reunion, Passing on of first names, Your family and French history, A day in the life of…, Occupation tree, Life map, Ready-made letters, automatic backup, and two computers working on a shared folder.</p>
                    <h4>⤒ Imports and exports</h4>
                    <p>Gramps, GeneWeb, GEDCOM-X, Ancestry GEDCOM, MyHeritage, Généatique, FTM, RootsMagic and 11 other programs, Nimègue transcriptions, DNA exports from 5 companies, Google Photos and Apple Photos. Exports for Geneanet, Gramps, GedZip with photos, Obsidian, calendar, contacts and maps (KML, GeoJSON).</p>
                    <h4>📊 Diagrams and maps</h4>
                    <p>12 more diagrams (relationship path, completeness, ahnentafel, Leeds matrix…) and “⚙️ Customise” for all of them. Maps: compare two periods, former municipal boundaries (official INSEE files shipped with the app), surnames, DNA cousins, journeys of the past, 3D relief, large map to print.</p>
                    <h4>🎲 Games, video editing and the rest</h4>
                    <p>Chess, draughts, dominoes, Yahtzee, 8 card games against the computer (belote, tarot, rummy…) and 131 solitaire games. Video editing: volume over time, compressor, reverb, panning, rich text. The app checks for new versions; a 🐞 “Report a bug” button sends a report without any genealogy data. Large databases (up to 100,000 people) stay smooth.</p>
                    <p>The database updates itself the first time you open it: nothing to do.</p>
                </div>
            </details>

            <details class="presentation-changes presentation-changes-old">
                <summary><span>What was new in earlier versions<small>What the previous versions brought</small></span></summary>
                <div class="presentation-changes-body">
                    <details class="presentation-version">
                        <summary>Version 0.9.1 <small>The same bar above every list, a single “Print” window and a single “Versions” window, search in Settings, a much richer bunker, more readable colours, lots of fixes</small></summary>
                        <div class="presentation-version-body">
                    <h4>🔍 The same bar above every list</h4>
                    <p>More than forty more lists now have the shared bar: 🔍 Search · Filter ▾ · List | Cards · Sort (family papers, passports, coats of arms, heirlooms and family memory, old occupations, precise places, villages, parishes, old maps, field trips, WWI soldiers, Resistance members, departures, children in care, genealogy fairs, help requests, archive visits, censuses, Treasures, gazettes, My lists…). The old small buttons (“To do / Done”, “All / Domestic / Abroad”…) move into Filter, with the number found next to each choice; active filters show as blue chips you remove with one click. Each list remembers its search, filters, sort order and display; the maps above a list follow the filters. Both calendars have 🔍 and Filter. <b>My lists</b> gains “⤓ Export ▾” (CSV, spreadsheet, Excel), “🖨 Print” and “More ▾” for its other layouts. A sealed letter is never searched.</p>
                    <h4>🖨 One window for printing, one for versions</h4>
                    <p>Every tool prints through the same window: preview on the right, A4 / A5, portrait or landscape, what to print, pages and copies, then “⤓ PDF” or “🖨 Print” (⌘P opens it). A single “🕘 Versions” window in the word processor, the website, photo retouching, sound, video editing and the boards: named or automatic versions, preview, comparison of two versions, “↺ Go back to this version” without losing anything.</p>
                    <h4>⚙️ Easier Settings</h4>
                    <p>A 🔍 box to search within a Settings page (“/” key): only the matching settings remain, with letters highlighted. An icon grid with search as soon as a choice has more than 12 icons. Settings previews now show exactly what you will see afterwards. A ⚠️ warning appears under “Main colour” when it is hard to read on the chosen background, with “Use the theme colour”. No more “Are you sure?” for eight actions that can be undone: the item is removed, and “↶ Undo” puts it back.</p>
                    <h4>☢ A much richer bunker</h4>
                    <p>Achievements and records, historical scenarios with your ancestors, ⏪ go back to the previous morning, dozens more items to craft (carts, bags, transport), expeditions into the region, groups of survivors, buildings to restore, apprentices, relationships between inhabitants, memories of the ancestors (optional). Speeds ×8, ×16 and ×32. After victory, the game goes on endlessly.</p>
                    <h4>📄 New tabs</h4>
                    <p>“📄 Documents” and “🎨 Catalogue raisonné” (hidden at first, to show in Settings). Words on the record agree with the person's gender (as in French “Décédé” for a man, “Décédée” for a woman). The spreadsheet has the bottom bar and the tool column of the other editors.</p>
                    <h4>🎨 More readable colours</h4>
                    <p>Statistics figures readable in light and dark mode, first-name clouds readable in dark mode, blue button text readable in the “Dark” theme, text in trees, the map and games fixed in dark mode. The “Sosa” and “Deceased” badges in the header preview are the same as on the record.</p>
                    <h4>🐞 Bugs fixed</h4>
                    <p>A long review, and a “user who does anything at all” test: a damaged address no longer crashes the app; screens no longer open with an error when the computer is slow; “↶ Undo” no longer gets lost in Settings; an absurd text size coming from an imported file is no longer accepted; damaged settings no longer crash pages; Battleship and Cables find the ancestors' names again; a window left on another family tree no longer shows people from this one; GedZip, Hérédis and MacFamilyTree archives received from elsewhere are checked more thoroughly; double frame around the Settings search and many small display glitches.</p>
                    <p>The database updates itself the first time you open it (a few indexes and one extra column): nothing to do.</p>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.9.0 <small>Family treasures, 108 solitaire games and two new games, page backgrounds, reorganised settings, gazette, embroidery, birth sky, soundscape, many fixes</small></summary>
                        <div class="presentation-version-body">
                    <h4>✨ Family treasures</h4>
                    <p>A new tab (hidden at first): 💌 letters to descendants sealed until a given date, 🎂 “At your age…”, 📷 date a photo, 🃏 Happy Families card game (photos and 6 styles), 🖍 colouring tree, memories of the senses, recipes and songs (stored in Family memory), 🌌 birth sky calculated for the place and date, 🕯 candle, 🎧 period soundscape (36 layers, 25 atmospheres, timer), 🗺 treasure hunt, mystery ancestor of the day, choose-your-own-adventure book, coincidences, “What if…”, 🧵 cross-stitch embroidery, laser engraving, portrait mosaic, 📰 gazette of the year (8 styles), wallpaper, 🛂 internal passports, grandparent tells the story, secure temporary sharing. 13 widgets and lists to find them again.</p>
                    <h4>🎲 Games</h4>
                    <p>🂠 <b>Solitaire</b>: 108 card games played alone (Klondike, FreeCell, Spider, Yukon, Canfield, Pyramid, Golf, La Belle Lucie, Forty Thieves, Napoleon at St Helena, Trigon, Somerset…), with the mouse or the keyboard, with ↶ undo, 💡 a possible move, timer and record. ⚓ <b>Battleship</b> (against the computer or two players, ships named after ancestors) and 🔌 <b>Cables</b>, Netwalk-style.</p>
                    <h4>🧩 Page backgrounds</h4>
                    <p>15 backgrounds to choose from behind the blocks (small squares, plain, dots, lined notebook, graph paper, paper grain, canvas, gradient, register, laid paper, watermark tree, old maps, terracotta tiles, halo, your blurred photo), with pattern size, intensity and colour, the pages concerned and a live preview. Never printed.</p>
                    <h4>🎨 Reorganised settings</h4>
                    <p>“Designs to choose from” disappears: the record style goes with the header shape, the left column has its own lines, corners and shadows, motion moves to Accessibility (🎞 Motion tab), and text size is gathered in Theme and colours (up to 32 px). Menus, column and lists gains the Column, Lists, Icons and Density tabs. Buttons in 8 sizes. You come back exactly where you were in Settings. 💾 “The whole app” also keeps Reorder, the Treasures and the editors, and really resets everything to how it was.</p>
                    <h4>📊 Diagrams and dashboard</h4>
                    <p>Hourglass, Gantt, mind map, radial bars, bubbles and progress rings filled with your tree's figures. The 🧩 widget library opens from the dashboard; charts can be reordered in Charts.</p>
                    <h4>🥚 A secret</h4>
                    <p>Something is hidden in the archive room…</p>
                    <h4>🐞 Bugs fixed</h4>
                    <p>Settings that clashed with each other (simple mode and view-only mode, messages covering the bottom bar, display name saved twice), the grain of the “Old paper” style, live previews of lines and shadows, frames and buttons stuck together, double frame in a search, 3 aces lost at the start of six solitaire games.</p>
                    <p>A small table is added to the database automatically for the Treasures, the first time you use them: nothing to do.</p>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.8.2 <small>Spreadsheet (solver, scenarios, recorded actions), video editing (colour wheels, green screen, tracking, multiple cameras, standard loudness), PDF/A and fold-up booklet, retouching (Liquify, magic eraser, PSD), drawing (dimensions, perspective)</small></summary>
                        <div class="presentation-version-body">
                            <h4>🧾 Spreadsheet</h4>
                            <p>✨ Flash fill (one example is enough), Σ subtotals with ⊟ outline that collapses the detail, 📈 sparklines in cells, 🎯 goal seek, 🧮 solver (several cells, constraints, whole numbers), 📋 scenario table (“what if…”), ⏺ recorded actions to replay in one click, and the LET and LAMBDA formulas.</p>
                            <h4>🎞️ Presentation</h4>
                            <p>↔ Connectors attached to two objects, ⊕ shape merging (union, subtract, intersect), 🗂 slide master with page number, 〰 animation motion paths.</p>
                            <h4>📝 Word processor</h4>
                            <p>🔁 Offline thesaurus, 🔎 proofreading (spaces before “; : ! ?”, French « » quotation marks, ellipses, apostrophes, repeated words, capitals) and ♿ accessibility check (images without a description, headings, tables, links).</p>
                            <h4>🎬 Video editing</h4>
                            <p>🎨 Colour wheels, 🎯 vectorscope and histogram, 📢 standard loudness on export (LUFS), 🟩 green screen, 🎯 a title or overlay that follows a moving subject, 🎥 multiple cameras synced by sound and edited by switching from one to another.</p>
                            <h4>📐 Layout</h4>
                            <p>🗄️ PDF/A export for archiving and 📖 fold-up booklet (pages put back in printing order, to staple in the middle).</p>
                            <h4>🎚️ Retouching</h4>
                            <p>💧 Liquify (push, bloat, pucker, twirl), 🪄 magic eraser (the background of a scanned document made transparent), ✨ refine a mask edge (hair, outlines), 🗂 PSD with its layers, to import and export.</p>
                            <h4>✏️ Vector drawing</h4>
                            <p>📏 Dimension tool (length written in cm, mm or inches), 📐 perspective grid with 1 or 2 vanishing points, 〰 variable stroke width (tapered, pen, brush) and ⧉ blending of two shapes.</p>
                            <p>The database structure does not change: no database update the first time you open it.</p>

                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.8.1 <small>The house like an architect's plan (DXF, repeat, arrow labels, title block), 145 more pieces of furniture and appliances, website with a real code editor, pivot table and mail merge, clearer settings, shortcuts at the top right</small></summary>
                        <div class="presentation-version-body">
                            <h4>🏠 The house, like an architect's plan</h4>
                            <p>⤒ import a <b>DXF</b> plan (AutoCAD, LibreCAD, an architect's or notary's plan) and ⤓ export yours as DXF, organised in layers (walls, rooms, openings, furniture, text, dimensions). <b>🔁 Repeat</b> places several copies at once: 6 chairs around a table (facing it), a row, a grid, or a row of windows along a wall. <b>🏷 Arrow labels</b>: a note linked to a point on the plan, such as “The well was here” or “Double glazing fitted in 1978”. In the floor's “View”: overall dimensions, a table of rooms and their areas placed on the plan, a title block (name, place, period, floor, date) and a dark technical-drawing display.</p>
                            <h4>🛋️ Furniture</h4>
                            <p>145 more items in Appliances, Office, Garage and Lighting (washing machine, hobs, cooker hoods, wall-mounted TV, valve radio, office chair, globe, safe, typewriter, cars old and new, bicycles, tool board, chandeliers, ceiling lights, oil lamps…). 71 objects of prayer and remembrance from every tradition (Jewish, Muslim, Buddhist, Hindu, Sikh, Shinto, ancestor worship, Orthodox, Protestant…).</p>
                            <h4>🌐 My website</h4>
                            <p>A complete code editor (find and replace, go to line, comment, formatting, checking, shortcuts). Extra CSS, JS and PHP files, organised in folders; two files side by side; real PHP pages in the preview; open a whole folder; an HTML, CSS and JS cheat sheet. “🧭 Browsers” checks the site and imitates Safari, Firefox or Edge, with a compatibility database that works offline. @media screens can be adjusted.</p>
                            <h4>🧾 Spreadsheet and 📝 word processor</h4>
                            <p>Pivot table (↻ refresh) and a live chart that follows the selection. Merge fields, “fill from a record”, mail merge and ready-filled templates (record request, an ancestor's identity sheet, a search notice for cousins). The spreadsheet now has its own symbol, 🧾; the calculator keeps 🧮.</p>
                            <h4>📊 Diagrams</h4>
                            <p>Hourglass, Gantt, mind map, radial bars, grouped bubbles and progress rings.</p>
                            <h4>🎨 Clearer settings</h4>
                            <p>Appearance is arranged in three groups (Look, Navigation, Screens), with a button to go back to the previous page. No more A1, A2… codes: each setting has its icon and its name. The first name and surname of the logo move to “Theme and colours”. Button shape joins “Notifications and buttons”. The buttons in the record header fit on two lines and can be arranged one by one. Those of the word processor and the spreadsheet are arranged in “Buttons and options”.</p>
                            <h4>↗ Buttons at the top right</h4>
                            <p>A shortcut (hidden at first) to each editing tool and each part of Investigations, with the choice of opening the list of projects or a new project. There is also “👤 New person”. 🧩 Boards join the Editing tools.</p>
                            <h4>🧓 Simple mode and 🐾 tracking</h4>
                            <p>11 new kinds of big buttons (family, birthdays, a place, quiz, clock, call, video, sound…), and the tile still to complete shows in the preview. In tracking, a 2nd route is added to the first, with a clear message. The base map can be chosen on each map.</p>
                            <h4>🐞 Bugs fixed</h4>
                            <p>A custom avatar shape stays selected when you come back to the page. The bundled PHP for Windows downloads even when windows.php.net has moved it to “archives/”, and its checksum is always verified.</p>
                            <p>The database structure does not change: no database update the first time you open it.</p>

                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.8.0 <small>Animal tracking, records arranged in sections, weather of the past, word processor and spreadsheet, sound studio, a more advanced house, database check, research log, land registry, website, games, simple mode and designs to choose from</small></summary>
                        <div class="presentation-version-body">
                            <h4>🐾 Animal tracking</h4>
                            <p>A new tab (hidden at first, to show in Settings → Appearance → tabs) for tracking animals in the field or at home. It is made of blocks, like the dashboard, with pages per species or per site, and its blocks can also go on the dashboard. Rings and marks according to the species (bird, cat or dog, horse, farm animal, fish, marine mammal, wild animal, primate), with the basic colours and the colour window. An uncertain reading (“7?”, “7[K|X]”) is kept as it is, along with the possible animals. Sightings with several photos, sounds or videos; GPS routes (GPX, Movebank, collar); health and weight with the curve; groups, roles and social history; census; sharing and merging with another tracking project.</p>
                            <h4>🗂️ Records arranged in sections</h4>
                            <p>The blocks of a record are arranged in sections (Identity, Family, Life, Documents; for an animal: Record, Rings and marks, Sightings, Health, Group, Map). Six layouts to choose from, including tabs at the top. An editor without a “Save” button lets you arrange sections and blocks, for all records or just one. The address remembers the open section, and the settings preview shows the real record. <b>A single record for an animal</b>: the full record, with “👁＋ New observation” and “👁 Last seen” in the header. Deleting an animal takes all its tracking with it; everything can be restored from the log.</p>
                            <h4>🌦️ Weather of the past</h4>
                            <p>The weather on the day (and at the time) of an event, offline. Each time, the app tells you where the information comes from: measured, station N km away, estimated or reconstruction. The altitude of places is taken into account, in 14 countries. A Europe pack is available as an option. You can hide the weather everywhere, by type of event, by person or by event.</p>
                            <h4>📝 Word processor</h4>
                            <p>A real word processor inside the app, with real pages, styles, notes, a table of contents, an index and a bibliography. People and places are inserted with the picker menu and stay up to date. It also has tables, track changes, comments, versions and reading aloud. It opens and saves Word (.docx), LibreOffice (.odt), .rtf, Markdown and text files. To go faster: “📝 Write about this person” from a record, and a report from the Research log.</p>
                            <h4>🧾 Spreadsheet</h4>
                            <p>Formulas in French, Excel, LibreOffice and CSV files, genealogy functions (age, year of a record, Sosa generation). “🧾 Edit the data” for diagrams, presentations and boards. It fills a table from the app and can send changes back to the database, with “↶ Undo”.</p>
                            <h4>🎧 Sound</h4>
                            <p>A complete 🎚️ Sound studio, with effects that never touch the original, a spectrum view and repair brush, markers linked to people, transcription, multitrack and music that dips under the voice. A ⚡ Quick sound with big switches (“✨ Clean everything”, Before / After). The previous editor remains the default choice.</p>
                            <h4>🏠 House</h4>
                            <p>Voids, mezzanines, railings and stairwells; dormers, eyebrow dormers, roof windows and attics with floor area under the French Carrez law; curved walls. You also get the cross-section, the areas, the plan check, the people in each room, the guided tour read aloud and its video, the hamlet, and another period shown as a ghost for comparison.</p>
                            <h4>✅ Database check</h4>
                            <p>A single page brings together impossible dates, odd ages, parents, duplicates and misplaced places, with the same figures everywhere (page, widget, record banner). Its thresholds can be adjusted. “This is not a mistake” sets a case aside, and it comes back on its own if a date changes.</p>
                            <h4>🔎 Research and work</h4>
                            <p>📔 Research log (archive visits, results by reference, “🔍 Already searched” on the record) and 💬 questions for relatives, with a questionnaire to send. You can also compare hypotheses, cite your sources, browse the list of archive services, write a biography, see the world around a life, look up old occupations, file postcards and ten-year indexes, celebrate dates, share with the family and compare two photos.</p>
                            <h4>🗺️ Land registry and images</h4>
                            <p>Napoleonic cadastral parcels and plans linked to houses, places and people. Batch processing renames, resizes, converts, adds a watermark or makes a PDF. The app finds similar images and duplicates. Retouching can rotate the whole image, straighten the horizon or turn a sideways photo upright.</p>
                            <h4>🌐 My website</h4>
                            <p>A visual editor where everything is dragged with the mouse, with real diagrams and a map. Publishing goes to Netlify, GitHub Pages or secure FTP, or into a .zip for MAMP or WAMP. Living people are never published.</p>
                            <h4>📊 Diagrams and 🎲 games</h4>
                            <p>38 new diagrams and a “Chart” menu with criteria you can combine. A simple and scientific calculator, also as a widget. To play: Who is it? with the ancestors, portrait Memory, The right date, Tic-tac-toe up to 30 × 30 and 🌀 Maze.</p>
                            <h4>🧓 Simple mode and 🎨 designs to choose from</h4>
                            <p>A big-button mode to show the tree and photos to the family, read-only, with relationships spelled out in plain words (“your grandmother”). The designs to choose from change the shape of the app (lines, corners, density, icons, buttons, lists, motion) and always keep your colours and your font.</p>
                            <h4>🧭 An even more consistent app</h4>
                            <p>The same words and the same symbols for the same buttons. Everywhere the same form errors, the same windows (Print, Import), the same tooltips and shortcuts written for your computer, and the same “⋯” menu and right-click. Settings save themselves, with “↶ Undo”. “Maintenance” is now called <b>“Settings”</b>. The buttons at the top right can be shown, hidden and arranged in Appearance. Changing page in the dashboard and in tracking is much faster.</p>
                            <h4>🐞 Bugs fixed</h4>
                            <p>“＋ New animal” from People now opens an animal's record properly. About thirty bugs fixed in Word and Excel files, dozens in retouching, video editing, layout and drawing, and 9 in the website. On the security side, weather packs and tracking data received from elsewhere are checked, and confidential photos are excluded from sharing. Simple mode and view-only mode never write to the database.</p>

                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.7.1 <small>Photoshop-style retouching (gradients, Hue/Saturation, paragraphs, glyphs, patterns, brush shapes), a single colour window, video editing, redesigned saved settings, diagrams, search by exact date, adjustable messages</small></summary>
                        <div class="presentation-version-body">
                            <h4>🎚️ Photo retouching, like Photoshop</h4>
                            <p>A real <b>▦ Gradient</b> tool (linear, radial, angle, reflected, diamond; colour and transparency stops, 16 presets, handles on the image, inside a mask to blend a photo); the <b>ⓘ Properties</b> tab with <b>Hue/Saturation</b> (colour ranges, Colorize, eyedroppers, targeted adjustment), mask density and feathering; <b>🔤 Character, ¶ Paragraph and Ω Glyphs</b> (font and its weight, justified text blocks with hyphenation, indents, French typography and genealogy signs); <b>▩ Patterns</b> to apply to a layer or to create yourself (seamless tiling); <b>🖌 Brush shapes</b> (stars, leaves, grass, chalk, calligraphy pen… and your own shape from a selection); images placed as <b>smart objects 🧩</b> (enlarge, rotate without loss); <b>Fill</b> and <b>fx</b> layer effects (shadow, glow, stroke); non-destructive restoration (everything goes on layers); replace the sky, cut out a person, upscale ×2 / ×4, panorama; empty canvas; the two colour squares with X and D.</p>
                            <h4>🎨 A single colour window everywhere</h4>
                            <p>App colours, recent colours, then shades, HSL, RGB or CMYK, eyedropper and code; it replaces the system window throughout the app.</p>
                            <h4>🎞️ Video editing</h4>
                            <p>Transitions, old film, stabilisation, lockable tracks, snapping, music beats detected; stacked tracks in timeline order, full-screen video, titles with 17 entrances, 16 exits and their durations, sound-only export (MP3, WAV).</p>
                            <h4>📐 Layout and ✏️ drawing</h4>
                            <p>Family book templates, QR codes to records, mail merge; panel tabs (retouching, layout, drawing, 3D house) can be arranged and hidden in “⚙️ Customise”; in drawing, the Fill / Stroke squares open the colour window.</p>
                            <h4>💾 Saved settings, new frame</h4>
                            <p>Collapsible, one row per setting with “Apply” and a ⋯ menu (replace, rename, duplicate, export, delete with “Undo”); the name is typed only when you create a setting.</p>
                            <h4>📊 Diagrams and maps</h4>
                            <p>12 new diagrams (timelines, family links, chord, violin, bubble map); coloured maps with an “Area” field that suggests areas and towns, and new sources “The places in your tree”.</p>
                            <h4>🔎 Search and questions</h4>
                            <p>Exact dates finally work in Proximity and Dates (record dates read to the day, other calendars converted), “Between two exact dates”; “Ask a question” understands the place (“in Pernay”) and asks which one when several towns share the same name.</p>
                            <h4>📏 Calendar / measures</h4>
                            <p>Eight more frames (measures by region, age ↔ birth, gap between two dates, day of the week, saint of the day and movable feasts, canonical hours, foreign currencies, generations).</p>
                            <h4>⚙️ Settings</h4>
                            <p>A separate “Maps and base maps” page; messages after an action can be adjusted (corner of the screen, duration, colours of each kind of message); FAQ search with a single frame.</p>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.7.0 <small>Creations, artists and careers, the family house in 3D, drawing and coats of arms, transcription of records and old alphabets, presentations and life stories, charts and maps, photo maps, DNA and faces, several family trees, a more consistent and more accessible app</small></summary>
                        <div class="presentation-version-body">
                            <h4>🎨 Creations, artists and careers</h4>
                            <ul>
                                <li><b>“This person was…”</b>: profiles to tick on a record (artist, craftsperson, actor, athlete, politician, scientist, inventor, explorer, soldier, farmer… and your own). Each profile adds its own parts; a person can have several, brought together on one page with a <b>timeline coloured by profile</b>.</li>
                                <li><b>131 types of works</b> in 12 families: painting, sculpture and its casts, poster, record, song → recordings → releases, book, play → productions → performances → tours, film, series → seasons → episodes, crafts, games, flavours… and <b>your own type</b>, created in 5 steps.</li>
                                <li><b>Catalogue raisonné</b> and <b>discography</b> (album by album, track by track, credits, pressings), inventory of works (where, owned by whom, condition, value), provenance and exhibitions; records and books in several copies; records imported from the big online databases of music, books and films.</li>
                                <li><b>Concerts and shows</b> with the setlist (encores, covers, guests), tours, map and statistics; <b>inventions</b> (patents by country, prototypes), <b>discoveries</b> and <b>expeditions</b>; terms of office and elections; <b>137 sports</b> with their figures by season; the <b>official French list of craft trades</b>.</li>
                                <li>For anyone: <b>“📰 In the media”</b> (and the Press review), <b>“🏆 Competitions and awards”</b> (and the Awards list), <b>“🎓 Diplomas and training”</b>; everything can be found in the <b>“🎨 Creations and careers”</b> group of lists.</li>
                            </ul>
                            <h4>🏠 The family house, as a plan and in 3D</h4>
                            <ul>
                                <li>Draw the house <b>room by room, to the centimetre</b>: lengths typed on the keyboard, snapping, dimensions, doors and windows, floors (with the floor below shown transparently for alignment), <b>a roof the way you like it</b>, an old plan or cadastral map to trace.</li>
                                <li><b>Nearly 700 pieces of furniture and objects</b> from the past, from trades and workshops, your own or imported objects; <b>photos and paintings from the database in the frames</b>, canvases and mirrors.</li>
                                <li><b>First-person 3D tour</b>, daylight, <b>“🕰 Periods”</b> that make the house change over the years; inhabitants, memories and censuses linked to each house, 🏠 Houses block on the record.</li>
                            </ul>
                            <h4>✏️ Drawing, coats of arms, plans and announcements</h4>
                            <ul>
                                <li>A complete <b>drawing tool</b>: pen, shapes, layers and groups, masks, text on a path, gradients and patterns, align and distribute, vectorise an image; SVG, PNG, JPG, PDF export.</li>
                                <li><b>Coats of arms</b> (shields, partitions, tinctures, hatching, 44 old ornaments), <b>town or village plans</b> (roads, rivers, buildings, compass rose, period styles) and <b>maps to scale</b>.</li>
                                <li><b>Announcements and posters</b> filled from the tree (birth, wedding, death, cousins' reunion…), in many more formats, double-sided or folded with their envelope; <b>signatures</b> cut out from a record, wax seals, monograms, bookplates.</li>
                                <li><b>Decorative tree to print large</b>: fan, wheel, drawn tree, box tree, up to 12 generations, 13 styles plus your own, A4 to A0 formats.</li>
                            </ul>
                            <h4>📜 Reading old records</h4>
                            <ul>
                                <li>A <b>transcription workshop</b>: image and text side by side, areas linked to each passage, automatic reading, detection of names, roles, dates (written out in words, and French Republican dates), places and occupations, record templates; “🎚️ See better” (sharpness, contrast, background removed, magnifier); a list of transcriptions.</li>
                                <li>In Calendar / measures, the <b>“Alphabets and languages of records”</b> frame: choose a language from <b>about forty</b> (Latin, Occitan, Breton, Polish, Russian, Greek…), see its whole alphabet, its accented letters and clues to recognise it; <b>type characters to find out which language they come from</b>; a <b>Cyrillic and Greek keyboard</b>, with transliteration into Latin letters.</li>
                                <li>The <b>“What's missing?”</b> assistant lists the records still to find and the archives to consult; printed-text recognition comes with the app.</li>
                            </ul>
                            <h4>🎞️ Presentations, slideshows and video editing</h4>
                            <ul>
                                <li><b>Real presentations</b>: themes, text, images, tables, charts, genealogy objects, transitions and animations, presenter view; import and export of presentations, PDF and video.</li>
                                <li><b>“✨ Life story”</b> automatically builds, from the record, a slideshow about a person: birth map, events, photos, period, places lived, descendants.</li>
                                <li>Video editing: <b>voice-over</b> from the microphone, <b>subtitles</b>, slow pan-and-zoom on photos, “The life of…” and “A family” templates, music that dips under the voice, phone or square formats, chapters, <b>speed from 0.1× to 10×</b>, footage organised in folders.</li>
                            </ul>
                            <h4>🎚️ Retouching and layout</h4>
                            <ul>
                                <li><b>Guided restoration of an old photo</b>: straighten, remove yellowing, spots, scratches and creases, colourise with period colours, compare before / after.</li>
                                <li><b>41 filters</b> that never touch the original photo, remove <b>reflections from glass</b>, select the subject in one click, place an image on a layer, separate eraser, blend modes, actions for several photos at once.</li>
                                <li>Books: <b>text that flows from one frame to the next</b>, table of contents and index of names filled in automatically, <b>footnotes</b> and cited sources, index of places and occupations, a tree that updates itself, preflight check before printing, <b>text checked against the records</b>, review mode with comments, ePub.</li>
                            </ul>
                            <h4>📊 Charts, diagrams and maps</h4>
                            <ul>
                                <li><b>Charts to place anywhere</b>, kept up to date, with your own figures (table, paste, file, Wikipedia page, and even an image of a chart), stored in a list and <b>in folders</b>.</li>
                                <li><b>22 new shapes</b>: ancestry fan, lineage sunburst, relationship network, time spiral, changing ranking…; parliament charts and membership timelines.</li>
                                <li><b>Maps coloured by area</b> (French departments, regions, European countries, continents) with a <b>zoomed inset of the Paris region (Île-de-France)</b> and a <b>“Municipalities”</b> level of detail for France, Belgium, Switzerland and Luxembourg; migration map.</li>
                            </ul>
                            <h4>📸 Photo and video maps</h4>
                            <ul>
                                <li>The <b>place and time</b> of a photo or video are read automatically, and can be corrected by dragging; photos without a position wait in “To place”; <b>a timeline to go back in time</b>, down to the second; all maps as chips at the top of the tool.</li>
                            </ul>
                            <h4>🔬 Searching differently</h4>
                            <ul>
                                <li><b>DNA</b> tab (hidden at first, with a warning about French law): matches, automatic clusters, chromosomes, lineages, <b>probable placement of a cousin</b> in the tree.</li>
                                <li><b>“👤 Faces”</b> recognises people in photos, on your computer only; <b>“Ask a question”</b> in French understands relationships, records, ages and French Republican dates; <b>impossible dates</b> are flagged as you type.</li>
                                <li><b>Magazines, books, documentaries and podcasts</b> (issues to buy, articles, timestamped moments, annotated screenshots); <b>small ads</b> and letters to newspapers with the price calculated.</li>
                            </ul>
                            <h4>🌳 Several family trees, and a jigsaw</h4>
                            <ul>
                                <li><b>Several completely separate family trees</b>, each with its own database, media, backups and settings.</li>
                                <li><b>🧩 Jigsaw</b> from 12 to 1,000 pieces with an image from the database, timer and records; archive room and museum to furnish.</li>
                            </ul>
                            <h4>🧭 A simpler, more consistent app</h4>
                            <ul>
                                <li>Everywhere, <b>the same menu to choose a person, a place or anything else</b> (French municipalities and towns worldwide, never blocked by places with the same name) and <b>a single window</b> to choose an image, a sound or a video.</li>
                                <li><b>The same bar above every list</b> (Search · Filter · List | Cards · Sort); no more “Are you sure?” for things that can be undone: you delete, and a message offers <b>“↶ Undo”</b>.</li>
                                <li>The same date, colour and slider fields, the same export window, the same “💾 Saved settings” everywhere; dark mode everywhere; better support for small screens.</li>
                            </ul>
                            <h4>♿ Accessibility and appearance</h4>
                            <ul>
                                <li>Settings for <b>colour blindness</b> (with “See as…”), text size and spacing, <b>fonts for easier reading and for dyslexia</b> (built in), high contrast, large targets, fewer animations, <b>reading aloud</b>, dictation.</li>
                                <li>Rename the menu tabs and choose their emoji; your own avatar shapes and themes; adjustable record header; Lists and Settings arranged in collapsible groups.</li>
                                <li>The <b>“My shortcuts”</b> widget leads to anything (a record, a filtered list, a tool, a website), and <b>its pencil lets you add and arrange your shortcuts directly</b>.</li>
                            </ul>
                            <h4>🐞 Bugs fixed</h4>
                            <ul>
                                <li><b>Data entry</b>: a double-click sometimes created two records; Enter could erase what you had just typed; two tabs open on the same record overwrote each other without warning; Escape sometimes closed one window too many.</li>
                                <li><b>Family</b>: removing a parent did not always remove them; half-siblings could end up with three parents; impossible merges (between spouses, between an ancestor and their descendant) were accepted.</li>
                                <li><b>GEDCOM</b>: French Republican and Julian dates, tags, animals and note titles were lost; search was sensitive to accents and hyphens; “born on 29 February” was only half understood.</li>
                                <li><b>Maps and display</b>: Russia appeared only in pieces on the world map; text overflowed and elements stuck together throughout the app; side-by-side frames did not have the same height.</li>
                                <li><b>Settings</b>: 17 “Site default” settings were not kept; a ¾ chart went back to ½; a custom avatar shape was shown under the wrong name.</li>
                                <li><b>Security</b>: backups and databases received from elsewhere checked before opening, links checked, CSV exports protected, and many other safeguards.</li>
                            </ul>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.6.0 <small>Layout workshop, photo retouching with layers, small video editor, sound projects, free-form boards, animals, topic cards, family book and booklets, statistics and your own settings</small></summary>
                        <div class="presentation-version-body">
                    <h4>📐 Layout workshop</h4>
                    <ul>
                        <li>Make <b>the book of your family history</b> as in desktop publishing software: single pages or <b>facing pages</b>, <b>master pages</b> (page number, running head), <b>layers</b> (hide, lock, arrange).</li>
                        <li>To start: <b>a blank page</b>, <b>the family data</b> (cover, preface, figures, tree, one page per person with their photo, chronology, places, index — text that is too long continues automatically on the next page) or <b>a design</b>. Format, <b>margins</b>, <b>columns and gutter</b>, <b>bleed</b> and <b>baseline grid</b> chosen at creation, with editable <b>default settings</b>.</li>
                        <li>Six designs supplied (Classic, Modern, Elegant, Sepia, Photo album, Plain) and <b>your own designs</b>, all editable; the list shows <b>the cover</b> of each book and each design.</li>
                        <li><b>Text</b>: all the fonts on your computer, size, leading, tracking, kerning, baseline shift, capitals, superscript; alignment, indents, spacing, <b>drop caps</b>, hyphenation, lists, columns; <b>paragraph and character styles</b> (change a style and the whole book follows); automatic page number and title.</li>
                        <li><b>Shapes</b> (rectangle, ellipse, polygon, star, line, <b>pen</b>), <b>image frames</b> (photos from the database or the computer, fill, fit, crop), <b>swatches</b> and <b>gradients</b>, <b>strokes</b> (weight, dashes, dots, corners), <b>effects</b> (opacity, blend modes, drop shadow, feathering, rounded corners).</li>
                        <li><b>Text wrap</b> around a photo or a shape, <b>Pathfinder</b> (add, subtract, intersect, exclude), align and distribute, smart guides, <b>links</b> (placed images, clickable web addresses).</li>
                        <li><b>Add or insert pages</b> (as many as you like, wherever you like), duplicate, move, <b>go to a page</b>; <b>apply, remove or replace a master</b> on one page or several; undo / redo with history; the keyboard shortcuts of desktop publishing software.</li>
                        <li>Save, pick up later, export as <b>PDF</b> (also <b>with bleed and crop marks</b> for a printer), as an HTML page or as a file to share.</li>
                    </ul>
                    <h4>🎬 Small video editor</h4>
                    <ul>
                        <li>Complete editing: <b>as many video, text and sound tracks as you want</b> (hide, arrange, rename), animated titles, fades and transitions, detached audio, colours, full screen.</li>
                        <li><b>Photos in the video tracks</b>, one after another or overlaid; <b>drag an item from one track to another</b> of the same kind; ⌫ to remove, B to cut.</li>
                        <li>An inspector for each item: <b>Transform</b> (position, rotation, scale, anchor), <b>Crop</b>, <b>Distort</b>, <b>Spatial conform</b>, opacity and blend modes, with <b>keyframes</b> to animate everything.</li>
                        <li>Adjustable layout, block colours, buttons and recording (MP4 or WebM, size, quality), with named <b>setting sets</b> you can export and import.</li>
                        <li><b>Editing projects</b> saved separately from the exported video, a <b>Footage</b> tab (the project's videos, photos and sounds, which can be renamed), video imported with its sound, <b>sound separated from the picture</b>, <b>speed</b> of each clip, photo duration of your choice, sound settings clip by clip or for the whole film, menu at the top, instant play and pause.</li>
                    </ul>
                    <h4>🎚️ Photo retouching, with layers</h4>
                    <ul>
                        <li>Start from a photo in the database, an image on your computer or <b>an empty canvas</b>; File, Edit, Image, Layer, Select, Filter and View menus.</li>
                        <li><b>Layers</b>, <b>layer groups</b> (and groups of groups) arranged by drag and drop, <b>adjustment layers</b> (adjustments and filters, on everything below or only on the item just below), <b>masks</b>, the photo itself being a layer like any other.</li>
                        <li>Selections (rectangle, ellipse, lasso, pen, magic wand), spot healing, clone stamp, brushes, shapes, text, curves, history; <b>retouching projects</b> saved so you can pick up the work later.</li>
                    </ul>
                    <h4>🎧 Sound</h4>
                    <ul>
                        <li><b>Sound projects</b>: keep a sound you are working on (lossless) and come back to it; “New sound project” in the list of audio files; recording in MP3, FLAC, AIFF, WAV or Ogg.</li>
                    </ul>
                    <h4>🛠️ Editing tools</h4>
                    <ul>
                        <li>An <b>Editing tools</b> list: all video, sound, retouching and layout projects, to search, sort, open, rename or start.</li>
                        <li><b>Buttons and options</b> of each tool shown, hidden and arranged, and <b>your own keyboard shortcuts</b> in each tool, refused if they are already taken by macOS, Windows, Linux or the app.</li>
                    </ul>
                    <h4>🧩 Free-form boards</h4>
                    <ul>
                        <li>In Investigations: free-form boards with <b>nearly 800 shapes</b>, notes, text, attached arrows, freehand drawing, pen, photos and documents, records, app screens, widgets.</li>
                        <li>Automatic tree, live timeline and map, layers, groups, snapshots, presentation, comments, voice memo; boards linked to an investigation, a search sweep, a family, an event or an animal.</li>
                    </ul>
                    <h4>🐾 Animals</h4>
                    <ul>
                        <li>An Animals tab: a discreet record or a <b>full record like a person's</b> (tree, pedigree, inbreeding, photos, notes, sources), breeding database, species, categories and your own fields.</li>
                    </ul>
                    <h4>📒 Topic cards</h4>
                    <ul>
                        <li>A “Cards” tab (hidden at first): a page about a topic — a country, an occupation, a custom — made of blocks (text, images, people, date timeline, quotation, links, app screens, widgets), edited in place like widgets.</li>
                        <li>Reuse <b>the same block order</b> for a new card, or turn it into <b>a template</b> offered when you create the next cards.</li>
                    </ul>
                    <h4>📖 Family book, family booklets and employers</h4>
                    <ul>
                        <li>Family book by branch: parts to tick and arrange, text, styles, fonts, format; PDF, HTML, Word, OpenDocument, ePub, Markdown, text, CSV.</li>
                        <li>French family record booklets (livrets de famille) transcribed in full, with people linked to records; employer records in the style of a company profile.</li>
                    </ul>
                    <h4>📊 Charts, widgets and your own tabs</h4>
                    <ul>
                        <li>Chart and widget editor, your own tabs with any screen of the app; dashboard in pages and collapsible groups.</li>
                        <li>Distributions: <b>“+ Criterion”</b> as many times as you like, default filters, and <b>a click on a bar</b> (age pyramids included) shows the people counted.</li>
                        <li>Village record and municipality monograph as widgets, detailed saint of the day, research suggestions.</li>
                    </ul>
                    <h4>⚙️ Settings and comfort</h4>
                    <ul>
                        <li><b>My setting sets</b>: all the app's settings saved under a name, applied, exported, imported.</li>
                        <li>Bottom menu or right-hand side column, as you prefer; drag and drop everywhere; <b>lists you can hide</b> in one click; <b>empty rows of the Identity block hidden</b> on one record or on all of them.</li>
                        <li>A searchable FAQ in French (ignoring accents, with synonyms) and a security review.</li>
                    </ul>
                    <h4>🐞 Bugs fixed</h4>
                    <ul>
                        <li><b>Marriages</b> linked to two people and <b>marriage places</b> that did not show in distributions; duration of recorded videos; dashboard widget pencil too slow.</li>
                        <li><b>Video editing</b>: “Cancel” while importing closed the project; a video dropped on track 1 was refused; play and pause were slow to react; ⌘Z could not undo a cut made with B.</li>
                        <li><b>Mac app</b>: ⌘Z and ⇧⌘Z did not reach video editing, retouching or layout; Escape asked for confirmation twice; “Cancel” in a file chooser closed the open window.</li>
                        <li><b>Retouching</b>: the layers panel overflowed; the starting photo could not be dragged or deleted like a layer; buttons that should have been hidden stayed visible; “Photo versions” appeared on an empty canvas.</li>
                        <li><b>Layout</b>: some master page buttons did nothing; text colour lost the selection; “Duplicate” could crash; renaming a layer by double-clicking did not stick.</li>
                        <li><b>Drag and drop</b>: a row could end up in another list, and the drop marker was hidden behind windows; in Settings, arranged or hidden buttons were never saved.</li>
                    </ul>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.5.0 <small>Collections, page-by-page record indexes, census address map, a village record you can organise, research workshop, sounds and videos, calendars</small></summary>
                        <div class="presentation-version-body">
                    <h4>📚 Collections</h4>
                    <ul>
                        <li>The pages of a register or notebook <b>photographed in order</b>, with transcription and versions side by side.</li>
                        <li>Cover image, “To sort” folders, arrows between the images of a page.</li>
                        <li><b>A table in every page</b>: paste from a spreadsheet, locked or free order, merge cells, CSV export, row linked to a record.</li>
                        <li>Link a page or a single image to a person, an investigation, a search sweep, a workshop or a village.</li>
                    </ul>
                    <h4>📜 Record indexes</h4>
                    <ul>
                        <li>In Lists, <b>page-by-page archive indexes</b>: scan views, document pages, photos and transcription.</li>
                        <li>People grouped <b>by household</b>, numbered as you like, with the household's address (number and street), and a 🔒 padlock so nothing gets changed by mistake.</li>
                        <li>The same data as Research › Archive index, with a link in both directions.</li>
                    </ul>
                    <h4>🗺️ Address map</h4>
                    <ul>
                        <li>The addresses of a census <b>on a map</b>, for the year of your choice.</li>
                        <li>The French national address database (Base Adresse Nationale) for the department, read on your computer: <b>automatic placement without internet</b>, or by hand.</li>
                        <li>Old street names, <b>vanished streets drawn in</b>, old maps overlaid, favourite base maps in Appearance.</li>
                    </ul>
                    <h4>🏘️ Village record</h4>
                    <ul>
                        <li>Census map shown by default; <b>⚙️ Organise the record</b> (order, hide, width of each part); notepad.</li>
                        <li>All the households in a census by municipality and by year, with CSV export.</li>
                    </ul>
                    <h4>🔬 Research workshop</h4>
                    <ul>
                        <li>A 3rd tab in Investigations: <b>thesis, book or exhibition</b> projects with nested folders.</li>
                        <li>Zotero, CSL JSON and EndNote import; Word (.docx), print / PDF and CSL JSON exports; widgets and “From the app”.</li>
                    </ul>
                    <h4>🎧 Sounds, videos and calendars</h4>
                    <ul>
                        <li><b>Audio</b> and <b>Video</b> lists with a player (speed from 0.10× to 6×); <b>✂️ sound and video workshop</b> (cut, improve, join) that always keeps the original.</li>
                        <li><b>📅 My diary</b> and <b>Family calendar</b>, with an “upcoming” widget.</li>
                        <li>Field trips: logistics and technical details for each stop.</li>
                    </ul>
                    <h4>Photos, lists and fixes</h4>
                    <ul>
                        <li>🧩 Stitch photos together; spot healing in retouching.</li>
                        <li>⚙️ Columns for every list; list editor with its own form; 8 chart designs for widgets.</li>
                        <li>Better encryption for the copy kept at a cousin's, INSEE death records as .zip, data-entry windows that open inside the desktop app, and many other fixes.</li>
                    </ul>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.4.2 <small>3D family museum, photo retouching, your own widgets, voter cards, automatic INSEE death records, 26 calendars, many fixes</small></summary>
                        <div class="presentation-version-body">
                    <h4>3D family museum</h4>
                    <ul>
                        <li>Rooms where you display photos, documents and objects, with a <b>floor plan of the room</b> to place each item and a <b>custom room size</b>.</li>
                        <li><b>Guided tour</b> with an audio guide (your own recordings or a synthetic voice with adjustable speed), guestbook and catalogue.</li>
                        <li>Share as a website or as a file.</li>
                    </ul>
                    <h4>Photos and appearance</h4>
                    <ul>
                        <li><b>Retouching</b> (brightness, contrast, curve): the original is always kept, each retouch becomes a version.</li>
                        <li><b>Saved layouts</b>: all the Appearance settings under one name, to share.</li>
                        <li>All Unicode emoji: people (with skin tones), objects and symbols.</li>
                    </ul>
                    <h4>Dashboard, lists and search</h4>
                    <ul>
                        <li><b>Widget editor</b>: create your own (figures, list, chart, text, shortcuts), with several parts in the same widget, or start from one of the app's widgets.</li>
                        <li>My lists in the Lists tab, shared as a file, with filters and sorting by column.</li>
                        <li><b>Ask a question in French</b>: “Did Jean Dupont have children?” → “Yes, 2 children.”, people with the same name listed, saved searches.</li>
                    </ul>
                    <h4>New blocks and tools</h4>
                    <ul>
                        <li><b>Voter cards</b> block, and a world map of voting rights for men and women.</li>
                        <li><b>INSEE death records</b>: new files on data.gouv.fr are flagged and imported by the app.</li>
                        <li>Village record: sorting by column and population taken from Wikipedia.</li>
                        <li>Sea voyages: routes that only go by sea.</li>
                        <li>Online records: free fields, screenshot of the tree, search on Geneanet, Filae… with the information from the record.</li>
                        <li>Events: “Uncertain date” box.</li>
                    </ul>
                    <h4>Calendars</h4>
                    <ul>
                        <li><b>Convert a date</b> into 26 calendars: Hebrew, Ethiopian, Indian, Japanese, Korean, Chinese, Persian, Bengali, Thai, Coptic, Byzantine…</li>
                        <li>For old records: the <b>Roman calendar</b> (kalends, nones, ides), English Old Style (before 1752), Easter style (France before 1567).</li>
                        <li>French Republican months with their Gregorian dates; any calendar can be chosen as the default calendar.</li>
                    </ul>
                    <h4>Fixes</h4>
                    <ul>
                        <li>Merging two records keeps everything (variants, witnesses, photos, blocks…).</li>
                        <li>GEDCOM: old encodings (ANSEL, MS-DOS, Mac, UTF-16) and “about”, “from”, “to” and “BC” dates; exports that respect private records and living people.</li>
                        <li>Handwriting recognition (HTR): fixed when the data folder contains a space (Mac).</li>
                        <li>French overseas places (Guadeloupe, Réunion…) correctly counted as France; and many other small fixes.</li>
                    </ul>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.4.1 <small>My lists, a richer village record, one-click installation of handwriting recognition, fixes</small></summary>
                        <div class="presentation-version-body">
                    <h4>My lists (Settings)</h4>
                    <ul>
                        <li><b>Create your own lists</b> by combining criteria: for example divorces between 1850 and 1920, marriages without a source, ancestors born in a given department…</li>
                        <li>Add your own columns: free text, drop-down menu, checkbox, date, number, web link or person in the database.</li>
                        <li><b>Hand-written lists</b>, without pulling anything from the database: ideal for <b>preparing for a genealogy fair</b> (stands to visit, what I'm looking for, priority, done).</li>
                        <li>Tags on lists, CSV export and printing.</li>
                    </ul>
                    <h4>Village record</h4>
                    <ul>
                        <li>Records by decade, as you choose: all, births, marriages, deaths or any other kind of event.</li>
                        <li>“and N others” expands to show the whole family.</li>
                        <li>Choice of base map (Cassini, French General Staff map, IGN…) and a <b>population chart</b> under the map.</li>
                    </ul>
                    <h4>Handwriting recognition (HTR)</h4>
                    <ul>
                        <li>A guide and an <b>“Install”</b> button: Kraken and its models install themselves in the data folder (Python 3.10 or 3.11 required), or a model can be added by hand.</li>
                    </ul>
                    <h4>Comfort and fixes</h4>
                    <ul>
                        <li>Block editor: any emoji, a section with <b>every flag in the world</b>, and the choice of showing the block in “Blocks to show on the record”.</li>
                        <li>Municipality monograph: both spouses of a marriage, each with their own “Open” button.</li>
                        <li>Misplaced places opens again, and much faster.</li>
                        <li>Working as two: no more “database is locked” message on large databases.</li>
                        <li>Records to request: the list takes the full width and “Prepare the letter” stays inside the frame.</li>
                        <li>A mini FAQ at the end of “Glossary / tutorial / FAQ”.</li>
                    </ul>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.4.0 <small>New blocks, block editor, village record, a clean database, working as two, a copy kept at a cousin's</small></summary>
                        <div class="presentation-version-body">
                    <h4>New blocks on records</h4>
                    <ul>
                        <li><b>Departures and emigration</b>: port, ship, stopovers, passenger list, people who left together, each person's naturalisation, emigration papers, and the ship's route on the map.</li>
                        <li><b>Child in care</b> (wet nurse, foundling hospital, public welfare, with the duration), <b>Coat of arms and nobility</b>, <b>WWI soldier 1914-18</b> (regiments, wounds, links to unit war diaries), <b>Resistance member</b> (network, code name, arrest, hiding places, day-by-day route on the map, companions) and <b>Languages</b> spoken and passed on to descendants.</li>
                        <li>These blocks can be ticked on the record (“Blocks to show on the record”) or shown on every record (Appearance), in the order you choose.</li>
                        <li><b>Block editor</b> (Settings): create your own blocks without programming (text, date, choice list, linked person, place, photos, videos and sounds, information taken from a record, map), share them with a relative and import theirs.</li>
                        <li><b>Tags</b> on all these blocks, as soon as they are created.</li>
                    </ul>
                    <h4>New lists</h4>
                    <ul>
                        <li><b>Village record</b>: for each municipality in the family, the families who lived there, the main occupations, the church and parish, the population across censuses, records by decade and the Cassini map.</li>
                        <li><b>Epidemics, wars, terrible winters</b> next to the family's deaths, to understand a wave of deaths (cholera of 1832, Great Frost of 1709, Spanish flu…).</li>
                        <li><b>Records to request</b> (Correspondence register): records too recent to be online, the letter to the town hall ready to send, and a reminder on the day the record becomes public.</li>
                        <li>Field trips, family papers, post-mortem inventories, old maps aligned on the map, Ancien Régime parishes, names mentioned in records (the ancestors' “circle”), help requests, Resistance members.</li>
                    </ul>
                    <h4>Search and understand</h4>
                    <ul>
                        <li><b>Ask a question in French</b>: “Which ancestors were bakers in Lille before 1850?”. Searches can be saved.</li>
                        <li><b>“@Jean Dupont”</b> links in notes, and a “Cited in” section on the record that is cited; detailed source citations, with the reference written automatically.</li>
                        <li>Religious feasts on their exact date, first names compared with the INSEE file, ancestors' height compared with the French average, age at marriage and gaps between births.</li>
                        <li><b>The family film</b>: the animated map of the family through the centuries, recorded as a video.</li>
                        <li><b>⌘F</b> highlights the words searched for and gives their count.</li>
                        <li>Place suggestions find towns all over the world (Boston, Abidjan…), the most populous first.</li>
                    </ul>
                    <h4>A clean database</h4>
                    <ul>
                        <li>Age alerts: a 55-year-old mother, a child born after the father's death, births too close together.</li>
                        <li><b>Harmonise variants</b> (“Laboureur”, “labour.”, “Labourreur”), after confirmation, and it can be undone.</li>
                        <li>Misplaced places (swapped coordinates, wrong department for a place with the same name), impossible journeys, side-by-side comparison of the two records before merging a duplicate.</li>
                        <li><b>Watched “Scans” folder</b>: every photo or PDF that lands there goes into the app.</li>
                    </ul>
                    <h4>Share and protect</h4>
                    <ul>
                        <li><b>Work as two</b> on the same family tree: bundles of changes to exchange, to accept or reject one by one.</li>
                        <li><b>Copy at a cousin's</b>: an encrypted copy they keep without being able to read it, and give back to you the day your computer lets you down.</li>
                        <li>Copy outside the computer (iCloud folder, Dropbox, USB stick), export of a single branch, and a password-protected <b>view-only mode</b> to show the tree safely.</li>
                    </ul>
                    <h4>Fixes</h4>
                    <ul>
                        <li>“Mort pour la France” (died for France) is now saved on the record.</li>
                        <li>Many fixes after a complete review of the code.</li>
                    </ul>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.3.1 <small>Ancestors and descendants, merging a cousin's tree, keyboard shortcuts</small></summary>
                        <div class="presentation-version-body">
                    <h4>Family</h4>
                    <ul>
                        <li><b>“Ancestors”</b> and <b>“Descendants”</b> blocks on each record, as a list: you choose the number of generations (for all records or just one), and a “┄ more” line shows there are more beyond. Also as a dashboard widget and in Charts.</li>
                        <li><b>Closed branches</b>: declare that a line of descent has died out, with a degree of certainty (certain, very likely, likely, maybe, serious doubt) and the reason; “extinct line” appears in the trees, and the list of closed branches is in Lists.</li>
                        <li><b>Merge a cousin's tree</b> (Settings): their GEDCOM file is compared with your database before anything is imported, then you decide record by record: “it's the same person, complete mine”, “new person, add them” or “ignore”. Nothing in your record is erased or replaced, and a backup copy is made just before.</li>
                        <li><b>Bookmarks</b>: a ribbon at the top of each record to keep it at hand; bookmarks have their own tab in the list of people.</li>
                    </ul>
                    <h4>Keyboard shortcuts</h4>
                    <ul>
                        <li>More than 50 shortcuts, visible in the app's menus and with the <b>F1</b> key: move around the family (⌥↑ the father, ⌥↓ a child, brothers and sisters, spouse…), previous and next screen, sections ⌘1 to ⌘9, save with ⌘Enter, viewer, transcription, search sweeps…</li>
                        <li>⌘-click on a person, a search sweep or an investigation: open it in the other half of the screen.</li>
                        <li><b>⌘Z</b> outside a text box: undo the last change to a record, always after confirmation.</li>
                        <li>In a date field, typing “v”, “av”, “ap” or “en” suggests the French words for “about”, “before”, “after” and “between … and”.</li>
                        <li>Settings → <b>Keyboard shortcuts</b>: change any shortcut; the app warns you if it is already taken by macOS, Windows or Linux, and you can save your settings under a name.</li>
                        <li>(On Windows and Linux, ⌘ is replaced by Ctrl, and ⌥ by Alt.)</li>
                    </ul>
                    <h4>Comfort and fixes</h4>
                    <ul>
                        <li><b>“Reorder the widgets”</b> button at the bottom of the dashboard.</li>
                        <li>With two windows or a split screen, a setting changed in one is picked up immediately in the other.</li>
                        <li>Appearance: each section shows which records have an exception.</li>
                        <li>Small widgets no longer squash their title or number, and their settings (pencil) no longer overflow the frame.</li>
                        <li>JSON export works again on large databases.</li>
                    </ul>
                        </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.3.0 <small>Research help, search sweeps worldwide, family heirlooms and memory</small></summary>
                        <div class="presentation-version-body">
                    <h4>Search sweeps worldwide</h4>
                    <ul>
                        <li>The municipalities of <b>226 countries and territories</b> ship with the app (Europe, the Americas, Africa, Asia, Oceania, the Caribbean), all usable offline; neighbouring municipalities on either side of a border are linked.</li>
                        <li><b>“Online registers”</b> button on each municipality in a search sweep: French departmental archives, Matricula, Antenati, the State Archives in Belgium, FamilySearch…</li>
                        <li>The country is shown when you hover over the map.</li>
                    </ul>
                    <h4>Research help</h4>
                    <ul>
                        <li><b>Estimated dates</b>: a missing birth or death gets a range (“born between 1753 and 1772”), based on age at death, marriage, children, brothers and sisters, parents.</li>
                        <li><b>Pedigree collapse</b>: ancestors who appear several times in the tree and the rate per generation; the record shows all of an ancestor's Sosa numbers (“Sosa 42, 68 &amp; 92”).</li>
                        <li><b>Search the internet</b> from a record, a widget or the Research tab: Geneanet, FamilySearch, Filae, historical newspapers, search engines… with the years of life, the place and the spouse to rule out people with the same name, and several sites opened at once.</li>
                        <li><b>The front page of the day</b>: Le Petit Journal, Le Petit Parisien, Le Figaro or Le Temps on the day of a birth, marriage or death (1854-1944, Gallica).</li>
                        <li><b>First name and saint of the day</b>: on the record (“Born on 24 June, named Jean: Saint John the Baptist”), in a widget and as a statistic by family and by period.</li>
                        <li>Help reading old records: abbreviations, the Latin of parish registers, old handwriting letter by letter.</li>
                        <li>Purchasing power of an old sum (“300 livres in 1780 ≈ 340 days' work for a day labourer”).</li>
                        <li>The links to the 100 French departmental archives checked one by one.</li>
                    </ul>
                    <h4>The history around people</h4>
                    <ul>
                        <li><b>Precise places</b>: an address, a farm, a house at a glance, with its successive inhabitants and all the events that happened there.</li>
                        <li><b>Family heirlooms</b>: photo, who passed them to whom, and who has them today.</li>
                        <li><b>Family memory</b>: recipes, sayings, songs, nicknames, traditions, linked to the people who passed them on.</li>
                        <li>Tags on heirlooms and memories; a tag can be created just by typing it.</li>
                        <li>Genealogy <b>fairs and events</b>: date, place, how to get there, what to bring, stands to see, links, with a reminder a few days before.</li>
                    </ul>
                    <h4>Comfort</h4>
                    <ul>
                        <li><b>Quick search</b> with ⌘K (Mac) or Ctrl+K (Windows, Linux): a person, a search sweep, an investigation, a place or a screen.</li>
                        <li><b>Split screen</b> (side by side or top and bottom) and opening a screen in a new window.</li>
                        <li><b>Reminders as system notifications</b>, with the number of reminders on the icon (Mac, Linux).</li>
                        <li><b>Offline map</b>: a simple base map (municipalities and borders) replaces the map when there is no connection.</li>
                        <li><b>Research summary</b> widget: what you did this month and this year.</li>
                    </ul>
                    <h4>Protection and sharing</h4>
                    <ul>
                        <li><b>Full password-protected backup</b> (AES-256 encryption), to store safely on iCloud, Dropbox or a USB stick.</li>
                        <li>GEDCOM export <b>“for sharing”</b>: living people and confidential records are anonymised.</li>
                        <li>A person deleted by mistake can be <b>restored</b> with everything attached to them.</li>
                        <li>Settings → Maintenance: check of saved web links, with the new address or an archived copy when a page has disappeared.</li>
                    </ul>
                </div>
                    </details>
                    <details class="presentation-version">
                        <summary>Version 0.2.1 <small>Search sweeps across borders, and fixes</small></summary>
                        <div class="presentation-version-body">
                    <h4>Search sweeps across borders</h4>
                    <ul>
                        <li>Search sweeps no longer stop at the border: you can add the municipalities of <b>Belgium, Switzerland, Luxembourg, Liechtenstein, Germany, Italy, Austria and Spain</b>, as well as those of <b>French overseas territories</b> (Guadeloupe, Martinique, French Guiana, Réunion, Mayotte).</li>
                        <li>Neighbouring municipalities on either side of a border are linked: a search sweep starting from Strasbourg crosses to Kehl, one starting from Hendaye crosses to Irun.</li>
                        <li>As for France, former municipalities and named localities are attached to their present-day municipality.</li>
                        <li>Each database chooses its countries (“Search sweep countries” section, with “Tick all” / “Untick all”); a country used by a search sweep cannot be removed by mistake.</li>
                    </ul>
                    <h4>Fixes</h4>
                    <ul>
                        <li>Buttons that asked you to type some text (delete a record, new investigation folder, special census, rename…) work again.</li>
                        <li>Printouts (charts, archive mission sheet, copy order form) open correctly.</li>
                        <li>Searching for the starting municipality of a search sweep, and searching for places, are much faster on a new database (from several seconds to a few hundredths).</li>
                        <li>The pencil on dashboard blocks works on a database that has never been customised; the number of people updates immediately.</li>
                        <li>Investigations: the main person is shown and can be changed.</li>
                        <li>Top menu bar: scrolling with the mouse wheel and a visible scrollbar, to reach the menus on the right on a small screen.</li>
                        <li>The “Local access” block, useless in the app, has been removed.</li>
                    </ul>
                        </div>
                    </details>
                </div>
            </details>

            <div class="presentation-callout">
                <strong>First launch</strong>
                <div>
                    <p>This beta version is not signed yet. <b>On a Mac</b>, if opening is blocked: System Settings → Privacy &amp; Security → “Open Anyway”. <b>On Windows</b>, on the “Windows protected your PC” screen: “More info” → “Run anyway”.</p>
                    <p>To check that a file has not been altered, compare its checksum with the list in <a href="download/SHA256SUMS.txt">SHA256SUMS.txt</a>.</p>
                </div>
            </div>
        </section>

        <section class="presentation-section" id="fonctionnalites">
            <header class="presentation-section-head">
                <span class="eyebrow">02 — INSIDE THE NOTEBOOK</span>
                <h2>Everything that helps you understand a family.</h2>
            </header>
            <div class="presentation-feature-grid">
                <article class="presentation-feature feature-large">
                    <span class="feature-index">A</span>
                    <h3>Build and connect</h3>
                    <p>Individual records, parents, siblings, couples, children, name variants, events and family trees.</p>
                    <ul><li>Trees, fans and hourglasses</li><li>Censuses, places and maps</li><li>Sosa, d’Aboville and DNA</li></ul>
                </article>
                <article class="presentation-feature">
                    <span class="feature-index">B</span>
                    <h3>Shape your workspace</h3>
                    <p>Menus, record blocks, dashboard and widgets, themes, page backgrounds, text and button sizes: everything can be adjusted, saved under a name and shared. A simple big-button mode for older relatives.</p>
                </article>
                <article class="presentation-feature feature-blue">
                    <span class="feature-index">C</span>
                    <h3>Document</h3>
                    <p>Photos, records, PDFs, sounds and videos, sources and confidence level; transcription of records, handwriting recognition, collections indexed page by page.</p>
                </article>
                <article class="presentation-feature feature-blue">
                    <span class="feature-index">D</span>
                    <h3>Investigate</h3>
                    <p>Investigations with hypotheses and evidence, search sweeps on a map, research workshop, archive visits, reminders, budget and correspondence.</p>
                </article>
                <article class="presentation-feature">
                    <span class="feature-index">E</span>
                    <h3>Create and pass on</h3>
                    <p>The family book, the word processor, the spreadsheet, presentations, video editing, sound and a website; and the Family treasures: letters to descendants, gazette, birth sky, games.</p>
                </article>
                <article class="presentation-feature feature-dark">
                    <span class="feature-index">F</span>
                    <h3>Local database</h3>
                    <p>People, events and research are stored in a local SQLite database on your computer: no internet needed. Automatic backups in a single file.</p>
                </article>
            </div>
        </section>

        <section class="presentation-section" id="apercu">
            <header class="presentation-section-head">
                <span class="eyebrow">03 — PREVIEW</span>
                <h2>The notebook in pictures.</h2>
                <p>A few screens from the app. Use the arrows, the ← → keys on your keyboard, or swipe the image.</p>
            </header>
            <div class="presentation-carousel" aria-roledescription="carousel" aria-label="Screenshots of the app">
                <div class="presentation-carousel-track" tabindex="0">
                <figure class="presentation-slide" id="apercu-1" aria-roledescription="slide" aria-label="1 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-01.jpg" alt="A person’s individual record: identity, parents, spouses, children and events" width="1600" height="1034" loading="eager">
                    <figcaption><span>01</span>A person’s record: identity, family and events</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-2" aria-roledescription="slide" aria-label="2 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-02.jpg" alt="Bottom of a record: media, censuses, notes, sources and external references" width="1600" height="1034" loading="lazy">
                    <figcaption><span>02</span>Media, censuses, sources and references on a record</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-3" aria-roledescription="slide" aria-label="3 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-03.jpg" alt="Tree of a couple’s descendants over several generations" width="1600" height="1034" loading="lazy">
                    <figcaption><span>03</span>Trees and diagrams: here, the descendants</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-4" aria-roledescription="slide" aria-label="4 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-04.jpg" alt="Tree of a person’s ancestors" width="1600" height="1034" loading="lazy">
                    <figcaption><span>04</span>A person’s ancestors, generation by generation</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-5" aria-roledescription="slide" aria-label="5 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-05.jpg" alt="Fan chart of the generations" width="1600" height="1034" loading="lazy">
                    <figcaption><span>05</span>The fan chart of the generations</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-6" aria-roledescription="slide" aria-label="6 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-06.jpg" alt="Individual record of a fictional person" width="1600" height="1034" loading="lazy">
                    <figcaption><span>06</span>A person’s record and family links</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-7" aria-roledescription="slide" aria-label="7 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-07.jpg" alt="Chronology of the events around a person" width="1600" height="1034" loading="lazy">
                    <figcaption><span>07</span>The chronology of a life and of the family around it</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-8" aria-roledescription="slide" aria-label="8 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-08.jpg" alt="Statistics: distribution of first names" width="1600" height="1034" loading="lazy">
                    <figcaption><span>08</span>Statistics: the most common first names</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-9" aria-roledescription="slide" aria-label="9 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-09.jpg" alt="Monograph of the municipality of Tulle" width="1600" height="1034" loading="lazy">
                    <figcaption><span>09</span>A municipality monograph: records, people, indexes</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-10" aria-roledescription="slide" aria-label="10 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-10.jpg" alt="List of people with birth, death and status" width="1600" height="1034" loading="lazy">
                    <figcaption><span>10</span>Lists: everyone, sorted and filtered</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-11" aria-roledescription="slide" aria-label="11 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-11.jpg" alt="List of the family’s occupations" width="1600" height="1034" loading="lazy">
                    <figcaption><span>11</span>The family’s occupations</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-12" aria-roledescription="slide" aria-label="12 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-12.jpg" alt="Dashboard with its widgets" width="1600" height="1034" loading="lazy">
                    <figcaption><span>12</span>The dashboard, made of widgets</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-13" aria-roledescription="slide" aria-label="13 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-13.jpg" alt="Settings: page backgrounds" width="1600" height="1034" loading="lazy">
                    <figcaption><span>13</span>Theme and colours: 15 page backgrounds, with a live preview</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-14" aria-roledescription="slide" aria-label="14 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-14.jpg" alt="Accessibility settings" width="1600" height="1034" loading="lazy">
                    <figcaption><span>14</span>Accessibility: colours, font, reading, motion</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-15" aria-roledescription="slide" aria-label="15 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-15.jpg" alt="Portrait and avatar settings" width="1600" height="1034" loading="lazy">
                    <figcaption><span>15</span>Portraits and avatars: one shape, everywhere</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-16" aria-roledescription="slide" aria-label="16 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-16.jpg" alt="Family treasures tab" width="1600" height="1034" loading="lazy">
                    <figcaption><span>16</span>✨ Family treasures</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-17" aria-roledescription="slide" aria-label="17 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-17.jpg" alt="An ancestor’s birth sky" width="1600" height="1034" loading="lazy">
                    <figcaption><span>17</span>An ancestor’s birth sky</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-18" aria-roledescription="slide" aria-label="18 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-18.jpg" alt="A family’s gazette of the year" width="1600" height="1034" loading="lazy">
                    <figcaption><span>18</span>The family’s gazette of the year</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-19" aria-roledescription="slide" aria-label="19 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-19.jpg" alt="A Klondike solitaire game in progress" width="1600" height="1034" loading="lazy">
                    <figcaption><span>19</span>🂠 108 solitaire games to play on your own</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-20" aria-roledescription="slide" aria-label="20 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-20.jpg" alt="Layout workshop" width="1600" height="1034" loading="lazy">
                    <figcaption><span>20</span>Laying out the family book</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-21" aria-roledescription="slide" aria-label="21 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-21.jpg" alt="Website editor" width="1600" height="1034" loading="lazy">
                    <figcaption><span>21</span>Your website, with its code editor</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-22" aria-roledescription="slide" aria-label="22 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-22.jpg" alt="Editing tools" width="1600" height="1034" loading="lazy">
                    <figcaption><span>22</span>All the creative tools in one place</figcaption>
                </figure>
                <figure class="presentation-slide" id="apercu-23" aria-roledescription="slide" aria-label="23 of 23">
                    <img src="/prod/Genealogie/captures/lcnda-23.jpg" alt="3D family museum" width="1600" height="1034" loading="lazy">
                    <figcaption><span>23</span>The 3D family museum</figcaption>
                </figure>


                </div>
                <div class="presentation-carousel-controls">
                    <button class="button secondary" type="button" data-carousel-prev aria-label="Previous image">←</button>
                    <div class="presentation-carousel-dots" role="group" aria-label="Choose an image"></div>
                    <button class="button secondary" type="button" data-carousel-next aria-label="Next image">→</button>
                </div>
            </div>
        </section>

        <section class="presentation-section" id="en-detail">
            <header class="presentation-section-head">
                <span class="eyebrow">04 — IN DETAIL</span>
                <h2>Every family history is unique, and so is your software.</h2>
            </header>
            <p class="presentation-intro"><strong>LCNDA is flexible, customisable genealogy software, because every family history is unique.</strong> Menus, records, dashboard, tabs, widgets, charts, event types, colours: you organise it around your family and the way you research, not the other way round, and you save your settings under a name to find them again or pass them on to a relative. Available for Mac, Windows and Linux, it brings together in one place your ancestors, their records, their photos, your sources and your ongoing research. It works without internet and without an account: your family history stays on your computer, in a file that belongs to you. Free and open source, it imports your Hérédis, MacFamilyTree or GEDCOM data directly. And it isn't only for ancestors: inventories of collections, artworks or objects, and tracking animals in the field or at home.</p>

            <div class="presentation-about-grid">
                <article class="presentation-about about-intro">
                    <h3>Software that adapts to your family</h3>
                    <p>A family of artists, sailors or farmers, a line followed over three centuries or an investigation into a single ancestor are not told in the same way. You choose the order of the menus, the blocks shown on each record and their width, the dashboard sections, and the lists, maps and charts that are useful to you. You create your own types of events and works, profiles, blocks, widgets, charts and tabs, and you set colours, fonts and display, right down to the style of the records, the left column and the page background. Your setting sets are saved under a name, and can be exported and imported from one computer to another.</p>
                </article>
                <article class="presentation-about">
                    <h3>A research notebook, not just a tree</h3>
                    <p>Most genealogy software is for recording a family. LCNDA also helps you research it:</p>
                    <ul><li>investigations with their leads, hypotheses and evidence;</li><li>search sweeps to comb through neighbouring municipalities, ring by ring, on a map;</li><li>planning your archive visits;</li><li>reminders, a research budget and tracking of your correspondence.</li></ul>
                </article>
                <article class="presentation-about">
                    <h3>Everything you need to build a family</h3>
                    <ul><li>Complete records: identity, name variants, parents, spouses, children, adoptions, witnesses, godfathers and godmothers.</li><li>More than 60 event types, and your own if you need them.</li><li>Ancestor and descendant trees, fan charts, Sosa and d’Aboville numbering.</li><li>Censuses, signatures copied from records, a confidence level for every fact.</li></ul>
                </article>
                <article class="presentation-about">
                    <h3>Your documents at the heart of your records</h3>
                    <p>Photos, records, PDFs, sounds and videos are linked to people, events, investigations or search sweeps. Sources and citations accompany every piece of information, so you always know where it comes from.</p>
                </article>
                <article class="presentation-about">
                    <h3>Places all over the world, even offline</h3>
                    <p>Every municipality in France and in more than 220 other countries and territories, with their boundaries, their neighbours (even across a border) and former merged municipalities, plus more than 5 million localities worldwide. As you type a place name, you get suggestions and GPS coordinates, with no connection. A place that can't be found can always be entered freely.</p>
                </article>
                <article class="presentation-about">
                    <h3>See your family differently</h3>
                    <p>Maps of births, marriages and migrations, chronologies, statistics on first names, occupations, ages at death… to spot at a glance what lists don't show.</p>
                </article>
                <article class="presentation-about">
                    <h3>Tell the story and pass it on</h3>
                    <p>Once the story is found, it still has to be shared. A layout workshop turns your records into <b>your family book</b>: master pages, styles, photos with text wrapped around them, cover, PDF export ready for the printer. A small <b>video editor</b> puts together home movies, animated photos, titles and music; free-form <b>boards</b> lay the investigation out flat; <b>cards</b> tell the story of a country, an occupation, a custom. And the family's animals have their place too.</p>
                </article>
                <article class="presentation-about">
                    <h3>A whole life, not just dates</h3>
                    <p>An ancestor who was a painter, musician, inventor, athlete or mayor? Tick what they were, and their record fills out with what mattered to them: works and a <b>catalogue raisonné</b>, records and concerts, patents, terms of office, awards, diplomas, press articles. Their <b>house</b> can be redrawn room by room, as a plan and in 3D, with its furniture and its inhabitants through the ages.</p>
                </article>
                <article class="presentation-about">
                    <h3>Read records from the past and from elsewhere</h3>
                    <p>A <b>transcription</b> workshop puts the image of the record and your text side by side, picks out names, dates and places, and makes a faded page readable. A record in Latin, Polish or Russian? The <b>alphabets of about forty languages</b>, with their accented letters, help you recognise the language and transliterate Cyrillic or Greek into Latin letters.</p>
                </article>
                <article class="presentation-about">
                    <h3>✨ Family treasures</h3>
                    <p>What doesn't fit in a tree: <b>letters to descendants</b> sealed until a given date, “At your age…”, dating a photo, recipes, songs and memories of the senses, an ancestor's <b>birth sky</b>, a candle, the soundscape of a period, the <b>gazette</b> of the year, a cross-stitch embroidery, a passport of places… to keep, print or give.</p>
                </article>
                <article class="presentation-about">
                    <h3>A complete creative workshop</h3>
                    <p>No need for other software: a <b>word processor</b> and a <b>spreadsheet</b> (mail merge, pivot table, solver), <b>presentations</b>, photo <b>retouching</b> with layers, <b>vector drawing</b>, <b>video editing</b>, a <b>sound studio</b> and <b>your website</b>, all linked to your records and with no internet.</p>
                </article>
                <article class="presentation-about">
                    <h3>Play with your ancestors</h3>
                    <p>The Game of the Goose with questions about the family, a jigsaw from a photo, the maze, “Who is it?” with the ancestors, portrait Memory, The right date, Battleship with ships named after your forebears, Happy Families… and <b>108 solitaire games</b> to play on your own.</p>
                </article>
                <article class="presentation-about">
                    <h3>For the whole family</h3>
                    <p>A <b>simple mode</b> with big buttons for older relatives, protected by a code, and extensive <b>accessibility</b>: high contrast, a font for dyslexia, text up to 32 px, reading aloud, reduced animations, “one thing at a time”.</p>
                </article>
                <article class="presentation-about">
                    <h3>For an inventory</h3>
                    <p>The same tools work well beyond ancestors: a collection, an artist's works with inventory number, dimensions and value (calculated total, illustrated inventory to print), the objects and furniture of a house room by room, an archive collection, or your own lists with the columns you need.</p>
                </article>
                <article class="presentation-about">
                    <h3>For tracking animals</h3>
                    <p>In the field or at home: one record per animal with its rings and marks, its sightings in photos, sounds and videos, its GPS routes (GPX, Movebank, collar) on a map, its health and weight curve, its groups and its history, censuses, and sharing with other observers.</p>
                </article>
                <article class="presentation-about">
                    <h3>A clean, checked database</h3>
                    <p>An assistant spots inconsistencies: a child born after a parent's death, a marriage after a death, improbable longevity. It also flags possible duplicates and incomplete families. A log keeps track of every change, and a deletion can be undone.</p>
                </article>
                <article class="presentation-about">
                    <h3>Arrive with your data, leave whenever you like</h3>
                    <ul><li>Direct import of Hérédis and MacFamilyTree files, without going through an export: photos, sources and tasks included.</li><li>GEDCOM import and export (5.5.1 and 7), the exchange format shared by all genealogy software.</li><li>Full backup in a single file, with the database and all the media, to keep somewhere safe or open on another computer.</li></ul>
                </article>
            </div>

            <div class="presentation-strengths" aria-label="LCNDA's strengths">
                <div><strong>Flexible and customisable</strong><span>The interface is organised around your family history, not the other way round.</span></div>
                <div><strong>Free and open</strong><span>AGPL-3.0 licence: no subscription, no paid version, open source code.</span></div>
                <div><strong>Your data stays with you</strong><span>No account, nothing sent over the internet, a SQLite file other tools can read.</span></div>
                <div><strong>Works offline</strong><span>Municipalities of 226 countries, places worldwide and a base map included.</span></div>
                <div><strong>Mac, Windows and Linux</strong><span>The same app everywhere.</span></div>
                <div><strong>Designed for research</strong><span>Not just for data entry; and for the whole family, from grandparents to children.</span></div>
                <div><strong>From tree to book, film and website</strong><span>Layout, video editing, sound and a website to pass on what you have found.</span></div>
                <div><strong>Easy to move in</strong><span>From Hérédis, MacFamilyTree or any GEDCOM-compatible software.</span></div>
            </div>
            <p class="presentation-beta-note">LCNDA is in beta: make regular backups, which the app makes easy. It is not yet signed by Apple or Microsoft, which is why you get a warning on first launch.</p>
        </section>

        <section class="presentation-section" id="faq">
            <header class="presentation-section-head">
                <span class="eyebrow">05 — FAQ</span>
                <h2>Frequently asked questions.</h2>
                <p>How to do this or that in LCNDA.</p>
            </header>
            <div class="presentation-faq-box">
                <h3>Frequently asked questions</h3>
                <input class="presentation-faq-search" id="faq-search" type="search" placeholder="🔎 Ask your question: how do I make a family book as a PDF?" aria-label="Search the FAQ" autocomplete="off">
                <p class="presentation-faq-hint" id="faq-count">How to do this or that in LCNDA.</p>
                <p class="presentation-faq-empty" id="faq-empty" hidden>No question matches this search.</p>
                <div id="faq-list"></div>
            </div>
        </section>
    </main>

     <footer class="presentation-footer">
        <span>LCNDA — THE DIGITAL ANCESTORS' NOTEBOOK · BETA VERSION · 0.9.2 · AGPL-3.0 LICENCE</span>
        <a href="#haut">Back to top ↑</a>
    </footer>
    <script src="faq-data-en.js"></script>
    <script>
    // FAQ: questions grouped by theme in a frame in section 5, expandable, with search.
    (() => {
        const list = document.getElementById('faq-list');
        const input = document.getElementById('faq-search');
        const empty = document.getElementById('faq-empty');
        const count = document.getElementById('faq-count');
        if (!list) return;
        if (typeof FAQ === 'undefined' || !Array.isArray(FAQ)) {
            empty.textContent = 'The FAQ could not be loaded: the file faq-data-en.js must be placed next to this page.';
            empty.hidden = false;
            input.disabled = true;
            return;
        }
        const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
        let nb = 0;
        const cats = FAQ.map(([title, items]) => {
            const box = el('div', 'presentation-faq-cat');
            const h = el('h3', '', title);
            h.appendChild(el('small', '', String(items.length)));
            box.appendChild(h);
            const rows = items.map(([q, a]) => {
                const d = el('details', 'presentation-faq-item');
                d.appendChild(el('summary', '', q));
                d.appendChild(el('p', '', a));
                box.appendChild(d);
                nb++;
                return { d, text: norm(q + ' ' + a) };
            });
            list.appendChild(box);
            return { box, rows };
        });
        count.textContent = 'How to do this or that in LCNDA: ' + nb + ' question' + (nb === 1 ? '' : 's') + '.';

        input.addEventListener('input', () => {
            const words = norm(input.value).split(/\s+/).filter(Boolean);
            let total = 0;
            cats.forEach(({ box, rows }) => {
                let shown = 0;
                rows.forEach(({ d, text }) => {
                    const ok = words.every(w => text.includes(w));
                    d.hidden = !ok;
                    d.open = ok && words.length > 0;
                    if (ok) shown++;
                });
                box.hidden = shown === 0;
                total += shown;
            });
            empty.hidden = total > 0;
        });
    })();
    </script>
    <script>
    // Preview carousel: it never scrolls by itself (arrows, dots, keyboard, swipe).
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
