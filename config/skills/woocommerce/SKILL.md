# WooCommerce Development

## Product Architecture
- Product types: Simple, Variable, Grouped, External, and Custom
- Define custom product types via `woocommerce_product_class` filter
- Product data stored in `wp_posts` (post_type = 'product') + `wp_postmeta`
- Use CRUD classes: `WC_Product_Simple`, `WC_Product_Variable`, etc.
- Always use `wc_get_product($id)` not direct `WP_Post` access

## Hooks & Filters
```php
// Modify cart item price
add_filter('woocommerce_cart_item_price', function($price, $cart_item, $cart_item_key) {
    return wc_price($cart_item['data']->get_price() * 1.1);
}, 10, 3);

// Custom checkout field
add_action('woocommerce_after_order_notes', function($checkout) {
    echo '<div id="custom_field"><h3>'.__('Gift Note').'</h3>';
    woocommerce_form_field('gift_note', ['type' => 'textarea', 'class' => ['form-row-wide']], $checkout->get_value('gift_note'));
    echo '</div>';
});
```

## Checkout Customization
- `woocommerce_checkout_fields` filter to add/remove fields
- `woocommerce_checkout_create_order` for saving custom data to order meta
- `woocommerce_thankyou` for post-purchase actions
- Always validate custom checkout fields with `woocommerce_checkout_process` action

## Payment Gateways
```php
class WC_Custom_Gateway extends WC_Payment_Gateway {
    public function __construct() {
        $this->id = 'custom_gateway';
        $this->method_title = 'Custom Payment';
        $this->init_form_fields();
        $this->init_settings();
    }
    public function process_payment($order_id) {
        $order = wc_get_order($order_id);
        $order->update_status('processing', 'Custom payment completed');
        return ['result' => 'success', 'redirect' => $this->get_return_url($order)];
    }
}
```

## Shipping
- Flat rate, free shipping, local pickup — extend via `WC_Shipping_Method`
- Custom shipping calculators for dynamic rates
- Table rates for rules-based shipping (use plugins or custom)

## REST API
- `/wp-json/wc/v3/products`, `/orders`, `/customers`
- OAuth 1.0a or API keys for authentication
- Use `WC_REST_Controller` for custom endpoints
- Batch operations: `/wc/v3/orders/batch` with `create`/`update`/`delete` arrays

## Order Management
- Order statuses: pending, processing, completed, on-hold, cancelled, refunded, failed
- Custom order statuses via `register_post_status()` + `wc_order_statuses`
- Email notifications: `WC_Email` class for custom transactional emails
- Refunds: `wc_create_refund()` with itemized or full

## Common Mistakes
- ❌ Direct database queries instead of WooCommerce API methods
- ❌ Not using `wc_get_product()` — breaks caching and compatibility
- ❌ Forgetting to declare HPOS (High-Performance Order Storage) compatibility
- ❌ Hardcoding currency symbols or locale-specific formatting
- ❌ Not testing with the `twenty-twenty-four` theme for compatibility
