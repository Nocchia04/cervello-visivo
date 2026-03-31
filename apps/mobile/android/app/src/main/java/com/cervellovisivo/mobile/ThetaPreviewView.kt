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
    @Volatile private var conn: HttpURLConnection? = null
    private var firstFrameSent = false

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
        running = true

        Thread {
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
                if (code != 200) {
                    running = false
                    emitError("HTTP $code")
                    return@Thread
                }

                val stream = c.inputStream
                var contentLength = -1
                var inHeaders = false

                while (running) {
                    val line = readStreamLine(stream) ?: break

                    when {
                        line.startsWith("--") -> {
                            inHeaders = true
                            contentLength = -1
                        }
                        inHeaders && line.startsWith("Content-Length:", ignoreCase = true) -> {
                            contentLength = line.substringAfter(":").trim().toIntOrNull() ?: -1
                        }
                        inHeaders && line.isEmpty() && contentLength > 0 -> {
                            val bytes = readExactBytes(stream, contentLength)
                            if (bytes != null && running) renderFrame(bytes)
                            inHeaders = false
                            contentLength = -1
                        }
                    }
                }

            } catch (_: Exception) {
                // Eccezione normale quando stopPreview() chiama conn.disconnect()
                if (running) emitError("Stream interrotto")
            } finally {
                running = false
                conn = null
                c?.disconnect()
            }
        }.start()
    }

    fun stopPreview() {
        stopInternal()
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    private fun renderFrame(jpegBytes: ByteArray) {
        val bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size) ?: return
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
        while (offset < length && running) {
            val n = stream.read(buf, offset, length - offset)
            if (n < 0) return null
            offset += n
        }
        return if (offset == length) buf else null
    }
}
