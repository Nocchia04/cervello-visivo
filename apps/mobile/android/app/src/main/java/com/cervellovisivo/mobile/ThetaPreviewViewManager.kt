package com.cervellovisivo.mobile

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class ThetaPreviewViewManager : SimpleViewManager<ThetaPreviewView>() {

    override fun getName(): String = "ThetaPreviewView"

    override fun createViewInstance(context: ThemedReactContext): ThetaPreviewView =
        ThetaPreviewView(context)

    /**
     * isStreaming=true → ottiene cameraNetwork da ThetaWifiModule (già connesso)
     *                     e avvia il preview nativo MJPEG sulla SurfaceView.
     * isStreaming=false → ferma lo stream.
     */
    @ReactProp(name = "isStreaming")
    fun setIsStreaming(view: ThetaPreviewView, isStreaming: Boolean) {
        if (isStreaming) {
            val reactAppCtx = (view.context as? ThemedReactContext)?.reactApplicationContext
                ?: return
            val network = reactAppCtx
                .getNativeModule(ThetaWifiModule::class.java)
                ?.getCameraNetwork()
            if (network == null) {
                // Niente return silenzioso: JS crederebbe streaming=true con
                // la preview nativa spenta (spinner infinito, niente retry).
                view.notifyPreviewUnavailable()
                return
            }
            view.startPreview(network)
        } else {
            view.stopPreview()
        }
    }

    /**
     * Command imperativo per chiudere immediatamente la socket TCP del MJPEG.
     * Bypassa il round-trip React render → prop change → native dispatch
     * che può aggiungere ritardi misurabili. Necessario sulla SC2 prima del
     * download per liberare la banda WiFi 2.4GHz condivisa, evitando che la
     * camera continui a streamare frame nel buffer.
     */
    override fun getCommandsMap(): Map<String, Int> = mapOf(
        "stopPreview" to COMMAND_STOP_PREVIEW
    )

    override fun receiveCommand(
        view: ThetaPreviewView,
        commandId: String?,
        args: ReadableArray?
    ) {
        when (commandId) {
            "stopPreview" -> view.stopPreview()
            else -> super.receiveCommand(view, commandId, args)
        }
    }

    override fun receiveCommand(
        view: ThetaPreviewView,
        commandId: Int,
        args: ReadableArray?
    ) {
        when (commandId) {
            COMMAND_STOP_PREVIEW -> view.stopPreview()
            else -> super.receiveCommand(view, commandId, args)
        }
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf(
        "topFirstFrame"    to mapOf("registrationName" to "onFirstFrame"),
        "topPreviewError"  to mapOf("registrationName" to "onPreviewError"),
    )

    companion object {
        private const val COMMAND_STOP_PREVIEW = 1
    }
}
