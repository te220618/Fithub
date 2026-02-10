import api from './api';
import { AxiosError } from 'axios';

export type ContactRequest = {
  kind: 'bug' | 'request' | 'other';
  summary: string;
  detail: string;
  reproduction?: string;
  contactOk: boolean;
  email?: string;
  pagePath: string;
  userAgent: string;
  screenWidth?: number;
  screenHeight?: number;
};

export type ContactErrorResponse = {
  success: false;
  message: string;
  field?: 'summary' | 'detail' | 'reproduction';
};

export type ContactSuccessResponse = {
  success: true;
};

export type ContactResponse = ContactSuccessResponse | ContactErrorResponse;

export class ContactApiError extends Error {
  field?: string;
  
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ContactApiError';
    this.field = field;
  }
}

const contactApi = {
  submit: async (payload: ContactRequest, images: File[] = []): Promise<ContactSuccessResponse> => {
    const formData = new FormData();
    formData.append('data', JSON.stringify(payload));
    images.forEach((file) => formData.append('images', file));

    try {
      const response = await api.post<ContactResponse>('/api/contact', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      // サーバーが200で返してもsuccess: falseの場合がある（禁止ワードエラー）
      if (response.data.success === false) {
        throw new ContactApiError(response.data.message, response.data.field);
      }
      
      return response.data;
    } catch (error) {
      if (error instanceof ContactApiError) {
        throw error;
      }
      
      // Axiosエラーの場合、レスポンスボディをチェック
      if (error instanceof AxiosError && error.response?.data) {
        const data = error.response.data as ContactErrorResponse;
        if (data.message && data.field) {
          throw new ContactApiError(data.message, data.field);
        }
        if (data.message) {
          throw new ContactApiError(data.message);
        }
      }
      
      throw error;
    }
  },
};

export default contactApi;
