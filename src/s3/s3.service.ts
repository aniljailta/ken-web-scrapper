import { Injectable } from '@nestjs/common';

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { Upload } from '@aws-sdk/lib-storage';
import { folderTypes } from 'src/one-pager/type';
import path from 'path';
import mime from 'mime';
import sharp from 'sharp';

@Injectable()
export class S3Service {
  private s3: S3Client;
  private bucket = '';

  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3Client({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
    this.bucket = this.configService.getOrThrow('AWS_S3_BUCKET');
  }

  async uploadFile(file: Express.Multer.File, folder: folderTypes = 'uploads') {
    const key = `${folder}/${Date.now()}-${file.originalname}`;
    let buffer = file.buffer;

    // 1️⃣ Detect if file is SVG
    const isSvg =
      file.mimetype === 'image/svg+xml' ||
      buffer.toString('utf8', 0, 100).includes('<svg');

    // 2️⃣ If not SVG and folder is 'brands', process with Sharp
    if (isSvg === false && folder === 'brands') {
      buffer = await sharp(buffer)
        .trim() // remove transparent or white padding around the logo
        .resize({
          width: 126,
          height: 36,
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png() // normalize all logos into PNG
        .sharpen() // optional, helps crispness
        .toBuffer();
    }

    // 3️⃣ Upload to S3
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.configService.getOrThrow('AWS_S3_BUCKET'),
        Key: key,
        Body: buffer,
        ContentType: file.mimetype,
      },
    });

    await upload.done();

    return `https://${this.configService.getOrThrow('AWS_S3_BUCKET')}.s3.${this.configService.getOrThrow('AWS_REGION')}.amazonaws.com/${key}`;
  }

  async uploadLogoBuffer(
    file: Buffer,
    folder: folderTypes = 'brands',
    url: string,
  ): Promise<string> {
    try {
      const baseName = path.basename(new URL(url).pathname) || 'logo.png';
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${folder}/${Date.now()}-${safeName}`;

      const contentType = mime.lookup(baseName) || 'image/png';

      const upload = new Upload({
        client: this.s3,
        params: {
          Bucket: this.configService.getOrThrow('AWS_S3_BUCKET'),
          Key: key,
          Body: file,
          ContentType: contentType,
        },
      });

      await upload.done();

      return `https://${this.configService.getOrThrow('AWS_S3_BUCKET')}.s3.${this.configService.getOrThrow('AWS_REGION')}.amazonaws.com/${key}`;
    } catch (error) {
      console.error('❌ Failed to upload logo:', error);
      throw new Error('Logo upload failed. Please try again.');
    }
  }

  async uploadPdfBuffer(buffer: Buffer, key: string) {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.configService.getOrThrow('AWS_S3_BUCKET'),
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      },
    });

    await upload.done();

    return `https://${this.configService.getOrThrow('AWS_S3_BUCKET')}.s3.${this.configService.getOrThrow('AWS_REGION')}.amazonaws.com/${key}`;
  }

  async getSignedUrl(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.s3, command, { expiresIn: 3600 }); // 1 hour
  }

  async getFileStream(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.configService.getOrThrow('AWS_S3_BUCKET'),
      Key: key,
    });

    const response = await this.s3.send(command);
    return response.Body as NodeJS.ReadableStream; // stream of the file
  }
}
