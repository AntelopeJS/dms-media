/**
 * The first-owner setup token of the test instance. The harness hands it to the
 * DMS as `DMS_SETUP_TOKEN`, and the owner registration sends it back: from dms
 * 0.15 onboarding refuses a registration without it.
 */
export const SETUP_TOKEN = "dms-media-test-setup-token";
