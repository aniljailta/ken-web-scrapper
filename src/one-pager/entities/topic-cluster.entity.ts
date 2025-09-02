import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
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
}
