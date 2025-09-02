import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
} from 'typeorm';
import { Pager } from './pager.entity';
import { TopicCluster } from './topic-cluster.entity';

@Entity('pager_chunks')
export class PagerChunks {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'uuid' })
  pagerId: string;

  @ManyToOne(() => Pager, (pager) => pager.pagerChunks, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  pager: Pager;
  @ManyToMany(() => TopicCluster, (cluster) => cluster.pagerChunks)
  topicClusters: TopicCluster[];
}
