import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #e3f0ff 0%, #f4f7ff 45%, #fff3e8 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Decorative blobs */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: -60,
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "rgba(207, 230, 255, 0.6)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -100,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(255, 211, 184, 0.6)",
            filter: "blur(60px)",
          }}
        />

        {/* Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 80px",
            borderRadius: 40,
            background: "rgba(255, 255, 255, 0.75)",
            border: "1px solid rgba(255, 255, 255, 0.7)",
            boxShadow: "0 32px 80px -20px rgba(88, 118, 170, 0.25)",
          }}
        >
          {/* Fire emoji */}
          <div style={{ fontSize: 64, marginBottom: 16, display: "flex" }}>
            {"🔥"}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: "#1b2a3a",
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              textAlign: "center",
              display: "flex",
            }}
          >
            Compounders
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 28,
              color: "#6b7c92",
              marginTop: 20,
              textAlign: "center",
              lineHeight: 1.4,
              display: "flex",
            }}
          >
            Track what compounds. No account needed.
          </div>

          {/* Streak pills */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 40,
            }}
          >
            {[
              { emoji: "📖", label: "Read", streak: "14d" },
              { emoji: "💪", label: "Exercise", streak: "7d" },
              { emoji: "✍️", label: "Journal", streak: "21d" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 20px",
                  borderRadius: 999,
                  background: "rgba(255, 255, 255, 0.9)",
                  border: "1px solid rgba(255, 255, 255, 0.8)",
                  boxShadow: "0 4px 12px -4px rgba(88, 118, 170, 0.15)",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#1b2a3a",
                }}
              >
                <span>{item.emoji}</span>
                <span>{item.label}</span>
                <span
                  style={{
                    color: "#ff8c5a",
                    fontWeight: 700,
                  }}
                >
                  {item.streak}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
