import logging
import re

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# IMAP helpers (legacy single-mailbox — kept for env-var fallback)
# ---------------------------------------------------------------------------

def _connect_imap():
    """Return an authenticated IMAPClient using settings.IMAP_*."""
    import imapclient

    host = settings.IMAP_HOST
    port = settings.IMAP_PORT
    use_ssl = getattr(settings, 'IMAP_SSL', True)

    client = imapclient.IMAPClient(host, port=port, ssl=use_ssl)
    client.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
    return client


# ---------------------------------------------------------------------------
# Email parsing
# ---------------------------------------------------------------------------

def _parse_email(raw_bytes: bytes) -> dict:
    import email as email_lib
    from email import policy as email_policy
    msg = email_lib.message_from_bytes(raw_bytes, policy=email_policy.default)

    result = {
        'from_email': '',
        'from_name': '',
        'subject': '',
        'body_text': '',
        'body_html': '',
        'message_id': msg.get('Message-ID', ''),
        'in_reply_to': msg.get('In-Reply-To', ''),
        'references': msg.get('References', ''),
        'to_addresses': [],
        'attachments': [],   # list of {filename, content_type, data: bytes, inline: bool, cid: str}
    }

    # Parse From header
    from_header = msg.get('From', '')
    try:
        from email.utils import parseaddr
        name, addr = parseaddr(from_header)
        result['from_email'] = addr.lower().strip()
        result['from_name'] = name
    except Exception:
        result['from_email'] = from_header.lower().strip()

    # Parse To/CC headers for ticket routing
    for hdr in ['To', 'Cc']:
        val = msg.get(hdr, '')
        if val:
            from email.utils import getaddresses
            result['to_addresses'] += [addr for _, addr in getaddresses([val]) if addr]

    result['subject'] = str(msg.get('Subject', '(No Subject)'))

    # Walk MIME parts
    cid_map = {}  # content-id -> attachment index (for inline image replacement)
    for part in msg.walk():
        ct = part.get_content_type()
        cd = str(part.get('Content-Disposition') or '')
        cid_raw = part.get('Content-ID', '')
        cid = cid_raw.strip('<>') if cid_raw else ''

        if ct == 'text/plain' and not result['body_text']:
            try:
                result['body_text'] = part.get_content()
            except Exception:
                pass
        elif ct == 'text/html' and not result['body_html']:
            try:
                result['body_html'] = part.get_content()
            except Exception:
                pass
        elif ct.startswith('image/') or ('attachment' in cd.lower()):
            # Extract all images and file attachments
            try:
                data = part.get_payload(decode=True)
                if data:
                    filename = part.get_filename() or f'attachment.{ct.split("/")[-1]}'
                    is_inline = 'inline' in cd.lower() or (cid and 'attachment' not in cd.lower())
                    att = {
                        'filename': filename,
                        'content_type': ct,
                        'data': data,
                        'inline': is_inline,
                        'cid': cid,
                    }
                    idx = len(result['attachments'])
                    result['attachments'].append(att)
                    if cid:
                        cid_map[cid] = idx
            except Exception:
                pass

    # Use HTML body as fallback for text body
    if not result['body_text'] and result['body_html']:
        result['body_text'] = re.sub(r'<[^>]+>', ' ', result['body_html']).strip()

    return result


def _extract_ticket_number(subject, to_addresses):
    """
    Return a ticket number string like 'TKT-00001' if found in:
      - subject: '[Ticket #TKT-00001]'
      - any To address: 'helpdesk+ticket-TKT-00001@domain.com'
    Returns None if not found.
    """
    subject_match = re.search(r'\[Ticket\s+#(TKT-\d+)\]', subject, re.IGNORECASE)
    if subject_match:
        return subject_match.group(1).upper()

    for addr in to_addresses:
        plus_match = re.search(r'\+ticket-(TKT-\d+)@', addr, re.IGNORECASE)
        if plus_match:
            return plus_match.group(1).upper()

    return None


