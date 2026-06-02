"""
Management command: setup_demo_data
Creates default categories, sites, and demo users so every dropdown in the
frontend is populated on first boot. Idempotent — safe to run multiple times.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Seed default categories, sites, and demo users.'

    # ── helpers ──────────────────────────────────────────────────────────────
    def _ok(self, label, created):
        verb = 'Created' if created else 'Exists '
        self.stdout.write(f'  {verb}: {label}')

    # ── categories ───────────────────────────────────────────────────────────
    def _seed_categories(self):
        from apps.tickets.models import Category
        defaults = [
            ('IT Support',        8, 24),
            ('Software Issues',   4, 16),
            ('Hardware Issues',   4, 24),
            ('Network Issues',    2, 8),
            ('Access & Security', 2, 8),
            ('Procurement',       24, 72),
            ('General Enquiry',   8, 48),
            ('Facilities',        8, 48),
        ]
        for name, resp, resol in defaults:
            _, created = Category.objects.get_or_create(
                name=name,
                defaults={'sla_response_hours': resp, 'sla_resolution_hours': resol, 'is_active': True}
            )
            self._ok(f'Category: {name}', created)

    # ── sites ─────────────────────────────────────────────────────────────────
    def _seed_sites(self):
        from apps.assets.models import Site
        sites = [
            {
                'name': 'Head Office',
                'city': 'Mumbai',
                'country': 'India',
                'address': 'Bluspring House, BKC, Mumbai 400051',
                'contact_name': 'IT Helpdesk',
                'contact_email': 'helpdesk@helpdesk.local',
            },
            {
                'name': 'Branch - Bengaluru',
                'city': 'Bengaluru',
                'country': 'India',
                'address': 'Embassy Tech Village, Outer Ring Road, Bengaluru 560103',
                'contact_name': 'IT Support',
                'contact_email': 'helpdesk@helpdesk.local',
            },
            {
                'name': 'Branch - Delhi NCR',
                'city': 'Gurugram',
                'country': 'India',
                'address': 'Cyber Hub, DLF Phase 2, Gurugram 122002',
                'contact_name': 'IT Support',
                'contact_email': 'helpdesk@helpdesk.local',
            },
        ]
        for s in sites:
            _, created = Site.objects.get_or_create(name=s['name'], defaults=s)
            self._ok(f'Site: {s["name"]}', created)

    # ── demo users ────────────────────────────────────────────────────────────
    def _seed_users(self):
        from apps.accounts.models import User, Role

        demo_users = [
            {
                'email': 'itmanager@helpdesk.local',
                'first_name': 'Rahul',
                'last_name': 'Kumar',
                'role': Role.IT_MANAGER,
                'password': 'Manager@ITSM2025!',
            },
            {
                'email': 'agent1@helpdesk.local',
                'first_name': 'Priya',
                'last_name': 'Sharma',
                'role': Role.IT_AGENT,
                'password': 'Agent@ITSM2025!',
            },
            {
                'email': 'agent2@helpdesk.local',
                'first_name': 'Amit',
                'last_name': 'Singh',
                'role': Role.IT_AGENT,
                'password': 'Agent@ITSM2025!',
            },
            {
                'email': 'neha.gupta@company.local',
                'first_name': 'Neha',
                'last_name': 'Gupta',
                'role': Role.REQUESTOR,
                'password': 'User@ITSM2025!',
            },
            {
                'email': 'vikram.patel@company.local',
                'first_name': 'Vikram',
                'last_name': 'Patel',
                'role': Role.REQUESTOR,
                'password': 'User@ITSM2025!',
            },
            {
                'email': 'auditor@helpdesk.local',
                'first_name': 'Compliance',
                'last_name': 'Auditor',
                'role': Role.AUDITOR,
                'password': 'Audit@ITSM2025!',
            },
        ]

        for ud in demo_users:
            role_obj = Role.objects.filter(name=ud['role']).first()
            user, created = User.objects.get_or_create(
                email=ud['email'],
                defaults={
                    'first_name': ud['first_name'],
                    'last_name': ud['last_name'],
                    'role': role_obj,
                    'account_type': User.STAFF,
                    'is_active': True,
                }
            )
            if created:
                user.set_password(ud['password'])
                user.save(update_fields=['password'])
            self._ok(f'User: {user.email} ({ud["role"]})', created)

    # ── service catalog ───────────────────────────────────────────────────────
    def _seed_catalog(self):
        from apps.catalog.models import CatalogCategory, CatalogItem

        categories = [
            {
                'name': 'IT Hardware',
                'description': 'Requests for physical hardware equipment.',
                'icon': 'LaptopOutlined',
                'display_order': 1,
            },
            {
                'name': 'IT Software',
                'description': 'Software licences, installations, and access.',
                'icon': 'AppstoreOutlined',
                'display_order': 2,
            },
            {
                'name': 'General Services',
                'description': 'General IT and office service requests.',
                'icon': 'ToolOutlined',
                'display_order': 3,
            },
        ]
        cat_objects = {}
        for c in categories:
            obj, created = CatalogCategory.objects.get_or_create(
                name=c['name'],
                defaults={
                    'description': c['description'],
                    'icon': c['icon'],
                    'display_order': c['display_order'],
                    'is_active': True,
                },
            )
            cat_objects[c['name']] = obj
            self._ok(f'CatalogCategory: {c["name"]}', created)

        items = [
            {
                'category': 'IT Hardware',
                'name': 'New Laptop Request',
                'description': 'Request a new or replacement laptop for business use.',
                'icon': 'LaptopOutlined',
                'form_fields': [
                    {'name': 'laptop_type', 'label': 'Laptop Type', 'type': 'select',
                     'options': ['Standard', 'High Performance', 'Ultrabook'], 'required': True},
                    {'name': 'business_justification', 'label': 'Business Justification',
                     'type': 'textarea', 'required': True},
                    {'name': 'required_by', 'label': 'Required By Date',
                     'type': 'date', 'required': False},
                ],
                'fulfillment_sla_hours': 72,
                'auto_create_ticket': True,
                'requires_manager_approval': True,
                'display_order': 1,
            },
            {
                'category': 'IT Hardware',
                'name': 'Office Equipment',
                'description': 'Request monitors, keyboards, mice, docking stations, or other peripherals.',
                'icon': 'DesktopOutlined',
                'form_fields': [
                    {'name': 'equipment_type', 'label': 'Equipment Type', 'type': 'select',
                     'options': ['Monitor', 'Keyboard', 'Mouse', 'Docking Station', 'Headset', 'Other'],
                     'required': True},
                    {'name': 'quantity', 'label': 'Quantity', 'type': 'number',
                     'min': 1, 'max': 10, 'required': True},
                    {'name': 'justification', 'label': 'Justification', 'type': 'textarea', 'required': False},
                ],
                'fulfillment_sla_hours': 48,
                'auto_create_ticket': True,
                'requires_manager_approval': False,
                'display_order': 2,
            },
            {
                'category': 'IT Software',
                'name': 'Software License Request',
                'description': 'Request a new software licence or additional seats for existing software.',
                'icon': 'FileProtectOutlined',
                'form_fields': [
                    {'name': 'software_name', 'label': 'Software Name', 'type': 'text', 'required': True},
                    {'name': 'version', 'label': 'Version / Edition', 'type': 'text', 'required': False},
                    {'name': 'seats', 'label': 'Number of Seats', 'type': 'number', 'min': 1, 'required': True},
                    {'name': 'business_justification', 'label': 'Business Justification',
                     'type': 'textarea', 'required': True},
                ],
                'fulfillment_sla_hours': 96,
                'auto_create_ticket': True,
                'requires_manager_approval': True,
                'display_order': 1,
            },
            {
                'category': 'IT Software',
                'name': 'VPN Access',
                'description': 'Request VPN access for remote work.',
                'icon': 'SecurityScanOutlined',
                'form_fields': [
                    {'name': 'access_duration', 'label': 'Access Duration', 'type': 'select',
                     'options': ['Permanent', '3 Months', '6 Months', '1 Year'], 'required': True},
                    {'name': 'reason', 'label': 'Reason for Access', 'type': 'textarea', 'required': True},
                ],
                'fulfillment_sla_hours': 24,
                'auto_create_ticket': True,
                'requires_manager_approval': False,
                'display_order': 2,
            },
            {
                'category': 'General Services',
                'name': 'Password Reset',
                'description': 'Request a password reset for your Windows / email account.',
                'icon': 'KeyOutlined',
                'form_fields': [
                    {'name': 'account_type', 'label': 'Account Type', 'type': 'select',
                     'options': ['Windows Login', 'Email', 'Application'], 'required': True},
                    {'name': 'application_name', 'label': 'Application Name (if applicable)',
                     'type': 'text', 'required': False},
                ],
                'fulfillment_sla_hours': 4,
                'auto_create_ticket': True,
                'requires_manager_approval': False,
                'display_order': 1,
            },
            {
                'category': 'General Services',
                'name': 'New User Onboarding',
                'description': 'Provision accounts, hardware, and access for a new employee joining the organisation.',
                'icon': 'UserAddOutlined',
                'form_fields': [
                    {'name': 'employee_name', 'label': 'Employee Full Name', 'type': 'text', 'required': True},
                    {'name': 'department', 'label': 'Department', 'type': 'text', 'required': True},
                    {'name': 'joining_date', 'label': 'Joining Date', 'type': 'date', 'required': True},
                    {'name': 'manager_email', 'label': 'Reporting Manager Email',
                     'type': 'email', 'required': True},
                    {'name': 'systems_required', 'label': 'Systems / Applications Required',
                     'type': 'textarea', 'required': False},
                ],
                'fulfillment_sla_hours': 120,
                'auto_create_ticket': True,
                'requires_manager_approval': True,
                'display_order': 2,
            },
        ]

        for item_data in items:
            category_name = item_data.pop('category')
            category = cat_objects[category_name]
            _, created = CatalogItem.objects.get_or_create(
                name=item_data['name'],
                category=category,
                defaults={**item_data, 'is_active': True},
            )
            self._ok(f'CatalogItem: {item_data["name"]}', created)

    # ── handle ────────────────────────────────────────────────────────────────
    def handle(self, *args, **options):
        self.stdout.write('\n--- Seeding ticket categories ---')
        self._seed_categories()

        self.stdout.write('\n--- Seeding office sites ---')
        self._seed_sites()

        self.stdout.write('\n--- Seeding demo users ---')
        self._seed_users()

        self.stdout.write('\n--- Seeding service catalog ---')
        self._seed_catalog()

        self.stdout.write(self.style.SUCCESS('\nDemo data seeded successfully.\n'))
        self.stdout.write('Demo accounts:')
        self.stdout.write('  IT Manager : itmanager@helpdesk.local  / Manager@ITSM2025!')
        self.stdout.write('  IT Agent 1 : agent1@helpdesk.local     / Agent@ITSM2025!')
        self.stdout.write('  IT Agent 2 : agent2@helpdesk.local     / Agent@ITSM2025!')
        self.stdout.write('  Requestor 1: neha.gupta@company.local  / User@ITSM2025!')
        self.stdout.write('  Requestor 2: vikram.patel@company.local / User@ITSM2025!')
        self.stdout.write('  Auditor    : auditor@helpdesk.local     / Audit@ITSM2025!')
