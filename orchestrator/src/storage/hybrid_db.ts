import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
const stateFile = path.join(dataDir, "neuroedge_state.json");
const eventsFile = path.join(dataDir, "neuroedge_events.jsonl");

export interface HybridEvent {
  type: string;
  timestamp: number;
  payload: Record<string, any>;
}

export interface HybridState {
  version: string;
  updatedAt: number;
  summary: Record<string, any>;
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function readState(): HybridState {
  ensureDataDir();
  if (!fs.existsSync(stateFile)) {
    const initial: HybridState = {
      version: "v1",
      updatedAt: Date.now(),
      summary: {},
    };
    fs.writeFileSync(stateFile, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }
  const raw = fs.readFileSync(stateFile, "utf-8");
  return JSON.parse(raw) as HybridState;
}

export function writeState(next: HybridState): HybridState {
  ensureDataDir();
  const updated = { ...next, updatedAt: Date.now() };
  fs.writeFileSync(stateFile, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export function appendEvent(evt: HybridEvent): HybridEvent {
  ensureDataDir();
  const record = { ...evt, timestamp: evt.timestamp || Date.now() };
  fs.appendFileSync(eventsFile, `${JSON.stringify(record)}\n`, "utf-8");
  return record;
}

export function listEvents(limit = 200): HybridEvent[] {
  ensureDataDir();
  if (!fs.existsSync(eventsFile)) return [];
  const lines = fs
    .readFileSync(eventsFile, "utf-8")
    .split("\n")
    .filter(Boolean);
  const sliced = lines.slice(Math.max(0, lines.length - limit));
  return sliced.map((line) => JSON.parse(line) as HybridEvent);
}