def _save_email_attachments(ticket, attachments: list, uploaded_by=None, comment=None):
    """Save ALL email attachments — images, PDFs, Office docs, ZIPs, any type."""
    import os
    from django.core.files.base import ContentFile
    from apps.tickets.models import Attachment

    # Block only truly dangerous executable types — accept everything else
    BLOCKED_TYPES = {
        'application/x-msdownload', 'application/x-executable',
        'application/x-sh', 'application/x-bat',
    }
    BLOCKED_EXTENSIONS = {'.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.ps1'}

    MAX_SIZE = 25 * 1024 * 1024  # 25 MB per attachment

    for att in attachments:
        ct  = att.get('content_type', 'application/octet-stream')
        data = att.get('data', b'')

        if not data:
            continue
        if ct in BLOCKED_TYPES:
            logger.warning(f'Skipped blocked attachment type: {ct}')
            continue
        if len(data) > MAX_SIZE:
            logger.warning(f'Skipped oversized attachment ({len(data)} bytes)')
            continue

        filename = att.get('filename') or f'attachment.{ct.split("/")[-1]}'
        filename = os.path.basename(filename).replace('..', '').strip() or 'attachment'
        ext = os.path.splitext(filename)[1].lower()
        if ext in BLOCKED_EXTENSIONS:
            logger.warning(f'Skipped blocked extension: {ext}')
            continue

        filename = att.get('filename', 'attachment')
        # Sanitize filename
        filename = os.path.basename(filename).replace('..', '').strip() or 'attachment'

        try:
            attachment = Attachment(
                ticket=ticket,
                comment=comment,
                original_filename=filename,
                file_size=len(data),
                uploaded_by=uploaded_by,
            )
            attachment.file.save(filename, ContentFile(data), save=True)
            logger.info(f'Saved attachment: {filename} ({len(data)} bytes) for {ticket.ticket_number}')
        except Exception as e:
            logger.warning(f'Could not save attachment {filename}: {e}')


def _create_ticket_from_email(parsed, default_category=None, default_priority='medium',
                               reply_to_address=None):
    """Create a new Ticket from a parsed inbound email."""
    from apps.accounts.models import User
    from apps.tickets.models import Category, Ticket
    from apps.tickets.tasks import send_ticket_notification

    sender_email = parsed['from_email']
    sender_name = parsed['from_name']

    if not sender_email:
        logger.warning('_create_ticket_from_email: no sender email found, skipping')
        return None

    user, _ = User.objects.get_or_create_guest(sender_email, sender_name)

    # Use per-mailbox default category if provided; otherwise fall back to first active category
    if default_category is not None:
        category = default_category
    else:
        category = Category.objects.filter(is_active=True).first()

    assignee = category.default_assignee if category else None

    subject = parsed['subject'] or '(No Subject)'
    body = parsed['body_text'] or parsed['body_html'] or ''

    ticket = Ticket.objects.create(
        subject=subject,
        description=body,
        source=Ticket.EMAIL,
        requestor=user,
        category=category,
        assignee=assignee,
        priority=default_priority,
        email_message_id=parsed['message_id'],
    )

    logger.info(
        '_create_ticket_from_email: created ticket %s from %s (mailbox: %s)',
        ticket.ticket_number,
        sender_email,
        reply_to_address or 'default',
    )

    if parsed.get('attachments'):
        _save_email_attachments(ticket, parsed['attachments'], uploaded_by=user)

    send_ticket_notification.delay(str(ticket.id), 'created')
    return ticket


def _add_comment_from_email(ticket, parsed):
    """Add a reply comment to an existing ticket from a parsed inbound email."""
    from apps.accounts.models import User
    from apps.tickets.models import Comment
    from apps.tickets.tasks import send_ticket_notification

    sender_email = parsed['from_email']
    sender_name = parsed['from_name']

    if not sender_email:
        logger.warning('_add_comment_from_email: no sender email, ticket %s', ticket.ticket_number)
        return None

    user, _ = User.objects.get_or_create_guest(sender_email, sender_name)

    body = parsed['body_text'] or parsed['body_html'] or ''

    comment = Comment.objects.create(
        ticket=ticket,
        author=user,
        body=body,
        comment_type=Comment.REPLY,
        source='email',
    )

    logger.info(
        '_add_comment_from_email: added comment %s on ticket %s from %s',
        comment.id,
        ticket.ticket_number,
        sender_email,
    )

    if parsed.get('attachments'):
        _save_email_attachments(ticket, parsed['attachments'], uploaded_by=user, comment=comment)

    send_ticket_notification.delay(str(ticket.id), 'commented', str(comment.id))
    return comment


# ---------------------------------------------------------------------------
# Shared processing helper
# ---------------------------------------------------------------------------

def _process_raw_messages(raw_messages, default_category=None, default_priority='medium',
                           reply_to_address=None):
    """
    Parse and route a list of raw RFC-5322 message bytes.
    Creates or updates tickets as appropriate.
    Returns the count of messages successfully processed.
    """
    from apps.tickets.models import Ticket

    count = 0
    for raw in raw_messages:
        try:
            parsed = _parse_email(raw)
            ticket_number = _extract_ticket_number(
                parsed['subject'],
                parsed.get('to_addresses', []),
            )
            if ticket_number:
                try:
                    ticket = Ticket.objects.get(ticket_number__iexact=ticket_number)
                    _add_comment_from_email(ticket, parsed)
                except Ticket.DoesNotExist:
                    logger.warning(
                        '_process_raw_messages: ticket %s not found, creating new ticket instead',
                        ticket_number,
                    )
                    _create_ticket_from_email(
                        parsed,
                        default_category=default_category,
                        default_priority=default_priority,
                        reply_to_address=reply_to_address,
                    )
            else:
                _create_ticket_from_email(
                    parsed,
                    default_category=default_category,
                    default_priority=default_priority,
                    reply_to_address=reply_to_address,
                )
            count += 1
        except Exception as exc:
            logger.error(
                '_process_raw_messages: error processing message: %s', exc, exc_info=True
            )

    return count


