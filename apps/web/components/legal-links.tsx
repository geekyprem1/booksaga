import Link from 'next/link';
import { legalPages } from '@/lib/legal';
import { getAppInfo } from '@/lib/settings';

export async function LegalLinks() {
  const { supportEmail } = await getAppInfo();
  return (
    <nav
      aria-label="Legal"
      className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
    >
      {Object.entries(legalPages).map(([slug, title]) => (
        <Link key={slug} href={`/legal/${slug}`} className="hover:text-foreground hover:underline">
          {title}
        </Link>
      ))}
      <a href={`mailto:${supportEmail}`} className="hover:text-foreground hover:underline">
        Support
      </a>
    </nav>
  );
}
