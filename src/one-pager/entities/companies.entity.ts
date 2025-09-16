import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('companies')
export class Companies {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.pagers, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  company: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 500 })
  logo: string;

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
