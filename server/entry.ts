import { sentryServerConfig } from "./sentry.server.config";
import { apply, serve } from "@photonjs/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import * as Sentry from "@sentry/node";
import { usersRouter } from "./api/users";
import { suppliersRouter } from "./api/suppliers";
import { ordersRouter } from "./api/orders";
import { automatenRouter } from "./api/automaten";
import { designsRouter } from "./api/designs";
import { reservationsRouter } from "./api/reservations";
import { sollicitatiesRouter } from "./api/sollicitaties";

sentryServerConfig();

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const allowedOrigins = new Set([
  "https://bellegemsfriethuisje.be",
  "https://www.bellegemsfriethuisje.be",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
]);

export default startApp() as unknown;

function startApp() {
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: (origin) => {
        if (!origin) return null;
        return allowedOrigins.has(origin) ? origin : null;
      },
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.get("/api/sentry-test", (c) => {
    try {
      throw new Error("Test backend Sentry error");
    } catch (err) {
      Sentry.captureException(err);
      return c.json({ ok: false, error: "Backend error captured by Sentry" }, 500);
    }
  });

  app.route("/api/users", usersRouter);
  app.route("/api/suppliers", suppliersRouter);
  app.route("/api/orders", ordersRouter);
  app.route("/api/automaten", automatenRouter);
  app.route("/api/designs", designsRouter);
  app.route("/api/reservations", reservationsRouter);
  app.route("/api/sollicitaties", sollicitatiesRouter);

  apply(app, []);

  return serve(app, {
    port,
  });
}
