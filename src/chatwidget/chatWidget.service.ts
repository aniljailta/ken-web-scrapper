import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Typesense from 'typesense';
import { SendMessageDTO } from './dto/sendMessage.dto';
import {
  generateFollowUpSystemPrompt,
  generateResponseSystemPrompt,
  intentClassifierSystemPrompt,
  summarizeSystemPrompt,
} from './constant';
import { intentType } from './type';
import { WebinarSession } from './entities/webinar_session.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebinarConversation } from './entities/webinar_conversation.entity';
import { ChatRole, WebinarChat } from './entities/webinar_chat.entity';
import {
  ChatCompletionMessage,
  ChatCompletionRole,
} from 'openai/resources/chat';
import { extractEmail } from 'src/scraper/utils';

@Injectable()
export class ChatWidgetService {
  private openai: OpenAI;
  private readonly typeSenseCollection: string;
  private readonly logger = new Logger(ChatWidgetService.name);
  private openaiModal: string;
  @InjectRepository(WebinarSession)
  private webinarSessionRepo: Repository<WebinarSession>;
  @InjectRepository(WebinarConversation)
  private webinarConversationRepo: Repository<WebinarConversation>;
  @InjectRepository(WebinarChat)
  private webinarChatRepo: Repository<WebinarChat>;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not defined in the environment variables.',
      );
    }

    const typeSenseCollectionName = this.configService.get<string>(
      'TYPESENSE_COLLECTION_NAME',
    );

    if (!typeSenseCollectionName) {
      throw new Error(
        'TYPESENSE_COLLECTION_NAME is not defined in the environment variables.',
      );
    }

    this.typeSenseCollection = typeSenseCollectionName;
    this.openai = new OpenAI({ apiKey });

    this.openaiModal =
      this.configService.get<string>('AI_ASSISTANT_MODAL') || 'gpt-3.5-turbo';
  }

  renderDemoPage() {
    return {};
  }

  private getTypeSenseClient() {
    //
    const apiKey = this.configService.get<string>('TYPESENSE_API_KEY');
    const typeSensePort = this.configService.get<string>('TYPESENSE_PORT');

    if (!apiKey) {
      throw new Error(
        'TYPESENSE_PORT is not defined in the environment variables.',
      );
    }
    const typesense = new Typesense.Client({
      nodes: [
        {
          host: 'localhost', // or your hosted cluster
          port: parseInt(typeSensePort),
          protocol: 'http',
        },
      ],
      apiKey,
      connectionTimeoutSeconds: 10,
    });
    return typesense;
  }

  private async getOrCreateConversation(sessionId?: string) {
    //
    const checkSession = await this.webinarConversationRepo.findOne({
      where: {
        session: {
          id: sessionId,
        },
      },
      relations: ['messages'],
      order: {
        messages: {
          sentAt: 'DESC',
        },
      },
    });
    if (checkSession) {
      return checkSession;
    }

    return await this.webinarConversationRepo.save({
      session: {
        id: sessionId,
      },
    });
  }
  private async getOrCreateSession(sessionId?: string) {
    //
    if (sessionId) {
      const checkSession = await this.webinarSessionRepo.findOne({
        where: {
          id: sessionId,
        },
        relations: ['conversation'],
      });
      if (checkSession) {
        return checkSession;
      }
    }

    return await this.webinarSessionRepo.save({});
  }

  private async createMessageRecord({
    conversationId,
    message,
    role,
  }: {
    role: ChatRole;
    message: string;
    conversationId: string;
  }) {
    const messageRecord = await this.webinarChatRepo.save({
      message,
      role,
      conversation: {
        id: conversationId,
      },
    });

    return messageRecord;
  }
  private chunkText(text: string, maxWords = 200) {
    const words = text.split(/\s+/);
    const chunks = [];

    for (let i = 0; i < words.length; i += maxWords) {
      const chunk = words.slice(i, i + maxWords).join(' ');
      chunks.push(chunk);
    }

    return chunks;
  }
  private async getEmbedding(text: string) {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }
  private async queryRelevantChunks(question: string) {
    const embedding = await this.getEmbedding(question);
    const client = this.getTypeSenseClient();
    const collection = this.typeSenseCollection;

    const results = await client.multiSearch.perform({
      searches: [
        {
          collection,
          q: '*', // wildcard for full search
          vector_query: `embedding:([${embedding.join(',')}], k:5)`,
          query_by: 'text',
        },
      ],
    });

    // @ts-ignore
    console.log('Results Length', results.results.length);
    // @ts-ignore
    return results.results[0].hits.map((hit) => hit.document.text);
  }

  async getConversation(sessionId: string) {
    return await this.webinarChatRepo.find({
      where: {
        conversation: {
          session: {
            id: sessionId,
          },
        },
      },
    });
  }

  private async intentClassifier(
    userQuery: string,
    previousMessages?: any[],
  ): Promise<intentType> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: intentClassifierSystemPrompt,
        },
        // ...(previousMessages || []),
        {
          role: 'user',
          content: userQuery,
        },
      ],
    });

    return completion.choices[0].message.content as intentType;
  }

  private async generateChunkSummary(chunks: string[], userQuestion: string) {
    const context = chunks.join('\n---\n');

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `
                Please answer using only the context provided below.
You're welcome to rephrase or explain it in a friendly, helpful way!
                `,
        },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${userQuestion}`,
        },
      ],
    });

    return completion.choices[0].message.content;
  }

  private async generateResponse(messages: ChatCompletionMessage[]) {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages,
    });

    return completion.choices[0].message.content;
  }

  private async gatherUserDetail({
    userMessage,
    conversationId,
    intent,
  }: {
    userMessage: string;
    conversationId: string;
    intent: intentType;
  }) {
    //
    const userEmail = extractEmail(userMessage);
    if (!userEmail) {
      return 'Please share your Email with us.';
    }
    // Generating Summary of Chat!
    const messages = await this.getSessionMessages(conversationId);
    const previousMessages = await this.generateCompletionChat(messages);

    const responseMessages = [
      {
        role: 'system',
        content: summarizeSystemPrompt,
      },
      ...previousMessages,
    ];
    // @ts-ignore
    const assistantResponse = await this.generateResponse(responseMessages);
    return assistantResponse;
  }

  private generateCompletionChat(
    messages: WebinarChat[],
  ): ChatCompletionMessage[] {
    // @ts-ignore
    return messages.map(({ message, role }) => ({
      role: role as ChatCompletionRole,
      content: message,
    }));
  }

  private async getSessionMessages(conversationId: string) {
    const chats = await this.webinarChatRepo.find({
      where: {
        conversation: {
          id: conversationId,
        },
      },
    });
    return chats || [];
  }
  private async generateFollowUpQuestion({
    userMessage,
    assistantReply,
    intent,
  }: {
    userMessage: string;
    assistantReply: string;
    intent: string;
  }) {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: generateFollowUpSystemPrompt,
        },
        {
          role: 'user',
          content: `
            User Questions: ${userMessage},

            Assistants Reply: ${assistantReply},


            User's Intent: ${intent}
          `,
        },
      ],
    });

    return completion.choices[0].message.content;
  }

  private async contentRelatedQuestion({
    message,
    conversationId,
  }: {
    message: string;
    conversationId: string;
  }) {
    const chunksResponse = await this.queryRelevantChunks(message);

    return chunksResponse;
  }

  public async startChat(data: SendMessageDTO) {
    const session = await this.getOrCreateSession(data.sessionId);
    const conversation = await this.getOrCreateConversation(session.id);

    // Creating User Message Record!
    await this.createMessageRecord({
      role: ChatRole.USER,
      message: data.message,
      conversationId: conversation.id,
    });

    const messages = await this.getSessionMessages(conversation.id);
    const initialMessages = this.generateCompletionChat(messages);
    const intent = await this.intentClassifier(data.message, initialMessages);
    console.log('🚀 ~ ChatWidgetService ~ startChat ~ intent:', intent);

    let message: WebinarChat | null = null;
    if (intent === 'content_question') {
      const contentResponse = await this.contentRelatedQuestion({
        message: data.message,
        conversationId: conversation.id,
      });

      const previousMessages = this.generateCompletionChat(messages);

      const responseMessages = [
        {
          role: 'system',
          content: `${generateResponseSystemPrompt}
    
                    Context: ${contentResponse.join('\n--\n')}
    
                    `,
        },
        ...previousMessages,
      ];

      // @ts-ignore
      const assistantResponse = await this.generateResponse(responseMessages);

      const followUpQuestion = await this.generateFollowUpQuestion({
        assistantReply: assistantResponse,
        intent,
        userMessage: data.message,
      });

      // Combining Message
      const combineResponse = `${assistantResponse}
    
            ${followUpQuestion}
            `;

      // Saving Response
      message = await this.createMessageRecord({
        conversationId: conversation.id,
        role: ChatRole.ASSISTANT,
        message: combineResponse,
      });
    } else if (
      ['product_lead_in', 'followup_request', 'resource_request'].includes(
        intent,
      )
    ) {
      console.log("Now we're here...");
      const lastMessages = this.generateCompletionChat(messages);
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: generateFollowUpSystemPrompt,
          },
          ...lastMessages,
          {
            role: 'user',
            content: `
              User Questions: ${data.message},
              User's Intent: ${intent}
            `,
          },
        ],
      });

      // if (intent === 'resource_request') {
      //   const gotUserEmail = await this.gatherUserDetail({
      //     conversationId: conversation.id,
      //     intent,
      //     userMessage: data.message,
      //   });
      //   console.log(
      //     '🚀 ~ ChatWidgetService ~ startChat ~ gotUserEmail:',
      //     gotUserEmail,
      //   );
      // }

      const anotherFollowUpMessage = completion.choices[0].message.content;

      message = await this.createMessageRecord({
        conversationId: conversation.id,
        role: ChatRole.ASSISTANT,
        message: anotherFollowUpMessage,
      });

      return {
        data: {
          intent,
          sessionId: session.id,
          message: anotherFollowUpMessage,
        },
      };
    } else if (intent === 'general_curiosity') {
      const lastMessages = this.generateCompletionChat(messages);
      const assistantResponse = await this.generateResponse(lastMessages);

      const followUpQuestion = await this.generateFollowUpQuestion({
        assistantReply: assistantResponse,
        intent,
        userMessage: data.message,
      });

      // Combining Message
      const combineResponse = `${assistantResponse}
    
            ${followUpQuestion}
            `;

      // Saving Response
      message = await this.createMessageRecord({
        conversationId: conversation.id,
        role: ChatRole.ASSISTANT,
        message: combineResponse,
      });

      return {
        data: {
          intent,
          sessionId: session.id,
          message: message.message,
        },
      };
    }

    return {
      data: {
        intent,
        sessionId: session.id,
        message: message.message,
      },
    };
  }
}
