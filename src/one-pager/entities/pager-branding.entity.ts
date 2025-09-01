import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PagerPage } from './pager-page.entity';
import { Pager } from './pager.entity';

@Entity('pager_branding')
export class PagerBranding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  pagerId: string | null;

  @OneToOne(() => Pager, (pager) => pager.branding, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pagerId' })
  pager: Pager;

  @Column({ type: 'varchar', length: 10 }) // hex code like #4976FF
  primaryColor: string;

  @Column({ type: 'varchar', length: 10 }) // hex code like #22559F
  secondaryColor: string;

  @Column({ type: 'text', nullable: true }) // storing logo URL
  logo: string;

  @Column({ type: 'text', nullable: true })
  name: string;

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
