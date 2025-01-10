import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { SupportProductData } from './support_product_data.entity';

@Entity('internal_content')
export class InternalContent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  scraperDataId: number;

  @ManyToOne(() => SupportProductData, (scraperData) => scraperData.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scraperDataId' })
  scraperData: SupportProductData;

  @Column('jsonb')
  internalContent: Record<string, any>; // Stores name and link as JSON
}
