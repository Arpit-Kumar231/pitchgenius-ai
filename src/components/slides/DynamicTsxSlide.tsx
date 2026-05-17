import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import * as React from "react";
import * as Babel from "@babel/standalone";
import { z } from "zod";
import { motion } from "framer-motion-stub";
import { Logo } from "./primitives/Logo";
import { Chart } from "./primitives/Chart";
import { getBackendUrl } from "@/lib/agent-client";

/**
 * Compiles AI-generated TSX (one schema + one component, no imports) and renders
 * it with the given data. The generated code MUST declare `const schema = z.object(...)`
 * and `const Layout = (props) => ...`. We evaluate it inside a Function() scope
 * with React / z / Logo / Chart / motion as injected globals.
 */

const codeCache = new Map<string, string>();
const compiledCache = new Map<string, { Layout: React.FC<{ data: unknown }>; schema?: z.ZodTypeAny }>();

async function fetchLayoutCode(templateId: string, layoutId: string): Promise<string> {
  const key = `${templateId}/${layoutId}`;
  const cached = codeCache.get(key);
  if (cached) return cached;
  const res = await fetch(`${getBackendUrl()}/templates/${templateId}/layouts/${layoutId}/code`);
  if (!res.ok) throw new Error(`Failed to fetch layout: ${res.status}`);
  const j = await res.json();
  codeCache.set(key, j.code as string);
  return j.code as string;
}

function compile(code: string): { Layout: React.FC<{ data: unknown }>; schema?: z.ZodTypeAny } {
  const cached = compiledCache.get(code);
  if (cached) return cached;
  // Strip any stray `export` keywords the model may have emitted.
  const cleaned = code
    .replace(/^\s*import[^;]*;?\s*$/gm, "")
    .replace(/\bexport\s+default\s+/g, "")
    .replace(/\bexport\s+/g, "");
  const wrapped = `
    ${cleaned}
    return { schema: typeof schema !== 'undefined' ? schema : undefined,
             Layout: typeof Layout !== 'undefined' ? Layout : (typeof Slide !== 'undefined' ? Slide : null) };
  `;
  const out = Babel.transform(wrapped, {
    presets: ["typescript", ["react", { runtime: "classic" }]],
    filename: "layout.tsx",
  }).code as string;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function("React", "z", "Logo", "Chart", "motion", out);
  const res = fn(React, z, Logo, Chart, motion);
  if (!res?.Layout) throw new Error("Generated TSX did not export a Layout component");
  compiledCache.set(code, res);
  return res;
}

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 48, color: "#fff", background: "#7f1d1d", fontFamily: "monospace" }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>Layout runtime error</div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 20 }}>{this.state.err.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function DynamicTsxSlide({
  templateId,
  layoutId,
  data,
}: {
  templateId: string;
  layoutId: string;
  data: unknown;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    setCode(null);
    fetchLayoutCode(templateId, layoutId)
      .then(setCode)
      .catch((e: Error) => setErr(e.message));
  }, [templateId, layoutId]);

  const compiled = useMemo(() => {
    if (!code) return null;
    try {
      return compile(code);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(`Compile error: ${msg}`);
      return null;
    }
  }, [code]);

  if (err)
    return (
      <div style={{ padding: 48, color: "#fff", background: "#7f1d1d", width: 1920, height: 1080 }}>
        <div style={{ fontSize: 32 }}>Template error</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{err}</pre>
      </div>
    );
  if (!compiled)
    return (
      <div style={{ display: "grid", placeItems: "center", width: 1920, height: 1080, background: "#0a1628", color: "#fff" }}>
        Loading template…
      </div>
    );

  const Layout = compiled.Layout;
  let safeData = data;
  try {
    if (compiled.schema) safeData = compiled.schema.parse(data ?? {});
  } catch {
    // fall back to raw data + defaults rendered by component
  }
  return (
    <Boundary>
      <Layout data={safeData} />
    </Boundary>
  );
}