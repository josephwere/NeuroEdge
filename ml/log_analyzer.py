class LogAnalyzer:
    def __init__(self):
        self.error_tokens = ("error", "exception", "panic", "fatal")
        self.warn_tokens = ("warn", "warning", "deprecated")
        self.test_fail_tokens = ("fail", "failed", "assertion")

    def parse_logs(self, logs: str) -> str:
        text = (logs or "").lower()
        if not text.strip():
            return "No logs provided."

        errors = sum(text.count(tok) for tok in self.error_tokens)
        warnings = sum(text.count(tok) for tok in self.warn_tokens)
        test_failures = sum(text.count(tok) for tok in self.test_fail_tokens)

        if errors > 0:
            return f"Detected {errors} error signals. Prioritize stack traces, failing endpoints, and recent config changes."
        if test_failures > 0:
            return f"Detected {test_failures} test failure signals. Re-run failing suites with verbose output and inspect assertions."
        if warnings > 0:
            return f"Detected {warnings} warning signals. Review deprecated APIs and non-blocking runtime warnings."
        return "No critical issues detected."
