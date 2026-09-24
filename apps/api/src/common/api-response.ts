export interface ApiResponse<T> {
  data: T;
}

export const apiResponse = <T>(data: T): ApiResponse<T> => ({ data });
