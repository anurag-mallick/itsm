from django.db import models


class FieldSchema(models.Model):
    # Modules that support custom fields
    TICKETS = 'tickets'
    HARDWARE = 'hardware_assets'
    SOFTWARE = 'software_assets'

    MODULE_CHOICES = [
        (TICKETS, 'Tickets'),
        (HARDWARE, 'Hardware Assets'),
        (SOFTWARE, 'Software Assets'),
    ]

    # Supported field types
    TEXT = 'text'
    TEXTAREA = 'textarea'
    NUMBER = 'number'
    DATE = 'date'
    DATETIME = 'datetime'
    DROPDOWN = 'dropdown'
    MULTI_SELECT = 'multi_select'
    CHECKBOX = 'checkbox'
    URL = 'url'
    EMAIL = 'email'

    FIELD_TYPE_CHOICES = [
        (TEXT, 'Text'),
        (TEXTAREA, 'Text Area'),
        (NUMBER, 'Number'),
        (DATE, 'Date'),
        (DATETIME, 'Date & Time'),
        (DROPDOWN, 'Dropdown'),
        (MULTI_SELECT, 'Multi-Select'),
        (CHECKBOX, 'Checkbox'),
        (URL, 'URL'),
        (EMAIL, 'Email'),
    ]

    module = models.CharField(max_length=30, choices=MODULE_CHOICES, db_index=True)
    # null category_id means the field applies to all categories within the module
    category_id = models.IntegerField(null=True, blank=True, db_index=True)
    name = models.SlugField(max_length=100)
    label = models.CharField(max_length=100)
    field_type = models.CharField(max_length=15, choices=FIELD_TYPE_CHOICES)
    # Choice list for dropdown / multi_select — stored as list of strings
    options = models.JSONField(default=list, blank=True)
    placeholder = models.CharField(max_length=200, blank=True)
    help_text = models.CharField(max_length=500, blank=True)
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # Validation rules: e.g. {"min": 0, "max": 100} or {"regex": "^[A-Z]"}
    validation_rules = models.JSONField(default=dict, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'custom_field_schema'
        unique_together = [['module', 'name', 'category_id']]
        ordering = ['module', 'display_order', 'label']

    def __str__(self):
        return f'{self.get_module_display()} — {self.label}'

    def validate_value(self, value):
        """Returns (is_valid: bool, error: str | None). Called at ticket/asset save time."""
        if self.is_required and (value is None or value == '' or value == []):
            return False, f'{self.label} is required.'

        if value is None or value == '':
            return True, None

        rules = self.validation_rules or {}

        if self.field_type == self.NUMBER:
            try:
                num = float(value)
            except (TypeError, ValueError):
                return False, f'{self.label} must be a number.'
            if 'min' in rules and num < rules['min']:
                return False, f'{self.label} must be at least {rules["min"]}.'
            if 'max' in rules and num > rules['max']:
                return False, f'{self.label} must be at most {rules["max"]}.'

        if self.field_type in (self.DROPDOWN, self.MULTI_SELECT) and self.options:
            choices = self.options
            values = value if isinstance(value, list) else [value]
            for v in values:
                if v not in choices:
                    return False, f'"{v}" is not a valid option for {self.label}.'

        return True, None
