from django.utils import timezone
from rest_framework import serializers

from .models import Attachment, CannedResponse, Category, Comment, Ticket


class CategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    default_assignee_email = serializers.EmailField(source='default_assignee.email', read_only=True)

    class Meta:
        model = Category
        fields = [
            'id',
            'name',
            'parent',
            'parent_name',
            'sla_response_hours',
            'sla_resolution_hours',
            'default_assignee',
            'default_assignee_email',
            'is_active',
        ]
        read_only_fields = ['id']


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_email = serializers.EmailField(source='uploaded_by.email', read_only=True)

    class Meta:
        model = Attachment
        fields = [
            'id',
            'ticket',
            'comment',
            'file',
            'original_filename',
            'file_size',
            'uploaded_by',
            'uploaded_by_email',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'uploaded_by', 'uploaded_by_email', 'file_size', 'original_filename']


class CommentSerializer(serializers.ModelSerializer):
    author_email = serializers.EmailField(source='author.email', read_only=True)
    author_name = serializers.CharField(source='author.full_name', read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Comment
        fields = [
            'id',
            'ticket',
            'author',
            'author_email',
            'author_name',
            'body',
            'comment_type',
            'source',
            'attachments',
            'created_at',
        ]
        read_only_fields = ['id', 'ticket', 'author', 'author_email', 'author_name', 'created_at']


class CommentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ['body', 'comment_type', 'source']
    # ticket and author are injected by perform_create via serializer.save(ticket=..., author=...)
    # DRF merges them into validated_data automatically before calling create().


class TicketListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    requestor_email = serializers.EmailField(source='requestor.email', read_only=True)
    requestor_name = serializers.CharField(source='requestor.full_name', read_only=True)
    assignee_email = serializers.EmailField(source='assignee.email', read_only=True, allow_null=True)
    assignee_name = serializers.CharField(source='assignee.full_name', read_only=True, allow_null=True)
    archived_by_email = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            'id',
            'ticket_number',
            'subject',
            'status',
            'priority',
            'source',
            'category',
            'category_name',
            'requestor',
            'requestor_email',
            'requestor_name',
            'assignee',
            'assignee_email',
            'assignee_name',
            'sla_due_at',
            'sla_breached',
            'is_archived',
            'archived_at',
            'archive_reason',
            'archived_by_email',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'ticket_number',
            'created_at',
            'requestor',
            'requestor_email',
            'requestor_name',
            'assignee_email',
            'assignee_name',
            'category_name',
            'sla_breached',
            'is_archived',
            'archived_at',
            'archive_reason',
            'archived_by_email',
        ]

    def get_archived_by_email(self, obj):
        return obj.archived_by.email if obj.archived_by else None


class TicketDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    requestor_email = serializers.EmailField(source='requestor.email', read_only=True)
    requestor_name = serializers.CharField(source='requestor.full_name', read_only=True)
    assignee_email = serializers.EmailField(source='assignee.email', read_only=True, allow_null=True)
    assignee_name = serializers.CharField(source='assignee.full_name', read_only=True, allow_null=True)
    comments = CommentSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    archived_by_email = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            'id',
            'ticket_number',
            'subject',
            'description',
            'status',
            'priority',
            'source',
            'category',
            'category_name',
            'requestor',
            'requestor_email',
            'requestor_name',
            'assignee',
            'assignee_email',
            'assignee_name',
            'custom_fields',
            'sla_due_at',
            'sla_breached',
            'resolved_at',
            'closed_at',
            'email_message_id',
            'teams_conversation_id',
            'is_archived',
            'archived_at',
            'archive_reason',
            'archived_by_email',
            'comments',
            'attachments',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'ticket_number',
            'requestor',
            'requestor_email',
            'requestor_name',
            'assignee_email',
            'assignee_name',
            'category_name',
            'sla_breached',
            'resolved_at',
            'closed_at',
            'is_archived',
            'archived_at',
            'archive_reason',
            'archived_by_email',
            'created_at',
            'updated_at',
        ]

    def get_archived_by_email(self, obj):
        return obj.archived_by.email if obj.archived_by else None


class TicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ['subject', 'description', 'priority', 'category', 'custom_fields', 'source']
        extra_kwargs = {
            'source': {'required': False},
            'custom_fields': {'required': False},
            'description': {'required': False},
            'priority': {'required': False},
            'category': {'required': False},
        }

    def validate(self, attrs):
        category = attrs.get('category', getattr(self.instance, 'category', None))
        category_id = category.id if category else None

        custom_fields = attrs.get('custom_fields', getattr(self.instance, 'custom_fields', {}))
        if custom_fields is None:
            custom_fields = {}

        from apps.custom_fields.models import FieldSchema
        from django.db.models import Q
        
        schemas_qs = FieldSchema.objects.filter(
            module=FieldSchema.TICKETS,
            is_active=True
        ).filter(
            Q(category_id__isnull=True) | Q(category_id=category_id)
        )
        schemas = {fs.name: fs for fs in schemas_qs}

        errors = {}
        for field_name, field_value in custom_fields.items():
            schema = schemas.get(field_name)
            if schema is None:
                errors[field_name] = f'Unknown custom field: {field_name}.'
                continue
            valid, error = schema.validate_value(field_value)
            if not valid:
                errors[field_name] = error

        for name, schema in schemas.items():
            if schema.is_required and name not in custom_fields:
                errors[name] = f'{schema.label} is required.'

        if errors:
            raise serializers.ValidationError({'custom_fields': errors})

        return attrs

    def to_representation(self, instance):
        # Return the full list representation after create so the frontend
        # receives id, ticket_number, status etc.
        return TicketListSerializer(instance, context=self.context).data

    def create(self, validated_data):
        request = self.context['request']
        validated_data.setdefault('source', Ticket.PORTAL)
        validated_data.setdefault('custom_fields', {})
        ticket = Ticket(requestor=request.user, **validated_data)

        # Calculate SLA due date from category if available
        category = validated_data.get('category')
        if category:
            resolution_hours = category.sla_resolution_hours
            ticket.sla_due_at = timezone.now() + timezone.timedelta(hours=resolution_hours)
            # Auto-assign default assignee from category if none set
            if not ticket.assignee and category.default_assignee:
                ticket.assignee = category.default_assignee

        ticket.save()
        return ticket


class TicketUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ['subject', 'description', 'priority', 'category', 'assignee', 'status', 'custom_fields']
        extra_kwargs = {
            'subject': {'required': False},
            'description': {'required': False},
            'priority': {'required': False},
            'category': {'required': False},
            'assignee': {'required': False},
            'status': {'required': False},
            'custom_fields': {'required': False},
        }

    def validate(self, attrs):
        category = attrs.get('category', getattr(self.instance, 'category', None))
        category_id = category.id if category else None

        custom_fields = attrs.get('custom_fields', getattr(self.instance, 'custom_fields', {}))
        if custom_fields is None:
            custom_fields = {}

        from apps.custom_fields.models import FieldSchema
        from django.db.models import Q
        
        schemas_qs = FieldSchema.objects.filter(
            module=FieldSchema.TICKETS,
            is_active=True
        ).filter(
            Q(category_id__isnull=True) | Q(category_id=category_id)
        )
        schemas = {fs.name: fs for fs in schemas_qs}

        errors = {}
        for field_name, field_value in custom_fields.items():
            schema = schemas.get(field_name)
            if schema is None:
                errors[field_name] = f'Unknown custom field: {field_name}.'
                continue
            valid, error = schema.validate_value(field_value)
            if not valid:
                errors[field_name] = error

        for name, schema in schemas.items():
            if schema.is_required and name not in custom_fields:
                errors[name] = f'{schema.label} is required.'

        if errors:
            raise serializers.ValidationError({'custom_fields': errors})

        return attrs



class ArchiveActionSerializer(serializers.Serializer):
    """Mandatory reason for archiving or unarchiving. Minimum 10 characters."""
    reason = serializers.CharField(
        min_length=10,
        max_length=1000,
        help_text='Mandatory reason for archiving or unarchiving. Minimum 10 characters.',
        error_messages={'min_length': 'Archive reason must be at least 10 characters.'},
    )


# Alias kept for any internal references that use the old name.
TicketArchiveSerializer = ArchiveActionSerializer


class CannedResponseSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = CannedResponse
        fields = [
            'id',
            'name',
            'body',
            'subject',
            'category',
            'category_name',
            'scope',
            'created_by',
            'created_by_email',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_email', 'category_name', 'created_at', 'updated_at']
