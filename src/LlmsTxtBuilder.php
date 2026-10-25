<?php

namespace Maria\SeoMeta;

/**
 * Arma el texto de /llms.txt (índice corto) y /llms-full.txt (contenido).
 * Clase pura: no toca la base ni Flarum, así se prueba con php plano.
 *
 * $site: ['title', 'description', 'forum_url', 'sitemap_url', 'api_url'].
 * $discussions: lista de ['title', 'url', 'last_posted_at', 'posts' => [['author', 'content'], ...]].
 */
class LlmsTxtBuilder
{
    public const MAX_CHARS_PER_POST = 3000;
    public const MAX_CHARS_TOTAL = 200000;

    public static function index(array $site, array $discussions): string
    {
        $out = self::header($site);

        $out .= "## Para agentes y crawlers\n\n";
        $out .= '- ['.self::line($site['title'])."]({$site['forum_url']}): portada del foro.\n";
        $out .= "- [Sitemap]({$site['sitemap_url']}): todas las discusiones públicas.\n";
        $out .= "- [API pública (JSON:API)]({$site['api_url']}): lista de discusiones en JSON, sin autenticación.\n";
        $out .= "- [Contenido completo]({$site['full_url']}): el texto de las últimas discusiones en un solo archivo.\n\n";

        $out .= "## Últimas discusiones\n\n";
        foreach ($discussions as $d) {
            $out .= '- ['.self::line($d['title'])."]({$d['url']})\n";
        }

        return $out;
    }

    public static function full(array $site, array $discussions): string
    {
        $out = self::header($site);

        foreach ($discussions as $d) {
            $block = '## '.self::line($d['title'])."\n\n";
            $block .= "URL: {$d['url']}\n";
            if (!empty($d['last_posted_at'])) {
                $block .= "Última actividad: {$d['last_posted_at']}\n";
            }
            $block .= "\n";

            foreach ($d['posts'] as $p) {
                $text = self::truncate(self::plainText($p['content']), self::MAX_CHARS_PER_POST);
                if ($text === '') {
                    continue;
                }
                $block .= '**'.self::line($p['author'] ?: 'anónimo')."**: {$text}\n\n";
            }

            if (strlen($out) + strlen($block) > self::MAX_CHARS_TOTAL) {
                break;
            }
            $out .= $block;
        }

        return $out;
    }

    /** El contenido de Flarum se guarda como XML de TextFormatter: sacamos las marcas y dejamos el texto. */
    public static function plainText(string $content): string
    {
        $text = html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';

        return trim($text);
    }

    private static function header(array $site): string
    {
        $out = '# '.self::line($site['title'])."\n\n";
        $description = self::line($site['description'] ?? '');
        if ($description !== '') {
            $out .= "> {$description}\n\n";
        }

        return $out;
    }

    private static function line(string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    }

    private static function truncate(string $text, int $max): string
    {
        if (mb_strlen($text) <= $max) {
            return $text;
        }

        return rtrim(mb_substr($text, 0, $max)).'…';
    }
}
