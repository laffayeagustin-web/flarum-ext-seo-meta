<?php

namespace Maria\SeoMeta\Content;

use Flarum\Frontend\Document;
use Flarum\Http\UrlGenerator;
use Illuminate\Database\ConnectionInterface;
use Maria\SeoMeta\Config;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Inyecta title/meta/OG/Twitter/JSON-LD en la pagina de inicio del foro
 * (routeName 'default' -> https://campus.maria.ar/public/, y 'index' ->
 * /all, que sirven el mismo contenido). Sigue el mismo patron que
 * InjectDiscussionSeoTags: no depende del orden de los content() hooks,
 * solo lee el request/route y arma los tags con datos propios.
 */
class InjectForumIndexSeoTags
{
    private const ROUTES = ['default', 'index'];

    public function __construct(
        private UrlGenerator $url,
        private ConnectionInterface $db,
        private LoggerInterface $logger
    ) {
    }

    public function __invoke(Document $document, Request $request): void
    {
        if (!in_array($request->getAttribute('routeName'), self::ROUTES, true)) {
            return;
        }

        try {
            $this->inject($document);
        } catch (Throwable $e) {
            $this->logger->error('seo-meta: fallo al inyectar tags SEO del index del foro: '.$e->getMessage());
        }
    }

    private function inject(Document $document): void
    {
        $title = 'Campus MarIA: Foro de SEO y GEO con IA';
        $description = 'Foro público de la comunidad MarIA GroWth: debatí SEO, GEO y Growth '
            .'Marketing con otros profesionales. Sumate al debate.';
        $ogTitle = 'Campus MarIA — Comunidad de SEO, GEO y Growth Marketing';
        $ogDescription = 'Foro público de MarIA GroWth: comunidad de marketers debatiendo SEO, GEO '
            .'y Growth Marketing con IA. Sumate y compartí tu experiencia.';

        $forumUrl = $this->url->to('forum')->path('');
        $imageUrl = $this->url->to('forum')->path('assets/seo/forum-index.jpg');
        $siteName = (string) Config::get('site_name', 'Campus MarIA');

        // El <title> del home ('/') lo arma BasicTitleDriver solo con el
        // setting forum_title, ignorando $document->title (y en /all,
        // Content\Index lo pisa igual porque corre despues que este hook) -
        // por eso el titulo SEO se configuro directamente en forum_title
        // (Admin > Basics) en vez de intentar setearlo aca.
        $document->meta['description'] = $description;

        $document->head[] = '<meta property="og:type" content="website">';
        $document->head[] = '<meta property="og:title" content="'.$this->esc($ogTitle).'">';
        $document->head[] = '<meta property="og:description" content="'.$this->esc($ogDescription).'">';
        $document->head[] = '<meta property="og:url" content="'.$this->esc($forumUrl).'">';
        $document->head[] = '<meta property="og:image" content="'.$this->esc($imageUrl).'">';
        $document->head[] = '<meta property="og:image:width" content="1200">';
        $document->head[] = '<meta property="og:image:height" content="675">';
        $document->head[] = '<meta property="og:site_name" content="'.$this->esc($siteName).'">';
        $document->head[] = '<meta name="twitter:card" content="summary_large_image">';
        $document->head[] = '<meta name="twitter:title" content="'.$this->esc($ogTitle).'">';
        $document->head[] = '<meta name="twitter:description" content="'.$this->esc($ogDescription).'">';
        $document->head[] = '<meta name="twitter:image" content="'.$this->esc($imageUrl).'">';
        $document->head[] = '<script type="application/ld+json">'.$this->buildJsonLd(
            $title,
            $description,
            $forumUrl,
            $imageUrl
        ).'</script>';
    }

    private function buildJsonLd(string $title, string $description, string $forumUrl, string $imageUrl): string
    {
        $jsonLd = [
            '@context' => 'https://schema.org',
            '@type' => 'CollectionPage',
            '@id' => $forumUrl.'#webpage',
            'url' => $forumUrl,
            'name' => $title,
            'description' => $description,
            'inLanguage' => 'es',
            'image' => $imageUrl,
            'isPartOf' => [
                '@type' => 'WebSite',
                '@id' => 'https://maria.ar/#website',
                'name' => 'MarIA GroWth Marketing',
                'url' => 'https://maria.ar/',
            ],
            'about' => [
                '@type' => ['Organization', 'ResearchOrganization', 'Consortium'],
                'name' => 'MarIA GroWth',
                'alternateName' => 'MarIA GroWth Marketing',
                'url' => 'https://maria.ar/',
                'description' => 'Comunidad de Growth Marketing e IA. Colectivo de Marketers, '
                    .'Developers y Fonders de investigación operando bajo la lógica Build in Public, '
                    .'enfocado en GEO y protocolos abiertos.',
                'founder' => [
                    '@type' => 'Person',
                    'name' => 'Agustín Laffaye',
                    'url' => 'https://maria.ar/sobre-agus-laffaye/',
                ],
                'sameAs' => [
                    'https://www.linkedin.com/in/agusdigital',
                    'https://www.instagram.com/aguslaffaye',
                ],
            ],
            'publisher' => [
                '@type' => ['Organization', 'ResearchOrganization', 'Consortium'],
                'name' => 'MarIA GroWth',
                'url' => 'https://maria.ar/',
            ],
            'mainEntity' => [
                '@type' => 'ItemList',
                'name' => 'Temas de debate recientes',
                'itemListElement' => $this->buildItemList(),
            ],
        ];

        return json_encode($jsonLd, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private function buildItemList(): array
    {
        $rows = $this->db->table('discussions')
            ->leftJoin('users', 'users.id', '=', 'discussions.user_id')
            ->where('discussions.is_private', false)
            ->whereNull('discussions.hidden_at')
            ->where('discussions.is_approved', true)
            ->orderByDesc('discussions.last_posted_at')
            ->limit(10)
            ->get([
                'discussions.id',
                'discussions.slug',
                'discussions.title',
                'users.username',
            ]);

        $items = [];
        $position = 1;

        foreach ($rows as $row) {
            $authorName = $row->username ?? 'Comunidad Campus MarIA';

            $items[] = [
                '@type' => 'ListItem',
                'position' => $position++,
                'url' => $this->url->to('forum')->route('discussion', ['id' => "{$row->id}-{$row->slug}"]),
                'name' => $row->title,
                'author' => [
                    '@type' => 'Person',
                    'name' => $authorName,
                ],
            ];
        }

        return $items;
    }

    private function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }
}
