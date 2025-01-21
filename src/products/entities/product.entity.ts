import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SupportProductInternalContent } from './internal_content.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  productName: string;

  @Column({ unique: true, nullable: false })
  url: string;

  @Column('jsonb')
  jsonData: any;

  @Column('jsonb')
  productIds: any;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => SupportProductInternalContent, (item) => item.productData, {
    onDelete: 'CASCADE',
  })
  internalContents: SupportProductInternalContent[];
}
