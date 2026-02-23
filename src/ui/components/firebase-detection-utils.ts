import {
  type FirebaseDetectionResult,
  platformNeedsAndroid,
  platformNeedsIos,
} from '@/lib/services/firebase';

export function platformNeedsAndroidWithUnknown(
  platform: FirebaseDetectionResult['platform'],
): boolean {
  return platformNeedsAndroid(platform) || platform === 'unknown';
}

export function platformNeedsIosWithUnknown(
  platform: FirebaseDetectionResult['platform'],
): boolean {
  return platformNeedsIos(platform) || platform === 'unknown';
}

export function hasValidFirebaseConfigFiles(result: FirebaseDetectionResult): boolean {
  const needsAndroid = platformNeedsAndroidWithUnknown(result.platform);
  const needsIos = platformNeedsIosWithUnknown(result.platform);
  const hasAndroidConfig = !needsAndroid || Boolean(result.android?.valid);
  const hasIosConfig = !needsIos || Boolean(result.ios?.valid);
  return hasAndroidConfig && hasIosConfig;
}
