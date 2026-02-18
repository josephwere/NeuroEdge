import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional


DATA_DIR = os.getenv(
    "NEUROEDGE_TWIN_DATA_DIR",
    os.path.join(os.path.dirname(__file__), "..", "data", "twin_profile"),
)
CHANNELS_FILE = os.path.join(DATA_DIR, "channel_accounts.json")
POLICY_FILE = os.path.join(DATA_DIR, "channel_policy.json")
AVAILABILITY_FILE = os.path.join(DATA_DIR, "availability.json")
LOGS_FILE = os.path.join(DATA_DIR, "channel_logs.jsonl")
CALL_ASSIST_FILE = os.path.join(DATA_DIR, "call_assistant.json")
CLONE_CUSTOMIZATION_FILE = os.path.join(DATA_DIR, "clone_customization.json")

ALLOWED_CHANNELS = {
    "phone_call",
    "sms",
    "whatsapp",
    "telegram",
    "email",
    "x",
    "facebook",
    "instagram",
    "linkedin",
}


def _ensure_dir() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def _safe_load(path: str, default: Dict[str, Any]) -> Dict[str, Any]:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _safe_save(path: str, payload: Dict[str, Any]) -> None:
    _ensure_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _append_log(event: Dict[str, Any]) -> None:
    _ensure_dir()
    with open(LOGS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def get_channels() -> List[Dict[str, Any]]:
    data = _safe_load(CHANNELS_FILE, {"channels": []})
    channels = data.get("channels", [])
    return channels if isinstance(channels, list) else []


def save_channels(channels: List[Dict[str, Any]]) -> None:
    _safe_save(CHANNELS_FILE, {"channels": channels, "updated_at": int(time.time())})


def get_channel(channel_id: str) -> Optional[Dict[str, Any]]:
    target = str(channel_id or "").strip()
    if not target:
        return None
    for c in get_channels():
        if str(c.get("id")) == target:
            return c
    return None


def get_policy() -> Dict[str, Any]:
    return _safe_load(
        POLICY_FILE,
        {
            "disclosure_required": True,
            "require_human_approval_for_send": True,
            "allow_auto_reply_only_when_away_or_ill": True,
            "max_auto_replies_per_hour": 20,
            "allow_channels": sorted(list(ALLOWED_CHANNELS)),
            "blocked_actions": [
                "financial_commitment",
                "legal_commitment",
                "identity_impersonation_without_disclosure",
            ],
        },
    )


def save_policy(policy_patch: Dict[str, Any]) -> Dict[str, Any]:
    current = get_policy()
    merged = {**current, **(policy_patch or {})}
    if "allow_channels" in merged and isinstance(merged["allow_channels"], list):
        merged["allow_channels"] = [c for c in merged["allow_channels"] if c in ALLOWED_CHANNELS]
    _safe_save(POLICY_FILE, merged)
    return merged


def get_availability() -> Dict[str, Any]:
    return _safe_load(
        AVAILABILITY_FILE,
        {
            "mode": "active",  # active | away | ill | do_not_disturb
            "away_until_ts": 0,
            "notes": "",
            "updated_at": int(time.time()),
        },
    )


def set_availability(mode: str, away_until_ts: int = 0, notes: str = "") -> Dict[str, Any]:
    value = {
        "mode": mode,
        "away_until_ts": int(away_until_ts or 0),
        "notes": notes[:500],
        "updated_at": int(time.time()),
    }
    _safe_save(AVAILABILITY_FILE, value)
    return value


def upsert_channel(channel: Dict[str, Any], actor: str = "system") -> Dict[str, Any]:
    channels = get_channels()
    channel_type = str(channel.get("channel") or "").strip().lower()
    if channel_type not in ALLOWED_CHANNELS:
        raise ValueError(f"Unsupported channel: {channel_type}")

    item = {
        "id": str(channel.get("id") or f"ch-{uuid.uuid4().hex[:10]}"),
        "channel": channel_type,
        "provider": str(channel.get("provider") or "official_api").strip(),
        "handle": str(channel.get("handle") or "").strip(),
        "display_name": str(channel.get("display_name") or "").strip(),
        "consent_granted": bool(channel.get("consent_granted", False)),
        "verified": bool(channel.get("verified", False)),
        "auto_reply_enabled": bool(channel.get("auto_reply_enabled", False)),
        "metadata": channel.get("metadata") if isinstance(channel.get("metadata"), dict) else {},
        "updated_at": int(time.time()),
    }
    if not item["handle"]:
        raise ValueError("Missing handle")

    replaced = False
    next_channels: List[Dict[str, Any]] = []
    for c in channels:
        if str(c.get("id")) == item["id"]:
            next_channels.append({**c, **item})
            replaced = True
        else:
            next_channels.append(c)
    if not replaced:
        next_channels.append(item)
    save_channels(next_channels)
    _append_log(
        {
            "ts": int(time.time()),
            "type": "channel_upsert",
            "actor": actor,
            "channel_id": item["id"],
            "channel": item["channel"],
            "handle": item["handle"],
        }
    )
    return item


def remove_channel(channel_id: str, actor: str = "system") -> Dict[str, Any]:
    channels = get_channels()
    before = len(channels)
    next_channels = [c for c in channels if str(c.get("id")) != str(channel_id)]
    save_channels(next_channels)
    removed = before - len(next_channels)
    _append_log(
        {
            "ts": int(time.time()),
            "type": "channel_remove",
            "actor": actor,
            "channel_id": channel_id,
            "removed": removed,
        }
    )
    return {"removed": removed}


def build_auto_reply_draft(
    event: Dict[str, Any],
    profile: Dict[str, Any],
    policy: Dict[str, Any],
    availability: Dict[str, Any],
) -> Dict[str, Any]:
    event_type = str(event.get("event_type") or "message").strip().lower()
    channel = str(event.get("channel") or "sms").strip().lower()
    incoming_text = str(event.get("incoming_text") or "").strip()
    sender = str(event.get("sender") or "unknown").strip()
    requester = str(event.get("requester_role") or "user").strip().lower()

    if channel not in ALLOWED_CHANNELS:
        raise ValueError(f"Unsupported channel: {channel}")

    mode = str(availability.get("mode") or "active")
    away_or_ill = mode in {"away", "ill"}
    can_auto_send = bool(policy.get("allow_auto_reply_only_when_away_or_ill", True) and away_or_ill)
    disclosure = "This response is generated by NeuroEdge Personal Twin with user consent."
    tone = str(profile.get("tone") or "direct")
    owner = str(profile.get("owner") or "User")

    if event_type == "phone_call":
        body = (
            f"Hello, {owner} is currently {mode.replace('_', ' ')}. "
            f"I am the NeuroEdge AI assistant and can take a message now."
        )
    else:
        body = (
            f"Hi {sender}, {owner} is currently {mode.replace('_', ' ')}. "
            f"I can relay your message and provide a follow-up. "
            f"Tone preference: {tone}."
        )
        if incoming_text:
            body += f" Noted message: \"{incoming_text[:200]}\"."

    return {
        "draft_id": f"draft-{uuid.uuid4().hex[:12]}",
        "event_type": event_type,
        "channel": channel,
        "sender": sender,
        "incoming_text": incoming_text[:2000],
        "generated_reply": f"{body}\n\n{disclosure}",
        "auto_send_eligible": can_auto_send,
        "requires_human_approval": bool(policy.get("require_human_approval_for_send", True)),
        "requester_role": requester,
        "status": "draft",
        "created_at": int(time.time()),
    }


def approve_draft(draft: Dict[str, Any], approver: str, action: str = "approve_send") -> Dict[str, Any]:
    status = "approved_send" if action == "approve_send" else "rejected"
    event = {
        "ts": int(time.time()),
        "type": "auto_reply_approval",
        "approver": approver,
        "action": action,
        "draft": draft,
        "status": status,
    }
    _append_log(event)
    return {"status": status, "approval": event}


def list_logs(limit: int = 100) -> List[Dict[str, Any]]:
    if not os.path.exists(LOGS_FILE):
        return []
    lines: List[str] = []
    with open(LOGS_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()
    out: List[Dict[str, Any]] = []
    for ln in reversed(lines[-max(1, min(limit, 500)) :]):
        try:
            out.append(json.loads(ln.strip()))
        except Exception:
            continue
    return out


def get_call_assistant_config() -> Dict[str, Any]:
    return _safe_load(
        CALL_ASSIST_FILE,
        {
            "enabled": False,
            "requested_permissions": {
                "microphone": False,
                "contacts": False,
                "call_screening": False,
                "notifications": False,
            },
            "allow_phone_call_assist": False,
            "allow_whatsapp_call_assist": False,
            "allow_video_call_assist": False,
            "disclosure_audio_required": True,
            "human_override_required": True,
            "updated_at": int(time.time()),
            "status": "disabled",
            "platform_note": (
                "Device call answering requires official native integration and user permission on each OS."
            ),
        },
    )


def save_call_assistant_config(patch: Dict[str, Any], actor: str = "system") -> Dict[str, Any]:
    current = get_call_assistant_config()
    next_value = {**current, **(patch or {})}
    perms = current.get("requested_permissions", {})
    if isinstance(patch.get("requested_permissions"), dict):
        perms = {**perms, **patch["requested_permissions"]}
    next_value["requested_permissions"] = perms
    next_value["updated_at"] = int(time.time())
    next_value["status"] = "ready" if bool(next_value.get("enabled")) else "disabled"
    _safe_save(CALL_ASSIST_FILE, next_value)
    _append_log(
        {
            "ts": int(time.time()),
            "type": "call_assistant_config",
            "actor": actor,
            "enabled": bool(next_value.get("enabled")),
        }
    )
    return next_value


def get_clone_customization() -> Dict[str, Any]:
    return _safe_load(
        CLONE_CUSTOMIZATION_FILE,
        {
            "voice_assets": [],
            "video_assets": [],
            "persona_presets": [],
            "active_voice_asset_id": "",
            "active_video_asset_id": "",
            "active_persona_preset_id": "",
            "updated_at": int(time.time()),
        },
    )


def save_clone_customization(patch: Dict[str, Any], actor: str = "system") -> Dict[str, Any]:
    current = get_clone_customization()
    merged = {**current, **(patch or {})}
    merged["voice_assets"] = merged.get("voice_assets", []) if isinstance(merged.get("voice_assets"), list) else []
    merged["video_assets"] = merged.get("video_assets", []) if isinstance(merged.get("video_assets"), list) else []
    merged["persona_presets"] = (
        merged.get("persona_presets", []) if isinstance(merged.get("persona_presets"), list) else []
    )
    merged["updated_at"] = int(time.time())
    _safe_save(CLONE_CUSTOMIZATION_FILE, merged)
    _append_log(
        {
            "ts": int(time.time()),
            "type": "clone_customization",
            "actor": actor,
            "voice_assets": len(merged.get("voice_assets", [])),
            "video_assets": len(merged.get("video_assets", [])),
            "persona_presets": len(merged.get("persona_presets", [])),
        }
    )
    return merged


def market_map() -> Dict[str, Any]:
    return {
        "current_competitor_capabilities": [
            "memory + profile personalization",
            "deep research + connectors",
            "workspace admin controls",
            "custom assistant presets",
        ],
        "gaps_in_market": [
            "local-first mesh assistant ownership",
            "transparent verification UX for high-stakes responses",
            "portable user-owned assistant policy packs",
        ],
        "what_users_want": [
            "higher factual precision",
            "predictable behavior and safety defaults",
            "privacy + explicit consent controls",
            "human-approval gates for risky actions",
        ],
        "future_features": [
            "official telephony APIs with consent and disclosure playback",
            "cross-channel assistant handoff with verified context",
            "per-channel trust score and escalation policy",
            "portable assistant marketplace packs",
        ],
    }
