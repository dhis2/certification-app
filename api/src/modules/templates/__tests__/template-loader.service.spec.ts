import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TemplateLoaderService } from '../services/template-loader.service';
import { TemplateValidatorService } from '../services/template-validator.service';
import { TemplateVersioningService } from '../services/template-versioning.service';
import { TemplatesService } from '../templates.service';
import { ControlType, ControlGroup } from '../../../common/enums';

const createMockTemplate = (overrides = {}) => ({
  id: 'template-123',
  name: 'Test Template',
  version: 1,
  description: 'Test description',
  isPublished: true,
  categories: [
    {
      id: 'cat-1',
      name: 'Category 1',
      description: 'Cat desc',
      weight: 1.0,
      sortOrder: 1,
      criteria: [
        {
          id: 'crit-1',
          code: 'TC-01',
          name: 'Test Criterion',
          description: 'Desc',
          guidance: 'Guidance',
          verificationMethod: 'Method',
          weight: 1.0,
          isMandatory: true,
          isCriticalFail: false,
          minPassingScore: 0,
          maxScore: 100,
          evidenceRequired: true,
          evidenceDescription: 'Evidence',
          sortOrder: 1,
          controlGroup: ControlGroup.DSCP1,
          controlType: ControlType.TECHNICAL,
          cisMapping: '1.1',
          justification: 'Continuity of reporting.',
          verificationCommands: 'sudo crontab -l',
          score: null,
          notes: 'Assessor notes here',
        },
      ],
    },
  ],
  ...overrides,
});

function matchingPublishedYaml(
  version: number,
  overrides: { notes?: string } = {},
): string {
  const notes = overrides.notes ?? 'Assessor notes here';
  return `
name: Test Template
description: Test description
version: ${String(version)}
categories:
  - name: Category 1
    description: Cat desc
    weight: 1.0
    sortOrder: 1
    criteria:
      - code: TC-01
        name: Test Criterion
        description: Desc
        guidance: Guidance
        verificationMethod: Method
        isMandatory: true
        isCriticalFail: false
        minPassingScore: 0
        maxScore: 100
        evidenceRequired: true
        evidenceDescription: Evidence
        controlGroup: DSCP1
        controlType: technical
        cisMapping: "1.1"
        justification: Continuity of reporting.
        verificationCommands: sudo crontab -l
        notes: ${notes}
`;
}

