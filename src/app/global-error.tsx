"use client";

/**
 * App Router root error UI (replaces Pages Router src/pages/_error.tsx).
 * Must define its own <html> and <body>.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <h1 style={{ fontSize: "2.25rem", fontWeight: 700, color: "#1f2937" }}>500</h1>
          <p style={{ marginTop: 8, fontSize: "1.125rem", color: "#4b5563" }}>
            Something went wrong
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 24,
              padding: "8px 16px",
              background: "#111",
              color: "#fff",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
