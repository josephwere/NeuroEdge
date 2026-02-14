// frontend/src/components/InlineErrorHighlight.tsx
import React from "react";

export interface CodeError {
  start: number; // index in code
  end: number;
  message: string;
}

interface InlineErrorProps {
  code: string;
  errors?: CodeError[];
}

const InlineErrorHighlight: React.FC<InlineErrorProps> = ({ code, errors = [] }) => {
  if (errors.length === 0) return <pre>{code}</pre>;

  const segments: { text: string; error?: string }[] = [];
  let lastIndex = 0;

  errors.forEach(err => {
    if (err.start > lastIndex) {
      segments.push({ text: code.slice(lastIndex, err.start) });
    }
    segments.push({ text: code.slice(err.start, err.end), error: err.message });
    lastIndex = err.end;
  });

  if (lastIndex < code.length) {
    segments.push({ text: code.slice(lastIndex) });
  }

  return (
    <pre
      style={{
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        lineHeight: 1.4,
        margin: 0,
      }}
    >
      {segments.map((seg, idx) =>
        seg.error ? (
          <span
            key={idx}
            style={{
              textDecoration: "underline wavy red",
              cursor: "help",
            }}
            title={seg.error}
          >
            {seg.text}
          </span>
        ) : (
          <span key={idx}>{seg.text}</span>
        )
      )}
    </pre>
  );
};

export default InlineErrorHighlight;
