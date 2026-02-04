/**
 * Type declarations for the 'xcode' npm package.
 * @see https://github.com/nicksrandall/xcode
 */

declare module 'xcode' {
  interface PBXTarget {
    uuid: string;
    pbxNativeTarget: {
      name: string;
      productType: string;
    };
  }

  interface PBXProject {
    parseSync(): void;
    writeSync(): string;

    // Target operations
    addTarget(
      name: string,
      productType: string,
      subfolder: string,
      bundleId: string,
    ): PBXTarget | null;
    getFirstTarget(): PBXTarget | null;
    pbxNativeTargetSection(): Record<string, unknown> | null;
    addTargetDependency(target: string, dependencies: string[]): void;

    // File operations
    addSourceFile(path: string, options: { target?: string }, group?: string): void;
    addResourceFile(path: string, options?: { target?: string }): void;

    // Group operations
    findPBXGroupKey(criteria: { name?: string; path?: string }): string | null;
    addPbxGroup(files: string[], name: string, path: string): { uuid: string };

    // Build settings
    updateBuildProperty(
      key: string,
      value: string,
      buildConfig: string | null,
      targetName?: string,
    ): void;

    // Build phases
    addBuildPhase(
      files: string[],
      buildPhaseType: string,
      comment: string,
      target: string,
      optionAlias?: string,
    ): void;
  }

  function project(projectPath: string): PBXProject;

  export = { project };
}
