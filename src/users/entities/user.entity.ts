import { Conversation } from 'src/conversation/entities/conversation.entity';
import { Pager } from 'src/one-pager/entities/pager.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: ['admin', 'user', 'beta'], default: 'user' })
  role: string;

  @Column({ type: 'int', default: 0 })
  tokensUsed: number;

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
  @OneToMany(() => Pager, (pager) => pager.user)
  pagers: Pager[];

  @OneToMany(() => Conversation, (conversation) => conversation.user, {
    cascade: true, // Deletes conversations when the user is deleted
  })
  conversations: Conversation[];
}
