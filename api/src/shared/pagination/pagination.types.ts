export interface Edge<T> {
  node: T;
  cursor: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Connection<T> {
  edges: Edge<T>[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface CursorPaginationOptions {
  first?: number;
  after?: string;
}

export interface SearchOptions {
  search?: string;
}

export type PaginatedSearchOptions = CursorPaginationOptions & SearchOptions;

export const PAGINATION_DEFAULTS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_SEARCH_LENGTH: 100,
} as const;
