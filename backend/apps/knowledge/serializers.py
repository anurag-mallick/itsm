from rest_framework import serializers

from .models import KBArticle, KBCategory


class KBCategorySerializer(serializers.ModelSerializer):
    article_count = serializers.SerializerMethodField()

    def get_article_count(self, obj):
        return obj.articles.filter(is_published=True).count()

    class Meta:
        model = KBCategory
        fields = [
            'id',
            'name',
            'slug',
            'description',
            'display_order',
            'article_count',
        ]
        read_only_fields = ['id', 'slug']


class KBArticleListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    author_name = serializers.CharField(source='author.full_name', read_only=True)

    class Meta:
        model = KBArticle
        fields = [
            'id',
            'title',
            'slug',
            'category',
            'category_name',
            'category_slug',
            'tags',
            'view_count',
            'helpful_yes',
            'helpful_no',
            'is_published',
            'is_public',
            'author_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class KBArticleDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    author_name = serializers.CharField(source='author.full_name', read_only=True)
    author_email = serializers.EmailField(source='author.email', read_only=True)

    class Meta:
        model = KBArticle
        fields = [
            'id',
            'title',
            'slug',
            'category',
            'category_name',
            'category_slug',
            'content',
            'tags',
            'view_count',
            'helpful_yes',
            'helpful_no',
            'is_published',
            'is_public',
            'author',
            'author_name',
            'author_email',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'slug',
            'view_count',
            'helpful_yes',
            'helpful_no',
            'author',
            'author_name',
            'author_email',
            'created_at',
            'updated_at',
        ]


class KBArticleCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = KBArticle
        fields = [
            'category',
            'title',
            'content',
            'tags',
            'is_published',
            'is_public',
        ]
        extra_kwargs = {
            'tags': {'required': False},
            'is_published': {'required': False},
            'is_public': {'required': False},
        }

    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)

    def to_representation(self, instance):
        return KBArticleDetailSerializer(instance, context=self.context).data


class KBArticleVoteSerializer(serializers.Serializer):
    vote = serializers.ChoiceField(choices=['yes', 'no'])
