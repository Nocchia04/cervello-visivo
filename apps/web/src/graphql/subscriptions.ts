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

export const IMPORT_PROGRESS = gql`
  subscription ImportProgress($jobId: ID!) {
    importProgress(jobId: $jobId) {
      fase
      correnti
      totali
      messaggio
      avvisiCount
      erroriCount
      completato
      errore
      cantiereId
    }
  }
`;
