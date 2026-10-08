<?php
declare(strict_types=1);

/**
 * Catalogue des pays des battues : data/reference/catalogue.json, livré avec l'application. Pour chaque fichier
 * geo-<pays>.sqlite.gz : nom, région (liste « Pays des battues »), taille, empreinte sha256, nombre de communes et de lieux.
 * L'application s'en sert pour proposer les pays et télécharger à la demande ceux qui ne sont pas livrés (base_url),
 * en vérifiant l'empreinte. Lancé à la fin de build-reference-europe.php, ou seul :
 *
 *   php scripts/build-catalogue.php
 */

// Adresse des fichiers téléchargés à la demande (option A proposée à Victor : dépôt public « lcnda-donnees »)
const CATALOGUE_BASE_URL = 'https://github.com/victorbaissait/lcnda-donnees/releases/latest/download/';

(static function (): void {
    $dir = dirname(__DIR__) . '/data/reference';
    // Régions de la liste « Pays des battues » (interface) ; un pays absent tombe dans « Autres »
    $regionOf = static function (string $cc): string {
        static $groups = [
            'France d’outre-mer' => 'OM NC PF WF',
            'Europe de l’Ouest' => 'BE LU NL CH LI DE AT IT SM VA MC ES PT AD MT GB IE',
            'Europe du Nord' => 'DK SE NO FI IS EE LV LT',
            'Europe centrale et de l’Est' => 'PL CZ SK HU SI RO BG UA BY MD RU',
            'Balkans et Grèce' => 'HR BA RS ME MK AL XK GR CY',
            'Afrique du Nord et Moyen-Orient' => 'MA DZ TN LY EG LB JO TR GE AM AZ SY IQ IR IL PS SA KW BH QA AE QO YE EH',
            'Amérique du Nord et centrale' => 'QC CA US MX GT BZ SV HN NI CR PA',
            'Amérique du Sud' => 'BR AR CL PE CO UY PY BO EC VE GY SR',
            'Asie' => 'JP KR KP CN TW HK MO MN RU KZ UZ KG TJ TM AF PK IN BD LK NP BT MV MM TH LA KH VN MY SG BN ID TL PH',
            'Afrique' => 'SN ML MR GN CI BF NE BJ TG GH NG GM GW SL LR CV CM TD CF GA CG CD GQ AO ST ET ER DJ SO KE UG RW BI TZ SS SD ZA NA BW ZW ZM MW MZ MG MU KM SC LS SZ',
            'Océanie' => 'AU NZ PG',
        ];
        foreach ($groups as $region => $codes) { if (in_array($cc, explode(' ', $codes), true)) { return $region; } }
        return 'Autres';
    };
    $catalogue = ['_comment' => 'Fabriqué par scripts/build-catalogue.php. base_url : où l\'application télécharge les pays absents.',
        'base_url' => getenv('LCNDA_REFERENCE_BASE_URL') ?: CATALOGUE_BASE_URL, 'version' => date('Ymd'), 'countries' => []];
    foreach (glob("{$dir}/geo-??.sqlite.gz") ?: [] as $file) {
        $cc = strtoupper(substr(basename($file), 4, 2));
        if ($cc === 'FR') { continue; }
        // Nom et nombres lus dans le fichier lui-même (décompressé dans un fichier temporaire)
        $tmp = tempnam(sys_get_temp_dir(), 'lcnda-cat');
        $in = gzopen($file, 'rb'); $out = fopen($tmp, 'wb');
        while (!gzeof($in)) { fwrite($out, (string) gzread($in, 1 << 20)); }
        gzclose($in); fclose($out);
        $db = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $info = $db->query('SELECT key, value FROM reference_info')->fetchAll(PDO::FETCH_KEY_PAIR);
        $communes = (int) $db->query('SELECT count(*) FROM commune_contours')->fetchColumn();
        $places = (int) $db->query('SELECT count(*) FROM geo_places')->fetchColumn();
        $db = null; @unlink($tmp);
        $catalogue['countries'][$cc] = ['name' => (string) ($info['country_name'] ?? $cc), 'region' => $regionOf($cc), 'file' => basename($file),
            'size' => filesize($file), 'sha256' => hash_file('sha256', $file), 'communes' => $communes, 'places' => $places,
            'source' => (string) ($info['source'] ?? '')];
    }
    ksort($catalogue['countries']);
    file_put_contents("{$dir}/catalogue.json", json_encode($catalogue, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    printf("→ catalogue.json (%d pays, %.1f Mo en tout)\n", count($catalogue['countries']), array_sum(array_column($catalogue['countries'], 'size')) / 1048576);
})();
