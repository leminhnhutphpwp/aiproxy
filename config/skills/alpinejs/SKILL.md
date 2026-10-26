# Alpine.js Patterns

## Core Concepts
- Alpine is a lightweight (15KB) JavaScript framework for adding reactivity to HTML
- Works inline — no virtual DOM, no build step, no JSX
- Perfect complement to Tailwind CSS and Laravel Livewire (TALL stack)
- All state lives in HTML attributes — no separate JS files needed for simple cases

## x-data (Component State)
```html
<div x-data="{ count: 0, name: '', items: ['a', 'b'] }">
  <button @click="count++">Clicked {{ count }} times</button>
</div>
```
- Each `x-data` creates an isolated component scope
- JSON-serializable data: primitives, arrays, plain objects
- Access parent scope with `$parent` — better to avoid deep nesting
- Extract reusable logic: `x-data="dropdown()"` calling a defined function

## Directives
- `x-bind:class` or `:class` — dynamic HTML attributes
- `x-on:click` or `@click` — event listeners
- `x-model` — two-way data binding for form inputs
- `x-show` / `x-if` — conditional rendering (`x-if` removes from DOM)
- `x-for` — loops with `:key` mandatory
- `x-text` / `x-html` — safe/unsafe content rendering
- `x-cloak` — prevent flash before Alpine initializes

## Event Handling
```html
<form @submit.prevent="handleSubmit">
  <input x-model="search" @input.debounce.500ms="fetchResults">
  <div @click.outside="open = false">
    <!-- Closes when clicking outside -->
  </div>
</form>
```
- Modifiers: `.prevent`, `.stop`, `.window`, `.outside`, `.debounce`, `.keydown.escape`
- `$event` magic: access native event object: `@click="handler($event)"`
- `$el` — current DOM element reference

## Magic Properties
- `$data` — the current component's data object
- `$el` — the current DOM element
- `$refs` — `x-ref` references: `$refs.myInput.focus()`
- `$store` — global Alpine store (shared state between components)
- `$watch('property', callback)` — reactive watchers
- `$nextTick(callback)` — run after Alpine updates DOM
- `$dispatch('event', detail)` — custom events (bubbles up)
- `$id('prefix')` — unique IDs per component instance (accessibility)

## Transitions
```html
<div x-show="open"
     x-transition:enter="transition ease-out duration-300"
     x-transition:enter-start="opacity-0 scale-90"
     x-transition:enter-end="opacity-100 scale-100"
     x-transition:leave="transition ease-in duration-200"
     x-transition:leave-start="opacity-100 scale-100"
     x-transition:leave-end="opacity-0 scale-90">
</div>
```

## Alpine Stores
```js
// In head or bundled JS
document.addEventListener('alpine:init', () => {
  Alpine.store('user', { name: 'Guest', isLoggedIn: false, login(name) { this.name = name; this.isLoggedIn = true; } });
});
// In HTML
<div x-data x-text="$store.user.name"></div>
```

## Plugins & Extras
- `@alpinejs/mask` — input masking (phone, date, credit card)
- `@alpinejs/collapse` — animated collapse/expand
- `@alpinejs/intersect` — intersection observer
- `@alpinejs/anchor` — anchor positioning (popover/tooltip)
- `@alpinejs/focus` — focus trapping (modals)

## Common Mistakes
- ❌ Complex logic inside HTML attributes — extract to functions or methods
- ❌ Using Alpine for things CSS can do (simple show/hide, hover effects)
- ❌ Forgetting `x-cloak` — users see unrendered `{{ }}` before init
- ❌ Missing `:key` in `x-for` loops (rendering bugs)
- ❌ Mixing Alpine with jQuery — causes conflicts and confusion
