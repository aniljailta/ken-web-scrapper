import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('support_product_internal_content')
export class SupportProductInternalContent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productDataId: number;

  @Column()
  name: string;

  @Column()
  link: string;

  @ManyToOne(() => Product, (product) => product.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productDataId' })
  productData: Product;

  @Column('jsonb', { nullable: true })
  introduction?: any;

  @Column('jsonb', { nullable: true })
  overview?: any;

  @Column('jsonb', { nullable: true })
  configurations?: any;

  @Column('jsonb', { nullable: true })
  features?: any;

  @Column('jsonb', { nullable: true })
  highlights?: any;

  @Column('jsonb', { nullable: true })
  intelligent?: any;

  @Column('jsonb', { nullable: true })
  licensing?: any;

  @Column('jsonb', { nullable: true })
  milestones?: any;

  @Column('jsonb', { nullable: true })
  ordering?: any;

  @Column('jsonb', { nullable: true })
  part_numbers?: any;

  @Column('jsonb', { nullable: true })
  performance?: any;

  @Column('jsonb', { nullable: true })
  platform?: any;

  @Column('jsonb', { nullable: true })
  power_supply?: any;

  @Column('jsonb', { nullable: true })
  scalability?: any;

  @Column('jsonb', { nullable: true })
  specifications?: any;

  @Column('jsonb', { nullable: true })
  stacking?: any;

  @Column('jsonb', { nullable: true })
  status?: any;

  @Column('jsonb', { nullable: true })
  software?: any;

  @Column('jsonb', { nullable: true })
  warranty?: any;
}
