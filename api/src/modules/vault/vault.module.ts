import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import vaultConfig from './vault.config';
import { VaultService } from './vault.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(vaultConfig)],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
