import crypto from "crypto";
import { readState, writeState } from "@storage/hybrid_db";

export interface FedUpdate {
  id: string;
  ts: number;
  n_features: number;
  classes: string[];
  coef: number[][];
  intercept: number[];
  samples?: number;
}

export interface FedModel {
  version: number;
  updatedAt: number;
  n_features: number;
  classes: string[];
  coef: number[][];
  intercept: number[];
}

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${entries.join(",")}}`;
}

export function signPayload(payload: any, key: string): string {
  const msg = stableStringify(payload);
  return crypto.createHmac("sha256", key).update(msg).digest("hex");
}

export function verifyPayload(payload: any, sig: string, key: string): boolean {
  if (!key) return true;
  const expected = signPayload(payload, key);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig || "");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export class FedAggregator {
  private updates: FedUpdate[] = [];
  private global: FedModel | null = null;

  constructor() {
    const state = readState();
    const existing = (state.summary || {})["fed_model"] as FedModel | undefined;
    if (existing) this.global = existing;
  }

  addUpdate(update: FedUpdate) {
    this.updates.push(update);
    if (this.updates.length >= 3) {
      this.aggregate();
    }
  }

  getGlobal(): FedModel | null {
    return this.global;
  }

  private aggregate() {
    if (this.updates.length === 0) return;
    const base = this.updates[0];
    const coefSum: number[][] = base.coef.map((row) => row.map(() => 0));
    const interceptSum: number[] = base.intercept.map(() => 0);
    let totalWeight = 0;

    for (const u of this.updates) {
      const w = Math.max(1, Number(u.samples || 1));
      totalWeight += w;
      for (let i = 0; i < coefSum.length; i++) {
        for (let j = 0; j < coefSum[i].length; j++) {
          coefSum[i][j] += u.coef[i][j] * w;
        }
      }
      for (let i = 0; i < interceptSum.length; i++) {
        interceptSum[i] += u.intercept[i] * w;
      }
    }

    const denom = Math.max(1, totalWeight);
    const coefAvg = coefSum.map((row) => row.map((v) => v / denom));
    const interceptAvg = interceptSum.map((v) => v / denom);

    const nextVersion = (this.global?.version || 0) + 1;
    this.global = {
      version: nextVersion,
      updatedAt: Date.now(),
      n_features: base.n_features,
      classes: base.classes,
      coef: coefAvg,
      intercept: interceptAvg,
    };

    const state = readState();
    writeState({
      ...state,
      summary: { ...(state.summary || {}), fed_model: this.global },
    });

    this.updates = [];
  }
}
