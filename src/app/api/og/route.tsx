import { ImageResponse } from "next/og";

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
    "Pit AI personas against each other in live, moderator-led debates.",
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
            "radial-gradient(circle at top left, rgba(240, 171, 105, 0.35), transparent 24%), radial-gradient(circle at top right, rgba(96, 165, 250, 0.24), transparent 22%), linear-gradient(180deg, #121a23 0%, #0c1118 100%)",
          color: "#f7f1e7",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(216, 122, 59, 0.14) 0%, rgba(216, 122, 59, 0) 42%), linear-gradient(315deg, rgba(59, 130, 246, 0.16) 0%, rgba(59, 130, 246, 0) 45%)",
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
              color: "#f0ab69",
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
                background: "#f0ab69",
                boxShadow: "0 0 24px rgba(240, 171, 105, 0.72)",
              }}
            />
            The AI Pit
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
                color: "rgba(247, 241, 231, 0.84)",
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
              color: "rgba(247, 241, 231, 0.72)",
              fontSize: 24,
            }}
          >
            <div style={{ display: "flex", gap: 14 }}>
              <span>Moderator-led</span>
              <span>•</span>
              <span>Persona vs persona</span>
              <span>•</span>
              <span>Shareable scenarios</span>
            </div>
            <div style={{ display: "flex", color: "#f0ab69", fontWeight: 700 }}>
              aipit.tsilva.eu
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
