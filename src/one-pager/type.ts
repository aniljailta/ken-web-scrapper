export enum PagerStatus {
  NOT_PROCESSED = 'not_processed',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export type TopicSlug = string;

export type TopicContentMap = {
  [slug in TopicSlug]: {
    rank_index: number;
    chunk_ids: string[];
    source_type: string;
    title: string;
    tags: string[];
  };
};

export interface TopicJSON {
  title: string;
  subtitle: string;
  quote: string;
  index: number;
  problem: string;
  solution: string;
  highlights: string[];
  cta: string;
  ctaText: string;
  ctaLink: string;
}

export type folderTypes = 'uploads' | 'brands' | 'pagers';
