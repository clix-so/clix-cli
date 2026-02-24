import type React from 'react';
import type { UserAuthContext } from '@/lib/ios/apple-auth';
import { type IosSetupResult, IosSetupUI } from '@/ui/IosSetupUI';

export type IosEntitlementsTaskResult = IosSetupResult;

interface IosEntitlementsTaskProps {
  appleAuthContext?: UserAuthContext;
  onComplete: (result: IosEntitlementsTaskResult) => void;
}

export const IosEntitlementsTask: React.FC<IosEntitlementsTaskProps> = ({
  appleAuthContext,
  onComplete,
}) => {
  return <IosSetupUI options={{}} appleAuthContext={appleAuthContext} onComplete={onComplete} />;
};
