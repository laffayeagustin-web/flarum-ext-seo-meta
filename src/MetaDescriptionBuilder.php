<?php

namespace Maria\SeoMeta;

class MetaDescriptionBuilder
{
    public static function build(string $title, string $firstPostHtml, int $maxLength = 120): string
    {
        $plainText = trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($firstPostHtml), ENT_QUOTES)));

        $source = $plainText !== '' ? $plainText : $title;

        if (mb_strlen($source) <= $maxLength) {
            return $source;
        }

        $truncated = mb_substr($source, 0, $maxLength);
        $lastSpace = mb_strrpos($truncated, ' ');

        if ($lastSpace !== false) {
            $truncated = mb_substr($truncated, 0, $lastSpace);
        }

        return rtrim($truncated, " .,;:-").'…';
    }
}
