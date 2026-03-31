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
import java.io.File
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
