# seo-meta

Extension de [Flarum](https://flarum.org/) que agrega SEO on-page y datos estructurados
a un foro: sitemap.xml, meta tags, Open Graph / Twitter Card, JSON-LD e imagenes 16:9
generadas con Gemini.

Desarrollada para [Campus MarIA](https://campus.maria.ar/public/), el foro de la
comunidad [MarIA GroWth](https://maria.ar/).

## Que hace

- **`GET /sitemap.xml`**: sitemap dinamico con todos los temas de debate publicos,
  aprobados y no ocultos.
- **Paginas de tema** (`/d/{id}-{slug}`): inyecta `<title>`, meta description
  mobile-friendly, Open Graph, Twitter Card y JSON-LD `DiscussionForumPosting`
  (autor, tema, descripcion, fecha de publicacion y cantidad de likes).
- **Imagen 16:9 por tema**: al crearse un tema nuevo, genera una imagen social
  (1200x675) con la API de imagenes de Gemini a partir del titulo del tema, la
  cachea en disco y cae a una imagen fija si la generacion falla o no hay API key
  configurada.
- **Home del foro** (`/` y `/all`): title, meta description, Open Graph, Twitter
  Card y JSON-LD `CollectionPage` (con `isPartOf`/`about` apuntando a la
  organizacion, e `ItemList` con los temas activos, cada uno con su `author`)
  para reforzar GEO (Generative Engine Optimization).
- **`seo-meta:backfill-images`**: comando de consola para generar la imagen 16:9
  de temas existentes que todavia no la tienen.

## Instalacion

Requiere `flarum/core ^1.8`, `flarum/likes` y `flarum/approval`.

Via Composer (instalacion estandar de Flarum):

```bash
composer require maria/seo-meta
```

Copia `config.example.php` a `config.php` y completa tu API key de Gemini:

```bash
cp config.example.php config.php
```

```php
<?php

return [
    'gemini_api_key' => 'TU_API_KEY',
    'gemini_image_model' => 'gemini-2.5-flash-image',

    'site_name' => 'Nombre de tu foro',
    'default_og_image' => 'assets/seo/default-og.jpg',
    'meta_description_max_length' => 120,
    'image_generation_timeout_seconds' => 25,
];
```

Agrega una imagen de fallback 16:9 en `public/assets/seo/default-og.jpg` (se usa
cuando todavia no se genero la imagen del tema, o si la generacion falla).

Activa la extension desde el panel de administracion de Flarum.

### Hosting sin `proc_open`/`exec` (ej. algunos cPanel)

Si tu hosting no permite correr `composer install/update` en el servidor (asi
fue desarrollada originalmente esta extension), podes instalarla "a mano":

1. Copia esta carpeta a `extensions/seo-meta` dentro de tu instalacion de Flarum.
2. Agrega una entrada para `maria/seo-meta` en `vendor/composer/installed.json`
   (mismo formato que cualquier otra extension del array `packages`, con
   `"install-path": "../../extensions/seo-meta"`).
3. Activa la extension desde el panel de administracion, o via
   `php flarum extension:enable maria-seo-meta`.

`extend.php` ya incluye un autoloader PSR-4 manual (`spl_autoload_register`)
para este escenario, asi que no depende de que Composer genere el autoload.

## Licencia

MIT
