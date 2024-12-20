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
  mergeAllProducts,
  mergeAndDeduplicate,
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

@Injectable()
export class ScraperService implements OnModuleInit {
  private openai: OpenAI;
  private baseURL = 'https://www.cisco.com';
  private readonly logger = new Logger(ScraperService.name);
  private readonly failedProductPath = 'failed_list_product.json';
  private readonly filePath = 'products.json';

  private productListFile = 'json/products-list.json';
  private mergeAdditionalProductListFile = 'json/additional-products-list.json';
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

  async scrapeData(): Promise<void> {
    const categories = await this.scrapeCategories();

    for (const category of categories) {
      const { categoryName, link } = category;

      try {
        // First, try scraping products with the primary selector
        let products = await this.scrapeProductsForCategory(
          link,
          '#prodByAlpha li a',
        );

        // If no products found, fallback to a broader selector
        if (!products.length) {
          console.warn(
            `No products found using #prodByAlpha for ${categoryName}, falling back to section ul li a`,
          );
          products = await this.scrapeProductsForCategory(
            link,
            'section ul li a',
          );

          if (!products.length) {
            console.warn(
              `No products found using second method , falling to cat-container ul li`,
            );
            products = await this.scrapeProductsForCategory(
              link,
              '.cat-container ul li a',
            );
          }

          if (!products.length) {
            console.warn(
              `No products found using second method , falling to tech-container ul li`,
            );
            products = await this.scrapeProductsForCategory(
              link,
              '.tech-container ul li a',
            );
          }
        }

        // Attach products to the category
        category.products = products;

        // Save the category
        this.addCategoryToFile(category);
      } catch (error) {
        console.error(`Error processing category: ${categoryName}`, error);
      }
    }
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
                link: `https:${categoryLink}`,
              });
            }
          });
        });

        return categoryList;
      });

      return categories;
    } catch (error) {
      console.error('Error scraping categories', error);
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
      await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {
        console.warn(`Selector not found: ${selector}`);
      });

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
                name: productName,
                link: sanitizedLink,
              });
            }
          }

          return productList;
        },
        selector,
        'https://www.cisco.com',
      );

      if (products?.length) {
        for (const product of products) {
          let internalLinks = await this.scrapeInternalLinksForProduct(
            product.link,
            'https://www.cisco.com',
            '#actual-document-listings ul li a',
          );

          if (!internalLinks.length) {
            console.warn(
              `No internalLinks found using second method , falling to tech-container ul li`,
            );
            internalLinks = await this.scrapeInternalLinksForProduct(
              product.link,
              'https://www.cisco.com',
              '.dmc-list-dynamic ul li a',
            );
          }

          product.internalLinks = internalLinks; // Assign internal links to each product
        }
      }

      return products;
    } catch (error) {
      console.error(
        `Error scraping products for category link: ${categoryLink} with selector: ${selector}`,
        error,
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
    console.log({ productLink });
    try {
      browser = await this.initBrowser();
      const page = await browser.newPage();
      await page.goto(productLink, { waitUntil: 'networkidle2' });

      // Wait for the selector to appear
      await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {
        console.warn(`Selector not found: ${selector}`);
      });

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
      console.error(
        `Error scraping internal links for product: ${productLink}`,
        error,
      );
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }

  addCategoryToFile(category: any): void {
    const isDuplicate = this.scrapedData.some(
      (existing) => existing.link === category.link,
    );

    if (!isDuplicate) {
      this.scrapedData.push(category);
      this.writeDataToFile();
      console.log(`Added category: ${category.categoryName}`);
    } else {
      console.log(`Skipped duplicate category: ${category.categoryName}`);
    }
  }

  async writeDataToFile(): Promise<void> {
    try {
      await fs.writeFile(
        this.productListFile,
        JSON.stringify(this.scrapedData, null, 2),
        'utf8',
      );
    } catch (error) {
      console.error('Error writing data to file', error);
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
    const data = await mergeAllProducts({
      readFile: this.productListFile,
      writeFile: this.mergeAdditionalProductListFile,
    });

    return data;
  }

  // Service to process products and store scraped data
  async scrapeProductsContent() {
    // const jsonFilePath = this.mergeAdditionalProductListFile;
    const jsonFilePath = this.tempListFile;
    const outputFilePath = this.mergeAdditionalProductListFileWithContent;
    const selectors = ['.WordSection1', '#eot-doc-wrapper'];
    const rawData = await fs.readFile(jsonFilePath, 'utf-8');
    const products = JSON.parse(rawData);

    for (const product of products) {
      for (const internalLink of product.internalLinks) {
        const { link } = internalLink;

        console.log(`Processing link: ${link}`);
        const content = await scrapeWordSectionContent(link, selectors);

        internalLink.content = content || null; // Store plain text content
      }

      await fs.writeFile(outputFilePath, JSON.stringify(products, null, 2));
      console.log(`Product "${product.name}" updated and saved.`);
    }
  }
  catch(error) {
    console.error('Error processing products:', error);
  }
}
