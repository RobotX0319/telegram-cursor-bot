/** Atomik video ID va takroriy fayl tekshiruvi */
export class VideoCoordinator {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      const body = (await request.json()) as { minCounter?: number };
      return this.state.blockConcurrencyWhile(async () => {
        const current = (await this.state.storage.get<number>("counter")) ?? 0;
        const min = body.minCounter ?? 0;
        if (min > current) {
          await this.state.storage.put("counter", min);
        }
        return Response.json({ ok: true, counter: Math.max(current, min) });
      });
    }

    if (request.method === "POST" && url.pathname === "/allocate") {
      const body = (await request.json()) as { fileUniqueId?: string };
      const fileUniqueId = body.fileUniqueId?.trim();
      if (!fileUniqueId) {
        return Response.json({ ok: false, error: "fileUniqueId kerak" }, { status: 400 });
      }

      return this.state.blockConcurrencyWhile(async () => {
        const dupKey = `dup:${fileUniqueId}`;
        const existing = await this.state.storage.get<number>(dupKey);
        if (existing) {
          return Response.json({ status: "duplicate", id: existing });
        }

        const counter = ((await this.state.storage.get<number>("counter")) ?? 0) + 1;
        await this.state.storage.put("counter", counter);
        await this.state.storage.put(dupKey, counter);

        return Response.json({ status: "created", id: counter });
      });
    }

    if (request.method === "POST" && url.pathname === "/release") {
      const body = (await request.json()) as { fileUniqueId?: string };
      const fileUniqueId = body.fileUniqueId?.trim();
      if (!fileUniqueId) {
        return Response.json({ ok: false }, { status: 400 });
      }

      return this.state.blockConcurrencyWhile(async () => {
        await this.state.storage.delete(`dup:${fileUniqueId}`);
        return Response.json({ ok: true });
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}
