import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PagerChunks } from './pager-chunks.entity';
import { PagerStatus } from '../type';

@Entity('pager')
export class Pager {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: true })
  name: string;

  @ManyToOne(() => User, (user) => user.pagers, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: PagerStatus,
    default: PagerStatus.NOT_PROCESSED,
  })
  status: PagerStatus;

  @OneToMany(() => PagerChunks, (pagerChunks) => pagerChunks.pager)
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
