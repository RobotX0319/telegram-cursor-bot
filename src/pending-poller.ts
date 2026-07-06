import { listPendingRuns, processPendingRuns } from "./pending";
import type { Env } from "./types";

const POLL_INTERVAL_MS = 120_000;

export class PendingPoller {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/kick" && request.method === "POST") {
      await this.ensureAlarmScheduled();
      return Response.json({ ok: true, action: "kick" });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const alarm = await this.state.storage.getAlarm();
      const pending = await listPendingRuns(this.env);
      return Response.json({
        ok: true,
        alarmAt: alarm,
        pending: pending.length,
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  async alarm(): Promise<void> {
    try {
      const notified = await processPendingRuns(this.env);
      if (notified > 0) {
        console.log(`DO poll: ${notified} ta natija yuborildi`);
      }
    } catch (error) {
      console.error(
        "DO poll xato:",
        error instanceof Error ? error.message : String(error),
      );
    }

    const remaining = await listPendingRuns(this.env);
    if (remaining.length > 0) {
      await this.state.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
    }
  }

  private async ensureAlarmScheduled(): Promise<void> {
    const existing = await this.state.storage.getAlarm();
    if (existing == null) {
      await this.state.storage.setAlarm(Date.now() + 1000);
    }
  }
}

export async function schedulePendingPoller(env: Env): Promise<boolean> {
  if (!env.PENDING_POLLER) return false;

  try {
    const id = env.PENDING_POLLER.idFromName("global");
    const stub = env.PENDING_POLLER.get(id);
    const response = await stub.fetch(
      new Request("http://pending-poller/kick", { method: "POST" }),
    );
    return response.ok;
  } catch (error) {
    console.error(
      "Pending poller ishga tushmadi:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
