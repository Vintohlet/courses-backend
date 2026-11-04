import { Transform } from 'class-transformer'
import { IsArray, IsEmail, IsOptional, IsString, MaxLength, MinLength, Matches, ArrayUnique, IsByteLength } from 'class-validator'

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string

  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string

  @IsString()
  @IsByteLength(8, 72)
  password: string

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : item) : value)
  interests?: string[]
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string

  @IsString()
  @IsByteLength(1, 72)
  password: string
}
