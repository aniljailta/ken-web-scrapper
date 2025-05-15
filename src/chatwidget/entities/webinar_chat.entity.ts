import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { WebinarConversation } from './webinar_conversation.entity';

export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

@Entity('webinar_chats')
export class WebinarChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ChatRole })
  role: ChatRole;

  @Column('text')
  message: string;

  @CreateDateColumn()
  sentAt: Date;

  @ManyToOne(
    () => WebinarConversation,
    (conversation) => conversation.messages,
    { onDelete: 'CASCADE' },
  )
  conversation: WebinarConversation;
}
