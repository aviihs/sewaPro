export interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly iconUrl: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Service {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewCategory = Pick<
  Category,
  'name' | 'slug' | 'description' | 'iconUrl' | 'sortOrder' | 'isActive'
>;
export type CategoryChanges = Partial<NewCategory>;

export type NewService = Pick<Service, 'categoryId' | 'name' | 'slug' | 'description' | 'isActive'>;
export type ServiceChanges = Partial<NewService>;

/** Read model for public listing: an active category and its active services. */
export interface ActiveCategory {
  readonly category: Category;
  readonly services: readonly Service[];
}

/**
 * What happened on DELETE: entries still offered by providers are only
 * deactivated (history and provider links stay valid); unused ones are soft-deleted.
 */
export const RemovalOutcome = { DELETED: 'DELETED', DEACTIVATED: 'DEACTIVATED' } as const;
export type RemovalOutcome = (typeof RemovalOutcome)[keyof typeof RemovalOutcome];

export function removalOutcome(hasActiveProviderLinks: boolean): RemovalOutcome {
  return hasActiveProviderLinks ? RemovalOutcome.DEACTIVATED : RemovalOutcome.DELETED;
}
