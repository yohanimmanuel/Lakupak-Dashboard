import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** Selected rules relaxed for development velocity. Review before enabling in CI. */
const relaxedRules = {
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/no-empty-object-type": "off",
  "@typescript-eslint/no-require-imports": "off",
  "@typescript-eslint/no-explicit-any": "off",
  "react/no-unescaped-entities": "off",
  "react-hooks/exhaustive-deps": "off",
  // React Hooks 7 (via eslint-config-next 16) — keep off until codebase is upgraded intentionally.
  "react-hooks/set-state-in-effect": "off",
  "react-hooks/preserve-manual-memoization": "off",
  "react-hooks/static-components": "off",
  "react-hooks/refs": "off",
  "react-hooks/error-boundaries": "off",
  "react-hooks/purity": "off",
  "react-hooks/immutability": "off",
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
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["src/generated/**", "node_modules/**", ".next/**"],
  },
  {
    rules: relaxedRules,
  },
];

export default eslintConfig;
