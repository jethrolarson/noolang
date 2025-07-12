// ANSI color codes for terminal output
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};



// Check if colors are supported (for non-TTY environments)
export const supportsColors = process.stdout.isTTY && !process.env.NO_COLOR;

// Create color functions that respect color support
function createColorFunction(colorCode: string) {
  return (text: string) => supportsColors ? `${colorCode}${text}${colors.reset}` : text;
}

// Color functions for common use cases
export const colorize = {
  // Syntax highlighting
  keyword: createColorFunction(colors.brightBlue),
  string: createColorFunction(colors.green),
  number: createColorFunction(colors.yellow),
  operator: createColorFunction(colors.magenta),
  identifier: createColorFunction(colors.cyan),
  
  // Status colors
  success: createColorFunction(colors.brightGreen),
  error: createColorFunction(colors.brightRed),
  warning: createColorFunction(colors.brightYellow),
  info: createColorFunction(colors.brightCyan),
  
  // Type colors
  type: createColorFunction(colors.brightMagenta),
  value: createColorFunction(colors.white),
  
  // Structure colors
  prompt: createColorFunction(colors.brightGreen),
  command: createColorFunction(colors.brightBlue),
  section: createColorFunction(colors.brightYellow),
  
  // Custom color function
  custom: (text: string, color: string) => supportsColors ? `${color}${text}${colors.reset}` : text,
}; 