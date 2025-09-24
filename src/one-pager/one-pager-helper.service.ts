import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';
import * as hbs from 'handlebars';
import axios from 'axios';
import FormData from 'form-data';
import { PagerChunks } from './entities/pager-chunks.entity';
import showdown from 'showdown';

@Injectable()
export class OnePagerHelper {
  private readonly logger = new Logger(OnePagerHelper.name);
  private readonly pythonServiceUrl = 'http://localhost:8000/extract-text'; // Python microservice URL
  constructor() {}

  async readPDF(file: Express.Multer.File): Promise<string> {
    try {
      // Prepare file as FormData for Python service
      const formData = new FormData();
      formData.append('file', Buffer.from(file.buffer), {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      // Call Python microservice
      const response = await axios.post(this.pythonServiceUrl, formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity, // large PDF support
      });

      if (response.data?.text) {
        this.logger.log(`PDF processed successfully: ${file.originalname}`);
        return response.data.text;
      } else {
        this.logger.warn(`No text returned for file: ${file.originalname}`);
        return '';
      }
    } catch (error) {
      this.logger.error(`Error while reading the PDF: ${error.message}`);
      return '';
    }
  }

  async renderTemplate(templateName: string, context: any): Promise<string> {
    const templatePath = join('src', 'views', `${templateName}.hbs`);
    const source = fs.readFileSync(templatePath, 'utf8');

    hbs.registerHelper(
      'capitalize',
      (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
    );
    hbs.registerHelper('inc', function (value) {
      return parseInt(value) + 1;
    });
    hbs.registerHelper('limit', function (arr, limit) {
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, limit);
    });

    hbs.registerHelper('eq', (a, b) => a === b);

    hbs.registerHelper('stripPTags', function (htmlString) {
      const trimmed = htmlString.trim();
      if (trimmed.startsWith('<p>') && trimmed.endsWith('</p>')) {
        return new hbs.SafeString(trimmed.slice(3, -4));
      }
      return new hbs.SafeString(htmlString);
    });

    const compiled = hbs.compile(source);
    return compiled(context);
  }

  splitIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      chunks.push(text.slice(start, start + maxLength));
      start += maxLength;
    }

    return chunks;
  }

  batchChunks(chunks: PagerChunks[], size = 20) {
    const batches = [];
    for (let i = 0; i < chunks.length; i += size) {
      batches.push(chunks.slice(i, i + size));
    }
    return batches;
  }

  parseMarkDown(text: string) {
    //
    const converter = new showdown.Converter();
    const content = converter.makeHtml(text);
    return content;
  }
}
