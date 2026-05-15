import { createFileRoute } from "@tanstack/react-router";
import { EditorView } from "@/components/chat/EditorView";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Pitchbook Studio — Multi-agent pitchbook generator" },
      { name: "description", content: "An AI pitchbook studio for Relationship Managers, powered by a LangGraph supervisor and specialist sub-agents." },
    ],
  }),
});

function Index() {
  return (
    <main className="h-screen">
      <EditorView />
    </main>
  );
}
