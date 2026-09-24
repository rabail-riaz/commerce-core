import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CommonModule } from '../common/common.module';
@Module({ imports: [JwtModule.register({}), CommonModule], controllers: [AuthController], providers: [AuthService, JwtAuthGuard], exports: [JwtAuthGuard, JwtModule] }) export class AuthModule {}
