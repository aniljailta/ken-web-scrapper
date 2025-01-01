import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { AdditionalData } from './additional_data.entity';

@Entity('internal_content')
export class InternalContent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  scraperDataId: number;

  @ManyToOne(() => AdditionalData, (scraperData) => scraperData.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scraper_data_id' })
  scraperData: AdditionalData;

  @Column('jsonb')
  internalContent: Record<string, any>; // Stores name and link as JSON
}
