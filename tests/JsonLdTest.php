<?php
// php tests/JsonLdTest.php — sin Flarum ni PHPUnit (el hosting no tiene Composer).
require __DIR__.'/../src/JsonLd.php';

use Maria\SeoMeta\JsonLd;

$fail = 0;
$eq = function ($got, $want, string $label) use (&$fail) {
    if ($got !== $want) { $fail++; echo "FAIL $label: ".var_export($got, true)." != ".var_export($want, true)."\n"; }
};

$data = [
    'headline' => '</script><script>alert(1)</script>',
    'description' => '<!-- & ¿qué tal? ñandú',
    'url' => 'https://campus.maria.ar/public/d/1-x',
];
$out = JsonLd::encode($data);

$eq(stripos($out, '</script'), false, 'no cierra la etiqueta script');
$eq(strpos($out, '<'), false, 'sin < crudo');
$eq(strpos($out, '>'), false, 'sin > crudo');
$eq(strpos($out, '&'), false, 'sin & crudo');
$eq(json_decode($out, true), $data, 'el JSON decodifica igual');
$eq(strpos($out, 'https://campus.maria.ar/public/d/1-x') !== false, true, 'barras sin escapar');
$eq(strpos($out, 'ñandú') !== false, true, 'unicode sin escapar');

echo $fail ? "$fail failures\n" : "ok\n";
exit($fail ? 1 : 0);
