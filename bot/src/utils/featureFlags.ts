import fetchEnvs from "../utils/fetchEnvs";

/**
 * Utility to conditionally disable commands based on feature flags
 */
export function getMinecraftCommandStatus() {
  const { ENABLE_MINECRAFT_SYSTEMS } = fetchEnvs();

  return {
    enabled: ENABLE_MINECRAFT_SYSTEMS,
    deleted: !ENABLE_MINECRAFT_SYSTEMS, // Commands will be deleted if feature is disabled
  };
}
