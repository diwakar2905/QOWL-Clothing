"use client";

import { useEffect } from "react";
import { Container, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="py-16">
      <EmptyState
        title="Something went wrong"
        body={<>We couldn&apos;t load this page. Please try again.{error.digest && <span className="mt-2 block text-xs text-stone">Reference: {error.digest}</span>}</>}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Container>
  );
}
