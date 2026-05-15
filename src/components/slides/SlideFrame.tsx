import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fixed 1920×1080 canvas, scaled to fit parent. */
export function SlideFrame({
  children,
  className = "",
  fit = "contain",
}: {
  children: ReactNode;
  className?: string;
  fit?: "contain" | "width";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const sx = r.width / 1920;
      const sy = r.height / 1080;
      setScale(fit === "width" ? sx : Math.min(sx, sy));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <div ref={wrapRef} className={`relative w-full h-full overflow-hidden ${className}`}>
      <div
        className="slide-content absolute left-1/2 top-1/2"
        style={{
          width: 1920,
          height: 1080,
          marginLeft: -960,
          marginTop: -540,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
        data-slide-canvas
      >
        {children}
      </div>
    </div>
  );
}