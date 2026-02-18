package com.neuroedgetwin

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class NeuroEdgeTwinModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NeuroEdgeTwin"

  @ReactMethod
  fun answerPhoneCall(actionId: String, payload: ReadableMap, promise: Promise) {
    // TODO: Integrate with TelecomManager + CallScreeningService policy decisions.
    val result = mapOf(
      "ok" to true,
      "note" to "Android skeleton handled answerPhoneCall",
      "actionId" to actionId
    )
    promise.resolve(NeuroEdgeMapUtil.toWritableMap(result))
  }

  @ReactMethod
  fun answerWhatsAppCall(actionId: String, payload: ReadableMap, promise: Promise) {
    // TODO: Integrate with approved VoIP/WhatsApp call intent pipeline available on device.
    val result = mapOf(
      "ok" to true,
      "note" to "Android skeleton handled answerWhatsAppCall",
      "actionId" to actionId
    )
    promise.resolve(NeuroEdgeMapUtil.toWritableMap(result))
  }

  @ReactMethod
  fun answerVideoCall(actionId: String, payload: ReadableMap, promise: Promise) {
    // TODO: Integrate video-call SDK/meeting provider bridge in host app.
    val result = mapOf(
      "ok" to true,
      "note" to "Android skeleton handled answerVideoCall",
      "actionId" to actionId
    )
    promise.resolve(NeuroEdgeMapUtil.toWritableMap(result))
  }

  @ReactMethod
  fun syncAvailability(payload: ReadableMap, promise: Promise) {
    val result = mapOf(
      "ok" to true,
      "note" to "Availability sync acknowledged on Android skeleton"
    )
    promise.resolve(NeuroEdgeMapUtil.toWritableMap(result))
  }
}
