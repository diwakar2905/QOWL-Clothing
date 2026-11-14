export default function InvoiceLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-soft py-6 print:bg-white print:py-0">{children}</div>;
}
