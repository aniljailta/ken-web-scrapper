import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
} from 'typeorm';
import { PagerChunks } from './pager-chunks.entity';
import { Pager } from './pager.entity';

@Entity('topic_cluster')
export class TopicCluster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'uuid', nullable: true })
  pagerId: string;

  @ManyToOne(() => Pager, (pager) => pager.pagerPage, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pagerId' })
  pager: Pager;

  @ManyToMany(() => PagerChunks, (chunk) => chunk.topicClusters, {
    cascade: true,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinTable({
    name: 'topic_cluster_chunks',
    joinColumn: {
      name: 'topicClusterId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'pagerChunkId',
      referencedColumnName: 'id',
    },
  })
  pagerChunks: PagerChunks[];
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
