package com.cervellovisivo.mobile

import com.facebook.react.bridge.ReactApplicationContext
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
                ?: return
            view.startPreview(network)
        } else {
            view.stopPreview()
        }
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf(
        "topFirstFrame"    to mapOf("registrationName" to "onFirstFrame"),
        "topPreviewError"  to mapOf("registrationName" to "onPreviewError"),
    )
}
