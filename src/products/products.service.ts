import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Product } from './entities/product.entity';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import {
  sanitizeFileName,
  cleanHtml,
  refineTable,
  extractAndStorePIds,
} from 'src/scraper/utils';
import { sectionTitles } from './constants';
import { SupportProductInternalContent } from './entities/internal_content.entity';

@Injectable()
export class ProductsService {
  private openai: OpenAI;
  private chatBotQueryPassword: string;
  private readonly logger = new Logger(ProductsService.name);
  private readonly outputDirectory = 'products-category-content';
  private productListFile = 'json/products-list.json';

  constructor(
    @InjectRepository(Product)
    private productDataRepository: Repository<Product>,

    @InjectRepository(SupportProductInternalContent)
    private internalContentDataRepository: Repository<SupportProductInternalContent>,

    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    const chatBotQueryPassword =
      this.configService.get<string>('QUERY_PASSWORD');

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not defined in the environment variables.',
      );
    }

    this.openai = new OpenAI({ apiKey });

    this.chatBotQueryPassword = chatBotQueryPassword;
  }

  async scrapeProductsContent() {
    const jsonFilePath = this.productListFile;
    const outputDirectory = this.outputDirectory;
    // const selectors = ['.WordSection1', '#eot-doc-wrapper'];
    const maxProductsPerFile = 40;

    // Ensure output directory exists
    try {
      await fs.promises.mkdir(outputDirectory, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create directory: ${error.message}`);
      return;
    }

    // Read raw product list
    let rawData;
    try {
      rawData = await fs.promises.readFile(jsonFilePath, 'utf-8');
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
          const currentContent = await fs.promises.readFile(
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
            // if (link) {
            //   const content = await scrapeWordSectionContent(link, selectors);
            //   internalLink.content = content || null;
            // }

            // if (link.endsWith('.html')) {
            //   const content = await extractPIDsFromLinks(link);
            //   internalLink.pIds = content || null;
            // }

            // Extract Software Section
            const contentData = await this.scrapeInternalSection(link);
            internalLink.contentData = contentData;
          }
          product.internalLinks = product.internalLinks.filter(
            (link) => link.contentData,
          );
        }

        try {
          // Load current file content
          let currentContent = '[]';
          try {
            currentContent = await fs.promises.readFile(
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
          await fs.promises.writeFile(
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
            await fs.promises.writeFile(outputFilePath, '[]', 'utf8'); // Initialize the new file
          } catch (error) {
            console.error(`Error creating new file: ${error.message}`);
          }
        }
      }
    }
  }

  async scrapeInternalSection(
    link: string,
  ): Promise<Record<string, { text: string; tables: string[] }>> {
    let browser: puppeteer.Browser | null = null;
    const initialTimeout = 20000; // Initial timeout in milliseconds
    const extendedTimeout = 50000; // Extended timeout in milliseconds

    const scrapeData = async (timeout: number) => {
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();

        await page.goto(link, { waitUntil: 'domcontentloaded', timeout });

        // Collect all <p> elements and their text
        const paragraphsData = await page.evaluate(() => {
          const paragraphs = Array.from(document.querySelectorAll('p'));
          return paragraphs.map((p) => ({
            className: p.className,
            text: p.textContent?.trim() || '',
            id: p.id || null,
          }));
        });

        const results: Record<string, { text: string; tables: string[] }> = {};

        for (const title of sectionTitles) {
          const targetParagraph = paragraphsData.find(
            (p) =>
              new RegExp(`\\b${title.replace(/\s+/g, '\\s*')}\\b`, 'i').test(
                p.text.toLowerCase(),
              ) &&
              (p.className.includes('pSubhead2CMT') ||
                p.className.includes('pSubhead1CMT') ||
                p.className.includes('pToC_Subhead1')),
          );

          if (targetParagraph) {
            const sectionHTML = await page.evaluate((startText) => {
              const extractContentUntilBoundary = (
                startElement: HTMLElement,
              ): string => {
                let fullHTML = '';
                let current = startElement.nextElementSibling;

                while (current) {
                  const id = current.getAttribute('id');
                  const classList = Array.from(current.classList);

                  // Stop if we encounter a boundary element
                  if (
                    (current.tagName.toLowerCase() === 'p' ||
                      current.tagName.toLowerCase() === 'div') &&
                    (id ||
                      classList.includes('pToC_Subhead1') ||
                      classList.includes('pSubhead2CMT') ||
                      classList.includes('pSubhead1CMT'))
                  ) {
                    break;
                  }

                  fullHTML += current.outerHTML + '\n';
                  current = current.nextElementSibling;
                }

                return fullHTML.trim();
              };

              // Find the starting element
              const paragraphs = Array.from(
                document.querySelectorAll(
                  'p.pSubhead2CMT, p.pSubhead1CMT, p.pToC_Subhead1, div',
                ),
              );
              for (const p of paragraphs) {
                if (p.textContent?.trim() === startText) {
                  return extractContentUntilBoundary(p as HTMLElement);
                }
              }

              return null;
            }, targetParagraph.text);
            if (sectionHTML) {
              const processContent = (
                html: string,
              ): { text: string; tables: string[] } => {
                const container = document.createElement('div');
                container.innerHTML = html;

                const tables: string[] = [];
                const tableElements = container.querySelectorAll('table');

                tableElements.forEach((table) => {
                  tables.push(table?.outerHTML);
                  table.remove();
                });

                const text = container.textContent?.trim() || '';
                return { text, tables };
              };

              const pageSectionData = await page.evaluate(
                processContent,
                sectionHTML,
              );

              const sectionText = cleanHtml(pageSectionData.text);
              const sectionTables = pageSectionData.tables.map((table) =>
                refineTable(table),
              );

              const formattedKey = title.toLowerCase().replace(/\s+/g, '_');
              results[formattedKey] = {
                text: sectionText,
                tables: sectionTables,
              };
            }
          }
        }

        return Object.keys(results).length > 0 ? results : null;
      } catch (error) {
        console.error('Error scraping sections:', error.message);
        return null;
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    };

    try {
      // Attempt with initial timeout
      return await scrapeData(initialTimeout);
    } catch (error) {
      if (error?.message?.includes('Navigation timeout')) {
        console.warn(
          `Navigation timeout with ${initialTimeout}ms exceeded. Retrying with ${extendedTimeout}ms...`,
        );
        try {
          // Retry with extended timeout
          return await scrapeData(extendedTimeout);
        } catch (retryError) {
          console.error(
            'Error during retry with extended timeout:',
            retryError.message,
          );
          return null;
        }
      } else {
        console.error(
          'Unexpected error during scraping process:',
          error.message,
        );
        return null;
      }
    }
  }

  async readJsonFilesAndSave() {
    const folderPath = path.join(process.cwd(), this.outputDirectory);

    try {
      const files = fs.readdirSync(folderPath);

      for (const file of files) {
        if (path.extname(file) === '.json') {
          const filePath = path.join(folderPath, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const jsonData = JSON.parse(data);

          if (Array.isArray(jsonData)) {
            for (const item of jsonData) {
              const ifRecordExist = await this.productDataRepository.findOneBy({
                url: item.link,
              });
              const productData = extractAndStorePIds(item);

              let productRecord = null;
              if (!ifRecordExist) {
                productRecord = await this.saveSupportProductData(productData);
              } else {
                productRecord = await this.updateSupportProductData(
                  productData,
                  ifRecordExist.id,
                );
              }

              if (
                item.internalLinks &&
                Array.isArray(item.internalLinks) &&
                productRecord.id
              ) {
                for (const link of item.internalLinks) {
                  if (link.contentData) {
                    try {
                      const data = this.internalContentDataRepository.create({
                        productDataId: productRecord.id,
                        name: link.name || '',
                        link: link.link || '',
                        ...link.contentData,
                      });

                      await this.internalContentDataRepository.save(data);
                    } catch (error) {
                      this.logger.error(
                        `Error storing data in pivot table: ${error.message}`,
                      );
                    }
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

  public async saveSupportProductData(
    productData: Record<string, any>,
  ): Promise<Product> {
    try {
      const data = { ...productData };
      delete data?.internalLinks; // Remove internal links before saving
      // Step 1: Flatten and prepare text
      const textContent = data;

      const productIds = data?.info?.pIds || [];

      delete textContent?.info?.pIds; // Remove internal links before saving
      // Step 2: Build vocabulary (static or dynamic per use case)
      // const vocabulary = buildVocabulary([textContent]); // You can save and reuse this for consistency

      // Step 3: Generate vector
      // const vector = vectorize(textContent, vocabulary);
      // console.log({ productIds });
      // Step 4: Save data to database
      const scraperData = this.productDataRepository.create({
        url: data.link,
        // content: textContent,
        // vector,
        productIds: productIds,
        jsonData: textContent,
        productName: data?.name || '',
      });
      return await this.productDataRepository.save(scraperData);
    } catch (error) {
      this.logger.warn('Error saving scraper data:', error?.message);
      throw error;
    }
  }

  public async updateSupportProductData(
    productData: Record<string, any>,
    id: number,
  ) {
    try {
      const data = { ...productData };
      delete data?.internalLinks; // Remove internal links before saving

      const textContent = data;

      const productIds = data?.info?.pIds || [];

      delete textContent?.info?.pIds; // Remove internal links before saving

      const response = await this.productDataRepository.update(id, {
        url: data.link,
        productIds: productIds,
        jsonData: textContent,
        productName: data?.name || '',
      });

      await this.internalContentDataRepository.delete({ id });

      return response;
    } catch (error) {
      this.logger.warn('Error updating scraper data:', error?.message);
      return false;
    }
  }
}

// async scrapeInternalSection(
//   link: string,
// ): Promise<Record<string, string | null>> {
//   const sectionTitles = [
//     // 'software',
//     // 'overview',
//     // 'introduction',
//     // 'power supply',
//     // 'intelligent',
//     // 'warranty',
//     // 'licensing',
//     // 'stacking',
//     // 'highlights',
//     'platform',
//     'status',
//     'features',
//     'specifications',
//     'ordering',
//     'configurations',
//     'part numbers',
//     'milestones',
//   ];
//   let browser: puppeteer.Browser | null = null;
//   const initialTimeout = 20000; // Initial timeout in milliseconds
//   const extendedTimeout = 50000; // Extended timeout in milliseconds

//   const scrapeData = async (timeout: number) => {
//     try {
//       browser = await puppeteer.launch({
//         headless: true,
//         args: ['--no-sandbox', '--disable-setuid-sandbox'],
//       });
//       const page = await browser.newPage();

//       await page.goto(link, { waitUntil: 'domcontentloaded', timeout });

//       // Collect all <p> elements and their text
//       const paragraphsData = await page.evaluate(() => {
//         const paragraphs = Array.from(document.querySelectorAll('p'));
//         return paragraphs.map((p) => ({
//           className: p.className,
//           text: p.textContent?.trim(),
//           id: p.id || null,
//         }));
//       });

//       const results: Record<string, string | null> = {};

//       for (const title of sectionTitles) {
//         const targetParagraph = paragraphsData.find(
//           (p) =>
//             new RegExp(`\\b${title.replace(/\s+/g, '\\s*')}\\b`, 'i').test(
//               p.text?.toLowerCase() || '',
//             ) &&
//             (p.className.includes('pSubhead2CMT') ||
//               p.className.includes('pSubhead1CMT') ||
//               p.className.includes('pToC_Subhead1')),
//         );

//         if (targetParagraph) {
//           const sectionContent = await page.evaluate((startText) => {
//             const extractContentUntilBoundary = (
//               startElement: HTMLElement,
//             ): string => {
//               let content = '';
//               let current = startElement.nextElementSibling;

//               while (current) {
//                 const id = current.getAttribute('id');
//                 const classList = Array.from(current.classList);

//                 if (
//                   current.tagName.toLowerCase() === 'p' &&
//                   (id ||
//                     classList.includes('pToC_Subhead1') ||
//                     classList.includes('pSubhead2CMT') ||
//                     classList.includes('pSubhead1CMT'))
//                 ) {
//                   break;
//                 }

//                 if (current.tagName.toLowerCase() === 'table') {
//                   // Add the table as HTML
//                   content += current.outerHTML + '\n';
//                 } else {
//                   // Add text content of other elements
//                   content += current.textContent + '\n';
//                 }
//                 current = current.nextElementSibling;
//               }

//               return content.trim();
//             };

//             const paragraphs = Array.from(
//               document.querySelectorAll('p.pSubhead2CMT'),
//             );
//             for (const p of paragraphs) {
//               if (p.textContent?.trim() === startText) {
//                 return extractContentUntilBoundary(p as any);
//               }
//             }

//             const secondParagraphs = Array.from(
//               document.querySelectorAll('p.pSubhead1CMT'),
//             );
//             for (const p of secondParagraphs) {
//               if (p.textContent?.trim() === startText) {
//                 return extractContentUntilBoundary(p as any);
//               }
//             }

//             return null;
//           }, targetParagraph.text);

//           if (sectionContent) {
//             const formattedKey = title.toLowerCase().replace(/\s+/g, '_');
//             results[formattedKey] = cleanHtml(sectionContent);
//           }
//         }
//       }

//       return results;
//     } catch (error) {
//       console.error('Error scraping sections:', error.message);
//       return {};
//     } finally {
//       if (browser) {
//         await browser.close();
//       }
//     }
//   };

//   try {
//     // Attempt with initial timeout
//     return await scrapeData(initialTimeout);
//   } catch (error) {
//     if (error?.message?.includes('Navigation timeout')) {
//       console.warn(
//         `Navigation timeout with ${initialTimeout}ms exceeded. Retrying with ${extendedTimeout}ms...`,
//       );
//       try {
//         // Retry with extended timeout
//         return await scrapeData(extendedTimeout);
//       } catch (retryError) {
//         console.error(
//           'Error during retry with extended timeout:',
//           retryError.message,
//         );
//         return {};
//       }
//     } else {
//       console.error(
//         'Unexpected error during scraping process:',
//         error.message,
//       );
//       return {};
//     }
//   }
// }
