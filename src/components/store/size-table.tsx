type Guide = { name: string; unit: string; columns: string[]; rows: unknown; fitNotes: string | null; modelInfo: string | null };

const LABELS: Record<string, string> = { chest: "Chest", length: "Body length", shoulder: "Shoulder", sleeve: "Sleeve length", waist: "Waist" };

export function SizeTable({ guide, showName }: { guide: Guide; showName?: boolean }) {
  const rows = (Array.isArray(guide.rows) ? guide.rows : []) as Record<string, string | number>[];
  return (
    <section>
      {showName && <h2 className="mb-4 font-serif text-2xl uppercase">{guide.name}</h2>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <caption className="sr-only">Garment measurements in {guide.unit === "in" ? "inches" : "centimetres"}</caption>
          <thead>
            <tr className="border-b border-charcoal/30 text-left">
              <th scope="col" className="label py-3 pr-4">Size</th>
              {guide.columns.map((c) => <th key={c} scope="col" className="label py-3 pr-4">{LABELS[c] ?? c} ({guide.unit})</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.size)} className="border-b hairline">
                <th scope="row" className="py-3 pr-4 text-left font-medium">{r.size}</th>
                {guide.columns.map((c) => <td key={c} className="py-3 pr-4 tabular-nums">{r[c] ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {guide.fitNotes && <p className="mt-4 text-sm text-charcoal/80">{guide.fitNotes}</p>}
      {guide.modelInfo && <p className="mt-2 text-sm text-charcoal/80">{guide.modelInfo}</p>}
      <p className="mt-2 text-xs text-stone">Measurements are of the garment laid flat, not body measurements.</p>
    </section>
  );
}
