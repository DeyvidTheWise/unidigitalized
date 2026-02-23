import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isProd
    ? undefined
    : pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }),
);

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
