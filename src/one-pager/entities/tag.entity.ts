import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
} from 'typeorm';
import { Pager } from './pager.entity';

@Entity('tag')
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: false })
  name: string;

  @ManyToMany(() => Pager, (pager) => pager.tags)
  pagers: Pager[];

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
