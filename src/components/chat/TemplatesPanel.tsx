import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, Check, X } from "lucide-react";
import { useDeck } from "@/lib/deck-store";
import { listTemplates, uploadTemplate, deleteTemplate, type TemplateMeta } from "@/lib/templates-client";

export function TemplatesPanel({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeTemplateId = useDeck((s) => s.activeTemplateId);
  const setActiveTemplateId = useDeck((s) => s.setActiveTemplateId);

  useEffect(() => { listTemplates().then(setTemplates); }, []);

  async function handleUpload() {
    const files = Array.from(fileRef.current?.files || []);
    if (!files.length || !name.trim()) { setErr("Pick a name and at least one slide image."); return; }
    setBusy(true); setErr(null);
    try {
      await uploadTemplate(name.trim(), files);
      setName(""); if (fileRef.current) fileRef.current.value = "";
      setTemplates(await listTemplates());
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h2 className="font-display text-base">Templates</h2>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="glass rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium">Upload a deck</div>
          <p className="text-xs text-muted-foreground">
            Drop slide screenshots (PNG/JPG). Each becomes a reusable TSX layout the planner can pick.
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. MUFG IB style)"
            className="w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm" />
          <input ref={fileRef} type="file" accept="image/*" multiple className="text-xs" />
          {err ? <div className="text-xs text-destructive">{err}</div> : null}
          <button disabled={busy} onClick={handleUpload}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40">
            <Upload className="h-3.5 w-3.5" /> {busy ? "Generating layouts…" : "Generate template"}
          </button>
        </div>
        <div className="space-y-2">
          {templates.length === 0 ? <div className="text-xs text-muted-foreground">No templates yet.</div> : null}
          {templates.map((t) => (
            <div key={t.id} className={`glass rounded-lg p-3 ${activeTemplateId === t.id ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.layouts.length} layouts</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setActiveTemplateId(activeTemplateId === t.id ? null : t.id)}
                    className={`rounded px-2 py-1 text-xs ${activeTemplateId === t.id ? "bg-primary text-primary-foreground" : "border border-border/60"}`}>
                    {activeTemplateId === t.id ? <><Check className="inline h-3 w-3" /> Active</> : "Use"}
                  </button>
                  <button onClick={async () => { await deleteTemplate(t.id); setTemplates(await listTemplates()); if (activeTemplateId === t.id) setActiveTemplateId(null); }}
                    className="rounded border border-border/60 px-2 py-1 text-xs hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground truncate">
                {t.layouts.map((L) => L.name).join(" · ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}