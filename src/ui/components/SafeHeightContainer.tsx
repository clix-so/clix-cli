import { Box } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';

/**
 * Get safe terminal height (rows - 1) to prevent flickering.
 * Based on Ink issue #450: rendering at full terminal height causes
 * "unintentional scrolling" which results in screen flickering.
 */
function getSafeHeight(): number {
  const rows = process.stdout.rows || 24;
  return Math.max(rows - 1, 10);
}

interface SafeHeightContainerProps {
  children: React.ReactNode;
}

/**
 * Container that limits rendering height to prevent terminal flickering.
 * Wraps children in a Box with height constrained to terminal rows - 1.
 */
export const SafeHeightContainer: React.FC<SafeHeightContainerProps> = ({ children }) => {
  const [height, setHeight] = useState(getSafeHeight);

  useEffect(() => {
    const handleResize = () => {
      setHeight(getSafeHeight());
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return (
    <Box flexDirection="column" height={height}>
      {children}
    </Box>
  );
};
