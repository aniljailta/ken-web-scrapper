import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Pager } from './pager.entity';

@Entity('pager_page')
export class PagerPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  name: string;

  @Column({ type: 'text', nullable: false })
  link: string;

  @Column({ type: 'uuid', nullable: true })
  pagerId: string;

  @ManyToOne(() => Pager, (pager) => pager.pagerPage, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pagerId' })
  pager: Pager;

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
