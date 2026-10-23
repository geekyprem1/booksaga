import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true">
      <defs>
        <linearGradient id="bs-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#bs-g)" />
      <path
        d="M9 22V10.5c0-.8.6-1.4 1.4-1.4H15c1 0 1.8.4 2.4 1 .6-.6 1.4-1 2.4-1h2.8c.8 0 1.4.6 1.4 1.4V22c0 .3-.3.5-.6.4-.7-.2-1.5-.4-2.3-.4H19c-.9 0-1.6.4-2 1-.4-.6-1.1-1-2-1h-2.2c-.8 0-1.6.2-2.3.4-.3.1-.6-.1-.6-.4Z"
        fill="#fff"
        opacity="0.95"
      />
    </svg>
  );
}

export function Logo({ name = 'BookSaga', href = '/dashboard' }: { name?: string; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg" aria-label={`${name} home`}>
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight">
        <span className="text-brand-gradient">{name}</span>
      </span>
    </Link>
  );
}
