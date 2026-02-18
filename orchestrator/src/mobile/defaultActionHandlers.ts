import { MobileTwinAction, MobileTwinActionHandlers, MobileTwinExecutionResult } from "./mobileTwinClient";

function stubResult(action: MobileTwinAction, note: string): MobileTwinExecutionResult {
  return {
    status: "completed",
    result: {
      mode: "stub_native_bridge",
      actionType: action.actionType,
      note,
      payload: action.payload || {},
      handledAt: Date.now(),
    },
  };
}

export const defaultActionHandlers: MobileTwinActionHandlers = {
  async onAnswerPhoneCall(action: MobileTwinAction) {
    return stubResult(
      action,
      "Route to Android/iOS native telephony API here (CallScreeningService/CallKit + user consent)."
    );
  },
  async onAnswerWhatsappCall(action: MobileTwinAction) {
    return stubResult(
      action,
      "Route to approved WhatsApp/VoIP integration path available on your mobile client."
    );
  },
  async onAnswerVideoCall(action: MobileTwinAction) {
    return stubResult(
      action,
      "Route to video-call adapter in native app and use selected twin video persona asset."
    );
  },
  async onSyncAvailability(action: MobileTwinAction) {
    return stubResult(action, "Availability synced locally in native app state.");
  },
  async onUnknownAction(action: MobileTwinAction) {
    return {
      status: "failed",
      error: `Unsupported action type '${action.actionType}'`,
      result: {
        payload: action.payload || {},
      },
    };
  },
};
