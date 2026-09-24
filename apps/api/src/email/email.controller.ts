import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { CreateEmailAccountDto, IngestEmailMessageDto, LinkEmailThreadDto, ReplyEmailDto, SaveEmailCredentialsDto, UpdateEmailAccountDto } from './dto';
import { EmailService } from './email.service';

@ApiTags('email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('email')
export class EmailController {
  constructor(private readonly service: EmailService) {}

  @Get('providers')
  @RequirePermissions('communications.read')
  providers() {
    return apiResponse(this.service.listProviders());
  }

  @Get('accounts')
  @RequirePermissions('communications.read')
  async listAccounts(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.listAccounts(user.tenantId));
  }

  @Post('accounts')
  @RequirePermissions('communications.send')
  async createAccount(@CurrentUser() user: AuthContext, @Body() dto: CreateEmailAccountDto) {
    return apiResponse(await this.service.createAccount(user.tenantId, dto));
  }

  @Patch('accounts/:id')
  @RequirePermissions('communications.send')
  async updateAccount(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdateEmailAccountDto) {
    return apiResponse(await this.service.updateAccount(user.tenantId, id, dto));
  }

  @Post('accounts/:id/credentials')
  @RequirePermissions('communications.send')
  async saveCredentials(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: SaveEmailCredentialsDto) {
    return apiResponse(await this.service.saveCredentials(user.tenantId, id, dto));
  }

  @Post('accounts/:id/reconnect')
  @RequirePermissions('communications.send')
  async reconnect(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: SaveEmailCredentialsDto) {
    return apiResponse(await this.service.saveCredentials(user.tenantId, id, dto));
  }

  @Post('accounts/:id/test-connection')
  @RequirePermissions('communications.send')
  async testConnection(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.testConnection(user.tenantId, id));
  }

  @Post('accounts/:id/disconnect')
  @RequirePermissions('communications.send')
  async disconnect(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.disconnect(user.tenantId, id));
  }

  @Get('threads')
  @RequirePermissions('communications.read')
  async listThreads(@CurrentUser() user: AuthContext, @Query('accountId') accountId?: string) {
    return apiResponse(await this.service.getThreads(user.tenantId, accountId));
  }

  @Get('threads/:id')
  @RequirePermissions('communications.read')
  async getThread(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getThread(user.tenantId, id));
  }

  @Post('accounts/:id/messages')
  @RequirePermissions('communications.send')
  async ingestMessage(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: IngestEmailMessageDto) {
    return apiResponse(await this.service.ingestMessage(user.tenantId, id, dto));
  }

  @Post('threads/:id/read')
  @RequirePermissions('communications.read')
  async markThreadRead(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.markThreadRead(user.tenantId, id));
  }

  @Post('threads/:id/reply')
  @RequirePermissions('communications.send')
  async reply(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: ReplyEmailDto) {
    return apiResponse(await this.service.reply(user.tenantId, user.userId, id, dto));
  }

  @Patch('threads/:id/links')
  @RequirePermissions('communications.send')
  async linkThread(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: LinkEmailThreadDto) {
    return apiResponse(await this.service.linkThread(user.tenantId, id, dto));
  }
}
