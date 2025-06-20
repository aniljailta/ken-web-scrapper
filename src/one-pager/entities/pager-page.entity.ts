import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
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

  @Column({ type: 'uuid', nullable: false })
  pagerId: string;

  @ManyToOne(() => Pager, (pager) => pager.pagerPage, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pagerId' })
  pager: Pager;
}
