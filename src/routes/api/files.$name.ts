import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getFile } from "@/lib/pitchbook/store.server";

export const Route = createFileRoute("/api/files/$name")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { name: string } }) => {
        const data = getFile(params.name);
        if (!data) return new Response("not found", { status: 404 });
        return new Response(data, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "Content-Disposition": `attachment; filename="${params.name}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});