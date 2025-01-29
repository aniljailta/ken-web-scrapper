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
import { filterContentData, scrapeInternalSection } from './utils';
import { AI_RESPONSE_PROMPT, findSectionDetailsTool } from './constants';
import { UsersService } from 'src/users/users.service';

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

    private readonly userService: UsersService,
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

  async testLink(link: string) {
    const { content, pidData } = await scrapeInternalSection(link);

    return {
      content,
      pidData,
      // paragraphsData,
    };
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
                productRecord?.id
              ) {
                for (const link of item.internalLinks) {
                  const contentData = filterContentData(link.contentData);

                  if (contentData) {
                    try {
                      const data = this.internalContentDataRepository.create({
                        productDataId: productRecord.id,
                        name: link.name || '',
                        link: link.link || '',
                        ...contentData,
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
      this.logger.error('Error processing JSON files:', error?.message);
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

      await this.internalContentDataRepository.delete({ productDataId: id });
      if (response) {
        return { id };
      } else {
        return false;
      }
    } catch (error) {
      this.logger.warn('Error updating scraper data:', error?.message);
      return false;
    }
  }

  async queryProduct(userQuery: string, password: string) {
    if (!password || !userQuery) {
      return {
        data: 'Bad request!',
        isAIResponse: false,
      };
    }
    const decodedPassword = Buffer.from(password, 'hex').toString('utf8');

    if (decodedPassword !== this.chatBotQueryPassword) {
      return {
        data: 'Invalid Password!',
        isAIResponse: false,
      };
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: userQuery,
        },
      ],
      tools: findSectionDetailsTool as any,
      temperature: 0.6,
    });

    // this.logger.log(`The user is Asking "${userQuery}"`);
    if (response.choices[0].message.tool_calls) {
      const functionCall = response.choices[0].message.tool_calls[0].function;

      if (functionCall.name === 'fetch_section_details') {
        const parsedArguments = JSON.parse(functionCall.arguments);
        if (parsedArguments.product) {
          return await this.queryByName({
            name: parsedArguments.product,
            queries: parsedArguments.queries,
            userQuery: userQuery,
          });
        }
      }
    } else {
      return await this.queryByName({ name: userQuery, userQuery: userQuery });
    }
  }

  private async queryByName({
    name,
    queries,
    userQuery,
  }: {
    name: string;
    queries?: any[];
    userQuery: string;
  }) {
    try {
      const result = await this.getProductData(name);
      const queriesData = [
        'Status',
        'name',
        'link',
        ...(queries && queries.map((i) => i.replace(/\s+/g, '_'))),
      ];

      const filteredData = result.map((product: Product) => {
        // Ensure additionalInfo is an object
        const filteredAdditionalInfo = Object.fromEntries(
          Object.entries(product?.jsonData?.info || {}).filter(([key]) =>
            queriesData.includes(key),
          ),
        );
        // Ensure internalLinks is an array
        const filteredInternalLinks = (product.internalContents || [])
          .map((link) => {
            return Object.fromEntries(
              Object.entries(link).filter(([key]) => queriesData.includes(key)),
            );
          })
          .filter((link) => {
            // Check if there are any meaningful fields other than `name` and `link`
            const hasAdditionalFields = Object.entries(link).some(
              ([key, value]) =>
                !['name', 'link', 'id', 'productDataId'].includes(key) && // Exclude specific keys
                value && // Ensure the value exists
                (typeof value !== 'object' ||
                  value.text ||
                  value.tables?.length), // Check for valid content in objects
            );

            // Include the link only if it has additional fields
            return hasAdditionalFields;
          });

        const includeProductIds = queries.some((query) =>
          ['part numbers', 'Pids', 'id', 'product numbers'].includes(query),
        );

        return {
          productName: product.productName,
          link: product.url,
          additionalInfo: filteredAdditionalInfo,
          internalLinks: filteredInternalLinks,
          ...(includeProductIds && { productIds: product.productIds || [] }),
        };
      });

      const data = filteredData.slice(0, 5);

      if (!data.length) {
        return {
          data: 'No Relevant Product Found!',
          isAIResponse: false,
        };
      }

      try {
        const response = await this.getAiResponseBaseOnQuestion({
          productData: data,
          userQuery,
        });

        return {
          data: response,
          isAIResponse: true,
        };
      } catch (error) {
        // Handle the specific AI error code
        if (error.code === 'context_length_exceeded') {
          let sliceIndex = 1;
          while (sliceIndex <= data.length) {
            try {
              const reducedData = data
                .map((i) => {
                  return {
                    productName: i.productName,
                    link: i.link,
                    additionalInfo: i.additionalInfo,
                  };
                })
                .slice(0, sliceIndex);

              const retryResponse = await this.getAiResponseBaseOnQuestion({
                productData: reducedData,
                userQuery,
              });

              return {
                data: retryResponse,
                isAIResponse: true,
              };
            } catch (retryError) {
              if (retryError.code !== 'context_length_exceeded') {
                break; // Exit loop if the error is not related to token length
              }
            }

            sliceIndex++; // Increase slice size to retry with fewer tokens
          }
        }

        // Fallback to returning the raw product data if retries fail
        return {
          data: data,
          isAIResponse: false,
        };
      }
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return {
        data: 'Error fetching product',
        isAIResponse: false,
      };
    }
  }

  async getAiResponseBaseOnQuestion({
    userQuery,
    productData,
  }: {
    userQuery: string;
    productData: any;
  }): Promise<string> {
    const data = await this.userService.findUserValueByName('ai_prompt');
    const aiPrompt = data?.text || AI_RESPONSE_PROMPT;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: aiPrompt,
        },
        {
          role: 'user',
          content: `Here is the JSON data you need to process:
          ${JSON.stringify(productData, null, 2)}`,
        },
        {
          role: 'user',
          content: `User asked: ${userQuery}`,
        },
      ],
    });

    return response.choices[0].message.content;
  }

  async getProductData(name: string): Promise<any> {
    try {
      const wordsToRemove = [
        'Catalyst',
        'Series',
        'Cisco',
        'Switches',
        'Nexus',
        'IE',
      ];
      const regexPattern = new RegExp(wordsToRemove.join('|'), 'gi');

      const trimmedName = name.replace(regexPattern, '').trim();

      // Start building the query
      const queryBuilder = this.productDataRepository
        .createQueryBuilder('data')
        .leftJoinAndSelect('data.internalContents', 'internalContents')
        .where(
          'data.productName ILIKE :productName OR data.productName ILIKE :partialName1',
          {
            productName: `%${trimmedName}%`,
            partialName1: `%${trimmedName.split(' ')[0]}%`,
          },
        );
      // Add the 'orWhere' condition only if trimmedName contains a hyphen
      if (trimmedName.includes('-')) {
        queryBuilder.orWhere(
          `EXISTS (
          SELECT 1 
          FROM jsonb_array_elements_text(data.productIds) AS elem 
          WHERE elem ILIKE :trimmedNamePattern
        )`,
          {
            trimmedNamePattern: `%${trimmedName}%`,
          },
        );
      }

      // Fetch support data
      const supportData = await queryBuilder.getMany();

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
