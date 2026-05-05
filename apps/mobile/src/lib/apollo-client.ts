import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  split,
  ApolloLink,
} from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { setContext } from "@apollo/client/link/context";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { getAuthToken } from "./storage";

const PROD_HTTP_URL = "https://api.holobuilderino.com/graphql";
const PROD_WS_URL  = "wss://api.holobuilderino.com/graphql";

function getServerHost(): string {
  if (Platform.OS === "android") return "10.0.2.2";
  const metroHost = Constants.expoConfig?.hostUri?.split(":").shift();
  return metroHost ?? "localhost";
}

const HOST = getServerHost();
const HTTP_URL = PROD_HTTP_URL;
const WS_URL   = PROD_WS_URL;

const httpLink = new HttpLink({ uri: HTTP_URL });

const authLink = setContext(async (_, { headers }) => {
  const token = await getAuthToken();
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    },
  };
});

// wsLink creato in modo lazy: la connessione WebSocket parte solo
// quando viene effettivamente richiesta una subscription, non al boot
function createWsLink() {
  const { createClient } = require("graphql-ws");
  return new GraphQLWsLink(
    createClient({
      url: WS_URL,
      lazy: true,
      connectionParams: async () => {
        const token = await getAuthToken();
        return { authorization: token ? `Bearer ${token}` : "" };
      },
    })
  );
}

let _wsLink: GraphQLWsLink | null = null;
function getWsLink(): GraphQLWsLink {
  if (!_wsLink) _wsLink = createWsLink();
  return _wsLink;
}

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === "OperationDefinition" &&
      definition.operation === "subscription"
    );
  },
  // Proxy che istanzia wsLink solo alla prima subscription
  new ApolloLink((operation, forward) => getWsLink().request(operation, forward)!),
  authLink.concat(httpLink)
);


export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
  },
});
