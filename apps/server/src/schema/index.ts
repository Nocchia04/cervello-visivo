import fs from "fs";
import path from "path";
import { authResolvers } from "./resolvers/auth.js";
import { cantiereResolvers } from "./resolvers/cantiere.js";
import { piantinaResolvers } from "./resolvers/piantina.js";
import { foto360Resolvers } from "./resolvers/foto360.js";
import { annotazioneResolvers } from "./resolvers/annotazione.js";
import { invitoResolvers } from "./resolvers/invito.js";
import { linkCondivisioneResolvers } from "./resolvers/linkCondivisione.js";

// Load .graphql type definition files
const typeDefsDir = path.join(__dirname, "typeDefs");
const graphqlFiles = ["auth", "cantiere", "piantina", "foto360", "annotazione", "invito", "linkCondivisione"];

export const typeDefs = graphqlFiles.map((name) =>
  fs.readFileSync(path.join(typeDefsDir, `${name}.graphql`), "utf-8")
);

// Merge resolvers — deep merge Query, Mutation, Subscription + type resolvers
function deepMergeResolvers(
  ...resolverSets: Record<string, Record<string, unknown>>[]
): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = {};
  for (const resolvers of resolverSets) {
    for (const [typeName, fields] of Object.entries(resolvers)) {
      if (!merged[typeName]) {
        merged[typeName] = {};
      }
      Object.assign(merged[typeName], fields);
    }
  }
  return merged;
}

export const resolvers = deepMergeResolvers(
  authResolvers,
  cantiereResolvers,
  piantinaResolvers,
  foto360Resolvers,
  annotazioneResolvers,
  invitoResolvers,
  linkCondivisioneResolvers
);
