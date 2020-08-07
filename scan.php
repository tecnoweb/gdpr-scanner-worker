<?php
$url = $argv[1];
$domain = parse_url($url, PHP_URL_HOST);
$domain = preg_replace('|[^a-zA-Z0-9\.]+|', '', $domain);
$pid = shell_exec('nohup chromium-browser --headless --incognito --remote-debugging-port=9222 > /dev/null 2>&1 & echo -n $!');
$data = shell_exec('chrome-har-capturer -g 1000 ' . escapeshellcmd($url) . ' 2>/dev/null');
posix_kill($pid, SIGTERM);
$data = json_decode($data, true);
$domains = [];
$ports = [];
$anonimyzeFlags = [];
foreach ($data['log']['entries'] as $entry) {
    if (($entry['request']['url'] ?? null) !== null) {
        $url = parse_url($entry['request']['url']);
        $domains[$url['host']] = $url['host'];
        $ports[$url['host']] = $url['port'] ?? ($url['scheme'] === 'http' ? 80 : 443);

        if ($url['host'] === 'www.google-analytics.com' && strpos($url['path'], '/collect') !== false) {
            parse_str($entry['request']['postData']['text'] ?? '', $params);
            $params = array_merge($params, array_combine(array_column($entry['request']['queryString'] ?? [], 'name'), array_column($entry['request']['queryString'] ?? [], 'value')));
            $anonimyzeFlags[$url['host']] = ($anonimyzeFlags[$url['host']] ?? false) || (($params['aip'] ?? '') === '1');
        }
    }
}
$domains = array_values(array_unique(array_keys($domains)));
$ips = [];
foreach ($domains as $i => $domain) {
    $ip = gethostbyname($domain);
    if ($ip == $domain) {
        $domains[$i] = null;
    } else {
        $ips[$domain] = $ip;
    }
}
$domains = array_values(array_filter($domains));
$pings = [];
for ($i = 0; $i < 3; $i++) {
    foreach ($ips as $domain => $ip) {
        if (!isset($pings[$ip])) {
            $pings[$ip] = 1000;
        }
        usleep(10000);
        $socket = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
        $connect_timeval = array(
            "sec" => 1,
            "usec" => 0,
        );
        socket_set_option(
            $socket,
            SOL_SOCKET,
            SO_SNDTIMEO,
            $connect_timeval
        );
        socket_set_option(
            $socket,
            SOL_SOCKET,
            SO_RCVTIMEO,
            $connect_timeval
        );
        $time = 0;
        $port = $ports[$domain];
        $start = microtime(true);
        if ($socket && socket_connect($socket, $ip, $port)) {
            $time = round(1000 * (microtime(true) - $start));
            socket_close($socket);
        }
        if ($time > 0) {
            $pings[$ip] = min($pings[$ip], $time);
        }
    }
}
$locations = [];
if ($ips) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "http://ip-api.com/batch?fields=continentCode,country,org");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(array_values($ips)));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $locations = json_decode(curl_exec($ch), true);
    curl_close($ch);
}
$lines = [];
foreach ($domains as $i => $domain) {
    $location = $locations[$i];
    $ip = $ips[$domain];
    $ping = $pings[$ip];
    $continent = $location['continentCode'] == 'EU' ? 'EU' : '';
    $country = $location['country'];
    $organization = $location['org'];
    $anonimyzeFlag = $anonimyzeFlags[$domain] ?? null;
    $line = compact('domain', 'ping', 'continent', 'country', 'organization', 'anonimyzeFlag');
    $lines[] = $line;
}

foreach ($lines as $line) {
    echo json_encode(array_values($line)) . "\n";
}
