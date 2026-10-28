'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { Logo } from './logo';
import { SidebarNav, type SidebarItem } from './sidebar';
import { Button } from '@/components/ui/button';

export function MobileNav({
  items,
  isAdmin,
  appName,
}: {
  items: SidebarItem[];
  isAdmin: boolean;
  appName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 overflow-y-auto border-r border-border bg-background p-4 data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <div className="flex items-center justify-between">
            <Logo name={appName} />
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <SidebarNav items={items} isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
