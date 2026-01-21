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
