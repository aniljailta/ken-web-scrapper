import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PagerChunks } from './pager-chunks.entity';
import { PagerStatus } from '../type';
import { PagerPage } from './pager-page.entity';
import { PagerBranding } from './pager-branding.entity';
import { Tag } from './tag.entity';
import { TopicCluster } from './topic-cluster.entity';

@Entity('pager')
export class Pager {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  originalDocLink: string;

  @ManyToOne(() => User, (user) => user.pagers, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'text', default: '' })
  source_type: string;

  @OneToOne(() => PagerBranding, (pagerBranding) => pagerBranding.pager, {
    cascade: true,
  })
  branding: PagerBranding;

  @Column({
    type: 'enum',
    enum: PagerStatus,
    default: PagerStatus.NOT_PROCESSED,
  })
  status: PagerStatus;

  @OneToMany(() => PagerChunks, (pagerChunks) => pagerChunks.pager)
  pagerChunks: PagerChunks[];

  @OneToMany(() => TopicCluster, (topicCluster) => topicCluster.pager)
  topicClusters: TopicCluster[];

  @OneToMany(() => PagerPage, (pagerPage) => pagerPage.pager)
  pagerPage: PagerPage[];

  @ManyToMany(() => Tag, (tag) => tag.pagers, {
    cascade: true,
  })
  @JoinTable({
    name: 'pager_tags',
    joinColumn: { name: 'pager_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

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
}
