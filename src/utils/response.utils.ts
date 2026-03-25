import type { GetPaginatorReturnType } from './pagination.utils';

export function successResponse<T>(data: T, message = 'Success', statusCode = 200) {
  return { success: true, statusCode, message, data };
}

export function paginatedResponse<T>(items: T[], paginator: GetPaginatorReturnType, message = 'Success') {
  return {
    success: true,
    statusCode: 200,
    message,
    data: items,
    meta: {
      page: paginator.currentPage,
      limit: paginator.pageSize,
      total: paginator.totalRecords,
      totalPages: paginator.pages,
    },
  };
}
