package com.cervellovisivo.mobile

import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL

/**
 * ThetaWifiModule — Connette al WiFi della RICOH THETA SC2 su Android 10+
 * senza perdere i dati mobili (WifiNetworkSpecifier).
 *
 * Tutte le chiamate HTTP verso la camera (OSC API, download) usano
 * network.openConnection(URL(...)) — nessun bindProcessToNetwork necessario.
 *
 * Live preview MJPEG: gestito nativamente da ThetaPreviewView (SurfaceView).
 * Nessun frame passa dal bridge RN.
 */
@ReactModule(name = ThetaWifiModule.NAME)
class ThetaWifiModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var cameraNetwork: Network? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    companion object {
        const val NAME = "ThetaWifiModule"
    }

    override fun getName(): String = NAME

    private val connectivityManager: ConnectivityManager
        get() = reactContext.getSystemService(ConnectivityManager::class.java)

    /** Espone la rete camera a ThetaPreviewViewManager (Kotlin-only, non @ReactMethod). */
    fun getCameraNetwork(): Network? = cameraNetwork

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
        connectivityManager.bindProcessToNetwork(null)
        releaseNetwork()
        promise.resolve(null)
    }

    @ReactMethod
    fun bindToCameraNetwork(promise: Promise) {
        val network = cameraNetwork
            ?: return promise.reject("NOT_CONNECTED", "Non connesso al WiFi della camera")
        connectivityManager.bindProcessToNetwork(network)
        promise.resolve(null)
    }

    @ReactMethod
    fun unbindFromCameraNetwork(promise: Promise) {
        connectivityManager.bindProcessToNetwork(null)
        promise.resolve(null)
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        promise.resolve(cameraNetwork != null)
    }

    @ReactMethod
    fun isLocationEnabled(promise: Promise) {
        val locationManager = reactContext.getSystemService(LocationManager::class.java)
        val enabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            locationManager.isLocationEnabled
        } else {
            locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
            locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }
        promise.resolve(enabled)
    }

    // ── HTTP Request ─────────────────────────────────────────────────────────

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

    @ReactMethod
    fun downloadFileToCameraNetwork(url: String, destPath: String, promise: Promise) {
        val network = cameraNetwork
            ?: return promise.reject("NOT_CONNECTED", "Non connesso al WiFi della camera")

        Thread {
            val startTime = System.currentTimeMillis()
            // WiFi Lock high-performance: impedisce al chip WiFi del telefono
            // di entrare in power-save mode durante il download (può tagliare
            // la banda effettiva del 50-80% su alcuni device). Rilasciato in
            // finally così che torni in stato normale dopo il transfer.
            val wifiManager = reactContext.applicationContext
                .getSystemService(android.content.Context.WIFI_SERVICE) as? WifiManager
            val wifiLock = wifiManager?.createWifiLock(
                WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "ThetaDownloadLock"
            )?.apply {
                setReferenceCounted(false)
                try { acquire() } catch (_: Exception) {}
            }

            try {
                val file = File(destPath)
                file.parentFile?.mkdirs()

                // Step 1: HEAD per scoprire dimensione. NON ci affidiamo più
                // ad `Accept-Ranges` per decidere se parallelizzare: la SC2
                // (e altre camere) supportano Range nei GET anche senza
                // dichiararlo nell'header HEAD. Tentiamo SEMPRE parallel se
                // contentLength è noto e abbastanza grande.
                var headConn: HttpURLConnection? = null
                var contentLength: Long = -1
                var acceptsRangesAdvertised = false
                val headStart = System.currentTimeMillis()
                try {
                    headConn = network.openConnection(URL(url)) as HttpURLConnection
                    headConn.requestMethod = "HEAD"
                    headConn.connectTimeout = 5_000
                    headConn.readTimeout = 5_000
                    headConn.instanceFollowRedirects = false
                    headConn.setRequestProperty("Connection", "keep-alive")
                    if (headConn.responseCode == 200) {
                        contentLength = headConn.contentLengthLong
                        acceptsRangesAdvertised = headConn.getHeaderField("Accept-Ranges")
                            ?.equals("bytes", ignoreCase = true) == true
                    }
                } catch (e: Exception) {
                    android.util.Log.w("ThetaWifi", "HEAD fallito: ${e.message}")
                } finally {
                    headConn?.disconnect()
                }
                val headElapsed = System.currentTimeMillis() - headStart
                android.util.Log.d(
                    "ThetaWifi",
                    "HEAD done in ${headElapsed}ms — size=$contentLength, advertised Accept-Ranges=$acceptsRangesAdvertised"
                )

                val CHUNK_COUNT = 8
                val MIN_CHUNK_SIZE = 256 * 1024L  // ≥ 2 MB attiva parallel
                val downloadStart = System.currentTimeMillis()

                if (contentLength > MIN_CHUNK_SIZE * CHUNK_COUNT) {
                    android.util.Log.d(
                        "ThetaWifi",
                        "Tentativo parallel: $CHUNK_COUNT chunks su file ${contentLength / 1024} KB"
                    )
                    val ok = downloadChunkedOrFail(network, url, file, contentLength, CHUNK_COUNT)
                    if (!ok) {
                        android.util.Log.w("ThetaWifi", "Parallel fallito — fallback sequential")
                        downloadSequential(network, url, file, promise)
                    } else {
                        val elapsed = System.currentTimeMillis() - downloadStart
                        val kbs = if (elapsed > 0) (contentLength * 1000 / elapsed / 1024) else 0
                        android.util.Log.d(
                            "ThetaWifi",
                            "Parallel download OK: ${elapsed}ms, ${kbs} KB/s, total ${System.currentTimeMillis() - startTime}ms"
                        )
                        promise.resolve(file.absolutePath)
                    }
                } else {
                    android.util.Log.d(
                        "ThetaWifi",
                        "File piccolo o size sconosciuto ($contentLength) — sequential"
                    )
                    downloadSequential(network, url, file, promise)
                }
            } catch (e: Exception) {
                promise.reject("DOWNLOAD_FAILED", e.message ?: "Download fallito")
            } finally {
                try { wifiLock?.release() } catch (_: Exception) {}
            }
        }.start()
    }

    /** Download sequenziale (fallback se Range non supportato o file piccolo) */
    private fun downloadSequential(
        network: Network,
        url: String,
        file: File,
        promise: Promise
    ) {
        var conn: HttpURLConnection? = null
        val start = System.currentTimeMillis()
        try {
            conn = network.openConnection(URL(url)) as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 120_000
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("Connection", "keep-alive")
            conn.setRequestProperty("Accept-Encoding", "identity")
            conn.connect()

            if (conn.responseCode != 200) {
                promise.reject("DOWNLOAD_ERROR", "HTTP ${conn.responseCode} durante il download")
                return
            }

            // Buffer 1 MB per il sequenziale (file piccoli o Range non supportato).
            val bufferSize = 1024 * 1024
            BufferedInputStream(conn.inputStream, bufferSize).use { input ->
                BufferedOutputStream(FileOutputStream(file), bufferSize).use { output ->
                    input.copyTo(output, bufferSize)
                }
            }
            val elapsed = System.currentTimeMillis() - start
            val sizeBytes = file.length()
            val kbs = if (elapsed > 0) (sizeBytes * 1000 / elapsed / 1024) else 0
            android.util.Log.d(
                "ThetaWifi",
                "Sequential download OK: ${elapsed}ms, ${sizeBytes / 1024} KB, ${kbs} KB/s"
            )
            promise.resolve(file.absolutePath)
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_FAILED", e.message ?: "Download fallito")
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Download parallelo con HTTP Range. Ritorna `true` se completato con
     * successo, `false` se ha fallito (e il chiamante può fare fallback a
     * sequential). Non chiama il promise — la gestione è del caller.
     *
     * Guard chunk-by-chunk: se UN chunk torna 200 invece di 206, vuol dire
     * che il server (es. SC2 con firmware esotico) ha IGNORATO l'header
     * `Range` e sta servendo il file intero. In quel caso aborto immediato
     * (per non ricevere N copie dello stesso file in N thread).
     */
    private fun downloadChunkedOrFail(
        network: Network,
        url: String,
        file: File,
        totalSize: Long,
        chunkCount: Int
    ): Boolean {
        try {
            // Pre-alloca il file a dimensione totale (zero-fill via setLength).
            // Evita realloc durante le write paralleli da seek diversi.
            RandomAccessFile(file, "rw").use { raf -> raf.setLength(totalSize) }

            val chunkSize = totalSize / chunkCount
            val errors = java.util.Collections.synchronizedList(mutableListOf<String>())
            val rangeIgnoredByServer = java.util.concurrent.atomic.AtomicBoolean(false)
            val latch = java.util.concurrent.CountDownLatch(chunkCount)

            for (i in 0 until chunkCount) {
                val start = i * chunkSize
                val end = if (i == chunkCount - 1) totalSize - 1 else (start + chunkSize - 1)

                Thread {
                    var conn: HttpURLConnection? = null
                    try {
                        // Se un altro chunk ha già rilevato che il server
                        // ignora Range, abortisco anche questo (no spreco).
                        if (rangeIgnoredByServer.get()) return@Thread

                        conn = network.openConnection(URL(url)) as HttpURLConnection
                        conn.requestMethod = "GET"
                        conn.connectTimeout = 15_000
                        conn.readTimeout = 60_000
                        conn.instanceFollowRedirects = false
                        conn.setRequestProperty("Connection", "keep-alive")
                        conn.setRequestProperty("Accept-Encoding", "identity")
                        conn.setRequestProperty("Range", "bytes=$start-$end")
                        conn.connect()

                        val code = conn.responseCode
                        when {
                            code == 206 -> {
                                // Range supportato. Continua il download del chunk.
                            }
                            code == 200 -> {
                                // Server ignora Range → ha mandato il file intero.
                                // Aborto: non possiamo parallelizzare.
                                rangeIgnoredByServer.set(true)
                                errors.add("Chunk $i: Range ignorato (HTTP 200)")
                                return@Thread
                            }
                            else -> {
                                errors.add("Chunk $i HTTP $code")
                                return@Thread
                            }
                        }

                        // Buffer 512 KB per chunk (8 chunk = ~4 MB totali,
                        // accettabile su Android moderno) — riduce syscall.
                        val bufferSize = 512 * 1024
                        RandomAccessFile(file, "rw").use { raf ->
                            raf.seek(start)
                            BufferedInputStream(conn.inputStream, bufferSize).use { input ->
                                val buf = ByteArray(bufferSize)
                                var read: Int
                                while (input.read(buf).also { read = it } > 0) {
                                    raf.write(buf, 0, read)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        errors.add("Chunk $i: ${e.message}")
                    } finally {
                        conn?.disconnect()
                        latch.countDown()
                    }
                }.start()
            }

            // Attendi tutti i thread (max 3 min totali per file molto grandi)
            if (!latch.await(180, java.util.concurrent.TimeUnit.SECONDS)) {
                android.util.Log.w("ThetaWifi", "downloadChunked: timeout latch")
                return false
            }

            if (errors.isNotEmpty()) {
                android.util.Log.w("ThetaWifi", "downloadChunked errors: $errors")
                return false
            }

            return true
        } catch (e: Exception) {
            android.util.Log.w("ThetaWifi", "downloadChunked exception: ${e.message}")
            return false
        }
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

    // ── Internals ─────────────────────────────────────────────────────────────

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

    @ReactMethod fun addListener(eventName: String?) { /* no-op */ }
    @ReactMethod fun removeListeners(count: Double) { /* no-op */ }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        connectivityManager.bindProcessToNetwork(null)
        releaseNetwork()
    }
}
