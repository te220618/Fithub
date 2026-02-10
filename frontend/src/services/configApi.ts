import api from './api';

export interface PublicConfigResponse {
  googleMapsApiKey?: string;
}

export const getPublicConfig = async (): Promise<PublicConfigResponse> => {
  const response = await api.get<PublicConfigResponse>('/api/public-config');
  return response.data;
};
