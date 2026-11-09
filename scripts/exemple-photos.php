<?php
declare(strict_types=1);

/**
 * 🧪 Base d'exemple : fabrique les « photos d'époque » de la famille fictive (assets/exemple/*.jpg).
 * Tout est dessiné ici, en sépia, avec du grain et un coin de vignette : aucun visage, aucune image téléchargée.
 * Même graine = mêmes images (reproductible). Les fichiers produits sont rangés dans le dépôt ; lib/exemple.php les
 * copie dans les médias de la généalogie d'exemple.
 *
 *     php scripts/exemple-photos.php            (écrit assets/exemple/)
 *     php scripts/exemple-photos.php /un/dossier
 */

if (!function_exists('imagecreatetruecolor')) {
    fwrite(STDERR, "L'extension GD de PHP est nécessaire.\n");
    exit(1);
}
$out = $argv[1] ?? (__DIR__ . '/../assets/exemple');
if (!is_dir($out) && !mkdir($out, 0775, true) && !is_dir($out)) {
    fwrite(STDERR, "Dossier impossible à créer : $out\n");
    exit(1);
}

/** une image en niveaux de gris (0 noir → 255 blanc), passée ensuite en sépia */
function ex_canvas(int $w, int $h, int $gray = 200)
{
    $im = imagecreatetruecolor($w, $h);
    imagefill($im, 0, 0, ex_g($im, $gray));
    return $im;
}
function ex_g($im, int $v)
{
    $v = max(0, min(255, $v));
    return imagecolorallocate($im, $v, $v, $v);
}
function ex_vgrad($im, int $x1, int $y1, int $x2, int $y2, int $from, int $to): void
{
    $h = max(1, $y2 - $y1);
    for ($y = $y1; $y <= $y2; $y++) {
        imageline($im, $x1, $y, $x2, $y, ex_g($im, (int) round($from + ($to - $from) * ($y - $y1) / $h)));
    }
}
function ex_poly($im, array $pts, int $gray): void
{
    imagefilledpolygon($im, $pts, ex_g($im, $gray));
}
function ex_rect($im, int $x1, int $y1, int $x2, int $y2, int $gray): void
{
    imagefilledrectangle($im, $x1, $y1, $x2, $y2, ex_g($im, $gray));
}
/** une silhouette vue de loin (tête ronde sans aucun trait, corps), pour une photo de groupe */
function ex_figure($im, int $x, int $y, int $s, int $gray, bool $dress = false): void
{
    imagefilledellipse($im, $x, $y, (int) ($s * .42), (int) ($s * .5), ex_g($im, $gray + 18));
    if ($dress) {
        ex_poly($im, [$x - (int) ($s * .2), $y + (int) ($s * .28), $x + (int) ($s * .2), $y + (int) ($s * .28), $x + (int) ($s * .42), $y + (int) ($s * 1.55), $x - (int) ($s * .42), $y + (int) ($s * 1.55)], $gray);
    } else {
        ex_poly($im, [$x - (int) ($s * .26), $y + (int) ($s * .28), $x + (int) ($s * .26), $y + (int) ($s * .28), $x + (int) ($s * .3), $y + (int) ($s * 1.0), $x - (int) ($s * .3), $y + (int) ($s * 1.0)], $gray);
        ex_rect($im, $x - (int) ($s * .24), $y + (int) ($s * .98), $x - (int) ($s * .04), $y + (int) ($s * 1.55), $gray - 10);
        ex_rect($im, $x + (int) ($s * .04), $y + (int) ($s * .98), $x + (int) ($s * .24), $y + (int) ($s * 1.55), $gray - 10);
    }
}
/** des lignes d'écriture à la plume (des vagues, illisibles) */
function ex_script($im, int $x1, int $y1, int $x2, int $y2, int $step, int $gray): void
{
    imagesetthickness($im, 2);
    for ($y = $y1; $y < $y2; $y += $step) {
        $x = $x1 + mt_rand(0, 20);
        $end = $x2 - mt_rand(0, 90);
        $py = $y;
        while ($x < $end) {
            $wlen = mt_rand(18, 60);
            for ($i = 0; $i < $wlen && $x < $end; $i += 3) {
                $ny = $y + (int) round(sin(($x + $i) / 3.1) * mt_rand(2, 5));
                imageline($im, $x + $i, $py, $x + $i + 3, $ny, ex_g($im, $gray + mt_rand(-15, 15)));
                $py = $ny;
            }
            $x += $wlen + mt_rand(8, 14);
        }
    }
    imagesetthickness($im, 1);
}
/** sépia + grain + vignette + bord blanc de tirage */
function ex_finish($im, string $path, bool $border = true, float $vignette = .55): void
{
    $w = imagesx($im); $h = imagesy($im);
    $cx = $w / 2; $cy = $h / 2; $md = sqrt($cx * $cx + $cy * $cy);
    $out = imagecreatetruecolor($w, $h);
    for ($y = 0; $y < $h; $y++) {
        for ($x = 0; $x < $w; $x++) {
            $v = imagecolorat($im, $x, $y) & 0xFF;
            $d = sqrt(($x - $cx) ** 2 + ($y - $cy) ** 2) / $md;
            $v = $v * (1 - $vignette * $d * $d) + mt_rand(-14, 14);
            $v = max(0, min(255, $v)) / 255;
            $r = (int) round(255 * min(1, $v * 1.0 + .06));
            $g = (int) round(255 * min(1, $v * .86 + .04));
            $b = (int) round(255 * min(1, $v * .64 + .02));
            imagesetpixel($out, $x, $y, ($r << 16) | ($g << 8) | $b);
        }
    }
    if ($border) {
        $m = 16;
        $final = imagecreatetruecolor($w + 2 * $m, $h + 2 * $m);
        imagefill($final, 0, 0, imagecolorallocate($final, 242, 233, 214));
        imagecopy($final, $out, $m, $m, 0, 0, $w, $h);
        $out = $final;
    }
    imagejpeg($out, $path, 78);
}

