import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  CanonicalizationService,
  KeyManagementService,
  KeyRotationService,
  SoftwareSigningService,
  VaultSigningService,
} from './services';
import { SigningController } from './signing.controller';
import { KeyAdminController } from './key-admin.controller';
import { SIGNING_SERVICE } from './interfaces';
import { VaultService } from '../vault';
import vaultConfig from '../vault/vault.config';

@Module({
  imports: [ConfigModule.forFeature(vaultConfig)],
  controllers: [SigningController, KeyAdminController],
  providers: [
    CanonicalizationService,
    KeyManagementService,
    KeyRotationService,
    SoftwareSigningService,
    VaultSigningService,
    {
      provide: SIGNING_SERVICE,
      useFactory: (
        vault: VaultService,
        software: SoftwareSigningService,
        vaultSigning: VaultSigningService,
      ) => (vault.isEnabled() ? vaultSigning : software),
      inject: [VaultService, SoftwareSigningService, VaultSigningService],
    },
  ],
  exports: [
    CanonicalizationService,
    KeyManagementService,
    KeyRotationService,
    SoftwareSigningService,
    VaultSigningService,
    SIGNING_SERVICE,
  ],
})
export class SigningModule {}
