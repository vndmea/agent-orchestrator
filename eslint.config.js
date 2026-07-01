import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const typedConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ["**/*.ts"],
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      project: "./tsconfig.json",
      tsconfigRootDir: import.meta.dirname
    }
  }
}));

export default [
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/tmp/**"
    ]
  },
  {
    ...eslint.configs.recommended,
    files: ["**/*.{js,mjs,cjs}"]
  },
  ...typedConfigs,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports"
        }
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            arguments: false
          }
        }
      ]
    }
  }
];
