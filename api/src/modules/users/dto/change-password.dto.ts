import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { IsNotBreached } from 'src/shared/validators';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(15)
  @MaxLength(64)
  @IsNotBreached()
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
