export interface ApiResponseType<T = any> {
  success: boolean;
  status: string;
  message: string;
  data?: T;
}

export class UpdateBVNDto {
  bvn: string;
}

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}
