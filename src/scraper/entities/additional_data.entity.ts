import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { InternalContent } from './internal_content.entity';

@Entity()
export class AdditionalData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productName: string;

  @Column({ unique: true })
  url: string;

  // @Column('text')
  // content: string;

  // @Column('float', { array: true })
  // vector: number[];

  @Column('jsonb')
  jsonData: any;

  @Column('jsonb')
  productIds: any;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(
    () => InternalContent,
    (internalContent) => internalContent.scraperData,
    {
      onDelete: 'CASCADE',
    },
  )
  internalContents: InternalContent[];
}
