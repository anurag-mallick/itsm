"""
POP3 email handler — same interface as IMAP but uses poplib.
Used when the mailbox only supports POP3, not IMAP.
"""
import poplib
import logging

from django.conf import settings

logger = logging.getLogger('itsm.email')


def fetch_pop3_emails():
    """
    Connect to POP3 mailbox, download all unread messages, return list of raw bytes.
    Deletes messages from server after retrieval (POP3 standard behaviour).
    Returns list of raw message bytes.
    """
    host = getattr(settings, 'POP3_HOST', '') or getattr(settings, 'IMAP_HOST', '')
    port = int(getattr(settings, 'POP3_PORT', 995))
    user = getattr(settings, 'POP3_USER', '') or getattr(settings, 'IMAP_USER', '')
    password = getattr(settings, 'POP3_PASSWORD', '') or getattr(settings, 'IMAP_PASSWORD', '')
    use_ssl = getattr(settings, 'IMAP_SSL', True)

    if not host or not user:
        logger.warning('POP3: no host/user configured — skipping')
        return []

    try:
        if use_ssl:
            conn = poplib.POP3_SSL(host, port, timeout=30)
        else:
            conn = poplib.POP3(host, port)

        conn.user(user)
        conn.pass_(password)

        num_messages = len(conn.list()[1])
        logger.info('POP3: %d message(s) on server', num_messages)

        raw_messages = []
        for i in range(1, num_messages + 1):
            try:
                lines = conn.retr(i)[1]
                raw = b'\r\n'.join(lines)
                raw_messages.append(raw)
                conn.dele(i)  # Mark for deletion
            except Exception as exc:
                logger.error('POP3: failed to retrieve message %d: %s', i, exc)

        conn.quit()
        logger.info('POP3: retrieved and deleted %d message(s)', len(raw_messages))
        return raw_messages

    except Exception as exc:
        logger.error('POP3: connection failed to %s:%d — %s', host, port, exc)
        return []
