package com.cervellovisivo.mobile

import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
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
            try {
                val file = File(destPath)
                file.parentFile?.mkdirs()

                // Step 1: HEAD per scoprire dimensione e supporto Range
                var headConn: HttpURLConnection? = null
                var contentLength: Long = -1
                var acceptsRanges = false
                try {
                    headConn = network.openConnection(URL(url)) as HttpURLConnection
                    headConn.requestMethod = "HEAD"
                    headConn.connectTimeout = 10_000
                    headConn.readTimeout = 15_000
                    headConn.instanceFollowRedirects = false
                    headConn.setRequestProperty("Connection", "keep-alive")
                    if (headConn.responseCode == 200) {
                        contentLength = headConn.contentLengthLong
                        acceptsRanges = headConn.getHeaderField("Accept-Ranges")
                            ?.equals("bytes", ignoreCase = true) == true
                    }
                } catch (_: Exception) {
                    // Fallback a sequenziale se HEAD fallisce
                } finally {
                    headConn?.disconnect()
                }

                // Step 2: se Range supportato e file abbastanza grande, scarica
                // in parallelo. 8 chunk + buffer 512KB satura la banda 2.4GHz
                // della SC2 (~3-5 MB/s effettivi) meglio dei 4 chunk precedenti.
                val CHUNK_COUNT = 8
                val MIN_CHUNK_SIZE = 256 * 1024L  // 256KB min/chunk → file >= 2MB usa parallel
                if (acceptsRanges && contentLength > MIN_CHUNK_SIZE * CHUNK_COUNT) {
                    downloadChunked(network, url, file, contentLength, CHUNK_COUNT, promise)
                } else {
                    downloadSequential(network, url, file, promise)
                }
            } catch (e: Exception) {
                promise.reject("DOWNLOAD_FAILED", e.message ?: "Download fallito")
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
        try {
            conn = network.openConnection(URL(url)) as HttpURLConnection
            conn.connectTimeout = 30_000
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
            // Riduce le syscall di read/write su LAN locale ad alta banda.
            val bufferSize = 1024 * 1024
            BufferedInputStream(conn.inputStream, bufferSize).use { input ->
                BufferedOutputStream(FileOutputStream(file), bufferSize).use { output ->
                    input.copyTo(output, bufferSize)
                }
            }
            promise.resolve(file.absolutePath)
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_FAILED", e.message ?: "Download fallito")
        } finally {
            conn?.disconnect()
        }
    }

    /** Download parallelo con HTTP Range: divide in `chunkCount` pezzi scaricati in parallelo */
    private fun downloadChunked(
        network: Network,
        url: String,
        file: File,
        totalSize: Long,
        chunkCount: Int,
        promise: Promise
    ) {
        try {
            // Pre-alloca il file a dimensione totale
            RandomAccessFile(file, "rw").use { raf -> raf.setLength(totalSize) }

            val chunkSize = totalSize / chunkCount
            val errors = java.util.Collections.synchronizedList(mutableListOf<String>())
            val latch = java.util.concurrent.CountDownLatch(chunkCount)

            for (i in 0 until chunkCount) {
                val start = i * chunkSize
                val end = if (i == chunkCount - 1) totalSize - 1 else (start + chunkSize - 1)

                Thread {
                    var conn: HttpURLConnection? = null
                    try {
                        conn = network.openConnection(URL(url)) as HttpURLConnection
                        conn.requestMethod = "GET"
                        conn.connectTimeout = 30_000
                        conn.readTimeout = 120_000
                        conn.instanceFollowRedirects = false
                        conn.setRequestProperty("Connection", "keep-alive")
                        conn.setRequestProperty("Accept-Encoding", "identity")
                        conn.setRequestProperty("Range", "bytes=$start-$end")
                        conn.connect()

                        val code = conn.responseCode
                        if (code != 206 && code != 200) {
                            errors.add("Chunk $i HTTP $code")
                            return@Thread
                        }

                        // Buffer 512 KB per chunk (8 chunk = ~4 MB di buffer
                        // totale, accettabile su Android moderno) — riduce
                        // overhead syscall sul read del socket.
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

            // Attendi tutti i thread (max 3 minuti total)
            if (!latch.await(180, java.util.concurrent.TimeUnit.SECONDS)) {
                promise.reject("DOWNLOAD_TIMEOUT", "Timeout download parallelo")
                return
            }

            if (errors.isNotEmpty()) {
                // Qualcosa è andato storto — fallback sequenziale
                downloadSequential(network, url, file, promise)
                return
            }

            promise.resolve(file.absolutePath)
        } catch (e: Exception) {
            // Se il parallel fallisce per qualsiasi ragione, fallback sequenziale
            downloadSequential(network, url, file, promise)
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
