"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui", padding: 40, textAlign: "center", background: "#F7F4EC" }}>
        <h1>Something went wrong</h1>
        <button onClick={reset} style={{ marginTop: 20, padding: "10px 20px" }}>Try again</button>
      </body>
    </html>
  );
}
