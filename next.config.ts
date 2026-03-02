import type { NextConfig } from "next";

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const allowedOrigins = Array.from(
  new Set([
    ...parseCsv(process.env.REPLIT_DOMAINS),
    "localhost:5000",
    "127.0.0.1:5000",
    "*.replit.dev",
    "*.replit.app",
    "*.repl.co",
  ]),
);

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedOrigins,
};

export default nextConfig;
