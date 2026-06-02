import asyncio
import json
import logging

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

try:
    from botbuilder.core import BotFrameworkAdapter, BotFrameworkAdapterSettings
    from botbuilder.schema import Activity
    from .bot import ITSMBot
    TEAMS_BOT_AVAILABLE = True
except ImportError:
    TEAMS_BOT_AVAILABLE = False

logger = logging.getLogger(__name__)


def _get_or_create_event_loop():
    """Return a running event loop, creating one if necessary."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


@method_decorator(csrf_exempt, name='dispatch')
class TeamsWebhookView(View):
    """
    Endpoint that receives Activity payloads from Microsoft Teams / Bot Framework.

    POST /api/teams/webhook/
    """

    _adapter = None
    _bot = None

    @classmethod
    def _get_adapter(cls):
        if cls._adapter is None:
            adapter_settings = BotFrameworkAdapterSettings(
                app_id=getattr(settings, 'TEAMS_APP_ID', ''),
                app_password=getattr(settings, 'TEAMS_APP_PASSWORD', ''),
            )
            cls._adapter = BotFrameworkAdapter(adapter_settings)
        return cls._adapter

    @classmethod
    def _get_bot(cls):
        if cls._bot is None:
            cls._bot = ITSMBot()
        return cls._bot

    def post(self, request):
        if not TEAMS_BOT_AVAILABLE:
            return JsonResponse({'error': 'Teams bot library not installed. Run: pip install botbuilder-core botbuilder-integration-aiohttp'}, status=503)
        # ---- Parse the incoming Activity from the request body ----
        try:
            body = request.body.decode('utf-8')
            activity = Activity.deserialize(json.loads(body))
        except Exception as exc:
            logger.error('TeamsWebhookView.post: failed to parse activity: %s', exc)
            return JsonResponse({'error': 'Invalid activity payload'}, status=400)

        auth_header = request.META.get('HTTP_AUTHORIZATION', '')

        adapter = self._get_adapter()
        bot = self._get_bot()

        async def _process():
            response = await adapter.process_activity(activity, auth_header, bot.on_turn)
            return response

        try:
            loop = _get_or_create_event_loop()
            loop.run_until_complete(_process())
        except Exception as exc:
            logger.error(
                'TeamsWebhookView.post: error processing activity type=%s: %s',
                getattr(activity, 'type', 'unknown'),
                exc,
                exc_info=True,
            )
            # Return 500 so Bot Framework will retry
            return HttpResponse(status=500)

        return HttpResponse(status=200)
