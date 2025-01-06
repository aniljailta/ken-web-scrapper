import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScraperData } from './entities/scraper_data.entity';
import { mergeAllProducts } from './utils';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class ECommerceService {
  private baseURL = 'https://www.cisco.com';
  private readonly logger = new Logger(ECommerceService.name);

  private productListFile = 'json/products-list.json';
  private mergeAdditionalProductListFileWithContent =
    'json/additional-products-list-with-content.json';

  private async initBrowser() {
    return await puppeteer.launch({ headless: true });
  }

  constructor(
    @InjectRepository(ScraperData)
    private scrapperDataRepository: Repository<ScraperData>,

    private readonly configService: ConfigService,
  ) {}

  async matchString(): Promise<any> {
    try {
      const productData = fs.readFileSync(
        'json/additional-products-list.json',
        'utf8',
      );

      const productList = JSON.parse(productData || '[]');

      const products = await mergeAllProducts({ data: productList });

      return products;
    } catch (error) {
      return { error: error.message };
    }
  }

  async scrapeProductDataOfInsightFile(): Promise<any> {
    try {
      const listData = await fs.readFileSync(
        'json/insite_product_list.json',
        'utf8',
      );
      const a = JSON.parse(listData || '[]');

      const dataList = a.products.map((product: any) => {
        return {
          availability: product.availability,
          description: product.description,
          manufacturerImage: product.manufacturerImage,
          insightPrice: product.insightPrice,
          listPrice: product.listPrice,
          longDescription: product.longDescription,
          manufacturerPartNumber: product.manufacturerPartNumber,
          materialId: product.materialId,
          sku: product.sku,
        };
      });

      fs.writeFileSync(
        'json/insight_product_list.json',
        JSON.stringify(dataList, null, 2),
      );

      return a.products;
    } catch (error) {
      return { error: error.message };
    }
  }

  async scrapeProductDataOfORMWebsite(): Promise<any> {
    const baseURL = 'https://www.ormsystems.com/shop/cisco?page=';
    const totalPages = 368; // Total number of pages
    const productsFile = 'json/orm-products.json'; // Path to your JSON file
    const products = [];

    // Check if the file exists, if not create it
    if (!fs.existsSync(productsFile)) {
      fs.writeFileSync(productsFile, '[]', 'utf8'); // Create an empty JSON array
    }

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        const pageURL = `${baseURL}${currentPage}`;
        try {
          // Navigate to the current page
          await page.goto(pageURL, {
            waitUntil: 'networkidle2',
            timeout: 5000,
          });

          // Wait for the product grid to load
          await page.waitForSelector('.product-info-grid', { timeout: 10000 });

          // Extract product data from the current page
          const pageProducts = await page.evaluate(() => {
            const productElements =
              document.querySelectorAll('.product-info-grid');
            return Array.from(productElements).map((product) => {
              const productName = product
                .querySelector('.product-name')
                ?.textContent?.trim();
              const pId = product
                .querySelector('.product-sku')
                ?.textContent?.trim();

              return {
                description: productName,
                sku: pId,
              };
            });
          });

          // Add current page products to the total products array
          products.push(...pageProducts);

          // Write scraped products page by page
          const currentFileData = JSON.parse(
            fs.readFileSync(productsFile, 'utf8'),
          );
          currentFileData.push(...pageProducts);
          fs.writeFileSync(
            productsFile,
            JSON.stringify(currentFileData, null, 2),
          );
        } catch (pageError) {
          this.logger.warn(
            `Error scraping Page ${currentPage}: ${pageError.message}`,
          );
        }
      }

      this.logger.log('Scraping completed successfully form ORM website');
    } catch (error) {
      console.error('Error during scraping:', error);
    } finally {
      await browser.close();
    }
  }
}
