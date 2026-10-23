/**
 * Canonical genre list (PRD §8.3) mapped to the 12 template categories (PRD §8.8).
 */
export const TEMPLATE_CATEGORIES = [
  'Fantasy',
  'Romance',
  'Mystery & Thriller',
  'Historical Fiction',
  'Young Adult',
  "Children's",
  'Sci-Fi',
  'Horror',
  'Business & Money',
  'Health & Wellness',
  'Faith & Spirituality',
  'Self-Help',
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface Genre {
  id: string;
  label: string;
  isFiction: boolean;
  category: TemplateCategory;
}

export const GENRES: readonly Genre[] = [
  // Fiction
  { id: 'fantasy', label: 'Fantasy', isFiction: true, category: 'Fantasy' },
  { id: 'romance', label: 'Romance', isFiction: true, category: 'Romance' },
  {
    id: 'mystery-thriller',
    label: 'Mystery & Thriller',
    isFiction: true,
    category: 'Mystery & Thriller',
  },
  { id: 'cozy-mystery', label: 'Cozy Mystery', isFiction: true, category: 'Mystery & Thriller' },
  { id: 'sci-fi', label: 'Sci-Fi', isFiction: true, category: 'Sci-Fi' },
  { id: 'horror', label: 'Horror', isFiction: true, category: 'Horror' },
  {
    id: 'paranormal-urban-fantasy',
    label: 'Paranormal & Urban Fantasy',
    isFiction: true,
    category: 'Fantasy',
  },
  {
    id: 'historical-fiction',
    label: 'Historical Fiction',
    isFiction: true,
    category: 'Historical Fiction',
  },
  { id: 'young-adult', label: 'Young Adult', isFiction: true, category: 'Young Adult' },
  {
    id: 'childrens-middle-grade',
    label: "Children's & Middle Grade",
    isFiction: true,
    category: "Children's",
  },
  // Non-fiction
  { id: 'self-help', label: 'Self-Help', isFiction: false, category: 'Self-Help' },
  {
    id: 'business-money',
    label: 'Business & Money',
    isFiction: false,
    category: 'Business & Money',
  },
  {
    id: 'health-diet-cookbooks',
    label: 'Health, Diet & Cookbooks',
    isFiction: false,
    category: 'Health & Wellness',
  },
  {
    id: 'faith-devotional',
    label: 'Faith & Spirituality / Devotional',
    isFiction: false,
    category: 'Faith & Spirituality',
  },
  { id: 'how-to-hobbies', label: 'How-To & Hobbies', isFiction: false, category: 'Self-Help' },
];

export function getGenre(id: string): Genre | undefined {
  return GENRES.find((g) => g.id === id);
}
