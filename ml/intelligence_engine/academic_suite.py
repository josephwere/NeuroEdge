import os
import time
import zipfile
from typing import Dict


BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "intelligence_engine", "exports")
os.makedirs(BASE_DIR, exist_ok=True)


def _safe_name(prefix: str, ext: str) -> str:
    ts = int(time.time())
    return os.path.join(BASE_DIR, f"{prefix}_{ts}.{ext}")


def _write_pdf(path: str, title: str, content: str) -> None:
    # Minimal single-page PDF text stream for portability without third-party deps.
    text = (f"{title}\n\n{content}"[:3000]).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 11 Tf 50 770 Td ({text}) Tj ET"
    objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
        "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
        f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj",
    ]
    body = "%PDF-1.4\n"
    offsets = []
    for obj in objects:
        offsets.append(len(body.encode("utf-8")))
        body += obj + "\n"
    xref_pos = len(body.encode("utf-8"))
    body += f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n"
    for off in offsets:
        body += f"{off:010d} 00000 n \n"
    body += f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF"
    with open(path, "wb") as f:
        f.write(body.encode("utf-8"))


def _write_docx(path: str, title: str, content: str) -> None:
    # Minimal DOCX package (WordprocessingML)
    text = (f"{title}\n\n{content}"[:20000]).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    doc = f"""<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{text}</w:t></w:r></w:p>
  </w:body>
</w:document>"""
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", doc)


def export_academic(title: str, content: str, fmt: str = "pdf") -> Dict[str, str]:
    fmt = (fmt or "pdf").strip().lower()
    if fmt == "pdf":
        out = _safe_name("academic_report", "pdf")
        _write_pdf(out, title, content)
        return {"ok": "true", "format": "pdf", "path": out}
    if fmt in {"word", "docx"}:
        out = _safe_name("academic_report", "docx")
        _write_docx(out, title, content)
        return {"ok": "true", "format": "docx", "path": out}
    if fmt == "zip":
        pdf = export_academic(title, content, "pdf")["path"]
        docx = export_academic(title, content, "docx")["path"]
        txt = _safe_name("academic_report", "txt")
        with open(txt, "w", encoding="utf-8") as f:
            f.write(f"{title}\n\n{content}")
        out = _safe_name("academic_report_bundle", "zip")
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.write(pdf, os.path.basename(pdf))
            z.write(docx, os.path.basename(docx))
            z.write(txt, os.path.basename(txt))
        return {"ok": "true", "format": "zip", "path": out}
    return {"ok": "false", "error": f"Unsupported export format: {fmt}"}

