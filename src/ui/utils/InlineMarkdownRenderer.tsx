import { Text } from 'ink';
import React from 'react';

// Constants for Markdown parsing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

interface RenderInlineProps {
  text: string;
  defaultColor?: string;
}

function renderBold(match: string, key: string, defaultColor?: string): React.ReactNode {
  return (
    <Text key={key} bold color={defaultColor}>
      {match.slice(BOLD_MARKER_LENGTH, -BOLD_MARKER_LENGTH)}
    </Text>
  );
}

function renderItalic(match: string, key: string, defaultColor?: string): React.ReactNode {
  return (
    <Text key={key} italic color={defaultColor}>
      {match.slice(ITALIC_MARKER_LENGTH, -ITALIC_MARKER_LENGTH)}
    </Text>
  );
}

function renderStrikethrough(match: string, key: string, defaultColor?: string): React.ReactNode {
  return (
    <Text key={key} strikethrough color={defaultColor}>
      {match.slice(STRIKETHROUGH_MARKER_LENGTH, -STRIKETHROUGH_MARKER_LENGTH)}
    </Text>
  );
}

function renderInlineCode(match: string, key: string): React.ReactNode {
  const codeMatch = match.match(/^(`+)(.+?)\1$/s);
  if (codeMatch?.[2]) {
    return (
      <Text key={key} color="yellow">
        {codeMatch[2]}
      </Text>
    );
  }
  return null;
}

function renderLink(match: string, key: string, defaultColor?: string): React.ReactNode {
  const linkMatch = match.match(/\[(.*?)\]\((.*?)\)/);
  if (linkMatch) {
    return (
      <Text key={key} color={defaultColor}>
        {linkMatch[1]}
        <Text color="blue"> ({linkMatch[2]})</Text>
      </Text>
    );
  }
  return null;
}

function renderUnderline(match: string, key: string, defaultColor?: string): React.ReactNode {
  return (
    <Text key={key} underline color={defaultColor}>
      {match.slice(UNDERLINE_TAG_START_LENGTH, -UNDERLINE_TAG_END_LENGTH)}
    </Text>
  );
}

function renderUrl(match: string, key: string): React.ReactNode {
  return (
    <Text key={key} color="blue">
      {match}
    </Text>
  );
}

function isItalicMatch(
  fullMatch: string,
  text: string,
  matchIndex: number,
  lastIndex: number,
): boolean {
  const prevChar = text.substring(matchIndex - 1, matchIndex);
  const nextChar = text.substring(lastIndex, lastIndex + 1);
  const prevTwoChars = text.substring(matchIndex - 2, matchIndex);
  const nextTwoChars = text.substring(lastIndex, lastIndex + 2);

  return (
    fullMatch.length > ITALIC_MARKER_LENGTH * 2 &&
    ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
      (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
    !/\w/.test(prevChar) &&
    !/\w/.test(nextChar) &&
    !/\S[./\\]/.test(prevTwoChars) &&
    !/[./\\]\S/.test(nextTwoChars)
  );
}

function renderMarkdownMatch(
  fullMatch: string,
  key: string,
  text: string,
  matchIndex: number,
  lastIndex: number,
  defaultColor?: string,
): React.ReactNode {
  // Bold text
  if (fullMatch.startsWith('**') && fullMatch.endsWith('**') && fullMatch.length > 4) {
    return renderBold(fullMatch, key, defaultColor);
  }
  // Italic text
  if (isItalicMatch(fullMatch, text, matchIndex, lastIndex)) {
    return renderItalic(fullMatch, key, defaultColor);
  }
  // Strikethrough text
  if (fullMatch.startsWith('~~') && fullMatch.endsWith('~~') && fullMatch.length > 4) {
    return renderStrikethrough(fullMatch, key, defaultColor);
  }
  // Inline code
  if (fullMatch.startsWith('`') && fullMatch.endsWith('`') && fullMatch.length > 1) {
    return renderInlineCode(fullMatch, key);
  }
  // Markdown link
  if (fullMatch.startsWith('[') && fullMatch.includes('](') && fullMatch.endsWith(')')) {
    return renderLink(fullMatch, key, defaultColor);
  }
  // Underlined text
  if (fullMatch.startsWith('<u>') && fullMatch.endsWith('</u>') && fullMatch.length > 6) {
    return renderUnderline(fullMatch, key, defaultColor);
  }
  // Bare URL
  if (fullMatch.match(/^https?:\/\//)) {
    return renderUrl(fullMatch, key);
  }
  return null;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({ text, defaultColor }) => {
  // Early return for plain text without markdown or URLs
  if (!/[*_~`<[https?:]/.test(text)) {
    return <Text color={defaultColor}>{text}</Text>;
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  const inlineRegex =
    /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;
  let match: RegExpExecArray | null = inlineRegex.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`t-${lastIndex}`} color={defaultColor}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      );
    }

    const fullMatch = match[0];
    const key = `m-${match.index}`;
    let renderedNode: React.ReactNode = null;

    try {
      renderedNode = renderMarkdownMatch(
        fullMatch,
        key,
        text,
        match.index,
        inlineRegex.lastIndex,
        defaultColor,
      );
    } catch {
      renderedNode = null;
    }

    nodes.push(
      renderedNode ?? (
        <Text key={key} color={defaultColor}>
          {fullMatch}
        </Text>
      ),
    );
    lastIndex = inlineRegex.lastIndex;
    match = inlineRegex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Text key={`t-${lastIndex}`} color={defaultColor}>
        {text.slice(lastIndex)}
      </Text>,
    );
  }

  return <>{nodes.filter((node) => node !== null)}</>;
};

export const RenderInline = React.memo(RenderInlineInternal);
