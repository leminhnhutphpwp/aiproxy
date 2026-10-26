# FilamentPHP Admin Panels

## Panel Configuration
```php
class AdminPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->default()
            ->id('admin')
            ->path('admin')
            ->login()
            ->colors(['primary' => Color::Orange])
            ->discoverResources(in: app_path('Filament/Resources'), for: 'App\\Filament\\Resources')
            ->discoverPages(in: app_path('Filament/Pages'), for: 'App\\Filament\\Pages')
            ->discoverWidgets(in: app_path('Filament/Widgets'), for: 'App\\Filament\\Widgets')
            ->middleware(['web', 'auth']);
    }
}
```
- One panel per admin area (e.g., admin, editor, reports)
- Use `discoverResources` for automatic registration — avoid manual `->resources([...])`

## Resources
- One Resource per Eloquent model: `php artisan make:filament-resource User`
- Define `$model`, `$navigationIcon`, `$navigationGroup` class properties
- Forms and tables are defined statically: `public static function form(Form $form): Form`
- Use `RelationManagers` for related model management inside a resource

## Forms
```php
public static function form(Form $form): Form
{
    return $form->schema([
        TextInput::make('name')->required()->maxLength(255),
        Select::make('role_id')->relationship('role', 'name')->required(),
        RichEditor::make('bio')->columnSpanFull(),
        DateTimePicker::make('published_at')->default(now()),
        Toggle::make('is_active')->default(true),
    ]);
}
```
- Schema as array of components — avoid HTML in panels
- Use `->columnSpanFull()` or `->columns(2)` for responsive layouts
- Validation rules inline: `->required()->email()->unique(ignoreRecord: true)`

## Tables
```php
public static function table(Table $table): Table
{
    return $table
        ->columns([
            TextColumn::make('name')->searchable()->sortable(),
            BadgeColumn::make('status')->colors(['active' => 'success', 'inactive' => 'gray']),
        ])
        ->filters([Filter::make('is_active')->toggle()])
        ->actions([Action::make('edit'), Action::make('delete')])
        ->bulkActions([BulkAction::make('delete')]);
}
```

## Custom Pages & Widgets
- Pages: List, Create, Edit, View for each Resource (auto-generated)
- Custom pages: `php artisan make:filament-page Dashboard`
- Widgets: Stats overview, chart, table widgets
- Register widgets in `widgets()` method on Panel or Page

## Authorization
- Use Laravel Policies: `$user->can('view', $record)` is checked automatically
- Override `canAccess()` on Panel: `function canAccess(): bool { return auth()->user()->isAdmin(); }`
- Gate-based access for custom pages

## Performance
- Use `EagerLoading` in table queries
- Avoid calling external APIs inside form/table hooks — queue such work
- Paginate table results by default (10-25 per page)
- Use `SpyMode` to detect N+1 queries in development

## Common Mistakes
- ❌ Putting complex business logic in Form/Table hooks instead of services
- ❌ Not using pagination for large datasets
- ❌ Forgetting to define `$record` for custom mutations
- ❌ Using Filament for simple landing pages — it's for admin panels only
- ❌ Not separating panel configs for different user roles
