import { IsArray, IsObject } from 'class-validator';

export class UpdatePagerTopicsDTO {
  @IsArray()
  topics: string[];
  @IsObject()
  topicCluster: any;
}
