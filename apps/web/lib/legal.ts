export const legalPages = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  refund: 'Refund Policy',
  'ai-disclosure': 'AI Content Disclosure',
} as const;
export type LegalSlug = keyof typeof legalPages;
