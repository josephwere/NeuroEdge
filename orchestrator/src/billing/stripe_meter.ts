import axios from "axios";
import * as crypto from "crypto";

export interface MeterEventInput {
  customerId: string;
  meterName: string;
  value: number;
  identifier?: string;
}

function toForm(input: Record<string, string | number>): URLSearchParams {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) {
    form.append(k, String(v));
  }
  return form;
}

export async function reportStripeMeterEvent(input: MeterEventInput): Promise<boolean> {
  const stripeKey = process.env.STRIPE_SECRET_KEY || "";
  if (!stripeKey) return false;

  const meterName = input.meterName || process.env.STRIPE_METER_EVENT_NAME || "neuroedge_tokens";
  const identifier = input.identifier || `evt_${crypto.randomUUID()}`;
  const form = toForm({
    event_name: meterName,
    identifier,
    "payload[stripe_customer_id]": input.customerId,
    "payload[value]": Math.max(0, Math.floor(input.value)),
  });

  await axios.post("https://api.stripe.com/v1/billing/meter_events", form, {
    timeout: 4000,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  return true;
}
