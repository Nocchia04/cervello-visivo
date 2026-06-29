package com.cervellovisivo.mobile

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.RectF
import android.net.Network
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.io.BufferedInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * SurfaceView che renderizza il live preview MJPEG della Ricoh Theta SC2.
 *
 * Flusso:
 *   1. startPreview(network) — apre POST /osc/commands/execute su un Thread background
 *   2. Parsa il multipart MJPEG (boundary + Content-Length headers)
 *   3. BitmapFactory.decodeByteArray() — decode JPEG in memoria nativa
 *   4. Canvas.drawBitmap() — disegno diretto sulla Surface (GPU)
 *
 * Zero base64, zero RN bridge per i frame — rendering a 10fps senza flickering.
 */
class ThetaPreviewView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

    @Volatile private var running = false
    @Volatile private var stopRequested = false
    @Volatile private var conn: HttpURLConnection? = null
    private var firstFrameSent = false

    // Ultimo frame JPEG ricevuto dallo stream MJPEG (1024×512 sulla SC2).
    // Permette di "catturare" un fotogramma della live preview come immagine
    // senza scaricare il file 5K dalla camera (zero download, istantaneo).
    @Volatile private var lastFrameJpeg: ByteArray? = null

    companion object {
        /**
         * Tentativi massimi di apertura dello stream MJPEG. La SC2 a volte
         * risponde 200 ma chiude subito senza frame: ~4 retry coprono il caso
         * senza far girare il thread all'infinito.
         */
        private const val MAX_PREVIEW_ATTEMPTS = 5

        /**
         * Ultima istanza con uno stream avviato. Permette al download nativo
         * (ThetaWifiModule) di killare la preview INCONDIZIONATAMENTE prima
         * del transfer: la MJPEG occupa ~3-4 MB/s, l'intera banda 2.4GHz
         * della SC2 — se per qualsiasi race JS resta attiva, il download
         * crolla a ~50 KB/s.
         */
        @Volatile var activeInstance: java.lang.ref.WeakReference<ThetaPreviewView>? = null
    }

    /** True se il thread MJPEG è attivo */
    fun isStreamRunning(): Boolean = running

    /**
     * Salva l'ultimo frame JPEG della preview su file. Ritorna true se c'era
     * un frame disponibile. Usato per "scattare" usando la live preview come
     * sorgente immagine (1024×512), senza alcun download dalla camera.
     */
    fun saveLastFrame(destPath: String): Boolean {
        val bytes = lastFrameJpeg ?: return false
        return try {
            val f = java.io.File(destPath)
            f.parentFile?.mkdirs()
            java.io.FileOutputStream(f).use { it.write(bytes) }
            true
        } catch (e: Exception) {
            android.util.Log.w("ThetaWifi", "saveLastFrame fallito: ${e.message}")
            false
        }
    }

    /**
     * Notifica JS di un errore preview senza avviare lo stream — usato dal
     * ViewManager quando isStreaming=true arriva ma la rete camera è null
     * (altrimenti lo stato JS resterebbe su "streaming" con spinner infinito).
     */
    fun notifyPreviewUnavailable() {
        post { emitError("Rete camera non disponibile") }
    }

    init {
        holder.addCallback(this)
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        val canvas = holder.lockCanvas() ?: return
        canvas.drawColor(Color.BLACK)
        holder.unlockCanvasAndPost(canvas)
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        stopInternal()
    }

    // ── Public API ──────────────────────────────────────────────────────────

    fun startPreview(network: Network) {
        stopInternal()
        firstFrameSent = false
        stopRequested = false
        running = true
        activeInstance = java.lang.ref.WeakReference(this)

        Thread {
            var anyFrameEver = false
            var attempt = 0
            // RETRY: la SC2 a volte accetta getLivePreview (200) ma chiude lo
            // stream SENZA mandare frame ("Sometimes Theta SC2 doesn't send
            // chunk data" — quirk noto, l'SDK ufficiale fa lo stesso). Riproviamo
            // finché non arrivano frame o esauriamo i tentativi.
            while (!stopRequested && attempt < MAX_PREVIEW_ATTEMPTS) {
                attempt++
                var framesThisAttempt = false
                var c: HttpURLConnection? = null
                try {
                    c = network.openConnection(
                        URL("http://192.168.1.1/osc/commands/execute")
                    ) as HttpURLConnection
                    conn = c
                    c.requestMethod = "POST"
                    c.connectTimeout = 10_000
                    c.readTimeout = 0 // streaming infinito
                    c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    c.doOutput = true
                    c.outputStream.use {
                        it.write("""{"name":"camera.getLivePreview","parameters":{}}""".toByteArray())
                    }

                    val code = c.responseCode
                    if (code == 200) {
                        val stream = BufferedInputStream(c.inputStream, 65536)
                        var contentLength = -1
                        var inHeaders = false
                        while (!stopRequested) {
                            val line = readStreamLine(stream) ?: break
                            when {
                                line.startsWith("--") -> { inHeaders = true; contentLength = -1 }
                                inHeaders && line.startsWith("Content-Length:", ignoreCase = true) -> {
                                    contentLength = line.substringAfter(":").trim().toIntOrNull() ?: -1
                                }
                                inHeaders && line.isEmpty() && contentLength > 0 -> {
                                    val bytes = readExactBytes(stream, contentLength)
                                    if (bytes != null && !stopRequested) {
                                        renderFrame(bytes)
                                        framesThisAttempt = true
                                        anyFrameEver = true
                                    }
                                    inHeaders = false
                                    contentLength = -1
                                }
                            }
                        }
                    } else {
                        android.util.Log.w("ThetaWifi", "getLivePreview HTTP $code (tentativo $attempt)")
                    }
                } catch (e: Exception) {
                    android.util.Log.w("ThetaWifi", "getLivePreview eccezione (tentativo $attempt): ${e.message}")
                } finally {
                    conn = null
                    try { c?.disconnect() } catch (_: Exception) {}
                }

                if (stopRequested) break
                // Stream chiuso: se NON ha mai dato frame in questo tentativo è
                // il quirk → retry dopo breve pausa. Se aveva frame (disconnect
                // mid-sessione) riprova subito per riprendere.
                android.util.Log.w(
                    "ThetaWifi",
                    "Preview stream chiuso (tentativo $attempt, frame=$framesThisAttempt) — retry"
                )
                Thread.sleep(if (framesThisAttempt) 300 else 600)
            }

            running = false
            // Se siamo qui senza essere stati fermati a mano, la preview non
            // regge: notifica errore a JS (mostra "Riprova" invece del loop).
            if (!stopRequested) {
                emitError(if (anyFrameEver) "Preview interrotta" else "Preview non disponibile")
            }
        }.start()
    }

    fun stopPreview() {
        stopInternal()
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    private fun renderFrame(jpegBytes: ByteArray) {
        // Memorizza l'ultimo frame (readExactBytes alloca un array fresco per
        // frame → possiamo tenere il riferimento senza copiare).
        lastFrameJpeg = jpegBytes
        // Use RGB_565 for faster decode + less memory (preview doesn't need alpha)
        val opts = BitmapFactory.Options().apply {
            inPreferredConfig = android.graphics.Bitmap.Config.RGB_565
        }
        val bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size, opts) ?: return
        val sh = holder
        if (!sh.surface.isValid) {
            bitmap.recycle()
            return
        }
        val canvas = sh.lockCanvas() ?: run { bitmap.recycle(); return }
        try {
            canvas.drawColor(Color.BLACK)
            val scale = minOf(
                canvas.width.toFloat() / bitmap.width,
                canvas.height.toFloat() / bitmap.height
            )
            val scaledW = bitmap.width * scale
            val scaledH = bitmap.height * scale
            val left = (canvas.width - scaledW) / 2f
            val top = (canvas.height - scaledH) / 2f
            canvas.drawBitmap(bitmap, null, RectF(left, top, left + scaledW, top + scaledH), null)
        } finally {
            sh.unlockCanvasAndPost(canvas)
            bitmap.recycle()
        }

        // Notifica JS al primo frame — per nascondere il loading spinner
        if (!firstFrameSent) {
            firstFrameSent = true
            post { emitFirstFrame() }
        }
    }

    // ── Events verso JS ─────────────────────────────────────────────────────

    private fun emitFirstFrame() {
        (context as? ReactContext)
            ?.getJSModule(RCTEventEmitter::class.java)
            ?.receiveEvent(id, "topFirstFrame", null)
    }

    private fun emitError(message: String) {
        (context as? ReactContext)
            ?.getJSModule(RCTEventEmitter::class.java)
            ?.receiveEvent(id, "topPreviewError", null)
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private fun stopInternal() {
        // stopRequested ferma il retry loop in startPreview: senza, il thread
        // riproverebbe a riconnettersi dopo ogni disconnect() qui sotto.
        stopRequested = true
        running = false
        val c = conn
        conn = null
        try { c?.disconnect() } catch (_: Exception) {}
    }

    private fun readStreamLine(stream: InputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val c = stream.read()
            if (c == -1) return if (sb.isEmpty()) null else sb.toString()
            if (c == '\r'.code) {
                val next = stream.read()
                if (next == '\n'.code) return sb.toString()
                if (next == -1) return sb.toString()
                sb.append(next.toChar())
            } else if (c == '\n'.code) {
                return sb.toString()
            } else {
                sb.append(c.toChar())
            }
        }
    }

    private fun readExactBytes(stream: InputStream, length: Int): ByteArray? {
        val buf = ByteArray(length)
        var offset = 0
        while (offset < length && !stopRequested) {
            val n = stream.read(buf, offset, length - offset)
            if (n < 0) return null
            offset += n
        }
        return if (offset == length) buf else null
    }
}
