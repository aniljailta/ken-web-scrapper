import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs/promises';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScraperData } from './entities/scraper_data.entity';
import {
  buildVocabulary,
  cosineSimilarity,
  extractProductData,
  flattenAndConcatenate,
  vectorize,
} from './utils';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import {
  ALL_PRODUCT_LIST_URL,
  initialScraperConfig,
  retryForCompactScraperConfig,
  retryScraperConfig,
} from './constant';

@Injectable()
export class ScraperService implements OnModuleInit {
  private openai: OpenAI;

  private readonly logger = new Logger(ScraperService.name);
  private readonly failedProductPath = 'failed_list_product.json';

  constructor(
    @InjectRepository(ScraperData)
    private scrapperDataRepository: Repository<ScraperData>,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not defined in the environment variables.',
      );
    }

    this.openai = new OpenAI({ apiKey });
  }

  async onModuleInit() {
    this.logger.log('Starting scraper service...');
    await this.startScraping();

    this.logger.log('Retrying failed products...');
    await this.retryFailedLinks();

    this.logger.log('Retrying failed products for all compact text');
    await this.retryFailedLinksForCompactText();

    this.logger.log('Retrying failed products for all content');
    await this.retryFailedLinksForAllContent();

    this.logger.log('Retrying failed products for all body');
    await this.retryFailedLinksForBody();

    // await this.startScrapingAllContent();
  }

  async processLinks({
    page,
    links,
    config,
    isRetry = false,
  }: {
    page: puppeteer.Page;
    links: { productName: string; productUrl: string }[];
    config: Record<string, any>;
    isRetry: boolean;
  }): Promise<void> {
    for (const [index, link] of links.entries()) {
      const { productUrl: url, productName } = link;

      this.logger.log(
        `Processing ${index + 1}/${links.length}: ${url} ${
          isRetry ? '(Retry Mode)' : ''
        }`,
      );

      try {
        await page.goto(url, { waitUntil: 'load', timeout: 0 });

        const productData = await extractProductData(
          page,
          url,
          productName,
          config,
          isRetry,
        );

        // const dataSheetContent = await extractDataSheetContent(page);

        // productData.dataSheetContent = dataSheetContent;

        if (!productData.title || !productData.preTitle) {
          this.logger.warn(
            `Incomplete data for product: ${productName || url}. Marking as failed.`,
          );

          await this.saveFailedProductLineByLine({
            productUrl: url,
            productName,
            error: 'Missing required fields',
          });
          continue; // Skip saving if data is incomplete
        }

        await this.saveScraperData(productData);

        // Remove the link from failed products if it was in retry mode
        if (isRetry) {
          await this.removeFailedProduct(url);
        }

        this.logger.log(
          `Saved product ${index + 1}/${links.length}: ${
            productData.title || url
          }`,
        );
      } catch (error) {
        this.logger.error(
          `Error processing product at ${url}: ${error.message}`,
        );

        await this.saveFailedProductLineByLine({
          productUrl: url,
          productName,
          error: error.message,
        });
      }
    }
  }

  async startScraping() {
    this.logger.log('Starting the scraping process...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    try {
      const allProductLinkURL = ALL_PRODUCT_LIST_URL;

      await page.goto(allProductLinkURL, { waitUntil: 'load', timeout: 0 });

      this.logger.log('Extracting all links...');
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.list-section a'))
          .filter((anchor: any) => anchor.href)
          .map((anchor: any) => ({
            productName: anchor.textContent?.trim() || '',
            productUrl: anchor.href,
          }));
      });

      this.logger.log(`Found ${links.length} links on the page.`);

      await this.processLinks({
        page,
        links,
        config: initialScraperConfig,
        isRetry: false,
      });
    } catch (error) {
      this.logger.error(`Error during scraping: ${error.message}`);
    } finally {
      await browser.close();
      this.logger.log('Browser closed. Scraping process finished.');
    }
  }

  async retryFailedLinks() {
    const failedFilePath = this.failedProductPath;

    try {
      const fileData = await fs.readFile(failedFilePath, 'utf-8');
      const failedLinks = JSON.parse(fileData) || [];

      if (failedLinks.length === 0) {
        this.logger.log('No failed links to retry.');
        return;
      }

      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      await this.processLinks({
        page,
        links: failedLinks,
        config: retryScraperConfig,
        isRetry: true,
      });

      await browser.close();
      this.logger.log('Retry process completed.');
    } catch (error) {
      this.logger.error(`Error during retry process: ${error.message}`);
    }
  }

  async retryFailedLinksForCompactText() {
    const failedFilePath = this.failedProductPath;

    try {
      const fileData = await fs.readFile(failedFilePath, 'utf-8');
      const failedLinks = JSON.parse(fileData) || [];

      if (failedLinks.length === 0) {
        this.logger.log('No failed links to retry.');
        return;
      }

      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      await this.processLinks({
        page,
        links: failedLinks,
        config: retryForCompactScraperConfig,
        isRetry: true,
      });

      await browser.close();
      this.logger.log('Retry process completed.');
    } catch (error) {
      this.logger.error(`Error during retry process: ${error.message}`);
    }
  }

  // New method to save failed products

  private async saveFailedProductLineByLine(failedProduct: any): Promise<void> {
    const failedFilePath = this.failedProductPath;

    try {
      const existingFailedProducts = new Map<string, any>();

      // Check if the file exists
      if (
        await fs
          .access(failedFilePath)
          .then(() => true)
          .catch(() => false)
      ) {
        const fileData = await fs.readFile(failedFilePath, 'utf-8');

        // Parse existing file data and load it into a Map for deduplication
        if (fileData.trim()) {
          const parsedData = JSON.parse(fileData);
          for (const product of parsedData) {
            existingFailedProducts.set(product.productUrl, product);
          }
        }
      }

      // Add the new failed product to the Map if it doesn't already exist
      if (!existingFailedProducts.has(failedProduct.productUrl)) {
        existingFailedProducts.set(failedProduct.productUrl, failedProduct);

        // Write back the updated data to the file
        const updatedFailedProducts = Array.from(
          existingFailedProducts.values(),
        );
        await fs.writeFile(
          failedFilePath,
          JSON.stringify(updatedFailedProducts, null, 2),
        );
        this.logger.log(`Saved failed product: ${failedProduct.productUrl}`);
      } else {
        this.logger.warn(
          `Duplicate failed product ignored: ${failedProduct.productUrl}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error saving failed product (${failedProduct.productUrl}):`,
        error.message,
      );
      throw error;
    }
  }

  // private async saveProductData(
  //   productData: Record<string, any>,
  // ): Promise<Record<string, any>[]> {
  //   try {
  //     let existingProducts: Record<string, any>[] = [];
  //     try {
  //       const fileData = await fs.readFile(this.filePath, 'utf-8');
  //       existingProducts = JSON.parse(fileData);
  //     } catch {
  //       this.logger.warn('No existing JSON file found, starting fresh.');
  //     }

  //     const allProducts = mergeAndDeduplicate(existingProducts, [productData]);

  //     await fs.writeFile(this.filePath, JSON.stringify(allProducts, null, 2));
  //     return allProducts;
  //   } catch (error) {
  //     this.logger.error('Error saving product data:', error.message);
  //     throw error;
  //   }
  // }

  private async removeFailedProduct(url: string): Promise<void> {
    const failedFilePath = this.failedProductPath;

    try {
      const fileData = await fs.readFile(failedFilePath, 'utf-8');
      const failedLinks = JSON.parse(fileData) || [];

      const updatedFailedLinks = failedLinks.filter(
        (product) => product.productUrl !== url,
      );

      await fs.writeFile(
        failedFilePath,
        JSON.stringify(updatedFailedLinks, null, 2),
      );
      this.logger.log(`Removed successfully processed product: ${url}`);
    } catch (error) {
      this.logger.error(
        `Error removing failed product (${url}):`,
        error.message,
      );
    }
  }

  async retryFailedLinksForAllContent() {
    try {
      const linksFileData = await fs.readFile(this.failedProductPath, 'utf-8');
      const productLinks = JSON.parse(linksFileData);

      if (!productLinks || productLinks.length === 0) {
        this.logger.log('No failed links to retry.');
        return;
      }

      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      for (const [index, link] of productLinks.entries()) {
        const { productUrl: url, productName } = link;

        this.logger.log(
          `Processing ${index + 1}/${productLinks.length}: ${url}`,
        );

        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 5000 });

          let content = null;

          // Check for #fw-content specifically
          try {
            await page.waitForSelector('#fw-content', { timeout: 5000 });
            content = await page.evaluate(() => {
              const container: any = document.querySelector('#fw-content');
              return container ? container.innerText : '';
            });
          } catch {
            // If #fw-content is not found, fall back to scraping the entire body
            this.logger.warn(
              `Selector #fw-content not found. Falling back to full page body.`,
            );
            content = await page.evaluate(() => document.body.innerText);
          }

          const productData = {
            productName: productName,
            productUrl: url,
            content: content,
            linkText: productName,
          };

          if (!content) {
            this.logger.warn(
              `Incomplete data for product: ${productName || url}. Marking as failed.`,
            );

            await this.saveFailedProductLineByLine({
              productUrl: url,
              productName,
              error: 'Missing required fields',
            });
            continue; // Skip saving if data is incomplete
          }

          // Save valid product data
          await this.saveScraperData(productData);
          await this.removeFailedProduct(url);

          this.logger.log(
            `Saved product ${index + 1}/${productLinks.length}: ${
              productData.productName || url
            }`,
          );
        } catch (error) {
          this.logger.error(
            `Error processing product at ${url}: ${error.message}`,
          );
          await this.saveFailedProductLineByLine({
            productUrl: url,
            productName,
            error: error.message,
          });
        }
      }

      this.logger.log('All content scraping completed successfully');
    } catch (error) {
      this.logger.error('Error during scraping:', error.message);
    } finally {
      this.logger.log('Browser closed');
    }
  }

  async retryFailedLinksForBody() {
    try {
      const linksFileData = await fs.readFile(this.failedProductPath, 'utf-8');
      const productLinks = JSON.parse(linksFileData);

      if (!productLinks || productLinks.length === 0) {
        this.logger.log('No failed links to retry.');
        return;
      }

      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      for (const [index, link] of productLinks.entries()) {
        const { productUrl: url, productName } = link;

        this.logger.log(
          `Processing ${index + 1}/${productLinks.length}: ${url}`,
        );

        try {
          await page.goto(url, { waitUntil: 'load', timeout: 0 });

          const content = await page.evaluate(() => document.body.innerText);

          const productData = {
            productName: productName,
            productUrl: url,
            content: content,
            linkText: productName,
          };

          if (!content) {
            this.logger.warn(
              `Incomplete data for product: ${productName || url}. Marking as failed.`,
            );

            await this.saveFailedProductLineByLine({
              productUrl: url,
              productName,
              error: 'Missing required fields',
            });
            continue; // Skip saving if data is incomplete
          }

          // Save valid product data
          await this.saveScraperData(productData);
          await this.removeFailedProduct(url);

          this.logger.log(
            `Saved product ${index + 1}/${productLinks.length}: ${
              productData.productName || url
            }`,
          );
        } catch (error) {
          this.logger.error(
            `Error processing product at ${url}: ${error.message}`,
          );
          await this.saveFailedProductLineByLine({
            productUrl: url,
            productName,
            error: error.message,
          });
        }
      }

      this.logger.log('All body scraping completed successfully');
    } catch (error) {
      this.logger.error('Error during scraping:', error.message);
    } finally {
      this.logger.log('Browser closed');
    }
  }

  public async saveScraperData(
    productData: Record<string, any>,
  ): Promise<ScraperData> {
    try {
      // Step 1: Flatten and prepare text
      const textContent = await flattenAndConcatenate(productData);

      // Step 2: Build vocabulary (static or dynamic per use case)
      const vocabulary = buildVocabulary([textContent]); // You can save and reuse this for consistency

      // Step 3: Generate vector
      const vector = vectorize(textContent, vocabulary);

      // Step 4: Save data to database
      const scraperData = this.scrapperDataRepository.create({
        url: productData.productUrl,
        content: textContent,
        vector,
        jsonData: productData,
        productName: productData?.linkText || '',
      });
      return await this.scrapperDataRepository.save(scraperData);
    } catch (error) {
      this.logger.warn('Error saving scraper data:', error?.message);
      throw error;
    }
  }

  async getResponse(query: string): Promise<string> {
    // Step 1: Get query embedding
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: query,
    });
    const queryVector = embeddingResponse.data[0].embedding;

    // Step 2: Fetch data from the database
    const data = await this.scrapperDataRepository.find();

    // Step 3: Compute similarity for each row
    const scores = data.map((item) => ({
      content: item.content,
      similarity: cosineSimilarity(queryVector, item.vector),
    }));

    // Step 4: Sort results by similarity
    const topResults = scores
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map((item) => item.content)
      .join('\n');

    console.log({ query });

    // Step 5: Use OpenAI to generate a response
    const completionResponse = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are an assistant that answers questions based on a database.',
        },
        {
          role: 'user',
          content: `Based on the following content, answer the query: "${query}".\n\nContent:\n${topResults}`,
        },
      ],
    });

    return completionResponse.choices[0].message.content.trim();
  }

  public async getScraperRecordByUrl(url: string): Promise<ScraperData | null> {
    try {
      // Use findOneBy for a direct condition
      const record = await this.scrapperDataRepository.findOneBy({ url });

      if (!record) {
        return null;
      } else {
        return record;
      }
    } catch (error) {
      this.logger.warn(`Error fetching scraper record: ${error.message}`);
      return null;
    }
  }
}
