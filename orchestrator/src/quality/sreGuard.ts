import { Request, Response, NextFunction } from "express";
import { appendEvent } from "@storage/hybrid_db";

const inflight = new Map<string, number>();
const peakInflight = new Map<string, number>();

function inc(key: string) {
  const next = (inflight.get(key) || 0) + 1;
  inflight.set(key, next);
  const peak = peakInflight.get(key) || 0;
  if (next > peak) peakInflight.set(key, next);
}

function dec(key: string) {
  const current = inflight.get(key) || 0;
  inflight.set(key, Math.max(0, current - 1));
}

export function createInflightGuard(key: string, maxInflight: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const current = inflight.get(key) || 0;
    if (current >= maxInflight) {
      appendEvent({
        type: "sre.load_shed",
        timestamp: Date.now(),
        payload: {
          key,
          currentInflight: current,
          maxInflight,
          path: req.path,
          method: req.method,
        },
      });
      return res.status(503).json({
        error: "Service overloaded",
        detail: `Too many concurrent ${key} requests`,
        currentInflight: current,
        maxInflight,
      });
    }
    inc(key);
    const done = () => dec(key);
    res.on("finish", done);
    res.on("close", done);
    next();
  };
}

export function getInflightSnapshot() {
  const keys = Array.from(new Set([...inflight.keys(), ...peakInflight.keys()]));
  return keys.map((key) => ({
    key,
    inflight: inflight.get(key) || 0,
    peakInflight: peakInflight.get(key) || 0,
  }));
}
