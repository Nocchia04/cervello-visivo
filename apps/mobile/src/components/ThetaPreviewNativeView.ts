import { requireNativeComponent } from "react-native";
import type { ViewStyle } from "react-native";

interface ThetaPreviewNativeViewProps {
  /** true → avvia stream MJPEG nativo; false → ferma */
  isStreaming: boolean;
  /** Chiamato al primo frame renderizzato — per nascondere il loading spinner */
  onFirstFrame?: () => void;
  /** Chiamato in caso di errore nativo dello stream */
  onPreviewError?: () => void;
  style?: ViewStyle;
}

export default requireNativeComponent<ThetaPreviewNativeViewProps>("ThetaPreviewView");
