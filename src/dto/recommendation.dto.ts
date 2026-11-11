import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class RecommendationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 6, description: 'Maximum number of recommendations to return.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 6
}
