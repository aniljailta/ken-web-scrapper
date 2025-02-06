import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Message } from './message.entity';

@Entity()
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string; // Used for tracking guest & user conversations

  @Column({ nullable: true })
  userId?: string; // Null for guests

  @Column({ default: false })
  isGuest: boolean; // Differentiates guest conversations

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  productName: string;

  @OneToMany(() => Message, (message) => message.conversation, {
    onDelete: 'CASCADE',
  })
  messages: Message[];
}
