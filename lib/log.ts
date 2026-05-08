import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

export const log = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
      },
  base: { service: "marketing-crm" },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token", "*.secret"],
});

export type Logger = typeof log;
