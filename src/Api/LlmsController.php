<?php

namespace Maria\SeoMeta\Api;

use Flarum\Http\UrlGenerator;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\TextResponse;
use Maria\SeoMeta\LlmsTxtBuilder;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/** Sirve /llms.txt y /llms-full.txt (las dos rutas apuntan acá; se distinguen por el path). */
class LlmsController implements RequestHandlerInterface
{
    private const LIMIT_INDEX = 100;
    private const LIMIT_FULL = 50;

    public function __construct(
        private ConnectionInterface $db,
        private UrlGenerator $url,
        private SettingsRepositoryInterface $settings
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $full = str_ends_with($request->getUri()->getPath(), 'llms-full.txt');

        $site = [
            'title' => (string) $this->settings->get('forum_title', 'Campus MarIA'),
            'description' => (string) $this->settings->get('forum_description', ''),
            'forum_url' => $this->url->to('forum')->base(),
            'sitemap_url' => $this->url->to('forum')->path('sitemap.xml'),
            'api_url' => $this->url->to('api')->path('discussions'),
            'full_url' => $this->url->to('forum')->path('llms-full.txt'),
        ];

        $discussions = $this->discussions($full ? self::LIMIT_FULL : self::LIMIT_INDEX, $full);
        $body = $full ? LlmsTxtBuilder::full($site, $discussions) : LlmsTxtBuilder::index($site, $discussions);

        return new TextResponse($body, 200, [
            'Content-Type' => 'text/plain; charset=utf-8',
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    private function discussions(int $limit, bool $withPosts): array
    {
        // Mismo filtro de invitado que el sitemap. No mira permisos de tags (limitación conocida).
        $rows = $this->db->table('discussions')
            ->where('is_private', false)
            ->whereNull('hidden_at')
            ->where('is_approved', true)
            ->orderByDesc('last_posted_at')
            ->limit($limit)
            ->get(['id', 'slug', 'title', 'last_posted_at']);

        $posts = $withPosts ? $this->postsByDiscussion($rows->pluck('id')->all()) : [];

        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'title' => (string) $row->title,
                'url' => $this->url->to('forum')->route('discussion', ['id' => "{$row->id}-{$row->slug}"]),
                'last_posted_at' => $row->last_posted_at ? date(DATE_ATOM, strtotime($row->last_posted_at)) : '',
                'posts' => $posts[$row->id] ?? [],
            ];
        }

        return $out;
    }

    private function postsByDiscussion(array $ids): array
    {
        if (!$ids) {
            return [];
        }

        $rows = $this->db->table('posts')
            ->leftJoin('users', 'users.id', '=', 'posts.user_id')
            ->whereIn('posts.discussion_id', $ids)
            ->where('posts.type', 'comment')
            ->whereNull('posts.hidden_at')
            ->where('posts.is_approved', true)
            ->orderBy('posts.discussion_id')
            ->orderBy('posts.number')
            ->get(['posts.discussion_id', 'posts.content', 'users.username']);

        $by = [];
        foreach ($rows as $row) {
            $by[$row->discussion_id][] = ['author' => (string) $row->username, 'content' => (string) $row->content];
        }

        return $by;
    }
}
