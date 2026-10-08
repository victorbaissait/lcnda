<?php
declare(strict_types=1);

/**
 * « Registres en ligne » d'une commune de battue : liens vers les services d'archives du pays ou de la région.
 * Liens seulement : rien n'est téléchargé. Deux sortes :
 *   - 'prefilled' : l'adresse contient déjà le nom de la commune (le site l'accepte, vérifié le 2026-10-08) ;
 *   - 'copy'      : la page de recherche s'ouvre et le nom de la commune est copié pour le coller.
 * Matricula est rangé par diocèse : sa recherche par lieu (/de/suchen/?place=) évite d'avoir à connaître le diocèse.
 */

function online_registers(PDO $pdo, string $code, string $name): array
{
    $cc = preg_match('/^([A-Z]{2})-/', $code, $m) ? $m[1] : 'FR';
    $q = rawurlencode($name);
    $links = [];
    $add = static function (string $label, string $url, string $kind, string $note = '') use (&$links): void {
        $links[] = ['label' => $label, 'url' => $url, 'kind' => $kind, 'note' => $note];
    };
    $matricula = static fn() => $add('Matricula (registres paroissiaux)', "https://data.matricula-online.eu/de/suchen/?place={$q}", 'prefilled', 'Recherche des paroisses par lieu ; registres rangés par diocèse.');
    // Région (Land, kraj, province…) d'après les lieux du répertoire rattachés à cette commune
    $stmt = $pdo->prepare("SELECT state FROM places WHERE admin4_code=? AND COALESCE(state,'')<>'' GROUP BY state ORDER BY COUNT(*) DESC LIMIT 1");
    $stmt->execute([$code]);
    $state = (string) ($stmt->fetchColumn() ?: '');
    $stmt->closeCursor();

    switch ($cc) {
        case 'FR':
        case 'OM':
            $dept = str_starts_with($code, '97') ? substr($code, 0, 3) : substr($code, 0, 2);
            foreach (departmental_archives_seed() as $row) {
                if ((string) $row['code'] === $dept && trim((string) $row['search_url']) !== '') {
                    $add((string) $row['service'], (string) $row['search_url'], 'copy', 'État civil et registres paroissiaux numérisés du département.');
                    break;
                }
            }
            if (str_starts_with($code, '97')) {
                $add('Archives nationales d\'outre-mer (état civil)', 'http://anom.archivesnationales.culture.gouv.fr/caomec2/', 'copy', 'Registres d\'état civil des colonies et de l\'outre-mer.');
            }
            break;
        case 'BE':
            $add('Archives de l\'État en Belgique (Agatha)', 'https://agatha.arch.be/fr/search/genealogie/', 'copy', 'Registres paroissiaux jusqu\'en 1796, état civil de 1796 à 1920.');
            break;
        case 'LU':
            $matricula();
            $add('Archives nationales de Luxembourg', 'https://anlux.public.lu/', 'copy');
            break;
        case 'DE':
            $matricula();
            $add('Archion (registres protestants)', 'https://www.archion.de/', 'copy', 'Payant pour consulter les images.');
            break;
        case 'AT':
            $matricula();
            $add('GenTeam (index autrichiens)', 'https://www.genteam.at/', 'copy', 'Inscription gratuite.');
            break;
        case 'PL':
            $add('Szukajwarchiwach (Archives de l\'État polonaises)', 'https://www.szukajwarchiwach.gov.pl/', 'copy', 'Registres numérisés des archives d\'État.');
            $add('Geneteka (index des actes)', 'https://geneteka.genealodzy.pl/', 'copy', 'Choisir d\'abord la voïvodie, puis taper le lieu.');
            $matricula();
            break;
        case 'IT':
        case 'SM':
        case 'VA':
            $add('Portale Antenati (Archives d\'État italiennes)', "https://antenati.cultura.gov.it/search-registry/?localita={$q}", 'prefilled', 'État civil napoléonien, de la Restauration et italien.');
            break;
        case 'ES':
        case 'AD':
            $add('PARES (Archives espagnoles)', 'https://pares.mcu.es/ParesBusquedas20/catalogo/search', 'copy');
            break;
        case 'PT':
            $add('Digitarq (Archives portugaises)', 'https://digitarq.arquivos.pt/', 'copy', 'Registres paroissiaux numérisés des archives de district.');
            break;
        case 'CZ':
            foreach (czech_regional_archives($state) as [$label, $url]) { $add($label, $url, 'copy', 'Registres paroissiaux (matriky) numérisés.'); }
            break;
        case 'SI':
        case 'HR':
        case 'BA':
        case 'RS':
            $matricula();
            break;
        case 'NL':
            $add('Open Archives (archives néerlandaises et belges)', 'https://www.openarchieven.nl/', 'copy');
            $add('WieWasWie', 'https://www.wiewaswie.nl/', 'copy');
            break;
        case 'LI':
            $add('Archives du Liechtenstein (e-archiv)', 'https://www.e-archiv.li/', 'copy');
            break;
        case 'QC':
            $add('BAnQ Advitam (archives du Québec)', 'https://advitam.banq.qc.ca/', 'copy');
            $add('BAnQ numérique', 'https://numerique.banq.qc.ca/', 'copy');
            $add('PRDH (actes du Québec ancien)', 'https://www.prdh-igd.com/', 'copy', 'Baptêmes, mariages et sépultures avant 1850.');
            break;
        case 'GB':
            $add('FreeREG (registres paroissiaux anglais)', 'https://www.freereg.org.uk/', 'copy');
            break;
        case 'IE':
            $add('Irish Genealogy (état civil irlandais)', 'https://civilrecords.irishgenealogy.ie/', 'copy');
            break;
        case 'NO':
            $add('Digitalarkivet (Archives norvégiennes)', 'https://www.digitalarkivet.no/', 'copy');
            break;
        case 'SE':
            $add('Riksarkivet (Archives suédoises)', 'https://sok.riksarkivet.se/', 'copy');
            break;
        case 'DK':
            $add('Arkivalieronline (Archives danoises)', 'https://www.sa.dk/ao-soegesider/da/', 'copy');
            break;
        case 'EE':
            $add('Rahvusarhiiv (Archives estoniennes)', 'https://www.ra.ee/', 'copy');
            break;
        case 'LV':
            $add('Raduraksti (Archives lettones)', 'https://www.raduraksti.arhivi.lv/', 'copy');
            break;
        case 'LT':
            $add('Epaveldas (registres lituaniens)', 'https://www.epaveldas.lt/', 'copy');
            break;
    }
    // Partout : FamilySearch (gratuit, compte demandé pour certaines images)
    $add('FamilySearch : actes indexés de ce lieu', "https://www.familysearch.org/search/record/results?q.anyPlace={$q}", 'prefilled', 'Compte gratuit demandé.');
    $add('FamilySearch : catalogue des registres de ce lieu', "https://www.familysearch.org/search/catalog/results?count=20&query=%2Bplace%3A{$q}", 'prefilled', 'Registres microfilmés, souvent consultables en ligne.');
    return ['code' => $code, 'name' => $name, 'country' => commune_country_name($code), 'region' => $state, 'links' => $links];
}

