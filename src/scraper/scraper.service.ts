import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs/promises';

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  private readonly linksFilePath = 'links.json';
  private readonly filePath = 'products.json';

  async onModuleInit() {
    this.logger.log('Starting scraper service...');
    await this.startScraping();
  }

  //   async startScraping() {
  //     this.logger.log('Launching Puppeteer...');
  //     const browser = await puppeteer.launch();
  //     const page = await browser.newPage();

  //     try {
  //       const url =
  //         'https://www.cisco.com/c/en/us/products/a-to-z-series-index.html';
  //       await page.goto(url, { waitUntil: 'load', timeout: 0 });

  //       this.logger.log('Extracting all links...');
  //       const links = await page.evaluate(() => {
  //         return Array.from(document.querySelectorAll('a')).map((anchor) => ({
  //           text: anchor.textContent?.trim() || '',
  //           href: anchor.href,
  //         }));
  //       });

  //       this.logger.log(`Found ${links.length} links on the page.`);

  //       // Load existing links from the JSON file
  //       let existingLinks = [];
  //       try {
  //         const fileData = await fs.readFile(this.filePath, 'utf-8');
  //         existingLinks = JSON.parse(fileData);
  //       } catch (error) {
  //         this.logger.warn(
  //           error || 'No existing JSON file found, creating a new one.',
  //         );
  //       }

  //       // Merge and deduplicate links
  //       const allLinks = this.mergeAndDeduplicate(existingLinks, links);

  //       // Save the updated links to the JSON file
  //       await fs.writeFile(this.filePath, JSON.stringify(allLinks, null, 2));
  //       this.logger.log(`Updated links saved to ${this.filePath}`);
  //     } catch (error) {
  //       this.logger.error('Error during scraping:', error.message);
  //     } finally {
  //       await browser.close();
  //       this.logger.log('Browser closed');
  //     }
  //   }

  //   // Merge and remove duplicates based on the 'href' field
  //   private mergeAndDeduplicate(existingLinks: any[], newLinks: any[]): any[] {
  //     const linkMap = new Map();

  //     // Add existing links to the map
  //     existingLinks.forEach((link) => {
  //       linkMap.set(link.href, link);
  //     });

  //     // Add new links to the map (overwriting duplicates)
  //     newLinks.forEach((link) => {
  //       linkMap.set(link.href, link);
  //     });

  //     // Convert the map back to an array
  //     return Array.from(linkMap.values());
  //   }

  async startScraping() {
    this.logger.log('Launching Puppeteer...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    try {
      const linksFileData = await fs.readFile(this.linksFilePath, 'utf-8');

      const productLinks = JSON.parse(linksFileData);

      for (let i = 0; i < productLinks.length; i++) {
        // Simulate async operation with await
        console.log(`Processed item ${productLinks[i].href}`);

        const productTitle = productLinks[i].text;
        const url = productLinks[i].href;

        await page.goto(url, { waitUntil: 'load', timeout: 0 });

        const config = {
          preTitle: '.cds-c-hero .cmp-teaser__pretitle',
          title: '.cds-c-hero .cmp-teaser__title',
          subtitle: '.cds-c-hero .cmp-teaser__description p',
          description: '.cds-c-detailblock__description p',
          benefits: {
            container: '.cds-c-detailblock__benefits-wrap .cds-c-cards',
            fields: {
              title: '.cds-c-cards__wrapper .cmp-teaser__title',
              description: '.cds-c-cards__wrapper .cmp-teaser__description p',
            },
          },
          dataModal: {
            modal:
              '.cmp-accordion__desktop-button-wrapper .cmp-accordion__desktop-button',
            fields: {
              title: '.cmp-accordion__item .cmp-teaser__title',
              content: '.cmp-accordion__item .cmp-teaser__description',
            },
          },
        };

        this.logger.log('Extracting product data...');
        const productData = await page.evaluate((config) => {
          const extractText = (selector, context = document) => {
            try {
              return Array.from(context.querySelectorAll(selector)).map(
                (el) => el.textContent?.trim() || '',
              );
            } catch (err) {
              console.error(`Invalid selector: ${selector} ${err}`);
              return [];
            }
          };

          const data: Record<string, any> = {};

          // Extract single fields
          for (const [key, selector] of Object.entries(config)) {
            if (typeof selector === 'string') {
              const elements = extractText(selector);
              data[key] = elements.length === 1 ? elements[0] : elements;
            }
          }

          // Extract benefits array
          if (config.benefits) {
            const benefits = Array.from(
              document.querySelectorAll(config.benefits.container),
            ).map((benefitElement) => {
              const benefitData: Record<string, string> = {};
              for (const [field, fieldSelector] of Object.entries(
                config.benefits.fields,
              )) {
                const fieldValue = extractText(
                  fieldSelector,
                  benefitElement as any,
                );
                benefitData[field] =
                  fieldValue.length === 1 ? fieldValue[0] : fieldValue;
              }
              return benefitData;
            });
            data['benefits'] = benefits;
          }

          if (config.dataModal) {
            const dataModals: Array<Record<string, any>> = [];

            const buttons = document.querySelectorAll(
              '.cmp-accordion__desktop-button',
            );

            buttons.forEach((button: any) => {
              const title =
                button.getAttribute('aria-label') || button.innerText.trim();
              const controls = button.getAttribute('aria-controls');

              if (!controls) return;

              const panel = document.querySelector(`#${controls}`);
              if (!panel) return;

              const content = Array.from(
                panel.querySelectorAll('.cds-c-cards'),
              ).map((card: any) => {
                const cardTitle =
                  card.querySelector('.cmp-teaser__title')?.innerText.trim() ||
                  '';
                const cardDescription =
                  card
                    .querySelector('.cmp-teaser__description p')
                    ?.innerText.trim() || '';
                return {
                  title: cardTitle,
                  content: cardDescription,
                };
              });

              dataModals.push({
                title,
                content,
              });
            });
            data['dataModals'] = dataModals;
          }

          return data;
        }, config);

        // Load existing products from the JSON file
        let existingProducts = [];
        try {
          const fileData = await fs.readFile(this.filePath, 'utf-8');
          existingProducts = JSON.parse(fileData);
        } catch (error) {
          this.logger.warn(
            error || 'No existing JSON file found, creating a new one.',
          );
        }

        // productData['productTitle'] = productTitle;
        // productData['productUrl'] = url;

        // Merge and deduplicate products based on title
        const allProducts = this.mergeAndDeduplicate(existingProducts, [
          productData,
        ]);

        // Save the updated products to the JSON file
        await fs.writeFile(this.filePath, JSON.stringify(allProducts, null, 2));
      }
    } catch (error) {
      this.logger.error('Error during scraping:', error.message);
    } finally {
      await browser.close();
      this.logger.log('Browser closed');
    }
  }

  // Merge and remove duplicates based on the 'title' field
  private mergeAndDeduplicate(
    existingProducts: any[],
    newProducts: any[],
  ): any[] {
    const productMap = new Map();

    // Add existing products to the map, keyed by title
    existingProducts.forEach((product) => {
      productMap.set(product.title, product);
    });

    // Add new products to the map, keyed by title (this prevents duplicates)
    newProducts.forEach((product) => {
      // If a product with the same title exists, skip it; otherwise, add it
      if (!productMap.has(product.title)) {
        productMap.set(product.title, product);
      }
    });

    // Convert the map back to an array
    return Array.from(productMap.values());
  }
}
