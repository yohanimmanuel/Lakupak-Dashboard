import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** Selected rules relaxed for development velocity. Review before enabling in CI. */
const relaxedRules = {
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/no-empty-object-type": "off",
  "@typescript-eslint/no-require-imports": "off",
  "@typescript-eslint/no-explicit-any": "off",
  "react/no-unescaped-entities": "off",
  "react-hooks/exhaustive-deps": "off",
  "@next/next/no-html-link-for-pages": "off",
  "@next/next/no-assign-module-variable": "off",
  "@next/next/no-img-element": "off",
  "import/no-duplicates": "off",
  "jsx-a11y/role-supports-aria-props": "off",
  "jsx-a11y/role-has-required-aria-props": "off",
  "prefer-const": "off",
  "react/jsx-key": "off",
};

const eslintConfig = [
  { ignores: ["src/generated/**", "node_modules/**", ".next/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: relaxedRules },
];

export default eslintConfig;
