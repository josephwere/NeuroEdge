import Foundation
import CallKit
import React

@objc(NeuroEdgeCallKitManager)
class NeuroEdgeCallKitManager: NSObject {
  private let provider: CXProvider
  private let callController = CXCallController()

  override init() {
    let config = CXProviderConfiguration(localizedName: "NeuroEdge Twin")
    config.supportsVideo = true
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.phoneNumber, .generic]
    provider = CXProvider(configuration: config)
    super.init()
  }

  @objc
  func answerPhoneCall(actionId: String, payload: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    // TODO: Wire real CallKit transaction with app call state.
    resolve([
      "ok": true,
      "note": "iOS skeleton handled answerPhoneCall",
      "actionId": actionId
    ])
  }

  @objc
  func answerWhatsAppCall(actionId: String, payload: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    // TODO: Wire approved VoIP provider integration path.
    resolve([
      "ok": true,
      "note": "iOS skeleton handled answerWhatsAppCall",
      "actionId": actionId
    ])
  }

  @objc
  func answerVideoCall(actionId: String, payload: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    // TODO: Wire to meeting/video SDK in host app.
    resolve([
      "ok": true,
      "note": "iOS skeleton handled answerVideoCall",
      "actionId": actionId
    ])
  }
}
