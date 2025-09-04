import { IsInt, Min } from 'class-validator';

export class PaginationDto {
  @IsInt()
  @Min(1)
  current: number;

  @IsInt()
  @Min(1)
  pageSize: number;

  @IsInt()
  @Min(0)
  total: number;

  @IsInt()
  @Min(0)
  totalPages: number;
}
