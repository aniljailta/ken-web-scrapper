import { IsArray } from 'class-validator';

export class UpdatePagerTopicsDTO {
  @IsArray()
  topics: string[];
}
