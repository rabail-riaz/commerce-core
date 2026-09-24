import {Body, Controller, Get, Post, UseGuards} from '@nestjs/common';
import {ApiBearerAuth, ApiTags} from '@nestjs/swagger';
import {CurrentUser} from '../common/current-user.decorator';
import {AuthService} from './auth.service';
import {JwtAuthGuard} from './jwt-auth.guard';
import {LoginDto, RefreshDto, RegisterDto} from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private auth: AuthService) {
    }

    @Post('register') register(@Body() dto: RegisterDto) {
        return this.auth.register(dto);
    }

    @Post('login') login(@Body() dto: LoginDto) {
        return this.auth.login(dto);
    }

    @Post('refresh') refresh(@Body() dto: RefreshDto) {
        return this.auth.refresh(dto.refreshToken);
    }

    @Post('logout') logout(@Body() dto: RefreshDto) {
        return this.auth.logout(dto.refreshToken);
    }

    @Get('me') @ApiBearerAuth() @UseGuards(JwtAuthGuard) me(@CurrentUser() user: { userId: string; tenantId: string }) {
        return this.auth.getCurrentUser(user.userId, user.tenantId);
    }
}
