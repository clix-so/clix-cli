declare module '@clix-so/clix-agent-skills' {
  interface SkillOptions {
    projectPath?: string;
    platform?: 'ios' | 'android' | 'react-native' | 'flutter';
  }

  export function getIntegrationPrompt(options?: SkillOptions): string;
  export function getTrackingPrompt(options?: SkillOptions): string;
  export function getUserManagementPrompt(options?: SkillOptions): string;
  export function getPersonalizationPrompt(options?: SkillOptions): string;
}
