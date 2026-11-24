import { type Category, type Service } from '../../../src/modules/catalog/domain/catalog.js';

const at = new Date('2030-01-01T00:00:00Z');

export const aCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  name: 'Electrician',
  slug: 'electrician',
  description: null,
  iconUrl: null,
  sortOrder: 0,
  isActive: true,
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

export const aService = (overrides: Partial<Service> = {}): Service => ({
  id: 'svc-1',
  categoryId: 'cat-1',
  name: 'Fan Installation',
  slug: 'fan-installation',
  description: null,
  isActive: true,
  createdAt: at,
  updatedAt: at,
  ...overrides,
});
