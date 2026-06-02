from rest_framework import serializers

from apps.tickets.models import Ticket

from .models import ProblemRecord


class LinkedTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ['id', 'ticket_number', 'subject', 'status', 'priority']


class ProblemListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    owner_name = serializers.SerializerMethodField()
    linked_ticket_count = serializers.SerializerMethodField()

    def get_owner_name(self, obj):
        if obj.owner_id:
            return obj.owner.full_name
        return None

    def get_linked_ticket_count(self, obj):
        return obj.linked_tickets.count()

    class Meta:
        model = ProblemRecord
        fields = [
            'id',
            'ref_number',
            'title',
            'status',
            'status_display',
            'priority',
            'priority_display',
            'owner',
            'owner_name',
            'linked_ticket_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class ProblemDetailSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    owner_name = serializers.SerializerMethodField()
    owner_email = serializers.SerializerMethodField()
    linked_tickets = LinkedTicketSerializer(many=True, read_only=True)

    def get_owner_name(self, obj):
        if obj.owner_id:
            return obj.owner.full_name
        return None

    def get_owner_email(self, obj):
        if obj.owner_id:
            return obj.owner.email
        return None

    class Meta:
        model = ProblemRecord
        fields = [
            'id',
            'ref_number',
            'title',
            'description',
            'root_cause',
            'workaround',
            'resolution',
            'status',
            'status_display',
            'priority',
            'priority_display',
            'owner',
            'owner_name',
            'owner_email',
            'linked_tickets',
            'created_at',
            'updated_at',
            'resolved_at',
        ]
        read_only_fields = [
            'id',
            'ref_number',
            'status_display',
            'priority_display',
            'owner_name',
            'owner_email',
            'linked_tickets',
            'created_at',
            'updated_at',
            'resolved_at',
        ]


class ProblemCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProblemRecord
        fields = [
            'title',
            'description',
            'root_cause',
            'workaround',
            'resolution',
            'status',
            'priority',
            'owner',
        ]
        extra_kwargs = {
            'root_cause':  {'required': False},
            'workaround':  {'required': False},
            'resolution':  {'required': False},
            'status':      {'required': False},
            'priority':    {'required': False},
            'owner':       {'required': False, 'allow_null': True},
        }

    def to_representation(self, instance):
        return ProblemDetailSerializer(instance, context=self.context).data


class ProblemUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProblemRecord
        fields = [
            'title',
            'description',
            'root_cause',
            'workaround',
            'resolution',
            'status',
            'priority',
            'owner',
        ]
        extra_kwargs = {
            'title':       {'required': False},
            'description': {'required': False},
            'root_cause':  {'required': False},
            'workaround':  {'required': False},
            'resolution':  {'required': False},
            'status':      {'required': False},
            'priority':    {'required': False},
            'owner':       {'required': False, 'allow_null': True},
        }

    def to_representation(self, instance):
        return ProblemDetailSerializer(instance, context=self.context).data


class LinkTicketSerializer(serializers.Serializer):
    ticket_id = serializers.UUIDField()

    def validate_ticket_id(self, value):
        try:
            Ticket.objects.get(pk=value)
        except Ticket.DoesNotExist:
            raise serializers.ValidationError('Ticket not found.')
        return value
