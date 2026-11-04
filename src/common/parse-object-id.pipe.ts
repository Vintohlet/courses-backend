import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[0-9a-fA-F]{24}$/.test(value)) throw new BadRequestException('Invalid MongoDB ObjectId')
    return value
  }
}
