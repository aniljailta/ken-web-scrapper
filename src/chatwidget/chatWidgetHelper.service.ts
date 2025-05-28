import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import sgMail, { MailDataRequired } from '@sendgrid/mail';
import { join } from 'path';
import * as fs from 'fs';
import * as hbs from 'handlebars';

@Injectable()
export class ChatWidgetHelperService {
  private readonly logger = new Logger(ChatWidgetHelperService.name);

  private serviceAccountKeyFile = 'integration-service-account.json';
  private pdfFileName =
    'Katalyst_2025_Cybersecurity_Annual_Report_Final_v3-6.pdf';
  private sheetId: string;
  private tabName: string;
  private range: string;
  private sendGridKey: string;
  private sendGridSenderMail: string;

  constructor(private readonly configService: ConfigService) {
    this.init();
  }

  init() {
    this.sheetId = this.configService.get<string>('GOOGLE_SHEET_ID');
    this.tabName = this.configService.get<string>('GOOGLE_TAB_NAME');
    this.range = this.configService.get<string>('GOOGLE_RANGE');
    this.sendGridKey =
      this.configService.getOrThrow<string>('SENDGRID_API_KEY');
    this.sendGridSenderMail = this.configService.getOrThrow<string>(
      'SENDGRID_SENDER_MAIL',
    );
  }

  private async _getGoogleSheetClient() {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.serviceAccountKeyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    // @ts-ignore
    return google.sheets({
      version: 'v4',
      auth: authClient,
    });
  }
  private async _writeGoogleSheet(
    googleSheetClient,
    sheetId,
    tabName,
    range,
    data,
  ) {
    await googleSheetClient.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tabName}!${range}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        majorDimension: 'ROWS',
        values: data,
      },
    });
  }
  async writeContentInSheets(data: any[]) {
    try {
      const googleSheetClient = await this._getGoogleSheetClient();
      await this._writeGoogleSheet(
        googleSheetClient,
        this.sheetId,
        this.tabName,
        this.range,
        data,
      );
    } catch (error) {
      this.logger.error(`Failed to Write Data In Sheets: ${error.message}`);
    }
  }
  async render(templateName: string, context: any): Promise<string> {
    const templatePath = join('src', 'views', `${templateName}.hbs`);
    const source = fs.readFileSync(templatePath, 'utf8');

    hbs.registerHelper(
      'capitalize',
      (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
    );
    hbs.registerHelper('eq', (a, b) => a === b);

    const compiled = hbs.compile(source);
    return compiled(context);
  }

  private getSendGridClient() {
    sgMail.setApiKey(this.sendGridKey);
    return sgMail;
  }

  private getPDfFileData() {
    try {
      if (!this.pdfFileName) {
        throw new Error('PDF FILE NAME NOT SPECIFIED');
      }

      return fs.readFileSync(this.pdfFileName).toString('base64');
    } catch (error) {
      this.logger.error(
        `Failed to Read Content From The File: ${error.message}`,
      );
      return undefined;
    }
  }

  async sendMail({
    payload,
    includeAttachment,
  }: {
    payload: MailDataRequired;
    includeAttachment?: boolean;
  }): Promise<void> {
    const client = this.getSendGridClient();

    try {
      const data: MailDataRequired = {
        ...payload,
        from: this.sendGridSenderMail,
      };

      if (includeAttachment) {
        // Attaching Webinar PDF
        const fileData = this.getPDfFileData();

        data.attachments = [
          {
            content: fileData,
            filename: this.pdfFileName,
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ];
      }

      const [response] = await client.send(data);
      this.logger.debug(`Sent Mail to Client: ${response.statusCode}`);
    } catch (error) {
      this.logger.error(`Failed to Send Mail: ${error.message}`);
    }
  }
}
