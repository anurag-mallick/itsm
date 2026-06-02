from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsITAgent

from .models import KBArticle, KBCategory
from .serializers import (
    KBArticleCreateUpdateSerializer,
    KBArticleDetailSerializer,
    KBArticleListSerializer,
    KBArticleVoteSerializer,
    KBCategorySerializer,
)


# ── Public endpoints ──────────────────────────────────────────────────────────

class KBCategoryListView(generics.ListAPIView):
    """GET /api/knowledge/categories/ — all categories."""
    queryset = KBCategory.objects.all()
    serializer_class = KBCategorySerializer
    permission_classes = [permissions.AllowAny]


class PublicKBListView(generics.ListAPIView):
    """
    GET /api/knowledge/public/ — published public articles.
    Supports ?search=<text>&category=<slug>
    """
    serializer_class = KBArticleListSerializer
    permission_classes = [permissions.AllowAny]
    search_fields = ['title', 'tags']
    ordering_fields = ['view_count', 'helpful_yes', 'updated_at', 'created_at']

    def get_queryset(self):
        qs = KBArticle.objects.filter(
            is_published=True, is_public=True
        ).select_related('category', 'author')

        category_slug = self.request.query_params.get('category')
        if category_slug:
            qs = qs.filter(category__slug=category_slug)

        return qs


class PublicKBArticleView(APIView):
    """GET /api/knowledge/public/{slug}/ — article detail; increments view_count."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        article = get_object_or_404(
            KBArticle, slug=slug, is_published=True, is_public=True
        )
        # Atomic increment — avoids race conditions
        KBArticle.objects.filter(pk=article.pk).update(
            view_count=F('view_count') + 1
        )
        # Refresh from DB so the serializer shows the updated count
        article.refresh_from_db(fields=['view_count'])
        return Response(KBArticleDetailSerializer(article).data)


class KBSearchView(generics.ListAPIView):
    """GET /api/knowledge/search/?q=<text> — full-text search across titles and content."""
    serializer_class = KBArticleListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        q = self.request.query_params.get('q', '').strip()
        qs = KBArticle.objects.filter(
            is_published=True, is_public=True
        ).select_related('category', 'author')
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(content__icontains=q)
                | Q(tags__icontains=q)
            )
        return qs


class KBArticleVoteView(APIView):
    """POST /api/knowledge/articles/{id}/vote/ — body: {vote: 'yes'|'no'}"""
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        article = get_object_or_404(KBArticle, pk=pk, is_published=True)
        serializer = KBArticleVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data['vote'] == 'yes':
            KBArticle.objects.filter(pk=article.pk).update(
                helpful_yes=F('helpful_yes') + 1
            )
        else:
            KBArticle.objects.filter(pk=article.pk).update(
                helpful_no=F('helpful_no') + 1
            )

        article.refresh_from_db(fields=['helpful_yes', 'helpful_no'])
        return Response({
            'helpful_yes': article.helpful_yes,
            'helpful_no': article.helpful_no,
        })


# ── Internal management (IT Agents) ──────────────────────────────────────────

class KBArticleAdminListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/knowledge/articles/ — all articles (including drafts).
    POST /api/knowledge/articles/ — create a new article.
    """
    permission_classes = [IsITAgent]
    filterset_fields = ['is_published', 'is_public', 'category']
    search_fields = ['title', 'content', 'tags']
    ordering_fields = ['view_count', 'updated_at', 'created_at']

    def get_queryset(self):
        return KBArticle.objects.select_related('category', 'author').all()

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return KBArticleCreateUpdateSerializer
        return KBArticleListSerializer


class KBArticleAdminDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/knowledge/articles/{id}/ — manage individual article."""
    permission_classes = [IsITAgent]
    queryset = KBArticle.objects.select_related('category', 'author').all()

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return KBArticleCreateUpdateSerializer
        return KBArticleDetailSerializer