describe('TemplateLoaderService', () => {
  let service: TemplateLoaderService;
  let mockConfigService: { get: jest.Mock };
  let mockValidator: {
    validate: jest.Mock;
    loadSchema: jest.Mock;
  };
  let mockTemplatesService: {
    findOne: jest.Mock;
    findPublishedByName: jest.Mock;
    create: jest.Mock;
    createNextVersion: jest.Mock;
  };
  let mockVersioningService: {
    publish: jest.Mock;
    createNewVersion: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue: unknown) => {
          if (key === 'TEMPLATES_PATH') return '/tmp/templates';
          if (key === 'TEMPLATES_AUTO_SYNC') return false;
          return defaultValue;
        }),
    };

    mockValidator = {
      validate: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      loadSchema: jest.fn().mockResolvedValue(undefined),
    };

    mockTemplatesService = {
      findOne: jest.fn().mockResolvedValue(createMockTemplate()),
      findPublishedByName: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue(createMockTemplate({ id: 'new-123' })),
      createNextVersion: jest.fn(),
    };

    mockVersioningService = {
      publish: jest
        .fn()
        .mockResolvedValue(createMockTemplate({ isPublished: true })),
      createNewVersion: jest.fn(),
    };

    service = new TemplateLoaderService(
      mockConfigService as unknown as ConfigService,
      mockValidator as unknown as TemplateValidatorService,
      mockTemplatesService as unknown as TemplatesService,
      mockVersioningService as unknown as TemplateVersioningService,
    );
  });

  describe('loadFromContent', () => {
    it('should parse valid YAML content', () => {
      const yamlContent = `
name: Test Template
version: 1
categories:
  - name: Category 1
    weight: 1.0
    sortOrder: 1
    criteria:
      - code: TC-01
        name: Test
        controlType: technical
`;

      const result = service.loadFromContent(yamlContent);

      expect(result.name).toBe('Test Template');
      expect(result.version).toBe(1);
      expect(result.categories).toHaveLength(1);
    });

    it('maps templateName/templateDescription and fills missing sortOrder', () => {
      const yamlContent = `
templateName: DSCP Controls
templateDescription: From the controls file
version: 1
categories:
  - name: Category 1
    weight: 1.0
    criteria:
      - code: TC-01
        name: Test
        controlType: technical
        verificationCommands: |
          sudo crontab -l
        score: null
        notes: Assessor notes here
`;

      const result = service.loadFromContent(yamlContent);

      expect(result.name).toBe('DSCP Controls');
      expect(result.description).toBe('From the controls file');
      expect(result.categories[0].sortOrder).toBe(1);
      expect(result.categories[0].criteria[0].verificationCommands).toContain(
        'crontab',
      );
      expect(result.categories[0].criteria[0].score).toBeNull();
      expect(result.categories[0].criteria[0].notes).toBe(
        'Assessor notes here',
      );
    });

    it('should reject content exceeding size limit', () => {
      const largeContent = 'a'.repeat(6 * 1024 * 1024);

      expect(() => service.loadFromContent(largeContent)).toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid YAML syntax', () => {
      const invalidYaml = 'name: [invalid yaml';

      expect(() => service.loadFromContent(invalidYaml)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('syncFromContent', () => {
    it('should create and publish template from valid content', async () => {
      const yamlContent = `
name: Test Template
version: 1
categories:
  - name: Category 1
    weight: 1.0
    sortOrder: 1
    criteria:
      - code: TC-01
        name: Test
        controlType: technical
`;

      const result = await service.syncFromContent(yamlContent, 'user-123');

      expect(result.created).toBe(true);
      expect(mockTemplatesService.create).toHaveBeenCalled();
      expect(mockVersioningService.publish).toHaveBeenCalledWith('new-123');
    });

    it('should skip sync if the published catalog is unchanged', async () => {
      mockTemplatesService.findPublishedByName.mockResolvedValue(
        createMockTemplate({ version: 1 }),
      );

      const result = await service.syncFromContent(
        matchingPublishedYaml(1),
        'user-123',
      );

      expect(result.created).toBe(false);
      expect(result.updated).toBe(false);
      expect(mockTemplatesService.create).not.toHaveBeenCalled();
      expect(mockTemplatesService.createNextVersion).not.toHaveBeenCalled();
    });

    it('should publish a new version when the catalog changed', async () => {
      mockTemplatesService.findPublishedByName.mockResolvedValue(
        createMockTemplate({ version: 1 }),
      );
      mockTemplatesService.createNextVersion.mockResolvedValue(
        createMockTemplate({ id: 'template-v2', version: 2 }),
      );

      const result = await service.syncFromContent(
        matchingPublishedYaml(1, { notes: 'Changed notes' }),
        'user-123',
      );

      expect(result.created).toBe(false);
      expect(result.updated).toBe(true);
      expect(result.version).toBe(2);
      expect(mockTemplatesService.create).not.toHaveBeenCalled();
      expect(mockTemplatesService.createNextVersion).toHaveBeenCalledWith(
        'template-123',
        expect.objectContaining({ name: 'Test Template' }),
        'user-123',
      );
      expect(mockVersioningService.publish).toHaveBeenCalledWith('template-v2');
    });

    it('should publish a new version when the file version is higher', async () => {
      mockTemplatesService.findPublishedByName.mockResolvedValue(
        createMockTemplate({ version: 1 }),
      );
      mockTemplatesService.createNextVersion.mockResolvedValue(
        createMockTemplate({ id: 'template-v2', version: 2 }),
      );

      const result = await service.syncFromContent(
        matchingPublishedYaml(2),
        'user-123',
      );

      expect(result.updated).toBe(true);
      expect(mockTemplatesService.createNextVersion).toHaveBeenCalled();
    });

    it('should reject invalid template definition', async () => {
      mockValidator.validate.mockResolvedValue({
        valid: false,
        errors: [{ path: '/name', message: 'Required' }],
      });

      const yamlContent = `
version: 1
categories: []
`;

      await expect(
        service.syncFromContent(yamlContent, 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exportToYaml', () => {
    it('should export template to YAML format', async () => {
      const result = await service.exportToYaml('template-123');

      expect(result).toContain('name: Test Template');
      expect(result).toContain('version: 1');
      expect(result).toContain('TC-01');
    });

    it('should include all criteria fields', async () => {
      const result = await service.exportToYaml('template-123');

      expect(result).toContain('controlType');
      expect(result).toContain('controlGroup');
      expect(result).toContain('isMandatory');
      expect(result).toContain('verificationCommands');
      expect(result).toContain('notes');
    });
  });

  describe('sanitizeFilename', () => {
    it('should reject path traversal attempts', async () => {
      await expect(service.loadFromFile('../../../etc/passwd')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject null bytes in filename', async () => {
      await expect(service.loadFromFile('file\0.yaml')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid extensions', async () => {
      await expect(service.loadFromFile('file.json')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
