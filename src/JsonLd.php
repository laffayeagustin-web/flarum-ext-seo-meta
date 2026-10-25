<?php

namespace Maria\SeoMeta;

/**
 * JSON-LD listo para ir dentro de <script type="application/ld+json">.
 *
 * Los títulos y textos son del usuario: sin JSON_HEX_TAG, un "</script>" en un título
 * cierra la etiqueta y lo que sigue corre como JS en el <head>. Con HEX_TAG/HEX_AMP,
 * "<", ">" y "&" salen como <, >, & (el JSON es el mismo para quien lo lee).
 */
class JsonLd
{
    public static function encode(array $data): string
    {
        return json_encode(
            $data,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP
        );
    }
}
