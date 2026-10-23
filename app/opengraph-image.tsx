import { ImageResponse } from "next/og";

export const alt = "Flux: play generative art like an instrument";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview image (link cards on LinkedIn, Slack, X…), rendered at build time. */
export default function OpengraphImage() {
  const dot = (color: string) => (
    <div style={{ width: 36, height: 36, borderRadius: 18, background: color }} />
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: 80,
        background: "#15171A",
        color: "#E4E6E3",
      }}
    >
      <div style={{ display: "flex", gap: 16, marginBottom: 40 }}>
        {dot("#E8743B")}
        {dot("#3BA7C9")}
        {dot("#C63D8E")}
      </div>
      <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>Flux</div>
      <div style={{ fontSize: 44, marginTop: 24, color: "#A9ADAA" }}>
        Play generative art like an instrument.
      </div>
    </div>,
    size,
  );
}
