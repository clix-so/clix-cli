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
