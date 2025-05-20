import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Typesense from 'typesense';
import { SendMessageDTO } from './dto/sendMessage.dto';
import {
  captureLeadInfo,
  generalAssistantPrompt,
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
import { ChatWidgetHelperService } from './chatWidgetHelper.service';
import moment from 'moment';

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

  constructor(
    private readonly configService: ConfigService,
    private readonly chatWidgetHelperService: ChatWidgetHelperService,
  ) {
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
    messages: any[],
    conversationId: string,
  ): Promise<intentType> {
    const intent = await this.generateResponse(
      [
        {
          role: 'system',
          content: intentClassifierSystemPrompt,
        },
        ...messages,
      ],
      conversationId,
    );

    this.logger.log(`User Intent: ${intent}`);

    return intent as intentType;
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

  private async generateResponse(messages: any[], conversationId: string) {
    const completion = await this.openai.chat.completions.create({
      model: this.openaiModal,
      messages,
      tools: [
        {
          function: captureLeadInfo,
          type: 'function',
        },
      ],
    });
    if (completion.choices[0].message.tool_calls) {
      const functionCall = completion.choices[0].message.tool_calls[0].function;
      if (functionCall.name === 'captureLeadInfo') {
        const parsedArguments = JSON.parse(functionCall.arguments);

        if (parsedArguments) {
          await this.logLead({
            ...parsedArguments,
            conversationId,
          });
        }

        const message = await this.generateFollowUpQuestion({
          userMessage: messages[messages.length - 1].content,
          assistantReply: messages[messages.length - 2].content,
          intent: 'resource_request',
          conversationId,
        });

        return message;
      }
    }

    return completion.choices[0].message.content;
  }

  private async logLead({
    conversationId,
    email,
    company,
    name,
  }: {
    email: string;
    name?: string;
    company?: string;
    conversationId: string;
  }) {
    //
    const summary = await this.generateConversationSummary(conversationId);
    const formattedRow = [
      moment().format('MMM Do YY'),
      name ?? 'N/A',
      email ?? 'N/A',
      company ?? 'N/A',
      summary ?? 'N/A',
    ];

    await this.chatWidgetHelperService.writeContentInSheets([formattedRow]);

    this.logger.log('Logging Lead In the Sheets');
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
    conversationId: string;
  }) {
    const completion = await this.openai.chat.completions.create({
      model: this.openaiModal,
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

  private async generateConversationSummary(conversationId: string) {
    const messages = await this.getSessionMessages(conversationId);
    const initialMessages = this.generateCompletionChat(messages);
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: summarizeSystemPrompt,
        },
        {
          role: 'user',
          content: `
          Here's the Chat Log: 
          
          ${initialMessages.map(({ content }) => content).join('\n---\n')}
          `,
        },
      ],
    });

    return completion.choices[0].message.content;
  }

  private async generateResponseMessage({
    contentChunks,
    intent,
    messages,
    conversationId,
  }: {
    contentChunks: string[];
    intent: intentType;
    messages: any[];
    conversationId: string;
  }) {
    const responseMessages = [
      {
        role: 'system',
        content: `${generateResponseSystemPrompt}

                    Intent: ${intent}

                    Context: ${contentChunks.join('\n--\n')}

                    `,
      },
      ...messages,
    ];

    const assistantResponse = await this.generateResponse(
      responseMessages,
      conversationId,
    );
    return assistantResponse;
  }

  private async contentRelatedQuestion({
    message,
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
    const intent = await this.intentClassifier(
      initialMessages,
      conversation.id,
    );

    let message: WebinarChat | null = null;
    if (intent === 'content_question') {
      // 1. Pulling Chunks From TypeSense
      const contentResponse = await this.contentRelatedQuestion({
        message: data.message,
        conversationId: conversation.id,
      });

      // 2. Converting Chunks to Human Readable Form. (Only Content related response only)
      const assistantResponse = await this.generateResponseMessage({
        contentChunks: contentResponse,
        intent,
        messages: initialMessages,
        conversationId: conversation.id,
      });

      // 3. Generating The Follow UP Question. (e.g "You want me to send you the summary of this chat via Email?")
      const followUpQuestion = await this.generateFollowUpQuestion({
        assistantReply: assistantResponse,
        intent,
        userMessage: data.message,
        conversationId: conversation.id,
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
      const completion = await this.generateResponse(
        [
          {
            role: 'system',
            content: `You are a helpful assistant that talks to users after cybersecurity webinars.

Behavior Rules:
1. The user's question shows interest in a product, follow-up, or resource—so offer helpful next steps.
2. If the user has NOT provided an email, name, or company:
   - Politely ask if they'd like a checklist, setup review, or follow-up resource.
   - If they accept, ask for their name, email, and company (or trigger tool to extract it).
3. If the user gives just their email, assume they are responding to a previous offer.
4. If the user has already provided contact info, thank them and confirm what you'll send.
5. Be friendly, professional, and concise—avoid sounding pushy or robotic.
6. Always ground your responses in the context from the webinar transcript.
7. Ask only for info not already given. Be context-aware.
`,
          },
          ...initialMessages,
        ],
        conversation.id,
      );

      message = await this.createMessageRecord({
        conversationId: conversation.id,
        role: ChatRole.ASSISTANT,
        message: completion,
      });
    } else if (intent === 'general_curiosity') {
      const assistantResponse = await this.generateResponse(
        [
          {
            role: 'system',
            content: generalAssistantPrompt,
          },
          ...initialMessages,
        ],
        conversation.id,
      );

      // Saving Response
      message = await this.createMessageRecord({
        conversationId: conversation.id,
        role: ChatRole.ASSISTANT,
        message: assistantResponse,
      });
    } else {
      message = await this.createMessageRecord({
        conversationId: conversation.id,
        role: ChatRole.ASSISTANT,
        message: intent,
      });
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
