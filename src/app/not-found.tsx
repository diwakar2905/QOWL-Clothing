import Link from "next/link";

export default function RootNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-10 text-center">
      <h1 className="display text-5xl">Not found</h1>
      <Link href="/" className="label mt-6 underline">Back to QOWL</Link>
    </main>
  );
}
