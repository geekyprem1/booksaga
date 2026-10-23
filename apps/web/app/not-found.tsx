import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="app-backdrop flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-brand-gradient text-6xl font-extrabold">404</p>
      <h1 className="text-xl font-semibold">This page could not be found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you are looking for does not exist or you do not have access to it.
      </p>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </main>
  );
}
