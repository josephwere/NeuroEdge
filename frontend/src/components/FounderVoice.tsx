import React, { useEffect, useState } from "react";
import { OrchestratorClient } from "@/services/orchestrator_client";

interface Props {
  orchestrator: OrchestratorClient;
}

const FounderVoice: React.FC<Props> = ({ orchestrator }) => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      console.warn("Browser does not support SpeechRecognition");
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }

      if (final) {
        setTranscript(final);
        handleCommand(final.trim());
      }
    };

    recognition.onerror = (e: any) => {
      console.error("SpeechRecognition error", e);
      stopListening();
    };

    if (listening) recognition.start();
    else recognition.stop();

    return () => recognition.stop();

    function stopListening() {
      setListening(false);
      recognition.stop();
    }
  }, [listening, orchestrator]);

  /* ---------------- Command Handler ---------------- */
  const handleCommand = (cmd: string) => {
    const normalized = cmd.toLowerCase();

    if (!normalized.startsWith("joseph/master")) return;

    const payload = normalized.replace("joseph/master", "").trim();

    // Simple parsing examples
    if (payload.startsWith("inspect")) {
      const target = payload.replace("inspect", "").trim();
      orchestrator.emitFounderMessage({
        type: "info",
        message: `Inspecting ${target}...`,
      });
      speak(`Inspecting ${target}`);
      // Trigger backend inspection event
      orchestrator.inspect(target);
    } else if (payload.startsWith("status")) {
      const target = payload.replace("status", "").trim();
      orchestrator.emitFounderMessage({
        type: "status",
        message: `Checking status of ${target}...`,
      });
      speak(`Checking status of ${target}`);
      orchestrator.queryNodeStatus(target);
    } else if (payload.startsWith("replay")) {
      const target = payload.replace("replay", "").trim();
      orchestrator.emitFounderMessage({
        type: "info",
        message: `Replaying session ${target}...`,
      });
      speak(`Replaying session ${target}`);
      orchestrator.replaySession(target);
    } else {
      orchestrator.emitFounderMessage({
        type: "warning",
        message: `Unknown command: ${payload}`,
      });
      speak(`Unknown command: ${payload}`);
    }
  };

  /* ---------------- TTS ---------------- */
  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    }
  };

  return (
    <div style={{ position: "fixed", bottom: 20, left: 20, zIndex: 9999 }}>
      <button
        onClick={() => setListening(l => !l)}
        style={{
          padding: "0.6rem 1rem",
          borderRadius: "50px",
          background: listening ? "#ef4444" : "#3b82f6",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
      >
        {listening ? "Listening..." : "Activate Founder Voice"}
      </button>
      {transcript && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#111" }}>
          "{transcript}"
        </div>
      )}
    </div>
  );
};

export default FounderVoice;
