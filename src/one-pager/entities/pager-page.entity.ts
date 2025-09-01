import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Pager } from './pager.entity';
import { PageUserFeedBack } from '../type';
import { PageContent } from './page-content.entity';

@Entity('pager_page')
export class PagerPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  name: string;

  @Column({ type: 'text', nullable: false })
  link: string;

  @Column({ type: 'int', nullable: true })
  index: number;

  @Column({ type: 'enum', nullable: true, enum: PageUserFeedBack })
  userResponse: PageUserFeedBack;

  @Column({ type: 'text', default: '' })
  source_type: string;

  @Column({
    type: 'jsonb',
    nullable: false,
    default: () => "'[]'::jsonb",
  })
  tags: string[];

  @Column({ type: 'uuid', nullable: true })
  pagerId: string;

  @ManyToOne(() => Pager, (pager) => pager.pagerPage, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pagerId' })
  pager: Pager;

  @OneToOne(() => PageContent, (pageContent) => pageContent.pagerPage, {
    cascade: true,
  })
  pageContent: PageContent;

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
