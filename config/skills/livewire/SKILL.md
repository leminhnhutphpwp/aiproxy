# Laravel Livewire

## Component Architecture
```php
namespace App\Livewire;
use Livewire\Component;

class CreatePost extends Component
{
    public string $title = '';
    public string $content = '';
    public bool $isPublished = false;

    public function save()
    {
        $this->validate([
            'title' => 'required|min:3',
            'content' => 'required',
        ]);
        auth()->user()->posts()->create($this->only(['title', 'content', 'isPublished']));
        session()->flash('message', 'Post created!');
        $this->reset(['title', 'content']);
    }

    public function render()
    {
        return view('livewire.create-post');
    }
}
```
- One component per logical UI block — keep them focused
- Public properties are reactive — anything `public` is exposed to JavaScript
- Use `#[Rule]` attributes for validation instead of manual arrays in Livewire 3
- Never put sensitive data in public properties (they're sent to the client)

## Lifecycle Hooks
- `mount()` — run once on component creation (replaces constructor)
- `hydrate()` / `dehydrate()` — on every request/response cycle
- `updating($property, $value)` / `updated($property, $value)` — before/after property update
- `boot()` — runs on every request like middleware
- Use `boot()` for shared logic (e.g., authorize user access)

## Actions & Events
```php
// Wire:click triggers action on the server
<button wire:click="deletePost({{ $post->id }})">Delete</button>

// Dispatching events
$this->dispatch('post-created', postId: $post->id)->to('post-list');

// Listening to events
protected function getListeners()
{
    return ['post-created' => 'refreshPosts'];
}
```

## Alpine.js Integration
- Livewire includes Alpine.js — use `wire:model` for data binding, Alpine for UI transitions
```blade
<div x-data="{ open: false }">
    <button wire:click="save" @click="open = true">Save</button>
    <div x-show="open" x-transition>Saved!</div>
</div>
```

## Forms & Validation
- Real-time validation: `$this->validateOnly('title')` on `wire:model.blur`
- `#[Validate]` attribute on properties for reusable rules
- Use custom `FormObject` classes for complex forms
- File uploads: `WithFileUploads` trait, `$this->validate(['photo' => 'image|max:1024'])`

## Polling & Lazy Loading
```blade
<div wire:poll.5s="refreshNotifications">
    <!-- Auto-updates every 5 seconds -->
</div>
<div wire:init="loadData">
    <!-- Renders placeholder, then loads data -->
</div>
```

## Performance
- Use `#[Computed]` for expensive property computations (cached per request)
- Paginate lists: `Livewire\WithPagination` trait
- Lazy load offscreen components with `wire:init`
- Defer non-critical updates: `wire:model.live.debounce.500ms`

## Testing
```php
Livewire::test(CreatePost::class)
    ->set('title', 'New Post')
    ->set('content', 'Content here')
    ->call('save')
    ->assertHasNoErrors()
    ->assertSee('Post created!');
```

## Common Mistakes
- ❌ Making too many server round-trips — batch updates when possible
- ❌ Putting large datasets in public properties (fills wire payload)
- ❌ Not using `#[Rule]` or `#[Validate]` for validation
- ❌ Forgetting `wire:key` in loops (listener registration conflicts)
- ❌ Using Livewire for static content — use Blade for anything not interactive
