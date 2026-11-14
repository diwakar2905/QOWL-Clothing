export default function Loading() {
  return (
    <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-10 lg:grid-cols-[1.75fr_1fr] lg:px-10" aria-busy="true" aria-label="Loading product">
      <div className="grid grid-cols-2 gap-2"><div className="aspect-[3/4.6] animate-pulse bg-cream" /><div className="aspect-[3/4.6] animate-pulse bg-cream" /></div>
      <div className="space-y-4"><div className="h-12 w-2/3 animate-pulse bg-cream" /><div className="h-6 w-1/3 animate-pulse bg-cream" /><div className="h-24 animate-pulse bg-cream" /></div>
    </div>
  );
}
