import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthService } from '../services/auth.service.js'
import { RegisterDto, LoginDto } from '../dto/auth.dto.js'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) { return this.auth.register(body) }

  @Post('login')
  login(@Body() body: LoginDto) { return this.auth.login(body) }
}
