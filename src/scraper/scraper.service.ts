import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs/promises';
import * as simpleFS from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ScraperData } from './entities/scraper_data.entity';
import {
  buildVocabulary,
  cosineSimilarity,
  extractProductData,
  flattenAndConcatenate,
  mergeAllProducts,
  mergeAndDeduplicate,
  sanitizeFileName,
  scrapeWordSectionContent,
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
import { AdditionalData } from './entities/additional_data.entity';
import * as path from 'path';
import { InternalContent } from './entities/internal_content.entity';

@Injectable()
export class ScraperService implements OnModuleInit {
  private openai: OpenAI;
  private baseURL = 'https://www.cisco.com';
  private readonly logger = new Logger(ScraperService.name);
  private readonly failedProductPath = 'failed_list_product.json';
  private readonly filePath = 'products.json';
  private readonly outputDirectory = 'products-category';
  private productListFile = 'json/products-list.json';
  private tempListFile = 'json/temp-additional-products-list.json';
  private mergeAdditionalProductListFileWithContent =
    'json/additional-products-list-with-content.json';

  private scrapedData: any[] = []; // In-memory array to store results
  private async initBrowser() {
    return await puppeteer.launch({ headless: true });
  }

  constructor(
    @InjectRepository(ScraperData)
    private scrapperDataRepository: Repository<ScraperData>,

    @InjectRepository(AdditionalData)
    private additionalScrapperDataRepository: Repository<AdditionalData>,

    @InjectRepository(InternalContent)
    private internalContentRepository: Repository<InternalContent>,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not defined in the environment variables.',
      );
    }

    this.openai = new OpenAI({ apiKey });

    this.ensureFileExists();
  }

  async onModuleInit() {
    // this.logger.log('Starting scraper service...');
    // await this.startScraping();
    // this.logger.log('Retrying failed products...');
    // await this.retryFailedLinks();
    // this.logger.log('Retrying failed products for all compact text');
    // await this.retryFailedLinksForCompactText();
    // this.logger.log('Retrying failed products for all content');
    // await this.retryFailedLinksForAllContent();
    // this.logger.log('Retrying failed products for all body');
    // await this.retryFailedLinksForBody();
  }

  async scapeToJsonFile(): Promise<void> {
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

      // const ifRecordExist = await this.getScraperRecordByUrl(url);

      // if (!ifRecordExist) {
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

        await this.saveProductData(productData);

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
    // }
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

  private async saveProductData(
    productData: Record<string, any>,
  ): Promise<Record<string, any>[]> {
    try {
      let existingProducts: Record<string, any>[] = [];
      try {
        const fileData = await fs.readFile(this.filePath, 'utf-8');
        existingProducts = JSON.parse(fileData);
      } catch {
        this.logger.warn('No existing JSON file found, starting fresh.');
      }

      const allProducts = mergeAndDeduplicate(existingProducts, [productData]);

      await fs.writeFile(this.filePath, JSON.stringify(allProducts, null, 2));
      return allProducts;
    } catch (error) {
      this.logger.error('Error saving product data:', error.message);
      throw error;
    }
  }

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
        // const ifRecordExist = await this.getScraperRecordByUrl(url);
        // if (!ifRecordExist) {
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
          await this.saveProductData(productData);
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
        // }
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
        // const ifRecordExist = await this.getScraperRecordByUrl(url);

        // if (!ifRecordExist) {
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
          await this.saveProductData(productData);
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
        // }
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

  public async scapeToDataBase(): Promise<boolean> {
    try {
      const fileData = await fs.readFile(this.filePath, 'utf-8');
      const jsonData = JSON.parse(fileData);

      for (const [index, productData] of jsonData.entries()) {
        const { productUrl } = productData;
        this.logger.log(
          `Processing ${index + 1}/${jsonData.length} to database`,
        );

        const ifRecordExist = await this.getScraperRecordByUrl(productUrl);

        if (!ifRecordExist) {
          await this.saveScraperData(productData);
          this.logger.log(`Saved successfully to database`);
        } else {
          this.logger.log(`Record already exists`);
        }
      }

      this.logger.log(`Saved all data to database`);

      return true;
    } catch {
      this.logger.warn('No existing JSON file found, starting fresh.');
      return false;
    }
  }

  async scrapeSupportProductsDataLinks(): Promise<void> {
    this.scrapedData = [];
    const categories = await this.scrapeCategories();

    for (const category of categories) {
      const { categoryName, categoryLink: link } = category;
      console.log(`Scrapping products of category: ${categoryName}`);

      try {
        let products = await this.scrapeProductsForCategory(
          link,
          '#prodByAlpha li a',
        );

        if (!products.length) {
          products = await this.scrapeProductsForCategory(
            link,
            'section ul li a',
          );

          if (!products.length) {
            products = await this.scrapeProductsForCategory(
              link,
              '.cat-container ul li a',
            );
          }

          if (!products.length) {
            products = await this.scrapeProductsForCategory(
              link,
              '.tech-container ul li a',
            );
          }
        }

        // Attach products to the category
        category.products = products;

        // Save the processed category to the file immediately
        this.addCategoryToFile(category);
      } catch (error) {
        this.logger.log(
          `Error processing category: ${categoryName} : ${error?.message}`,
        );
      }
    }

    await this.writeDataToFile();
    this.logger.log('All categories processed.');
  }
  async scrapeCategories(): Promise<any[]> {
    let browser;
    try {
      browser = await this.initBrowser();
      const page = await browser.newPage();
      const url = `${this.baseURL}/c/en/us/support/all-products.html`;

      await page.goto(url, { waitUntil: 'networkidle2' });

      const categories = await page.evaluate(() => {
        const categoryList: any[] = [];
        const categoryElements = document.querySelectorAll(
          '#productCategories table',
        );

        categoryElements.forEach((categoryElement) => {
          const links = categoryElement.querySelectorAll('li a');
          links.forEach((link) => {
            const categoryName = link.textContent?.trim();
            const categoryLink = link.getAttribute('href');
            if (categoryName && categoryLink) {
              categoryList.push({
                categoryName,
                categoryLink: `https:${categoryLink}`,
              });
            }
          });
        });

        return categoryList;
      });

      return categories;
    } catch (error) {
      this.logger.error('Error scraping categories', error?.message);

      return [];
    } finally {
      if (browser) await browser.close();
    }
  }

  async scrapeProductsForCategory(
    categoryLink: string,
    selector: string,
  ): Promise<any[]> {
    let browser;
    try {
      browser = await this.initBrowser();
      const page = await browser.newPage();
      await page.goto(categoryLink, { waitUntil: 'networkidle2' });

      // Wait for the selector to appear
      await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});

      const products = await page.evaluate(
        (selector, baseUrl) => {
          const productList: any[] = [];
          const productElements = document.querySelectorAll(selector);
          function sanitizeUrl(url: string): string | null {
            if (!url) return null;

            // If URL starts with 'www', prepend 'https://'
            if (url.startsWith('//www')) {
              return `https:${url}`;
            }

            // Handle URLs already starting with base URL
            if (url.startsWith(baseUrl)) {
              // Remove duplicate base URLs
              const occurrences =
                url.match(new RegExp(baseUrl, 'g'))?.length || 0;
              if (occurrences > 1) {
                return baseUrl + url.split(baseUrl).pop();
              }
              return url; // Already valid
            }

            // Handle relative URLs
            if (url.startsWith('/')) {
              return baseUrl + url;
            }

            // Handle malformed URLs
            if (url.startsWith('http')) {
              return url; // Valid absolute URL
            }

            return null; // Invalid URL
          }

          for (const product of productElements) {
            const productName = product.textContent?.trim();
            const productLink = product.getAttribute('href');
            const sanitizedLink = sanitizeUrl(productLink);

            if (productName && sanitizedLink) {
              productList.push({
                productName: productName,
                productLink: sanitizedLink,
              });
            }
          }

          return productList;
        },
        selector,
        this.baseURL,
      );

      if (products?.length) {
        for (const product of products) {
          let internalLinks = await this.scrapeInternalLinksForProduct(
            product.productLink,
            this.baseURL,
            '#actual-document-listings ul li a',
          );

          if (!internalLinks.length) {
            internalLinks = await this.scrapeInternalLinksForProduct(
              product.productLink,
              this.baseURL,
              '.dmc-list-dynamic ul li a',
            );
          }
          product.internalLinks = internalLinks; // Assign internal links to each product
        }
      }

      return products;
    } catch (error) {
      this.logger.error(
        `Error scraping products for category link: ${categoryLink} with selector: ${selector}: ${error?.message}`,
      );

      return [];
    } finally {
      if (browser) await browser.close();
    }
  }

  // Function to scrape internal links for a given product
  async scrapeInternalLinksForProduct(
    productLink: string,
    baseUrl: string,
    selector: string,
  ): Promise<any[]> {
    let browser;
    try {
      browser = await this.initBrowser();
      const page = await browser.newPage();
      await page.goto(productLink, { waitUntil: 'networkidle2' });

      // Wait for the selector to appear
      await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});

      const internalLinks = await page.evaluate(
        (selector, baseUrl) => {
          const internalLinksList: any[] = [];
          const linkElements = document.querySelectorAll(selector);

          function sanitizeUrl(url: string): string | null {
            if (!url) return null;

            // Handle relative URLs
            if (url.startsWith('/')) {
              return baseUrl + url;
            }

            // Handle malformed URLs
            if (url.startsWith('http')) {
              return url; // Valid absolute URL
            }

            return null; // Invalid URL
          }

          linkElements.forEach((linkElement) => {
            const linkName = linkElement.textContent?.trim();

            const internalLink = linkElement.getAttribute('href');

            const sanitizedLink = sanitizeUrl(internalLink);

            if (sanitizedLink) {
              internalLinksList.push({
                name: linkName,
                link: sanitizedLink,
              });
            }
          });
          return internalLinksList;
        },
        selector,
        baseUrl,
      );

      // // Dynamic selectors list
      // const selectors = ['.WordSection1', '#eot-doc-wrapper'];

      // // Scrape content from each link
      // for (const link of internalLinks) {
      //   if (link.link) {
      //     link.content = await scrapeWordSectionContent(link.link, selectors);
      //   }
      // }

      return internalLinks;
    } catch (error) {
      this.logger.error(
        `Error scraping internal links for product: ${productLink} :${error?.message},`,
      );

      return [];
    } finally {
      if (browser) await browser.close();
    }
  }

  addCategoryToFile(category: any): void {
    const isDuplicate = this.scrapedData.some(
      (existing) => existing.categoryLink === category.categoryLink,
    );

    if (!isDuplicate) {
      this.scrapedData.push(category);
      this.logger.log(`Added category: ${category.categoryName}`);
    } else {
      this.logger.log(`Skipped duplicate category: ${category.categoryName}`);
    }
  }

  async writeDataToFile(): Promise<void> {
    try {
      await fs.writeFile(
        'json/additional-products-list.json',
        JSON.stringify(this.scrapedData, null, 2),
        'utf8',
      );

      const products = await mergeAllProducts({ data: this.scrapedData });
      await fs.writeFile(
        this.productListFile,
        JSON.stringify(products, null, 2),
        'utf8',
      );
    } catch (error) {
      this.logger.error(`Error writing data to file:  ${error?.message},`);
    }
  }

  async ensureFileExists() {
    try {
      await fs.access(this.productListFile);
      const fileContent = await fs.readFile(this.productListFile, 'utf8');
      this.scrapedData = JSON.parse(fileContent || '[]');
    } catch {
      this.scrapedData = [];
      await fs.writeFile(
        this.productListFile,
        JSON.stringify(this.scrapedData, null, 2),
        'utf8',
      );
    }
  }

  async mergeAllProducts() {
    const jsonFilePath = 'json/additional-products-list.json';
    const rawData = await fs.readFile(jsonFilePath, 'utf-8');
    const products = JSON.parse(rawData);

    const data = await mergeAllProducts({ data: products });

    return data;
  }

  // Service to process products and store scraped data

  async scrapeProductsContent() {
    const jsonFilePath = this.productListFile;
    const outputDirectory = this.outputDirectory;
    const selectors = ['.WordSection1', '#eot-doc-wrapper'];
    const maxProductsPerFile = 15;

    // Ensure output directory exists
    try {
      await simpleFS.promises.mkdir(outputDirectory, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create directory: ${error.message}`);
      return;
    }

    // Read raw product list
    let rawData;
    try {
      rawData = await simpleFS.promises.readFile(jsonFilePath, 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to read product list file: ${error.message}`);

      return;
    }

    const products = JSON.parse(rawData);

    // Group products by categoryName
    const categories = products.reduce((acc, product) => {
      if (!acc[product.categoryName]) {
        acc[product.categoryName] = [];
      }
      acc[product.categoryName].push(product);
      return acc;
    }, {});

    // Process each category
    for (const [categoryName, categoryProducts] of Object.entries(categories)) {
      const sanitizedCategoryName = sanitizeFileName(categoryName);
      const processedLinks = new Set();
      let currentFileIndex = 1;
      let productCountInCurrentFile = 0;
      let outputFilePath = path.join(
        outputDirectory,
        `${sanitizedCategoryName}_${currentFileIndex}.json`,
      );

      // Load existing files and track processed products
      while (true) {
        try {
          const currentContent = await simpleFS.promises.readFile(
            outputFilePath,
            'utf-8',
          );
          const parsedProducts = JSON.parse(currentContent);
          parsedProducts.forEach((product) => processedLinks.add(product.link));
          productCountInCurrentFile = parsedProducts.length;

          // If the current file is full, move to the next file
          if (productCountInCurrentFile >= maxProductsPerFile) {
            currentFileIndex++;
            outputFilePath = path.join(
              outputDirectory,
              `${sanitizedCategoryName}_${currentFileIndex}.json`,
            );
          } else {
            break; // Found the file where new products can be added
          }
        } catch (error) {
          // Stop searching if file doesn't exist
          if (error.code === 'ENOENT') break;
          this.logger.error(
            `Error reading file "${outputFilePath}": ${error.message}`,
          );

          return;
        }
      }

      // Append each product
      for (const product of categoryProducts as any) {
        if (processedLinks.has(product.link)) continue;

        // Scrape content for the product
        if (product?.internalLinks?.length) {
          for (const internalLink of product.internalLinks) {
            const { link } = internalLink;
            if (link) {
              const content = await scrapeWordSectionContent(link, selectors);
              internalLink.content = content || null;
            }
          }
        }

        try {
          // Load current file content
          let currentContent = '[]';
          try {
            currentContent = await simpleFS.promises.readFile(
              outputFilePath,
              'utf-8',
            );
            currentContent = currentContent.trim();
          } catch (error) {
            if (error.code !== 'ENOENT') {
              this.logger.error(
                `Error reading file "${outputFilePath}": ${error.message}`,
              );
              return;
            }
          }

          // Remove the trailing `]` to append a new product
          currentContent = currentContent.endsWith(']')
            ? currentContent.slice(0, -1)
            : currentContent;
          const prefix = currentContent.length > 1 ? ',\n' : '';
          const productData = prefix + JSON.stringify(product, null, 2) + ']';

          // Write back the updated JSON
          await simpleFS.promises.writeFile(
            outputFilePath,
            currentContent + productData,
            'utf8',
          );
          this.logger.log(
            `Product "${product.name}" saved to "${outputFilePath}".`,
          );

          processedLinks.add(product.link);
          productCountInCurrentFile++;
        } catch (error) {
          console.error(`Error appending product: ${error.message}`);
        }

        // If current file reaches 5 products, move to the next file
        if (productCountInCurrentFile >= maxProductsPerFile) {
          currentFileIndex++;
          productCountInCurrentFile = 0;
          outputFilePath = path.join(
            outputDirectory,
            `${sanitizedCategoryName}_${currentFileIndex}.json`,
          );
          try {
            await simpleFS.promises.writeFile(outputFilePath, '[]', 'utf8'); // Initialize the new file
          } catch (error) {
            console.error(`Error creating new file: ${error.message}`);
          }
        }
      }
    }
  }

  public async additionalScrapeProductsToDataBase(): Promise<boolean> {
    try {
      const fileData = await fs.readFile(
        this.mergeAdditionalProductListFileWithContent,
        'utf-8',
      );
      const jsonData = JSON.parse(fileData);

      for (const [index, productData] of jsonData.entries()) {
        const { link } = productData;

        this.logger.log(
          `Processing ${index + 1}/${jsonData.length} to database`,
        );

        const ifRecordExist = await this.getAdditionalScraperRecordByUrl(link);

        if (!ifRecordExist) {
          await this.saveAdditionalScraperData(productData);
          this.logger.log(`Saved successfully to database`);
        } else {
          this.logger.log(`Record already exists`);
        }
      }

      this.logger.log(`Saved all data to database`);

      return true;
    } catch {
      this.logger.warn('No existing JSON file found, starting fresh.');
      return false;
    }
  }

  public async getAdditionalScraperRecordByUrl(
    url: string,
  ): Promise<AdditionalData | null> {
    try {
      // Use findOneBy for a direct condition
      const record = await this.additionalScrapperDataRepository.findOneBy({
        url,
      });

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

  public async saveAdditionalScraperData(
    productData: Record<string, any>,
  ): Promise<AdditionalData> {
    try {
      // Step 1: Flatten and prepare text
      const textContent = `${productData.name}\n${productData.link}\n${productData.categoryName}\n${productData.categoryLink}`;

      // Step 2: Build vocabulary (static or dynamic per use case)
      // const vocabulary = buildVocabulary([textContent]); // You can save and reuse this for consistency

      // Step 3: Generate vector
      // const vector = vectorize(textContent, vocabulary);

      // Step 4: Save data to database
      const scraperData = this.additionalScrapperDataRepository.create({
        url: productData.link,
        // content: textContent,
        // vector,
        jsonData: textContent,
        productName: productData?.name || '',
      });
      return await this.additionalScrapperDataRepository.save(scraperData);
    } catch (error) {
      this.logger.warn('Error saving scraper data:', error?.message);
      throw error;
    }
  }
  public async scrapeContentBasedOnUrl(link: string): Promise<string | null> {
    try {
      const selectors = ['.WordSection1', '#eot-doc-wrapper'];
      if (link) {
        const content = await scrapeWordSectionContent(link, selectors);
        return content;
      }
      return null;
    } catch (error) {
      this.logger.warn('Error scraper data:', error?.message);
      return null;
    }
  }

  async readJsonFilesAndSave() {
    const folderPath = path.join(process.cwd(), this.outputDirectory);

    try {
      const files = simpleFS.readdirSync(folderPath);

      for (const file of files) {
        if (path.extname(file) === '.json') {
          const filePath = path.join(folderPath, file);
          const data = simpleFS.readFileSync(filePath, 'utf8');
          const jsonData = JSON.parse(data);

          if (Array.isArray(jsonData)) {
            for (const item of jsonData) {
              const productRecord = await this.saveAdditionalScraperData(item);

              if (item.internalLinks && Array.isArray(item.internalLinks)) {
                for (const contentData of item.internalLinks) {
                  if (contentData.content) {
                    // Create and save entry in pivot table
                    await this.internalContentRepository.save({
                      scraperDataId: productRecord.id,
                      internalContent: contentData,
                    });
                  }
                }
              }
            }
          }
        }
      }
      this.logger.log(`All JSON files processed successfully.`);
    } catch (error) {
      console.error('Error processing JSON files:', error);
    }
  }

  async getProductDataBaseOnName(name) {
    try {
      const trimmedName = name.trim();
      const productData = await this.scrapperDataRepository.find({
        where: {
          productName: ILike(`%${trimmedName}%`),
        },
      });

      const additionalData = await this.additionalScrapperDataRepository.find({
        where: {
          productName: ILike(`%${trimmedName}%`),
        },
        relations: ['internalContents'],
      });

      // Combine data based on `productName`
      const mergedData = [];

      for (const product of productData) {
        const matchingAdditionalData = additionalData.find(
          (additional) => additional.productName === product.productName,
        );

        mergedData.push({
          ...product,
          additionalData: matchingAdditionalData || null, // Attach matching additional data if found
        });
      }

      // Optionally add remaining `additionalData` entries that didn't match
      const unmatchedAdditionalData = additionalData.filter(
        (additional) =>
          !productData.some(
            (product) => product.productName === additional.productName,
          ),
      );

      unmatchedAdditionalData.forEach((additional) => {
        mergedData.push({
          ...additional,
          additionalData: null,
        });
      });

      return mergedData;
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return [];
    }
  }
}
