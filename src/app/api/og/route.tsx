import { ImageResponse } from "next/og";
import { SITE_HOSTNAME } from "@/lib/site";

export const runtime = "edge";

const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

function clamp(value: string | null, fallback: string, maxLength: number): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    return fallback;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = clamp(searchParams.get("title"), "The AI Pit", 90);
  const subtitle = clamp(
    searchParams.get("subtitle"),
    "Turn any topic into a moderator-led AI debate and share the replay.",
    140,
  );

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(circle at top left, rgba(88, 166, 255, 0.26), transparent 24%), radial-gradient(circle at top right, rgba(249, 117, 131, 0.18), transparent 22%), linear-gradient(180deg, #0f172a 0%, #08101f 100%)",
          color: "#f8fafc",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(210, 153, 34, 0.14) 0%, rgba(210, 153, 34, 0) 40%), linear-gradient(315deg, rgba(163, 113, 247, 0.18) 0%, rgba(163, 113, 247, 0) 44%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 18,
            borderRadius: 32,
            border: "2px solid rgba(122, 162, 247, 0.45)",
            boxShadow: "inset 0 0 0 1px rgba(248, 250, 252, 0.08)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "56px 64px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              color: "#58a6ff",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                display: "flex",
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "#d29922",
                boxShadow: "0 0 24px rgba(210, 153, 34, 0.72)",
              }}
            />
            aipit
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
              maxWidth: "88%",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 74,
                lineHeight: 1.03,
                fontWeight: 800,
                letterSpacing: -2.5,
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 34,
                lineHeight: 1.25,
                color: "rgba(248, 250, 252, 0.82)",
                maxWidth: "90%",
              }}
            >
              {subtitle}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "rgba(226, 232, 240, 0.78)",
              fontSize: 24,
            }}
          >
            <div style={{ display: "flex", gap: 14 }}>
              <span>Moderator-led</span>
              <span>•</span>
              <span>Custom rosters</span>
              <span>•</span>
              <span>Shareable scenarios</span>
            </div>
            <div style={{ display: "flex", color: "#f97583", fontWeight: 700 }}>{SITE_HOSTNAME}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
