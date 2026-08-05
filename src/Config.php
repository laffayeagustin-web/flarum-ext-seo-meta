<?php

namespace Maria\SeoMeta;

class Config
{
    private static ?array $values = null;

    public static function get(string $key, $default = null)
    {
        if (self::$values === null) {
            self::$values = require __DIR__.'/../config.php';
        }

        return self::$values[$key] ?? $default;
    }
}
