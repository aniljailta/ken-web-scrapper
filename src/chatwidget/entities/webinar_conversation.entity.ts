import {
  Entity,
  PrimaryGeneratedColumn,
  OneToMany,
  OneToOne,
  CreateDateColumn,
} from 'typeorm';
import { WebinarChat } from './webinar_chat.entity';
import { WebinarSession } from './webinar_session.entity';

@Entity('webinar_conversations')
export class WebinarConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => WebinarSession, (session) => session.conversation)
  session: WebinarSession;

  @OneToMany(() => WebinarChat, (chat) => chat.conversation, { cascade: true })
  messages: WebinarChat[];

  @CreateDateColumn()
  sentAt: Date;
}
