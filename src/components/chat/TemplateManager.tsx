import { useEffect, useRef, useState } from "react";
import { Upload, FileText, Check, Loader2, AlertCircle } from "lucide-react";
import { listTemplates, uploadTemplate, type TemplateInfo } from "@/lib/agent-client";

type Props = {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function TemplateManager({ selectedId, onSelect }: Props) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setTemplates(await listTemplates());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load templates");
    }
  }
  useEffect(() => { refresh(); }, []);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true); setError(null);
    try {
      let last: TemplateInfo | null = null;
      for (const f of Array.from(files)) {
        if (!f.name.toLowerCase().endsWith(".pptx")) {
          setError(`Skipped ${f.name}: only .pptx supported`);
          continue;
        }
        last = await uploadTemplate(f);
      }
      await refresh();
      if (last) onSelect(last.id);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="glass rounded-md px-4 py-3 text-xs">
      <div className="flex items-center gap-3">
        <FileText className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground/90">PPT templates</span>
        <span className="text-muted-foreground">
          Upload MUFG-style decks — only style & structure are used, no data extracted.
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary/90 px-2.5 py-1 text-primary-foreground hover:bg-primary disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload .pptx
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pptx"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {templates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${
              selectedId === null ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {selectedId === null && <Check className="h-3 w-3" />}
            Default
          </button>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              title={`${t.slide_count} slides · layouts: ${t.layouts.slice(0, 3).join(", ")}${t.layouts.length > 3 ? "…" : ""}`}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${
                selectedId === t.id ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {selectedId === t.id && <Check className="h-3 w-3" />}
              {t.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}