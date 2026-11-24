import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from '../../../../test/unit/fixtures/files.js';
import { aDocument, aProvider } from '../../../../test/unit/fixtures/providers.js';
import { FakeUnitOfWork, FixedClock, mockOf } from '../../../../test/unit/mock.js';
import { FileTypeNotAllowedError } from '../../../common/files/upload-policy.js';
import { FileStorage } from '../../../common/ports/file-storage.port.js';
import {
  AvailabilityRepository,
  DocumentRepository,
  PortfolioRepository,
  ProviderRepository,
} from '../domain/provider.repositories.js';
import {
  AvailabilityOverlapError,
  BlockedDateInPastError,
  BlockedDateNotFoundError,
  DocumentLockedError,
  DocumentNotFoundError,
  InvalidCalendarDateError,
  PortfolioImageNotFoundError,
  UploadNotAllowedError,
} from '../domain/providers.errors.js';
import {
  AddBlockedDateUseCase,
  GetMyAvailabilityUseCase,
  RemoveBlockedDateUseCase,
  ReplaceAvailabilityWindowsUseCase,
  UpdateProviderSettingsUseCase,
} from './availability.use-cases.js';
import {
  DeleteDocumentUseCase,
  ListMyDocumentsUseCase,
  UploadDocumentUseCase,
} from './documents.use-cases.js';
import {
  AddPortfolioImageUseCase,
  DeletePortfolioImageUseCase,
  ListMyPortfolioUseCase,
} from './portfolio.use-cases.js';

const providers = mockOf<ProviderRepository>();
const storage = mockOf<FileStorage>();
const pdf = {
  buffer: SAMPLE_FILES.pdf,
  declaredMimeType: 'application/pdf',
  size: SAMPLE_FILES.pdf.length,
  originalName: 'id.pdf',
};
const png = {
  buffer: SAMPLE_FILES.png,
  declaredMimeType: 'image/png',
  size: SAMPLE_FILES.png.length,
  originalName: 'a.png',
};
const image = {
  id: 'img-1',
  providerId: 'prov-1',
  storageKey: 'k.png',
  mimeType: 'image/png',
  sizeBytes: 9,
  caption: null,
  sortOrder: 0,
  createdAt: new Date(),
};

beforeEach(() => {
  providers.findByUserId.mockResolvedValue(aProvider());
  storage.signedUrl.mockReturnValue({ url: 'signed', expiresAt: new Date('2030-01-01T00:05:00Z') });
  storage.publicUrl.mockReturnValue('public');
});

describe('document use cases', () => {
  const documents = mockOf<DocumentRepository>();
  const upload = new UploadDocumentUseCase(providers, documents, storage);

  beforeEach(() => {
    documents.count.mockResolvedValue(0);
    documents.create.mockResolvedValue(aDocument());
  });

  it('lists documents with signed links', async () => {
    documents.list.mockResolvedValue([aDocument()]);
    const [view] = await new ListMyDocumentsUseCase(providers, documents, storage).execute(
      'user-p1',
    );
    expect(view).toMatchObject({ url: 'signed', document: { id: 'doc-1' } });
  });

  it('stores a valid document privately under a random key', async () => {
    const view = await upload.execute('user-p1', 'CITIZENSHIP', pdf);
    expect(view.url).toBe('signed');
    const [key, , visibility] = storage.put.mock.calls[0] ?? [];
    expect(key).toMatch(/^providers\/prov-1\/documents\/[0-9a-f-]{36}\.pdf$/);
    expect(visibility).toBe('private');
    expect(documents.create).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'application/pdf', originalName: 'id.pdf' }),
    );
  });

  it('refuses suspended providers, full quotas and bad files', async () => {
    providers.findByUserId.mockResolvedValueOnce(aProvider({ verificationStatus: 'SUSPENDED' }));
    await expect(upload.execute('user-p1', 'CITIZENSHIP', pdf)).rejects.toBeInstanceOf(
      UploadNotAllowedError,
    );
    documents.count.mockResolvedValueOnce(10);
    await expect(upload.execute('user-p1', 'CITIZENSHIP', pdf)).rejects.toBeInstanceOf(
      UploadNotAllowedError,
    );
    await expect(
      upload.execute('user-p1', 'CITIZENSHIP', { ...pdf, declaredMimeType: 'image/png' }),
    ).rejects.toBeInstanceOf(FileTypeNotAllowedError);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('removes the stored file when saving metadata fails', async () => {
    documents.create.mockRejectedValue(new Error('db down'));
    await expect(upload.execute('user-p1', 'CITIZENSHIP', pdf)).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0]?.[0], 'private');
  });

  it('deletes only unreviewed own documents', async () => {
    const remove = new DeleteDocumentUseCase(providers, documents, storage);
    documents.findOwned.mockResolvedValueOnce(aDocument());
    await remove.execute('user-p1', 'doc-1');
    expect(documents.delete).toHaveBeenCalledWith('doc-1');
    expect(storage.delete).toHaveBeenCalledWith('providers/prov-1/documents/doc.pdf', 'private');

    documents.findOwned.mockResolvedValueOnce(aDocument({ status: 'APPROVED' }));
    await expect(remove.execute('user-p1', 'doc-1')).rejects.toBeInstanceOf(DocumentLockedError);
    documents.findOwned.mockResolvedValueOnce(null);
    await expect(remove.execute('user-p1', 'doc-1')).rejects.toBeInstanceOf(DocumentNotFoundError);
  });
});

