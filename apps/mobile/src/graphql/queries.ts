import { gql } from "@apollo/client";

export const ME_QUERY = gql`
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

export const CANTIERI_QUERY = gql`
  query Cantieri {
    cantieri(includiArchiviati: false) {
      id
      nome
      indirizzo
      stato
      piantine {
        id
        nome
        livello
      }
    }
  }
`;

export const CANTIERE_QUERY = gql`
  query Cantiere($id: ID!) {
    cantiere(id: $id) {
      id
      nome
      indirizzo
      stato
      piantine {
        id
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
        }
      }
    }
  }
`;

export const PIANTINE_QUERY = gql`
  query Piantine($cantiereId: ID!) {
    piantine(cantiereId: $cantiereId) {
      id
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
      }
    }
  }
`;

export const PIANTINA_QUERY = gql`
  query Piantina($id: ID!) {
    piantina(id: $id) {
      id
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

export const FOTO360_QUERY = gql`
  query Foto360($puntoId: ID!) {
    foto360(puntoId: $puntoId) {
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

export const FOTO_SINGOLA_QUERY = gql`
  query FotoSingola($id: ID!) {
    fotoSingola(id: $id) {
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
    }
  }
`;

export const ANNOTAZIONI_QUERY = gql`
  query Annotazioni($foto360Id: ID!) {
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
