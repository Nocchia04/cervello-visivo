package com.cervellovisivo.mobile

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL

/**
 * ThetaWifiModule — Connette al WiFi della RICOH THETA SC2 su Android 10+
 * senza perdere i dati mobili (WifiNetworkSpecifier).
 *
 * ROUTING: bindProcessToNetwork() è l'unica API che su tutti i dispositivi
 * garantisce che il socket TCP venga aperto sulla rete camera.
 * Viene attivato solo per il tempo necessario ad aprire la connessione
 * (< 200ms su rete locale), poi ripristinato subito al network di default
 * così internet continua a funzionare.
 */
class ThetaWifiModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var cameraNetwork: Network? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var previewThread: Thread? = null
    private var previewConn: HttpURLConnection? = null

    override fun getName(): String = "ThetaWifiModule"

    private val connectivityManager: ConnectivityManager
        get() = reactContext.getSystemService(ConnectivityManager::class.java)

    // ── Connessione al WiFi camera ──────────────────────────────────────────

    @ReactMethod
    fun connectToCamera(ssid: String, password: String, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("UNSUPPORTED", "Richiede Android 10+. Connettiti manualmente al WiFi $ssid.")
            return
        }

        releaseNetwork()

        val specifier = WifiNetworkSpecifier.Builder()
            .setSsid(ssid)
            .apply { if (password.isNotEmpty()) setWpa2Passphrase(password) }
            .build()

        val networkRequest = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .setNetworkSpecifier(specifier)
            .build()

        var resolved = false

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (resolved) return
                resolved = true
                cameraNetwork = network
                promise.resolve(null)
            }

            override fun onUnavailable() {
                if (resolved) return
                resolved = true
                promise.reject(
                    "WIFI_UNAVAILABLE",
                    "Impossibile connettersi a $ssid. Verifica che la camera sia accesa e vicina."
                )
            }

            override fun onLost(network: Network) {
                if (network == cameraNetwork) {
                    cameraNetwork = null
                    sendEvent("ThetaWifiLost", null)
                }
            }
        }

        networkCallback = callback
        connectivityManager.requestNetwork(networkRequest, callback, 15_000)
    }

    @ReactMethod
    fun disconnectFromCamera(promise: Promise) {
        stopPreviewInternal()
        releaseNetwork()
        promise.resolve(null)
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        promise.resolve(cameraNetwork != null)
    }

    // ── HTTP Request ─────────────────────────────────────────────────────────
    //
    // Usa network.openConnection(URL) che lega il socket direttamente alla rete
    // camera senza toccare il routing di processo.
    // Internet del telefono rimane su dati mobili per tutta la durata.

    @ReactMethod
    fun makeRequest(url: String, method: String, body: String?, promise: Promise) {
        val network = cameraNetwork
            ?: return promise.reject("NOT_CONNECTED", "Non connesso al WiFi della camera")

        Thread {
            var conn: HttpURLConnection? = null
            try {
                conn = network.openConnection(URL(url)) as HttpURLConnection
                conn.requestMethod = method
                conn.connectTimeout = 15_000
                conn.readTimeout   = 60_000
                conn.instanceFollowRedirects = false
                conn.setRequestProperty("Accept", "application/json")

                if (method != "GET" && body != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                } else {
                    conn.connect()
                }

                val code = conn.responseCode
                val responseBody = try {
                    (if (code in 200..299) conn.inputStream else conn.errorStream)
                        ?.bufferedReader()?.readText() ?: ""
                } catch (_: Exception) { "" }

                val result = Arguments.createMap().apply {
                    putInt("status", code)
                    putString("body", responseBody)
                }
                promise.resolve(result)

            } catch (e: Exception) {
                promise.reject("REQUEST_FAILED", e.message ?: "Richiesta fallita")
            } finally {
                conn?.disconnect()
            }
        }.start()
    }

    // ── File Download via camera network ─────────────────────────────────────
    //
    // Usa network.openConnection() che lega il socket alla rete camera.
    // Legge il body come byte stream e scrive sul filesystem locale.

    @ReactMethod
    fun downloadFileToCameraNetwork(url: String, destPath: String, promise: Promise) {
        val network = cameraNetwork
            ?: return promise.reject("NOT_CONNECTED", "Non connesso al WiFi della camera")

        Thread {
            var conn: HttpURLConnection? = null
            try {
                conn = network.openConnection(URL(url)) as HttpURLConnection
                conn.connectTimeout = 30_000
                conn.readTimeout   = 120_000
                conn.instanceFollowRedirects = false
                conn.connect()

                val code = conn.responseCode
                if (code != 200) {
                    promise.reject("DOWNLOAD_ERROR", "HTTP $code durante il download")
                    return@Thread
                }

                val file = File(destPath)
                file.parentFile?.mkdirs()
                conn.inputStream.use { input ->
                    file.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                promise.resolve(destPath)
            } catch (e: Exception) {
                promise.reject("DOWNLOAD_FAILED", e.message ?: "Download fallito")
            } finally {
                conn?.disconnect()
            }
        }.start()
    }

    // ── Diagnostics ───────────────────────────────────────────────────────────

    @ReactMethod
    fun getNetworkInfo(promise: Promise) {
        val network = cameraNetwork
        if (network == null) {
            promise.resolve("cameraNetwork=null")
            return
        }
        val caps  = connectivityManager.getNetworkCapabilities(network)
        val link  = connectivityManager.getLinkProperties(network)
        val ifName = link?.interfaceName
        val addrs  = link?.linkAddresses?.joinToString { "${it.address.hostAddress}/${it.prefixLength}" }
        val routes = link?.routes?.joinToString { "${it.destination} → ${it.gateway?.hostAddress}" }

        // Controlla se l'interfaccia ha un'IPv4 reale
        val netIf   = if (ifName != null) NetworkInterface.getByName(ifName) else null
        val ipv4    = netIf?.inetAddresses?.toList()?.filterIsInstance<Inet4Address>()?.firstOrNull()?.hostAddress

        val info = buildString {
            appendLine("network=$network")
            appendLine("interface=$ifName")
            appendLine("ipv4_on_interface=$ipv4")
            appendLine("link_addresses=$addrs")
            appendLine("routes=$routes")
            appendLine("caps=${caps?.toString()?.take(200)}")
        }
        promise.resolve(info)
    }

    // ── Live Preview (MJPEG stream) ───────────────────────────────────────────

    @ReactMethod
    fun startLivePreview(executeUrl: String, promise: Promise) {
        val network = cameraNetwork
            ?: return promise.reject("NOT_CONNECTED", "Non connesso al WiFi della camera")

        stopPreviewInternal()

        previewThread = Thread {
            var conn: HttpURLConnection? = null
            try {
                conn = network.openConnection(URL(executeUrl)) as HttpURLConnection
                previewConn = conn
                conn.requestMethod = "POST"
                conn.connectTimeout = 15_000
                conn.readTimeout   = 0 // stream infinito
                conn.doOutput = true
                conn.instanceFollowRedirects = false
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use {
                    it.write("""{"name":"camera.getLivePreview"}""".toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                if (code != 200) {
                    promise.reject("PREVIEW_ERROR", "Stream HTTP $code")
                    return@Thread
                }

                promise.resolve(null)

                val inputStream: InputStream = conn!!.inputStream
                parseMjpegStream(inputStream)

            } catch (e: Exception) {
                if (!Thread.interrupted()) {
                    sendEvent("ThetaPreviewError", e.message ?: "Errore stream")
                }
            } finally {
                conn?.disconnect()
                previewConn = null
            }
        }
        previewThread!!.start()
    }

    @ReactMethod
    fun stopLivePreview(promise: Promise) {
        stopPreviewInternal()
        promise.resolve(null)
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private fun parseMjpegStream(inputStream: InputStream) {
        val chunkSize = 65_536
        val buffer = ByteArray(chunkSize)
        val frameBuffer = ArrayList<Byte>(100_000)
        var inJpeg = false

        while (!Thread.currentThread().isInterrupted) {
            val bytesRead = inputStream.read(buffer)
            if (bytesRead < 0) break

            for (i in 0 until bytesRead) {
                val b = buffer[i]

                if (!inJpeg) {
                    frameBuffer.add(b)
                    val sz = frameBuffer.size
                    if (sz >= 2 &&
                        frameBuffer[sz - 2] == 0xFF.toByte() &&
                        frameBuffer[sz - 1] == 0xD8.toByte()
                    ) {
                        inJpeg = true
                        frameBuffer.clear()
                        frameBuffer.add(0xFF.toByte())
                        frameBuffer.add(0xD8.toByte())
                    }
                    if (frameBuffer.size > 8192) frameBuffer.clear()
                } else {
                    frameBuffer.add(b)
                    val sz = frameBuffer.size
                    if (sz >= 2 &&
                        frameBuffer[sz - 2] == 0xFF.toByte() &&
                        b == 0xD9.toByte()
                    ) {
                        val b64 = Base64.encodeToString(frameBuffer.toByteArray(), Base64.NO_WRAP)
                        sendEvent("ThetaLiveFrame", "data:image/jpeg;base64,$b64")
                        frameBuffer.clear()
                        inJpeg = false
                    }
                    if (frameBuffer.size > 2_000_000) {
                        frameBuffer.clear()
                        inJpeg = false
                    }
                }
            }
        }
    }

    private fun stopPreviewInternal() {
        previewThread?.interrupt()
        previewThread = null
        try { previewConn?.disconnect() } catch (_: Exception) {}
        previewConn = null
    }

    private fun releaseNetwork() {
        networkCallback?.let {
            try { connectivityManager.unregisterNetworkCallback(it) } catch (_: Exception) {}
        }
        networkCallback = null
        cameraNetwork = null
    }

    private fun sendEvent(eventName: String, data: String?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, data)
    }

    @ReactMethod fun addListener(eventName: String) { /* no-op */ }
    @ReactMethod fun removeListeners(count: Double) { /* no-op */ }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        stopPreviewInternal()
        releaseNetwork()
    }
}
