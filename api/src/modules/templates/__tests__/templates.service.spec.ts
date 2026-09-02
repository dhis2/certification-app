jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

import { Test, type TestingModule } from '@nestjs/testing';
import type { Repository, DataSource } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TemplatesService } from '../templates.service';
import { AssessmentTemplate } from '../entities/assessment-template.entity';
import { User } from '../../users/entities/user.entity';

import type { InMemoryCacheService } from '../../../common/cache';

const mockQueryBuilder = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(),
};

const createMockUser = (overrides: Partial<User> = {}): User => {
  const user = new User();
  user.id = 'user-123';
  user.email = 'admin@example.com';
  user.firstName = 'Admin';
  user.lastName = 'User';
  user.password = 'hashed';
  user.isActive = true;
  user.createdAt = new Date();
  user.updatedAt = new Date();
  Object.assign(user, overrides);
  return user;
};

const createMockTemplate = (
  overrides: Partial<AssessmentTemplate> = {},
): AssessmentTemplate => {
  const template = new AssessmentTemplate();
  template.id = 'template-123';
  template.name = 'DHIS2 Server Certification';
  template.description = 'Test template';
  template.version = 1;
  template.isPublished = false;
  template.parentVersionId = null;
  template.effectiveFrom = null;
  template.effectiveTo = null;
  template.createdById = 'user-123';
  template.createdAt = new Date();
  template.updatedAt = new Date();
  template.categories = [];
  Object.assign(template, overrides);
  return template;
};

describe('TemplatesService', () => {
  let service: TemplatesService;
  let mockTemplateRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockDataSource: {
    transaction: jest.Mock;
    manager: Record<string, jest.Mock>;
  };
  let mockCacheService: {
    get: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    deleteByPrefix: jest.Mock;
  };
  let mockAuditService: {
    log: jest.Mock;
  };

  beforeEach(async () => {
    mockTemplateRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockDataSource = {
      transaction: jest.fn(),
      manager: {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
      },
    };

    mockCacheService = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
      delete: jest.fn(),
      deleteByPrefix: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TemplatesService,
          useFactory: () => {
            return new TemplatesService(
              mockTemplateRepository as unknown as Repository<AssessmentTemplate>,
              mockDataSource as unknown as DataSource,
              mockCacheService as unknown as InMemoryCacheService,
              mockAuditService as unknown as import('../../audit').AuditService,
            );
          },
        },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated templates', async () => {
      const templates = [createMockTemplate()];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([templates, 1]);

      const result = await service.findAll({ first: 10 });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].node).toEqual(templates[0]);
      expect(result.totalCount).toBe(1);
    });

    it('should filter by isPublished', async () => {
      const templates = [createMockTemplate({ isPublished: true })];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([templates, 1]);

      await service.findAll({ isPublished: true });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'template.isPublished = :isPublished',
        { isPublished: true },
      );
    });

    it('should filter by search', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ search: 'DHIS2' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        '(template.name ILIKE :search OR template.description ILIKE :search)',
        { search: '%DHIS2%' },
      );
    });
  });

  describe('findOne', () => {
    it('should return template with categories and criteria', async () => {
      const template = createMockTemplate();
      mockTemplateRepository.findOne.mockResolvedValue(template);

      const result = await service.findOne('template-123');

      expect(result).toEqual(template);
      expect(mockTemplateRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'template-123' },
        relations: ['categories', 'categories.criteria'],
        order: { categories: { sortOrder: 'ASC' } },
      });
    });

    it('should throw NotFoundException when template not found', async () => {
      mockTemplateRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a new template', async () => {
      const user = createMockUser();
      const template = createMockTemplate();

      mockTemplateRepository.findOne.mockResolvedValue(null);
      mockDataSource.transaction.mockImplementation(
        (callback: (manager: unknown) => Promise<AssessmentTemplate>) => {
          const mockManager = {
            create: jest.fn().mockReturnValue(template),
            save: jest.fn().mockResolvedValue(template),
            findOne: jest.fn().mockResolvedValue(template),
          };
          return callback(mockManager);
        },
      );

      const result = await service.create(
        { name: 'DHIS2 Server Certification' },
        user.id,
      );

      expect(result).toEqual(template);
    });

    it('should throw ConflictException for duplicate name', async () => {
      const user = createMockUser();
      const existingTemplate = createMockTemplate();
      mockTemplateRepository.findOne.mockResolvedValue(existingTemplate);

      await expect(
        service.create({ name: 'DHIS2 Server Certification' }, user.id),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createNextVersion', () => {
    it('should create the next version from a published template', async () => {
      const source = createMockTemplate({ isPublished: true, version: 1 });
      const created = createMockTemplate({
        id: 'template-v2',
        version: 2,
        isPublished: false,
        parentVersionId: source.id,
      });

      mockTemplateRepository.findOne
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(source);
      mockDataSource.transaction.mockImplementation(
        (callback: (manager: unknown) => Promise<AssessmentTemplate>) => {
          const mockManager = {
            create: jest.fn().mockReturnValue(created),
            save: jest.fn().mockResolvedValue(created),
            findOne: jest.fn().mockResolvedValue(created),
          };
          return callback(mockManager);
        },
      );

      const result = await service.createNextVersion(
        source.id,
        { name: source.name, description: 'Updated catalog' },
        'user-123',
      );

      expect(result.version).toBe(2);
      expect(result.parentVersionId).toBe(source.id);
    });

    it('should throw if the source template is not published', async () => {
      mockTemplateRepository.findOne.mockResolvedValue(
        createMockTemplate({ isPublished: false }),
      );

      await expect(
        service.createNextVersion(
          'template-123',
          { name: 'DHIS2 Server Certification' },
          'user-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update a draft template', async () => {
      const template = createMockTemplate({ isPublished: false });
      // First call returns template for initial find, second call returns null for conflict check
      // Third call returns template again for the final findOne after save
      mockTemplateRepository.findOne
        .mockResolvedValueOnce(template) // findOne(id)
        .mockResolvedValueOnce(null) // name conflict check
        .mockResolvedValueOnce(template); // findOne(id) after save
      mockTemplateRepository.save.mockResolvedValue(template);

      const result = await service.update(
        'template-123',
        {
          name: 'Updated Name',
        },
        'user-123',
      );

      expect(result.name).toBe('Updated Name');
    });

    it('should throw BadRequestException for published template', async () => {
      const template = createMockTemplate({ isPublished: true });
      mockTemplateRepository.findOne.mockResolvedValue(template);

      await expect(
        service.update('template-123', { name: 'Updated Name' }, 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete a draft template', async () => {
      const template = createMockTemplate({ isPublished: false });
      mockTemplateRepository.findOne.mockResolvedValue(template);
      mockTemplateRepository.remove.mockResolvedValue(template);

      await service.delete('template-123', 'user-123');

      expect(mockTemplateRepository.remove).toHaveBeenCalledWith(template);
    });

    it('should throw BadRequestException for published template', async () => {
      const template = createMockTemplate({ isPublished: true });
      mockTemplateRepository.findOne.mockResolvedValue(template);

      await expect(service.delete('template-123', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
