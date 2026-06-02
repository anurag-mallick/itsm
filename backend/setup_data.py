import os
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

# Create admin superuser if not exists
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@admin.com', 'admin')
    print('Created admin superuser (admin/admin)')
else:
    print('Admin superuser already exists')

# Sample data creation (adjust app/model names as needed)
# Ticket categories (assumes an app named 'tickets' with model 'Category')
try:
    from tickets.models import Category
    categories = ['Incident', 'Service Request', 'Change']
    for name in categories:
        obj, created = Category.objects.get_or_create(name=name)
        if created:
            print(f'Created Category: {name}')
except Exception as e:
    print('Category model not found or error:', e)

# Asset types (assumes an app named 'assets' with model 'AssetType')
try:
    from assets.models import AssetType
    asset_types = ['Server', 'Workstation', 'Network Device']
    for name in asset_types:
        obj, created = AssetType.objects.get_or_create(name=name)
        if created:
            print(f'Created AssetType: {name}')
except Exception as e:
    print('AssetType model not found or error:', e)

# Sample knowledge base articles (assumes an app named 'kb' with model 'Article')
try:
    from kb.models import Article
    articles = [
        {'title': 'How to reset password', 'content': 'Steps to reset password...'},
        {'title': 'Creating a ticket', 'content': 'Guide on creating tickets...'},
    ]
    for art in articles:
        obj, created = Article.objects.get_or_create(title=art['title'], defaults={'content': art['content']})
        if created:
            print(f'Created Article: {art["title"]}')
except Exception as e:
    print('Article model not found or error:', e)
