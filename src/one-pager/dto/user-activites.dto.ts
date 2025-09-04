import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class UserActivitiesDto {
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination: PaginationDto;
}
