export const SERVER_URL = "http://localhost:4000";

export function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere le dimensioni dell'immagine"));
    };
    img.src = url;
  });
}

export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("foto", file);

  const res = await fetch(`${SERVER_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ error: "Upload fallito" }));
    throw new Error(err.error || "Upload fallito");
  }

  const data = await res.json();
  // Server returns { url: "/uploads/uuid.jpg" } — prepend base URL
  return `${SERVER_URL}${data.url}`;
}
