import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { runPitchbook, type AgentEvent } from "@/lib/pitchbook/agents.server";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const Route = createFileRoute("/api/chat/stream")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const message = String(body?.message ?? "").trim();
        if (!message) {
          return new Response("message is required", { status: 400 });
        }

        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (e: AgentEvent) => {
              const { type, ...rest } = e;
              controller.enqueue(enc.encode(sse(type, rest)));
            };
            try {
              for await (const evt of runPitchbook({
                thread_id: body?.thread_id ?? null,
                message,
                client: body?.client,
                topic: body?.topic,
              })) {
                send(evt);
              }
            } catch (e: any) {
              controller.enqueue(enc.encode(sse("error", { message: e?.message ?? "internal error" })));
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});