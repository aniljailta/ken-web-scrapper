import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  CreateDateColumn,
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
