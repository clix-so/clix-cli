/**
 * Firebase credential file validation.
 *
 * Validates Firebase configuration files against Zod schemas.
 *
 * @module services/firebase/validator
 */

import type { ZodError, ZodSchema } from 'zod';
import {
  GoogleServiceInfoPlistSchema,
  GoogleServicesJsonSchema,
  MinimalGoogleServiceInfoPlistSchema,
  MinimalGoogleServicesJsonSchema,
} from './schemas';
import type {
  GoogleServiceInfoPlist,
  GoogleServicesJson,
  ValidationError,
  ValidationResult,
} from './types';

/**
 * Convert Zod errors to validation errors.
 */
function zodErrorsToValidationErrors(zodError: ZodError): ValidationError[] {
  return zodError.issues.map((issue) => ({
    path: issue.path.join('.') || 'root',
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validate data against a Zod schema.
 */
function validateWithSchema<T>(
  data: unknown,
  schema: ZodSchema<T>,
): { valid: boolean; errors: ValidationError[]; data?: T } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true, errors: [], data: result.data };
  }

  return {
    valid: false,
    errors: zodErrorsToValidationErrors(result.error),
  };
}

/**
 * Validate google-services.json content.
 *
 * @param content - Parsed JSON content
 * @returns Validation result with errors if invalid
 */
export function validateGoogleServicesJson(content: unknown): ValidationResult {
  // First do a quick check to see if it's the right type of file
  const minimalCheck = validateWithSchema(content, MinimalGoogleServicesJsonSchema);

  if (!minimalCheck.valid) {
    // Check if it might be a GoogleService-Info.plist instead
    const plistCheck = validateWithSchema(content, MinimalGoogleServiceInfoPlistSchema);
    if (plistCheck.valid) {
      return {
        valid: false,
        errors: [
          {
            path: 'root',
            message:
              'This appears to be a GoogleService-Info.plist (iOS) file, not a google-services.json (Android) file',
            code: 'WRONG_FILE_TYPE',
          },
        ],
      };
    }

    return {
      valid: false,
      errors: [
        {
          path: 'root',
          message: 'File does not appear to be a valid Firebase configuration file',
          code: 'INVALID_FORMAT',
        },
        ...minimalCheck.errors,
      ],
    };
  }

  // Full validation
  const fullResult = validateWithSchema(content, GoogleServicesJsonSchema);

  if (fullResult.valid) {
    return {
      valid: true,
      errors: [],
      data: fullResult.data as GoogleServicesJson,
    };
  }

  return {
    valid: false,
    errors: fullResult.errors,
  };
}

/**
 * Validate GoogleService-Info.plist content.
 *
 * @param content - Parsed plist content (as JSON object)
 * @returns Validation result with errors if invalid
 */
export function validateGoogleServiceInfoPlist(content: unknown): ValidationResult {
  // First do a quick check to see if it's the right type of file
  const minimalCheck = validateWithSchema(content, MinimalGoogleServiceInfoPlistSchema);

  if (!minimalCheck.valid) {
    // Check if it might be a google-services.json instead
    const jsonCheck = validateWithSchema(content, MinimalGoogleServicesJsonSchema);
    if (jsonCheck.valid) {
      return {
        valid: false,
        errors: [
          {
            path: 'root',
            message:
              'This appears to be a google-services.json (Android) file, not a GoogleService-Info.plist (iOS) file',
            code: 'WRONG_FILE_TYPE',
          },
        ],
      };
    }

    return {
      valid: false,
      errors: [
        {
          path: 'root',
          message: 'File does not appear to be a valid Firebase configuration file',
          code: 'INVALID_FORMAT',
        },
        ...minimalCheck.errors,
      ],
    };
  }

  // Full validation
  const fullResult = validateWithSchema(content, GoogleServiceInfoPlistSchema);

  if (fullResult.valid) {
    return {
      valid: true,
      errors: [],
      data: fullResult.data as GoogleServiceInfoPlist,
    };
  }

  return {
    valid: false,
    errors: fullResult.errors,
  };
}

/**
 * Validate that the package name in google-services.json matches the expected package.
 *
 * @param googleServices - Validated google-services.json content
 * @param expectedPackageName - Expected Android package name
 * @returns Validation result
 */
export function validatePackageNameMatch(
  googleServices: GoogleServicesJson,
  expectedPackageName: string,
): ValidationResult {
  const packageNames = googleServices.client.map(
    (client) => client.client_info.android_client_info.package_name,
  );

  if (packageNames.includes(expectedPackageName)) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [
      {
        path: 'client.client_info.android_client_info.package_name',
        message: `Package name mismatch. Expected "${expectedPackageName}", found: ${packageNames.join(', ')}`,
        code: 'PACKAGE_MISMATCH',
      },
    ],
  };
}

/**
 * Validate that the bundle ID in GoogleService-Info.plist matches the expected bundle ID.
 *
 * @param serviceInfo - Validated GoogleService-Info.plist content
 * @param expectedBundleId - Expected iOS bundle ID
 * @returns Validation result
 */
export function validateBundleIdMatch(
  serviceInfo: GoogleServiceInfoPlist,
  expectedBundleId: string,
): ValidationResult {
  if (serviceInfo.BUNDLE_ID === expectedBundleId) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [
      {
        path: 'BUNDLE_ID',
        message: `Bundle ID mismatch. Expected "${expectedBundleId}", found: "${serviceInfo.BUNDLE_ID}"`,
        code: 'BUNDLE_MISMATCH',
      },
    ],
  };
}

/**
 * Extract project ID from google-services.json.
 *
 * @param content - google-services.json content
 * @returns Project ID or undefined if not found
 */
export function extractProjectId(content: GoogleServicesJson): string {
  return content.project_info.project_id;
}

/**
 * Extract project ID from GoogleService-Info.plist.
 *
 * @param content - GoogleService-Info.plist content
 * @returns Project ID or undefined if not found
 */
export function extractProjectIdFromPlist(content: GoogleServiceInfoPlist): string {
  return content.PROJECT_ID;
}

/**
 * Validate that both Android and iOS files point to the same Firebase project.
 *
 * @param googleServices - Validated google-services.json content
 * @param serviceInfo - Validated GoogleService-Info.plist content
 * @returns Validation result
 */
export function validateProjectIdMatch(
  googleServices: GoogleServicesJson,
  serviceInfo: GoogleServiceInfoPlist,
): ValidationResult {
  const androidProjectId = extractProjectId(googleServices);
  const iosProjectId = extractProjectIdFromPlist(serviceInfo);

  if (androidProjectId === iosProjectId) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [
      {
        path: 'project_id',
        message: `Project ID mismatch between platforms. Android: "${androidProjectId}", iOS: "${iosProjectId}"`,
        code: 'PROJECT_MISMATCH',
      },
    ],
  };
}
