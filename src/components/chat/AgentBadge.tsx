import { Briefcase, Building2, LineChart, Scale, Layers, MessagesSquare, Sparkles } from "lucide-react";

const MAP: Record<string, { label: string; Icon: any }> = {
  supervisor: { label: "Supervisor", Icon: Sparkles },
  clarifier: { label: "Clarifier", Icon: MessagesSquare },
  market_research: { label: "Market Research", Icon: LineChart },
  crm: { label: "CRM", Icon: Building2 },
  competitor: { label: "Competitor", Icon: Scale },
  financials: { label: "Financials", Icon: Briefcase },
  ppt_builder: { label: "PPT Builder", Icon: Layers },
};

export function AgentBadge({ agent, status, detail }: { agent: string; status: string; detail?: string }) {
  const meta = MAP[agent] ?? { label: agent, Icon: Sparkles };
  const Icon = meta.Icon;
  const tone =
    status === "done" ? "text-[color:var(--color-success)] border-[color:var(--color-success)]/40"
    : status === "running" ? "text-[color:var(--color-running)] border-[color:var(--color-running)]/40 animate-pulse"
    : "text-primary border-primary/40";
  return (
    <div className={`flex items-start gap-3 rounded-md border bg-card/40 px-3 py-2 ${tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold tracking-wide uppercase">{meta.label}</span>
          <span className="text-muted-foreground/80">· {status}</span>
        </div>
        {detail ? <div className="mt-0.5 text-sm text-foreground/80 truncate">{detail}</div> : null}
      </div>
    </div>
  );
}
