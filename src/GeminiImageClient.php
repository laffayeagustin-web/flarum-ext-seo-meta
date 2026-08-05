<?php

namespace Maria\SeoMeta;

use GuzzleHttp\Client;
use Throwable;

class GeminiImageClient
{
    private Client $http;

    public function __construct()
    {
        $this->http = new Client([
            'base_uri' => 'https://generativelanguage.googleapis.com/v1beta/',
            'timeout' => Config::get('image_generation_timeout_seconds', 25),
        ]);
    }

    /**
     * Generates a landscape 16:9 image related to the given prompt.
     * Returns raw binary image bytes, or null if generation is unavailable/failed.
     * Never throws — callers must be able to fall back safely.
     */
    public function generateImage(string $prompt): ?string
    {
        $apiKey = Config::get('gemini_api_key');

        if (!$apiKey) {
            return null;
        }

        $model = Config::get('gemini_image_model', 'gemini-2.5-flash-image');

        try {
            $response = $this->http->post("models/{$model}:generateContent", [
                'query' => ['key' => $apiKey],
                'json' => [
                    'contents' => [
                        ['role' => 'user', 'parts' => [['text' => $prompt]]],
                    ],
                    'generationConfig' => [
                        'responseModalities' => ['IMAGE'],
                    ],
                ],
            ]);

            $decoded = json_decode((string) $response->getBody(), true);

            if (!is_array($decoded)) {
                return null;
            }

            return $this->extractInlineImage($decoded);
        } catch (Throwable $e) {
            return null;
        }
    }

    private function extractInlineImage(array $decoded): ?string
    {
        $parts = $decoded['candidates'][0]['content']['parts'] ?? [];

        foreach ($parts as $part) {
            $data = $part['inlineData']['data'] ?? $part['inline_data']['data'] ?? null;

            if ($data) {
                $binary = base64_decode($data, true);

                return $binary === false ? null : $binary;
            }
        }

        return null;
    }
}
