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
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL

/**
 * ThetaWifiModule — Connette al WiFi delle RICOH THETA (V / SC2 / SC2_B)
 * su Android 10+ senza perdere i dati mobili (WifiNetworkSpecifier).
 *
 * Ruolo nella nuova architettura (control-plane = SDK ufficiale theta-client):
 *  - connectToCamera/disconnect: gestione della rete camera
 *  - bindToCameraNetwork/unbind: bindProcessToNetwork per l'SDK (Ktor usa la
 *    rete di default del processo)
 *  - downloadFileToCameraNetwork: download foto via network.openConnection
 *    (singolo GET + retry + verifica completezza; l'SDK non ha download API)
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

        /** Timeout allineati al client ufficiale theta-client (ThetaRepository.Timeout). */
        private const val OFFICIAL_CONNECT_TIMEOUT = 20_000
        private const val OFFICIAL_SOCKET_TIMEOUT = 20_000

        /**
         * Connessioni TCP parallele per il download (HTTP Range). L'httpd della
         * SC2 cappa il throughput per-socket (~25-52 KB/s): N connessioni
         * aggregano la banda. 8 è il valore provato in produzione (commit
         * ae2573b) che misurava ~200 KB/s aggregati — il best case raggiungibile
         * sulla radio 2.4GHz SISO della SC2 (NON i 2 MB/s di una 5GHz).
         */
        private const val CHUNK_COUNT = 8
    }

    override fun getName(): String = NAME

    private val connectivityManager: ConnectivityManager
        get() = reactContext.getSystemService(ConnectivityManager::class.java)

    /** Espone la rete camera a ThetaPreviewViewManager (Kotlin-only, non @ReactMethod). */
    fun getCameraNetwork(): Network? = cameraNetwork

    // ── Connessione al WiFi camera ──────────────────────────────────────────

    // Una richiesta requestNetwork in volo (dialogo "Connetti a THETA?" aperto):
    // evita che una seconda connectToCamera annulli il dialogo della prima.
    @Volatile private var requestPending = false

    @ReactMethod
    fun connectToCamera(ssid: String, password: String, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("UNSUPPORTED", "Richiede Android 10+. Connettiti manualmente al WiFi $ssid.")
            return
        }

        // IDEMPOTENTE: se siamo già connessi alla camera, non rimostrare il
        // dialogo — risolvi subito (la sessione resta viva tra gli screen).
        if (cameraNetwork != null) {
            promise.resolve(null)
            return
        }

        // GUARDIA: se un dialogo di connessione è già aperto, NON annullarlo
        // con un releaseNetwork — rifiuta in modo "morbido" così il chiamante
        // non spara un secondo requestNetwork sopra al primo.
        if (requestPending) {
            promise.reject("ALREADY_CONNECTING", "Connessione già in corso: completa il dialogo.")
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
        requestPending = true

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (resolved) return
                resolved = true
                requestPending = false
                cameraNetwork = network
                promise.resolve(null)
            }

            override fun onUnavailable() {
                if (resolved) return
                resolved = true
                requestPending = false
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
        // Timeout generoso (60s): copre il tempo per trovare e toccare il
        // dialogo "Connetti", anche su Xiaomi/Redmi dove è nella tendina
        // notifiche. Un timeout troppo corto annullerebbe il dialogo mentre
        // l'operatore lo sta cercando.
        connectivityManager.requestNetwork(networkRequest, callback, 60_000)
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

    /**
     * Diagnostica dual-STA: conta le reti WiFi attive DIVERSE dalla rete
     * camera. Su Android 12+ il telefono può tenere due WiFi insieme
     * (rete internet di casa/ufficio + rete camera): una sola radio fisica
     * time-sliced → il link camera si strozza a ~50 KB/s.
     */
    @ReactMethod
    fun countOtherWifiNetworks(promise: Promise) {
        try {
            @Suppress("DEPRECATION")
            val others = connectivityManager.allNetworks.count { n ->
                n != cameraNetwork &&
                    connectivityManager.getNetworkCapabilities(n)
                        ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            }
            promise.resolve(others)
        } catch (e: Exception) {
            promise.resolve(-1)
        }
    }

    /**
     * "Scatta" usando l'ultimo frame della live preview (1024×512) come
     * immagine — salvato su [destPath]. Zero download dalla camera.
     * Richiede che la preview sia in streaming (frame disponibile).
     */
    @ReactMethod
    fun capturePreviewFrame(destPath: String, promise: Promise) {
        val view = ThetaPreviewView.activeInstance?.get()
        if (view == null || !view.isStreamRunning()) {
            promise.reject("NO_PREVIEW", "Anteprima non attiva: avviala per inquadrare.")
            return
        }
        if (view.saveLastFrame(destPath)) {
            promise.resolve(destPath)
        } else {
            promise.reject("NO_FRAME", "Nessun frame disponibile dalla preview.")
        }
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

    // ── File Download via camera network ─────────────────────────────────────
    // Il control-plane OSC (scatto, opzioni, stato) passa dall'SDK ufficiale
    // theta-client (Ktor, con bindProcessToNetwork). Qui resta solo il
    // download del file, che l'SDK non fornisce.

    @ReactMethod
    fun downloadFileToCameraNetwork(url: String, destPath: String, promise: Promise) {
        val network = cameraNetwork
            ?: return promise.reject("NOT_CONNECTED", "Non connesso al WiFi della camera")

        Thread {
            val startTime = System.currentTimeMillis()
            // Diagnostica: ogni riga viene rimandata a JS e mostrata nel Debug
            // Log in-app (i log nativi android.util.Log vanno solo su logcat).
            val diag = java.util.Collections.synchronizedList(mutableListOf<String>())
            fun d(msg: String) {
                diag.add(msg)
                android.util.Log.d("ThetaWifi", msg)
            }

            val wifiManager = reactContext.applicationContext
                .getSystemService(android.content.Context.WIFI_SERVICE) as? WifiManager
            // HIGH_PERF: disattiva il power-save WiFi durante il download.
            @Suppress("DEPRECATION")
            val wifiLock = wifiManager?.createWifiLock(
                WifiManager.WIFI_MODE_FULL_HIGH_PERF, "ThetaDownloadLock"
            )?.apply {
                setReferenceCounted(false)
                try { acquire() } catch (_: Exception) {}
            }

            try {
                // GUARDIA ANTI-PREVIEW: se lo stream MJPEG è ancora attivo,
                // killalo qui (consuma tutta la banda 2.4GHz della SC2).
                ThetaPreviewView.activeInstance?.get()?.let { preview ->
                    if (preview.isStreamRunning()) {
                        d("⚠️ PREVIEW ancora attiva — fermata forzatamente")
                        preview.stopPreview()
                        Thread.sleep(300)
                    }
                }

                val file = File(destPath)
                file.parentFile?.mkdirs()

                // SONDA dimensione + supporto Range con un GET "Range: bytes=0-0".
                // La SC2 NON implementa HEAD (va in timeout): usiamo un GET di
                // 1 byte → risposta 206 con header "Content-Range: bytes 0-0/TOTALE".
                // Così otteniamo la dimensione E confermiamo che il Range funziona
                // (necessario per i chunk) in una sola richiesta rapida.
                var contentLength: Long = -1
                var rangeSupported = false
                for (probeAttempt in 1..2) {
                    var probeConn: HttpURLConnection? = null
                    val pStart = System.currentTimeMillis()
                    try {
                        probeConn = network.openConnection(URL(url)) as HttpURLConnection
                        probeConn.requestMethod = "GET"
                        probeConn.connectTimeout = 10_000
                        probeConn.readTimeout = 10_000
                        probeConn.instanceFollowRedirects = false
                        probeConn.setRequestProperty("Accept-Encoding", "identity")
                        probeConn.setRequestProperty("Range", "bytes=0-0")
                        probeConn.connect()
                        when (val code = probeConn.responseCode) {
                            206 -> {
                                val cr = probeConn.getHeaderField("Content-Range")
                                val total = cr?.substringAfterLast('/')?.trim()?.toLongOrNull()
                                if (total != null && total > 0) {
                                    contentLength = total
                                    rangeSupported = true
                                    d("probe Range OK: 206, size=${total / 1024} KB in ${System.currentTimeMillis() - pStart}ms")
                                } else {
                                    d("probe: 206 ma Content-Range non parsabile ($cr)")
                                }
                            }
                            200 -> {
                                contentLength = probeConn.contentLengthLong
                                d("probe: 200 → Range NON supportato, size=${contentLength / 1024} KB")
                            }
                            else -> d("probe tent.$probeAttempt: HTTP $code")
                        }
                        probeConn.disconnect()
                        if (contentLength > 0) break
                    } catch (e: Exception) {
                        d("probe tent.$probeAttempt fallito: ${e.message}")
                    } finally {
                        probeConn?.disconnect()
                    }
                }

                val MIN_PARALLEL_SIZE = CHUNK_COUNT * 256L * 1024
                if (rangeSupported && contentLength > MIN_PARALLEL_SIZE) {
                    d("ramo: PARALLEL $CHUNK_COUNT chunk su ${contentLength / 1024} KB")
                    val ok = downloadChunked(network, url, file, contentLength, ::d)
                    if (ok) {
                        val elapsed = System.currentTimeMillis() - startTime
                        val kbs = if (elapsed > 0) (contentLength * 1000 / elapsed / 1024) else 0
                        d("PARALLEL OK: ${elapsed}ms, ${kbs} KB/s aggregato")
                        promise.resolve(buildResult(file.absolutePath, diag))
                    } else {
                        d("PARALLEL fallito → fallback SINGLE GET")
                        val sgOk = downloadSingleGet(network, url, file, ::d)
                        if (sgOk) promise.resolve(buildResult(file.absolutePath, diag))
                        else promise.reject("DOWNLOAD_FAILED", diag.joinToString(" | "))
                    }
                } else {
                    d("ramo: SINGLE GET (rangeSupported=$rangeSupported, size=$contentLength)")
                    val sgOk = downloadSingleGet(network, url, file, ::d)
                    if (sgOk) promise.resolve(buildResult(file.absolutePath, diag))
                    else promise.reject("DOWNLOAD_FAILED", diag.joinToString(" | "))
                }
            } catch (e: Exception) {
                d("EXCEPTION: ${e.message}")
                promise.reject("DOWNLOAD_FAILED", diag.joinToString(" | "))
            } finally {
                try { wifiLock?.release() } catch (_: Exception) {}
            }
        }.start()
    }

    /** Costruisce il risultato {path, diag:[...]} per il bridge JS. */
    private fun buildResult(path: String, diag: List<String>): WritableMap {
        return Arguments.createMap().apply {
            putString("path", path)
            putArray("diag", Arguments.createArray().apply {
                synchronized(diag) { diag.forEach { pushString(it) } }
            })
        }
    }

    /**
     * Download parallelo a [CHUNK_COUNT] chunk HTTP Range. Sequenziato dal
     * flusso di scatto: nessuna richiesta OSC concorrente durante il transfer.
     * Instrumentazione: logga il KB/s di OGNI chunk → al test successivo si
     * vede se il cap è per-connessione (ogni chunk ~52 KB/s, aggregato N×52)
     * o se c'è un collo diverso.
     *
     * Guard 200-vs-206: se un chunk riceve 200 (Range ignorato → file intero)
     * aborta, il chiamante fa fallback al singolo GET.
     * Verifica completezza per chunk (bytes scritti == attesi).
     */
    private fun downloadChunked(
        network: Network,
        url: String,
        file: File,
        totalSize: Long,
        d: (String) -> Unit
    ): Boolean {
        try {
            java.io.RandomAccessFile(file, "rw").use { raf -> raf.setLength(totalSize) }

            val downloadStart = System.currentTimeMillis()
            val chunkSize = totalSize / CHUNK_COUNT
            val errors = java.util.Collections.synchronizedList(mutableListOf<String>())
            val rangeIgnored = java.util.concurrent.atomic.AtomicBoolean(false)
            val latch = java.util.concurrent.CountDownLatch(CHUNK_COUNT)

            for (i in 0 until CHUNK_COUNT) {
                val start = i * chunkSize
                val end = if (i == CHUNK_COUNT - 1) totalSize - 1 else (start + chunkSize - 1)

                Thread {
                    var ok = false
                    var lastErr: String? = null
                    for (attempt in 1..3) {
                        if (rangeIgnored.get()) break
                        var conn: HttpURLConnection? = null
                        val cStart = System.currentTimeMillis()
                        // Offset di avvio rispetto all'inizio del download: se i
                        // chunk fanno coda sugli slot httpd (anziché partire
                        // insieme) gli offset saranno scaglionati → lo vediamo.
                        val cOffset = cStart - downloadStart
                        try {
                            conn = network.openConnection(URL(url)) as HttpURLConnection
                            conn.requestMethod = "GET"
                            conn.connectTimeout = 15_000
                            conn.readTimeout = 60_000
                            conn.instanceFollowRedirects = false
                            conn.setRequestProperty("Accept-Encoding", "identity")
                            conn.setRequestProperty("Range", "bytes=$start-$end")
                            conn.connect()

                            when (conn.responseCode) {
                                206 -> { /* Range ok */ }
                                200 -> {
                                    rangeIgnored.set(true)
                                    lastErr = "Chunk $i: Range ignorato (HTTP 200)"
                                    conn.disconnect()
                                    break
                                }
                                else -> {
                                    lastErr = "Chunk $i HTTP ${conn.responseCode} (tent. $attempt)"
                                    conn.disconnect()
                                    continue
                                }
                            }

                            val bufferSize = 512 * 1024
                            var written = 0L
                            java.io.RandomAccessFile(file, "rw").use { raf ->
                                raf.seek(start)
                                BufferedInputStream(conn.inputStream, bufferSize).use { input ->
                                    val buf = ByteArray(bufferSize)
                                    var read: Int
                                    while (input.read(buf).also { read = it } > 0) {
                                        raf.write(buf, 0, read)
                                        written += read
                                    }
                                }
                            }

                            val expected = end - start + 1
                            if (written != expected) {
                                throw java.io.IOException("Chunk $i incompleto: $written/$expected")
                            }

                            val cMs = System.currentTimeMillis() - cStart
                            val cKbs = if (cMs > 0) (written * 1000 / cMs / 1024) else 0
                            d("  chunk $i: start+${cOffset}ms, ${written / 1024} KB in ${cMs}ms = ${cKbs} KB/s")
                            ok = true
                            break
                        } catch (e: Exception) {
                            lastErr = "Chunk $i tent. $attempt: ${e.message}"
                            android.util.Log.w("ThetaWifi", lastErr)
                        } finally {
                            conn?.disconnect()
                        }
                        if (attempt < 3) Thread.sleep(400L * attempt)
                    }
                    if (!ok) errors.add(lastErr ?: "Chunk $i fallito")
                    latch.countDown()
                }.start()
            }

            if (!latch.await(120, java.util.concurrent.TimeUnit.SECONDS)) {
                d("downloadChunked: timeout latch")
                return false
            }
            if (errors.isNotEmpty()) {
                d("downloadChunked errori: $errors")
                return false
            }
            return true
        } catch (e: Exception) {
            d("downloadChunked exception: ${e.message}")
            return false
        }
    }

    /**
     * Download a singolo GET — la procedura del client ufficiale Ricoh
     * (theta-client: HttpClient.get(fileUrl), una connessione, nessun Range).
     *
     * 2 tentativi totali. Verifica completezza contro il Content-Length della
     * risposta stessa: uno stream chiuso prematuramente dal server (frequente
     * su SC2 sotto interferenza 2.4GHz) produrrebbe altrimenti un JPEG
     * troncato accettato silenziosamente.
     */
    private fun downloadSingleGet(
        network: Network,
        url: String,
        file: File,
        d: (String) -> Unit
    ): Boolean {
        for (attempt in 1..2) {
            val start = System.currentTimeMillis()
            var conn: HttpURLConnection? = null
            try {
                conn = network.openConnection(URL(url)) as HttpURLConnection
                conn.connectTimeout = OFFICIAL_CONNECT_TIMEOUT
                conn.readTimeout = OFFICIAL_SOCKET_TIMEOUT
                conn.instanceFollowRedirects = false
                conn.setRequestProperty("Accept-Encoding", "identity")
                conn.connect()

                if (conn.responseCode != 200) {
                    throw java.io.IOException("HTTP ${conn.responseCode} durante il download")
                }

                val expectedSize = conn.contentLengthLong

                // Profilo throughput-nel-tempo: misuro il rate ogni 512KB. Se
                // parte alto e poi stalla → TCP window/delayed-ACK; se è piatto
                // dall'inizio → rate-limit firmware o radio al minimo.
                val bufferSize = 1024 * 1024
                var total = 0L
                var lastMark = start
                var lastBytes = 0L
                BufferedInputStream(conn.inputStream, bufferSize).use { input ->
                    BufferedOutputStream(FileOutputStream(file), bufferSize).use { output ->
                        val buf = ByteArray(bufferSize)
                        var read: Int
                        while (input.read(buf).also { read = it } > 0) {
                            output.write(buf, 0, read)
                            total += read
                            if (total - lastBytes >= 512 * 1024) {
                                val now = System.currentTimeMillis()
                                val dtMs = now - lastMark
                                val instKbs = if (dtMs > 0) ((total - lastBytes) * 1000 / dtMs / 1024) else 0
                                d("  @${total / 1024}KB: ${instKbs} KB/s istantanei")
                                lastMark = now
                                lastBytes = total
                            }
                        }
                    }
                }

                val sizeBytes = file.length()
                if (expectedSize > 0 && sizeBytes != expectedSize) {
                    throw java.io.IOException("Download incompleto: $sizeBytes/$expectedSize bytes")
                }

                val elapsed = System.currentTimeMillis() - start
                val kbs = if (elapsed > 0) (sizeBytes * 1000 / elapsed / 1024) else 0
                d("SINGLE GET ok (tent.$attempt): ${elapsed}ms, ${sizeBytes / 1024} KB, ${kbs} KB/s")
                return true
            } catch (e: Exception) {
                d("SINGLE GET tent.$attempt fallito: ${e.message}")
                if (attempt < 2) Thread.sleep(800)
            } finally {
                conn?.disconnect()
            }
        }
        return false
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
        requestPending = false
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
