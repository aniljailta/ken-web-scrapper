import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsUrl,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class CreateCompanyDto {
  @IsNotEmpty({ message: 'Company name is required' })
  @IsString({ message: 'Company name must be a string' })
  @MaxLength(255, { message: 'Company name must be under 255 characters' })
  company: string;

  @IsNotEmpty({ message: 'URL is required' })
  @IsUrl({}, { message: 'Please enter a valid URL' })
  @MaxLength(500, { message: 'URL must be under 500 characters' })
  url: string;

  @IsOptional()
  @IsString({ message: 'Logo must be a string' })
  @MaxLength(500, { message: 'Logo URL must be under 500 characters' })
  logo?: string;
}

export class CompanyPaginationDto {
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination: PaginationDto;
}
