import type { Entitlements } from '@booksaga/shared';

/** Which entitlement unlocks a sidebar module. */
export type NavGate = 'templates' | 'audiobook' | 'agency' | 'reseller';

export type NavIconName =
  | 'LayoutDashboard'
  | 'PenLine'
  | 'Library'
  | 'LayoutGrid'
  | 'Palette'
  | 'Eye'
  | 'Send'
  | 'Headphones'
  | 'Briefcase'
  | 'Crown'
  | 'ImageIcon'
  | 'GraduationCap'
  | 'ShieldCheck';

export interface NavItem {
  slug: string;
  href: string;
  label: string;
  icon: NavIconName;
  description: string;
  /** Milestone in which the real page ships (shown on placeholder pages). */
  milestone?: string;
  gate?: NavGate;
  /** Funnel level that unlocks the gate (for the Upgrade CTA). */
  upgradeLevel?: 'OTO2' | 'OTO3' | 'OTO4' | 'OTO5';
}

export const NAV_ITEMS: NavItem[] = [
  {
    slug: 'dashboard',
    href: '/dashboard',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    description: 'Your series, credits and quick actions.',
  },
  {
    slug: 'create-series',
    href: '/create-series',
    label: 'Create Series',
    icon: 'PenLine',
    milestone: 'M2',
    description: 'Turn one idea into a connected multi-part book series.',
  },
  {
    slug: 'my-series',
    href: '/my-series',
    label: 'My Series',
    icon: 'Library',
    milestone: 'M3',
    description: 'All your series, roadmaps and books in one place.',
  },
  {
    slug: 'templates',
    href: '/templates',
    label: 'Series Templates',
    icon: 'LayoutGrid',
    milestone: 'M6',
    gate: 'templates',
    upgradeLevel: 'OTO2',
    description: 'Ready-made, proven series concepts you can customise and generate.',
  },
  {
    slug: 'cover-studio',
    href: '/cover-studio',
    label: 'Cover Studio',
    icon: 'Palette',
    milestone: 'M4',
    description: 'Matching covers across your whole series.',
  },
  {
    slug: 'kdp-preview',
    href: '/kdp-preview',
    label: 'KDP Preview',
    icon: 'Eye',
    milestone: 'M5',
    description: 'Check your book exactly as it will print before you download.',
  },
  {
    slug: 'publishing',
    href: '/publishing',
    label: 'KDP Publishing',
    icon: 'Send',
    milestone: 'M5',
    description: 'Download KDP-ready EPUB, print PDF, DOCX, covers and metadata.',
  },
  {
    slug: 'audiobooks',
    href: '/audiobooks',
    label: 'Audiobook Series',
    icon: 'Headphones',
    milestone: 'M6',
    gate: 'audiobook',
    upgradeLevel: 'OTO3',
    description: 'Turn every book into an ACX-ready audiobook.',
  },
  {
    slug: 'agency',
    href: '/agency',
    label: 'Agency',
    icon: 'Briefcase',
    milestone: 'M6',
    gate: 'agency',
    upgradeLevel: 'OTO4',
    description: 'Create client accounts and produce series for clients.',
  },
  {
    slug: 'reseller',
    href: '/reseller',
    label: 'Reseller & Franchise',
    icon: 'Crown',
    milestone: 'M6',
    gate: 'reseller',
    upgradeLevel: 'OTO5',
    description: 'Sell BookSaga licenses and use the Franchise promo kit.',
  },
  {
    slug: 'image-editor',
    href: '/image-editor',
    label: 'Image Editor',
    icon: 'ImageIcon',
    milestone: 'M4',
    description: 'Edit covers and images with layers, text and shapes.',
  },
  {
    slug: 'training',
    href: '/training',
    label: 'Training',
    icon: 'GraduationCap',
    milestone: 'M6',
    description: 'Video lessons to get the most out of BookSaga.',
  },
];

/** Is a (possibly gated) module unlocked for these entitlements? */
export function isNavUnlocked(item: NavItem, ent: Entitlements): boolean {
  switch (item.gate) {
    case undefined:
      return true;
    case 'templates':
      return ent.templatesTier !== 'none';
    case 'audiobook':
      return ent.audiobook;
    case 'agency':
      return ent.maxClients > 0;
    case 'reseller':
      return ent.maxResellLicenses > 0 || ent.franchiseKit;
  }
}

export function findNavItem(slug: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.slug === slug);
}
