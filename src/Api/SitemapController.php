<?php

namespace Maria\SeoMeta\Api;

use Flarum\Http\UrlGenerator;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\XmlResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class SitemapController implements RequestHandlerInterface
{
    public function __construct(private ConnectionInterface $db, private UrlGenerator $url)
    {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $rows = $this->db->table('discussions')
            ->where('is_private', false)
            ->whereNull('hidden_at')
            ->where('is_approved', true)
            ->orderBy('id')
            ->get(['id', 'slug', 'created_at', 'last_posted_at']);

        return new XmlResponse($this->buildXml($rows));
    }

    private function buildXml(iterable $rows): string
    {
        $urls = '';

        foreach ($rows as $row) {
            $loc = $this->url->to('forum')->route('discussion', ['id' => "{$row->id}-{$row->slug}"]);
            $lastmod = $this->toAtomString($row->last_posted_at ?? $row->created_at);

            $urls .= '<url>'
                .'<loc>'.$this->esc($loc).'</loc>'
                .'<lastmod>'.$this->esc($lastmod).'</lastmod>'
                .'</url>';
        }

        return '<?xml version="1.0" encoding="UTF-8"?>'
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            .$urls
            .'</urlset>';
    }

    private function toAtomString(?string $datetime): string
    {
        if (!$datetime) {
            return '';
        }

        $timestamp = strtotime($datetime);

        return $timestamp === false ? '' : date(DATE_ATOM, $timestamp);
    }

    private function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
}
