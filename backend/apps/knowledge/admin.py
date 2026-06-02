from django.contrib import admin

from .models import KBArticle, KBCategory


@admin.register(KBCategory)
class KBCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'display_order']
    list_editable = ['display_order']
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ['name']
    ordering = ['display_order', 'name']


@admin.register(KBArticle)
class KBArticleAdmin(admin.ModelAdmin):
    list_display = [
        'title', 'category', 'author', 'is_published',
        'is_public', 'view_count', 'helpful_yes', 'helpful_no',
        'updated_at',
    ]
    list_filter = ['is_published', 'is_public', 'category']
    list_editable = ['is_published', 'is_public']
    search_fields = ['title', 'content', 'tags']
    readonly_fields = ['id', 'slug', 'view_count', 'helpful_yes', 'helpful_no', 'created_at', 'updated_at']
    ordering = ['-updated_at']
    raw_id_fields = ['author']
    fieldsets = [
        (None, {
            'fields': ['id', 'category', 'title', 'slug', 'author'],
        }),
        ('Content', {
            'fields': ['content', 'tags'],
        }),
        ('Publication', {
            'fields': ['is_published', 'is_public'],
        }),
        ('Metrics', {
            'fields': ['view_count', 'helpful_yes', 'helpful_no'],
            'classes': ['collapse'],
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]
