<?php
declare(strict_types=1);

/**
 * Protection contre le « DNS rebinding » : un site web dont le nom pointe vers 127.0.0.1 deviendrait,
 * pour le navigateur, la même origine que l'application et pourrait lire ou modifier la base.
 * On n'accepte donc que les noms locaux (localhost, 127.0.0.1, ::1, *.localhost) et ceux que
 * l'utilisateur ajoute lui-même dans GENEALOGY_ALLOWED_HOSTS (liste séparée par des virgules,
 * par ex. « lcnda.test,192.168.1.20 » pour MAMP ou une tablette du réseau local).
 * Pour une écriture (POST…), un en-tête Origin doit désigner ce même hôte.
 */
function lcnda_host_name(string $hostHeader): string
{
    $h = strtolower(trim($hostHeader));
    if ($h === '') return '';
    if ($h[0] === '[') {                       // [::1]:8080
        $end = strpos($h, ']');
        return $end === false ? $h : substr($h, 1, $end - 1);
    }
    $colon = strrpos($h, ':');
    if ($colon !== false && substr_count($h, ':') === 1) $h = substr($h, 0, $colon);
    return rtrim($h, '.');
}

function lcnda_host_allowed(string $host): bool
{
    if ($host === '') return false;
    if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)) return true;
    if (str_ends_with($host, '.localhost')) return true;
    $extra = (string) getenv('GENEALOGY_ALLOWED_HOSTS');
    if ($extra !== '') {
        foreach (explode(',', strtolower($extra)) as $allowed) {
            if (trim($allowed) !== '' && lcnda_host_name(trim($allowed)) === $host) return true;
        }
    }
    return false;
}

/** true si la requête peut continuer ; sinon répond 403 et renvoie false. */
function lcnda_host_guard(): bool
{
    if (PHP_SAPI === 'cli') return true;
    $host = lcnda_host_name((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $ok = lcnda_host_allowed($host);
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($ok && !in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($origin !== '' && $origin !== 'null') {
            $originHost = lcnda_host_name((string) parse_url($origin, PHP_URL_HOST) . '');
            if ($originHost === '' || $originHost !== $host) $ok = false;
        } elseif ($origin === 'null') {
            $ok = false;
        }
    }
    if ($ok) return true;
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Accès refusé : l'application n'accepte que les adresses locales (localhost, 127.0.0.1). "
        . "Pour une autre adresse, ajoute-la dans la variable GENEALOGY_ALLOWED_HOSTS.";
    return false;
}