describe('portfolio use cases', () => {
  const portfolio = mockOf<PortfolioRepository>();
  const add = new AddPortfolioImageUseCase(providers, portfolio, storage);

  beforeEach(() => {
    portfolio.count.mockResolvedValue(2);
    portfolio.create.mockResolvedValue(image);
  });

  it('lists and adds public images at the end of the list', async () => {
    portfolio.list.mockResolvedValue([image]);
    expect(
      await new ListMyPortfolioUseCase(providers, portfolio, storage).execute('user-p1'),
    ).toEqual([{ image, url: 'public' }]);
    await add.execute('user-p1', png, 'Kitchen');
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/\/portfolio\/.+\.png$/),
      png.buffer,
      'public',
    );
    expect(portfolio.create).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 2, caption: 'Kitchen' }),
    );
  });

  it('enforces the image limit and cleans up on failure', async () => {
    portfolio.count.mockResolvedValueOnce(20);
    await expect(add.execute('user-p1', png, null)).rejects.toBeInstanceOf(UploadNotAllowedError);
    portfolio.create.mockRejectedValueOnce(new Error('db down'));
    await expect(add.execute('user-p1', png, null)).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith(expect.any(String), 'public');
  });

  it('deletes own images only', async () => {
    const remove = new DeletePortfolioImageUseCase(providers, portfolio, storage);
    portfolio.findOwned.mockResolvedValueOnce(image).mockResolvedValueOnce(null);
    await remove.execute('user-p1', 'img-1');
    expect(storage.delete).toHaveBeenCalledWith('k.png', 'public');
    await expect(remove.execute('user-p1', 'img-1')).rejects.toBeInstanceOf(
      PortfolioImageNotFoundError,
    );
  });
});

describe('availability use cases', () => {
  const availability = mockOf<AvailabilityRepository>();
  const clock = new FixedClock(new Date('2030-01-07T04:15:00Z'));

  it('returns windows, upcoming blocked dates and settings', async () => {
    availability.getWindows.mockResolvedValue([]);
    availability.listBlockedDates.mockResolvedValue([]);
    availability.getSettings.mockResolvedValue({ maxDailyBookings: 5, slotMinutes: 60 });
    await new GetMyAvailabilityUseCase(providers, availability, clock).execute('user-p1');
    expect(availability.listBlockedDates).toHaveBeenCalledWith('prov-1', '2030-01-07');
  });

  it('replaces a valid schedule atomically and rejects overlaps', async () => {
    const uow = new FakeUnitOfWork();
    const useCase = new ReplaceAvailabilityWindowsUseCase(providers, availability, uow);
    const windows = [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }];
    availability.getWindows.mockResolvedValue(windows);
    await expect(useCase.execute('user-p1', windows)).resolves.toEqual(windows);
    expect(uow.runs).toBe(1);
    await expect(
      useCase.execute('user-p1', [...windows, { dayOfWeek: 1, startMinute: 600, endMinute: 700 }]),
    ).rejects.toBeInstanceOf(AvailabilityOverlapError);
  });

  it('blocks today or later valid dates only', async () => {
    const useCase = new AddBlockedDateUseCase(providers, availability, clock);
    availability.addBlockedDate.mockResolvedValue({
      id: 'b',
      providerId: 'prov-1',
      date: '2030-01-07',
      reason: null,
    });
    await expect(useCase.execute('user-p1', '2030-01-07', null)).resolves.toMatchObject({
      date: '2030-01-07',
    });
    await expect(useCase.execute('user-p1', '2030-01-06', null)).rejects.toBeInstanceOf(
      BlockedDateInPastError,
    );
    await expect(useCase.execute('user-p1', '2030-02-30', null)).rejects.toBeInstanceOf(
      InvalidCalendarDateError,
    );
    await expect(useCase.execute('user-p1', '2031-06-01', null)).rejects.toBeInstanceOf(
      BlockedDateInPastError,
    );
  });

  it('unblocks own dates and updates settings', async () => {
    const remove = new RemoveBlockedDateUseCase(providers, availability);
    availability.removeBlockedDate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await remove.execute('user-p1', 'b');
    await expect(remove.execute('user-p1', 'b')).rejects.toBeInstanceOf(BlockedDateNotFoundError);

    availability.updateSettings.mockResolvedValue({ maxDailyBookings: 3, slotMinutes: 90 });
    const settings = await new UpdateProviderSettingsUseCase(providers, availability).execute(
      'user-p1',
      { slotMinutes: 90 },
    );
    expect(settings.slotMinutes).toBe(90);
  });
});
