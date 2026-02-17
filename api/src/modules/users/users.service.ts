import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { HashingService } from 'src/modules/iam/hashing/hashing.service';
import { RolesService } from 'src/modules/iam/authorization/services/roles.service';
import { PasswordLockoutStorage } from 'src/modules/iam/authentication/password-lockout';
import { MailService, PasswordResetTokenStorage } from 'src/modules/mail';
import { AuditService, AuditEventType, AuditAction } from '../audit';
import { isUniqueViolation } from 'src/shared/utils/error.utils';
import {
  Connection,
  PaginatedSearchOptions,
  createLikePattern,
  isEmptySearch,
  paginate,
} from 'src/shared/pagination';

export interface CreateUserOptions {
  sendWelcomeEmail?: boolean;
}

export type UsersPaginationOptions = PaginatedSearchOptions;

export type UsersConnection = Connection<User>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly appBaseUrl: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly hashingService: HashingService,
    private readonly rolesService: RolesService,
    private readonly passwordLockoutStorage: PasswordLockoutStorage,
    private readonly mailService: MailService,
    private readonly passwordResetTokenStorage: PasswordResetTokenStorage,
    private readonly auditService: AuditService,
  ) {
    this.appBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
  }

  async create(
    createUserDto: CreateUserDto,
    options: CreateUserOptions = {},
  ): Promise<User> {
    const { sendWelcomeEmail = true } = options;

    try {
      const user = new User();
      user.firstName = createUserDto.firstName;
      user.lastName = createUserDto.lastName;
      user.email = createUserDto.email;
      user.password = await this.hashingService.hash(createUserDto.password);

      if (createUserDto.roleId) {
        const role = await this.rolesService.findOne(
          parseInt(createUserDto.roleId, 10),
        );
        user.role = role;
      } else {
        const defaultRole = await this.rolesService.findDefault();
        user.role = defaultRole;
      }

      const savedUser = await this.userRepository.save(user);

      try {
        await this.auditService.log(
          {
            eventType: AuditEventType.USER_CREATED,
            entityType: 'User',
            entityId: savedUser.id,
            entityName: savedUser.email,
            action: AuditAction.CREATE,
            newValues: {
              email: savedUser.email,
              firstName: savedUser.firstName,
              lastName: savedUser.lastName,
              roleId: savedUser.role?.id ?? null,
            },
          },
          {},
        );
      } catch (auditError) {
        this.logger.error(
          'Failed to log audit event for user creation',
          auditError instanceof Error ? auditError.stack : String(auditError),
        );
      }

      if (sendWelcomeEmail) {
        await this.mailService.sendWelcome(savedUser.email, {
          firstName: savedUser.firstName ?? undefined,
          email: savedUser.email,
          temporaryPassword: createUserDto.password,
          loginUrl: this.appBaseUrl,
        });
      }

      return savedUser;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Email already exists');
      }
      throw err;
    }
  }

  async findAll(
    options: UsersPaginationOptions = {},
  ): Promise<UsersConnection> {
    const qb = this.userRepository.createQueryBuilder('user');

    if (!isEmptySearch(options.search)) {
      const pattern = createLikePattern(options.search!);
      qb.where(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: pattern },
      );
    }

    return paginate(qb, 'user', {
      first: options.first,
      after: options.after,
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findOne(id);
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (dto.firstName !== undefined) {
      oldValues.firstName = user.firstName;
      user.firstName = dto.firstName;
      newValues.firstName = dto.firstName;
    }

    if (dto.lastName !== undefined) {
      oldValues.lastName = user.lastName;
      user.lastName = dto.lastName;
      newValues.lastName = dto.lastName;
    }

    const hasChanges = Object.keys(newValues).length > 0;
    if (!hasChanges) {
      return user;
    }

    const saved = await this.userRepository.save(user);

    try {
      await this.auditService.log(
        {
          eventType: AuditEventType.USER_UPDATED,
          entityType: 'User',
          entityId: saved.id,
          entityName: saved.email,
          action: AuditAction.UPDATE,
          oldValues,
          newValues,
        },
        { actorId: id },
      );
    } catch (auditError) {
      this.logger.error(
        'Failed to log audit event for user profile update',
        auditError instanceof Error ? auditError.stack : String(auditError),
      );
    }

    return saved;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    return this.updateProfile(id, updateUserDto);
  }

  async adminUpdate(
    id: string,
    dto: AdminUpdateUserDto,
    adminUserId: string,
  ): Promise<User> {
    const user = await this.findOne(id);
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (dto.roleId !== undefined) {
      oldValues.roleId = user.role?.id ?? null;
      const role = await this.rolesService.findOne(parseInt(dto.roleId, 10));
      user.role = role;
      newValues.roleId = role.id;
    }

    if (dto.isActive !== undefined) {
      oldValues.isActive = user.isActive;
      user.isActive = dto.isActive;
      newValues.isActive = dto.isActive;
    }

    if (dto.isLocked !== undefined) {
      oldValues.isLocked = user.isLocked;
      user.isLocked = dto.isLocked;
      newValues.isLocked = dto.isLocked;
    }

    const saved = await this.userRepository.save(user);

    if (dto.isActive !== undefined) {
      try {
        await this.auditService.log(
          {
            eventType: dto.isActive
              ? AuditEventType.USER_ACTIVATED
              : AuditEventType.USER_DEACTIVATED,
            entityType: 'User',
            entityId: saved.id,
            entityName: saved.email,
            action: AuditAction.UPDATE,
            oldValues: { isActive: oldValues.isActive },
            newValues: { isActive: dto.isActive },
          },
          { actorId: adminUserId },
        );
      } catch (auditError) {
        this.logger.error(
          'Failed to log audit event for user activation/deactivation',
          auditError instanceof Error ? auditError.stack : String(auditError),
        );
      }
    }

    if (dto.roleId !== undefined || dto.isLocked !== undefined) {
      const updateOld: Record<string, unknown> = {};
      const updateNew: Record<string, unknown> = {};
      if (dto.roleId !== undefined) {
        updateOld.roleId = oldValues.roleId;
        updateNew.roleId = newValues.roleId;
      }
      if (dto.isLocked !== undefined) {
        updateOld.isLocked = oldValues.isLocked;
        updateNew.isLocked = newValues.isLocked;
      }
      try {
        await this.auditService.log(
          {
            eventType: AuditEventType.USER_UPDATED,
            entityType: 'User',
            entityId: saved.id,
            entityName: saved.email,
            action: AuditAction.UPDATE,
            oldValues: updateOld,
            newValues: updateNew,
          },
          { actorId: adminUserId },
        );
      } catch (auditError) {
        this.logger.error(
          'Failed to log audit event for admin user update',
          auditError instanceof Error ? auditError.stack : String(auditError),
        );
      }
    }

    return saved;
  }

  async unlockUser(id: string): Promise<User> {
    const user = await this.findOne(id);

    user.isLocked = false;
    user.failedLoginAttempts = 0;

    await this.passwordLockoutStorage.clearFailures(user.email);

    this.logger.log({
      event: 'USER_UNLOCKED_AND_RESET',
      userId: user.id,
    });

    const savedUser = await this.userRepository.save(user);

    await this.mailService.sendAccountUnlocked(savedUser.email, {
      firstName: savedUser.firstName ?? undefined,
      email: savedUser.email,
      loginUrl: this.appBaseUrl,
    });

    return savedUser;
  }

  async triggerPasswordReset(id: string): Promise<{ message: string }> {
    const user = await this.findOne(id);

    const token = await this.passwordResetTokenStorage.createToken(
      user.id,
      user.email,
    );

    const resetUrl = `${this.appBaseUrl}/reset-password?token=${token}`;
    const expiresInMinutes =
      this.passwordResetTokenStorage.getExpirationMinutes();

    await this.mailService.sendPasswordReset(user.email, {
      firstName: user.firstName ?? undefined,
      resetUrl,
      expiresInMinutes,
    });

    this.logger.log({
      event: 'PASSWORD_RESET_TRIGGERED',
      userId: user.id,
    });

    return {
      message: 'Password reset email sent successfully.',
    };
  }

  async notifyAccountLocked(user: User, reason: string): Promise<void> {
    await this.mailService.sendAccountLocked(user.email, {
      firstName: user.firstName ?? undefined,
      email: user.email,
      lockReason: reason,
    });
  }

  async notifyTfaEnabled(user: User): Promise<void> {
    await this.mailService.sendTfaEnabled(user.email, {
      firstName: user.firstName ?? undefined,
    });
  }

  async notifyTfaDisabled(user: User): Promise<void> {
    await this.mailService.sendTfaDisabled(user.email, {
      firstName: user.firstName ?? undefined,
    });
  }

  async remove(id: string, adminUserId: string): Promise<void> {
    const user = await this.findOne(id);
    const userId = user.id;
    const email = user.email;
    await this.userRepository.remove(user);

    try {
      await this.auditService.log(
        {
          eventType: AuditEventType.USER_DELETED,
          entityType: 'User',
          entityId: userId,
          entityName: email,
          action: AuditAction.DELETE,
          oldValues: { email },
        },
        { actorId: adminUserId },
      );
    } catch (auditError) {
      this.logger.error(
        'Failed to log audit event for user deletion',
        auditError instanceof Error ? auditError.stack : String(auditError),
      );
    }
  }
}
