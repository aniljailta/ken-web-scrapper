import { IsString } from 'class-validator';

export class PagerAssignUserDTO {
  @IsString()
  userId: string;
  @IsString()
  pagerId: string;
}
