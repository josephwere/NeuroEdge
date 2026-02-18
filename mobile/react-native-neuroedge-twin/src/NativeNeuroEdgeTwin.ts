import { NativeModules, Platform } from "react-native";

type NativeTwinModule = {
  answerPhoneCall: (actionId: string, payload: object) => Promise<{ ok: boolean; note?: string }>;
  answerWhatsAppCall: (actionId: string, payload: object) => Promise<{ ok: boolean; note?: string }>;
  answerVideoCall: (actionId: string, payload: object) => Promise<{ ok: boolean; note?: string }>;
  syncAvailability: (payload: object) => Promise<{ ok: boolean; note?: string }>;
};

const LINKING_ERROR =
  `The package '@neuroedge/react-native-twin' doesn't seem linked. Ensure pod install (iOS) and gradle sync (Android).`;

const NativeModule = NativeModules.NeuroEdgeTwin as NativeTwinModule | undefined;

export const NeuroEdgeTwinNative: NativeTwinModule = NativeModule
  ? NativeModule
  : {
      answerPhoneCall: async () => {
        throw new Error(`${LINKING_ERROR} (Platform: ${Platform.OS})`);
      },
      answerWhatsAppCall: async () => {
        throw new Error(`${LINKING_ERROR} (Platform: ${Platform.OS})`);
      },
      answerVideoCall: async () => {
        throw new Error(`${LINKING_ERROR} (Platform: ${Platform.OS})`);
      },
      syncAvailability: async () => {
        throw new Error(`${LINKING_ERROR} (Platform: ${Platform.OS})`);
      }
    };
