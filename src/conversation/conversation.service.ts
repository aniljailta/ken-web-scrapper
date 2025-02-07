import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Repository } from 'typeorm';
import { ProductsService } from 'src/products/products.service';
import {
  AI_RESPONSE_PROMPT,
  findSectionDetailsTool,
} from 'src/products/constants';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class ConversationService {
  private openai: OpenAI;
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,

    @InjectRepository(Message)
    private messageRepo: Repository<Message>,

    private readonly productService: ProductsService,
    private readonly configService: ConfigService,
    private readonly userService: UsersService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not defined in the environment variables.',
      );
    }

    this.openai = new OpenAI({ apiKey });
  }

  async getOrCreateConversation({
    userId,
    conversationId,
    productName,
  }: {
    userId?: string;
    conversationId?: string;
    productName?: string;
  }) {
    let conversation: Conversation;

    if (userId && conversationId) {
      // Logged-in user: Find conversation by userId
      conversation = await this.conversationRepo.findOne({
        where: { userId, id: conversationId },
        relations: ['messages'],
      });
    } else if (conversationId) {
      // Guest user: Find conversation by conversationId
      conversation = await this.conversationRepo.findOne({
        where: { id: conversationId },
        relations: ['messages'],
      });
    }

    if (!conversation) {
      // Create a new conversation if none exists
      const data = this.conversationRepo.create({
        userId: userId || null,
        isGuest: !userId,
        productName,
      });

      conversation = await this.conversationRepo.save(data);
    }

    return conversation;
  }

  async saveMessage({
    message,
    conversationId,
    role,
  }: {
    message?: string;
    conversationId: string;
    role: 'user' | 'assistant';
  }) {
    if (conversationId) {
      // Create a new conversation if none exists
      const data = this.messageRepo.create({
        conversationId: conversationId,
        content: message,
        role,
      });

      return await this.messageRepo.save(data);
    }
    throw new Error('Message Not saved');
  }

  async newConversation({
    userQuery,
    userId,
  }: {
    userQuery: string;
    userId?: string | null;
  }): Promise<{ data: string; conversationId: string }> {
    try {
      const { productName, productAttributes } =
        await this.functionalToolCalling({ userQuery });

      if (!productName || typeof productName !== 'string') {
        return {
          data: 'Unable to identify a valid product from your query.',
          conversationId: '',
        };
      }

      const productList =
        await this.productService.getProductsByName(productName);

      const productData = await this.productService.filterProductData(
        productList,
        productAttributes,
      );

      const conversationData = await this.getOrCreateConversation({
        userId,
        productName: productData.length ? productName : '',
      });
      if (conversationData.id) {
        await this.saveMessage({
          conversationId: conversationData.id,
          message: userQuery,
          role: 'user',
        });
      }

      const aiResponse = await this.generateAiResponse({
        userQuery,
        productData,
      });

      if (conversationData.id) {
        await this.saveMessage({
          conversationId: conversationData.id,
          message: aiResponse,
          role: 'assistant',
        });
      }
      return {
        data: aiResponse,
        conversationId: conversationData.id,
      };
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return {
        data: this.handleQueryError(error, userQuery),
        conversationId: '',
      };
    }
  }

  async threadConversation({
    userQuery,
    userId,
    conversationId,
  }: {
    userQuery: string;
    userId?: string | null;
    conversationId: string;
  }): Promise<{ data: string; conversationId: string }> {
    try {
      const conversationRecord = await this.getOrCreateConversation({
        userId,
        conversationId,
      });

      const toolFunction = await this.functionalToolCalling({ userQuery });

      const productName =
        conversationRecord.productName ?? toolFunction.productName;

      const productList =
        await this.productService.getProductsByName(productName);

      const productData = await this.productService.filterProductData(
        productList,
        toolFunction.productAttributes,
      );

      if (conversationRecord.id) {
        await this.saveMessage({
          conversationId: conversationRecord.id,
          message: userQuery,
          role: 'user',
        });
      }

      const aiResponse = await this.generateAiResponse({
        userQuery,
        productData,
      });

      if (conversationRecord.id) {
        await this.saveMessage({
          conversationId: conversationRecord.id,
          message: aiResponse,
          role: 'assistant',
        });
      }
      return {
        data: aiResponse,
        conversationId: conversationRecord.id,
      };
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return {
        data: this.handleQueryError(error, userQuery),
        conversationId: conversationId,
      };
    }
  }

  async functionalToolCalling({ userQuery }: { userQuery: string }): Promise<{
    productName: string;
    productAttributes: string[];
  }> {
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
        const productName = parsedArguments.product?.trim() || '';

        return {
          productName: productName,
          productAttributes: parsedArguments.queries,
        };
      }
    }

    return {
      productName: '',
      productAttributes: [],
    };
  }

  async generateAiResponse({
    userQuery,
    productData,
  }: {
    userQuery: string;
    productData: any[];
  }): Promise<string> {
    if (!productData.length) {
      const fallbackResponse = await this.generateFallbackResponse(userQuery);

      return fallbackResponse;
    }

    try {
      const response = await this.getAiResponseBaseOnQuestion({
        productData: productData,
        userQuery,
      });

      return response;
    } catch (error) {
      this.logger.warn(`Warning: ${error?.message}`);
      this.logger.warn(`Warning CODE: ${error?.code}`);
      // Handle the specific AI error code
      if (
        error.code === 'context_length_exceeded' ||
        error.code === 'rate_limit_exceeded'
      ) {
        const reducedData = productData
          .map((i) => {
            delete i?.internalLinks;
            return {
              ...i,
            };
          })
          .slice(0, 1);

        try {
          const retryResponse = await this.getAiResponseBaseOnQuestion({
            productData: reducedData,
            userQuery,
          });

          return retryResponse;
        } catch (retryError) {
          if (retryError.code !== 'context_length_exceeded') {
            this.logger.warn('Error fetching AI:', error?.message);
          }
        }
      }

      // Fallback to returning the raw product data if retries fail
      return error?.message || 'You Ai token limit has exceeded';
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
          content: `Here is the data you need to process:
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

  async generateFallbackResponse(userQuery: string) {
    // Multiple fallback strategies
    try {
      // Strategy 1: Use OpenAI to generate a generic helpful response
      const aiGeneratedFallback = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that provides contextual guidance when a specific product query cannot be directly answered.',
          },
          {
            role: 'user',
            content: `Generate a helpful fallback response for the following query that cannot find a specific product: "${userQuery}". 
            The response should:
            - Acknowledge the query
            - Provide general guidance
            - Offer alternative ways to find information
            - Maintain a helpful and supportive tone`,
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      });

      const fallbackText = aiGeneratedFallback.choices[0].message.content;

      // Strategy 2: If AI generation fails, use a predefined fallback
      if (!fallbackText) {
        return this.getStaticFallbackResponse(userQuery);
      }

      return fallbackText;
    } catch {
      // Fallback to static response if AI generation fails
      return this.getStaticFallbackResponse(userQuery);
    }
  }

  private getStaticFallbackResponse(userQuery: string): string {
    const fallbackResponses = [
      `I couldn't find specific information about your query: "${userQuery}". Could you please provide more details?`,
      `Thank you for your query. I'm unable to find an exact match for "${userQuery}". Would you like to try a broader search or rephrase your question?`,
      `I apologize, but I couldn't locate the specific product or information you're looking for. Can you help me understand your request better?`,
      `It seems the details you're seeking aren't in our current database. Let me help you find the right information. Could you tell me more about what you're looking for?`,
    ];

    // Randomly select a fallback response for variety
    return fallbackResponses[
      Math.floor(Math.random() * fallbackResponses.length)
    ];
  }

  private handleQueryError(error: any, userQuery: string) {
    return this.getStaticFallbackResponse(userQuery);
  }

  async getConversationMessages({
    userId,
    conversationId,
  }: {
    userId: string;
    conversationId: string;
  }): Promise<Conversation | null> {
    try {
      const conversation = await this.conversationRepo.findOne({
        where: { userId, id: conversationId },
        relations: ['messages'],
      });
      return conversation;
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return null;
    }
  }

  async getAllConversationChat({
    userId,
  }: {
    userId: string;
  }): Promise<Conversation[]> {
    try {
      const conversation = await this.conversationRepo.find({
        where: { userId },
        relations: ['messages'],
      });
      return conversation;
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return [];
    }
  }
}
