<?php

namespace Maria\SeoMeta\Listener;

use Flarum\Discussion\Event\Started;
use Maria\SeoMeta\DiscussionImageCache;
use Maria\SeoMeta\GeminiImageClient;
use Psr\Log\LoggerInterface;
use Throwable;

class GenerateDiscussionImage
{
    public function __construct(
        private GeminiImageClient $gemini,
        private DiscussionImageCache $cache,
        private LoggerInterface $logger
    ) {
    }

    public function handle(Started $event): void
    {
        $discussion = $event->discussion;

        try {
            $bytes = $this->gemini->generateImage($this->buildPrompt($discussion->title));

            if ($bytes === null) {
                $this->logger->warning("seo-meta: no se pudo generar imagen para el tema {$discussion->id}, se usara el fallback.");

                return;
            }

            if (!$this->cache->store($discussion->id, $bytes)) {
                $this->logger->warning("seo-meta: no se pudo guardar la imagen generada para el tema {$discussion->id}, se usara el fallback.");
            }
        } catch (Throwable $e) {
            $this->logger->error("seo-meta: error generando imagen para el tema {$discussion->id}: ".$e->getMessage());
        }
    }

    private function buildPrompt(string $title): string
    {
        return 'Genera una imagen apaisada 16:9 (1200x675), sin texto ni marcas de agua, estilo profesional y moderno, '
            .'para usar como imagen de vista previa en redes sociales de un foro de marketing digital, SEO y GEO. '
            .'Debe evocar visualmente el siguiente tema de debate: "'.$title.'".';
    }
}
