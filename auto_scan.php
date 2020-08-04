<?php
require 'config.php';
while (true) {

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://tqdev.com/gdpr-scanner/get.php");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, ['password' => $password]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $request = json_decode(curl_exec($ch), true);
    curl_close($ch);
    if (!$request) {
        sleep(1);
        continue;
    }

    $salt = $request['salt'];
    $url = escapeshellarg($request['url']);

    $url = preg_replace('|[^A-Za-z0-9-._~:/?#[]@!$&\'()*+,;=]|', '', $url);

    echo "$url\n";

    $lines = explode("\n", trim(shell_exec("php scan.php \"$url\"")));
    foreach ($lines as $i => $line) {
        $lines[$i] = json_decode($line, true);
    }

    $response = ['salt' => $salt, 'url' => $url, 'lines' => $lines];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://tqdev.com/gdpr-scanner/put.php");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, ['password' => $password, 'response' => json_encode($response)]);
    curl_exec($ch);
    curl_close($ch);
}
