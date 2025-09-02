import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PagerPage } from './pager-page.entity';

@Entity('page_content')
export class PageContent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  subtitle: string;

  @Column({ type: 'text', nullable: true })
  problem: string;

  @Column({ type: 'text', nullable: true })
  solution: string;

  @Column({ type: 'jsonb', nullable: true })
  highlights: string[];

  @Column({ type: 'text', nullable: true })
  cta: string;

  @Column({ type: 'text', nullable: true })
  ctaText: string;

  @Column({ type: 'text', nullable: true })
  ctaLink: string;

  @Column({ type: 'uuid', nullable: true })
  pagerPageId: string | null;

  @OneToOne(() => PagerPage, (pagerPage) => pagerPage.pageContent, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pagerPageId' })
  pagerPage: PagerPage;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    transformer: {
      to: (value) => value,
      from: (value) => {
        if (!value) {
          return new Date();
        }
        if (typeof value === 'string') {
          return new Date(value);
        }
        if (value instanceof Date) {
          return new Date(value.toISOString());
        }
        return value;
      },
    },
  })
  created_date: Date;
  @UpdateDateColumn({ name: 'last_modified_at', type: 'timestamp' })
  lastModifiedAt: Date;
}
