export type DocLocale = 'en' | 'id';

export type DocModule =
  | 'overview'
  | 'dashboard'
  | 'marketplace'
  | 'driver'
  | 'services'
  | 'operations';

export interface DocFrontmatter {
  title: string;
  description: string;
  section: string;
  module: DocModule;
  order?: number;
}

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocPage {
  slug: string[];
  slugPath: string;
  locale: DocLocale;
  frontmatter: DocFrontmatter;
  content: string;
  headings: DocHeading[];
}

export interface DocsNavItem {
  slug: string;
  title: string;
}

export interface DocsNavSection {
  id: string;
  title: string;
  items: DocsNavItem[];
}

export interface DocsCategory {
  id: DocModule;
  title: string;
  description: string;
  href: string;
  icon: 'overview' | 'dashboard' | 'marketplace' | 'driver' | 'services' | 'operations';
}
