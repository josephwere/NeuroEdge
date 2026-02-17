import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sklearn.feature_extraction.text import TfidfVectorizer


router = APIRouter(prefix="/rag", tags=["rag"])

BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "rag")
DOCS_FILE = os.path.join(BASE_DIR, "documents.jsonl")
INDEX_FILE = os.path.join(BASE_DIR, "index.json")
FEEDBACK_FILE = os.path.join(BASE_DIR, "feedback.jsonl")

_lock = threading.Lock()


def _ensure_dirs() -> None:
    os.makedirs(BASE_DIR, exist_ok=True)
    if not os.path.exists(DOCS_FILE):
        with open(DOCS_FILE, "w", encoding="utf-8"):
            pass
    if not os.path.exists(FEEDBACK_FILE):
        with open(FEEDBACK_FILE, "w", encoding="utf-8"):
            pass


def _safe_now() -> int:
    return int(time.time() * 1000)


def _sanitize_text(text: str) -> str:
    t = text or ""
    t = re.sub(r"<script[^>]*>.*?</script>", " ", t, flags=re.I | re.S)
    t = re.sub(r"<style[^>]*>.*?</style>", " ", t, flags=re.I | re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _chunk_text(text: str, max_chars: int = 1200, overlap: int = 160) -> List[str]:
    cleaned = _sanitize_text(text)
    if not cleaned:
        return []
    chunks: List[str] = []
    i = 0
    n = len(cleaned)
    while i < n:
        end = min(n, i + max_chars)
        chunk = cleaned[i:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= n:
            break
        i = max(0, end - overlap)
    return chunks


def _iter_jsonl(path: str):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except Exception:
                continue


def _append_jsonl(path: str, obj: Dict[str, Any]) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def _load_docs() -> List[Dict[str, Any]]:
    return list(_iter_jsonl(DOCS_FILE))


def _domain_allowed(url: str) -> bool:
    allowed = [d.strip().lower() for d in str(os.getenv("RAG_ALLOWED_DOMAINS", "")).split(",") if d.strip()]
    if not allowed:
        return True
    host = urllib.parse.urlparse(url).hostname or ""
    host = host.lower().strip()
    return any(host == d or host.endswith(f".{d}") for d in allowed)


def _fetch_url_text(url: str, timeout_sec: int = 10) -> str:
    if not _domain_allowed(url):
        raise ValueError("Domain not allowlisted")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "NeuroEdge-RAG/1.0 (+https://neuroedge.local)",
            "Accept": "text/html,text/plain;q=0.9,*/*;q=0.5",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read(2_500_000)
        ctype = (resp.headers.get("content-type") or "").lower()
        if "text" not in ctype and "json" not in ctype and "xml" not in ctype and "html" not in ctype:
            raise ValueError(f"Unsupported content-type: {ctype or 'unknown'}")
        text = raw.decode("utf-8", errors="ignore")
        return _sanitize_text(text)


def _build_index(docs: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not docs:
        return {"ok": True, "total_docs": 0, "index_version": _safe_now()}

    corpus = [str(d.get("text") or "") for d in docs]
    vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=(1, 2),
        max_features=int(os.getenv("RAG_MAX_FEATURES", "80000")),
        min_df=1,
    )
    matrix = vectorizer.fit_transform(corpus)

    packed = {
        "index_version": _safe_now(),
        "doc_ids": [str(d.get("id")) for d in docs],
        "vectorizer_vocabulary": vectorizer.vocabulary_,
        "vectorizer_idf": vectorizer.idf_.tolist() if hasattr(vectorizer, "idf_") else [],
        "matrix_data": matrix.data.tolist(),
        "matrix_indices": matrix.indices.tolist(),
        "matrix_indptr": matrix.indptr.tolist(),
        "matrix_shape": list(matrix.shape),
        "total_docs": len(docs),
    }
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(packed, f)
    return {"ok": True, "total_docs": len(docs), "index_version": packed["index_version"]}


@dataclass
class _LoadedIndex:
    docs_by_id: Dict[str, Dict[str, Any]]
    doc_ids: List[str]
    vectorizer: TfidfVectorizer
    matrix: Any
    version: int


def _load_index() -> Optional[_LoadedIndex]:
    if not os.path.exists(INDEX_FILE):
        return None
    docs = _load_docs()
    docs_by_id = {str(d.get("id")): d for d in docs if d.get("id")}
    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    try:
        from scipy.sparse import csr_matrix  # type: ignore
    except Exception:
        return None

    matrix = csr_matrix(
        (
            np.array(raw.get("matrix_data") or [], dtype=np.float64),
            np.array(raw.get("matrix_indices") or [], dtype=np.int64),
            np.array(raw.get("matrix_indptr") or [], dtype=np.int64),
        ),
        shape=tuple(raw.get("matrix_shape") or [0, 0]),
    )
    vectorizer = TfidfVectorizer(lowercase=True, stop_words="english", ngram_range=(1, 2))
    vectorizer.vocabulary_ = {str(k): int(v) for k, v in (raw.get("vectorizer_vocabulary") or {}).items()}
    vectorizer.fixed_vocabulary_ = True
    idf = np.array(raw.get("vectorizer_idf") or [], dtype=np.float64)
    if idf.size > 0:
        vectorizer.idf_ = idf
        # noinspection PyProtectedMember
        vectorizer._tfidf.idf_ = idf  # type: ignore[attr-defined]
    return _LoadedIndex(
        docs_by_id=docs_by_id,
        doc_ids=[str(x) for x in (raw.get("doc_ids") or [])],
        vectorizer=vectorizer,
        matrix=matrix,
        version=int(raw.get("index_version") or 0),
    )


class IngestDoc(BaseModel):
    title: str = ""
    text: str = ""
    url: str = ""
    domain: str = "general"
    tags: List[str] = Field(default_factory=list)
    source: str = "manual"


class IngestRequest(BaseModel):
    docs: List[IngestDoc] = Field(default_factory=list)
    urls: List[str] = Field(default_factory=list)
    domain: str = "general"
    tags: List[str] = Field(default_factory=list)
    source: str = "manual"
    chunk_chars: int = 1200
    overlap_chars: int = 160
    rebuild_index: bool = True


class SearchRequest(BaseModel):
    query: str
    domain: str = ""
    top_k: int = 6
    min_score: float = 0.08


class AnswerRequest(BaseModel):
    question: str
    domain: str = ""
    top_k: int = 6
    mode: str = "balanced"
    require_citations: bool = True


class FeedbackRequest(BaseModel):
    query: str
    answer: str
    rating: str = "neutral"
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    domain: str = "general"
    tags: List[str] = Field(default_factory=list)


def _domain_of(doc: Dict[str, Any]) -> str:
    return str(doc.get("domain") or "general").strip().lower()


def _dedupe_key(title: str, text: str, url: str) -> str:
    return f"{title.strip().lower()}::{url.strip().lower()}::{text[:220].strip().lower()}"


@router.post("/ingest")
def rag_ingest(req: IngestRequest) -> Dict[str, Any]:
    if not req.docs and not req.urls:
        raise HTTPException(status_code=400, detail="Missing docs or urls")
    _ensure_dirs()
    created = 0
    skipped = 0
    fetched = 0
    errors: List[Dict[str, Any]] = []
    domain = (req.domain or "general").strip().lower()
    tags = [str(t).strip().lower() for t in req.tags if str(t).strip()]

    with _lock:
        existing = _load_docs()
        seen = set(_dedupe_key(str(d.get("title") or ""), str(d.get("text") or ""), str(d.get("url") or "")) for d in existing)

        ingest_docs: List[IngestDoc] = list(req.docs)
        for u in req.urls:
            raw = str(u or "").strip()
            if not raw:
                continue
            try:
                text = _fetch_url_text(raw)
                fetched += 1
                ingest_docs.append(
                    IngestDoc(
                        title=raw,
                        text=text,
                        url=raw,
                        domain=domain,
                        tags=tags,
                        source="url_crawl",
                    )
                )
            except Exception as ex:
                errors.append({"url": raw, "error": str(ex)})

        for d in ingest_docs:
            d_domain = (d.domain or domain or "general").strip().lower()
            d_tags = list(set(tags + [str(t).strip().lower() for t in d.tags if str(t).strip()]))
            text = _sanitize_text(d.text)
            if not text:
                skipped += 1
                continue
            chunks = _chunk_text(text, max_chars=max(300, req.chunk_chars), overlap=max(40, req.overlap_chars))
            if not chunks:
                skipped += 1
                continue
            for idx, chunk in enumerate(chunks):
                key = _dedupe_key(d.title, chunk, d.url)
                if key in seen:
                    skipped += 1
                    continue
                seen.add(key)
                doc = {
                    "id": f"doc-{_safe_now()}-{created}-{idx}",
                    "title": d.title or d.url or f"doc_{created}",
                    "text": chunk,
                    "url": d.url,
                    "domain": d_domain,
                    "tags": d_tags,
                    "source": d.source or req.source,
                    "chunk_index": idx,
                    "created_at": _safe_now(),
                }
                _append_jsonl(DOCS_FILE, doc)
                created += 1

        index_info = _build_index(_load_docs()) if req.rebuild_index else {"ok": True, "skipped": True}

    return {
        "ok": True,
        "created_chunks": created,
        "skipped": skipped,
        "urls_fetched": fetched,
        "errors": errors,
        "index": index_info,
    }


@router.post("/reindex")
def rag_reindex() -> Dict[str, Any]:
    _ensure_dirs()
    with _lock:
        docs = _load_docs()
        return _build_index(docs)


@router.post("/search")
def rag_search(req: SearchRequest) -> Dict[str, Any]:
    _ensure_dirs()
    with _lock:
        loaded = _load_index()
        if loaded is None:
            built = _build_index(_load_docs())
            loaded = _load_index()
            if loaded is None:
                return {"ok": True, "query": req.query, "results": [], "index": built}

    q = _sanitize_text(req.query)
    if not q:
        raise HTTPException(status_code=400, detail="Missing query")
    query_vec = loaded.vectorizer.transform([q])
    sims = loaded.matrix.dot(query_vec.T).toarray().reshape(-1)
    top_k = max(1, min(30, int(req.top_k)))
    order = np.argsort(-sims)
    results: List[Dict[str, Any]] = []
    domain_filter = (req.domain or "").strip().lower()
    for idx in order:
        score = float(sims[idx])
        if score < float(req.min_score):
            continue
        doc_id = loaded.doc_ids[idx] if idx < len(loaded.doc_ids) else ""
        doc = loaded.docs_by_id.get(doc_id) or {}
        if domain_filter and _domain_of(doc) != domain_filter:
            continue
        results.append(
            {
                "score": round(score, 6),
                "id": doc.get("id"),
                "title": doc.get("title"),
                "url": doc.get("url"),
                "domain": doc.get("domain"),
                "tags": doc.get("tags") or [],
                "text": str(doc.get("text") or "")[:1500],
                "source": doc.get("source"),
            }
        )
        if len(results) >= top_k:
            break

    return {"ok": True, "query": req.query, "count": len(results), "results": results, "index_version": loaded.version}


def _summarize_from_hits(question: str, hits: List[Dict[str, Any]], mode: str) -> str:
    if not hits:
        return "I could not find matching indexed evidence yet. Ingest trusted sources first."
    if mode == "concise":
        lines = [f"Answer focus: {question}", "", "Key evidence:"]
        for h in hits[:3]:
            snippet = str(h.get("text") or "").strip()
            lines.append(f"- {snippet[:220]}...")
        return "\n".join(lines)
    lines = [f"Question: {question}", "", "Synthesized answer from indexed sources:"]
    for i, h in enumerate(hits[:5], start=1):
        snippet = str(h.get("text") or "").strip()
        lines.append(f"{i}. {snippet[:360]}...")
    return "\n".join(lines)


@router.post("/answer")
def rag_answer(req: AnswerRequest) -> Dict[str, Any]:
    search_res = rag_search(
        SearchRequest(
            query=req.question,
            domain=req.domain,
            top_k=req.top_k,
            min_score=0.06,
        )
    )
    hits = list(search_res.get("results") or [])
    citations = [
        {
            "title": h.get("title") or h.get("id"),
            "url": h.get("url") or "",
            "domain": h.get("domain") or "general",
            "score": h.get("score"),
        }
        for h in hits
    ]
    top_score = float(hits[0]["score"]) if hits else 0.0
    confidence = round(min(0.95, max(0.2, top_score + (0.1 if len(hits) >= 3 else 0.0))), 3)
    answer = _summarize_from_hits(req.question, hits, req.mode)
    return {
        "ok": True,
        "question": req.question,
        "domain": req.domain or "general",
        "answer": answer,
        "confidence": confidence,
        "citations": citations if req.require_citations else [],
        "evidence_count": len(hits),
    }


@router.post("/feedback")
def rag_feedback(req: FeedbackRequest) -> Dict[str, Any]:
    _ensure_dirs()
    rating = str(req.rating or "neutral").strip().lower()
    if rating not in {"up", "down", "neutral"}:
        rating = "neutral"
    payload = {
        "ts": _safe_now(),
        "query": req.query,
        "answer": req.answer,
        "rating": rating,
        "citations": req.citations,
        "domain": req.domain or "general",
        "tags": req.tags or [],
    }
    with _lock:
        _append_jsonl(FEEDBACK_FILE, payload)
    # Up-voted responses become additional distilled retrieval memory.
    if rating == "up" and req.query.strip() and req.answer.strip():
        distill = IngestRequest(
            docs=[
                IngestDoc(
                    title=f"feedback:{req.query[:80]}",
                    text=f"Q: {req.query}\nA: {req.answer}",
                    domain=req.domain or "general",
                    tags=list(set((req.tags or []) + ["feedback", "approved"])),
                    source="feedback",
                )
            ],
            domain=req.domain or "general",
            rebuild_index=True,
        )
        rag_ingest(distill)
    return {"ok": True, "feedback": payload}


@router.get("/stats")
def rag_stats() -> Dict[str, Any]:
    _ensure_dirs()
    docs = _load_docs()
    domains: Dict[str, int] = {}
    for d in docs:
        k = _domain_of(d)
        domains[k] = domains.get(k, 0) + 1
    feedback_count = sum(1 for _ in _iter_jsonl(FEEDBACK_FILE))
    return {
        "ok": True,
        "total_documents": len(docs),
        "domains": domains,
        "feedback_count": feedback_count,
        "index_exists": os.path.exists(INDEX_FILE),
    }
