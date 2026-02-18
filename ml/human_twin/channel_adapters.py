import base64
import os
import smtplib
from email.message import EmailMessage
from typing import Any, Dict

import httpx


class DeliveryError(RuntimeError):
    pass


def _bool_env(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "1" if default else "0")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _require_enabled() -> None:
    if not _bool_env("NEUROTWIN_CHANNEL_ADAPTERS_ENABLED", False):
        raise DeliveryError("Channel adapters disabled. Set NEUROTWIN_CHANNEL_ADAPTERS_ENABLED=true")


def _redact(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 6:
        return "***"
    return f"{value[:3]}***{value[-2:]}"


def send_twilio_sms(to_handle: str, body: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    _require_enabled()
    sid = str(metadata.get("twilio_account_sid") or os.getenv("TWILIO_ACCOUNT_SID", "")).strip()
    token = str(metadata.get("twilio_auth_token") or os.getenv("TWILIO_AUTH_TOKEN", "")).strip()
    from_number = str(metadata.get("twilio_from_number") or os.getenv("TWILIO_FROM_NUMBER", "")).strip()
    if not sid or not token or not from_number:
        raise DeliveryError("Twilio SMS missing credentials or from number")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    resp = httpx.post(
        url,
        data={"To": to_handle, "From": from_number, "Body": body},
        auth=(sid, token),
        timeout=20.0,
    )
    if resp.status_code >= 300:
        raise DeliveryError(f"Twilio SMS failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    return {
        "provider": "twilio_sms",
        "ok": True,
        "sid": data.get("sid"),
        "to": _redact(to_handle),
    }


def send_whatsapp_business(to_handle: str, body: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    _require_enabled()
    token = str(metadata.get("whatsapp_token") or os.getenv("WHATSAPP_TOKEN", "")).strip()
    phone_id = str(metadata.get("whatsapp_phone_number_id") or os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")).strip()
    if not token or not phone_id:
        raise DeliveryError("WhatsApp Business missing token or phone number id")
    url = f"https://graph.facebook.com/v21.0/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_handle,
        "type": "text",
        "text": {"body": body},
    }
    resp = httpx.post(url, json=payload, headers={"Authorization": f"Bearer {token}"}, timeout=20.0)
    if resp.status_code >= 300:
        raise DeliveryError(f"WhatsApp Business failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    message_id = None
    msgs = data.get("messages") if isinstance(data, dict) else None
    if isinstance(msgs, list) and msgs:
        message_id = msgs[0].get("id")
    return {
        "provider": "whatsapp_business",
        "ok": True,
        "message_id": message_id,
        "to": _redact(to_handle),
    }


def send_telegram(to_handle: str, body: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    _require_enabled()
    token = str(metadata.get("telegram_bot_token") or os.getenv("TELEGRAM_BOT_TOKEN", "")).strip()
    if not token:
        raise DeliveryError("Telegram missing bot token")
    chat_id = str(to_handle).strip()
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    resp = httpx.post(url, json={"chat_id": chat_id, "text": body}, timeout=20.0)
    if resp.status_code >= 300:
        raise DeliveryError(f"Telegram failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    return {
        "provider": "telegram",
        "ok": bool(data.get("ok", True)),
        "to": _redact(chat_id),
    }


def send_smtp(to_handle: str, body: str, metadata: Dict[str, Any], subject: str = "NeuroEdge Personal Twin") -> Dict[str, Any]:
    _require_enabled()
    host = str(metadata.get("smtp_host") or os.getenv("SMTP_HOST", "")).strip()
    port = int(metadata.get("smtp_port") or os.getenv("SMTP_PORT", "587"))
    user = str(metadata.get("smtp_user") or os.getenv("SMTP_USER", "")).strip()
    password = str(metadata.get("smtp_pass") or os.getenv("SMTP_PASS", "")).strip()
    from_email = str(metadata.get("smtp_from") or os.getenv("SMTP_FROM", user)).strip()
    tls = str(metadata.get("smtp_tls") or os.getenv("SMTP_TLS", "true")).strip().lower() in {"1", "true", "yes"}
    if not host or not from_email:
        raise DeliveryError("SMTP host/from not configured")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_handle
    msg.set_content(body)
    with smtplib.SMTP(host, port, timeout=20) as server:
        if tls:
            server.starttls()
        if user and password:
            server.login(user, password)
        server.send_message(msg)
    return {
        "provider": "smtp",
        "ok": True,
        "to": _redact(to_handle),
        "from": _redact(from_email),
    }


def send_via_adapter(
    channel: str,
    to_handle: str,
    body: str,
    metadata: Dict[str, Any],
    event_type: str = "message",
    subject: str = "NeuroEdge Personal Twin",
) -> Dict[str, Any]:
    channel_norm = str(channel or "").strip().lower()
    event_type_norm = str(event_type or "message").strip().lower()
    disclosure = "This response is generated by NeuroEdge Personal Twin with user consent."
    final_body = f"{body}\n\n{disclosure}" if disclosure not in body else body

    if event_type_norm == "phone_call" or channel_norm == "phone_call":
        return {
            "provider": "telephony",
            "ok": False,
            "status": "manual_required",
            "reason": (
                "Direct on-device call answering requires native OS integration (Android/iOS app with explicit permission). "
                "Use approved telephony APIs or call-screening integration."
            ),
        }

    if channel_norm == "sms":
        return send_twilio_sms(to_handle, final_body, metadata)
    if channel_norm == "whatsapp":
        return send_whatsapp_business(to_handle, final_body, metadata)
    if channel_norm == "telegram":
        return send_telegram(to_handle, final_body, metadata)
    if channel_norm == "email":
        return send_smtp(to_handle, final_body, metadata, subject=subject)

    return {
        "provider": channel_norm or "unknown",
        "ok": False,
        "status": "unsupported_channel",
        "reason": "No adapter configured for this channel yet.",
    }


def encode_binary_blob(name: str, raw: bytes) -> Dict[str, Any]:
    return {
        "name": name,
        "size": len(raw),
        "data_base64": base64.b64encode(raw).decode("ascii"),
    }
