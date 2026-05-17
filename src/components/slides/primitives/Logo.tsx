import { useMemo } from "react";

/** Company logo via logo.dev (no token = lower quality) with Clearbit fallback. */
export function Logo({
  company,
  domain,
  size = 56,
  rounded = false,
}: {
  company?: string;
  domain?: string;
  size?: number;
  rounded?: boolean;
}) {
  const url = useMemo(() => {
    const d = (domain || guessDomain(company || "")).toLowerCase();
    return `https://img.logo.dev/${d}?size=${size * 2}&format=png`;
  }, [company, domain, size]);
  return (
    <img
      src={url}
      alt={`${company || domain || "Company"} logo`}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        borderRadius: rounded ? "9999px" : 8,
        background: "rgba(255,255,255,0.04)",
      }}
      onError={(e) => {
        const d = (domain || guessDomain(company || "")).toLowerCase();
        (e.currentTarget as HTMLImageElement).src = `https://logo.clearbit.com/${d}`;
      }}
    />
  );
}

function guessDomain(name: string): string {
  if (!name) return "example.com";
  if (name.includes(".")) return name;
  return name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}