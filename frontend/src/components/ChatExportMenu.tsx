// frontend/src/components/ChatExportMenu.tsx
import React, { useRef } from "react";
import { ChatMessage } from "@/services/chatHistoryStore";
import { exportChatJSON, exportChatTXT, importChatJSON } from "@/services/chatExport";

interface Props {
  chatHistory: ChatMessage[];
  onImport?: (messages: ChatMessage[]) => void;
}

const ChatExportMenu: React.FC<Props> = ({ chatHistory, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const url = exportChatJSON(chatHistory);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neuroedge_chat.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTXT = () => {
    const url = exportChatTXT(chatHistory);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neuroedge_chat.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const imported = await importChatJSON(file);
    if (onImport) onImport(imported);
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <button style={buttonStyle} onClick={handleExportJSON}>
        Export JSON
      </button>
      <button style={buttonStyle} onClick={handleExportTXT}>
        Export TXT
      </button>
      <button
        style={buttonStyle}
        onClick={() => fileInputRef.current?.click()}
      >
        Import JSON
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImport}
      />
    </div>
  );
};

export default ChatExportMenu;

/* -------------------- */
/* Styles */
/* -------------------- */
const buttonStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderRadius: "6px",
  border: "none",
  background: "#3a3aff",
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.85rem",
};
