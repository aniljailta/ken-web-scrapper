import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs/promises';

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  // private readonly testLinksFilePath = 'test-links.json';
  // private readonly linksFilePath = 'links.json';
  private readonly filePath = 'products.json';
  // private readonly allContentFilePath = 'all-products-content.json';
  private readonly failedProductPath = 'failed_list_product.json';

  async onModuleInit() {
    this.logger.log('Starting scraper service...');
    await this.startScraping();

    // this.logger.log('Retrying failed products...');
    // await this.retryFailedLinks();

    // this.logger.log('Retrying failed products for all content');
    // await this.retryFailedLinksForAllContent();

    // await this.startScrapingAllContent();
  }

  async processLinks(
    page: puppeteer.Page,
    links: { productName: string; productUrl: string }[],
    config: Record<string, any>,
    isRetry: boolean = false,
  ): Promise<void> {
    for (const [index, link] of links.entries()) {
      const { productUrl: url, productName } = link;

      this.logger.log(
        `Processing ${index + 1}/${links.length}: ${url} ${
          isRetry ? '(Retry Mode)' : ''
        }`,
      );

      try {
        await page.goto(url, { waitUntil: 'load', timeout: 0 });

        const productData = await this.extractProductData(
          page,
          url,
          productName,
          config,
          isRetry,
        );

        // const dataSheetContent = await this.extractDataSheetContent(page);

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
  }

  async startScraping() {
    this.logger.log('Starting the scraping process...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    try {
      const allProductLinkURL =
        'https://www.cisco.com/c/en/us/products/a-to-z-series-index.html';
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
        overview: {
          container: '.cds-c-detailblock__benefits-wrap .cmp-accordion',
          fields: {
            title: '.cmp-accordion__item .cmp-accordion__title',
            content: '.cmp-accordion__item .cmp-text p',
          },
        },
      };
      await this.processLinks(page, links, config);
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

      const retryConfig = {
        preTitle: '#fw-pagetitle',
        title: '.info-content h2',
        subtitle: '.compact .large compact',
        description: '.info-content .info-description',
        benefits: {
          container: '#benefits .row.quarters .col.quarter',
          fields: {
            title: '.rte-txt h3',
            description: '.rte-txt p',
          },
        },
        dataModal: {
          modal: '#models .rte-txt',
          fields: {
            title: 'h3',
            content: 'li',
          },
        },
      };

      await this.processLinks(page, failedLinks, retryConfig, true);

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

  private async extractProductData(
    page: puppeteer.Page,
    url: string,
    text: string,
    config: any,
    isRetry: boolean = false,
  ): Promise<Record<string, any>> {
    const productData = await page.evaluate(
      (config, isRetry) => {
        const extractText = (selector, context = document) => {
          try {
            return Array.from(context.querySelectorAll(selector))
              .map((el) => el.textContent?.trim() || '')
              .filter(Boolean); // Remove empty strings
          } catch {
            return [];
          }
        };

        const data: Record<string, any> = {};

        // Extract single fields as strings
        for (const [key, selector] of Object.entries(config)) {
          if (typeof selector === 'string') {
            const elements = extractText(selector);
            data[key] =
              elements.length === 1 ? elements[0] : elements.join(' '); // Always a string
          }
        }

        // Extract structured fields (e.g., benefits, modals)
        if (config.benefits) {
          if (isRetry) {
            const benefitElements = document.querySelectorAll(
              config.benefits.container || null,
            );
            if (benefitElements?.length === 0) {
              console.warn(
                `No benefit elements found for: ${config.benefits.container}`,
              );
            } else {
              data.benefits = Array.from(benefitElements).map((benefit) => ({
                title:
                  benefit
                    ?.querySelector(config.benefits.fields.title)
                    ?.textContent.trim() || null,
                description:
                  benefit
                    ?.querySelector(config.benefits.fields.description)
                    ?.textContent.trim() || null,
              }));
            }
          } else {
            data.benefits = Array.from(
              document.querySelectorAll(config.benefits.container),
            ).map((container) => {
              const benefitData: Record<string, string> = {};
              for (const [field, fieldSelector] of Object.entries(
                config.benefits.fields,
              )) {
                const values = extractText(fieldSelector, container as any);
                benefitData[field] =
                  values.length === 1 ? values[0] : values.join(' ') || null;
              }
              return benefitData;
            });
          }
        }

        if (config.dataModal) {
          if (isRetry) {
            const modalElement = document.querySelector(
              config.dataModal.modal || '',
            );

            if (!modalElement) {
              console.warn(
                `Modal element not found for: ${config.dataModal.modal}`,
              );
            } else {
              data.modal = {
                title:
                  modalElement
                    ?.querySelector(config.dataModal.fields.title)
                    ?.textContent.trim() || null,
                content: Array.from(
                  modalElement?.querySelectorAll(
                    config.dataModal.fields.content,
                  ),
                ).map((item: any) => item.textContent.trim() || null),
              };
            }
          } else {
            data.dataModals = Array.from(
              document.querySelectorAll(config.dataModal.modal),
            )
              .map((button) => {
                const title =
                  button.getAttribute('aria-label') ||
                  button.textContent?.trim() ||
                  '';
                const panel = document.querySelector(
                  `#${button.getAttribute('aria-controls')}`,
                );
                if (!panel) return null;

                const content = Array.from(
                  panel.querySelectorAll(config.dataModal.fields.content),
                )
                  .map((el) => el.textContent?.trim() || '')
                  .join(' '); // Combine content as a single string
                return { title, content };
              })
              .filter(Boolean);
          }
        }

        if (config.overview) {
          const accordionItems = document.querySelectorAll(
            `${config.overview.container} .cmp-accordion__item`,
          );

          if (!accordionItems || accordionItems.length === 0) {
            console.warn(
              `No accordion items found for: ${config.overview.container}`,
            );
          } else {
            data.overview = Array.from(accordionItems).map((item) => ({
              title:
                item
                  ?.querySelector(config.overview.fields.title)
                  ?.textContent.trim() || null,
              content:
                item
                  ?.querySelector(config.overview.fields.content)
                  ?.textContent.trim() || null,
            }));
          }
        }

        return data;
      },
      config,
      isRetry,
    );

    // Add URL and link text to the extracted data
    productData.productUrl = url;
    productData.linkText = text;

    // Ensure single fields are strings
    ['preTitle', 'title', 'subtitle', 'description'].forEach((key) => {
      if (Array.isArray(productData[key])) {
        productData[key] = productData[key].join(' ').trim() || null;
      }
    });

    return productData;
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

      const allProducts = this.mergeAndDeduplicate(existingProducts, [
        productData,
      ]);

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
      this.logger.log(`Removed successfully processed product: ${url}`);
    } catch (error) {
      this.logger.error(
        `Error removing failed product (${url}):`,
        error.message,
      );
    }
  }

  // Merge and remove duplicates based on the 'productUrl' field
  private mergeAndDeduplicate(
    existingProducts: any[],
    newProducts: any[],
  ): any[] {
    const productMap = new Map();

    // Add existing products to the map, keyed by productUrl
    existingProducts.forEach((product) => {
      productMap.set(product.productUrl, product);
    });

    // Add new products to the map, keyed by productUrl (this prevents duplicates)
    newProducts.forEach((product) => {
      // If a product with the same productUrl exists, skip it; otherwise, add it
      if (!productMap.has(product.productUrl)) {
        productMap.set(product.productUrl, product);
      }
    });

    // Convert the map back to an array
    return Array.from(productMap.values());
  }

  async retryFailedLinksForAllContent() {
    try {
      const linksFileData = await fs.readFile(this.failedProductPath, 'utf-8');

      const productLinks = JSON.parse(linksFileData);

      if (productLinks?.length === 0) {
        this.logger.log('No failed links to retry.');
        return;
      }
      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      for (const [index, link] of productLinks.entries()) {
        const { productUrl: url, productName } = link;

        this.logger.log(
          `Processing ${index + 1}/${productLinks.length}: ${url} `,
        );
        const possibleSelectors = ['#fw-content', '#fw-c-content'];
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 5000 });

          let foundSelector = null;
          let content = null;

          // Attempt to find content using possible selectors
          for (const selector of possibleSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 5000 });
              foundSelector = selector;
              break;
            } catch (error) {
              this.logger.warn(
                `Selector ${selector} not found. ` || error.message,
              );
            }
          }

          if (foundSelector) {
            // Extract content from the found selector
            content = await page.evaluate((className) => {
              const container = document.querySelector(className);
              return container ? container.innerText : '';
            }, foundSelector);
          } else {
            // Fall back to scraping the entire body if no selector is found
            this.logger.warn(
              `No matching selector found. Falling back to full page body.`,
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
      }
      this.logger.log('All content Scraping completed successfully');
    } catch (error) {
      this.logger.error('Error during scraping:', error.message);
    } finally {
      this.logger.log('Browser closed');
    }
  }

  async extractDataSheetContent(page) {
    // Static configurations
    const linkSelector = 'a'; // Selector to identify links
    const partialText = 'sheet'; // Text to include for partial match
    const contentSelector = '#fw-content'; // Target container for content

    // Find the data sheet link
    const dataSheetLink = await page.evaluate(
      (selector, text) => {
        const links = Array.from(document.querySelectorAll(selector));
        const matchingLink = links.find((link) =>
          link.textContent.trim().toLowerCase().includes(text.toLowerCase()),
        );
        return matchingLink ? matchingLink.href : null;
      },
      linkSelector,
      partialText,
    );

    if (dataSheetLink) {
      try {
        await page.goto(dataSheetLink, {
          waitUntil: 'networkidle2',
          timeout: 1000,
        });

        // Try to extract content from #fw-content
        const content = await page.evaluate((selector) => {
          const container = document.querySelector(selector);
          return container ? container.innerText.trim() : null;
        }, contentSelector);

        // If #fw-content is not found, scrape the entire body
        if (!content) {
          console.warn(
            `#fw-content not found. Scraping entire body as fallback.`,
          );
          const fallbackContent = await page.evaluate(() => {
            return document.body.innerText.trim();
          });
          return fallbackContent || null;
        }

        return content || null;
      } catch (error) {
        console.error(`Failed to fetch Data Sheet content: ${error.message}`);
        return null;
      }
    } else {
      console.warn('No Data Sheet link found on the page.');
      return null;
    }
  }

  // async startScrapingAllContent() {
  //   try {
  //     const linksFileData = await fs.readFile(this.testLinksFilePath, 'utf-8');

  //     const productLinks = JSON.parse(linksFileData);
  //     const scrapedData = [];

  //     for (let i = 0; i < productLinks.length; i++) {
  //       this.logger.log('Launching Puppeteer...');
  //       const browser = await puppeteer.launch();
  //       const page = await browser.newPage();

  //       try {
  //         const url = productLinks[i].href;
  //         console.log(`Processing URL: ${url}`);

  //         const possibleSelectors = ['#fw-content', '#fw-c-content'];

  //         // Navigate to the URL
  //         await page.goto(url, { waitUntil: 'networkidle2', timeout: 50000 });

  //         let foundSelector = null;

  //         for (const selector of possibleSelectors) {
  //           try {
  //             // Wait for the selector if it exists on the page
  //             await page.waitForSelector(selector, { timeout: 50000 });
  //             foundSelector = selector;
  //             break;
  //           } catch (error) {
  //             console.log(error || 'Class not found.');
  //           }
  //         }

  //         console.log(`ClassName : ${foundSelector}`);

  //         if (foundSelector) {
  //           // Extract content from the first matching container
  //           const content = await page.evaluate((className) => {
  //             const container = document.querySelector(className);
  //             return container ? container.innerText : '';
  //           }, foundSelector);

  //           const config = {
  //             title: productLinks[i].text,
  //             link: url,
  //             content: content,
  //           };

  //           scrapedData.push(config);
  //         } else {
  //           console.error('No matching container class found on the page.');
  //         }

  //         // Prepare the scraped data
  //       } catch (error) {
  //         console.error(
  //           `Error scraping ${productLinks[i]?.href}:`,
  //           error.message,
  //         );
  //       } finally {
  //         await browser.close();
  //         this.logger.log('Browser closed');
  //       }
  //     }

  //     // Read and parse existing data
  //     let existingProductsData = [];
  //     try {
  //       const existingData = await fs.readFile(
  //         this.allContentFilePath,
  //         'utf-8',
  //       );
  //       existingProductsData = JSON.parse(existingData || '[]');
  //     } catch (error) {
  //       console.log(
  //         error ||
  //           'File is empty or invalid JSON. Initializing with an empty array.',
  //       );
  //       existingProductsData = [];
  //     }

  //     // Merge and remove duplicates
  //     const updatedData = [
  //       ...existingProductsData,
  //       ...scrapedData.filter(
  //         (item) => !existingProductsData.some((e) => e.link === item.link),
  //       ),
  //     ];

  //     // Write to the file
  //     await fs.writeFile(
  //       this.allContentFilePath,
  //       JSON.stringify(updatedData, null, 2),
  //     );

  //     console.log('Scraping completed successfully.');
  //   } catch (error) {
  //     this.logger.error('Error during scraping:', error.message);
  //   } finally {
  //     this.logger.log('Browser closed');
  //   }
  // }

  // private async loadProductLinks(): Promise<{ href: string; text: string }[]> {
  //   try {
  //     const linksFileData = await fs.readFile(this.linksFilePath, 'utf-8');
  //     return JSON.parse(linksFileData);
  //   } catch (error) {
  //     this.logger.error('Error reading links file:', error.message);
  //     throw error;
  //   }
  // }
}
