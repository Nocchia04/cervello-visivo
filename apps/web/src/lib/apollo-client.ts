import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  split,
} from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { setContext } from "@apollo/client/link/context";
import { createClient } from "graphql-ws";
import { getToken } from "./auth";

const isProd = process.env.NODE_ENV === "production";

/**
 * Detect share mode dal pathname: `/share/<token>/...`.
 * Quando attivo, l'auth header diventa `ShareLink <token>` invece di `Bearer <user-jwt>`.
 * Side-effect-safe: ritorna null durante SSR (no `window`).
 */
function getShareTokenFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/share\/([^/?#]+)/);
  return m ? m[1] : null;
}

function getAuthHeaderValue(): string {
  const shareToken = getShareTokenFromPath();
  if (shareToken) return `ShareLink ${shareToken}`;
  const userToken = getToken();
  return userToken ? `Bearer ${userToken}` : "";
}

const httpLink = new HttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL ??
    (isProd ? "https://api.holobuilderino.com/graphql" : "http://localhost:4000/graphql"),
});

const authLink = setContext((_, { headers }) => {
  return {
    headers: {
      ...headers,
      authorization: getAuthHeaderValue(),
    },
  };
});

const wsLink =
  typeof window !== "undefined"
    ? new GraphQLWsLink(
        createClient({
          url: process.env.NEXT_PUBLIC_WS_URL ??
            (isProd ? "wss://api.holobuilderino.com/graphql" : "ws://localhost:4000/graphql"),
          connectionParams: () => ({
            authorization: getAuthHeaderValue(),
          }),
        })
      )
    : null;

const splitLink =
  typeof window !== "undefined" && wsLink
    ? split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return (
            definition.kind === "OperationDefinition" &&
            definition.operation === "subscription"
          );
        },
        wsLink,
        authLink.concat(httpLink)
      )
    : authLink.concat(httpLink);

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
