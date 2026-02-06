import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface LicenseStatus {
  is_active: boolean;
  license_type: string | null;
  needs_revalidation: boolean;
}

export function useLicense() {
  const [status, setStatus] = useState<LicenseStatus>({
    is_active: false,
    license_type: null,
    needs_revalidation: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<LicenseStatus>("get_license_status");
      setStatus(s);

      // Auto-revalidate if needed
      if (s.needs_revalidation) {
        try {
          const updated = await invoke<LicenseStatus>("revalidate_license");
          setStatus(updated);
        } catch (e) {
          console.error("[license] Revalidation failed:", e);
        }
      }
    } catch (e) {
      console.error("[license] Failed to get status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activate = useCallback(
    async (key: string): Promise<LicenseStatus> => {
      const result = await invoke<LicenseStatus>("activate_license", {
        licenseKey: key,
      });
      setStatus(result);
      return result;
    },
    []
  );

  const deactivate = useCallback(async () => {
    await invoke("deactivate_license");
    setStatus({ is_active: false, license_type: null, needs_revalidation: false });
  }, []);

  const checkFeature = useCallback(
    async (feature: string): Promise<boolean> => {
      try {
        return await invoke<boolean>("check_feature_access", { feature });
      } catch {
        return false;
      }
    },
    []
  );

  return {
    hasLicense: status.is_active,
    licenseType: status.license_type,
    loading,
    activate,
    deactivate,
    checkFeature,
    refresh,
  };
}

/**
 * Check if an error string is a premium-required error.
 * Returns the feature name if it is, null otherwise.
 */
export function parsePremiumError(error: string): string | null {
  if (typeof error === "string" && error.startsWith("__PREMIUM_REQUIRED__:")) {
    return error.replace("__PREMIUM_REQUIRED__:", "");
  }
  return null;
}
