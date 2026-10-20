import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const createDesignSystemRulesSchema = {
  clientLanguages: z
    .string()
    .optional()
    .describe('Comma-separated languages used by the project, e.g. "typescript,css"'),
  clientFrameworks: z
    .string()
    .optional()
    .describe('Comma-separated frameworks used by the project, e.g. "react,nextjs"'),
};

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'create_design_system_rules',
    {
      title: 'Create design system rules',
      description:
        'Generate a rules file that tells an agent how to turn Figma designs into code that fits the project stack and design system.',
      argsSchema: createDesignSystemRulesSchema,
    },
    ({ clientLanguages, clientFrameworks }) => {
      const languages = clientLanguages?.trim() || 'detect from the repository';
      const frameworks = clientFrameworks?.trim() || 'detect from the repository';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                '# Create design system rules for Figma → code',
                '',
                `Languages: ${languages}`,
                `Frameworks: ${frameworks}`,
                '',
                'Inspect the target repository before writing anything. Identify:',
                '- the UI framework, styling system, and build tooling;',
                '- the component directory, naming conventions, and export style;',
                '- design tokens, theme files, CSS variables, and utility classes;',
                '- icon, image, and font handling;',
                '- test, lint, typecheck, and formatting commands.',
                '',
                'Then produce a single Markdown rules file suitable for `rules/` or `instructions/` with these sections:',
                '1. Stack and commands.',
                '2. Component reuse: when to use an existing component, when to compose, and when creating a new one is allowed.',
                '3. Token mapping: Figma variables/styles → code tokens. Never hardcode a value that has a token.',
                '4. Layout mapping: auto layout → flex/grid, constraints → sizing rules, spacing scale.',
                '5. Typography and color mapping, including responsive behavior.',
                '6. Assets: export formats, naming, and placement.',
                '7. Accessibility: semantics, focus states, contrast, and keyboard behavior.',
                '8. Verification: lint, typecheck, tests, and visual comparison against a screenshot.',
                '9. Prohibited patterns and open questions.',
                '',
                'Keep the rules concrete and checkable. Do not invent components, tokens, or scripts that do not exist in the repository. If a required fact is missing, list it under open questions instead of guessing.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
