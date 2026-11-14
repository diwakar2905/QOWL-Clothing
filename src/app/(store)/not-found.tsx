import { Container, EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="py-16">
      <EmptyState title="Page not found" body="This page doesn't exist — or hasn't been written yet." action={<ButtonLink href="/">Back to QOWL</ButtonLink>} />
    </Container>
  );
}
