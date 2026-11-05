import { Transform } from 'class-transformer'
import { ArrayUnique, IsArray, IsByteLength, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ example: 'John Doe', minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string

  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string

  @ApiProperty({ example: 'DemoPass123!', minLength: 8, maxLength: 72 })
  @IsString()
  @IsByteLength(8, 72)
  password: string

  @ApiPropertyOptional({ type: [String], example: ['frontend', 'backend'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : item) : value)
  interests?: string[]
}

export class LoginDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string

  @ApiProperty({ example: 'DemoPass123!' })
  @IsString()
  @IsByteLength(1, 72)
  password: string
}