/** Archives régionales tchèques (Státní oblastní archiv) selon le kraj ; Vysočina est partagée entre Třeboň et Brno. */
function czech_regional_archives(string $state): array
{
    $soa = [
        'praha' => ['SOA Praha (Prague, Bohême centrale)', 'https://ebadatelna.soapraha.cz/'],
        'trebon' => ['SOA Třeboň (Bohême du Sud)', 'https://digi.ceskearchivy.cz/'],
        'plzen' => ['SOA Plzeň : Porta fontium (Bohême de l\'Ouest)', 'https://www.portafontium.eu/'],
        'litomerice' => ['SOA Litoměřice (Bohême du Nord)', 'https://vademecum.soalitomerice.cz/'],
        'zamrsk' => ['SOA Zámrsk (Bohême de l\'Est)', 'https://aron.vychodoceskearchivy.cz/apps/matriky/'],
        'brno' => ['MZA Brno : Acta Publica (Moravie du Sud)', 'https://www.mza.cz/actapublica/'],
        'opava' => ['ZA Opava (Moravie du Nord, Silésie)', 'https://matriky.archives.cz/'],
    ];
    $s = ascii_fold(mb_strtolower($state));
    $keys = match (true) {
        str_contains($s, 'praha') || str_contains($s, 'prague') || str_contains($s, 'stredocesk') => ['praha'],
        str_contains($s, 'jihocesk') => ['trebon'],
        str_contains($s, 'plzen') || str_contains($s, 'karlovar') => ['plzen'],
        str_contains($s, 'ustec') || str_contains($s, 'libere') => ['litomerice'],
        str_contains($s, 'kralovehrad') || str_contains($s, 'pardubic') => ['zamrsk'],
        str_contains($s, 'jihomorav') || str_contains($s, 'zlin') => ['brno'],
        str_contains($s, 'vysocin') => ['trebon', 'brno'],
        str_contains($s, 'moravskoslez') || str_contains($s, 'olomouc') => ['opava'],
        default => array_keys($soa),
    };
    return array_map(static fn($k) => $soa[$k], $keys);
}