# ---------------------------------------------------------------------------
# Multi-mailbox fetchers (database-driven)
# ---------------------------------------------------------------------------

def _fetch_imap_from_mailbox(mailbox) -> list:
    """Fetch raw message bytes from an InboundMailbox via IMAP."""
    import imapclient

    conn = imapclient.IMAPClient(
        mailbox.host, port=mailbox.port, ssl=mailbox.use_ssl, timeout=30
    )
    conn.login(mailbox.username, mailbox.password)
    conn.select_folder(mailbox.imap_folder)
    uids = conn.search(['UNSEEN'])
    if not uids:
        conn.logout()
        return []

    raw_messages = []
    # Ensure processed folder exists
    try:
        conn.create_folder(mailbox.processed_folder)
    except Exception:
        pass

    for uid in uids:
        try:
            data = conn.fetch([uid], ['RFC822'])
            raw = data[uid][b'RFC822']
            raw_messages.append(raw)
            conn.copy([uid], mailbox.processed_folder)
            conn.delete_messages([uid])
        except Exception as e:
            logger.error('IMAP: failed on UID %s for mailbox %s: %s', uid, mailbox.email_address, e)

    conn.expunge()
    conn.logout()
    logger.info('IMAP %s: retrieved %d message(s)', mailbox.email_address, len(raw_messages))
    return raw_messages


def _fetch_pop3_from_mailbox(mailbox) -> list:
    """Fetch raw message bytes from an InboundMailbox via POP3."""
    import poplib

    if mailbox.use_ssl:
        conn = poplib.POP3_SSL(mailbox.host, mailbox.port, timeout=30)
    else:
        conn = poplib.POP3(mailbox.host, mailbox.port)
    conn.user(mailbox.username)
    conn.pass_(mailbox.password)
    num = len(conn.list()[1])
    raw_messages = []
    for i in range(1, num + 1):
        try:
            lines = conn.retr(i)[1]
            raw_messages.append(b'\r\n'.join(lines))
            conn.dele(i)
        except Exception as e:
            logger.error(
                'POP3: failed on message %d for mailbox %s: %s', i, mailbox.email_address, e
            )
    conn.quit()
    logger.info('POP3 %s: retrieved %d message(s)', mailbox.email_address, len(raw_messages))
    return raw_messages


# ---------------------------------------------------------------------------
# Main periodic tasks
# ---------------------------------------------------------------------------

@shared_task(queue='default', name='email_processor.poll_all_mailboxes')
def poll_all_inbound_mailboxes():
    """
    Master task called by Celery Beat every 60 seconds.
    Fans out to one task per active InboundMailbox.
    Falls back to legacy single-mailbox env-var config if no mailboxes are in DB.
    """
    try:
        from apps.email_config.models import InboundMailbox
        active_mailboxes = list(InboundMailbox.objects.filter(is_active=True))
    except Exception:
        active_mailboxes = []

    if active_mailboxes:
        for mailbox in active_mailboxes:
            poll_single_mailbox.delay(str(mailbox.id))
    else:
        # Legacy fallback — original single-mailbox behaviour
        poll_imap_mailbox.apply_async()


@shared_task(queue='email', name='email_processor.poll_single_mailbox', bind=True, max_retries=2)
def poll_single_mailbox(self, mailbox_id: str):
    """Poll one InboundMailbox and process its emails."""
    from django.utils import timezone

    try:
        from apps.email_config.models import InboundMailbox
        mailbox = InboundMailbox.objects.get(id=mailbox_id)
    except Exception as e:
        logger.error('poll_single_mailbox: mailbox %s not found: %s', mailbox_id, e)
        return

    logger.info('Polling %s mailbox: %s', mailbox.protocol.upper(), mailbox.email_address)

    try:
        if mailbox.protocol == 'imap':
            raw_messages = _fetch_imap_from_mailbox(mailbox)
        else:
            raw_messages = _fetch_pop3_from_mailbox(mailbox)

        count = _process_raw_messages(
            raw_messages,
            default_category=mailbox.default_category,
            default_priority=mailbox.default_priority,
            reply_to_address=mailbox.email_address,
        )

        mailbox.last_polled_at = timezone.now()
        mailbox.last_error = ''
        mailbox.emails_processed = (mailbox.emails_processed or 0) + count
        mailbox.save(update_fields=['last_polled_at', 'last_error', 'emails_processed'])

    except Exception as exc:
        mailbox.last_polled_at = timezone.now()
        mailbox.last_error = str(exc)[:500]
        mailbox.save(update_fields=['last_polled_at', 'last_error'])
        logger.error('Error polling %s: %s', mailbox.email_address, exc)
        raise self.retry(exc=exc, countdown=30)


