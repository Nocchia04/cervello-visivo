import { gql } from "@apollo/client";

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        email
        nome
        cognome
        role
      }
    }
  }
`;

export const REGISTER = gql`
  mutation Register(
    $email: String!
    $password: String!
    $nome: String!
    $cognome: String!
    $role: UserRole
  ) {
    register(
      email: $email
      password: $password
      nome: $nome
      cognome: $cognome
      role: $role
    ) {
      token
      user {
        id
        email
        nome
        cognome
        role
      }
    }
  }
`;

export const CREA_CANTIERE = gql`
  mutation CreaCantiere($input: CreateCantiereInput!) {
    creaCantiere(input: $input) {
      id
      nome
      indirizzo
      stato
    }
  }
`;

export const AGGIORNA_CANTIERE = gql`
  mutation AggiornaCantiere($id: ID!, $input: UpdateCantiereInput!) {
    aggiornaCantiere(id: $id, input: $input) {
      id
      nome
      indirizzo
      stato
    }
  }
`;

export const ARCHIVIA_CANTIERE = gql`
  mutation ArchiviaCantiere($id: ID!) {
    archiviaCantiere(id: $id) {
      id
      stato
    }
  }
`;

export const RIATTIVA_CANTIERE = gql`
  mutation RiattivaCantiere($id: ID!) {
    riattivaCantiere(id: $id) {
      id
      stato
    }
  }
`;

export const CARICA_PIANTINA = gql`
  mutation CaricaPiantina(
    $cantiereId: ID!
    $nome: String!
    $livello: Int!
    $fileUrl: String!
    $larghezza: Int!
    $altezza: Int!
  ) {
    caricaPiantina(
      cantiereId: $cantiereId
      nome: $nome
      livello: $livello
      fileUrl: $fileUrl
      larghezza: $larghezza
      altezza: $altezza
    ) {
      id
      nome
      livello
      fileUrl
    }
  }
`;

export const AGGIUNGI_PUNTO_DI_SCATTO = gql`
  mutation AggiungiPuntoDiScatto(
    $piantinaId: ID!
    $nome: String!
    $x: Float!
    $y: Float!
  ) {
    aggiungiPuntoDiScatto(
      piantinaId: $piantinaId
      nome: $nome
      x: $x
      y: $y
    ) {
      id
      nome
      x
      y
    }
  }
`;

export const SPOSTA_PUNTO_DI_SCATTO = gql`
  mutation SpostaPuntoDiScatto($id: ID!, $x: Float!, $y: Float!) {
    spostaPuntoDiScatto(id: $id, x: $x, y: $y) {
      id
      x
      y
    }
  }
`;

export const UPLOAD_FOTO360 = gql`
  mutation UploadFoto360(
    $puntoDiScattoId: ID!
    $url: String!
    $thumbnailUrl: String
    $metadata: JSON
  ) {
    uploadFoto360(
      puntoDiScattoId: $puntoDiScattoId
      url: $url
      thumbnailUrl: $thumbnailUrl
      metadata: $metadata
    ) {
      id
      url
      thumbnailUrl
      timestamp
    }
  }
`;

export const CREA_ANNOTAZIONE = gql`
  mutation CreaAnnotazione(
    $foto360Id: ID!
    $testo: String!
    $x: Float!
    $y: Float!
  ) {
    creaAnnotazione(foto360Id: $foto360Id, testo: $testo, x: $x, y: $y) {
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

export const CREA_OPERATORE = gql`
  mutation CreaOperatore(
    $email: String!
    $password: String!
    $nome: String!
    $cognome: String!
  ) {
    creaOperatore(email: $email, password: $password, nome: $nome, cognome: $cognome) {
      token
      user {
        id
        email
        nome
        cognome
        role
      }
    }
  }
`;

export const ASSEGNA_OPERATORE_CANTIERE = gql`
  mutation AssegnaOperatoreCantiere($cantiereId: ID!, $userId: ID!) {
    assegnaOperatoreCantiere(cantiereId: $cantiereId, userId: $userId) {
      id
    }
  }
`;

export const RIMUOVI_OPERATORE_CANTIERE = gql`
  mutation RimuoviOperatoreCantiere($cantiereId: ID!, $userId: ID!) {
    rimuoviOperatoreCantiere(cantiereId: $cantiereId, userId: $userId) {
      id
    }
  }
`;
