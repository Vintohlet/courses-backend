import { Transform } from 'class-transformer'
import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class CreateTopicDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  slug: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string
}
