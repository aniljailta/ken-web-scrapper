import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { OnePagerService } from './one-pager.service';
import archiver from 'archiver';

@Controller('one-pager')
@UseGuards(AuthGuard('jwt'))
export class OnePagerController {
  constructor(private readonly onePagerService: OnePagerService) {}

  @Get('get-all')
  getAllPagers(@Req() req) {
    return this.onePagerService.findAll(req.user.id);
  }

  @Get('download-zip/:id')
  async downloadZip(@Req() req, @Param('id') id: string, @Res() res) {
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename=pdfs.zip',
    });

    archive.pipe(res);

    const pdfs = await this.onePagerService.getPdfStreams(req.user.id, id);
    for (const pdf of pdfs) {
      archive.append(pdf.stream, { name: pdf.filename });
    }

    await archive.finalize();
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req) {
    return this.onePagerService.upload(file, req.user.id);
  }

  @Post('process')
  processPdfChunk(@Body('id') id: string, @Req() req) {
    return this.onePagerService.generateAllOnePagers(id, req.user.id);
  }

  @Delete(':id')
  deletePager(@Param('id') id: string, @Req() req) {
    return this.onePagerService.deletePager(id, req.user.id);
  }

  @Get(':id')
  getSinglePager(@Param('id') id: string, @Req() req) {
    return this.onePagerService.findOne(id, req.user.id);
  }
}
