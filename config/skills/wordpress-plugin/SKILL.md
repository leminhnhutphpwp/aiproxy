# WordPress Plugin Development

## Plugin File Structure
```
my-plugin/
  my-plugin.php          # Main plugin file with plugin header
  includes/
    class-admin.php      # Admin-only functionality
    class-frontend.php   # Public-facing functionality
    class-api.php        # REST API controllers
  assets/
    css/
    js/
  languages/             # Translation files (.pot, .po, .mo)
  templates/             # Template files
  readme.txt             # WordPress.org readme
```
- One class per file, PSR-4 compatible structure
- Main plugin file must have a header: `Plugin Name`, `Description`, `Version`, `Requires PHP`

## Hooks: Actions & Filters
```php
// Action: do something at a specific point
add_action('init', 'my_register_post_types');
add_action('admin_menu', 'my_add_admin_menu');

// Filter: modify data before use
add_filter('the_content', 'my_modify_content');
add_filter('wp_mail_from_name', fn() => 'My Plugin');

// Always use prefix to avoid collisions with other plugins
function my_register_post_types() { ... }
```
- Use anonymous functions sparingly — named callbacks are easier to unhook
- Always specify `$priority` and `$accepted_args` explicitly for clarity
- Prefix everything: function names, class names, option names, meta keys

## Custom Post Types
```php
register_post_type('recipe', [
    'labels' => ['name' => 'Recipes', 'singular_name' => 'Recipe'],
    'public' => true,
    'has_archive' => true,
    'supports' => ['title', 'editor', 'thumbnail', 'custom-fields'],
    'show_in_rest' => true,  // Required for Gutenberg
]);
```

## Gutenberg Blocks
```php
// Register block type (PHP)
register_block_type(__DIR__ . '/build/recipe-card');
```
- Use `@wordpress/create-block` to scaffold blocks
- Render blocks server-side with `render_callback` for dynamic data
- Keep block attributes minimal — store complex data in post meta
- Use `wp_enqueue_block_style` for per-block CSS

## Settings API
```php
add_action('admin_init', function() {
    register_setting('my_plugin_settings', 'my_plugin_option');
    add_settings_section('my_plugin_section', 'Settings', null, 'my-plugin');
    add_settings_field('my_field', 'My Field', function() {
        echo '<input name="my_plugin_option" value="' . esc_attr(get_option('my_plugin_option')) . '">';
    }, 'my-plugin', 'my_plugin_section');
});
```

## Database
- Use `$wpdb->prepare()` for ALL queries — never interpolate variables
- Prefix custom tables: `$wpdb->prefix . 'my_table'`
- Install tables on plugin activation, not on every page load
```php
global $wpdb;
$results = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE post_type = %s", 'recipe'));
```

## Security
- Escape output: `esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses()`
- Validate input: `sanitize_text_field()`, `sanitize_email()`, `intval()`
- Nonces for form/URL verification: `wp_nonce_field()` + `check_admin_referer()`
- Capabilities check before admin operations: `current_user_can('manage_options')`
- Never trust `$_GET`, `$_POST`, `$_REQUEST` without sanitization

## Common Mistakes
- ❌ Direct SQL queries without $wpdb->prepare()
- ❌ Not uninstalling plugin data on deletion
- ❌ Hardcoding paths: use `plugin_dir_path(__FILE__)` and `plugin_dir_url(__FILE__)`
- ❌ Global namespace pollution — use classes and namespaces
- ❌ Forgetting `register_activation_hook()` for database setup
