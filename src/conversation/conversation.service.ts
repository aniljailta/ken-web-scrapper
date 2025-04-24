import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Repository } from 'typeorm';
import { ProductsService } from 'src/products/products.service';
import {
  ADMIN_USER_VALUES,
  AI_RESPONSE_PROMPT,
  findSectionDetailsTool,
} from 'src/products/constants';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';
import { MixpanelService } from 'src/mixpanel/mixpanel.service';
import { SocketGateway } from 'src/gateways/socket.gateway';
import { encoding_for_model } from 'tiktoken';

@Injectable()
export class ConversationService {
  private openai: OpenAI;
  private readonly logger = new Logger(ConversationService.name);
  private openaiModal: string;
  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,

    @InjectRepository(Message)
    private messageRepo: Repository<Message>,

    private readonly productService: ProductsService,
    private readonly configService: ConfigService,
    private readonly userService: UsersService,
    private readonly gatewayService: SocketGateway,
    private readonly mixpanelService: MixpanelService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not defined in the environment variables.',
      );
    }

    this.openai = new OpenAI({ apiKey });

    this.openaiModal =
      this.configService.get<string>('AI_ASSISTANT_MODAL') || 'gpt-3.5-turbo';
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
    guestToken,
  }: {
    userQuery: string;
    userId?: string | null;
    guestToken?: string | null;
  }): Promise<{ data: string; conversationId: string }> {
    try {
      let aiResponse;
      const functionCallResponse = await this.functionalToolCalling({
        userQuery,
        messages: [],
      });
      let productData = [];
      let productName = '';

      if (typeof functionCallResponse !== 'string') {
        const productAttributes = functionCallResponse.productAttributes;
        productName = functionCallResponse.productName;

        const productList =
          await this.productService.getProductsByName(productName);

        productData = await this.productService.filterProductData(
          productList,
          productAttributes,
        );
      } else {
        aiResponse = functionCallResponse;
      }

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

      if (!aiResponse) {
        aiResponse = await this.generateAiResponse({
          userQuery,
          productData,
          userId,
          token: guestToken,
        });
      }

      if (conversationData.id) {
        await this.saveMessage({
          conversationId: conversationData.id,
          message: aiResponse,
          role: 'assistant',
        });
      }
      return {
        data: aiResponse,
        conversationId: conversationData.id || '',
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
    guestToken,
  }: {
    userQuery: string;
    userId?: string | null;
    conversationId: string;
    guestToken?: string | null;
  }): Promise<{ data: string; messageId?: string; conversationId: string }> {
    try {
      const conversationRecord = await this.getOrCreateConversation({
        userId,
        conversationId,
      });
      let productData;
      let aiResponse;

      const toolFunction = await this.functionalToolCalling({
        userQuery,
        messages: conversationRecord?.messages || [],
      });

      if (typeof toolFunction !== 'string') {
        const toolProductName = toolFunction.productName;
        const conversationProductName =
          conversationRecord?.productName?.trim() || '';

        // Check if toolProductName is valid (not empty and not "C1-C2720X-24PS-L")
        const isValidToolProduct =
          toolProductName && toolProductName !== 'C1-C2720X-24PS-L';

        // Set productName from toolProductName if valid, otherwise use conversationProductName
        const productName = isValidToolProduct
          ? toolProductName
          : conversationProductName;

        // Check if we need to update conversationRecord.productName
        if (isValidToolProduct && conversationRecord) {
          this.updateProductName({ conversationRecord, toolProductName });
        }

        const productList =
          await this.productService.getProductsByName(productName);

        productData = await this.productService.filterProductData(
          productList,
          toolFunction.productAttributes,
        );
      } else {
        aiResponse = toolFunction;
      }
      if (conversationRecord.id) {
        await this.saveMessage({
          conversationId: conversationRecord.id,
          message: userQuery,
          role: 'user',
        });
      }
      if (!aiResponse) {
        aiResponse = await this.generateAiResponse({
          userQuery,
          productData,
          messageData: conversationRecord.messages,
          userId,
          token: guestToken,
        });
      }

      const responseData = {
        data: aiResponse,
        conversationId: conversationRecord.id,
      };

      if (conversationRecord.id) {
        const messageData = await this.saveMessage({
          conversationId: conversationRecord.id,
          message: aiResponse,
          role: 'assistant',
        });
        return {
          ...responseData,
          messageId: messageData.id,
        };
      } else {
        return responseData;
      }
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return {
        data: this.handleQueryError(error, userQuery),
        conversationId: conversationId,
      };
    }
  }

  async functionalToolCalling({
    userQuery,
    messages,
  }: {
    userQuery: string;
    messages: Message[];
  }): Promise<
    | {
        productName: string;
        productAttributes: string[];
      }
    | string
  > {
    const userDefineAIModal = await this.userService.findUserValueByName(
      ADMIN_USER_VALUES.GPT_MODAL,
    );

    const openAiModal = userDefineAIModal?.text || this.openaiModal;
    const mappedPreviousChats = messages.map(({ content, role }) => ({
      role,
      content,
    }));
    const response = await this.openai.chat.completions.create({
      model: openAiModal,
      messages: [
        {
          role: 'system',
          content:
            "Always identify the full product name, e.g., 'Cisco 9500' or 'Nexus 9500', and avoid using generic labels like '9500'.",
        },
        ...mappedPreviousChats,
        {
          role: 'user',
          content: userQuery,
        },
      ],
      tools: findSectionDetailsTool as any,
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
    } else {
      const responseContent = response.choices[0].message.content;
      return responseContent;
    }
  }

  async generateAiResponse({
    userQuery,
    productData,
    messageData,
    userId,
    token,
  }: {
    userQuery: string;
    productData: any[];
    messageData?: Message[];
    userId?: string | null;
    token?: string | null;
  }): Promise<string> {
    if (!productData.length) {
      const fallbackResponse = await this.generateFallbackResponse(userQuery);

      return fallbackResponse;
    }

    try {
      const response = await this.getAiResponseBaseOnQuestion({
        productData: productData,
        userQuery,
        messageData,
        userId,
        token,
      });

      return response;
    } catch (error) {
      this.logger.warn(`Warning: ${error?.message}`);

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
            messageData,
            userId,
            token,
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
    messageData = [],
    userId,
    token,
  }: {
    userQuery: string;
    productData: any;
    messageData?: Message[];
    userId?: string | null;
    token?: string | null;
  }): Promise<string> {
    const data = await this.userService.findUserValueByName(
      ADMIN_USER_VALUES.AI_PROMPT,
    );
    const aiPrompt = data?.text || AI_RESPONSE_PROMPT;
    const userDefineAIModal = await this.userService.findUserValueByName(
      ADMIN_USER_VALUES.GPT_MODAL,
    );
    const openAiModal = userDefineAIModal?.text || this.openaiModal;
    let wholeResponse = '';

    // Re Fining the Previous Messages
    const previousChats = messageData.map(({ content, role }) => ({
      content,
      role,
    }));

    const response = await this.openai.chat.completions.create({
      model: openAiModal,
      stream: true,
      messages: [
        ...previousChats,
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
    for await (const chunk of response) {
      this.gatewayService.sendMessageToUser(
        token ? token : userId,
        chunk.choices[0],
      );
      if (chunk.choices[0].finish_reason !== 'stop') {
        wholeResponse += chunk.choices[0].delta.content;
      }
    }

    if (userId) {
      const usedTokens = this.calculateTokens(openAiModal, wholeResponse);
      this.userService.updateUserTokenUsage(userId, usedTokens);
    }
    return wholeResponse;
  }

  async generateFallbackResponse(userQuery: string) {
    // Multiple fallback strategies
    try {
      // Strategy 1: Use OpenAI to generate a generic helpful response
      const aiGeneratedFallback = await this.openai.chat.completions.create({
        model: this.openaiModal,
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
      `I couldn't find specific information regarding your query: "${userQuery}". Could you provide more details?`,
      `Thank you for your query. I couldn't find an exact match for "${userQuery}". Would you like to try a broader search or rephrase your question?`,
      `I apologize, but I couldn't locate the specific product or information you're looking for. Could you clarify your request?`,
      `It seems the details you're looking for aren't in our current database. Let me help you find the right information. Could you share more details?`,
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
        order: {
          messages: {
            createdAt: 'ASC', // Order messages by 'createdAt' in ascending order
          },
        },
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
        order: {
          createdAt: 'ASC', // Order messages by 'createdAt' in ascending order
        },
      });
      return conversation;
    } catch (error) {
      this.logger.warn('Error fetching product data:', error?.message);
      return [];
    }
  }

  async updateMessageReaction({
    messageId,
    reactionStatus,
  }: {
    messageId: string;
    reactionStatus: boolean | null;
  }): Promise<Message> {
    try {
      const message = await this.messageRepo.findOne({
        where: { id: messageId },
      });

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      message.reactionStatus = reactionStatus;
      await this.messageRepo.save(message);

      // Track Mixpanel event with message details
      this.mixpanelService.track('Message Reaction', {
        distinct_id: message.conversationId,
        messageId: message.id,
        reactionStatus:
          reactionStatus === null
            ? 'no reaction'
            : reactionStatus
              ? 'like'
              : 'dislike',
        messageText: message.content,
        timestamp: new Date().toISOString(),
      });

      return message;
    } catch (error) {
      this.logger.warn('Error updating message reaction:', error?.message);
      throw new InternalServerErrorException(
        'Failed to update reaction status',
      );
    }
  }

  async deleteConversationChat(chatId: string): Promise<void> {
    try {
      const chat = await this.conversationRepo.findOne({
        where: { id: chatId },
      });

      if (!chat) {
        throw new NotFoundException('Chat not found');
      }

      await this.conversationRepo.delete({ id: chatId });
    } catch (error) {
      this.logger.warn('Error deleting chat:', error?.message);
      throw new InternalServerErrorException('Failed to delete chat');
    }
  }

  async reportMessage(messageId: string): Promise<void> {
    try {
      const chat = await this.messageRepo.findOne({
        where: { id: messageId },
      });

      if (!chat) {
        throw new NotFoundException('No Message Found with this ID!');
      }

      await this.messageRepo.update(
        { id: chat.id },
        {
          isFlag: !chat.isFlag,
        },
      );
    } catch (error) {
      this.logger.warn('Error while Reporting Message:', error?.message);
      throw new InternalServerErrorException('Failed to Report Message');
    }
  }

  async fetchFlaggedMessages(): Promise<Message[]> {
    try {
      const messages = await this.messageRepo.find({
        where: { isFlag: true },
        relations: ['conversation', 'conversation.user'],
      });

      return messages;
    } catch (error) {
      this.logger.warn('Error while Fetching Messages:', error?.message);
      throw new InternalServerErrorException('Failed to Fetch Messages');
    }
  }

  async getChatById(chatId: string): Promise<Conversation> {
    try {
      const chat = await this.conversationRepo.findOne({
        where: { id: chatId },
        relations: ['messages'],
      });

      if (!chat) {
        throw new NotFoundException('Chat not found');
      }

      return chat;
    } catch (error) {
      this.logger.warn('Error While Fetching chat:', error?.message);
      throw new InternalServerErrorException('Failed to Fetch chat');
    }
  }

  async deleteAllChatsByUserId(userId: string): Promise<void> {
    try {
      const chats = await this.conversationRepo.find({
        where: { userId: userId },
      });
      if (!chats || chats.length === 0) {
        throw new NotFoundException('No chats found for this user');
      }
      await this.conversationRepo.delete({ userId: userId });
    } catch (error) {
      this.logger.warn('Error deleting chats:', error?.message);
      throw new Error(error?.message || 'Failed to delete chats');
    }
  }

  private calculateTokens(openAiModel: string, content?: string) {
    return content
      ? encoding_for_model(openAiModel as any).encode(content).length
      : 0;
  }

  private async updateProductName({
    conversationRecord,
    toolProductName,
  }: {
    conversationRecord: Conversation;
    toolProductName: string;
  }) {
    try {
      const existingProducts = conversationRecord.productName
        ? conversationRecord.productName.split(',')
        : [];

      if (!existingProducts.includes(toolProductName)) {
        conversationRecord.productName = existingProducts.length
          ? `${conversationRecord.productName},${toolProductName}` // Append if existing
          : toolProductName; // Set if empty

        await this.conversationRepo.save(conversationRecord);
      }
    } catch (error) {
      this.logger.error('Failed to update product name', error?.message);
    }
  }
}
