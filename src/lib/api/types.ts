/**
 * Member information from Internal API.
 */
export interface Member {
  id: string;
  auth_provider_id: string;
  email: string;
  name: string;
  profile_image_url?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Organization information from Internal API.
 */
export interface Organization {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Project information from Internal API.
 */
export interface Project {
  id: string;
  name: string;
  organization_id: string;
  public_key?: string;
  sender_configs?: SenderConfig[];
  created_at?: string;
  updated_at?: string;
}

/**
 * App push sender configuration for FCM.
 */
export interface AppPushSenderConfig {
  ios_config?: { fcm_sa_json_base64_encoded: string };
  android_config?: { fcm_sa_json_base64_encoded: string };
}

/**
 * Sender configuration for push notifications.
 */
export interface SenderConfig {
  channel_type: string;
  app_push?: AppPushSenderConfig;
  created_at?: string;
  updated_at?: string;
}

/**
 * API response wrapper for single item.
 */
export interface ApiResponse<T> {
  data: T;
}

/**
 * API response wrapper for list items.
 */
export interface ApiListResponse<T> {
  data: T[];
}

/**
 * API error response.
 */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  status_code?: number;
}
