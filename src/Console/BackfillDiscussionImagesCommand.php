<?php

namespace Maria\SeoMeta\Console;

use Flarum\Console\AbstractCommand;
use Illuminate\Database\ConnectionInterface;
use Maria\SeoMeta\DiscussionImageCache;
use Maria\SeoMeta\GeminiImageClient;
use Symfony\Component\Console\Input\InputOption;
use Throwable;

class BackfillDiscussionImagesCommand extends AbstractCommand
{
    public function __construct(
        private GeminiImageClient $gemini,
        private DiscussionImageCache $cache,
        private ConnectionInterface $db
    ) {
        parent::__construct();
    }

    protected function configure()
    {
        $this
            ->setName('seo-meta:backfill-images')
            ->setDescription('Genera imagenes 16:9 con Gemini para temas existentes que aun no tienen una.')
            ->addOption('limit', null, InputOption::VALUE_OPTIONAL, 'Maximo de temas a procesar', 50)
            ->addOption('force', null, InputOption::VALUE_NONE, 'Regenerar aunque ya exista una imagen cacheada');
    }

    protected function fire()
    {
        $limit = (int) $this->input->getOption('limit');
        $force = (bool) $this->input->getOption('force');

        $discussions = $this->db->table('discussions')
            ->where('is_private', false)
            ->whereNull('hidden_at')
            ->where('is_approved', true)
            ->orderBy('id')
            ->get(['id', 'title']);

        $processed = 0;

        foreach ($discussions as $discussion) {
            if ($processed >= $limit) {
                break;
            }

            if (!$force && $this->cache->exists((int) $discussion->id)) {
                continue;
            }

            $processed++;

            try {
                $bytes = $this->gemini->generateImage($this->buildPrompt($discussion->title));

                if ($bytes === null) {
                    $this->error("Tema {$discussion->id}: no se pudo generar imagen, se deja el fallback.");

                    continue;
                }

                if ($this->cache->store((int) $discussion->id, $bytes)) {
                    $this->info("Tema {$discussion->id}: imagen generada.");
                } else {
                    $this->error("Tema {$discussion->id}: la imagen se genero pero no se pudo guardar.");
                }
            } catch (Throwable $e) {
                $this->error("Tema {$discussion->id}: error - ".$e->getMessage());
            }
        }

        $this->info("Procesados: {$processed}.");
    }

    private function buildPrompt(string $title): string
    {
        return 'Genera una imagen apaisada 16:9 (1200x675), sin texto ni marcas de agua, estilo profesional y moderno, '
            .'para usar como imagen de vista previa en redes sociales de un foro de marketing digital, SEO y GEO. '
            .'Debe evocar visualmente el siguiente tema de debate: "'.$title.'".';
    }
}
