import { Conversation } from 'src/conversation/entities/conversation.entity';
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

  @Column({ type: 'enum', enum: ['admin', 'user'], default: 'user' })
  role: string;

  @Column({ type: 'int', default: 0 })
  tokensUsed: number;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    transformer: {
      to: (value) => value,
      from: (value) => new Date(value.toISOString()), // Ensures the date is returned in UTC
    },
  })
  created_date: Date;

  @OneToMany(() => Conversation, (conversation) => conversation.user, {
    cascade: true, // Deletes conversations when the user is deleted
  })
  conversations: Conversation[];
}
