'use client';

import { useRef } from 'react';
import Link from 'next/link';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { LogOut, UserRound } from 'lucide-react';
import { initials } from '@/lib/utils';

export function UserMenu({
  name,
  email,
  role,
  avatarUrl,
}: {
  name: string;
  email: string;
  role: 'user' | 'admin';
  avatarUrl?: string | null;
}) {
  // The form lives outside the menu: Radix unmounts menu content on select, which would otherwise
  // remove the form before the browser submits it.
  const signOutForm = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={signOutForm} action="/auth/signout" method="post" className="hidden" />
      <Menu.Root>
        <Menu.Trigger
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-left hover:bg-muted"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span className="bg-brand-gradient flex size-8 items-center justify-center rounded-full text-xs font-bold text-white">
              {initials(name, email)}
            </span>
          )}
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-32 truncate text-sm font-semibold">{name || email}</span>
            <span className="block text-[11px] text-muted-foreground">
              {role === 'admin' ? 'Administrator' : 'Member'}
            </span>
          </span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={8}
            className="z-50 w-60 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0"
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-semibold">{name || 'Your account'}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item asChild>
              <Link
                href="/profile"
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted"
              >
                <UserRound className="size-4" aria-hidden="true" />
                Profile
              </Link>
            </Menu.Item>
            <Menu.Item
              onSelect={() => signOutForm.current?.requestSubmit()}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
