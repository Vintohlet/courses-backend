import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js'
import { UpdateProfileDto } from '../dto/profile.dto.js'
import { ProfileService } from '../services/profile.service.js'

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  getMyProfile(@Req() request: AuthenticatedRequest) { return this.profiles.getProfile(request.user!.id) }

  @Patch()
  updateMyProfile(@Req() request: AuthenticatedRequest, @Body() body: UpdateProfileDto) {
    return this.profiles.updateProfile(request.user!.id, body)
  }
}
