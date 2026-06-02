import email
import logging
import re
from email import policy
from email.headerregistry import Address

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# IMAP helpers
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


def _parse_email(raw_bytes):
    """
    Parse raw RFC-5322 bytes into a structured dict.

    Returns:
        {
            from_email: str,
            from_name: str,
            subject: str,
            body_text: str,
            body_html: str,
            message_id: str,
            in_reply_to: str,
            references: str,
            to_addresses: list[str],
            attachments: list[{filename, content_type, data}],
        }
    """
    msg = email.message_from_bytes(raw_bytes, policy=policy.default)

    # ---- From ----
    from_header = msg.get('From', '')
    from_email = ''
    from_name = ''
    try:
        parsed_from = msg['From']
        if hasattr(parsed_from, 'addresses') and parsed_from.addresses:
            addr = parsed_from.addresses[0]
            from_email = str(addr.addr_spec)
            from_name = addr.display_name or ''
        else:
            # Fallback: raw parse
            raw = str(from_header)
            match = re.search(r'<([^>]+)>', raw)
            if match:
                from_email = match.group(1).strip()
                from_name = raw[:raw.index('<')].strip().strip('"')
            else:
                from_email = raw.strip()
    except Exception:
        from_email = str(from_header)

    # ---- To ----
    to_addresses = []
    try:
        to_header = msg.get('To', '')
        if hasattr(msg['To'], 'addresses'):
            for addr in msg['To'].addresses:
                to_addresses.append(str(addr.addr_spec).lower())
        else:
            # Fallback: extract all angle-bracket or bare addresses
            for part in str(to_header).split(','):
                m = re.search(r'<([^>]+)>', part)
                if m:
                    to_addresses.append(m.group(1).strip().lower())
                else:
                    cleaned = part.strip()
                    if cleaned:
                        to_addresses.append(cleaned.lower())
    except Exception:
        pass

    # ---- Subject ----
    subject = str(msg.get('Subject', ''))

    # ---- Threading headers ----
    message_id = str(msg.get('Message-ID', '')).strip()
    in_reply_to = str(msg.get('In-Reply-To', '')).strip()
    references = str(msg.get('References', '')).strip()

    # ---- Body & attachments ----
    body_text = ''
    body_html = ''
    attachments = []

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get_content_disposition() or '')

            if 'attachment' in disposition or 'inline' in disposition:
                filename = part.get_filename() or 'attachment'
                try:
                    data = part.get_payload(decode=True)
                    attachments.append({
                        'filename': filename,
                        'content_type': content_type,
                        'data': data,
                    })
                except Exception as exc:
                    logger.warning('_parse_email: failed to decode attachment %s: %s', filename, exc)
            elif content_type == 'text/plain' and not body_text:
                try:
                    body_text = part.get_payload(decode=True).decode(
                        part.get_content_charset() or 'utf-8', errors='replace'
                    )
                except Exception:
                    body_text = str(part.get_payload())
            elif content_type == 'text/html' and not body_html:
                try:
                    body_html = part.get_payload(decode=True).decode(
                        part.get_content_charset() or 'utf-8', errors='replace'
                    )
                except Exception:
                    body_html = str(part.get_payload())
    else:
        content_type = msg.get_content_type()
        try:
            payload = msg.get_payload(decode=True).decode(
                msg.get_content_charset() or 'utf-8', errors='replace'
            )
        except Exception:
            payload = str(msg.get_payload())
        if content_type == 'text/html':
            body_html = payload
        else:
            body_text = payload

    # If we have no plain text but have HTML, strip tags as fallback
    if not body_text and body_html:
        body_text = re.sub(r'<[^>]+>', ' ', body_html)
        body_text = re.sub(r'\s+', ' ', body_text).strip()

    return {
        'from_email': from_email,
        'from_name': from_name,
        'subject': subject,
        'body_text': body_text,
        'body_html': body_html,
        'message_id': message_id,
        'in_reply_to': in_reply_to,
        'references': references,
        'to_addresses': to_addresses,
        'attachments': attachments,
    }


