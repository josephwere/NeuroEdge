import os
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .moderation import moderate_text
from .render_worker import RenderWorker
from .storage import BASE_DIR, list_history
from .image_generator import generate_image, enhance_prompt
from .image_editor import edit_image, remove_object, upscale_image
from .video_generator import generate_video
from .video_editor import edit_video
from .thumbnail_engine import create_thumbnail
from .script_to_video import script_to_video
from .subtitle_generator import generate_subtitles
from .background_remover import remove_background
from .style_transfer import apply_style_transfer
from .creator_analytics import analyze_script, score_thumbnail, predict_engagement

router = APIRouter(prefix="/creator", tags=["creator"])
worker = RenderWorker()


class ImageRequest(BaseModel):
    prompt: str
    style: str = "cinematic"
    resolution: str = "1024x1024"
    aspect_ratio: str = "1:1"
    batch: int = 1


class ImageEditRequest(BaseModel):
    image_path: str
    instructions: str = ""
    mask: str = ""
    upscale: bool = False
    style_transfer: str = ""


class VideoRequest(BaseModel):
    prompt: str
    duration: int = 8
    resolution: str = "1080p"
    aspect_ratio: str = "16:9"


class ScriptVideoRequest(BaseModel):
    script: str
    voice_style: str = "neutral"
    aspect_ratio: str = "16:9"


class ThumbnailRequest(BaseModel):
    topic: str
    text: str = ""


class SubtitleRequest(BaseModel):
    transcript: str = ""


class BackgroundRemoveRequest(BaseModel):
    image_path: str


def _guard_text(text: str) -> None:
    moderation = moderate_text(text)
    if not moderation.get("allowed", False):
        raise HTTPException(status_code=400, detail={"error": "content_blocked", "hits": moderation.get("hits", [])})


@router.post("/image")
def creator_image(req: ImageRequest) -> Dict[str, Any]:
    _guard_text(req.prompt)

    def run(payload: Dict[str, Any]) -> Dict[str, Any]:
        prompt = enhance_prompt(str(payload.get("prompt", "")))
        return generate_image(
            prompt=prompt,
            style=str(payload.get("style", "cinematic")),
            resolution=str(payload.get("resolution", "1024x1024")),
            aspect_ratio=str(payload.get("aspect_ratio", "1:1")),
            batch=int(payload.get("batch", 1)),
        )

    job = worker.enqueue("image_generate", req.model_dump(), run)
    return {"ok": True, "job_id": job["id"], "status": job["status"]}


@router.post("/image/edit")
def creator_image_edit(req: ImageEditRequest) -> Dict[str, Any]:
    _guard_text(req.instructions)

    def run(payload: Dict[str, Any]) -> Dict[str, Any]:
        source = str(payload.get("image_path", ""))
        if not source:
            raise ValueError("Missing image_path")
        if payload.get("mask"):
            return remove_object(source, str(payload.get("mask")))
        if payload.get("upscale"):
            return upscale_image(source, 2)
        if payload.get("style_transfer"):
            return apply_style_transfer(source, str(payload.get("style_transfer")))
        return edit_image(source, str(payload.get("instructions", "Refine image")))

    job = worker.enqueue("image_edit", req.model_dump(), run)
    return {"ok": True, "job_id": job["id"], "status": job["status"]}


@router.post("/video")
def creator_video(req: VideoRequest) -> Dict[str, Any]:
    _guard_text(req.prompt)
    job = worker.enqueue(
        "video_generate",
        req.model_dump(),
        lambda p: generate_video(str(p.get("prompt", "")), int(p.get("duration", 8)), str(p.get("resolution", "1080p")), str(p.get("aspect_ratio", "16:9"))),
    )
    return {"ok": True, "job_id": job["id"], "status": job["status"]}


@router.post("/script-video")
def creator_script_video(req: ScriptVideoRequest) -> Dict[str, Any]:
    _guard_text(req.script)
    job = worker.enqueue(
        "script_to_video",
        req.model_dump(),
        lambda p: script_to_video(str(p.get("script", "")), str(p.get("voice_style", "neutral")), str(p.get("aspect_ratio", "16:9"))),
    )
    return {"ok": True, "job_id": job["id"], "status": job["status"]}


@router.post("/thumbnail")
def creator_thumbnail(req: ThumbnailRequest) -> Dict[str, Any]:
    _guard_text(req.topic + " " + req.text)
    job = worker.enqueue("thumbnail_generate", req.model_dump(), lambda p: create_thumbnail(str(p.get("topic", "")), str(p.get("text", ""))))
    return {"ok": True, "job_id": job["id"], "status": job["status"]}


@router.post("/subtitles")
def creator_subtitles(req: SubtitleRequest) -> Dict[str, Any]:
    _guard_text(req.transcript)
    job = worker.enqueue("subtitle_generate", req.model_dump(), lambda p: generate_subtitles(str(p.get("transcript", ""))))
    return {"ok": True, "job_id": job["id"], "status": job["status"]}


@router.post("/background-remove")
def creator_background_remove(req: BackgroundRemoveRequest) -> Dict[str, Any]:
    job = worker.enqueue("background_remove", req.model_dump(), lambda p: remove_background(str(p.get("image_path", ""))))
    return {"ok": True, "job_id": job["id"], "status": job["status"]}


@router.post("/video/edit")
def creator_video_edit(payload: Dict[str, Any]) -> Dict[str, Any]:
    source = str((payload or {}).get("video_path", ""))
    instructions = str((payload or {}).get("instructions", ""))
    job = worker.enqueue("video_edit", payload or {}, lambda p: edit_video(source or str(p.get("video_path", "")), instructions or str(p.get("instructions", ""))))
    return {"ok": True, "job_id": job["id"], "status": job["status"]}


@router.post("/analytics/script")
def creator_script_analytics(payload: Dict[str, Any]) -> Dict[str, Any]:
    script = str((payload or {}).get("script", ""))
    _guard_text(script)
    return {"ok": True, "analysis": analyze_script(script)}


@router.post("/analytics/thumbnail")
def creator_thumb_analytics(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, "analysis": score_thumbnail(str((payload or {}).get("image_path", "")))}


@router.post("/analytics/engagement")
def creator_engagement_analytics(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, "analysis": predict_engagement(payload or {})}


@router.get("/job-status/{job_id}")
def creator_job_status(job_id: str) -> Dict[str, Any]:
    item = worker.status(job_id)
    if not item:
        raise HTTPException(status_code=404, detail="job not found")
    return {"ok": True, "job": item}


@router.get("/history")
def creator_history(limit: int = Query(default=100, ge=1, le=1000)) -> Dict[str, Any]:
    return {"ok": True, "history": list_history(limit)}


@router.get("/download")
def creator_download(path: str) -> FileResponse:
    target = os.path.abspath(path)
    base = os.path.abspath(BASE_DIR)
    if not target.startswith(base):
        raise HTTPException(status_code=403, detail="Invalid download path")
    if not os.path.exists(target):
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(target, filename=os.path.basename(target))

