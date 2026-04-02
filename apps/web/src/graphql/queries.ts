import { gql } from "@apollo/client";

export const ME = gql`
  query Me {
    me {
      id
      email
      nome
      cognome
      role
    }
  }
`;

export const GET_CANTIERI = gql`
  query GetCantieri($includiArchiviati: Boolean) {
    cantieri(includiArchiviati: $includiArchiviati) {
      id
      nome
      indirizzo
      stato
      thumbnailUrl
      createdAt
      piantine {
        id
        nome
        livello
        fileUrl
      }
    }
  }
`;

export const GET_CANTIERE = gql`
  query GetCantiere($id: ID!) {
    cantiere(id: $id) {
      id
      nome
      indirizzo
      stato
      createdAt
      updatedAt
      piantine {
        id
        nome
        livello
        fileUrl
        larghezza
        altezza
      }
    }
  }
`;

export const GET_PIANTINA = gql`
  query GetPiantina($id: ID!) {
    piantina(id: $id) {
      id
      cantiereId
      nome
      livello
      fileUrl
      larghezza
      altezza
      puntiDiScatto {
        id
        nome
        x
        y
        foto360 {
          id
          url
          thumbnailUrl
          timestamp
        }
      }
    }
  }
`;

export const GET_PUNTO_DI_SCATTO = gql`
  query GetPuntoDiScatto($id: ID!) {
    puntoDiScatto(id: $id) {
      id
      nome
    }
  }
`;

export const GET_FOTO360 = gql`
  query GetFoto360($puntoId: ID!, $dataInizio: String, $dataFine: String) {
    foto360(puntoId: $puntoId, dataInizio: $dataInizio, dataFine: $dataFine) {
      id
      url
      thumbnailUrl
      timestamp
      metadata
      uploadedBy {
        id
        nome
        cognome
      }
      createdAt
    }
  }
`;

export const GET_FOTO_SINGOLA = gql`
  query GetFotoSingola($id: ID!) {
    fotoSingola(id: $id) {
      id
      puntoDiScattoId
      url
      thumbnailUrl
      timestamp
      metadata
      uploadedBy {
        id
        nome
        cognome
      }
    }
  }
`;

export const GET_ANNOTAZIONI = gql`
  query GetAnnotazioni($foto360Id: ID!) {
    annotazioni(foto360Id: $foto360Id) {
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

export const GET_UTENTI = gql`
  query GetUtenti {
    utenti {
      id
      email
      nome
      cognome
      role
      createdAt
      cantieri {
        id
        cantiereId
      }
    }
  }
`;
