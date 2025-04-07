import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class ScrapingLogs {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  productName: string;

  @Column()
  error: string;

  @CreateDateColumn()
  createdAt: Date;
}
