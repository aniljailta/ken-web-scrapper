import { Module } from '@nestjs/common';
import { OnePagerController } from './one-pager.controller';
import { OnePagerService } from './one-pager.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pager } from './entities/pager.entity';
import { PagerChunks } from './entities/pager-chunks.entity';
import { PagerPage } from './entities/pager-page.entity';
import { SystemPrompts } from './entities/system-prompts.entity';
import { SocketGateway } from 'src/gateways/socket.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pager, PagerChunks, PagerPage, SystemPrompts]),
  ],
  controllers: [OnePagerController],
  providers: [OnePagerService, SocketGateway],
})
export class OnePagerModule {}
