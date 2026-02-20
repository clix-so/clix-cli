/**
 * Firebase Management API types.
 *
 * @module services/firebase/api/types
 */

export interface FirebaseProject {
  name: string;
  projectId: string;
  projectNumber: string;
  displayName: string;
  state: 'ACTIVE' | 'DELETED';
}

export interface AndroidApp {
  name: string;
  appId: string;
  displayName?: string;
  packageName: string;
  projectId: string;
}

export interface IosApp {
  name: string;
  appId: string;
  displayName?: string;
  bundleId: string;
  projectId: string;
}

export interface CreateAndroidAppRequest {
  packageName: string;
  displayName?: string;
}

export interface CreateIosAppRequest {
  bundleId: string;
  displayName?: string;
}

export interface ServiceAccountJson {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain?: string;
}
