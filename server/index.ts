import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedTowns } from "./seed";

function validateEnvironment() {
  const requiredEnvVars = ["GOOGLE_API_KEY"];
  const missing: string[] = [];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    console.error("========================================");
    console.error("CRITICAL: MISSING REQUIRED API KEYS");
    console.error("========================================");
    console.error(`The following environment variables are not set: ${missing.join(", ")}`);
    console.error("AI features (document parsing, town research) will not work.");
    console.error("Please set these in the Secrets tab.");
    console.error("========================================");
  }
}

validateEnvironment();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Only log summary to avoid massive base64 data dumps
        if (Array.isArray(capturedJsonResponse)) {
          logLine += ` :: [${capturedJsonResponse.length} items]`;
        } else if (typeof capturedJsonResponse === 'object' && capturedJsonResponse !== null) {
          const keys = Object.keys(capturedJsonResponse);
          logLine += ` :: {${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}}`;
        } else {
          const jsonStr = JSON.stringify(capturedJsonResponse);
          logLine += ` :: ${jsonStr.length > 100 ? jsonStr.substring(0, 100) + '...' : jsonStr}`;
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  await seedTowns();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
