import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class UpsertReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number

  @ApiPropertyOptional({ maxLength: 2000, example: 'Clear explanations and useful practice.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string
}
