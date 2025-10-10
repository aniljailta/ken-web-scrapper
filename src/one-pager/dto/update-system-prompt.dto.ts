import { IsString } from 'class-validator';

export class UpdateSystemPromptDTO {
  @IsString()
  pagerJsonPrompt: string;
  @IsString()
  topicClusterPrompt: string;
  @IsString()
  textEnhancementPrompt: string;
}