def _extract_ticket_number(subject, to_addresses):
    """
    Return a ticket number string like 'TKT-00001' if found in:
      - subject: '[Ticket #TKT-00001]'
      - any To address: 'helpdesk+ticket-TKT-00001@domain.com'
    Returns None if not found.
    """
    # Check subject pattern: [Ticket #TKT-XXXXX]
    subject_match = re.search(r'\[Ticket\s+#(TKT-\d+)\]', subject, re.IGNORECASE)
    if subject_match:
        return subject_match.group(1).upper()

    # Check plus-address pattern in any To address
    for addr in to_addresses:
        plus_match = re.search(r'\+ticket-(TKT-\d+)@', addr, re.IGNORECASE)
        if plus_match:
            return plus_match.group(1).upper()

    return None


def _save_email_attachments(ticket, comment, parsed_attachments, user):
    """Save parsed attachments to the database and associate with the ticket/comment."""
    import os
    from django.core.files.base import ContentFile
    from apps.tickets.models import Attachment

    for att in parsed_attachments:
        filename = att.get('filename') or 'attachment'
        data = att.get('data')
        if not data:
            continue

        file_size = len(data)
        if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
            logger.warning(
                '_save_email_attachments: skipping attachment %s: size %d exceeds limit',
                filename, file_size,
            )
            continue

        ext = os.path.splitext(filename)[1].lower()
        if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
            logger.warning(
                '_save_email_attachments: skipping attachment %s: extension %s not allowed',
                filename, ext,
            )
            continue

        try:
            content_file = ContentFile(data, name=filename)
            Attachment.objects.create(
                ticket=ticket,
                comment=comment,
                file=content_file,
                original_filename=filename,
                file_size=file_size,
                uploaded_by=user,
            )
            logger.info(
                '_save_email_attachments: saved attachment %s for ticket %s',
                filename, ticket.ticket_number,
            )
        except Exception as exc:
            logger.error('_save_email_attachments: failed to save attachment %s: %s', filename, exc)


def _create_ticket_from_email(parsed):
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

    # Use the first active category as default, or None
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
        email_message_id=parsed['message_id'],
    )

    logger.info(
        '_create_ticket_from_email: created ticket %s from %s',
        ticket.ticket_number,
        sender_email,
    )

    if parsed.get('attachments'):
        _save_email_attachments(ticket, None, parsed['attachments'], user)

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
        _save_email_attachments(ticket, comment, parsed['attachments'], user)

    send_ticket_notification.delay(str(ticket.id), 'commented', str(comment.id))
    return comment


# ---------------------------------------------------------------------------
# Shared processing helper — used by both IMAP and POP3 tasks
# ---------------------------------------------------------------------------

def _process_raw_messages(raw_messages):
    """
    Parse and route a list of raw RFC-5322 message bytes.
    Creates or updates tickets as appropriate.
    Returns the count of messages successfully processed.
    """
    from apps.tickets.models import Ticket

    processed = 0
    for raw_bytes in raw_messages:
        try:
            parsed = _parse_email(raw_bytes)

            ticket_number = _extract_ticket_number(
                parsed['subject'],
                parsed['to_addresses'],
            )

            if ticket_number:
                try:
                    ticket = Ticket.objects.get(ticket_number=ticket_number)
                    _add_comment_from_email(ticket, parsed)
                except Ticket.DoesNotExist:
                    logger.warning(
                        '_process_raw_messages: ticket %s not found, creating new ticket instead',
                        ticket_number,
                    )
                    _create_ticket_from_email(parsed)
            else:
                _create_ticket_from_email(parsed)

            processed += 1
        except Exception as exc:
            logger.error('_process_raw_messages: error processing message: %s', exc, exc_info=True)

    return processed


# ---------------------------------------------------------------------------
# Main periodic tasks
# ---------------------------------------------------------------------------

@shared_task(queue='default', name='email_processor.poll_imap')
def poll_imap_mailbox():
    """
    Poll the iRedMail IMAP mailbox.
    Scheduled via celery-beat (every 60 seconds).

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

        # Ensure the processed folder exists
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

                # Copy to processed folder and mark for deletion
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
                logger.info(
                    'poll_imap_mailbox: expunged %d message(s)',
                    len(messages_to_expunge),
                )
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
    Poll the POP3 mailbox.
    Scheduled via celery-beat (every 60 seconds) when EMAIL_INBOUND_PROTOCOL=pop3.

    Downloads all messages from the server, deletes them after retrieval,
    then routes each one as a new ticket or as a reply to an existing ticket.
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
