<?php

use Flarum\Discussion\Event\Started;
use Flarum\Extend;
use Maria\SeoMeta\Api\SitemapController;
use Maria\SeoMeta\Console\BackfillDiscussionImagesCommand;
use Maria\SeoMeta\Content\InjectDiscussionSeoTags;
use Maria\SeoMeta\Content\InjectForumIndexSeoTags;
use Maria\SeoMeta\Listener\GenerateDiscussionImage;

// Este hosting tiene proc_open/exec/symlink deshabilitados, por lo que Composer
// no puede correr para generar el autoloader de esta extensión local. Se
// registra un autoloader PSR-4 minimo a mano en su lugar (mismo patron que
// growth-bot/extend.php).
spl_autoload_register(function ($class) {
    $prefix = 'Maria\\SeoMeta\\';

    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $file = __DIR__.'/src/'.str_replace('\\', '/', $relative).'.php';

    if (is_file($file)) {
        require $file;
    }
});

return [
    (new Extend\Frontend('forum'))
        ->content(InjectDiscussionSeoTags::class)
        ->content(InjectForumIndexSeoTags::class),

    (new Extend\Routes('forum'))
        ->get('/sitemap.xml', 'seo-meta.sitemap', SitemapController::class),

    (new Extend\Event())
        ->listen(Started::class, GenerateDiscussionImage::class),

    (new Extend\Console())
        ->command(BackfillDiscussionImagesCommand::class),
];
