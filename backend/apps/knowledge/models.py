import uuid

from django.db import models
from django.utils.text import slugify


class KBCategory(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, blank=True)
    description = models.TextField(blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'kb_category'
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class KBArticle(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        KBCategory, on_delete=models.PROTECT, related_name='articles'
    )
    title = models.CharField(max_length=300)
    slug = models.SlugField(unique=True, blank=True, max_length=350)
    content = models.TextField()  # Markdown content
    tags = models.CharField(max_length=500, blank=True)  # comma-separated
    is_published = models.BooleanField(default=False, db_index=True)
    is_public = models.BooleanField(default=True)  # False = internal only
    view_count = models.PositiveIntegerField(default=0)
    helpful_yes = models.PositiveIntegerField(default=0)
    helpful_no = models.PositiveIntegerField(default=0)
    author = models.ForeignKey(
        'accounts.User', on_delete=models.PROTECT, related_name='kb_articles'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'kb_article'
        ordering = ['-updated_at']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:320]
            slug = base
            n = 1
            while KBArticle.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{n}'
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)
