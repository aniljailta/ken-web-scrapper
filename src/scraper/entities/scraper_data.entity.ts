import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class ScraperData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  url: string;

  @Column('text')
  content: string;

  @Column('float', { array: true })
  vector: number[];

  @CreateDateColumn()
  createdAt: Date;
}
