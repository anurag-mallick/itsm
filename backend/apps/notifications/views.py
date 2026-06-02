from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """GET /api/notifications/ — current user's notifications, latest 50."""
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        unread_only = self.request.query_params.get('unread')
        if unread_only == 'true':
            qs = qs.filter(read_at__isnull=True)
        return qs[:50]


class NotificationUnreadCountView(APIView):
    """GET /api/notifications/unread-count/ — returns {count: N}."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(user=request.user, read_at__isnull=True).count()
        return Response({'count': count})


class NotificationMarkReadView(APIView):
    """POST /api/notifications/{id}/read/ — marks one notification read."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        Notification.objects.filter(
            id=pk, user=request.user, read_at__isnull=True
        ).update(read_at=timezone.now())
        return Response({'detail': 'Marked as read.'})


class NotificationMarkAllReadView(APIView):
    """POST /api/notifications/read-all/ — marks all notifications as read."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(
            user=request.user, read_at__isnull=True
        ).update(read_at=timezone.now())
        return Response({'detail': 'All notifications marked as read.'})
