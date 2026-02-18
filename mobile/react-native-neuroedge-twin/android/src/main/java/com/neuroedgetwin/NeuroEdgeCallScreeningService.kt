package com.neuroedgetwin

import android.telecom.Call
import android.telecom.CallScreeningService

class NeuroEdgeCallScreeningService : CallScreeningService() {
  override fun onScreenCall(callDetails: Call.Details) {
    // Skeleton behavior: allow call by default.
    // TODO: Bind to local policy + user consent + orchestrator action queue.
    val response = CallResponse.Builder()
      .setDisallowCall(false)
      .setRejectCall(false)
      .setSkipCallLog(false)
      .setSkipNotification(false)
      .build()
    respondToCall(callDetails, response)
  }
}
