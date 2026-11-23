import express from "express";
import { createServer as createHttpServer } from "http";
import path from "path";
import dotenv from "dotenv";
import { createApp } from "./server/app";
import { handleChatUpgrade } from "./server/ws";

dotenv.config();

const app = createApp();
const httpServer = createHttpServer(app);

httpServer.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname === "/ws") handleChatUpgrade(req, socket, head);
  else if (process.env.NODE_ENV === "production") socket.destroy();
  // In dev, leave other paths alone so Vite HMR still works.
});

async function startServer() {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || "127.0.0.1";

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = process.env.DIST_DIR ?? path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  httpServer.listen(Number(PORT), HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket at ws://localhost:${PORT}/ws`);
  });
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

startServer();
