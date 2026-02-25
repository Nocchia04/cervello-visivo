import { gql } from "@apollo/client";

export const NUOVA_ANNOTAZIONE = gql`
  subscription NuovaAnnotazione($foto360Id: ID!) {
    nuovaAnnotazione(foto360Id: $foto360Id) {
      id
      testo
      x
      y
      autore {
        id
        nome
        cognome
      }
      createdAt
    }
  }
`;
