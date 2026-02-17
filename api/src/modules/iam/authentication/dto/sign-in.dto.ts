import {
  IsEmail,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;

  @MinLength(15)
  @MaxLength(64)
  password: string;

  @IsOptional()
  @IsNumberString()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  tfaCode?: string;

  @IsOptional()
  @IsString()
  @Length(8, 8, { message: 'Recovery code must be exactly 8 characters' })
  @Matches(/^[A-Fa-f0-9]{8}$/, { message: 'Invalid recovery code format' })
  @ValidateIf((o: SignInDto) => !o.tfaCode)
  recoveryCode?: string;
}
