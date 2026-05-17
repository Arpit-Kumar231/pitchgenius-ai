import { getBackendUrl } from "./agent-client";

export type TemplateLayout = { id: string; name: string; description: string };
export type TemplateMeta = { id: string; name: string; created_at: string; layouts: TemplateLayout[] };

export async function listTemplates(): Promise<TemplateMeta[]> {
  const r = await fetch(`${getBackendUrl()}/templates`);
  if (!r.ok) return [];
  return (await r.json()).templates as TemplateMeta[];
}

export async function uploadTemplate(name: string, files: File[]): Promise<TemplateMeta> {
  const fd = new FormData();
  fd.append("name", name);
  files.forEach((f) => fd.append("images", f));
  const r = await fetch(`${getBackendUrl()}/templates`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`Upload failed: ${r.status} ${await r.text()}`);
  return (await r.json()) as TemplateMeta;
}

export async function deleteTemplate(id: string): Promise<void> {
  await fetch(`${getBackendUrl()}/templates/${id}`, { method: "DELETE" });
}