import { build as esbuild } from "esbuild";
import { rm, readFile, mkdir, cp } from "fs/promises";
import path from "path";
import { execSync } from "child_process";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "@neondatabase/serverless",
  "axios",
  "bcryptjs",
  "connect-pg-simple",
  "cors",
  "csv-parser",
  "date-fns",
  "dotenv",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "mongoose",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  const skipFrontendBuild = process.env.SKIP_FRONTEND_BUILD === "true";

  if (!skipFrontendBuild) {
    console.log("building frontend...");
  }
  const frontendRoot = path.resolve(process.cwd(), "..", "frontend");
  if (!skipFrontendBuild) {
    execSync("npm run build", {
      cwd: frontendRoot,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    });
  }

  const frontendDist = path.resolve(frontendRoot, "dist");
  const publicOut = path.resolve(process.cwd(), "dist", "public");
  await mkdir(publicOut, { recursive: true });
  await cp(frontendDist, publicOut, { recursive: true });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps;

  await esbuild({
    entryPoints: ["index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.js",
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
