/**
 * Service Account JSON validation utilities.
 *
 * Validates Firebase/Google Cloud Service Account JSON key files.
 *
 * @module services/firebase/service-account-validator
 */

import { z } from 'zod';

/**
 * Firebase/Google Cloud Service Account JSON schema.
 *
 * This is the structure of the JSON key file downloaded from
 * Firebase Console or Google Cloud Console.
 */
export const ServiceAccountJsonSchema = z.object({
  // Type must be exactly "service_account"
  type: z.literal('service_account'),

  // Project ID (required)
  project_id: z.string().min(1, 'project_id is required'),

  // Private key ID (required)
  private_key_id: z.string().min(1, 'private_key_id is required'),

  // Private key in PEM format (required)
  private_key: z
    .string()
    .min(1, 'private_key is required')
    .refine(
      (key) => key.includes('-----BEGIN') && key.includes('PRIVATE KEY-----'),
      'Invalid private_key format (must be PEM format)',
    ),

  // Service account email (required)
  client_email: z
    .string()
    .email('Invalid client_email format')
    .refine(
      (email) => email.endsWith('.iam.gserviceaccount.com'),
      'client_email must be a service account email (*.iam.gserviceaccount.com)',
    ),

  // Client ID (required)
  client_id: z.string().min(1, 'client_id is required'),

  // Auth URI (required)
  auth_uri: z.string().url('Invalid auth_uri URL'),

  // Token URI (required)
  token_uri: z.string().url('Invalid token_uri URL'),

  // Auth provider certificate URL (required)
  auth_provider_x509_cert_url: z.string().url('Invalid auth_provider_x509_cert_url'),

  // Client certificate URL (required)
  client_x509_cert_url: z.string().url('Invalid client_x509_cert_url'),

  // Universe domain (optional, for specialized environments)
  universe_domain: z.string().optional(),
});

/**
 * Validated Service Account JSON type.
 */
export type ValidatedServiceAccountJson = z.infer<typeof ServiceAccountJsonSchema>;

/**
 * Validation result.
 */
export interface ServiceAccountValidationResult {
  /**
   * Whether the JSON is valid.
   */
  valid: boolean;

  /**
   * Validated data if valid.
   */
  data?: ValidatedServiceAccountJson;

  /**
   * Error messages if invalid.
   */
  errors: string[];
}

/**
 * Parse and validate a Service Account JSON string.
 *
 * @param jsonString - JSON string to validate
 * @returns Validation result with parsed data or errors
 */
export function parseServiceAccountJson(jsonString: string): ServiceAccountValidationResult {
  // 1. Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid JSON';
    return {
      valid: false,
      errors: [`JSON parse error: ${message}`],
    };
  }

  // 2. Validate against schema
  return validateServiceAccountJson(parsed);
}

/**
 * Validate a parsed object against the Service Account JSON schema.
 *
 * @param json - Parsed JSON object to validate
 * @returns Validation result with parsed data or errors
 */
export function validateServiceAccountJson(json: unknown): ServiceAccountValidationResult {
  const result = ServiceAccountJsonSchema.safeParse(json);

  if (result.success) {
    return {
      valid: true,
      data: result.data,
      errors: [],
    };
  }

  // Extract error messages
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return {
    valid: false,
    errors,
  };
}

/**
 * Quick validation result for UI feedback.
 */
export interface QuickValidationResult {
  /**
   * Whether the string is valid JSON.
   */
  isJson: boolean;

  /**
   * Whether the JSON has type: "service_account".
   */
  isServiceAccount: boolean;

  /**
   * Whether the JSON has a valid-looking private key.
   */
  hasPrivateKey: boolean;

  /**
   * Project ID if detected.
   */
  projectId?: string;

  /**
   * Client email if detected.
   */
  clientEmail?: string;
}

/**
 * Perform quick validation for real-time UI feedback.
 *
 * This is a lightweight check that doesn't validate all fields,
 * just enough to show immediate feedback to the user.
 *
 * @param jsonString - JSON string to check
 * @returns Quick validation result
 */
export function quickValidateServiceAccountJson(jsonString: string): QuickValidationResult {
  try {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;

    return {
      isJson: true,
      isServiceAccount: parsed?.type === 'service_account',
      hasPrivateKey:
        typeof parsed?.private_key === 'string' && parsed.private_key.includes('PRIVATE KEY'),
      projectId: typeof parsed?.project_id === 'string' ? parsed.project_id : undefined,
      clientEmail: typeof parsed?.client_email === 'string' ? parsed.client_email : undefined,
    };
  } catch {
    return {
      isJson: false,
      isServiceAccount: false,
      hasPrivateKey: false,
    };
  }
}

/**
 * Decode a base64-encoded Service Account JSON and validate it.
 *
 * This is useful for processing keys downloaded from the IAM API,
 * which return the key data as base64-encoded JSON.
 *
 * @param base64Data - Base64-encoded JSON string
 * @returns Validation result
 */
export function parseBase64ServiceAccountJson(base64Data: string): ServiceAccountValidationResult {
  try {
    const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
    return parseServiceAccountJson(jsonString);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid base64 data';
    return {
      valid: false,
      errors: [`Base64 decode error: ${message}`],
    };
  }
}
