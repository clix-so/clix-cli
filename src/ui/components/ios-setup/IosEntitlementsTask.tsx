import type React from 'react';
import { type IosSetupResult, IosSetupUI } from '@/ui/IosSetupUI';

export type IosEntitlementsTaskResult = IosSetupResult;

interface IosEntitlementsTaskProps {
  onComplete: (result: IosEntitlementsTaskResult) => void;
}

export const IosEntitlementsTask: React.FC<IosEntitlementsTaskProps> = ({ onComplete }) => {
  return <IosSetupUI options={{ skipPortal: true }} onComplete={onComplete} />;
};
