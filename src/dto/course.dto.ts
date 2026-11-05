import { Transform, Type } from 'class-transformer'
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { CourseLevel } from '../models/course.model.js'

const TOPIC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class LessonInputDto {
  @ApiProperty({ example: 'Introduction to React' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string

  @ApiProperty({ example: 'Learn the basic concepts with a small exercise.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string

  @ApiProperty({ example: 0, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order: number
}

export class CreateCourseDto {
  @ApiProperty({ example: 'React and TypeScript' })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string

  @ApiProperty({ example: 'Build typed interfaces with React.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  shortDescription: string

  @ApiProperty({ example: 'A practical course covering components, state, and API data.' })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  fullDescription: string

  @ApiProperty({ example: 'frontend' })
  @IsString()
  @Matches(TOPIC_SLUG)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  category: string

  @ApiPropertyOptional({ type: [String], example: ['frontend'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(TOPIC_SLUG, { each: true })
  @Transform(({ value }) => {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value
    return Array.isArray(values) ? values.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : item) : values
  })
  tags?: string[]

  @ApiPropertyOptional({ enum: CourseLevel, example: CourseLevel.Beginner })
  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel

  @ApiProperty({ type: [LessonInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LessonInputDto)
  lessons: LessonInputDto[]
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class CourseQueryDto {
  @ApiPropertyOptional({ example: 'React' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string

  @ApiPropertyOptional({ example: 'frontend' })
  @IsOptional()
  @IsString()
  @Matches(TOPIC_SLUG)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  category?: string

  @ApiPropertyOptional({ type: [String], example: ['frontend', 'backend'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(TOPIC_SLUG, { each: true })
  @Transform(({ value }) => {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value
    return Array.isArray(values) ? values.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : item) : values
  })
  tags?: string[]

  @ApiPropertyOptional({ enum: CourseLevel })
  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel

  @ApiPropertyOptional({ enum: ['rating', 'popular', 'newest'] })
  @IsOptional()
  @IsIn(['rating', 'popular', 'newest'])
  sort?: 'rating' | 'popular' | 'newest'

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
