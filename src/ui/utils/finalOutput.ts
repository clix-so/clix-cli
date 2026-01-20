import pc from 'picocolors';

export interface FinalOutputResult {
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  details?: string[];
}

/**
 * Simple markdown to terminal formatter
 */
function formatMarkdown(text: string): string {
  let formatted = text;

  // Headers (## Header → bold)
  formatted = formatted.replace(/^#+\s+(.+)$/gm, (_, content) => pc.bold(content));

  // Bold (**text** → bold) - do this before italic
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, (_, content) => pc.bold(content));

  // Inline code (`code` → cyan)
  formatted = formatted.replace(/`([^`]+)`/g, (_, content) => pc.cyan(content));

  // Links ([text](url) → just show text)
  formatted = formatted.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  return formatted;
}

/**
 * Format a detail line (handles list items, code blocks, etc.)
 */
function formatDetailLine(line: string, indent: string = '  '): string {
  const trimmed = line.trim();

  // Empty line
  if (!trimmed) {
    return '';
  }

  // Code block markers (skip)
  if (trimmed === '```' || trimmed.startsWith('```')) {
    return '';
  }

  // List items (-, *, •)
  if (/^[-*•]\s+/.test(trimmed)) {
    const content = trimmed.replace(/^[-*•]\s+/, '');
    return `${indent}${pc.dim('•')} ${formatMarkdown(content)}`;
  }

  // Numbered list (1., 2., etc.)
  if (/^\d+\.\s+/.test(trimmed)) {
    const match = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (match) {
      const [, num, content] = match;
      return `${indent}${pc.dim(`${num}.`)} ${formatMarkdown(content)}`;
    }
  }

  // Regular line (might be inside code block or continuation)
  // If line starts with spaces (indented), treat as code
  if (line.startsWith('    ') || line.startsWith('\t')) {
    return `${indent}${pc.cyan(trimmed)}`;
  }

  // Check if it looks like JSON/code (starts with {, [, etc.)
  if (/^[{[]/.test(trimmed)) {
    return `${indent}${pc.cyan(trimmed)}`;
  }

  // Regular text
  return `${indent}${formatMarkdown(trimmed)}`;
}

export function printFinalOutput(result: FinalOutputResult): void {
  const icon = result.type === 'success' ? '✓' : result.type === 'error' ? '✗' : '→';

  // Select color based on result type
  const colorFn = result.type === 'success' ? pc.green : result.type === 'error' ? pc.red : pc.cyan;

  // Print title with icon and color
  console.log(`\n${colorFn(pc.bold(`${icon} ${result.title}`))}`);

  // Print message if present
  if (result.message) {
    console.log(pc.dim(formatMarkdown(result.message)));
  }

  // Print details with markdown formatting
  if (result.details?.length) {
    console.log('');
    for (const detail of result.details) {
      // Split by newlines and format each line
      const lines = detail.split('\n');
      for (const line of lines) {
        const formatted = formatDetailLine(line);
        if (formatted) {
          console.log(formatted);
        }
      }
    }
  }

  console.log('');
}
