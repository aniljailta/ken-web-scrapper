import { IsEnum } from 'class-validator';
import { PageUserFeedBack } from '../type';

export class HandleUserFeedbackDTO {
  @IsEnum(PageUserFeedBack)
  response: PageUserFeedBack;
}