mt_srand(1789);
$made = [];

// 1. La maison familiale (façade, toit d'ardoise, tilleul)
$im = ex_canvas(760, 540);
ex_vgrad($im, 0, 0, 760, 330, 228, 196);
ex_vgrad($im, 0, 330, 760, 540, 150, 110);
ex_poly($im, [150, 200, 610, 200, 560, 110, 200, 110], 70);          // toit
ex_rect($im, 150, 200, 610, 420, 178);                              // murs
for ($i = 0; $i < 6; $i++) { ex_rect($im, 150, 210 + $i * 36, 610, 211 + $i * 36, 165); } // assises de pierre
foreach ([190, 300, 470, 540] as $x) { ex_rect($im, $x, 230, $x + 50, 300, 52); ex_rect($im, $x + 23, 230, $x + 27, 300, 150); }
foreach ([190, 540] as $x) { ex_rect($im, $x, 330, $x + 50, 395, 52); }
ex_rect($im, 345, 320, 415, 420, 60); ex_rect($im, 340, 315, 420, 322, 120); // porte
ex_rect($im, 520, 80, 548, 140, 90);                                  // cheminée
imagefilledellipse($im, 680, 250, 170, 220, ex_g($im, 82)); ex_rect($im, 672, 330, 690, 440, 60); // tilleul
ex_poly($im, [0, 420, 760, 420, 760, 540, 0, 540], 128);
$made['maison.jpg'] = $im;

// 2. Le métier à tisser de l'atelier de tapisserie
$im = ex_canvas(760, 540, 120);
ex_vgrad($im, 0, 0, 760, 540, 110, 70);
ex_rect($im, 520, 40, 700, 260, 215); ex_rect($im, 606, 40, 614, 260, 120); ex_rect($im, 520, 146, 700, 152, 120); // fenêtre
ex_rect($im, 70, 120, 520, 140, 45); ex_rect($im, 70, 440, 520, 462, 45);   // ensouples
ex_rect($im, 60, 100, 82, 500, 40); ex_rect($im, 508, 100, 530, 500, 40);   // montants
for ($x = 92; $x < 505; $x += 5) { imageline($im, $x, 140, $x, 440, ex_g($im, 190)); } // fils de chaîne
for ($y = 300; $y < 440; $y += 3) { for ($x = 92; $x < 505; $x += 6) { $v = 120 + (int) (50 * sin($x / 25) * cos($y / 18)); imageline($im, $x, $y, $x + 5, $y, ex_g($im, $v)); } }
for ($i = 0; $i < 9; $i++) { imagefilledellipse($im, 120 + $i * 45, 470, 16, 30, ex_g($im, 170 - $i * 8)); } // bobines
$made['atelier.jpg'] = $im;

