import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserValues } from './entities/values.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { Message } from 'src/conversation/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserValues, Conversation, Message]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
