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

  @Column()
  productName: string;

  @Column({ unique: true })
  url: string;

  @Column('text')
  content: string;

  @Column('float', { array: true })
  vector: number[];

  @Column('jsonb')
  jsonData: any;

  @CreateDateColumn()
  createdAt: Date;
}
