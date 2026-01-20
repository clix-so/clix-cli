import { Box, Text } from 'ink';
import React from 'react';
import { RenderInline } from './InlineMarkdownRenderer';

interface MarkdownDisplayProps {
  text: string;
  isError?: boolean;
}

// Constants
const CODE_BLOCK_PADDING = 1;
const LIST_ITEM_PADDING = 1;

const MarkdownDisplayInternal: React.FC<MarkdownDisplayProps> = ({ text, isError = false }) => {
  const textColor = isError ? 'red' : undefined;

  if (!text) return null;

  const lines = text.split(/\r?\n/);
  const headerRegex = /^ *(#{1,4}) +(.*)/;
  const codeFenceRegex = /^ *(`{3,}|~{3,}) *(\w*?) *$/;
  const ulItemRegex = /^([ \t]*)([-*+]) +(.*)/;
  const olItemRegex = /^([ \t]*)(\d+)\. +(.*)/;
  const hrRegex = /^ *([-*_] *){3,} *$/;

  const contentBlocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let lastLineEmpty = true;
  let codeBlockContent: string[] = [];
  let codeBlockLang: string | null = null;
  let codeBlockFence = '';

  function addContentBlock(block: React.ReactNode) {
    if (block) {
      contentBlocks.push(block);
      lastLineEmpty = false;
    }
  }

  lines.forEach((line, index) => {
    const key = `line-${index}`;

    // Inside code block
    if (inCodeBlock) {
      const fenceMatch = line.match(codeFenceRegex);
      if (
        fenceMatch?.[1].startsWith(codeBlockFence[0]) &&
        fenceMatch[1].length >= codeBlockFence.length
      ) {
        // End of code block
        addContentBlock(
          <RenderCodeBlock key={key} content={codeBlockContent} lang={codeBlockLang} />,
        );
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = null;
        codeBlockFence = '';
      } else {
        codeBlockContent.push(line);
      }
      return;
    }

    const codeFenceMatch = line.match(codeFenceRegex);
    const headerMatch = line.match(headerRegex);
    const ulMatch = line.match(ulItemRegex);
    const olMatch = line.match(olItemRegex);
    const hrMatch = line.match(hrRegex);

    if (codeFenceMatch) {
      // Start of code block
      inCodeBlock = true;
      codeBlockFence = codeFenceMatch[1];
      codeBlockLang = codeFenceMatch[2] || null;
    } else if (hrMatch) {
      // Horizontal rule
      addContentBlock(
        <Box key={key}>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>,
      );
    } else if (headerMatch) {
      // Headers
      const level = headerMatch[1].length;
      const headerText = headerMatch[2];
      let headerNode: React.ReactNode = null;

      switch (level) {
        case 1:
          headerNode = (
            <Text bold color="cyan">
              <RenderInline text={headerText} defaultColor="cyan" />
            </Text>
          );
          break;
        case 2:
          headerNode = (
            <Text bold color="blue">
              <RenderInline text={headerText} defaultColor="blue" />
            </Text>
          );
          break;
        case 3:
          headerNode = (
            <Text bold color={textColor}>
              <RenderInline text={headerText} defaultColor={textColor} />
            </Text>
          );
          break;
        case 4:
          headerNode = (
            <Text italic dimColor>
              <RenderInline text={headerText} />
            </Text>
          );
          break;
        default:
          headerNode = (
            <Text color={textColor}>
              <RenderInline text={headerText} defaultColor={textColor} />
            </Text>
          );
          break;
      }
      if (headerNode) addContentBlock(<Box key={key}>{headerNode}</Box>);
    } else if (ulMatch) {
      // Unordered list item
      const leadingWhitespace = ulMatch[1];
      const marker = ulMatch[2];
      const itemText = ulMatch[3];
      addContentBlock(
        <RenderListItem
          key={key}
          itemText={itemText}
          type="ul"
          marker={marker}
          leadingWhitespace={leadingWhitespace}
          textColor={textColor}
        />,
      );
    } else if (olMatch) {
      // Ordered list item
      const leadingWhitespace = olMatch[1];
      const marker = olMatch[2];
      const itemText = olMatch[3];
      addContentBlock(
        <RenderListItem
          key={key}
          itemText={itemText}
          type="ol"
          marker={marker}
          leadingWhitespace={leadingWhitespace}
          textColor={textColor}
        />,
      );
    } else {
      // Regular text or empty line
      if (line.trim().length === 0) {
        if (!lastLineEmpty) {
          contentBlocks.push(<Box key={`spacer-${contentBlocks.length}`} height={1} />);
          lastLineEmpty = true;
        }
      } else {
        addContentBlock(
          <Box key={key}>
            <Text wrap="wrap" color={textColor}>
              <RenderInline text={line} defaultColor={textColor} />
            </Text>
          </Box>,
        );
      }
    }
  });

  // Handle unclosed code block at end
  if (inCodeBlock) {
    addContentBlock(
      <RenderCodeBlock key="line-eof" content={codeBlockContent} lang={codeBlockLang} />,
    );
  }

  return <>{contentBlocks}</>;
};

// Code block renderer
interface RenderCodeBlockProps {
  content: string[];
  lang: string | null;
}

const RenderCodeBlockInternal: React.FC<RenderCodeBlockProps> = ({ content, lang }) => {
  const fullContent = content.join('\n');

  return (
    <Box paddingLeft={CODE_BLOCK_PADDING} flexDirection="column" marginY={0}>
      {lang && (
        <Text dimColor italic>
          {lang}
        </Text>
      )}
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="green">{fullContent}</Text>
      </Box>
    </Box>
  );
};

const RenderCodeBlock = React.memo(RenderCodeBlockInternal);

// List item renderer
interface RenderListItemProps {
  itemText: string;
  type: 'ul' | 'ol';
  marker: string;
  leadingWhitespace?: string;
  textColor?: string;
}

const RenderListItemInternal: React.FC<RenderListItemProps> = ({
  itemText,
  type,
  marker,
  leadingWhitespace = '',
  textColor,
}) => {
  const prefix = type === 'ol' ? `${marker}. ` : `${marker} `;
  const prefixWidth = prefix.length;
  const indentation = leadingWhitespace.length;

  return (
    <Box paddingLeft={indentation + LIST_ITEM_PADDING} flexDirection="row">
      <Box width={prefixWidth}>
        <Text color={textColor}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={textColor}>
          <RenderInline text={itemText} defaultColor={textColor} />
        </Text>
      </Box>
    </Box>
  );
};

const RenderListItem = React.memo(RenderListItemInternal);

export const MarkdownDisplay = React.memo(MarkdownDisplayInternal);
