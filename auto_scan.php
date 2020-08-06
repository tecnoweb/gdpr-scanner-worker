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

    $time = $request['time'];
    $date = gmdate('Ymd', $time);
    $salt = $request['salt'];
    $url = $request['url'];
    echo "$url\n";

    $escaped = escapeshellarg($url);
    $lines = explode("\n", trim(shell_exec("php scan.php $escaped")));
    foreach ($lines as $i => $line) {
        $lines[$i] = json_decode($line, true);
    }

    $response = ['time' => $time, 'salt' => $salt, 'url' => $url, 'lines' => $lines];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://tqdev.com/gdpr-scanner/put.php");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, ['password' => $password, 'response' => json_encode($response)]);
    curl_exec($ch);
    curl_close($ch);
}
