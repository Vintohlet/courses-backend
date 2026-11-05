import { Transform } from 'class-transformer'
import { IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateTopicDto {
  @ApiProperty({ example: 'frontend' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  slug: string

  @ApiProperty({ example: 'Frontend development' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string
}