@shared_task(queue='default', name='email_processor.poll_imap')
def poll_imap_mailbox():
    """
    Legacy single-mailbox IMAP task.
    Retained as fallback when no InboundMailbox records are configured.
    Scheduled by poll_all_inbound_mailboxes when the DB contains no active mailboxes.

    For each UNSEEN message in INBOX:
      1. Parse the email.
      2. If subject/To matches an existing ticket -> add as comment.
      3. Otherwise create a new ticket.
      4. Move message to IMAP_PROCESSED_FOLDER.

    If EMAIL_INBOUND_PROTOCOL == 'pop3', delegates to poll_pop3_mailbox instead.
    """
    protocol = getattr(settings, 'EMAIL_INBOUND_PROTOCOL', 'imap').lower()
    if protocol == 'pop3':
        logger.info('poll_imap_mailbox: EMAIL_INBOUND_PROTOCOL=pop3, delegating to POP3 task')
        poll_pop3_mailbox.apply()
        return

    processed_folder = getattr(settings, 'IMAP_PROCESSED_FOLDER', 'INBOX.Processed')

    try:
        client = _connect_imap()
    except Exception as exc:
        logger.error('poll_imap_mailbox: failed to connect to IMAP: %s', exc)
        return

    try:
        client.select_folder('INBOX')
        uids = client.search(['UNSEEN'])

        if not uids:
            logger.debug('poll_imap_mailbox: no unseen messages')
            return

        logger.info('poll_imap_mailbox: found %d unseen message(s)', len(uids))

        try:
            if not client.folder_exists(processed_folder):
                client.create_folder(processed_folder)
                logger.info('poll_imap_mailbox: created folder %s', processed_folder)
        except Exception as exc:
            logger.warning(
                'poll_imap_mailbox: could not ensure folder %s exists: %s',
                processed_folder, exc,
            )

        messages_to_expunge = []

        for uid in uids:
            try:
                raw_data = client.fetch([uid], ['RFC822'])
                if uid not in raw_data or b'RFC822' not in raw_data[uid]:
                    logger.warning('poll_imap_mailbox: no RFC822 data for uid %s', uid)
                    continue

                raw_bytes = raw_data[uid][b'RFC822']
                _process_raw_messages([raw_bytes])

                try:
                    client.copy([uid], processed_folder)
                except Exception as copy_exc:
                    logger.warning(
                        'poll_imap_mailbox: could not copy uid %s to %s: %s',
                        uid, processed_folder, copy_exc,
                    )

                client.add_flags([uid], [b'\\Deleted'])
                messages_to_expunge.append(uid)

            except Exception as exc:
                logger.error(
                    'poll_imap_mailbox: error processing uid %s: %s',
                    uid, exc, exc_info=True,
                )
                continue

        if messages_to_expunge:
            try:
                client.expunge()
                logger.info('poll_imap_mailbox: expunged %d message(s)', len(messages_to_expunge))
            except Exception as exc:
                logger.error('poll_imap_mailbox: expunge failed: %s', exc)

    except Exception as exc:
        logger.error('poll_imap_mailbox: unexpected error: %s', exc, exc_info=True)
    finally:
        try:
            client.logout()
        except Exception:
            pass


@shared_task(queue='default', name='email_processor.poll_pop3')
def poll_pop3_mailbox():
    """
    Legacy single-mailbox POP3 task.
    Retained as fallback when no InboundMailbox records are configured.
    """
    from .pop3_handler import fetch_pop3_emails

    logger.info('poll_pop3_mailbox: starting POP3 poll')

    try:
        raw_messages = fetch_pop3_emails()
    except Exception as exc:
        logger.error('poll_pop3_mailbox: fetch failed: %s', exc, exc_info=True)
        return

    if not raw_messages:
        logger.debug('poll_pop3_mailbox: no messages retrieved')
        return

    logger.info('poll_pop3_mailbox: processing %d message(s)', len(raw_messages))
    processed = _process_raw_messages(raw_messages)
    logger.info('poll_pop3_mailbox: processed %d message(s)', processed)
