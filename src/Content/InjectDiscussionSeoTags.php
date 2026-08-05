<?php

namespace Maria\SeoMeta\Content;

use Flarum\Api\Client;
use Flarum\Frontend\Document;
use Flarum\Http\UrlGenerator;
use Illuminate\Support\Arr;
use Maria\SeoMeta\Config;
use Maria\SeoMeta\DiscussionImageCache;
use Maria\SeoMeta\MetaDescriptionBuilder;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Registered via Extend\Frontend('forum')->content(). Extension content()
 * hooks run BEFORE the core route content (Flarum\Forum\Content\Discussion),
 * so $document->payload['apiDocument'] is not populated yet at this point -
 * this class fetches the discussion itself via the API client instead of
 * relying on that payload, so it works regardless of hook ordering.
 */
class InjectDiscussionSeoTags
{
    public function __construct(
        private Client $api,
        private UrlGenerator $url,
        private DiscussionImageCache $imageCache,
        private LoggerInterface $logger
    ) {
    }

    public function __invoke(Document $document, Request $request): void
    {
        if ($request->getAttribute('routeName') !== 'discussion') {
            return;
        }

        try {
            $this->inject($document, $request);
        } catch (Throwable $e) {
            $this->logger->error('seo-meta: fallo al inyectar tags SEO: '.$e->getMessage());
        }
    }

    private function inject(Document $document, Request $request): void
    {
        $id = Arr::get($request->getQueryParams(), 'id');

        if (!$id) {
            return;
        }

        $response = $this->api->withParentRequest($request)
            ->withQueryParams(['bySlug' => true])
            ->get("/discussions/{$id}");

        if ($response->getStatusCode() !== 200) {
            return;
        }

        $apiDocument = json_decode((string) $response->getBody());

        if (!$apiDocument || ($apiDocument->data->type ?? null) !== 'discussions') {
            return;
        }

        $discussionId = (int) $apiDocument->data->id;
        $title = $apiDocument->data->attributes->title ?? '';
        $slug = $apiDocument->data->attributes->slug ?? (string) $discussionId;
        $createdAt = $apiDocument->data->attributes->createdAt ?? null;

        if ($title === '' || !$createdAt) {
            return;
        }

        $authorId = $apiDocument->data->relationships->user->data->id ?? null;
        $author = $this->findIncluded($apiDocument, 'users', $authorId);
        $authorName = $author->attributes->displayName
            ?? $author->attributes->username
            ?? 'Comunidad Campus MarIA';

        $firstPost = $this->findFirstPost($apiDocument);
        $firstPostHtml = $firstPost->attributes->contentHtml ?? '';
        $likesCount = (int) ($firstPost->attributes->likesCount ?? 0);

        $maxLength = (int) Config::get('meta_description_max_length', 120);
        $description = MetaDescriptionBuilder::build($title, $firstPostHtml, $maxLength);
        $discussionUrl = $this->url->to('forum')->route('discussion', ['id' => $slug]);
        $imageUrl = $this->imageCache->publicUrlFor($discussionId);
        $siteName = (string) Config::get('site_name', 'Campus MarIA');

        $document->title = $title;

        // Flarum core (Frontend\Content\Meta) ya corrio antes que este hook y
        // dejo la descripcion generica del foro en $document->meta['description'].
        // Sobreescribirla aca (en vez de pushear un <meta> crudo a $document->head)
        // evita un <meta name="description"> duplicado en el <head>.
        $document->meta['description'] = $description;

        $document->head[] = '<meta property="og:type" content="article">';
        $document->head[] = '<meta property="og:title" content="'.$this->esc($title).'">';
        $document->head[] = '<meta property="og:description" content="'.$this->esc($description).'">';
        $document->head[] = '<meta property="og:url" content="'.$this->esc($discussionUrl).'">';
        $document->head[] = '<meta property="og:image" content="'.$this->esc($imageUrl).'">';
        $document->head[] = '<meta property="og:image:width" content="1200">';
        $document->head[] = '<meta property="og:image:height" content="675">';
        $document->head[] = '<meta property="og:site_name" content="'.$this->esc($siteName).'">';
        $document->head[] = '<meta name="twitter:card" content="summary_large_image">';
        $document->head[] = '<meta name="twitter:title" content="'.$this->esc($title).'">';
        $document->head[] = '<meta name="twitter:description" content="'.$this->esc($description).'">';
        $document->head[] = '<meta name="twitter:image" content="'.$this->esc($imageUrl).'">';
        $document->head[] = '<script type="application/ld+json">'.$this->buildJsonLd(
            $title,
            $description,
            $createdAt,
            $imageUrl,
            $discussionUrl,
            $authorName,
            $likesCount
        ).'</script>';
    }

    private function buildJsonLd(
        string $title,
        string $description,
        string $createdAt,
        string $imageUrl,
        string $discussionUrl,
        string $authorName,
        int $likesCount
    ): string {
        $jsonLd = [
            '@context' => 'https://schema.org',
            '@type' => 'DiscussionForumPosting',
            'headline' => $title,
            'about' => $title,
            'description' => $description,
            'datePublished' => $createdAt,
            'image' => $imageUrl,
            'url' => $discussionUrl,
            'author' => [
                '@type' => 'Person',
                'name' => $authorName,
            ],
            'interactionStatistic' => [
                '@type' => 'InteractionCounter',
                'interactionType' => 'https://schema.org/LikeAction',
                'userInteractionCount' => $likesCount,
            ],
        ];

        return json_encode($jsonLd, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private function findIncluded(object $apiDocument, string $type, ?string $id): ?object
    {
        if (!$id) {
            return null;
        }

        foreach ($apiDocument->included ?? [] as $resource) {
            if ($resource->type === $type && $resource->id === $id) {
                return $resource;
            }
        }

        return null;
    }

    private function findFirstPost(object $apiDocument): ?object
    {
        $candidates = [];

        foreach ($apiDocument->included ?? [] as $resource) {
            if ($resource->type === 'posts' && isset($resource->attributes->number)) {
                $candidates[$resource->attributes->number] = $resource;
            }
        }

        if (empty($candidates)) {
            return null;
        }

        ksort($candidates);

        return reset($candidates);
    }

    private function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }
}
