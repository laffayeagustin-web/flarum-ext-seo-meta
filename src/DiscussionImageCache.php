<?php

namespace Maria\SeoMeta;

use Flarum\Foundation\Paths;
use Flarum\Http\UrlGenerator;

class DiscussionImageCache
{
    private const WIDTH = 1200;
    private const HEIGHT = 675;

    public function __construct(private Paths $paths, private UrlGenerator $url)
    {
    }

    public function exists(int $discussionId): bool
    {
        return is_file($this->path($discussionId));
    }

    public function store(int $discussionId, string $binaryImage): bool
    {
        $resized = $this->resizeToCover($binaryImage, self::WIDTH, self::HEIGHT);

        if ($resized === null) {
            return false;
        }

        $dir = dirname($this->path($discussionId));
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $tmpPath = $this->path($discussionId).'.tmp-'.bin2hex(random_bytes(4));

        if (file_put_contents($tmpPath, $resized) === false) {
            return false;
        }

        return rename($tmpPath, $this->path($discussionId));
    }

    public function publicUrlFor(int $discussionId): string
    {
        if ($this->exists($discussionId)) {
            return $this->url->to('forum')->path('assets/seo/'.$discussionId.'.jpg');
        }

        return $this->url->to('forum')->path(Config::get('default_og_image', 'assets/seo/default-og.jpg'));
    }

    private function path(int $discussionId): string
    {
        return $this->paths->public.'/assets/seo/'.$discussionId.'.jpg';
    }

    private function resizeToCover(string $binaryImage, int $targetWidth, int $targetHeight): ?string
    {
        $source = @imagecreatefromstring($binaryImage);

        if ($source === false) {
            return null;
        }

        $sourceWidth = imagesx($source);
        $sourceHeight = imagesy($source);

        $sourceRatio = $sourceWidth / $sourceHeight;
        $targetRatio = $targetWidth / $targetHeight;

        if ($sourceRatio > $targetRatio) {
            $cropHeight = $sourceHeight;
            $cropWidth = (int) round($sourceHeight * $targetRatio);
        } else {
            $cropWidth = $sourceWidth;
            $cropHeight = (int) round($sourceWidth / $targetRatio);
        }

        $cropX = (int) (($sourceWidth - $cropWidth) / 2);
        $cropY = (int) (($sourceHeight - $cropHeight) / 2);

        $destination = imagecreatetruecolor($targetWidth, $targetHeight);

        imagecopyresampled(
            $destination,
            $source,
            0,
            0,
            $cropX,
            $cropY,
            $targetWidth,
            $targetHeight,
            $cropWidth,
            $cropHeight
        );

        ob_start();
        imagejpeg($destination, null, 85);
        $encoded = ob_get_clean();

        imagedestroy($source);
        imagedestroy($destination);

        return $encoded === false ? null : $encoded;
    }
}
