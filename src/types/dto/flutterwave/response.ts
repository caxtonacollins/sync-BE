export interface ApiResponseType<T = any> {
  success: boolean;
  status: string;
  message: string;
  data?: T;
}

export interface CustomerDetails {
  email: string;
  name: string;
  phone: string;
}

export interface PaymentCustomizations {
  title: string;
  description: string;
  logo: string;
}

export interface InitializePaymentData {
  publicKey: string;
  txRef: string;
  amount: number;
  currency: string;
  customer: CustomerDetails;
  customizations: PaymentCustomizations;
}

export interface InitializePaymentResponse extends ApiResponseType<InitializePaymentData> {}


export class UpdateBVNDto {
  bvn: string;
}

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}
