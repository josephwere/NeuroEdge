import Foundation
import React

@objc(NeuroEdgeTwin)
class NeuroEdgeTwin: NSObject {
  private let manager = NeuroEdgeCallKitManager()

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(answerPhoneCall:payload:resolver:rejecter:)
  func answerPhoneCall(actionId: String, payload: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    manager.answerPhoneCall(actionId: actionId, payload: payload, resolver: resolve, rejecter: reject)
  }

  @objc(answerWhatsAppCall:payload:resolver:rejecter:)
  func answerWhatsAppCall(actionId: String, payload: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    manager.answerWhatsAppCall(actionId: actionId, payload: payload, resolver: resolve, rejecter: reject)
  }

  @objc(answerVideoCall:payload:resolver:rejecter:)
  func answerVideoCall(actionId: String, payload: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    manager.answerVideoCall(actionId: actionId, payload: payload, resolver: resolve, rejecter: reject)
  }

  @objc(syncAvailability:resolver:rejecter:)
  func syncAvailability(payload: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve([
      "ok": true,
      "note": "Availability sync acknowledged on iOS skeleton"
    ])
  }
}
