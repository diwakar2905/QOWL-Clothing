"use client";
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="label border px-4 py-2 hover:border-forest">Print / Save PDF</button>;
}
