/**
 * Firebase Management API module.
 *
 * @module services/firebase/api
 */

export { FirebaseApiClient } from './firebase-api';
export { IamApiClient } from './iam-api';
export type {
  AndroidApp,
  AppConfigResponse,
  CreateAndroidAppRequest,
  CreateIosAppRequest,
  CreateServiceAccountKeyRequest,
  CreateServiceAccountRequest,
  FirebaseApiError,
  FirebaseProject,
  GcpProject,
  IosApp,
  ListAndroidAppsResponse,
  ListGcpProjectsResponse,
  ListIosAppsResponse,
  ListProjectsResponse,
  ListServiceAccountsResponse,
  Operation,
  ServiceAccount,
  ServiceAccountJson,
  ServiceAccountKey,
} from './types';
