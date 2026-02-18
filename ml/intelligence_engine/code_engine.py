from typing import Any, Dict, List


def generate_code(prompt: str, language: str = "python") -> Dict[str, Any]:
    lang = (language or "python").lower()
    p = (prompt or "").strip()
    templates = {
        "python": "def solution(input_data):\n    \"\"\"Auto-generated starter.\"\"\"\n    return input_data\n",
        "javascript": "function solution(inputData) {\n  return inputData;\n}\n",
        "go": "package main\n\nfunc solution(input string) string {\n\treturn input\n}\n",
        "java": "class Solution {\n  public static String solution(String input) {\n    return input;\n  }\n}\n",
        "c++": "#include <string>\nstd::string solution(const std::string& input){ return input; }\n",
    }
    key = "javascript" if lang in ("js", "node", "typescript", "ts") else lang
    code = templates.get(key, templates["python"])
    return {"ok": True, "language": language, "prompt": p, "code": code, "note": "Static generation only. No OS execution."}


def debug_code(code: str) -> Dict[str, Any]:
    c = code or ""
    issues: List[str] = []
    if "TODO" in c:
        issues.append("Contains TODO markers.")
    if "print(" in c and "return" not in c:
        issues.append("Function may print without returning output.")
    if "\t" in c and "  " in c:
        issues.append("Mixed indentation style detected.")
    return {"ok": True, "issues": issues, "safe_execution": False}


def refactor_code(code: str) -> Dict[str, Any]:
    src = code or ""
    changes: List[str] = []
    # Normalize line endings and trim trailing spaces.
    normalized_lines = [line.rstrip() for line in src.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    if normalized_lines != src.splitlines():
        changes.append("Normalized line endings and removed trailing whitespace.")
    # Replace tabs with 2 spaces for consistent indentation in generated snippets.
    detabbed_lines = [line.replace("\t", "  ") for line in normalized_lines]
    if detabbed_lines != normalized_lines:
        changes.append("Replaced tab indentation with spaces.")
    # Collapse repeated blank lines to at most one consecutive blank line.
    compact: List[str] = []
    blank_count = 0
    for line in detabbed_lines:
        if line.strip() == "":
            blank_count += 1
            if blank_count > 1:
                continue
        else:
            blank_count = 0
        compact.append(line)
    if compact != detabbed_lines:
        changes.append("Collapsed excessive blank lines.")
    out = "\n".join(compact).strip("\n")
    return {"ok": True, "refactored_code": out, "changes": changes or ["No structural issues detected."]}


def explain_code(code: str) -> Dict[str, Any]:
    lines = len((code or "").splitlines())
    return {
        "ok": True,
        "summary": "Code explanation generated from static analysis.",
        "line_count": lines,
        "sections": ["Purpose", "Flow", "Edge cases", "Complexity"],
    }


def generate_unit_tests(code: str, language: str = "python") -> Dict[str, Any]:
    lang = (language or "").lower()
    if lang in ("python", "py"):
        tests = "def test_solution_smoke():\n    assert solution('x') == 'x'\n"
    elif lang in ("javascript", "js", "ts", "typescript"):
        tests = "test('solution smoke', () => { expect(solution('x')).toBe('x'); });\n"
    else:
        tests = "// Add test framework assertions for solution(input)\n"
    return {"ok": True, "tests": tests}
