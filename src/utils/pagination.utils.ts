export type GetPaginatorReturnType = {
  skip: number;
  limit: number;
  currentPage: number;
  pages: number;
  hasNextPage: boolean;
  totalRecords: number;
  pageSize: number;
};

export const getPaginator = (
  limitParam: number,
  pageParam: number,
  totalRecords: number,
): GetPaginatorReturnType => {
  const limit = Math.max(1, limitParam || 10);
  const currentPage = Math.max(1, pageParam || 1);
  const skip = (currentPage - 1) * limit;
  const pages = Math.ceil(totalRecords / limit);
  const hasNextPage = currentPage < pages;

  return {
    skip,
    limit,
    currentPage,
    pages,
    hasNextPage,
    totalRecords,
    pageSize: limit,
  };
};
