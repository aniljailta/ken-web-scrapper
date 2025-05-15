import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { WebinarConversation } from './webinar_conversation.entity';

@Entity('webinar_sessions')
export class WebinarSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => WebinarConversation, (conversation) => conversation.session, {
    cascade: true,
  })
  @JoinColumn()
  conversation: WebinarConversation;
}
