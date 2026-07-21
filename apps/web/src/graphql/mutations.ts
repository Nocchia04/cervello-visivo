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

export const RINOMINA_PUNTO_DI_SCATTO = gql`
  mutation RinominaPuntoDiScatto($id: ID!, $nome: String!) {
    rinominaPuntoDiScatto(id: $id, nome: $nome) {
      id
      nome
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
    $timestamp: String
  ) {
    uploadFoto360(
      puntoDiScattoId: $puntoDiScattoId
      url: $url
      thumbnailUrl: $thumbnailUrl
      metadata: $metadata
      timestamp: $timestamp
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

export const AGGIORNA_ANNOTAZIONE = gql`
  mutation AggiornaAnnotazione($id: ID!, $testo: String!) {
    aggiornaAnnotazione(id: $id, testo: $testo) {
      id
      testo
    }
  }
`;

export const ELIMINA_ANNOTAZIONE = gql`
  mutation EliminaAnnotazione($id: ID!) {
    eliminaAnnotazione(id: $id) {
      id
      foto360Id
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

export const ELIMINA_OPERATORE = gql`
  mutation EliminaOperatore($id: ID!) {
    eliminaOperatore(id: $id) {
      id
    }
  }
`;

export const ELIMINA_PUNTO_DI_SCATTO = gql`
  mutation EliminaPuntoDiScatto($id: ID!) {
    eliminaPuntoDiScatto(id: $id) {
      id
    }
  }
`;

export const RINOMINA_PIANTINA = gql`
  mutation RinominaPiantina($id: ID!, $nome: String!) {
    rinominaPiantina(id: $id, nome: $nome) {
      id
      nome
    }
  }
`;

export const ELIMINA_FOTO360 = gql`
  mutation EliminaFoto360($id: ID!) {
    eliminaFoto360(id: $id) {
      id
    }
  }
`;

export const AGGIORNA_DATA_CANTIERE = gql`
  mutation AggiornaDataCantiere($id: ID!, $data: String!) {
    aggiornaDataCantiere(id: $id, data: $data) {
      id
      createdAt
    }
  }
`;

export const AGGIORNA_DATA_PIANTINA = gql`
  mutation AggiornaDataPiantina($id: ID!, $data: String!) {
    aggiornaDataPiantina(id: $id, data: $data) {
      id
      createdAt
    }
  }
`;

export const AGGIORNA_DATA_PUNTO_DI_SCATTO = gql`
  mutation AggiornaDataPuntoDiScatto($id: ID!, $data: String!) {
    aggiornaDataPuntoDiScatto(id: $id, data: $data) {
      id
      createdAt
    }
  }
`;

export const AGGIORNA_DATA_FOTO360 = gql`
  mutation AggiornaDataFoto360($id: ID!, $data: String!) {
    aggiornaDataFoto360(id: $id, data: $data) {
      id
      timestamp
    }
  }
`;

export const CREA_LINK_CONDIVISIONE = gql`
  mutation CreaLinkCondivisione($cantiereId: ID!, $durataGiorni: Int) {
    creaLinkCondivisione(cantiereId: $cantiereId, durataGiorni: $durataGiorni) {
      id
      token
      expiresAt
      revocato
      accessiCount
      isExpired
      createdAt
    }
  }
`;

export const REVOCA_LINK_CONDIVISIONE = gql`
  mutation RevocaLinkCondivisione($id: ID!) {
    revocaLinkCondivisione(id: $id) {
      id
      revocato
    }
  }
`;

export const ELIMINA_LINK_CONDIVISIONE = gql`
  mutation EliminaLinkCondivisione($id: ID!) {
    eliminaLinkCondivisione(id: $id) {
      id
    }
  }
`;

export const CAMBIA_PASSWORD_OPERATORE = gql`
  mutation CambiaPasswordOperatore($id: ID!, $nuovaPassword: String!) {
    cambiaPasswordOperatore(id: $id, nuovaPassword: $nuovaPassword) {
      id
    }
  }
`;

export const CONFERMA_IMPORT_HOLOBUILDER = gql`
  mutation ConfermaImportHolobuilder(
    $jobId: ID!
    $nome: String!
    $indirizzo: String!
    $skipFotoSenzaData: Boolean
  ) {
    confermaImportHolobuilder(
      jobId: $jobId
      nome: $nome
      indirizzo: $indirizzo
      skipFotoSenzaData: $skipFotoSenzaData
    ) {
      stato
      cantiereId
      piantineCreate
      puntiCreati
      fotoCreate
      issues {
        severita
        categoria
        percorso
        messaggio
        azione
      }
    }
  }
`;
