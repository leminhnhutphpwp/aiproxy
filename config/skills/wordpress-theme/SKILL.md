# WordPress Theme Development

## Block Themes (Current Standard)
- Built entirely with blocks — no traditional PHP templates needed
- `theme.json`: central configuration for styles, settings, colors, typography
- `templates/index.html`, `templates/single.html`, `templates/page.html`
- `parts/header.html`, `parts/footer.html`, `parts/sidebar.html`
- No `functions.php` hacks for styles — use `theme.json` instead

## theme.json Configuration
```json
{
  "version": 2,
  "settings": {
    "color": {
      "palette": [
        { "slug": "primary", "color": "#FF6B2B", "name": "Primary" },
        { "slug": "secondary", "color": "#1E1E1E", "name": "Secondary" }
      ],
      "gradients": [],
      "duotone": []
    },
    "typography": {
      "fontFamilies": [{ "fontFamily": "Inter, sans-serif", "slug": "inter", "name": "Inter" }],
      "fontSizes": [...]
    },
    "layout": { "contentSize": "1200px", "wideSize": "1400px" }
  },
  "styles": {
    "blocks": {
      "core/paragraph": { "typography": { "fontSize": "var(--wp--preset--font-size--medium)" } }
    }
  }
}
```

## Template Hierarchy
- `index.html` → fallback for everything
- `single.html` → single post
- `page.html` → single page
- `archive.html` → category, tag, date, author archives
- `search.html` → search results
- `singular.html` → fallback for single posts and pages
- Each can be overridden at more specific levels (e.g., `single-post.html`)

## Custom Block Patterns
```php
register_block_pattern('mytheme/hero-section', [
    'title' => 'Hero Section',
    'categories' => ['hero'],
    'content' => '<!-- wp:cover {"overlayColor":"primary","minHeight":500} -->
        <!-- wp:heading {"textAlign":"center"} --><h2>Welcome</h2><!-- /wp:heading -->
        <!-- wp:paragraph {"align":"center"} --><p>Description here</p><!-- /wp:paragraph -->
    <!-- /wp:cover -->',
]);
```

## Style Variations
- `styles/` directory in theme root
- Each variation: `styles/default.json`, `styles/dark.json`
- Override any `theme.json` setting per variation
- Users can switch variations in the Site Editor

## Enqueuing Assets
```php
function mytheme_enqueue() {
    // Block theme: WordPress handles most CSS automatically
    // Only enqueue what's NOT covered by theme.json
    wp_enqueue_style('mytheme-style', get_stylesheet_uri());
    wp_enqueue_script('mytheme-navigation', get_template_directory_uri() . '/js/navigation.js', [], null, true);
}
add_action('wp_enqueue_scripts', 'mytheme_enqueue');
```

## Classic Themes (Legacy)
- `header.php`, `footer.php`, `sidebar.php`, `index.php`
- `The Loop`: `if (have_posts()) : while (have_posts()) : the_post();`
- Template tags: `the_title()`, `the_content()`, `the_permalink()`, `get_template_part()`
- For new themes, ALWAYS use block themes — classic themes are deprecated

## Child Themes
- For customizing existing themes without losing updates
- `style.css` with `Template: parent-theme-slug`
- `functions.php` loaded alongside parent
- Override any template file by copying to child theme

## Common Mistakes
- ❌ Using block themes but editing `index.php` directly — use templates
- ❌ Hardcoding colors/fonts in CSS instead of using `theme.json` variables
- ❌ Not testing with Gutenberg's full-site editing
- ❌ Forgetting `add_theme_support('block-template-parts')` for block parts
- ❌ Using deprecated tags like `bloginfo('stylesheet_url')` — use `get_stylesheet_uri()`
