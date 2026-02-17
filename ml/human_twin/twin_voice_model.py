from typing import Dict


def configure_voice(consent: bool, profile: str = "founder_default") -> Dict[str, object]:
    if not consent:
        return {
            "enabled": False,
            "message": "Voice mode disabled: explicit consent required.",
        }
    return {
        "enabled": True,
        "voice_profile": profile,
        "message": "Voice profile configured with disclosure policy enabled.",
    }
