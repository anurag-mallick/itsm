from rest_framework import serializers

from apps.tickets.serializers import ArchiveActionSerializer  # noqa: F401 — re-exported

from .models import ChangeComment, ChangeRequest, Sprint


class ChangeCommentSerializer(serializers.ModelSerializer):
    author_email = serializers.EmailField(source='author.email', read_only=True)
    author_full_name = serializers.CharField(source='author.full_name', read_only=True)

    class Meta:
        model = ChangeComment
        fields = ['id', 'author', 'author_email', 'author_full_name', 'body', 'created_at']
        read_only_fields = ['id', 'author', 'author_email', 'author_full_name', 'created_at']


class ChangeCommentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChangeComment
        fields = ['body']


class ChangeListSerializer(serializers.ModelSerializer):
    reporter_email = serializers.EmailField(source='reporter.email', read_only=True)
    reporter_full_name = serializers.CharField(source='reporter.full_name', read_only=True)
    assignee_email = serializers.EmailField(
        source='assignee.email', read_only=True, allow_null=True
    )
    assignee_full_name = serializers.CharField(
        source='assignee.full_name', read_only=True, allow_null=True
    )
    sprint_id = serializers.UUIDField(source='sprint.id', read_only=True, allow_null=True)
    sprint_name = serializers.CharField(source='sprint.name', read_only=True, allow_null=True)

    class Meta:
        model = ChangeRequest
        fields = [
            'id',
            'ref_number',
            'title',
            'change_type',
            'priority',
            'status',
            'reporter',
            'reporter_email',
            'reporter_full_name',
            'assignee',
            'assignee_email',
            'assignee_full_name',
            'due_date',
            'story_points',
            'labels',
            'sprint_id',
            'sprint_name',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'ref_number',
            'reporter',
            'reporter_email',
            'reporter_full_name',
            'assignee_email',
            'assignee_full_name',
            'sprint_id',
            'sprint_name',
            'created_at',
        ]


class ChangeDetailSerializer(serializers.ModelSerializer):
    reporter_email = serializers.EmailField(source='reporter.email', read_only=True)
    reporter_full_name = serializers.CharField(source='reporter.full_name', read_only=True)
    assignee_email = serializers.EmailField(
        source='assignee.email', read_only=True, allow_null=True
    )
    assignee_full_name = serializers.CharField(
        source='assignee.full_name', read_only=True, allow_null=True
    )
    sprint_id = serializers.UUIDField(source='sprint.id', read_only=True, allow_null=True)
    sprint_name = serializers.CharField(source='sprint.name', read_only=True, allow_null=True)
    comments = ChangeCommentSerializer(many=True, read_only=True)

    class Meta:
        model = ChangeRequest
        fields = [
            'id',
            'ref_number',
            'title',
            'description',
            'change_type',
            'priority',
            'status',
            'reporter',
            'reporter_email',
            'reporter_full_name',
            'assignee',
            'assignee_email',
            'assignee_full_name',
            'due_date',
            'estimated_hours',
            'actual_hours',
            'story_points',
            'labels',
            'custom_fields',
            'linked_ticket_ids',
            'sprint_id',
            'sprint_name',
            'is_archived',
            'archive_reason',
            'comments',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'ref_number',
            'reporter',
            'reporter_email',
            'reporter_full_name',
            'assignee_email',
            'assignee_full_name',
            'sprint_id',
            'sprint_name',
            'is_archived',
            'archive_reason',
            'created_at',
            'updated_at',
        ]


class ChangeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChangeRequest
        fields = [
            'title',
            'description',
            'change_type',
            'priority',
            'status',
            'assignee',
            'due_date',
            'estimated_hours',
            'story_points',
            'labels',
            'custom_fields',
            'linked_ticket_ids',
            'sprint',
        ]
        extra_kwargs = {
            'description': {'required': False},
            'change_type': {'required': False},
            'priority': {'required': False},
            'status': {'required': False},
            'assignee': {'required': False},
            'due_date': {'required': False},
            'estimated_hours': {'required': False},
            'story_points': {'required': False},
            'labels': {'required': False},
            'custom_fields': {'required': False},
            'linked_ticket_ids': {'required': False},
            'sprint': {'required': False, 'allow_null': True},
        }

    def to_representation(self, instance):
        return ChangeDetailSerializer(instance, context=self.context).data


class ChangeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChangeRequest
        fields = [
            'title',
            'description',
            'change_type',
            'priority',
            'status',
            'assignee',
            'due_date',
            'estimated_hours',
            'actual_hours',
            'story_points',
            'labels',
            'custom_fields',
            'linked_ticket_ids',
            'sprint',
        ]
        extra_kwargs = {
            'title': {'required': False},
            'description': {'required': False},
            'change_type': {'required': False},
            'priority': {'required': False},
            'status': {'required': False},
            'assignee': {'required': False},
            'due_date': {'required': False},
            'estimated_hours': {'required': False},
            'actual_hours': {'required': False},
            'story_points': {'required': False},
            'labels': {'required': False},
            'custom_fields': {'required': False},
            'linked_ticket_ids': {'required': False},
            'sprint': {'required': False, 'allow_null': True},
        }


class SprintSerializer(serializers.ModelSerializer):
    done_count = serializers.SerializerMethodField()
    total_count = serializers.SerializerMethodField()
    days_remaining = serializers.IntegerField(read_only=True, allow_null=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)

    def get_done_count(self, obj):
        return obj.changes.filter(status='done').count()

    def get_total_count(self, obj):
        return obj.changes.count()

    class Meta:
        model = Sprint
        fields = [
            'id', 'name', 'goal', 'status', 'status_display', 'start_date', 'end_date',
            'days_remaining', 'done_count', 'total_count', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'days_remaining', 'created_by_name']


class SprintCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sprint
        fields = ['name', 'goal', 'start_date', 'end_date']

    def to_representation(self, instance):
        return SprintSerializer(instance, context=self.context).data
