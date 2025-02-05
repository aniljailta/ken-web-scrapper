import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RequestTracker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  ip: string;

  @Column({ default: 0 })
  requestCount: number;

  @Column({ type: 'date', nullable: true })
  lastRequestDate: Date;
}
