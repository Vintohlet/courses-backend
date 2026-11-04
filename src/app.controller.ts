import { Controller, Get } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import type { Connection } from 'mongoose'

@Controller()
export class AppController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('health')
  health() {
    return { status: 'ok', mongo: this.connection.readyState === 1 }
  }
}