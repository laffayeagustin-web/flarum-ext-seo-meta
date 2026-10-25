# CLAUDE.md — seo-meta

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Extensión de Flarum (`flarum/core ^1.8`, namespace `Maria\SeoMeta\`) para Campus MarIA: sitemap, meta
tags, Open Graph / Twitter Card, JSON-LD e imagen 16:9 por tema generada con Gemini. Qué hace y cómo se
instala: `README.md`.

**Este repo es público.** No van claves, rutas ni datos del hosting, ni detalles de otros repos privados.
`config.php` (clave de Gemini) no se versiona: solo `config.example.php`.

## Comandos

```bash
find . -name '*.php' -not -path './vendor/*' -print0 | xargs -0 -n1 php -l > /dev/null   # sintaxis (CI)
for t in tests/*.php; do php "$t"; done                                                    # tests (CI)
php tests/JsonLdTest.php                                                                    # uno
```

Los tests son PHP plano, sin Flarum ni PHPUnit: cargan con `require` la clase que prueban, así que solo
alcanzan clases puras (`JsonLd`, `MetaDescriptionBuilder`, …). La lógica testeable va en esas clases, no en
los controladores ni en los listeners.

## Cómo está armado

- `extend.php` registra un autoloader PSR-4 a mano, porque donde corre no hay Composer. No lo reemplaces
  por `vendor/`.
- Contenido del `<head>`: `Content/InjectDiscussionSeoTags` (página de tema, JSON-LD
  `DiscussionForumPosting`) e `InjectForumIndexSeoTags` (home y `/all`, `CollectionPage` + `ItemList`).
  Todo JSON-LD sale por `JsonLd::encode`, que escapa `<`, `>` y `&` para que el contenido de un tema no
  pueda cerrar el `<script>`.
- Imagen: `Listener/GenerateDiscussionImage` (evento `Started`) → `GeminiImageClient` →
  `DiscussionImageCache` en disco; si falla o no hay clave, se usa la imagen fija. El comando
  `seo-meta:backfill-images` cubre temas viejos.
- `Config::get($clave, $default)` hace `require` de `config.php` (sin ese archivo, falla); el default lo
  pone cada llamada.

## Relación con el despliegue

Este repo no se despliega. Lo que corre en el foro es una copia de esta extensión que se mantiene en otro
repo (privado) y que va **adelante**: hoy tiene además `/llms.txt` y `/llms-full.txt`. Los cambios se
hacen y se prueban allá primero y después se portan acá. Antes de portar o de cambiar algo acá, compará
las dos copias.
