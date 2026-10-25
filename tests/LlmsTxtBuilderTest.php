<?php
// php tests/LlmsTxtBuilderTest.php — sin Flarum ni PHPUnit (el hosting no tiene Composer).
require __DIR__.'/../src/LlmsTxtBuilder.php';

use Maria\SeoMeta\LlmsTxtBuilder;

$fail = 0;
$eq = function ($got, $want, string $label) use (&$fail) {
    if ($got !== $want) { $fail++; echo "FAIL $label: ".var_export($got, true)." != ".var_export($want, true)."\n"; }
};
$has = function (string $hay, string $needle, string $label) use (&$fail) {
    if (strpos($hay, $needle) === false) { $fail++; echo "FAIL $label: falta ".var_export($needle, true)."\n"; }
};

$site = [
    'title' => 'Campus  MarIA',
    'description' => "Foro de SEO\ny GEO",
    'forum_url' => 'https://campus.maria.ar/public',
    'sitemap_url' => 'https://campus.maria.ar/public/sitemap.xml',
    'api_url' => 'https://campus.maria.ar/public/api/discussions',
    'full_url' => 'https://campus.maria.ar/public/llms-full.txt',
];
$discussions = [[
    'title' => 'Novedades',
    'url' => 'https://campus.maria.ar/public/d/10-novedades',
    'last_posted_at' => '2026-10-22T10:00:00-03:00',
    'posts' => [
        ['author' => 'agus', 'content' => '<t><p>Hola &amp; bienvenidos</p>   <p>a todos</p></t>'],
        ['author' => '', 'content' => '<t></t>'],
        ['author' => '', 'content' => '<t>Sin autor</t>'],
    ],
]];

$eq(LlmsTxtBuilder::plainText('<r><p>Hola &amp; <B>chau</B></p></r>'), 'Hola & chau', 'plainText');

$idx = LlmsTxtBuilder::index($site, $discussions);
$eq(strpos($idx, "# Campus MarIA\n\n> Foro de SEO y GEO\n\n"), 0, 'index header');
$has($idx, '[Sitemap](https://campus.maria.ar/public/sitemap.xml)', 'index sitemap');
$has($idx, '[API pública (JSON:API)](https://campus.maria.ar/public/api/discussions)', 'index api');
$has($idx, '- [Novedades](https://campus.maria.ar/public/d/10-novedades)', 'index discusión');
$eq(strpos($idx, 'Hola'), false, 'index no trae el texto de los posts');

$full = LlmsTxtBuilder::full($site, $discussions);
$has($full, '## Novedades', 'full título');
$has($full, 'URL: https://campus.maria.ar/public/d/10-novedades', 'full url');
$has($full, '**agus**: Hola & bienvenidos a todos', 'full post');
$has($full, '**anónimo**: Sin autor', 'full autor anónimo');
$eq(substr_count($full, '**'), 4, 'full omite el post vacío');

$long = [['title' => 'Largo', 'url' => 'u', 'last_posted_at' => '', 'posts' => [['author' => 'a', 'content' => str_repeat('x', 5000)]]]];
$out = LlmsTxtBuilder::full($site, $long);
$eq(mb_substr_count($out, 'x'), LlmsTxtBuilder::MAX_CHARS_PER_POST, 'tope por post');

$many = [];
for ($i = 0; $i < 400; $i++) {
    $many[] = ['title' => "T$i", 'url' => 'u', 'last_posted_at' => '', 'posts' => [['author' => 'a', 'content' => str_repeat('y', 2900)]]];
}
$eq(strlen(LlmsTxtBuilder::full($site, $many)) <= LlmsTxtBuilder::MAX_CHARS_TOTAL, true, 'tope total');

echo $fail ? "$fail failures\n" : "ok\n";
exit($fail ? 1 : 0);
