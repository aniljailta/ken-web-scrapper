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
    tags: string[];
  };
};