// 3. Photo de mariage : silhouettes en deux rangs devant la mairie (aucun visage)
$im = ex_canvas(760, 540);
ex_vgrad($im, 0, 0, 760, 540, 205, 160);
ex_rect($im, 60, 40, 700, 300, 182);
for ($x = 100; $x < 700; $x += 120) { ex_rect($im, $x, 80, $x + 50, 170, 120); }
ex_rect($im, 330, 180, 430, 300, 90);
ex_poly($im, [0, 420, 760, 420, 760, 540, 0, 540], 135);
$back = [[150, 230, false], [235, 225, true], [320, 232, false], [440, 228, true], [525, 232, false], [610, 226, true]];
foreach ($back as [$x, $y, $d]) { ex_figure($im, $x, $y, 120, 70, $d); }
$front = [[110, 300, true], [200, 305, false], [330, 298, false], [400, 296, true], [520, 305, true], [640, 300, false]];
foreach ($front as [$x, $y, $d]) { ex_figure($im, $x, $y, 135, 55, $d); }
imagefilledellipse($im, 400, 300, 120, 40, ex_g($im, 235)); ex_poly($im, [355, 330, 445, 330, 480, 505, 320, 505], 232); // la robe blanche
$made['mariage.jpg'] = $im;

// 4. Carte postale : le port de pêche, bateaux à voile
$im = ex_canvas(780, 520);
ex_vgrad($im, 0, 0, 780, 260, 232, 200);
ex_poly($im, [0, 210, 160, 150, 330, 190, 520, 140, 780, 200, 780, 280, 0, 280], 138);   // colline
ex_vgrad($im, 0, 280, 780, 520, 168, 120);                                            // mer
for ($y = 300; $y < 520; $y += 9) { imageline($im, mt_rand(0, 300), $y, mt_rand(400, 780), $y, ex_g($im, 185)); }
ex_rect($im, 0, 380, 260, 520, 95);                                                    // quai
foreach ([[330, 360], [470, 330], [610, 380]] as [$x, $y]) {
    ex_poly($im, [$x - 60, $y, $x + 70, $y, $x + 50, $y + 30, $x - 45, $y + 30], 40);
    ex_rect($im, $x - 2, $y - 170, $x + 2, $y, 50);
    ex_poly($im, [$x + 4, $y - 160, $x + 4, $y - 12, $x + 80, $y - 20], 215);
    ex_poly($im, [$x - 4, $y - 140, $x - 4, $y - 14, $x - 60, $y - 20], 196);
}
for ($x = 20; $x < 250; $x += 46) { ex_rect($im, $x, 330, $x + 34, 380, 150); ex_poly($im, [$x - 4, 330, $x + 38, 330, $x + 17, 310], 80); }
$made['port.jpg'] = $im;

// 5. Le bourg et son église
$im = ex_canvas(760, 540);
ex_vgrad($im, 0, 0, 760, 300, 230, 205);
ex_rect($im, 330, 120, 420, 380, 160); ex_poly($im, [320, 120, 430, 120, 375, 20], 85);      // clocher
ex_rect($im, 360, 170, 390, 220, 60);
ex_rect($im, 420, 220, 640, 380, 170); ex_poly($im, [410, 220, 650, 220, 530, 160], 95);   // nef
foreach ([[40, 250, 150], [160, 270, 120], [650, 260, 110]] as [$x, $y, $w]) { ex_rect($im, $x, $y, $x + $w, 400, 175 - $w / 10); ex_poly($im, [$x - 6, $y, $x + $w + 6, $y, $x + $w / 2, $y - 50], 90); ex_rect($im, $x + 20, $y + 40, $x + 45, $y + 80, 70); }
ex_poly($im, [0, 400, 760, 400, 760, 540, 0, 540], 150);
ex_poly($im, [300, 540, 460, 540, 400, 400, 360, 400], 185);                                 // le chemin
$made['bourg.jpg'] = $im;

