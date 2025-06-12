import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { OnePagerService } from './one-pager.service';

@Controller('one-pager')
@UseGuards(AuthGuard('jwt'))
export class OnePagerController {
  constructor(private readonly onePagerService: OnePagerService) {}
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req) {
    return this.onePagerService.upload(file, req.user.id);
  }
}
