import { gql } from "@apollo/client";

export const LOGIN_MUTATION = gql`
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

export const UPLOAD_FOTO360_MUTATION = gql`
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
      uploadedBy {
        id
        nome
        cognome
      }
    }
  }
`;

export const CREA_ANNOTAZIONE_MUTATION = gql`
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
