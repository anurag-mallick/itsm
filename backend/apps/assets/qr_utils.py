import qrcode
import qrcode.image.pil
import barcode
from barcode.writer import ImageWriter
from io import BytesIO
import base64


def generate_qr_image(url: str) -> str:
    """Return a base64 PNG data URI for a QR code pointing to url."""
    qr = qrcode.QRCode(version=1, box_size=8, border=2,
                       error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color='black', back_color='white')
    buf = BytesIO()
    img.save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def generate_barcode_image(text: str) -> str:
    """Return a base64 PNG data URI for a Code128 barcode of text."""
    buf = BytesIO()
    code128 = barcode.get('code128', text, writer=ImageWriter())
    code128.write(buf, options={'write_text': True, 'module_height': 12, 'font_size': 8})
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
