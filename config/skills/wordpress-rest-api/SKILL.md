# WordPress REST API

## Core Endpoints
- `/wp/v2/posts`, `/wp/v2/pages`, `/wp/v2/users` — standard CRUD
- `/wp/v2/media` — file upload and management
- `/wp/v2/categories`, `/wp/v2/tags` — taxonomy terms
- `/wp/v2/settings` — site settings (needs `manage_options` cap)
- `/wp/v2/types`, `/wp/v2/statuses` — registered content types and statuses
- Response format: JSON with `_links` for HATEOAS, pagination in headers

## Custom Endpoints
```php
add_action('rest_api_init', function() {
    register_rest_route('my-plugin/v1', '/recipes/(?P<id>\d+)', [
        'methods' => 'GET',
        'callback' => 'my_get_recipe',
        'permission_callback' => '__return_true',
        'args' => [
            'id' => ['required' => true, 'validate_callback' => fn($p) => is_numeric($p)],
        ],
    ]);
});

function my_get_recipe($request) {
    $recipe = get_post($request['id']);
    if (!$recipe || $recipe->post_type !== 'recipe') {
        return new WP_Error('not_found', 'Recipe not found', ['status' => 404]);
    }
    return new WP_REST_Response([
        'id' => $recipe->ID,
        'title' => $recipe->post_title,
        'content' => apply_filters('the_content', $recipe->post_content),
    ], 200);
}
```
- Use versioned namespaces: `my-plugin/v1`, `my-plugin/v2`
- Always validate arguments with `validate_callback`
- Use `WP_REST_Response` and `WP_Error` consistently — never plain arrays
- Register routes in `rest_api_init`, not `init`

## Authentication
- **Cookie auth**: Works for logged-in users from the same origin
- **Application passwords**: `/wp/v2/users/me/application-passwords` — generate per-app tokens
- **OAuth 1.0a**: Plugin-based (e.g., WP OAuth Server)
- **JWT Auth**: Plugin-based (`?token=xxx` in Authorization header)
- Always test `current_user_can()` in permission callbacks — don't rely on WordPress capabilities alone

## Headless WordPress
- Disable frontend: `'show_on_front' => false` or redirect to SPA
- Use `wp-json` custom rewrites for cleaner URLs
- CORS: `add_filter('rest_pre_serve_request', fn() => header('Access-Control-Allow-Origin: *'))`
- Use `_embed` param to include related data: `/wp/v2/posts?_embed=author,wp:featuredmedia`
- Cache API responses at the CDN edge for anonymous requests

## Post Meta in REST API
```php
// Expose custom meta in REST
register_post_meta('post', 'custom_subtitle', [
    'show_in_rest' => true,
    'single' => true,
    'type' => 'string',
]);
```
- Always set `'show_in_rest' => true` for custom meta used by headless frontends
- Use `'auth_callback'` to control who can set meta via REST

## Performance & Caching
- Use `WP_Query` with `'fields' => 'ids'` when only IDs are needed
- Cache responses for anonymous users: `add_filter('rest_cache_enabled', '__return_true')`
- Conditional loading: only enqueue REST JS when needed
- Use ETags for conditional requests: `$response->set_headers(['ETag' => md5($data)])`

## Common Mistakes
- ❌ Returning plain text or HTML instead of JSON
- ❌ Not handling pagination: `per_page` (default 10), `page`, `total` in headers
- ❌ Exposing sensitive data in responses (password hashes, emails)
- ❌ Missing `permission_callback` — endpoints are PUBLIC by default
- ❌ Not sanitizing/validating input in custom endpoints
