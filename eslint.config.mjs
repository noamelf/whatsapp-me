import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Rules to catch AI-generated code issues
    rules: {
      // Catch unused code (common AI hallucination)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // Prevent unreachable code
      "no-unreachable": "error",

      // Prevent using variables before definition
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": "error",

      // Catch floating promises (common AI mistake)
      "@typescript-eslint/no-floating-promises": "error",

      // Catch misused promises
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            arguments: false, // Allow async callbacks in event handlers
          },
        },
      ],

      // Prevent async functions that don't use await
      "@typescript-eslint/require-await": "warn",

      // Catch duplicate imports
      "no-duplicate-imports": "error",

      // Prevent empty blocks (AI often generates empty catch blocks)
      "no-empty": ["error", { allowEmptyCatch: false }],

      // Catch constant conditions (AI logic errors)
      "no-constant-condition": "error",

      // Prevent duplicate case labels
      "no-duplicate-case": "error",

      // Catch unnecessary boolean casts
      "no-extra-boolean-cast": "error",

      // Prevent accidental global variable creation
      "no-implicit-globals": "error",

      // Catch self-assignment (AI copy-paste errors)
      "no-self-assign": "error",

      // Prevent self-comparison
      "no-self-compare": "error",

      // Catch template literal placeholder syntax in regular strings
      "no-template-curly-in-string": "error",

      // Prevent confusing arrow function syntax
      "no-confusing-arrow": "error",

      // Prevent useless return
      "no-useless-return": "error",

      // Allow explicit any for working with external libraries (baileys uses many any types)
      "@typescript-eslint/no-explicit-any": "warn",

      // Unsafe any rules - keep as warnings to flag potential issues
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",

      // Allow || for string defaults (common pattern)
      "@typescript-eslint/prefer-nullish-coalescing": "off",

      // Relax empty function rule for callbacks
      "@typescript-eslint/no-empty-function": [
        "error",
        {
          allow: ["arrowFunctions"],
        },
      ],

      // Allow non-null assertions with warning
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  }
);