// 6. Les foins à la ferme
$im = ex_canvas(760, 540);
ex_vgrad($im, 0, 0, 760, 280, 236, 210);
ex_poly($im, [0, 280, 760, 240, 760, 540, 0, 540], 150);
foreach ([[160, 330, 150], [380, 300, 110], [560, 320, 170]] as [$x, $y, $s]) { imagefilledellipse($im, $x, $y, $s, (int) ($s * 1.1), ex_g($im, 175)); imagefilledellipse($im, $x - 10, $y - 20, (int) ($s * .7), (int) ($s * .6), ex_g($im, 195)); }
imagesetthickness($im, 6); imageellipse($im, 650, 450, 110, 110, ex_g($im, 55)); imagesetthickness($im, 3);
for ($a = 0; $a < 360; $a += 30) { imageline($im, 650, 450, 650 + (int) (55 * cos(deg2rad($a))), 450 + (int) (55 * sin(deg2rad($a))), ex_g($im, 60)); }
imagesetthickness($im, 1);
ex_rect($im, 520, 420, 700, 440, 70);
ex_figure($im, 280, 360, 110, 80, false); ex_figure($im, 470, 370, 100, 78, true);
$made['foins.jpg'] = $im;

// 7. Acte de mariage (page de registre)
$im = ex_canvas(600, 820, 226);
for ($i = 0; $i < 900; $i++) { imagesetpixel($im, mt_rand(0, 599), mt_rand(0, 819), ex_g($im, mt_rand(190, 215))); }
imageline($im, 150, 40, 150, 790, ex_g($im, 170));
ex_script($im, 30, 70, 140, 300, 26, 80);
ex_script($im, 170, 60, 570, 700, 24, 60);
imageellipse($im, 470, 740, 110, 110, ex_g($im, 120)); imageellipse($im, 470, 740, 90, 90, ex_g($im, 140));
ex_script($im, 190, 720, 380, 780, 22, 50);
$made['acte-mariage.jpg'] = $im;

// 8. Feuille de recensement (tableau à colonnes)
$im = ex_canvas(820, 600, 222);
for ($i = 0; $i < 900; $i++) { imagesetpixel($im, mt_rand(0, 819), mt_rand(0, 599), ex_g($im, mt_rand(190, 210))); }
ex_rect($im, 30, 30, 790, 70, 205);
foreach ([30, 90, 250, 400, 470, 620, 790] as $x) { imageline($im, $x, 30, $x, 570, ex_g($im, 110)); }
for ($y = 70; $y <= 570; $y += 28) { imageline($im, 30, $y, 790, $y, ex_g($im, 150)); }
for ($y = 78; $y < 550; $y += 28) { if (mt_rand(0, 9) < 7) { foreach ([[95, 240], [255, 390], [405, 460], [475, 610], [625, 780]] as [$a, $b]) { ex_script($im, $a, $y + 6, $b, $y + 14, 30, 60); } } }
$made['recensement.jpg'] = $im;

// 9. Livret militaire (couverture de carton)
$im = ex_canvas(560, 780, 120);
ex_vgrad($im, 0, 0, 560, 780, 128, 100);
imagesetthickness($im, 4); imagerectangle($im, 34, 34, 526, 746, ex_g($im, 175)); imagesetthickness($im, 1);
imagerectangle($im, 46, 46, 514, 734, ex_g($im, 160));
imagefilledellipse($im, 280, 300, 160, 160, ex_g($im, 150)); imagefilledellipse($im, 280, 300, 120, 120, ex_g($im, 112));
ex_poly($im, [280, 250, 300, 300, 280, 350, 260, 300], 175);
ex_rect($im, 150, 440, 410, 452, 165); ex_rect($im, 190, 480, 370, 488, 155);
ex_script($im, 170, 560, 400, 640, 30, 190);
$made['livret-militaire.jpg'] = $im;

foreach ($made as $name => $im) {
    ex_finish($im, $out . '/' . $name, !in_array($name, ['acte-mariage.jpg', 'recensement.jpg', 'livret-militaire.jpg'], true), in_array($name, ['acte-mariage.jpg', 'recensement.jpg'], true) ? .25 : .55);
    echo $name, ' : ', filesize($out . '/' . $name), " octets\n";
}
