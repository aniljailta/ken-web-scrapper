import { Injectable, Logger } from '@nestjs/common';
import PdfParse from 'pdf-parse';
import { sanitizePdfText } from './helper';
import { join } from 'path';
import * as fs from 'fs';
import * as hbs from 'handlebars';
import { PagerChunks } from './entities/pager-chunks.entity';
import showdown from 'showdown';
import PDFParser from 'pdf2json';

@Injectable()
export class OnePagerHelper {
  private readonly logger = new Logger(OnePagerHelper.name);
  constructor() {}

  async readPDF(file: Express.Multer.File): Promise<string> {
    try {
      let fullText = await new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        // When parsing is complete
        pdfParser.on('pdfParser_dataReady', (pdfData) => {
          try {
            // Extract text from pages 📝
            let fullText = '';
            pdfData.Pages.forEach((page) => {
              page.Texts.forEach((textObj) => {
                // Join text fragments on the same line
                const lineText = textObj.R.map((t) =>
                  decodeURIComponent(t.T),
                ).join('');
                fullText += lineText + ' ';
              });
              fullText += '\n\n'; // page break
            });

            // Clean extra spaces
            fullText = fullText.replace(/\s+/g, ' ').trim();

            resolve(fullText);
          } catch (err) {
            reject(err);
          }
        });

        // When there’s an error
        pdfParser.on('pdfParser_dataError', (err) => reject(err));

        // Load PDF directly from buffer
        pdfParser.parseBuffer(file.buffer);
      });

      fullText = sanitizePdfText(fullText as string);
      console.log('🚀 ~ OnePagerHelper ~ readPDF ~ fullText:', fullText);
      return '';
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
