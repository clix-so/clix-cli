import { formatPath } from '../utils/path';

export interface DebugOptions {
  problemDescription: string;
  projectPath: string;
  /** One-shot mode: don't ask for user input */
  oneShot?: boolean;
}

/**
 * One-shot mode instruction to prevent agent from asking questions.
 */
const ONE_SHOT_INSTRUCTION = `
IMPORTANT: This is a non-interactive one-shot execution. Do NOT ask for user input or confirmation.
- Make reasonable assumptions based on the project structure
- Choose the most common/recommended approach when multiple options exist
- Proceed with the task autonomously without waiting for user response
- If critical information is missing, state your assumptions and proceed
`;

/**
 * Generates a debug prompt for the agent to investigate a user-reported problem.
 */
export function getDebugPrompt(options: DebugOptions): string {
  const { problemDescription, projectPath, oneShot } = options;

  const oneShotInstruction = oneShot ? ONE_SHOT_INSTRUCTION : '';

  return `You are a debugging assistant helping diagnose problems in a mobile project.

**Problem Description**: ${problemDescription}

**Project Path**: ${formatPath(projectPath)}
${oneShotInstruction}

## Your Task

Investigate the reported problem and provide a comprehensive diagnosis with actionable solutions.

## Investigation Steps

### 1. Understand Context
- Detect the platform (iOS/Android/React Native/Flutter)
- Identify files relevant to the problem
- Review recent error messages or logs if mentioned

### 2. Explore Code
- Search for files related to the problem area
- Read relevant configuration files
- Check dependency declarations
- Examine implementation code

### 3. Analyze Root Cause
- Compare current setup with best practices
- Identify missing or incorrect configurations
- Check for version conflicts or compatibility issues
- Look for common pitfalls

### 4. Provide Solutions
- List specific fixes with file paths and line numbers
- Include code snippets for changes
- Prioritize solutions by likelihood of success
- Explain why each fix addresses the issue

## Output Format

Provide a clear, structured response:

**Problem Summary**
- Restate the issue in your own words

**Investigation Findings**
- What files/configs you examined
- What you discovered (both correct and incorrect setup)

**Root Cause**
- The underlying issue causing the problem
- Why it's happening

**Recommended Fixes**
1. Primary fix (most likely to solve the issue)
   - File: \`path/to/file\`
   - Action: Specific steps
   - Code: Example snippets if applicable
2. Alternative fixes (if primary doesn't work)
3. Additional considerations

**Verification Steps**
- How to verify the fix worked
- What to look for in logs/output

Focus on actionable, specific guidance that can be implemented immediately.${oneShot ? '' : ' If you need more information, ask follow-up questions.'}`;
}
