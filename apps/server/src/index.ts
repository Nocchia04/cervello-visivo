import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";

import { typeDefs, resolvers } from "./schema/index.js";
import { createContext, createWsContext, type GraphQLContext } from "./context.js";
import { upload } from "./upload.js";
import { importRouter } from "./importRoute.js";

const PORT = parseInt(process.env.PORT || "4000", 10);

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // Build executable schema (needed for subscriptions)
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // WebSocket server for GraphQL subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });

  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        return createWsContext(
          ctx.connectionParams as Record<string, unknown> | undefined
        );
      },
    },
    wsServer
  );

  // Apollo Server
  const apollo = new ApolloServer<GraphQLContext>({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apollo.start();

  // Middleware
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    })
  );

  // GraphQL endpoint
  app.use(
    "/graphql",
    express.json(),
    expressMiddleware(apollo, {
      context: async ({ req }) => createContext({ req }),
    })
  );

  // File upload endpoint
  app.post("/upload", upload.single("foto"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Nessun file caricato" });
      return;
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.filename });
  });

  // Import ZIP HoloBuilder (admin-only) — gestisce il proprio multer
  app.use(importRouter);

  // Serve uploaded files
  app.use("/uploads", express.static("uploads"));

  httpServer.listen(PORT, () => {
    console.log(`Server pronto su http://localhost:${PORT}/graphql`);
    console.log(`WebSocket subscriptions su ws://localhost:${PORT}/graphql`);
  });
}

main().catch(console.error);
