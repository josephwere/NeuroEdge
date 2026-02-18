package com.neuroedgetwin

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

object NeuroEdgeMapUtil {
  fun toWritableMap(input: Map<String, Any?>): WritableMap {
    val map = Arguments.createMap()
    input.forEach { (k, v) ->
      when (v) {
        null -> map.putNull(k)
        is String -> map.putString(k, v)
        is Boolean -> map.putBoolean(k, v)
        is Int -> map.putInt(k, v)
        is Double -> map.putDouble(k, v)
        is Float -> map.putDouble(k, v.toDouble())
        is Long -> map.putDouble(k, v.toDouble())
        else -> map.putString(k, v.toString())
      }
    }
    return map
  }
}
