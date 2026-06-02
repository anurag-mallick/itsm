from rest_framework import serializers

from apps.tickets.models import Ticket

from .models import CatalogCategory, CatalogItem, ServiceRequest


class CatalogCategorySerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()

    def get_items_count(self, obj):
        return obj.items.filter(is_active=True).count()

    class Meta:
        model = CatalogCategory
        fields = [
            'id',
            'name',
            'description',
            'icon',
            'display_order',
            'is_active',
            'items_count',
        ]


class CatalogItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = CatalogItem
        fields = [
            'id',
            'category',
            'category_name',
            'name',
            'description',
            'icon',
            'form_fields',
            'fulfillment_sla_hours',
            'auto_create_ticket',
            'requires_manager_approval',
            'is_active',
            'display_order',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ServiceRequestListSerializer(serializers.ModelSerializer):
    catalog_item_name = serializers.CharField(source='catalog_item.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    linked_ticket_number = serializers.SerializerMethodField()
    requested_by_name = serializers.CharField(
        source='requested_by.full_name', read_only=True
    )
    requested_by_email = serializers.EmailField(
        source='requested_by.email', read_only=True
    )

    def get_linked_ticket_number(self, obj):
        if obj.linked_ticket_id:
            return obj.linked_ticket.ticket_number
        return None

    class Meta:
        model = ServiceRequest
        fields = [
            'id',
            'ref_number',
            'catalog_item',
            'catalog_item_name',
            'status',
            'status_display',
            'requested_by',
            'requested_by_name',
            'requested_by_email',
            'linked_ticket_number',
            'created_at',
        ]
        read_only_fields = fields


class ServiceRequestDetailSerializer(serializers.ModelSerializer):
    catalog_item_name = serializers.CharField(source='catalog_item.name', read_only=True)
    catalog_item_icon = serializers.CharField(source='catalog_item.icon', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    requested_by_name = serializers.CharField(
        source='requested_by.full_name', read_only=True
    )
    requested_by_email = serializers.EmailField(
        source='requested_by.email', read_only=True
    )
    linked_ticket_number = serializers.SerializerMethodField()

    def get_linked_ticket_number(self, obj):
        if obj.linked_ticket_id:
            return obj.linked_ticket.ticket_number
        return None

    class Meta:
        model = ServiceRequest
        fields = [
            'id',
            'ref_number',
            'catalog_item',
            'catalog_item_name',
            'catalog_item_icon',
            'requested_by',
            'requested_by_name',
            'requested_by_email',
            'form_data',
            'status',
            'status_display',
            'notes',
            'linked_ticket',
            'linked_ticket_number',
            'created_at',
            'updated_at',
            'fulfilled_at',
        ]
        read_only_fields = fields


class ServiceRequestCreateSerializer(serializers.Serializer):
    catalog_item = serializers.UUIDField()
    form_data = serializers.DictField(child=serializers.JSONField(), required=False, default=dict)

    def validate_catalog_item(self, value):
        try:
            item = CatalogItem.objects.get(pk=value, is_active=True)
        except CatalogItem.DoesNotExist:
            raise serializers.ValidationError('Catalog item not found or inactive.')
        return item

    def create(self, validated_data):
        user = self.context['request'].user
        item = validated_data['catalog_item']
        form_data = validated_data.get('form_data', {})

        # Determine initial status based on approval requirement
        initial_status = (
            ServiceRequest.STATUS_PENDING_APPROVAL
            if item.requires_manager_approval
            else ServiceRequest.STATUS_SUBMITTED
        )

        service_request = ServiceRequest.objects.create(
            catalog_item=item,
            requested_by=user,
            form_data=form_data,
            status=initial_status,
        )

        # Auto-create a linked ticket if configured
        if item.auto_create_ticket:
            ticket = Ticket.objects.create(
                subject=f'Service Request: {item.name}',
                description=(
                    f'Service Request {service_request.ref_number} submitted by {user.full_name}.\n\n'
                    f'Form Data: {form_data}'
                ),
                source=Ticket.PORTAL,
                requestor=user,
            )
            service_request.linked_ticket = ticket
            service_request.save(update_fields=['linked_ticket'])

        return service_request

    def to_representation(self, instance):
        return ServiceRequestDetailSerializer(instance, context=self.context).data


class ServiceRequestStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ServiceRequest.STATUS_CHOICES)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
