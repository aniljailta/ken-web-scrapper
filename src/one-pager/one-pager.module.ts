import { Module } from '@nestjs/common';
import { OnePagerController } from './one-pager.controller';
import { OnePagerService } from './one-pager.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pager } from './entities/pager.entity';
import { PagerChunks } from './entities/pager-chunks.entity';
import { PagerPage } from './entities/pager-page.entity';
import { SystemPrompts } from './entities/system-prompts.entity';
import { SocketGateway } from 'src/gateways/socket.gateway';
import { S3Service } from 'src/s3/s3.service';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Pager,
      PagerChunks,
      PagerPage,
      SystemPrompts,
      User,
    ]),
  ],
  controllers: [OnePagerController],
  providers: [OnePagerService, SocketGateway, S3Service],
})
export class OnePagerModule {}
