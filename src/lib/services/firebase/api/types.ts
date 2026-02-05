/**
 * Firebase Management API types.
 *
 * @module services/firebase/api/types
 */

/**
 * Firebase project information.
 */
export interface FirebaseProject {
  /**
   * Resource name (e.g., "projects/my-project-id")
   */
  name: string;

  /**
   * Project ID (e.g., "my-project-id")
   */
  projectId: string;

  /**
   * Project number.
   */
  projectNumber: string;

  /**
   * Display name (user-friendly name).
   */
  displayName: string;

  /**
   * Project state.
   */
  state: 'ACTIVE' | 'DELETED';
}

/**
 * Firebase Android app information.
 */
export interface AndroidApp {
  /**
   * Resource name.
   */
  name: string;

  /**
   * App ID (e.g., "1:123456789:android:abcdef")
   */
  appId: string;

  /**
   * Display name.
   */
  displayName?: string;

  /**
   * Android package name (e.g., "com.example.app")
   */
  packageName: string;

  /**
   * Project ID.
   */
  projectId: string;
}

/**
 * Firebase iOS app information.
 */
export interface IosApp {
  /**
   * Resource name.
   */
  name: string;

  /**
   * App ID (e.g., "1:123456789:ios:abcdef")
   */
  appId: string;

  /**
   * Display name.
   */
  displayName?: string;

  /**
   * iOS bundle ID (e.g., "com.example.app")
   */
  bundleId: string;

  /**
   * Project ID.
   */
  projectId: string;
}

/**
 * API response for listing projects.
 */
export interface ListProjectsResponse {
  results?: FirebaseProject[];
  nextPageToken?: string;
}

/**
 * API response for listing Android apps.
 */
export interface ListAndroidAppsResponse {
  apps?: AndroidApp[];
  nextPageToken?: string;
}

/**
 * API response for listing iOS apps.
 */
export interface ListIosAppsResponse {
  apps?: IosApp[];
  nextPageToken?: string;
}

/**
 * API response for app config.
 */
export interface AppConfigResponse {
  /**
   * Config filename (e.g., "google-services.json")
   */
  configFilename: string;

  /**
   * Base64-encoded config file contents.
   */
  configFileContents: string;
}

/**
 * Firebase API error.
 */
export interface FirebaseApiError {
  code: number;
  message: string;
  status: string;
}

/**
 * Request body for creating an Android app.
 */
export interface CreateAndroidAppRequest {
  /**
   * Android package name (e.g., "com.example.app")
   */
  packageName: string;

  /**
   * Display name for the app.
   */
  displayName?: string;
}

/**
 * Request body for creating an iOS app.
 */
export interface CreateIosAppRequest {
  /**
   * iOS bundle ID (e.g., "com.example.app")
   */
  bundleId: string;

  /**
   * Display name for the app.
   */
  displayName?: string;
}

/**
 * Long-running operation response.
 * Firebase app creation returns an operation that completes asynchronously.
 */
export interface Operation<T> {
  /**
   * Operation name (e.g., "operations/abc123")
   */
  name: string;

  /**
   * Whether the operation is done.
   */
  done: boolean;

  /**
   * Operation result when done is true.
   */
  response?: T;

  /**
   * Error details if operation failed.
   */
  error?: {
    code: number;
    message: string;
    details?: unknown[];
  };
}

// ============================================================================
// GCP Project Types
// ============================================================================

/**
 * Google Cloud Platform project information.
 * Used for listing GCP projects that can have Firebase added.
 */
export interface GcpProject {
  /**
   * Project ID (e.g., "my-project-id")
   */
  projectId: string;

  /**
   * Project display name.
   */
  name: string;

  /**
   * Project number.
   */
  projectNumber: string;

  /**
   * Project lifecycle state.
   */
  lifecycleState: 'ACTIVE' | 'DELETE_REQUESTED' | 'DELETE_IN_PROGRESS';

  /**
   * Project creation time.
   */
  createTime?: string;
}

/**
 * API response for listing GCP projects.
 */
export interface ListGcpProjectsResponse {
  projects?: GcpProject[];
  nextPageToken?: string;
}

// ============================================================================
// Service Account Types
// ============================================================================

/**
 * Google Cloud Service Account.
 */
export interface ServiceAccount {
  /**
   * Resource name (e.g., "projects/{project}/serviceAccounts/{email}")
   */
  name: string;

  /**
   * Project ID this service account belongs to.
   */
  projectId: string;

  /**
   * Unique ID.
   */
  uniqueId: string;

  /**
   * Service account email (e.g., "name@project.iam.gserviceaccount.com")
   */
  email: string;

  /**
   * Display name.
   */
  displayName?: string;

  /**
   * Description.
   */
  description?: string;

  /**
   * Whether the service account is disabled.
   */
  disabled?: boolean;
}

/**
 * Request body for creating a service account.
 */
export interface CreateServiceAccountRequest {
  /**
   * Service account ID (the part before @ in the email).
   * Must be between 6 and 30 characters, lowercase letters, digits, and hyphens.
   */
  accountId: string;

  /**
   * Service account details.
   */
  serviceAccount: {
    displayName?: string;
    description?: string;
  };
}

/**
 * API response for listing service accounts.
 */
export interface ListServiceAccountsResponse {
  accounts?: ServiceAccount[];
  nextPageToken?: string;
}

/**
 * Service account key.
 */
export interface ServiceAccountKey {
  /**
   * Resource name.
   */
  name: string;

  /**
   * Private key type.
   */
  privateKeyType: string;

  /**
   * Key algorithm.
   */
  keyAlgorithm: string;

  /**
   * Base64-encoded private key data (JSON format).
   */
  privateKeyData: string;

  /**
   * Key valid after time.
   */
  validAfterTime: string;

  /**
   * Key valid before time.
   */
  validBeforeTime: string;
}

/**
 * Request body for creating a service account key.
 */
export interface CreateServiceAccountKeyRequest {
  /**
   * Private key type. Use 'TYPE_GOOGLE_CREDENTIALS_FILE' for JSON format.
   */
  privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE' | 'TYPE_PKCS12_FILE';

  /**
   * Key algorithm.
   */
  keyAlgorithm?: 'KEY_ALG_RSA_2048' | 'KEY_ALG_RSA_1024';
}

/**
 * Firebase/Google Cloud Service Account JSON key file structure.
 * This is the format of the downloaded JSON key file.
 */
export interface ServiceAccountJson {
  /**
   * Always "service_account".
   */
  type: 'service_account';

  /**
   * GCP project ID.
   */
  project_id: string;

  /**
   * Private key ID.
   */
  private_key_id: string;

  /**
   * Private key in PEM format.
   */
  private_key: string;

  /**
   * Service account email.
   */
  client_email: string;

  /**
   * Client ID.
   */
  client_id: string;

  /**
   * Auth URI.
   */
  auth_uri: string;

  /**
   * Token URI.
   */
  token_uri: string;

  /**
   * Auth provider certificate URL.
   */
  auth_provider_x509_cert_url: string;

  /**
   * Client certificate URL.
   */
  client_x509_cert_url: string;

  /**
   * Universe domain (optional, for specialized environments).
   */
  universe_domain?: string;
}
