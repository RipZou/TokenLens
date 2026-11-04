import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypeScript,
  {
    ignores: [".next/**", "coverage/**", "docs/mockups/**", "next-env.d.ts", "src/generated/**"],
  },
];

export default eslintConfig;
