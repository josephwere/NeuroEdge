// frontend/src/extensions/extensionLoader.ts

import { ExtensionModule, ExtensionContext } from "@/extensions/extensionAPI";

/**
 * Loads an extension safely within the provided context
 */
export const loadExtension = async (
  ext: ExtensionModule,
  ctx: ExtensionContext
) => {
  try {
    // Request permissions required by the extension
    const granted = await Promise.all(
      (ext.permissions || []).map((perm) => ctx.requestPermission(perm))
    );

    if (granted.every((g) => g)) {
      // Initialize extension with sandboxed context
      ext.activate?.(ctx);
      console.log(`[Extension Loaded] ${ext.id} - ${ext.name}`);
      ctx.notify(`Extension Loaded: ${ext.name}`, "success");
    } else {
      console.warn(`[Extension Skipped] Permissions denied for ${ext.id}`);
      ctx.notify(`Extension Skipped: ${ext.name}`, "error"); // changed warning → error for consistency
    }
  } catch (err: any) {
    console.error(`[Extension Error] ${ext.id}`, err);
    ctx.notify(`Extension Failed: ${ext.name}`, "error");
  }
};
