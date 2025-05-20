import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class ChatWidgetHelperService {
  private readonly logger = new Logger(ChatWidgetHelperService.name);

  private serviceAccountKeyFile = 'integration-service-account.json';
  private sheetId: string;
  private tabName: string;
  private range: string;

  constructor(private readonly configService: ConfigService) {
    this.init();
  }

  init() {
    this.sheetId = this.configService.get<string>('GOOGLE_SHEET_ID');
    this.tabName = this.configService.get<string>('GOOGLE_TAB_NAME');
    this.range = this.configService.get<string>('GOOGLE_RANGE');
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
}
