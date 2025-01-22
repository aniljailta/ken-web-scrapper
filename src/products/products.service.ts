import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Product } from './entities/product.entity';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { sanitizeFileName, extractAndStorePIds } from 'src/scraper/utils';
import { SupportProductInternalContent } from './entities/internal_content.entity';
import { scrapeInternalSection } from './utils';

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
    const maxProductsPerFile = 50;

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

            if (link.endsWith('.html')) {
              // const content = await extractPIDsFromLinks(link);
              // internalLink.pIds = content || null;
              const { content, pidData } = await scrapeInternalSection(link);

              internalLink.contentData = content;
              internalLink.pIds = pidData || null;
            }
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
      //  Flatten and prepare text
      const textContent = data;

      const productIds = data?.info?.pIds || [];

      delete textContent?.info?.pIds; // Remove internal links before saving

      //  Save data to database
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

  async queryProduct(query: string, password: string) {
    if (!password || !query) {
      return 'Bad request!';
    }
    const decodedPassword = Buffer.from(password, 'hex').toString('utf8');

    if (decodedPassword !== this.chatBotQueryPassword) {
      return 'Invalid Password!';
    }
    // const tools: any = [findDevToolFunction];
    // const response = await this.openai.chat.completions.create({
    //   model: 'gpt-3.5-turbo',
    //   messages: [
    //     {
    //       role: 'user',
    //       content: query,
    //     },
    //   ],
    //   tools,
    // });
    // this.logger.log(`The user is Asking "${query}"`);
    // if (response.choices[0].message.tool_calls) {
    //   const functionCall = response.choices[0].message.tool_calls[0].function;

    //   if (functionCall.name === 'fetch_sku_details') {
    //     const parsedArguments = JSON.parse(functionCall.arguments);
    //     if (parsedArguments.name) {
    //       return await this.queryByName(parsedArguments.name);
    //     }
    //   }
    // } else {
    return await this.queryByName(query);
    // }
  }

  private async queryByName(name: string) {
    const result = await this.getProductData(name);

    const data = result
      .map((i) => {
        return {
          productName: i.productName,
          link: i.url,
          additionalInfo: i.jsonData.info,
          internalLinks: i.internalContents,
          productData: i?.productData || [],
          productIds: i?.productIds.slice(0, 1000) || [],
        };
      })
      .slice(0, 2);

    if (!data.length) {
      return 'No Relevant Product Found!';
    }

    return data;
    // const response = await this.openai.chat.completions.create({
    //   model: 'gpt-3.5-turbo',
    //   messages: [
    //     {
    //       role: 'system',
    //       content: CHATGPT_RESPONSE_PROMPT,
    //     },
    //     {
    //       role: 'user',
    //       content: `Here is the JSON data you need to process:
    //   ${JSON.stringify(data, null, 2)}`,
    //     },
    //   ],
    // });

    // return response.choices[0].message.content;
  }

  async getProductData(name: string): Promise<any> {
    try {
      const trimmedName = name.trim();
      // Fetch support data
      const supportData = await this.productDataRepository
        .createQueryBuilder('data')
        .leftJoinAndSelect('data.internalContents', 'internalContents')
        .where('data.productName ILIKE :productName', {
          productName: `%${trimmedName}%`,
        })
        .orWhere(
          `EXISTS (
              SELECT 1 
              FROM jsonb_array_elements_text(data.productIds) AS elem 
              WHERE elem ILIKE :trimmedNamePattern
            )`,
          {
            trimmedNamePattern: `%${trimmedName}%`,
          },
        )
        .getMany();
      // Map over additionalData with asynchronous operations
      // const data = await Promise.all(
      //   supportData.map(async (item) => {
      //     // Fetch matching product data
      //     const productData = await this.scrapperDataRepository.find({
      //       where: {
      //         productName: ILike(`%${item.productName}%`),
      //       },
      //       select: ['jsonData', 'productName', 'createdAt', 'content', 'url'],
      //     });

      //     // Return the transformed object
      //     return {
      //       productName: item.productName,
      //       ...item, // Include all other properties of additionalItem
      //       productData: productData.length > 0 ? productData : null, // Include productData or null
      //     };
      //   }),
      // );

      return supportData;
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return [];
    }
  }
}
