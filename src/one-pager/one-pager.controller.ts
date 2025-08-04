import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OnePagerService } from './one-pager.service';
import archiver from 'archiver';
import { UpdateSystemPromptDTO } from './dto/update-system-prompt.dto';
import { S3Service } from 'src/s3/s3.service';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { Public } from 'src/guards/public.decorator';

@Controller('one-pager')
@UseGuards(JwtAuthGuard)
export class OnePagerController {
  constructor(
    private readonly onePagerService: OnePagerService,
    private readonly s3Service: S3Service,
  ) {}

  @Get('get-all')
  getAllPagers(@Req() req) {
    return this.onePagerService.findAll(req.user.id);
  }

  @Get('system-prompt')
  getSystemPrompt() {
    return this.onePagerService.findAllSystemPrompt();
  }

  @Put('system-prompt')
  updateSystemPrompt(@Body() payload: UpdateSystemPromptDTO) {
    return this.onePagerService.updateSystemPrompt(payload);
  }

  @Get('download-zip/:id')
  @Public()
  async downloadZip(@Req() req, @Param('id') id: string, @Res() res) {
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename=pdfs.zip',
    });

    archive.pipe(res);

    const keys = await this.onePagerService.getPdfStreams(req.user.id, id);
    for (const key of keys) {
      const stream = await this.s3Service.getFileStream(key);
      // @ts-ignore
      archive.append(stream, { name: key });
    }

    await archive.finalize();
  }

  @Post('brand-upload')
  @Public()
  @UseInterceptors(FileInterceptor('file'))
  async uploadBrandFile(@UploadedFile() file: Express.Multer.File) {
    const response = await this.s3Service.uploadFile(file, 'brands');
    return { link: response };
  }

  @Post('upload')
  @Public()
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('userId') userId: string,
  ) {
    return this.onePagerService.upload(file, userId);
  }

  @Post('process')
  @Public()
  processPdfChunk(
    @Body('id') id: string,
    @Body('branding') branding: any,
    @Req() req,
  ) {
    return this.onePagerService.generateAllOnePagers({
      pagerId: id,
      branding,
      userId: req?.user?.id,
    });
  }

  @Delete('pager-page/:id')
  deletePagerPage(@Param('id') id: string) {
    return this.onePagerService.deletePagerPage(id);
  }

  @Delete(':id')
  deletePager(@Param('id') id: string, @Req() req) {
    return this.onePagerService.deletePager(id, req.user.id);
  }

  @Get(':id')
  @Public()
  getSinglePager(@Param('id') id: string, @Req() req) {
    return this.onePagerService.findOne(id, req?.user?.id);
  }
}
